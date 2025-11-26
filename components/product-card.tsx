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
import { Plus, AlertCircle, Minus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity: number) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  const { isAdmin, viewMode } = useAuth();
  const showPrice = isAdmin || viewMode === 'admin';
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock < 10;
  const maxQuantity = Math.min(product.stock, 999);

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
    if (!isOutOfStock && quantity > 0 && quantity <= product.stock) {
      onAddToCart(product, quantity);
      setQuantity(1); // Reset to 1 after adding
    }
  };

  return (
    <Card className='overflow-hidden transition-all hover:shadow-md border-border/60 bg-card'>
      <div className='aspect-square relative bg-secondary/20 flex items-center justify-center text-muted-foreground'>
        {/* Placeholder for image - in real app use Next/Image */}
        {product.imageUrl ? (
          <img
            src={product.imageUrl || '/placeholder.svg'}
            alt={product.name}
            className='w-full h-full object-cover'
          />
        ) : (
          <span className='text-4xl font-serif opacity-20'>
            {product.name.charAt(0)}
          </span>
        )}

        {isOutOfStock && (
          <div className='absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center'>
            <Badge variant='destructive' className='text-sm px-3 py-1'>
              Out of Stock
            </Badge>
          </div>
        )}
      </div>
      <CardHeader className='p-4 pb-2'>
        <div className='flex justify-between items-start gap-2'>
          <div className='space-y-1'>
            <Badge
              variant='outline'
              className='text-[10px] text-muted-foreground tracking-wider uppercase bg-transparent border-muted-foreground/30'
            >
              {product.category}
            </Badge>
            <CardTitle className='font-serif text-lg leading-tight line-clamp-2 min-h-[3rem]'>
              {product.name}
            </CardTitle>
          </div>
          {showPrice && (
            <div className='text-right'>
              <span className='block font-bold text-primary text-lg'>
                ₵{product.price.toFixed(2)}
              </span>
              <span className='text-xs text-muted-foreground'>
                per {product.unit}
              </span>
            </div>
          )}
          {!showPrice && (
            <div className='text-right'>
              <span className='text-xs text-muted-foreground'>
                {product.unit}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className='p-4 pt-2'>
        <p className='text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]'>
          {product.description || 'No description available.'}
        </p>

        <div className='mt-3 flex items-center gap-2 text-xs'>
          <div
            className={`h-2 w-2 rounded-full ${
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
            {isOutOfStock ? 'Unavailable' : `${product.stock} in stock`}
          </span>
        </div>
      </CardContent>
      <CardFooter className='p-4 pt-0 space-y-2 flex-col'>
        {!isOutOfStock && (
          <div className='flex items-center gap-2 w-full'>
            <Button
              variant='outline'
              size='icon'
              className='h-9 w-9'
              onClick={handleDecrement}
              disabled={quantity <= 1}
            >
              <Minus className='h-4 w-4' />
            </Button>
            <Input
              type='number'
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) =>
                handleQuantityChange(parseInt(e.target.value) || 1)
              }
              className='flex-1 text-center h-9'
            />
            <Button
              variant='outline'
              size='icon'
              className='h-9 w-9'
              onClick={handleIncrement}
              disabled={quantity >= maxQuantity}
            >
              <Plus className='h-4 w-4' />
            </Button>
          </div>
        )}
        <Button
          className='w-full'
          variant={isOutOfStock ? 'outline' : 'default'}
          disabled={isOutOfStock}
          onClick={handleAddToCart}
        >
          {isOutOfStock ? (
            <>
              <AlertCircle className='mr-2 h-4 w-4' />
              Notify Me
            </>
          ) : (
            <>
              <Plus className='mr-2 h-4 w-4' />
              Add to Order ({quantity})
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
