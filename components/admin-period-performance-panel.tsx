'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Lightbulb, Package } from 'lucide-react';
import type { AnalyticsPeriodProductRow } from '@/types';
import {
  buildPeriodInsights,
  formatPeriodScore,
  getPeriodPerformance,
  periodHasData,
  periodMetricLabel,
  periodRowPrimaryScore,
  rankedPeriodRows,
  type PeriodMetricKey,
} from '@/lib/analytics-period';
import { AdminSegmentNav } from '@/components/admin-overview-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const METRIC_ITEMS: {
  value: PeriodMetricKey;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'ito', label: 'Inventory turnover', shortLabel: 'ITO' },
  { value: 'byQuantity', label: 'Quantity', shortLabel: 'Qty' },
  { value: 'byValue', label: 'Value', shortLabel: 'Value' },
];

const TOP_N_PRESETS = [10, 50, 100, 200] as const;
const TOP_N_PRESET_SET = new Set<number>(TOP_N_PRESETS);

function chartLabel(name: string, wide: boolean): string {
  const max = wide ? 28 : 18;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function availableTopNOptions(listSize: number): number[] {
  if (listSize <= 0) return [10];
  const opts: number[] = TOP_N_PRESETS.filter((n) => n < listSize);
  if (listSize > 0 && !opts.includes(listSize)) {
    opts.push(listSize);
  }
  if (opts.length === 0) return [listSize];
  return opts;
}

export function AdminPeriodPerformancePanel() {
  const period = useMemo(() => getPeriodPerformance(), []);
  const [metric, setMetric] = useState<PeriodMetricKey>('ito');
  const [topN, setTopN] = useState(10);
  const hasData = periodHasData(period);
  const rows = useMemo(
    () => rankedPeriodRows(period, metric),
    [period, metric]
  );
  const topOptions = useMemo(
    () => availableTopNOptions(rows.length),
    [rows.length]
  );

  useEffect(() => {
    if (topOptions.length === 0) return;
    if (!topOptions.includes(topN)) {
      setTopN(topOptions[0] ?? 10);
    }
  }, [topOptions, topN]);

  const visibleRows = useMemo(
    () => rows.slice(0, Math.min(topN, rows.length)),
    [rows, topN]
  );

  const useHorizontalChart = visibleRows.length > 15;
  const chartRows = useMemo(
    () =>
      visibleRows.map((row) => ({
        name: chartLabel(row.name, useHorizontalChart),
        fullName: row.name,
        score: periodRowPrimaryScore(row, metric),
      })),
    [visibleRows, metric, useHorizontalChart]
  );
  const chartHeight = useHorizontalChart
    ? Math.min(720, Math.max(280, visibleRows.length * 28))
    : 224;

  const insights = useMemo(() => buildPeriodInsights(period), [period]);

  return (
    <div className='w-full min-w-0 max-w-full space-y-3 overflow-x-hidden rounded-2xl border border-teal-200/80 bg-teal-50/70 p-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h2 className='text-xs font-semibold tracking-wide text-teal-900'>
            Period performance
          </h2>
          <p className='mt-0.5 text-sm font-medium text-teal-950'>
            {period.title}
          </p>
          <p className='text-[11px] text-muted-foreground'>
            {period.periodStart} → {period.periodEnd}
            {period.sourceNote ? ` · ${period.sourceNote}` : ''}
          </p>
        </div>
        <Badge variant='outline' className='w-fit border-teal-300 bg-white/80'>
          {hasData
            ? `${rows.length} products in ${periodMetricLabel(metric)}`
            : 'Awaiting import'}
        </Badge>
      </div>

      <AdminSegmentNav
        tone='accent'
        value={metric}
        onChange={(value) => setMetric(value as PeriodMetricKey)}
        items={METRIC_ITEMS}
      />

      {!hasData ? (
        <div className='rounded-xl border border-dashed border-teal-300/80 bg-white/70 px-4 py-8 text-center'>
          <Package className='mx-auto mb-2 h-8 w-8 text-teal-700/50' />
          <p className='text-sm font-medium text-teal-950'>
            Ready for your yearly lists
          </p>
          <p className='mx-auto mt-1 max-w-md text-xs text-muted-foreground'>
            Send ITO, quantity (with prices), and value rankings for the last
            year — we&apos;ll load them into{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-[10px]'>
              data/analytics/period-performance.json
            </code>{' '}
            so these charts and purchase insights light up.
          </p>
        </div>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='mr-1 text-xs text-muted-foreground'>Show</span>
            {topOptions.map((n) => (
              <Button
                key={n}
                type='button'
                size='sm'
                variant={topN === n ? 'default' : 'outline'}
                className='h-8 shrink-0'
                onClick={() => setTopN(n)}
              >
                {n === rows.length && !TOP_N_PRESET_SET.has(n)
                  ? `All (${n})`
                  : `Top ${n}`}
              </Button>
            ))}
          </div>

          <div className='grid gap-3 lg:grid-cols-5'>
            <div className='rounded-xl border border-teal-200/70 bg-white/85 p-3 lg:col-span-3'>
              <p className='mb-2 text-xs font-medium text-muted-foreground'>
                Top {visibleRows.length} · {periodMetricLabel(metric)}
              </p>
              <div
                className='w-full min-w-0 overflow-x-auto'
                style={{ height: chartHeight }}
              >
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={chartRows}
                    layout={useHorizontalChart ? 'vertical' : 'horizontal'}
                    margin={
                      useHorizontalChart
                        ? { top: 8, right: 16, left: 8, bottom: 8 }
                        : { top: 8, right: 8, left: 0, bottom: 48 }
                    }
                  >
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    {useHorizontalChart ? (
                      <>
                        <XAxis type='number' tick={{ fontSize: 11 }} />
                        <YAxis
                          type='category'
                          dataKey='name'
                          width={110}
                          tick={{ fontSize: 10 }}
                        />
                      </>
                    ) : (
                      <>
                        <XAxis
                          dataKey='name'
                          tick={{ fontSize: 10 }}
                          interval={0}
                          angle={-35}
                          textAnchor='end'
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 11 }} width={48} />
                      </>
                    )}
                    <Tooltip
                      formatter={(value: number) =>
                        metric === 'byValue'
                          ? `₵${Number(value).toLocaleString()}`
                          : metric === 'byQuantity'
                            ? `${Number(value).toLocaleString()} units`
                            : Number(value).toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })
                      }
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? '')
                      }
                    />
                    <Bar
                      dataKey='score'
                      fill='#0f766e'
                      radius={
                        useHorizontalChart ? [0, 4, 4, 0] : [4, 4, 0, 0]
                      }
                      maxBarSize={useHorizontalChart ? 18 : 36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className='flex min-h-0 flex-col rounded-xl border border-teal-200/70 bg-white/85 p-3 lg:col-span-2'>
              <p className='mb-2 text-xs font-medium text-muted-foreground'>
                Ranking · showing {visibleRows.length} of {rows.length}
              </p>
              <ul className='max-h-72 space-y-1.5 overflow-y-auto overscroll-contain'>
                {visibleRows.map((row) => (
                  <PeriodRowItem
                    key={`${metric}-${row.rank}-${row.name}`}
                    row={row}
                    metric={metric}
                  />
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      <div className='rounded-xl border border-teal-200/70 bg-white/80 p-3'>
        <h3 className='mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-teal-900'>
          <Lightbulb className='h-3.5 w-3.5' />
          Purchase & focus insights
        </h3>
        <ul className='space-y-1.5'>
          {insights.map((line) => (
            <li
              key={line}
              className='rounded-lg border border-teal-100 bg-teal-50/50 px-2.5 py-2 text-sm text-teal-950'
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PeriodRowItem({
  row,
  metric,
}: {
  row: AnalyticsPeriodProductRow;
  metric: PeriodMetricKey;
}) {
  return (
    <li className='flex items-start justify-between gap-2 rounded-lg border border-teal-100 px-2 py-1.5 text-sm'>
      <div className='min-w-0'>
        <p className='truncate font-medium'>
          <span className='mr-1.5 text-muted-foreground'>{row.rank}.</span>
          {row.name}
        </p>
        <p className='truncate text-[11px] text-muted-foreground'>
          {[
            row.code ? `Code ${row.code}` : null,
            row.unitPrice != null ? `₵${row.unitPrice.toFixed(2)}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
      </div>
      <p className='shrink-0 text-right text-[11px] font-medium tabular-nums text-teal-900'>
        {formatPeriodScore(row, metric)}
        {metric !== 'byValue' && row.value != null ? (
          <span className='mt-0.5 block font-normal text-muted-foreground'>
            ₵{row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        ) : null}
        {metric === 'byValue' && row.quantity != null ? (
          <span className='mt-0.5 block font-normal text-muted-foreground'>
            {row.quantity.toLocaleString()} units
          </span>
        ) : null}
      </p>
    </li>
  );
}
