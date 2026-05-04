'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { CartItem, Order, Product } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Truck,
  Store,
  CreditCard,
  Wallet,
  FileText,
  Minus,
  Plus,
  Trash2,
  Printer,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { createNotification } from '@/lib/notifications';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  formatOrderLabel,
  fulfillmentShortPhrase,
} from '@/lib/order-display';
import {
  printOrderInvoice,
  MOMO_DISPLAY_NAME,
  MOMO_PHONE,
} from '@/lib/print-invoice';
import { paymentMethodLabel } from '@/lib/payment-method-label';
import { notifyAdminsClientFinalizedOrder } from '@/lib/order-workflow';
import {
  appendReservedDeltaToWriteBatch,
  maxOrderLineQty,
  validateItemChangeAgainstStock,
} from '@/lib/stock-reservation';

/** Delivery is complimentary; fee stays 0 for totals and Firestore. */
const DELIVERY_FEE = 0;

export default function OrderVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editableItems, setEditableItems] = useState<CartItem[]>([]);
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'delivery'>(
    'pickup'
  );
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    NonNullable<Order['paymentMethod']>
  >('cash');
  const [notes, setNotes] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [stockByProductId, setStockByProductId] = useState<
    Map<string, Product>
  >(new Map());

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

          if (orderData.userId !== user.id) {
            toast.error('You do not have access to this order');
            router.push('/orders');
            return;
          }

          setOrder(orderData);
          setEditableItems(
            (orderData.items || []).map((i) => ({ ...i }))
          );

          if (orderData.deliveryOption) {
            setDeliveryOption(orderData.deliveryOption);
          }
          if (orderData.deliveryAddress) {
            setDeliveryAddress(orderData.deliveryAddress);
          }
          if (orderData.paymentMethod) {
            setPaymentMethod(orderData.paymentMethod);
          }
          if (orderData.notes) {
            setNotes(orderData.notes);
          }
          if (orderData.contactPhone) {
            setContactPhone(orderData.contactPhone);
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

  useEffect(() => {
    if (!db || !order || order.status !== 'proforma_sent') return;
    (async () => {
      const ids = [...new Set(order.items.map((i) => i.id))];
      const map = new Map<string, Product>();
      await Promise.all(
        ids.map(async (id) => {
          const s = await getDoc(doc(db, 'inventory', id));
          if (s.exists()) {
            map.set(id, { id, ...s.data() } as Product);
          }
        })
      );
      setStockByProductId(map);
    })();
  }, [order?.id, order?.status, order?.updatedAt]);

  const lineSubtotal = editableItems.reduce(
    (s, i) => s + i.price * i.quantity,
    0
  );

  const bumpQty = (id: string, delta: number) => {
    setEditableItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const p = stockByProductId.get(id);
        const cap = p ? maxOrderLineQty(p, i.quantity) : i.quantity + delta;
        const nq = Math.max(
          1,
          Math.min(i.quantity + delta, Math.max(cap, 1))
        );
        return { ...i, quantity: nq };
      })
    );
  };

  const removeLine = (id: string) => {
    setEditableItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleConfirmOrder = async () => {
    if (!order || !db) return;

    if (deliveryOption === 'delivery' && !deliveryAddress.trim()) {
      toast.error('Please provide a delivery address');
      return;
    }

    setSubmitting(true);

    try {
      if (order.status === 'proforma_sent') {
        if (editableItems.length === 0) {
          toast.error('Keep at least one line item, or contact the pharmacy.');
          setSubmitting(false);
          return;
        }

        const subtotal = lineSubtotal;
        const ids = [...new Set(editableItems.map((i) => i.id))];
        const productMap = new Map(stockByProductId);
        for (const id of ids) {
          if (!productMap.has(id)) {
            const s = await getDoc(doc(db, 'inventory', id));
            if (s.exists()) {
              productMap.set(id, { id, ...s.data() } as Product);
            }
          }
        }
        if (order.stockReserved) {
          const check = validateItemChangeAgainstStock(
            productMap,
            order.items,
            editableItems
          );
          if (!check.ok) {
            toast.error(check.message);
            setSubmitting(false);
            return;
          }
        }

        const orderPatch = {
          items: editableItems,
          total: subtotal,
          status: 'client_finalized' as const,
          deliveryOption,
          deliveryFee: deliveryOption === 'delivery' ? DELIVERY_FEE : 0,
          paymentMethod,
          updatedAt: Date.now(),
          ...(deliveryOption === 'delivery'
            ? { deliveryAddress }
            : { deliveryAddress: deleteField() }),
          ...(notes.trim()
            ? { notes: notes.trim() }
            : { notes: deleteField() }),
          ...(contactPhone.trim()
            ? { contactPhone: contactPhone.trim() }
            : { contactPhone: deleteField() }),
        };

        if (order.stockReserved) {
          const batch = writeBatch(db);
          batch.update(doc(db, 'orders', order.id), orderPatch);
          appendReservedDeltaToWriteBatch(
            batch,
            db,
            order.items,
            editableItems
          );
          await batch.commit();
        } else {
          await updateDoc(doc(db, 'orders', order.id), orderPatch);
        }

        await notifyAdminsClientFinalizedOrder(db, order);
        toast.success(
          'Order confirmed. The pharmacy will send your invoice and prepare your order.'
        );
        router.push('/orders');
        return;
      }

      if (order.status === 'pharmacy_confirmed') {
        await updateDoc(doc(db, 'orders', order.id), {
          deliveryOption,
          deliveryFee: deliveryOption === 'delivery' ? DELIVERY_FEE : 0,
          paymentMethod,
          updatedAt: Date.now(),
          ...(deliveryOption === 'delivery'
            ? { deliveryAddress }
            : { deliveryAddress: deleteField() }),
          ...(notes.trim()
            ? { notes: notes.trim() }
            : { notes: deleteField() }),
          ...(contactPhone.trim()
            ? { contactPhone: contactPhone.trim() }
            : { contactPhone: deleteField() }),
        });

        try {
          const adminUsersQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['admin', 'super_admin'])
          );
          const adminSnapshot = await getDocs(adminUsersQuery);

          const paymentMethodText =
            paymentMethod === 'momo'
              ? 'Mobile Money (Momo)'
              : paymentMethod === 'cheque'
                ? 'Cheque'
                : 'Cash on delivery';
          const deliveryText =
            deliveryOption === 'delivery'
              ? `Delivery to: ${deliveryAddress}`
              : 'Store Pickup';

          await Promise.all(
            adminSnapshot.docs.map((adminDoc) =>
              createNotification(
                adminDoc.id,
                'order_confirmation',
                'Customer Order Confirmation',
                `Order ${formatOrderLabel(order)} from ${
                  order.userName || order.userEmail
                } has been confirmed.\n\nPayment: ${paymentMethodText}\n${deliveryText}\n\nItems: ${order.items
                  .map((i) => `${i.quantity}x ${i.name}`)
                  .join(', ')}\nTotal: ₵${(
                  order.total +
                  (deliveryOption === 'delivery' ? DELIVERY_FEE : 0)
                ).toFixed(2)}`,
                order.id
              )
            )
          );
        } catch (notifError) {
          console.error('Error creating admin notifications:', notifError);
        }

        toast.success(
          'Details saved. Pharmacy will review and process your order.'
        );
        router.push('/orders');
        return;
      }
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

  const isProformaReview = order.status === 'proforma_sent';
  const isLegacyVerify = order.status === 'pharmacy_confirmed';

  const legacyAlreadySubmitted =
    isLegacyVerify && !!(order.paymentMethod || order.deliveryOption);

  const isClientFinalized = order.status === 'client_finalized';
  const isInvoiceOrLater =
    order.status === 'invoice_sent' ||
    order.status === 'customer_confirmed' ||
    order.status === 'processing' ||
    order.status === 'completed';

  const canPrintInvoice =
    order.status === 'invoice_sent' ||
    order.status === 'customer_confirmed' ||
    order.status === 'processing' ||
    order.status === 'completed';

  /** Read-only success / tracking views */
  if (isClientFinalized || isInvoiceOrLater) {
    const title =
      order.status === 'client_finalized'
        ? 'Confirmation received'
        : order.status === 'invoice_sent'
          ? 'Invoice sent'
          : order.status === 'processing'
            ? 'Preparing your order'
            : order.status === 'completed'
              ? 'Order completed'
              : 'Order update';

    const fulfill = fulfillmentShortPhrase(order.deliveryOption);
    const blurb =
      order.status === 'client_finalized'
        ? `Thank you. The pharmacy will send your invoice and then pack your order for ${fulfill}.`
        : order.status === 'invoice_sent'
          ? `Your invoice has been recorded. The shop will pack your order for ${fulfill} shortly.`
          : order.status === 'processing'
            ? `Your order is being packed and will be ready for ${fulfill} as arranged.`
            : order.status === 'completed'
              ? `This order is complete and ready for ${fulfill}. Thank you for your business.`
              : 'Your order is being processed.';

    return (
      <div className='space-y-8'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex items-center gap-4'>
            <Button variant='ghost' onClick={() => router.push('/orders')}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Orders
            </Button>
            <div>
              <h1 className='text-3xl font-serif font-bold text-primary'>
                {title}
              </h1>
              <p className='text-muted-foreground mt-1'>{blurb}</p>
            </div>
          </div>
          {canPrintInvoice && (
            <Button
              variant='outline'
              className='shrink-0'
              onClick={() => printOrderInvoice(order)}
            >
              <Printer className='mr-2 h-4 w-4' />
              Print invoice
            </Button>
          )}
        </div>

        <Card className='border-green-200 bg-green-50/50'>
          <CardContent className='pt-6'>
            <div className='flex items-start gap-4'>
              <div className='rounded-full bg-green-100 p-3'>
                <CheckCircle2 className='h-6 w-6 text-green-600' />
              </div>
              <div className='flex-1 space-y-3'>
                {order.paymentMethod && (
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>Payment</span>
                    <span className='font-medium'>
                      {paymentMethodLabel(order.paymentMethod)}
                    </span>
                  </div>
                )}
                {order.paymentMethod === 'momo' && (
                  <div className='rounded-md border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-950'>
                    <p className='font-medium'>MoMo payment details</p>
                    <p className='mt-1'>
                      Send to <strong>{MOMO_DISPLAY_NAME}</strong>
                    </p>
                    <p>
                      MoMo number:{' '}
                      <span className='font-mono font-semibold'>
                        {MOMO_PHONE}
                      </span>
                    </p>
                  </div>
                )}
                {order.contactPhone && (
                  <div className='text-sm'>
                    <span className='text-muted-foreground'>Contact phone: </span>
                    <span className='font-medium font-mono'>
                      {order.contactPhone}
                    </span>
                  </div>
                )}
                {order.deliveryOption && (
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>Fulfillment</span>
                    <span className='font-medium'>
                      {order.deliveryOption === 'delivery'
                        ? 'Home delivery'
                        : 'Store pickup'}
                    </span>
                  </div>
                )}
                {order.deliveryAddress && (
                  <div className='text-sm'>
                    <span className='text-muted-foreground'>Address: </span>
                    <span className='font-medium'>{order.deliveryAddress}</span>
                  </div>
                )}
                {order.notes && (
                  <div className='text-sm'>
                    <span className='text-muted-foreground'>Notes: </span>
                    <span className='font-medium'>{order.notes}</span>
                  </div>
                )}
                <div className='pt-3 border-t border-green-200 space-y-2 text-sm'>
                  {(() => {
                    const grand = order.total + (order.deliveryFee || 0);
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
                        <div className='flex justify-between font-medium text-emerald-800'>
                          <span>Paid (debit)</span>
                          <span className='tabular-nums'>
                            ₵{paid.toFixed(2)}
                          </span>
                        </div>
                        <div className='flex justify-between font-medium text-amber-900'>
                          <span>Balance (credit)</span>
                          <span className='tabular-nums'>
                            ₵{bal.toFixed(2)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Package className='h-5 w-5' />
              Order items
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
              <span>Total</span>
              <span>
                ₵{(order.total + (order.deliveryFee || 0)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (legacyAlreadySubmitted) {
    return (
      <div className='space-y-8'>
        <div className='flex items-center gap-4'>
          <Button variant='ghost' onClick={() => router.push('/orders')}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Orders
          </Button>
          <div>
            <h1 className='text-3xl font-serif font-bold text-primary'>
              Order confirmed
            </h1>
            <p className='text-muted-foreground mt-1'>
              Your details have been received
            </p>
          </div>
        </div>

        <Card className='border-green-200 bg-green-50/50'>
          <CardContent className='pt-6'>
            <div className='flex items-start gap-4'>
              <div className='rounded-full bg-green-100 p-3'>
                <CheckCircle2 className='h-6 w-6 text-green-600' />
              </div>
              <div className='flex-1'>
                <h3 className='text-lg font-semibold text-green-900 mb-2'>
                  Awaiting pharmacy approval
                </h3>
                <p className='text-green-800 mb-4'>
                  The pharmacy will review your confirmation and continue
                  processing your order.
                </p>
                <div className='space-y-3 mt-4 pt-4 border-t border-green-200'>
                  {order.paymentMethod && (
                    <div className='flex justify-between text-sm'>
                      <span className='text-muted-foreground'>Payment</span>
                      <span className='font-medium'>
                        {paymentMethodLabel(order.paymentMethod)}
                      </span>
                    </div>
                  )}
                  {order.paymentMethod === 'momo' && (
                    <div className='rounded-md border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-950'>
                      <p className='font-medium'>MoMo payment details</p>
                      <p className='mt-1'>
                        Send to <strong>{MOMO_DISPLAY_NAME}</strong>
                      </p>
                      <p>
                        MoMo number:{' '}
                        <span className='font-mono font-semibold'>
                          {MOMO_PHONE}
                        </span>
                      </p>
                    </div>
                  )}
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground'>Delivery</span>
                    <span className='font-medium'>
                      {order.deliveryOption === 'delivery'
                        ? 'Home delivery'
                        : 'Store pickup'}
                    </span>
                  </div>
                  {order.contactPhone && (
                    <div className='text-sm'>
                      <span className='text-muted-foreground'>
                        Contact phone:{' '}
                      </span>
                      <span className='font-medium font-mono'>
                        {order.contactPhone}
                      </span>
                    </div>
                  )}
                  {order.deliveryAddress && (
                    <div className='text-sm'>
                      <span className='text-muted-foreground'>Address: </span>
                      <span className='font-medium'>
                        {order.deliveryAddress}
                      </span>
                    </div>
                  )}
                  {order.notes && (
                    <div className='text-sm'>
                      <span className='text-muted-foreground'>Notes: </span>
                      <span className='font-medium'>{order.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Package className='h-5 w-5' />
              Order items
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
              <span>Total</span>
              <span>
                ₵{(order.total + (order.deliveryFee || 0)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isProformaReview && !isLegacyVerify) {
    return (
      <div className='space-y-6'>
        <Button variant='ghost' onClick={() => router.push('/orders')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Orders
        </Button>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-center text-muted-foreground'>
              This order is not ready for this step yet. Current status:{' '}
              {order.status.replace(/_/g, ' ')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayItems = isProformaReview ? editableItems : order.items;
  const subtotalForSummary = isProformaReview ? lineSubtotal : order.total;
  const finalTotal =
    subtotalForSummary +
    (deliveryOption === 'delivery' ? DELIVERY_FEE : 0);

  return (
    <div className='space-y-8'>
      <div className='flex items-center gap-4'>
        <Button variant='ghost' onClick={() => router.push('/orders')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
        <div>
          <h1 className='text-3xl font-serif font-bold text-primary'>
            {isProformaReview ? 'Review proforma' : 'Verify your order'}
          </h1>
          <p className='text-muted-foreground mt-1'>
            {isProformaReview
              ? 'Confirm as-is or adjust quantities, then choose pickup or delivery'
              : 'Confirm delivery and payment details'}
          </p>
        </div>
      </div>

      {isProformaReview && order.proformaNote && (
        <Card className='border-sky-200 bg-sky-50/60'>
          <CardContent className='pt-4 pb-4 text-sm text-sky-950'>
            <p className='font-medium text-sky-900 mb-1'>From the pharmacy</p>
            <p className='whitespace-pre-wrap'>{order.proformaNote}</p>
          </CardContent>
        </Card>
      )}

      <div className='grid gap-6 md:grid-cols-3'>
        <div className='md:col-span-2 space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Package className='h-5 w-5' />
                {isProformaReview ? 'Proforma lines' : 'Order items'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {displayItems.map((item) => {
                const p = stockByProductId.get(item.id);
                const lineMax = p
                  ? maxOrderLineQty(p, item.quantity)
                  : item.quantity;
                return (
                  <div
                    key={item.id}
                    className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 py-3 border-b last:border-0'
                  >
                    <div className='flex-1'>
                      <p className='font-medium'>{item.name}</p>
                      <p className='text-sm text-muted-foreground'>
                        ₵{item.price.toFixed(2)} per {item.unit}
                      </p>
                      {isProformaReview && order.stockReserved && p && (
                        <p className='text-xs text-amber-800 mt-1'>
                          Max for this order: {lineMax} (available stock)
                        </p>
                      )}
                    </div>
                    {isProformaReview ? (
                      <div className='flex items-center gap-2 flex-wrap'>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => bumpQty(item.id, -1)}
                          aria-label='Decrease quantity'
                        >
                          <Minus className='h-4 w-4' />
                        </Button>
                        <span className='w-8 text-center font-medium tabular-nums'>
                          {item.quantity}
                        </span>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => bumpQty(item.id, 1)}
                          disabled={item.quantity >= lineMax}
                          aria-label='Increase quantity'
                        >
                          <Plus className='h-4 w-4' />
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 text-destructive'
                          onClick={() => removeLine(item.id)}
                          disabled={editableItems.length <= 1}
                          aria-label='Remove line'
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                        <span className='font-bold sm:min-w-[4.5rem] text-right'>
                          ₵{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <p className='font-bold'>
                        ₵{(item.price * item.quantity).toFixed(2)}
                      </p>
                    )}
                  </div>
                );
              })}
              <Separator />
              <div className='flex justify-between font-bold text-lg'>
                <span>Subtotal</span>
                <span>₵{subtotalForSummary.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pickup or delivery</CardTitle>
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
                      <span className='font-medium'>Pickup at store</span>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Collect your order from the pharmacy
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
                      <span className='font-medium'>Delivery</span>
                      <Badge variant='secondary' className='ml-2'>
                        Free
                      </Badge>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      We will deliver to your address
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {deliveryOption === 'delivery' && (
                <div className='space-y-2'>
                  <Label htmlFor='address'>Delivery address</Label>
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
                <Label htmlFor='notes'>Additional notes (optional)</Label>
                <Textarea
                  id='notes'
                  placeholder='Any special instructions...'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='contact-phone'>
                  Contact phone (optional)
                </Label>
                <Input
                  id='contact-phone'
                  type='tel'
                  placeholder='Number to reach you when items are ready'
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  autoComplete='tel'
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment method</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value: NonNullable<Order['paymentMethod']>) =>
                  setPaymentMethod(value)
                }
              >
                <div className='flex items-start space-x-3 space-y-0 rounded-md border p-4'>
                  <RadioGroupItem value='cash' id='cash' className='mt-1' />
                  <Label htmlFor='cash' className='flex-1 cursor-pointer'>
                    <div className='flex items-center gap-2'>
                      <Wallet className='h-4 w-4' />
                      <span className='font-medium'>Cash</span>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Pay on pickup or delivery
                    </p>
                  </Label>
                </div>
                <div className='flex items-start space-x-3 space-y-0 rounded-md border p-4'>
                  <RadioGroupItem value='momo' id='momo' className='mt-1' />
                  <Label htmlFor='momo' className='flex-1 cursor-pointer'>
                    <div className='flex items-center gap-2'>
                      <CreditCard className='h-4 w-4' />
                      <span className='font-medium'>Mobile money (Momo)</span>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Pay via Mobile Money
                    </p>
                  </Label>
                </div>
                <div className='flex items-start space-x-3 space-y-0 rounded-md border p-4'>
                  <RadioGroupItem value='cheque' id='cheque' className='mt-1' />
                  <Label htmlFor='cheque' className='flex-1 cursor-pointer'>
                    <div className='flex items-center gap-2'>
                      <FileText className='h-4 w-4' />
                      <span className='font-medium'>Cheque</span>
                    </div>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Pay by cheque
                    </p>
                  </Label>
                </div>
              </RadioGroup>
              {paymentMethod === 'momo' && (
                <div className='rounded-md border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-violet-950'>
                  <p className='font-medium'>Send payment to</p>
                  <p className='mt-1'>
                    <strong>{MOMO_DISPLAY_NAME}</strong>
                  </p>
                  <p>
                    MoMo number:{' '}
                    <span className='font-mono font-semibold'>{MOMO_PHONE}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='h-fit'>
          <Card className='sticky top-4'>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Subtotal</span>
                  <span>₵{subtotalForSummary.toFixed(2)}</span>
                </div>
                {deliveryOption === 'delivery' && (
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Delivery</span>
                    <span>Free</span>
                  </div>
                )}
                <Separator />
                <div className='flex justify-between font-bold text-lg'>
                  <span>Total</span>
                  <span>₵{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className='pt-4 space-y-2 text-xs text-muted-foreground'>
                <p>Order: {formatOrderLabel(order)}</p>
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
                  'Submitting...'
                ) : (
                  <>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    {isProformaReview
                      ? 'Confirm finalized order'
                      : 'Confirm order'}
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
