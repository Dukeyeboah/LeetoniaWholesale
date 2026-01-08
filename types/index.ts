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
  role: 'admin' | 'client' | 'staff';
  name?: string;
  phone?: string;
  photoURL?: string; // Profile image URL from Google/Gmail
  createdAt: number;
  // Staff-specific permissions (only for staff role)
  permissions?: StaffPermissions;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subCategory?: string; // Optional subcategory for future filtering
  price: number;
  stock: number;
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
  type: 'order_update' | 'order_confirmation' | 'admin_message' | 'system';
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: number;
}
