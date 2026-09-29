import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import { buildSalesAiPayload } from '@/lib/sales-analytics/ai-summary';
import type { SalesAiProvider } from '@/lib/sales-analytics/ai-provider';
import { isAuthorizedAdminRole } from '@/lib/server/admin-auth';
import {
  handleSalesSummaryRequest,
  type SalesSummaryDeps,
} from '@/lib/server/sales-summary-handler';

const goodReply = JSON.stringify({
  overallPicture: 'a',
  strongPerformers: 'b',
  slowSellers: 'c',
  quantityVsValue: 'd',
  toReview: 'e',
  nextActions: ['1', '2', '3'],
  limitations: 'f',
});

function fakeProvider(text = goodReply) {
  const calls: unknown[] = [];
  const provider: SalesAiProvider = {
    name: 'fake',
    model: 'fake-model',
    async complete(req) {
      calls.push(req);
      return { text, usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
  return { provider, calls };
}

const roles: Record<string, string> = { 'tok-admin': 'admin', 'tok-super': 'super_admin', 'tok-client': 'client', 'tok-staff': 'staff' };

function deps(provider: SalesAiProvider | null): SalesSummaryDeps {
  return {
    verifyIdToken: async (t) => {
      if (!(t in roles)) throw new Error('bad token');
      return { uid: t };
    },
    getUserRole: async (uid) => roles[uid] ?? null,
    provider,
    log: () => {},
  };
}

const payload = buildSalesAiPayload(
  {
    name: 'x',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    currency: 'GHS',
    periodType: 'full_year',
    fileName: 'x.csv',
  },
  analyzeSales([{ name: 'A', quantity: 3, value: 9 }], { hasValue: true, hasCode: false }),
  [],
  10
);

function request(token?: string, body: unknown = { payload }) {
  return new Request('http://localhost/api/admin/sales-analysis/summary', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

describe('admin permission checks', () => {
  it('only admin and super_admin roles are allowed', () => {
    assert.equal(isAuthorizedAdminRole('admin'), true);
    assert.equal(isAuthorizedAdminRole('super_admin'), true);
    assert.equal(isAuthorizedAdminRole('staff'), false);
    assert.equal(isAuthorizedAdminRole('client'), false);
    assert.equal(isAuthorizedAdminRole(undefined), false);
  });

  it('rejects missing or invalid tokens with 401', async () => {
    const { provider, calls } = fakeProvider();
    assert.equal((await handleSalesSummaryRequest(request(), deps(provider))).status, 401);
    assert.equal((await handleSalesSummaryRequest(request('nope'), deps(provider))).status, 401);
    assert.equal(calls.length, 0);
  });

  it('rejects non-admin users with 403 and never calls the model', async () => {
    const { provider, calls } = fakeProvider();
    for (const t of ['tok-client', 'tok-staff']) {
      assert.equal((await handleSalesSummaryRequest(request(t), deps(provider))).status, 403);
    }
    assert.equal(calls.length, 0);
  });
});

describe('summary endpoint', () => {
  it('returns a validated summary with one model call for admins', async () => {
    const { provider, calls } = fakeProvider();
    const res = await handleSalesSummaryRequest(request('tok-super'), deps(provider));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { summary: { nextActions: string[] }; model: string };
    assert.equal(body.model, 'fake-model');
    assert.equal(body.summary.nextActions.length, 3);
    assert.equal(calls.length, 1);
  });

  it('returns 503 when AI is not configured', async () => {
    assert.equal((await handleSalesSummaryRequest(request('tok-admin'), deps(null))).status, 503);
  });

  it('rejects malformed or oversized payloads with 400', async () => {
    const { provider, calls } = fakeProvider();
    assert.equal(
      (await handleSalesSummaryRequest(request('tok-admin', { payload: { rows: [] } }), deps(provider))).status,
      400
    );
    const big = { payload: { ...payload, top10: Array.from({ length: 5000 }, () => ({ name: 'x', quantity: 1 })) } };
    assert.equal((await handleSalesSummaryRequest(request('tok-admin', big), deps(provider))).status, 413);
    assert.equal(calls.length, 0);
  });

  it('returns 502 when the model reply fails validation', async () => {
    const { provider } = fakeProvider('not json');
    assert.equal((await handleSalesSummaryRequest(request('tok-admin'), deps(provider))).status, 502);
  });
});
