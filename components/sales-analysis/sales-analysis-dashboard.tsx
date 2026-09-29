'use client';

import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  analyzeSales,
  CONCENTRATION_TIER_INFO,
  rankMetricValue,
  rankProducts,
  SALES_GROUP_INFO,
  SALES_GROUP_ORDER,
  slowSellers,
  type RankDirection,
} from '@/lib/sales-analytics/analyze';
import { buildSalesAiPayload } from '@/lib/sales-analytics/ai-summary';
import { downloadAnalysisCsv, downloadAnalysisXlsx } from '@/lib/sales-analytics/export';
import { formatMoney, formatPct, formatQty } from '@/lib/sales-analytics/format';
import { exportSalesAnalysisPdf, printSalesAnalysis } from '@/lib/sales-analytics/report';
import { getSalesSourceFileUrl } from '@/lib/sales-analytics/store';
import { storage } from '@/lib/firebase';
import { toast } from 'sonner';
import type {
  SalesAnalysisMeta,
  SalesConcentrationTier,
  SalesGroupKey,
  SalesProductRow,
  SalesRankMetric,
  SavedSalesAnalysis,
} from '@/lib/sales-analytics/types';
import { AdminSegmentNav } from '@/components/admin-overview-panel';
import { SalesAiSummaryCard } from '@/components/sales-analysis/sales-ai-summary-card';
import { SalesProductTable } from '@/components/sales-analysis/sales-product-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Props = {
  analysis: SavedSalesAnalysis;
  rows: SalesProductRow[];
  onBack: () => void;
  onDelete: () => void;
  /** Product consolidation summary / review, shown under the header. */
  consolidationSlot?: React.ReactNode;
  onSelectProduct?: (p: SalesProductRow) => void;
};

type Section = 'top' | 'slow' | 'spread' | 'groups' | 'value' | 'all';

const RANK_OPTIONS: { value: string; label: string; dir: RankDirection; n: number }[] = [
  { value: 'top-10', label: 'Top 10 products', dir: 'top', n: 10 },
  { value: 'top-20', label: 'Top 20 products', dir: 'top', n: 20 },
  { value: 'top-50', label: 'Top 50 products', dir: 'top', n: 50 },
  { value: 'bottom-10', label: 'Bottom 10 products', dir: 'bottom', n: 10 },
  { value: 'bottom-20', label: 'Bottom 20 products', dir: 'bottom', n: 20 },
  { value: 'bottom-50', label: 'Bottom 50 products', dir: 'bottom', n: 50 },
];

const METRIC_LABEL: Record<SalesRankMetric, string> = {
  quantity: 'Quantity sold',
  value: 'Sales value',
  unitValue: 'Average value per unit',
};

const SLOW_PRESETS = [5, 10, 20, 50];

const GROUP_COLORS: Record<SalesGroupKey, string> = {
  high_qty_high_value: '#059669',
  high_qty_low_value: '#0284c7',
  low_qty_high_value: '#d97706',
  low_qty_low_value: '#94a3b8',
};

const SCATTER_LIMIT = 2000;

function shortLabel(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2.5', tone)}>
      <p className='text-xs'>{label}</p>
      <p className='mt-1 font-serif text-lg font-semibold tabular-nums leading-tight sm:text-xl'>
        {value}
      </p>
      {hint ? <p className='mt-0.5 text-[11px] text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='min-w-0 space-y-3 rounded-2xl border bg-card p-3 sm:p-4'>
      <div>
        <h3 className='text-sm font-semibold'>{title}</h3>
        {description ? (
          <p className='mt-0.5 text-xs text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SalesAnalysisDashboard({
  analysis,
  rows,
  onBack,
  onDelete,
  consolidationSlot,
  onSelectProduct,
}: Props) {
  const result = useMemo(
    () => analyzeSales(rows, { hasValue: analysis.hasValue, hasCode: analysis.hasCode }),
    [rows, analysis.hasValue, analysis.hasCode]
  );
  const meta: SalesAnalysisMeta = analysis;
  const { currency } = analysis;
  const { hasValue, hasCode, stats } = result;

  const [section, setSection] = useState<Section>('top');
  const [rankOption, setRankOption] = useState('top-10');
  const [rankMetric, setRankMetric] = useState<SalesRankMetric>('quantity');
  const [slowThreshold, setSlowThreshold] = useState(10);
  const [customSlow, setCustomSlow] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<SalesGroupKey>('high_qty_high_value');
  const [selectedTier, setSelectedTier] = useState<SalesConcentrationTier>('top50');
  const [allGroupFilter, setAllGroupFilter] = useState<'all' | SalesGroupKey | 'high' | 'lower'>(
    'all'
  );
  const [showWarnings, setShowWarnings] = useState(false);

  const rankSel = RANK_OPTIONS.find((o) => o.value === rankOption) ?? RANK_OPTIONS[0];
  const ranked = useMemo(
    () => rankProducts(result.products, rankMetric, rankSel.dir, rankSel.n),
    [result.products, rankMetric, rankSel]
  );
  const rankChart = useMemo(
    () =>
      ranked.map((p) => ({
        name: shortLabel(p.name),
        fullName: p.name,
        score: rankMetricValue(p, rankMetric),
      })),
    [ranked, rankMetric]
  );

  const slow = useMemo(() => slowSellers(result, slowThreshold), [result, slowThreshold]);

  const groupProducts = useMemo(
    () => result.products.filter((p) => p.group === selectedGroup),
    [result.products, selectedGroup]
  );
  const tierProducts = useMemo(
    () =>
      result.products
        .filter((p) => p.concentrationTier === selectedTier)
        .sort((a, b) => (a.rankByValue ?? 0) - (b.rankByValue ?? 0)),
    [result.products, selectedTier]
  );
  const tierCounts = useMemo(() => {
    const c: Record<SalesConcentrationTier, number> = { top50: 0, next30: 0, next15: 0, rest: 0 };
    for (const p of result.products) if (p.concentrationTier) c[p.concentrationTier] += 1;
    return c;
  }, [result.products]);

  const allFiltered = useMemo(() => {
    if (allGroupFilter === 'all') return result.products;
    if (allGroupFilter === 'high' || allGroupFilter === 'lower') {
      return result.products.filter((p) => p.quantityGroup === allGroupFilter);
    }
    return result.products.filter((p) => p.group === allGroupFilter);
  }, [result.products, allGroupFilter]);

  const scatterData = useMemo(() => {
    const list =
      result.products.length > SCATTER_LIMIT
        ? [...result.products]
            .sort((a, b) => (a.rankByValue ?? 0) - (b.rankByValue ?? 0))
            .slice(0, SCATTER_LIMIT)
        : result.products;
    return list.map((p) => ({ x: p.quantity, y: p.value ?? 0, name: p.name, group: p.group! }));
  }, [result.products]);

  const buildPayload = useCallback(
    () => buildSalesAiPayload(meta, result, analysis.warnings, slowThreshold),
    [meta, result, analysis.warnings, slowThreshold]
  );

  const downloadOriginal = async () => {
    if (!analysis.sourceFile) return;
    try {
      const url = await getSalesSourceFileUrl(storage, analysis.sourceFile.path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      console.error('download original sales file', e);
      toast.error('Could not download the original file.');
    }
  };

  const reportInput = {
    meta,
    result,
    slowThreshold,
    aiSummary: analysis.aiSummary?.summary,
  };

  const sections: { value: Section; label: string; shortLabel: string }[] = [
    { value: 'top', label: 'Top Products', shortLabel: 'Top' },
    { value: 'slow', label: 'Slow Sellers', shortLabel: 'Slow' },
    { value: 'spread', label: 'Distribution', shortLabel: 'Spread' },
    ...(hasValue
      ? [{ value: 'groups' as const, label: 'Groups', shortLabel: 'Groups' }]
      : []),
    ...(result.concentration
      ? [{ value: 'value' as const, label: 'Value Share', shortLabel: 'Value' }]
      : []),
    { value: 'all', label: 'All Products', shortLabel: 'All' },
  ];

  const moneyTick = (v: number) =>
    v >= 1000 ? `${Math.round(v / 1000).toLocaleString()}k` : String(Math.round(v));

  return (
    <div className='w-full min-w-0 max-w-full space-y-4'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='-ml-2 mb-1 h-7 px-2 text-xs text-muted-foreground'
            onClick={onBack}
          >
            <ArrowLeft className='mr-1 h-3.5 w-3.5' />
            All analyses
          </Button>
          <h3 className='truncate font-serif text-lg font-semibold text-primary'>
            {analysis.name}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {analysis.periodStart} → {analysis.periodEnd} ·{' '}
            {analysis.periodType === 'full_year' ? 'Full year' : 'Partial year'} ·{' '}
            {analysis.fileName}
          </p>
          <p className='text-[11px] text-muted-foreground'>
            Uploaded {format(analysis.uploadedAt, 'MMM d, yyyy')} by {analysis.uploadedBy.name}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type='button' size='sm' variant='outline' className='shrink-0'>
              <Download className='mr-1.5 h-3.5 w-3.5' />
              <span className='hidden sm:inline'>Download Analysis</span>
              <span className='sm:hidden'>Download</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuItem
              onClick={() => downloadAnalysisXlsx(result, meta, analysis.warnings)}
            >
              <FileSpreadsheet className='mr-2 h-4 w-4' />
              Analysed table (Excel)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadAnalysisCsv(result, meta)}>
              <FileSpreadsheet className='mr-2 h-4 w-4' />
              Analysed table (CSV)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportSalesAnalysisPdf(reportInput)}>
              <FileText className='mr-2 h-4 w-4' />
              Summary report (PDF)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => printSalesAnalysis(reportInput)}>
              <Printer className='mr-2 h-4 w-4' />
              Print-friendly view
            </DropdownMenuItem>
            {analysis.sourceFile ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void downloadOriginal()}>
                  <Download className='mr-2 h-4 w-4' />
                  Original uploaded file
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className='text-destructive' onClick={onDelete}>
              <Trash2 className='mr-2 h-4 w-4' />
              Delete analysis
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {analysis.warnings.length > 0 ? (
        <div className='rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm'>
          <button
            type='button'
            className='flex w-full items-center gap-2 text-left font-medium text-amber-900'
            onClick={() => setShowWarnings((v) => !v)}
          >
            <AlertTriangle className='h-4 w-4 shrink-0' />
            {analysis.warnings.length} thing{analysis.warnings.length === 1 ? '' : 's'} to check
            in this file
            <span className='ml-auto text-xs font-normal underline'>
              {showWarnings ? 'Hide' : 'Show'}
            </span>
          </button>
          {showWarnings ? (
            <ul className='mt-2 space-y-1.5 pl-6 text-amber-950'>
              {analysis.warnings.map((w) => (
                <li key={w.kind} className='list-disc'>
                  {w.message}
                  {w.examples?.length ? (
                    <span className='block text-xs text-amber-800'>
                      e.g. {w.examples.slice(0, 5).join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {consolidationSlot}

      <div className='grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6'>
        <StatCard
          label='Total products'
          value={formatQty(stats.totalProducts)}
          tone='border-sky-200/80 bg-sky-50/90 text-sky-900'
        />
        <StatCard
          label='Total quantity sold'
          value={formatQty(stats.totalQuantity)}
          tone='border-emerald-200/80 bg-emerald-50/90 text-emerald-900'
        />
        {hasValue ? (
          <StatCard
            label='Total sales value'
            value={formatMoney(stats.totalValue, currency, 0)}
            tone='border-violet-200/80 bg-violet-50/90 text-violet-900'
          />
        ) : null}
        <StatCard
          label='Average quantity per product'
          value={formatQty(stats.averageQuantity, 1)}
          tone='border-teal-200/80 bg-teal-50/90 text-teal-900'
        />
        <StatCard
          label='Typical (middle) quantity'
          value={formatQty(stats.medianQuantity, 1)}
          hint='Half of products sold less than this'
          tone='border-amber-200/80 bg-amber-50/90 text-amber-900'
        />
        {hasValue ? (
          <StatCard
            label='Average sales value per product'
            value={formatMoney(stats.averageValue, currency, 0)}
            tone='border-rose-200/80 bg-rose-50/90 text-rose-900'
          />
        ) : null}
        {hasValue ? (
          <StatCard
            label='Estimated cost'
            value={formatMoney(stats.estimatedCost, currency, 0)}
            hint='Sales value ÷ 1.10'
            tone='border-slate-200/80 bg-slate-50/90 text-slate-900'
          />
        ) : null}
        {hasValue ? (
          <StatCard
            label='Estimated gross profit'
            value={formatMoney(stats.estimatedProfit, currency, 0)}
            hint='Sales value − estimated cost'
            tone='border-emerald-200/80 bg-emerald-50/90 text-emerald-900'
          />
        ) : null}
      </div>

      <SalesAiSummaryCard
        analysisId={analysis.id}
        stored={analysis.aiSummary}
        buildPayload={buildPayload}
      />

      <AdminSegmentNav
        tone='accent'
        value={section}
        onChange={(v) => setSection(v as Section)}
        items={sections}
      />

      {section === 'top' ? (
        <SectionCard
          title='View Top Products'
          description='The best and weakest sellers for this period.'
        >
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Select value={rankOption} onValueChange={setRankOption}>
              <SelectTrigger className='w-full sm:w-52'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasValue ? (
              <Select
                value={rankMetric}
                onValueChange={(v) => setRankMetric(v as SalesRankMetric)}
              >
                <SelectTrigger className='w-full sm:w-56'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METRIC_LABEL) as SalesRankMetric[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      By {METRIC_LABEL[m].toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div
            className='w-full min-w-0'
            style={{ height: Math.min(1400, Math.max(220, rankChart.length * 26 + 40)) }}
          >
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={rankChart}
                layout='vertical'
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray='3 3' horizontal={false} />
                <XAxis
                  type='number'
                  tick={{ fontSize: 11 }}
                  tickFormatter={rankMetric === 'quantity' ? undefined : moneyTick}
                />
                <YAxis type='category' dataKey='name' width={130} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) =>
                    rankMetric === 'quantity'
                      ? `${formatQty(v, 2)} units`
                      : formatMoney(v, currency)
                  }
                  labelFormatter={(_, p) => String(p?.[0]?.payload?.fullName ?? '')}
                />
                <Bar
                  dataKey='score'
                  name={METRIC_LABEL[rankMetric]}
                  fill={rankSel.dir === 'top' ? '#0f766e' : '#d97706'}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <SalesProductTable
            key={`${rankOption}-${rankMetric}`}
            products={ranked}
            hasValue={hasValue}
            hasCode={hasCode}
            currency={currency}
            onSelect={onSelectProduct}
            variant='ranking'
          />
        </SectionCard>
      ) : null}

      {section === 'slow' ? (
        <SectionCard
          title='View Slow Sellers'
          description='Products that sold very little. These are for review — not an automatic recommendation to stop stocking them.'
        >
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='mr-1 text-xs text-muted-foreground'>Sold fewer than</span>
            {SLOW_PRESETS.map((n) => (
              <Button
                key={n}
                type='button'
                size='sm'
                variant={slowThreshold === n && !customSlow ? 'default' : 'outline'}
                className='h-8'
                onClick={() => {
                  setCustomSlow('');
                  setSlowThreshold(n);
                }}
              >
                {n} units
              </Button>
            ))}
            <Input
              type='number'
              min={1}
              inputMode='numeric'
              placeholder='Custom'
              value={customSlow}
              onChange={(e) => {
                setCustomSlow(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) setSlowThreshold(n);
              }}
              className='h-8 w-24'
              aria-label='Custom slow-seller threshold'
            />
          </div>

          <p className='rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950'>
            {slow.count.toLocaleString()} product{slow.count === 1 ? '' : 's'} sold fewer than{' '}
            {slowThreshold.toLocaleString()} units during this period.
          </p>

          <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
            <StatCard
              label='Products to review'
              value={formatQty(slow.count)}
              tone='border-amber-200/80 bg-amber-50/70 text-amber-900'
            />
            <StatCard
              label='Share of catalog'
              value={formatPct(slow.catalogShare)}
              tone='border-amber-200/80 bg-amber-50/70 text-amber-900'
            />
            <StatCard
              label='Quantity they sold'
              value={formatQty(slow.totalQuantity)}
              tone='border-amber-200/80 bg-amber-50/70 text-amber-900'
            />
            {hasValue ? (
              <StatCard
                label='Sales value they brought in'
                value={formatMoney(slow.totalValue, currency, 0)}
                tone='border-amber-200/80 bg-amber-50/70 text-amber-900'
              />
            ) : null}
          </div>

          <SalesProductTable
            key={slowThreshold}
            products={slow.products}
            hasValue={hasValue}
            hasCode={hasCode}
            currency={currency}
            onSelect={onSelectProduct}
            variant='list'
            emptyMessage='No products are below this threshold.'
          />
        </SectionCard>
      ) : null}

      {section === 'spread' ? (
        <SectionCard
          title='How sales are spread'
          description='How many products fall into each sales range.'
        >
          <p className='text-xs font-medium text-muted-foreground'>Products by quantity sold</p>
          <div className='h-64 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={result.quantityDistribution}
                margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='label'
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor='end'
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} products`} />
                <Bar dataKey='count' fill='#0f766e' radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {result.valueDistribution ? (
            <>
              <p className='text-xs font-medium text-muted-foreground'>
                Products by sales value ({currency})
              </p>
              <div className='h-64 w-full min-w-0'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={result.valueDistribution}
                    margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis
                      dataKey='label'
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-25}
                      textAnchor='end'
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString()} products`} />
                    <Bar dataKey='count' fill='#7c3aed' radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : null}
        </SectionCard>
      ) : null}

      {section === 'groups' && hasValue && result.groupCounts ? (
        <SectionCard
          title='Quantity and value groups'
          description={
            <>
              “High” means the top 20% of products for that measure (at least{' '}
              {formatQty(result.highQuantityThreshold, 2)} units, or{' '}
              {formatMoney(result.highValueThreshold, currency, 0)} in sales). These are commercial
              groupings to help with purchasing — not clinical recommendations.
            </>
          }
        >
          <div className='grid gap-2 sm:grid-cols-2'>
            {SALES_GROUP_ORDER.map((g) => (
              <button
                key={g}
                type='button'
                onClick={() => setSelectedGroup(g)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors hover:bg-muted/40',
                  selectedGroup === g && 'ring-2 ring-primary'
                )}
              >
                <div className='flex items-center gap-2'>
                  <span
                    className='h-2.5 w-2.5 shrink-0 rounded-full'
                    style={{ background: GROUP_COLORS[g] }}
                  />
                  <span className='text-sm font-medium'>{SALES_GROUP_INFO[g].label}</span>
                  <Badge variant='outline' className='ml-auto tabular-nums'>
                    {result.groupCounts![g].toLocaleString()}
                  </Badge>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>{SALES_GROUP_INFO[g].guidance}</p>
              </button>
            ))}
          </div>

          <div className='h-72 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  type='number'
                  dataKey='x'
                  name='Quantity sold'
                  scale='sqrt'
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Quantity sold', position: 'insideBottom', offset: -12, fontSize: 11 }}
                />
                <YAxis
                  type='number'
                  dataKey='y'
                  name='Sales value'
                  scale='sqrt'
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11 }}
                  tickFormatter={moneyTick}
                  width={48}
                />
                <ReferenceLine x={result.highQuantityThreshold} stroke='#64748b' strokeDasharray='4 4' />
                {result.highValueThreshold !== undefined ? (
                  <ReferenceLine y={result.highValueThreshold} stroke='#64748b' strokeDasharray='4 4' />
                ) : null}
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const d = payload?.[0]?.payload as
                      | { name: string; x: number; y: number }
                      | undefined;
                    if (!d) return null;
                    return (
                      <div className='rounded-md border bg-background px-2 py-1.5 text-xs shadow'>
                        <p className='font-medium'>{d.name}</p>
                        <p>{formatQty(d.x, 2)} units</p>
                        <p>{formatMoney(d.y, currency)}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} isAnimationActive={false}>
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={GROUP_COLORS[d.group]} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {result.products.length > SCATTER_LIMIT ? (
            <p className='text-[11px] text-muted-foreground'>
              Chart shows the {SCATTER_LIMIT.toLocaleString()} highest-value products.
            </p>
          ) : null}

          <p className='text-xs font-medium'>
            {SALES_GROUP_INFO[selectedGroup].label} — {groupProducts.length.toLocaleString()}{' '}
            products
          </p>
          <SalesProductTable
            key={selectedGroup}
            products={groupProducts}
            hasValue={hasValue}
            hasCode={hasCode}
            currency={currency}
            onSelect={onSelectProduct}
            variant='list'
          />
        </SectionCard>
      ) : null}

      {section === 'value' && result.concentration ? (
        <SectionCard
          title='Which products bring in the most value'
          description='How few products make up most of your sales value.'
        >
          <div className='grid grid-cols-3 gap-2'>
            {(
              [
                ['50%', result.concentration.productsFor50],
                ['80%', result.concentration.productsFor80],
                ['95%', result.concentration.productsFor95],
              ] as const
            ).map(([label, n]) => (
              <StatCard
                key={label}
                label={`Products making ${label} of sales value`}
                value={formatQty(n)}
                hint={`${formatPct(n / stats.totalProducts)} of products`}
                tone='border-violet-200/80 bg-violet-50/70 text-violet-900'
              />
            ))}
          </div>

          <div className='h-64 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={result.concentration.curve}
                margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  type='number'
                  dataKey='catalogPct'
                  domain={[0, 100]}
                  tickFormatter={(v) => `${Math.round(v)}%`}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Share of products', position: 'insideBottom', offset: -12, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11 }}
                  width={44}
                />
                {[50, 80, 95].map((y) => (
                  <ReferenceLine key={y} y={y} stroke='#a78bfa' strokeDasharray='4 4' />
                ))}
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(1)}%`, 'Sales value so far']}
                  labelFormatter={(_, p) => {
                    const d = p?.[0]?.payload as { productCount?: number } | undefined;
                    return d?.productCount !== undefined
                      ? `Top ${d.productCount.toLocaleString()} products`
                      : '';
                  }}
                />
                <Line
                  type='monotone'
                  dataKey='cumulativePct'
                  stroke='#7c3aed'
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            {(Object.keys(CONCENTRATION_TIER_INFO) as SalesConcentrationTier[]).map((t) => (
              <button
                key={t}
                type='button'
                onClick={() => setSelectedTier(t)}
                className={cn(
                  'rounded-xl border p-3 text-left hover:bg-muted/40',
                  selectedTier === t && 'ring-2 ring-primary'
                )}
              >
                <p className='text-sm font-medium'>{CONCENTRATION_TIER_INFO[t].label}</p>
                <p className='text-xs text-muted-foreground'>
                  {tierCounts[t].toLocaleString()} products
                </p>
              </button>
            ))}
          </div>
          <p className='text-xs text-muted-foreground'>
            {CONCENTRATION_TIER_INFO[selectedTier].description}
          </p>
          <SalesProductTable
            key={selectedTier}
            products={tierProducts}
            hasValue={hasValue}
            hasCode={hasCode}
            currency={currency}
            onSelect={onSelectProduct}
            variant='list'
          />
        </SectionCard>
      ) : null}

      {section === 'all' ? (
        <SectionCard
          title='All products'
          description='Every product in the file. Tap a number column heading to sort.'
        >
          <SalesProductTable
            products={allFiltered}
            hasValue={hasValue}
            hasCode={hasCode}
            currency={currency}
            onSelect={onSelectProduct}
            variant='full'
            toolbar={
              <Select
                value={allGroupFilter}
                onValueChange={(v) => setAllGroupFilter(v as typeof allGroupFilter)}
              >
                <SelectTrigger className='w-full sm:w-60'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All groups</SelectItem>
                  {hasValue ? (
                    SALES_GROUP_ORDER.map((g) => (
                      <SelectItem key={g} value={g}>
                        {SALES_GROUP_INFO[g].label}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value='high'>High quantity</SelectItem>
                      <SelectItem value='lower'>Lower quantity</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            }
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
