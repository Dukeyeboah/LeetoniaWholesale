import september2026Seed from '@/data/warehouse-receivals/2026-09.json';
import type {
  WarehouseReceival,
  WarehouseReceivalLine,
  WarehouseReceivalTransferBatch,
} from '@/types';
import { normalizeWarehouseCode } from '@/lib/warehouse-data';
import {
  getFirstCharacterGroup,
  type InventoryLetterFilter,
} from '@/lib/inventory-filters';

export const SEPTEMBER_2026_RECEIVAL_ID = '2026-09';

export type ReceivalImportRow = {
  code: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
};

function lineIdFromSeed(row: ReceivalImportRow, index: number): string {
  const code = normalizeWarehouseCode(row.code) || `row-${index}`;
  return `${code}-${index}`;
}

export function seedRowsToReceivalLines(
  rows: ReceivalImportRow[]
): WarehouseReceivalLine[] {
  return rows.map((row, index) => ({
    id: lineIdFromSeed(row, index),
    code: String(row.code ?? '').trim(),
    description: String(row.description ?? '').trim(),
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.price) || 0,
    total: Number(row.total) || 0,
    arrived: false,
  }));
}

export function buildSeptember2026Receival(): WarehouseReceival {
  const rows = september2026Seed as ReceivalImportRow[];
  const now = Date.now();
  return {
    id: SEPTEMBER_2026_RECEIVAL_ID,
    title: 'September 2026 warehouse receival',
    monthKey: SEPTEMBER_2026_RECEIVAL_ID,
    lines: seedRowsToReceivalLines(rows),
    transfers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Slug for Firestore doc id from a human title. */
export function slugifyReceivalTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function defaultMonthKeyFromDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function generateReceivalDocId(title: string, monthKey?: string): string {
  const base = monthKey?.trim() || defaultMonthKeyFromDate();
  const slug = slugifyReceivalTitle(title);
  if (!slug) return `${base}-${Date.now().toString(36)}`;
  return `${base}-${slug}`.slice(0, 80);
}

export function buildReceivalFromImport(
  title: string,
  rows: ReceivalImportRow[],
  opts?: { id?: string; monthKey?: string }
): WarehouseReceival {
  const now = Date.now();
  const monthKey = opts?.monthKey?.trim() || defaultMonthKeyFromDate();
  const id = opts?.id?.trim() || generateReceivalDocId(title, monthKey);
  return {
    id,
    title: title.trim() || 'Warehouse receival',
    monthKey,
    lines: seedRowsToReceivalLines(rows),
    transfers: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeImportRow(raw: Record<string, unknown>): ReceivalImportRow | null {
  const code = normalizeWarehouseCode(raw.code ?? raw.barcode ?? raw.sku);
  const description = String(raw.description ?? raw.name ?? raw.item ?? '').trim();
  const quantity = Number(raw.quantity ?? raw.qty ?? raw.units ?? 0);
  const price = Number(raw.price ?? raw.unitPrice ?? raw.unit_price ?? 0);
  const totalRaw = raw.total ?? raw.lineTotal ?? raw.line_total;
  const total =
    totalRaw != null && Number.isFinite(Number(totalRaw))
      ? Number(totalRaw)
      : quantity * price;
  if (!code && !description) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return {
    code: code || '',
    description,
    quantity: Math.floor(quantity),
    price: Number.isFinite(price) ? price : 0,
    total: Number.isFinite(total) ? total : 0,
  };
}

export function parseReceivalImportJson(text: string): ReceivalImportRow[] {
  const parsed = JSON.parse(text) as unknown;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const rows: ReceivalImportRow[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const row = normalizeImportRow(item as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows;
}

/** Minimal CSV parser for shipment manifests (comma or tab separated). */
export function parseReceivalImportCsv(text: string): ReceivalImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) =>
    h.replace(/^"|"$/g, '').trim().toLowerCase()
  );

  const idx = (names: string[]) =>
    headers.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const codeI = idx(['code', 'barcode', 'sku', 'product code']);
  const descI = idx(['description', 'name', 'item', 'product']);
  const qtyI = idx(['quantity', 'qty', 'units']);
  const priceI = idx(['price', 'unit price', 'unitprice', 'unit_price']);
  const totalI = idx(['total', 'line total', 'linetotal']);

  const rows: ReceivalImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) =>
      c.replace(/^"|"$/g, '').trim()
    );
    const raw: Record<string, unknown> = {};
    if (codeI >= 0) raw.code = cols[codeI];
    if (descI >= 0) raw.description = cols[descI];
    if (qtyI >= 0) raw.quantity = cols[qtyI];
    if (priceI >= 0) raw.price = cols[priceI];
    if (totalI >= 0) raw.total = cols[totalI];
    const row = normalizeImportRow(raw);
    if (row) rows.push(row);
  }
  return rows;
}

export function parseReceivalImportFile(
  text: string,
  filename: string
): ReceivalImportRow[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    return parseReceivalImportCsv(text);
  }
  return parseReceivalImportJson(text);
}

export type ReceivalListFilter = 'all' | 'arrived' | 'pending';

export function effectiveReceivedQty(line: WarehouseReceivalLine): number {
  if (!line.arrived) return 0;
  return line.receivedQty ?? line.quantity;
}

/** Qty confirmed on the palette but not yet transferred to warehouse. */
export function receivalLineTransferableQty(line: WarehouseReceivalLine): number {
  if (!line.arrived) return 0;
  const received = effectiveReceivedQty(line);
  const transferred = line.transferredQty ?? 0;
  return Math.max(0, received - transferred);
}

export function receivalLineFullyTransferred(line: WarehouseReceivalLine): boolean {
  return line.arrived && receivalLineTransferableQty(line) === 0;
}

export function receivalLineHasQtyDiscrepancy(line: WarehouseReceivalLine): boolean {
  return line.arrived && effectiveReceivedQty(line) !== line.quantity;
}

export type ReceivalLineTone = 'pending' | 'arrived' | 'discrepancy';

export function receivalLineTone(line: WarehouseReceivalLine): ReceivalLineTone {
  if (!line.arrived) return 'pending';
  if (receivalLineHasQtyDiscrepancy(line)) return 'discrepancy';
  return 'arrived';
}

/** Strip undefined and omit empty optional fields before Firestore writes. */
export function sanitizeReceivalLinesForFirestore(
  lines: WarehouseReceivalLine[]
): WarehouseReceivalLine[] {
  return lines.map((line) => {
    const base: WarehouseReceivalLine = {
      id: line.id,
      code: line.code,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
      arrived: line.arrived,
    };
    if (line.arrived && line.arrivedAt != null) {
      base.arrivedAt = line.arrivedAt;
    }
    if (
      line.arrived &&
      line.receivedQty != null &&
      line.receivedQty !== line.quantity
    ) {
      base.receivedQty = line.receivedQty;
    }
    if (line.notes?.trim()) {
      base.notes = line.notes.trim();
    }
    if (line.transferredQty != null && line.transferredQty > 0) {
      base.transferredQty = line.transferredQty;
    }
    return base;
  });
}

export function filterReceivalLines(
  lines: WarehouseReceivalLine[],
  filter: ReceivalListFilter
): WarehouseReceivalLine[] {
  if (filter === 'arrived') return lines.filter((l) => l.arrived);
  if (filter === 'pending') return lines.filter((l) => !l.arrived);
  return lines;
}

export function searchReceivalLines(
  lines: WarehouseReceivalLine[],
  query: string
): WarehouseReceivalLine[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;
  return lines.filter(
    (l) =>
      l.description.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
  );
}

export function filterReceivalLinesByNameLetter(
  lines: WarehouseReceivalLine[],
  letter: InventoryLetterFilter
): WarehouseReceivalLine[] {
  if (letter === 'all') return lines;
  return lines.filter(
    (l) => getFirstCharacterGroup(l.description || '') === letter
  );
}

export function sortReceivalLinesByName(
  lines: WarehouseReceivalLine[]
): WarehouseReceivalLine[] {
  return [...lines].sort((a, b) =>
    a.description.localeCompare(b.description, undefined, {
      sensitivity: 'base',
    })
  );
}

/** Normalize scanned barcode text for matching against receival line codes. */
export function normalizeReceivalBarcode(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * Find a receival line by scanned barcode.
 * Prefers exact code match; falls back to code containing / contained-by scan.
 */
export function findReceivalLineByBarcode(
  lines: WarehouseReceivalLine[],
  scanned: string
): WarehouseReceivalLine | null {
  const needle = normalizeReceivalBarcode(scanned);
  if (!needle) return null;

  const exact = lines.find(
    (l) => normalizeReceivalBarcode(l.code) === needle
  );
  if (exact) return exact;

  const fuzzy = lines.find((l) => {
    const code = normalizeReceivalBarcode(l.code);
    if (!code) return false;
    return code.includes(needle) || needle.includes(code);
  });
  return fuzzy ?? null;
}

export function receivalSummary(lines: WarehouseReceivalLine[]) {
  const arrivedLines = lines.filter((l) => l.arrived);
  const discrepancies = arrivedLines.filter(receivalLineHasQtyDiscrepancy);
  const transferableLines = arrivedLines.filter(
    (l) => receivalLineTransferableQty(l) > 0
  );
  const transferredLines = arrivedLines.filter(
    (l) => (l.transferredQty ?? 0) > 0
  );
  return {
    total: lines.length,
    arrived: arrivedLines.length,
    pending: lines.length - arrivedLines.length,
    discrepancies: discrepancies.length,
    transferable: transferableLines.length,
    transferableQty: transferableLines.reduce(
      (s, l) => s + receivalLineTransferableQty(l),
      0
    ),
    transferred: transferredLines.length,
    transferredQty: lines.reduce((s, l) => s + (l.transferredQty ?? 0), 0),
    receivedQty: arrivedLines.reduce(
      (s, l) => s + effectiveReceivedQty(l),
      0
    ),
    expectedQty: lines.reduce((s, l) => s + l.quantity, 0),
    arrivedExpectedQty: arrivedLines.reduce((s, l) => s + l.quantity, 0),
    receivedValue: arrivedLines.reduce(
      (s, l) => s + effectiveReceivedQty(l) * l.unitPrice,
      0
    ),
    expectedValue: lines.reduce((s, l) => s + l.total, 0),
  };
}

export function toggleReceivalLineArrived(
  lines: WarehouseReceivalLine[],
  lineId: string,
  arrived: boolean
): WarehouseReceivalLine[] {
  const now = Date.now();
  return lines.map((l) => {
    if (l.id !== lineId) return l;
    if (arrived) {
      return { ...l, arrived: true, arrivedAt: now };
    }
    const next = { ...l, arrived: false };
    delete next.arrivedAt;
    delete next.receivedQty;
    return next;
  });
}

/** Clear arrived / received qty on every line (e.g. undo a mistaken batch check). */
export function clearAllReceivalArrived(
  lines: WarehouseReceivalLine[]
): WarehouseReceivalLine[] {
  return lines.map((l) => {
    if (!l.arrived && l.receivedQty == null && l.arrivedAt == null) return l;
    const next = { ...l, arrived: false };
    delete next.arrivedAt;
    delete next.receivedQty;
    return next;
  });
}

export function setReceivalLineReceivedQty(
  lines: WarehouseReceivalLine[],
  lineId: string,
  raw: string
): WarehouseReceivalLine[] {
  const trimmed = raw.trim();
  return lines.map((l) => {
    if (l.id !== lineId) return l;
    if (!l.arrived) return l;
    if (trimmed === '') {
      const next = { ...l };
      delete next.receivedQty;
      return next;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return l;
    if (parsed === l.quantity) {
      const next = { ...l };
      delete next.receivedQty;
      return next;
    }
    return { ...l, receivedQty: parsed };
  });
}

export type ReceivalTransferLineInput = {
  lineId: string;
  qty: number;
};

/** Apply transferred qty to receival lines after a warehouse push. */
export function applyTransferToReceivalLines(
  lines: WarehouseReceivalLine[],
  transfers: ReceivalTransferLineInput[]
): WarehouseReceivalLine[] {
  const byId = new Map(transfers.map((t) => [t.lineId, t.qty]));
  return lines.map((line) => {
    const add = byId.get(line.id);
    if (!add || add <= 0) return line;
    const nextTransferred = (line.transferredQty ?? 0) + add;
    return { ...line, transferredQty: nextTransferred };
  });
}

export function appendReceivalTransferBatch(
  existing: WarehouseReceivalTransferBatch[] | undefined,
  batch: WarehouseReceivalTransferBatch
): WarehouseReceivalTransferBatch[] {
  return [...(existing ?? []), batch];
}
