'use client';

import { useState, useEffect } from 'react';
import type { CartItem, Product } from '@/types';
import { toast } from 'sonner';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart', e);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const currentQuantity = existing ? existing.quantity : 0;
      const newQuantity = currentQuantity + quantity;

      // Check if requested quantity exceeds available stock
      if (newQuantity > product.stock) {
        toast.error(`Only ${product.stock} ${product.unit} available in stock`);
        return prev;
      }

      if (existing) {
        toast.success(`Updated quantity for ${product.name}`);
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: newQuantity } : item
        );
      }
      toast.success(`Added ${product.name} to cart`);
      return [...prev, { ...product, quantity }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
    toast.success('Removed item from cart');
  };

  const updateQuantity = (productId: string, delta: number) => {
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
  };

  const setQuantity = (productId: string, quantity: number) => {
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
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('cart');
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    setQuantity,
    clearCart,
    total,
  };
}
