import { randomOrderSuffix } from '@/lib/pharmacies';

/** Human-readable inventory SKU-style code for new products (admin-generated). */
export function generateInventoryProductCode(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = randomOrderSuffix(4);
  return `LW-${t}-${r}`;
}
