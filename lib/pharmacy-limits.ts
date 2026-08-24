import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Order } from '@/types';
import { createNotification } from '@/lib/notifications';
import {
  buildDisplayOrderId,
  buildFirestoreOrderId,
  randomOrderSuffix,
} from '@/lib/pharmacies';
import { transactionReserveLines } from '@/lib/stock-reservation';
import {
  getCreditBalanceGHS,
  getCreditLimitGHS,
  pharmacyRequiresCreditCapacityCheck,
} from '@/lib/pharmacy-credit';

export class PharmacyLimitError extends Error {
  readonly code: 'CREDIT_LIMIT';

  constructor(code: 'CREDIT_LIMIT') {
    super(code);
    this.name = 'PharmacyLimitError';
    this.code = code;
  }
}

export class PharmacyAffiliationError extends Error {
  constructor(message = 'Pharmacy affiliation is not approved') {
    super(message);
    this.name = 'PharmacyAffiliationError';
  }
}

async function getSuperAdminUserIds(db: Firestore): Promise<string[]> {
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'super_admin')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
}

export async function notifySuperAdminsPharmacyCreditLimitAttempt(
  db: Firestore,
  params: {
    pharmacyName: string;
    pharmacyId: string;
    userName: string;
    userEmail: string;
    orderTotal: number;
    creditLimitGHS: number;
    balanceAfter: number;
  }
): Promise<void> {
  try {
    const ids = await getSuperAdminUserIds(db);
    const title = 'Pharmacy account credit exceeded';
    const message = `${params.pharmacyName} (${params.pharmacyId}) would exceed its account credit limit of ₵${params.creditLimitGHS.toLocaleString()} with this ₵${params.orderTotal.toFixed(2)} order. Outstanding balance after this order would be ₵${params.balanceAfter.toFixed(2)}. User: ${params.userName} (${params.userEmail}). Adjust credit under Admin → Pharmacies.`;
    await Promise.all(
      ids.map((userId) =>
        createNotification(userId, 'pharmacy_limit', title, message)
      )
    );
  } catch (e) {
    console.error('notifySuperAdminsPharmacyCreditLimitAttempt', e);
  }
}

export type PlaceOrderWithLimitParams = {
  db: Firestore;
  pharmacyId: string;
  pharmacyDisplayName: string;
  /** PascalCase joined prefix, e.g. "CareHub", "Dayben". */
  orderPrefix: string;
  orderPayload: Omit<Order, 'id'>;
};

export type PlaceOrderWithLimitResult = {
  orderId: string;
  displayOrderId: string;
};

function isPharmacyLimitError(e: unknown): e is PharmacyLimitError {
  return e instanceof PharmacyLimitError;
}

/**
 * Atomically checks account credit headroom (if the pharmacy uses a credit line),
 * reserves inventory, creates the order, and touches the pharmacy doc for name/updatedAt.
 * Outstanding balance is booked when the order is marked completed (unpaid portion only).
 */
export async function placeOrderWithPharmacyLimit(
  params: PlaceOrderWithLimitParams
): Promise<PlaceOrderWithLimitResult> {
  const { db, pharmacyId, pharmacyDisplayName, orderPrefix, orderPayload } =
    params;
  const suffix = randomOrderSuffix(8);
  const displayOrderId = buildDisplayOrderId(orderPrefix, suffix);
  const orderId = buildFirestoreOrderId(orderPrefix, suffix);
  const orderTotal = orderPayload.total;

  try {
    await runTransaction(db, async (transaction) => {
      const pRef = doc(db, 'pharmacies', pharmacyId);
      const pSnap = await transaction.get(pRef);
      const userRef = doc(db, 'users', orderPayload.userId);
      const userSnap = await transaction.get(userRef);

      if (userSnap.exists()) {
        const u = userSnap.data();
        if (u.role === 'client') {
          const complete = u.pharmacyProfileComplete === true;
          const status = u.pharmacyAffiliationStatus;
          if (!complete || status === 'pending' || status === 'rejected') {
            throw new PharmacyAffiliationError();
          }
        }
      }

      if (pSnap.exists() && pharmacyRequiresCreditCapacityCheck(pSnap.data())) {
        const d = pSnap.data();
        const credBal = getCreditBalanceGHS(d);
        const credLim = getCreditLimitGHS(d);
        const balanceAfter = credBal + orderTotal;
        if (balanceAfter > credLim + 1e-6) {
          throw new PharmacyLimitError('CREDIT_LIMIT');
        }
      }

      // All Firestore reads before any writes: inventory gets happen here, then writes below.
      await transactionReserveLines(
        db,
        transaction,
        orderPayload.items.map((i) => ({ productId: i.id, qty: i.quantity }))
      );

      transaction.set(
        pRef,
        {
          name: pharmacyDisplayName,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      const oRef = doc(db, 'orders', orderId);
      transaction.set(oRef, {
        ...orderPayload,
        pharmacyId,
        pharmacyName: pharmacyDisplayName,
        displayOrderId,
        stockReserved: true,
      });
    });
  } catch (e: unknown) {
    if (e instanceof PharmacyAffiliationError) {
      throw e;
    }
    if (isPharmacyLimitError(e)) {
      const pRef = doc(db, 'pharmacies', pharmacyId);
      const pSnap = await getDoc(pRef);
      if (e.code === 'CREDIT_LIMIT' && pSnap.exists()) {
        const d = pSnap.data();
        const credBal = getCreditBalanceGHS(d);
        const credLim = getCreditLimitGHS(d);
        await notifySuperAdminsPharmacyCreditLimitAttempt(db, {
          pharmacyName: pharmacyDisplayName,
          pharmacyId,
          userName: orderPayload.userName || orderPayload.userEmail || 'User',
          userEmail: orderPayload.userEmail || '',
          orderTotal,
          creditLimitGHS: credLim,
          balanceAfter: credBal + orderTotal,
        });
      }
    }
    throw e;
  }

  return { orderId, displayOrderId };
}
