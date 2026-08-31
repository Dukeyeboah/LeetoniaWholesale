import september2026Seed from '@/data/warehouse-receivals/2026-09.json';
import type { WarehouseReceival, WarehouseReceivalLine } from '@/types';
import { normalizeWarehouseCode } from '@/lib/warehouse-data';
import {
  getFirstCharacterGroup,
  type InventoryLetterFilter,
} from '@/lib/inventory-filters';

export const SEPTEMBER_2026_RECEIVAL_ID = '2026-09';

type SeedRow = {
  code: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
};

function lineIdFromSeed(row: SeedRow, index: number): string {
  const code = normalizeWarehouseCode(row.code) || `row-${index}`;
  return `${code}-${index}`;
}

export function seedRowsToReceivalLines(rows: SeedRow[]): WarehouseReceivalLine[] {
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
  const rows = september2026Seed as SeedRow[];
  const now = Date.now();
  return {
    id: SEPTEMBER_2026_RECEIVAL_ID,
    title: 'September 2026 warehouse receival',
    monthKey: SEPTEMBER_2026_RECEIVAL_ID,
    lines: seedRowsToReceivalLines(rows),
    createdAt: now,
    updatedAt: now,
  };
}

export type ReceivalListFilter = 'all' | 'arrived' | 'pending';

export function effectiveReceivedQty(line: WarehouseReceivalLine): number {
  if (!line.arrived) return 0;
  return line.receivedQty ?? line.quantity;
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
  return {
    total: lines.length,
    arrived: arrivedLines.length,
    pending: lines.length - arrivedLines.length,
    discrepancies: discrepancies.length,
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
