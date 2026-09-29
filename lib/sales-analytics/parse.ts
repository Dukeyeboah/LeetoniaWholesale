import * as XLSX from 'xlsx';
import type {
  SalesBuildResult,
  SalesColumnMapping,
  SalesDataIssue,
  SalesDataWarning,
  SalesSourceRow,
  SalesUploadKind,
} from '@/lib/sales-analytics/types';

export const SALES_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const SALES_FILE_MAX_ROWS = 50_000;
export const SALES_FILE_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

export class SalesFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesFileError';
  }
}

export type SalesSheet = {
  name: string;
  headers: string[];
  /** Data rows below the header row (empty rows removed). */
  rows: unknown[][];
  /** 1-based spreadsheet row number of the header, for friendly messages. */
  headerRowNumber: number;
};

export type SalesWorkbook = {
  kind: 'excel' | 'csv';
  sheets: SalesSheet[];
};

export function salesFileExtension(fileName: string): string {
  const m = /\.[^.]+$/.exec(fileName.trim().toLowerCase());
  return m ? m[0] : '';
}

export function isSupportedSalesFile(fileName: string): boolean {
  return (SALES_FILE_EXTENSIONS as readonly string[]).includes(
    salesFileExtension(fileName)
  );
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0];

function isBlankCell(cell: unknown): boolean {
  return cell == null || (typeof cell === 'string' && cell.trim() === '');
}

function detectHeaderRow(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 20);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] ?? [];
    const filled = row.filter((c) => !isBlankCell(c));
    const hasText = filled.some(
      (c) => typeof c === 'string' && parseNumericCell(c).value === null
    );
    if (filled.length >= 2 && hasText) return i;
  }
  return 0;
}

function sheetFromAoa(name: string, aoa: unknown[][]): SalesSheet | null {
  if (aoa.length === 0) return null;
  const headerIdx = detectHeaderRow(aoa);
  const headerRow = aoa[headerIdx] ?? [];
  const body = aoa
    .slice(headerIdx + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => !isBlankCell(c)));
  const width = Math.max(
    headerRow.length,
    ...body.slice(0, 200).map((r) => r.length)
  );
  if (width === 0) return null;
  const headers = Array.from({ length: width }, (_, i) => {
    const h = headerRow[i];
    const text = h == null ? '' : String(h).trim();
    return text || `Column ${i + 1}`;
  });
  return { name, headers, rows: body, headerRowNumber: headerIdx + 1 };
}

/**
 * Read an .xlsx / .xls / .csv file into header + data rows.
 * Throws `SalesFileError` with an admin-friendly message on bad input.
 */
export function readSalesSpreadsheet(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): SalesWorkbook {
  const ext = salesFileExtension(fileName);
  if (!isSupportedSalesFile(fileName)) {
    throw new SalesFileError(
      'Please choose an Excel (.xlsx, .xls) or CSV (.csv) file.'
    );
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) {
    throw new SalesFileError('This file is empty.');
  }
  if (bytes.byteLength > SALES_FILE_MAX_BYTES) {
    throw new SalesFileError('This file is larger than 10 MB. Please upload a smaller file.');
  }

  if (ext === '.xlsx' && !startsWith(bytes, ZIP_SIG)) {
    throw new SalesFileError(
      'This does not look like a valid Excel (.xlsx) file. Try saving it again from Excel.'
    );
  }
  if (
    ext === '.xls' &&
    !startsWith(bytes, OLE_SIG) &&
    !startsWith(bytes, ZIP_SIG) &&
    bytes[0] !== 0x3c /* '<' — XML / HTML Excel export */
  ) {
    throw new SalesFileError(
      'This does not look like a valid Excel (.xls) file. Try saving it as .xlsx or .csv.'
    );
  }

  let wb: XLSX.WorkBook;
  try {
    if (ext === '.csv') {
      const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
      wb = XLSX.read(text, { type: 'string', raw: true });
    } else {
      wb = XLSX.read(bytes, { type: 'array', cellDates: false });
    }
  } catch {
    throw new SalesFileError(
      'We could not read this file. It may be damaged or password protected.'
    );
  }

  const sheets: SalesSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    const sheet = sheetFromAoa(sheetName, aoa);
    if (sheet && sheet.rows.length > 0) sheets.push(sheet);
  }

  if (sheets.length === 0) {
    throw new SalesFileError(
      'No product rows were found. Check that the file has a header row and data below it.'
    );
  }
  for (const s of sheets) {
    if (s.rows.length > SALES_FILE_MAX_ROWS) {
      throw new SalesFileError(
        `Sheet "${s.name}" has more than ${SALES_FILE_MAX_ROWS.toLocaleString()} rows. Please split the file.`
      );
    }
  }

  return { kind: ext === '.csv' ? 'csv' : 'excel', sheets };
}

// ---------------------------------------------------------------------------
// Numbers

export type ParsedNumericCell = {
  value: number | null;
  /** True when the number was stored as text (e.g. "1,200" or "GH₵ 50"). */
  wasText: boolean;
  blank: boolean;
};

const CURRENCY_TOKENS = /(gh₵|gh¢|ghs|ghc|usd|eur|gbp|₵|¢|\$|€|£)/gi;

export function parseNumericCell(cell: unknown): ParsedNumericCell {
  if (cell == null) return { value: null, wasText: false, blank: true };
  if (typeof cell === 'number') {
    return Number.isFinite(cell)
      ? { value: cell, wasText: false, blank: false }
      : { value: null, wasText: false, blank: false };
  }
  if (typeof cell !== 'string') {
    return { value: null, wasText: false, blank: false };
  }
  const trimmed = cell.trim();
  if (trimmed === '') return { value: null, wasText: false, blank: true };

  let s = trimmed.replace(CURRENCY_TOKENS, '').replace(/[,\s]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)) {
    return { value: null, wasText: true, blank: false };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, wasText: true, blank: false };
  return { value: negative ? -n : n, wasText: true, blank: false };
}

// ---------------------------------------------------------------------------
// Dates

export type ParsedDateCell = {
  /** YYYY-MM-DD, or null when blank / not a date. */
  iso: string | null;
  blank: boolean;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function lastDayOfMonth(y: number, m: number): number {
  if (y < 100) y += 2000;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Read an expiry date. Accepts Excel serial numbers, ISO dates, day-first
 * dates (dd/mm/yyyy — Ghana convention; flips to mm/dd only when the day
 * part cannot be a month), and month + year only (treated as the last day
 * of that month, which is how expiry dates are printed on packs).
 */
export function parseDateCell(cell: unknown): ParsedDateCell {
  if (cell == null) return { iso: null, blank: true };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return { iso: null, blank: false };
    return {
      iso: isoFromParts(cell.getFullYear(), cell.getMonth() + 1, cell.getDate()),
      blank: false,
    };
  }
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell < 20000 || cell > 80000) {
      return { iso: null, blank: false };
    }
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000);
    return {
      iso: isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      blank: false,
    };
  }
  if (typeof cell !== 'string') return { iso: null, blank: false };
  const s = cell.trim().toLowerCase();
  if (!s) return { iso: null, blank: true };

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/.exec(s);
  if (m) return { iso: isoFromParts(+m[1], +m[2], +m[3]), blank: false };

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return { iso: isoFromParts(+m[3], mo, d), blank: false };
  }

  m = /^(\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s);
  if (m) {
    const mo = +m[1];
    const y = +m[2];
    if (mo < 1 || mo > 12) return { iso: null, blank: false };
    return { iso: isoFromParts(y, mo, lastDayOfMonth(y, mo)), blank: false };
  }

  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    if (mo < 1 || mo > 12) return { iso: null, blank: false };
    return { iso: isoFromParts(y, mo, lastDayOfMonth(y, mo)), blank: false };
  }

  m = /^(\d{1,2})[\s\-/.]+([a-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 4)] ?? MONTHS[m[2].slice(0, 3)];
    if (!mo) return { iso: null, blank: false };
    return { iso: isoFromParts(+m[3], mo, +m[1]), blank: false };
  }

  m = /^([a-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    if (!mo) return { iso: null, blank: false };
    const y = +m[2];
    return { iso: isoFromParts(y, mo, lastDayOfMonth(y, mo)), blank: false };
  }

  return { iso: null, blank: false };
}

// ---------------------------------------------------------------------------
// Column mapping

export const UNMAPPED = -1;

export type SalesMappingField = keyof SalesColumnMapping;

export const MAPPING_FIELDS: SalesMappingField[] = [
  'name',
  'code',
  'quantity',
  'value',
  'unitPrice',
  'expiry',
  'batch',
];

/** Read a mapping field, treating missing (older saved analyses) as unmapped. */
export function mappedColumn(mapping: SalesColumnMapping, field: SalesMappingField): number {
  const v = mapping[field];
  return typeof v === 'number' ? v : UNMAPPED;
}

export function emptyColumnMapping(): Required<SalesColumnMapping> {
  return {
    name: UNMAPPED,
    quantity: UNMAPPED,
    value: UNMAPPED,
    code: UNMAPPED,
    expiry: UNMAPPED,
    batch: UNMAPPED,
    unitPrice: UNMAPPED,
  };
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9₵]+/g, ' ')
    .trim();
}

type FieldRule = {
  exact: string[];
  contains: string[];
  exclude: string[];
};

const FIELD_RULES: Record<SalesMappingField, FieldRule> = {
  name: {
    exact: [
      'product name',
      'item name',
      'product',
      'item',
      'description',
      'product description',
      'item description',
      'name',
      'drug',
      'drug name',
      'medicine',
    ],
    contains: ['product', 'item', 'description', 'name', 'drug', 'medicine'],
    exclude: [
      'code', 'sku', 'barcode', 'id', 'no', 'number', 'qty', 'quantity', 'value', 'price',
      'batch', 'expiry', 'exp',
    ],
  },
  quantity: {
    exact: [
      'qty',
      'quantity',
      'qty sold',
      'quantity sold',
      'units',
      'units sold',
      'sold',
      'total qty',
      'total quantity',
      'volume',
      'pcs',
      'pieces',
      'stock',
      'on hand',
      'qty on hand',
      'quantity on hand',
      'balance',
      'closing stock',
      'stock level',
      'qoh',
    ],
    contains: ['qty', 'quantit', 'units', 'sold', 'pcs', 'stock', 'on hand', 'balance'],
    exclude: ['price', 'value', 'amount', 'cost', 'revenue', 'item', 'name', 'description', 'product', 'date'],
  },
  value: {
    exact: [
      'sales value',
      'value',
      'amount',
      'sales',
      'sales amount',
      'total sales',
      'net sales',
      'revenue',
      'total',
      'total value',
      'turnover',
    ],
    contains: ['value', 'amount', 'revenue', 'sales', 'ghs', 'cedi', '₵', 'total', 'turnover'],
    exclude: ['qty', 'quantit', 'units', 'price', 'cost', 'code'],
  },
  code: {
    exact: [
      'code',
      'sku',
      'barcode',
      'item code',
      'product code',
      'product id',
      'item id',
      'item no',
      'id',
    ],
    contains: ['code', 'sku', 'barcode'],
    exclude: [],
  },
  unitPrice: {
    exact: [
      'unit price',
      'price',
      'selling price',
      'cost price',
      'unit cost',
      'price per unit',
      'retail price',
      'wholesale price',
      'rate',
    ],
    contains: ['price'],
    exclude: ['total', 'amount', 'value'],
  },
  expiry: {
    exact: [
      'expiry',
      'expiry date',
      'exp',
      'exp date',
      'expiration',
      'expiration date',
      'best before',
      'use by',
    ],
    contains: ['expir', 'exp date', 'best before'],
    exclude: [],
  },
  batch: {
    exact: ['batch', 'batch no', 'batch number', 'lot', 'lot no', 'lot number'],
    contains: ['batch'],
    exclude: [],
  },
};

function headerScore(header: string, rule: FieldRule): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const words = h.split(' ');
  if (rule.exclude.some((x) => words.includes(x) || (x.length > 3 && h.includes(x)))) {
    return 0;
  }
  if (rule.exact.includes(h)) return 10;
  if (rule.contains.some((k) => h.includes(k))) return 5;
  return 0;
}

function numericRatio(rows: unknown[][], col: number): number {
  const sample = rows.slice(0, 50).map((r) => r[col]).filter((c) => !isBlankCell(c));
  if (sample.length === 0) return 0;
  return sample.filter((c) => parseNumericCell(c).value !== null).length / sample.length;
}

/** Suggest which columns hold each field. */
export function suggestColumnMapping(
  headers: string[],
  rows: unknown[][] = []
): Required<SalesColumnMapping> {
  const used = new Set<number>();
  const mapping = emptyColumnMapping();

  const pick = (field: SalesMappingField) => {
    let best = UNMAPPED;
    let bestScore = 0;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const score = headerScore(h, FIELD_RULES[field]);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best !== UNMAPPED) {
      mapping[field] = best;
      used.add(best);
    }
  };

  pick('code');
  pick('expiry');
  pick('batch');
  pick('unitPrice');
  pick('quantity');
  pick('value');
  pick('name');

  // Fallbacks based on the data itself.
  if (mapping.name === UNMAPPED && rows.length > 0) {
    const i = headers.findIndex((_, c) => !used.has(c) && numericRatio(rows, c) < 0.4);
    if (i >= 0) {
      mapping.name = i;
      used.add(i);
    }
  }
  if (mapping.quantity === UNMAPPED && rows.length > 0) {
    const i = headers.findIndex((_, c) => !used.has(c) && numericRatio(rows, c) > 0.8);
    if (i >= 0) {
      mapping.quantity = i;
      used.add(i);
    }
  }
  return mapping;
}

export function validateColumnMapping(
  mapping: SalesColumnMapping,
  headerCount: number,
  kind: SalesUploadKind = 'sales'
): string | null {
  const cols = MAPPING_FIELDS.map((f) => mappedColumn(mapping, f));
  const inRange = (i: number) => i === UNMAPPED || (i >= 0 && i < headerCount);
  if (!cols.every(inRange)) return 'A selected column no longer exists.';
  if (mapping.name === UNMAPPED) return 'Choose the column that holds the product name.';
  if (kind === 'expiry') {
    if (mappedColumn(mapping, 'expiry') === UNMAPPED) {
      return 'Choose the column that holds the expiry date.';
    }
  } else if (mapping.quantity === UNMAPPED) {
    return kind === 'stock'
      ? 'Choose the column that holds the stock quantity.'
      : 'Choose the column that holds the quantity sold.';
  }
  const chosen = cols.filter((i) => i !== UNMAPPED);
  if (new Set(chosen).size !== chosen.length) {
    return 'Each column can only be used once.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Building clean rows + warnings

const TOTAL_ROW = /^\s*(grand\s+)?totals?\s*:?\s*$/i;
const MAX_ISSUES = 5000;

function pushWarning(
  list: SalesDataWarning[],
  kind: SalesDataWarning['kind'],
  count: number,
  message: string,
  examples: string[] = []
) {
  if (count <= 0) return;
  list.push({
    kind,
    count,
    message,
    ...(examples.length ? { examples: examples.slice(0, 10) } : {}),
  });
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(a) * 1e-9);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function cellText(cell: unknown): string {
  return cell == null ? '' : String(cell).replace(/\s+/g, ' ').trim();
}

/**
 * Turn mapped spreadsheet rows into validated source rows (one per file row).
 * Rows with a blank name, invalid / negative numbers, or a "Total" label are
 * excluded and reported. Rows are NOT combined here — consolidation does that.
 */
export function buildSalesRows(
  sheet: SalesSheet,
  mapping: SalesColumnMapping,
  opts: { flagTextNumbers?: boolean; kind?: SalesUploadKind } = {}
): SalesBuildResult {
  const kind = opts.kind ?? 'sales';
  const colQty = mappedColumn(mapping, 'quantity');
  const colValue = mappedColumn(mapping, 'value');
  const colCode = mappedColumn(mapping, 'code');
  const colExpiry = mappedColumn(mapping, 'expiry');
  const colBatch = mappedColumn(mapping, 'batch');
  const colPrice = mappedColumn(mapping, 'unitPrice');
  const hasQty = colQty !== UNMAPPED;
  const hasValue = colValue !== UNMAPPED;
  const hasCode = colCode !== UNMAPPED;
  const hasExpiry = colExpiry !== UNMAPPED;
  const hasUnitPrice = colPrice !== UNMAPPED;
  const expiryRequired = kind === 'expiry';
  const blankQtyIsZero = kind !== 'sales';

  const rows: SalesSourceRow[] = [];
  const warnings: SalesDataWarning[] = [];
  const issues: SalesDataIssue[] = [];
  const issue = (rowNumber: number, name: string, problem: string, excluded: boolean) => {
    if (issues.length < MAX_ISSUES) issues.push({ rowNumber, name, problem, excluded });
  };

  const blankNameRows: string[] = [];
  const invalidQty: string[] = [];
  const missingQty: string[] = [];
  const invalidValue: string[] = [];
  const missingValue: string[] = [];
  const negativeQty: string[] = [];
  const negativeValue: string[] = [];
  const invalidExpiry: string[] = [];
  const inconsistentPrice: string[] = [];
  let textNumberCount = 0;
  let excluded = 0;
  let fileQty = 0;
  let fileValue = 0;
  let statedQty: number | undefined;
  let statedValue: number | undefined;
  let totalRowCount = 0;

  sheet.rows.forEach((raw, i) => {
    const rowNumber = sheet.headerRowNumber + 1 + i;
    const name = cellText(raw[mapping.name]);
    const qty = hasQty
      ? parseNumericCell(raw[colQty])
      : { value: 0, wasText: false, blank: false };
    const val = hasValue ? parseNumericCell(raw[colValue]) : null;

    if (name && TOTAL_ROW.test(name)) {
      totalRowCount += 1;
      if (qty.value !== null && hasQty) statedQty = qty.value;
      if (val?.value != null) statedValue = val.value;
      return;
    }

    if (qty.value !== null) fileQty += qty.value;
    if (val?.value != null) fileValue += val.value;

    if (!name) {
      blankNameRows.push(`Row ${rowNumber}`);
      issue(rowNumber, '', 'No product name', true);
      excluded += 1;
      return;
    }

    let quantity: number;
    if (qty.value === null) {
      if (qty.blank && blankQtyIsZero) {
        missingQty.push(name);
        issue(rowNumber, name, 'Quantity is blank — counted as 0', false);
        quantity = 0;
      } else {
        invalidQty.push(name);
        issue(rowNumber, name, 'Quantity is blank or not a number', true);
        excluded += 1;
        return;
      }
    } else {
      quantity = qty.value;
    }
    if (quantity < 0) {
      negativeQty.push(name);
      issue(rowNumber, name, `Negative quantity (${quantity})`, true);
      excluded += 1;
      return;
    }
    if (val && val.value !== null && val.value < 0) {
      negativeValue.push(name);
      issue(rowNumber, name, `Negative sales value (${val.value})`, true);
      excluded += 1;
      return;
    }

    let expiry: string | undefined;
    if (hasExpiry) {
      const d = parseDateCell(raw[colExpiry]);
      if (d.iso) {
        expiry = d.iso;
      } else if (expiryRequired || !d.blank) {
        invalidExpiry.push(name);
        issue(
          rowNumber,
          name,
          d.blank ? 'Expiry date is blank' : `Expiry date not understood (${cellText(raw[colExpiry])})`,
          expiryRequired
        );
        if (expiryRequired) {
          excluded += 1;
          return;
        }
      }
    }

    if (qty.wasText) textNumberCount += 1;
    if (val?.wasText && val.value !== null) textNumberCount += 1;

    const row: SalesSourceRow = { rowNumber, name, quantity };
    if (hasCode) {
      const code = cellText(raw[colCode]);
      if (code) row.code = code;
    }
    if (expiry) row.expiry = expiry;
    if (colBatch !== UNMAPPED) {
      const batch = cellText(raw[colBatch]);
      if (batch) row.batch = batch;
    }
    if (hasUnitPrice) {
      const p = parseNumericCell(raw[colPrice]);
      if (p.value !== null && p.value >= 0) row.unitPrice = p.value;
      else if (!p.blank) issue(rowNumber, name, 'Unit price is not a valid number — ignored', false);
    }
    if (val) {
      if (val.blank) {
        missingValue.push(name);
        issue(rowNumber, name, 'Sales value is blank — counted as 0', false);
        row.value = 0;
      } else if (val.value === null) {
        invalidValue.push(name);
        issue(rowNumber, name, 'Sales value is not a number — counted as 0', false);
        row.value = 0;
      } else {
        row.value = val.value;
      }
    }
    if (row.unitPrice !== undefined && row.value !== undefined && !val?.blank && quantity > 0) {
      const expected = quantity * row.unitPrice;
      if (Math.abs(expected - row.value) > Math.max(0.05, Math.abs(row.value) * 0.01)) {
        inconsistentPrice.push(name);
        issue(
          rowNumber,
          name,
          `Quantity × unit price (${roundMoney(expected)}) does not match the amount (${roundMoney(row.value)})`,
          false
        );
      }
    }
    rows.push(row);
  });

  pushWarning(
    warnings,
    'blank_names',
    blankNameRows.length,
    `${blankNameRows.length} row(s) have no product name and were left out.`,
    blankNameRows
  );
  pushWarning(
    warnings,
    'invalid_quantity',
    invalidQty.length,
    `${invalidQty.length} product(s) have a quantity that is blank or not a number and were left out.`,
    invalidQty
  );
  pushWarning(
    warnings,
    'missing_quantity',
    missingQty.length,
    `${missingQty.length} product(s) have no quantity. It was counted as 0.`,
    missingQty
  );
  pushWarning(
    warnings,
    'negative_quantity',
    negativeQty.length,
    `${negativeQty.length} product(s) have a negative quantity and were left out. Check for returns or typing errors.`,
    negativeQty
  );
  pushWarning(
    warnings,
    'negative_value',
    negativeValue.length,
    `${negativeValue.length} product(s) have a negative sales value and were left out.`,
    negativeValue
  );
  pushWarning(
    warnings,
    'invalid_value',
    invalidValue.length,
    `${invalidValue.length} product(s) have a sales value that is not a number. It was counted as 0.`,
    invalidValue
  );
  pushWarning(
    warnings,
    'missing_value',
    missingValue.length,
    `${missingValue.length} product(s) have no sales value. It was counted as 0.`,
    missingValue
  );
  pushWarning(
    warnings,
    'invalid_expiry',
    invalidExpiry.length,
    expiryRequired
      ? `${invalidExpiry.length} row(s) have a missing or unreadable expiry date and were left out.`
      : `${invalidExpiry.length} row(s) have an unreadable expiry date. The date was ignored.`,
    invalidExpiry
  );
  pushWarning(
    warnings,
    'inconsistent_price',
    inconsistentPrice.length,
    `${inconsistentPrice.length} row(s) have a quantity × unit price that does not match the amount. The amount from the file was used.`,
    inconsistentPrice
  );
  if (opts.flagTextNumbers) {
    pushWarning(
      warnings,
      'text_numbers',
      textNumberCount,
      `${textNumberCount} number(s) were stored as text in Excel (for example "1,200" or "GH₵ 50"). They were read as numbers — please double-check the file.`
    );
  }

  const analyzedQty = rows.reduce((s, r) => s + r.quantity, 0);
  const analyzedValue = hasValue
    ? rows.reduce((s, r) => s + (r.value ?? 0), 0)
    : undefined;

  if (totalRowCount > 0) {
    pushWarning(
      warnings,
      'total_row',
      totalRowCount,
      'A "Total" row was found in the file. It was used to check the totals and not counted as a product.'
    );
  }

  const mismatches: string[] = [];
  if (hasQty) {
    if (statedQty !== undefined && !nearlyEqual(statedQty, analyzedQty)) {
      mismatches.push(
        `quantity: the file's Total row says ${statedQty.toLocaleString()}, products add up to ${analyzedQty.toLocaleString()}`
      );
    } else if (!nearlyEqual(fileQty, analyzedQty)) {
      mismatches.push(
        `quantity: the file adds up to ${fileQty.toLocaleString()}, analysed products add up to ${analyzedQty.toLocaleString()}`
      );
    }
  }
  if (hasValue && analyzedValue !== undefined) {
    if (statedValue !== undefined && !nearlyEqual(statedValue, analyzedValue)) {
      mismatches.push(
        `sales value: the file's Total row says ${roundMoney(statedValue).toLocaleString()}, products add up to ${roundMoney(analyzedValue).toLocaleString()}`
      );
    } else if (!nearlyEqual(fileValue, analyzedValue)) {
      mismatches.push(
        `sales value: the file adds up to ${roundMoney(fileValue).toLocaleString()}, analysed products add up to ${roundMoney(analyzedValue).toLocaleString()}`
      );
    }
  }
  pushWarning(
    warnings,
    'total_mismatch',
    mismatches.length,
    `Totals do not match — ${mismatches.join('; ')}. This is usually caused by the rows left out above.`
  );

  return {
    rows,
    hasValue,
    hasCode,
    hasExpiry,
    hasUnitPrice,
    warnings,
    issues,
    reconciliation: {
      fileQuantityTotal: fileQty,
      analyzedQuantityTotal: analyzedQty,
      ...(hasValue
        ? { fileValueTotal: roundMoney(fileValue), analyzedValueTotal: roundMoney(analyzedValue ?? 0) }
        : {}),
      ...(statedQty !== undefined ? { statedQuantityTotal: statedQty } : {}),
      ...(statedValue !== undefined ? { statedValueTotal: statedValue } : {}),
      excludedRowCount: excluded,
    },
  };
}
