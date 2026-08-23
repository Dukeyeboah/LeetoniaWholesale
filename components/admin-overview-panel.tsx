'use client';

import { format } from 'date-fns';
import type { Order, Product } from '@/types';
import { formatOrderLabel } from '@/lib/order-display';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export type OverviewModalKey =
  | 'pending'
  | 'proforma'
  | 'processing'
  | 'completed'
  | 'products'
  | 'low_stock'
  | 'expiring'
  | 'revenue'
  | 'clients';

type SnapshotCard = {
  key: OverviewModalKey;
  label: string;
  value: string;
  hint?: string;
};

const SNAPSHOT_TONES = {
  orders: {
    panel: 'border-sky-200/80 bg-sky-50/90',
    title: 'text-sky-800',
    card: 'border-sky-200/70 bg-white/85 hover:bg-white',
  },
  inventory: {
    panel: 'border-emerald-200/80 bg-emerald-50/90',
    title: 'text-emerald-800',
    card: 'border-emerald-200/70 bg-white/85 hover:bg-white',
  },
  business: {
    panel: 'border-amber-200/80 bg-amber-50/90',
    title: 'text-amber-900',
    card: 'border-amber-200/70 bg-white/85 hover:bg-white',
  },
} as const;

function SnapshotGroup({
  title,
  tone,
  cards,
  onOpen,
}: {
  title: string;
  tone: keyof typeof SNAPSHOT_TONES;
  cards: SnapshotCard[];
  onOpen: (key: OverviewModalKey) => void;
}) {
  const colors = SNAPSHOT_TONES[tone];
  return (
    <div className={`h-full rounded-2xl border p-3 ${colors.panel}`}>
      <h2 className={`mb-2 text-xs font-semibold tracking-wide ${colors.title}`}>
        {title}
      </h2>
      <div className='grid grid-cols-2 gap-2'>
        {cards.map((card) => (
          <button
            key={card.key}
            type='button'
            onClick={() => onOpen(card.key)}
            className={`rounded-xl border px-3 py-2.5 text-left shadow-none transition-shadow hover:shadow-sm ${colors.card}`}
          >
            <p className='text-xs text-muted-foreground'>{card.label}</p>
            <p className='mt-1 font-serif text-xl font-semibold tabular-nums leading-none lg:text-2xl'>
              {card.value}
            </p>
            {card.hint ? (
              <p className='mt-1 text-[11px] text-muted-foreground'>{card.hint}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminOverviewPanel({
  orders,
  products,
  getUserName,
  modal,
  onOpenModal,
  onCloseModal,
  onOpenOperations,
  onOpenAnalytics,
}: {
  orders: Order[];
  products: Product[];
  getUserName: (userId: string) => string;
  modal: OverviewModalKey | null;
  onOpenModal: (key: OverviewModalKey) => void;
  onCloseModal: () => void;
  onOpenOperations: (tab: 'orders' | 'inventory' | 'history', status?: string) => void;
  onOpenAnalytics: () => void;
}) {
  const pending = orders.filter(
    (o) => o.status === 'pending' || o.status === 'checking_stock'
  );
  const proforma = orders.filter((o) => o.status === 'proforma_sent');
  const processing = orders.filter((o) =>
    ['client_finalized', 'invoice_sent', 'processing', 'customer_confirmed'].includes(
      o.status
    )
  );
  const completed = orders.filter((o) => o.status === 'completed');
  const lowStock = products.filter((p) => !p.isHidden && p.stock < 10);
  const now = Date.now();
  const ninetyDays = now + 90 * 24 * 60 * 60 * 1000;
  const expiring = products.filter((p) => {
    if (!p.expiryDate) return false;
    const t = new Date(p.expiryDate).getTime();
    return t > now && t <= ninetyDays;
  });
  const visibleProducts = products.filter((p) => !p.isHidden);
  const revenue = completed.reduce(
    (sum, order) => sum + order.total + (order.deliveryFee || 0),
    0
  );
  const clientIds = new Set(orders.map((o) => o.userId).filter(Boolean));
  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 24);
  const recentActivity = [...orders]
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .slice(0, 24);

  const modalCopy: Record<
    OverviewModalKey,
    { title: string; description: string; cta: string; go: () => void }
  > = {
    pending: {
      title: 'Pending orders',
      description: 'Received and waiting for a proforma.',
      cta: 'Open in Operations',
      go: () => onOpenOperations('orders', 'pending'),
    },
    proforma: {
      title: 'Pro forma with customer',
      description: 'Proforma sent — waiting for the pharmacy to confirm.',
      cta: 'Open in Operations',
      go: () => onOpenOperations('orders', 'proforma_sent'),
    },
    processing: {
      title: 'Processing',
      description: 'Confirmed, invoiced, or being packed.',
      cta: 'Open in Operations',
      go: () => onOpenOperations('orders', 'processing'),
    },
    completed: {
      title: 'Completed orders',
      description: 'Ready for pickup or delivery, or already fulfilled.',
      cta: 'Open order history',
      go: () => onOpenOperations('history', 'completed'),
    },
    products: {
      title: 'Storefront products',
      description: 'Visible wholesale catalog (not hidden).',
      cta: 'Manage inventory',
      go: () => onOpenOperations('inventory'),
    },
    low_stock: {
      title: 'Low stock',
      description: 'Sellable wholesale quantity below 10.',
      cta: 'Manage inventory',
      go: () => onOpenOperations('inventory'),
    },
    expiring: {
      title: 'Expiring soon',
      description: 'Products with an expiry date in the next 90 days.',
      cta: 'View in Analytics',
      go: () => onOpenAnalytics(),
    },
    revenue: {
      title: 'Revenue',
      description: 'Completed orders only (matches stock leaving the warehouse).',
      cta: 'Open Analytics',
      go: () => onOpenAnalytics(),
    },
    clients: {
      title: 'Active clients',
      description: 'Pharmacies / users who have placed at least one order.',
      cta: 'Open order history',
      go: () => onOpenOperations('history'),
    },
  };

  const modalOrders =
    modal === 'pending'
      ? pending
      : modal === 'proforma'
        ? proforma
        : modal === 'processing'
          ? processing
          : modal === 'completed'
            ? completed
            : [];
  const modalProducts =
    modal === 'low_stock'
      ? lowStock
      : modal === 'expiring'
        ? expiring
        : modal === 'products'
          ? visibleProducts.slice(0, 40)
          : [];

  return (
    <div className='flex flex-col gap-3'>
      <div className='grid gap-3 lg:grid-cols-3'>
        <SnapshotGroup
          title='Orders'
          tone='orders'
          onOpen={onOpenModal}
          cards={[
            { key: 'pending', label: 'Pending', value: String(pending.length) },
            { key: 'proforma', label: 'Pro Forma', value: String(proforma.length) },
            {
              key: 'processing',
              label: 'Processing',
              value: String(processing.length),
            },
            {
              key: 'completed',
              label: 'Completed',
              value: String(completed.length),
            },
          ]}
        />
        <SnapshotGroup
          title='Inventory'
          tone='inventory'
          onOpen={onOpenModal}
          cards={[
            {
              key: 'products',
              label: 'Total Products',
              value: visibleProducts.length.toLocaleString(),
            },
            {
              key: 'low_stock',
              label: 'Low Stock',
              value: String(lowStock.length),
            },
            {
              key: 'expiring',
              label: 'Expiring Soon',
              value: String(expiring.length),
              hint: 'Next 90 days',
            },
          ]}
        />
        <SnapshotGroup
          title='Business'
          tone='business'
          onOpen={onOpenModal}
          cards={[
            {
              key: 'revenue',
              label: 'Revenue',
              value: `₵${revenue.toFixed(0)}`,
              hint: 'Completed orders',
            },
            {
              key: 'clients',
              label: 'Active Clients',
              value: String(clientIds.size),
            },
          ]}
        />
      </div>

      <div className='grid gap-3 lg:grid-cols-2'>
        <Card className='flex flex-col gap-2 overflow-hidden border-border/60 py-3 shadow-none'>
          <CardHeader className='shrink-0 space-y-1 px-4 py-0'>
            <CardTitle className='font-serif text-base'>Recent Orders</CardTitle>
            <CardDescription>Latest submissions</CardDescription>
          </CardHeader>
          <CardContent className='h-44 overflow-y-auto overscroll-contain px-4 pt-0'>
            {recentOrders.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No orders yet.</p>
            ) : (
              <ul className='space-y-2'>
                {recentOrders.map((order) => (
                  <li
                    key={order.id}
                    className='flex items-center justify-between gap-3 text-sm'
                  >
                    <div className='min-w-0'>
                      <p className='truncate font-mono font-medium'>
                        {formatOrderLabel(order)}
                      </p>
                      <p className='truncate text-xs text-muted-foreground'>
                        {getUserName(order.userId)} ·{' '}
                        {format(order.createdAt, 'MMM d')}
                      </p>
                    </div>
                    <Badge variant='secondary' className='shrink-0 capitalize'>
                      {order.status.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className='flex flex-col gap-2 overflow-hidden border-border/60 py-3 shadow-none'>
          <CardHeader className='shrink-0 space-y-1 px-4 py-0'>
            <CardTitle className='font-serif text-base'>Recent Activity</CardTitle>
            <CardDescription>Latest order status changes</CardDescription>
          </CardHeader>
          <CardContent className='h-44 overflow-y-auto overscroll-contain px-4 pt-0'>
            {recentActivity.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No activity yet.</p>
            ) : (
              <ul className='space-y-2'>
                {recentActivity.map((order) => (
                  <li key={`act-${order.id}`} className='text-sm'>
                    <p>
                      Order{' '}
                      <span className='font-mono font-medium'>
                        {formatOrderLabel(order)}
                      </span>{' '}
                      is{' '}
                      <span className='capitalize'>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      .
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {format(order.updatedAt || order.createdAt, 'MMM d, h:mm a')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!modal} onOpenChange={(open) => !open && onCloseModal()}>
        <DialogContent className='max-w-lg'>
          {modal ? (
            <>
              <DialogHeader>
                <DialogTitle>{modalCopy[modal].title}</DialogTitle>
                <DialogDescription>
                  {modalCopy[modal].description}
                </DialogDescription>
              </DialogHeader>
              {modal === 'revenue' ? (
                <p className='font-serif text-3xl font-semibold tabular-nums'>
                  ₵{revenue.toFixed(2)}
                </p>
              ) : modal === 'clients' ? (
                <p className='text-sm text-muted-foreground'>
                  {clientIds.size} distinct customer
                  {clientIds.size === 1 ? '' : 's'} on record.
                </p>
              ) : modalOrders.length > 0 ? (
                <ScrollArea className='max-h-64'>
                  <ul className='space-y-2 pr-3'>
                    {modalOrders.slice(0, 20).map((order) => (
                      <li key={order.id} className='text-sm'>
                        <span className='font-mono font-medium'>
                          {formatOrderLabel(order)}
                        </span>
                        <span className='text-muted-foreground'>
                          {' '}
                          · {getUserName(order.userId)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : modalProducts.length > 0 ? (
                <ScrollArea className='max-h-64'>
                  <ul className='space-y-2 pr-3'>
                    {modalProducts.slice(0, 20).map((product) => (
                      <li key={product.id} className='text-sm'>
                        {product.name}
                        {modal === 'low_stock' ? (
                          <span className='text-muted-foreground'>
                            {' '}
                            · {product.stock} in stock
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : (
                <p className='text-sm text-muted-foreground'>Nothing here right now.</p>
              )}
              <DialogFooter>
                <Button variant='outline' onClick={onCloseModal}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    modalCopy[modal].go();
                    onCloseModal();
                  }}
                >
                  {modalCopy[modal].cta}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminSegmentNav({
  items,
  value,
  onChange,
  className,
  tone = 'default',
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  tone?: 'default' | 'accent';
}) {
  const isAccent = tone === 'accent';
  return (
    <div
      className={`flex w-full flex-wrap gap-1 rounded-xl border p-1 ${
        isAccent
          ? 'border-teal-200/80 bg-teal-50/80'
          : 'border-border/60 bg-muted/40'
      } ${className ?? ''}`}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type='button'
          onClick={() => onChange(item.value)}
          className={`h-9 min-w-[6.5rem] flex-1 rounded-lg px-3 text-sm font-medium transition-colors ${
            value === item.value
              ? isAccent
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-background text-foreground shadow-sm'
              : isAccent
                ? 'text-teal-900/70 hover:bg-teal-100/80 hover:text-teal-950'
                : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
