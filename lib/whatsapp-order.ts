import type { CartItem, User } from '@/types';

/**
 * Order chat number stays in code only — never shown in the UI.
 * WhatsApp click-to-chat opens one conversation with the order pre-filled.
 */
const WHATSAPP_ORDER_CHAT_DIGITS = '233206351107';

export function buildWhatsAppOrderMessage(opts: {
  items: CartItem[];
  total: number;
  user?: User | null;
  contactPhone?: string;
  paymentMethod?: 'momo' | 'cash' | 'cheque';
  deliveryOption?: 'pickup' | 'delivery';
}): string {
  const { items, total, user, contactPhone, paymentMethod, deliveryOption } =
    opts;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const lines: string[] = [
    '*Order from leetoniawholesale.com*',
    '',
    'Hello Leetonia Wholesale,',
    '',
    'I would like to place the following order.',
    '',
  ];

  if (user) {
    if (user.pharmacyName) lines.push(`*Pharmacy:* ${user.pharmacyName}`);
    if (user.pharmacyLocation) lines.push(`*Location:* ${user.pharmacyLocation}`);
    lines.push(`*Ordered by:* ${user.name || user.email || '—'}`);
    if (user.email) lines.push(`*Email:* ${user.email}`);
    if (user.phone) lines.push(`*Phone:* ${user.phone}`);
    if (user.pharmacyPhone) lines.push(`*Pharmacy phone:* ${user.pharmacyPhone}`);
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

/** Opens a WhatsApp chat with the order already typed in the message box. */
export function whatsappOrderLaunchUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_ORDER_CHAT_DIGITS}?text=${encodeURIComponent(message)}`;
}
