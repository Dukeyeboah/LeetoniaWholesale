import type { SalesProductRow, SalesSourceRow } from '@/lib/sales-analytics/types';

export type ExpiryItem = {
  name: string;
  code?: string;
  /** Units expiring inside the range. */
  quantity: number;
  /** Earliest expiry date inside the range (YYYY-MM-DD). */
  earliest: string;
  batches: number;
  unitPrice?: number;
  valueAtRisk?: number;
  product: SalesProductRow;
};

export type ExpiryRangeResult = {
  items: ExpiryItem[];
  byMonth: { month: string; quantity: number; products: number }[];
  totalQuantity: number;
  totalValue?: number;
  expiredProducts: number;
  expiredQuantity: number;
};

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Products with stock expiring between `from` and `to` (inclusive, YYYY-MM-DD),
 * worked out per batch from the original rows so every expiry date counts.
 */
export function expiringInRange(
  products: SalesProductRow[],
  sourceRows: SalesSourceRow[],
  from: string,
  to: string
): ExpiryRangeResult {
  const byRow = new Map(sourceRows.map((r) => [r.rowNumber, r]));
  const items: ExpiryItem[] = [];
  const months = new Map<string, { quantity: number; products: Set<number> }>();
  let expiredProducts = 0;
  let expiredQuantity = 0;
  let totalValue = 0;
  let anyPrice = false;

  products.forEach((p, pi) => {
    const batches = (p.sourceRows ?? [])
      .map((n) => byRow.get(n))
      .filter((r): r is SalesSourceRow => !!r && !!r.expiry);
    const records =
      batches.length > 0
        ? batches.map((b) => ({ expiry: b.expiry!, quantity: b.quantity, price: b.unitPrice ?? p.unitPrice, key: `${b.batch ?? ''}|${b.expiry}` }))
        : p.expiry
          ? [{ expiry: p.expiry, quantity: p.quantity, price: p.unitPrice, key: p.expiry }]
          : [];

    let expired = false;
    let qty = 0;
    let value = 0;
    let priced = false;
    let earliest = '';
    const keys = new Set<string>();
    for (const r of records) {
      if (r.expiry < from) {
        expired = true;
        expiredQuantity += r.quantity;
        continue;
      }
      if (r.expiry > to) continue;
      qty += r.quantity;
      keys.add(r.key);
      if (!earliest || r.expiry < earliest) earliest = r.expiry;
      if (r.price !== undefined) {
        value += r.quantity * r.price;
        priced = true;
      }
      const m = r.expiry.slice(0, 7);
      const bucket = months.get(m) ?? { quantity: 0, products: new Set<number>() };
      bucket.quantity += r.quantity;
      bucket.products.add(pi);
      months.set(m, bucket);
    }
    if (expired) expiredProducts += 1;
    if (!earliest) return;
    if (priced) {
      anyPrice = true;
      totalValue += value;
    }
    items.push({
      name: p.name,
      ...(p.code ? { code: p.code } : {}),
      quantity: qty,
      earliest,
      batches: keys.size,
      ...(p.unitPrice !== undefined ? { unitPrice: p.unitPrice } : {}),
      ...(priced ? { valueAtRisk: value } : {}),
      product: p,
    });
  });

  items.sort((a, b) => (a.earliest < b.earliest ? -1 : a.earliest > b.earliest ? 1 : a.name.localeCompare(b.name)));
  return {
    items,
    byMonth: [...months.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, v]) => ({ month, quantity: v.quantity, products: v.products.size })),
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    ...(anyPrice ? { totalValue } : {}),
    expiredProducts,
    expiredQuantity,
  };
}
