'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { expiringInRange, isoDay, type ExpiryItem } from '@/lib/sales-analytics/expiry';
import { formatMoney, formatQty } from '@/lib/sales-analytics/format';
import type { SalesProductRow, SalesSourceRow, SavedSalesAnalysis } from '@/lib/sales-analytics/types';
import {
  downloadRowsXlsx,
  SnapshotHeader,
  SnapshotStat,
  SnapshotTable,
  snapshotFileBase,
  type SnapshotColumn,
} from '@/components/sales-analysis/snapshot-shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Preset = '30d' | '3m' | '6m' | 'year' | 'custom';

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function rangeFor(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const now = new Date();
  const from = isoDay(now);
  if (preset === '30d') return { from, to: isoDay(addDays(now, 30)) };
  if (preset === '3m') return { from, to: isoDay(addMonths(now, 3)) };
  if (preset === '6m') return { from, to: isoDay(addMonths(now, 6)) };
  return { from, to: `${now.getFullYear()}-12-31` };
}

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

export function ExpiryDashboard({
  analysis,
  products,
  sourceRows,
  consolidationSlot,
  onBack,
  onDelete,
  onSelectProduct,
}: {
  analysis: SavedSalesAnalysis;
  products: SalesProductRow[];
  sourceRows: SalesSourceRow[];
  consolidationSlot?: React.ReactNode;
  onBack: () => void;
  onDelete: () => void;
  onSelectProduct: (p: SalesProductRow) => void;
}) {
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState(() => rangeFor('year'));
  const range = preset === 'custom' ? custom : rangeFor(preset);
  const currency = analysis.currency;

  const result = useMemo(
    () => expiringInRange(products, sourceRows, range.from, range.to),
    [products, sourceRows, range.from, range.to]
  );

  const columns: SnapshotColumn<ExpiryItem>[] = [
    {
      key: 'name',
      label: 'Product',
      render: (r) => (
        <button type='button' className='text-left hover:text-primary hover:underline' onClick={() => onSelectProduct(r.product)}>
          {r.name}
        </button>
      ),
      value: (r) => r.name,
    },
    ...(analysis.hasCode
      ? [{ key: 'code', label: 'Code', render: (r: ExpiryItem) => r.code ?? '—', value: (r: ExpiryItem) => r.code ?? '' }]
      : []),
    { key: 'earliest', label: 'Earliest expiry', render: (r) => prettyDate(r.earliest), value: (r) => r.earliest },
    { key: 'quantity', label: 'Qty expiring', numeric: true, render: (r) => formatQty(r.quantity, 2), value: (r) => r.quantity },
    { key: 'batches', label: 'Batches', numeric: true, render: (r) => r.batches, value: (r) => r.batches },
    { key: 'stock', label: 'Total stock', numeric: true, render: (r) => formatQty(r.product.quantity, 2), value: (r) => r.product.quantity },
    ...(result.totalValue !== undefined
      ? [
          {
            key: 'value',
            label: `Value at risk (${currency})`,
            numeric: true,
            render: (r: ExpiryItem) => formatMoney(r.valueAtRisk, currency),
            value: (r: ExpiryItem) => Math.round((r.valueAtRisk ?? 0) * 100) / 100,
          },
        ]
      : []),
  ];

  const soonCutoff = isoDay(addDays(new Date(), 30));

  const presets: { value: Preset; label: string }[] = [
    { value: '30d', label: 'Next 30 days' },
    { value: '3m', label: 'Next 3 months' },
    { value: '6m', label: 'Next 6 months' },
    { value: 'year', label: `Until 31 Dec ${new Date().getFullYear()}` },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className='w-full min-w-0 max-w-full space-y-4'>
      <SnapshotHeader
        analysis={analysis}
        subtitle={`Expiry list dated ${prettyDate(analysis.periodEnd)}`}
        onBack={onBack}
        onDelete={onDelete}
        onDownload={() =>
          downloadRowsXlsx(result.items, columns, 'Expiring', snapshotFileBase(analysis, `expiring-${range.from}-to-${range.to}`))
        }
      />

      {consolidationSlot}

      <div className='space-y-2 rounded-2xl border bg-card p-3 sm:p-4'>
        <p className='text-sm font-semibold'>Show products expiring</p>
        <div className='flex flex-wrap gap-1.5'>
          {presets.map((p) => (
            <Button
              key={p.value}
              type='button'
              size='sm'
              variant={preset === p.value ? 'default' : 'outline'}
              className='h-8'
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <Input type='date' className='h-9 w-44' value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span className='text-muted-foreground'>to</span>
            <Input type='date' className='h-9 w-44' value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        ) : null}
        <p className='text-xs text-muted-foreground'>
          {prettyDate(range.from)} → {prettyDate(range.to)}
        </p>
      </div>

      <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
        <SnapshotStat
          label='Products expiring in range'
          value={formatQty(result.items.length)}
          tone='border-amber-200/80 bg-amber-50/90 text-amber-900'
        />
        <SnapshotStat
          label='Units expiring in range'
          value={formatQty(result.totalQuantity)}
          tone='border-orange-200/80 bg-orange-50/90 text-orange-900'
        />
        {result.totalValue !== undefined ? (
          <SnapshotStat
            label='Value at risk'
            value={formatMoney(result.totalValue, currency, 0)}
            hint='Quantity × unit price'
            tone='border-rose-200/80 bg-rose-50/90 text-rose-900'
          />
        ) : null}
        <SnapshotStat
          label='Already expired'
          value={formatQty(result.expiredProducts)}
          hint={`${formatQty(result.expiredQuantity)} units before ${prettyDate(range.from)}`}
          tone='border-red-200/80 bg-red-50/90 text-red-900'
        />
      </div>

      {result.expiredProducts > 0 ? (
        <p className='flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900'>
          <AlertTriangle className='h-4 w-4 shrink-0' />
          {result.expiredProducts} product(s) on this list have already expired stock.
        </p>
      ) : null}

      {result.byMonth.length > 0 ? (
        <div className='rounded-2xl border bg-card p-3 sm:p-4'>
          <p className='mb-2 text-sm font-semibold'>Units expiring by month</p>
          <div className='h-56 w-full min-w-0'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={result.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='month'
                  tick={{ fontSize: 11 }}
                  tickFormatter={(m: string) => format(parseISO(`${m}-01`), 'MMM yy')}
                />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString()} units`, 'Expiring']}
                  labelFormatter={(m: string) => format(parseISO(`${m}-01`), 'MMMM yyyy')}
                />
                <Bar dataKey='quantity' fill='#d97706' radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className='rounded-2xl border bg-card p-3 sm:p-4'>
        <p className='mb-2 text-sm font-semibold'>Expiring products</p>
        <SnapshotTable
          rows={result.items}
          columns={columns}
          searchText={(r) => `${r.name} ${r.code ?? ''}`}
          emptyMessage='Nothing on this list expires in the selected range.'
          rowClassName={(r) => (r.earliest <= soonCutoff ? 'bg-red-50/60' : undefined)}
        />
        <p className='mt-1 text-[11px] text-muted-foreground'>Red rows expire within 30 days.</p>
      </div>
    </div>
  );
}
