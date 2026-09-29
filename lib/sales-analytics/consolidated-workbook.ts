import type { Workbook, Worksheet } from 'exceljs';
import { estimatedCost } from '@/lib/sales-analytics/analyze';
import type { ConsolidationResult } from '@/lib/sales-analytics/consolidate';
import { activeDecisions } from '@/lib/sales-analytics/consolidate';
import { analysisFileBaseName } from '@/lib/sales-analytics/export';
import type {
  ConsolidationPlan,
  MatchDecision,
  ProductMappingRule,
  SalesAnalysisMeta,
  SalesDataIssue,
  SalesSourceRow,
} from '@/lib/sales-analytics/types';

export const CONSOLIDATED_SHEETS = [
  'Consolidated Products',
  'Duplicate Groups',
  'Possible Matches',
  'Mapping Rules',
  'Data Issues',
] as const;

const FILL = {
  green: 'FFD9F2DC',
  yellow: 'FFFFF4C2',
  blue: 'FFDCEBFA',
  red: 'FFF9D6D5',
  header: 'FF1F2937',
} as const;

const METHOD_LABEL: Record<string, string> = {
  single: 'Single row',
  code: 'Exact product code',
  name: 'Exact name',
  mapping: 'Approved mapping rule',
  admin: 'Admin approved',
};

const KIND_LABEL: Record<string, string> = {
  truncated: 'Shortened name',
  truncated_multiple: 'Shortened name — several candidates',
  spelling: 'Possible spelling difference',
  missing_pack: 'Pack size missing',
  missing_detail: 'Details missing',
  wording: 'Different wording / order',
  same_code_conflict: 'Same code, different products',
  same_name_multiple_codes: 'Same name, several codes',
};

export type ConsolidatedWorkbookInput = {
  meta: SalesAnalysisMeta;
  hasValue: boolean;
  sourceRows: SalesSourceRow[];
  plan: ConsolidationPlan;
  decisions: MatchDecision[];
  result: ConsolidationResult;
  rules: ProductMappingRule[];
  issues: SalesDataIssue[];
};

function round2(n: number | undefined): number | null {
  return n === undefined ? null : Math.round(n * 100) / 100;
}

function isoDate(ms: number | undefined): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : '';
}

function finishSheet(ws: Worksheet, widths: number[]) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.header } };
  header.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const cols = widths.length;
  if (cols > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: cols } };
  }
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function fillRow(ws: Worksheet, rowNumber: number, argb: string) {
  ws.getRow(rowNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Build the five-sheet consolidated workbook (colours, filters, frozen headers). */
export async function buildConsolidatedWorkbook(input: ConsolidatedWorkbookInput): Promise<Workbook> {
  // Standalone build: the package's Node entry drags fstream/rimraf into the Next.js bundle.
  const mod = (await import('exceljs/dist/exceljs.min.js')) as unknown as {
    default?: typeof import('exceljs');
  } & typeof import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Leetonia Wholesale';
  wb.created = new Date();
  const { plan, result, sourceRows, hasValue, meta } = input;
  const cur = meta.currency;
  const entityByKey = new Map(plan.entities.map((e) => [e.key, e]));
  const decided = new Map(activeDecisions(plan, input.decisions).map((d) => [d.matchId, d]));
  const pendingKeys = new Set<string>();
  for (const m of plan.possibleMatches) {
    if (!decided.has(m.id)) m.entityKeys.forEach((k) => pendingKeys.add(k));
  }
  const separateKeys = new Set(plan.keptSeparate.flatMap((g) => g.entityKeys));
  const hasExpiry = sourceRows.some((r) => r.expiry);

  // 1. Consolidated Products
  const products = wb.addWorksheet(CONSOLIDATED_SHEETS[0]);
  const pHeader = [
    'Final product name',
    'Product code / SKU',
    'Normalised name',
    'Match method',
    'Confidence',
    'Admin decision',
    'Decision date',
    'Rows combined',
    'Source row numbers',
    'Total quantity',
  ];
  if (hasValue) {
    pHeader.push(
      `Total amount (${cur})`,
      `Average unit price (${cur})`,
      `Estimated cost (${cur})`,
      `Estimated gross profit (${cur})`
    );
  }
  if (hasExpiry) pHeader.push('Earliest expiry', 'Batches');
  pHeader.push('Status');
  products.addRow(pHeader);
  result.products.forEach((p, i) => {
    const keys = result.productEntityKeys[i] ?? [];
    const pending = keys.some((k) => pendingKeys.has(k));
    const separate = keys.some((k) => separateKeys.has(k));
    const combined = (p.rowCount ?? 1) > 1;
    const status = pending
      ? 'Possible match — needs review'
      : combined
        ? 'Consolidated'
        : separate
          ? 'Kept separate'
          : 'Single record';
    const row: (string | number | null)[] = [
      p.name,
      p.code ?? '',
      p.normalizedName ?? '',
      METHOD_LABEL[p.matchMethod ?? 'single'] ?? '',
      p.confidence === 'reviewed' ? 'Reviewed by admin' : 'High',
      p.decision === 'approved' ? 'Approved' : 'Automatic',
      isoDate(p.decidedAt),
      p.rowCount ?? 1,
      (p.sourceRows ?? []).join(', '),
      p.quantity,
    ];
    if (hasValue) {
      const v = p.value ?? 0;
      row.push(
        round2(v),
        p.quantity > 0 ? round2(v / p.quantity) : null,
        round2(estimatedCost(v)),
        round2(v - estimatedCost(v))
      );
    }
    if (hasExpiry) row.push(p.expiry ?? '', p.batchCount ?? null);
    row.push(status);
    const added = products.addRow(row);
    if (pending) fillRow(products, added.number, FILL.yellow);
    else if (combined) fillRow(products, added.number, FILL.green);
    else if (separate) fillRow(products, added.number, FILL.blue);
  });
  finishSheet(
    products,
    pHeader.map((h, i) => (i === 0 ? 45 : h === 'Source row numbers' ? 24 : h === 'Normalised name' ? 36 : 16))
  );

  // 2. Duplicate Groups
  const groups = wb.addWorksheet(CONSOLIDATED_SHEETS[1]);
  const gHeader = ['Group', 'Final product name', 'Source row', 'Original name', 'Product code', 'Quantity'];
  if (hasValue) gHeader.push(`Amount (${cur})`);
  if (hasExpiry) gHeader.push('Expiry', 'Batch');
  gHeader.push('How it was matched');
  groups.addRow(gHeader);
  const rowByNumber = new Map(sourceRows.map((r) => [r.rowNumber, r]));
  let groupNo = 0;
  result.products.forEach((p, i) => {
    if ((p.rowCount ?? 1) < 2) return;
    groupNo += 1;
    const reasons = (result.productEntityKeys[i] ?? [])
      .map((k) => entityByKey.get(k)?.reason)
      .filter(Boolean)
      .join(' | ');
    const how = p.matchMethod === 'admin' ? `Admin approved merge. ${reasons}` : reasons;
    for (const n of p.sourceRows ?? []) {
      const s = rowByNumber.get(n);
      if (!s) continue;
      const row: (string | number | null)[] = [groupNo, p.name, s.rowNumber, s.name, s.code ?? '', s.quantity];
      if (hasValue) row.push(round2(s.value));
      if (hasExpiry) row.push(s.expiry ?? '', s.batch ?? '');
      row.push(how);
      fillRow(groups, groups.addRow(row).number, FILL.green);
    }
  });
  finishSheet(groups, gHeader.map((h, i) => (i === 1 || i === 3 ? 40 : h === 'How it was matched' ? 60 : 14)));

  // 3. Possible Matches (plus automatic kept-separate groups)
  const matches = wb.addWorksheet(CONSOLIDATED_SHEETS[2]);
  const mHeader = ['Match', 'Type', 'Status', 'Role', 'Name', 'Product code', 'Rows', 'Quantity'];
  if (hasValue) mHeader.push(`Amount (${cur})`);
  mHeader.push('Reason');
  matches.addRow(mHeader);
  const entityTotals = (key: string) => {
    const e = entityByKey.get(key);
    let q = 0;
    let v = 0;
    for (const i of e?.rowIndexes ?? []) {
      q += sourceRows[i].quantity;
      v += sourceRows[i].value ?? 0;
    }
    return { e, q, v };
  };
  plan.possibleMatches.forEach((m, idx) => {
    const d = decided.get(m.id);
    const merged = d?.action === 'merge' ? new Set(d.mergeKeys ?? m.entityKeys) : null;
    const status = !d ? 'Needs review' : d.action === 'merge' ? 'Merged by admin' : 'Kept separate by admin';
    const fill = !d ? FILL.yellow : d.action === 'merge' ? FILL.green : FILL.blue;
    m.entityKeys.forEach((k, j) => {
      const { e, q, v } = entityTotals(k);
      const role = j === 0 ? 'Record' : merged?.has(k) ? 'Candidate (merged)' : 'Candidate';
      const row: (string | number | null)[] = [
        `M${idx + 1}`,
        KIND_LABEL[m.kind] ?? m.kind,
        status,
        role,
        e?.displayName ?? k,
        e?.code ?? '',
        e?.rowIndexes.length ?? 0,
        q,
      ];
      if (hasValue) row.push(round2(v));
      row.push(j === 0 ? m.reason : '');
      fillRow(matches, matches.addRow(row).number, fill);
    });
  });
  plan.keptSeparate.forEach((g, idx) => {
    g.entityKeys.forEach((k, j) => {
      const { e, q, v } = entityTotals(k);
      const row: (string | number | null)[] = [
        `S${idx + 1}`,
        'Kept separate (automatic)',
        'Kept separate',
        '',
        e?.displayName ?? k,
        e?.code ?? '',
        e?.rowIndexes.length ?? 0,
        q,
      ];
      if (hasValue) row.push(round2(v));
      row.push(j === 0 ? g.reason : '');
      fillRow(matches, matches.addRow(row).number, FILL.blue);
    });
  });
  finishSheet(matches, mHeader.map((h, i) => (i === 4 ? 45 : h === 'Reason' ? 70 : i === 1 || i === 2 ? 26 : 12)));

  // 4. Mapping Rules
  const rules = wb.addWorksheet(CONSOLIDATED_SHEETS[3]);
  rules.addRow(['Name in file', 'Normalised name', 'Master product name', 'Created', 'Updated', 'Created by']);
  for (const r of input.rules) {
    rules.addRow([r.alias, r.aliasKey, r.masterName, isoDate(r.createdAt), isoDate(r.updatedAt), r.createdBy ?? '']);
  }
  finishSheet(rules, [40, 40, 40, 14, 14, 20]);

  // 5. Data Issues
  const issues = wb.addWorksheet(CONSOLIDATED_SHEETS[4]);
  issues.addRow(['Row', 'Product', 'Problem', 'Left out of analysis']);
  for (const x of input.issues) {
    const added = issues.addRow([x.rowNumber ?? '', x.name, x.problem, x.excluded ? 'Yes' : 'No']);
    fillRow(issues, added.number, FILL.red);
  }
  finishSheet(issues, [8, 40, 70, 18]);

  return wb;
}

export async function consolidatedWorkbookBytes(input: ConsolidatedWorkbookInput): Promise<ArrayBuffer> {
  const wb = await buildConsolidatedWorkbook(input);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadConsolidatedWorkbook(input: ConsolidatedWorkbookInput): Promise<void> {
  const bytes = await consolidatedWorkbookBytes(input);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${analysisFileBaseName(input.meta)}-consolidated.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
