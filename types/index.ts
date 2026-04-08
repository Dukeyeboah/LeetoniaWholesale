export interface StaffPermissions {
  canManageInventory: boolean;
  canViewOrders: boolean;
  canUpdateStock: boolean;
  canViewAnalytics: boolean;
  canGenerateInvoices: boolean;
}

export interface User {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'client' | 'staff';
  name?: string;
  phone?: string;
  photoURL?: string; // Profile image URL from Google/Gmail
  createdAt: number;
  /** Workplace title for pharmacy reps (e.g. Pharmacist, Owner). */
  jobRole?: string;
  /** Firestore `pharmacies` document id (or `custom_*` for user-added). */
  pharmacyId?: string;
  /** Display name of the pharmacy (seed label or custom). */
  pharmacyName?: string;
  /** Set after post-auth onboarding (name, job role, pharmacy). */
  pharmacyProfileComplete?: boolean;
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
  status:
    | 'pending'
    | 'checking_stock'
    | 'pharmacy_confirmed'
    | 'customer_confirmed'
    | 'processing'
    | 'completed'
    | 'cancelled';
  total: number;
  deliveryOption?: 'pickup' | 'delivery';
  deliveryAddress?: string;
  deliveryFee?: number;
  paymentMethod?: 'momo' | 'cash';
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

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'order_update'
    | 'order_confirmation'
    | 'admin_message'
    | 'system'
    | 'pharmacy_limit';
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: number;
}
