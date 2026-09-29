'use client';

import { useMemo, useState } from 'react';
import { Download, GitMerge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import {
  applyConsolidation,
  mappingRulesForDecision,
  planConsolidation,
} from '@/lib/sales-analytics/consolidate';
import { downloadConsolidatedWorkbook } from '@/lib/sales-analytics/consolidated-workbook';
import { formatQty } from '@/lib/sales-analytics/format';
import { saveProductMappingRules, updateSalesConsolidation } from '@/lib/sales-analytics/store';
import type {
  ConsolidationPlan,
  MatchDecision,
  ProductMappingRule,
  SalesSourceRow,
  SavedSalesAnalysis,
} from '@/lib/sales-analytics/types';
import {
  ConsolidationReview,
  ConsolidationSummaryCards,
  MappingRulesDialog,
} from '@/components/sales-analysis/consolidation-review';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const nextPaint = () => new Promise<void>((r) => setTimeout(r, 30));

export function SavedConsolidationCard({
  analysis,
  sourceRows,
  rules,
  onUpdated,
}: {
  analysis: SavedSalesAnalysis;
  sourceRows: SalesSourceRow[];
  rules: ProductMappingRule[];
  /** Called after a review is saved so the products can be reloaded. */
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<ConsolidationPlan | null>(null);
  const [decisions, setDecisions] = useState<MatchDecision[]>(analysis.decisions ?? []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const summary = analysis.consolidation;
  const canReview = sourceRows.length > 0;

  const result = useMemo(
    () =>
      plan ? applyConsolidation(sourceRows, plan, decisions, { hasValue: analysis.hasValue }) : null,
    [plan, sourceRows, decisions, analysis.hasValue]
  );

  const ensurePlan = async (): Promise<ConsolidationPlan> => {
    if (plan) return plan;
    setBusy('Checking products…');
    await nextPaint();
    const p = planConsolidation(sourceRows, rules);
    setPlan(p);
    setBusy(null);
    return p;
  };

  const openReview = async () => {
    setDecisions(analysis.decisions ?? []);
    await ensurePlan();
    setOpen(true);
  };

  const download = async () => {
    const p = await ensurePlan();
    setBusy('Preparing Excel…');
    await nextPaint();
    try {
      const r = applyConsolidation(sourceRows, p, analysis.decisions ?? [], { hasValue: analysis.hasValue });
      await downloadConsolidatedWorkbook({
        meta: analysis,
        hasValue: analysis.hasValue,
        sourceRows,
        plan: p,
        decisions: analysis.decisions ?? [],
        result: r,
        rules,
        issues: analysis.issues ?? [],
      });
    } catch (e) {
      console.error('consolidated workbook', e);
      toast.error('Could not create the Excel file.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!plan || !result) return;
    setBusy('Saving review…');
    await nextPaint();
    try {
      const stats = analyzeSales(result.products, {
        hasValue: analysis.hasValue,
        hasCode: analysis.hasCode,
      }).stats;
      await updateSalesConsolidation(db, analysis.id, {
        products: result.products,
        stats,
        consolidation: result.summary,
        decisions,
      });
      const previous = new Set((analysis.decisions ?? []).map((d) => `${d.matchId}:${d.decidedAt}`));
      const by = user?.name || user?.email || 'Admin';
      const newRules = decisions
        .filter((d) => !previous.has(`${d.matchId}:${d.decidedAt}`))
        .flatMap((d) => mappingRulesForDecision(sourceRows, plan, d, { now: Date.now(), by }));
      if (newRules.length) await saveProductMappingRules(db, newRules);
      toast.success('Review saved. The analysis now uses the updated products.');
      setOpen(false);
      onUpdated();
    } catch (e) {
      console.error('save consolidation review', e);
      toast.error('Could not save the review.');
    } finally {
      setBusy(null);
    }
  };

  if (!summary && !canReview) return null;

  return (
    <div className='space-y-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='min-w-0 flex-1'>
          <h4 className='flex items-center gap-1.5 text-sm font-semibold text-emerald-950'>
            <GitMerge className='h-4 w-4' />
            Product consolidation
          </h4>
          <p className='text-xs text-emerald-900/80'>
            {summary
              ? `${formatQty(summary.sourceRows)} rows became ${formatQty(summary.finalProducts)} products. All figures below use the consolidated products.`
              : 'This analysis was saved before consolidation was added.'}
          </p>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {canReview ? (
            <Button type='button' size='sm' variant='outline' className='h-8 bg-white' disabled={!!busy} onClick={() => void openReview()}>
              {busy === 'Checking products…' ? <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' /> : null}
              Review possible matches{summary ? ` (${summary.pendingMatches})` : ''}
            </Button>
          ) : null}
          {canReview ? (
            <Button type='button' size='sm' variant='outline' className='h-8 bg-white' disabled={!!busy} onClick={() => void download()}>
              {busy === 'Preparing Excel…' ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Download className='mr-1.5 h-3.5 w-3.5' />
              )}
              Consolidated Excel
            </Button>
          ) : null}
          <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => setRulesOpen(true)}>
            Mapping rules ({rules.length})
          </Button>
        </div>
      </div>
      {summary ? <ConsolidationSummaryCards summary={summary} /> : null}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Review products — {analysis.name}</DialogTitle>
            <DialogDescription>
              Checked again with the current mapping rules. Saving replaces this analysis&apos;s products;
              the original rows are kept.
            </DialogDescription>
          </DialogHeader>
          {plan && result ? (
            <div className='space-y-3'>
              <ConsolidationSummaryCards summary={result.summary} />
              <ConsolidationReview
                rows={sourceRows}
                plan={plan}
                decisions={decisions}
                summary={result.summary}
                hasValue={analysis.hasValue}
                currency={analysis.currency}
                decidedBy={user?.name || user?.email || undefined}
                onDecisionsChange={setDecisions}
              />
              <div className='flex justify-end gap-2 border-t pt-3'>
                <Button type='button' variant='outline' disabled={!!busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type='button' disabled={!!busy} onClick={() => void save()}>
                  {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                  {busy ?? 'Save review'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <MappingRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={rules} />
    </div>
  );
}
