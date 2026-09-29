import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStockApplyPlan } from '@/lib/sales-analytics/stock-apply';
import type { Product } from '@/types';

function product(p: Partial<Product> & { id: string; name: string }): Product {
  return { category: 'X', price: 10, stock: 0, unit: 'unit', updatedAt: 0, ...p };
}

const inventory: Product[] = [
  product({ id: 'a', name: 'Paracetamol 500mg', stock: 10, wholesaleStock: 10 }),
  product({ id: 'b', name: 'Ibuprofen 200mg', stock: 4, wholesaleStock: 4, reservedQty: 6 }),
  product({ id: 'c', name: 'Old Syrup', stock: 3, wholesaleStock: 3 }),
  product({ id: 'd', name: 'Hidden Empty', stock: 0, wholesaleStock: 0, isHidden: true }),
  product({ id: 'w_1', name: 'Store Only', stock: 0, storeroomStock: 50, isHidden: true, code: 'S-1' }),
];

describe('stock list → inventory plan', () => {
  it('updates quantities, hides missing items and adds new ones (wholesale)', () => {
    const plan = buildStockApplyPlan(
      inventory,
      [
        { name: 'PARACETAMOL  500MG', quantity: 25 },
        { name: 'Ibuprofen 200mg', quantity: 4 },
        { name: 'Brand New Cream', quantity: 7, unitPrice: 12 },
      ],
      'wholesale',
      { hideMissing: true, addNew: true, updatePrices: false }
    );
    assert.deepEqual(
      plan.updates.map((u) => [u.productId, u.currentQty, u.newQty]),
      [['a', 10, 25]]
    );
    assert.equal(plan.unchanged, 1);
    assert.deepEqual(plan.missing.map((m) => m.productId), ['c']);
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].productId, 'sf_brand_new_cream');
    assert.equal(plan.creates[0].price, 12);
  });

  it('flags reservations larger than the new count', () => {
    const plan = buildStockApplyPlan(inventory, [{ name: 'Ibuprofen 200mg', quantity: 2 }], 'wholesale', {
      hideMissing: false,
      addNew: false,
      updatePrices: false,
    });
    assert.equal(plan.updates[0].reservedOverCount, true);
    assert.equal(plan.missing.length, 0);
  });

  it('matches warehouse items by code and zeroes missing storeroom stock', () => {
    const plan = buildStockApplyPlan(
      inventory,
      [{ name: 'Different label', code: 'S-1', quantity: 40 }],
      'warehouse',
      { hideMissing: true, addNew: true, updatePrices: false }
    );
    assert.equal(plan.updates[0].productId, 'w_1');
    assert.equal(plan.updates[0].match, 'code');
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.creates.length, 0);
  });
});
