import { doc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

/** Default monthly purchase cap (GHS total order value) for new / seeded pharmacies. */
export const DEFAULT_MONTHLY_LIMIT_GHS = 50_000;

export type SeedPharmacy = {
  id: string;
  name: string;
};

/** Curated list (Firestore doc id + display name). Order ID prefix is derived from `name`. */
export const SEED_PHARMACIES: readonly SeedPharmacy[] = [
  { id: 'amanfrom', name: 'Amanfrom' },
  { id: 'avalon', name: 'Avalon' },
  { id: 'caads', name: 'Caads' },
  { id: 'carehub', name: 'Care Hub' },
  { id: 'dayben', name: 'Dayben' },
  { id: 'diagnopharma', name: 'Diagno Pharma' },
  { id: 'dixxons', name: 'Dixxons' },
  { id: 'empat', name: 'Empat' },
  { id: 'grit', name: 'Grit' },
  { id: 'interpharma', name: 'Interpharma' },
] as const;

const SEED_BY_ID = new Map(SEED_PHARMACIES.map((p) => [p.id, p]));

export function getSeedPharmacy(id: string): SeedPharmacy | undefined {
  return SEED_BY_ID.get(id);
}

/**
 * Prefix used in order document ids and display strings.
 * Multi-word names are joined (e.g. "Care Hub" -> "CareHub").
 */
export function toOrderIdPrefix(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

/** URL- / Firestore-safe fragment (alphanumeric). */
export function randomOrderSuffix(length = 8): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint8Array(length);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out += chars[buf[i]! % chars.length];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function buildDisplayOrderId(prefix: string, suffix: string): string {
  return `${prefix}_#${suffix}`;
}

export function buildFirestoreOrderId(prefix: string, suffix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9]/g, '');
  return `${safePrefix}_${suffix}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}

export function slugifyForCustomPharmacyId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * Ensures a `pharmacies` document exists with default monthly limit (merge).
 * Call after onboarding or before first checkout.
 */
export async function ensurePharmacyDocument(
  db: Firestore,
  pharmacyId: string,
  name: string,
  options?: { isCustom?: boolean }
): Promise<void> {
  const ref = doc(db, 'pharmacies', pharmacyId);
  await setDoc(
    ref,
    {
      name,
      monthlyLimitGHS: DEFAULT_MONTHLY_LIMIT_GHS,
      monthSpendGHS: 0,
      monthKey: currentMonthKey(),
      updatedAt: Date.now(),
      ...(options?.isCustom ? { isCustom: true } : {}),
    },
    { merge: true }
  );
}
