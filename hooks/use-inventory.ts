'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { offlineDB } from '@/lib/db';
import type { Product } from '@/types';
import { toast } from 'sonner';

export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;

    const fetchInventory = async () => {
      try {
        // Try to load from IndexedDB first for instant render
        const cachedProducts = await offlineDB.getAll<Product>('inventory');
        if (cachedProducts.length > 0) {
          setProducts(cachedProducts);
          setLoading(false);
        }

        if (db) {
          // Check if we can actually connect (sometimes onLine is true but no internet)
          // For now, we assume if the snapshot listener fails, we fall back.
          const q = query(collection(db, 'inventory'), orderBy('name'));

          unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              const newProducts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as Product[];

              setProducts(newProducts);
              setOffline(false);

              // Update offline cache
              newProducts.forEach((product) => {
                offlineDB.put('inventory', product);
              });
              setLoading(false);
            },
            (error) => {
              console.error('Firestore error, falling back to offline:', error);
              setOffline(true);
              setLoading(false);
              // If we haven't loaded cache yet (empty cache), try again
              if (products.length === 0) {
                offlineDB.getAll<Product>('inventory').then((cached) => {
                  setProducts(cached);
                });
              }
            }
          );
        } else {
          setOffline(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching inventory:', error);
        setOffline(true);
        setLoading(false);
      }
    };

    fetchInventory();

    // Handle online/offline events
    const handleOnline = () => {
      toast.success('You are back online. Syncing data...');
      fetchInventory();
    };
    const handleOffline = () => {
      setOffline(true);
      toast.warning('You are offline. Using cached data.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { products, loading, offline };
}
