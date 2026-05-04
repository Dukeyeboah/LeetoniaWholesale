import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Order } from '@/types';
import { formatOrderLabel } from '@/lib/order-display';
import { paymentMethodLabel } from '@/lib/payment-method-label';

/** MoMo payment details shown on invoices and checkout. */
export const MOMO_DISPLAY_NAME = 'Leetonia Wholesale';
export const MOMO_PHONE = '0244763235';

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function buildInvoicePdf(order: Order): jsPDF {
  const ordLabel = formatOrderLabel(order);
  const grand = order.total + (order.deliveryFee || 0);
  const paid =
    order.accountingStatus === 'paid' &&
    (order.amountPaidGHS == null || order.amountPaidGHS === undefined)
      ? grand
      : (order.amountPaidGHS ?? 0);
  const balance = Math.max(0, grand - paid);

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INVOICE', pageW / 2, 16, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Leetonia Wholesale', pageW / 2, 24, { align: 'center' });

  let y = 34;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${ordLabel}`, 14, y);
  y += 6;
  doc.text(
    `Date: ${format(new Date(order.createdAt), 'MMMM d, yyyy')}`,
    14,
    y
  );
  y += 6;
  const customerLabel =
    order.userName || order.userEmail || order.contactPhone || 'Customer';
  doc.text(`Customer: ${customerLabel}`, 14, y);
  if (order.contactPhone) {
    y += 6;
    doc.text(`Contact phone: ${order.contactPhone}`, 14, y);
  }

  autoTable(doc, {
    startY: y + 6,
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: order.items.map((item) => [
      item.name,
      String(item.quantity),
      `GHS ${item.price.toFixed(2)}`,
      `GHS ${(item.quantity * item.price).toFixed(2)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [22, 101, 52] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 'auto' },
    },
  });

  const finalY =
    (doc as DocWithAutoTable).lastAutoTable?.finalY != null
      ? (doc as DocWithAutoTable).lastAutoTable!.finalY + 8
      : y + 40;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let ty = finalY;
  doc.text(`Subtotal: GHS ${order.total.toFixed(2)}`, 14, ty);
  ty += 6;
  if (order.deliveryFee) {
    doc.text(`Delivery fee: GHS ${order.deliveryFee.toFixed(2)}`, 14, ty);
    ty += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: GHS ${grand.toFixed(2)}`, 14, ty);
  doc.setFont('helvetica', 'normal');
  ty += 6;
  doc.text(`Paid: GHS ${paid.toFixed(2)}`, 14, ty);
  ty += 6;
  doc.text(`Balance: GHS ${balance.toFixed(2)}`, 14, ty);
  ty += 8;

  doc.text(`Payment: ${paymentMethodLabel(order.paymentMethod)}`, 14, ty);
  if (order.paymentMethod === 'momo') {
    ty += 6;
    doc.text(`MoMo: ${MOMO_DISPLAY_NAME} · ${MOMO_PHONE}`, 14, ty);
  }
  ty += 6;

  if (order.deliveryOption === 'delivery') {
    const addr = order.deliveryAddress || 'N/A';
    const lines = doc.splitTextToSize(`Delivery address: ${addr}`, pageW - 28);
    doc.text(lines, 14, ty);
    ty += lines.length * 5 + 2;
  } else {
    doc.text('Pickup: Store pickup', 14, ty);
    ty += 6;
  }

  doc.text(
    `Status: ${order.status.replace(/_/g, ' ').toUpperCase()}`,
    14,
    ty
  );
  ty += 12;
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your business!', pageW / 2, ty, { align: 'center' });

  return doc;
}

/** Builds a PDF invoice and triggers download (filename ends in `.pdf`). */
export function printOrderInvoice(order: Order): void {
  const ordLabel = formatOrderLabel(order);
  const fileSlug = ordLabel.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
  const doc = buildInvoicePdf(order);
  doc.save(`invoice-${fileSlug}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
