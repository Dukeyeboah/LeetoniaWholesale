import { z } from 'zod';
import { rankProducts, slowSellers } from '@/lib/sales-analytics/analyze';
import type {
  SalesAiSummary,
  SalesAnalysisMeta,
  SalesAnalysisResult,
  SalesDataWarning,
} from '@/lib/sales-analytics/types';

const productSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().finite(),
  value: z.number().finite().optional(),
});

/** Compact, verified figures sent to the model — never raw spreadsheet rows. */
export const salesAiPayloadSchema = z.object({
  period: z.object({
    start: z.string().max(20),
    end: z.string().max(20),
    type: z.enum(['full_year', 'partial_year']),
    currency: z.string().max(10),
  }),
  totals: z.object({
    products: z.number().int().nonnegative(),
    quantity: z.number().finite(),
    value: z.number().finite().optional(),
    medianQuantity: z.number().finite(),
  }),
  quantityDistribution: z
    .array(z.object({ label: z.string().max(40), count: z.number().int().nonnegative() }))
    .max(10),
  top10: z.array(productSchema).max(10),
  bottom10: z.array(productSchema).max(10),
  slowSellers: z.object({
    threshold: z.number().finite(),
    count: z.number().int().nonnegative(),
    catalogPct: z.number().finite(),
  }),
  concentration: z
    .object({
      productsFor50: z.number().int().nonnegative(),
      productsFor80: z.number().int().nonnegative(),
      productsFor95: z.number().int().nonnegative(),
    })
    .optional(),
  groupCounts: z
    .object({
      highQtyHighValue: z.number().int().nonnegative(),
      highQtyLowerValue: z.number().int().nonnegative(),
      lowerQtyHighValue: z.number().int().nonnegative(),
      lowerQtyLowerValue: z.number().int().nonnegative(),
    })
    .optional(),
  warnings: z.array(z.string().max(400)).max(12),
});

export type SalesAiPayload = z.infer<typeof salesAiPayloadSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSalesAiPayload(
  meta: SalesAnalysisMeta,
  result: SalesAnalysisResult,
  warnings: SalesDataWarning[],
  slowThreshold: number
): SalesAiPayload {
  const toItem = (p: { name: string; quantity: number; value?: number }) => ({
    name: p.name.slice(0, 200),
    quantity: p.quantity,
    ...(result.hasValue ? { value: round2(p.value ?? 0) } : {}),
  });
  const slow = slowSellers(result, slowThreshold);
  const g = result.groupCounts;
  return {
    period: {
      start: meta.periodStart,
      end: meta.periodEnd,
      type: meta.periodType,
      currency: meta.currency,
    },
    totals: {
      products: result.stats.totalProducts,
      quantity: result.stats.totalQuantity,
      ...(result.hasValue ? { value: round2(result.stats.totalValue ?? 0) } : {}),
      medianQuantity: result.stats.medianQuantity,
    },
    quantityDistribution: result.quantityDistribution.map((b) => ({
      label: b.label,
      count: b.count,
    })),
    top10: rankProducts(result.products, 'quantity', 'top', 10).map(toItem),
    bottom10: rankProducts(result.products, 'quantity', 'bottom', 10).map(toItem),
    slowSellers: {
      threshold: slowThreshold,
      count: slow.count,
      catalogPct: round2(slow.catalogShare * 100),
    },
    ...(result.concentration
      ? {
          concentration: {
            productsFor50: result.concentration.productsFor50,
            productsFor80: result.concentration.productsFor80,
            productsFor95: result.concentration.productsFor95,
          },
        }
      : {}),
    ...(g
      ? {
          groupCounts: {
            highQtyHighValue: g.high_qty_high_value,
            highQtyLowerValue: g.high_qty_low_value,
            lowerQtyHighValue: g.low_qty_high_value,
            lowerQtyLowerValue: g.low_qty_low_value,
          },
        }
      : {}),
    warnings: warnings.slice(0, 12).map((w) => w.message.slice(0, 400)),
  };
}

export const salesAiSummarySchema = z.object({
  overallPicture: z.string().trim().min(1).max(1500),
  strongPerformers: z.string().trim().min(1).max(1500),
  slowSellers: z.string().trim().min(1).max(1500),
  quantityVsValue: z.string().trim().min(1).max(1500),
  toReview: z.string().trim().min(1).max(1500),
  nextActions: z.array(z.string().trim().min(1).max(400)).min(3).max(5),
  limitations: z.string().trim().min(1).max(1500),
});

export type ParsedAiSummary =
  | { ok: true; summary: SalesAiSummary }
  | { ok: false; error: string };

/** Validate the model's reply. Accepts plain JSON or JSON inside a ``` fence. */
export function parseAiSummaryResponse(text: string): ParsedAiSummary {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: 'The AI reply was not valid JSON.' };
  }
  const parsed = salesAiSummarySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'The AI reply was missing required sections.' };
  }
  return { ok: true, summary: parsed.data };
}

export const SALES_AI_MAX_OUTPUT_TOKENS = 900;

export function buildSalesAiPrompt(payload: SalesAiPayload): { system: string; user: string } {
  const system = [
    'You explain sales results to the owner of a wholesale pharmacy in Ghana.',
    'All numbers were already calculated and verified by software. Use ONLY the figures provided; never invent or recalculate numbers.',
    'Write in plain, friendly, concise English for a non-technical business owner. Avoid statistical jargon.',
    'Give commercial guidance only. Do NOT make clinical or medical judgements.',
    'Never tell the pharmacy to discontinue or stop stocking a medicine. Slow sellers should be "reviewed" (e.g. during stocktake), because some low-volume medicines may be essential.',
    'Reply with a single JSON object with exactly these keys:',
    '"overallPicture", "strongPerformers", "slowSellers", "quantityVsValue", "toReview" (each 1–3 short sentences),',
    '"nextActions" (array of 3 to 5 short practical actions), and "limitations" (1–2 sentences about gaps or warnings in the data).',
    'If sales value is missing, say value analysis was not possible in "quantityVsValue".',
  ].join(' ');
  const user = `Verified sales analysis figures:\n${JSON.stringify(payload)}`;
  return { system, user };
}
