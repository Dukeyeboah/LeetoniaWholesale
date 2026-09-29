'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileSpreadsheet, GitMerge, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '@/lib/firebase';
import {
  deleteSalesAnalysis,
  loadSalesAnalysisData,
  subscribeProductMappings,
  subscribeSalesAnalyses,
  type LoadedSalesRows,
} from '@/lib/sales-analytics/store';
import {
  analysisKind,
  type ProductMappingRule,
  type SalesProductRow,
  type SalesUploadKind,
  type SavedSalesAnalysis,
} from '@/lib/sales-analytics/types';
import { SalesAnalysisDashboard } from '@/components/sales-analysis/sales-analysis-dashboard';
import { SalesUploadWizard } from '@/components/sales-analysis/sales-upload-wizard';
import { ExpiryDashboard } from '@/components/sales-analysis/expiry-dashboard';
import { StockDashboard } from '@/components/sales-analysis/stock-dashboard';
import { SavedConsolidationCard } from '@/components/sales-analysis/saved-consolidation-card';
import { SourceRowsDialog } from '@/components/sales-analysis/consolidation-review';
import { formatMoney, formatQty } from '@/lib/sales-analytics/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type View = { kind: 'list' } | { kind: 'upload' } | { kind: 'analysis'; id: string };
type Filter = 'all' | SalesUploadKind;

const KIND_BADGE: Record<SalesUploadKind, { label: string; className: string }> = {
  sales: { label: 'Sales', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  expiry: { label: 'Expiry', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  stock: { label: 'Stock', className: 'border-teal-200 bg-teal-50 text-teal-800' },
};

function listLine(a: SavedSalesAnalysis): string {
  const kind = analysisKind(a);
  const products = `${formatQty(a.stats.totalProducts)} products`;
  if (kind === 'sales') {
    return `${a.periodStart} → ${a.periodEnd} · ${products} · ${formatQty(a.stats.totalQuantity)} units${
      a.hasValue ? ` · ${formatMoney(a.stats.totalValue, a.currency, 0)}` : ''
    }`;
  }
  if (kind === 'stock') {
    return `${a.stockTarget === 'warehouse' ? 'Warehouse' : 'Wholesale'} · list dated ${a.periodEnd} · ${products} · ${formatQty(a.stats.totalQuantity)} units`;
  }
  return `List dated ${a.periodEnd} · ${products}`;
}

export function AdminSalesAnalysisPanel() {
  const [analyses, setAnalyses] = useState<SavedSalesAnalysis[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rules, setRules] = useState<ProductMappingRule[]>([]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [filter, setFilter] = useState<Filter>('all');
  const [dataById, setDataById] = useState<Record<string, LoadedSalesRows>>({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedSalesAnalysis | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SalesProductRow | null>(null);

  useEffect(() => {
    return subscribeSalesAnalyses(
      db,
      (list) => {
        setAnalyses(list);
        setListError(null);
        setLoadingList(false);
      },
      (e) => {
        console.error('salesAnalyses listener', e);
        setLoadingList(false);
        setListError(
          (e as { code?: string }).code === 'permission-denied'
            ? 'Sales File Analysis is not enabled in the database yet. The Firestore rules for "salesAnalyses" need to be published.'
            : 'Could not load saved analyses.'
        );
      }
    );
  }, []);

  useEffect(() => {
    return subscribeProductMappings(db, setRules, (e) => console.error('product mappings listener', e));
  }, []);

  const openId = view.kind === 'analysis' ? view.id : null;

  useEffect(() => {
    if (!openId || dataById[openId]) return;
    let cancelled = false;
    setLoadingRows(true);
    loadSalesAnalysisData(db, openId)
      .then((data) => {
        if (!cancelled) setDataById((m) => ({ ...m, [openId]: data }));
      })
      .catch((e) => {
        console.error('load sales rows', e);
        toast.error('Could not open this analysis.');
        if (!cancelled) setView({ kind: 'list' });
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, dataById]);

  const reload = (id: string) => setDataById(({ [id]: _removed, ...rest }) => rest);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSalesAnalysis(db, pendingDelete.id, {
        storage,
        sourcePath: pendingDelete.sourceFile?.path,
      });
      toast.success('Deleted.');
      if (openId === pendingDelete.id) setView({ kind: 'list' });
      reload(pendingDelete.id);
    } catch (e) {
      console.error('delete sales analysis', e);
      toast.error('Could not delete this analysis.');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: analyses.length, sales: 0, expiry: 0, stock: 0 };
    for (const a of analyses) c[analysisKind(a)] += 1;
    return c;
  }, [analyses]);
  const filtered = filter === 'all' ? analyses : analyses.filter((a) => analysisKind(a) === filter);

  const open = openId ? analyses.find((a) => a.id === openId) : undefined;
  const openData = openId ? dataById[openId] : undefined;

  const renderAnalysis = () => {
    if (!open || !openData || loadingRows) {
      return (
        <div className='flex items-center justify-center gap-2 rounded-xl border bg-card py-12 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />
          Opening analysis…
        </div>
      );
    }
    const slot = (
      <SavedConsolidationCard
        key={`${open.id}-${open.consolidation?.finalProducts ?? 0}-${open.decisions?.length ?? 0}`}
        analysis={open}
        sourceRows={openData.sourceRows}
        rules={rules}
        onUpdated={() => reload(open.id)}
      />
    );
    const common = {
      analysis: open,
      consolidationSlot: slot,
      onBack: () => setView({ kind: 'list' }),
      onDelete: () => setPendingDelete(open),
      onSelectProduct: setSelectedProduct,
    };
    const kind = analysisKind(open);
    if (kind === 'expiry') {
      return <ExpiryDashboard {...common} products={openData.products} sourceRows={openData.sourceRows} />;
    }
    if (kind === 'stock') return <StockDashboard {...common} products={openData.products} />;
    return <SalesAnalysisDashboard {...common} rows={openData.products} />;
  };

  return (
    <section className='w-full min-w-0 max-w-full space-y-3 rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h2 className='text-xs font-semibold tracking-wide text-sky-900'>Sales File Analysis</h2>
          <p className='mt-0.5 text-sm text-sky-950'>
            Upload sales, expiry or stock lists. Duplicate products are combined safely before any
            analysis.
          </p>
        </div>
        {view.kind === 'list' ? (
          <Button type='button' size='sm' className='shrink-0' onClick={() => setView({ kind: 'upload' })}>
            <Upload className='mr-1.5 h-4 w-4' />
            New upload
          </Button>
        ) : null}
      </div>

      {view.kind === 'upload' ? (
        <SalesUploadWizard
          rules={rules}
          onCancel={() => setView({ kind: 'list' })}
          onSaved={(id) => setView({ kind: 'analysis', id })}
        />
      ) : null}

      {view.kind === 'analysis' ? renderAnalysis() : null}

      {view.kind === 'list' ? (
        listError ? (
          <p className='rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950'>
            {listError}
          </p>
        ) : loadingList ? (
          <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading saved analyses…
          </div>
        ) : analyses.length === 0 ? (
          <div className='rounded-xl border border-dashed border-sky-300/80 bg-white/70 px-4 py-8 text-center'>
            <FileSpreadsheet className='mx-auto mb-2 h-8 w-8 text-sky-700/50' />
            <p className='text-sm font-medium text-sky-950'>Nothing uploaded yet</p>
            <p className='mx-auto mt-1 max-w-md text-xs text-muted-foreground'>
              Upload an Excel or CSV file: sales (product and quantity sold, plus value if you have it),
              an expiry list, or a stock list.
            </p>
          </div>
        ) : (
          <div className='space-y-2'>
            <div className='flex flex-wrap gap-1.5'>
              {(['all', 'sales', 'expiry', 'stock'] as Filter[]).map((f) => (
                <Button
                  key={f}
                  type='button'
                  size='sm'
                  variant={filter === f ? 'default' : 'outline'}
                  className={cn('h-7 text-xs', filter !== f && 'bg-white')}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : KIND_BADGE[f].label} ({counts[f]})
                </Button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <p className='rounded-xl border border-dashed bg-white/70 px-3 py-6 text-center text-sm text-muted-foreground'>
                No uploads of this type yet.
              </p>
            ) : (
              <ul className='space-y-2'>
                {filtered.map((a) => {
                  const kind = analysisKind(a);
                  return (
                    <li key={a.id} className='flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/30'>
                      <button
                        type='button'
                        className='min-w-0 flex-1 text-left'
                        onClick={() => setView({ kind: 'analysis', id: a.id })}
                      >
                        <p className='flex items-center gap-1.5 truncate text-sm font-medium'>
                          <Badge variant='outline' className={cn('shrink-0 px-1.5 py-0 text-[10px]', KIND_BADGE[kind].className)}>
                            {KIND_BADGE[kind].label}
                          </Badge>
                          <span className='truncate'>{a.name}</span>
                        </p>
                        <p className='text-xs text-muted-foreground'>{listLine(a)}</p>
                        <p className='text-[11px] text-muted-foreground'>
                          {a.fileName} · uploaded {format(a.uploadedAt, 'MMM d, yyyy')} by{' '}
                          {a.uploadedBy?.name ?? 'Admin'}
                        </p>
                      </button>
                      {a.consolidation?.pendingMatches ? (
                        <Badge variant='outline' className='hidden shrink-0 border-amber-200 text-amber-800 sm:inline-flex'>
                          <GitMerge className='mr-1 h-3 w-3' />
                          {a.consolidation.pendingMatches} to review
                        </Badge>
                      ) : null}
                      {a.aiSummary ? (
                        <Badge variant='outline' className='hidden shrink-0 border-violet-200 text-violet-800 sm:inline-flex'>
                          <Sparkles className='mr-1 h-3 w-3' />
                          AI summary
                        </Badge>
                      ) : null}
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 shrink-0 text-muted-foreground'
                        aria-label={`Delete ${a.name}`}
                        onClick={() => setPendingDelete(a)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      ) : null}

      <SourceRowsDialog
        product={selectedProduct}
        sourceRows={openData?.sourceRows ?? []}
        hasValue={!!open?.hasValue}
        currency={open?.currency ?? 'GHS'}
        onOpenChange={(o) => !o && setSelectedProduct(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}”, its saved analysis and the stored copy of the file will be
              removed. Mapping rules and inventory are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
