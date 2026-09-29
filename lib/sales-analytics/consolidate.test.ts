import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConsolidation,
  consolidateRows,
  mappingRulesForDecision,
  planConsolidation,
} from '@/lib/sales-analytics/consolidate';
import {
  attributeConflicts,
  extractAttributes,
  normalizeCode,
  normalizeForMatch,
} from '@/lib/sales-analytics/normalize';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import type { SalesSourceRow } from '@/lib/sales-analytics/types';

let rowNo = 1;
function row(name: string, quantity: number, value?: number, code?: string): SalesSourceRow {
  rowNo += 1;
  return {
    rowNumber: rowNo,
    name,
    quantity,
    ...(value !== undefined ? { value } : {}),
    ...(code ? { code } : {}),
  };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('normalizeForMatch', () => {
  it('standardises case, spaces, punctuation and quotes but keeps numbers', () => {
    const a = normalizeForMatch('  Paracetamol   500 MG  Tab. ');
    const b = normalizeForMatch('paracetamol 500mg tab');
    assert.equal(a, b);
    assert.equal(normalizeForMatch('Children’s  Cough ( 100 ml )'), normalizeForMatch("childrens cough (100ml)"));
    assert.equal(normalizeForMatch('Amox / Clav 625 mg'), 'amox/clav 625mg');
    assert.equal(normalizeForMatch('Co – trimoxazole'), 'co-trimoxazole');
    assert.notEqual(normalizeForMatch('Paracetamol 500mg'), normalizeForMatch('Paracetamol 1g'));
    assert.equal(normalizeForMatch('Vit C 0,5 g'), 'vit c 0.5g');
    assert.equal(normalizeForMatch('Drug 5.0mg'), 'drug 5mg');
  });

  it('normalises product codes', () => {
    assert.equal(normalizeCode(' ab-12 3 '), 'AB123');
  });

  it('extracts strength, pack, form, population and release', () => {
    const a = extractAttributes(normalizeForMatch('Nifedipine 20mg SR Tablets x30'));
    assert.deepEqual(a.measures, ['20mg']);
    assert.equal(a.pack, '30');
    assert.equal(a.form, 'tablet');
    assert.equal(a.release, 'extended');
    assert.equal(a.base, 'nifedipine');
    const c = extractAttributes(normalizeForMatch('Paracetamol Paediatric Syrup 120mg/5ml 100ml'));
    assert.equal(c.population, 'child');
    assert.deepEqual(c.measures, ['100ml', '120mg/5ml']);
    assert.ok(attributeConflicts(extractAttributes('ibuprofen 200mg'), extractAttributes('ibuprofen 400mg')).length);
  });
});

describe('consolidation acceptance', () => {
  it('1 + 2 + 12: exact duplicates consolidate and totals reconcile exactly', () => {
    const rows = [
      row('Paracetamol 500mg Tablets', 10, 25.5),
      row('PARACETAMOL  500 mg tablets', 5, 12.75),
      row('paracetamol 500mg tablets.', 1, 2.55),
      row('Amoxicillin 250mg Capsules', 4, 40),
    ];
    const r = consolidateRows(rows, { hasValue: true });
    assert.equal(r.products.length, 2);
    const para = r.products.find((p) => p.name.startsWith('Paracetamol'))!;
    assert.equal(para.quantity, 16);
    assert.ok(Math.abs(para.value! - 40.8) < 1e-9);
    assert.equal(para.rowCount, 3);
    assert.equal(para.matchMethod, 'name');
    assert.equal(para.sourceRows!.length, 3);
    assert.equal(r.summary.autoCombinedRows, 2);
    assert.equal(r.summary.sourceQuantity, r.summary.finalQuantity);
    assert.equal(r.summary.sourceValue, r.summary.finalValue);
    assert.equal(sum(r.products.map((p) => p.quantity)), sum(rows.map((x) => x.quantity)));
  });

  it('3: different strengths stay separate', () => {
    const r = consolidateRows(
      [row('Ibuprofen 200mg Tablets', 5), row('Ibuprofen 400mg Tablets', 7)],
      { hasValue: false }
    );
    assert.equal(r.products.length, 2);
    assert.equal(r.plan.possibleMatches.length, 0);
    assert.ok(r.plan.keptSeparate.some((k) => /strength/.test(k.reason)));
  });

  it('4: different pack sizes stay separate', () => {
    const r = consolidateRows(
      [row('Metformin 500mg Tablets x28', 3), row('Metformin 500mg Tablets x56', 2)],
      { hasValue: false }
    );
    assert.equal(r.products.length, 2);
    assert.ok(r.plan.keptSeparate.some((k) => /pack size/.test(k.reason)));
  });

  it('never auto-merges dosage form, adult/child or release differences', () => {
    const r = consolidateRows(
      [
        row('Paracetamol 120mg/5ml Syrup', 1),
        row('Paracetamol 120mg/5ml Suspension', 1),
        row('Cough Mixture Adult 100ml', 1),
        row('Cough Mixture Child 100ml', 1),
        row('Nifedipine 20mg SR', 1),
        row('Nifedipine 20mg IR', 1),
      ],
      { hasValue: false }
    );
    assert.equal(r.products.length, 6);
  });

  it('5: same-SKU rows merge despite name formatting', () => {
    const r = consolidateRows(
      [
        row('Paracetamol 500mg Tab', 10, 20, 'P-500'),
        row('Paracetamol 500mg Tablets x100', 5, 10, 'p500'),
      ],
      { hasValue: true }
    );
    assert.equal(r.products.length, 1);
    assert.equal(r.products[0].quantity, 15);
    assert.equal(r.products[0].matchMethod, 'code');
  });

  it('6: conflicting SKUs are flagged and never auto-combined', () => {
    const r = consolidateRows(
      [
        row('Ciprofloxacin 500mg Tablets', 3, undefined, 'C1'),
        row('Ciprofloxacin 500mg Tablets', 4, undefined, 'C2'),
        row('Omeprazole 20mg Capsules', 2, undefined, 'X9'),
        row('Omeprazole 40mg Capsules', 2, undefined, 'X9'),
      ],
      { hasValue: false }
    );
    assert.equal(r.products.length, 4);
    assert.ok(r.plan.keptSeparate.some((k) => /different product codes/.test(k.reason)));
    assert.ok(r.plan.possibleMatches.some((m) => m.kind === 'same_code_conflict'));
    assert.ok(r.plan.issues.length >= 2);
  });

  it('7: truncated names with several candidates go to review, one candidate is suggested', () => {
    const multi = planConsolidation([
      row('Amoxicillin/Clavulanic Acid 62', 2),
      row('Amoxicillin/Clavulanic Acid 625mg Tablets', 5),
      row('Amoxicillin/Clavulanic Acid 625mg Tablets x14', 3),
    ]);
    const m = multi.possibleMatches.find((p) => p.kind === 'truncated_multiple');
    assert.ok(m, 'expected a multi-candidate truncation match');
    assert.equal(m.needsChoice, true);
    assert.equal(m.entityKeys.length, 3);

    const singleRows = [
      row('Salbutamol Inhaler 100mcg Evoh', 1),
      row('Salbutamol Inhaler 100mcg Evohaler 200 dose', 4),
    ];
    const single = planConsolidation(singleRows);
    const s = single.possibleMatches.find((p) => p.kind === 'truncated');
    assert.ok(s);
    assert.equal(s.needsChoice, false);
    // Nothing merges until an admin approves.
    assert.equal(applyConsolidation(singleRows, single, [], { hasValue: false }).products.length, 2);
  });

  it('8 + 10: admin approval merges, pending matches stay separate in rankings', () => {
    const rows = [
      row('Salbutamol Inhaler 100mcg Evoh', 1, 10),
      row('Salbutamol Inhaler 100mcg Evohaler 200 dose', 4, 40),
      row('Zinc Tablets', 2, 2),
    ];
    const plan = planConsolidation(rows);
    const match = plan.possibleMatches[0];
    const before = applyConsolidation(rows, plan, [], { hasValue: true });
    assert.equal(before.products.length, 3);
    assert.equal(before.summary.pendingMatches, 1);

    const decision = {
      matchId: match.id,
      action: 'merge' as const,
      masterName: 'Salbutamol Evohaler 100mcg',
      decidedAt: 1000,
    };
    const after = applyConsolidation(rows, plan, [decision], { hasValue: true });
    assert.equal(after.products.length, 2);
    const merged = after.products.find((p) => p.name === 'Salbutamol Evohaler 100mcg')!;
    assert.equal(merged.quantity, 5);
    assert.equal(merged.value, 50);
    assert.equal(merged.matchMethod, 'admin');
    assert.equal(merged.decision, 'approved');
    assert.equal(merged.decidedAt, 1000);
    assert.equal(after.summary.pendingMatches, 0);

    const ranked = analyzeSales(after.products, { hasValue: true, hasCode: false });
    assert.equal(ranked.products[0].name, 'Salbutamol Evohaler 100mcg');
    assert.equal(ranked.stats.totalProducts, 2);

    const kept = applyConsolidation(
      rows,
      plan,
      [{ matchId: match.id, action: 'separate', decidedAt: 1 }],
      { hasValue: true }
    );
    assert.equal(kept.products.length, 3);
  });

  it('only merges the candidate the admin chose for multi-candidate matches', () => {
    const rows = [
      row('Amoxicillin/Clavulanic Acid 62', 2),
      row('Amoxicillin/Clavulanic Acid 625mg Tablets', 5),
      row('Amoxicillin/Clavulanic Acid 625mg Tablets x14', 3),
    ];
    const plan = planConsolidation(rows);
    const m = plan.possibleMatches.find((p) => p.kind === 'truncated_multiple')!;
    const target = m.entityKeys.find((k) => k.includes('x14'))!;
    const r = applyConsolidation(
      rows,
      plan,
      [{ matchId: m.id, action: 'merge', mergeKeys: [m.entityKeys[0], target], decidedAt: 1 }],
      { hasValue: false }
    );
    assert.equal(r.products.length, 2);
    assert.equal(sum(r.products.map((p) => p.quantity)), 10);
  });

  it('9: approved mappings apply automatically to later uploads', () => {
    const first = [row('Panadol Extra Tabs', 2), row('Panadol Extra Tablets 500mg/65mg', 3)];
    const plan = planConsolidation(first);
    const match = plan.possibleMatches.find((m) => m.entityKeys.length === 2);
    assert.ok(match, 'expected a possible match to approve');
    const decision = {
      matchId: match.id,
      action: 'merge' as const,
      masterName: 'Panadol Extra 500mg/65mg Tablets',
      decidedAt: 5,
    };
    const rules = mappingRulesForDecision(first, plan, decision, { now: 5, by: 'admin' });
    assert.equal(rules.length, 2);

    const later = [row('panadol extra tabs', 7), row('PANADOL EXTRA TABLETS 500mg/65mg', 1)];
    const r = consolidateRows(later, { hasValue: false, rules });
    assert.equal(r.products.length, 1);
    assert.equal(r.products[0].name, 'Panadol Extra 500mg/65mg Tablets');
    assert.equal(r.products[0].quantity, 8);
    assert.equal(r.products[0].matchMethod, 'mapping');
  });

  it('suggests spelling and wording differences without merging them', () => {
    const plan = planConsolidation([
      row('Metronidazole 400mg Tablets', 1),
      row('Metronidazol 400mg Tablets', 1),
      row('Vitamin C 1000mg Tablets', 1),
      row('Vitamin D 1000mg Tablets', 1),
      row('Tablets Folic Acid 5mg', 1),
      row('Folic Acid 5mg Tab', 1),
    ]);
    const kinds = plan.possibleMatches.map((m) => m.kind);
    assert.ok(kinds.includes('spelling'));
    assert.ok(kinds.includes('wording'));
    assert.ok(
      !plan.possibleMatches.some((m) => m.entityKeys.some((k) => k.includes('vitamin'))),
      'single-letter variants (Vitamin C vs D) must not be suggested'
    );
  });

  it('handles tens of thousands of rows quickly', () => {
    const rows: SalesSourceRow[] = [];
    for (let i = 0; i < 30000; i++) {
      rows.push(row(`Product ${i % 12000} ${(i % 7) * 50}mg Tablets`, 1, 1));
    }
    const t = Date.now();
    const r = consolidateRows(rows, { hasValue: true });
    assert.ok(Date.now() - t < 5000, `took ${Date.now() - t}ms`);
    assert.equal(r.summary.finalQuantity, 30000);
  });
});
