'use client';

import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, Pencil, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { activeDecisions, entityTotals } from '@/lib/sales-analytics/consolidate';
import { formatMoney, formatQty } from '@/lib/sales-analytics/format';
import { normalizeForMatch } from '@/lib/sales-analytics/normalize';
import { deleteProductMappingRule, saveProductMappingRules } from '@/lib/sales-analytics/store';
import type {
  ConsolidationPlan,
  ConsolidationSummary,
  MatchDecision,
  PossibleMatch,
  ProductEntity,
  ProductMappingRule,
  SalesProductRow,
  SalesSourceRow,
} from '@/lib/sales-analytics/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE = 20;
const CUSTOM = '__custom__';

export const MATCH_KIND_LABEL: Record<PossibleMatch['kind'], string> = {
  truncated: 'Shortened name',
  truncated_multiple: 'Shortened name · several options',
  spelling: 'Possible spelling difference',
  missing_pack: 'Pack size missing',
  missing_detail: 'Details missing',
  wording: 'Different wording',
  same_code_conflict: 'Same code, different names',
  same_name_multiple_codes: 'Same name, several codes',
};

const METHOD_LABEL: Record<string, string> = {
  single: 'Single row',
  code: 'Product code',
  name: 'Exact name',
  mapping: 'Mapping rule',
  admin: 'Admin approved',
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2', tone)}>
      <p className='text-[11px] leading-tight'>{label}</p>
      <p className='mt-0.5 text-lg font-semibold tabular-nums'>{value}</p>
    </div>
  );
}

export function ConsolidationSummaryCards({ summary }: { summary: ConsolidationSummary }) {
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
      <Stat label='Source rows' value={formatQty(summary.sourceRows)} tone='border-slate-200 bg-slate-50 text-slate-900' />
      <Stat
        label='Duplicates found'
        value={formatQty(summary.autoCombinedRows + summary.possibleMatches)}
        tone='border-slate-200 bg-slate-50 text-slate-900'
      />
      <Stat
        label='Auto-consolidated rows'
        value={formatQty(summary.autoCombinedRows)}
        tone='border-emerald-200 bg-emerald-50 text-emerald-900'
      />
      <Stat
        label='Possible matches to review'
        value={formatQty(summary.pendingMatches)}
        tone='border-amber-200 bg-amber-50 text-amber-900'
      />
      <Stat label='Final records' value={formatQty(summary.finalProducts)} tone='border-sky-200 bg-sky-50 text-sky-900' />
    </div>
  );
}

function SourceRowTable({
  rows,
  hasValue,
  currency,
}: {
  rows: SalesSourceRow[];
  hasValue: boolean;
  currency: string;
}) {
  const hasExpiry = rows.some((r) => r.expiry);
  const hasBatch = rows.some((r) => r.batch);
  return (
    <div className='w-full overflow-x-auto rounded-md border'>
      <table className='w-full min-w-[28rem] text-xs'>
        <thead className='bg-muted/40 text-muted-foreground'>
          <tr>
            <th className='px-2 py-1.5 text-left font-medium'>Row</th>
            <th className='px-2 py-1.5 text-left font-medium'>Name in file</th>
            <th className='px-2 py-1.5 text-left font-medium'>Code</th>
            <th className='px-2 py-1.5 text-right font-medium'>Qty</th>
            {hasValue ? <th className='px-2 py-1.5 text-right font-medium'>Amount</th> : null}
            {hasExpiry ? <th className='px-2 py-1.5 text-left font-medium'>Expiry</th> : null}
            {hasBatch ? <th className='px-2 py-1.5 text-left font-medium'>Batch</th> : null}
          </tr>
        </thead>
        <tbody className='divide-y'>
          {rows.map((r) => (
            <tr key={r.rowNumber}>
              <td className='px-2 py-1 tabular-nums text-muted-foreground'>{r.rowNumber}</td>
              <td className='px-2 py-1'>{r.name}</td>
              <td className='px-2 py-1 font-mono text-[11px]'>{r.code ?? '—'}</td>
              <td className='px-2 py-1 text-right tabular-nums'>{formatQty(r.quantity, 2)}</td>
              {hasValue ? (
                <td className='px-2 py-1 text-right tabular-nums'>{formatMoney(r.value, currency)}</td>
              ) : null}
              {hasExpiry ? <td className='px-2 py-1'>{r.expiry ?? '—'}</td> : null}
              {hasBatch ? <td className='px-2 py-1'>{r.batch ?? '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({
  match,
  rows,
  entityByKey,
  decision,
  hasValue,
  currency,
  onDecide,
  onUndo,
}: {
  match: PossibleMatch;
  rows: SalesSourceRow[];
  entityByKey: Map<string, ProductEntity>;
  decision?: MatchDecision;
  hasValue: boolean;
  currency: string;
  onDecide: (d: Omit<MatchDecision, 'decidedAt'>) => void;
  onUndo: () => void;
}) {
  const [subjectKey, ...candidateKeys] = match.entityKeys;
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(match.needsChoice ? [] : candidateKeys)
  );
  const [masterKey, setMasterKey] = useState<string>(match.suggestedMasterKey);
  const [customName, setCustomName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const selectedKeys = [subjectKey, ...candidateKeys.filter((k) => chosen.has(k))];
  const masterOptions = selectedKeys.filter((k) => entityByKey.has(k));
  const effectiveMaster = masterOptions.includes(masterKey) ? masterKey : masterOptions[masterOptions.length - 1];
  const masterName =
    masterKey === CUSTOM ? customName.trim() : entityByKey.get(effectiveMaster)?.displayName ?? '';
  const canMerge = selectedKeys.length >= 2 && !!masterName;

  const tone = !decision
    ? 'border-amber-200 bg-amber-50/40'
    : decision.action === 'merge'
      ? 'border-emerald-200 bg-emerald-50/40'
      : 'border-sky-200 bg-sky-50/40';

  return (
    <div className={cn('space-y-2 rounded-xl border p-3', tone)}>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Badge variant='outline' className='bg-white'>
          {MATCH_KIND_LABEL[match.kind]}
        </Badge>
        {decision ? (
          <Badge className={decision.action === 'merge' ? 'bg-emerald-600' : 'bg-sky-600'}>
            {decision.action === 'merge' ? `Merged as “${decision.masterName}”` : 'Kept separate'}
          </Badge>
        ) : null}
      </div>
      <p className='text-xs text-muted-foreground'>{match.reason}</p>

      <div className='w-full overflow-x-auto rounded-md border bg-white'>
        <table className='w-full min-w-[34rem] text-xs'>
          <thead className='bg-muted/40 text-muted-foreground'>
            <tr>
              <th className='w-8 px-2 py-1.5' />
              <th className='px-2 py-1.5 text-left font-medium'>Record</th>
              <th className='px-2 py-1.5 text-left font-medium'>Code</th>
              <th className='px-2 py-1.5 text-right font-medium'>Rows</th>
              <th className='px-2 py-1.5 text-right font-medium'>Quantity</th>
              {hasValue ? <th className='px-2 py-1.5 text-right font-medium'>Amount</th> : null}
              {hasValue ? <th className='px-2 py-1.5 text-right font-medium'>Avg price</th> : null}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {match.entityKeys.map((k, i) => {
              const e = entityByKey.get(k);
              if (!e) return null;
              const t = entityTotals(rows, e);
              const isSubject = i === 0;
              return (
                <Fragment key={k}>
                  <tr className={isSubject ? 'bg-amber-50/60' : ''}>
                    <td className='px-2 py-1.5 align-top'>
                      {isSubject ? (
                        <span className='text-[10px] text-muted-foreground'>This</span>
                      ) : (
                        <Checkbox
                          checked={chosen.has(k)}
                          disabled={!!decision}
                          aria-label={`Merge with ${e.displayName}`}
                          onCheckedChange={(v) =>
                            setChosen((s) => {
                              const n = new Set(s);
                              if (v) n.add(k);
                              else n.delete(k);
                              return n;
                            })
                          }
                        />
                      )}
                    </td>
                    <td className='px-2 py-1.5'>
                      <button
                        type='button'
                        className='text-left font-medium hover:underline'
                        onClick={() => setExpanded((x) => (x === k ? null : k))}
                      >
                        {e.displayName}
                      </button>
                    </td>
                    <td className='px-2 py-1.5 font-mono text-[11px]'>{e.code ?? '—'}</td>
                    <td className='px-2 py-1.5 text-right tabular-nums'>{e.rowIndexes.length}</td>
                    <td className='px-2 py-1.5 text-right tabular-nums'>{formatQty(t.quantity, 2)}</td>
                    {hasValue ? (
                      <td className='px-2 py-1.5 text-right tabular-nums'>{formatMoney(t.value, currency)}</td>
                    ) : null}
                    {hasValue ? (
                      <td className='px-2 py-1.5 text-right tabular-nums'>
                        {formatMoney(t.averagePrice, currency)}
                      </td>
                    ) : null}
                  </tr>
                  {expanded === k ? (
                    <tr>
                      <td colSpan={hasValue ? 7 : 5} className='bg-muted/20 p-2'>
                        <SourceRowTable
                          rows={e.rowIndexes.map((ri) => rows[ri])}
                          hasValue={hasValue}
                          currency={currency}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {decision ? (
        <Button type='button' variant='ghost' size='sm' className='h-7 text-xs' onClick={onUndo}>
          <Undo2 className='mr-1 h-3.5 w-3.5' />
          Undo decision
        </Button>
      ) : (
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center'>
            <span className='shrink-0 text-xs text-muted-foreground'>Master product name</span>
            <Select value={masterKey === CUSTOM ? CUSTOM : effectiveMaster} onValueChange={setMasterKey}>
              <SelectTrigger className='h-8 w-full text-xs sm:w-72'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {masterOptions.map((k) => (
                  <SelectItem key={k} value={k} className='text-xs'>
                    {entityByKey.get(k)?.displayName}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM} className='text-xs'>
                  Type a different name…
                </SelectItem>
              </SelectContent>
            </Select>
            {masterKey === CUSTOM ? (
              <Input
                className='h-8 text-xs sm:w-60'
                placeholder='Master product name'
                value={customName}
                maxLength={160}
                onChange={(e) => setCustomName(e.target.value)}
              />
            ) : null}
          </div>
          <div className='flex gap-2'>
            <Button
              type='button'
              size='sm'
              className='h-8'
              disabled={!canMerge}
              title={!canMerge && match.needsChoice ? 'Tick which record(s) this belongs to' : undefined}
              onClick={() =>
                onDecide({
                  matchId: match.id,
                  action: 'merge',
                  mergeKeys: selectedKeys,
                  masterName,
                })
              }
            >
              <Check className='mr-1 h-3.5 w-3.5' />
              Merge
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-8'
              onClick={() => onDecide({ matchId: match.id, action: 'separate' })}
            >
              <X className='mr-1 h-3.5 w-3.5' />
              Keep separate
            </Button>
          </div>
        </div>
      )}
      {!decision && match.needsChoice && chosen.size === 0 ? (
        <p className='text-[11px] text-amber-800'>Tick which record(s) this belongs to before merging.</p>
      ) : null}
    </div>
  );
}

type Tab = 'possible' | 'auto' | 'separate';

export function ConsolidationReview({
  rows,
  plan,
  decisions,
  summary,
  hasValue,
  currency,
  decidedBy,
  onDecisionsChange,
}: {
  rows: SalesSourceRow[];
  plan: ConsolidationPlan;
  decisions: MatchDecision[];
  summary: ConsolidationSummary;
  hasValue: boolean;
  currency: string;
  decidedBy?: string;
  onDecisionsChange: (next: MatchDecision[]) => void;
}) {
  const [tab, setTab] = useState<Tab>(summary.pendingMatches > 0 ? 'possible' : 'auto');
  const [showDecided, setShowDecided] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [expandedAuto, setExpandedAuto] = useState<string | null>(null);

  const entityByKey = useMemo(() => new Map(plan.entities.map((e) => [e.key, e])), [plan]);
  const decisionById = useMemo(
    () => new Map(activeDecisions(plan, decisions).map((d) => [d.matchId, d])),
    [plan, decisions]
  );
  const matches = useMemo(
    () => plan.possibleMatches.filter((m) => showDecided || !decisionById.has(m.id)),
    [plan, decisionById, showDecided]
  );
  const autoGroups = useMemo(
    () =>
      plan.entities
        .filter((e) => e.rowIndexes.length > 1)
        .sort((a, b) => b.rowIndexes.length - a.rowIndexes.length),
    [plan]
  );

  const decide = (d: Omit<MatchDecision, 'decidedAt'>) => {
    onDecisionsChange([
      ...decisions.filter((x) => x.matchId !== d.matchId),
      { ...d, decidedAt: Date.now(), ...(decidedBy ? { decidedBy } : {}) },
    ]);
  };
  const undo = (matchId: string) => onDecisionsChange(decisions.filter((x) => x.matchId !== matchId));

  const keepAllPending = () => {
    const now = Date.now();
    const pending = plan.possibleMatches.filter((m) => !decisionById.has(m.id));
    onDecisionsChange([
      ...decisions,
      ...pending.map((m) => ({ matchId: m.id, action: 'separate' as const, decidedAt: now })),
    ]);
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'possible', label: `Possible matches (${summary.pendingMatches})` },
    { value: 'auto', label: `Automatically consolidated (${autoGroups.length})` },
    { value: 'separate', label: `Kept separate (${plan.keptSeparate.length})` },
  ];

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap gap-1.5'>
        {tabs.map((t) => (
          <Button
            key={t.value}
            type='button'
            size='sm'
            variant={tab === t.value ? 'default' : 'outline'}
            className='h-8 text-xs'
            onClick={() => {
              setTab(t.value);
              setVisible(PAGE);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'possible' ? (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <p className='text-muted-foreground'>
              Nothing here is combined until you choose <strong>Merge</strong>. Undecided matches stay
              as separate products.
            </p>
            <label className='ml-auto flex items-center gap-1.5'>
              <Checkbox checked={showDecided} onCheckedChange={(v) => setShowDecided(!!v)} />
              Show decided
            </label>
            {summary.pendingMatches > 0 ? (
              <Button type='button' size='sm' variant='ghost' className='h-7 text-xs' onClick={keepAllPending}>
                Keep all remaining separate
              </Button>
            ) : null}
          </div>
          {matches.length === 0 ? (
            <p className='rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
              {plan.possibleMatches.length === 0
                ? 'No uncertain matches were found.'
                : 'All possible matches have been reviewed.'}
            </p>
          ) : (
            matches.slice(0, visible).map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                rows={rows}
                entityByKey={entityByKey}
                decision={decisionById.get(m.id)}
                hasValue={hasValue}
                currency={currency}
                onDecide={decide}
                onUndo={() => undo(m.id)}
              />
            ))
          )}
          {matches.length > visible ? (
            <Button type='button' variant='outline' size='sm' className='w-full' onClick={() => setVisible((v) => v + PAGE)}>
              Show more ({visible} of {matches.length})
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === 'auto' ? (
        <div className='space-y-2'>
          <p className='text-xs text-muted-foreground'>
            Combined automatically because the product code or the standardised name was exactly the
            same (or an approved mapping rule applied). Tap a product to see its original rows.
          </p>
          {autoGroups.length === 0 ? (
            <p className='rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
              No duplicate rows were found.
            </p>
          ) : (
            <div className='w-full overflow-x-auto rounded-md border bg-card'>
              <table className='w-full min-w-[40rem] text-xs'>
                <thead className='bg-muted/40 text-muted-foreground'>
                  <tr>
                    <th className='px-2 py-1.5 text-left font-medium'>Product</th>
                    <th className='px-2 py-1.5 text-left font-medium'>Code</th>
                    <th className='px-2 py-1.5 text-right font-medium'>Rows</th>
                    <th className='px-2 py-1.5 text-right font-medium'>Total qty</th>
                    {hasValue ? <th className='px-2 py-1.5 text-right font-medium'>Total amount</th> : null}
                    {hasValue ? <th className='px-2 py-1.5 text-right font-medium'>Avg price</th> : null}
                    <th className='px-2 py-1.5 text-left font-medium'>Why</th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {autoGroups.slice(0, visible).map((e) => {
                    const t = entityTotals(rows, e);
                    return (
                      <Fragment key={e.key}>
                        <tr className='bg-emerald-50/40'>
                          <td className='px-2 py-1.5'>
                            <button
                              type='button'
                              className='text-left font-medium hover:underline'
                              onClick={() => setExpandedAuto((x) => (x === e.key ? null : e.key))}
                            >
                              {e.displayName}
                            </button>
                          </td>
                          <td className='px-2 py-1.5 font-mono text-[11px]'>{e.code ?? '—'}</td>
                          <td className='px-2 py-1.5 text-right tabular-nums'>{e.rowIndexes.length}</td>
                          <td className='px-2 py-1.5 text-right tabular-nums'>{formatQty(t.quantity, 2)}</td>
                          {hasValue ? (
                            <td className='px-2 py-1.5 text-right tabular-nums'>{formatMoney(t.value, currency)}</td>
                          ) : null}
                          {hasValue ? (
                            <td className='px-2 py-1.5 text-right tabular-nums'>
                              {formatMoney(t.averagePrice, currency)}
                            </td>
                          ) : null}
                          <td className='px-2 py-1.5 text-muted-foreground'>
                            {METHOD_LABEL[e.method]} · {e.reason}
                          </td>
                        </tr>
                        {expandedAuto === e.key ? (
                          <tr>
                            <td colSpan={hasValue ? 7 : 5} className='bg-muted/20 p-2'>
                              <SourceRowTable
                                rows={e.rowIndexes.map((i) => rows[i])}
                                hasValue={hasValue}
                                currency={currency}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {autoGroups.length > visible ? (
            <Button type='button' variant='outline' size='sm' className='w-full' onClick={() => setVisible((v) => v + PAGE)}>
              Show more ({visible} of {autoGroups.length})
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === 'separate' ? (
        <div className='space-y-2'>
          <p className='text-xs text-muted-foreground'>
            Similar names that were deliberately not combined because the strength, pack size, form,
            adult/child, release type or product code differs.
          </p>
          {plan.keptSeparate.length === 0 ? (
            <p className='rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
              Nothing to show.
            </p>
          ) : (
            plan.keptSeparate.slice(0, visible).map((g, i) => (
              <div key={i} className='rounded-xl border border-sky-200 bg-sky-50/40 p-3'>
                <p className='text-xs font-medium text-sky-900'>{g.reason}</p>
                <ul className='mt-1.5 space-y-0.5 text-xs'>
                  {g.entityKeys.map((k) => {
                    const e = entityByKey.get(k);
                    if (!e) return null;
                    const t = entityTotals(rows, e);
                    return (
                      <li key={k} className='flex gap-2'>
                        <span className='min-w-0 flex-1 truncate'>{e.displayName}</span>
                        {e.code ? <span className='font-mono text-[11px] text-muted-foreground'>{e.code}</span> : null}
                        <span className='tabular-nums text-muted-foreground'>{formatQty(t.quantity, 2)} units</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {plan.keptSeparate.length > visible ? (
            <Button type='button' variant='outline' size='sm' className='w-full' onClick={() => setVisible((v) => v + PAGE)}>
              Show more ({visible} of {plan.keptSeparate.length})
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Audit view: the original rows that make up one consolidated product. */
export function SourceRowsDialog({
  product,
  sourceRows,
  hasValue,
  currency,
  onOpenChange,
}: {
  product: SalesProductRow | null;
  sourceRows: SalesSourceRow[];
  hasValue: boolean;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const byNumber = useMemo(() => new Map(sourceRows.map((r) => [r.rowNumber, r])), [sourceRows]);
  const rows = (product?.sourceRows ?? [])
    .map((n) => byNumber.get(n))
    .filter(Boolean) as SalesSourceRow[];
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='pr-6'>{product?.name}</DialogTitle>
          <DialogDescription>
            {METHOD_LABEL[product?.matchMethod ?? 'single']} ·{' '}
            {product?.confidence === 'reviewed' ? 'reviewed by admin' : 'high confidence'}
            {product?.decidedAt ? ` · approved ${format(product.decidedAt, 'MMM d, yyyy')}` : ''}
            {product?.normalizedName ? (
              <span className='mt-1 block font-mono text-[11px]'>Standardised: {product.normalizedName}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {rows.length ? (
          <SourceRowTable rows={rows} hasValue={hasValue} currency={currency} />
        ) : (
          <p className='text-sm text-muted-foreground'>
            Original rows were not stored for this analysis (it was saved before consolidation was
            added).
          </p>
        )}
        {rows.length ? (
          <p className='text-xs text-muted-foreground'>
            {rows.length} row(s) · total {formatQty(product?.quantity ?? 0, 2)} units
            {hasValue ? ` · ${formatMoney(product?.value, currency)}` : ''}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** View, rename and delete approved "same product" rules. */
export function MappingRulesDialog({
  open,
  onOpenChange,
  rules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: ProductMappingRule[];
}) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const list = q
    ? rules.filter((r) => r.alias.toLowerCase().includes(q) || r.masterName.toLowerCase().includes(q))
    : rules;

  const saveEdit = async (r: ProductMappingRule) => {
    const name = draft.trim();
    if (!name) return;
    setBusy(r.aliasKey);
    try {
      await saveProductMappingRules(db, [
        { ...r, masterName: name, masterKey: normalizeForMatch(name), updatedAt: Date.now() },
      ]);
      setEditing(null);
    } catch (e) {
      console.error('update mapping rule', e);
      toast.error('Could not update this rule.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: ProductMappingRule) => {
    setBusy(r.aliasKey);
    try {
      await deleteProductMappingRule(db, r.aliasKey);
    } catch (e) {
      console.error('delete mapping rule', e);
      toast.error('Could not delete this rule.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Product mapping rules</DialogTitle>
          <DialogDescription>
            Names you approved as the same product. They are combined automatically on future uploads.
            Changes apply to new uploads and re-reviews, not to analyses already saved.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder='Search names…' value={search} onChange={(e) => setSearch(e.target.value)} className='h-9' />
        {list.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {rules.length ? 'No rules match your search.' : 'No mapping rules yet. They are created when you merge possible matches.'}
          </p>
        ) : (
          <ul className='divide-y rounded-md border text-sm'>
            {list.map((r) => (
              <li key={r.aliasKey} className='flex flex-col gap-1.5 p-2 sm:flex-row sm:items-center'>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs text-muted-foreground'>{r.alias}</p>
                  {editing === r.aliasKey ? (
                    <Input
                      className='mt-1 h-8 text-xs'
                      value={draft}
                      maxLength={160}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <p className='truncate font-medium'>→ {r.masterName}</p>
                  )}
                </div>
                <div className='flex shrink-0 gap-1'>
                  {busy === r.aliasKey ? <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' /> : null}
                  {editing === r.aliasKey ? (
                    <>
                      <Button type='button' size='sm' className='h-7 text-xs' onClick={() => void saveEdit(r)}>
                        Save
                      </Button>
                      <Button type='button' size='sm' variant='ghost' className='h-7 text-xs' onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        className='h-7 w-7'
                        aria-label='Edit master name'
                        onClick={() => {
                          setEditing(r.aliasKey);
                          setDraft(r.masterName);
                        }}
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        className='h-7 w-7 text-destructive'
                        aria-label='Delete rule'
                        onClick={() => void remove(r)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
