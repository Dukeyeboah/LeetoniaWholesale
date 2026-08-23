'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInventory } from '@/hooks/use-inventory';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, WifiOff, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Product } from '@/types';
import { Badge } from '@/components/ui/badge';
import { PRODUCT_CATEGORIES, PRODUCT_SUBCATEGORIES } from '@/lib/categories';
import {
  INVENTORY_LETTER_OPTIONS,
  getFirstCharacterGroup,
  type InventoryLetterFilter,
} from '@/lib/inventory-filters';

const INITIAL_PAGE_SIZE = 50;
const LOAD_MORE_SIZE = 50;

function InventoryCatalog() {
  const { products, loading, offline } = useInventory();
  const { addToCart } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState('all');
  const [letterFilter, setLetterFilter] = useState<InventoryLetterFilter>('all');
  const [discoveryFilters, setDiscoveryFilters] = useState({
    name: false,
    category: false,
    type: false,
  });
  const [isMounted, setIsMounted] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_PAGE_SIZE);
  }, [
    searchQuery,
    categoryFilter,
    subCategoryFilter,
    letterFilter,
    discoveryFilters,
  ]);

  const displayProducts = products.filter((p) => !p.isHidden);

  const productCategories = Array.from(
    new Set(displayProducts.map((p) => p.category).filter(Boolean))
  );
  const allCategories = new Set([...PRODUCT_CATEGORIES, ...productCategories]);
  const categories = ['all', ...Array.from(allCategories).sort()];

  const filteredProducts = displayProducts.filter((product) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      product.description?.toLowerCase().includes(q);
    const matchesCategory =
      !discoveryFilters.category ||
      categoryFilter === 'all' ||
      product.category === categoryFilter;
    const matchesSubCategory =
      !discoveryFilters.type ||
      subCategoryFilter === 'all' ||
      product.subCategory === subCategoryFilter;
    const matchesLetter =
      !discoveryFilters.name ||
      letterFilter === 'all' ||
      getFirstCharacterGroup(product.name || '') === letterFilter;
    return matchesSearch && matchesCategory && matchesSubCategory && matchesLetter;
  });

  const productsToShow = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;
  const filtersActive =
    discoveryFilters.name ||
    discoveryFilters.category ||
    discoveryFilters.type ||
    Boolean(searchQuery.trim()) ||
    letterFilter !== 'all' ||
    categoryFilter !== 'all' ||
    subCategoryFilter !== 'all';

  const handleAddToCart = (product: Product, quantity: number) => {
    addToCart(product, quantity);
  };

  const clearFilters = () => {
    setDiscoveryFilters({ name: false, category: false, type: false });
    setLetterFilter('all');
    setCategoryFilter('all');
    setSubCategoryFilter('all');
    setSearchQuery('');
    if (searchParams.get('q')) {
      router.replace('/inventory', { scroll: false });
    }
  };

  const idleFill = 'border-border/70 bg-white text-foreground shadow-sm';
  const activeFill = '!bg-control border-primary/20 text-foreground';
  const searchClass = `h-8 rounded-full cursor-text ${idleFill}`;
  const filterControlClass = `inline-flex h-8 min-w-0 cursor-pointer items-center overflow-hidden rounded-full border px-2.5 text-xs font-medium ${idleFill}`;
  const selectControlClass = `${filterControlClass} w-full justify-between gap-1 pr-1.5 pl-2.5 data-[state=open]:!bg-control [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left [&_svg]:ml-auto [&_svg]:shrink-0`;

  const renderCategorySelect = () => (
    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
      <SelectTrigger
        className={`${selectControlClass} ${
          categoryFilter !== 'all' ? activeFill : ''
        }`}
      >
        <SelectValue placeholder='All categories' />
      </SelectTrigger>
      <SelectContent className='max-w-[min(100vw-2rem,280px)]'>
        {categories.map((cat) => (
          <SelectItem
            key={cat}
            value={cat}
            className='truncate pr-8'
            title={cat}
          >
            {cat === 'all' ? 'All categories' : cat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderTypeSelect = () => (
    <Select value={subCategoryFilter} onValueChange={setSubCategoryFilter}>
      <SelectTrigger
        className={`${selectControlClass} ${
          subCategoryFilter !== 'all' ? activeFill : ''
        }`}
      >
        <SelectValue placeholder='All types' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='all'>All types</SelectItem>
        {PRODUCT_SUBCATEGORIES.map((sub) => (
          <SelectItem key={sub} value={sub}>
            {sub}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

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

      <div className='sticky top-[var(--storefront-nav-h,3.5rem)] z-30 -mx-4 space-y-2 bg-background px-4 py-1.5 transition-[top] duration-200 ease-out md:-mx-8 md:px-8'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='relative min-w-0 w-full sm:flex-1'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              placeholder='Search products…'
              className={`pl-9 ${searchClass}`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label='Search products'
            />
          </div>
          <div className='flex min-w-0 items-center justify-between gap-2 sm:justify-end'>
            {isMounted && discoveryFilters.category && (
              <div className='min-w-0 max-w-[11rem] shrink'>
                {renderCategorySelect()}
              </div>
            )}
            {isMounted && discoveryFilters.type && (
              <div className='min-w-0 max-w-[9rem] shrink'>
                {renderTypeSelect()}
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium ${
                    discoveryFilters.name ||
                    discoveryFilters.category ||
                    discoveryFilters.type ||
                    categoryFilter !== 'all' ||
                    subCategoryFilter !== 'all' ||
                    letterFilter !== 'all'
                      ? activeFill
                      : idleFill
                  }`}
                >
                  <SlidersHorizontal className='mr-1.5 h-3.5 w-3.5' />
                  {(() => {
                    const parts = [
                      discoveryFilters.name ? 'Name' : null,
                      discoveryFilters.category ? 'Category' : null,
                      discoveryFilters.type ? 'Type' : null,
                    ].filter(Boolean);
                    if (parts.length === 0) return 'Filter';
                    if (parts.length === 1) return parts[0];
                    return `${parts[0]} +${parts.length - 1}`;
                  })()}
                  <ChevronDown className='ml-1 h-3.5 w-3.5 opacity-70' />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-72 space-y-4'>
                <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                  FILTER
                </p>
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Combine filters</p>
                  {(
                    [
                      ['name', 'Name'],
                      ['category', 'Category'],
                      ['type', 'Type'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className='flex items-center gap-2'>
                      <Checkbox
                        id={`filter-${key}`}
                        checked={discoveryFilters[key]}
                        onCheckedChange={(checked) => {
                          const on = checked === true;
                          setDiscoveryFilters((prev) => ({ ...prev, [key]: on }));
                          if (!on && key === 'name') setLetterFilter('all');
                          if (!on && key === 'category') setCategoryFilter('all');
                          if (!on && key === 'type') setSubCategoryFilter('all');
                        }}
                      />
                      <Label htmlFor={`filter-${key}`} className='font-normal'>
                        {label}
                      </Label>
                    </div>
                  ))}
                  <p className='text-xs text-muted-foreground'>
                    Turn on Name with Category or Type to browse letters inside
                    that group.
                  </p>
                </div>
                {discoveryFilters.name && (
                  <p className='text-xs text-muted-foreground'>
                    Name is on. Choose a letter below — it applies together with
                    Category or Type if those are also on.
                  </p>
                )}
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='w-full'
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
            <p className='ml-auto shrink-0 text-xs tabular-nums text-muted-foreground sm:ml-0 sm:text-sm'>
              {loading
                ? '…'
                : `${filteredProducts.length.toLocaleString()} product${
                    filteredProducts.length === 1 ? '' : 's'
                  }`}
            </p>
          </div>
        </div>

        {discoveryFilters.name && (
          <div className='grid grid-cols-[repeat(14,minmax(0,1fr))] gap-px sm:flex sm:flex-wrap sm:justify-center sm:gap-1.5'>
            {INVENTORY_LETTER_OPTIONS.map((letter) => (
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
            <p className='font-medium text-foreground'>Loading products…</p>
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
          {filtersActive && (
            <Button variant='link' className='mt-2' onClick={clearFilters}>
              Clear all filters
            </Button>
          )}
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
                Showing {productsToShow.length} of {filteredProducts.length}{' '}
                products
              </p>
              {hasMore && (
                <Button
                  variant='outline'
                  size='lg'
                  onClick={() =>
                    setVisibleCount((prev) => prev + LOAD_MORE_SIZE)
                  }
                  className='gap-2'
                >
                  <ChevronDown className='h-4 w-4' />
                  Show more (
                  {Math.min(
                    LOAD_MORE_SIZE,
                    filteredProducts.length - visibleCount
                  )}{' '}
                  more)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-[40vh] items-center justify-center'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      }
    >
      <InventoryCatalog />
    </Suspense>
  );
}
