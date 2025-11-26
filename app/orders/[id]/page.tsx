'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Package, Truck, Store } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const DELIVERY_FEE = 50; // GHS 50 delivery fee

export default function OrderVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'delivery'>(
    'pickup'
  );
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!user || !params.id) return;

    const fetchOrder = async () => {
      if (!db) {
        setLoading(false);
        return;
      }

      try {
        const orderDoc = await getDoc(doc(db, 'orders', params.id as string));
        if (orderDoc.exists()) {
          const orderData = { id: orderDoc.id, ...orderDoc.data() } as Order;

          // Verify this order belongs to the user
          if (orderData.userId !== user.id) {
            toast.error('You do not have access to this order');
            router.push('/orders');
            return;
          }

          setOrder(orderData);

          // Pre-fill delivery option if already set
          if (orderData.deliveryOption) {
            setDeliveryOption(orderData.deliveryOption);
          }
          if (orderData.deliveryAddress) {
            setDeliveryAddress(orderData.deliveryAddress);
          }
          if (orderData.notes) {
            setNotes(orderData.notes);
          }
        } else {
          toast.error('Order not found');
          router.push('/orders');
        }
      } catch (error) {
        console.error('Error fetching order:', error);
        toast.error('Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [user, params.id, router]);

  const handleConfirmOrder = async () => {
    if (!order || !db) return;

    if (deliveryOption === 'delivery' && !deliveryAddress.trim()) {
      toast.error('Please provide a delivery address');
      return;
    }

    setSubmitting(true);

    try {
      const updateData: Partial<Order> = {
        status: 'customer_confirmed',
        deliveryOption,
        deliveryAddress:
          deliveryOption === 'delivery' ? deliveryAddress : undefined,
        deliveryFee: deliveryOption === 'delivery' ? DELIVERY_FEE : 0,
        notes: notes.trim() || undefined,
        updatedAt: Date.now(),
      };

      await updateDoc(doc(db, 'orders', order.id), updateData);

      toast.success('Order confirmed! Pharmacy will prepare your order.');
      router.push('/orders');
    } catch (error) {
      console.error('Error confirming order:', error);
      toast.error('Failed to confirm order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-96 w-full' />
      </div>
    );
  }

  if (!order) {
    return (
      <div className='text-center py-12'>
        <p className='text-muted-foreground'>Order not found</p>
        <Button onClick={() => router.push('/orders')} className='mt-4'>
          Back to Orders
        </Button>
      </div>
    );
  }

  // Only show verification page if order is pharmacy_confirmed
  if (order.status !== 'pharmacy_confirmed') {
    return (
      <div className='space-y-6'>
        <Button variant='ghost' onClick={() => router.push('/orders')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Orders
        </Button>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-center text-muted-foreground'>
              This order is not ready for verification yet. Current status:{' '}
              {order.status}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const finalTotal =
    order.total + (deliveryOption === 'delivery' ? DELIVERY_FEE : 0);

  return (
    <div className='space-y-8'>
      <div className='flex items-center gap-4'>
        <Button variant='ghost' onClick={() => router.push('/orders')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
        <div>
          <h1 className='text-3xl font-serif font-bold text-primary'>
            Verify Your Order
          </h1>
          <p className='text-muted-foreground mt-1'>
            Please review your order and confirm delivery details
          </p>
        </div>
      </div>

      <div className='grid gap-6 md:grid-cols-3'>
        <div className='md:col-span-2 space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Package className='h-5 w-5' />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className='flex justify-between items-center py-2 border-b last:border-0'
                >
                  <div>
                    <p className='font-medium'>{item.name}</p>
                    <p className='text-sm text-muted-foreground'>
                      Quantity: {item.quantity} {item.unit}
                    </p>
                  </div>
                  <p className='font-bold'>
                    ₵{(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
              <Separator />
              <div className='flex justify-between font-bold text-lg'>
                <span>Subtotal</span>
                <span>₵{order.total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery Options</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <RadioGroup
                value={deliveryOption}
                onValueChange={(value: 'pickup' | 'delivery') =>
                  setDeliveryOption(value)
                }
              >
                <div className='flex items-start space-x-3 space-y-0 rounded-md border p-4'>
                  <RadioGroupItem value='pickup' id='pickup' className='mt-1' />
                  <Label htmlFor='pickup' className='flex-1 cursor-pointer'>
                    <div className='flex items-center gap-2'>
                      <Store className='h-4 w-4' />
                      <span className='font-medium'>Pickup at Store</span>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Collect your order from Leetonia Wholesale location
                    </p>
                  </Label>
                </div>
                <div className='flex items-start space-x-3 space-y-0 rounded-md border p-4'>
                  <RadioGroupItem
                    value='delivery'
                    id='delivery'
                    className='mt-1'
                  />
                  <Label htmlFor='delivery' className='flex-1 cursor-pointer'>
                    <div className='flex items-center gap-2'>
                      <Truck className='h-4 w-4' />
                      <span className='font-medium'>Home Delivery</span>
                      <Badge variant='secondary' className='ml-2'>
                        +₵{DELIVERY_FEE.toFixed(2)}
                      </Badge>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      We'll deliver to your specified address
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {deliveryOption === 'delivery' && (
                <div className='space-y-2'>
                  <Label htmlFor='address'>Delivery Address</Label>
                  <Textarea
                    id='address'
                    placeholder='Enter your complete delivery address...'
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div className='space-y-2'>
                <Label htmlFor='notes'>Additional Notes (Optional)</Label>
                <Textarea
                  id='notes'
                  placeholder='Any special instructions or notes...'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='h-fit'>
          <Card className='sticky top-4'>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Subtotal</span>
                  <span>₵{order.total.toFixed(2)}</span>
                </div>
                {deliveryOption === 'delivery' && (
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Delivery Fee</span>
                    <span>₵{DELIVERY_FEE.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className='flex justify-between font-bold text-lg'>
                  <span>Total</span>
                  <span>₵{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className='pt-4 space-y-2 text-xs text-muted-foreground'>
                <p>Order ID: #{order.id.slice(0, 8)}</p>
                <p>Placed: {format(order.createdAt, 'MMM d, yyyy • h:mm a')}</p>
              </div>

              <Button
                className='w-full'
                size='lg'
                onClick={handleConfirmOrder}
                disabled={
                  submitting ||
                  (deliveryOption === 'delivery' && !deliveryAddress.trim())
                }
              >
                {submitting ? (
                  'Confirming...'
                ) : (
                  <>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Confirm Order
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
