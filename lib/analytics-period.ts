import periodSeed from '@/data/analytics/period-performance.json';
import type {
  AnalyticsPeriodPerformance,
  AnalyticsPeriodProductRow,
} from '@/types';

export type PeriodMetricKey = 'ito' | 'byQuantity' | 'byValue';

export function getPeriodPerformance(): AnalyticsPeriodPerformance {
  return periodSeed as AnalyticsPeriodPerformance;
}

export function periodHasData(period: AnalyticsPeriodPerformance): boolean {
  return (
    period.ito.length > 0 ||
    period.byQuantity.length > 0 ||
    period.byValue.length > 0
  );
}

function withRank(
  rows: AnalyticsPeriodProductRow[],
  score: (row: AnalyticsPeriodProductRow) => number
): AnalyticsPeriodProductRow[] {
  return [...rows]
    .map((row, index) => ({
      ...row,
      rank: row.rank ?? index + 1,
    }))
    .sort((a, b) => {
      const byScore = score(b) - score(a);
      if (byScore !== 0) return byScore;
      return (a.rank ?? 0) - (b.rank ?? 0);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function rankedPeriodRows(
  period: AnalyticsPeriodPerformance,
  metric: PeriodMetricKey
): AnalyticsPeriodProductRow[] {
  if (metric === 'ito') {
    return withRank(period.ito, (r) => Number(r.ito) || 0);
  }
  if (metric === 'byQuantity') {
    return withRank(period.byQuantity, (r) => Number(r.quantity) || 0);
  }
  return withRank(period.byValue, (r) => Number(r.value) || 0);
}

export function periodMetricLabel(metric: PeriodMetricKey): string {
  if (metric === 'ito') return 'Inventory turnover (ITO)';
  if (metric === 'byQuantity') return 'Quantity sold';
  return 'Sales value';
}

export function periodRowPrimaryScore(
  row: AnalyticsPeriodProductRow,
  metric: PeriodMetricKey
): number {
  if (metric === 'ito') return Number(row.ito) || 0;
  if (metric === 'byQuantity') return Number(row.quantity) || 0;
  return Number(row.value) || 0;
}

export function formatPeriodScore(
  row: AnalyticsPeriodProductRow,
  metric: PeriodMetricKey
): string {
  if (metric === 'ito') {
    const n = Number(row.ito) || 0;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (metric === 'byQuantity') {
    return `${(Number(row.quantity) || 0).toLocaleString()} units`;
  }
  return `₵${(Number(row.value) || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

/** Simple purchase / focus hints from overlapping top performers. */
export function buildPeriodInsights(
  period: AnalyticsPeriodPerformance,
  topN = 15
): string[] {
  if (!periodHasData(period)) {
    return [
      'Import last-year ITO, quantity, and value lists to unlock purchase and focus insights.',
    ];
  }

  const ito = rankedPeriodRows(period, 'ito').slice(0, topN);
  const qty = rankedPeriodRows(period, 'byQuantity').slice(0, topN);
  const value = rankedPeriodRows(period, 'byValue').slice(0, topN);

  const key = (row: AnalyticsPeriodProductRow) =>
    (row.code || row.name).trim().toLowerCase();

  const itoSet = new Set(ito.map(key));
  const qtySet = new Set(qty.map(key));
  const valueSet = new Set(value.map(key));

  const allNames = new Map<string, string>();
  for (const row of [...ito, ...qty, ...value]) {
    allNames.set(key(row), row.name);
  }

  const star = [...allNames.entries()]
    .filter(([k]) => itoSet.has(k) && qtySet.has(k) && valueSet.has(k))
    .map(([, name]) => name);

  const cashCows = [...allNames.entries()]
    .filter(([k]) => valueSet.has(k) && !qtySet.has(k))
    .map(([, name]) => name);

  const volume = [...allNames.entries()]
    .filter(([k]) => qtySet.has(k) && !valueSet.has(k))
    .map(([, name]) => name);

  const insights: string[] = [];

  if (star.length > 0) {
    insights.push(
      `Strong across ITO, quantity, and value (priority restock): ${star
        .slice(0, 8)
        .join(', ')}${star.length > 8 ? '…' : ''}.`
    );
  }
  if (cashCows.length > 0) {
    insights.push(
      `High value but not top volume — protect margin / stock carefully: ${cashCows
        .slice(0, 6)
        .join(', ')}${cashCows.length > 6 ? '…' : ''}.`
    );
  }
  if (volume.length > 0) {
    insights.push(
      `High volume, lower value share — useful for traffic / assortment: ${volume
        .slice(0, 6)
        .join(', ')}${volume.length > 6 ? '…' : ''}.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      'Rankings loaded. Expand top N overlap or refine lists for sharper purchase advice.'
    );
  }

  return insights;
}
