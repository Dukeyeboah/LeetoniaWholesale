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
        <div className='flex items-center gap-2 text-xs'>
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
      <CardFooter className='p-3 pt-0 mt-auto'>
        {!isOutOfStock ? (
          <div className='flex items-center gap-2 w-full'>
            {/* Quantity Selector on the left */}
            <div className='flex items-center gap-3 flex-shrink-0'>
              <Label
                htmlFor={`qty-${product.id}`}
                className='text-xs text-muted-foreground whitespace-nowrap'
              >
                Qty:
              </Label>
              <div className='flex items-center gap-1'>
                <Button
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  onClick={handleDecrement}
                  disabled={quantity <= 1}
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
                    handleQuantityChange(parseInt(e.target.value) || 1)
                  }
                  className='w-14 text-center h-8 text-sm'
                />
                <Button
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  onClick={handleIncrement}
                  disabled={quantity >= maxQuantity}
                >
                  <Plus className='h-3 w-3' />
                </Button>
              </div>
            </div>
            {/* Add to Order button on the right */}
            <Button
              className='w-40 ml-auto mr-auto'
              variant='default'
              onClick={handleAddToCart}
            >
              <Plus className='mr-2 h-4 w-4' />
              Add to Order
            </Button>
          </div>
        ) : (
          <Button
            className='w-full'
            variant='outline'
            disabled={isOutOfStock && user !== null}
            onClick={() => {
              if (!user) {
                setShowLoginDialog(true);
                return;
              }
              // Handle notify me functionality for authenticated users
            }}
          >
            <AlertCircle className='mr-2 h-4 w-4' />
            Notify Me
          </Button>
        )}
      </CardFooter>
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </Card>
  );
}
