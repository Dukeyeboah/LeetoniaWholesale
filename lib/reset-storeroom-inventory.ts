import type { Product } from '@/types';
import {
  assignBestImageMatches,
  type ImageFileEntry,
  type ProductEntry,
} from '@/lib/product-image-match';
import {
  indexInventoryByProductCode,
  indexInventoryByNormalizedLabel,
  normalizeWarehouseCode,
  resolveWarehouseRowToProduct,
  type WarehouseRow,
} from '@/lib/warehouse-data';

export type StoreroomInventoryUpdate = {
  id: string;
  name: string;
  description: string;
  code: string;
  storeroomStock: number;
  storeroomPrice: number;
  isNew: boolean;
  matchKind: 'name' | 'code' | 'new';
  imageUrl?: string;
  imageFilename?: string;
  imageFullPath?: string;
  matchScore?: number;
  matchExact?: boolean;
};

export type StoreroomInventoryPlan = {
  updates: StoreroomInventoryUpdate[];
  clearStoreroomIds: string[];
  skipped: number;
  matchedByName: number;
  matchedByCode: number;
  newProducts: number;
  withImage: number;
  withoutImage: number;
};

/**
 * Plan applying `data/storeroom.json` to Firestore storeroom fields only.
 * Optionally pairs Storage images to matched / new rows by description.
 */
export function buildStoreroomInventoryPlan(
  rows: readonly WarehouseRow[],
  existingProducts: Product[],
  imageFiles: ImageFileEntry[],
  minImageScore: number
): StoreroomInventoryPlan {
  const byCode = indexInventoryByProductCode(existingProducts);
  const byLabel = indexInventoryByNormalizedLabel(existingProducts);
  const matchedIds = new Set<string>();
  const updates: StoreroomInventoryUpdate[] = [];
  let skipped = 0;
  let matchedByName = 0;
  let matchedByCode = 0;
  let newProducts = 0;

  const imageProducts: ProductEntry[] = [];

  for (const row of rows) {
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
    const description = (row.description || '').trim() || `Item ${code}`;
    let id: string;
    let isNew = false;
    let matchKind: StoreroomInventoryUpdate['matchKind'];

    if (resolved) {
      if (matchedIds.has(resolved.product.id)) {
        skipped += 1;
        continue;
      }
      id = resolved.product.id;
      matchedIds.add(id);
      matchKind = resolved.match;
      if (resolved.match === 'name') matchedByName += 1;
      else matchedByCode += 1;
    } else {
      id = `w_${code}`;
      if (matchedIds.has(id)) {
        skipped += 1;
        continue;
      }
      matchedIds.add(id);
      isNew = true;
      newProducts += 1;
      matchKind = 'new';
    }

    updates.push({
      id,
      name: description,
      description,
      code,
      storeroomStock: qty,
      storeroomPrice: price,
      isNew,
      matchKind,
    });
    imageProducts.push({ id, name: description });
  }

  const { pairings } = assignBestImageMatches(
    imageProducts,
    imageFiles,
    minImageScore
  );
  const pairingById = new Map(pairings.map((p) => [p.productId, p]));

  let withImage = 0;
  let withoutImage = 0;
  for (const u of updates) {
    const p = pairingById.get(u.id);
    if (p) {
      u.imageUrl = undefined; // filled at apply time from Storage URL
      u.imageFilename = p.filename;
      u.imageFullPath = p.fullPath;
      u.matchScore = p.similarity;
      u.matchExact = p.similarity >= 1;
      withImage += 1;
    } else {
      withoutImage += 1;
    }
  }

  const clearStoreroomIds = existingProducts
    .filter((p) => (p.storeroomStock ?? 0) > 0 && !matchedIds.has(p.id))
    .map((p) => p.id);

  return {
    updates,
    clearStoreroomIds,
    skipped,
    matchedByName,
    matchedByCode,
    newProducts,
    withImage,
    withoutImage,
  };
}
