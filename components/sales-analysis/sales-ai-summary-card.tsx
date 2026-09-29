'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/lib/firebase';
import type { SalesAiPayload } from '@/lib/sales-analytics/ai-summary';
import { saveSalesAiSummary } from '@/lib/sales-analytics/store';
import type { SalesAiSummary, StoredSalesAiSummary } from '@/lib/sales-analytics/types';
import { Button } from '@/components/ui/button';

type Props = {
  analysisId: string;
  stored?: StoredSalesAiSummary;
  buildPayload: () => SalesAiPayload;
};

const SECTIONS: { key: Exclude<keyof SalesAiSummary, 'nextActions'>; title: string }[] = [
  { key: 'overallPicture', title: 'Overall picture' },
  { key: 'strongPerformers', title: 'Strong-performing products' },
  { key: 'slowSellers', title: 'Slow-selling products' },
  { key: 'quantityVsValue', title: 'Quantity versus value' },
  { key: 'toReview', title: 'Products or groups to review' },
];

export function SalesAiSummaryCard({ analysisId, stored, buildPayload }: Props) {
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState<StoredSalesAiSummary | undefined>(undefined);
  const current = local ?? stored;

  const generate = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('Please sign in again.');
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/sales-analysis/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payload: buildPayload() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: SalesAiSummary;
        model?: string;
        provider?: string;
      };
      if (!res.ok || !body.summary) {
        toast.error(body.error || 'Could not generate the summary.');
        return;
      }
      const next: StoredSalesAiSummary = {
        summary: body.summary,
        model: body.model ?? 'unknown',
        provider: body.provider ?? 'unknown',
        generatedAt: Date.now(),
      };
      setLocal(next);
      await saveSalesAiSummary(db, analysisId, next);
    } catch (e) {
      console.error('sales AI summary', e);
      toast.error('Could not generate the summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-3 rounded-2xl border border-violet-200/80 bg-violet-50/60 p-3 sm:p-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h3 className='flex items-center gap-1.5 text-sm font-semibold text-violet-950'>
            <Sparkles className='h-4 w-4' />
            Simple AI summary
          </h3>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            A plain-language explanation of the figures below. All numbers are calculated by the
            app; the AI only explains them. Commercial guidance only — not clinical advice.
          </p>
        </div>
        {current ? (
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='shrink-0'
            disabled={loading}
            onClick={() => void generate()}
          >
            {loading ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <RefreshCw className='mr-1.5 h-3.5 w-3.5' />
            )}
            Regenerate Summary
          </Button>
        ) : null}
      </div>

      {current ? (
        <div className='space-y-3 text-sm'>
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <p className='text-xs font-semibold text-violet-900'>{s.title}</p>
              <p className='mt-0.5 leading-relaxed'>{current.summary[s.key]}</p>
            </div>
          ))}
          <div>
            <p className='text-xs font-semibold text-violet-900'>Practical next actions</p>
            <ol className='mt-1 list-decimal space-y-0.5 pl-5'>
              {current.summary.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className='text-xs font-semibold text-violet-900'>Limitations in the data</p>
            <p className='mt-0.5 leading-relaxed'>{current.summary.limitations}</p>
          </div>
          <p className='text-[11px] text-muted-foreground'>
            Generated {format(current.generatedAt, 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      ) : (
        <Button
          type='button'
          className='w-full sm:w-auto'
          disabled={loading}
          onClick={() => void generate()}
        >
          {loading ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Sparkles className='mr-2 h-4 w-4' />
          )}
          Generate Simple AI Summary
        </Button>
      )}
    </div>
  );
}
