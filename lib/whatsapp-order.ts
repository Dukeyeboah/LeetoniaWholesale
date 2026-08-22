import type { CartItem, Order, OrderStatus, User } from '@/types';
import { formatOrderLabel, fulfillmentShortPhrase } from '@/lib/order-display';
import { normalizeGhanaPhoneToE164 } from '@/lib/ghana-phone';

/**
 * Incoming Leetonia order chat — stays in code only, never shown in the UI.
 */
const WHATSAPP_ORDER_CHAT_DIGITS = '233206351107';

function siteBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://leetoniawholesale.com'
  );
}

export function buildWhatsAppOrderMessage(opts: {
  items: CartItem[];
  total: number;
  user?: User | null;
  contactPhone?: string;
  paymentMethod?: 'momo' | 'cash' | 'cheque';
  deliveryOption?: 'pickup' | 'delivery';
  displayOrderId?: string;
}): string {
  const {
    items,
    total,
    user,
    contactPhone,
    paymentMethod,
    deliveryOption,
    displayOrderId,
  } = opts;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const lines: string[] = ['*Order from leetoniawholesale.com*', ''];
  if (displayOrderId) {
    lines.push(`*Order ID:* ${displayOrderId}`, '');
  }
  lines.push(
    'Hello Leetonia Wholesale,',
    '',
    'I would like to place the following order.',
    ''
  );

  if (user) {
    if (user.pharmacyName) lines.push(`*Pharmacy:* ${user.pharmacyName}`);
    if (user.pharmacyLocation)
      lines.push(`*Location:* ${user.pharmacyLocation}`);
    lines.push(`*Ordered by:* ${user.name || user.email || '—'}`);
    if (user.email) lines.push(`*Email:* ${user.email}`);
    if (user.phone) lines.push(`*Phone:* ${user.phone}`);
    if (user.pharmacyPhone)
      lines.push(`*Pharmacy phone:* ${user.pharmacyPhone}`);
    if (user.jobRole) lines.push(`*Role:* ${user.jobRole}`);
  }
  if (contactPhone?.trim()) {
    lines.push(`*Contact phone:* ${contactPhone.trim()}`);
  }
  if (paymentMethod) {
    const payLabel =
      paymentMethod === 'momo'
        ? 'MoMo'
        : paymentMethod === 'cheque'
          ? 'Cheque'
          : 'Cash';
    lines.push(`*Payment:* ${payLabel}`);
  }
  if (deliveryOption) {
    lines.push(
      `*Fulfillment:* ${deliveryOption === 'pickup' ? 'Pick up' : 'Delivery'}`
    );
  }

  lines.push('', '————————————', '*ORDER LIST*', '————————————', '');

  items.forEach((item, i) => {
    const lineTotal = item.price * item.quantity;
    lines.push(
      `${i + 1}. *${item.name}*`,
      `     Quantity: ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`,
      `     Unit price: ₵${item.price.toFixed(2)}`,
      `     Line total: ₵${lineTotal.toFixed(2)}`,
      ''
    );
  });

  lines.push(
    '————————————',
    `*Grand total: ₵${total.toFixed(2)}*`,
    `*${itemCount} item${itemCount === 1 ? '' : 's'} (${items.length} product${items.length === 1 ? '' : 's'})*`,
    '————————————',
    '',
    deliveryOption === 'pickup'
      ? 'Please confirm availability. I will pick up this order. Thank you.'
      : 'Please confirm availability and delivery. Thank you.'
  );

  return lines.join('\n');
}

/** Opens a WhatsApp chat to Leetonia with the order already typed. */
export function whatsappOrderLaunchUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_ORDER_CHAT_DIGITS}?text=${encodeURIComponent(message)}`;
}

export function whatsappDigitsFromPhone(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const d = trimmed.replace(/\D/g, '');
    return d.length >= 10 ? d : null;
  }
  const e164 = normalizeGhanaPhoneToE164(trimmed);
  const d = e164.replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

export function customerPhoneDigitsFromOrder(
  order: Pick<Order, 'contactPhone'>,
  extraPhones?: Array<string | null | undefined>
): string | null {
  const candidates = [order.contactPhone, ...(extraPhones ?? [])];
  for (const raw of candidates) {
    const digits = whatsappDigitsFromPhone(raw);
    if (digits) return digits;
  }
  return null;
}

export const CUSTOMER_WHATSAPP_STATUSES: OrderStatus[] = [
  'proforma_sent',
  'invoice_sent',
  'processing',
  'completed',
  'cancelled',
];

export function shouldOpenCustomerWhatsApp(status: OrderStatus): boolean {
  return CUSTOMER_WHATSAPP_STATUSES.includes(status);
}

export function openWhatsAppUrl(
  url: string,
  existingWindow?: Window | null
): void {
  if (existingWindow && !existingWindow.closed) {
    existingWindow.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function whatsappChatUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildCustomerStatusWhatsAppMessage(
  order: Order,
  status: OrderStatus
): string {
  const label = formatOrderLabel(order);
  const f = fulfillmentShortPhrase(order.deliveryOption);
  const reviewUrl = `${siteBaseUrl()}/orders/${order.id}`;
  const lines = [
    '*Update from leetoniawholesale.com*',
    '',
    `Order *${label}*`,
  ];

  switch (status) {
    case 'proforma_sent':
      lines.push(
        '',
        'Your proforma is ready. Please review quantities and confirm pickup or delivery.',
        '',
        `Confirm in the app: ${reviewUrl}`,
        'Or reply here on WhatsApp to confirm.'
      );
      break;
    case 'invoice_sent':
      lines.push(
        '',
        'Your invoice has been recorded. We will start packing your order shortly.'
      );
      break;
    case 'processing':
      lines.push(
        '',
        `We are packing and preparing your order for ${f}.`
      );
      break;
    case 'completed':
      lines.push(
        '',
        `Your order is complete and ready for ${f}. Thank you for your business.`
      );
      break;
    case 'cancelled':
      lines.push(
        '',
        'This order has been cancelled. Message us if you have questions.'
      );
      break;
    case 'pending':
      lines.push(
        '',
        'We have received your order and will send a proforma for you to confirm.'
      );
      break;
    default:
      lines.push('', `Status update: ${status.replace(/_/g, ' ')}.`);
  }

  lines.push('', `View in the app: ${reviewUrl}`);
  return lines.join('\n');
}

/** Opens WhatsApp to the customer. Returns false if there is no usable phone. */
export function openWhatsAppToCustomer(
  order: Order,
  status: OrderStatus,
  extraPhones?: Array<string | null | undefined>,
  existingWindow?: Window | null
): boolean {
  const digits = customerPhoneDigitsFromOrder(order, extraPhones);
  if (!digits) {
    existingWindow?.close();
    return false;
  }
  const message = buildCustomerStatusWhatsAppMessage(order, status);
  openWhatsAppUrl(whatsappChatUrl(digits, message), existingWindow);
  return true;
}
