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
import type { Order, Product } from '@/types';
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
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import type { User } from '@/types';

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

  // Product Form State
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({
    name: '',
    category: '',
    price: 0,
    stock: 0,
    unit: '',
    description: '',
    imageUrl: '',
    expiryDate: undefined,
    code: '',
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

  const updateOrderStatus = async (
    orderId: string,
    newStatus: Order['status']
  ) => {
    if (!db) {
      toast.error('Database not available');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Date.now(),
      });
      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleSaveProduct = async () => {
    if (!db) {
      toast.error('Database not available');
      return;
    }
    try {
      const productData = {
        ...productForm,
        updatedAt: Date.now(),
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'inventory', editingProduct.id), productData);
        toast.success('Product updated');
      } else {
        await addDoc(collection(db, 'inventory'), productData);
        toast.success('Product added');
      }
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      setProductForm({
        name: '',
        category: '',
        price: 0,
        stock: 0,
        unit: '',
        description: '',
        imageUrl: '',
        expiryDate: undefined,
        code: '',
      });
    } catch (error) {
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
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        category: '',
        price: 0,
        stock: 0,
        unit: '',
        description: '',
        imageUrl: '',
        expiryDate: undefined,
        code: '',
      });
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
        (o) => o.status === 'completed' || o.status === 'customer_confirmed'
      )
      .reduce((sum, order) => {
        const item = order.items.find((i) => i.id === product.id);
        return sum + (item ? item.quantity : 0);
      }, 0);
    const revenue = orders
      .filter(
        (o) => o.status === 'completed' || o.status === 'customer_confirmed'
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
      (o) => o.status === 'completed' || o.status === 'customer_confirmed'
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

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{pendingOrders.length}</div>
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

      <Tabs defaultValue='orders' className='w-full'>
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
        </TabsList>

        <TabsContent value='orders' className='mt-6 space-y-6'>
          <div className='space-y-4'>
            {pendingOrders.length === 0 ? (
              <div className='text-center py-12 text-muted-foreground'>
                No pending orders.
              </div>
            ) : (
              pendingOrders.map((order) => (
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
                            : order.status === 'customer_confirmed'
                            ? 'default'
                            : order.status === 'pharmacy_confirmed'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {order.status.replace('_', ' ')}
                      </Badge>
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
              <Input
                id='category'
                value={productForm.category}
                onChange={(e) =>
                  setProductForm({ ...productForm, category: e.target.value })
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
              <Label htmlFor='imageUrl' className='text-right'>
                Image URL
              </Label>
              <Input
                id='imageUrl'
                type='url'
                placeholder='https://example.com/image.jpg'
                value={productForm.imageUrl || ''}
                onChange={(e) =>
                  setProductForm({ ...productForm, imageUrl: e.target.value })
                }
                className='col-span-3'
              />
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
            <Button onClick={handleSaveProduct}>Save Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
