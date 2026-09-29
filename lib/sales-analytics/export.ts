import * as XLSX from 'xlsx';
import { overallGroupLabel } from '@/lib/sales-analytics/analyze';
import type {
  SalesAnalysisMeta,
  SalesAnalysisResult,
  SalesDataWarning,
} from '@/lib/sales-analytics/types';

type Cell = string | number;

function pct(n: number | undefined): number | '' {
  return n === undefined ? '' : Math.round(n * 10000) / 100;
}

function money(n: number | undefined): number | '' {
  return n === undefined ? '' : Math.round(n * 100) / 100;
}

/** Header + rows for the analysed product table, only with supported columns. */
export function analysisTableRows(
  result: SalesAnalysisResult,
  currency: string
): Cell[][] {
  const { hasValue, hasCode } = result;
  const header: string[] = ['Rank by quantity'];
  if (hasValue) header.push('Rank by sales value');
  header.push('Product name');
  if (hasCode) header.push('Product code / SKU');
  header.push('Quantity sold');
  if (hasValue) {
    header.push(
      `Sales value (${currency})`,
      `Average value per unit (${currency})`,
      `Estimated cost (${currency})`,
      `Estimated gross profit (${currency})`
    );
  }
  header.push('Rows combined');
  header.push('Share of total quantity (%)');
  if (hasValue) header.push('Share of total sales value (%)');
  header.push('Quantity group');
  if (hasValue) header.push('Value group');
  header.push('Overall product group');

  const rows: Cell[][] = result.products.map((p) => {
    const r: Cell[] = [p.rankByQuantity];
    if (hasValue) r.push(p.rankByValue ?? '');
    r.push(p.name);
    if (hasCode) r.push(p.code ?? '');
    r.push(p.quantity);
    if (hasValue) {
      r.push(money(p.value), money(p.unitValue), money(p.estimatedCost), money(p.estimatedProfit));
    }
    r.push(p.rowCount ?? 1);
    r.push(pct(p.quantityShare));
    if (hasValue) r.push(pct(p.valueShare));
    r.push(p.quantityGroup === 'high' ? 'High' : 'Lower');
    if (hasValue) r.push(p.valueGroup === 'high' ? 'High' : 'Lower');
    r.push(overallGroupLabel(p));
    return r;
  });
  return [header, ...rows];
}

/** Stops spreadsheet apps treating a product name as a formula. */
export function csvSafeCell(cell: Cell): string {
  if (typeof cell === 'number') return String(cell);
  let s = cell;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAnalysisCsv(result: SalesAnalysisResult, currency: string): string {
  return analysisTableRows(result, currency)
    .map((r) => r.map(csvSafeCell).join(','))
    .join('\n');
}

export function buildAnalysisWorkbook(
  result: SalesAnalysisResult,
  meta: SalesAnalysisMeta,
  warnings: SalesDataWarning[] = []
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const table = analysisTableRows(result, meta.currency);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table), 'Products');

  const s = result.stats;
  const summary: Cell[][] = [
    ['Analysis', meta.name],
    ['Period', `${meta.periodStart} to ${meta.periodEnd}`],
    ['Period type', meta.periodType === 'full_year' ? 'Full year' : 'Partial year'],
    ['Source file', meta.fileName],
    [],
    ['Total products', s.totalProducts],
    ['Total quantity sold', s.totalQuantity],
    ['Average quantity per product', Math.round(s.averageQuantity * 100) / 100],
    ['Median quantity per product', s.medianQuantity],
  ];
  if (result.hasValue) {
    summary.push(
      [`Total sales value (${meta.currency})`, money(s.totalValue)],
      [`Average sales value per product (${meta.currency})`, money(s.averageValue)],
      [`Estimated cost — sales value ÷ 1.10 (${meta.currency})`, money(s.estimatedCost)],
      [`Estimated gross profit (${meta.currency})`, money(s.estimatedProfit)]
    );
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  if (warnings.length > 0) {
    const w: Cell[][] = [['Warning', 'Count', 'Examples']];
    for (const x of warnings) w.push([x.message, x.count, (x.examples ?? []).join('; ')]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(w), 'Data warnings');
  }
  return wb;
}

export function analysisFileBaseName(meta: SalesAnalysisMeta): string {
  const slug = meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'sales-analysis';
}

export function downloadAnalysisCsv(result: SalesAnalysisResult, meta: SalesAnalysisMeta) {
  const blob = new Blob(['\uFEFF' + buildAnalysisCsv(result, meta.currency)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${analysisFileBaseName(meta)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAnalysisXlsx(
  result: SalesAnalysisResult,
  meta: SalesAnalysisMeta,
  warnings: SalesDataWarning[] = []
) {
  XLSX.writeFile(
    buildAnalysisWorkbook(result, meta, warnings),
    `${analysisFileBaseName(meta)}.xlsx`
  );
}
