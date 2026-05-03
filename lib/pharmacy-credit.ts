import {
  doc,
  getDoc,
  increment,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import type { Order, Pharmacy } from '@/types';

type PharmSnap = Pharmacy | Record<string, unknown> | null | undefined;

/** Pharmacy is configured for account credit (super admin sets limits). */
export function pharmacyUsesCreditLine(data: PharmSnap): boolean {
  if (!data) return false;
  return (
    data.allowsAccountCredit === true && data.customerBillingType === 'credit'
  );
}

/** Enforce credit capacity at checkout only when they have a positive limit set. */
export function pharmacyRequiresCreditCapacityCheck(data: PharmSnap): boolean {
  return pharmacyUsesCreditLine(data) && getCreditLimitGHS(data) > 0;
}

export function getCreditBalanceGHS(data: PharmSnap): number {
  const n = Number(data?.creditBalanceGHS);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function getCreditLimitGHS(data: PharmSnap): number {
  const n = Number(data?.creditLimitGHS);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function creditAvailableGHS(data: PharmSnap): number {
  return Math.max(0, getCreditLimitGHS(data) - getCreditBalanceGHS(data));
}

export function orderGrandTotal(order: {
  total: number;
  deliveryFee?: number;
}): number {
  return order.total + (order.deliveryFee ?? 0);
}

/** Amount recorded as paid toward this order (handles legacy “paid” without amount). */
export function effectiveAmountPaidGHS(order: Order): number {
  const grand = orderGrandTotal(order);
  if (order.accountingStatus === 'paid') {
    if (order.amountPaidGHS == null || order.amountPaidGHS === undefined) {
      return grand;
    }
    return order.amountPaidGHS;
  }
  return order.amountPaidGHS ?? 0;
}

export function unpaidPortionGHS(order: Order): number {
  const grand = orderGrandTotal(order);
  const paid = effectiveAmountPaidGHS(order);
  return Math.max(0, grand - paid);
}

/**
 * When an order moves to completed, book any unpaid portion onto the pharmacy’s credit balance.
 */
export async function applyCreditBalanceOnOrderCompleted(
  db: Firestore,
  order: Order
): Promise<void> {
  if (!order.pharmacyId) return;
  const pref = doc(db, 'pharmacies', order.pharmacyId);
  const snap = await getDoc(pref);
  if (!snap.exists()) return;
  const data = snap.data();
  if (!pharmacyUsesCreditLine(data)) return;
  const unpaid = unpaidPortionGHS(order);
  if (unpaid <= 0) return;
  await updateDoc(pref, {
    creditBalanceGHS: increment(unpaid),
    updatedAt: Date.now(),
  });
}

/**
 * When payments are recorded against a completed credit order, reduce outstanding balance.
 */
export async function applyPharmacyCreditPaymentDelta(
  db: Firestore,
  pharmacyId: string | undefined,
  deltaPaid: number
): Promise<void> {
  if (!pharmacyId || deltaPaid <= 0) return;
  const pref = doc(db, 'pharmacies', pharmacyId);
  const s = await getDoc(pref);
  if (!s.exists()) return;
  if (!pharmacyUsesCreditLine(s.data())) return;
  const cur = getCreditBalanceGHS(s.data());
  const dec = Math.min(cur, deltaPaid);
  if (dec <= 0) return;
  await updateDoc(pref, {
    creditBalanceGHS: increment(-dec),
    updatedAt: Date.now(),
  });
}
