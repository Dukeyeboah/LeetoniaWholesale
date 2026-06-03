'use client';

import type { Product } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Edit, Eye, EyeOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  product: Product;
  onEdit: (product: Product) => void;
  onToggleVisibility: (product: Product) => void;
  onDelete: (productId: string) => void;
  /** Hide/show applies to wholesale storefront only — not shown on storeroom rows. */
  showVisibilityToggle?: boolean;
  className?: string;
};

export function AdminInventoryRowActions({
  product,
  onEdit,
  onToggleVisibility,
  onDelete,
  showVisibilityToggle = true,
  className,
}: Props) {
  const hidden = product.isHidden ?? false;

  return (
    <div
      className={cn(
        'flex justify-end items-center gap-2.5 sm:gap-2 shrink-0',
        className
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-11 w-11 sm:h-9 sm:w-9 touch-manipulation'
            onClick={() => onEdit(product)}
            aria-label='Edit product'
          >
            <Edit className='h-5 w-5 sm:h-4 sm:w-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          Edit name, price, wholesale stock, and image
        </TooltipContent>
      </Tooltip>

      {showVisibilityToggle && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-11 w-11 sm:h-9 sm:w-9 touch-manipulation'
              onClick={() => onToggleVisibility(product)}
              aria-label={hidden ? 'Show on storefront' : 'Hide from storefront'}
            >
              {hidden ? (
                <EyeOff className='h-5 w-5 sm:h-4 sm:w-4' />
              ) : (
                <Eye className='h-5 w-5 sm:h-4 sm:w-4' />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>
            {hidden
              ? 'Show on wholesale storefront (clients can order again)'
              : 'Hide from wholesale storefront (clients will not see this item)'}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-11 w-11 sm:h-9 sm:w-9 touch-manipulation text-destructive hover:text-destructive hover:bg-destructive/10'
            onClick={() => onDelete(product.id)}
            aria-label='Delete product'
          >
            <Trash2 className='h-5 w-5 sm:h-4 sm:w-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          Permanently delete this product from inventory
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
