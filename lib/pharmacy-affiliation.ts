import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { User } from '@/types';
import { createNotification } from '@/lib/notifications';

export type ClientPharmacyAffiliation =
  | 'incomplete'
  | 'pending'
  | 'approved'
  | 'rejected';

export const PENDING_VERIFICATION_MESSAGE =
  "Your account is pending verification. We'll notify you once your pharmacy affiliation has been confirmed.";

export const REJECTED_AFFILIATION_MESSAGE =
  'Your pharmacy affiliation was not confirmed. Contact Leetonia Wholesale if you believe this is a mistake.';

/**
 * Client onboarding state. Non-clients return null.
 * Users who completed a profile before affiliation tracking are treated as approved.
 */
export function clientPharmacyAffiliation(
  user: User | null | undefined
): ClientPharmacyAffiliation | null {
  if (!user || user.role !== 'client') return null;
  if (user.pharmacyProfileComplete !== true) return 'incomplete';
  if (user.pharmacyAffiliationStatus === 'pending') return 'pending';
  if (user.pharmacyAffiliationStatus === 'rejected') return 'rejected';
  return 'approved';
}

export function clientCanPlaceWholesaleOrders(
  user: User | null | undefined
): boolean {
  if (!user) return false;
  const affiliation = clientPharmacyAffiliation(user);
  return affiliation === null || affiliation === 'approved';
}

export async function notifyAdminsPendingPharmacyRequest(
  db: Firestore,
  params: {
    userName: string;
    userEmail: string;
    pharmacyName: string;
    pharmacyId: string;
    isNewPharmacy: boolean;
  }
): Promise<void> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', 'in', ['admin', 'super_admin'])
    );
    const snap = await getDocs(q);
    const who = params.userName || params.userEmail || 'A customer';
    const kind = params.isNewPharmacy
      ? `new pharmacy “${params.pharmacyName}”`
      : `pharmacy “${params.pharmacyName}”`;
    const message = `${who} requested affiliation with ${kind}. Review under Administration → Pharmacies.`;
    await Promise.all(
      snap.docs.map((d) =>
        createNotification(
          d.id,
          'system',
          'Pending pharmacy request',
          message
        )
      )
    );
  } catch (error) {
    console.error('notifyAdminsPendingPharmacyRequest', error);
  }
}
