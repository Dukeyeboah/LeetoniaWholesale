import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { consolidateRows } from '@/lib/sales-analytics/consolidate';
import {
  buildConsolidatedWorkbook,
  CONSOLIDATED_SHEETS,
  consolidatedWorkbookBytes,
} from '@/lib/sales-analytics/consolidated-workbook';
import type { SalesAnalysisMeta, SalesSourceRow } from '@/lib/sales-analytics/types';

const meta: SalesAnalysisMeta = {
  name: 'Q1 Sales',
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31',
  currency: 'GHS',
  periodType: 'partial_year',
  fileName: 'q1.xlsx',
};

const rows: SalesSourceRow[] = [
  { rowNumber: 2, name: 'Paracetamol 500mg Tablets', quantity: 10, value: 20 },
  { rowNumber: 3, name: 'PARACETAMOL 500 MG TABLETS', quantity: 5, value: 10 },
  { rowNumber: 4, name: 'Ibuprofen 200mg Tablets', quantity: 3, value: 9 },
  { rowNumber: 5, name: 'Ibuprofen 400mg Tablets', quantity: 1, value: 5 },
  { rowNumber: 6, name: 'Salbutamol Inhaler 100mcg Evoh', quantity: 1, value: 30 },
  { rowNumber: 7, name: 'Salbutamol Inhaler 100mcg Evohaler 200 dose', quantity: 2, value: 60 },
];

describe('consolidated Excel workbook (acceptance 11)', () => {
  it('has the five sheets, frozen headers, filters and colours, and reconciles', async () => {
    const r = consolidateRows(rows, { hasValue: true });
    const input = {
      meta,
      hasValue: true,
      sourceRows: rows,
      plan: r.plan,
      decisions: [],
      result: r,
      rules: [],
      issues: [{ rowNumber: 9, name: '', problem: 'No product name', excluded: true }],
    };
    const wb = await buildConsolidatedWorkbook(input);
    assert.deepEqual(
      wb.worksheets.map((w) => w.name),
      [...CONSOLIDATED_SHEETS]
    );
    const products = wb.getWorksheet('Consolidated Products')!;
    assert.equal(products.views[0].state, 'frozen');
    assert.ok(products.autoFilter);
    // Paracetamol group is green, pending Salbutamol match is yellow.
    const fills = new Map<string, string>();
    products.eachRow((row, n) => {
      if (n === 1) return;
      const fill = row.fill as { fgColor?: { argb?: string } } | undefined;
      fills.set(String(row.getCell(1).value), fill?.fgColor?.argb ?? '');
    });
    assert.equal(fills.get('Paracetamol 500mg Tablets'), 'FFD9F2DC');
    assert.equal(fills.get('Salbutamol Inhaler 100mcg Evoh'), 'FFFFF4C2');
    assert.equal(fills.get('Ibuprofen 200mg Tablets'), 'FFDCEBFA');

    const bytes = await consolidatedWorkbookBytes(input);
    const back = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    assert.deepEqual(back.SheetNames, [...CONSOLIDATED_SHEETS]);
    const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(back.Sheets['Consolidated Products']);
    const qty = sheet.reduce((s, x) => s + Number(x['Total quantity']), 0);
    const amount = sheet.reduce((s, x) => s + Number(x['Total amount (GHS)']), 0);
    assert.equal(qty, 22);
    assert.equal(amount, 134);
    const dup = XLSX.utils.sheet_to_json(back.Sheets['Duplicate Groups']);
    assert.equal(dup.length, 2);
  });
});
