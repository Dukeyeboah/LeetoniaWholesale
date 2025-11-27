'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CartItem, Product } from '@/types';
import { toast } from 'sonner';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

const CART_STORAGE_KEY = 'leetonia_cart';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const { user } = useAuth();

  // Load cart from localStorage and Firebase (if authenticated) on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadCart = async () => {
      try {
        let localCart: CartItem[] = [];
        let firebaseCart: CartItem[] = [];

        // Load from localStorage
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (savedCart) {
          const parsedCart = JSON.parse(savedCart);
          if (Array.isArray(parsedCart) && parsedCart.length > 0) {
            localCart = parsedCart;
          }
        }

        // Load from Firebase if user is authenticated
        if (user && db) {
          try {
            const cartDocRef = doc(db, 'carts', user.id);
            const cartDoc = await getDoc(cartDocRef);
            if (cartDoc.exists()) {
              const data = cartDoc.data();
              if (data.items && Array.isArray(data.items)) {
                firebaseCart = data.items;
              }
            }
          } catch (error) {
            console.error('Failed to load cart from Firebase:', error);
          }
        }

        // Merge carts: prefer Firebase if user is logged in, otherwise use localStorage
        // If both exist, merge them (Firebase takes precedence for duplicates)
        let mergedCart: CartItem[] = [];
        if (user && firebaseCart.length > 0) {
          // Merge: Firebase items take precedence
          const localMap = new Map(localCart.map((item) => [item.id, item]));
          const firebaseMap = new Map(
            firebaseCart.map((item) => [item.id, item])
          );

          // Add all Firebase items
          mergedCart = [...firebaseCart];

          // Add local items that aren't in Firebase
          localCart.forEach((item) => {
            if (!firebaseMap.has(item.id)) {
              mergedCart.push(item);
            }
          });
        } else {
          mergedCart = localCart;
        }

        if (mergedCart.length > 0) {
          setCart(mergedCart);
          console.log('Loaded cart:', mergedCart.length, 'items');
        }
      } catch (e) {
        console.error('Failed to load cart:', e);
      } finally {
        setIsInitialized(true);
      }
    };

    loadCart();
  }, [user]);

  // Save cart to localStorage and Firebase (if authenticated) whenever it changes
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;

    const saveCart = async () => {
      try {
        // Always save to localStorage
        if (cart.length > 0) {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
        } else {
          localStorage.removeItem(CART_STORAGE_KEY);
        }

        // Also save to Firebase if user is authenticated
        if (user && db && cart.length > 0) {
          try {
            const cartDocRef = doc(db, 'carts', user.id);
            await setDoc(
              cartDocRef,
              {
                items: cart,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } catch (error) {
            console.error('Failed to save cart to Firebase:', error);
            // Don't block the UI if Firebase save fails
          }
        } else if (user && db && cart.length === 0) {
          // Clear Firebase cart if empty
          try {
            const cartDocRef = doc(db, 'carts', user.id);
            await setDoc(cartDocRef, { items: [], updatedAt: Date.now() });
          } catch (error) {
            console.error('Failed to clear Firebase cart:', error);
          }
        }
      } catch (e) {
        console.error('Failed to save cart:', e);
      }
    };

    saveCart();
  }, [cart, isInitialized, user]);

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    // Ensure product has all required fields
    if (!product.id || !product.name || product.price === undefined) {
      console.error('Invalid product data:', product);
      toast.error('Invalid product data. Please try again.');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const currentQuantity = existing ? existing.quantity : 0;
      const newQuantity = currentQuantity + quantity;

      // Check if requested quantity exceeds available stock
      if (newQuantity > product.stock) {
        toast.error(`Only ${product.stock} ${product.unit} available in stock`);
        return prev;
      }

      // Create cart item with all required Product fields
      const cartItem: CartItem = {
        ...product,
        quantity: newQuantity,
      };

      let newCart: CartItem[];
      if (existing) {
        // Don't show toast for quantity updates - only for new items
        newCart = prev.map((item) =>
          item.id === product.id ? cartItem : item
        );
      } else {
        toast.success(`Added ${product.name} to cart`);
        newCart = [...prev, { ...product, quantity }];
      }

      console.log('Cart updated:', newCart.length, 'items');
      return newCart;
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const newCart = prev.filter((item) => item.id !== productId);
      console.log('Item removed from cart. Remaining items:', newCart.length);
      return newCart;
    });
    toast.success('Removed item from cart');
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          // Check if new quantity exceeds stock
          if (newQuantity > item.stock) {
            toast.error(`Only ${item.stock} ${item.unit} available in stock`);
            return item;
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const newQuantity = Math.max(1, Math.min(quantity, item.stock));
          if (quantity > item.stock) {
            toast.error(`Only ${item.stock} ${item.unit} available in stock`);
          }
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    setQuantity,
    clearCart,
    total,
    isInitialized,
  };
}
