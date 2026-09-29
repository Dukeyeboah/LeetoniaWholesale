import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSales,
  median,
  niceNumber,
  quantityDistribution,
  rankProducts,
  slowSellers,
  topShareThreshold,
  valueDistribution,
} from '@/lib/sales-analytics/analyze';
import type { SalesProductRow } from '@/lib/sales-analytics/types';

/** 10 products: P1 sells 100 … P10 sells 10; value = qty × unit price. */
function catalog(): SalesProductRow[] {
  return Array.from({ length: 10 }, (_, i) => {
    const qty = (10 - i) * 10;
    const unit = i === 9 ? 50 : 2; // P10: low qty but expensive
    return { name: `P${i + 1}`, quantity: qty, value: qty * unit };
  });
}

describe('summary stats', () => {
  it('computes totals, average and median', () => {
    const r = analyzeSales(catalog(), { hasValue: true, hasCode: false });
    assert.equal(r.stats.totalProducts, 10);
    assert.equal(r.stats.totalQuantity, 550);
    assert.equal(r.stats.averageQuantity, 55);
    assert.equal(r.stats.medianQuantity, 55);
    // 2 × (100+90+…+20) + 50 × 10 = 2 × 540 + 500
    assert.equal(r.stats.totalValue, 1580);
    assert.equal(r.stats.averageValue, 158);
  });

  it('omits value stats when there is no value column', () => {
    const rows = catalog().map(({ value: _v, ...rest }) => rest);
    const r = analyzeSales(rows, { hasValue: false, hasCode: false });
    assert.equal(r.stats.totalValue, undefined);
    assert.equal(r.groupCounts, undefined);
    assert.equal(r.concentration, undefined);
    assert.equal(r.products[0].rankByValue, undefined);
  });

  it('median handles even/odd/empty', () => {
    assert.equal(median([]), 0);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });
});

describe('rankings', () => {
  const r = analyzeSales(catalog(), { hasValue: true, hasCode: false });

  it('ranks top and bottom by quantity', () => {
    assert.deepEqual(
      rankProducts(r.products, 'quantity', 'top', 3).map((p) => p.name),
      ['P1', 'P2', 'P3']
    );
    assert.deepEqual(
      rankProducts(r.products, 'quantity', 'bottom', 2).map((p) => p.name),
      ['P10', 'P9']
    );
  });

  it('ranks by sales value and by average value per unit', () => {
    assert.equal(rankProducts(r.products, 'value', 'top', 1)[0].name, 'P10');
    assert.equal(rankProducts(r.products, 'unitValue', 'top', 1)[0].name, 'P10');
    assert.equal(r.products.find((p) => p.name === 'P10')!.unitValue, 50);
  });

  it('breaks ties by name so ranks are stable', () => {
    const t = analyzeSales(
      [
        { name: 'Zinc', quantity: 5 },
        { name: 'Aspirin', quantity: 5 },
      ],
      { hasValue: false, hasCode: false }
    );
    assert.deepEqual(
      t.products.map((p) => [p.name, p.rankByQuantity]),
      [
        ['Aspirin', 1],
        ['Zinc', 2],
      ]
    );
  });

  it('never returns more than available and handles n larger than list', () => {
    assert.equal(rankProducts(r.products, 'quantity', 'top', 50).length, 10);
  });

  it('computes shares of total', () => {
    const p1 = r.products.find((p) => p.name === 'P1')!;
    assert.equal(p1.quantityShare, 100 / 550);
    assert.equal(p1.valueShare, 200 / 1580);
  });
});

describe('slow sellers', () => {
  it('counts products under the threshold', () => {
    const r = analyzeSales(catalog(), { hasValue: true, hasCode: false });
    const s = slowSellers(r, 25);
    assert.deepEqual(
      s.products.map((p) => p.name),
      ['P10', 'P9']
    );
    assert.equal(s.count, 2);
    assert.equal(s.catalogShare, 0.2);
    assert.equal(s.totalQuantity, 30);
    assert.equal(s.totalValue, 500 + 40);
    assert.equal(slowSellers(r, 10).count, 0); // strictly "fewer than"
  });
});

describe('distribution', () => {
  it('places quantities into the fixed ranges', () => {
    const d = quantityDistribution([0, 5, 6, 10, 11, 25, 26, 50, 51, 100, 101]);
    assert.deepEqual(
      d.map((b) => b.count),
      [2, 2, 2, 2, 2, 1]
    );
  });

  it('builds friendly value ranges that cover every product', () => {
    const values = [0, 3, 12, 40, 90, 150, 480, 900, 2500, 10000];
    const d = valueDistribution(values);
    assert.equal(
      d.reduce((s, b) => s + b.count, 0),
      values.length
    );
    assert.match(d[0].label, /^Up to/);
    assert.match(d[d.length - 1].label, /^More than/);
  });

  it('niceNumber rounds up to 1/2/5 steps', () => {
    assert.equal(niceNumber(3), 5);
    assert.equal(niceNumber(120), 200);
    assert.equal(niceNumber(1000), 1000);
  });
});

describe('quantity / value groups', () => {
  it('uses the top 20% for "high"', () => {
    assert.equal(topShareThreshold([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9);
    const r = analyzeSales(catalog(), { hasValue: true, hasCode: false });
    const g = (name: string) => r.products.find((p) => p.name === name)!.group;
    // qty high: P1, P2 (≥90). value high: P10 (500), P1 (200).
    assert.equal(g('P1'), 'high_qty_high_value');
    assert.equal(g('P2'), 'high_qty_low_value');
    assert.equal(g('P10'), 'low_qty_high_value');
    assert.equal(g('P5'), 'low_qty_low_value');
    assert.deepEqual(r.groupCounts, {
      high_qty_high_value: 1,
      high_qty_low_value: 1,
      low_qty_high_value: 1,
      low_qty_low_value: 7,
    });
  });

  it('never marks zero-sellers as high', () => {
    const r = analyzeSales(
      [
        { name: 'A', quantity: 0, value: 0 },
        { name: 'B', quantity: 0, value: 0 },
      ],
      { hasValue: true, hasCode: false }
    );
    assert.ok(r.products.every((p) => p.group === 'low_qty_low_value'));
  });
});

describe('revenue concentration', () => {
  it('counts products needed for 50/80/95% of sales value', () => {
    const rows: SalesProductRow[] = [
      { name: 'A', quantity: 1, value: 50 },
      { name: 'B', quantity: 1, value: 30 },
      { name: 'C', quantity: 1, value: 15 },
      { name: 'D', quantity: 1, value: 5 },
    ];
    const r = analyzeSales(rows, { hasValue: true, hasCode: false });
    assert.equal(r.concentration!.productsFor50, 1);
    assert.equal(r.concentration!.productsFor80, 2);
    assert.equal(r.concentration!.productsFor95, 3);
    const tier = (n: string) => r.products.find((p) => p.name === n)!.concentrationTier;
    assert.equal(tier('A'), 'top50');
    assert.equal(tier('B'), 'next30');
    assert.equal(tier('C'), 'next15');
    assert.equal(tier('D'), 'rest');
    const last = r.concentration!.curve[r.concentration!.curve.length - 1];
    assert.equal(Math.round(last.cumulativePct), 100);
  });

  it('is skipped when total sales value is zero', () => {
    const r = analyzeSales([{ name: 'A', quantity: 3, value: 0 }], {
      hasValue: true,
      hasCode: false,
    });
    assert.equal(r.concentration, undefined);
  });
});
