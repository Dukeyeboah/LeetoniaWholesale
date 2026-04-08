/**
 * Helper functions for creating and managing notifications
 */

import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import type { Notification } from '@/types';

export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  message: string,
  orderId?: string
): Promise<void> {
  if (!db) {
    console.error('Database not available');
    return;
  }

  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      message,
      orderId: orderId || null,
      read: false,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

export async function createOrderStatusNotification(
  userId: string,
  orderId: string,
  status: string,
  orderItems: Array<{ name: string; quantity: number }>,
  displayOrderId?: string
): Promise<void> {
  const label = displayOrderId || orderId;
  const statusMessages: Record<string, { title: string; message: string }> = {
    pharmacy_confirmed: {
      title: 'Order Ready for Verification',
      message: `Your order #${label} has been confirmed by the pharmacy. Please review and confirm the items: ${orderItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ')}`,
    },
    customer_confirmed: {
      title: 'Order Confirmed',
      message: `Your order #${label} has been confirmed and is being prepared.`,
    },
    processing: {
      title: 'Order Processing',
      message: `Your order #${label} is being processed and prepared for fulfillment.`,
    },
    completed: {
      title: 'Order Completed',
      message: `Your order #${label} has been completed and is ready for pickup/delivery.`,
    },
    cancelled: {
      title: 'Order Cancelled',
      message: `Your order #${label} has been cancelled.`,
    },
  };

  const statusInfo = statusMessages[status];
  if (statusInfo) {
    await createNotification(
      userId,
      'order_update',
      statusInfo.title,
      statusInfo.message,
      orderId
    );
  }
}
