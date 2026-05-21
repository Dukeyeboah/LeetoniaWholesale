import type { Product } from '@/types';
import { categorizeDrug } from '@/lib/drug-categorizer';
import { nextIsHiddenAfterWholesaleChange } from '@/lib/inventory-availability';
import {
  assignBestImageMatches,
  type ImageFileEntry,
  type ProductEntry,
} from '@/lib/product-image-match';
import {
  getStorefrontStockRows,
  storefrontDocIdFromDrug,
  storefrontRowPrice,
  type StorefrontStockRow,
} from '@/lib/storefront-stock-data';
import { normalizeInventoryLabel } from '@/lib/warehouse-data';

export type StorefrontResetProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  wholesaleStock: number;
  stock: number;
  storeroomStock: number;
  reservedQty: number;
  unit: string;
  description: string;
  isHidden: boolean;
  imageUrl?: string;
  imageFilename?: string;
  imageFullPath?: string;
  matchScore: number;
  matchExact: boolean;
};

export type StorefrontResetPlan = {
  products: StorefrontResetProduct[];
  canonicalIds: Set<string>;
  toDeleteIds: string[];
  skippedRows: number;
  withImage: number;
  withoutImage: number;
  unpairedImagePaths: string[];
};

type PreservedStock = {
  storeroomStock: number;
  reservedQty: number;
};

function preserveMapFromExisting(
  existing: Product[]
): Map<string, PreservedStock> {
  const m = new Map<string, PreservedStock>();
  for (const p of existing) {
    const label = normalizeInventoryLabel(p.name || '');
    if (!label) continue;
    const prev = m.get(label);
    const storeroom = Math.max(0, Number(p.storeroomStock ?? 0));
    const reserved = Math.max(0, Number(p.reservedQty ?? 0));
    if (!prev) {
      m.set(label, { storeroomStock: storeroom, reservedQty: reserved });
    } else {
      m.set(label, {
        storeroomStock: Math.max(prev.storeroomStock, storeroom),
        reservedQty: Math.max(prev.reservedQty, reserved),
      });
    }
  }
  return m;
}

/**
 * Build wholesale/storefront inventory solely from `updatedStock.json` rows,
 * match Storage `inventoryImages/**` filenames, preserve storeroom/reserved by name.
 */
export function buildStorefrontResetPlan(
  rows: readonly StorefrontStockRow[],
  existingProducts: Product[],
  imageFiles: ImageFileEntry[],
  minFuzzyScore = 0.85
): StorefrontResetPlan {
  const preserved = preserveMapFromExisting(existingProducts);
  const canonicalIds = new Set<string>();
  const products: StorefrontResetProduct[] = [];
  let skippedRows = 0;

  const entries: ProductEntry[] = [];
  const rowByDocId = new Map<string, StorefrontStockRow>();

  for (const row of rows) {
    const drug = (row.Drug || '').trim();
    if (!drug) {
      skippedRows += 1;
      continue;
    }
    const price = storefrontRowPrice(row);
    if (price == null) {
      skippedRows += 1;
      continue;
    }
    const docId = storefrontDocIdFromDrug(drug);
    if (rowByDocId.has(docId)) {
      skippedRows += 1;
      continue;
    }
    rowByDocId.set(docId, row);
    canonicalIds.add(docId);
    entries.push({ id: docId, name: drug });
  }

  const exactPass = assignBestImageMatches(entries, imageFiles, 1);
  const matchedExact = new Set(exactPass.pairings.map((p) => p.productId));
  const remainingEntries = entries.filter((e) => !matchedExact.has(e.id));
  const fuzzyPass =
    remainingEntries.length > 0 && exactPass.unpairedFiles.length > 0
      ? assignBestImageMatches(
          remainingEntries,
          exactPass.unpairedFiles,
          minFuzzyScore
        )
      : { pairings: [], unpairedProducts: remainingEntries, unpairedFiles: [] };

  const pairings = [...exactPass.pairings, ...fuzzyPass.pairings];
  const unpairedFiles = fuzzyPass.unpairedFiles;

  const imageByProductId = new Map(pairings.map((p) => [p.productId, p]));

  for (const [docId, row] of rowByDocId) {
    const drug = row.Drug.trim();
    const price = storefrontRowPrice(row)!;
    const qty = Math.max(0, Math.floor(Number(row.Quantity) || 0));
    const label = normalizeInventoryLabel(drug);
    const keep = preserved.get(label);
    const storeroomStock = keep?.storeroomStock ?? 0;
    const reservedQty = keep?.reservedQty ?? 0;
    const wholesaleStock = Math.max(qty, reservedQty);
    const isHidden = nextIsHiddenAfterWholesaleChange(0, wholesaleStock, true);
    const img = imageByProductId.get(docId);

    products.push({
      id: docId,
      name: drug,
      category: categorizeDrug(drug),
      price,
      wholesaleStock,
      stock: wholesaleStock,
      storeroomStock,
      reservedQty,
      unit: 'unit',
      description: drug,
      isHidden,
      ...(img
        ? {
            imageFilename: img.filename,
            imageFullPath: img.fullPath,
            matchScore: img.similarity,
            matchExact: img.similarity >= 0.99,
          }
        : {
            matchScore: 0,
            matchExact: false,
          }),
    });
  }

  products.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const toDeleteIds = existingProducts
    .map((p) => p.id)
    .filter((id) => !canonicalIds.has(id));

  const withImage = products.filter((p) => p.imageFilename).length;
  const withoutImage = products.length - withImage;

  return {
    products,
    canonicalIds,
    toDeleteIds,
    skippedRows,
    withImage,
    withoutImage,
    unpairedImagePaths: unpairedFiles.map((f) => f.fullPath),
  };
}

export function loadStorefrontRowsFromJson(): StorefrontStockRow[] {
  return getStorefrontStockRows();
}
