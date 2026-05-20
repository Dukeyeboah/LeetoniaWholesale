'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/hooks/use-notifications';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createNotification } from '@/lib/notifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  Bell,
  Package,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Notification } from '@/types';
import { formatOrderLabel } from '@/lib/order-display';
import { notifyClientInvoiceSent } from '@/lib/order-workflow';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { user, isAdmin } = useAuth();
  const { notifications, unreadCount, loading } = useNotifications(user?.id);
  const router = useRouter();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNotification, setPendingNotification] =
    useState<Notification | null>(null);
  const [expandedOrderKeys, setExpandedOrderKeys] = useState<Set<string>>(
    () => new Set()
  );
  const groupedNotifications = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of notifications) {
      const key = n.orderId || '__general__';
      const list = map.get(key);
      if (list) list.push(n);
      else map.set(key, [n]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return [...map.entries()]
      .map(([key, items]) => ({
        key,
        items,
        latestAt: Math.max(...items.map((i) => i.createdAt)),
        unreadCount: items.filter((i) => !i.read).length,
      }))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [notifications]);

  const markAsRead = async (notification: Notification) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'notifications', notification.id), {
        read: true,
      });

      // If admin reads a customer confirmation notification, show prompt
      if (
        isAdmin &&
        notification.type === 'order_confirmation' &&
        notification.orderId &&
        !notification.read
      ) {
        setPendingNotification(notification);
        setShowConfirmDialog(true);
        return; // Don't mark as read yet, wait for admin confirmation
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (
      !notification.read &&
      !(isAdmin && notification.type === 'order_confirmation')
    ) {
      void markAsRead(notification);
    } else if (
      !notification.read &&
      isAdmin &&
      notification.type === 'order_confirmation'
    ) {
      setPendingNotification(notification);
      setShowConfirmDialog(true);
      return;
    }
    if (notification.orderId) {
      if (isAdmin) {
        router.push('/admin');
      } else {
        router.push(`/orders/${notification.orderId}`);
      }
    }
  };

  const handleConfirmOrderApproval = async () => {
    if (!pendingNotification || !db) return;

    try {
      const orderDoc = await getDoc(
        doc(db, 'orders', pendingNotification.orderId!)
      );
      if (orderDoc.exists()) {
        const orderData = orderDoc.data();
        const oid = pendingNotification.orderId!;
        const label = formatOrderLabel({
          id: oid,
          displayOrderId: orderData.displayOrderId,
        });

        if (orderData.status === 'client_finalized') {
          await updateDoc(doc(db, 'orders', oid), {
            status: 'invoice_sent',
            invoiceSentAt: Date.now(),
            updatedAt: Date.now(),
          });
          await notifyClientInvoiceSent(db, {
            id: oid,
            userId: orderData.userId,
            displayOrderId: orderData.displayOrderId,
          });
          toast.success('Invoice sent. Customer notified.');
        } else if (orderData.status === 'pharmacy_confirmed') {
          await updateDoc(doc(db, 'orders', oid), {
            status: 'customer_confirmed',
            updatedAt: Date.now(),
          });
          await createNotification(
            orderData.userId,
            'order_update',
            'Order approved',
            `Your order ${label} has been approved. We'll begin processing it shortly.`,
            oid
          );
          toast.success('Order approved (legacy flow).');
        }
      }

      // Mark notification as read
      await updateDoc(doc(db, 'notifications', pendingNotification.id), {
        read: true,
      });

      setShowConfirmDialog(false);
      setPendingNotification(null);
    } catch (error) {
      console.error('Error confirming order approval:', error);
      toast.error('Failed to approve order');
    }
  };

  const markAllAsRead = async () => {
    if (!db || !user) return;
    try {
      const unreadNotifications = notifications.filter((n) => !n.read);
      await Promise.all(unreadNotifications.map((n) => markAsRead(n)));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'order_update':
        return <Package className='h-4 w-4' />;
      case 'order_confirmation':
        return <CheckCircle2 className='h-4 w-4' />;
      case 'admin_message':
        return <MessageSquare className='h-4 w-4' />;
      case 'pharmacy_limit':
        return <AlertTriangle className='h-4 w-4 text-amber-600' />;
      case 'proforma_ready':
        return <Package className='h-4 w-4 text-sky-600' />;
      default:
        return <Bell className='h-4 w-4' />;
    }
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          Notifications
        </h1>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          Notifications
        </h1>
        {unreadCount > 0 && (
          <Button variant='outline' onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className='text-center py-12 border rounded-lg bg-card'>
          <Bell className='mx-auto h-12 w-12 text-muted-foreground/50' />
          <h3 className='mt-4 text-lg font-medium'>No notifications</h3>
          <p className='text-muted-foreground'>
            You'll see order updates and messages here.
          </p>
        </div>
      ) : (
        <div className='space-y-4'>
          {groupedNotifications.map((group) => {
            const isOpen = expandedOrderKeys.has(group.key);
            const headerLabel =
              group.key === '__general__'
                ? 'Other notifications'
                : `Order ${group.key}`;

            return (
              <Collapsible
                key={group.key}
                open={isOpen}
                onOpenChange={(open) => {
                  setExpandedOrderKeys((prev) => {
                    const next = new Set(prev);
                    if (open) next.add(group.key);
                    else next.delete(group.key);
                    return next;
                  });
                }}
              >
                <Card
                  className={
                    group.unreadCount > 0 ? 'border-primary/40 bg-primary/[0.03]' : ''
                  }
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type='button'
                      className='flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 rounded-t-lg transition-colors'
                    >
                      <ChevronDown
                        className={cn(
                          'mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
                          isOpen && 'rotate-180'
                        )}
                      />
                      <div className='flex flex-1 flex-wrap items-start justify-between gap-2'>
                        <div>
                          <p className='font-semibold text-base'>{headerLabel}</p>
                          <p className='text-xs text-muted-foreground mt-0.5'>
                            {group.items.length} message
                            {group.items.length === 1 ? '' : 's'}
                            {group.unreadCount > 0
                              ? ` · ${group.unreadCount} unread`
                              : ''}
                          </p>
                        </div>
                        {group.unreadCount > 0 && (
                          <Badge variant='default' className='shrink-0'>
                            New
                          </Badge>
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className='space-y-2 border-t px-3 pb-3 pt-1'>
                      {group.items.map((notification) => (
                        <Card
                          key={notification.id}
                          className={cn(
                            'cursor-pointer transition-all hover:shadow-sm',
                            !notification.read
                              ? 'border-primary/50 bg-primary/5'
                              : 'bg-card'
                          )}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <CardHeader className='p-3 pb-3'>
                            <div className='flex items-start justify-between gap-3'>
                              <div className='flex items-start gap-2 flex-1 min-w-0'>
                                <div
                                  className={cn(
                                    'mt-0.5 shrink-0',
                                    !notification.read
                                      ? 'text-primary'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {getNotificationIcon(notification.type)}
                                </div>
                                <div className='min-w-0'>
                                  <CardTitle className='text-sm font-semibold leading-snug'>
                                    {notification.title}
                                  </CardTitle>
                                  <p className='text-sm text-muted-foreground mt-1 whitespace-pre-line'>
                                    {notification.message}
                                  </p>
                                  <p className='text-xs text-muted-foreground mt-2'>
                                    {format(
                                      notification.createdAt,
                                      'MMM d, yyyy • h:mm a'
                                    )}
                                  </p>
                                </div>
                              </div>
                              {!notification.read && (
                                <Badge variant='secondary' className='shrink-0 text-xs'>
                                  New
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Admin Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer finalized order</DialogTitle>
            <DialogDescription>
              Send the invoice to the customer so packing can begin. Legacy orders
              in the old &quot;verify&quot; step can still be approved here.
            </DialogDescription>
          </DialogHeader>
          {pendingNotification && (
            <div className='py-4'>
              <p className='text-sm text-muted-foreground whitespace-pre-line'>
                {pendingNotification.message}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setShowConfirmDialog(false);
                setPendingNotification(null);
              }}
            >
              Review Later
            </Button>
            <Button onClick={handleConfirmOrderApproval}>
              Send invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
