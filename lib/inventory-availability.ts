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

/**
 * Keep `isHidden` in sync with storefront (wholesale) quantity: out of stock → hidden;
 * restocking from 0 → visible again; otherwise preserve manual hide while in stock.
 */
export function nextIsHiddenAfterWholesaleChange(
  prevWholesale: number,
  newWholesale: number,
  currentIsHidden: boolean
): boolean {
  if (newWholesale <= 0) return true;
  if (prevWholesale <= 0 && newWholesale > 0) return false;
  return currentIsHidden;
}
