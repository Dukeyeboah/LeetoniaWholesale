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
    proforma_sent: {
      title: 'Proforma sent',
      message: `Your order #${label}: a proforma is ready. Open the order to review, edit quantities if needed, and confirm pickup or delivery.`,
    },
    pharmacy_confirmed: {
      title: 'Order Ready for Verification',
      message: `Your order #${label} has been confirmed by the pharmacy. Please review and confirm the items: ${orderItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ')}`,
    },
    client_finalized: {
      title: 'Order received',
      message: `Your order #${label} is with the pharmacy. They will send your invoice and prepare your order.`,
    },
    invoice_sent: {
      title: 'Invoice recorded',
      message: `Your order #${label}: invoice has been recorded. The shop will pack for pickup or delivery.`,
    },
    customer_confirmed: {
      title: 'Order Confirmed',
      message: `Your order #${label} has been confirmed and is being prepared.`,
    },
    processing: {
      title: 'Order Processing',
      message: `Your order #${label} is being packed and prepared for pickup or delivery.`,
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
