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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Button } from '@/components/ui/button';
import { formatOrderLabel } from '@/lib/order-display';
import { paymentMethodLabel } from '@/lib/payment-method-label';

export default function OrdersPage() {
  const { user, isAdmin, viewMode } = useAuth();
  const showPrice = isAdmin || viewMode === 'admin';
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
      case 'proforma_sent':
        return (
          <Badge
            variant='secondary'
            className='bg-sky-100 text-sky-900 hover:bg-sky-100'
          >
            Proforma ready
          </Badge>
        );
      case 'client_finalized':
        return (
          <Badge
            variant='default'
            className='bg-violet-600 hover:bg-violet-600'
          >
            <CheckCircle2 className='mr-1 h-3 w-3' /> Awaiting invoice
          </Badge>
        );
      case 'invoice_sent':
        return (
          <Badge variant='default' className='bg-indigo-600 hover:bg-indigo-600'>
            <Package className='mr-1 h-3 w-3' /> Packing
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
      case 'processing':
        return (
          <Badge variant='default' className='bg-blue-600 hover:bg-blue-600'>
            <Package className='mr-1 h-3 w-3' /> Processing
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
      <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          My Orders
        </h1>
        <p className='text-sm text-muted-foreground'>
          {orders.length} order{orders.length === 1 ? '' : 's'} — tap to expand
          or collapse
        </p>
      </div>

      <Accordion type='multiple' className='space-y-3'>
        {orders.map((order) => {
          const itemCount = order.items.reduce(
            (sum, i) => sum + i.quantity,
            0
          );
          const grand = order.total + (order.deliveryFee || 0);
          return (
            <AccordionItem
              key={order.id}
              value={order.id}
              className='border rounded-lg bg-card overflow-hidden px-0 last:border-b'
            >
              <AccordionTrigger className='px-4 py-4 hover:no-underline bg-secondary/30 data-[state=open]:border-b [&>svg]:ml-2'>
                <div className='flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left min-w-0 pr-2'>
                  <div className='space-y-1 min-w-0'>
                    <p className='text-base font-mono font-semibold leading-tight truncate'>
                      {formatOrderLabel(order)}
                    </p>
                    <p className='text-xs text-muted-foreground font-normal'>
                      {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                      {' · '}
                      {itemCount} item{itemCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className='flex flex-wrap items-center gap-2 sm:gap-4 shrink-0'>
                    {showPrice && (
                      <span className='font-bold text-sm tabular-nums'>
                        ₵{grand.toFixed(2)}
                      </span>
                    )}
                    {getStatusBadge(order.status)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className='px-6 pb-6 pt-4'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className='flex justify-between text-sm gap-4'
                      >
                        <span className='min-w-0'>
                          <span className='font-medium'>{item.quantity}x</span>{' '}
                          {item.name}
                        </span>
                        {showPrice && (
                          <span className='text-muted-foreground shrink-0 tabular-nums'>
                            ₵{(item.price * item.quantity).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.deliveryOption && (
                    <div className='pt-2 border-t text-sm space-y-1'>
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
                      {order.paymentMethod && (
                        <p className='text-muted-foreground'>
                          Payment:{' '}
                          {paymentMethodLabel(order.paymentMethod)}
                        </p>
                      )}
                    </div>
                  )}

                  <div className='pt-2 border-t space-y-2 text-sm'>
                    {(() => {
                      const paid =
                        order.accountingStatus === 'paid' &&
                        (order.amountPaidGHS == null ||
                          order.amountPaidGHS === undefined)
                          ? grand
                          : (order.amountPaidGHS ?? 0);
                      const bal = Math.max(0, grand - paid);
                      return (
                        <>
                          <div className='flex justify-between font-semibold'>
                            <span>Order total</span>
                            <span className='tabular-nums'>
                              ₵{grand.toFixed(2)}
                            </span>
                          </div>
                          <div className='flex justify-between font-medium text-emerald-700'>
                            <span>Paid (debit)</span>
                            <span className='tabular-nums'>
                              ₵{paid.toFixed(2)}
                            </span>
                          </div>
                          <div className='flex justify-between font-medium text-amber-800'>
                            <span>Balance (credit)</span>
                            <span className='tabular-nums'>
                              ₵{bal.toFixed(2)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {order.status === 'proforma_sent' && (
                    <Link href={`/orders/${order.id}`}>
                      <Button className='w-full mt-2'>
                        Review proforma & confirm
                        <ArrowRight className='ml-2 h-4 w-4' />
                      </Button>
                    </Link>
                  )}
                  {order.status === 'pharmacy_confirmed' && (
                    <Link href={`/orders/${order.id}`}>
                      <Button className='w-full mt-2'>
                        Verify & confirm order
                        <ArrowRight className='ml-2 h-4 w-4' />
                      </Button>
                    </Link>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
