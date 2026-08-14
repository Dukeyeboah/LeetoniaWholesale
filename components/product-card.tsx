'use client';

import { useState } from 'react';
import type { Product } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  ShoppingCart,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { LoginDialog } from '@/components/login-dialog';
import { LazyImage } from '@/components/lazy-image';
import { availableToSell } from '@/lib/inventory-availability';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity: number) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { user } = useAuth();
  const sellableQty = availableToSell(product);
  const isOutOfStock = sellableQty <= 0;
  const isLowStock = sellableQty > 0 && sellableQty < 10;
  const maxQuantity = Math.min(sellableQty, 999);

  const handleQuantityChange = (value: number) => {
    setQuantity(Math.max(1, Math.min(value, maxQuantity || 1)));
  };

  const handleWhatsAppAdd = () => {
    if (isOutOfStock || quantity <= 0 || quantity > sellableQty) return;
    onAddToCart(product, quantity);
    setQuantity(1);
  };

  return (
    <Card className='overflow-hidden py-0 gap-0 border-border/50 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer'>
      <div className='aspect-[4/3] relative bg-secondary/20 flex items-center justify-center text-muted-foreground overflow-hidden'>
        {product.imageUrl && !imageError ? (
          <LazyImage
            src={product.imageUrl}
            alt={product.name}
            className='w-full h-full object-cover'
            onError={() => setImageError(true)}
          />
        ) : (
          <span className='text-lg font-serif opacity-30'>
            {product.name.charAt(0)}
          </span>
        )}
        {isOutOfStock && (
          <div className='absolute inset-0 bg-background/60 flex items-center justify-center'>
            <Badge variant='destructive' className='text-[10px] px-1.5 py-0'>
              Out of Stock
            </Badge>
          </div>
        )}
      </div>

      <div className='p-2 flex flex-col gap-1 flex-1 min-w-0'>
        <div className='flex items-start justify-between gap-1 min-w-0'>
          <h3
            className='font-medium text-xs leading-tight line-clamp-2 min-w-0'
            title={product.name}
          >
            {product.name}
          </h3>
          <span className='font-semibold text-primary text-xs tabular-nums shrink-0'>
            ₵{product.price.toFixed(2)}
          </span>
        </div>

        {!isOutOfStock ? (
          <div className='mt-auto flex items-center gap-1 min-w-0'>
            <span
              className={`text-[10px] leading-none shrink-0 tabular-nums ${
                isLowStock ? 'text-yellow-600' : 'text-green-700'
              }`}
              title={`${sellableQty} available`}
            >
              {sellableQty} avail
            </span>
            <div className='flex items-center ml-auto shrink-0'>
              <div className='flex flex-col -space-y-0.5'>
                <button
                  type='button'
                  className='h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30'
                  onClick={() => handleQuantityChange(quantity + 1)}
                  disabled={quantity >= maxQuantity}
                  aria-label='Increase quantity'
                >
                  <ChevronUp className='h-3 w-3' />
                </button>
                <button
                  type='button'
                  className='h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30'
                  onClick={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1}
                  aria-label='Decrease quantity'
                >
                  <ChevronDown className='h-3 w-3' />
                </button>
              </div>
              <span className='w-5 text-center text-xs tabular-nums font-medium'>
                {quantity}
              </span>
            </div>
            <button
              type='button'
              onClick={handleWhatsAppAdd}
              aria-label='Add to cart'
              title='Add to cart'
              className='ml-0.5 shrink-0 h-7 w-7 rounded-full bg-control text-primary shadow-sm hover:brightness-95 active:scale-95 transition-transform flex items-center justify-center cursor-pointer'
            >
              <ShoppingCart className='h-3.5 w-3.5' />
            </button>
          </div>
        ) : (
          <Button
            className='mt-auto w-full h-7 text-[10px]'
            variant='outline'
            size='sm'
            disabled={!!user}
            onClick={() => {
              if (!user) setShowLoginDialog(true);
            }}
          >
            <AlertCircle className='mr-1 h-3 w-3' />
            Notify me
          </Button>
        )}
      </div>
      <LoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        defaultIntent='signup'
      />
    </Card>
  );
}
