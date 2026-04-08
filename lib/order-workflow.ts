import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { createNotification } from '@/lib/notifications';
import { formatOrderLabel } from '@/lib/order-display';
import type { Order } from '@/types';

export const DEFAULT_PROFORMA_NOTE =
  'The quicker you confirm, the quicker you receive your order. Please review this proforma, adjust line items if needed, then choose pickup or delivery.';

async function forEachAdminUser(
  db: Firestore,
  fn: (userId: string) => Promise<void>
): Promise<void> {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['admin', 'super_admin'])
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => fn(d.id)));
}

/** After a client places an order — notify pharmacy admins. */
export async function notifyAdminsNewOrderRequest(
  db: Firestore,
  order: Pick<Order, 'id' | 'displayOrderId' | 'userName' | 'userEmail'>
): Promise<void> {
  const label = formatOrderLabel(order);
  const who = order.userName || order.userEmail || 'Customer';
  await forEachAdminUser(db, (userId) =>
    createNotification(
      userId,
      'order_update',
      'New order request',
      `New order ${label} from ${who}. Review items and send a proforma.`,
      order.id
    )
  );
}

/** Client: proforma is ready to review. */
export async function notifyClientProformaReady(
  db: Firestore,
  order: Pick<Order, 'id' | 'userId' | 'displayOrderId'>
): Promise<void> {
  const label = formatOrderLabel(order);
  await createNotification(
    order.userId,
    'proforma_ready',
    'Proforma ready for your review',
    `${DEFAULT_PROFORMA_NOTE}\n\nOrder ${label}: open this order to confirm or edit line items and choose pickup or delivery.`,
    order.id
  );
}

/** Admins: customer finalized the proforma (possibly with edits). */
export async function notifyAdminsClientFinalizedOrder(
  db: Firestore,
  order: Pick<Order, 'id' | 'displayOrderId' | 'userName' | 'userEmail'>
): Promise<void> {
  const label = formatOrderLabel(order);
  const who = order.userName || order.userEmail || 'Customer';
  await forEachAdminUser(db, (userId) =>
    createNotification(
      userId,
      'order_confirmation',
      'Customer finalized order',
      `Order ${label} from ${who} has been confirmed (proforma accepted or edited). Send the invoice and update the order status when ready.`,
      order.id
    )
  );
}

/** Optional: tell client the invoice step was recorded. */
export async function notifyClientInvoiceSent(
  db: Firestore,
  order: Pick<Order, 'id' | 'userId' | 'displayOrderId'>
): Promise<void> {
  const label = formatOrderLabel(order);
  await createNotification(
    order.userId,
    'order_update',
    'Invoice sent',
    `Your order ${label}: the pharmacy has recorded your invoice. They will pack your order for pickup or delivery.`,
    order.id
  );
}
