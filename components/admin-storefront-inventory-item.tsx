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

export type AdminInventoryLayout = 'list' | 'grid';

type Props = {
  product: Product;
  layout: AdminInventoryLayout;
  onEdit: (product: Product) => void;
  onToggleVisibility: (product: Product) => void;
  onDelete: (productId: string) => void;
};

function CardImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className='aspect-[4/3] w-full relative bg-muted/30 overflow-hidden border-b'>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=''
          className='w-full h-full object-cover'
        />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center text-4xl font-serif text-muted-foreground/40'>
          {initial}
        </span>
      )}
    </div>
  );
}

export function AdminStorefrontInventoryItem({
  product,
  layout,
  onEdit,
  onToggleVisibility,
  onDelete,
}: Props) {
  const hidden = product.isHidden ?? false;
  const wholesaleStock = wholesaleOnHand(product);
  const inProcess = reservedForOrders(product);
  const avail = availableToSell(product);
  const storeroomStock = product.storeroomStock ?? 0;
  const isLow = avail > 0 && avail < 10;

  if (layout === 'grid') {
    return (
      <Card
        className={`overflow-hidden flex flex-col h-full ${
          hidden ? 'opacity-60' : ''
        }`}
      >
        <CardImage imageUrl={product.imageUrl} name={product.name} />
        <CardContent className='p-3 flex flex-col flex-1 gap-2'>
          <div className='space-y-1 min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-1.5'>
              {hidden && (
                <Badge variant='secondary' className='text-xs'>
                  Hidden
                </Badge>
              )}
              <h3
                className='font-medium text-sm leading-snug line-clamp-2'
                title={product.name}
              >
                {product.name}
              </h3>
            </div>
            <p className='text-xs text-muted-foreground line-clamp-1'>
              {product.category}
              {product.code ? ` · ${product.code}` : ''}
            </p>
          </div>
          <div className='text-lg font-semibold tabular-nums text-primary'>
            ₵{product.price.toFixed(2)}
          </div>
          <div className='space-y-1'>
            <Badge
              variant={
                avail === 0 ? 'destructive' : isLow ? 'secondary' : 'outline'
              }
              className={
                isLow ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' : ''
              }
            >
              {avail} sellable
            </Badge>
            <p className='text-[11px] text-amber-800 leading-tight'>
              {inProcess} in process · {wholesaleStock} on shelf
            </p>
            <p className='text-xs text-muted-foreground'>
              Storeroom: <span className='font-medium'>{storeroomStock}</span>
            </p>
          </div>
          <AdminInventoryRowActions
            product={product}
            onEdit={onEdit}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete}
            showVisibilityToggle
            className='justify-center pt-1 border-t w-full'
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={`flex flex-row items-start sm:items-center gap-3 p-4 border-b last:border-0 hover:bg-muted/5 transition-colors ${
        hidden ? 'opacity-60 bg-muted/20' : ''
      }`}
    >
      <AdminInventoryThumb imageUrl={product.imageUrl} name={product.name} />
      <div className='flex-1 min-w-0 space-y-1'>
        <div className='flex items-center gap-2 flex-wrap'>
          {hidden && (
            <Badge variant='secondary' className='text-xs'>
              Hidden
            </Badge>
          )}
          <span className='font-medium truncate' title={product.name}>
            {product.name}
          </span>
        </div>
        <p className='text-xs text-muted-foreground truncate'>
          {product.category}
          {product.code ? ` · ${product.code}` : ''}
        </p>
      </div>
      <div className='flex flex-row flex-wrap sm:flex-nowrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end sm:ml-auto'>
        <div className='w-28 text-right text-sm tabular-nums'>
          ₵{product.price.toFixed(2)}
        </div>
        <div className='w-48 sm:w-44 text-center space-y-0.5'>
          <Badge
            variant={
              avail === 0 ? 'destructive' : isLow ? 'secondary' : 'outline'
            }
            className={
              isLow ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' : ''
            }
          >
            {avail} sellable
          </Badge>
          <p className='text-[11px] text-amber-800 leading-tight'>
            {inProcess} in process · {wholesaleStock} on shelf
          </p>
        </div>
        <div className='w-16 flex justify-center'>
          <Badge variant='outline'>{storeroomStock}</Badge>
        </div>
        <AdminInventoryRowActions
          product={product}
          onEdit={onEdit}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
          showVisibilityToggle
        />
      </div>
    </div>
  );
}
