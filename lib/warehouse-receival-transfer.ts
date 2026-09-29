import {
  doc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  Product,
  WarehouseReceival,
  WarehouseReceivalLine,
  WarehouseReceivalTransferBatch,
} from '@/types';
import {
  indexInventoryByNormalizedLabel,
  indexInventoryByProductCode,
  normalizeWarehouseCode,
  type WarehouseRow,
} from '@/lib/warehouse-data';
import {
  applyTransferToReceivalLines,
  appendReceivalTransferBatch,
  receivalLineTransferableQty,
  sanitizeReceivalLinesForFirestore,
  type ReceivalTransferLineInput,
} from '@/lib/warehouse-receival';

const UNCATEGORIZED = 'Uncategorized';
const BATCH_SIZE = 400;

export type ReceivalTransferMatch = 'code' | 'name' | 'new';

export type ReceivalTransferPreviewRow = {
  line: WarehouseReceivalLine;
  transferQty: number;
  match: ReceivalTransferMatch;
  productId?: string;
  productName?: string;
  currentStoreroomStock?: number;
};

export type ReceivalTransferResult = {
  batch: WarehouseReceivalTransferBatch;
  inventoryUpdated: number;
  inventoryCreated: number;
  skipped: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Prefer barcode/code match for receival lines; fall back to description label. */
function resolveReceivalLineToProduct(
  line: WarehouseReceivalLine,
  byCode: Map<string, Product>,
  byLabel: Map<string, Product>
): { product: Product; match: 'code' | 'name' } | null {
  const code = normalizeWarehouseCode(line.code);
  if (code) {
    const byC = byCode.get(code);
    if (byC) return { product: byC, match: 'code' };
  }
  const row: WarehouseRow = {
    code: line.code,
    description: line.description,
    quantity: line.quantity,
    price: line.unitPrice,
    total: line.total,
  };
  const label = (row.description || '').trim();
  if (label) {
    const normalized = label
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const byN = byLabel.get(normalized);
    if (byN) return { product: byN, match: 'name' };
  }
  return null;
}

export function buildReceivalTransferPreview(
  lines: WarehouseReceivalLine[],
  products: Product[],
  qtyByLineId?: Map<string, number>
): ReceivalTransferPreviewRow[] {
  const byCode = indexInventoryByProductCode(products);
  const byLabel = indexInventoryByNormalizedLabel(products);
  const preview: ReceivalTransferPreviewRow[] = [];

  for (const line of lines) {
    const max = receivalLineTransferableQty(line);
    if (max <= 0) continue;
    const requested = qtyByLineId?.get(line.id) ?? max;
    const transferQty = Math.min(max, Math.max(0, Math.floor(requested)));
    if (transferQty <= 0) continue;

    const resolved = resolveReceivalLineToProduct(line, byCode, byLabel);
    preview.push({
      line,
      transferQty,
      match: resolved ? resolved.match : 'new',
      productId: resolved?.product.id,
      productName: resolved?.product.name,
      currentStoreroomStock: resolved?.product.storeroomStock ?? 0,
    });
  }
  return preview;
}

export async function transferReceivalLinesToInventory(
  db: Firestore,
  receival: WarehouseReceival,
  products: Product[],
  transfers: ReceivalTransferLineInput[],
  label?: string
): Promise<ReceivalTransferResult> {
  const byCode = indexInventoryByProductCode(products);
  const byLabel = indexInventoryByNormalizedLabel(products);
  const lineById = new Map(receival.lines.map((l) => [l.id, l]));

  let inventoryUpdated = 0;
  let inventoryCreated = 0;
  let skipped = 0;
  const touchedLineIds: string[] = [];
  let unitCount = 0;

  const opsByProduct = new Map<
    string,
    {
      lineIds: { lineId: string; qty: number }[];
      productId: string;
      isNew: boolean;
      storeroomStock: number;
      storeroomPrice: number;
      code: string;
      name: string;
      line: WarehouseReceivalLine;
    }
  >();

  for (const t of transfers) {
    const qty = Math.floor(t.qty);
    if (qty <= 0) continue;
    const line = lineById.get(t.lineId);
    if (!line) {
      skipped += 1;
      continue;
    }
    const max = receivalLineTransferableQty(line);
    if (max <= 0 || qty > max) {
      skipped += 1;
      continue;
    }

    const code = normalizeWarehouseCode(line.code);
    const resolved = resolveReceivalLineToProduct(line, byCode, byLabel);
    let productId: string;
    let isNew: boolean;
    let baseStock: number;
    let name: string;

    if (resolved) {
      productId = resolved.product.id;
      isNew = false;
      baseStock = resolved.product.storeroomStock ?? 0;
      name = resolved.product.name;
    } else if (code) {
      productId = `w_${code}`;
      isNew = !products.some((p) => p.id === productId);
      baseStock = products.find((p) => p.id === productId)?.storeroomStock ?? 0;
      name = line.description.trim() || `Item ${code}`;
    } else {
      skipped += 1;
      continue;
    }

    const existing = opsByProduct.get(productId);
    if (existing) {
      existing.lineIds.push({ lineId: line.id, qty });
      existing.storeroomStock += qty;
      touchedLineIds.push(line.id);
      unitCount += qty;
      continue;
    }

    opsByProduct.set(productId, {
      lineIds: [{ lineId: line.id, qty }],
      productId,
      isNew,
      storeroomStock: baseStock + qty,
      storeroomPrice: line.unitPrice,
      code: code || resolved?.product.code || '',
      name,
      line,
    });
    touchedLineIds.push(line.id);
    unitCount += qty;
  }

  const ops = [...opsByProduct.values()];

  for (const part of chunk(ops, BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const op of part) {
      const ref = doc(db, 'inventory', op.productId);
      if (op.isNew) {
        batch.set(
          ref,
          {
            name: op.name,
            category: UNCATEGORIZED,
            price: 0,
            stock: 0,
            wholesaleStock: 0,
            storeroomStock: op.storeroomStock,
            storeroomPrice: op.storeroomPrice,
            reservedQty: 0,
            unit: 'unit',
            code: op.code,
            description: op.line.description.trim(),
            isHidden: true,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        inventoryCreated += 1;
      } else {
        batch.update(ref, {
          storeroomStock: op.storeroomStock,
          storeroomPrice: op.storeroomPrice,
          code: op.code || undefined,
          updatedAt: Date.now(),
        });
        inventoryUpdated += 1;
      }
    }
    await batch.commit();
  }

  const transferInputs: ReceivalTransferLineInput[] = ops.flatMap((op) =>
    op.lineIds.map(({ lineId, qty }) => ({ lineId, qty }))
  );
  const nextLines = applyTransferToReceivalLines(receival.lines, transferInputs);
  const batchRecord: WarehouseReceivalTransferBatch = {
    id: `t-${Date.now().toString(36)}`,
    label: label?.trim() || undefined,
    at: Date.now(),
    lineCount: new Set(touchedLineIds).size,
    unitCount,
    lineIds: [...new Set(touchedLineIds)],
  };
  const nextTransfers = appendReceivalTransferBatch(
    receival.transfers,
    batchRecord
  );

  const receivalBatch = writeBatch(db);
  receivalBatch.update(doc(db, 'warehouseReceivals', receival.id), {
    lines: sanitizeReceivalLinesForFirestore(nextLines),
    transfers: nextTransfers,
    updatedAt: Date.now(),
  });
  await receivalBatch.commit();

  return {
    batch: batchRecord,
    inventoryUpdated,
    inventoryCreated,
    skipped,
  };
}
