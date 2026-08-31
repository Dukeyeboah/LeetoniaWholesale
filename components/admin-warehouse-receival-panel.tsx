'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { format } from 'date-fns';
import {
  Check,
  ClipboardCheck,
  Download,
  Loader2,
  Printer,
  Search,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import type { WarehouseReceival, WarehouseReceivalLine } from '@/types';
import {
  buildSeptember2026Receival,
  effectiveReceivedQty,
  filterReceivalLines,
  receivalLineHasQtyDiscrepancy,
  receivalLineTone,
  receivalSummary,
  sanitizeReceivalLinesForFirestore,
  searchReceivalLines,
  SEPTEMBER_2026_RECEIVAL_ID,
  setReceivalLineReceivedQty,
  toggleReceivalLineArrived,
  type ReceivalListFilter,
} from '@/lib/warehouse-receival';
import {
  exportReceivalCsv,
  exportReceivalPdf,
  printReceivalHtml,
} from '@/lib/warehouse-receival-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminLoadingPanel } from '@/components/admin-loading-panel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FILTER_OPTIONS: { value: ReceivalListFilter; label: string }[] = [
  { value: 'all', label: 'All lines' },
  { value: 'arrived', label: 'Arrived only' },
  { value: 'pending', label: 'Not arrived' },
];

export function AdminWarehouseReceivalPanel() {
  const [receival, setReceival] = useState<WarehouseReceival | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<ReceivalListFilter>('all');
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const seedAttempted = useRef(false);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'warehouseReceivals', SEPTEMBER_2026_RECEIVAL_ID);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          setReceival({ id: snap.id, ...snap.data() } as WarehouseReceival);
          setLoading(false);
          return;
        }

        if (seedAttempted.current) {
          setReceival(null);
          setLoading(false);
          return;
        }
        seedAttempted.current = true;

        const seed = buildSeptember2026Receival();
        if (seed.lines.length === 0) {
          setReceival(null);
          setLoading(false);
          return;
        }

        try {
          await setDoc(ref, {
            ...seed,
            lines: sanitizeReceivalLinesForFirestore(seed.lines),
          });
        } catch (e) {
          console.error('seed warehouse receival', e);
          toast.error('Could not create receival checklist.');
          setLoading(false);
        }
      },
      (err) => {
        console.error('warehouseReceivals listener', err);
        toast.error('Could not load receival checklist.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredLines = useMemo(() => {
    if (!receival) return [];
    let lines = filterReceivalLines(receival.lines, listFilter);
    lines = searchReceivalLines(lines, searchQuery);
    return lines;
  }, [receival, listFilter, searchQuery]);

  const summary = useMemo(
    () => receivalSummary(receival?.lines ?? []),
    [receival]
  );

  const persistLines = useCallback(
    async (nextLines: WarehouseReceivalLine[]) => {
      if (!db || !receival) return;
      await updateDoc(doc(db, 'warehouseReceivals', receival.id), {
        lines: sanitizeReceivalLinesForFirestore(nextLines),
        updatedAt: Date.now(),
      });
    },
    [receival]
  );

  const handleToggleArrived = async (lineId: string, arrived: boolean) => {
    if (!receival) return;
    setSavingLineId(lineId);
    const next = toggleReceivalLineArrived(receival.lines, lineId, arrived);
    try {
      await persistLines(next);
    } catch (e) {
      console.error(e);
      toast.error('Could not save — try again.');
    } finally {
      setSavingLineId(null);
    }
  };

  const handleMarkAllVisible = async (arrived: boolean) => {
    if (!receival || filteredLines.length === 0) return;
    const ids = new Set(filteredLines.map((l) => l.id));
    let next = receival.lines;
    for (const id of ids) {
      next = toggleReceivalLineArrived(next, id, arrived);
    }
    setSavingLineId('batch');
    try {
      await persistLines(next);
      toast.success(
        arrived
          ? `Marked ${ids.size} line${ids.size === 1 ? '' : 's'} as arrived`
          : `Cleared arrived on ${ids.size} line${ids.size === 1 ? '' : 's'}`
      );
    } catch (e) {
      console.error(e);
      toast.error('Could not save batch update.');
    } finally {
      setSavingLineId(null);
    }
  };

  const handleReceivedQtyBlur = async (lineId: string, raw: string) => {
    if (!receival) return;
    setSavingLineId(lineId);
    const next = setReceivalLineReceivedQty(receival.lines, lineId, raw);
    try {
      await persistLines(next);
    } catch (e) {
      console.error(e);
      toast.error('Could not save received quantity.');
    } finally {
      setSavingLineId(null);
    }
  };

  const handleReseedFromFile = async () => {
    if (!db) return;
    const seed = buildSeptember2026Receival();
    if (seed.lines.length === 0) {
      toast.error(
        'No lines in data/warehouse-receivals/2026-09.json yet. Add the shipment list first.'
      );
      return;
    }
    if (
      receival &&
      receival.lines.some((l) => l.arrived) &&
      !window.confirm(
        'Re-import will replace all lines and clear arrived checks. Continue?'
      )
    ) {
      return;
    }
    try {
      await setDoc(doc(db, 'warehouseReceivals', SEPTEMBER_2026_RECEIVAL_ID), {
        ...seed,
        lines: sanitizeReceivalLinesForFirestore(seed.lines),
        updatedAt: Date.now(),
      });
      toast.success(`Loaded ${seed.lines.length} lines from file.`);
    } catch (e) {
      console.error(e);
      toast.error('Could not import receival list.');
    }
  };

  if (loading) {
    return (
      <AdminLoadingPanel
        title='Loading port receival checklist…'
        subtitle='September 2026 warehouse shipment'
      />
    );
  }

  if (!receival || receival.lines.length === 0) {
    return (
      <div className='rounded-md border bg-card p-8 text-center'>
        <ClipboardCheck className='mx-auto mb-3 h-10 w-10 text-muted-foreground/60' />
        <h3 className='font-serif text-lg font-semibold'>
          September 2026 warehouse receival
        </h3>
        <p className='mx-auto mt-2 max-w-md text-sm text-muted-foreground'>
          No shipment list loaded yet. Add your port manifest to{' '}
          <code className='rounded bg-muted px-1 py-0.5 text-xs'>
            data/warehouse-receivals/2026-09.json
          </code>{' '}
          (barcode, item name, quantity, unit price, total), then import below.
        </p>
        <Button className='mt-4' onClick={() => void handleReseedFromFile()}>
          Import from file
        </Button>
      </div>
    );
  }

  const progressPct =
    summary.total > 0 ? Math.round((summary.arrived / summary.total) * 100) : 0;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h3 className='font-serif text-lg font-semibold text-primary'>
            {receival.title}
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            Check off each line as it is confirmed on the palette. Matching
            quantities turn green; enter a different received qty to flag orange
            discrepancies.
          </p>
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='tabular-nums'>
              {summary.arrived} / {summary.total} arrived
            </Badge>
            <Badge
              variant='outline'
              className='border-emerald-200 bg-emerald-50 text-emerald-800 tabular-nums'
            >
              {summary.receivedQty.toLocaleString()} /{' '}
              {summary.expectedQty.toLocaleString()} units
            </Badge>
            {summary.discrepancies > 0 ? (
              <Badge
                variant='outline'
                className='border-orange-300 bg-orange-50 text-orange-900 tabular-nums'
              >
                {summary.discrepancies} qty mismatch
                {summary.discrepancies === 1 ? '' : 'es'}
              </Badge>
            ) : null}
            <span className='text-xs text-muted-foreground'>
              Updated{' '}
              {receival.updatedAt
                ? format(receival.updatedAt, 'MMM d, h:mm a')
                : '—'}
            </span>
          </div>
          <div className='mt-3 h-2 max-w-md overflow-hidden rounded-full bg-muted'>
            <div
              className='h-full rounded-full bg-emerald-600 transition-all duration-300'
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type='button' variant='outline' size='sm' className='shrink-0'>
              <Download className='mr-1.5 h-3.5 w-3.5' />
              Export / print
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuLabel>PDF</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                exportReceivalPdf(receival, 'all', { splitSections: false })
              }
            >
              Full list (arrived highlighted)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                exportReceivalPdf(receival, 'all', { splitSections: true })
              }
            >
              Split: arrived / pending sections
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportReceivalPdf(receival, 'arrived')}
            >
              Arrived only
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportReceivalPdf(receival, 'pending')}
            >
              Pending only
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Excel (CSV)</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => exportReceivalCsv(receival, 'all')}>
              Full list
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportReceivalCsv(receival, 'arrived')}
            >
              Arrived only
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportReceivalCsv(receival, 'pending')}
            >
              Pending only
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Print</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                printReceivalHtml(receival, 'all', { splitSections: false })
              }
            >
              <Printer className='mr-2 h-3.5 w-3.5' />
              Full list (coloured)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                printReceivalHtml(receival, 'all', { splitSections: true })
              }
            >
              <Printer className='mr-2 h-3.5 w-3.5' />
              Split sections
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative min-w-0 flex-1 sm:max-w-sm'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search by item name or barcode…'
            className='h-9 pl-9'
            aria-label='Search receival list'
          />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type='button'
              size='sm'
              variant={listFilter === opt.value ? 'default' : 'outline'}
              className='h-8'
              onClick={() => setListFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className='flex flex-wrap gap-1.5 sm:ml-auto'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            className='h-8'
            disabled={filteredLines.length === 0 || savingLineId === 'batch'}
            onClick={() => void handleMarkAllVisible(true)}
          >
            <Check className='mr-1 h-3.5 w-3.5' />
            Mark visible arrived
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-8'
            disabled={filteredLines.length === 0 || savingLineId === 'batch'}
            onClick={() => void handleReseedFromFile()}
          >
            Re-import list
          </Button>
        </div>
      </div>

      <div className='overflow-hidden rounded-md border bg-card'>
        <div className='hidden border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[2.5rem_minmax(5rem,6rem)_1fr_4rem_4.5rem_5rem_5rem] md:gap-3'>
          <span>OK</span>
          <span>Barcode</span>
          <span>Item</span>
          <span className='text-right'>Expected</span>
          <span className='text-right'>Received</span>
          <span className='text-right'>Unit ₵</span>
          <span className='text-right'>Total ₵</span>
        </div>
        <ul className='max-h-[min(70vh,42rem)] divide-y overflow-y-auto overscroll-contain'>
          {filteredLines.length === 0 ? (
            <li className='p-8 text-center text-sm text-muted-foreground'>
              No lines match this search or filter.
            </li>
          ) : (
            filteredLines.map((line) => {
              const busy = savingLineId === line.id;
              const tone = receivalLineTone(line);
              const receivedDisplay =
                line.receivedQty != null
                  ? String(line.receivedQty)
                  : line.arrived
                    ? ''
                    : '';
              return (
                <li
                  key={line.id}
                  className={cn(
                    'grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-3 py-2.5 transition-colors md:grid-cols-[2.5rem_minmax(5rem,6rem)_1fr_4rem_4.5rem_5rem_5rem] md:items-center md:gap-3',
                    tone === 'arrived' && 'bg-emerald-50/90 hover:bg-emerald-50',
                    tone === 'discrepancy' &&
                      'bg-orange-50/95 hover:bg-orange-50 ring-1 ring-inset ring-orange-200/80',
                    tone === 'pending' && 'hover:bg-muted/40'
                  )}
                >
                  <div className='flex items-center md:justify-center'>
                    {busy ? (
                      <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
                    ) : (
                      <Checkbox
                        checked={line.arrived}
                        onCheckedChange={(c) =>
                          void handleToggleArrived(line.id, c === true)
                        }
                        aria-label={`${line.arrived ? 'Uncheck' : 'Mark'} ${line.description} as arrived`}
                        className={cn(
                          tone === 'arrived' &&
                            'border-emerald-600 bg-emerald-600 text-white data-[state=checked]:bg-emerald-600',
                          tone === 'discrepancy' &&
                            'border-orange-600 bg-orange-600 text-white data-[state=checked]:bg-orange-600'
                        )}
                      />
                    )}
                  </div>
                  <span className='font-mono text-xs text-muted-foreground md:text-sm'>
                    {line.code || '—'}
                  </span>
                  <span
                    className={cn(
                      'col-span-2 text-sm font-medium leading-snug md:col-span-1',
                      tone === 'arrived' && 'text-emerald-950',
                      tone === 'discrepancy' && 'text-orange-950'
                    )}
                  >
                    {line.description}
                    {receivalLineHasQtyDiscrepancy(line) ? (
                      <span className='mt-0.5 block text-xs font-normal text-orange-800'>
                        Expected {line.quantity}, received{' '}
                        {effectiveReceivedQty(line)}
                      </span>
                    ) : null}
                  </span>
                  <span className='text-right text-sm tabular-nums md:col-start-auto'>
                    {line.quantity.toLocaleString()}
                  </span>
                  <div className='flex justify-end md:col-start-auto'>
                    <Input
                      type='number'
                      min={0}
                      inputMode='numeric'
                      disabled={!line.arrived || busy}
                      defaultValue={receivedDisplay}
                      key={`${line.id}-${line.arrived}-${line.receivedQty ?? 'match'}`}
                      placeholder={
                        line.arrived ? String(line.quantity) : '—'
                      }
                      aria-label={`Received quantity for ${line.description}`}
                      className={cn(
                        'h-8 w-[4.25rem] px-2 text-right text-sm tabular-nums',
                        tone === 'discrepancy' &&
                          'border-orange-400 bg-white focus-visible:ring-orange-400'
                      )}
                      onBlur={(e) =>
                        void handleReceivedQtyBlur(line.id, e.target.value)
                      }
                    />
                  </div>
                  <span className='text-right text-sm tabular-nums text-muted-foreground'>
                    {line.unitPrice.toFixed(2)}
                  </span>
                  <span className='text-right text-sm font-medium tabular-nums'>
                    {line.total.toFixed(2)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <p className='text-xs text-muted-foreground'>
        Showing {filteredLines.length} of {receival.lines.length} lines ·{' '}
        {summary.pending} still to confirm
        {summary.discrepancies > 0
          ? ` · ${summary.discrepancies} with quantity mismatches`
          : ''}
        . Leave received blank when the count matches expected.
      </p>
    </div>
  );
}
