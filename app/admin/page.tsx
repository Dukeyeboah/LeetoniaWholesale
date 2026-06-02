'use client';

import { DialogDescription } from '@/components/ui/dialog';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Order, Product, CartItem, StaffMemberHr } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  Trash2,
  Filter,
  Search,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  UserPlus,
  AlertTriangle,
  Download,
  Printer,
  Calendar,
  Building2,
  Camera,
  ChevronDown,
  Sparkles,
  Loader2,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { AdminLoadingPanel } from '@/components/admin-loading-panel';
import { AdminStorefrontInventoryItem } from '@/components/admin-storefront-inventory-item';
import { AdminStoreroomInventoryItem } from '@/components/admin-storeroom-inventory-item';
import { AdminPharmacyMobileCard } from '@/components/admin-pharmacy-mobile-card';
import type { Pharmacy } from '@/types';
import {
  applyCreditBalanceOnOrderCompleted,
  applyPharmacyCreditPaymentDelta,
  creditAvailableGHS,
  effectiveAmountPaidGHS,
  getCreditBalanceGHS,
  getCreditLimitGHS,
  pharmacyUsesCreditLine,
} from '@/lib/pharmacy-credit';
import {
  SEED_PHARMACIES,
  ensurePharmacyDocument,
  currentMonthKey,
  randomOrderSuffix,
  DEFAULT_MONTHLY_LIMIT_GHS,
  DEFAULT_CREDIT_LIMIT_GHS,
} from '@/lib/pharmacies';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import type { User } from '@/types';
import { PRODUCT_CATEGORIES, PRODUCT_SUBCATEGORIES } from '@/lib/categories';
import { createOrderStatusNotification } from '@/lib/notifications';
import { printOrderInvoice } from '@/lib/print-invoice';
import { paymentMethodLabel } from '@/lib/payment-method-label';
import {
  INVENTORY_LETTER_OPTIONS,
  getFirstCharacterGroup,
} from '@/lib/inventory-filters';
import {
  getStoreroomRows,
  filterSortWarehouseRows,
  indexInventoryByProductCode,
  indexInventoryByNormalizedLabel,
  normalizeWarehouseCode,
  resolveWarehouseRowToProduct,
} from '@/lib/warehouse-data';
import { formatOrderLabel } from '@/lib/order-display';
import { generateInventoryProductCode } from '@/lib/product-code';
import {
  DEFAULT_PROFORMA_NOTE,
  notifyClientProformaReady,
  notifyClientInvoiceSent,
} from '@/lib/order-workflow';
import {
  appendReservedDeltaToWriteBatch,
  fulfillReservedForOrder,
  deductWholesaleForCompletedSale,
  maxOrderLineQty,
  releaseReservedForOrder,
  validateItemChangeAgainstStock,
} from '@/lib/stock-reservation';
import {
  availableToSell,
  nextIsHiddenAfterWholesaleChange,
  reservedForOrders,
  wholesaleOnHand,
} from '@/lib/inventory-availability';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  parseLocalYmd,
  totalLeaveDaysInYear,
  leaveDaysInclusive,
} from '@/lib/staff-leave';
import {
  buildStaffFullLedger,
  normalizeStaffMemberHrFromFirestore,
  newStaffEntityId,
  hrTotalOutstandingGHS,
  hrTotalPrincipalGHS,
  createInitialLoanAccount,
} from '@/lib/staff-hr-normalize';

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (c: string) =>
    /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  const text = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printAnalyticsHtml(title: string, bodyHtml: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;padding:16px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ccc;padding:6px;text-align:left;} th{background:#f4f4f4;}</style></head><body>` +
      `<h1>${title}</h1>${bodyHtml}</body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

export default function AdminDashboard() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(true);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('inventory');
  const [manageOrdersPaymentsOpen, setManageOrdersPaymentsOpen] =
    useState(false);
  const [expandedManageOrderIds, setExpandedManageOrderIds] = useState<
    Set<string>
  >(() => new Set());

  // Product Form State
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({
    name: '',
    category: '',
    subCategory: undefined,
    price: 0,
    stock: 0,
    unit: '',
    description: '',
    imageUrl: '',
    expiryDate: undefined,
    code: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const inventoryImageGalleryRef = useRef<HTMLInputElement>(null);
  const inventoryImageCameraRef = useRef<HTMLInputElement>(null);
  const [transferQty, setTransferQty] = useState<number>(0);

  // Order editing state
  const [isOrderEditDialogOpen, setIsOrderEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editedOrderItems, setEditedOrderItems] = useState<CartItem[]>([]);

  // Staff management state
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<import('@/types').StaffPermissions>({
    canManageInventory: false,
    canViewOrders: false,
    canUpdateStock: false,
    canViewAnalytics: false,
    canGenerateInvoices: false,
  });

  const [staffHrMembers, setStaffHrMembers] = useState<StaffMemberHr[]>([]);
  const [expandedHistoryOrderIds, setExpandedHistoryOrderIds] = useState<
    Set<string>
  >(() => new Set());
  const [isStaffHrAddOpen, setIsStaffHrAddOpen] = useState(false);
  const [staffHrAddForm, setStaffHrAddForm] = useState({
    name: '',
    role: '',
    phone: '',
    loanPrincipal: '',
  });
  const [staffHrDraft, setStaffHrDraft] = useState<StaffMemberHr | null>(null);
  const [staffLeaveYear, setStaffLeaveYear] = useState(() =>
    new Date().getFullYear()
  );
  const [newLeaveForm, setNewLeaveForm] = useState({
    start: '',
    end: '',
    note: '',
  });
  const [loanDedForm, setLoanDedForm] = useState({
    amount: '',
    date: '',
    note: '',
  });
  const [loanPayForm, setLoanPayForm] = useState({
    amount: '',
    date: '',
    note: '',
  });
  const [staffActiveLoanId, setStaffActiveLoanId] = useState<string | null>(
    null
  );
  const [isNewStaffLoanOpen, setIsNewStaffLoanOpen] = useState(false);
  const [newStaffLoanForm, setNewStaffLoanForm] = useState({
    name: '',
    amount: '',
  });

  const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
  const [pharmacySegmentFilter, setPharmacySegmentFilter] = useState<
    'all' | 'credit' | 'cash'
  >('all');
  const [pharmacySortMode, setPharmacySortMode] = useState<'default' | 'az'>(
    'default'
  );
  const [pharmacyLetterFilter, setPharmacyLetterFilter] =
    useState<string>('all');

  type PharmacySuperDraft = {
    id: string;
    name: string;
    location: string;
    phone: string;
    contactPerson: string;
    creditLimitGHS: string;
    creditBalanceGHS: string;
    customerBillingType: 'cash' | 'credit';
    allowsAccountCredit: boolean;
    pendingVerification: boolean;
  };
  const [pharmacySuperDraft, setPharmacySuperDraft] =
    useState<PharmacySuperDraft | null>(null);

  const [addPharmacyOpen, setAddPharmacyOpen] = useState(false);
  const [addPharmName, setAddPharmName] = useState('');
  const [addPharmLocation, setAddPharmLocation] = useState('');
  const [addPharmPhone, setAddPharmPhone] = useState('');
  const [addPharmCreditLimit, setAddPharmCreditLimit] = useState(
    String(DEFAULT_CREDIT_LIMIT_GHS)
  );
  const [addPharmBilling, setAddPharmBilling] = useState<'cash' | 'credit'>(
    'cash'
  );
  const [proformaDialogOrder, setProformaDialogOrder] = useState<Order | null>(
    null
  );
  const [proformaNoteDraft, setProformaNoteDraft] = useState('');
  const [sendingProforma, setSendingProforma] = useState(false);

  const [inventoryLetterFilter, setInventoryLetterFilter] = useState<
    (typeof INVENTORY_LETTER_OPTIONS)[number]
  >('all');
  const [inventorySortMode, setInventorySortMode] = useState<
    'default' | 'az' | 'code'
  >('default');
  const [inventoryListMode, setInventoryListMode] = useState<
    'storefront' | 'storeroom'
  >('storefront');
  const [inventoryViewLayout, setInventoryViewLayout] = useState<
    'list' | 'grid'
  >('grid');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] =
    useState<string>('all');
  const [inventorySubCategoryFilter, setInventorySubCategoryFilter] =
    useState<string>('all');
  const [productCountView, setProductCountView] = useState<
    'wholesale' | 'storeroom'
  >('wholesale');
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<Order | null>(
    null
  );
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [directPaymentOrder, setDirectPaymentOrder] = useState<Order | null>(
    null
  );
  const [directPaidInput, setDirectPaidInput] = useState('');

  const sortedInventoryProducts = useMemo(() => {
    const list = [...products];
    if (inventorySortMode === 'az') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else if (inventorySortMode === 'code') {
      list.sort((a, b) =>
        (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })
      );
    }
    return list;
  }, [products, inventorySortMode]);

  const inventoryProductsFiltered = useMemo(() => {
    let list = sortedInventoryProducts;
    if (inventoryLetterFilter !== 'all') {
      list = list.filter(
        (p) => getFirstCharacterGroup(p.name || '') === inventoryLetterFilter
      );
    }
    if (inventoryCategoryFilter !== 'all') {
      list = list.filter((p) => p.category === inventoryCategoryFilter);
    }
    if (inventorySubCategoryFilter !== 'all') {
      list = list.filter((p) => p.subCategory === inventorySubCategoryFilter);
    }
    return list;
  }, [
    sortedInventoryProducts,
    inventoryLetterFilter,
    inventoryCategoryFilter,
    inventorySubCategoryFilter,
  ]);

  const allStoreroomRows = useMemo(() => getStoreroomRows(), []);
  const productsByWarehouseCode = useMemo(
    () => indexInventoryByProductCode(products),
    [products]
  );
  const productsByNormalizedLabel = useMemo(
    () => indexInventoryByNormalizedLabel(products),
    [products]
  );
  const warehouseRowsFiltered = useMemo(
    () =>
      filterSortWarehouseRows(
        allStoreroomRows,
        inventoryLetterFilter,
        inventorySortMode
      ),
    [allStoreroomRows, inventoryLetterFilter, inventorySortMode]
  );

  const wholesaleProductCount = useMemo(
    () => products.filter((p) => !p.isHidden).length,
    [products]
  );
  const storeroomProductCount = useMemo(
    () => products.filter((p) => (p.storeroomStock ?? 0) > 0).length,
    [products]
  );

  const ordersForPaymentsTab = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  useEffect(() => {
    if (!db) {
      setInventoryLoading(false);
      setPharmaciesLoading(false);
      return;
    }

    // Listen to Orders
    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
      },
      (err) => {
        console.error('orders listener', err);
        toast.error(
          'Could not load orders. Check Firestore rules and your connection.'
        );
      }
    );

    // Listen to Inventory
    // const inventoryQuery = query(collection(db, 'inventory'), orderBy('name'));
    const inventoryQuery = query(collection(db, 'inventory'))
    const unsubInventory = onSnapshot(
      inventoryQuery,
      (snapshot) => {
        setProducts(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
        );
        setInventoryLoading(false);
      },
      (err) => {
        console.error('inventory listener', err);
        setInventoryLoading(false);
        toast.error(
          'Could not load inventory. Check Firestore rules and your connection.'
        );
      }
    );

    // Fetch users once
    const fetchUsers = async () => {
      if (!db) return;
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        setUsers(
          usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as User))
        );
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();

    const unsubPharmacies = onSnapshot(
      collection(db, 'pharmacies'),
      (snapshot) => {
        setPharmacies(
          snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as Pharmacy)
          )
        );
        setPharmaciesLoading(false);
      },
      (err) => {
        console.error('pharmacies snapshot', err);
        setPharmaciesLoading(false);
        toast.error('Could not load pharmacies.');
      }
    );

    return () => {
      unsubOrders();
      unsubInventory();
      unsubPharmacies();
    };
  }, []);

  useEffect(() => {
    if (!db || activeTab !== 'pharmacies' || !isSuperAdmin) return;
    (async () => {
      for (const p of SEED_PHARMACIES) {
        try {
          await ensurePharmacyDocument(db, p.id, p.name);
        } catch (e) {
          console.error('seed pharmacy', p.id, e);
        }
      }
    })();
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (!db || !isSuperAdmin) {
      setStaffHrMembers([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'staffMembers'),
      (snapshot) => {
        const list: StaffMemberHr[] = snapshot.docs.map((d) =>
          normalizeStaffMemberHrFromFirestore(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        setStaffHrMembers(list);
      },
      (err) => {
        console.error('staffMembers listener', err);
        toast.error('Could not load staff HR records.');
      }
    );
    return () => unsub();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!staffHrDraft) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    setStaffLeaveYear(new Date().getFullYear());
    setNewLeaveForm({ start: '', end: '', note: '' });
    setLoanDedForm({ amount: '', date: today, note: '' });
    setLoanPayForm({ amount: '', date: today, note: '' });
    setStaffActiveLoanId(staffHrDraft.loanAccounts[0]?.id ?? null);
  }, [staffHrDraft?.id]);

  const openOrderEditDialog = (order: Order) => {
    setEditingOrder(order);
    setEditedOrderItems([...order.items]);
    setIsOrderEditDialogOpen(true);
  };

  const handleSaveOrderEdit = async () => {
    if (!db || !editingOrder) return;

    try {
      const newTotal = editedOrderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const productMap = new Map(products.map((p) => [p.id, p]));
      if (editingOrder.stockReserved) {
        const check = validateItemChangeAgainstStock(
          productMap,
          editingOrder.items,
          editedOrderItems
        );
        if (!check.ok) {
          toast.error(check.message);
          return;
        }
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'orders', editingOrder.id), {
        items: editedOrderItems,
        total: newTotal,
        updatedAt: Date.now(),
      });
      if (editingOrder.stockReserved) {
        appendReservedDeltaToWriteBatch(
          batch,
          db,
          editingOrder.items,
          editedOrderItems
        );
      }
      await batch.commit();

      toast.success('Order updated successfully');
      setIsOrderEditDialogOpen(false);
      setEditingOrder(null);
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const removeItemFromOrder = (itemId: string) => {
    setEditedOrderItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateItemQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setEditedOrderItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const p = products.find((x) => x.id === item.id);
        const cap = p
          ? maxOrderLineQty(p, item.quantity)
          : Math.max(newQuantity, item.quantity);
        const q = Math.min(newQuantity, Math.max(cap, 1));
        return { ...item, quantity: q };
      })
    );
  };

  const handleSaveStaff = async () => {
    if (!db || !editingStaff) {
      // Creating new staff - need email
      toast.error('Please select a user to make staff');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', editingStaff.id), {
        role: 'staff',
        permissions: staffPermissions,
      });
      toast.success('Staff permissions updated');
      setIsStaffDialogOpen(false);
      setEditingStaff(null);
    } catch (error) {
      console.error('Error updating staff:', error);
      toast.error('Failed to update staff permissions');
    }
  };

  const toggleHistoryOrderOpen = (orderId: string, open: boolean) => {
    setExpandedHistoryOrderIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  };

  const resolveStaffLoanId = (draft: StaffMemberHr): string | null => {
    if (!draft.loanAccounts.length) return null;
    if (
      staffActiveLoanId &&
      draft.loanAccounts.some((a) => a.id === staffActiveLoanId)
    ) {
      return staffActiveLoanId;
    }
    return draft.loanAccounts[0].id;
  };

  const handleAddStaffHrSubmit = async () => {
    if (!db) return;
    const name = staffHrAddForm.name.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const principal = parseFloat(
      staffHrAddForm.loanPrincipal.replace(/,/g, '')
    );
    const p = Number.isFinite(principal) && principal >= 0 ? principal : 0;
    try {
      const now = Date.now();
      const initialLoan = createInitialLoanAccount('Primary loan', p);
      const ref = await addDoc(collection(db, 'staffMembers'), {
        name,
        role: staffHrAddForm.role.trim(),
        phone: staffHrAddForm.phone.trim(),
        loanAccounts: [initialLoan],
        leavePeriods: [],
        createdAt: now,
        updatedAt: now,
      });
      const newMember: StaffMemberHr = {
        id: ref.id,
        name,
        role: staffHrAddForm.role.trim(),
        phone: staffHrAddForm.phone.trim(),
        loanAccounts: [initialLoan],
        leavePeriods: [],
        createdAt: now,
        updatedAt: now,
      };
      setStaffHrMembers((prev) => {
        const next = [...prev, newMember];
        next.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        return next;
      });
      toast.success('Team member added');
      setIsStaffHrAddOpen(false);
      setStaffHrAddForm({ name: '', role: '', phone: '', loanPrincipal: '' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to add team member');
    }
  };

  const handleSaveStaffHrDetails = async () => {
    if (!db || !staffHrDraft) return;
    const name = staffHrDraft.name.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const lid = resolveStaffLoanId(staffHrDraft);
    if (!lid) {
      toast.error('No loan account — add a new loan first');
      return;
    }
    const nextAccounts = staffHrDraft.loanAccounts.map((a) => {
      if (a.id !== lid) return a;
      const principal = Math.max(0, a.loanPrincipalGHS);
      const outstanding = Math.max(0, a.loanOutstandingGHS);
      const snapshots = [...a.loanManualSnapshots];
      const last = snapshots[snapshots.length - 1];
      const shouldAppend =
        !last ||
        last.loanPrincipalGHS !== principal ||
        last.loanOutstandingGHS !== outstanding;
      if (shouldAppend) {
        snapshots.push({
          id: newStaffEntityId(),
          recordedAt: Date.now(),
          loanPrincipalGHS: principal,
          loanOutstandingGHS: outstanding,
        });
      }
      return {
        ...a,
        loanPrincipalGHS: principal,
        loanOutstandingGHS: outstanding,
        loanManualSnapshots: snapshots,
      };
    });
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        name,
        role: staffHrDraft.role.trim(),
        phone: staffHrDraft.phone.trim(),
        loanAccounts: nextAccounts,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({
        ...staffHrDraft,
        name,
        role: staffHrDraft.role.trim(),
        phone: staffHrDraft.phone.trim(),
        loanAccounts: nextAccounts,
      });
      toast.success('Details saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    }
  };

  const handleAddStaffLoanAccount = async () => {
    if (!db || !staffHrDraft) return;
    const label = newStaffLoanForm.name.trim();
    if (!label) {
      toast.error('Name this loan (e.g. purpose)');
      return;
    }
    const amt = parseFloat(newStaffLoanForm.amount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error('Enter a valid loan amount');
      return;
    }
    const account = createInitialLoanAccount(label, amt);
    const next = [...staffHrDraft.loanAccounts, account];
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        loanAccounts: next,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({ ...staffHrDraft, loanAccounts: next });
      setStaffActiveLoanId(account.id);
      setIsNewStaffLoanOpen(false);
      setNewStaffLoanForm({ name: '', amount: '' });
      toast.success('New loan added');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add loan');
    }
  };

  const handleAddStaffLeavePeriod = async () => {
    if (!db || !staffHrDraft) return;
    const { start, end, note } = newLeaveForm;
    if (!start || !end) {
      toast.error('Start and end dates are required');
      return;
    }
    if (parseLocalYmd(end) < parseLocalYmd(start)) {
      toast.error('End date must be on or after start date');
      return;
    }
    const id = newStaffEntityId();
    const periods = [
      ...staffHrDraft.leavePeriods,
      {
        id,
        startDate: start,
        endDate: end,
        note: note.trim() || undefined,
      },
    ];
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        leavePeriods: periods,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({ ...staffHrDraft, leavePeriods: periods });
      setNewLeaveForm({ start: '', end: '', note: '' });
      toast.success('Leave period added');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add leave');
    }
  };

  const handleRemoveStaffLeavePeriod = async (periodId: string) => {
    if (!db || !staffHrDraft) return;
    const periods = staffHrDraft.leavePeriods.filter((p) => p.id !== periodId);
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        leavePeriods: periods,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({ ...staffHrDraft, leavePeriods: periods });
      toast.success('Leave period removed');
    } catch (e) {
      console.error(e);
      toast.error('Failed to remove leave');
    }
  };

  const ymdToLocalStartMs = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
    if (!y || !m || !d) return Date.now();
    return new Date(y, m - 1, d).getTime();
  };

  const handleRecordLoanDeduction = async () => {
    if (!db || !staffHrDraft) return;
    const lid = resolveStaffLoanId(staffHrDraft);
    if (!lid) {
      toast.error('Select a loan');
      return;
    }
    const amt = parseFloat(loanDedForm.amount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid deduction amount');
      return;
    }
    if (!loanDedForm.date) {
      toast.error('Choose the deduction date');
      return;
    }
    const appliedAt = ymdToLocalStartMs(loanDedForm.date);
    const row = {
      id: newStaffEntityId(),
      amountGHS: amt,
      appliedAt,
      note: loanDedForm.note.trim() || undefined,
    };
    const nextAccounts = staffHrDraft.loanAccounts.map((a) => {
      if (a.id !== lid) return a;
      return {
        ...a,
        loanDeductions: [...a.loanDeductions, row],
        loanOutstandingGHS: Math.max(0, a.loanOutstandingGHS - amt),
      };
    });
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        loanAccounts: nextAccounts,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({ ...staffHrDraft, loanAccounts: nextAccounts });
      setLoanDedForm({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        note: '',
      });
      toast.success('Deduction recorded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to record deduction');
    }
  };

  const handleRecordLoanPayment = async () => {
    if (!db || !staffHrDraft) return;
    const lid = resolveStaffLoanId(staffHrDraft);
    if (!lid) {
      toast.error('Select a loan');
      return;
    }
    const amt = parseFloat(loanPayForm.amount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (!loanPayForm.date) {
      toast.error('Choose the payment date');
      return;
    }
    const paidAt = ymdToLocalStartMs(loanPayForm.date);
    const row = {
      id: newStaffEntityId(),
      amountGHS: amt,
      paidAt,
      note: loanPayForm.note.trim() || undefined,
    };
    const nextAccounts = staffHrDraft.loanAccounts.map((a) => {
      if (a.id !== lid) return a;
      return {
        ...a,
        loanPayments: [...a.loanPayments, row],
        loanOutstandingGHS: Math.max(0, a.loanOutstandingGHS - amt),
      };
    });
    try {
      await updateDoc(doc(db, 'staffMembers', staffHrDraft.id), {
        loanAccounts: nextAccounts,
        updatedAt: Date.now(),
      });
      setStaffHrDraft({ ...staffHrDraft, loanAccounts: nextAccounts });
      setLoanPayForm({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        note: '',
      });
      toast.success('Payment recorded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to record payment');
    }
  };

  const handleDeleteStaffHr = async () => {
    if (!db || !staffHrDraft) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Remove HR record for "${staffHrDraft.name}"? This does not delete their login account.`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'staffMembers', staffHrDraft.id));
      toast.success('Staff record removed');
      setStaffHrDraft(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to remove record');
    }
  };

  const generateInvoice = (order: Order) => {
    printOrderInvoice(order);
    toast.success('Invoice PDF download started');
  };

  const saveDirectPaidAmount = async () => {
    if (!db || !directPaymentOrder) return;
    const grand =
      directPaymentOrder.total + (directPaymentOrder.deliveryFee || 0);
    const paid = parseFloat(directPaidInput.replace(/,/g, ''));
    if (Number.isNaN(paid) || paid < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const clamped = Math.min(grand, paid);
    const fullyPaid = clamped >= grand - 0.0001;
    try {
      await updateDoc(doc(db, 'orders', directPaymentOrder.id), {
        amountPaidGHS: clamped,
        accountingStatus: fullyPaid ? 'paid' : 'credit',
        ...(fullyPaid ? { paymentReceivedAt: Date.now() } : {}),
        updatedAt: Date.now(),
      });
      if (
        directPaymentOrder.status === 'completed' &&
        directPaymentOrder.pharmacyId
      ) {
        const oldPaid = effectiveAmountPaidGHS(directPaymentOrder);
        const delta = clamped - oldPaid;
        if (delta > 1e-6) {
          await applyPharmacyCreditPaymentDelta(
            db,
            directPaymentOrder.pharmacyId,
            delta
          );
        }
      }
      toast.success('Payment amounts updated');
      setDirectPaymentOrder(null);
      setDirectPaidInput('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    }
  };

  const openDirectPaymentAdjust = (order: Order) => {
    const grand = order.total + (order.deliveryFee || 0);
    const paid =
      order.accountingStatus === 'paid' &&
      (order.amountPaidGHS == null || order.amountPaidGHS === undefined)
        ? grand
        : (order.amountPaidGHS ?? 0);
    setDirectPaymentOrder(order);
    setDirectPaidInput(paid.toFixed(2));
  };

  const promptCancelOrder = (order: Order) => {
    if (
      !window.confirm(
        `Cancel order ${formatOrderLabel(order)}? Reserved stock will be released if applicable.`
      )
    ) {
      return;
    }
    void updateOrderStatus(order.id, 'cancelled');
  };

  const updateOrderStatus = async (
    orderId: string,
    newStatus: Order['status']
  ) => {
    if (!db) {
      toast.error('Database not available');
      return;
    }
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        toast.error('Order not found');
        return;
      }

      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Date.now(),
        ...(newStatus === 'proforma_sent' && order.status !== 'proforma_sent'
          ? {
              proformaSentAt: Date.now(),
              proformaNote: order.proformaNote || DEFAULT_PROFORMA_NOTE,
            }
          : {}),
        ...(newStatus === 'invoice_sent' && order.status !== 'invoice_sent'
          ? { invoiceSentAt: Date.now() }
          : {}),
      });

      if (newStatus === 'completed' && order.status !== 'completed') {
        try {
          await applyCreditBalanceOnOrderCompleted(db, {
            ...order,
            status: 'completed',
          });
        } catch (crErr) {
          console.error(crErr);
          toast.error(
            'Order completed, but pharmacy credit balance may be out of sync — check Pharmacies tab.'
          );
        }
      }

      if (order.stockReserved) {
        try {
          if (newStatus === 'cancelled' && order.status !== 'cancelled') {
            await releaseReservedForOrder(db, order.items);
          } else if (
            newStatus === 'completed' &&
            order.status !== 'completed'
          ) {
            await fulfillReservedForOrder(db, order.items);
          }
        } catch (stockErr) {
          console.error(stockErr);
          toast.error(
            'Status saved, but inventory did not sync — check stock and reservations in Inventory.'
          );
        }
      } else if (
        newStatus === 'completed' &&
        order.status !== 'completed' &&
        order.items?.length
      ) {
        try {
          await deductWholesaleForCompletedSale(db, order.items);
        } catch (stockErr) {
          console.error(stockErr);
          toast.error(
            'Order completed, but wholesale stock may not have decreased — check Inventory.'
          );
        }
      }

      if (order.userId) {
        if (
          newStatus === 'proforma_sent' &&
          order.status !== 'proforma_sent'
        ) {
          await notifyClientProformaReady(db, order);
        } else if (
          newStatus === 'invoice_sent' &&
          order.status !== 'invoice_sent'
        ) {
          await notifyClientInvoiceSent(db, order);
        } else if (
          newStatus !== 'proforma_sent' &&
          newStatus !== 'invoice_sent'
        ) {
          await createOrderStatusNotification(
            order.userId,
            orderId,
            newStatus,
            order.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
            })),
            order.displayOrderId,
            order.deliveryOption
          );
        }
      }

      toast.success(`Order status updated`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleConfirmSendProforma = async () => {
    if (!db || !proformaDialogOrder) return;
    setSendingProforma(true);
    try {
      await updateDoc(doc(db, 'orders', proformaDialogOrder.id), {
        status: 'proforma_sent',
        proformaNote: proformaNoteDraft.trim() || DEFAULT_PROFORMA_NOTE,
        proformaSentAt: Date.now(),
        updatedAt: Date.now(),
      });
      await notifyClientProformaReady(db, proformaDialogOrder);
      toast.success('Proforma sent to customer');
      setProformaDialogOrder(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to send proforma');
    } finally {
      setSendingProforma(false);
    }
  };

  const submitPaymentRecording = async () => {
    if (!db || !paymentDialogOrder) return;
    const grand =
      paymentDialogOrder.total + (paymentDialogOrder.deliveryFee || 0);
    const paidSoFar =
      paymentDialogOrder.accountingStatus === 'paid' &&
      (paymentDialogOrder.amountPaidGHS == null ||
        paymentDialogOrder.amountPaidGHS === undefined)
        ? grand
        : (paymentDialogOrder.amountPaidGHS ?? 0);
    const add = parseFloat(paymentAmountInput.replace(/,/g, ''));
    if (Number.isNaN(add) || add <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    const newPaid = Math.min(grand, paidSoFar + add);
    const fullyPaid = newPaid >= grand - 0.0001;
    try {
      await updateDoc(doc(db, 'orders', paymentDialogOrder.id), {
        amountPaidGHS: newPaid,
        accountingStatus: fullyPaid ? 'paid' : 'credit',
        ...(fullyPaid ? { paymentReceivedAt: Date.now() } : {}),
        updatedAt: Date.now(),
      });
      if (
        paymentDialogOrder.status === 'completed' &&
        paymentDialogOrder.pharmacyId
      ) {
        const delta = newPaid - paidSoFar;
        if (delta > 1e-6) {
          await applyPharmacyCreditPaymentDelta(
            db,
            paymentDialogOrder.pharmacyId,
            delta
          );
        }
      }
      toast.success(
        fullyPaid ? 'Order marked fully paid' : 'Partial payment recorded'
      );
      setPaymentDialogOrder(null);
      setPaymentAmountInput('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to record payment');
    }
  };

  const MAX_INVENTORY_IMAGE_BYTES = 5 * 1024 * 1024;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, WebP, etc.).');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_INVENTORY_IMAGE_BYTES) {
      toast.error('Image must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearSelectedImage = () => {
    setImageFile(null);
    setImagePreview(productForm.imageUrl || null);
    if (inventoryImageGalleryRef.current) {
      inventoryImageGalleryRef.current.value = '';
    }
    if (inventoryImageCameraRef.current) {
      inventoryImageCameraRef.current.value = '';
    }
  };

  const handleSaveProduct = async () => {
    if (!db) {
      toast.error('Database not available');
      return;
    }

    try {
      let imageUrl = productForm.imageUrl || '';

      // Upload image if a new file is selected
      if (imageFile && storage) {
        setUploadingImage(true);
        try {
          const rawExt = (imageFile.name.split('.').pop() || 'jpg')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const fileExtension =
            rawExt && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt)
              ? rawExt === 'jpeg'
                ? 'jpg'
                : rawExt
              : 'jpg';
          const slug = (productForm.name || 'product')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 40);
          const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          const folder = editingProduct?.id || `new_${unique}`;
          const fileName = `${slug || 'image'}_${unique}.${fileExtension}`;
          const imageRef = ref(
            storage,
            `inventoryImages/products/${folder}/${fileName}`
          );

          const contentType =
            imageFile.type ||
            (fileExtension === 'png'
              ? 'image/png'
              : fileExtension === 'gif'
                ? 'image/gif'
                : fileExtension === 'webp'
                  ? 'image/webp'
                  : 'image/jpeg');
          await uploadBytes(imageRef, imageFile, { contentType });
          imageUrl = await getDownloadURL(imageRef);
          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('Error uploading image:', error);
          const code =
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code?: string }).code)
              : '';
          toast.error(
            code === 'storage/unauthorized'
              ? 'Storage denied this upload. Sign in as admin/super_admin and ensure storage.rules are published (firebase deploy --only storage).'
              : `Failed to upload image${code ? ` (${code})` : ''}. Check Storage rules and your connection.`
          );
          setUploadingImage(false);
          return;
        } finally {
          setUploadingImage(false);
        }
      }

      const productData = {
        ...productForm,
        imageUrl: imageUrl || productForm.imageUrl,
        updatedAt: Date.now(),
      };

      if (!editingProduct) {
        const trimmedCode = String(productForm.code ?? '').trim();
        productData.code = trimmedCode || generateInventoryProductCode();
      }

      // Keep legacy `stock` in sync with wholesale stock for customer-facing views
      if (typeof (productData as any).wholesaleStock === 'number') {
        (productData as any).stock = (productData as any).wholesaleStock;
      }

      const newWs = Math.max(
        0,
        Number(
          (productData as { wholesaleStock?: number; stock?: number })
            .wholesaleStock ??
            (productData as { stock?: number }).stock ??
            0
        )
      );
      const prevWs = editingProduct ? wholesaleOnHand(editingProduct) : 0;
      const prevHidden = editingProduct?.isHidden ?? false;
      (productData as { isHidden?: boolean }).isHidden =
        nextIsHiddenAfterWholesaleChange(prevWs, newWs, prevHidden);

      // Remove undefined fields
      Object.keys(productData).forEach((key) => {
        if (productData[key as keyof typeof productData] === undefined) {
          delete productData[key as keyof typeof productData];
        }
      });

      if (editingProduct) {
        await updateDoc(doc(db, 'inventory', editingProduct.id), productData);
        toast.success('Product updated');
      } else {
        await addDoc(collection(db, 'inventory'), productData);
        toast.success('Product added');
      }
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      setImageFile(null);
      setImagePreview(null);
      setProductForm({
        name: '',
        category: '',
        subCategory: undefined,
        price: 0,
        stock: 0,
        wholesaleStock: 0,
        storeroomStock: 0,
        unit: '',
        description: '',
        imageUrl: '',
        expiryDate: undefined,
        code: generateInventoryProductCode(),
      });
      setTransferQty(0);
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product');
    }
  };

  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    open: boolean;
    productId: string | null;
    productName: string;
  }>({ open: false, productId: null, productName: '' });

  const handleDeleteProduct = async (id: string) => {
    const product = products.find((p) => p.id === id);
    if (product) {
      setDeleteConfirmDialog({
        open: true,
        productId: id,
        productName: product.name,
      });
    }
  };

  const confirmDeleteProduct = async () => {
    if (!db || !deleteConfirmDialog.productId) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'inventory', deleteConfirmDialog.productId));
      toast.success('Product deleted permanently');
      setDeleteConfirmDialog({ open: false, productId: null, productName: '' });
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleToggleProductVisibility = async (product: Product) => {
    if (!db) {
      toast.error('Database not available');
      return;
    }
    try {
      const isHidden = product.isHidden || false;
      if (isHidden && wholesaleOnHand(product) <= 0) {
        toast.error(
          'Add wholesale (storefront) stock before showing this product to customers.'
        );
        return;
      }
      await updateDoc(doc(db, 'inventory', product.id), {
        isHidden: !isHidden,
        updatedAt: Date.now(),
      });
      toast.success(
        !isHidden
          ? 'Product hidden from customers'
          : 'Product made visible to customers'
      );
    } catch (error) {
      console.error('Error toggling product visibility:', error);
      toast.error('Failed to update product visibility');
    }
  };

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      const wholesaleStock = product.wholesaleStock ?? product.stock ?? 0;
      const storeroomStock = product.storeroomStock ?? 0;
      setProductForm({ ...product, wholesaleStock, storeroomStock, stock: wholesaleStock });
      setImagePreview(product.imageUrl || null);
      setImageFile(null);
      setTransferQty(0);
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        category: '',
        subCategory: undefined,
        price: 0,
        stock: 0,
        wholesaleStock: 0,
        storeroomStock: 0,
        unit: '',
        description: '',
        imageUrl: '',
        expiryDate: undefined,
        code: generateInventoryProductCode(),
      });
      setImagePreview(null);
      setImageFile(null);
      setTransferQty(0);
    }
    setIsProductDialogOpen(true);
  };

  const orderMatchesSearch = (order: Order) =>
    !searchQuery ||
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.items.some((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  /** Manage Orders tab: status only (History tab owns client/product filters). */
  const filteredOrdersManage = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus =
          statusFilter === 'all' || order.status === statusFilter;
        return matchesStatus && orderMatchesSearch(order);
      }),
    [orders, statusFilter, searchQuery]
  );

  /** Order History tab: status + client + product + search. */
  const filteredOrdersHistory = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus =
          statusFilter === 'all' || order.status === statusFilter;
        const matchesUser = userFilter === 'all' || order.userId === userFilter;
        const matchesProduct =
          productFilter === 'all' ||
          order.items.some(
            (item) =>
              item.id === productFilter ||
              item.name.toLowerCase().includes(productFilter.toLowerCase())
          );
        return (
          matchesStatus &&
          matchesUser &&
          matchesProduct &&
          orderMatchesSearch(order)
        );
      }),
    [orders, statusFilter, userFilter, productFilter, searchQuery]
  );

  const staffFullLedger = useMemo(
    () => (staffHrDraft ? buildStaffFullLedger(staffHrDraft) : []),
    [staffHrDraft]
  );

  const staffHrActiveLoan = useMemo(() => {
    if (!staffHrDraft || !staffHrDraft.loanAccounts.length) return null;
    const id =
      staffActiveLoanId &&
      staffHrDraft.loanAccounts.some((a) => a.id === staffActiveLoanId)
        ? staffActiveLoanId
        : staffHrDraft.loanAccounts[0].id;
    return staffHrDraft.loanAccounts.find((a) => a.id === id) ?? null;
  }, [staffHrDraft, staffActiveLoanId]);

  /** Revenue & units sold: recognized when orders are completed (aligns with stock out). */
  const analyticsOrderIncluded = (o: Order) => o.status === 'completed';

  const [analyticsTopSort, setAnalyticsTopSort] = useState<
    'quantity' | 'revenue'
  >('quantity');
  const [analyticsTopOffset, setAnalyticsTopOffset] = useState(0);
  const [analyticsLeastOffset, setAnalyticsLeastOffset] = useState(0);

  useEffect(() => {
    setAnalyticsTopOffset(0);
  }, [analyticsTopSort]);

  // Analytics calculations
  const productSales = useMemo(
    () =>
      products.map((product) => {
        const soldQuantity = orders
          .filter(analyticsOrderIncluded)
          .reduce((sum, order) => {
            const item = order.items.find((i) => i.id === product.id);
            return sum + (item ? item.quantity : 0);
          }, 0);
        const revenue = orders
          .filter(analyticsOrderIncluded)
          .reduce((sum, order) => {
            const item = order.items.find((i) => i.id === product.id);
            return sum + (item ? item.price * item.quantity : 0);
          }, 0);
        return { product, soldQuantity, revenue };
      }),
    [products, orders]
  );

  const topSellingRanked = useMemo(() => {
    const withSales = productSales.filter((p) => p.soldQuantity > 0);
    const byQuantity = [...withSales]
      .sort((a, b) => b.soldQuantity - a.soldQuantity)
      .slice(0, 100);
    const byRevenue = [...withSales]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100);
    return { byQuantity, byRevenue };
  }, [productSales]);

  const topSellingProductsList =
    analyticsTopSort === 'quantity'
      ? topSellingRanked.byQuantity
      : topSellingRanked.byRevenue;

  const topSellingPage = topSellingProductsList.slice(
    analyticsTopOffset,
    analyticsTopOffset + 50
  );

  const leastSellingProducts = useMemo(
    () =>
      [...productSales].filter((p) => p.soldQuantity === 0).slice(0, 100),
    [productSales]
  );

  const leastSellingPage = leastSellingProducts.slice(
    analyticsLeastOffset,
    analyticsLeastOffset + 50
  );

  const analyticsExpiring1Mo = useMemo(
    () =>
      products.filter((p) => {
        if (!p.expiryDate) return false;
        const expiry = new Date(p.expiryDate);
        const oneMonthFromNow = new Date();
        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
        return expiry <= oneMonthFromNow && expiry > new Date();
      }),
    [products]
  );

  const analyticsExpiring3Mo = useMemo(
    () =>
      products.filter((p) => {
        if (!p.expiryDate) return false;
        const expiry = new Date(p.expiryDate);
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        return (
          expiry <= threeMonthsFromNow &&
          expiry > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        );
      }),
    [products]
  );

  const analyticsExpiring6Mo = useMemo(
    () =>
      products.filter((p) => {
        if (!p.expiryDate) return false;
        const expiry = new Date(p.expiryDate);
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        return (
          expiry <= sixMonthsFromNow &&
          expiry > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        );
      }),
    [products]
  );

  const totalRevenue = orders
    .filter(analyticsOrderIncluded)
    .reduce((sum, order) => sum + order.total + (order.deliveryFee || 0), 0);

  const pendingOrders = orders.filter(
    (o) => o.status !== 'completed' && o.status !== 'cancelled'
  );
  const completedOrders = orders.filter((o) => o.status === 'completed');

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || 'Unknown User';
  };

  const filteredPharmacies = useMemo(() => {
    let list = pharmacies.filter((p) => {
      const q = pharmacySearchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.contactPerson?.toLowerCase().includes(q) ?? false)
      );
    });
    if (pharmacySegmentFilter === 'credit') {
      list = list.filter((p) => pharmacyUsesCreditLine(p));
    } else if (pharmacySegmentFilter === 'cash') {
      list = list.filter((p) => !pharmacyUsesCreditLine(p));
    }
    if (pharmacyLetterFilter !== 'all') {
      list = list.filter(
        (p) => getFirstCharacterGroup(p.name) === pharmacyLetterFilter
      );
    }
    if (pharmacySortMode === 'az') {
      list = [...list].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    }
    return list;
  }, [
    pharmacies,
    pharmacySearchQuery,
    pharmacySegmentFilter,
    pharmacyLetterFilter,
    pharmacySortMode,
  ]);

  const openPharmacySuperEdit = (p: Pharmacy) => {
    const isCredit = pharmacyUsesCreditLine(p);
    setPharmacySuperDraft({
      id: p.id,
      name: p.name,
      location: p.location ?? '',
      phone: p.phone ?? '',
      contactPerson: p.contactPerson ?? '',
      creditLimitGHS: String(
        isCredit
          ? p.creditLimitGHS != null && p.creditLimitGHS > 0
            ? p.creditLimitGHS
            : DEFAULT_CREDIT_LIMIT_GHS
          : 0
      ),
      creditBalanceGHS: String(p.creditBalanceGHS ?? 0),
      customerBillingType:
        p.customerBillingType === 'credit' ? 'credit' : 'cash',
      allowsAccountCredit: p.allowsAccountCredit === true,
      pendingVerification: p.pendingVerification === true,
    });
  };

  const handleSavePharmacySuperEdit = async () => {
    if (!db || !pharmacySuperDraft || !isAdmin) return;
    const name = pharmacySuperDraft.name.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const credLim = parseFloat(
      pharmacySuperDraft.creditLimitGHS.replace(/,/g, '')
    );
    const credBal = parseFloat(
      pharmacySuperDraft.creditBalanceGHS.replace(/,/g, '')
    );
    if ([credLim, credBal].some((n) => Number.isNaN(n) || n < 0)) {
      toast.error('Enter valid non-negative numbers');
      return;
    }
    const allowCredit =
      pharmacySuperDraft.customerBillingType === 'credit' &&
      pharmacySuperDraft.allowsAccountCredit;
    const billing: 'cash' | 'credit' = allowCredit ? 'credit' : 'cash';
    try {
      await updateDoc(doc(db, 'pharmacies', pharmacySuperDraft.id), {
        name,
        location: pharmacySuperDraft.location.trim() || null,
        phone: pharmacySuperDraft.phone.trim() || null,
        contactPerson: pharmacySuperDraft.contactPerson.trim() || null,
        customerBillingType: billing,
        allowsAccountCredit: allowCredit,
        creditLimitGHS: allowCredit ? credLim : 0,
        creditBalanceGHS: allowCredit ? credBal : 0,
        pendingVerification: pharmacySuperDraft.pendingVerification,
        ...(!pharmacySuperDraft.pendingVerification
          ? { verifiedAt: Date.now() }
          : {}),
        updatedAt: Date.now(),
      });
      toast.success('Pharmacy updated');
      setPharmacySuperDraft(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update pharmacy');
    }
  };

  const handleDeletePharmacy = async (p: Pharmacy) => {
    if (!db || !isSuperAdmin) return;
    if (
      !window.confirm(
        `Delete pharmacy “${p.name}” (${p.id})? Accounts using this pharmacy id may need to be reassigned.`
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'pharmacies', p.id));
      toast.success('Pharmacy deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete pharmacy');
    }
  };

  const handleAddPharmacySubmit = async () => {
    if (!db || !isSuperAdmin) return;
    const name = addPharmName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    const credLim = parseFloat(addPharmCreditLimit.replace(/,/g, ''));
    if (addPharmBilling === 'credit' && (Number.isNaN(credLim) || credLim < 0)) {
      toast.error('Enter a valid account credit limit');
      return;
    }
    const allowCredit = addPharmBilling === 'credit';
    try {
      const id = `pharm_super_${randomOrderSuffix(10)}`;
      await setDoc(doc(db, 'pharmacies', id), {
        name,
        location: addPharmLocation.trim() || null,
        phone: addPharmPhone.trim() || null,
        monthlyLimitGHS: DEFAULT_MONTHLY_LIMIT_GHS,
        monthSpendGHS: 0,
        monthKey: currentMonthKey(),
        customerBillingType: addPharmBilling,
        allowsAccountCredit: allowCredit,
        creditLimitGHS: allowCredit ? credLim : 0,
        creditBalanceGHS: 0,
        pendingVerification: false,
        verifiedAt: Date.now(),
        source: 'admin_created',
        updatedAt: Date.now(),
      });
      toast.success('Pharmacy added');
      setAddPharmacyOpen(false);
      setAddPharmName('');
      setAddPharmLocation('');
      setAddPharmPhone('');
      setAddPharmCreditLimit(String(DEFAULT_CREDIT_LIMIT_GHS));
      setAddPharmBilling('cash');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add pharmacy');
    }
  };

  const handleVerifyPharmacy = async (p: Pharmacy) => {
    if (!db || !isAdmin) return;
    try {
      await updateDoc(doc(db, 'pharmacies', p.id), {
        pendingVerification: false,
        verifiedAt: Date.now(),
        updatedAt: Date.now(),
      });
      toast.success('Pharmacy marked verified');
    } catch (error) {
      console.error('Error verifying pharmacy:', error);
      toast.error('Failed to update pharmacy');
    }
  };

  return (
    <div className='space-y-6 sm:space-y-8 w-full min-w-0 max-w-full overflow-x-hidden'>
      <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-3'>
        <h1 className='text-2xl sm:text-3xl font-serif font-bold text-primary'>
          Admin Dashboard
        </h1>
        <div className='flex gap-2 shrink-0'>
          <Button
            onClick={() => openProductDialog()}
            className='w-full sm:w-auto'
            size='sm'
          >
            <Plus className='mr-2 h-4 w-4 shrink-0' /> Add Product
          </Button>
        </div>
      </div>

      <div className='grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4'>
        <Card
          className='cursor-pointer hover:shadow-md transition-shadow'
          onClick={() => {
            setStatusFilter('pending');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-yellow-600'>
              {orders.filter((o) => o.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card
          className='cursor-pointer hover:shadow-md transition-shadow'
          onClick={() => {
            setStatusFilter('proforma_sent');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Proforma with customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {orders.filter((o) => o.status === 'proforma_sent').length}
            </div>
          </CardContent>
        </Card>
        <Card
          className='cursor-pointer hover:shadow-md transition-shadow'
          onClick={() => {
            setStatusFilter('client_finalized');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Awaiting invoice / packing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {orders.filter((o) => o.status === 'client_finalized').length}
            </div>
          </CardContent>
        </Card>
        <Card
          className='cursor-pointer hover:shadow-md transition-shadow'
          onClick={() => {
            setStatusFilter('processing');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-purple-600'>
              {orders.filter((o) => o.status === 'processing').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Completed Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {
                orders.filter(
                  (o) =>
                    o.status === 'completed' &&
                    new Date(o.updatedAt).toDateString() ===
                      new Date().toDateString()
                ).length
              }
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Low Stock Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-yellow-600'>
              {products.filter((p) => p.stock < 10).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total Products
            </CardTitle>
            <div className='flex gap-1 pt-1'>
              <Button
                type='button'
                size='sm'
                variant={
                  productCountView === 'wholesale' ? 'default' : 'outline'
                }
                className='h-7 px-2 text-xs'
                onClick={() => setProductCountView('wholesale')}
              >
                Wholesale
              </Button>
              <Button
                type='button'
                size='sm'
                variant={
                  productCountView === 'storeroom' ? 'default' : 'outline'
                }
                className='h-7 px-2 text-xs'
                onClick={() => setProductCountView('storeroom')}
              >
                Storeroom
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {productCountView === 'wholesale'
                ? wholesaleProductCount
                : storeroomProductCount}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              {productCountView === 'wholesale'
                ? 'Visible on storefront (not hidden)'
                : 'With storeroom / warehouse stock on hand'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full min-w-0 max-w-full overflow-x-hidden'>
        <TabsList className='w-full justify-start h-auto min-h-11 bg-muted/50 p-1 flex flex-wrap gap-1'>
          <TabsTrigger
            value='inventory'
            className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
          >
            Manage Inventory
          </TabsTrigger>
          <TabsTrigger
            value='orders'
            className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
          >
            Manage Orders
          </TabsTrigger>
          <TabsTrigger
            value='history'
            className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
          >
            Order History
          </TabsTrigger>
          <TabsTrigger
            value='analytics'
            className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
          >
            Analytics
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger
              value='staff'
              className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
            >
              Staff
            </TabsTrigger>
          )}
          <TabsTrigger
            value='pharmacies'
            className='h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm shrink-0'
          >
            <Building2 className='inline h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 align-text-bottom' />
            Pharmacies
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value='orders'
          className='mt-6 space-y-6 w-full min-w-0 max-w-full overflow-x-hidden'
        >
          {/* Status Filter Tabs */}
          <div className='flex flex-wrap gap-2 border-b pb-4'>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size='sm'
              className='text-xs sm:text-sm'
              onClick={() => setStatusFilter('all')}
            >
              All Orders ({orders.length})
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({orders.filter((o) => o.status === 'pending').length})
            </Button>
            <Button
              variant={
                statusFilter === 'proforma_sent' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('proforma_sent')}
            >
              Proforma sent (
              {orders.filter((o) => o.status === 'proforma_sent').length})
            </Button>
            <Button
              variant={
                statusFilter === 'client_finalized' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('client_finalized')}
            >
              Client finalized (
              {orders.filter((o) => o.status === 'client_finalized').length})
            </Button>
            <Button
              variant={
                statusFilter === 'invoice_sent' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('invoice_sent')}
            >
              Invoice sent (
              {orders.filter((o) => o.status === 'invoice_sent').length})
            </Button>
            <Button
              variant={statusFilter === 'processing' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('processing')}
            >
              Processing (
              {orders.filter((o) => o.status === 'processing').length})
            </Button>
            <Button
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('completed')}
            >
              Completed ({orders.filter((o) => o.status === 'completed').length}
              )
            </Button>
            <Button
              variant={statusFilter === 'cancelled' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('cancelled')}
            >
              Cancelled ({orders.filter((o) => o.status === 'cancelled').length}
              )
            </Button>
          </div>

          <Collapsible
            open={manageOrdersPaymentsOpen}
            onOpenChange={setManageOrdersPaymentsOpen}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type='button'
                  className='flex w-full items-start gap-3 p-6 text-left hover:bg-muted/40 rounded-t-xl transition-colors'
                >
                  <ChevronDown
                    className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                      manageOrdersPaymentsOpen ? 'rotate-180' : ''
                    }`}
                  />
                  <div className='min-w-0 flex-1'>
                    <CardTitle className='text-base'>Order payments</CardTitle>
                    <CardDescription className='mt-1'>
                      Set the total amount received per order. Paid and balance
                      update for the client as soon as you save.
                    </CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className='space-y-2 max-h-[70vh] overflow-y-auto pt-0'>
                  {ordersForPaymentsTab.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>No orders yet.</p>
                  ) : (
                    ordersForPaymentsTab.map((order) => {
                      const grand = order.total + (order.deliveryFee || 0);
                      const paid =
                        order.accountingStatus === 'paid' &&
                        (order.amountPaidGHS == null ||
                          order.amountPaidGHS === undefined)
                          ? grand
                          : (order.amountPaidGHS ?? 0);
                      const bal = Math.max(0, grand - paid);
                      return (
                        <div
                          key={order.id}
                          className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 text-sm'
                        >
                          <div className='min-w-0'>
                            <p className='font-medium font-mono'>
                              {formatOrderLabel(order)}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                              {getUserName(order.userId)}
                            </p>
                            <Badge variant='outline' className='mt-1 capitalize'>
                              {order.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className='text-right tabular-nums text-xs space-y-0.5'>
                            <p>Total ₵{grand.toFixed(2)}</p>
                            <p className='text-emerald-700 font-medium'>
                              Paid ₵{paid.toFixed(2)}
                            </p>
                            <p className='text-amber-800 font-medium'>
                              Balance ₵{bal.toFixed(2)}
                            </p>
                          </div>
                          <Button
                            size='sm'
                            variant='secondary'
                            onClick={() => openDirectPaymentAdjust(order)}
                          >
                            Adjust
                          </Button>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <div className='space-y-4'>
            {filteredOrdersManage.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                {statusFilter === 'all'
                  ? 'No orders found.'
                  : `No orders with status: ${statusFilter.replace('_', ' ')}.`}
              </div>
            ) : (
              filteredOrdersManage.map((order) => {
                const orderExpanded = expandedManageOrderIds.has(order.id);
                return (
                <Card key={order.id} className='overflow-hidden'>
                  <Collapsible
                    open={orderExpanded}
                    onOpenChange={(open) =>
                      setExpandedManageOrderIds((prev) => {
                        const next = new Set(prev);
                        if (open) next.add(order.id);
                        else next.delete(order.id);
                        return next;
                      })
                    }
                  >
                    <CardHeader className='bg-secondary/30 p-0 border-0'>
                      <CollapsibleTrigger asChild>
                        <button
                          type='button'
                          className='flex w-full flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2 py-4 px-4 sm:px-6 text-left hover:bg-secondary/50 transition-colors min-w-0'
                        >
                          <div className='flex min-w-0 items-start gap-2'>
                            <ChevronDown
                              className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                                orderExpanded ? 'rotate-180' : ''
                              }`}
                            />
                            <div className='min-w-0'>
                              <CardTitle className='text-base font-mono'>
                                Order {formatOrderLabel(order)}
                              </CardTitle>
                              <CardDescription>
                                {getUserName(order.userId)} •{' '}
                                {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                              </CardDescription>
                            </div>
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge
                              variant={
                                order.status === 'completed' ||
                                order.status === 'processing' ||
                                order.status === 'client_finalized' ||
                                order.status === 'invoice_sent' ||
                                order.status === 'customer_confirmed' ||
                                order.status === 'pharmacy_confirmed'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {order.status.replace('_', ' ')}
                            </Badge>
                            {order.accountingStatus === 'credit' ||
                            order.accountingStatus === undefined ? (
                              <Badge
                                variant='outline'
                                className='bg-amber-50 text-amber-900'
                              >
                                On credit
                              </Badge>
                            ) : (
                              <Badge
                                variant='outline'
                                className='bg-emerald-50 text-emerald-800'
                              >
                                Paid
                              </Badge>
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                  <CardContent className='p-6'>
                    <div className='flex flex-col md:flex-row gap-6 justify-between'>
                      <div className='flex-1 space-y-2'>
                        <div className='text-sm font-medium text-muted-foreground mb-2'>
                          Items
                        </div>
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className='flex justify-between text-sm border-b border-dashed pb-1 last:border-0'
                          >
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span className='text-muted-foreground'>
                              ₵{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {order.deliveryOption && (
                          <div className='pt-2 text-sm text-muted-foreground'>
                            <p>
                              Delivery:{' '}
                              {order.deliveryOption === 'delivery'
                                ? 'Home Delivery'
                                : 'Store Pickup'}
                            </p>
                            {order.deliveryAddress && (
                              <p className='text-xs mt-1'>
                                {order.deliveryAddress}
                              </p>
                            )}
                            {order.deliveryFee && order.deliveryFee > 0 && (
                              <p>
                                Delivery Fee: ₵{order.deliveryFee.toFixed(2)}
                              </p>
                            )}
                            {order.paymentMethod && (
                              <p>
                                Payment:{' '}
                                {paymentMethodLabel(order.paymentMethod)}
                              </p>
                            )}
                          </div>
                        )}
                        <div className='pt-2 flex justify-between font-bold'>
                          <span>Total</span>
                          <span>
                            ₵
                            {(order.total + (order.deliveryFee || 0)).toFixed(
                              2
                            )}
                          </span>
                        </div>
                        {(() => {
                          const grand =
                            order.total + (order.deliveryFee || 0);
                          const paid =
                            order.accountingStatus === 'paid' &&
                            (order.amountPaidGHS == null ||
                              order.amountPaidGHS === undefined)
                              ? grand
                              : (order.amountPaidGHS ?? 0);
                          const bal = Math.max(0, grand - paid);
                          return (
                            <div className='pt-3 space-y-1 text-sm border-t'>
                              <div className='flex justify-between text-emerald-700 font-medium'>
                                <span>Paid (debit)</span>
                                <span>₵{paid.toFixed(2)}</span>
                              </div>
                              <div className='flex justify-between text-amber-800 font-medium'>
                                <span>Balance (credit)</span>
                                <span>₵{bal.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className='md:w-64 space-y-3 bg-muted/10 p-4 rounded-lg border'>
                        {order.status === 'pending' ||
                        order.status === 'checking_stock' ? (
                          <>
                            <Button
                              variant='outline'
                              className='w-full'
                              onClick={() => openOrderEditDialog(order)}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit / adjust proforma lines
                            </Button>
                            <Button
                              className='w-full'
                              onClick={() => {
                                setProformaDialogOrder(order);
                                setProformaNoteDraft(
                                  order.proformaNote || DEFAULT_PROFORMA_NOTE
                                );
                              }}
                            >
                              Send proforma to client
                            </Button>
                          </>
                        ) : null}
                        <div className='text-sm font-medium text-muted-foreground'>
                          Status
                        </div>
                        <Badge
                          variant='secondary'
                          className='w-full justify-center py-1.5 capitalize'
                        >
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                        {order.status === 'proforma_sent' && (
                          <p className='text-xs text-muted-foreground'>
                            Waiting for the customer to confirm the proforma.
                          </p>
                        )}
                        {order.status === 'client_finalized' && (
                          <Button
                            className='w-full'
                            variant='secondary'
                            onClick={() =>
                              updateOrderStatus(order.id, 'invoice_sent')
                            }
                          >
                            Send invoice
                          </Button>
                        )}
                        {order.status === 'invoice_sent' && (
                          <Button
                            className='w-full font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-2 ring-primary/40 hover:ring-primary/60 animate-pulse'
                            onClick={() =>
                              updateOrderStatus(order.id, 'processing')
                            }
                          >
                            <Sparkles className='mr-2 h-4 w-4' />
                            Start preparing / packaging
                          </Button>
                        )}
                        {order.status === 'processing' && (
                          <Button
                            className='w-full'
                            onClick={() =>
                              updateOrderStatus(order.id, 'completed')
                            }
                          >
                            Mark order complete
                          </Button>
                        )}
                        {order.status === 'customer_confirmed' && (
                          <Button
                            className='w-full'
                            variant='secondary'
                            onClick={() =>
                              updateOrderStatus(order.id, 'processing')
                            }
                          >
                            Start preparing / packaging
                          </Button>
                        )}
                        {order.status === 'pharmacy_confirmed' && (
                          <p className='text-xs text-muted-foreground'>
                            Legacy: customer is completing verification on their
                            side.
                          </p>
                        )}
                        {order.status === 'checking_stock' && (
                          <Button
                            className='w-full'
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              updateOrderStatus(order.id, 'pending')
                            }
                          >
                            Move to pending (new flow)
                          </Button>
                        )}
                        {!['completed', 'cancelled'].includes(order.status) && (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='w-full text-destructive hover:text-destructive'
                            onClick={() => promptCancelOrder(order)}
                          >
                            Cancel order
                          </Button>
                        )}
                        {order.proformaNote &&
                          (order.status === 'proforma_sent' ||
                            order.status === 'client_finalized') && (
                            <div className='pt-2 text-xs text-muted-foreground border-t'>
                              <p className='font-medium'>Proforma note:</p>
                              <p>{order.proformaNote}</p>
                            </div>
                          )}
                        {order.notes && (
                          <div className='pt-2 text-xs text-muted-foreground'>
                            <p className='font-medium'>Customer notes:</p>
                            <p>{order.notes}</p>
                          </div>
                        )}
                        <Button
                          variant='outline'
                          className='w-full mt-2'
                          disabled={
                            order.status === 'pending' ||
                            order.status === 'proforma_sent' ||
                            order.status === 'checking_stock'
                          }
                          title={
                            order.status === 'pending' ||
                            order.status === 'proforma_sent' ||
                            order.status === 'checking_stock'
                              ? 'Available after the customer confirms the proforma'
                              : undefined
                          }
                          onClick={() => generateInvoice(order)}
                        >
                          <Download className='mr-2 h-4 w-4' />
                          Print / download invoice
                        </Button>
                        {(() => {
                          const grand =
                            order.total + (order.deliveryFee || 0);
                          const paid =
                            order.accountingStatus === 'paid' &&
                            (order.amountPaidGHS == null ||
                              order.amountPaidGHS === undefined)
                              ? grand
                              : (order.amountPaidGHS ?? 0);
                          const openBalance = paid < grand - 0.0001;
                          return openBalance ? (
                            <Button
                              variant='secondary'
                              className='w-full'
                              onClick={() => {
                                setPaymentDialogOrder(order);
                                setPaymentAmountInput(
                                  Math.max(
                                    0,
                                    grand - paid
                                  ).toFixed(2)
                                );
                              }}
                            >
                              Record payment
                            </Button>
                          ) : null;
                        })()}
                        <Button
                          variant='outline'
                          className='w-full'
                          onClick={() => openDirectPaymentAdjust(order)}
                        >
                          Adjust paid / balance
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent
          value='history'
          className='mt-6 space-y-6 w-full min-w-0 max-w-full overflow-x-hidden'
        >
          <div className='flex flex-col md:flex-row gap-4 items-center justify-between'>
            <h2 className='text-2xl font-serif font-bold'>Order History</h2>
            <div className='flex flex-wrap gap-2'>
              <Input
                placeholder='Search orders...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='w-full md:w-64'
              />
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder='Filter by Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Statuses</SelectItem>
                <SelectItem value='pending'>Pending</SelectItem>
                <SelectItem value='proforma_sent'>Proforma sent</SelectItem>
                <SelectItem value='client_finalized'>Client finalized</SelectItem>
                <SelectItem value='invoice_sent'>Invoice sent</SelectItem>
                <SelectItem value='processing'>Packing / preparing</SelectItem>
                <SelectItem value='completed'>Completed</SelectItem>
                <SelectItem value='cancelled'>Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder='Filter by Client' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Clients</SelectItem>
                {users
                  .filter((u) => u.role === 'client')
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger>
                <SelectValue placeholder='Filter by Product' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-3'>
            {filteredOrdersHistory.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                No orders found matching your filters.
              </div>
            ) : (
              filteredOrdersHistory.map((order) => (
                <Card key={order.id} className='overflow-hidden'>
                  <Collapsible
                    open={expandedHistoryOrderIds.has(order.id)}
                    onOpenChange={(open) =>
                      toggleHistoryOrderOpen(order.id, open)
                    }
                  >
                    <div className='flex flex-col bg-secondary/30 sm:flex-row sm:items-stretch min-w-0'>
                      <CollapsibleTrigger asChild>
                        <button
                          type='button'
                          className='flex flex-1 flex-col gap-3 px-4 py-4 text-left hover:bg-secondary/45 transition-colors min-w-0 sm:flex-row sm:items-center sm:gap-3'
                        >
                          <div className='flex items-start gap-3 min-w-0 w-full'>
                            <ChevronDown
                              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform mt-0.5 ${
                                expandedHistoryOrderIds.has(order.id)
                                  ? 'rotate-180'
                                  : ''
                              }`}
                            />
                            <div className='min-w-0 flex-1'>
                              <CardTitle className='text-base font-mono break-words'>
                                Order {formatOrderLabel(order)}
                              </CardTitle>
                              <CardDescription className='break-words'>
                                {getUserName(order.userId)} •{' '}
                                {format(
                                  order.createdAt,
                                  'MMM d, yyyy • h:mm a'
                                )}
                              </CardDescription>
                            </div>
                          </div>
                          <div className='hidden sm:flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-4'>
                            <span className='font-bold tabular-nums'>
                              ₵
                              {(
                                order.total + (order.deliveryFee || 0)
                              ).toFixed(2)}
                            </span>
                            <Badge
                              variant={
                                order.status === 'completed' ||
                                order.status === 'processing' ||
                                order.status === 'client_finalized' ||
                                order.status === 'invoice_sent' ||
                                order.status === 'customer_confirmed' ||
                                order.status === 'pharmacy_confirmed'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {order.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-3 sm:border-t-0 sm:border-l sm:flex-nowrap sm:justify-end sm:py-4 sm:pr-4 sm:pl-0'>
                        <div className='flex flex-wrap items-center gap-2 min-w-0 sm:hidden'>
                          <span className='font-bold tabular-nums text-base'>
                            ₵
                            {(order.total + (order.deliveryFee || 0)).toFixed(
                              2
                            )}
                          </span>
                          <Badge
                            variant={
                              order.status === 'completed' ||
                              order.status === 'processing' ||
                              order.status === 'client_finalized' ||
                              order.status === 'invoice_sent' ||
                              order.status === 'customer_confirmed' ||
                              order.status === 'pharmacy_confirmed'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {order.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <Button
                          variant='outline'
                          size='sm'
                          type='button'
                          className='shrink-0 ml-auto sm:ml-0'
                          onClick={() => generateInvoice(order)}
                        >
                          <Download className='mr-2 h-4 w-4' />
                          Invoice
                        </Button>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <CardContent className='p-6 pt-2 border-t border-border/60'>
                        <div className='space-y-2'>
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className='flex justify-between text-sm'
                            >
                              <span>
                                {item.quantity}x {item.name}
                              </span>
                              <span className='text-muted-foreground'>
                                ₵{(item.price * item.quantity).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          {order.deliveryOption && (
                            <div className='pt-2 border-t text-sm text-muted-foreground'>
                              <p>
                                Delivery:{' '}
                                {order.deliveryOption === 'delivery'
                                  ? 'Home Delivery'
                                  : 'Store Pickup'}
                              </p>
                              {order.deliveryFee && order.deliveryFee > 0 && (
                                <p>
                                  Delivery Fee: ₵
                                  {order.deliveryFee.toFixed(2)}
                                </p>
                              )}
                              {order.paymentMethod && (
                                <p>
                                  Payment:{' '}
                                  {paymentMethodLabel(order.paymentMethod)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value='analytics' className='mt-6 space-y-6'>
          <p className='text-sm text-muted-foreground max-w-3xl'>
            Revenue and units sold include completed orders only, matching stock
            removed when an order is completed. Expiry sections use your current
            inventory list.
          </p>
          <div className='grid gap-4 md:grid-cols-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-green-600'>
                  ₵{totalRevenue.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  Total Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{orders.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  Completed Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {completedOrders.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  Active Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>
                  {new Set(orders.map((o) => o.userId)).size}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Expiry + rankings: collapsible, scroll, export */}
          <div className='grid gap-6 md:grid-cols-3'>
            {(
              [
                {
                  key: '1mo',
                  title: 'Expiring in 1 Month',
                  icon: (
                    <AlertTriangle className='h-5 w-5 shrink-0 text-red-600' />
                  ),
                  list: analyticsExpiring1Mo,
                  csvName: 'analytics-expiring-1-month.csv',
                },
                {
                  key: '3mo',
                  title: 'Expiring in 3 Months',
                  icon: (
                    <Calendar className='h-5 w-5 shrink-0 text-orange-600' />
                  ),
                  list: analyticsExpiring3Mo,
                  csvName: 'analytics-expiring-3-months.csv',
                },
                {
                  key: '6mo',
                  title: 'Expiring in 6 Months',
                  icon: (
                    <Calendar className='h-5 w-5 shrink-0 text-blue-600' />
                  ),
                  list: analyticsExpiring6Mo,
                  csvName: 'analytics-expiring-6-months.csv',
                },
              ] as const
            ).map((block) => (
              <Card key={block.key} className='overflow-hidden'>
                <Collapsible defaultOpen>
                  <CardHeader className='space-y-3 pb-2'>
                    <CollapsibleTrigger asChild>
                      <button
                        type='button'
                        className='group flex w-full items-center gap-2 text-left'
                      >
                        <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                        {block.icon}
                        <CardTitle className='text-base'>
                          {block.title}{' '}
                          <span className='text-muted-foreground font-normal'>
                            ({block.list.length})
                          </span>
                        </CardTitle>
                      </button>
                    </CollapsibleTrigger>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          downloadCsv(block.csvName, [
                            ['Product', 'Expiry', 'Days left'],
                            ...block.list.map((p) => [
                              p.name,
                              format(
                                new Date(p.expiryDate!),
                                'yyyy-MM-dd'
                              ),
                              String(
                                Math.ceil(
                                  (p.expiryDate! - Date.now()) /
                                    (1000 * 60 * 60 * 24)
                                )
                              ),
                            ]),
                          ])
                        }
                      >
                        Download CSV
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          printAnalyticsHtml(
                            block.title,
                            `<table><thead><tr><th>Product</th><th>Expiry</th><th>Days</th></tr></thead><tbody>${block.list
                              .map(
                                (p) =>
                                  `<tr><td>${p.name}</td><td>${format(
                                    new Date(p.expiryDate!),
                                    'MMM d, yyyy'
                                  )}</td><td>${Math.ceil(
                                    (p.expiryDate! - Date.now()) /
                                      (1000 * 60 * 60 * 24)
                                  )}</td></tr>`
                              )
                              .join('')}</tbody></table>`
                          )
                        }
                      >
                        Print
                      </Button>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className='pt-0'>
                      <div className='max-h-64 overflow-y-auto space-y-2 pr-1'>
                        {block.list.length === 0 ? (
                          <p className='text-muted-foreground text-center py-6 text-sm'>
                            No products in this window
                          </p>
                        ) : (
                          block.list.map((product) => (
                            <div
                              key={product.id}
                              className='flex justify-between items-center p-2 border rounded text-sm'
                            >
                              <div>
                                <p className='font-medium'>{product.name}</p>
                                <p className='text-xs text-muted-foreground'>
                                  {format(
                                    new Date(product.expiryDate!),
                                    'MMM d, yyyy'
                                  )}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  block.key === '1mo'
                                    ? 'destructive'
                                    : 'outline'
                                }
                                className='text-xs'
                              >
                                {Math.ceil(
                                  (product.expiryDate! - Date.now()) /
                                    (1000 * 60 * 60 * 24)
                                )}{' '}
                                days
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <Card className='overflow-hidden'>
              <Collapsible defaultOpen>
                <CardHeader className='space-y-3'>
                  <CollapsibleTrigger asChild>
                    <button
                      type='button'
                      className='group flex w-full items-center gap-2 text-left'
                    >
                      <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                      <CardTitle className='flex items-center gap-2 text-base'>
                        <TrendingUp className='h-5 w-5 text-green-600' />
                        Top selling (up to 100)
                      </CardTitle>
                    </button>
                  </CollapsibleTrigger>
                  <div className='flex flex-wrap items-center gap-2'>
                    <div className='flex rounded-md border p-0.5 bg-muted/30'>
                      <Button
                        type='button'
                        size='sm'
                        variant={
                          analyticsTopSort === 'quantity'
                            ? 'default'
                            : 'ghost'
                        }
                        className='h-8'
                        onClick={() => setAnalyticsTopSort('quantity')}
                      >
                        By quantity
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant={
                          analyticsTopSort === 'revenue' ? 'default' : 'ghost'
                        }
                        className='h-8'
                        onClick={() => setAnalyticsTopSort('revenue')}
                      >
                        By value
                      </Button>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        downloadCsv(
                          `top-selling-${analyticsTopSort}.csv`,
                          [
                            ['Rank', 'Product', 'Units', 'Revenue GHS'],
                            ...topSellingProductsList.map((row, i) => [
                              String(i + 1),
                              row.product.name,
                              String(row.soldQuantity),
                              row.revenue.toFixed(2),
                            ]),
                          ]
                        )
                      }
                    >
                      CSV
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        printAnalyticsHtml(
                          `Top selling (${analyticsTopSort})`,
                          `<p>Sort: ${analyticsTopSort}</p><table><thead><tr><th>#</th><th>Product</th><th>Units</th><th>Revenue</th></tr></thead><tbody>${topSellingProductsList
                            .map(
                              (row, i) =>
                                `<tr><td>${i + 1}</td><td>${
                                  row.product.name
                                }</td><td>${row.soldQuantity}</td><td>₵${row.revenue.toFixed(
                                  2
                                )}</td></tr>`
                            )
                            .join('')}</tbody></table>`
                        )
                      }
                    >
                      Print
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Showing {analyticsTopOffset + 1}–
                    {Math.min(
                      analyticsTopOffset + 50,
                      topSellingProductsList.length
                    )}{' '}
                    of {topSellingProductsList.length}
                  </p>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className='pt-0'>
                    {topSellingProductsList.length === 0 ? (
                      <p className='text-muted-foreground text-center py-6'>
                        No sales data yet
                      </p>
                    ) : (
                      <>
                        <div className='max-h-80 overflow-y-auto space-y-2 pr-1'>
                          {topSellingPage.map(
                            ({ product, soldQuantity, revenue }, idx) => (
                              <div
                                key={product.id}
                                className='flex justify-between items-center p-2 border rounded'
                              >
                                <div>
                                  <p className='font-medium'>
                                    <span className='text-muted-foreground mr-2'>
                                      {analyticsTopOffset + idx + 1}.
                                    </span>
                                    {product.name}
                                  </p>
                                  <p className='text-xs text-muted-foreground'>
                                    {soldQuantity} units · ₵
                                    {revenue.toFixed(2)} revenue
                                  </p>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                        <div className='flex flex-wrap gap-2 mt-3'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={analyticsTopOffset <= 0}
                            onClick={() =>
                              setAnalyticsTopOffset((o) =>
                                Math.max(0, o - 50)
                              )
                            }
                          >
                            Previous 50
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={
                              analyticsTopOffset + 50 >=
                              topSellingProductsList.length
                            }
                            onClick={() =>
                              setAnalyticsTopOffset((o) => o + 50)
                            }
                          >
                            Next 50
                          </Button>
                          <Button
                            type='button'
                            variant='secondary'
                            size='sm'
                            onClick={() => {
                              setAnalyticsTopOffset(0);
                            }}
                          >
                            Start
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className='overflow-hidden'>
              <Collapsible defaultOpen>
                <CardHeader className='space-y-3'>
                  <CollapsibleTrigger asChild>
                    <button
                      type='button'
                      className='group flex w-full items-center gap-2 text-left'
                    >
                      <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                      <CardTitle className='flex items-center gap-2 text-base'>
                        <TrendingDown className='h-5 w-5 text-yellow-600' />
                        Not selling (0 units, up to 100)
                      </CardTitle>
                    </button>
                  </CollapsibleTrigger>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        downloadCsv('products-not-selling.csv', [
                          ['Rank', 'Product'],
                          ...leastSellingProducts.map((row, i) => [
                            String(i + 1),
                            row.product.name,
                          ]),
                        ])
                      }
                    >
                      CSV
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        printAnalyticsHtml(
                          'Products not selling',
                          `<table><thead><tr><th>#</th><th>Product</th></tr></thead><tbody>${leastSellingProducts
                            .map(
                              (row, i) =>
                                `<tr><td>${i + 1}</td><td>${row.product.name}</td></tr>`
                            )
                            .join('')}</tbody></table>`
                        )
                      }
                    >
                      Print
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {leastSellingProducts.length} products · view{' '}
                    {analyticsLeastOffset + 1}–
                    {Math.min(
                      analyticsLeastOffset + 50,
                      leastSellingProducts.length
                    )}
                  </p>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className='pt-0'>
                    {leastSellingProducts.length === 0 ? (
                      <p className='text-muted-foreground text-center py-6'>
                        All tracked products have sales
                      </p>
                    ) : (
                      <>
                        <div className='max-h-80 overflow-y-auto space-y-2 pr-1'>
                          {leastSellingPage.map(({ product }, idx) => (
                            <div
                              key={product.id}
                              className='flex justify-between items-center p-2 border rounded'
                            >
                              <div>
                                <p className='font-medium'>
                                  <span className='text-muted-foreground mr-2'>
                                    {analyticsLeastOffset + idx + 1}.
                                  </span>
                                  {product.name}
                                </p>
                                <p className='text-xs text-muted-foreground'>
                                  0 units sold
                                </p>
                              </div>
                              <Badge
                                variant='outline'
                                className='text-yellow-600'
                              >
                                No sales
                              </Badge>
                            </div>
                          ))}
                        </div>
                        <div className='flex flex-wrap gap-2 mt-3'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={analyticsLeastOffset <= 0}
                            onClick={() =>
                              setAnalyticsLeastOffset((o) =>
                                Math.max(0, o - 50)
                              )
                            }
                          >
                            Previous 50
                          </Button>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={
                              analyticsLeastOffset + 50 >=
                              leastSellingProducts.length
                            }
                            onClick={() =>
                              setAnalyticsLeastOffset((o) => o + 50)
                            }
                          >
                            Next 50
                          </Button>
                          <Button
                            type='button'
                            variant='secondary'
                            size='sm'
                            onClick={() => setAnalyticsLeastOffset(0)}
                          >
                            Start
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>
        </TabsContent>

        {isSuperAdmin && (
        <TabsContent value='staff' className='mt-6 space-y-6'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h2 className='text-2xl font-serif font-bold'>Staff Management</h2>
              <p className='text-sm text-muted-foreground max-w-xl'>
                HR records for loans, payroll deductions, and leave. Grant
                dashboard access separately so people can sign in to the staff
                app.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='default'
                onClick={() => {
                  setStaffHrAddForm({
                    name: '',
                    role: '',
                    phone: '',
                    loanPrincipal: '',
                  });
                  setIsStaffHrAddOpen(true);
                }}
              >
                <UserPlus className='mr-2 h-4 w-4' />
                Add team member
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setEditingStaff(null);
                  setStaffPermissions({
                    canManageInventory: false,
                    canViewOrders: false,
                    canUpdateStock: false,
                    canViewAnalytics: false,
                    canGenerateInvoices: false,
                  });
                  setIsStaffDialogOpen(true);
                }}
              >
                Grant app access
              </Button>
            </div>
          </div>

          <Card className='overflow-hidden'>
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <button
                  type='button'
                  className='group flex w-full items-start gap-3 border-b bg-muted/20 px-6 py-4 text-left hover:bg-muted/35 transition-colors'
                >
                  <ChevronDown className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                  <div className='min-w-0 flex-1'>
                    <CardTitle className='text-base'>Team (HR)</CardTitle>
                    <CardDescription>
                      Loans, deductions, payments, and leave — super admin
                      only. Expand for the full list ({staffHrMembers.length}).
                    </CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className='pt-4'>
                  {staffHrMembers.length === 0 ? (
                    <div className='text-center py-10 text-muted-foreground'>
                      No HR records yet. Add a team member to track leave and
                      loans.
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      {staffHrMembers.map((m) => {
                        const y = new Date().getFullYear();
                        const leaveY = totalLeaveDaysInYear(m.leavePeriods, y);
                        const paidToward =
                          hrTotalPrincipalGHS(m) - hrTotalOutstandingGHS(m);
                        const ledger = buildStaffFullLedger(m);
                        return (
                          <Card key={m.id} className='overflow-hidden'>
                            <Collapsible defaultOpen={false}>
                              <div className='flex flex-col sm:flex-row sm:items-stretch'>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type='button'
                                    className='group flex flex-1 items-start gap-3 p-4 text-left hover:bg-muted/30 min-w-0'
                                  >
                                    <ChevronDown className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                                    <div className='min-w-0 flex-1 space-y-1'>
                                      <h3 className='font-semibold'>{m.name}</h3>
                                      <p className='text-sm text-muted-foreground'>
                                        {m.role || '—'} ·{' '}
                                        {m.phone || 'No phone'}
                                      </p>
                                      <div className='flex flex-wrap gap-2 text-xs'>
                                        <Badge variant='outline'>
                                          Loans: {m.loanAccounts.length} · Total
                                          out. ₵
                                          {hrTotalOutstandingGHS(m).toFixed(2)}
                                        </Badge>
                                        <Badge variant='secondary'>
                                          Leave {y}: {leaveY} day
                                          {leaveY === 1 ? '' : 's'}
                                        </Badge>
                                        <Badge variant='outline'>
                                          Ledger lines: {ledger.length}
                                        </Badge>
                                      </div>
                                      <p className='text-xs text-muted-foreground pt-1'>
                                        Paid toward loan: ₵
                                        {Math.max(0, paidToward).toFixed(2)} ·
                                        Expand for leave periods & recent
                                        ledger
                                      </p>
                                    </div>
                                  </button>
                                </CollapsibleTrigger>
                                <div className='flex items-center justify-end border-t p-3 sm:w-40 sm:border-t-0 sm:border-l sm:justify-center bg-muted/10'>
                                  <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setStaffHrDraft({ ...m });
                                    }}
                                  >
                                    <Edit className='mr-2 h-4 w-4' />
                                    Manage
                                  </Button>
                                </div>
                              </div>
                              <CollapsibleContent>
                                <div className='space-y-4 border-t bg-muted/15 px-4 py-3 text-sm'>
                                  <div>
                                    <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                      Leave periods ({m.leavePeriods.length})
                                    </p>
                                    {m.leavePeriods.length === 0 ? (
                                      <p className='text-muted-foreground text-xs'>
                                        None recorded.
                                      </p>
                                    ) : (
                                      <ul className='space-y-1.5'>
                                        {[...m.leavePeriods]
                                          .sort((a, b) =>
                                            a.startDate.localeCompare(b.startDate)
                                          )
                                          .map((p) => (
                                            <li
                                              key={p.id}
                                              className='rounded border bg-background/60 px-2 py-1.5 text-xs'
                                            >
                                              {p.startDate} → {p.endDate} (
                                              {leaveDaysInclusive(
                                                p.startDate,
                                                p.endDate
                                              )}{' '}
                                              days)
                                              {p.note ? ` · ${p.note}` : ''}
                                            </li>
                                          ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div>
                                    <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                      Loan ledger (newest first)
                                    </p>
                                    {ledger.length === 0 ? (
                                      <p className='text-muted-foreground text-xs'>
                                        No deductions, payments, or book saves
                                        yet.
                                      </p>
                                    ) : (
                                      <ul className='space-y-1.5 max-h-48 overflow-y-auto pr-1'>
                                        {ledger.slice(0, 12).map((row) => (
                                          <li
                                            key={`${row.kind}-${row.id}`}
                                            className='rounded border bg-background/60 px-2 py-1.5 text-xs flex flex-wrap justify-between gap-2'
                                          >
                                            <span>
                                              <span className='block text-[10px] font-medium text-muted-foreground mb-0.5'>
                                                {row.loanName}
                                              </span>
                                              {row.kind === 'book' ? (
                                                <>
                                                  <Badge
                                                    variant='outline'
                                                    className='mr-1.5'
                                                  >
                                                    Book
                                                  </Badge>
                                                  {format(row.at, 'MMM d, yyyy')}
                                                  {row.note
                                                    ? ` · ${row.note}`
                                                    : ''}
                                                </>
                                              ) : (
                                                <>
                                                  <Badge
                                                    variant={
                                                      row.kind === 'deduction'
                                                        ? 'secondary'
                                                        : 'outline'
                                                    }
                                                    className='mr-1.5'
                                                  >
                                                    {row.kind === 'deduction'
                                                      ? 'Deduction'
                                                      : 'Payment'}
                                                  </Badge>
                                                  {format(row.at, 'MMM d, yyyy')}
                                                  {row.note
                                                    ? ` · ${row.note}`
                                                    : ''}
                                                </>
                                              )}
                                            </span>
                                            {row.kind === 'book' ? (
                                              <span className='tabular-nums text-muted-foreground'>
                                                P ₵{row.principal.toFixed(2)} · O
                                                ₵{row.outstanding.toFixed(2)}
                                              </span>
                                            ) : (
                                              <span className='font-medium tabular-nums'>
                                                −₵{row.amount.toFixed(2)}
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    {ledger.length > 12 ? (
                                      <p className='text-[10px] text-muted-foreground mt-1'>
                                        Showing 12 of {ledger.length}. Open
                                        Manage for the full list.
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Staff dashboard access</CardTitle>
              <CardDescription>
                Link an existing user account to the staff role and set what
                they can do in the staff dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {users.filter((u) => u.role === 'staff').length === 0 ? (
                  <div className='text-center py-8 text-muted-foreground'>
                    No accounts with staff access yet. Use Grant app access to
                    promote a client user.
                  </div>
                ) : (
                  users
                    .filter((u) => u.role === 'staff')
                    .map((staff) => (
                      <Card key={staff.id}>
                        <CardContent className='p-4'>
                          <div className='flex items-center justify-between gap-3'>
                            <div className='flex-1 min-w-0'>
                              <h3 className='font-semibold truncate'>
                                {staff.name || staff.email}
                              </h3>
                              <p className='text-sm text-muted-foreground truncate'>
                                {staff.email}
                              </p>
                              <div className='flex flex-wrap gap-2 mt-2'>
                                {staff.permissions?.canManageInventory && (
                                  <Badge variant='outline'>
                                    Manage Inventory
                                  </Badge>
                                )}
                                {staff.permissions?.canViewOrders && (
                                  <Badge variant='outline'>View Orders</Badge>
                                )}
                                {staff.permissions?.canUpdateStock && (
                                  <Badge variant='outline'>Update Stock</Badge>
                                )}
                                {staff.permissions?.canViewAnalytics && (
                                  <Badge variant='outline'>
                                    View Analytics
                                  </Badge>
                                )}
                                {staff.permissions?.canGenerateInvoices && (
                                  <Badge variant='outline'>
                                    Generate Invoices
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setEditingStaff(staff);
                                setStaffPermissions(
                                  staff.permissions || {
                                    canManageInventory: false,
                                    canViewOrders: false,
                                    canUpdateStock: false,
                                    canViewAnalytics: false,
                                    canGenerateInvoices: false,
                                  }
                                );
                                setIsStaffDialogOpen(true);
                              }}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value='pharmacies' className='mt-6 space-y-6'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <h2 className='text-2xl font-serif font-bold'>Pharmacies</h2>
              <p className='text-sm text-muted-foreground mt-1 max-w-2xl'>
                Credit pharmacies have a limit, <strong>outstanding</strong> (unpaid
                from completed orders on account), and <strong>available</strong>{' '}
                headroom. Outstanding increases when an order is marked complete with
                an unpaid balance, and decreases when payments are recorded. Edit caps
                and outstanding in <strong>Manage pharmacy</strong>. Default credit
                limit is ₵{DEFAULT_CREDIT_LIMIT_GHS.toLocaleString()}. Only super
                admins can add or delete pharmacy records.
              </p>
            </div>
            {isSuperAdmin && (
              <Button
                type='button'
                onClick={() => setAddPharmacyOpen(true)}
                className='shrink-0'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add pharmacy
              </Button>
            )}
          </div>

          <Card>
            <CardHeader className='pb-3'>
              <CardTitle>Directory &amp; limits</CardTitle>
              <CardDescription>
                Filter by billing segment, narrow by first letter, sort A–Z like
                inventory.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex flex-wrap gap-2 items-center'>
                <span className='text-sm text-muted-foreground'>Show:</span>
                {(
                  [
                    ['all', 'All'],
                    ['credit', 'Credit pharmacies'],
                    ['cash', 'Cash pharmacies'],
                  ] as const
                ).map(([val, label]) => (
                  <Button
                    key={val}
                    type='button'
                    size='sm'
                    variant={pharmacySegmentFilter === val ? 'default' : 'outline'}
                    onClick={() => setPharmacySegmentFilter(val)}
                  >
                    {label}
                  </Button>
                ))}
                <Select
                  value={pharmacySortMode}
                  onValueChange={(v) =>
                    setPharmacySortMode(v as 'default' | 'az')
                  }
                >
                  <SelectTrigger className='w-full sm:w-[200px]'>
                    <SelectValue placeholder='Sort' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='default'>Default order</SelectItem>
                    <SelectItem value='az'>Alphabetical (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='flex flex-wrap items-center gap-2 w-full min-w-0'>
                <span className='text-sm text-muted-foreground shrink-0'>
                  Starts with:
                </span>
                <div className='flex flex-wrap gap-1.5'>
                  {INVENTORY_LETTER_OPTIONS.map((letter) => (
                    <Button
                      key={letter}
                      type='button'
                      variant={
                        pharmacyLetterFilter === letter ? 'default' : 'outline'
                      }
                      size='sm'
                      className='min-w-[2rem] h-8 px-2 font-medium'
                      onClick={() => setPharmacyLetterFilter(letter)}
                    >
                      {letter === 'all' ? 'All' : letter}
                    </Button>
                  ))}
                </div>
              </div>
              <div className='relative max-w-md'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search pharmacies by name or id…'
                  className='pl-9'
                  value={pharmacySearchQuery}
                  onChange={(e) => setPharmacySearchQuery(e.target.value)}
                />
              </div>
              <div className='md:hidden rounded-md border divide-y min-w-0'>
                {pharmaciesLoading ? (
                  <AdminLoadingPanel
                    title='Loading pharmacies…'
                    subtitle='Please wait while pharmacy records are loaded.'
                  />
                ) : filteredPharmacies.length === 0 ? (
                  <p className='p-8 text-center text-sm text-muted-foreground'>
                    {pharmacies.length === 0
                      ? 'No pharmacy records yet.'
                      : 'No pharmacies match filters or search.'}
                  </p>
                ) : (
                  filteredPharmacies.map((p) => (
                    <AdminPharmacyMobileCard
                      key={p.id}
                      pharmacy={p}
                      segment={pharmacyUsesCreditLine(p) ? 'credit' : 'cash'}
                      isAdmin={isAdmin}
                      isSuperAdmin={isSuperAdmin}
                      onManage={openPharmacySuperEdit}
                      onVerify={handleVerifyPharmacy}
                      onDelete={handleDeletePharmacy}
                    />
                  ))
                )}
              </div>
              <div className='hidden md:block rounded-md border overflow-x-auto'>
                {pharmacySegmentFilter === 'cash' ? (
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b bg-muted/40 text-left'>
                        <th className='p-3 font-medium'>Pharmacy</th>
                        <th className='p-3 font-medium'>Location</th>
                        <th className='p-3 font-medium'>Contact</th>
                        <th className='p-3 font-medium'>Phone</th>
                        <th className='p-3 font-medium'>Profile</th>
                        <th className='p-3 font-medium min-w-[8rem]'></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pharmaciesLoading ? (
                        <tr>
                          <td colSpan={6}>
                            <AdminLoadingPanel
                              title='Loading pharmacies…'
                              subtitle='Please wait while pharmacy records are loaded.'
                            />
                          </td>
                        </tr>
                      ) : pharmacies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className='p-8 text-center text-muted-foreground'
                          >
                            No pharmacy records yet. Super admins: open this tab to
                            seed defaults, or run import scripts.
                          </td>
                        </tr>
                      ) : filteredPharmacies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className='p-8 text-center text-muted-foreground'
                          >
                            No pharmacies match filters or search.
                          </td>
                        </tr>
                      ) : (
                        filteredPharmacies.map((p) => (
                          <tr key={p.id} className='border-b last:border-0'>
                            <td className='p-3'>
                              <span className='font-medium'>{p.name}</span>
                              <p className='text-xs text-muted-foreground font-mono'>
                                {p.id}
                              </p>
                            </td>
                            <td className='p-3 text-muted-foreground'>
                              {p.location ?? '—'}
                            </td>
                            <td className='p-3 text-muted-foreground'>
                              {p.contactPerson ?? '—'}
                            </td>
                            <td className='p-3 text-muted-foreground'>
                              {p.phone ?? '—'}
                            </td>
                            <td className='p-3'>
                              {p.pendingVerification === true ? (
                                <Badge variant='outline'>Pending review</Badge>
                              ) : (
                                <Badge
                                  variant='outline'
                                  className='bg-emerald-50 text-emerald-800 border-emerald-200'
                                >
                                  Verified
                                </Badge>
                              )}
                            </td>
                            <td className='p-3 text-right space-y-1'>
                              {isAdmin && (
                                <>
                                  <Button
                                    variant='default'
                                    size='sm'
                                    className='w-full'
                                    onClick={() => openPharmacySuperEdit(p)}
                                  >
                                    Manage
                                  </Button>
                                  {p.pendingVerification === true && (
                                    <Button
                                      variant='secondary'
                                      size='sm'
                                      className='w-full'
                                      onClick={() => handleVerifyPharmacy(p)}
                                    >
                                      Mark verified
                                    </Button>
                                  )}
                                </>
                              )}
                              {isSuperAdmin && (
                                <Button
                                  variant='outline'
                                  size='sm'
                                  className='w-full text-destructive border-destructive/30 hover:bg-destructive/10'
                                  onClick={() => handleDeletePharmacy(p)}
                                >
                                  <Trash2 className='mr-1 h-3.5 w-3.5' />
                                  Delete
                                </Button>
                              )}
                              {!isAdmin && (
                                <span className='text-xs text-muted-foreground block text-center'>
                                  View only
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b bg-muted/40 text-left'>
                        <th className='p-3 font-medium'>Pharmacy</th>
                        <th className='p-3 font-medium'>Billing</th>
                        <th className='p-3 font-medium'>Profile</th>
                        <th className='p-3 font-medium text-right'>
                          Credit cap (₵)
                        </th>
                        <th className='p-3 font-medium text-right'>
                          Outstanding (₵)
                        </th>
                        <th className='p-3 font-medium text-right'>
                          Available (₵)
                        </th>
                        <th className='p-3 font-medium'>Flags</th>
                        <th className='p-3 font-medium min-w-[8rem]'></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pharmaciesLoading ? (
                        <tr>
                          <td colSpan={8}>
                            <AdminLoadingPanel
                              title='Loading pharmacies…'
                              subtitle='Please wait while pharmacy records are loaded.'
                            />
                          </td>
                        </tr>
                      ) : pharmacies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className='p-8 text-center text-muted-foreground'
                          >
                            No pharmacy records yet. Super admins: open this tab to
                            seed defaults, or wait for client onboarding / imports.
                          </td>
                        </tr>
                      ) : filteredPharmacies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className='p-8 text-center text-muted-foreground'
                          >
                            No pharmacies match filters or search.
                          </td>
                        </tr>
                      ) : (
                        filteredPharmacies.map((p) => {
                          const isCredit = pharmacyUsesCreditLine(p);
                          const credLim = getCreditLimitGHS(p);
                          const credBal = getCreditBalanceGHS(p);
                          const credAvail = creditAvailableGHS(p);
                          const overCred =
                            credLim > 0 && credBal > credLim + 1e-6;
                          return (
                            <tr key={p.id} className='border-b last:border-0'>
                              <td className='p-3'>
                                <span className='font-medium'>{p.name}</span>
                                <p className='text-xs text-muted-foreground font-mono'>
                                  {p.id}
                                </p>
                                {(p.location || p.contactPerson || p.phone) && (
                                  <p className='text-xs text-muted-foreground mt-1'>
                                    {[p.location, p.contactPerson, p.phone]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                              </td>
                              <td className='p-3'>
                                {isCredit ? (
                                  <Badge className='bg-violet-100 text-violet-900 hover:bg-violet-100'>
                                    Credit
                                  </Badge>
                                ) : (
                                  <Badge variant='secondary'>Cash</Badge>
                                )}
                              </td>
                              <td className='p-3'>
                                {p.pendingVerification === true ? (
                                  <Badge variant='outline'>Pending review</Badge>
                                ) : (
                                  <Badge
                                    variant='outline'
                                    className='bg-emerald-50 text-emerald-800 border-emerald-200'
                                  >
                                    Verified
                                  </Badge>
                                )}
                              </td>
                              {isCredit ? (
                                <>
                                  <td className='p-3 text-right tabular-nums'>
                                    {credLim.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className='p-3 text-right tabular-nums text-muted-foreground'>
                                    {credBal.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className='p-3 text-right tabular-nums text-muted-foreground'>
                                    {credAvail.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className='p-3'>
                                    <div className='flex flex-wrap gap-1'>
                                      {overCred && (
                                        <Badge
                                          variant='destructive'
                                          className='text-xs'
                                        >
                                          Over credit cap
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <td
                                  colSpan={4}
                                  className='p-3 text-muted-foreground text-sm'
                                >
                                  Account credit applies to credit pharmacies only.
                                </td>
                              )}
                              <td className='p-3 text-right space-y-1'>
                                {isAdmin && (
                                  <>
                                    <Button
                                      variant='default'
                                      size='sm'
                                      className='w-full'
                                      onClick={() => openPharmacySuperEdit(p)}
                                    >
                                      Manage
                                    </Button>
                                    {p.pendingVerification === true && (
                                      <Button
                                        variant='secondary'
                                        size='sm'
                                        className='w-full'
                                        onClick={() => handleVerifyPharmacy(p)}
                                      >
                                        Mark verified
                                      </Button>
                                    )}
                                  </>
                                )}
                                {isSuperAdmin && (
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    className='w-full text-destructive border-destructive/30 hover:bg-destructive/10'
                                    onClick={() => handleDeletePharmacy(p)}
                                  >
                                    <Trash2 className='mr-1 h-3.5 w-3.5' />
                                    Delete
                                  </Button>
                                )}
                                {!isAdmin && (
                                  <span className='text-xs text-muted-foreground block text-center'>
                                    View only
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value='inventory'
          className='mt-6 space-y-4 w-full min-w-0 max-w-full overflow-x-hidden'
        >
          <div className='flex flex-col gap-3 w-full min-w-0'>
            <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
              <span className='text-sm text-muted-foreground shrink-0'>View:</span>
              <div className='flex flex-wrap gap-2 items-center'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    variant={
                      inventoryListMode === 'storefront' ? 'default' : 'outline'
                    }
                    onClick={() => setInventoryListMode('storefront')}
                  >
                    Wholesale
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                  Wholesale inventory — what clients see and order on the
                  storefront (price, sellable stock, hide/show)
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    variant={
                      inventoryListMode === 'storeroom' ? 'default' : 'outline'
                    }
                    onClick={() => setInventoryListMode('storeroom')}
                  >
                    Warehouse
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                  Warehouse / storeroom stock — backroom quantities and prices
                  from storeroom.json (not the client storefront list)
                </TooltipContent>
              </Tooltip>
              <div className='flex flex-wrap gap-1 items-center border rounded-md p-0.5 bg-muted/30'>
              <span className='sr-only'>Layout</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    variant={inventoryViewLayout === 'list' ? 'default' : 'ghost'}
                    className='h-8 px-2.5'
                    onClick={() => setInventoryViewLayout('list')}
                    aria-label='List view'
                    aria-pressed={inventoryViewLayout === 'list'}
                  >
                    <LayoutList className='h-4 w-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>View inventory as a list</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    variant={inventoryViewLayout === 'grid' ? 'default' : 'ghost'}
                    className='h-8 px-2.5'
                    onClick={() => setInventoryViewLayout('grid')}
                    aria-label='Grid view'
                    aria-pressed={inventoryViewLayout === 'grid'}
                  >
                    <LayoutGrid className='h-4 w-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                  View inventory as a grid of cards
                </TooltipContent>
              </Tooltip>
              </div>
            </div>
            <Select
              value={inventorySortMode}
              onValueChange={(v) =>
                setInventorySortMode(v as 'default' | 'az' | 'code')
              }
            >
              <SelectTrigger className='w-full sm:w-[220px]'>
                <SelectValue placeholder='Sort' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='default'>All (default order)</SelectItem>
                <SelectItem value='az'>Alphabetical (A–Z)</SelectItem>
                <SelectItem value='code'>By product code</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className='text-xs text-muted-foreground max-w-3xl'>
            {inventoryListMode === 'storefront'
              ? 'Wholesale — what clients see when ordering (not warehouse stock). Hide/show and sellable shelf stock apply here only.'
              : `Warehouse list from data/storeroom.json (${allStoreroomRows.length} lines). Prices and quantities reflect the file; live counts come from inventory after sync (pnpm reset-storeroom --apply). Rows with zero warehouse quantity are faded.`}
          </p>

          {inventoryListMode === 'storefront' && (
            <div className='flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3'>
              <Select
                value={inventoryCategoryFilter}
                onValueChange={setInventoryCategoryFilter}
              >
                <SelectTrigger className='w-full sm:w-[220px] h-9'>
                  <SelectValue placeholder='Category' />
                </SelectTrigger>
                <SelectContent className='max-h-[min(20rem,70vh)]'>
                  <SelectItem value='all'>All categories</SelectItem>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={inventorySubCategoryFilter}
                onValueChange={setInventorySubCategoryFilter}
              >
                <SelectTrigger className='w-full sm:w-[200px] h-9'>
                  <SelectValue placeholder='Type' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All types</SelectItem>
                  {PRODUCT_SUBCATEGORIES.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm text-muted-foreground shrink-0'>
              Starts with:
            </span>
            <div className='flex flex-wrap gap-1.5 max-w-full'>
              {INVENTORY_LETTER_OPTIONS.map((letter) => (
                <Button
                  key={letter}
                  type='button'
                  variant={
                    inventoryLetterFilter === letter ? 'default' : 'outline'
                  }
                  size='sm'
                  className='min-w-[2rem] h-8 px-2 font-medium'
                  onClick={() => setInventoryLetterFilter(letter)}
                >
                  {letter === 'all' ? 'All' : letter}
                </Button>
              ))}
            </div>
          </div>
          </div>

          <div className='rounded-md border bg-card relative min-h-[12rem] w-full min-w-0 max-w-full overflow-hidden'>
            {inventoryLoading && (
              <div
                className='absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-[2px] rounded-md'
                role='status'
                aria-live='polite'
              >
                <AdminLoadingPanel
                  title='Loading products…'
                  subtitle='Please wait while inventory is loaded — this can take a moment with thousands of items.'
                />
              </div>
            )}
            {inventoryListMode === 'storefront' ? (
              <>
                {inventoryViewLayout === 'list' && (
                  <div className='hidden md:flex flex-row items-center gap-4 p-4 border-b font-medium text-sm text-muted-foreground bg-muted/20'>
                    <div className='w-12 shrink-0' aria-hidden />
                    <div className='flex-1 min-w-0'>Product</div>
                    <div className='w-28 text-right shrink-0'>Price</div>
                    <div className='w-44 text-center shrink-0'>Stock</div>
                    <div className='w-20 text-center shrink-0'>Storeroom</div>
                    <div className='w-[120px] shrink-0 text-right'>Actions</div>
                  </div>
                )}
                <div
                  className={
                    inventoryViewLayout === 'grid'
                      ? 'grid grid-cols-1 gap-3 p-3 w-full min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4 sm:p-4'
                      : 'w-full min-w-0'
                  }
                >
                  {inventoryProductsFiltered.map((product) => (
                    <AdminStorefrontInventoryItem
                      key={product.id}
                      product={product}
                      layout={inventoryViewLayout}
                      onEdit={openProductDialog}
                      onToggleVisibility={handleToggleProductVisibility}
                      onDelete={handleDeleteProduct}
                    />
                  ))}
                </div>
                {!inventoryLoading &&
                  inventoryProductsFiltered.length === 0 && (
                    <div className='p-8 text-center text-sm text-muted-foreground'>
                      No products match this letter filter.
                    </div>
                  )}
              </>
            ) : (
              <>
                {warehouseRowsFiltered.length === 0 ? (
                  <div className='p-8 text-center text-sm text-muted-foreground'>
                    No warehouse rows match this letter filter.
                  </div>
                ) : (
                  <div
                    className={
                      inventoryViewLayout === 'grid'
                        ? 'grid grid-cols-1 gap-3 p-3 w-full min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4 sm:p-4'
                        : 'w-full min-w-0'
                    }
                  >
                    {warehouseRowsFiltered.map((row) => {
                      const codeKey = normalizeWarehouseCode(row.code);
                      const resolved = resolveWarehouseRowToProduct(
                        row,
                        productsByWarehouseCode,
                        productsByNormalizedLabel
                      );
                      return (
                        <AdminStoreroomInventoryItem
                          key={codeKey}
                          row={row}
                          match={resolved?.product ?? null}
                          matchKind={resolved?.match}
                          layout={inventoryViewLayout}
                          onEdit={openProductDialog}
                          onToggleVisibility={handleToggleProductVisibility}
                          onDelete={handleDeleteProduct}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              Fill in the product details below.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4'>
              <Label htmlFor='name' className='sm:text-right'>
                Name
              </Label>
              <Input
                id='name'
                value={productForm.name}
                onChange={(e) =>
                  setProductForm({ ...productForm, name: e.target.value })
                }
                className='sm:col-span-3'
              />
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4'>
              <Label htmlFor='category' className='sm:text-right'>
                Category
              </Label>
              <Select
                value={productForm.category}
                onValueChange={(value) =>
                  setProductForm({ ...productForm, category: value })
                }
              >
                <SelectTrigger className='sm:col-span-3'>
                  <SelectValue placeholder='Select category' />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4'>
              <Label htmlFor='subCategory' className='sm:text-right'>
                Type
              </Label>
              <Select
                value={productForm.subCategory || '__none__'}
                onValueChange={(value) =>
                  setProductForm({
                    ...productForm,
                    subCategory:
                      value === '__none__' ? undefined : value,
                  })
                }
              >
                <SelectTrigger className='col-span-1 sm:col-span-3'>
                  <SelectValue placeholder='Select type (optional)' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='__none__'>None</SelectItem>
                  {PRODUCT_SUBCATEGORIES.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='price' className='text-right'>
                Price
              </Label>
              <Input
                id='price'
                type='number'
                value={productForm.price}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    price: Number.parseFloat(e.target.value),
                  })
                }
                className='col-span-3'
              />
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='wholesaleStock' className='text-right'>
                Wholesale
              </Label>
              <Input
                id='wholesaleStock'
                type='number'
                value={productForm.wholesaleStock ?? productForm.stock ?? 0}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value || '0', 10);
                  setProductForm({ ...productForm, wholesaleStock: val, stock: val });
                }}
                className='col-span-3'
              />
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='storeroomStock' className='text-right'>
                Storeroom
              </Label>
              <Input
                id='storeroomStock'
                type='number'
                value={productForm.storeroomStock ?? 0}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value || '0', 10);
                  setProductForm({ ...productForm, storeroomStock: val });
                }}
                className='col-span-3'
              />
            </div>
            {editingProduct && (
              <div className='grid grid-cols-4 items-center gap-4'>
                <Label htmlFor='transferQty' className='text-right'>
                  Transfer
                </Label>
                <div className='col-span-3 flex flex-col gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Input
                      id='transferQty'
                      type='number'
                      value={transferQty}
                      onChange={(e) =>
                        setTransferQty(Number.parseInt(e.target.value || '0', 10))
                      }
                      className='w-28 min-w-0'
                      min={0}
                    />
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        const qty = Math.max(0, transferQty || 0);
                        const from = productForm.storeroomStock ?? 0;
                        const move = Math.min(qty, from);
                        if (move <= 0) return;
                        const newStoreroom = from - move;
                        const newWholesale =
                          (productForm.wholesaleStock ?? productForm.stock ?? 0) + move;
                        setProductForm({
                          ...productForm,
                          storeroomStock: newStoreroom,
                          wholesaleStock: newWholesale,
                          stock: newWholesale,
                        });
                        setTransferQty(0);
                      }}
                    >
                      Storeroom → Wholesale
                    </Button>
                    <span className='text-xs text-muted-foreground'>
                      Total units:{' '}
                      {(productForm.wholesaleStock ?? productForm.stock ?? 0) +
                        (productForm.storeroomStock ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='unit' className='text-right'>
                Unit
              </Label>
              <Input
                id='unit'
                placeholder='e.g. Box (10x10)'
                value={productForm.unit}
                onChange={(e) =>
                  setProductForm({ ...productForm, unit: e.target.value })
                }
                className='col-span-3'
              />
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='desc' className='text-right'>
                Description
              </Label>
              <Textarea
                id='desc'
                value={productForm.description}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    description: e.target.value,
                  })
                }
                className='col-span-3'
              />
            </div>
            <div className='grid grid-cols-4 items-start gap-4'>
              <Label htmlFor='code' className='text-right pt-2'>
                Product Code
              </Label>
              <div className='col-span-3 space-y-1'>
                <Input
                  id='code'
                  placeholder='e.g. LW-…'
                  value={productForm.code || ''}
                  onChange={(e) =>
                    setProductForm({ ...productForm, code: e.target.value })
                  }
                />
                {!editingProduct && (
                  <p className='text-xs text-muted-foreground'>
                    A code is generated for new products; you can edit it before
                    saving.
                  </p>
                )}
              </div>
            </div>
            <div className='grid grid-cols-4 items-start gap-4'>
              <Label className='text-right pt-2'>Product image</Label>
              <div className='col-span-3 space-y-2'>
                <input
                  ref={inventoryImageGalleryRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  className='hidden'
                  onChange={handleImageChange}
                  aria-hidden
                />
                <input
                  ref={inventoryImageCameraRef}
                  type='file'
                  accept='image/*'
                  capture='environment'
                  className='hidden'
                  onChange={handleImageChange}
                  aria-hidden
                />
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => inventoryImageGalleryRef.current?.click()}
                  >
                    Choose file
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => inventoryImageCameraRef.current?.click()}
                    className='gap-1.5'
                  >
                    <Camera className='h-4 w-4' />
                    Take photo
                  </Button>
                </div>
                <p className='text-xs text-muted-foreground'>
                  Upload or capture a photo (max 5 MB). Stored in Firebase
                  Storage; the download link is saved on the product.
                </p>
                {(imagePreview || productForm.imageUrl) && (
                  <div className='relative w-36 h-36 border rounded-md overflow-hidden bg-muted/30'>
                    <img
                      src={imagePreview || productForm.imageUrl || ''}
                      alt='Preview'
                      className='w-full h-full object-cover'
                    />
                  </div>
                )}
                {imageFile && (
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={clearSelectedImage}
                    >
                      Clear new image
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='expiryDate' className='text-right'>
                Expiry Date
              </Label>
              <Input
                id='expiryDate'
                type='date'
                value={
                  productForm.expiryDate
                    ? new Date(productForm.expiryDate)
                        .toISOString()
                        .split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    expiryDate: e.target.value
                      ? new Date(e.target.value).getTime()
                      : undefined,
                  })
                }
                className='col-span-3'
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveProduct} disabled={uploadingImage}>
              {uploadingImage ? 'Uploading...' : 'Save Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Edit Dialog */}
      <Dialog
        open={isOrderEditDialogOpen}
        onOpenChange={setIsOrderEditDialogOpen}
      >
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              Edit Order #
              {editingOrder ? formatOrderLabel(editingOrder) : ''}
            </DialogTitle>
            <DialogDescription>
              Modify items, quantities, or remove items from this order.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            {editedOrderItems.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>
                No items in order
              </p>
            ) : (
              editedOrderItems.map((item) => {
                const live = products.find((x) => x.id === item.id);
                const lineMax = live
                  ? maxOrderLineQty(live, item.quantity)
                  : item.quantity;
                return (
                  <div
                    key={item.id}
                    className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg'
                  >
                    <div className='flex-1 min-w-0'>
                      <p className='font-medium'>{item.name}</p>
                      <p className='text-sm text-muted-foreground'>
                        ₵{item.price.toFixed(2)} per {item.unit}
                      </p>
                      {editingOrder?.stockReserved && live && (
                        <p className='text-xs text-amber-800 mt-1'>
                          Max for this order: {lineMax} (sellable stock)
                        </p>
                      )}
                    </div>
                    <div className='flex items-center gap-3 shrink-0'>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                        >
                          -
                        </Button>
                        <Input
                          type='number'
                          min={1}
                          max={lineMax}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItemQuantity(
                              item.id,
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          className='w-16 text-center'
                        />
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() =>
                            updateItemQuantity(item.id, item.quantity + 1)
                          }
                          disabled={item.quantity >= lineMax}
                        >
                          +
                        </Button>
                      </div>
                      <p className='font-bold w-20 text-right tabular-nums'>
                        ₵{(item.price * item.quantity).toFixed(2)}
                      </p>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 text-destructive'
                        onClick={() => removeItemFromOrder(item.id)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            {editedOrderItems.length > 0 && (
              <div className='pt-4 border-t flex justify-between font-bold text-lg'>
                <span>New Total:</span>
                <span>
                  ₵
                  {editedOrderItems
                    .reduce((sum, item) => sum + item.price * item.quantity, 0)
                    .toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setIsOrderEditDialogOpen(false);
                setEditingOrder(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOrderEdit}
              disabled={editedOrderItems.length === 0}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff dashboard access (Firebase user → staff role) */}
      <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Edit staff access' : 'Grant staff app access'}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? 'Update what this person can do in the staff dashboard.'
                : 'Pick an existing user and promote them to staff with permissions.'}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            {editingStaff ? (
              <div>
                <Label className='text-sm font-medium'>Staff Member</Label>
                <p className='text-sm text-muted-foreground'>
                  {editingStaff.name || editingStaff.email}
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor='staff-user' className='text-sm font-medium'>
                  Select User
                </Label>
                <Select
                  value=''
                  onValueChange={(userId) => {
                    const user = users.find((u) => u.id === userId);
                    if (user) {
                      setEditingStaff(user);
                      setStaffPermissions(user.permissions || {
                        canManageInventory: false,
                        canViewOrders: false,
                        canUpdateStock: false,
                        canViewAnalytics: false,
                        canGenerateInvoices: false,
                      });
                    }
                  }}
                >
                  <SelectTrigger id='staff-user'>
                    <SelectValue placeholder='Select a user' />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((u) => u.role === 'client')
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className='space-y-3'>
              <Label className='text-sm font-medium'>Permissions</Label>
              <div className='space-y-3'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='canManageInventory'
                    checked={staffPermissions.canManageInventory}
                    onCheckedChange={(checked) =>
                      setStaffPermissions({
                        ...staffPermissions,
                        canManageInventory: checked === true,
                      })
                    }
                  />
                  <Label htmlFor='canManageInventory' className='text-sm font-normal cursor-pointer'>
                    Manage Inventory
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='canViewOrders'
                    checked={staffPermissions.canViewOrders}
                    onCheckedChange={(checked) =>
                      setStaffPermissions({
                        ...staffPermissions,
                        canViewOrders: checked === true,
                      })
                    }
                  />
                  <Label htmlFor='canViewOrders' className='text-sm font-normal cursor-pointer'>
                    View Orders
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='canUpdateStock'
                    checked={staffPermissions.canUpdateStock}
                    onCheckedChange={(checked) =>
                      setStaffPermissions({
                        ...staffPermissions,
                        canUpdateStock: checked === true,
                      })
                    }
                  />
                  <Label htmlFor='canUpdateStock' className='text-sm font-normal cursor-pointer'>
                    Update Stock
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='canViewAnalytics'
                    checked={staffPermissions.canViewAnalytics}
                    onCheckedChange={(checked) =>
                      setStaffPermissions({
                        ...staffPermissions,
                        canViewAnalytics: checked === true,
                      })
                    }
                  />
                  <Label htmlFor='canViewAnalytics' className='text-sm font-normal cursor-pointer'>
                    View Analytics
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='canGenerateInvoices'
                    checked={staffPermissions.canGenerateInvoices}
                    onCheckedChange={(checked) =>
                      setStaffPermissions({
                        ...staffPermissions,
                        canGenerateInvoices: checked === true,
                      })
                    }
                  />
                  <Label htmlFor='canGenerateInvoices' className='text-sm font-normal cursor-pointer'>
                    Generate Invoices
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setIsStaffDialogOpen(false);
                setEditingStaff(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveStaff} disabled={!editingStaff}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStaffHrAddOpen} onOpenChange={setIsStaffHrAddOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Add team member (HR)</DialogTitle>
            <DialogDescription>
              Creates an HR record for leave and loans. This does not create a
              login — use Grant app access for that.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='hr-add-name'>Name</Label>
              <Input
                id='hr-add-name'
                value={staffHrAddForm.name}
                onChange={(e) =>
                  setStaffHrAddForm({ ...staffHrAddForm, name: e.target.value })
                }
                placeholder='Full name'
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='hr-add-role'>Role / title</Label>
              <Input
                id='hr-add-role'
                value={staffHrAddForm.role}
                onChange={(e) =>
                  setStaffHrAddForm({ ...staffHrAddForm, role: e.target.value })
                }
                placeholder='e.g. Warehouse, Sales'
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='hr-add-phone'>Phone</Label>
              <Input
                id='hr-add-phone'
                value={staffHrAddForm.phone}
                onChange={(e) =>
                  setStaffHrAddForm({
                    ...staffHrAddForm,
                    phone: e.target.value,
                  })
                }
                placeholder='Contact number'
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='hr-add-loan'>Loan amount (₵)</Label>
              <Input
                id='hr-add-loan'
                inputMode='decimal'
                value={staffHrAddForm.loanPrincipal}
                onChange={(e) =>
                  setStaffHrAddForm({
                    ...staffHrAddForm,
                    loanPrincipal: e.target.value,
                  })
                }
                placeholder='0 — outstanding starts equal to this'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsStaffHrAddOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddStaffHrSubmit}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewStaffLoanOpen} onOpenChange={setIsNewStaffLoanOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>New loan</DialogTitle>
            <DialogDescription>
              Add another named loan for this person (separate balance and
              ledger).
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='new-loan-name'>Loan name / purpose</Label>
              <Input
                id='new-loan-name'
                value={newStaffLoanForm.name}
                onChange={(e) =>
                  setNewStaffLoanForm({
                    ...newStaffLoanForm,
                    name: e.target.value,
                  })
                }
                placeholder='e.g. Equipment advance'
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='new-loan-amt'>Initial amount (₵)</Label>
              <Input
                id='new-loan-amt'
                inputMode='decimal'
                value={newStaffLoanForm.amount}
                onChange={(e) =>
                  setNewStaffLoanForm({
                    ...newStaffLoanForm,
                    amount: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setIsNewStaffLoanOpen(false)}
            >
              Cancel
            </Button>
            <Button type='button' onClick={handleAddStaffLoanAccount}>
              Add loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!staffHrDraft}
        onOpenChange={(open) => {
          if (!open) setStaffHrDraft(null);
        }}
      >
        <DialogContent className='flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
          <DialogHeader className='shrink-0 px-6 pt-6 pb-2'>
            <DialogTitle>Manage team member</DialogTitle>
            <DialogDescription>
              Update profile, leave, and loan balance. Deductions, payments, and
              each Save details create dated lines in the loan ledger.
            </DialogDescription>
          </DialogHeader>
          {staffHrDraft && (
            <ScrollArea className='h-[min(72vh,calc(100vh-11rem))] max-h-[72vh] w-full shrink-0 px-6'>
              <div className='space-y-6 py-2 pb-6 pr-3'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label htmlFor='hr-name'>Name</Label>
                    <Input
                      id='hr-name'
                      value={staffHrDraft.name}
                      onChange={(e) =>
                        setStaffHrDraft({
                          ...staffHrDraft,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='hr-role'>Role / title</Label>
                    <Input
                      id='hr-role'
                      value={staffHrDraft.role}
                      onChange={(e) =>
                        setStaffHrDraft({
                          ...staffHrDraft,
                          role: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className='space-y-1 sm:col-span-2'>
                    <Label htmlFor='hr-phone'>Phone</Label>
                    <Input
                      id='hr-phone'
                      value={staffHrDraft.phone}
                      onChange={(e) =>
                        setStaffHrDraft({
                          ...staffHrDraft,
                          phone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className='space-y-1 sm:col-span-2 flex flex-wrap items-end gap-2'>
                    <div className='space-y-1 min-w-[220px] flex-1'>
                      <Label>Loan you are editing</Label>
                      <Select
                        value={
                          staffActiveLoanId ||
                          staffHrDraft.loanAccounts[0]?.id ||
                          ''
                        }
                        onValueChange={(v) => setStaffActiveLoanId(v)}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select loan' />
                        </SelectTrigger>
                        <SelectContent>
                          {staffHrDraft.loanAccounts.map((ac) => (
                            <SelectItem key={ac.id} value={ac.id}>
                              {ac.name} — out. ₵
                              {ac.loanOutstandingGHS.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='mb-0.5'
                      onClick={() => setIsNewStaffLoanOpen(true)}
                    >
                      New loan
                    </Button>
                  </div>
                  {staffHrActiveLoan ? (
                    <>
                      <div className='space-y-1'>
                        <Label htmlFor='hr-principal'>Loan principal (₵)</Label>
                        <Input
                          id='hr-principal'
                          inputMode='decimal'
                          value={String(staffHrActiveLoan.loanPrincipalGHS)}
                          onChange={(e) => {
                            const v = parseFloat(
                              e.target.value.replace(/,/g, '')
                            );
                            const lid = staffHrActiveLoan.id;
                            setStaffHrDraft({
                              ...staffHrDraft,
                              loanAccounts: staffHrDraft.loanAccounts.map(
                                (a) =>
                                  a.id === lid
                                    ? {
                                        ...a,
                                        loanPrincipalGHS: Number.isFinite(v)
                                          ? Math.max(0, v)
                                          : 0,
                                      }
                                    : a
                              ),
                            });
                          }}
                        />
                      </div>
                      <div className='space-y-1'>
                        <Label>Outstanding (₵)</Label>
                        <p className='text-lg font-semibold tabular-nums rounded-md border bg-muted/30 px-3 py-2'>
                          ₵{staffHrActiveLoan.loanOutstandingGHS.toFixed(2)}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          Adjusted by payments and deductions — not edited
                          directly.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
                <Button type='button' onClick={handleSaveStaffHrDetails}>
                  Save details
                </Button>
                <p className='text-xs text-muted-foreground'>
                  Saves profile and the selected loan&apos;s principal. A
                  &quot;Book&quot; line is added when principal or outstanding
                  changed since the last snapshot (outstanding changes via
                  pay/deduct below).
                </p>

                {staffHrActiveLoan ? (
                  <div className='rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3'>
                    <p className='text-sm font-medium'>
                      Pay toward &quot;{staffHrActiveLoan.name}&quot;
                    </p>
                    <div className='grid gap-2 sm:grid-cols-3'>
                      <div className='space-y-1'>
                        <Label htmlFor='quick-pay-amt'>Amount (₵)</Label>
                        <Input
                          id='quick-pay-amt'
                          inputMode='decimal'
                          value={loanPayForm.amount}
                          onChange={(e) =>
                            setLoanPayForm({
                              ...loanPayForm,
                              amount: e.target.value,
                            })
                          }
                          placeholder='Amount paid'
                        />
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='quick-pay-date'>Date</Label>
                        <Input
                          id='quick-pay-date'
                          type='date'
                          value={loanPayForm.date}
                          onChange={(e) =>
                            setLoanPayForm({
                              ...loanPayForm,
                              date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className='space-y-1 sm:col-span-3'>
                        <Label htmlFor='quick-pay-note'>Note (optional)</Label>
                        <Input
                          id='quick-pay-note'
                          value={loanPayForm.note}
                          onChange={(e) =>
                            setLoanPayForm({
                              ...loanPayForm,
                              note: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <Button
                      type='button'
                      size='sm'
                      onClick={handleRecordLoanPayment}
                    >
                      Apply payment to outstanding
                    </Button>
                    <p className='text-xs text-muted-foreground'>
                      Each payment is a separate dated line in the loan ledger
                      with this amount.
                    </p>
                  </div>
                ) : null}

                <Separator />

                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className='group flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/25 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40'>
                    <span className='flex items-center gap-2'>
                      <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                      Loan ledger ({staffFullLedger.length} lines)
                    </span>
                    <span className='text-xs font-normal text-muted-foreground tabular-nums'>
                      {staffHrActiveLoan
                        ? `This loan paid: ₵${Math.max(
                            0,
                            staffHrActiveLoan.loanPrincipalGHS -
                              staffHrActiveLoan.loanOutstandingGHS
                          ).toFixed(2)} · All loans out.: ₵${hrTotalOutstandingGHS(staffHrDraft).toFixed(2)}`
                        : ''}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className='space-y-2 pt-3'>
                    <p className='text-xs text-muted-foreground'>
                      Deductions, payments, and book updates — each with its own
                      date.
                    </p>
                    <ul className='max-h-[min(50vh,280px)] divide-y overflow-y-auto rounded-md border text-sm'>
                      {staffFullLedger.length === 0 ? (
                        <li className='p-3 text-muted-foreground'>
                          No entries yet. Record a deduction/payment or save
                          details.
                        </li>
                      ) : (
                        staffFullLedger.map((row) => (
                          <li
                            key={`${row.kind}-${row.id}`}
                            className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                          >
                            <span className='min-w-0'>
                              <span className='block text-[10px] font-medium text-muted-foreground mb-0.5'>
                                {row.loanName}
                              </span>
                              {row.kind === 'book' ? (
                                <>
                                  <Badge variant='outline' className='mr-2'>
                                    Book
                                  </Badge>
                                  <span className='text-muted-foreground'>
                                    {format(row.at, 'MMM d, yyyy')}
                                  </span>
                                  {row.note ? ` · ${row.note}` : ''}
                                  <span className='block text-xs text-muted-foreground mt-0.5'>
                                    Principal ₵{row.principal.toFixed(2)} ·
                                    Outstanding ₵{row.outstanding.toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Badge
                                    variant={
                                      row.kind === 'deduction'
                                        ? 'secondary'
                                        : 'outline'
                                    }
                                    className='mr-2'
                                  >
                                    {row.kind === 'deduction'
                                      ? 'Deduction'
                                      : 'Payment'}
                                  </Badge>
                                  {format(row.at, 'MMM d, yyyy')}
                                  {row.note ? ` · ${row.note}` : ''}
                                </>
                              )}
                            </span>
                            {row.kind !== 'book' ? (
                              <span className='shrink-0 font-medium tabular-nums'>
                                −₵{row.amount.toFixed(2)}
                              </span>
                            ) : null}
                          </li>
                        ))
                      )}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className='group flex w-full items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40'>
                    <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180' />
                    Leave ·{' '}
                    {totalLeaveDaysInYear(
                      staffHrDraft.leavePeriods,
                      staffLeaveYear
                    )}{' '}
                    day
                    {totalLeaveDaysInYear(
                      staffHrDraft.leavePeriods,
                      staffLeaveYear
                    ) === 1
                      ? ''
                      : 's'}{' '}
                    in {staffLeaveYear} · {staffHrDraft.leavePeriods.length}{' '}
                    period(s)
                  </CollapsibleTrigger>
                  <CollapsibleContent className='space-y-3 pt-3'>
                  <div className='flex flex-wrap items-end gap-3'>
                    <div className='space-y-1'>
                      <Label htmlFor='leave-year'>Calendar year</Label>
                      <Input
                        id='leave-year'
                        type='number'
                        className='w-28'
                        value={staffLeaveYear}
                        onChange={(e) => {
                          const y = parseInt(e.target.value, 10);
                          if (Number.isFinite(y))
                            setStaffLeaveYear(y);
                        }}
                      />
                    </div>
                    <p className='text-sm pb-2'>
                      <strong>
                        {totalLeaveDaysInYear(
                          staffHrDraft.leavePeriods,
                          staffLeaveYear
                        )}
                      </strong>{' '}
                      day
                      {totalLeaveDaysInYear(
                        staffHrDraft.leavePeriods,
                        staffLeaveYear
                      ) === 1
                        ? ''
                        : 's'}{' '}
                      in {staffLeaveYear}
                    </p>
                  </div>
                  <div className='grid gap-2 sm:grid-cols-3'>
                    <div className='space-y-1'>
                      <Label>Start</Label>
                      <Input
                        type='date'
                        value={newLeaveForm.start}
                        onChange={(e) =>
                          setNewLeaveForm({
                            ...newLeaveForm,
                            start: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label>End</Label>
                      <Input
                        type='date'
                        value={newLeaveForm.end}
                        onChange={(e) =>
                          setNewLeaveForm({
                            ...newLeaveForm,
                            end: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className='space-y-1 sm:col-span-3'>
                      <Label>Note (optional)</Label>
                      <Input
                        value={newLeaveForm.note}
                        onChange={(e) =>
                          setNewLeaveForm({
                            ...newLeaveForm,
                            note: e.target.value,
                          })
                        }
                        placeholder='Vacation, sick leave, etc.'
                      />
                    </div>
                  </div>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={handleAddStaffLeavePeriod}
                  >
                    Add leave period
                  </Button>
                  <ul className='space-y-2 text-sm'>
                    {staffHrDraft.leavePeriods.length === 0 ? (
                      <li className='text-muted-foreground'>No periods yet.</li>
                    ) : (
                      [...staffHrDraft.leavePeriods]
                        .sort((a, b) => a.startDate.localeCompare(b.startDate))
                        .map((p) => (
                          <li
                            key={p.id}
                            className='flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2'
                          >
                            <span>
                              {p.startDate} → {p.endDate} (
                              {leaveDaysInclusive(p.startDate, p.endDate)} days)
                              {p.note ? ` · ${p.note}` : ''}
                            </span>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='text-destructive'
                              onClick={() => handleRemoveStaffLeavePeriod(p.id)}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </li>
                        ))
                    )}
                  </ul>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>
                    Payroll / monthly deduction (selected loan)
                  </h3>
                  <div className='grid gap-3 sm:grid-cols-1 max-w-md'>
                    <div className='rounded-lg border p-3 space-y-2'>
                      <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                        Deduct from outstanding
                      </p>
                      <div className='space-y-1'>
                        <Label htmlFor='ded-amt'>Amount (₵)</Label>
                        <Input
                          id='ded-amt'
                          inputMode='decimal'
                          value={loanDedForm.amount}
                          onChange={(e) =>
                            setLoanDedForm({
                              ...loanDedForm,
                              amount: e.target.value,
                            })
                          }
                          placeholder='e.g. 500'
                        />
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='ded-date'>Date</Label>
                        <Input
                          id='ded-date'
                          type='date'
                          value={loanDedForm.date}
                          onChange={(e) =>
                            setLoanDedForm({
                              ...loanDedForm,
                              date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='ded-note'>Note (optional)</Label>
                        <Input
                          id='ded-note'
                          value={loanDedForm.note}
                          onChange={(e) =>
                            setLoanDedForm({
                              ...loanDedForm,
                              note: e.target.value,
                            })
                          }
                        />
                      </div>
                      <Button
                        type='button'
                        size='sm'
                        onClick={handleRecordLoanDeduction}
                      >
                        Record deduction
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <Button
                  type='button'
                  variant='destructive'
                  onClick={handleDeleteStaffHr}
                >
                  Remove HR record
                </Button>
              </div>
            </ScrollArea>
          )}
          <DialogFooter className='shrink-0 border-t bg-background px-6 py-4'>
            <DialogClose asChild>
              <Button
                type='button'
                className='border-rose-200/80 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70'
              >
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pharmacySuperDraft}
        onOpenChange={(open) => {
          if (!open) setPharmacySuperDraft(null);
        }}
      >
        <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Manage pharmacy</DialogTitle>
            <DialogDescription>
              Update contact details, credit limit, and outstanding balance
              (unpaid on account). Outstanding normally updates when orders complete
              on credit and when payments are recorded — adjust here if you need to
              correct the books.
            </DialogDescription>
          </DialogHeader>
          {pharmacySuperDraft && (
            <div className='space-y-3 py-2'>
              <div className='space-y-1'>
                <Label htmlFor='ph-super-name'>Name</Label>
                <Input
                  id='ph-super-name'
                  value={pharmacySuperDraft.name}
                  onChange={(e) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='ph-super-loc'>Location</Label>
                <Input
                  id='ph-super-loc'
                  value={pharmacySuperDraft.location}
                  onChange={(e) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      location: e.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='ph-super-phone'>Phone</Label>
                <Input
                  id='ph-super-phone'
                  value={pharmacySuperDraft.phone}
                  onChange={(e) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      phone: e.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='ph-super-contact'>Contact person</Label>
                <Input
                  id='ph-super-contact'
                  value={pharmacySuperDraft.contactPerson}
                  onChange={(e) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      contactPerson: e.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label>Billing</Label>
                <Select
                  value={pharmacySuperDraft.customerBillingType}
                  onValueChange={(v) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      customerBillingType: v as 'cash' | 'credit',
                      allowsAccountCredit: v === 'credit',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>Cash pharmacy</SelectItem>
                    <SelectItem value='credit'>Credit pharmacy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {pharmacySuperDraft.customerBillingType === 'credit' && (
                <>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id='ph-super-allow'
                      checked={pharmacySuperDraft.allowsAccountCredit}
                      onCheckedChange={(c) =>
                        setPharmacySuperDraft({
                          ...pharmacySuperDraft,
                          allowsAccountCredit: c === true,
                        })
                      }
                    />
                    <Label htmlFor='ph-super-allow' className='font-normal'>
                      Allow purchases on account (enforce credit cap at checkout)
                    </Label>
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='ph-super-clim'>
                      Credit limit (₵) — per pharmacy
                    </Label>
                    <Input
                      id='ph-super-clim'
                      type='number'
                      min={0}
                      step={100}
                      value={pharmacySuperDraft.creditLimitGHS}
                      onChange={(e) =>
                        setPharmacySuperDraft({
                          ...pharmacySuperDraft,
                          creditLimitGHS: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='ph-super-cbal'>
                      Outstanding (₵) — unpaid on account; also updated by completed
                      credit orders and payments
                    </Label>
                    <Input
                      id='ph-super-cbal'
                      type='number'
                      min={0}
                      step={100}
                      value={pharmacySuperDraft.creditBalanceGHS}
                      onChange={(e) =>
                        setPharmacySuperDraft({
                          ...pharmacySuperDraft,
                          creditBalanceGHS: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='ph-super-pend'
                  checked={pharmacySuperDraft.pendingVerification}
                  onCheckedChange={(c) =>
                    setPharmacySuperDraft({
                      ...pharmacySuperDraft,
                      pendingVerification: c === true,
                    })
                  }
                />
                <Label htmlFor='ph-super-pend' className='font-normal'>
                  Pending verification (blocks treating as fully verified)
                </Label>
              </div>
            </div>
          )}
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              onClick={() => setPharmacySuperDraft(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePharmacySuperEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPharmacyOpen} onOpenChange={setAddPharmacyOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Add pharmacy</DialogTitle>
            <DialogDescription>
              Creates a Firestore row clients can be linked to. Use imports for
              bulk lists when possible.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='add-ph-name'>Name</Label>
              <Input
                id='add-ph-name'
                value={addPharmName}
                onChange={(e) => setAddPharmName(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='add-ph-loc'>Location (optional)</Label>
              <Input
                id='add-ph-loc'
                value={addPharmLocation}
                onChange={(e) => setAddPharmLocation(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='add-ph-phone'>Phone (optional)</Label>
              <Input
                id='add-ph-phone'
                value={addPharmPhone}
                onChange={(e) => setAddPharmPhone(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label>Billing</Label>
              <Select
                value={addPharmBilling}
                onValueChange={(v) =>
                  setAddPharmBilling(v as 'cash' | 'credit')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cash'>Cash pharmacy</SelectItem>
                  <SelectItem value='credit'>Credit pharmacy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addPharmBilling === 'credit' && (
              <div className='space-y-1'>
                <Label htmlFor='add-ph-cred'>
                  Credit limit (₵) — defaults to ₵
                  {DEFAULT_CREDIT_LIMIT_GHS.toLocaleString()}
                </Label>
                <Input
                  id='add-ph-cred'
                  type='number'
                  min={0}
                  step={100}
                  value={addPharmCreditLimit}
                  onChange={(e) => setAddPharmCreditLimit(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setAddPharmacyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPharmacySubmit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!proformaDialogOrder}
        onOpenChange={(open) => {
          if (!open) setProformaDialogOrder(null);
        }}
      >
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>Send proforma to client</DialogTitle>
            <DialogDescription>
              The customer will get a notification to review this order, confirm or
              edit line items, and choose pickup or delivery. Adjust line items
              first with &quot;Edit / adjust proforma lines&quot; if needed.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Label htmlFor='proforma-note'>Note for customer</Label>
            <Textarea
              id='proforma-note'
              rows={5}
              value={proformaNoteDraft}
              onChange={(e) => setProformaNoteDraft(e.target.value)}
              placeholder={DEFAULT_PROFORMA_NOTE}
            />
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setProformaDialogOrder(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSendProforma}
              disabled={sendingProforma}
            >
              {sendingProforma ? 'Sending…' : 'Send proforma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!paymentDialogOrder}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentDialogOrder(null);
            setPaymentAmountInput('');
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Enter the amount received now (partial or full). Balance updates for
              the customer immediately.
            </DialogDescription>
          </DialogHeader>
          {paymentDialogOrder && (
            <div className='space-y-3 py-2 text-sm'>
              <p className='text-muted-foreground'>
                Order {formatOrderLabel(paymentDialogOrder)}
              </p>
              <p>
                Order total: ₵
                {(
                  paymentDialogOrder.total +
                  (paymentDialogOrder.deliveryFee || 0)
                ).toFixed(2)}
              </p>
              <p>
                Already paid: ₵
                {(() => {
                  const g =
                    paymentDialogOrder.total +
                    (paymentDialogOrder.deliveryFee || 0);
                  const p =
                    paymentDialogOrder.accountingStatus === 'paid' &&
                    (paymentDialogOrder.amountPaidGHS == null ||
                      paymentDialogOrder.amountPaidGHS === undefined)
                      ? g
                      : (paymentDialogOrder.amountPaidGHS ?? 0);
                  return p.toFixed(2);
                })()}
              </p>
              <div className='space-y-2'>
                <Label htmlFor='pay-amt'>Amount to record (₵)</Label>
                <Input
                  id='pay-amt'
                  type='number'
                  min={0}
                  step={0.01}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setPaymentDialogOrder(null);
                setPaymentAmountInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitPaymentRecording}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!directPaymentOrder}
        onOpenChange={(open) => {
          if (!open) {
            setDirectPaymentOrder(null);
            setDirectPaidInput('');
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Set total paid</DialogTitle>
            <DialogDescription>
              Enter the total amount this customer has paid so far for this order
              (including partial payments). Balance updates for them immediately.
            </DialogDescription>
          </DialogHeader>
          {directPaymentOrder && (
            <div className='space-y-3 py-2 text-sm'>
              <p className='text-muted-foreground'>
                Order {formatOrderLabel(directPaymentOrder)}
              </p>
              <p>
                Order total: ₵
                {(
                  directPaymentOrder.total +
                  (directPaymentOrder.deliveryFee || 0)
                ).toFixed(2)}
              </p>
              <div className='space-y-2'>
                <Label htmlFor='direct-paid'>Total paid to date (₵)</Label>
                <Input
                  id='direct-paid'
                  type='text'
                  inputMode='decimal'
                  value={directPaidInput}
                  onChange={(e) => setDirectPaidInput(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setDirectPaymentOrder(null);
                setDirectPaidInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveDirectPaidAmount()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmDialog.open}
        onOpenChange={(open) =>
          setDeleteConfirmDialog({ open, productId: null, productName: '' })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this product? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className='py-4'>
            <p className='font-medium'>
              Product: {deleteConfirmDialog.productName}
            </p>
            <p className='text-sm text-muted-foreground mt-2'>
              This will permanently remove the product from your inventory. If
              you want to hide it from customers instead, use the hide/show
              button.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() =>
                setDeleteConfirmDialog({
                  open: false,
                  productId: null,
                  productName: '',
                })
              }
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={confirmDeleteProduct}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
