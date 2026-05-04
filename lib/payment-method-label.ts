import type { Order } from '@/types';

/** Human-readable label for checkout / invoices / admin. */
export function paymentMethodLabel(method: Order['paymentMethod']): string {
  if (!method) return '—';
  switch (method) {
    case 'momo':
      return 'Mobile Money (Momo)';
    case 'cheque':
      return 'Cheque';
    case 'cash':
    default:
      return 'Cash';
  }
}
