/** First character bucket for A–Z / 0–9 filters (same as customer inventory page). */
export const INVENTORY_LETTER_OPTIONS = [
  'all',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  '0-9',
] as const;

export type InventoryLetterFilter = (typeof INVENTORY_LETTER_OPTIONS)[number];

export function getFirstCharacterGroup(name: string): string {
  const first = (name || '').trim()[0];
  if (!first) return '';
  if (/\d/.test(first)) return '0-9';
  const upper = first.toUpperCase();
  return /[A-Z]/.test(upper) ? upper : '';
}
