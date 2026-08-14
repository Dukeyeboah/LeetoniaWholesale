'use client';

import { useState, useEffect } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { useCart } from '@/hooks/use-cart'; // Import useCart
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, WifiOff, ChevronDown, Loader2 } from 'lucide-react';
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
import { PRODUCT_CATEGORIES, PRODUCT_SUBCATEGORIES } from '@/lib/categories';

const INITIAL_PAGE_SIZE = 50;
const LOAD_MORE_SIZE = 50;

const LETTER_OPTIONS = [
  'all',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  '0-9',
] as const;
type LetterFilter = (typeof LETTER_OPTIONS)[number];

function getFirstCharacterGroup(name: string): string {
  const first = (name || '').trim()[0];
  if (!first) return '';
  if (/\d/.test(first)) return '0-9';
  const upper = first.toUpperCase();
  return /[A-Z]/.test(upper) ? upper : '';
}

export default function InventoryPage() {
  const { products, loading, offline } = useInventory();
  const { addToCart } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState('all');
  const [letterFilter, setLetterFilter] = useState<LetterFilter>('all');
  const [isMounted, setIsMounted] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const [showLetterFilter, setShowLetterFilter] = useState(false);


  // Fix hydration errors by only rendering Select after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Reset to first page when search, category, or letter changes
  useEffect(() => {
    setVisibleCount(INITIAL_PAGE_SIZE);
  }, [searchQuery, categoryFilter, subCategoryFilter, letterFilter]);

  // Always use products from Firebase/IndexedDB - don't fall back to mock data
  // Mock data is only for development/testing when no data is seeded
  // Filter out hidden products (only show to customers if not hidden)
   const displayProducts = products.filter((p) => !p.isHidden);
  //const displayProducts = products.filter((p) => p.isHidden !== true);

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
    const matchesSubCategory =
      subCategoryFilter === 'all' || product.subCategory === subCategoryFilter;
    const matchesLetter =
      letterFilter === 'all' ||
      getFirstCharacterGroup(product.name || '') === letterFilter;
    return matchesSearch && matchesCategory && matchesSubCategory && matchesLetter;
  });

  const productsToShow = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  const handleAddToCart = (product: Product, quantity: number) => {
    addToCart(product, quantity);
  };

  const idleFill =
    'border-border/70 bg-white text-foreground shadow-sm';
  const activeFill = '!bg-control border-primary/20 text-foreground';
  const searchClass = `h-9 rounded-full cursor-text ${idleFill}`;
  const filterControlClass = `inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center overflow-hidden rounded-full border px-2.5 text-xs font-medium sm:flex-none ${idleFill}`;
  const selectControlClass = `${filterControlClass} w-full justify-between gap-1 pr-1.5 pl-2.5 data-[state=open]:!bg-control [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left [&_svg]:ml-auto [&_svg]:shrink-0`;

  return (
    <div className='space-y-2'>
      {offline && products.length === 0 && (
        <Badge
          variant='outline'
          className='bg-yellow-50/50 text-yellow-700 border-yellow-200 w-fit flex gap-1.5 items-center px-3 py-1'
        >
          <WifiOff className='h-3 w-3' />
          Offline Mode
        </Badge>
      )}

      <div className='sticky top-[var(--storefront-nav-h,3rem)] z-30 -mx-4 space-y-2 bg-background px-4 py-1.5 transition-[top] duration-200 ease-out md:-mx-8 md:px-8'>
        <div className='flex justify-center'>
          <div className='relative w-full sm:w-80 sm:shrink-0'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              placeholder='Search…'
              className={`pl-9 ${searchClass}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className='flex items-center justify-center gap-1.5'>
          <button
            type='button'
            aria-pressed={showLetterFilter}
            className={`${filterControlClass} justify-center sm:w-28 ${
              showLetterFilter ? activeFill : ''
            }`}
            onClick={() => setShowLetterFilter((open) => !open)}
          >
            Name
          </button>
          {isMounted ? (
            <>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger
                  className={`${selectControlClass} sm:w-40 ${
                    categoryFilter !== 'all' ? activeFill : ''
                  }`}
                >
                  <SelectValue placeholder='Categories' />
                </SelectTrigger>
                <SelectContent className='max-w-[min(100vw-2rem,280px)]'>
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat}
                      value={cat}
                      className='truncate pr-8'
                      title={cat}
                    >
                      {cat === 'all' ? 'Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={subCategoryFilter}
                onValueChange={setSubCategoryFilter}
              >
                <SelectTrigger
                  className={`${selectControlClass} sm:w-32 ${
                    subCategoryFilter !== 'all' ? activeFill : ''
                  }`}
                >
                  <SelectValue placeholder='Types' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Types</SelectItem>
                  {PRODUCT_SUBCATEGORIES.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <>
              <div className={`${filterControlClass} sm:w-40`} />
              <div className={`${filterControlClass} sm:w-32`} />
            </>
          )}
        </div>

        {showLetterFilter && (
          <div className='grid grid-cols-[repeat(14,minmax(0,1fr))] gap-px sm:flex sm:flex-wrap sm:justify-center sm:gap-1.5'>
            {LETTER_OPTIONS.map((letter) => (
              <Button
                key={letter}
                variant='secondary'
                size='sm'
                className={`h-6 w-full rounded-full border-0 p-0 text-[10px] font-medium shadow-none sm:h-8 sm:w-auto sm:min-w-[2rem] sm:px-2 sm:text-sm ${
                  letterFilter === letter
                    ? '!bg-control text-foreground'
                    : 'bg-secondary/70 text-foreground'
                }`}
                onClick={() => setLetterFilter(letter)}
              >
                {letter === 'all' ? 'All' : letter}
              </Button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div
          className='relative rounded-lg border bg-card/50 min-h-[280px] flex flex-col items-center justify-center gap-4 py-16 px-6'
          role='status'
          aria-live='polite'
        >
          <Loader2 className='h-10 w-10 animate-spin text-primary' />
          <div className='text-center space-y-2 max-w-md'>
            <p className='font-medium text-foreground'>
              Loading products…
            </p>
            <p className='text-sm text-muted-foreground animate-pulse'>
              Please wait while we load the wholesale catalog. With thousands of
              items this may take a moment.
            </p>
          </div>
          <div className='grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 w-full mt-4 opacity-40 pointer-events-none'>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className='h-[280px] w-full rounded-lg' />
            ))}
          </div>
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
              setSubCategoryFilter('all');
              setLetterFilter('all');
            }}
          >
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className='space-y-6'>
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3'>
            {productsToShow.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
          {filteredProducts.length > INITIAL_PAGE_SIZE && (
            <div className='flex flex-col items-center gap-3 pt-4'>
              <p className='text-sm text-muted-foreground'>
                Showing {productsToShow.length} of {filteredProducts.length} products
              </p>
              {hasMore && (
                <Button
                  variant='outline'
                  size='lg'
                  onClick={() => setVisibleCount((prev) => prev + LOAD_MORE_SIZE)}
                  className='gap-2'
                >
                  <ChevronDown className='h-4 w-4' />
                  Show more ({Math.min(LOAD_MORE_SIZE, filteredProducts.length - visibleCount)} more)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
