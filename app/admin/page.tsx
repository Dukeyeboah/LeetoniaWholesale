'use client';

import { DialogDescription } from '@/components/ui/dialog';

import { useEffect, useState } from 'react';
import {
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Order, Product, CartItem } from '@/types';
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
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import type { User } from '@/types';
import { PRODUCT_CATEGORIES } from '@/lib/categories';
import { createOrderStatusNotification } from '@/lib/notifications';

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
    const inventoryQuery = query(collection(db, 'inventory'), orderBy('name'));
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

    return () => {
      unsubOrders();
      unsubInventory();
    };
  }, []);

  const openOrderEditDialog = (order: Order) => {
    setEditingOrder(order);
    setEditedOrderItems([...order.items]);
    setIsOrderEditDialogOpen(true);
  };

  const handleSaveOrderEdit = async () => {
    if (!db || !editingOrder) return;

    try {
      // Recalculate total
      const newTotal = editedOrderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      await updateDoc(doc(db, 'orders', editingOrder.id), {
        items: editedOrderItems,
        total: newTotal,
        updatedAt: Date.now(),
      });

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
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      )
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

  const generateInvoice = (order: Order) => {
    const invoiceContent = `
INVOICE
Leetonia Wholesale

Invoice #: ${order.id.slice(0, 8)}
Date: ${format(new Date(order.createdAt), 'MMMM d, yyyy')}
Customer: ${order.userName || order.userEmail}

Items:
${order.items.map((item) => 
  `${item.quantity}x ${item.name} @ ₵${item.price.toFixed(2)} = ₵${(item.quantity * item.price).toFixed(2)}`
).join('\n')}

Subtotal: ₵${order.total.toFixed(2)}
${order.deliveryFee ? `Delivery Fee: ₵${order.deliveryFee.toFixed(2)}` : ''}
Total: ₵${(order.total + (order.deliveryFee || 0)).toFixed(2)}

Payment Method: ${order.paymentMethod === 'momo' ? 'Mobile Money (Momo)' : 'Cash'}
${order.deliveryOption === 'delivery' ? `Delivery Address: ${order.deliveryAddress || 'N/A'}` : 'Pickup: Store Pickup'}

Status: ${order.status.replace('_', ' ').toUpperCase()}

Thank you for your business!
    `.trim();

    // Create a blob and download
    const blob = new Blob([invoiceContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${order.id.slice(0, 8)}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also open print dialog
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${order.id.slice(0, 8)}</title>
            <style>
              body { font-family: monospace; padding: 40px; }
              h1 { text-align: center; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
              .total { font-weight: bold; font-size: 1.2em; }
            </style>
          </head>
          <body>
            <h1>INVOICE</h1>
            <h2>Leetonia Wholesale</h2>
            <p><strong>Invoice #:</strong> ${order.id.slice(0, 8)}</p>
            <p><strong>Date:</strong> ${format(new Date(order.createdAt), 'MMMM d, yyyy')}</p>
            <p><strong>Customer:</strong> ${order.userName || order.userEmail}</p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map((item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>₵${item.price.toFixed(2)}</td>
                    <td>₵${(item.quantity * item.price).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3"><strong>Subtotal:</strong></td>
                  <td><strong>₵${order.total.toFixed(2)}</strong></td>
                </tr>
                ${order.deliveryFee ? `
                <tr>
                  <td colspan="3">Delivery Fee:</td>
                  <td>₵${order.deliveryFee.toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr class="total">
                  <td colspan="3"><strong>Total:</strong></td>
                  <td><strong>₵${(order.total + (order.deliveryFee || 0)).toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === 'momo' ? 'Mobile Money (Momo)' : 'Cash'}</p>
            ${order.deliveryOption === 'delivery' ? `<p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'N/A'}</p>` : '<p><strong>Pickup:</strong> Store Pickup</p>'}
            <p><strong>Status:</strong> ${order.status.replace('_', ' ').toUpperCase()}</p>
            <p style="margin-top: 40px; text-align: center;">Thank you for your business!</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }

    toast.success('Invoice generated and download started');
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
      });

      // Create notification for the user
      if (order.userId) {
        await createOrderStatusNotification(
          order.userId,
          orderId,
          newStatus,
          order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
          }))
        );
      }

      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update status');
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
          const imageRef = ref(
            storage,
            `products/${editingProduct?.id || Date.now()}_${imageFile.name}`
          );
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
        unit: '',
        description: '',
        imageUrl: '',
        expiryDate: undefined,
        code: '',
      });
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!db) {
      toast.error('Database not available');
      return;
    }
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      toast.success('Product deleted');
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm(product);
      setImagePreview(product.imageUrl || null);
      setImageFile(null);
    } else {
      setEditingProduct(null);
      setProductForm({
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
      setImagePreview(null);
      setImageFile(null);
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

  // Analytics calculations
  const productSales = products.map((product) => {
    const soldQuantity = orders
      .filter(
        (o) =>
          o.status === 'completed' ||
          o.status === 'processing' ||
          o.status === 'customer_confirmed'
      )
      .reduce((sum, order) => {
        const item = order.items.find((i) => i.id === product.id);
        return sum + (item ? item.quantity : 0);
      }, 0);
    const revenue = orders
      .filter(
        (o) =>
          o.status === 'completed' ||
          o.status === 'processing' ||
          o.status === 'customer_confirmed'
      )
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
    .filter(
      (o) =>
        o.status === 'completed' ||
        o.status === 'processing' ||
        o.status === 'customer_confirmed'
    )
    .reduce((sum, order) => sum + order.total + (order.deliveryFee || 0), 0);

  const pendingOrders = orders.filter(
    (o) => o.status !== 'completed' && o.status !== 'cancelled'
  );
  const completedOrders = orders.filter((o) => o.status === 'completed');

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || 'Unknown User';
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
            setStatusFilter('pharmacy_confirmed');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Awaiting Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {orders.filter((o) => o.status === 'pharmacy_confirmed').length}
            </div>
          </CardContent>
        </Card>
        <Card
          className='cursor-pointer hover:shadow-md transition-shadow'
          onClick={() => {
            setStatusFilter('customer_confirmed');
            setActiveTab('orders');
          }}
        >
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Customer Confirmed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {orders.filter((o) => o.status === 'customer_confirmed').length}
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
          <TabsTrigger value='staff' className='h-full px-6'>
            Staff Management
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
                statusFilter === 'checking_stock' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('checking_stock')}
            >
              Checking Stock (
              {orders.filter((o) => o.status === 'checking_stock').length})
            </Button>
            <Button
              variant={
                statusFilter === 'pharmacy_confirmed' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('pharmacy_confirmed')}
            >
              Awaiting Customer (
              {orders.filter((o) => o.status === 'pharmacy_confirmed').length})
            </Button>
            <Button
              variant={
                statusFilter === 'customer_confirmed' ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setStatusFilter('customer_confirmed')}
            >
              Customer Confirmed (
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
                  <CardHeader className='bg-secondary/30 py-4 flex flex-row items-center justify-between'>
                    <div>
                      <CardTitle className='text-base font-mono'>
                        Order #{order.id.slice(0, 8)}
                      </CardTitle>
                      <CardDescription>
                        {getUserName(order.userId)} •{' '}
                        {format(order.createdAt, 'MMM d, yyyy • h:mm a')}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        order.status === 'completed'
                          ? 'default'
                          : order.status === 'processing'
                          ? 'default'
                          : order.status === 'customer_confirmed'
                          ? 'default'
                          : order.status === 'pharmacy_confirmed'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {order.status.replace('_', ' ')}
                    </Badge>
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
                      </div>

                      <div className='md:w-64 space-y-3 bg-muted/10 p-4 rounded-lg border'>
                        {order.status === 'pending' ||
                        order.status === 'checking_stock' ? (
                          <Button
                            variant='outline'
                            className='w-full'
                            onClick={() => openOrderEditDialog(order)}
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Order
                          </Button>
                        ) : null}
                        <div className='text-sm font-medium'>Update Status</div>
                        <Select
                          value={order.status}
                          onValueChange={(val: any) =>
                            updateOrderStatus(order.id, val)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='pending'>Pending</SelectItem>
                            <SelectItem value='checking_stock'>
                              Checking Stock
                            </SelectItem>
                            <SelectItem value='pharmacy_confirmed'>
                              Pharmacy Confirmed
                            </SelectItem>
                            <SelectItem value='customer_confirmed'>
                              Customer Confirmed
                            </SelectItem>
                            <SelectItem value='processing'>
                              Processing/Fulfilling
                            </SelectItem>
                            <SelectItem value='completed'>Completed</SelectItem>
                            <SelectItem value='cancelled'>Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        {order.notes && (
                          <div className='pt-2 text-xs text-muted-foreground'>
                            <p className='font-medium'>Notes:</p>
                            <p>{order.notes}</p>
                          </div>
                        )}
                        <Button
                          variant='outline'
                          className='w-full mt-2'
                          onClick={() => generateInvoice(order)}
                        >
                          <Download className='mr-2 h-4 w-4' />
                          Generate Invoice
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
                <SelectItem value='checking_stock'>Checking Stock</SelectItem>
                <SelectItem value='pharmacy_confirmed'>
                  Pharmacy Confirmed
                </SelectItem>
                <SelectItem value='customer_confirmed'>
                  Customer Confirmed
                </SelectItem>
                <SelectItem value='processing'>
                  Processing/Fulfilling
                </SelectItem>
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
                        Order #{order.id.slice(0, 8)}
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
                          order.status === 'completed'
                            ? 'default'
                            : order.status === 'processing'
                            ? 'default'
                            : order.status === 'customer_confirmed'
                            ? 'default'
                            : order.status === 'pharmacy_confirmed'
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

        <TabsContent value='inventory' className='mt-6'>
          <div className='rounded-md border bg-card'>
            <div className='grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm text-muted-foreground bg-muted/20'>
              <div className='col-span-4 md:col-span-3'>Name</div>
              <div className='col-span-3 md:col-span-2'>Category</div>
              <div className='col-span-2 md:col-span-2 text-right'>Price</div>
              <div className='col-span-2 md:col-span-2 text-center'>Stock</div>
              <div className='col-span-1 md:col-span-3 text-right'>Actions</div>
            </div>
            {products.map((product) => (
              <div
                key={product.id}
                className='grid grid-cols-12 gap-4 p-4 border-b last:border-0 items-center text-sm hover:bg-muted/5 transition-colors'
              >
                <div
                  className='col-span-4 md:col-span-3 font-medium truncate'
                  title={product.name}
                >
                  {product.name}
                </div>
                <div className='col-span-3 md:col-span-2 truncate'>
                  {product.category}
                </div>
                <div className='col-span-2 md:col-span-2 text-right'>
                  ₵{product.price.toFixed(2)}
                </div>
                <div className='col-span-2 md:col-span-2 text-center'>
                  <Badge
                    variant={
                      product.stock === 0
                        ? 'destructive'
                        : product.stock < 10
                        ? 'secondary'
                        : 'outline'
                    }
                    className={
                      product.stock < 10
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                        : ''
                    }
                  >
                    {product.stock}
                  </Badge>
                </div>
                <div className='col-span-1 md:col-span-3 flex justify-end gap-2'>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => openProductDialog(product)}
                  >
                    <Edit className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10'
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent>
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
              <Label htmlFor='stock' className='text-right'>
                Stock
              </Label>
              <Input
                id='stock'
                type='number'
                value={productForm.stock}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    stock: Number.parseInt(e.target.value),
                  })
                }
                className='col-span-3'
              />
            </div>
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
            <div className='grid grid-cols-4 items-center gap-4'>
              <Label htmlFor='code' className='text-right'>
                Product Code
              </Label>
              <Input
                id='code'
                placeholder='e.g. 4571'
                value={productForm.code || ''}
                onChange={(e) =>
                  setProductForm({ ...productForm, code: e.target.value })
                }
                className='col-span-3'
              />
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
              Edit Order #{editingOrder?.id.slice(0, 8)}
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
              editedOrderItems.map((item) => (
                <div
                  key={item.id}
                  className='flex items-center justify-between p-4 border rounded-lg'
                >
                  <div className='flex-1'>
                    <p className='font-medium'>{item.name}</p>
                    <p className='text-sm text-muted-foreground'>
                      ₵{item.price.toFixed(2)} per {item.unit}
                    </p>
                  </div>
                  <div className='flex items-center gap-3'>
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
                        value={item.quantity}
                        onChange={(e) =>
                          updateItemQuantity(
                            item.id,
                            parseInt(e.target.value) || 1
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
                        disabled={item.quantity >= item.stock}
                      >
                        +
                      </Button>
                    </div>
                    <p className='font-bold w-20 text-right'>
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
              ))
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
                  value={editingStaff?.id || ''}
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
    </div>
  );
}
