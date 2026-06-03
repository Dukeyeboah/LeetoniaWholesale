'use client';

import { useState } from 'react';
import type { Product } from '@/types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, AlertCircle, Minus } from 'lucide-react';
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
  const { user, isAdmin, viewMode } = useAuth();
  const showPrice = true;
  const sellableQty = availableToSell(product);
  const isOutOfStock = sellableQty <= 0;
  const isLowStock = sellableQty > 0 && sellableQty < 10;
  const maxQuantity = Math.min(sellableQty, 999);

  const handleQuantityChange = (value: number) => {
    const newQuantity = Math.max(1, Math.min(value, maxQuantity));
    setQuantity(newQuantity);
  };

  const handleIncrement = () => {
    if (quantity < maxQuantity) {
      setQuantity(quantity + 1);
    }
  };
  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };
  const handleAddToCart = () => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    if (!isOutOfStock && quantity > 0 && quantity <= sellableQty) {
      onAddToCart(product, quantity);
      setQuantity(1); // Reset to 1 after adding
    }
  };

  return (
    <Card className='overflow-hidden transition-all hover:shadow-md border-border/60 bg-card flex flex-col h-full'>
      <div className='aspect-[3/2] relative bg-secondary/20 flex items-center justify-center text-muted-foreground overflow-hidden'>
        {/* Lazy loading image component */}
        {product.imageUrl && !imageError ? (
          <LazyImage
            src={product.imageUrl}
            alt={product.name}
            className='w-full h-full object-cover'
            onError={() => setImageError(true)}
          />
        ) : (
          <span className='text-2xl font-serif opacity-30'>
            {product.name.charAt(0)}
          </span>
        )}

        {isOutOfStock && (
          <div className='absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center'>
            <Badge variant='destructive' className='text-xs px-2 py-0.5'>
              Out of Stock
            </Badge>
          </div>
        )}
      </div>
      <CardHeader className='p-3 pb-0 flex-shrink-0'>
        <div className='flex justify-between items-start gap-2'>
          <div className='flex-1 min-w-0'>
            <div className='flex items-start justify-between gap-3'>
              <CardTitle className='font-serif text-base leading-tight line-clamp-2'>
                {product.name}
              </CardTitle>
              {showPrice && (
                <span className='font-bold text-primary text-base flex-shrink-0'>
                  ₵{product.price.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className='p-3 pt-0 flex-shrink-0'>
        <div className='flex items-center gap-2 text-sm'>
          <div
            className={`h-2 w-2 rounded-full flex-shrink-0 ${
              isOutOfStock
                ? 'bg-destructive'
                : isLowStock
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
          />
          <span
            className={
              isOutOfStock
                ? 'text-destructive font-medium'
                : isLowStock
                  ? 'text-yellow-600'
                  : 'text-green-600'
            }
          >
            {isOutOfStock
              ? 'Unavailable'
              : `${sellableQty} available to order`}
          </span>
        </div>
      </CardContent>
      <CardFooter className='p-2 sm:p-3 pt-0 mt-auto min-w-0'>
        {!isOutOfStock ? (
          <div className='flex flex-col gap-2 w-full min-w-0 sm:flex-row sm:items-center sm:gap-2'>
            <div className='flex items-center justify-center gap-1.5 min-w-0 w-full sm:w-auto sm:justify-start'>
              <Label
                htmlFor={`qty-${product.id}`}
                className='text-[10px] sm:text-xs text-muted-foreground shrink-0'
              >
                Qty
              </Label>
              <Button
                variant='outline'
                size='icon'
                className='h-7 w-7 shrink-0 sm:h-8 sm:w-8'
                onClick={handleDecrement}
                disabled={quantity <= 1}
                aria-label='Decrease quantity'
              >
                <Minus className='h-3 w-3' />
              </Button>
              <Input
                id={`qty-${product.id}`}
                type='number'
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) =>
                  handleQuantityChange(parseInt(e.target.value, 10) || 1)
                }
                className='w-10 min-w-0 text-center h-7 text-xs px-1 sm:w-12 sm:h-8 sm:text-sm'
              />
              <Button
                variant='outline'
                size='icon'
                className='h-7 w-7 shrink-0 sm:h-8 sm:w-8'
                onClick={handleIncrement}
                disabled={quantity >= maxQuantity}
                aria-label='Increase quantity'
              >
                <Plus className='h-3 w-3' />
              </Button>
            </div>
            <Button
              className='w-full min-w-0 h-8 text-xs px-2 sm:h-9 sm:text-sm sm:ml-auto sm:w-auto sm:max-w-[10.5rem] md:max-w-none shrink-0'
              variant='default'
              size='sm'
              onClick={handleAddToCart}
            >
              <Plus className='h-3 w-3 shrink-0 sm:mr-1.5' />
              <span className='truncate'>Add to order</span>
            </Button>
          </div>
        ) : (
          <Button
            className='w-full h-8 text-xs sm:h-9 sm:text-sm'
            variant='outline'
            disabled={isOutOfStock && user !== null}
            onClick={() => {
              if (!user) {
                setShowLoginDialog(true);
                return;
              }
            }}
          >
            <AlertCircle className='mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4 shrink-0' />
            Notify me
          </Button>
        )}
      </CardFooter>
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </Card>
  );
}
