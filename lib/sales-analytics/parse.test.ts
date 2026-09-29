import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildSalesRows,
  parseDateCell,
  parseNumericCell,
  readSalesSpreadsheet,
  SalesFileError,
  suggestColumnMapping,
  UNMAPPED,
  validateColumnMapping,
} from '@/lib/sales-analytics/parse';

function xlsxBytes(aoa: unknown[][], bookType: 'xlsx' | 'xls' = 'xlsx'): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sales');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('readSalesSpreadsheet', () => {
  it('reads an .xlsx file with a title row above the header', () => {
    const wb = readSalesSpreadsheet(
      xlsxBytes([
        ['Leetonia sales report 2025'],
        ['Product Name', 'Qty Sold', 'Sales Value'],
        ['Paracetamol', 120, 600],
        ['Amoxicillin', 40, 800],
      ]),
      'sales.xlsx'
    );
    assert.equal(wb.kind, 'excel');
    assert.deepEqual(wb.sheets[0].headers, ['Product Name', 'Qty Sold', 'Sales Value']);
    assert.equal(wb.sheets[0].rows.length, 2);
    assert.equal(wb.sheets[0].headerRowNumber, 2);
  });

  it('reads a legacy .xls file', () => {
    const wb = readSalesSpreadsheet(
      xlsxBytes(
        [
          ['Item', 'Quantity'],
          ['Vitamin C', 5],
        ],
        'xls'
      ),
      'old.xls'
    );
    assert.equal(wb.sheets[0].rows.length, 1);
  });

  it('reads a UTF-8 CSV with a BOM, quoted commas and currency symbols', () => {
    const csv = '\uFEFFProduct,Quantity,Amount (GH₵)\n"Cough syrup, 100ml",10,"GH₵ 1,250.50"\nORS,3,15\n';
    const wb = readSalesSpreadsheet(utf8(csv), 'sales.csv');
    assert.equal(wb.kind, 'csv');
    assert.deepEqual(wb.sheets[0].headers, ['Product', 'Quantity', 'Amount (GH₵)']);
    assert.equal(wb.sheets[0].rows[0][0], 'Cough syrup, 100ml');
  });

  it('rejects unsupported, empty, and corrupt files', () => {
    assert.throws(() => readSalesSpreadsheet(utf8('x'), 'report.pdf'), SalesFileError);
    assert.throws(() => readSalesSpreadsheet(new Uint8Array(), 'a.csv'), /empty/);
    assert.throws(
      () => readSalesSpreadsheet(utf8('not really a spreadsheet'), 'fake.xlsx'),
      /valid Excel/
    );
    assert.throws(() => readSalesSpreadsheet(utf8('hello'), 'fake.xls'), /valid Excel/);
  });

  it('rejects files with only a header row', () => {
    assert.throws(
      () => readSalesSpreadsheet(utf8('Product,Quantity\n'), 'empty.csv'),
      /No product rows/
    );
  });
});

describe('parseNumericCell', () => {
  it('handles numbers, formatted text, blanks and junk', () => {
    assert.deepEqual(parseNumericCell(12), { value: 12, wasText: false, blank: false });
    assert.deepEqual(parseNumericCell(' 1,200 '), { value: 1200, wasText: true, blank: false });
    assert.equal(parseNumericCell('GH₵ 50.25').value, 50.25);
    assert.equal(parseNumericCell('GHS1,000').value, 1000);
    assert.equal(parseNumericCell('(30)').value, -30);
    assert.equal(parseNumericCell('').blank, true);
    assert.equal(parseNumericCell(null).blank, true);
    assert.equal(parseNumericCell('ten').value, null);
    assert.equal(parseNumericCell(true).value, null);
  });
});

describe('parseDateCell', () => {
  it('reads Excel serials, ISO, day-first and month-year dates', () => {
    assert.equal(parseDateCell(46387).iso, '2026-12-31');
    assert.equal(parseDateCell('2026-06-15').iso, '2026-06-15');
    assert.equal(parseDateCell('05/06/2026').iso, '2026-06-05');
    assert.equal(parseDateCell('12/25/2026').iso, '2026-12-25');
    assert.equal(parseDateCell('02/2027').iso, '2027-02-28');
    assert.equal(parseDateCell('Mar 2027').iso, '2027-03-31');
    assert.equal(parseDateCell('15-Jan-27').iso, '2027-01-15');
    assert.equal(parseDateCell('31/02/2026').iso, null);
    assert.equal(parseDateCell('').blank, true);
    assert.equal(parseDateCell('later').iso, null);
  });
});

describe('suggestColumnMapping', () => {
  it('maps common header names', () => {
    const m = suggestColumnMapping(['Item Code', 'Product Name', 'Qty Sold', 'Total Sales']);
    assert.deepEqual(m, {
      code: 0,
      name: 1,
      quantity: 2,
      value: 3,
      expiry: UNMAPPED,
      batch: UNMAPPED,
      unitPrice: UNMAPPED,
    });
  });

  it('maps "Unit Price" to unit price, not the sales value or quantity', () => {
    const m = suggestColumnMapping(['Description', 'Unit Price', 'Units', 'Amount']);
    assert.equal(m.name, 0);
    assert.equal(m.unitPrice, 1);
    assert.equal(m.quantity, 2);
    assert.equal(m.value, 3);
  });

  it('maps expiry and stock list headers', () => {
    const m = suggestColumnMapping(['Item Description', 'Batch No', 'Expiry Date', 'Qty on Hand', 'Price']);
    assert.equal(m.name, 0);
    assert.equal(m.batch, 1);
    assert.equal(m.expiry, 2);
    assert.equal(m.quantity, 3);
    assert.equal(m.unitPrice, 4);
  });

  it('falls back to the data when headers are unhelpful', () => {
    const m = suggestColumnMapping(
      ['Column 1', 'Column 2'],
      [
        ['Paracetamol', 10],
        ['Ibuprofen', 4],
      ]
    );
    assert.equal(m.name, 0);
    assert.equal(m.quantity, 1);
    assert.equal(m.value, UNMAPPED);
  });

  it('validates required and duplicate columns', () => {
    assert.match(
      validateColumnMapping({ name: UNMAPPED, quantity: 1, value: -1, code: -1 }, 3)!,
      /product name/
    );
    assert.match(
      validateColumnMapping({ name: 0, quantity: UNMAPPED, value: -1, code: -1 }, 3)!,
      /quantity/
    );
    assert.match(validateColumnMapping({ name: 0, quantity: 0, value: -1, code: -1 }, 3)!, /once/);
    assert.equal(validateColumnMapping({ name: 0, quantity: 1, value: 2, code: -1 }, 3), null);
  });

  it('requires an expiry column (not quantity) for expiry lists', () => {
    const m = { name: 0, quantity: UNMAPPED, value: -1, code: -1 };
    assert.match(validateColumnMapping(m, 3, 'expiry')!, /expiry/);
    assert.equal(validateColumnMapping({ ...m, expiry: 1 }, 3, 'expiry'), null);
    assert.match(validateColumnMapping(m, 3, 'stock')!, /stock quantity/);
  });
});

describe('buildSalesRows', () => {
  const sheet = (rows: unknown[][]) => ({
    name: 'Sales',
    headers: ['Name', 'Qty', 'Value'],
    rows,
    headerRowNumber: 1,
  });
  const mapping = { name: 0, quantity: 1, value: 2, code: UNMAPPED };

  it('builds clean rows and totals that match the file', () => {
    const r = buildSalesRows(
      sheet([
        ['A', 10, 100],
        ['B', 5, 50.5],
      ]),
      mapping
    );
    assert.equal(r.rows.length, 2);
    assert.equal(r.reconciliation.analyzedQuantityTotal, 15);
    assert.equal(r.reconciliation.analyzedValueTotal, 150.5);
    assert.equal(r.warnings.length, 0);
  });

  it('works without a value column', () => {
    const r = buildSalesRows(sheet([['A', 3, null]]), { ...mapping, value: UNMAPPED });
    assert.equal(r.hasValue, false);
    assert.equal(r.rows[0].value, undefined);
  });

  it('warns about blank names, invalid and negative numbers', () => {
    const r = buildSalesRows(
      sheet([
        ['', 4, 10],
        ['Bad qty', 'lots', 10],
        ['Returned', -2, 10],
        ['Bad value', 3, 'n/a'],
        ['No value', 3, null],
        ['Good', 7, 70],
      ]),
      mapping
    );
    const kinds = r.warnings.map((w) => w.kind);
    for (const k of [
      'blank_names',
      'invalid_quantity',
      'negative_quantity',
      'invalid_value',
      'missing_value',
      'total_mismatch',
    ]) {
      assert.ok(kinds.includes(k as never), `expected ${k} warning`);
    }
    assert.deepEqual(
      r.rows.map((x) => x.name),
      ['Bad value', 'No value', 'Good']
    );
    assert.equal(r.reconciliation.excludedRowCount, 3);
  });

  it('flags numbers stored as text only for Excel files', () => {
    const rows = [['A', '1,000', '2,000']];
    assert.ok(
      buildSalesRows(sheet(rows), mapping, { flagTextNumbers: true }).warnings.some(
        (w) => w.kind === 'text_numbers'
      )
    );
    assert.ok(!buildSalesRows(sheet(rows), mapping).warnings.some((w) => w.kind === 'text_numbers'));
  });

  it('keeps every source row (consolidation combines them later) with row numbers', () => {
    const r = buildSalesRows(
      sheet([
        ['Paracetamol 500mg', 10, 10],
        ['paracetamol  500MG', 5, 5],
        ['Other', 1, 1],
      ]),
      mapping
    );
    assert.equal(r.rows.length, 3);
    assert.deepEqual(
      r.rows.map((x) => x.rowNumber),
      [2, 3, 4]
    );
    assert.ok(!r.warnings.some((w) => w.kind === 'duplicate_names'));
  });

  it('records row-level issues for the Data Issues sheet', () => {
    const r = buildSalesRows(sheet([['', 1, 1], ['Bad', 'x', 1], ['Ok', 1, 1]]), mapping);
    assert.equal(r.issues.length, 2);
    assert.ok(r.issues.every((i) => i.excluded));
  });

  it('flags quantity × unit price that does not match the amount', () => {
    const r = buildSalesRows(
      { name: 'S', headers: ['Name', 'Qty', 'Value', 'Price'], rows: [['A', 2, 10, 5], ['B', 2, 30, 5]], headerRowNumber: 1 },
      { ...mapping, unitPrice: 3 }
    );
    const w = r.warnings.find((x) => x.kind === 'inconsistent_price');
    assert.equal(w?.count, 1);
    assert.equal(r.rows.length, 2);
  });

  it('builds expiry rows and drops rows without a readable date', () => {
    const r = buildSalesRows(
      {
        name: 'E',
        headers: ['Item', 'Batch', 'Expiry', 'Qty'],
        rows: [
          ['Amoxil 250mg', 'B1', '31/12/2026', 10],
          ['Amoxil 250mg', 'B2', 46387, 5],
          ['Zinc', 'Z1', 'soon', 3],
          ['ORS', '', '03/2027', null],
        ],
        headerRowNumber: 1,
      },
      { name: 0, batch: 1, expiry: 2, quantity: 3, value: UNMAPPED, code: UNMAPPED },
      { kind: 'expiry' }
    );
    assert.equal(r.rows.length, 3);
    assert.equal(r.rows[0].expiry, '2026-12-31');
    assert.equal(r.rows[1].expiry, '2026-12-31');
    assert.equal(r.rows[2].expiry, '2027-03-31');
    assert.equal(r.rows[2].quantity, 0);
    assert.ok(r.warnings.some((w) => w.kind === 'invalid_expiry'));
    assert.ok(r.warnings.some((w) => w.kind === 'missing_quantity'));
  });

  it('treats a blank stock quantity as 0 for stock lists', () => {
    const r = buildSalesRows(sheet([['A', null, null]]), { ...mapping, value: UNMAPPED }, { kind: 'stock' });
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].quantity, 0);
  });

  it('uses a Total row to check totals and does not count it as a product', () => {
    const ok = buildSalesRows(
      sheet([
        ['A', 10, 100],
        ['B', 5, 50],
        ['TOTAL', 15, 150],
      ]),
      mapping
    );
    assert.equal(ok.rows.length, 2);
    assert.equal(ok.reconciliation.statedQuantityTotal, 15);
    assert.ok(!ok.warnings.some((w) => w.kind === 'total_mismatch'));

    const bad = buildSalesRows(
      sheet([
        ['A', 10, 100],
        ['Grand Total', 99, 150],
      ]),
      mapping
    );
    assert.ok(bad.warnings.some((w) => w.kind === 'total_mismatch'));
  });
});
