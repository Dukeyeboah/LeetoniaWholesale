'use client';

import { useState } from 'react';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Trash2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import type { Order } from '@/types';

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, clearCart, total } = useCart();
  const { user, isAdmin, viewMode } = useAuth();
  const showPrice = isAdmin || viewMode === 'admin';
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCheckout = async () => {
    if (!user) {
      toast.error('You must be logged in to place an order');
      router.push('/login');
      return;
    }

    if (!db) {
      toast.error('Database not available - Demo Mode');
      // In a real offline app, we would save to IndexedDB 'pending_orders' here
      // For this demo, just clear the cart to simulate success locally
      clearCart();
      router.push('/orders');
      return;
    }

    setIsSubmitting(true);

    try {
      const newOrder: Omit<Order, 'id'> = {
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        items: cart,
        status: 'pending',
        total: total,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await addDoc(collection(db, 'orders'), newOrder);

      toast.success(
        'Order placed successfully! Pharmacy will review and confirm.'
      );
      clearCart();
      router.push('/orders');
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center'>
        <div className='bg-secondary/50 p-6 rounded-full'>
          <ShoppingBag className='h-12 w-12 text-muted-foreground' />
        </div>
        <h2 className='text-2xl font-serif font-semibold'>
          Your cart is empty
        </h2>
        <p className='text-muted-foreground max-w-sm'>
          Browse our inventory to find the medicines you need.
        </p>
        <Button onClick={() => router.push('/inventory')} className='mt-4'>
          Browse Inventory
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      <h1 className='text-3xl font-serif font-bold text-primary'>Your Cart</h1>

      <div className='grid gap-8 md:grid-cols-3'>
        <div className='md:col-span-2 space-y-4'>
          {cart.map((item) => (
            <Card
              key={item.id}
              className='flex flex-col sm:flex-row overflow-hidden'
            >
              <div className='h-32 sm:w-32 bg-secondary/20 flex items-center justify-center'>
                {/* Placeholder Image */}
                <span className='text-2xl text-muted-foreground/50 font-serif'>
                  {item.name.charAt(0)}
                </span>
              </div>
              <div className='flex-1 flex flex-col justify-between p-4'>
                <div className='flex justify-between items-start'>
                  <div>
                    <h3 className='font-semibold text-lg'>{item.name}</h3>
                    <p className='text-sm text-muted-foreground'>{item.unit}</p>
                  </div>
                  {showPrice && (
                    <p className='font-bold text-lg'>
                      ₵{(item.price * item.quantity).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className='flex justify-between items-center mt-4'>
                  <div className='flex items-center border rounded-md'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      onClick={() => updateQuantity(item.id, -1)}
                    >
                      <Minus className='h-3 w-3' />
                    </Button>
                    <span className='w-12 text-center text-sm font-medium'>
                      {item.quantity}
                    </span>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      onClick={() => updateQuantity(item.id, 1)}
                    >
                      <Plus className='h-3 w-3' />
                    </Button>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive hover:text-destructive hover:bg-destructive/10'
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className='h-4 w-4 mr-2' />
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className='h-fit'>
          <Card className='sticky top-4'>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {showPrice && (
                <>
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>Subtotal</span>
                    <span>₵{total.toFixed(2)}</span>
                  </div>
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>Delivery</span>
                    <span>Calculated at confirmation</span>
                  </div>
                  <Separator />
                  <div className='flex justify-between font-bold text-lg'>
                    <span>Total</span>
                    <span>₵{total.toFixed(2)}</span>
                  </div>
                </>
              )}
              {!showPrice && (
                <p className='text-sm text-muted-foreground text-center'>
                  Pricing will be confirmed after pharmacy review
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                className='w-full'
                size='lg'
                onClick={handleCheckout}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Processing...' : 'Place Order'}
                {!isSubmitting && <ArrowRight className='ml-2 h-4 w-4' />}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
