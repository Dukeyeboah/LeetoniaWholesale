'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Download, FileSpreadsheet, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { storage } from '@/lib/firebase';
import { analysisFileBaseName } from '@/lib/sales-analytics/export';
import { getSalesSourceFileUrl } from '@/lib/sales-analytics/store';
import type { SavedSalesAnalysis } from '@/lib/sales-analytics/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SnapshotColumn<T> = {
  key: string;
  label: string;
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
  /** Plain value for sorting and Excel export. */
  value: (row: T) => string | number;
};

const PAGE = 50;

export function SnapshotStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2.5', tone)}>
      <p className='text-xs'>{label}</p>
      <p className='mt-1 font-serif text-lg font-semibold tabular-nums leading-tight sm:text-xl'>{value}</p>
      {hint ? <p className='mt-0.5 text-[11px] text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export function downloadRowsXlsx<T>(rows: T[], columns: SnapshotColumn<T>[], sheet: string, fileBase: string) {
  const aoa = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.value(r)))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.slice(0, 31));
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}

export function SnapshotTable<T>({
  rows,
  columns,
  searchText,
  emptyMessage = 'Nothing to show.',
  rowClassName,
}: {
  rows: T[];
  columns: SnapshotColumn<T>[];
  searchText: (row: T) => string;
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const x = col.value(a);
          const y = col.value(b);
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
        });
      }
    }
    return out;
  }, [rows, search, sort, columns, searchText]);

  return (
    <div className='min-w-0 space-y-2'>
      <div className='relative'>
        <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE);
          }}
          placeholder='Search…'
          className='h-9 pl-9'
          aria-label='Search'
        />
      </div>
      <div className='w-full min-w-0 overflow-x-auto rounded-md border bg-card'>
        <table className='w-full min-w-[36rem] text-sm'>
          <thead className='bg-muted/40 text-xs text-muted-foreground'>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('whitespace-nowrap px-3 py-2 font-medium', c.numeric ? 'text-right' : 'text-left')}>
                  <button
                    type='button'
                    className='hover:text-foreground'
                    onClick={() =>
                      setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))
                    }
                  >
                    {c.label}
                    {sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {list.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className='px-3 py-8 text-center text-muted-foreground'>
                  {search ? 'No matches.' : emptyMessage}
                </td>
              </tr>
            ) : (
              list.slice(0, visible).map((r, i) => (
                <tr key={i} className={cn('hover:bg-muted/30', rowClassName?.(r))}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('px-3 py-2', c.numeric ? 'whitespace-nowrap text-right tabular-nums' : '', c.key === 'name' && 'max-w-[18rem] font-medium')}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {list.length > visible ? (
        <Button type='button' variant='outline' size='sm' className='w-full' onClick={() => setVisible((v) => v + PAGE)}>
          Show more ({visible.toLocaleString()} of {list.length.toLocaleString()})
        </Button>
      ) : list.length > 0 ? (
        <p className='text-xs text-muted-foreground'>Showing {list.length.toLocaleString()}</p>
      ) : null}
    </div>
  );
}

export function SnapshotHeader({
  analysis,
  subtitle,
  onBack,
  onDelete,
  onDownload,
}: {
  analysis: SavedSalesAnalysis;
  subtitle: string;
  onBack: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const downloadOriginal = async () => {
    if (!analysis.sourceFile) return;
    try {
      window.open(await getSalesSourceFileUrl(storage, analysis.sourceFile.path), '_blank', 'noopener');
    } catch (e) {
      console.error('download original file', e);
      toast.error('Could not download the original file.');
    }
  };
  return (
    <div className='flex items-start justify-between gap-2'>
      <div className='min-w-0'>
        <Button type='button' variant='ghost' size='sm' className='-ml-2 mb-1 h-7 px-2 text-xs text-muted-foreground' onClick={onBack}>
          <ArrowLeft className='mr-1 h-3.5 w-3.5' />
          All analyses
        </Button>
        <h3 className='truncate font-serif text-lg font-semibold text-primary'>{analysis.name}</h3>
        <p className='text-xs text-muted-foreground'>
          {subtitle} · {analysis.fileName}
        </p>
        <p className='text-[11px] text-muted-foreground'>
          Uploaded {format(analysis.uploadedAt, 'MMM d, yyyy')} by {analysis.uploadedBy.name}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type='button' size='sm' variant='outline' className='shrink-0'>
            <MoreHorizontal className='mr-1.5 h-3.5 w-3.5' />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuItem onClick={onDownload}>
            <FileSpreadsheet className='mr-2 h-4 w-4' />
            Download list (Excel)
          </DropdownMenuItem>
          {analysis.sourceFile ? (
            <DropdownMenuItem onClick={() => void downloadOriginal()}>
              <Download className='mr-2 h-4 w-4' />
              Original uploaded file
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className='text-destructive' onClick={onDelete}>
            <Trash2 className='mr-2 h-4 w-4' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function snapshotFileBase(analysis: SavedSalesAnalysis, suffix: string): string {
  return `${analysisFileBaseName(analysis)}-${suffix}`;
}
