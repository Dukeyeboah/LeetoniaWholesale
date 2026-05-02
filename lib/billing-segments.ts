import type { Pharmacy } from '@/types';

/**
 * Cash-customers (import + signup with customerBillingType `cash`) typically pay on the spot.
 * A future `credit-customers` import will set `customerBillingType: 'credit'` and
 * `allowsAccountCredit: true` so the order flow can allow balances / payment terms.
 */
export function pharmacyBehavesAsCashCustomer(
  p: Pick<Pharmacy, 'customerBillingType' | 'allowsAccountCredit' | 'source'> | null | undefined
): boolean {
  if (!p) return false;
  if (p.customerBillingType === 'cash') return true;
  if (p.allowsAccountCredit === false) return true;
  if (p.source === 'cash_import') return true;
  return false;
}
