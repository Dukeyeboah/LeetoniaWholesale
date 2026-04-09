import type { Order } from '@/types';

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
