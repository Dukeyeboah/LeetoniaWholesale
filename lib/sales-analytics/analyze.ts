import type {
  AnalyzedSalesProduct,
  SalesAnalysisResult,
  SalesConcentration,
  SalesConcentrationTier,
  SalesDistributionBucket,
  SalesGroupKey,
  SalesProductRow,
  SalesRankMetric,
} from '@/lib/sales-analytics/types';

/** Share of products counted as "high" for quantity and for value. */
export const HIGH_GROUP_SHARE = 0.2;

export const SALES_GROUP_INFO: Record<
  SalesGroupKey,
  { label: string; guidance: string }
> = {
  high_qty_high_value: {
    label: 'High quantity / high value',
    guidance: 'Protect availability and avoid stockouts.',
  },
  high_qty_low_value: {
    label: 'High quantity / lower value',
    guidance: 'Keep available, but watch purchasing cost and handling effort.',
  },
  low_qty_high_value: {
    label: 'Lower quantity / high value',
    guidance: 'Buy carefully — each unit may be expensive.',
  },
  low_qty_low_value: {
    label: 'Lower quantity / lower value',
    guidance: 'Review during stocktake before reordering.',
  },
};

export const SALES_GROUP_ORDER: SalesGroupKey[] = [
  'high_qty_high_value',
  'high_qty_low_value',
  'low_qty_high_value',
  'low_qty_low_value',
];

export const CONCENTRATION_TIER_INFO: Record<
  SalesConcentrationTier,
  { label: string; description: string }
> = {
  top50: {
    label: 'First 50% of sales value',
    description: 'The few products that bring in half of all sales value.',
  },
  next30: {
    label: 'Next 30% (up to 80%)',
    description: 'Products that take sales value from 50% to 80%.',
  },
  next15: {
    label: 'Next 15% (up to 95%)',
    description: 'Products that take sales value from 80% to 95%.',
  },
  rest: {
    label: 'Last 5% of sales value',
    description: 'Products that together bring in the final 5% of sales value.',
  },
};

export const QUANTITY_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0–5 units', min: 0, max: 5 },
  { label: '6–10 units', min: 5, max: 10 },
  { label: '11–25 units', min: 10, max: 25 },
  { label: '26–50 units', min: 25, max: 50 },
  { label: '51–100 units', min: 50, max: 100 },
  { label: 'More than 100 units', min: 100, max: null },
];

function byName(a: SalesProductRow, b: SalesProductRow): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Smallest value still inside the top `share` of products (at least one product).
 * Products with a value >= this threshold (and > 0) count as "high".
 */
export function topShareThreshold(values: number[], share = HIGH_GROUP_SHARE): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(sorted.length * share));
  return sorted[k - 1];
}

function isHigh(v: number, threshold: number): boolean {
  return v > 0 && v >= threshold;
}

/** Round up to a "nice" number such as 1, 2, 5, 10, 20, 50 … */
export function niceNumber(x: number): number {
  if (!(x > 0)) return 0;
  const exp = 10 ** Math.floor(Math.log10(x));
  const f = x / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function formatBound(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function countIntoBuckets(
  values: number[],
  defs: { label: string; min: number; max: number | null }[]
): SalesDistributionBucket[] {
  const buckets = defs.map((d) => ({ ...d, count: 0 }));
  for (const v of values) {
    const idx = buckets.findIndex((b, i) =>
      i === 0 ? b.max === null || v <= b.max : v > b.min && (b.max === null || v <= b.max)
    );
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}

export function quantityDistribution(quantities: number[]): SalesDistributionBucket[] {
  return countIntoBuckets(quantities, QUANTITY_BUCKETS);
}

/** Value ranges based on where products naturally fall, rounded to friendly numbers. */
export function valueDistribution(values: number[]): SalesDistributionBucket[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) {
    return [{ label: 'No sales value', min: 0, max: null, count: values.length }];
  }
  const bounds: number[] = [];
  for (const q of [0.2, 0.4, 0.6, 0.8]) {
    const raw = positive[Math.min(positive.length - 1, Math.floor(q * positive.length))];
    const b = niceNumber(raw);
    if (b > 0 && !bounds.includes(b) && b < positive[positive.length - 1]) bounds.push(b);
  }
  bounds.sort((a, b) => a - b);
  if (bounds.length === 0) {
    return [{ label: 'All products', min: 0, max: null, count: values.length }];
  }
  const defs: { label: string; min: number; max: number | null }[] = [];
  defs.push({ label: `Up to ${formatBound(bounds[0])}`, min: 0, max: bounds[0] });
  for (let i = 1; i < bounds.length; i++) {
    defs.push({
      label: `${formatBound(bounds[i - 1])} – ${formatBound(bounds[i])}`,
      min: bounds[i - 1],
      max: bounds[i],
    });
  }
  defs.push({
    label: `More than ${formatBound(bounds[bounds.length - 1])}`,
    min: bounds[bounds.length - 1],
    max: null,
  });
  return countIntoBuckets(values, defs);
}

function buildConcentration(
  sortedByValue: AnalyzedSalesProduct[],
  totalValue: number
): SalesConcentration {
  const n = sortedByValue.length;
  const eps = totalValue * 1e-9;
  let cum = 0;
  let k50 = n;
  let k80 = n;
  let k95 = n;
  const points: SalesConcentration['curve'] = [
    { productCount: 0, catalogPct: 0, cumulativePct: 0 },
  ];
  const step = Math.max(1, Math.ceil(n / 200));
  sortedByValue.forEach((p, i) => {
    cum += p.value ?? 0;
    const count = i + 1;
    if (k50 === n && cum >= totalValue * 0.5 - eps) k50 = count;
    if (k80 === n && cum >= totalValue * 0.8 - eps) k80 = count;
    if (k95 === n && cum >= totalValue * 0.95 - eps) k95 = count;
    if (count % step === 0 || count === n) {
      points.push({
        productCount: count,
        catalogPct: (count / n) * 100,
        cumulativePct: (cum / totalValue) * 100,
      });
    }
  });
  return { productsFor50: k50, productsFor80: k80, productsFor95: k95, curve: points };
}

/** Sales value is assumed to include a 10% markup: cost = value ÷ 1.10. */
export const ESTIMATED_MARKUP = 1.1;

export function estimatedCost(value: number): number {
  return value / ESTIMATED_MARKUP;
}

/** All calculations for one uploaded file. Pure and deterministic. */
export function analyzeSales(
  rows: SalesProductRow[],
  opts: { hasValue: boolean; hasCode: boolean }
): SalesAnalysisResult {
  const { hasValue, hasCode } = opts;
  const n = rows.length;
  const quantities = rows.map((r) => r.quantity);
  const values = rows.map((r) => r.value ?? 0);
  const totalQuantity = quantities.reduce((s, q) => s + q, 0);
  const totalValue = hasValue ? values.reduce((s, v) => s + v, 0) : undefined;

  const byQty = [...rows].sort((a, b) => b.quantity - a.quantity || byName(a, b));
  const qtyRank = new Map<SalesProductRow, number>();
  byQty.forEach((r, i) => qtyRank.set(r, i + 1));

  const valueRank = new Map<SalesProductRow, number>();
  if (hasValue) {
    [...rows]
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || byName(a, b))
      .forEach((r, i) => valueRank.set(r, i + 1));
  }

  const highQuantityThreshold = topShareThreshold(quantities);
  const highValueThreshold = hasValue ? topShareThreshold(values) : undefined;

  const products: AnalyzedSalesProduct[] = rows.map((r) => {
    const quantityGroup = isHigh(r.quantity, highQuantityThreshold) ? 'high' : 'lower';
    const p: AnalyzedSalesProduct = {
      ...r,
      rankByQuantity: qtyRank.get(r)!,
      quantityShare: totalQuantity > 0 ? r.quantity / totalQuantity : 0,
      quantityGroup,
    };
    if (hasValue) {
      const v = r.value ?? 0;
      const valueGroup =
        highValueThreshold !== undefined && isHigh(v, highValueThreshold) ? 'high' : 'lower';
      p.rankByValue = valueRank.get(r);
      p.unitValue = r.quantity > 0 ? v / r.quantity : undefined;
      p.estimatedCost = estimatedCost(v);
      p.estimatedProfit = v - p.estimatedCost;
      p.valueShare = totalValue && totalValue > 0 ? v / totalValue : 0;
      p.valueGroup = valueGroup;
      p.group =
        quantityGroup === 'high'
          ? valueGroup === 'high'
            ? 'high_qty_high_value'
            : 'high_qty_low_value'
          : valueGroup === 'high'
            ? 'low_qty_high_value'
            : 'low_qty_low_value';
    }
    return p;
  });

  products.sort((a, b) => a.rankByQuantity - b.rankByQuantity);

  let groupCounts: Record<SalesGroupKey, number> | undefined;
  let concentration: SalesConcentration | undefined;
  if (hasValue) {
    groupCounts = {
      high_qty_high_value: 0,
      high_qty_low_value: 0,
      low_qty_high_value: 0,
      low_qty_low_value: 0,
    };
    for (const p of products) if (p.group) groupCounts[p.group] += 1;

    if (totalValue && totalValue > 0) {
      const sortedByValue = [...products].sort(
        (a, b) => (a.rankByValue ?? 0) - (b.rankByValue ?? 0)
      );
      concentration = buildConcentration(sortedByValue, totalValue);
      sortedByValue.forEach((p, i) => {
        const pos = i + 1;
        p.concentrationTier =
          pos <= concentration!.productsFor50
            ? 'top50'
            : pos <= concentration!.productsFor80
              ? 'next30'
              : pos <= concentration!.productsFor95
                ? 'next15'
                : 'rest';
      });
    }
  }

  return {
    products,
    hasValue,
    hasCode,
    stats: {
      totalProducts: n,
      totalQuantity,
      averageQuantity: n > 0 ? totalQuantity / n : 0,
      medianQuantity: median(quantities),
      ...(hasValue
        ? {
            totalValue,
            averageValue: n > 0 ? (totalValue ?? 0) / n : 0,
            estimatedCost: estimatedCost(totalValue ?? 0),
            estimatedProfit: (totalValue ?? 0) - estimatedCost(totalValue ?? 0),
          }
        : {}),
    },
    quantityDistribution: quantityDistribution(quantities),
    ...(hasValue ? { valueDistribution: valueDistribution(values) } : {}),
    highQuantityThreshold,
    ...(hasValue ? { highValueThreshold } : {}),
    ...(groupCounts ? { groupCounts } : {}),
    ...(concentration ? { concentration } : {}),
  };
}

export type RankDirection = 'top' | 'bottom';

/** Top / bottom N products for a metric. Unit value ignores products with 0 quantity. */
export function rankProducts(
  products: AnalyzedSalesProduct[],
  metric: SalesRankMetric,
  direction: RankDirection,
  n: number
): AnalyzedSalesProduct[] {
  let list: AnalyzedSalesProduct[];
  if (metric === 'quantity') {
    list = [...products].sort((a, b) => a.rankByQuantity - b.rankByQuantity);
  } else if (metric === 'value') {
    list = products
      .filter((p) => p.rankByValue !== undefined)
      .sort((a, b) => (a.rankByValue ?? 0) - (b.rankByValue ?? 0));
  } else {
    list = products
      .filter((p) => p.unitValue !== undefined)
      .sort((a, b) => (b.unitValue ?? 0) - (a.unitValue ?? 0) || byName(a, b));
  }
  if (direction === 'bottom') list.reverse();
  return list.slice(0, Math.max(0, n));
}

export function rankMetricValue(p: AnalyzedSalesProduct, metric: SalesRankMetric): number {
  if (metric === 'quantity') return p.quantity;
  if (metric === 'value') return p.value ?? 0;
  return p.unitValue ?? 0;
}

export type SlowSellerSummary = {
  threshold: number;
  products: AnalyzedSalesProduct[];
  count: number;
  catalogShare: number;
  totalQuantity: number;
  totalValue?: number;
};

/** Products that sold fewer than `threshold` units, lowest first. */
export function slowSellers(
  result: SalesAnalysisResult,
  threshold: number
): SlowSellerSummary {
  const list = result.products
    .filter((p) => p.quantity < threshold)
    .sort((a, b) => a.quantity - b.quantity || byName(a, b));
  const n = result.products.length;
  return {
    threshold,
    products: list,
    count: list.length,
    catalogShare: n > 0 ? list.length / n : 0,
    totalQuantity: list.reduce((s, p) => s + p.quantity, 0),
    ...(result.hasValue
      ? { totalValue: list.reduce((s, p) => s + (p.value ?? 0), 0) }
      : {}),
  };
}

export function overallGroupLabel(p: AnalyzedSalesProduct): string {
  if (p.group) return SALES_GROUP_INFO[p.group].label;
  return p.quantityGroup === 'high' ? 'High quantity' : 'Lower quantity';
}
