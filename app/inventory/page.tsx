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

// Helper to create mock data if empty (for demo)
const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Paracetamol 500mg',
    category: 'ANALGESICS & ANTI-INFLAMMATORIES (PAINKILLERS)',
    price: 15.0,
    stock: 500,
    unit: 'Box (10x10)',
    updatedAt: Date.now(),
    description: 'Effective pain relief and fever reducer.',
  },
  {
    id: '2',
    name: 'Amoxicillin 500mg',
    category: 'ANTIBIOTICS',
    price: 45.0,
    stock: 120,
    unit: 'Box (10x10)',
    updatedAt: Date.now(),
    description: 'Broad-spectrum antibiotic for bacterial infections.',
  },
  {
    id: '3',
    name: 'Ibuprofen 400mg',
    category: 'ANALGESICS & ANTI-INFLAMMATORIES (PAINKILLERS)',
    price: 22.5,
    stock: 0,
    unit: 'Box (10x10)',
    updatedAt: Date.now(),
    description: 'Anti-inflammatory drug for pain and swelling.',
  },
  {
    id: '4',
    name: 'Cetirizine 10mg',
    category: 'Allergy',
    price: 18.0,
    stock: 200,
    unit: 'Box (30)',
    updatedAt: Date.now(),
    description: 'Relief from allergy symptoms like runny nose and sneezing.',
  },
  {
    id: '5',
    name: 'Vitamin C 1000mg',
    category: 'Supplements',
    price: 60.0,
    stock: 50,
    unit: 'Bottle (100)',
    updatedAt: Date.now(),
    description: 'Immune system support supplement.',
  },
  {
    id: '6',
    name: 'Omeprazole 20mg',
    category: 'Gastrointestinal',
    price: 35.0,
    stock: 8,
    unit: 'Box (28)',
    updatedAt: Date.now(),
    description: 'Reduces stomach acid for heartburn relief.',
  },
];

export default function InventoryPage() {
  const { products, loading, offline } = useInventory();
  const { addToCart } = useCart(); // Use hook
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Use mock data if real data is empty (for demo purposes)
  const displayProducts = products.length > 0 ? products : MOCK_PRODUCTS;

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
        {offline && (
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
          <SelectTrigger className='w-full md:w-[280px] bg-background border-border/60 max-w-full'>
            <div className='flex items-center gap-2 text-muted-foreground min-w-0 flex-1'>
              <Filter className='h-4 w-4 flex-shrink-0' />
              <SelectValue placeholder='Category' className='truncate' />
            </div>
          </SelectTrigger>
          <SelectContent className='max-w-[280px]'>
            {categories.map((cat) => (
              <SelectItem
                key={cat}
                value={cat}
                className='truncate pr-8 max-w-[280px]'
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
