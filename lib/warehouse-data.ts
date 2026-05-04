import warehouseJson from '@/data/warehouse.json';
import type { Product } from '@/types';
import {
  getFirstCharacterGroup,
  type InventoryLetterFilter,
} from '@/lib/inventory-filters';

export type WarehouseRow = {
  code: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
};

export function getWarehouseRows(): WarehouseRow[] {
  return warehouseJson as WarehouseRow[];
}

export function normalizeWarehouseCode(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

/** Collapses whitespace, lowercases — for matching warehouse description to product name. */
export function normalizeInventoryLabel(raw: string): string {
  return (raw || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** First matching product per trimmed product `code` (Firestore doc id may differ). */
export function indexInventoryByProductCode(
  products: Product[]
): Map<string, Product> {
  const m = new Map<string, Product>();
  for (const p of products) {
    const k = normalizeWarehouseCode(p.code);
    if (!k) continue;
    if (!m.has(k)) m.set(k, p);
  }
  return m;
}

/**
 * First product per normalized `name` and per normalized `description` (if distinct).
 */
export function indexInventoryByNormalizedLabel(
  products: Product[]
): Map<string, Product> {
  const m = new Map<string, Product>();
  for (const p of products) {
    const keys = new Set<string>();
    const nk = normalizeInventoryLabel(p.name || '');
    if (nk) keys.add(nk);
    if (p.description) {
      const d = normalizeInventoryLabel(p.description);
      if (d) keys.add(d);
    }
    for (const k of keys) {
      if (!m.has(k)) m.set(k, p);
    }
  }
  return m;
}

export type WarehouseProductMatch = 'code' | 'name';

/**
 * Prefer **name / description** match (warehouse `description` ↔ product `name` or
 * `description`, normalized). Product codes often differ from the warehouse file
 * (e.g. internal `10` vs file `4568`), so code-only matches can hit the wrong row.
 * Falls back to **code** match only when no label match.
 */
export function resolveWarehouseRowToProduct(
  row: WarehouseRow,
  byCode: Map<string, Product>,
  byLabel: Map<string, Product>
): { product: Product; match: WarehouseProductMatch } | null {
  const label = normalizeInventoryLabel(row.description || '');
  if (label) {
    const byN = byLabel.get(label);
    if (byN) return { product: byN, match: 'name' };
  }
  const code = normalizeWarehouseCode(row.code);
  if (code) {
    const byC = byCode.get(code);
    if (byC) return { product: byC, match: 'code' };
  }
  return null;
}

export function filterSortWarehouseRows(
  rows: readonly WarehouseRow[],
  letter: InventoryLetterFilter,
  sort: 'default' | 'az' | 'code'
): WarehouseRow[] {
  let r = rows.map((x) => ({ ...x }));
  if (letter !== 'all') {
    r = r.filter(
      (row) =>
        getFirstCharacterGroup(row.description || '') === letter
    );
  }
  if (sort === 'az') {
    r.sort((a, b) =>
      a.description.localeCompare(b.description, undefined, {
        sensitivity: 'base',
      })
    );
  } else if (sort === 'code') {
    r.sort((a, b) =>
      String(a.code).localeCompare(String(b.code), undefined, {
        numeric: true,
      })
    );
  }
  return r;
}
