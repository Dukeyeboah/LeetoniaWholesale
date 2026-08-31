import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WarehouseReceival, WarehouseReceivalLine } from '@/types';
import {
  effectiveReceivedQty,
  filterReceivalLines,
  receivalLineHasQtyDiscrepancy,
  receivalLineTone,
  type ReceivalListFilter,
  receivalSummary,
} from '@/lib/warehouse-receival';

const ARRIVED_FILL: [number, number, number] = [220, 252, 231];
const PENDING_FILL: [number, number, number] = [254, 249, 195];
const DISCREPANCY_FILL: [number, number, number] = [255, 237, 213];

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

function lineToRow(l: WarehouseReceivalLine): string[] {
  const received = l.arrived ? effectiveReceivedQty(l) : '';
  return [
    l.arrived ? 'Yes' : 'No',
    l.code,
    l.description,
    String(l.quantity),
    l.arrived ? String(received) : '',
    receivalLineHasQtyDiscrepancy(l) ? 'Yes' : l.arrived ? 'No' : '',
    l.unitPrice.toFixed(2),
    l.total.toFixed(2),
  ];
}

const HEADERS = [
  'Arrived',
  'Barcode',
  'Item',
  'Expected qty',
  'Received qty',
  'Qty mismatch',
  'Unit price (₵)',
  'Expected total (₵)',
];

function rowFillColor(line: WarehouseReceivalLine): [number, number, number] {
  const tone = receivalLineTone(line);
  if (tone === 'discrepancy') return DISCREPANCY_FILL;
  if (tone === 'arrived') return ARRIVED_FILL;
  return PENDING_FILL;
}

export function exportReceivalCsv(
  receival: WarehouseReceival,
  filter: ReceivalListFilter
) {
  const lines = filterReceivalLines(receival.lines, filter);
  const suffix =
    filter === 'all' ? 'full' : filter === 'arrived' ? 'arrived' : 'pending';
  downloadCsv(`warehouse-receival-${receival.monthKey}-${suffix}.csv`, [
    HEADERS,
    ...lines.map(lineToRow),
  ]);
}

export function exportReceivalPdf(
  receival: WarehouseReceival,
  filter: ReceivalListFilter,
  opts?: { splitSections?: boolean }
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const summary = receivalSummary(receival.lines);
  const title = receival.title;
  const suffix =
    filter === 'all' ? 'full' : filter === 'arrived' ? 'arrived' : 'pending';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `${summary.arrived} of ${summary.total} lines arrived · ${summary.receivedQty} / ${summary.expectedQty} units received · ${summary.discrepancies} qty mismatch${summary.discrepancies === 1 ? '' : 'es'}`,
    14,
    21
  );

  const renderTable = (
    startY: number,
    sectionTitle: string,
    lines: WarehouseReceivalLine[],
    highlightRows: boolean
  ) => {
    if (sectionTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(sectionTitle, 14, startY);
      startY += 5;
    }
    autoTable(doc, {
      startY,
      head: [HEADERS],
      body: lines.map(lineToRow),
      theme: 'striped',
      headStyles: { fillColor: [22, 101, 52] },
      styles: { fontSize: 7, cellPadding: 2 },
      didParseCell: (data) => {
        if (data.section !== 'body' || !highlightRows) return;
        const line = lines[data.row.index];
        if (!line) return;
        data.cell.styles.fillColor = rowFillColor(line);
      },
    });
    return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? startY + 20;
  };

  if (filter === 'all' && opts?.splitSections) {
    const arrived = filterReceivalLines(receival.lines, 'arrived');
    const pending = filterReceivalLines(receival.lines, 'pending');
    let y = 28;
    y = renderTable(y, `Arrived (${arrived.length})`, arrived, true) + 8;
    renderTable(y, `Not yet arrived (${pending.length})`, pending, true);
  } else {
    const lines = filterReceivalLines(receival.lines, filter);
    renderTable(28, '', lines, filter === 'all' || filter === 'arrived');
  }

  doc.save(`warehouse-receival-${receival.monthKey}-${suffix}.pdf`);
}

export function printReceivalHtml(
  receival: WarehouseReceival,
  filter: ReceivalListFilter,
  opts?: { splitSections?: boolean }
) {
  const summary = receivalSummary(receival.lines);
  const rowHtml = (l: WarehouseReceivalLine) => {
    const tone = receivalLineTone(l);
    const received = l.arrived ? effectiveReceivedQty(l) : '';
    return (
      `<tr class="${tone}">` +
      `<td>${l.arrived ? '✓' : ''}</td>` +
      `<td>${escapeHtml(l.code)}</td>` +
      `<td>${escapeHtml(l.description)}</td>` +
      `<td class="num">${l.quantity}</td>` +
      `<td class="num">${received}</td>` +
      `<td>${receivalLineHasQtyDiscrepancy(l) ? 'Yes' : l.arrived ? 'No' : ''}</td>` +
      `<td class="num">${l.unitPrice.toFixed(2)}</td>` +
      `<td class="num">${l.total.toFixed(2)}</td></tr>`
    );
  };

  const table = (lines: WarehouseReceivalLine[]) =>
    `<table><thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${lines.map(rowHtml).join('')}</tbody></table>`;

  let body = '';
  if (filter === 'all' && opts?.splitSections) {
    const arrived = filterReceivalLines(receival.lines, 'arrived');
    const pending = filterReceivalLines(receival.lines, 'pending');
    body += `<h2>Arrived (${arrived.length})</h2>${table(arrived)}`;
    body += `<h2>Not yet arrived (${pending.length})</h2>${table(pending)}`;
  } else {
    body = table(filterReceivalLines(receival.lines, filter));
  }

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(receival.title)}</title>` +
      `<style>
        body{font-family:system-ui,sans-serif;padding:16px;font-size:12px;}
        h1{font-size:18px;margin:0 0 4px;}
        h2{font-size:14px;margin:24px 0 8px;}
        .meta{color:#555;margin-bottom:16px;}
        table{border-collapse:collapse;width:100%;margin-bottom:16px;}
        th,td{border:1px solid #ccc;padding:5px 6px;text-align:left;}
        th{background:#166534;color:#fff;}
        tr.arrived td{background:#dcfce7;}
        tr.discrepancy td{background:#ffedd5;}
        tr.pending td{background:#fef9c3;}
        td.num{text-align:right;font-variant-numeric:tabular-nums;}
      </style></head><body>` +
      `<h1>${escapeHtml(receival.title)}</h1>` +
      `<p class="meta">${summary.arrived} of ${summary.total} lines arrived · ${summary.discrepancies} quantity mismatches</p>` +
      body +
      `</body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
