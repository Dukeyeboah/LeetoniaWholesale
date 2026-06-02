'use client';

import type { Product } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AdminInventoryRowActions } from '@/components/admin-inventory-row-actions';
import { AdminInventoryThumb } from '@/components/admin-inventory-thumb';
import {
  availableToSell,
  reservedForOrders,
  wholesaleOnHand,
} from '@/lib/inventory-availability';
import {
  normalizeWarehouseCode,
  type WarehouseProductMatch,
  type WarehouseRow,
} from '@/lib/warehouse-data';
import type { AdminInventoryLayout } from '@/components/admin-storefront-inventory-item';

type Props = {
  row: WarehouseRow;
  match: Product | null;
  matchKind?: WarehouseProductMatch;
  layout: AdminInventoryLayout;
  onEdit: (product: Product) => void;
  onToggleVisibility: (product: Product) => void;
  onDelete: (productId: string) => void;
};

function computeStoreroomRowDerived(row: WarehouseRow, match: Product | null) {
  const codeKey = normalizeWarehouseCode(row.code);
  const fileQty = Math.max(0, Math.floor(Number(row.quantity) || 0));
  const filePrice = Number(row.price) || 0;
  const displayQty = match
    ? Math.max(0, match.storeroomStock ?? 0)
    : fileQty;
  const displayPrice =
    match?.storeroomPrice != null && Number.isFinite(match.storeroomPrice)
      ? match.storeroomPrice
      : filePrice;
  const lineValue = displayPrice * displayQty;
  const wholesaleStock = match ? wholesaleOnHand(match) : 0;
  const inProcess = match ? reservedForOrders(match) : 0;
  const avail = match ? availableToSell(match) : 0;
  const isZeroStoreroom = displayQty === 0;
  const qtyOutOfSync = match != null && displayQty !== fileQty;
  const priceOutOfSync =
    match != null &&
    match.storeroomPrice != null &&
    Math.abs(match.storeroomPrice - filePrice) > 0.009;

  return {
    codeKey,
    fileQty,
    filePrice,
    displayQty,
    displayPrice,
    lineValue,
    wholesaleStock,
    inProcess,
    avail,
    isZeroStoreroom,
    qtyOutOfSync,
    priceOutOfSync,
  };
}

function CardImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className='aspect-[4/3] w-full relative bg-muted/30 overflow-hidden border-b'>
      {imageUrl ? (
        <img src={imageUrl} alt='' className='w-full h-full object-cover' />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center text-4xl font-serif text-muted-foreground/40'>
          {initial}
        </span>
      )}
    </div>
  );
}

export function AdminStoreroomInventoryItem({
  row,
  match,
  matchKind,
  layout,
  onEdit,
  onToggleVisibility,
  onDelete,
}: Props) {
  const d = computeStoreroomRowDerived(row, match);

  if (layout === 'grid') {
    return (
      <Card
        className={`min-w-0 w-full max-w-full overflow-hidden flex flex-col h-full ${
          d.isZeroStoreroom ? 'opacity-45' : ''
        }`}
      >
        <CardImage
          imageUrl={match?.imageUrl}
          name={row.description || match?.name || ''}
        />
        <CardContent className='p-3 flex flex-col flex-1 gap-2'>
          <div className='font-mono text-xs text-muted-foreground'>
            {d.codeKey}
          </div>
          <div className='space-y-1 min-w-0 flex-1'>
            <h3
              className='font-medium text-sm leading-snug line-clamp-2'
              title={row.description}
            >
              {row.description}
            </h3>
            {match ? (
              <Badge variant='outline' className='text-xs'>
                {matchKind === 'name'
                  ? 'Matched by name'
                  : 'Matched by code'}
              </Badge>
            ) : (
              <Badge variant='secondary' className='text-xs'>
                Not in inventory
              </Badge>
            )}
            {match && match.name !== row.description.trim() && (
              <p className='text-xs text-muted-foreground line-clamp-1'>
                Listed as: {match.name}
              </p>
            )}
          </div>
          <dl className='grid grid-cols-2 gap-x-2 gap-y-1 text-sm tabular-nums'>
            <dt className='text-xs text-muted-foreground'>Price</dt>
            <dd className='font-medium text-right'>
              ₵{d.displayPrice.toFixed(2)}
            </dd>
            <dt className='text-xs text-muted-foreground'>Qty</dt>
            <dd className='font-medium text-right'>{d.displayQty}</dd>
            <dt className='text-xs text-muted-foreground'>Line</dt>
            <dd className='font-medium text-right'>
              ₵{d.lineValue.toFixed(2)}
            </dd>
          </dl>
          {(d.priceOutOfSync || d.qtyOutOfSync) && (
            <p className='text-[10px] text-amber-800'>
              File: ₵{d.filePrice.toFixed(2)} × {d.fileQty}
            </p>
          )}
          <div className='flex flex-wrap gap-1.5'>
            {match == null ? (
              <span className='text-xs text-muted-foreground'>Not linked</span>
            ) : d.qtyOutOfSync || d.priceOutOfSync ? (
              <Badge variant='secondary' className='text-xs'>
                Needs sync
              </Badge>
            ) : (
              <Badge variant='outline' className='text-xs'>
                Synced
              </Badge>
            )}
            {match && (
              <Badge variant='outline' className='text-xs'>
                {d.avail} sellable wholesale
              </Badge>
            )}
          </div>
          {match ? (
            <AdminInventoryRowActions
              product={match}
              onEdit={onEdit}
              onToggleVisibility={onToggleVisibility}
              onDelete={onDelete}
              showVisibilityToggle={false}
              className='justify-center pt-1 border-t w-full'
            />
          ) : (
            <p className='text-xs text-muted-foreground text-center pt-1 border-t'>
              Sync to add
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={`w-full min-w-0 max-w-full p-4 border-b last:border-0 hover:bg-muted/5 transition-colors ${
        d.isZeroStoreroom ? 'opacity-45' : ''
      }`}
    >
      <div className='flex gap-3 min-w-0'>
        <AdminInventoryThumb
          imageUrl={match?.imageUrl}
          name={row.description || match?.name || ''}
        />
        <div className='flex-1 min-w-0 space-y-1'>
          <p className='font-mono text-xs text-muted-foreground'>{d.codeKey}</p>
          <p
            className='font-medium text-sm leading-snug line-clamp-2 break-words'
            title={row.description}
          >
            {row.description}
          </p>
          {match ? (
            <Badge variant='outline' className='text-xs'>
              {matchKind === 'name'
                ? 'Matched by name'
                : 'Matched by code'}
            </Badge>
          ) : (
            <Badge variant='secondary' className='text-xs'>
              Not in inventory
            </Badge>
          )}
        </div>
      </div>
      <dl className='mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm tabular-nums'>
        <dt className='text-muted-foreground'>Price</dt>
        <dd className='text-right font-medium'>
          ₵{d.displayPrice.toFixed(2)}
          {d.priceOutOfSync && (
            <span className='block text-[10px] text-amber-800 font-normal'>
              File ₵{d.filePrice.toFixed(2)}
            </span>
          )}
        </dd>
        <dt className='text-muted-foreground'>Qty</dt>
        <dd className='text-right font-medium'>
          {d.displayQty}
          {d.qtyOutOfSync && (
            <span className='block text-[10px] text-amber-800 font-normal'>
              File {d.fileQty}
            </span>
          )}
        </dd>
        <dt className='text-muted-foreground'>Line</dt>
        <dd className='text-right font-medium'>₵{d.lineValue.toFixed(2)}</dd>
        <dt className='text-muted-foreground'>Sync</dt>
        <dd className='text-right'>
          {match == null ? (
            <span className='text-xs text-muted-foreground'>Not linked</span>
          ) : d.qtyOutOfSync || d.priceOutOfSync ? (
            <Badge variant='secondary' className='text-xs'>
              Needs sync
            </Badge>
          ) : (
            <Badge variant='outline' className='text-xs'>
              Synced
            </Badge>
          )}
        </dd>
      </dl>
      {match && (
        <p className='text-[11px] text-amber-800 mt-2'>
          Wholesale: {d.avail} sellable · {d.inProcess} in process ·{' '}
          {d.wholesaleStock} shelf
        </p>
      )}
      <div className='mt-3 flex justify-center border-t pt-2'>
        {match ? (
          <AdminInventoryRowActions
            product={match}
            onEdit={onEdit}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete}
            showVisibilityToggle={false}
            className='justify-center w-full'
          />
        ) : (
          <span className='text-xs text-muted-foreground'>Sync to add</span>
        )}
      </div>
    </div>
  );
}
