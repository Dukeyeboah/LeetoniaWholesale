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
  currentMonthKey,
  randomOrderSuffix,
} from '@/lib/pharmacies';
import { transactionReserveLines } from '@/lib/stock-reservation';
import {
  getCreditBalanceGHS,
  getCreditLimitGHS,
  pharmacyRequiresCreditCapacityCheck,
} from '@/lib/pharmacy-credit';

export class PharmacyLimitError extends Error {
  readonly code: 'MONTHLY_LIMIT' | 'CREDIT_LIMIT';

  constructor(code: 'MONTHLY_LIMIT' | 'CREDIT_LIMIT') {
    super(code);
    this.name = 'PharmacyLimitError';
    this.code = code;
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

export async function notifySuperAdminsPharmacyLimitAttempt(
  db: Firestore,
  params: {
    pharmacyName: string;
    pharmacyId: string;
    userName: string;
    userEmail: string;
    orderTotal: number;
    limitGHS: number;
    spentAfter: number;
  }
): Promise<void> {
  try {
    const ids = await getSuperAdminUserIds(db);
    const title = 'Pharmacy monthly limit exceeded';
    const message = `${params.pharmacyName} (${params.pharmacyId}) would exceed its monthly limit of ₵${params.limitGHS.toLocaleString()} with this ₵${params.orderTotal.toFixed(2)} order. Current month spend after this order would be ₵${params.spentAfter.toFixed(2)}. User: ${params.userName} (${params.userEmail}). You can raise the limit under Admin → Pharmacies.`;
    await Promise.all(
      ids.map((userId) =>
        createNotification(userId, 'pharmacy_limit', title, message)
      )
    );
  } catch (e) {
    console.error('notifySuperAdminsPharmacyLimitAttempt', e);
  }
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
 * Atomically checks monthly pharmacy spend, increments spend, and creates the order.
 * Throws PharmacyLimitError if the order would exceed the monthly cap.
 */
export async function placeOrderWithPharmacyLimit(
  params: PlaceOrderWithLimitParams
): Promise<PlaceOrderWithLimitResult> {
  const { db, pharmacyId, pharmacyDisplayName, orderPrefix, orderPayload } =
    params;
  const suffix = randomOrderSuffix(8);
  const displayOrderId = buildDisplayOrderId(orderPrefix, suffix);
  const orderId = buildFirestoreOrderId(orderPrefix, suffix);
  const monthKey = currentMonthKey();
  const orderTotal = orderPayload.total;

  try {
    await runTransaction(db, async (transaction) => {
      const pRef = doc(db, 'pharmacies', pharmacyId);
      const pSnap = await transaction.get(pRef);

      let limitGHS = 50_000;
      let monthSpend = 0;

      if (pSnap.exists()) {
        const d = pSnap.data();
        const raw = Number(d.monthlyLimitGHS);
        if (!Number.isNaN(raw) && raw > 0) {
          limitGHS = raw;
        }
        const docMonth = d.monthKey || monthKey;
        if (docMonth === monthKey) {
          monthSpend = Number(d.monthSpendGHS) || 0;
        } else {
          monthSpend = 0;
        }
      }

      const newSpend = monthSpend + orderTotal;
      if (newSpend > limitGHS) {
        throw new PharmacyLimitError('MONTHLY_LIMIT');
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

      transaction.set(
        pRef,
        {
          name: pharmacyDisplayName,
          monthlyLimitGHS: limitGHS,
          monthSpendGHS: newSpend,
          monthKey,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      await transactionReserveLines(
        db,
        transaction,
        orderPayload.items.map((i) => ({ productId: i.id, qty: i.quantity }))
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
      } else if (e.code === 'MONTHLY_LIMIT') {
        let limitGHS = 50_000;
        let monthSpend = 0;
        if (pSnap.exists()) {
          const d = pSnap.data();
          const raw = Number(d.monthlyLimitGHS);
          if (!Number.isNaN(raw) && raw > 0) {
            limitGHS = raw;
          }
          const docMonth = d.monthKey || monthKey;
          if (docMonth === monthKey) {
            monthSpend = Number(d.monthSpendGHS) || 0;
          }
        }
        const spentAfter = monthSpend + orderTotal;
        await notifySuperAdminsPharmacyLimitAttempt(db, {
          pharmacyName: pharmacyDisplayName,
          pharmacyId,
          userName: orderPayload.userName || orderPayload.userEmail || 'User',
          userEmail: orderPayload.userEmail || '',
          orderTotal,
          limitGHS,
          spentAfter,
        });
      }
    }
    throw e;
  }

  return { orderId, displayOrderId };
}
