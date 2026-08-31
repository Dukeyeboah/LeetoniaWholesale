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
  ClipboardCheck,
  Download,
  Loader2,
  Printer,
  ScanBarcode,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import type { WarehouseReceival, WarehouseReceivalLine } from '@/types';
import {
  buildSeptember2026Receival,
  clearAllReceivalArrived,
  effectiveReceivedQty,
  filterReceivalLines,
  filterReceivalLinesByNameLetter,
  findReceivalLineByBarcode,
  receivalLineHasQtyDiscrepancy,
  receivalLineTone,
  receivalSummary,
  sanitizeReceivalLinesForFirestore,
  searchReceivalLines,
  SEPTEMBER_2026_RECEIVAL_ID,
  setReceivalLineReceivedQty,
  sortReceivalLinesByName,
  toggleReceivalLineArrived,
  type ReceivalListFilter,
} from '@/lib/warehouse-receival';
import {
  INVENTORY_LETTER_OPTIONS,
  type InventoryLetterFilter,
} from '@/lib/inventory-filters';
import {
  exportReceivalCsv,
  exportReceivalPdf,
  printReceivalHtml,
} from '@/lib/warehouse-receival-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AdminLoadingPanel } from '@/components/admin-loading-panel';
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  RECEIVAL_LIST_PAGE,
  receivalListPageSize,
} from '@/lib/admin-list-pagination';

const FILTER_OPTIONS: { value: ReceivalListFilter; label: string }[] = [
  { value: 'all', label: 'All lines' },
  { value: 'arrived', label: 'Arrived only' },
  { value: 'pending', label: 'Not arrived' },
];

/** One-time undo after accidental “mark all visible” — clears arrived checks once per browser. */
const CLEAR_ARRIVED_ONCE_KEY = 'leetonia_clear_receival_arrived_2026-09_v1';

export function AdminWarehouseReceivalPanel() {
  const isMobile = useIsMobile();
  const [receival, setReceival] = useState<WarehouseReceival | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<ReceivalListFilter>('all');
  const [nameLetterFilter, setNameLetterFilter] =
    useState<InventoryLetterFilter>('all');
  const [sortByName, setSortByName] = useState(false);
  const [nameFiltersOpen, setNameFiltersOpen] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [visibleLineCount, setVisibleLineCount] = useState<number>(
    RECEIVAL_LIST_PAGE.desktop
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [highlightedLineId, setHighlightedLineId] = useState<string | null>(
    null
  );
  const seedAttempted = useRef(false);
  const clearArrivedOnceAttempted = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const receivalRef = useRef(receival);
  receivalRef.current = receival;

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
    lines = filterReceivalLinesByNameLetter(lines, nameLetterFilter);
    lines = searchReceivalLines(lines, searchQuery);
    if (sortByName || nameLetterFilter !== 'all') {
      lines = sortReceivalLinesByName(lines);
    }
    return lines;
  }, [receival, listFilter, nameLetterFilter, searchQuery, sortByName]);

  const visibleLines = useMemo(
    () => filteredLines.slice(0, visibleLineCount),
    [filteredLines, visibleLineCount]
  );

  useEffect(() => {
    setVisibleLineCount(receivalListPageSize(isMobile));
  }, [isMobile, listFilter, nameLetterFilter, searchQuery, sortByName]);

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

  // Undo mistaken “mark all visible” once per browser after this update.
  useEffect(() => {
    if (!db || !receival || clearArrivedOnceAttempted.current) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(CLEAR_ARRIVED_ONCE_KEY) === '1') {
      clearArrivedOnceAttempted.current = true;
      return;
    }
    clearArrivedOnceAttempted.current = true;
    if (!receival.lines.some((l) => l.arrived)) {
      localStorage.setItem(CLEAR_ARRIVED_ONCE_KEY, '1');
      return;
    }

    const next = clearAllReceivalArrived(receival.lines);
    const optimistic = { ...receival, lines: next, updatedAt: Date.now() };
    receivalRef.current = optimistic;
    setReceival(optimistic);
    void updateDoc(doc(db, 'warehouseReceivals', receival.id), {
      lines: sanitizeReceivalLinesForFirestore(next),
      updatedAt: Date.now(),
    })
      .then(() => {
        localStorage.setItem(CLEAR_ARRIVED_ONCE_KEY, '1');
        toast.message('Cleared all arrived checks', {
          description:
            'Undid the accidental “mark all” selection. Check items one by one or with Scan.',
        });
      })
      .catch((e) => {
        console.error(e);
        clearArrivedOnceAttempted.current = false;
        toast.error('Could not clear arrived checks — try Re-import list.');
      });
  }, [receival]);

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

  const handleBarcodeScan = useCallback(
    async (code: string) => {
      const current = receivalRef.current;
      if (!current) return;

      const match = findReceivalLineByBarcode(current.lines, code);
      if (!match) {
        setScanFeedback(`No match for ${code}`);
        toast.error(`No checklist item for barcode ${code}`);
        return;
      }

      setHighlightedLineId(match.id);
      setSearchQuery('');
      setListFilter('all');
      setNameLetterFilter('all');

      if (match.arrived) {
        setScanFeedback(`Already arrived: ${match.description}`);
        toast.message('Already marked arrived', {
          description: match.description,
        });
        return;
      }

      setSavingLineId(match.id);
      const next = toggleReceivalLineArrived(current.lines, match.id, true);
      const optimistic = { ...current, lines: next, updatedAt: Date.now() };
      receivalRef.current = optimistic;
      setReceival(optimistic);
      try {
        await persistLines(next);
        setScanFeedback(`Arrived: ${match.description}`);
        toast.success('Marked arrived', { description: match.description });
      } catch (e) {
        console.error(e);
        receivalRef.current = current;
        setReceival(current);
        setScanFeedback('Save failed — try again');
        toast.error('Could not save scanned item.');
      } finally {
        setSavingLineId(null);
      }
    },
    [persistLines]
  );

  useEffect(() => {
    if (!highlightedLineId) return;
    const idx = filteredLines.findIndex((l) => l.id === highlightedLineId);
    if (idx < 0) return;
    setVisibleLineCount((count) => Math.max(count, idx + 1));
  }, [highlightedLineId, filteredLines]);

  useEffect(() => {
    if (!highlightedLineId || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-line-id="${CSS.escape(highlightedLineId)}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightedLineId, visibleLines]);

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
        <div className='flex gap-2'>
          <div className='relative min-w-0 flex-1 sm:max-w-sm'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search by item name or barcode…'
              className='h-10 pl-9 sm:h-9'
              aria-label='Search receival list'
            />
          </div>
          <Button
            type='button'
            size='sm'
            className='h-10 shrink-0 touch-manipulation sm:h-9'
            onClick={() => {
              setScanFeedback(null);
              setScannerOpen(true);
            }}
          >
            <ScanBarcode className='mr-1.5 h-4 w-4' />
            Scan
          </Button>
        </div>
        <div className='flex flex-wrap items-center gap-1.5'>
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type='button'
              size='sm'
              variant={listFilter === opt.value ? 'default' : 'outline'}
              className='h-9 shrink-0'
              onClick={() => setListFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          <Popover open={nameFiltersOpen} onOpenChange={setNameFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                type='button'
                size='sm'
                variant={
                  nameFiltersOpen ||
                  sortByName ||
                  nameLetterFilter !== 'all'
                    ? 'default'
                    : 'outline'
                }
                className='h-9 shrink-0'
                aria-pressed={sortByName || nameLetterFilter !== 'all'}
              >
                <SlidersHorizontal className='mr-1.5 h-3.5 w-3.5' />
                {nameLetterFilter !== 'all'
                  ? `Name · ${nameLetterFilter}`
                  : sortByName
                    ? 'Name A–Z'
                    : 'Filter'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align='start' className='w-[min(22rem,calc(100vw-2rem))] space-y-3'>
              <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                NAME FILTER
              </p>
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='receival-sort-name'
                  checked={sortByName}
                  onCheckedChange={(checked) => setSortByName(checked === true)}
                />
                <Label htmlFor='receival-sort-name' className='font-normal'>
                  Sort list A–Z by item name
                </Label>
              </div>
              <div className='space-y-2'>
                <p className='text-sm font-medium'>Group by first letter</p>
                <div className='grid grid-cols-7 gap-1 sm:grid-cols-9'>
                  {INVENTORY_LETTER_OPTIONS.map((letter) => (
                    <Button
                      key={letter}
                      type='button'
                      variant='secondary'
                      size='sm'
                      className={`h-8 rounded-full border-0 px-0 text-[11px] font-medium shadow-none touch-manipulation ${
                        nameLetterFilter === letter
                          ? '!bg-control text-foreground'
                          : 'bg-secondary/70 text-foreground'
                      }`}
                      onClick={() => setNameLetterFilter(letter)}
                    >
                      {letter === 'all' ? 'All' : letter}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='w-full'
                onClick={() => {
                  setSortByName(false);
                  setNameLetterFilter('all');
                }}
              >
                Clear name filters
              </Button>
            </PopoverContent>
          </Popover>
        </div>
        <div className='flex flex-col gap-1.5 sm:ml-auto sm:flex-row sm:flex-wrap'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-9 w-full sm:w-auto'
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
        <ul
          ref={listRef}
          className='max-h-[min(70vh,42rem)] divide-y overflow-y-auto overscroll-contain'
        >
          {visibleLines.length === 0 ? (
            <li className='p-8 text-center text-sm text-muted-foreground'>
              No lines match this search or filter.
            </li>
          ) : (
            visibleLines.map((line) => {
              const busy = savingLineId === line.id;
              const tone = receivalLineTone(line);
              const receivedDisplay =
                line.receivedQty != null
                  ? String(line.receivedQty)
                  : line.arrived
                    ? ''
                    : '';
              const rowToneClass = cn(
                tone === 'arrived' && 'bg-emerald-50/90 hover:bg-emerald-50',
                tone === 'discrepancy' &&
                  'bg-orange-50/95 hover:bg-orange-50 ring-1 ring-inset ring-orange-200/80',
                tone === 'pending' && 'hover:bg-muted/40'
              );
              const checkboxClass = cn(
                tone === 'arrived' &&
                  'border-emerald-600 bg-emerald-600 text-white data-[state=checked]:bg-emerald-600',
                tone === 'discrepancy' &&
                  'border-orange-600 bg-orange-600 text-white data-[state=checked]:bg-orange-600'
              );
              const receivedInput = (
                <Input
                  type='number'
                  min={0}
                  inputMode='numeric'
                  disabled={!line.arrived || busy}
                  defaultValue={receivedDisplay}
                  key={`${line.id}-${line.arrived}-${line.receivedQty ?? 'match'}`}
                  placeholder={line.arrived ? String(line.quantity) : '—'}
                  aria-label={`Received quantity for ${line.description}`}
                  className={cn(
                    'h-9 w-full px-2 text-right text-sm tabular-nums sm:h-8 sm:w-[4.25rem]',
                    tone === 'discrepancy' &&
                      'border-orange-400 bg-white focus-visible:ring-orange-400'
                  )}
                  onBlur={(e) =>
                    void handleReceivedQtyBlur(line.id, e.target.value)
                  }
                />
              );
              const checkboxControl = busy ? (
                <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
              ) : (
                <Checkbox
                  checked={line.arrived}
                  onCheckedChange={(c) =>
                    void handleToggleArrived(line.id, c === true)
                  }
                  aria-label={`${line.arrived ? 'Uncheck' : 'Mark'} ${line.description} as arrived`}
                  className={checkboxClass}
                />
              );

              return (
                <li
                  key={line.id}
                  data-line-id={line.id}
                  className={cn(
                    'transition-colors',
                    rowToneClass,
                    highlightedLineId === line.id &&
                      'ring-2 ring-inset ring-sky-500'
                  )}
                >
                  <div className='grid gap-x-3 gap-y-2.5 px-3 py-3 md:grid-cols-[2.5rem_minmax(5rem,6rem)_1fr_4rem_4.5rem_5rem_5rem] md:items-center md:gap-3 md:py-2.5'>
                    <div className='flex gap-3 md:contents'>
                      <div className='flex shrink-0 items-start pt-0.5 md:items-center md:justify-center'>
                        {checkboxControl}
                      </div>
                      <div className='min-w-0 flex-1 md:hidden'>
                        <p
                          className={cn(
                            'text-sm font-medium leading-snug',
                            tone === 'arrived' && 'text-emerald-950',
                            tone === 'discrepancy' && 'text-orange-950'
                          )}
                        >
                          {line.description}
                        </p>
                        <p className='mt-0.5 font-mono text-xs text-muted-foreground'>
                          {line.code || '—'}
                        </p>
                        {receivalLineHasQtyDiscrepancy(line) ? (
                          <p className='mt-1 text-xs font-normal text-orange-800'>
                            Expected {line.quantity}, received{' '}
                            {effectiveReceivedQty(line)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <span className='hidden font-mono text-sm text-muted-foreground md:block'>
                      {line.code || '—'}
                    </span>
                    <span
                      className={cn(
                        'hidden text-sm font-medium leading-snug md:block',
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

                    <div className='grid grid-cols-2 gap-2 pl-9 sm:grid-cols-4 md:contents'>
                      <div className='md:text-right'>
                        <p className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:sr-only'>
                          Expected
                        </p>
                        <p className='text-sm tabular-nums'>
                          {line.quantity.toLocaleString()}
                        </p>
                      </div>
                      <div className='md:flex md:justify-end'>
                        <p className='mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:sr-only'>
                          Received
                        </p>
                        {receivedInput}
                      </div>
                      <div className='md:text-right'>
                        <p className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:sr-only'>
                          Unit ₵
                        </p>
                        <p className='text-sm tabular-nums text-muted-foreground'>
                          {line.unitPrice.toFixed(2)}
                        </p>
                      </div>
                      <div className='md:text-right'>
                        <p className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:sr-only'>
                          Total ₵
                        </p>
                        <p className='text-sm font-medium tabular-nums'>
                          {line.total.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
        {filteredLines.length > visibleLines.length ? (
          <div className='border-t p-3'>
            <Button
              type='button'
              variant='outline'
              className='w-full touch-manipulation'
              onClick={() =>
                setVisibleLineCount((count) => count + RECEIVAL_LIST_PAGE.step)
              }
            >
              Show more ({visibleLines.length} of{' '}
              {filteredLines.length.toLocaleString()} lines)
            </Button>
          </div>
        ) : null}
      </div>

      <p className='text-xs text-muted-foreground'>
        Showing {visibleLines.length} of {filteredLines.length} filtered ·{' '}
        {receival.lines.length} total lines ·{' '}
        {summary.pending} still to confirm
        {summary.discrepancies > 0
          ? ` · ${summary.discrepancies} with quantity mismatches`
          : ''}
        . Leave received blank when the count matches expected.
      </p>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
        lastResult={scanFeedback}
      />
    </div>
  );
}
