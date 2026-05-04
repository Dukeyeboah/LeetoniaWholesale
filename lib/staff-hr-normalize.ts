import type {
  StaffLoanAccount,
  StaffMemberHr,
  StaffLoanDeduction,
  StaffLoanPayment,
  StaffLoanManualSnapshot,
} from '@/types';

export function newStaffEntityId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDeductions(x: unknown): StaffLoanDeduction[] {
  return Array.isArray(x) ? (x as StaffLoanDeduction[]) : [];
}
function normalizePayments(x: unknown): StaffLoanPayment[] {
  return Array.isArray(x) ? (x as StaffLoanPayment[]) : [];
}
function normalizeSnapshots(x: unknown): StaffLoanManualSnapshot[] {
  return Array.isArray(x) ? (x as StaffLoanManualSnapshot[]) : [];
}

function normalizeLoanAccount(raw: Record<string, unknown>): StaffLoanAccount {
  return {
    id: String(raw.id || newStaffEntityId()),
    name: String(raw.name || 'Loan'),
    loanPrincipalGHS:
      typeof raw.loanPrincipalGHS === 'number' ? raw.loanPrincipalGHS : 0,
    loanOutstandingGHS:
      typeof raw.loanOutstandingGHS === 'number' ? raw.loanOutstandingGHS : 0,
    loanDeductions: normalizeDeductions(raw.loanDeductions),
    loanPayments: normalizePayments(raw.loanPayments),
    loanManualSnapshots: normalizeSnapshots(raw.loanManualSnapshots),
    createdAt:
      typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

/**
 * Reads Firestore `staffMembers` docs, including legacy flat loan fields.
 */
export function normalizeStaffMemberHrFromFirestore(
  id: string,
  x: Record<string, unknown>
): StaffMemberHr {
  const base: Omit<StaffMemberHr, 'loanAccounts'> = {
    id,
    name: String(x.name ?? ''),
    role: String(x.role ?? ''),
    phone: String(x.phone ?? ''),
    leavePeriods: Array.isArray(x.leavePeriods) ? x.leavePeriods : [],
    createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
    updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : Date.now(),
    linkedUserId:
      typeof x.linkedUserId === 'string' ? x.linkedUserId : undefined,
  };

  if (Array.isArray(x.loanAccounts) && x.loanAccounts.length > 0) {
    return {
      ...base,
      loanAccounts: (x.loanAccounts as Record<string, unknown>[]).map(
        normalizeLoanAccount
      ),
    };
  }

  const principal =
    typeof x.loanPrincipalGHS === 'number' ? x.loanPrincipalGHS : 0;
  const outstanding =
    typeof x.loanOutstandingGHS === 'number' ? x.loanOutstandingGHS : 0;

  return {
    ...base,
    loanAccounts: [
      {
        id: 'migrated-primary',
        name: 'Primary loan',
        loanPrincipalGHS: principal,
        loanOutstandingGHS: outstanding,
        loanDeductions: normalizeDeductions(x.loanDeductions),
        loanPayments: normalizePayments(x.loanPayments),
        loanManualSnapshots: normalizeSnapshots(x.loanManualSnapshots),
        createdAt: base.createdAt,
      },
    ],
  };
}

export type StaffFullLedgerRow =
  | {
      kind: 'deduction';
      loanId: string;
      loanName: string;
      id: string;
      at: number;
      amount: number;
      note?: string;
    }
  | {
      kind: 'payment';
      loanId: string;
      loanName: string;
      id: string;
      at: number;
      amount: number;
      note?: string;
    }
  | {
      kind: 'book';
      loanId: string;
      loanName: string;
      id: string;
      at: number;
      principal: number;
      outstanding: number;
      note?: string;
    };

export function buildStaffFullLedger(m: StaffMemberHr): StaffFullLedgerRow[] {
  const rows: StaffFullLedgerRow[] = [];
  for (const acct of m.loanAccounts) {
    const { id: loanId, name: loanName } = acct;
    for (const d of acct.loanDeductions) {
      rows.push({
        kind: 'deduction',
        loanId,
        loanName,
        id: d.id,
        at: d.appliedAt,
        amount: d.amountGHS,
        note: d.note,
      });
    }
    for (const p of acct.loanPayments) {
      rows.push({
        kind: 'payment',
        loanId,
        loanName,
        id: p.id,
        at: p.paidAt,
        amount: p.amountGHS,
        note: p.note,
      });
    }
    for (const s of acct.loanManualSnapshots) {
      rows.push({
        kind: 'book',
        loanId,
        loanName,
        id: s.id,
        at: s.recordedAt,
        principal: s.loanPrincipalGHS,
        outstanding: s.loanOutstandingGHS,
        note: s.note,
      });
    }
  }
  rows.sort((a, b) => b.at - a.at);
  return rows;
}

export function hrTotalPrincipalGHS(m: StaffMemberHr): number {
  return m.loanAccounts.reduce((s, a) => s + a.loanPrincipalGHS, 0);
}

export function hrTotalOutstandingGHS(m: StaffMemberHr): number {
  return m.loanAccounts.reduce((s, a) => s + a.loanOutstandingGHS, 0);
}

export function createInitialLoanAccount(
  name: string,
  principalGHS: number
): StaffLoanAccount {
  const now = Date.now();
  return {
    id: newStaffEntityId(),
    name: name.trim() || 'Primary loan',
    loanPrincipalGHS: principalGHS,
    loanOutstandingGHS: principalGHS,
    loanDeductions: [],
    loanPayments: [],
    loanManualSnapshots: [],
    createdAt: now,
  };
}
