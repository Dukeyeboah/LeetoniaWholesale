import { doc, writeBatch, type Firestore } from 'firebase/firestore';
import type { Product } from '@/types';
import {
  nextIsHiddenAfterWholesaleChange,
  reservedForOrders,
  wholesaleOnHand,
} from '@/lib/inventory-availability';
import { normalizeInventoryLabel, normalizeWarehouseCode } from '@/lib/warehouse-data';
import { normalizeForMatch } from '@/lib/sales-analytics/normalize';
import type { SalesProductRow, StockTarget } from '@/lib/sales-analytics/types';

const BATCH_SIZE = 400;
const UNCATEGORIZED = 'Uncategorized';

/** Same id scheme as `storefrontDocIdFromDrug` (not imported: that module bundles stock JSON). */
function storefrontDocIdFromDrug(drug: string): string {
  const slug = normalizeInventoryLabel(drug)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return `sf_${slug || 'item'}`;
}

export type StockApplyOptions = {
  /** Hide (wholesale) or zero (warehouse) items that are not on the new list. */
  hideMissing: boolean;
  /** Create inventory items for products that are not in the app yet. */
  addNew: boolean;
  /** Also copy unit prices from the file. */
  updatePrices: boolean;
};

export type StockApplyItem = {
  productId: string;
  name: string;
  match: 'code' | 'name' | 'new' | 'missing';
  currentQty: number;
  newQty: number;
  price?: number;
  code?: string;
  /** Open-order reservations larger than the new count. */
  reservedOverCount?: boolean;
};

export type StockApplyPlan = {
  target: StockTarget;
  updates: StockApplyItem[];
  unchanged: number;
  creates: StockApplyItem[];
  missing: StockApplyItem[];
};

function currentQty(p: Product, target: StockTarget): number {
  return target === 'wholesale' ? wholesaleOnHand(p) : Math.max(0, Number(p.storeroomStock ?? 0));
}

function currentPrice(p: Product, target: StockTarget): number | undefined {
  return target === 'wholesale' ? p.price : p.storeroomPrice;
}

/**
 * Work out what an inventory update would change, without writing anything.
 * Matches by name first (codes in files often differ from app codes), then code.
 */
export function buildStockApplyPlan(
  products: Product[],
  rows: SalesProductRow[],
  target: StockTarget,
  opts: StockApplyOptions
): StockApplyPlan {
  const byLabel = new Map<string, Product>();
  const byKey = new Map<string, Product>();
  const byCode = new Map<string, Product>();
  for (const p of products) {
    for (const label of [p.name, p.description]) {
      if (!label) continue;
      const l = normalizeInventoryLabel(label);
      if (l && !byLabel.has(l)) byLabel.set(l, p);
      const k = normalizeForMatch(label);
      if (k && !byKey.has(k)) byKey.set(k, p);
    }
    const c = normalizeWarehouseCode(p.code).toUpperCase();
    if (c && !byCode.has(c)) byCode.set(c, p);
  }

  const touched = new Map<string, StockApplyItem>();
  const creates = new Map<string, StockApplyItem>();
  const takenIds = new Set(products.map((p) => p.id));
  let unchanged = 0;

  for (const r of rows) {
    const qty = Math.max(0, Math.round(r.quantity));
    const price = opts.updatePrices && r.unitPrice !== undefined ? r.unitPrice : undefined;
    let product: Product | undefined =
      byLabel.get(normalizeInventoryLabel(r.name)) ?? byKey.get(normalizeForMatch(r.name));
    let match: StockApplyItem['match'] = 'name';
    if (!product && r.code) {
      product = byCode.get(normalizeWarehouseCode(r.code).toUpperCase());
      match = 'code';
    }

    if (product) {
      const prev = touched.get(product.id);
      if (prev) {
        prev.newQty += qty;
        continue;
      }
      touched.set(product.id, {
        productId: product.id,
        name: product.name,
        match,
        currentQty: currentQty(product, target),
        newQty: qty,
        ...(price !== undefined ? { price } : {}),
      });
      continue;
    }

    if (!opts.addNew) continue;
    const code = r.code ? normalizeWarehouseCode(r.code) : '';
    let id =
      target === 'warehouse' && code
        ? `w_${code.replace(/[/\s]+/g, '_')}`
        : target === 'warehouse'
          ? storefrontDocIdFromDrug(r.name).replace(/^sf_/, 'w_')
          : storefrontDocIdFromDrug(r.name);
    const existingCreate = creates.get(id);
    if (existingCreate && normalizeForMatch(existingCreate.name) === normalizeForMatch(r.name)) {
      existingCreate.newQty += qty;
      continue;
    }
    if (takenIds.has(id)) {
      let n = 2;
      while (takenIds.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    takenIds.add(id);
    creates.set(id, {
      productId: id,
      name: r.name,
      match: 'new',
      currentQty: 0,
      newQty: qty,
      ...(r.unitPrice !== undefined ? { price: r.unitPrice } : {}),
      ...(code ? { code } : {}),
    });
  }

  const updates: StockApplyItem[] = [];
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const item of touched.values()) {
    const p = productById.get(item.productId)!;
    if (target === 'wholesale' && reservedForOrders(p) > item.newQty) item.reservedOverCount = true;
    const priceChanged = item.price !== undefined && item.price !== currentPrice(p, target);
    if (item.newQty === item.currentQty && !priceChanged) unchanged += 1;
    else updates.push(item);
  }

  const missing: StockApplyItem[] = [];
  if (opts.hideMissing) {
    for (const p of products) {
      if (touched.has(p.id)) continue;
      const qty = currentQty(p, target);
      if (target === 'wholesale') {
        if (qty <= 0 && p.isHidden) continue;
      } else if (qty <= 0) {
        continue;
      }
      missing.push({ productId: p.id, name: p.name, match: 'missing', currentQty: qty, newQty: 0 });
    }
  }

  return { target, updates, unchanged, creates: [...creates.values()], missing };
}

/** Write a stock plan to `inventory`. Returns counts for the audit record. */
export async function applyStockPlan(
  db: Firestore,
  products: Product[],
  plan: StockApplyPlan
): Promise<{ updated: number; created: number; hiddenOrCleared: number }> {
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = Date.now();
  type Op = { id: string; data: Record<string, string | number | boolean>; create: boolean };
  const ops: Op[] = [];

  for (const item of plan.updates) {
    const p = productById.get(item.productId);
    if (!p) continue;
    if (plan.target === 'wholesale') {
      const next = Math.max(item.newQty, reservedForOrders(p));
      ops.push({
        id: p.id,
        create: false,
        data: {
          stock: next,
          wholesaleStock: next,
          isHidden: nextIsHiddenAfterWholesaleChange(wholesaleOnHand(p), item.newQty, !!p.isHidden),
          ...(item.price !== undefined ? { price: item.price } : {}),
          updatedAt: now,
        },
      });
    } else {
      ops.push({
        id: p.id,
        create: false,
        data: {
          storeroomStock: item.newQty,
          ...(item.price !== undefined ? { storeroomPrice: item.price } : {}),
          updatedAt: now,
        },
      });
    }
  }

  for (const item of plan.missing) {
    const p = productById.get(item.productId);
    if (!p) continue;
    if (plan.target === 'wholesale') {
      const reserved = reservedForOrders(p);
      ops.push({
        id: p.id,
        create: false,
        data: { stock: reserved, wholesaleStock: reserved, isHidden: true, updatedAt: now },
      });
    } else {
      ops.push({ id: p.id, create: false, data: { storeroomStock: 0, updatedAt: now } });
    }
  }

  for (const item of plan.creates) {
    const price = item.price ?? 0;
    const base = {
      name: item.name,
      category: UNCATEGORIZED,
      reservedQty: 0,
      unit: 'unit',
      code: item.code ?? '',
      description: item.name,
      updatedAt: now,
    };
    ops.push({
      id: item.productId,
      create: true,
      data:
        plan.target === 'wholesale'
          ? {
              ...base,
              price,
              stock: item.newQty,
              wholesaleStock: item.newQty,
              isHidden: !(price > 0 && item.newQty > 0),
            }
          : {
              ...base,
              price: 0,
              stock: 0,
              wholesaleStock: 0,
              storeroomStock: item.newQty,
              storeroomPrice: price,
              isHidden: true,
            },
    });
  }

  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_SIZE)) {
      const ref = doc(db, 'inventory', op.id);
      if (op.create) batch.set(ref, op.data, { merge: true });
      else batch.update(ref, op.data);
    }
    await batch.commit();
  }

  return {
    updated: plan.updates.length,
    created: plan.creates.length,
    hiddenOrCleared: plan.missing.length,
  };
}
