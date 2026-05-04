import { writeBatch, doc, type Firestore } from 'firebase/firestore';
import type { Product } from '@/types';
import { nextIsHiddenAfterWholesaleChange } from '@/lib/inventory-availability';
import {
  indexInventoryByProductCode,
  indexInventoryByNormalizedLabel,
  normalizeWarehouseCode,
  resolveWarehouseRowToProduct,
  type WarehouseRow,
} from '@/lib/warehouse-data';

const BATCH_SIZE = 400;
const UNCATEGORIZED = 'Uncategorized';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export type WarehouseSyncResult = {
  updated: number;
  updatedByCode: number;
  updatedByName: number;
  created: number;
  skipped: number;
};

/**
 * For each warehouse row: match Firestore product by **normalized name/description
 * first** (warehouse `description` ↔ product `name` / `description`), then by `code`
 * if no label match. Then set `price`, storeroom and wholesale quantities. Name matches
 * also set `code`, `name`, and `description` from the warehouse row so storefront aligns.
 * If no match, creates `inventory/w_{code}`.
 */
export async function syncWarehouseToInventory(
  db: Firestore,
  products: Product[],
  rows: readonly WarehouseRow[]
): Promise<WarehouseSyncResult> {
  const byCode = indexInventoryByProductCode(products);
  const byLabel = indexInventoryByNormalizedLabel(products);
  let updated = 0;
  let updatedByCode = 0;
  let updatedByName = 0;
  let created = 0;
  let skipped = 0;

  for (const part of chunk([...rows], BATCH_SIZE)) {
    const batch = writeBatch(db);
    const touchedDocIds = new Set<string>();
    for (const row of part) {
      const code = normalizeWarehouseCode(row.code);
      if (!code) {
        skipped += 1;
        continue;
      }
      const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) {
        skipped += 1;
        continue;
      }

      const resolved = resolveWarehouseRowToProduct(row, byCode, byLabel);
      if (resolved && touchedDocIds.has(resolved.product.id)) {
        skipped += 1;
        continue;
      }

      if (resolved) {
        const { product: existing, match } = resolved;
        touchedDocIds.add(existing.id);
        const ref = doc(db, 'inventory', existing.id);
        const prevWs = Math.max(
          0,
          Number(existing.wholesaleStock ?? existing.stock ?? 0)
        );
        const reserved = Math.max(
          0,
          Number(existing.reservedQty ?? 0)
        );
        const wholesaleSynced = Math.max(qty, reserved);
        const nextHidden = nextIsHiddenAfterWholesaleChange(
          prevWs,
          wholesaleSynced,
          existing.isHidden ?? false
        );
        const desc = (row.description || '').trim();
        batch.update(ref, {
          price,
          storeroomStock: qty,
          wholesaleStock: wholesaleSynced,
          stock: wholesaleSynced,
          isHidden: nextHidden,
          updatedAt: Date.now(),
          ...(match === 'name' && desc
            ? {
                code,
                name: desc,
                description: desc,
              }
            : {}),
        });
        updated += 1;
        if (match === 'code') updatedByCode += 1;
        else updatedByName += 1;
      } else {
        const ref = doc(db, 'inventory', `w_${code}`);
        const nextHidden = nextIsHiddenAfterWholesaleChange(0, qty, true);
        batch.set(
          ref,
          {
            name: (row.description || '').trim() || `Item ${code}`,
            category: UNCATEGORIZED,
            price,
            stock: qty,
            wholesaleStock: qty,
            storeroomStock: qty,
            reservedQty: 0,
            unit: 'unit',
            code,
            description: (row.description || '').trim(),
            isHidden: nextHidden,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        created += 1;
      }
    }
    await batch.commit();
  }

  return {
    updated,
    updatedByCode,
    updatedByName,
    created,
    skipped,
  };
}
