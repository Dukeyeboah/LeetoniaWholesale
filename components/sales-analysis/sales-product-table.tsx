'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { overallGroupLabel } from '@/lib/sales-analytics/analyze';
import { formatMoney, formatPct, formatQty } from '@/lib/sales-analytics/format';
import type { AnalyzedSalesProduct } from '@/lib/sales-analytics/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ColumnKey =
  | 'rank'
  | 'rankByQuantity'
  | 'rankByValue'
  | 'name'
  | 'code'
  | 'quantity'
  | 'value'
  | 'unitValue'
  | 'quantityShare'
  | 'valueShare'
  | 'quantityGroup'
  | 'valueGroup'
  | 'group'
  | 'profit'
  | 'rows';

type Column = {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
  needsValue?: boolean;
  needsCode?: boolean;
};

const ALL_COLUMNS: Record<ColumnKey, Column> = {
  rank: { key: 'rank', label: 'Rank', numeric: true },
  rankByQuantity: { key: 'rankByQuantity', label: 'Rank by quantity', numeric: true },
  rankByValue: { key: 'rankByValue', label: 'Rank by value', numeric: true, needsValue: true },
  name: { key: 'name', label: 'Product name' },
  code: { key: 'code', label: 'Code / SKU', needsCode: true },
  quantity: { key: 'quantity', label: 'Quantity sold', numeric: true },
  value: { key: 'value', label: 'Sales value', numeric: true, needsValue: true },
  unitValue: { key: 'unitValue', label: 'Avg value per unit', numeric: true, needsValue: true },
  quantityShare: { key: 'quantityShare', label: 'Share of quantity', numeric: true },
  valueShare: { key: 'valueShare', label: 'Share of value', numeric: true, needsValue: true },
  quantityGroup: { key: 'quantityGroup', label: 'Quantity group' },
  valueGroup: { key: 'valueGroup', label: 'Value group', needsValue: true },
  group: { key: 'group', label: 'Overall group' },
  profit: { key: 'profit', label: 'Est. gross profit', numeric: true, needsValue: true },
  rows: { key: 'rows', label: 'Rows combined', numeric: true },
};

const VARIANT_COLUMNS: Record<'ranking' | 'list' | 'full', ColumnKey[]> = {
  ranking: ['rank', 'name', 'quantity', 'value', 'unitValue', 'quantityShare', 'valueShare'],
  list: ['name', 'code', 'quantity', 'value', 'unitValue', 'group'],
  full: [
    'rankByQuantity',
    'rankByValue',
    'name',
    'code',
    'quantity',
    'value',
    'unitValue',
    'profit',
    'rows',
    'quantityGroup',
    'valueGroup',
    'group',
  ],
};

const PAGE = 50;

type Props = {
  products: AnalyzedSalesProduct[];
  hasValue: boolean;
  hasCode: boolean;
  currency: string;
  variant?: 'ranking' | 'list' | 'full';
  emptyMessage?: string;
  /** Extra filter controls rendered next to the search box. */
  toolbar?: React.ReactNode;
  /** Opens the source rows behind a product. */
  onSelect?: (p: AnalyzedSalesProduct) => void;
};

function numericValue(p: AnalyzedSalesProduct, key: ColumnKey, rank: number): number {
  switch (key) {
    case 'rank':
      return rank;
    case 'rankByQuantity':
      return p.rankByQuantity;
    case 'rankByValue':
      return p.rankByValue ?? Infinity;
    case 'quantity':
      return p.quantity;
    case 'value':
      return p.value ?? 0;
    case 'unitValue':
      return p.unitValue ?? -1;
    case 'quantityShare':
      return p.quantityShare;
    case 'valueShare':
      return p.valueShare ?? 0;
    case 'profit':
      return p.estimatedProfit ?? 0;
    case 'rows':
      return p.rowCount ?? 1;
    default:
      return 0;
  }
}

export function SalesProductTable({
  products,
  hasValue,
  hasCode,
  currency,
  variant = 'list',
  emptyMessage = 'No products to show.',
  toolbar,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 'asc' | 'desc' } | null>(null);
  const [visible, setVisible] = useState(PAGE);

  const columns = useMemo(
    () =>
      VARIANT_COLUMNS[variant]
        .map((k) => ALL_COLUMNS[k])
        .filter((c) => (!c.needsValue || hasValue) && (!c.needsCode || hasCode)),
    [variant, hasValue, hasCode]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.map((p, i) => ({ p, rank: i + 1 }));
    if (q) {
      list = list.filter(
        ({ p }) => p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)
      );
    }
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort(
        (a, b) =>
          (numericValue(a.p, sort.key, a.rank) - numericValue(b.p, sort.key, b.rank)) * dir
      );
    }
    return list;
  }, [products, search, sort]);

  const toggleSort = (key: ColumnKey) => {
    setVisible(PAGE);
    const firstDir = key.startsWith('rank') ? 'asc' : 'desc';
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: firstDir };
      if (s.dir === firstDir) return { key, dir: firstDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  };

  const cell = (p: AnalyzedSalesProduct, key: ColumnKey, rank: number): React.ReactNode => {
    switch (key) {
      case 'rank':
        return rank;
      case 'rankByQuantity':
        return p.rankByQuantity;
      case 'rankByValue':
        return p.rankByValue ?? '—';
      case 'name':
        return onSelect ? (
          <button
            type='button'
            className='text-left hover:text-primary hover:underline'
            onClick={() => onSelect(p)}
          >
            {p.name}
            {(p.rowCount ?? 1) > 1 ? (
              <span className='ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-normal text-emerald-800'>
                {p.rowCount} rows
              </span>
            ) : null}
          </button>
        ) : (
          p.name
        );
      case 'profit':
        return formatMoney(p.estimatedProfit, currency);
      case 'rows':
        return p.rowCount ?? 1;
      case 'code':
        return p.code ?? '—';
      case 'quantity':
        return formatQty(p.quantity, 2);
      case 'value':
        return formatMoney(p.value, currency);
      case 'unitValue':
        return formatMoney(p.unitValue, currency);
      case 'quantityShare':
        return formatPct(p.quantityShare, 2);
      case 'valueShare':
        return formatPct(p.valueShare, 2);
      case 'quantityGroup':
        return p.quantityGroup === 'high' ? 'High' : 'Lower';
      case 'valueGroup':
        return p.valueGroup === 'high' ? 'High' : 'Lower';
      case 'group':
        return overallGroupLabel(p);
    }
  };

  return (
    <div className='min-w-0 space-y-2'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='relative min-w-0 flex-1'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(PAGE);
            }}
            placeholder={hasCode ? 'Search product name or code…' : 'Search product name…'}
            className='h-9 pl-9'
            aria-label='Search products'
          />
        </div>
        {toolbar}
      </div>

      <div className='w-full min-w-0 overflow-x-auto rounded-md border bg-card'>
        <table className='w-full min-w-[40rem] text-sm'>
          <thead className='bg-muted/40 text-xs text-muted-foreground'>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 font-medium',
                      c.numeric ? 'text-right' : 'text-left'
                    )}
                  >
                    {c.numeric ? (
                      <button
                        type='button'
                        onClick={() => toggleSort(c.key)}
                        className='inline-flex items-center gap-1 hover:text-foreground'
                        aria-label={`Sort by ${c.label}`}
                      >
                        {c.label}
                        {active ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp className='h-3 w-3' />
                          ) : (
                            <ArrowDown className='h-3 w-3' />
                          )
                        ) : (
                          <ArrowUpDown className='h-3 w-3 opacity-40' />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className='px-3 py-8 text-center text-muted-foreground'>
                  {search ? 'No products match your search.' : emptyMessage}
                </td>
              </tr>
            ) : (
              rows.slice(0, visible).map(({ p, rank }) => (
                <tr key={`${p.rankByQuantity}-${p.name}`} className='hover:bg-muted/30'>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2',
                        c.numeric ? 'whitespace-nowrap text-right tabular-nums' : '',
                        c.key === 'name' && 'max-w-[18rem] font-medium',
                        c.key === 'code' && 'font-mono text-xs text-muted-foreground'
                      )}
                    >
                      {cell(p, c.key, rank)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > visible ? (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-full'
          onClick={() => setVisible((v) => v + PAGE)}
        >
          Show more ({visible.toLocaleString()} of {rows.length.toLocaleString()})
        </Button>
      ) : rows.length > 0 ? (
        <p className='text-xs text-muted-foreground'>
          Showing {rows.length.toLocaleString()} product{rows.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
