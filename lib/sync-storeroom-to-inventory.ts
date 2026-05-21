import { writeBatch, doc, type Firestore } from 'firebase/firestore';
import type { Product } from '@/types';
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

export type StoreroomSyncResult = {
  updated: number;
  updatedByCode: number;
  updatedByName: number;
  created: number;
  cleared: number;
  skipped: number;
};

/**
 * Apply `data/storeroom.json` to **storeroom only** (`storeroomStock`, `storeroomPrice`, `code`).
 * Does not change wholesale `price`, `stock`, `wholesaleStock`, or `isHidden`.
 */
export async function syncStoreroomToInventory(
  db: Firestore,
  products: Product[],
  rows: readonly WarehouseRow[]
): Promise<StoreroomSyncResult> {
  const byCode = indexInventoryByProductCode(products);
  const byLabel = indexInventoryByNormalizedLabel(products);
  const matchedIds = new Set<string>();
  let updated = 0;
  let updatedByCode = 0;
  let updatedByName = 0;
  let created = 0;
  let cleared = 0;
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
        matchedIds.add(existing.id);
        batch.update(doc(db, 'inventory', existing.id), {
          storeroomStock: qty,
          storeroomPrice: price,
          code,
          updatedAt: Date.now(),
        });
        updated += 1;
        if (match === 'code') updatedByCode += 1;
        else updatedByName += 1;
      } else {
        const ref = doc(db, 'inventory', `w_${code}`);
        matchedIds.add(`w_${code}`);
        batch.set(
          ref,
          {
            name: (row.description || '').trim() || `Item ${code}`,
            category: UNCATEGORIZED,
            price: 0,
            stock: 0,
            wholesaleStock: 0,
            storeroomStock: qty,
            storeroomPrice: price,
            reservedQty: 0,
            unit: 'unit',
            code,
            description: (row.description || '').trim(),
            isHidden: true,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        created += 1;
      }
    }

    await batch.commit();
  }

  const toClear = products.filter(
    (p) => (p.storeroomStock ?? 0) > 0 && !matchedIds.has(p.id)
  );
  for (const part of chunk(toClear, BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const p of part) {
      batch.update(doc(db, 'inventory', p.id), {
        storeroomStock: 0,
        updatedAt: Date.now(),
      });
      cleared += 1;
    }
    await batch.commit();
  }

  return {
    updated,
    updatedByCode,
    updatedByName,
    created,
    cleared,
    skipped,
  };
}
