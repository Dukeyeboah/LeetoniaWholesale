import { writeBatch, doc, type Firestore } from 'firebase/firestore';
import type { Product } from '@/types';
import {
  nextIsHiddenAfterWholesaleChange,
  wholesaleOnHand,
} from '@/lib/inventory-availability';
import { indexInventoryByNormalizedLabel } from '@/lib/warehouse-data';
import {
  resolveStorefrontRowToProduct,
  storefrontDocIdFromDrug,
  storefrontRowPrice,
  type StorefrontStockRow,
} from '@/lib/storefront-stock-data';

const BATCH_SIZE = 400;
const UNCATEGORIZED = 'Uncategorized';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export type StorefrontSyncResult = {
  updated: number;
  created: number;
  /** Legacy products removed from Firestore (not in updatedStock.json). */
  removed: number;
  skipped: number;
};

/**
 * Apply `data/updatedStock.json` to **wholesale / storefront** fields only:
 * `price`, `wholesaleStock`, `stock`, `isHidden`. Does **not** change `storeroomStock`.
 *
 * Products not matched to any row are deleted (wholesale list = JSON only).
 */
export async function syncStorefrontStockToInventory(
  db: Firestore,
  products: Product[],
  rows: readonly StorefrontStockRow[]
): Promise<StorefrontSyncResult> {
  const byLabel = indexInventoryByNormalizedLabel(products);
  const matchedIds = new Set<string>();
  let updated = 0;
  let created = 0;
  let removed = 0;
  let skipped = 0;

  for (const part of chunk([...rows], BATCH_SIZE)) {
    const batch = writeBatch(db);
    const touchedInBatch = new Set<string>();

    for (const row of part) {
      const drug = (row.Drug || '').trim();
      if (!drug) {
        skipped += 1;
        continue;
      }

      const qty = Math.max(0, Math.floor(Number(row.Quantity) || 0));
      const priceFromFile = storefrontRowPrice(row);
      if (priceFromFile == null) {
        skipped += 1;
        continue;
      }
      const existing = resolveStorefrontRowToProduct(row, byLabel);

      if (existing) {
        if (touchedInBatch.has(existing.id)) {
          skipped += 1;
          continue;
        }
        touchedInBatch.add(existing.id);
        matchedIds.add(existing.id);

        const ref = doc(db, 'inventory', existing.id);
        const reserved = Math.max(0, Number(existing.reservedQty ?? 0));
        const wholesaleSynced = Math.max(qty, reserved);
        const prevWs = wholesaleOnHand(existing);
        const nextHidden = nextIsHiddenAfterWholesaleChange(
          prevWs,
          wholesaleSynced,
          existing.isHidden ?? false
        );

        batch.update(ref, {
          price: priceFromFile,
          wholesaleStock: wholesaleSynced,
          stock: wholesaleSynced,
          isHidden: nextHidden,
          updatedAt: Date.now(),
        });
        updated += 1;
      } else {
        const docId = storefrontDocIdFromDrug(drug);
        if (touchedInBatch.has(docId)) {
          skipped += 1;
          continue;
        }
        touchedInBatch.add(docId);
        matchedIds.add(docId);

        const ref = doc(db, 'inventory', docId);
        const nextHidden = nextIsHiddenAfterWholesaleChange(0, qty, true);
        batch.set(
          ref,
          {
            name: drug,
            category: UNCATEGORIZED,
            price: priceFromFile,
            stock: qty,
            wholesaleStock: qty,
            storeroomStock: 0,
            reservedQty: 0,
            unit: 'unit',
            description: drug,
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

  const toRemove = products.filter((p) => !matchedIds.has(p.id));
  for (const part of chunk(toRemove, BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const p of part) {
      batch.delete(doc(db, 'inventory', p.id));
      removed += 1;
    }
    await batch.commit();
  }

  return { updated, created, removed, skipped };
}
