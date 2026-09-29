import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateRows } from '@/lib/sales-analytics/consolidate';
import { expiringInRange } from '@/lib/sales-analytics/expiry';
import type { SalesSourceRow } from '@/lib/sales-analytics/types';

const rows: SalesSourceRow[] = [
  { rowNumber: 2, name: 'Amoxil 250mg Caps', quantity: 10, expiry: '2026-10-31', batch: 'A1', unitPrice: 2 },
  { rowNumber: 3, name: 'AMOXIL 250 MG CAPS', quantity: 5, expiry: '2027-03-31', batch: 'A2', unitPrice: 2 },
  { rowNumber: 4, name: 'Zinc Tablets', quantity: 7, expiry: '2026-12-15', batch: 'Z1' },
  { rowNumber: 5, name: 'ORS Sachets', quantity: 3, expiry: '2026-08-01', batch: 'O1' },
];

describe('expiry list', () => {
  it('lists batches expiring in the range per consolidated product', () => {
    const { products } = consolidateRows(rows, { hasValue: false });
    assert.equal(products.length, 3);
    const r = expiringInRange(products, rows, '2026-09-28', '2026-12-31');
    assert.deepEqual(
      r.items.map((i) => [i.name, i.quantity, i.earliest]),
      [
        ['Amoxil 250mg Caps', 10, '2026-10-31'],
        ['Zinc Tablets', 7, '2026-12-15'],
      ]
    );
    assert.equal(r.totalQuantity, 17);
    assert.equal(r.totalValue, 20);
    assert.equal(r.expiredProducts, 1);
    assert.equal(r.expiredQuantity, 3);
    assert.deepEqual(r.byMonth.map((m) => m.month), ['2026-10', '2026-12']);
  });
});
