'use client';

import { useEffect, useState } from 'react';
import {
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  collection,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Package,
  ShoppingCart,
  TrendingUp,
  Eye,
  Edit,
  Search,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function StaffDashboard() {
  const { user, isStaff, hasPermission } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  // Check permissions
  const canViewOrders = hasPermission('canViewOrders');
  const canManageInventory = hasPermission('canManageInventory');
  const canUpdateStock = hasPermission('canUpdateStock');

  useEffect(() => {
    if (!isStaff) {
      router.push('/');
      return;
    }

    if (!db) {
      setLoading(false);
      return;
    }

    // Listen to Orders (read-only for staff)
    if (canViewOrders) {
      const ordersQuery = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc')
      );
      const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
        setOrders(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order))
        );
      });

      // Listen to Inventory
      if (canManageInventory || canUpdateStock) {
        const inventoryQuery = query(
          collection(db, 'inventory'),
          orderBy('name')
        );
        const unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
          setProducts(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
          );
          setLoading(false);
        });

        return () => {
          unsubOrders();
          unsubInventory();
        };
      }

      return () => {
        unsubOrders();
      };
    }

    // Listen to Inventory only
    if (canManageInventory || canUpdateStock) {
      const inventoryQuery = query(
        collection(db, 'inventory'),
        orderBy('name')
      );
      const unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
        setProducts(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
        );
        setLoading(false);
      });

      return () => {
        unsubInventory();
      };
    }

    setLoading(false);
  }, [isStaff, canViewOrders, canManageInventory, canUpdateStock, router]);

  const updateStock = async (productId: string, newStock: number) => {
    if (!db || !canUpdateStock) {
      toast.error('Permission denied');
      return;
    }

    try {
      await updateDoc(doc(db, 'inventory', productId), {
        stock: newStock,
        updatedAt: Date.now(),
      });
      toast.success('Stock updated successfully');
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update stock');
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      searchQuery === '' ||
      order.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const filteredProducts = products.filter((product) => {
    return (
      searchQuery === '' ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getStatusBadge = (status: Order['status']) => {
    const statusConfig: Record<
      Order['status'],
      { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
    > = {
      pending: { label: 'Pending', variant: 'outline' },
      checking_stock: { label: 'Checking Stock', variant: 'secondary' },
      pharmacy_confirmed: { label: 'Pharmacy Confirmed', variant: 'default' },
      customer_confirmed: { label: 'Customer Confirmed', variant: 'default' },
      processing: { label: 'Processing', variant: 'default' },
      completed: { label: 'Completed', variant: 'default' },
      cancelled: { label: 'Cancelled', variant: 'destructive' },
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (!isStaff) {
    return null;
  }

  return (
    <div className='flex-1 space-y-4 p-4 md:p-8 pt-6'>
      <div className='flex items-center justify-between space-y-2'>
        <h2 className='text-3xl font-bold tracking-tight'>Staff Dashboard</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-4'>
        <TabsList>
          {canViewOrders && (
            <TabsTrigger value='orders'>
              <ShoppingCart className='mr-2 h-4 w-4' />
              Orders
            </TabsTrigger>
          )}
          {(canManageInventory || canUpdateStock) && (
            <TabsTrigger value='inventory'>
              <Package className='mr-2 h-4 w-4' />
              Inventory
            </TabsTrigger>
          )}
        </TabsList>

        {canViewOrders && (
          <TabsContent value='orders' className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Orders</CardTitle>
                <CardDescription>
                  View all orders (read-only). You cannot modify order status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='flex gap-4 mb-4'>
                  <div className='flex-1 relative'>
                    <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      placeholder='Search orders...'
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className='pl-8'
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className='w-[180px]'>
                      <Filter className='mr-2 h-4 w-4' />
                      <SelectValue placeholder='Filter by status' />
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
                      <SelectItem value='processing'>Processing</SelectItem>
                      <SelectItem value='completed'>Completed</SelectItem>
                      <SelectItem value='cancelled'>Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-4'>
                  {filteredOrders.length === 0 ? (
                    <div className='text-center py-8 text-muted-foreground'>
                      No orders found
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <Card key={order.id} className='cursor-pointer hover:bg-secondary/50'>
                        <CardContent className='p-4'>
                          <div className='flex items-start justify-between'>
                            <div className='flex-1'>
                              <div className='flex items-center gap-2 mb-2'>
                                <span className='font-semibold'>
                                  Order #{order.id.slice(0, 8)}
                                </span>
                                {getStatusBadge(order.status)}
                              </div>
                              <p className='text-sm text-muted-foreground'>
                                {order.userName || order.userEmail}
                              </p>
                              <p className='text-sm text-muted-foreground'>
                                {format(new Date(order.createdAt), 'PPp')}
                              </p>
                              <p className='text-sm font-medium mt-2'>
                                Total: ₵{order.total.toFixed(2)}
                              </p>
                              <p className='text-xs text-muted-foreground mt-1'>
                                {order.items.length} item(s)
                              </p>
                            </div>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsOrderDialogOpen(true);
                              }}
                            >
                              <Eye className='mr-2 h-4 w-4' />
                              View Details
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

        {(canManageInventory || canUpdateStock) && (
          <TabsContent value='inventory' className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Inventory Management</CardTitle>
                <CardDescription>
                  {canUpdateStock
                    ? 'Update stock quantities for products'
                    : 'View inventory (read-only)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='mb-4'>
                  <div className='relative'>
                    <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      placeholder='Search products...'
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className='pl-8'
                    />
                  </div>
                </div>

                <div className='space-y-4'>
                  {filteredProducts.length === 0 ? (
                    <div className='text-center py-8 text-muted-foreground'>
                      No products found
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <Card key={product.id}>
                        <CardContent className='p-4'>
                          <div className='flex items-center justify-between'>
                            <div className='flex-1'>
                              <h3 className='font-semibold'>{product.name}</h3>
                              <p className='text-sm text-muted-foreground'>
                                {product.category}
                              </p>
                              <p className='text-sm font-medium mt-2'>
                                Current Stock: {product.stock} {product.unit}
                              </p>
                            </div>
                            {canUpdateStock && (
                              <div className='flex items-center gap-2'>
                                <Input
                                  type='number'
                                  min={0}
                                  defaultValue={product.stock}
                                  className='w-24'
                                  data-product-id={product.id}
                                  onBlur={(e) => {
                                    const newStock = parseInt(e.target.value) || 0;
                                    if (newStock !== product.stock) {
                                      updateStock(product.id, newStock);
                                    }
                                  }}
                                />
                                <Button
                                  variant='outline'
                                  size='sm'
                                  onClick={() => {
                                    const input = document.querySelector(
                                      `input[data-product-id="${product.id}"]`
                                    ) as HTMLInputElement;
                                    if (input) {
                                      const newStock = parseInt(input.value) || 0;
                                      updateStock(product.id, newStock);
                                    }
                                  }}
                                >
                                  <Edit className='h-4 w-4' />
                                </Button>
                              </div>
                            )}
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
      </Tabs>

      {/* Order Details Dialog */}
      <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
        <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className='space-y-4'>
              <div>
                <Label className='text-sm font-medium'>Order ID</Label>
                <p className='text-sm'>{selectedOrder.id}</p>
              </div>
              <div>
                <Label className='text-sm font-medium'>Status</Label>
                <div className='mt-1'>{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div>
                <Label className='text-sm font-medium'>Customer</Label>
                <p className='text-sm'>
                  {selectedOrder.userName || selectedOrder.userEmail}
                </p>
              </div>
              <div>
                <Label className='text-sm font-medium'>Items</Label>
                <div className='mt-2 space-y-2'>
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className='flex justify-between p-2 bg-secondary/50 rounded'
                    >
                      <div>
                        <p className='font-medium'>{item.name}</p>
                        <p className='text-sm text-muted-foreground'>
                          {item.quantity} x ₵{item.price.toFixed(2)} = ₵
                          {(item.quantity * item.price).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className='text-sm font-medium'>Total</Label>
                <p className='text-lg font-bold'>₵{selectedOrder.total.toFixed(2)}</p>
              </div>
              {selectedOrder.deliveryOption && (
                <div>
                  <Label className='text-sm font-medium'>Delivery Option</Label>
                  <p className='text-sm capitalize'>{selectedOrder.deliveryOption}</p>
                </div>
              )}
              {selectedOrder.deliveryAddress && (
                <div>
                  <Label className='text-sm font-medium'>Delivery Address</Label>
                  <p className='text-sm'>{selectedOrder.deliveryAddress}</p>
                </div>
              )}
              {selectedOrder.paymentMethod && (
                <div>
                  <Label className='text-sm font-medium'>Payment Method</Label>
                  <p className='text-sm capitalize'>{selectedOrder.paymentMethod}</p>
                </div>
              )}
              <div>
                <Label className='text-sm font-medium'>Created At</Label>
                <p className='text-sm'>
                  {format(new Date(selectedOrder.createdAt), 'PPp')}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

