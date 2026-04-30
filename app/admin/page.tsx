'use client';

import { DialogDescription } from '@/components/ui/dialog';

import { useEffect, useState, useMemo } from 'react';
import {
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  getDoc,
  increment,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Order, Product, CartItem, ProductReturn } from '@/types';
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
  Eye,
  EyeOff,
  Building2,
  PackageMinus,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { Pharmacy } from '@/types';
import {
  SEED_PHARMACIES,
  ensurePharmacyDocument,
  currentMonthKey,
} from '@/lib/pharmacies';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import type { User } from '@/types';
import { PRODUCT_CATEGORIES } from '@/lib/categories';
import { createOrderStatusNotification } from '@/lib/notifications';
import { printOrderInvoice } from '@/lib/print-invoice';
import {
  INVENTORY_LETTER_OPTIONS,
  getFirstCharacterGroup,
} from '@/lib/inventory-filters';
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
  maxOrderLineQty,
  releaseReservedForOrder,
  validateItemChangeAgainstStock,
} from '@/lib/stock-reservation';
import {
  availableToSell,
  reservedForOrders,
  wholesaleOnHand,
} from '@/lib/inventory-availability';

export default function AdminDashboard() {
  const { isSuperAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('orders');

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

  const [pharmacyLimitDialog, setPharmacyLimitDialog] = useState<Pharmacy | null>(
    null
  );
  const [pharmacyLimitInput, setPharmacyLimitInput] = useState('');
  const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
  const [proformaDialogOrder, setProformaDialogOrder] = useState<Order | null>(
    null
  );
  const [proformaNoteDraft, setProformaNoteDraft] = useState('');
  const [sendingProforma, setSendingProforma] = useState(false);

  const [returnsList, setReturnsList] = useState<ProductReturn[]>([]);
  const [inventorySubTab, setInventorySubTab] = useState<
    'products' | 'returns' | 'payments'
  >('products');
  const [inventoryLetterFilter, setInventoryLetterFilter] = useState<
    (typeof INVENTORY_LETTER_OPTIONS)[number]
  >('all');
  const [inventorySortMode, setInventorySortMode] = useState<
    'default' | 'az' | 'code'
  >('default');
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<Order | null>(
    null
  );
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [directPaymentOrder, setDirectPaymentOrder] = useState<Order | null>(
    null
  );
  const [directPaidInput, setDirectPaidInput] = useState('');
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    productId: '',
    quantity: 1,
    reason: '',
    orderId: '',
    notes: '',
  });

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
    if (inventoryLetterFilter === 'all') return sortedInventoryProducts;
    return sortedInventoryProducts.filter(
      (p) => getFirstCharacterGroup(p.name || '') === inventoryLetterFilter
    );
  }, [sortedInventoryProducts, inventoryLetterFilter]);

  const ordersForPaymentsTab = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    // Listen to Orders
    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );
    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
    });

    // Listen to Inventory
    // const inventoryQuery = query(collection(db, 'inventory'), orderBy('name'));
    const inventoryQuery = query(collection(db, 'inventory'))
    const unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
      setProducts(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
      );
      setLoading(false);
    });

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
      },
      (err) => console.error('pharmacies snapshot', err)
    );

    const unsubReturns = onSnapshot(
      collection(db, 'returns'),
      (snapshot) => {
        setReturnsList(
          snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as ProductReturn)
          )
        );
      },
      (err) => console.error('returns snapshot', err)
    );

    return () => {
      unsubOrders();
      unsubInventory();
      unsubPharmacies();
      unsubReturns();
    };
  }, []);

  useEffect(() => {
    if (!db || activeTab !== 'pharmacies') return;
    (async () => {
      for (const p of SEED_PHARMACIES) {
        try {
          await ensurePharmacyDocument(db, p.id, p.name);
        } catch (e) {
          console.error('seed pharmacy', p.id, e);
        }
      }
    })();
  }, [activeTab]);

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

  const handleSavePharmacyLimit = async () => {
    if (!db || !pharmacyLimitDialog || !isSuperAdmin) return;
    const n = parseFloat(pharmacyLimitInput.replace(/,/g, ''));
    if (Number.isNaN(n) || n < 0) {
      toast.error('Enter a valid limit in Ghana cedis.');
      return;
    }
    try {
      await updateDoc(doc(db, 'pharmacies', pharmacyLimitDialog.id), {
        monthlyLimitGHS: n,
        updatedAt: Date.now(),
      });
      toast.success('Monthly limit updated.');
      setPharmacyLimitDialog(null);
    } catch (error) {
      console.error('Error updating pharmacy limit:', error);
      toast.error('Failed to update limit.');
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

  const logProductReturn = async () => {
    if (!db) return;
    const p = products.find((x) => x.id === returnForm.productId);
    if (!p || returnForm.quantity < 1) {
      toast.error('Select a product and quantity');
      return;
    }
    try {
      const reason = returnForm.reason.trim();
      const orderId = returnForm.orderId.trim();
      const notes = returnForm.notes.trim();
      await addDoc(collection(db, 'returns'), {
        productId: p.id,
        productName: p.name,
        quantity: returnForm.quantity,
        ...(reason ? { reason } : {}),
        ...(orderId ? { orderId } : {}),
        ...(notes ? { notes } : {}),
        status: 'pending',
        createdAt: Date.now(),
      });
      toast.success('Return logged');
      setReturnDialogOpen(false);
      setReturnForm({
        productId: '',
        quantity: 1,
        reason: '',
        orderId: '',
        notes: '',
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to log return');
    }
  };

  const restockReturn = async (r: ProductReturn) => {
    if (!db || r.status !== 'pending') return;
    try {
      const pref = doc(db, 'inventory', r.productId);
      const ps = await getDoc(pref);
      if (!ps.exists()) {
        toast.error('Product not found');
        return;
      }
      const d = ps.data()!;
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (d.wholesaleStock !== undefined && d.wholesaleStock !== null) {
        patch.wholesaleStock = increment(r.quantity);
      } else {
        patch.stock = increment(r.quantity);
      }
      const batch = writeBatch(db);
      batch.update(pref, patch as UpdateData<DocumentData>);
      batch.update(doc(db, 'returns', r.id), {
        status: 'restocked',
        updatedAt: Date.now(),
      });
      await batch.commit();
      toast.success('Return added back to wholesale stock');
    } catch (e) {
      console.error(e);
      toast.error('Failed to restock');
    }
  };

  const disposeReturn = async (r: ProductReturn) => {
    if (!db || r.status !== 'pending') return;
    try {
      await updateDoc(doc(db, 'returns', r.id), {
        status: 'disposed',
        updatedAt: Date.now(),
      });
      toast.success('Return marked disposed');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update return');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
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
          // Sanitize product name for filename
          const sanitizedName = (productForm.name || 'product')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .toUpperCase()
            .substring(0, 50);
          
          // Use inventoryImages folder and product name-based filename
          const fileExtension = imageFile.name.split('.').pop() || 'jpg';
          const fileName = `${sanitizedName}.${fileExtension}`;
          const imageRef = ref(storage, `inventoryImages/${fileName}`);
          
          await uploadBytes(imageRef, imageFile);
          imageUrl = await getDownloadURL(imageRef);
          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('Error uploading image:', error);
          toast.error('Failed to upload image');
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

  // Filter orders
  const filteredOrders = orders.filter((order) => {
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
    const matchesSearch =
      !searchQuery ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    return matchesStatus && matchesUser && matchesProduct && matchesSearch;
  });

  /** Revenue & units sold: recognized when orders are completed (aligns with stock out). */
  const analyticsOrderIncluded = (o: Order) => o.status === 'completed';

  // Analytics calculations
  const productSales = products.map((product) => {
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
  });

  const topSellingProducts = [...productSales]
    .filter((p) => p.soldQuantity > 0)
    .sort((a, b) => b.soldQuantity - a.soldQuantity)
    .slice(0, 10);

  const leastSellingProducts = [...productSales]
    .filter((p) => p.soldQuantity === 0)
    .slice(0, 10);

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

  const filteredPharmacies = pharmacies.filter((p) => {
    const q = pharmacySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  });

  const handleVerifyPharmacy = async (p: Pharmacy) => {
    if (!db || !isSuperAdmin) return;
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
    <div className='space-y-8'>
      <div className='flex flex-col md:flex-row justify-between md:items-center gap-4'>
        <h1 className='text-3xl font-serif font-bold text-primary'>
          Admin Dashboard
        </h1>
        <div className='flex gap-2'>
          <Button onClick={() => openProductDialog()}>
            <Plus className='mr-2 h-4 w-4' /> Add Product
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
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

      <div className='grid gap-4 md:grid-cols-3'>
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
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{products.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
        <TabsList className='w-full justify-start h-12 bg-muted/50 p-1'>
          <TabsTrigger value='orders' className='h-full px-6'>
            Manage Orders
          </TabsTrigger>
          <TabsTrigger value='history' className='h-full px-6'>
            Order History
          </TabsTrigger>
          <TabsTrigger value='analytics' className='h-full px-6'>
            Analytics
          </TabsTrigger>
          <TabsTrigger value='inventory' className='h-full px-6'>
            Manage Inventory
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value='staff' className='h-full px-6'>
              Staff Management
            </TabsTrigger>
          )}
          <TabsTrigger value='pharmacies' className='h-full px-6'>
            <Building2 className='inline h-4 w-4 mr-1.5 align-text-bottom' />
            Pharmacies
          </TabsTrigger>
        </TabsList>

        <TabsContent value='orders' className='mt-6 space-y-6'>
          {/* Status Filter Tabs */}
          <div className='flex flex-wrap gap-2 border-b pb-4'>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size='sm'
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
              variant={
                statusFilter === 'checking_stock' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('checking_stock')}
            >
              Legacy: checking stock (
              {orders.filter((o) => o.status === 'checking_stock').length})
            </Button>
            <Button
              variant={
                statusFilter === 'pharmacy_confirmed' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('pharmacy_confirmed')}
            >
              Legacy: old verify (
              {orders.filter((o) => o.status === 'pharmacy_confirmed').length})
            </Button>
            <Button
              variant={
                statusFilter === 'customer_confirmed' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('customer_confirmed')}
            >
              Legacy: old confirmed (
              {orders.filter((o) => o.status === 'customer_confirmed').length})
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

          <div className='space-y-4'>
            {filteredOrders.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                {statusFilter === 'all'
                  ? 'No orders found.'
                  : `No orders with status: ${statusFilter.replace('_', ' ')}.`}
              </div>
            ) : (
              filteredOrders.map((order) => (
                <Card key={order.id} className='overflow-hidden'>
                  <CardHeader className='bg-secondary/30 py-4 flex flex-row flex-wrap items-center justify-between gap-2'>
                    <div>
                      <CardTitle className='text-base font-mono'>
                        Order {formatOrderLabel(order)}
                      </CardTitle>
                      <CardDescription>
                        {getUserName(order.userId)} •{' '}
                        {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                      </CardDescription>
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
                  </CardHeader>
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
                                {order.paymentMethod === 'momo'
                                  ? 'Mobile Money (Momo)'
                                  : 'Cash'}
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
                            Record invoice sent
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
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value='history' className='mt-6 space-y-6'>
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
                <SelectItem value='checking_stock'>Legacy: checking stock</SelectItem>
                <SelectItem value='pharmacy_confirmed'>
                  Legacy: pharmacy confirmed
                </SelectItem>
                <SelectItem value='customer_confirmed'>
                  Legacy: customer confirmed
                </SelectItem>
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

          <div className='space-y-4'>
            {filteredOrders.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                No orders found matching your filters.
              </div>
            ) : (
              filteredOrders.map((order) => (
                <Card key={order.id} className='overflow-hidden'>
                  <CardHeader className='bg-secondary/30 py-4 flex flex-row items-center justify-between'>
                    <div>
                      <CardTitle className='text-base font-mono'>
                        Order {formatOrderLabel(order)}
                      </CardTitle>
                      <CardDescription>
                        {getUserName(order.userId)} •{' '}
                        {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                      </CardDescription>
                    </div>
                    <div className='flex items-center gap-4'>
                      <span className='font-bold'>
                        ₵{(order.total + (order.deliveryFee || 0)).toFixed(2)}
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
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => generateInvoice(order)}
                      >
                        <Download className='mr-2 h-4 w-4' />
                        Invoice
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className='p-6'>
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
                            <p>Delivery Fee: ₵{order.deliveryFee.toFixed(2)}</p>
                          )}
                          {order.paymentMethod && (
                            <p>
                              Payment:{' '}
                              {order.paymentMethod === 'momo'
                                ? 'Mobile Money (Momo)'
                                : 'Cash'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
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

          {/* Expiry Tracking */}
          <div className='grid gap-6 md:grid-cols-3'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <AlertTriangle className='h-5 w-5 text-red-600' />
                  Expiring in 1 Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                {products
                  .filter((p) => {
                    if (!p.expiryDate) return false;
                    const expiry = new Date(p.expiryDate);
                    const oneMonthFromNow = new Date();
                    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
                    return expiry <= oneMonthFromNow && expiry > new Date();
                  })
                  .length === 0 ? (
                  <p className='text-muted-foreground text-center py-4'>
                    No products expiring soon
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {products
                      .filter((p) => {
                        if (!p.expiryDate) return false;
                        const expiry = new Date(p.expiryDate);
                        const oneMonthFromNow = new Date();
                        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
                        return expiry <= oneMonthFromNow && expiry > new Date();
                      })
                      .map((product) => (
                        <div
                          key={product.id}
                          className='flex justify-between items-center p-2 border rounded text-sm'
                        >
                          <div>
                            <p className='font-medium'>{product.name}</p>
                            <p className='text-xs text-muted-foreground'>
                              {format(new Date(product.expiryDate!), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge variant='destructive' className='text-xs'>
                            {Math.ceil(
                              (product.expiryDate! - Date.now()) /
                                (1000 * 60 * 60 * 24)
                            )}{' '}
                            days
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Calendar className='h-5 w-5 text-orange-600' />
                  Expiring in 3 Months
                </CardTitle>
              </CardHeader>
              <CardContent>
                {products
                  .filter((p) => {
                    if (!p.expiryDate) return false;
                    const expiry = new Date(p.expiryDate);
                    const threeMonthsFromNow = new Date();
                    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
                    return (
                      expiry <= threeMonthsFromNow &&
                      expiry > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    );
                  })
                  .length === 0 ? (
                  <p className='text-muted-foreground text-center py-4'>
                    No products expiring in 3 months
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {products
                      .filter((p) => {
                        if (!p.expiryDate) return false;
                        const expiry = new Date(p.expiryDate);
                        const threeMonthsFromNow = new Date();
                        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
                        return (
                          expiry <= threeMonthsFromNow &&
                          expiry > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        );
                      })
                      .slice(0, 5)
                      .map((product) => (
                        <div
                          key={product.id}
                          className='flex justify-between items-center p-2 border rounded text-sm'
                        >
                          <div>
                            <p className='font-medium'>{product.name}</p>
                            <p className='text-xs text-muted-foreground'>
                              {format(new Date(product.expiryDate!), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge variant='outline' className='text-xs'>
                            {Math.ceil(
                              (product.expiryDate! - Date.now()) /
                                (1000 * 60 * 60 * 24)
                            )}{' '}
                            days
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Calendar className='h-5 w-5 text-blue-600' />
                  Expiring in 6 Months
                </CardTitle>
              </CardHeader>
              <CardContent>
                {products
                  .filter((p) => {
                    if (!p.expiryDate) return false;
                    const expiry = new Date(p.expiryDate);
                    const sixMonthsFromNow = new Date();
                    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
                    return (
                      expiry <= sixMonthsFromNow &&
                      expiry > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    );
                  })
                  .length === 0 ? (
                  <p className='text-muted-foreground text-center py-4'>
                    No products expiring in 6 months
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {products
                      .filter((p) => {
                        if (!p.expiryDate) return false;
                        const expiry = new Date(p.expiryDate);
                        const sixMonthsFromNow = new Date();
                        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
                        return (
                          expiry <= sixMonthsFromNow &&
                          expiry > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                        );
                      })
                      .slice(0, 5)
                      .map((product) => (
                        <div
                          key={product.id}
                          className='flex justify-between items-center p-2 border rounded text-sm'
                        >
                          <div>
                            <p className='font-medium'>{product.name}</p>
                            <p className='text-xs text-muted-foreground'>
                              {format(new Date(product.expiryDate!), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Badge variant='outline' className='text-xs'>
                            {Math.ceil(
                              (product.expiryDate! - Date.now()) /
                                (1000 * 60 * 60 * 24)
                            )}{' '}
                            days
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <TrendingUp className='h-5 w-5 text-green-600' />
                  Top Selling Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topSellingProducts.length === 0 ? (
                  <p className='text-muted-foreground text-center py-4'>
                    No sales data yet
                  </p>
                ) : (
                  <div className='space-y-3'>
                    {topSellingProducts.map(
                      ({ product, soldQuantity, revenue }) => (
                        <div
                          key={product.id}
                          className='flex justify-between items-center p-2 border rounded'
                        >
                          <div>
                            <p className='font-medium'>{product.name}</p>
                            <p className='text-xs text-muted-foreground'>
                              {soldQuantity} units sold
                            </p>
                          </div>
                          <div className='text-right'>
                            <p className='font-bold'>₵{revenue.toFixed(2)}</p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <TrendingDown className='h-5 w-5 text-yellow-600' />
                  Products Not Selling
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leastSellingProducts.length === 0 ? (
                  <p className='text-muted-foreground text-center py-4'>
                    All products have sales
                  </p>
                ) : (
                  <div className='space-y-3'>
                    {leastSellingProducts.map(({ product }) => (
                      <div
                        key={product.id}
                        className='flex justify-between items-center p-2 border rounded'
                      >
                        <div>
                          <p className='font-medium'>{product.name}</p>
                          <p className='text-xs text-muted-foreground'>
                            0 units sold
                          </p>
                        </div>
                        <Badge variant='outline' className='text-yellow-600'>
                          No Sales
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isSuperAdmin && (
        <TabsContent value='staff' className='mt-6 space-y-6'>
          <div className='flex justify-between items-center'>
            <h2 className='text-2xl font-serif font-bold'>Staff Management</h2>
            <Button onClick={() => {
              setEditingStaff(null);
              setStaffPermissions({
                canManageInventory: false,
                canViewOrders: false,
                canUpdateStock: false,
                canViewAnalytics: false,
                canGenerateInvoices: false,
              });
              setIsStaffDialogOpen(true);
            }}>
              <UserPlus className='mr-2 h-4 w-4' />
              Add Staff Member
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Staff Members</CardTitle>
              <CardDescription>
                Manage staff roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {users.filter((u) => u.role === 'staff').length === 0 ? (
                  <div className='text-center py-8 text-muted-foreground'>
                    No staff members yet
                  </div>
                ) : (
                  users
                    .filter((u) => u.role === 'staff')
                    .map((staff) => (
                      <Card key={staff.id}>
                        <CardContent className='p-4'>
                          <div className='flex items-center justify-between'>
                            <div className='flex-1'>
                              <h3 className='font-semibold'>{staff.name || staff.email}</h3>
                              <p className='text-sm text-muted-foreground'>{staff.email}</p>
                              <div className='flex flex-wrap gap-2 mt-2'>
                                {staff.permissions?.canManageInventory && (
                                  <Badge variant='outline'>Manage Inventory</Badge>
                                )}
                                {staff.permissions?.canViewOrders && (
                                  <Badge variant='outline'>View Orders</Badge>
                                )}
                                {staff.permissions?.canUpdateStock && (
                                  <Badge variant='outline'>Update Stock</Badge>
                                )}
                                {staff.permissions?.canViewAnalytics && (
                                  <Badge variant='outline'>View Analytics</Badge>
                                )}
                                {staff.permissions?.canGenerateInvoices && (
                                  <Badge variant='outline'>Generate Invoices</Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setEditingStaff(staff);
                                setStaffPermissions(staff.permissions || {
                                  canManageInventory: false,
                                  canViewOrders: false,
                                  canUpdateStock: false,
                                  canViewAnalytics: false,
                                  canGenerateInvoices: false,
                                });
                                setIsStaffDialogOpen(true);
                              }}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Permissions
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
          <div>
            <h2 className='text-2xl font-serif font-bold'>Pharmacy limits</h2>
            <p className='text-sm text-muted-foreground mt-1'>
              Monthly caps apply to total order value per pharmacy (rolling calendar
              month). Admins can view usage; only super admins can change limits or
              mark sign-up pharmacies as verified.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Monthly purchase limits</CardTitle>
              <CardDescription>
                Current month: {currentMonthKey()} · Spend resets each calendar month
                when the first order is placed.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='relative max-w-md'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search pharmacies by name or id…'
                  className='pl-9'
                  value={pharmacySearchQuery}
                  onChange={(e) => setPharmacySearchQuery(e.target.value)}
                />
              </div>
              <div className='rounded-md border overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b bg-muted/40 text-left'>
                      <th className='p-3 font-medium'>Pharmacy</th>
                      <th className='p-3 font-medium'>Status</th>
                      <th className='p-3 font-medium'>Month tracked</th>
                      <th className='p-3 font-medium text-right'>Spent (₵)</th>
                      <th className='p-3 font-medium text-right'>Limit (₵)</th>
                      <th className='p-3 font-medium text-right'>Remaining</th>
                      <th className='p-3 font-medium min-w-[9rem]'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacies.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className='p-8 text-center text-muted-foreground'
                        >
                          No pharmacy records yet. Open this tab again after
                          clients complete onboarding, or wait for sync.
                        </td>
                      </tr>
                    ) : filteredPharmacies.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className='p-8 text-center text-muted-foreground'
                        >
                          No pharmacies match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredPharmacies.map((p) => {
                        const mk = currentMonthKey();
                        const spend =
                          p.monthKey === mk ? p.monthSpendGHS ?? 0 : 0;
                        const limit = p.monthlyLimitGHS ?? 50_000;
                        const remaining = Math.max(0, limit - spend);
                        return (
                          <tr key={p.id} className='border-b last:border-0'>
                            <td className='p-3'>
                              <span className='font-medium'>{p.name}</span>
                              <p className='text-xs text-muted-foreground font-mono'>
                                {p.id}
                              </p>
                            </td>
                            <td className='p-3'>
                              {p.pendingVerification === true ? (
                                <Badge variant='secondary'>Pending review</Badge>
                              ) : (
                                <Badge
                                  variant='outline'
                                  className='bg-emerald-50 text-emerald-800 border-emerald-200'
                                >
                                  Verified
                                </Badge>
                              )}
                            </td>
                            <td className='p-3 text-muted-foreground'>
                              {p.monthKey || '—'}
                            </td>
                            <td className='p-3 text-right tabular-nums'>
                              {spend.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className='p-3 text-right tabular-nums'>
                              {limit.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className='p-3 text-right tabular-nums'>
                              {remaining.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className='p-3 text-right space-y-1'>
                              {isSuperAdmin && p.pendingVerification === true && (
                                <Button
                                  variant='secondary'
                                  size='sm'
                                  className='w-full'
                                  onClick={() => handleVerifyPharmacy(p)}
                                >
                                  Mark verified
                                </Button>
                              )}
                              {isSuperAdmin ? (
                                <Button
                                  variant='outline'
                                  size='sm'
                                  className='w-full'
                                  onClick={() => {
                                    setPharmacyLimitDialog(p);
                                    setPharmacyLimitInput(
                                      String(p.monthlyLimitGHS ?? 50_000)
                                    );
                                  }}
                                >
                                  Edit limit
                                </Button>
                              ) : (
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='inventory' className='mt-6 space-y-4'>
          <div className='flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center sm:justify-between'>
            <div className='flex gap-2'>
              <Button
                type='button'
                size='sm'
                variant={inventorySubTab === 'products' ? 'default' : 'outline'}
                onClick={() => setInventorySubTab('products')}
              >
                Products
              </Button>
              <Button
                type='button'
                size='sm'
                variant={inventorySubTab === 'returns' ? 'default' : 'outline'}
                onClick={() => setInventorySubTab('returns')}
                className='gap-1'
              >
                <PackageMinus className='h-4 w-4' />
                Returns
              </Button>
              <Button
                type='button'
                size='sm'
                variant={
                  inventorySubTab === 'payments' ? 'default' : 'outline'
                }
                onClick={() => setInventorySubTab('payments')}
              >
                Order payments
              </Button>
            </div>
            {inventorySubTab === 'products' && (
              <Select
                value={inventorySortMode}
                onValueChange={(v) =>
                  setInventorySortMode(v as 'default' | 'az' | 'code')
                }
              >
                <SelectTrigger className='w-[220px]'>
                  <SelectValue placeholder='Sort' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='default'>All (default order)</SelectItem>
                  <SelectItem value='az'>Alphabetical (A–Z)</SelectItem>
                  <SelectItem value='code'>By product code</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {inventorySubTab === 'products' && (
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm text-muted-foreground shrink-0'>
                Starts with:
              </span>
              <div className='flex flex-wrap gap-1.5'>
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
          )}

          {inventorySubTab === 'products' ? (
            <div className='rounded-md border bg-card'>
              <div className='hidden md:flex flex-row items-center gap-4 p-4 border-b font-medium text-sm text-muted-foreground bg-muted/20'>
                <div className='flex-1 min-w-0'>Product</div>
                <div className='w-28 text-right shrink-0'>Price</div>
                <div className='w-44 text-center shrink-0'>Stock</div>
                <div className='w-20 text-center shrink-0'>Storeroom</div>
                <div className='w-[120px] shrink-0 text-right'>Actions</div>
              </div>
              {inventoryProductsFiltered.map((product) => {
                const wholesaleStock = wholesaleOnHand(product);
                const inProcess = reservedForOrders(product);
                const avail = availableToSell(product);
                const storeroomStock = product.storeroomStock ?? 0;
                const totalStock = wholesaleStock + storeroomStock;
                const isLow = totalStock > 0 && totalStock < 10;
                return (
                  <div
                    key={product.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b last:border-0 hover:bg-muted/5 transition-colors ${
                      product.isHidden ? 'opacity-60 bg-muted/20' : ''
                    }`}
                  >
                    <div className='flex-1 min-w-0 space-y-1'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        {product.isHidden && (
                          <Badge variant='secondary' className='text-xs'>
                            Hidden
                          </Badge>
                        )}
                        <span
                          className='font-medium truncate'
                          title={product.name}
                        >
                          {product.name}
                        </span>
                      </div>
                      <p className='text-xs text-muted-foreground truncate'>
                        {product.category}
                        {product.code ? ` · ${product.code}` : ''}
                      </p>
                    </div>
                    <div className='flex flex-row flex-wrap sm:flex-nowrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end sm:ml-auto'>
                      <div className='w-28 text-right text-sm tabular-nums'>
                        ₵{product.price.toFixed(2)}
                      </div>
                      <div className='w-48 sm:w-44 text-center space-y-0.5'>
                        <Badge
                          variant={
                            avail === 0
                              ? 'destructive'
                              : isLow
                                ? 'secondary'
                                : 'outline'
                          }
                          className={
                            isLow
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                              : ''
                          }
                        >
                          {avail} sellable
                        </Badge>
                        <p className='text-[11px] text-amber-800 leading-tight'>
                          {inProcess} in process · {wholesaleStock} on shelf
                        </p>
                      </div>
                      <div className='w-16 flex justify-center'>
                        <Badge variant='outline'>{storeroomStock}</Badge>
                      </div>
                      <div className='flex justify-end gap-1 shrink-0'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => openProductDialog(product)}
                          title='Edit product'
                        >
                          <Edit className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => handleToggleProductVisibility(product)}
                          title={
                            product.isHidden ? 'Show product' : 'Hide product'
                          }
                        >
                          {product.isHidden ? (
                            <EyeOff className='h-4 w-4' />
                          ) : (
                            <Eye className='h-4 w-4' />
                          )}
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10'
                          onClick={() => handleDeleteProduct(product.id)}
                          title='Delete product permanently'
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : inventorySubTab === 'returns' ? (
            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
                <CardTitle>Customer returns</CardTitle>
                <Button onClick={() => setReturnDialogOpen(true)}>
                  Log return
                </Button>
              </CardHeader>
              <CardContent className='space-y-3'>
                {returnsList.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    No returns logged. Use Log return when stock is sent back from
                    a customer.
                  </p>
                ) : (
                  returnsList.map((r) => (
                    <div
                      key={r.id}
                      className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4 text-sm'
                    >
                      <div className='space-y-1'>
                        <p className='font-medium'>
                          {r.productName || r.productId} × {r.quantity}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {r.reason || 'No reason'}{' '}
                          {r.orderId ? `· Order: ${r.orderId}` : ''}
                        </p>
                        <Badge variant='outline'>{r.status}</Badge>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          size='sm'
                          variant='secondary'
                          disabled={r.status !== 'pending'}
                          onClick={() => restockReturn(r)}
                        >
                          Restock to wholesale
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={r.status !== 'pending'}
                          onClick={() => disposeReturn(r)}
                        >
                          Mark disposed
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Order payments</CardTitle>
                <CardDescription>
                  Set the total amount received per order. Paid and balance update
                  for the client as soon as you save.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2 max-h-[70vh] overflow-y-auto'>
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
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              Fill in the product details below.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='name' className='text-right'>
                Name
              </Label>
              <Input
                id='name'
                value={productForm.name}
                onChange={(e) =>
                  setProductForm({ ...productForm, name: e.target.value })
                }
                className='col-span-3'
              />
            </div>
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='category' className='text-right'>
                Category
              </Label>
              <Select
                value={productForm.category}
                onValueChange={(value) =>
                  setProductForm({ ...productForm, category: value })
                }
              >
                <SelectTrigger className='col-span-3'>
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
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='subCategory' className='text-right'>
                Sub Category
              </Label>
              <Input
                id='subCategory'
                placeholder='Optional subcategory'
                value={productForm.subCategory || ''}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    subCategory: e.target.value || undefined,
                  })
                }
                className='col-span-3'
              />
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
                  <div className='flex gap-2'>
                    <Input
                      id='transferQty'
                      type='number'
                      value={transferQty}
                      onChange={(e) =>
                        setTransferQty(Number.parseInt(e.target.value || '0', 10))
                      }
                      className='flex-1'
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
                  </div>
                  <div className='flex items-center justify-between gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        const qty = Math.max(0, transferQty || 0);
                        const from = productForm.wholesaleStock ?? productForm.stock ?? 0;
                        const move = Math.min(qty, from);
                        if (move <= 0) return;
                        const newWholesale = from - move;
                        const newStoreroom = (productForm.storeroomStock ?? 0) + move;
                        setProductForm({
                          ...productForm,
                          storeroomStock: newStoreroom,
                          wholesaleStock: newWholesale,
                          stock: newWholesale,
                        });
                        setTransferQty(0);
                      }}
                    >
                      Wholesale → Storeroom
                    </Button>
                    <div className='text-xs text-muted-foreground'>
                      Total:{' '}
                      {(productForm.wholesaleStock ?? productForm.stock ?? 0) +
                        (productForm.storeroomStock ?? 0)}
                    </div>
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
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='image' className='text-right'>
                Product Image
              </Label>
              <div className='col-span-3 space-y-2'>
                <Input
                  id='image'
                  type='file'
                  accept='image/*'
                  onChange={handleImageChange}
                  className='cursor-pointer'
                />
                {(imagePreview || productForm.imageUrl) && (
                  <div className='relative w-32 h-32 border rounded-md overflow-hidden'>
                    <img
                      src={imagePreview || productForm.imageUrl || ''}
                      alt='Preview'
                      className='w-full h-full object-cover'
                    />
                  </div>
                )}
                {productForm.imageUrl && !imageFile && (
                  <p className='text-xs text-muted-foreground'>
                    Current image URL: {productForm.imageUrl}
                  </p>
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

      {/* Staff Management Dialog */}
      <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Edit Staff Permissions' : 'Add Staff Member'}
            </DialogTitle>
            <DialogDescription>
              {editingStaff
                ? 'Update permissions for this staff member'
                : 'Select a user and set their permissions'}
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

      <Dialog
        open={!!pharmacyLimitDialog}
        onOpenChange={(open) => {
          if (!open) setPharmacyLimitDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Monthly purchase limit</DialogTitle>
            <DialogDescription>
              {pharmacyLimitDialog
                ? `Set the total order value cap for ${pharmacyLimitDialog.name} (calendar month, Ghana cedis).`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Label htmlFor='pharm-limit'>Limit (₵)</Label>
            <Input
              id='pharm-limit'
              type='number'
              min={0}
              step={100}
              value={pharmacyLimitInput}
              onChange={(e) => setPharmacyLimitInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setPharmacyLimitDialog(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePharmacyLimit}>Save</Button>
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

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Log product return</DialogTitle>
            <DialogDescription>
              Record returned stock. Use Restock to add quantity back to wholesale.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 py-2'>
            <div className='space-y-2'>
              <Label>Product</Label>
              <Select
                value={returnForm.productId}
                onValueChange={(v) =>
                  setReturnForm((f) => ({ ...f, productId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select product' />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ret-qty'>Quantity</Label>
              <Input
                id='ret-qty'
                type='number'
                min={1}
                value={returnForm.quantity}
                onChange={(e) =>
                  setReturnForm((f) => ({
                    ...f,
                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                  }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ret-reason'>Reason (optional)</Label>
              <Input
                id='ret-reason'
                value={returnForm.reason}
                onChange={(e) =>
                  setReturnForm((f) => ({ ...f, reason: e.target.value }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ret-oid'>Order id (optional)</Label>
              <Input
                id='ret-oid'
                value={returnForm.orderId}
                onChange={(e) =>
                  setReturnForm((f) => ({ ...f, orderId: e.target.value }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ret-notes'>Notes (optional)</Label>
              <Textarea
                id='ret-notes'
                rows={2}
                value={returnForm.notes}
                onChange={(e) =>
                  setReturnForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={logProductReturn}>Save</Button>
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
