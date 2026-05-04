import {
  doc,
  getDoc,
  increment,
  runTransaction,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
  type UpdateData,
  type WriteBatch,
} from 'firebase/firestore';
import type { CartItem, Product } from '@/types';
import {
  wholesaleOnHand,
  reservedForOrders,
  nextIsHiddenAfterWholesaleChange,
} from '@/lib/inventory-availability';

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

function aggregateQuantities(items: CartItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) {
    m.set(i.id, (m.get(i.id) || 0) + i.quantity);
  }
  return m;
}

/**
 * Inside an existing Firestore transaction: reserve line quantities (increment reservedQty).
 * Firestore requires every `get` before any `set`/`update`: we read all inventory docs first,
 * then apply all updates (also merges duplicate line items for the same product).
 */
export async function transactionReserveLines(
  db: Firestore,
  tx: Transaction,
  lines: { productId: string; qty: number }[]
): Promise<void> {
  const byProduct = new Map<string, number>();
  for (const line of lines) {
    byProduct.set(
      line.productId,
      (byProduct.get(line.productId) || 0) + line.qty
    );
  }

  const rows: {
    productId: string;
    ref: ReturnType<typeof doc>;
    snap: DocumentSnapshot;
  }[] = [];

  for (const productId of byProduct.keys()) {
    const pref = doc(db, 'inventory', productId);
    const ps = await tx.get(pref);
    rows.push({ productId, ref: pref, snap: ps });
  }

  for (const { productId, ref, snap } of rows) {
    const qty = byProduct.get(productId)!;
    if (!snap.exists()) {
      throw new InsufficientStockError(`Product not found: ${productId}`);
    }
    const d = snap.data()!;
    const prod = { id: productId, ...d } as Product;
    const onHand = wholesaleOnHand(prod);
    const res = reservedForOrders(prod);
    if (onHand - res < qty) {
      const name = (d.name as string) || productId;
      throw new InsufficientStockError(`Insufficient stock for ${name}`);
    }
    tx.update(ref, {
      reservedQty: increment(qty),
      updatedAt: Date.now(),
    });
  }
}

/** Release reservation only (cancelled order). */
export async function releaseReservedForOrder(
  db: Firestore,
  items: CartItem[]
): Promise<void> {
  const byId = aggregateQuantities(items);
  const batch = writeBatch(db);
  for (const [productId, qty] of byId) {
    batch.update(doc(db, 'inventory', productId), {
      reservedQty: increment(-qty),
      updatedAt: Date.now(),
    });
  }
  await batch.commit();
}

/** Complete: remove from reserved and deduct wholesale/stock. */
export async function fulfillReservedForOrder(
  db: Firestore,
  items: CartItem[]
): Promise<void> {
  const byId = aggregateQuantities(items);
  const batch = writeBatch(db);
  for (const [productId, qty] of byId) {
    const pref = doc(db, 'inventory', productId);
    const snap = await getDoc(pref);
    if (!snap.exists()) continue;
    const d = snap.data()!;
    const prod = { id: productId, ...d } as Product;
    const prevWs = wholesaleOnHand(prod);
    const newWs = Math.max(0, prevWs - qty);
    const patch: Record<string, unknown> = {
      reservedQty: increment(-qty),
      updatedAt: Date.now(),
      isHidden: nextIsHiddenAfterWholesaleChange(
        prevWs,
        newWs,
        !!(d as { isHidden?: boolean }).isHidden
      ),
    };
    if (d.wholesaleStock !== undefined && d.wholesaleStock !== null) {
      patch.wholesaleStock = increment(-qty);
    } else {
      patch.stock = increment(-qty);
    }
    batch.update(pref, patch as UpdateData<DocumentData>);
  }
  await batch.commit();
}

/**
 * Completed sale without prior checkout reservation (legacy orders): deduct wholesale/stock only.
 * Does not change `reservedQty`.
 */
export async function deductWholesaleForCompletedSale(
  db: Firestore,
  items: CartItem[]
): Promise<void> {
  const byId = aggregateQuantities(items);
  const batch = writeBatch(db);
  for (const [productId, qty] of byId) {
    const pref = doc(db, 'inventory', productId);
    const snap = await getDoc(pref);
    if (!snap.exists()) continue;
    const d = snap.data()!;
    const prod = { id: productId, ...d } as Product;
    const prevWs = wholesaleOnHand(prod);
    const newWs = Math.max(0, prevWs - qty);
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      isHidden: nextIsHiddenAfterWholesaleChange(
        prevWs,
        newWs,
        !!(d as { isHidden?: boolean }).isHidden
      ),
    };
    if (d.wholesaleStock !== undefined && d.wholesaleStock !== null) {
      patch.wholesaleStock = increment(-qty);
    } else {
      patch.stock = increment(-qty);
    }
    batch.update(pref, patch as UpdateData<DocumentData>);
  }
  await batch.commit();
}

/**
 * Max quantity allowed on an order line when that order already reserves `currentQtyOnLine`.
 */
export function maxOrderLineQty(
  product: Product,
  currentQtyOnLine: number
): number {
  const onHand = wholesaleOnHand(product);
  const res = reservedForOrders(product);
  return Math.max(0, onHand - res + currentQtyOnLine);
}

/** Add reservedQty increments to an existing batch (order + inventory atomic). */
export function appendReservedDeltaToWriteBatch(
  batch: WriteBatch,
  db: Firestore,
  before: CartItem[],
  after: CartItem[]
): boolean {
  const b = aggregateQuantities(before);
  const a = aggregateQuantities(after);
  const ids = new Set([...b.keys(), ...a.keys()]);
  let changed = false;
  for (const id of ids) {
    const delta = (a.get(id) || 0) - (b.get(id) || 0);
    if (delta === 0) continue;
    changed = true;
    batch.update(doc(db, 'inventory', id), {
      reservedQty: increment(delta),
      updatedAt: Date.now(),
    });
  }
  return changed;
}

/** Delta reserved quantities when order line items change (admin or client). */
export async function applyReservedDeltaForItemChange(
  db: Firestore,
  before: CartItem[],
  after: CartItem[]
): Promise<void> {
  const batch = writeBatch(db);
  const changed = appendReservedDeltaToWriteBatch(batch, db, before, after);
  if (changed) await batch.commit();
}

/** Validate that `after` lines fit available stock given prior reservation `before`. */
export function validateItemChangeAgainstStock(
  productsById: Map<string, Product>,
  before: CartItem[],
  after: CartItem[]
): { ok: true } | { ok: false; message: string } {
  const b = aggregateQuantities(before);
  const a = aggregateQuantities(after);
  const ids = new Set([...a.keys()]);
  for (const id of ids) {
    const p = productsById.get(id);
    if (!p) {
      return { ok: false, message: `Unknown product on order: ${id}` };
    }
    const newQ = a.get(id) || 0;
    const oldQ = b.get(id) || 0;
    const max = maxOrderLineQty(p, oldQ);
    if (newQ > max) {
      return {
        ok: false,
        message: `Quantity too high for ${p.name} (max ${max} available for this order).`,
      };
    }
  }
  return { ok: true };
}

/** Admin / demo checkout: reserve stock and create the order document atomically. */
export async function placeAdminOrderWithReservation(
  db: Firestore,
  orderId: string,
  orderPayload: Record<string, unknown>,
  items: CartItem[]
): Promise<void> {
  await runTransaction(db, async (tx) => {
    await transactionReserveLines(
      db,
      tx,
      items.map((i) => ({ productId: i.id, qty: i.quantity }))
    );
    tx.set(doc(db, 'orders', orderId), {
      ...orderPayload,
      stockReserved: true,
    });
  });
}
