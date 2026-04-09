import type { Product } from '@/types';

/** Physical wholesale-facing units on hand (before reservations). */
export function wholesaleOnHand(p: Product): number {
  return Math.max(0, Number(p.wholesaleStock ?? p.stock ?? 0));
}

export function reservedForOrders(p: Product): number {
  return Math.max(0, Number(p.reservedQty ?? 0));
}

/** Units still sellable (what clients should see). */
export function availableToSell(p: Product): number {
  return Math.max(0, wholesaleOnHand(p) - reservedForOrders(p));
}
