export interface StaffPermissions {
  canManageInventory: boolean;
  canViewOrders: boolean;
  canUpdateStock: boolean;
  canViewAnalytics: boolean;
  canGenerateInvoices: boolean;
}

/** Payroll / HR record (Firestore `staffMembers`); separate from app `users` role. */
export interface StaffLoanDeduction {
  id: string;
  amountGHS: number;
  appliedAt: number;
  note?: string;
}

export interface StaffLoanPayment {
  id: string;
  amountGHS: number;
  paidAt: number;
  note?: string;
}

export interface StaffLeavePeriod {
  id: string;
  /** Local calendar date YYYY-MM-DD */
  startDate: string;
  endDate: string;
  note?: string;
}

/** Snapshot when principal/outstanding are saved from the manage dialog (audit). */
export interface StaffLoanManualSnapshot {
  id: string;
  recordedAt: number;
  loanPrincipalGHS: number;
  loanOutstandingGHS: number;
  note?: string;
}

/** One named loan bucket per staff member (multiple concurrent loans). */
export interface StaffLoanAccount {
  id: string;
  /** User-facing label, e.g. “Bike”, “Emergency”. */
  name: string;
  loanPrincipalGHS: number;
  loanOutstandingGHS: number;
  loanDeductions: StaffLoanDeduction[];
  loanPayments: StaffLoanPayment[];
  loanManualSnapshots: StaffLoanManualSnapshot[];
  createdAt: number;
}

export interface StaffMemberHr {
  id: string;
  name: string;
  /** Workplace role / title (not the app login role). */
  role: string;
  phone: string;
  /** All loans for this person; migrated from legacy flat fields when missing. */
  loanAccounts: StaffLoanAccount[];
  leavePeriods: StaffLeavePeriod[];
  createdAt: number;
  updatedAt: number;
  /** Optional link to a Firebase Auth user for dashboard access. */
  linkedUserId?: string;
}

export interface User {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'client' | 'staff';
  name?: string;
  phone?: string;
  photoURL?: string; // Profile image URL from Google/Gmail
  /** Primary auth method used when the account was created (phone / password email / Google). */
  signInProvider?: 'phone' | 'email' | 'google';
  createdAt: number;
  /** Workplace title for pharmacy reps (e.g. Pharmacist, Owner). */
  jobRole?: string;
  /** Firestore `pharmacies` document id (seeds or `pharm_added_*` from signup). */
  pharmacyId?: string;
  /** Display name of the pharmacy. */
  pharmacyName?: string;
  /** Pharmacy area / branch (from onboarding; editable on profile). */
  pharmacyLocation?: string;
  /** Pharmacy business phone line (from onboarding; editable on profile). */
  pharmacyPhone?: string;
  /** Set after post-auth onboarding (name, job role, pharmacy). */
  pharmacyProfileComplete?: boolean;
  /**
   * B2B affiliation review after onboarding.
   * Missing on older accounts is treated as approved.
   */
  pharmacyAffiliationStatus?: 'pending' | 'approved' | 'rejected';
  pharmacyAffiliationRequestedAt?: number;
  pharmacyAffiliationReviewedAt?: number;
  // Staff-specific permissions (only for staff role)
  permissions?: StaffPermissions;
}

/** Monthly wholesale spend tracking per pharmacy (Firestore `pharmacies`). */
export interface Pharmacy {
  id: string;
  name: string;
  monthlyLimitGHS: number;
  monthSpendGHS: number;
  /** Calendar month key `YYYY-MM` for which `monthSpendGHS` applies. */
  monthKey: string;
  /** Area / branch (e.g. from cash-customers import). */
  location?: string | null;
  /** Contact phone for the pharmacy (e.g. from cash-customers import). */
  phone?: string | null;
  /** Primary contact / rep name (e.g. from credit-customers import). */
  contactPerson?: string | null;
  /**
   * Billing segment: cash customers typically pay on order; credit customers (future) may run a balance.
   * @see allowsAccountCredit — order flow will use this when credit-customers are imported.
   */
  customerBillingType?: 'cash' | 'credit';
  /**
   * If false, orders should not accrue unpaid balance (cash-in-hand customers).
   * Credit customers will use true with caps enforced elsewhere.
   */
  allowsAccountCredit?: boolean;
  /** Set when a user adds a pharmacy at signup; super admin can clear after review. */
  pendingVerification?: boolean;
  /**
   * Approved account credit ceiling (GHS). Sales on account increase `creditBalanceGHS` until paid.
   * Super admin sets; 0 means no credit capacity check at checkout (still monthly cap applies).
   */
  creditLimitGHS?: number;
  /** Outstanding balance owed on account after completed sales (before payments). */
  creditBalanceGHS?: number;
  source?: 'seed' | 'signup' | 'cash_import' | 'credit_import' | 'admin_created';
  createdByUserId?: string;
  verifiedAt?: number;
  /** @deprecated prefer pendingVerification */
  isCustom?: boolean;
  updatedAt?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subCategory?: string; // Optional subcategory for future filtering
  price: number;
  stock: number;
  /** Shop/front-of-house stock (subset of total). */
  wholesaleStock?: number;
  /** Backroom/warehouse stock (not directly sold). */
  storeroomStock?: number;
  /** Storeroom unit price (GHS); separate from wholesale storefront `price`. */
  storeroomPrice?: number;
  /** Quantity held for open orders (checkout); released on cancel or fulfilled on complete. */
  reservedQty?: number;
  unit: string;
  description?: string;
  imageUrl?: string;
  expiryDate?: number; // Unix timestamp
  code?: string; // Product code
  isHidden?: boolean; // Hide product from customers (soft delete)
  updatedAt: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export type OrderStatus =
  | 'pending'
  | 'proforma_sent'
  | 'client_finalized'
  | 'invoice_sent'
  | 'processing'
  | 'completed'
  | 'cancelled'
  /** @deprecated legacy */
  | 'checking_stock'
  | 'pharmacy_confirmed'
  | 'customer_confirmed';

export interface Order {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  pharmacyId?: string;
  pharmacyName?: string;
  /** Human-readable id, e.g. `Dayben_#kibXANmj` (Firestore doc id stays URL-safe). */
  displayOrderId?: string;
  items: CartItem[];
  status: OrderStatus;
  /** Snapshot of the customer's original cart when they first submitted (optional on older orders). */
  submittedItems?: CartItem[];
  submittedTotal?: number;
  /** Shown to the client with the proforma; encourages quick confirmation. */
  proformaNote?: string;
  proformaSentAt?: number;
  invoiceSentAt?: number;
  /** Sale on account until payment is received. */
  accountingStatus?: 'credit' | 'paid';
  /** Cumulative amount received in GHS (may be partial). */
  amountPaidGHS?: number;
  paymentReceivedAt?: number;
  /** Inventory reservation applied at checkout (new orders only). */
  stockReserved?: boolean;
  total: number;
  deliveryOption?: 'pickup' | 'delivery';
  deliveryAddress?: string;
  deliveryFee?: number;
  paymentMethod?: 'momo' | 'cash' | 'cheque';
  /** Optional contact number for ready-to-collect / delivery coordination. */
  contactPhone?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Log {
  id: string;
  action: string;
  userId: string;
  details: string;
  timestamp: number;
}

/** Admin-managed customer returns (restock into wholesale). */
export interface ProductReturn {
  id: string;
  productId: string;
  productName?: string;
  quantity: number;
  reason?: string;
  status: 'pending' | 'restocked' | 'disposed';
  orderId?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'order_update'
    | 'order_confirmation'
    | 'proforma_ready'
    | 'admin_message'
    | 'system'
    | 'pharmacy_limit';
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: number;
}

/** One line on a port / warehouse receival checklist (expected shipment). */
export interface WarehouseReceivalLine {
  id: string;
  /** Barcode / warehouse product code from the shipment manifest. */
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Checked when the physical item is confirmed on the palette. */
  arrived: boolean;
  arrivedAt?: number;
  /**
   * Count physically received. Omitted when it matches `quantity`.
   * When arrived and this differs from `quantity`, the row is flagged.
   */
  receivedQty?: number;
  notes?: string;
}

/** Monthly warehouse receival checklist (Firestore `warehouseReceivals`). */
export interface WarehouseReceival {
  id: string;
  title: string;
  /** Calendar month key, e.g. `2026-09`. */
  monthKey: string;
  lines: WarehouseReceivalLine[];
  createdAt: number;
  updatedAt: number;
}

/** One product row in a period performance ranking (ITO / qty / value). */
export interface AnalyticsPeriodProductRow {
  rank?: number;
  /** Barcode / product code when known. */
  code?: string;
  name: string;
  /** Inventory turnover rate for the period (ITO list). */
  ito?: number;
  /** Units sold / moved in the period. */
  quantity?: number;
  /** Unit price in GHS when provided. */
  unitPrice?: number;
  /** Sales value / revenue contribution in GHS. */
  value?: number;
  notes?: string;
}

/**
 * Imported / period snapshot for business performance analytics.
 * Populate `data/analytics/period-performance.json` from your yearly lists.
 */
export interface AnalyticsPeriodPerformance {
  id: string;
  title: string;
  /** Inclusive period start YYYY-MM-DD */
  periodStart: string;
  /** Inclusive period end YYYY-MM-DD */
  periodEnd: string;
  currency: 'GHS';
  sourceNote?: string;
  updatedAt?: number | null;
  /** Inventory turnover ranking (higher = turns faster). */
  ito: AnalyticsPeriodProductRow[];
  /** Ranked by units moved; include unitPrice when available. */
  byQuantity: AnalyticsPeriodProductRow[];
  /** Ranked by sales value / revenue. */
  byValue: AnalyticsPeriodProductRow[];
}
