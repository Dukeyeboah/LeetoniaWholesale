import { format } from 'date-fns';
import type { Order } from '@/types';
import { formatOrderLabel } from '@/lib/order-display';

/** MoMo payment details shown on invoices and checkout. */
export const MOMO_DISPLAY_NAME = 'Leetonia Wholesale';
export const MOMO_PHONE = '0244763235';

export function printOrderInvoice(order: Order): void {
  const ordLabel = formatOrderLabel(order);
  const fileSlug = ordLabel.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
  const grand = order.total + (order.deliveryFee || 0);
  const paid =
    order.accountingStatus === 'paid' &&
    (order.amountPaidGHS == null || order.amountPaidGHS === undefined)
      ? grand
      : (order.amountPaidGHS ?? 0);
  const balance = Math.max(0, grand - paid);

  const invoiceContent = `
INVOICE
Leetonia Wholesale

Invoice #: ${ordLabel}
Date: ${format(new Date(order.createdAt), 'MMMM d, yyyy')}
Customer: ${order.userName || order.userEmail}
${order.contactPhone ? `Contact phone: ${order.contactPhone}` : ''}

Items:
${order.items
  .map(
    (item) =>
      `${item.quantity}x ${item.name} @ ₵${item.price.toFixed(2)} = ₵${(item.quantity * item.price).toFixed(2)}`
  )
  .join('\n')}

Subtotal: ₵${order.total.toFixed(2)}
${order.deliveryFee ? `Delivery Fee: ₵${order.deliveryFee.toFixed(2)}` : ''}
Total: ₵${grand.toFixed(2)}
Paid: ₵${paid.toFixed(2)}
Balance: ₵${balance.toFixed(2)}

Payment Method: ${order.paymentMethod === 'momo' ? 'Mobile Money (Momo)' : 'Cash'}
${order.paymentMethod === 'momo' ? `Pay to: ${MOMO_DISPLAY_NAME} · ${MOMO_PHONE}` : ''}
${order.deliveryOption === 'delivery' ? `Delivery Address: ${order.deliveryAddress || 'N/A'}` : 'Pickup: Store Pickup'}

Status: ${order.status.replace(/_/g, ' ').toUpperCase()}

Thank you for your business!
  `.trim();

  const blob = new Blob([invoiceContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${fileSlug}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${ordLabel}</title>
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
            <p><strong>Invoice #:</strong> ${ordLabel}</p>
            <p><strong>Date:</strong> ${format(new Date(order.createdAt), 'MMMM d, yyyy')}</p>
            <p><strong>Customer:</strong> ${order.userName || order.userEmail}</p>
            ${order.contactPhone ? `<p><strong>Contact phone:</strong> ${order.contactPhone}</p>` : ''}
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
                ${order.items
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>₵${item.price.toFixed(2)}</td>
                    <td>₵${(item.quantity * item.price).toFixed(2)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3"><strong>Subtotal:</strong></td>
                  <td><strong>₵${order.total.toFixed(2)}</strong></td>
                </tr>
                ${
                  order.deliveryFee
                    ? `
                <tr>
                  <td colspan="3">Delivery Fee:</td>
                  <td>₵${order.deliveryFee.toFixed(2)}</td>
                </tr>
                `
                    : ''
                }
                <tr class="total">
                  <td colspan="3"><strong>Total:</strong></td>
                  <td><strong>₵${grand.toFixed(2)}</strong></td>
                </tr>
                <tr>
                  <td colspan="3">Paid:</td>
                  <td>₵${paid.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="3">Balance:</td>
                  <td>₵${balance.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === 'momo' ? 'Mobile Money (Momo)' : 'Cash'}</p>
            ${
              order.paymentMethod === 'momo'
                ? `<p><strong>MoMo:</strong> ${MOMO_DISPLAY_NAME} · ${MOMO_PHONE}</p>`
                : ''
            }
            ${
              order.deliveryOption === 'delivery'
                ? `<p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'N/A'}</p>`
                : '<p><strong>Pickup:</strong> Store Pickup</p>'
            }
            <p><strong>Status:</strong> ${order.status.replace(/_/g, ' ').toUpperCase()}</p>
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
}
