'use client';

import { useState } from 'react';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Trash2, ShoppingBag } from 'lucide-react';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import type { Order } from '@/types';
import {
  buildDisplayOrderId,
  buildFirestoreOrderId,
  randomOrderSuffix,
  toOrderIdPrefix,
} from '@/lib/pharmacies';
import {
  PharmacyLimitError,
  placeOrderWithPharmacyLimit,
} from '@/lib/pharmacy-limits';
import { notifyAdminsNewOrderRequest } from '@/lib/order-workflow';
import {
  InsufficientStockError,
  placeAdminOrderWithReservation,
} from '@/lib/stock-reservation';

export default function CartPage() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    isInitialized,
  } = useCart();
  const { user, isAdmin, viewMode, needsClientPharmacyProfile } = useAuth();
  const showPrice = isAdmin || viewMode === 'admin';
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactPhone, setContactPhone] = useState('');

  const handleCheckout = async () => {
    if (!user) {
      toast.error('You must be logged in to place an order');
      router.push('/login');
      return;
    }

    if (needsClientPharmacyProfile) {
      toast.error('Complete your pharmacy profile before placing an order.');
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
      // Recalculate total to ensure it's correct (price * quantity for each item)
      const calculatedTotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const lineItems = cart.map((item) => ({ ...item }));

      const phone = contactPhone.trim();
      const newOrder: Omit<Order, 'id'> = {
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        items: lineItems,
        submittedItems: lineItems,
        submittedTotal: calculatedTotal,
        accountingStatus: 'credit',
        status: 'pending',
        total: calculatedTotal,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(phone ? { contactPhone: phone } : {}),
      };

      if (user.role === 'client') {
        if (!user.pharmacyId || !user.pharmacyName) {
          toast.error('Your profile is missing pharmacy details. Please sign in again or contact support.');
          setIsSubmitting(false);
          return;
        }
        try {
          const placed = await placeOrderWithPharmacyLimit({
            db,
            pharmacyId: user.pharmacyId,
            pharmacyDisplayName: user.pharmacyName,
            orderPrefix: toOrderIdPrefix(user.pharmacyName),
            orderPayload: newOrder,
          });
          await notifyAdminsNewOrderRequest(db, {
            id: placed.orderId,
            displayOrderId: placed.displayOrderId,
            userName: user.name || user.email,
            userEmail: user.email,
          });
        } catch (err) {
          if (err instanceof PharmacyLimitError) {
            toast.error(
              err.code === 'CREDIT_LIMIT'
                ? 'This order would exceed your pharmacy’s account credit limit. A super admin has been notified — you can raise credit under Admin → Pharmacies.'
                : 'This order would exceed your pharmacy’s monthly purchase limit. A super admin has been notified and can raise the cap under Pharmacies.'
            );
            setIsSubmitting(false);
            return;
          }
          if (err instanceof InsufficientStockError) {
            toast.error(err.message);
            setIsSubmitting(false);
            return;
          }
          throw err;
        }
      } else {
        const suffix = randomOrderSuffix(8);
        const orderPrefix = 'Leetonia';
        const displayOrderId = buildDisplayOrderId(orderPrefix, suffix);
        const orderId = buildFirestoreOrderId(orderPrefix, suffix);
        await placeAdminOrderWithReservation(db, orderId, {
          ...newOrder,
          displayOrderId,
        }, lineItems);
        await notifyAdminsNewOrderRequest(db, {
          id: orderId,
          displayOrderId,
          userName: user.name || user.email,
          userEmail: user.email,
        });
      }

      toast.success(
        'Order submitted! The pharmacy will send you a proforma to confirm.'
      );
      clearCart();
      router.push('/orders');
    } catch (error) {
      console.error('Checkout error:', error);
      if (error instanceof InsufficientStockError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to place order. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while cart is being initialized
  if (!isInitialized) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
        <p className='text-muted-foreground'>Loading cart...</p>
      </div>
    );
  }

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
          Browse Products
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      <h1 className='text-3xl font-serif font-bold text-primary'>Your Cart</h1>

      <div className='grid gap-8 md:grid-cols-3'>
        <div className='md:col-span-2'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {cart.map((item) => (
              <Card
                key={item.id}
                className='flex flex-col overflow-hidden h-full'
              >
                {/* Image - reduced height */}
                <div className='aspect-[5/3] relative bg-secondary/20 flex items-center justify-center'>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <span className='text-2xl text-muted-foreground/50 font-serif'>
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Content */}
                <CardContent className='flex-1 flex flex-col p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='flex-1 min-w-0'>
                      <h3 className='font-semibold text-sm line-clamp-2'>
                        {item.name}
                      </h3>
                      <div className='flex items-center gap-2 mt-1'>
                        <p className='text-xs text-muted-foreground'>
                          {item.unit}
                        </p>
                        <span className='text-xs text-muted-foreground'>
                          • Qty: {item.quantity}
                        </span>
                      </div>
                      {showPrice && (
                        <p className='font-bold text-sm text-primary mt-1'>
                          ₵{(item.price * item.quantity).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10'
                      onClick={() => removeFromCart(item.id)}
                      title='Remove item'
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className='h-fit'>
          <Card className='sticky top-4'>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Items list */}
              <div className='space-y-2'>
                <h4 className='text-sm font-medium text-muted-foreground'>
                  Items ({cart.length})
                </h4>
                <div className='space-y-1.5 max-h-[80vh] overflow-y-auto pr-2'>
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className='flex justify-between items-start text-sm'
                    >
                      <div className='flex-1 min-w-0 pr-2'>
                        <p className='font-medium line-clamp-1'>{item.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {item.quantity}x {item.unit}
                        </p>
                      </div>
                      {showPrice && (
                        <p className='text-sm font-medium flex-shrink-0'>
                          ₵{(item.price * item.quantity).toFixed(2)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

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

              <div className='space-y-2 pt-2'>
                <Label htmlFor='cart-contact-phone' className='text-muted-foreground'>
                  Contact phone (optional)
                </Label>
                <Input
                  id='cart-contact-phone'
                  type='tel'
                  placeholder='e.g. 0244… — we may call when your order is ready'
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  autoComplete='tel'
                />
              </div>
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
