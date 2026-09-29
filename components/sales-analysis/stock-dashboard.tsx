'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { formatMoney, formatQty } from '@/lib/sales-analytics/format';
import {
  applyStockPlan,
  buildStockApplyPlan,
  type StockApplyItem,
  type StockApplyOptions,
  type StockApplyPlan,
} from '@/lib/sales-analytics/stock-apply';
import { saveInventoryApplyRecord } from '@/lib/sales-analytics/store';
import type { SalesProductRow, SavedSalesAnalysis } from '@/lib/sales-analytics/types';
import type { Product } from '@/types';
import {
  downloadRowsXlsx,
  SnapshotHeader,
  SnapshotStat,
  SnapshotTable,
  snapshotFileBase,
  type SnapshotColumn,
} from '@/components/sales-analysis/snapshot-shared';
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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const nextPaint = () => new Promise<void>((r) => setTimeout(r, 30));

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

function PlanList({ title, items, tone, showPrice }: { title: string; items: StockApplyItem[]; tone: string; showPrice?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className={`rounded-xl border p-2 ${tone}`}>
      <button type='button' className='flex w-full items-center text-left text-xs font-medium' onClick={() => setOpen((v) => !v)}>
        {title} ({items.length.toLocaleString()})
        <span className='ml-auto font-normal underline'>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <ul className='mt-1.5 max-h-60 space-y-0.5 overflow-y-auto text-xs'>
          {items.slice(0, 300).map((i) => (
            <li key={i.productId} className='flex gap-2'>
              <span className='min-w-0 flex-1 truncate'>{i.name}</span>
              <span className='tabular-nums text-muted-foreground'>
                {formatQty(i.currentQty)} → {formatQty(i.newQty)}
                {showPrice && i.price !== undefined ? ` · price ${i.price}` : ''}
              </span>
              {i.reservedOverCount ? <AlertTriangle className='h-3.5 w-3.5 text-amber-600' aria-label='Open orders exceed new count' /> : null}
            </li>
          ))}
          {items.length > 300 ? <li className='text-muted-foreground'>…and {items.length - 300} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function StockDashboard({
  analysis,
  products,
  consolidationSlot,
  onBack,
  onDelete,
  onSelectProduct,
}: {
  analysis: SavedSalesAnalysis;
  products: SalesProductRow[];
  consolidationSlot?: React.ReactNode;
  onBack: () => void;
  onDelete: () => void;
  onSelectProduct: (p: SalesProductRow) => void;
}) {
  const { user } = useAuth();
  const target = analysis.stockTarget ?? 'wholesale';
  const currency = analysis.currency;
  const [options, setOptions] = useState<StockApplyOptions>({ hideMissing: true, addNew: true, updatePrices: false });
  const [inventory, setInventory] = useState<Product[] | null>(null);
  const [plan, setPlan] = useState<StockApplyPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stats = useMemo(() => {
    const units = products.reduce((s, p) => s + p.quantity, 0);
    const zero = products.filter((p) => p.quantity <= 0).length;
    const priced = products.filter((p) => p.unitPrice !== undefined);
    const value = priced.reduce((s, p) => s + p.quantity * (p.unitPrice ?? 0), 0);
    return { units, zero, value: priced.length ? value : undefined };
  }, [products]);

  const columns: SnapshotColumn<SalesProductRow>[] = [
    {
      key: 'name',
      label: 'Product',
      render: (r) => (
        <button type='button' className='text-left hover:text-primary hover:underline' onClick={() => onSelectProduct(r)}>
          {r.name}
          {(r.rowCount ?? 1) > 1 ? (
            <span className='ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-normal text-emerald-800'>{r.rowCount} rows</span>
          ) : null}
        </button>
      ),
      value: (r) => r.name,
    },
    ...(analysis.hasCode ? [{ key: 'code', label: 'Code', render: (r: SalesProductRow) => r.code ?? '—', value: (r: SalesProductRow) => r.code ?? '' }] : []),
    { key: 'qty', label: 'Quantity', numeric: true, render: (r) => formatQty(r.quantity, 2), value: (r) => r.quantity },
    ...(analysis.hasUnitPrice
      ? [
          { key: 'price', label: `Unit price (${currency})`, numeric: true, render: (r: SalesProductRow) => formatMoney(r.unitPrice, currency), value: (r: SalesProductRow) => r.unitPrice ?? 0 },
          {
            key: 'value',
            label: `Stock value (${currency})`,
            numeric: true,
            render: (r: SalesProductRow) => (r.unitPrice !== undefined ? formatMoney(r.quantity * r.unitPrice, currency) : '—'),
            value: (r: SalesProductRow) => Math.round(r.quantity * (r.unitPrice ?? 0) * 100) / 100,
          },
        ]
      : []),
    ...(analysis.hasExpiry
      ? [{ key: 'expiry', label: 'Earliest expiry', render: (r: SalesProductRow) => (r.expiry ? prettyDate(r.expiry) : '—'), value: (r: SalesProductRow) => r.expiry ?? '' }]
      : []),
  ];

  const preview = async (opts = options) => {
    setBusy('Loading current inventory…');
    await nextPaint();
    try {
      const snap = await getDocs(collection(db, 'inventory'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
      setInventory(list);
      setPlan(buildStockApplyPlan(list, products, target, opts));
    } catch (e) {
      console.error('load inventory for stock update', e);
      toast.error('Could not load the current inventory.');
    } finally {
      setBusy(null);
    }
  };

  const setOption = (key: keyof StockApplyOptions, value: boolean) => {
    const next = { ...options, [key]: value };
    setOptions(next);
    if (inventory) setPlan(buildStockApplyPlan(inventory, products, target, next));
  };

  const apply = async () => {
    if (!plan || !inventory) return;
    setBusy('Updating inventory…');
    await nextPaint();
    try {
      const res = await applyStockPlan(db, inventory, plan);
      await saveInventoryApplyRecord(db, analysis.id, {
        at: Date.now(),
        by: user?.name || user?.email || 'Admin',
        target,
        ...res,
      });
      toast.success(`Inventory updated: ${res.updated} changed, ${res.created} added, ${res.hiddenOrCleared} ${target === 'wholesale' ? 'hidden' : 'cleared'}.`);
      setPlan(null);
      setInventory(null);
    } catch (e) {
      console.error('apply stock list', e);
      toast.error('Could not update the inventory. Some items may have been updated — preview again to check.');
    } finally {
      setBusy(null);
      setConfirmOpen(false);
    }
  };

  const targetLabel = target === 'wholesale' ? 'Wholesale' : 'Warehouse / storeroom';
  const changes = plan ? plan.updates.length + plan.creates.length + plan.missing.length : 0;
  const applied = analysis.inventoryApply;

  return (
    <div className='w-full min-w-0 max-w-full space-y-4'>
      <SnapshotHeader
        analysis={analysis}
        subtitle={`${targetLabel} stock list dated ${prettyDate(analysis.periodEnd)}`}
        onBack={onBack}
        onDelete={onDelete}
        onDownload={() => downloadRowsXlsx(products, columns, 'Stock', snapshotFileBase(analysis, 'stock'))}
      />

      {consolidationSlot}

      <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
        <SnapshotStat label='Products' value={formatQty(products.length)} tone='border-sky-200/80 bg-sky-50/90 text-sky-900' />
        <SnapshotStat label='Total units' value={formatQty(stats.units)} tone='border-emerald-200/80 bg-emerald-50/90 text-emerald-900' />
        <SnapshotStat label='Out of stock (0)' value={formatQty(stats.zero)} tone='border-amber-200/80 bg-amber-50/90 text-amber-900' />
        {stats.value !== undefined ? (
          <SnapshotStat label='Stock value' value={formatMoney(stats.value, currency, 0)} hint='Quantity × unit price' tone='border-violet-200/80 bg-violet-50/90 text-violet-900' />
        ) : null}
      </div>

      <div className='space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-3 sm:p-4'>
        <div>
          <p className='flex items-center gap-1.5 text-sm font-semibold text-teal-950'>
            <RefreshCw className='h-4 w-4' />
            Update {target === 'wholesale' ? 'wholesale' : 'warehouse'} inventory from this list
          </p>
          <p className='text-xs text-teal-900/80'>
            {target === 'wholesale'
              ? 'Sets the wholesale quantity customers see. Nothing is changed until you confirm.'
              : 'Sets the storeroom quantity. Nothing is changed until you confirm.'}
          </p>
          {applied ? (
            <p className='mt-1 flex items-center gap-1 text-[11px] text-teal-900'>
              <CheckCircle2 className='h-3.5 w-3.5' />
              Applied {format(applied.at, 'MMM d, yyyy HH:mm')} by {applied.by}: {applied.updated} changed, {applied.created} added,{' '}
              {applied.hiddenOrCleared} {applied.target === 'wholesale' ? 'hidden' : 'cleared'}.
            </p>
          ) : null}
        </div>

        <div className='grid gap-2 sm:grid-cols-3'>
          <label className='flex items-start gap-2 rounded-lg border bg-white p-2 text-xs'>
            <Switch checked={options.hideMissing} onCheckedChange={(v) => setOption('hideMissing', v)} />
            <span>
              <span className='block font-medium'>{target === 'wholesale' ? 'Hide items not on this list' : 'Set items not on this list to 0'}</span>
              <span className='text-muted-foreground'>
                {target === 'wholesale' ? 'Stock is set to 0 (or to open-order reservations) and the item is hidden.' : 'Storeroom stock becomes 0.'}
              </span>
            </span>
          </label>
          <label className='flex items-start gap-2 rounded-lg border bg-white p-2 text-xs'>
            <Switch checked={options.addNew} onCheckedChange={(v) => setOption('addNew', v)} />
            <span>
              <span className='block font-medium'>Add new items</span>
              <span className='text-muted-foreground'>
                {target === 'wholesale' ? 'Visible only if they have a price; otherwise added hidden.' : 'Added as hidden storeroom items.'}
              </span>
            </span>
          </label>
          <label className='flex items-start gap-2 rounded-lg border bg-white p-2 text-xs'>
            <Switch checked={options.updatePrices} disabled={!analysis.hasUnitPrice} onCheckedChange={(v) => setOption('updatePrices', v)} />
            <span>
              <span className='block font-medium'>Also update prices</span>
              <span className='text-muted-foreground'>{analysis.hasUnitPrice ? 'Uses the unit price column.' : 'No price column in this file.'}</span>
            </span>
          </label>
        </div>

        {!plan ? (
          <Button type='button' onClick={() => void preview()} disabled={!!busy}>
            {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            {busy ?? 'Preview changes'}
          </Button>
        ) : (
          <div className='space-y-2'>
            <p className='text-sm'>
              <strong>{plan.updates.length.toLocaleString()}</strong> to update ·{' '}
              <strong>{plan.creates.length.toLocaleString()}</strong> to add ·{' '}
              <strong>{plan.missing.length.toLocaleString()}</strong> {target === 'wholesale' ? 'to hide' : 'to set to 0'} ·{' '}
              {plan.unchanged.toLocaleString()} already correct
            </p>
            <PlanList title='Quantities changing' items={plan.updates} tone='border-emerald-200 bg-emerald-50/60' showPrice />
            <PlanList title='New items' items={plan.creates} tone='border-sky-200 bg-sky-50/60' showPrice />
            <PlanList
              title={target === 'wholesale' ? 'Not on this list — will be hidden' : 'Not on this list — will be set to 0'}
              items={plan.missing}
              tone='border-amber-200 bg-amber-50/60'
            />
            {plan.updates.some((u) => u.reservedOverCount) ? (
              <p className='flex items-center gap-1.5 text-xs text-amber-800'>
                <AlertTriangle className='h-3.5 w-3.5' />
                Some items have more units reserved for open orders than the new count. Their stock will stay at the reserved amount.
              </p>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Button type='button' disabled={!!busy || changes === 0} onClick={() => setConfirmOpen(true)}>
                {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                {busy ?? 'Apply to inventory'}
              </Button>
              <Button type='button' variant='outline' disabled={!!busy} onClick={() => void preview()}>
                Refresh preview
              </Button>
              <Button type='button' variant='ghost' disabled={!!busy} onClick={() => setPlan(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className='rounded-2xl border bg-card p-3 sm:p-4'>
        <p className='mb-2 text-sm font-semibold'>Products on this list</p>
        <SnapshotTable rows={products} columns={columns} searchText={(r) => `${r.name} ${r.code ?? ''}`} />
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update {targetLabel.toLowerCase()} inventory?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan
                ? `${plan.updates.length} item(s) will change, ${plan.creates.length} will be added and ${plan.missing.length} will be ${
                    target === 'wholesale' ? 'hidden' : 'set to 0'
                  }. ${target === 'wholesale' ? 'Customers will see the new quantities straight away.' : ''}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
            >
              {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              Update inventory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
