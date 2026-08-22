import type { Order, OrderStatus } from '@/types';

export function formatOrderLabel(
  order: Pick<Order, 'id' | 'displayOrderId'>
): string {
  return order.displayOrderId ?? order.id;
}

/** Wording for customer notifications (pickup vs delivery). */
export function fulfillmentShortPhrase(
  deliveryOption?: Order['deliveryOption']
): string {
  if (deliveryOption === 'delivery') return 'home delivery';
  if (deliveryOption === 'pickup') return 'store pickup';
  return 'pickup or delivery';
}

export function customerOrderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'proforma_sent':
      return 'Pro Forma Sent';
    case 'client_finalized':
      return 'Awaiting invoice';
    case 'invoice_sent':
      return 'Packing';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'checking_stock':
      return 'Checking stock';
    case 'pharmacy_confirmed':
      return 'Ready for verification';
    case 'customer_confirmed':
      return 'Verified';
    default:
      return status;
  }
}
