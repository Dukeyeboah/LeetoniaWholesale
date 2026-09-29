export const SALES_CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP'] as const;

export function currencySymbol(currency: string): string {
  switch (currency) {
    case 'GHS':
      return '₵';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return `${currency} `;
  }
}

export function formatMoney(n: number | undefined, currency: string, digits = 2): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return `${currencySymbol(currency)}${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatQty(n: number | undefined, digits = 0): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatPct(share: number | undefined, digits = 1): string {
  if (share === undefined || !Number.isFinite(share)) return '—';
  return `${(share * 100).toFixed(digits)}%`;
}
