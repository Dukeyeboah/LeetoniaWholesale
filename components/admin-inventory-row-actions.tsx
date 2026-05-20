'use client';

import type { Product } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Edit, Eye, EyeOff, Trash2 } from 'lucide-react';

type Props = {
  product: Product;
  onEdit: (product: Product) => void;
  onToggleVisibility: (product: Product) => void;
  onDelete: (productId: string) => void;
  /** Hide/show applies to wholesale storefront only — not shown on storeroom rows. */
  showVisibilityToggle?: boolean;
};

export function AdminInventoryRowActions({
  product,
  onEdit,
  onToggleVisibility,
  onDelete,
  showVisibilityToggle = true,
}: Props) {
  const hidden = product.isHidden ?? false;

  return (
    <div className='flex justify-end gap-1 shrink-0'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={() => onEdit(product)}
            aria-label='Edit product'
          >
            <Edit className='h-4 w-4' />
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
              className='h-8 w-8'
              onClick={() => onToggleVisibility(product)}
              aria-label={hidden ? 'Show on storefront' : 'Hide from storefront'}
            >
              {hidden ? (
                <EyeOff className='h-4 w-4' />
              ) : (
                <Eye className='h-4 w-4' />
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
            className='h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10'
            onClick={() => onDelete(product.id)}
            aria-label='Delete product'
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          Permanently delete this product from inventory
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
