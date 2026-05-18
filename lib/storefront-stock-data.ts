import updatedStockJson from '@/data/updatedStock.json';
import type { Product } from '@/types';
import { normalizeInventoryLabel } from '@/lib/warehouse-data';

/** Row shape from `data/updatedStock.json`. */
export type StorefrontStockRow = {
  Drug: string;
  Quantity: number;
  Price: number;
  Expiry?: string;
  /** Lowercase alias if present in exports. */
  price?: number;
};

export function getStorefrontStockRows(): StorefrontStockRow[] {
  return updatedStockJson as StorefrontStockRow[];
}

export function storefrontRowPrice(row: StorefrontStockRow): number | null {
  const raw = row.Price ?? row.price;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Stable Firestore id for new storefront-only products (no image). */
export function storefrontDocIdFromDrug(drug: string): string {
  const slug = normalizeInventoryLabel(drug)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return `sf_${slug || 'item'}`;
}

export function resolveStorefrontRowToProduct(
  row: StorefrontStockRow,
  byLabel: Map<string, Product>
): Product | null {
  const label = normalizeInventoryLabel(row.Drug || '');
  if (!label) return null;
  return byLabel.get(label) ?? null;
}
