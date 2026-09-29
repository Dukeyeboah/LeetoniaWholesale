import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rankProducts, slowSellers } from '@/lib/sales-analytics/analyze';
import { analysisFileBaseName } from '@/lib/sales-analytics/export';
import type {
  SalesAiSummary,
  SalesAnalysisMeta,
  SalesAnalysisResult,
} from '@/lib/sales-analytics/types';

type ReportInput = {
  meta: SalesAnalysisMeta;
  result: SalesAnalysisResult;
  slowThreshold: number;
  aiSummary?: SalesAiSummary;
};

const TEAL: [number, number, number] = [13, 148, 136];

function fmt(n: number | undefined, digits = 0): string {
  if (n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function keyTotals({ meta, result }: ReportInput): [string, string][] {
  const s = result.stats;
  const rows: [string, string][] = [
    ['Total products', fmt(s.totalProducts)],
    ['Total quantity sold', fmt(s.totalQuantity)],
    ['Average quantity per product', fmt(s.averageQuantity, 1)],
    ['Median quantity per product', fmt(s.medianQuantity, 1)],
  ];
  if (result.hasValue) {
    rows.push(
      [`Total sales value (${meta.currency})`, fmt(s.totalValue, 2)],
      [`Average sales value per product (${meta.currency})`, fmt(s.averageValue, 2)]
    );
  }
  return rows;
}

function slowSentence(input: ReportInput): string {
  const slow = slowSellers(input.result, input.slowThreshold);
  return `${slow.count.toLocaleString()} products (${(slow.catalogShare * 100).toFixed(1)}% of the catalog) sold fewer than ${input.slowThreshold} units during this period. These should be reviewed — not automatically discontinued.`;
}

function aiSections(ai: SalesAiSummary): [string, string][] {
  return [
    ['Overall picture', ai.overallPicture],
    ['Strong-performing products', ai.strongPerformers],
    ['Slow-selling products', ai.slowSellers],
    ['Quantity versus value', ai.quantityVsValue],
    ['Products or groups to review', ai.toReview],
    ['Practical next actions', ai.nextActions.map((a, i) => `${i + 1}. ${a}`).join('\n')],
    ['Limitations in the data', ai.limitations],
  ];
}

function drawBarChart(
  pdf: jsPDF,
  title: string,
  data: { label: string; value: number }[],
  x: number,
  y: number,
  width: number
): number {
  pdf.setFontSize(11);
  pdf.setTextColor(30);
  pdf.text(title, x, y);
  let cy = y + 5;
  const labelW = width * 0.42;
  const barMaxW = width - labelW - 18;
  const max = Math.max(1, ...data.map((d) => d.value));
  pdf.setFontSize(8);
  for (const d of data) {
    const label = d.label.length > 38 ? `${d.label.slice(0, 37)}…` : d.label;
    pdf.setTextColor(60);
    pdf.text(label, x, cy + 3);
    const w = Math.max(0.5, (d.value / max) * barMaxW);
    pdf.setFillColor(...TEAL);
    pdf.rect(x + labelW, cy, w, 4, 'F');
    pdf.text(fmt(d.value), x + labelW + w + 2, cy + 3);
    cy += 6;
  }
  return cy + 4;
}

export function exportSalesAnalysisPdf(input: ReportInput) {
  const { meta, result } = input;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;

  pdf.setFontSize(16);
  pdf.setTextColor(20);
  pdf.text(meta.name, margin, 18);
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(
    `${meta.periodStart} to ${meta.periodEnd} · ${meta.periodType === 'full_year' ? 'Full year' : 'Partial year'} · ${meta.fileName}`,
    margin,
    24
  );

  autoTable(pdf, {
    startY: 29,
    head: [['Key totals', '']],
    body: keyTotals(input),
    theme: 'grid',
    headStyles: { fillColor: TEAL },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const top = rankProducts(result.products, 'quantity', 'top', 10);
  y = drawBarChart(
    pdf,
    'Top 10 products by quantity sold',
    top.map((p) => ({ label: p.name, value: p.quantity })),
    margin,
    y,
    contentW
  );
  y = drawBarChart(
    pdf,
    'How many products sold each amount',
    result.quantityDistribution.map((b) => ({ label: b.label, value: b.count })),
    margin,
    y,
    contentW
  );

  const topHead = ['#', 'Product', 'Quantity'];
  if (result.hasValue) topHead.push(`Sales value (${meta.currency})`);
  autoTable(pdf, {
    startY: y,
    head: [topHead],
    body: top.map((p, i) => {
      const r = [String(i + 1), p.name, fmt(p.quantity)];
      if (result.hasValue) r.push(fmt(p.value, 2));
      return r;
    }),
    theme: 'striped',
    headStyles: { fillColor: TEAL },
    styles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const writeBlock = (heading: string, text: string) => {
    const lines = pdf.splitTextToSize(text, contentW) as string[];
    if (y + 8 + lines.length * 4.2 > pdf.internal.pageSize.getHeight() - 14) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFontSize(11);
    pdf.setTextColor(20);
    pdf.text(heading, margin, y);
    pdf.setFontSize(9);
    pdf.setTextColor(60);
    pdf.text(lines, margin, y + 5);
    y += 8 + lines.length * 4.2;
  };

  writeBlock('Slow-selling products', slowSentence(input));

  if (input.aiSummary) {
    writeBlock(
      'Simple AI summary',
      'Explanation generated from the verified figures above. Commercial guidance only — not clinical advice.'
    );
    for (const [h, t] of aiSections(input.aiSummary)) writeBlock(h, t);
  }

  pdf.save(`${analysisFileBaseName(meta)}.pdf`);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printSalesAnalysis(input: ReportInput) {
  const { meta, result } = input;
  const top = rankProducts(result.products, 'quantity', 'top', 20);
  const maxQty = Math.max(1, ...top.map((p) => p.quantity));
  const totals = keyTotals(input)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  const topRows = top
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="num">${fmt(p.quantity)}</td>${
          result.hasValue ? `<td class="num">${fmt(p.value, 2)}</td>` : ''
        }<td><div class="bar" style="width:${(p.quantity / maxQty) * 100}%"></div></td></tr>`
    )
    .join('');
  const dist = result.quantityDistribution
    .map((b) => `<tr><td>${esc(b.label)}</td><td class="num">${b.count.toLocaleString()}</td></tr>`)
    .join('');
  const ai = input.aiSummary
    ? `<h2>Simple AI summary</h2><p class="muted">Generated from the verified figures in this report. Commercial guidance only — not clinical advice.</p>${aiSections(
        input.aiSummary
      )
        .map(([h, t]) => `<h3>${esc(h)}</h3><p>${esc(t).replace(/\n/g, '<br/>')}</p>`)
        .join('')}`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(meta.name)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px;color:#0f766e}h3{font-size:12px;margin:12px 0 2px}
.muted{color:#666}table{border-collapse:collapse;width:100%;margin-top:6px}
th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}.num{text-align:right}
.bar{height:8px;background:#0d9488;border-radius:2px}
@media print{body{margin:10mm}}
</style></head><body>
<h1>${esc(meta.name)}</h1>
<p class="muted">${esc(meta.periodStart)} to ${esc(meta.periodEnd)} · ${meta.periodType === 'full_year' ? 'Full year' : 'Partial year'} · ${esc(meta.fileName)}</p>
<h2>Key totals</h2><table>${totals}</table>
<h2>Top 20 products by quantity sold</h2>
<table><tr><th>#</th><th>Product</th><th class="num">Quantity</th>${result.hasValue ? `<th class="num">Sales value (${esc(meta.currency)})</th>` : ''}<th style="width:25%"></th></tr>${topRows}</table>
<h2>How many products sold each amount</h2><table><tr><th>Units sold</th><th class="num">Products</th></tr>${dist}</table>
<h2>Slow-selling products</h2><p>${esc(slowSentence(input))}</p>
${ai}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
