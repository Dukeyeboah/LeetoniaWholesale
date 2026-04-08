import type { Order } from '@/types';

export function formatOrderLabel(
  order: Pick<Order, 'id' | 'displayOrderId'>
): string {
  return order.displayOrderId ?? order.id;
}
