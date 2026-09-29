import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { fnvHash } from '@/lib/sales-analytics/normalize';
import type {
  ConsolidationSummary,
  InventoryApplyRecord,
  MatchDecision,
  MatchMethod,
  ProductMappingRule,
  SalesAnalysisMeta,
  SalesBuildResult,
  SalesColumnMapping,
  SalesProductRow,
  SalesSourceRow,
  SalesSummaryStats,
  SavedSalesAnalysis,
  StoredSalesAiSummary,
} from '@/lib/sales-analytics/types';

export const SALES_ANALYSES_COLLECTION = 'salesAnalyses';
/** Approved product mapping rules live in one document next to the analyses. */
export const PRODUCT_MAPPINGS_DOC = '__productMappings';
const PRODUCT_ROWS_PER_CHUNK = 1000;
const SOURCE_ROWS_PER_CHUNK = 2000;
const DOCS_PER_BATCH = 20;
const MAX_STORED_ISSUES = 500;
const MAX_STORED_DECISIONS = 3000;
const FILE_UPLOAD_TIMEOUT_MS = 30_000;

type CompactRow = {
  n: string;
  q: number;
  c?: string;
  v?: number;
  p?: number;
  e?: string;
  bc?: number;
  rc?: number;
  src?: number[];
  nn?: string;
  m?: MatchMethod;
  cf?: 'high' | 'reviewed';
  d?: 'auto' | 'approved';
  dt?: number;
};

type CompactSourceRow = {
  r: number;
  n: string;
  q: number;
  c?: string;
  v?: number;
  p?: number;
  e?: string;
  b?: string;
};

/** Firestore rejects `undefined` anywhere in a document. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toCompact(r: SalesProductRow): CompactRow {
  const out: CompactRow = { n: r.name, q: r.quantity };
  if (r.code) out.c = r.code;
  if (r.value !== undefined) out.v = r.value;
  if (r.unitPrice !== undefined) out.p = r.unitPrice;
  if (r.expiry) out.e = r.expiry;
  if (r.batchCount !== undefined) out.bc = r.batchCount;
  if (r.rowCount !== undefined) out.rc = r.rowCount;
  if (r.sourceRows) out.src = r.sourceRows;
  if (r.normalizedName) out.nn = r.normalizedName;
  if (r.matchMethod) out.m = r.matchMethod;
  if (r.confidence) out.cf = r.confidence;
  if (r.decision) out.d = r.decision;
  if (r.decidedAt !== undefined) out.dt = r.decidedAt;
  return out;
}

function fromCompact(r: CompactRow): SalesProductRow {
  const out: SalesProductRow = { name: r.n, quantity: r.q };
  if (r.c) out.code = r.c;
  if (r.v !== undefined) out.value = r.v;
  if (r.p !== undefined) out.unitPrice = r.p;
  if (r.e) out.expiry = r.e;
  if (r.bc !== undefined) out.batchCount = r.bc;
  if (r.rc !== undefined) out.rowCount = r.rc;
  if (r.src) out.sourceRows = r.src;
  if (r.nn) out.normalizedName = r.nn;
  if (r.m) out.matchMethod = r.m;
  if (r.cf) out.confidence = r.cf;
  if (r.d) out.decision = r.d;
  if (r.dt !== undefined) out.decidedAt = r.dt;
  return out;
}

function toCompactSource(r: SalesSourceRow): CompactSourceRow {
  const out: CompactSourceRow = { r: r.rowNumber, n: r.name, q: r.quantity };
  if (r.code) out.c = r.code;
  if (r.value !== undefined) out.v = r.value;
  if (r.unitPrice !== undefined) out.p = r.unitPrice;
  if (r.expiry) out.e = r.expiry;
  if (r.batch) out.b = r.batch;
  return out;
}

function fromCompactSource(r: CompactSourceRow): SalesSourceRow {
  const out: SalesSourceRow = { rowNumber: r.r, name: r.n, quantity: r.q };
  if (r.c) out.code = r.c;
  if (r.v !== undefined) out.value = r.v;
  if (r.p !== undefined) out.unitPrice = r.p;
  if (r.e) out.expiry = r.e;
  if (r.b) out.batch = r.b;
  return out;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function writeInBatches(
  db: Firestore,
  writes: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[]
): Promise<void> {
  for (const part of chunked(writes, DOCS_PER_BATCH)) {
    const batch = writeBatch(db);
    for (const w of part) batch.set(w.ref, w.data);
    await batch.commit();
  }
}

export const SALES_UPLOADS_FOLDER = 'salesUploads';

const SPREADSHEET_CONTENT_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

export function salesSourceFilePath(analysisId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'upload';
  return `${SALES_UPLOADS_FOLDER}/${analysisId}/${safe}`;
}

async function uploadSourceFile(
  storage: FirebaseStorage,
  analysisId: string,
  file: File
): Promise<SavedSalesAnalysis['sourceFile']> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = SPREADSHEET_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const path = salesSourceFilePath(analysisId, file.name);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Upload timed out')), FILE_UPLOAD_TIMEOUT_MS);
  });
  try {
    await Promise.race([uploadBytes(storageRef(storage, path), file, { contentType }), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return { path, size: file.size, contentType };
}

export type SaveSalesAnalysisResult = { id: string; fileStored: boolean };

export type SaveStage = 'file' | 'rows' | 'record';

/**
 * Saves the analysis: consolidated products (what every dashboard uses), the
 * original validated rows (audit trail) and, when `file` is given, the
 * original upload in Storage. The analysis is still saved if the file upload
 * fails or times out.
 */
export async function saveSalesAnalysis(
  db: Firestore,
  input: {
    meta: SalesAnalysisMeta;
    mapping: SalesColumnMapping;
    build: SalesBuildResult;
    products: SalesProductRow[];
    stats: SalesSummaryStats;
    consolidation?: ConsolidationSummary;
    decisions?: MatchDecision[];
    uploadedBy: { uid: string; name: string };
    file?: File;
    storage?: FirebaseStorage;
    onStage?: (stage: SaveStage) => void;
  }
): Promise<SaveSalesAnalysisResult> {
  const ref = doc(collection(db, SALES_ANALYSES_COLLECTION));
  let sourceFile: SavedSalesAnalysis['sourceFile'];
  if (input.file && input.storage) {
    input.onStage?.('file');
    try {
      sourceFile = await uploadSourceFile(input.storage, ref.id, input.file);
    } catch (e) {
      console.error('store original sales file', e);
    }
  }

  input.onStage?.('rows');
  const productChunks = chunked(input.products, PRODUCT_ROWS_PER_CHUNK);
  const sourceChunks = chunked(input.build.rows, SOURCE_ROWS_PER_CHUNK);
  await writeInBatches(db, [
    ...productChunks.map((rows, index) => ({
      ref: doc(ref, 'rows', String(index)),
      data: { index, rows: rows.map(toCompact) },
    })),
    ...sourceChunks.map((rows, index) => ({
      ref: doc(ref, 'rows', `s${index}`),
      data: { index, type: 'source', rows: rows.map(toCompactSource) },
    })),
  ]);

  input.onStage?.('record');
  const record: Omit<SavedSalesAnalysis, 'id'> = {
    ...input.meta,
    uploadedAt: Date.now(),
    uploadedBy: input.uploadedBy,
    mapping: input.mapping,
    hasValue: input.build.hasValue,
    hasCode: input.build.hasCode,
    hasExpiry: input.build.hasExpiry,
    hasUnitPrice: input.build.hasUnitPrice,
    stats: input.stats,
    warnings: input.build.warnings,
    issues: input.build.issues.slice(0, MAX_STORED_ISSUES),
    reconciliation: input.build.reconciliation,
    chunkCount: productChunks.length,
    sourceChunkCount: sourceChunks.length,
    ...(input.consolidation ? { consolidation: input.consolidation } : {}),
    ...(input.decisions?.length
      ? { decisions: input.decisions.slice(-MAX_STORED_DECISIONS) }
      : {}),
    ...(sourceFile ? { sourceFile } : {}),
    schemaVersion: 1,
  };
  await setDoc(ref, stripUndefined(record));
  return { id: ref.id, fileStored: !!sourceFile };
}

/** Replace the consolidated products after a later review of possible matches. */
export async function updateSalesConsolidation(
  db: Firestore,
  id: string,
  input: {
    products: SalesProductRow[];
    stats: SalesSummaryStats;
    consolidation: ConsolidationSummary;
    decisions: MatchDecision[];
  }
): Promise<void> {
  const existing = await getDocs(collection(db, SALES_ANALYSES_COLLECTION, id, 'rows'));
  const oldProductDocs = existing.docs.filter((d) => d.data().type !== 'source');
  const ref = doc(db, SALES_ANALYSES_COLLECTION, id);
  const productChunks = chunked(input.products, PRODUCT_ROWS_PER_CHUNK);
  const newIds = new Set(productChunks.map((_, i) => String(i)));
  await writeInBatches(
    db,
    productChunks.map((rows, index) => ({
      ref: doc(ref, 'rows', String(index)),
      data: { index, rows: rows.map(toCompact) },
    }))
  );
  const stale = oldProductDocs.filter((d) => !newIds.has(d.id));
  for (const part of chunked(stale, 400)) {
    const batch = writeBatch(db);
    part.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await updateDoc(
    ref,
    stripUndefined({
      stats: input.stats,
      consolidation: input.consolidation,
      decisions: input.decisions.slice(-MAX_STORED_DECISIONS),
      chunkCount: productChunks.length,
    })
  );
}

export async function getSalesSourceFileUrl(
  storage: FirebaseStorage,
  path: string
): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}

export function subscribeSalesAnalyses(
  db: Firestore,
  onChange: (list: SavedSalesAnalysis[]) => void,
  onError: (e: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, SALES_ANALYSES_COLLECTION), orderBy('uploadedAt', 'desc'), limit(100)),
    (snap) =>
      onChange(
        snap.docs
          .filter((d) => d.id !== PRODUCT_MAPPINGS_DOC)
          .map((d) => ({ id: d.id, ...d.data() }) as SavedSalesAnalysis)
      ),
    onError
  );
}

export type LoadedSalesRows = { products: SalesProductRow[]; sourceRows: SalesSourceRow[] };

export async function loadSalesAnalysisData(db: Firestore, id: string): Promise<LoadedSalesRows> {
  const snap = await getDocs(collection(db, SALES_ANALYSES_COLLECTION, id, 'rows'));
  const products: { index: number; rows: CompactRow[] }[] = [];
  const sources: { index: number; rows: CompactSourceRow[] }[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { index: number; type?: string; rows: unknown[] };
    if (data.type === 'source') sources.push(data as { index: number; rows: CompactSourceRow[] });
    else products.push(data as { index: number; rows: CompactRow[] });
  }
  return {
    products: products
      .sort((a, b) => a.index - b.index)
      .flatMap((c) => c.rows.map(fromCompact)),
    sourceRows: sources
      .sort((a, b) => a.index - b.index)
      .flatMap((c) => c.rows.map(fromCompactSource)),
  };
}

export async function deleteSalesAnalysis(
  db: Firestore,
  id: string,
  opts?: { storage?: FirebaseStorage; sourcePath?: string }
): Promise<void> {
  if (opts?.storage && opts.sourcePath) {
    try {
      await deleteObject(storageRef(opts.storage, opts.sourcePath));
    } catch (e) {
      if ((e as { code?: string }).code !== 'storage/object-not-found') throw e;
    }
  }
  const rows = await getDocs(collection(db, SALES_ANALYSES_COLLECTION, id, 'rows'));
  for (const part of chunked(rows.docs, 400)) {
    const batch = writeBatch(db);
    part.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, SALES_ANALYSES_COLLECTION, id));
}

export async function saveSalesAiSummary(
  db: Firestore,
  id: string,
  ai: StoredSalesAiSummary
): Promise<void> {
  await updateDoc(doc(db, SALES_ANALYSES_COLLECTION, id), {
    aiSummary: stripUndefined(ai),
  });
}

export async function saveInventoryApplyRecord(
  db: Firestore,
  id: string,
  record: InventoryApplyRecord
): Promise<void> {
  await updateDoc(doc(db, SALES_ANALYSES_COLLECTION, id), {
    inventoryApply: stripUndefined(record),
  });
}

// ---------------------------------------------------------------------------
// Approved product mapping rules

function mappingsRef(db: Firestore) {
  return doc(db, SALES_ANALYSES_COLLECTION, PRODUCT_MAPPINGS_DOC);
}

export function subscribeProductMappings(
  db: Firestore,
  onChange: (rules: ProductMappingRule[]) => void,
  onError: (e: Error) => void
): () => void {
  return onSnapshot(
    mappingsRef(db),
    (snap) => {
      const data = snap.data() as { rules?: Record<string, ProductMappingRule> } | undefined;
      onChange(
        Object.values(data?.rules ?? {}).sort((a, b) => a.masterName.localeCompare(b.masterName))
      );
    },
    onError
  );
}

export async function saveProductMappingRules(
  db: Firestore,
  rules: ProductMappingRule[]
): Promise<void> {
  if (!rules.length) return;
  const map: Record<string, ProductMappingRule> = {};
  for (const r of rules) map[fnvHash(r.aliasKey)] = r;
  await setDoc(mappingsRef(db), stripUndefined({ rules: map }), { merge: true });
}

export async function deleteProductMappingRule(db: Firestore, aliasKey: string): Promise<void> {
  await updateDoc(mappingsRef(db), { [`rules.${fnvHash(aliasKey)}`]: deleteField() });
}
