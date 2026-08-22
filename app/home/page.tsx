'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/hooks/use-cart';
import { useNotifications } from '@/hooks/use-notifications';
import { db } from '@/lib/firebase';
import type { Order } from '@/types';
import {
  customerOrderStatusLabel,
  formatOrderLabel,
} from '@/lib/order-display';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PENDING_STATUSES = new Set<Order['status']>([
  'pending',
  'proforma_sent',
  'client_finalized',
  'checking_stock',
  'pharmacy_confirmed',
]);

const PROCESSING_STATUSES = new Set<Order['status']>([
  'invoice_sent',
  'processing',
  'customer_confirmed',
]);

export default function CustomerHomePage() {
  const { user, loading: authLoading, isAdmin, viewMode } = useAuth();
  const showPrice = isAdmin || viewMode === 'admin';
  const { cart } = useCart();
  const { notifications } = useNotifications(user?.id);
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/inventory');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !db) {
      setOrdersLoading(false);
      return;
    }

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Order[];
        fetched.sort((a, b) => b.createdAt - a.createdAt);
        setOrders(fetched);
        setOrdersLoading(false);
      },
      (error) => {
        console.error('Error fetching orders:', error);
        setOrdersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'cancelled');
    return {
      total: active.length,
      pending: active.filter((o) => PENDING_STATUSES.has(o.status)).length,
      processing: active.filter((o) => PROCESSING_STATUSES.has(o.status))
        .length,
      completed: active.filter((o) => o.status === 'completed').length,
    };
  }, [orders]);

  const currentOrders = orders.filter(
    (o) => o.status !== 'completed' && o.status !== 'cancelled'
  );

  const cartProducts = cart.length;
  const cartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const recent = notifications;
  const pharmacyName = user?.pharmacyName || user?.name || 'there';

  if (authLoading || !user) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-9 w-64' />
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className='h-24 rounded-xl' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <div>
        <p className='text-xs text-muted-foreground'>Dashboard</p>
        <h1 className='font-serif text-2xl font-bold text-primary'>
          Welcome back, {pharmacyName}
        </h1>
      </div>

      <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
        {(
          [
            ['Total Orders', stats.total],
            ['Pending', stats.pending],
            ['Processing', stats.processing],
            ['Completed', stats.completed],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className='border-border/60 py-3 shadow-none'>
            <CardHeader className='px-4 py-0'>
              <CardDescription className='text-xs'>{label}</CardDescription>
              <CardTitle className='font-serif text-2xl tabular-nums'>
                {ordersLoading ? '—' : value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className='border-border/60 shadow-none'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 px-4 py-3'>
          <div>
            <CardTitle className='font-serif text-lg'>Current Orders</CardTitle>
            <CardDescription>Orders still in progress</CardDescription>
          </div>
          <Button variant='ghost' size='sm' asChild>
            <Link href='/orders'>
              View all
              <ArrowRight className='ml-1 h-4 w-4' />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className='max-h-44 overflow-y-auto px-4 pb-3 pt-0'>
          {ordersLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-8 w-full' />
            </div>
          ) : currentOrders.length === 0 ? (
            <div className='flex flex-col items-center py-4 text-center'>
              <ClipboardList className='mb-2 h-7 w-7 text-muted-foreground/50' />
              <p className='text-sm text-muted-foreground'>
                No open orders. Browse products to place one.
              </p>
              <Button asChild className='mt-3' size='sm'>
                <Link href='/inventory'>Browse products</Link>
              </Button>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='pb-2 font-medium'>Order</th>
                    <th className='pb-2 font-medium'>Status</th>
                    <th className='pb-2 font-medium'>Date</th>
                    <th className='pb-2 text-right font-medium'>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {currentOrders.map((order) => {
                    const grand = order.total + (order.deliveryFee || 0);
                    const hideTotal =
                      !showPrice ||
                      order.status === 'pending' ||
                      order.status === 'proforma_sent';
                    return (
                      <tr key={order.id} className='border-b last:border-0'>
                        <td className='py-2 font-mono font-medium'>
                          <Link
                            href={`/orders/${order.id}`}
                            className='hover:underline'
                          >
                            {formatOrderLabel(order)}
                          </Link>
                        </td>
                        <td className='py-2'>
                          {customerOrderStatusLabel(order.status)}
                        </td>
                        <td className='py-2 text-muted-foreground'>
                          {format(order.createdAt, 'MMM d')}
                        </td>
                        <td className='py-2 text-right tabular-nums'>
                          {hideTotal ? '—' : `₵${grand.toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-3 md:grid-cols-2'>
        <Card className='border-border/60 shadow-none'>
          <CardHeader className='px-4 py-3'>
            <CardTitle className='font-serif text-lg'>Cart</CardTitle>
            <CardDescription>
              {cartProducts === 0
                ? 'Your cart is empty'
                : `${cartProducts} product${cartProducts === 1 ? '' : 's'} · ${cartItems} item${cartItems === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex max-h-44 flex-col px-4 pb-3 pt-0'>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              {cartProducts === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  Add products from the catalog when you are ready to order.
                </p>
              ) : (
                <ul className='space-y-1.5 text-sm'>
                  {cart.map((item) => (
                    <li
                      key={item.id}
                      className='flex justify-between gap-3 text-muted-foreground'
                    >
                      <span className='min-w-0 truncate'>{item.name}</span>
                      <span className='shrink-0 tabular-nums'>
                        ×{item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className='pt-3'>
              <Button asChild size='sm'>
                <Link href={cartProducts === 0 ? '/inventory' : '/cart'}>
                  {cartProducts === 0 ? (
                    'Browse products'
                  ) : (
                    <>
                      Review Cart
                      <ArrowRight className='ml-1 h-4 w-4' />
                    </>
                  )}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className='border-border/60 shadow-none'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 px-4 py-3'>
            <div>
              <CardTitle className='font-serif text-lg'>
                Recent activity
              </CardTitle>
              <CardDescription>Updates on your orders</CardDescription>
            </div>
            <Button variant='ghost' size='sm' asChild>
              <Link href='/notifications'>All</Link>
            </Button>
          </CardHeader>
          <CardContent className='max-h-44 overflow-y-auto px-4 pb-3 pt-0'>
            {recent.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No recent updates yet.
              </p>
            ) : (
              <ul className='space-y-2.5'>
                {recent.map((item) => (
                  <li key={item.id} className='text-sm'>
                    {item.orderId ? (
                      <Link
                        href={`/orders/${item.orderId}`}
                        className='hover:underline'
                      >
                        {item.message || item.title}
                      </Link>
                    ) : (
                      <span>{item.message || item.title}</span>
                    )}
                    <p className='text-xs text-muted-foreground'>
                      {format(item.createdAt, 'MMM d')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
