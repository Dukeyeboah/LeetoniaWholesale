'use client';

import { useState } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { useCart } from '@/hooks/use-cart'; // Import useCart
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, WifiOff } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Product } from '@/types';
import { Badge } from '@/components/ui/badge';
import { PRODUCT_CATEGORIES } from '@/lib/categories';

export default function InventoryPage() {
  const { products, loading, offline } = useInventory();
  const { addToCart } = useCart(); // Use hook
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Always use products from Firebase/IndexedDB - don't fall back to mock data
  // Mock data is only for development/testing when no data is seeded
  const displayProducts = products;

  // Get unique categories from products, merge with predefined categories
  const productCategories = Array.from(
    new Set(displayProducts.map((p) => p.category).filter(Boolean))
  );
  const allCategories = new Set([...PRODUCT_CATEGORIES, ...productCategories]);
  const categories = ['all', ...Array.from(allCategories).sort()];

  const filteredProducts = displayProducts.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleAddToCart = (product: Product, quantity: number) => {
    addToCart(product, quantity);
  };

  return (
    <div className='space-y-8'>
      <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-serif font-bold text-primary'>
            Inventory
          </h1>
          <p className='text-muted-foreground mt-1'>
            Browse available stock for order.
          </p>
        </div>
        {offline && products.length === 0 && (
          <Badge
            variant='outline'
            className='bg-yellow-50/50 text-yellow-700 border-yellow-200 w-fit flex gap-1.5 items-center px-3 py-1'
          >
            <WifiOff className='h-3 w-3' />
            Offline Mode
          </Badge>
        )}
      </div>

      <div className='flex flex-col md:flex-row gap-4 bg-card p-4 rounded-lg shadow-sm border'>
        {/* <div className='relative md:max-w- flex-1'> */}
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search medicines...'
            className='pl-9 bg-background border-border/60'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className='w-full md:w-[280px] bg-background border-border/60 overflow-hidden'>
            <div className='flex items-center gap-2 text-muted-foreground min-w-0 flex-1 overflow-hidden'>
              <Filter className='h-4 w-4 flex-shrink-0' />
              <SelectValue
                placeholder='Category'
                className='truncate min-w-0 flex-1'
              />
            </div>
          </SelectTrigger>
          <SelectContent className='max-w-[280px]'>
            {categories.map((cat) => (
              <SelectItem
                key={cat}
                value={cat}
                className='truncate pr-8'
                title={cat}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6'>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className='h-[320px] w-full rounded-lg' />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className='text-center py-20'>
          <div className='bg-muted/30 inline-flex p-6 rounded-full mb-4'>
            <Search className='h-10 w-10 text-muted-foreground/50' />
          </div>
          <h3 className='text-lg font-serif font-medium'>No products found</h3>
          <p className='text-muted-foreground'>
            Try adjusting your search or filters.
          </p>
          <Button
            variant='link'
            className='mt-2'
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('all');
            }}
          >
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6'>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
