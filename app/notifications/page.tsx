'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/hooks/use-notifications';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createNotification } from '@/lib/notifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Bell, Package, CheckCircle2, MessageSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function NotificationsPage() {
  const { user, isAdmin } = useAuth();
  const { notifications, unreadCount, loading } = useNotifications(user?.id);
  const router = useRouter();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNotification, setPendingNotification] =
    useState<Notification | null>(null);

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

  const handleConfirmOrderApproval = async () => {
    if (!pendingNotification || !db) return;

    try {
      const orderDoc = await getDoc(
        doc(db, 'orders', pendingNotification.orderId!)
      );
      if (orderDoc.exists()) {
        const orderData = orderDoc.data();
        // Only update if order is still in pharmacy_confirmed status
        if (orderData.status === 'pharmacy_confirmed') {
          await updateDoc(doc(db, 'orders', pendingNotification.orderId!), {
            status: 'customer_confirmed',
            updatedAt: Date.now(),
          });

          // Send notification to customer
          await createNotification(
            orderData.userId,
            'order_update',
            'Order Approved',
            `Your order #${pendingNotification.orderId!.slice(
              0,
              8
            )} has been approved and confirmed by the pharmacy. We'll begin processing it shortly.`,
            pendingNotification.orderId!
          );

          toast.success(
            'Order approved! Status updated to Customer Confirmed.'
          );
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
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                !notification.read ? 'border-primary/50 bg-primary/5' : ''
              }`}
              onClick={() => {
                // Don't auto-mark as read for admin order confirmation notifications
                // They need to see the dialog first
                if (
                  !notification.read &&
                  !(isAdmin && notification.type === 'order_confirmation')
                ) {
                  markAsRead(notification);
                } else if (
                  !notification.read &&
                  isAdmin &&
                  notification.type === 'order_confirmation'
                ) {
                  // Show dialog instead of auto-marking as read
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
              }}
            >
              <CardHeader className='pb-3'>
                <div className='flex items-start justify-between gap-4'>
                  <div className='flex items-start gap-3 flex-1'>
                    <div
                      className={`mt-1 ${
                        !notification.read
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <CardTitle className='text-base font-semibold'>
                        {notification.title}
                      </CardTitle>
                      <p className='text-sm text-muted-foreground mt-1'>
                        {notification.message}
                      </p>
                      <p className='text-xs text-muted-foreground mt-2'>
                        {format(notification.createdAt, 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                  </div>
                  {!notification.read && (
                    <Badge variant='default' className='flex-shrink-0'>
                      New
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Admin Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer Order Confirmation</DialogTitle>
            <DialogDescription>
              A customer has confirmed their order. Would you like to approve it
              and move it to the next stage?
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
              Approve & Begin Processing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
