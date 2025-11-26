'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Order } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function OrdersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    if (!db) {
      setLoading(false);
      return;
    }

    // In a real app, we would also check offlineDB for pending offline orders
    // Note: This query requires a Firestore index on orders collection
    // Create index: userId (Ascending) + createdAt (Descending)
    // The index link is provided in the error message from Firebase
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        // Sort by createdAt desc in case index is missing
        fetchedOrders.sort((a, b) => b.createdAt - a.createdAt);
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (error: any) => {
        console.error('Error fetching orders:', error);
        // If index error, show helpful message
        if (error.code === 'failed-precondition') {
          console.error(
            'Firestore index required. Click the link in the error message to create it.'
          );
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return (
          <Badge
            variant='secondary'
            className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
          >
            <Clock className='mr-1 h-3 w-3' /> Pending
          </Badge>
        );
      case 'checking_stock':
        return (
          <Badge
            variant='secondary'
            className='bg-blue-100 text-blue-800 hover:bg-blue-100'
          >
            Checking Stock
          </Badge>
        );
      case 'pharmacy_confirmed':
        return (
          <Badge variant='default' className='bg-primary hover:bg-primary'>
            Ready for Verification
          </Badge>
        );
      case 'customer_confirmed':
        return (
          <Badge variant='default' className='bg-green-600 hover:bg-green-600'>
            <CheckCircle2 className='mr-1 h-3 w-3' /> Verified
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant='default' className='bg-green-600 hover:bg-green-600'>
            <CheckCircle2 className='mr-1 h-3 w-3' /> Completed
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant='destructive'>
            <AlertCircle className='mr-1 h-3 w-3' /> Cancelled
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          My Orders
        </h1>
        {[1, 2].map((i) => (
          <Skeleton key={i} className='h-32 w-full' />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          My Orders
        </h1>
        <div className='text-center py-12 border rounded-lg bg-card'>
          <Package className='mx-auto h-12 w-12 text-muted-foreground/50' />
          <h3 className='mt-4 text-lg font-medium'>No orders yet</h3>
          <p className='text-muted-foreground'>
            Place your first order from the inventory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      <h1 className='text-3xl font-serif font-bold text-primary'>My Orders</h1>

      <div className='space-y-4'>
        {orders.map((order) => (
          <Card key={order.id} className='overflow-hidden'>
            <CardHeader className='bg-secondary/30 flex flex-row items-center justify-between py-4'>
              <div className='space-y-1'>
                <CardTitle className='text-base font-mono'>
                  #{order.id.slice(0, 8)}
                </CardTitle>
                <p className='text-xs text-muted-foreground'>
                  {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                </p>
              </div>
              <div className='flex items-center gap-4'>
                <span className='font-bold hidden sm:inline-block'>
                  ₵{order.total.toFixed(2)}
                </span>
                {getStatusBadge(order.status)}
              </div>
            </CardHeader>
            <CardContent className='p-6'>
              <div className='space-y-4'>
                <div className='space-y-2'>
                  {order.items.map((item) => (
                    <div key={item.id} className='flex justify-between text-sm'>
                      <span>
                        <span className='font-medium'>{item.quantity}x</span>{' '}
                        {item.name}
                      </span>
                      <span className='text-muted-foreground'>
                        ₵{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {order.deliveryOption && (
                  <div className='pt-2 border-t text-sm'>
                    <p className='text-muted-foreground'>
                      Delivery:{' '}
                      {order.deliveryOption === 'delivery'
                        ? 'Home Delivery'
                        : 'Store Pickup'}
                    </p>
                    {order.deliveryFee && order.deliveryFee > 0 && (
                      <p className='text-muted-foreground'>
                        Delivery Fee: ₵{order.deliveryFee.toFixed(2)}
                      </p>
                    )}
                  </div>
                )}

                <div className='pt-2 border-t flex justify-between font-bold'>
                  <span>Total</span>
                  <span>
                    ₵{(order.total + (order.deliveryFee || 0)).toFixed(2)}
                  </span>
                </div>

                {order.status === 'pharmacy_confirmed' && (
                  <Link href={`/orders/${order.id}`}>
                    <Button className='w-full mt-4'>
                      Verify & Confirm Order
                      <ArrowRight className='ml-2 h-4 w-4' />
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
