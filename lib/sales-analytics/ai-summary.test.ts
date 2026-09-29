import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import {
  buildSalesAiPayload,
  buildSalesAiPrompt,
  parseAiSummaryResponse,
  salesAiPayloadSchema,
} from '@/lib/sales-analytics/ai-summary';
import { estimateAiCostUsd, getSalesAiProvider } from '@/lib/sales-analytics/ai-provider';
import type { SalesAnalysisMeta } from '@/lib/sales-analytics/types';

const meta: SalesAnalysisMeta = {
  name: 'Test',
  periodStart: '2025-01-01',
  periodEnd: '2025-06-30',
  currency: 'GHS',
  periodType: 'partial_year',
  fileName: 'x.csv',
};

const validSummary = {
  overallPicture: 'Sales are concentrated in a few products.',
  strongPerformers: 'Paracetamol leads.',
  slowSellers: 'Many products sold very little.',
  quantityVsValue: 'Some low-volume items bring high value.',
  toReview: 'Review the lower quantity / lower value group at stocktake.',
  nextActions: ['Check stock of top sellers', 'Review slow sellers', 'Compare supplier prices'],
  limitations: 'Only six months of data.',
};

describe('AI payload', () => {
  it('is compact, valid, and never contains every row', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      name: `Product ${i}`,
      quantity: i,
      value: i * 3,
    }));
    const r = analyzeSales(rows, { hasValue: true, hasCode: false });
    const payload = buildSalesAiPayload(meta, r, [], 10);
    assert.ok(salesAiPayloadSchema.safeParse(payload).success);
    assert.equal(payload.top10.length, 10);
    assert.equal(payload.bottom10.length, 10);
    assert.equal(payload.slowSellers.count, 10);
    assert.ok(payload.groupCounts);
    assert.ok(JSON.stringify(payload).length < 6000);
    const { system } = buildSalesAiPrompt(payload);
    assert.match(system, /Never tell the pharmacy to discontinue/);
  });
});

describe('AI response validation', () => {
  it('accepts a valid JSON reply, including one inside a code fence', () => {
    assert.equal(parseAiSummaryResponse(JSON.stringify(validSummary)).ok, true);
    assert.equal(
      parseAiSummaryResponse('```json\n' + JSON.stringify(validSummary) + '\n```').ok,
      true
    );
  });

  it('rejects non-JSON, missing sections, and wrong action counts', () => {
    assert.equal(parseAiSummaryResponse('Here is your summary!').ok, false);
    const { limitations: _l, ...missing } = validSummary;
    assert.equal(parseAiSummaryResponse(JSON.stringify(missing)).ok, false);
    assert.equal(
      parseAiSummaryResponse(JSON.stringify({ ...validSummary, nextActions: ['one'] })).ok,
      false
    );
    assert.equal(
      parseAiSummaryResponse(
        JSON.stringify({ ...validSummary, nextActions: ['1', '2', '3', '4', '5', '6'] })
      ).ok,
      false
    );
  });
});

describe('AI provider config', () => {
  it('returns null without an API key and picks the model from env', () => {
    assert.equal(getSalesAiProvider({}), null);
    const p = getSalesAiProvider({ SALES_AI_API_KEY: 'k', SALES_AI_MODEL: 'gpt-4.1-mini' });
    assert.equal(p?.model, 'gpt-4.1-mini');
    assert.equal(getSalesAiProvider({ SALES_AI_API_KEY: 'k', SALES_AI_PROVIDER: 'unknown' }), null);
  });

  it('estimates cost from token usage', () => {
    const cost = estimateAiCostUsd('gpt-4o-mini', { inputTokens: 1_000_000, outputTokens: 0 }, {});
    assert.equal(cost, 0.15);
    assert.equal(estimateAiCostUsd('mystery', { inputTokens: 1, outputTokens: 1 }, {}), null);
  });
});
