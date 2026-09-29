'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackagePlus } from 'lucide-react';
import type { Product, WarehouseReceival } from '@/types';
import {
  buildReceivalTransferPreview,
  transferReceivalLinesToInventory,
  type ReceivalTransferPreviewRow,
} from '@/lib/warehouse-receival-transfer';
import { receivalLineTransferableQty } from '@/lib/warehouse-receival';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type AdminReceivalTransferDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receival: WarehouseReceival;
  products: Product[];
  inventoryLoading?: boolean;
};

export function AdminReceivalTransferDialog({
  open,
  onOpenChange,
  receival,
  products,
  inventoryLoading,
}: AdminReceivalTransferDialogProps) {
  const [batchLabel, setBatchLabel] = useState('');
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, string>>({});
  const [transferring, setTransferring] = useState(false);

  const transferableLines = useMemo(
    () => receival.lines.filter((l) => receivalLineTransferableQty(l) > 0),
    [receival.lines]
  );

  useEffect(() => {
    if (!open) {
      setBatchLabel('');
      setQtyByLineId({});
      return;
    }
    const defaults: Record<string, string> = {};
    for (const line of transferableLines) {
      defaults[line.id] = String(receivalLineTransferableQty(line));
    }
    setQtyByLineId(defaults);
  }, [open, transferableLines]);

  const qtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, raw] of Object.entries(qtyByLineId)) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) m.set(id, parsed);
    }
    return m;
  }, [qtyByLineId]);

  const preview = useMemo(
    () => buildReceivalTransferPreview(receival.lines, products, qtyMap),
    [receival.lines, products, qtyMap]
  );

  const totals = useMemo(() => {
    const lineCount = preview.length;
    const unitCount = preview.reduce((s, r) => s + r.transferQty, 0);
    const newProducts = preview.filter((r) => r.match === 'new').length;
    return { lineCount, unitCount, newProducts };
  }, [preview]);

  const handleTransfer = async () => {
    if (!db) return;
    if (preview.length === 0) {
      toast.error('Nothing to transfer — check arrived items with remaining qty.');
      return;
    }
    setTransferring(true);
    try {
      const result = await transferReceivalLinesToInventory(
        db,
        receival,
        products,
        preview.map((r) => ({ lineId: r.line.id, qty: r.transferQty })),
        batchLabel
      );
      toast.success('Transferred to warehouse', {
        description: `${result.batch.lineCount} lines · ${result.batch.unitCount.toLocaleString()} units added to storeroom stock.`,
      });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Transfer failed — try again.');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Transfer to warehouse</DialogTitle>
          <DialogDescription>
            Push confirmed receival quantities into storeroom inventory. You can
            transfer in partial batches — already transferred qty is tracked per
            line.
          </DialogDescription>
        </DialogHeader>

        {inventoryLoading ? (
          <div className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading inventory for matching…
          </div>
        ) : transferableLines.length === 0 ? (
          <p className='py-6 text-sm text-muted-foreground'>
            No arrived lines with remaining qty to transfer. Confirm items on the
            palette first, or everything may already be in warehouse stock.
          </p>
        ) : (
          <>
            <div className='space-y-2'>
              <Label htmlFor='transfer-label'>Batch label (optional)</Label>
              <Input
                id='transfer-label'
                placeholder='e.g. Morning palette — partial transfer'
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
              />
            </div>

            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline' className='tabular-nums'>
                {totals.lineCount} line{totals.lineCount === 1 ? '' : 's'}
              </Badge>
              <Badge variant='outline' className='tabular-nums'>
                {totals.unitCount.toLocaleString()} units
              </Badge>
              {totals.newProducts > 0 ? (
                <Badge
                  variant='outline'
                  className='border-amber-200 bg-amber-50 text-amber-900'
                >
                  {totals.newProducts} new inventory item
                  {totals.newProducts === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>

            <ul className='min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border p-2'>
              {transferableLines.map((line) => {
                const max = receivalLineTransferableQty(line);
                const row = preview.find((r) => r.line.id === line.id);
                return (
                  <TransferRow
                    key={line.id}
                    line={line}
                    max={max}
                    preview={row}
                    qty={qtyByLineId[line.id] ?? String(max)}
                    onQtyChange={(v) =>
                      setQtyByLineId((prev) => ({ ...prev, [line.id]: v }))
                    }
                  />
                );
              })}
            </ul>
          </>
        )}

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={transferring}
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={() => void handleTransfer()}
            disabled={
              transferring ||
              inventoryLoading ||
              transferableLines.length === 0 ||
              totals.unitCount <= 0
            }
          >
            {transferring ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <PackagePlus className='mr-2 h-4 w-4' />
            )}
            Transfer {totals.unitCount > 0 ? totals.unitCount.toLocaleString() : ''}{' '}
            units
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferRow({
  line,
  max,
  preview,
  qty,
  onQtyChange,
}: {
  line: { id: string; description: string; code: string; transferredQty?: number };
  max: number;
  preview?: ReceivalTransferPreviewRow;
  qty: string;
  onQtyChange: (v: string) => void;
}) {
  const transferred = line.transferredQty ?? 0;
  return (
    <li className='grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[1fr_5rem_6rem] sm:items-center'>
      <div className='min-w-0'>
        <p className='truncate text-sm font-medium'>{line.description}</p>
        <p className='font-mono text-xs text-muted-foreground'>{line.code || '—'}</p>
        <div className='mt-1 flex flex-wrap gap-1.5'>
          {transferred > 0 ? (
            <Badge variant='secondary' className='text-[10px] tabular-nums'>
              {transferred} already in warehouse
            </Badge>
          ) : null}
          {preview ? (
            <Badge
              variant='outline'
              className={cn(
                'text-[10px]',
                preview.match === 'new' &&
                  'border-amber-200 bg-amber-50 text-amber-900',
                preview.match === 'code' &&
                  'border-emerald-200 bg-emerald-50 text-emerald-900'
              )}
            >
              {preview.match === 'new'
                ? 'Will create inventory'
                : preview.match === 'code'
                  ? 'Match by barcode'
                  : 'Match by name'}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className='text-xs text-muted-foreground sm:text-right'>
        Remaining{' '}
        <span className='font-medium tabular-nums text-foreground'>{max}</span>
      </div>
      <Input
        type='number'
        min={0}
        max={max}
        inputMode='numeric'
        value={qty}
        onChange={(e) => onQtyChange(e.target.value)}
        className='h-8 text-right text-sm tabular-nums'
        aria-label={`Transfer quantity for ${line.description}`}
      />
    </li>
  );
}
