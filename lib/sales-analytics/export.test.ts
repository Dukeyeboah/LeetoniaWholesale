import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import {
  analysisTableRows,
  buildAnalysisCsv,
  buildAnalysisWorkbook,
  csvSafeCell,
} from '@/lib/sales-analytics/export';
import type { SalesAnalysisMeta } from '@/lib/sales-analytics/types';

const meta: SalesAnalysisMeta = {
  name: '2025 Sales',
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  currency: 'GHS',
  periodType: 'full_year',
  fileName: 'sales.xlsx',
};

describe('analysed data download', () => {
  it('only includes columns supported by the file', () => {
    const noValue = analyzeSales([{ name: 'A', quantity: 2 }], { hasValue: false, hasCode: false });
    const header = analysisTableRows(noValue, 'GHS')[0];
    assert.ok(!header.some((h) => String(h).includes('Sales value')));
    assert.ok(!header.some((h) => String(h).includes('SKU')));

    const full = analyzeSales([{ name: 'A', quantity: 2, value: 10, code: 'X1' }], {
      hasValue: true,
      hasCode: true,
    });
    const fullHeader = analysisTableRows(full, 'GHS')[0];
    assert.ok(fullHeader.includes('Product code / SKU'));
    assert.ok(fullHeader.includes('Sales value (GHS)'));
    assert.ok(fullHeader.includes('Overall product group'));
  });

  it('builds a CSV with one line per product', () => {
    const r = analyzeSales(
      [
        { name: 'Cough syrup, 100ml', quantity: 5, value: 25 },
        { name: 'ORS', quantity: 3, value: 6 },
      ],
      { hasValue: true, hasCode: false }
    );
    const lines = buildAnalysisCsv(r, 'GHS').split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[1].includes('"Cough syrup, 100ml"'));
  });

  it('guards against spreadsheet formula injection in CSV', () => {
    assert.equal(csvSafeCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvSafeCell('+cmd'), "'+cmd");
    assert.equal(csvSafeCell(-5), '-5');
  });

  it('builds an Excel workbook that can be read back', () => {
    const r = analyzeSales([{ name: 'A', quantity: 2, value: 10 }], {
      hasValue: true,
      hasCode: false,
    });
    const wb = buildAnalysisWorkbook(r, meta, [
      { kind: 'duplicate_names', message: 'dup', count: 1 },
    ]);
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const back = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    assert.deepEqual(back.SheetNames, ['Products', 'Summary', 'Data warnings']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(back.Sheets.Products, { header: 1 });
    assert.equal(rows.length, 2);
  });
});
