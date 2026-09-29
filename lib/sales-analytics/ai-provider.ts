/**
 * Server-only model provider for the optional sales AI summary.
 * Reads the API key from environment variables — never import this from client code.
 */

export type AiCompletionRequest = {
  system: string;
  user: string;
  maxOutputTokens: number;
};

export type AiCompletionResult = {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export interface SalesAiProvider {
  name: string;
  model: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}

/** Approximate USD prices per 1M tokens, for development cost logs only. */
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
};

export function estimateAiCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
  env: Record<string, string | undefined> = process.env
): number | null {
  const inOverride = Number(env.SALES_AI_PRICE_INPUT_PER_M);
  const outOverride = Number(env.SALES_AI_PRICE_OUTPUT_PER_M);
  const price =
    Number.isFinite(inOverride) && inOverride > 0 && Number.isFinite(outOverride) && outOverride > 0
      ? { input: inOverride, output: outOverride }
      : PRICE_PER_MILLION[model];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** Works with OpenAI and any OpenAI-compatible chat completions endpoint. */
export function createOpenAiCompatibleProvider(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): SalesAiProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    name: 'openai',
    model: opts.model,
    async complete(req) {
      const res = await fetchImpl(`${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          temperature: 0.3,
          max_tokens: req.maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`AI provider returned ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        text,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens ?? 0,
              outputTokens: data.usage.completion_tokens ?? 0,
            }
          : undefined,
      };
    },
  };
}

/**
 * Pick the provider from env. Returns null when AI is not configured.
 *   SALES_AI_PROVIDER   = openai (default)
 *   SALES_AI_API_KEY    (falls back to OPENAI_API_KEY)
 *   SALES_AI_MODEL      = gpt-4o-mini (default)
 *   SALES_AI_BASE_URL   = https://api.openai.com/v1 (default)
 */
export function getSalesAiProvider(
  env: Record<string, string | undefined> = process.env
): SalesAiProvider | null {
  const provider = (env.SALES_AI_PROVIDER || 'openai').toLowerCase();
  const apiKey = env.SALES_AI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) return null;
  switch (provider) {
    case 'openai':
      return createOpenAiCompatibleProvider({
        apiKey,
        model: env.SALES_AI_MODEL || 'gpt-4o-mini',
        baseUrl: env.SALES_AI_BASE_URL || 'https://api.openai.com/v1',
      });
    default:
      return null;
  }
}
