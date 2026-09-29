import {
  buildSalesAiPrompt,
  parseAiSummaryResponse,
  SALES_AI_MAX_OUTPUT_TOKENS,
  salesAiPayloadSchema,
} from '@/lib/sales-analytics/ai-summary';
import {
  estimateAiCostUsd,
  type SalesAiProvider,
} from '@/lib/sales-analytics/ai-provider';
import { authorizeAdminRequest, type AdminAuthDeps } from '@/lib/server/admin-auth';

export type SalesSummaryDeps = AdminAuthDeps & {
  provider: SalesAiProvider | null;
  log?: (message: string) => void;
};

const MAX_BODY_BYTES = 32 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** One verified summary → one model request. */
export async function handleSalesSummaryRequest(
  req: Request,
  deps: SalesSummaryDeps
): Promise<Response> {
  const auth = await authorizeAdminRequest(req, deps);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  if (!deps.provider) {
    return json(503, {
      error: 'The AI summary is not set up yet. Ask your developer to add an AI API key.',
    });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: 'The summary data is too large.' });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  const payload = salesAiPayloadSchema.safeParse(
    (body as { payload?: unknown } | null)?.payload
  );
  if (!payload.success) {
    return json(400, { error: 'The analysis summary was incomplete.' });
  }

  const { system, user } = buildSalesAiPrompt(payload.data);
  let completion;
  try {
    completion = await deps.provider.complete({
      system,
      user,
      maxOutputTokens: SALES_AI_MAX_OUTPUT_TOKENS,
    });
  } catch (e) {
    console.error('sales AI provider error', e);
    return json(502, { error: 'The AI service did not respond. Please try again later.' });
  }

  if (completion.usage && process.env.NODE_ENV !== 'production') {
    const cost = estimateAiCostUsd(deps.provider.model, completion.usage);
    (deps.log ?? console.info)(
      `[sales-ai] model=${deps.provider.model} input=${completion.usage.inputTokens} output=${completion.usage.outputTokens} est_cost=${cost === null ? 'unknown' : `$${cost.toFixed(5)}`}`
    );
  }

  const parsed = parseAiSummaryResponse(completion.text);
  if (!parsed.ok) {
    return json(502, {
      error: 'The AI reply could not be checked. Please try "Regenerate Summary".',
    });
  }

  return json(200, {
    summary: parsed.summary,
    model: deps.provider.model,
    provider: deps.provider.name,
  });
}
