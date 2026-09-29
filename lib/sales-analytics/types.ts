/** What kind of list was uploaded. Older saved analyses have no kind and are sales. */
export type SalesUploadKind = 'sales' | 'expiry' | 'stock';

/** Which stock a stock list describes. */
export type StockTarget = 'wholesale' | 'warehouse';

export type MatchMethod = 'single' | 'code' | 'name' | 'mapping' | 'admin';

/** One product row used for analysis (one per product after consolidation). */
export interface SalesProductRow {
  name: string;
  code?: string;
  quantity: number;
  /** Present only when the file has a mapped sales value column. */
  value?: number;
  /** Price per unit from the file (stock / expiry lists). */
  unitPrice?: number;
  /** Earliest expiry date, YYYY-MM-DD (expiry lists). */
  expiry?: string;
  /** Number of batches / expiry records combined into this product. */
  batchCount?: number;
  /** Audit trail — filled in by consolidation. */
  rowCount?: number;
  sourceRows?: number[];
  normalizedName?: string;
  matchMethod?: MatchMethod;
  confidence?: 'high' | 'reviewed';
  decision?: 'auto' | 'approved';
  decidedAt?: number;
}

/** One validated row exactly as uploaded (before consolidation). */
export interface SalesSourceRow {
  /** 1-based spreadsheet row number. */
  rowNumber: number;
  name: string;
  code?: string;
  quantity: number;
  value?: number;
  unitPrice?: number;
  expiry?: string;
  batch?: string;
}

export interface SalesColumnMapping {
  /** Column index in the header row; -1 when not mapped. */
  name: number;
  quantity: number;
  value: number;
  code: number;
  expiry?: number;
  batch?: number;
  unitPrice?: number;
}

export type SalesPeriodType = 'full_year' | 'partial_year';

export interface SalesAnalysisMeta {
  name: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  periodType: SalesPeriodType;
  fileName: string;
  kind?: SalesUploadKind;
  stockTarget?: StockTarget;
}

export type SalesWarningKind =
  | 'blank_names'
  | 'invalid_quantity'
  | 'missing_quantity'
  | 'invalid_value'
  | 'missing_value'
  | 'negative_quantity'
  | 'negative_value'
  | 'invalid_expiry'
  | 'inconsistent_price'
  | 'text_numbers'
  | 'duplicate_names'
  | 'total_row'
  | 'total_mismatch';

export interface SalesDataWarning {
  kind: SalesWarningKind;
  message: string;
  count: number;
  /** Up to 10 example product names or row numbers. */
  examples?: string[];
}

/** A single row-level problem, listed in the "Data Issues" download. */
export interface SalesDataIssue {
  rowNumber?: number;
  name: string;
  problem: string;
  /** true when the row was left out of the analysis. */
  excluded: boolean;
}

export interface SalesReconciliation {
  /** Sum of every numeric quantity cell in the mapped column (before exclusions). */
  fileQuantityTotal: number;
  analyzedQuantityTotal: number;
  fileValueTotal?: number;
  analyzedValueTotal?: number;
  /** Totals stated by a "Total" row in the file, if one was found. */
  statedQuantityTotal?: number;
  statedValueTotal?: number;
  excludedRowCount: number;
}

export interface SalesBuildResult {
  rows: SalesSourceRow[];
  hasValue: boolean;
  hasCode: boolean;
  hasExpiry: boolean;
  hasUnitPrice: boolean;
  warnings: SalesDataWarning[];
  issues: SalesDataIssue[];
  reconciliation: SalesReconciliation;
}

// ---------------------------------------------------------------------------
// Consolidation

export type PossibleMatchKind =
  | 'truncated'
  | 'truncated_multiple'
  | 'spelling'
  | 'missing_pack'
  | 'missing_detail'
  | 'wording'
  | 'same_code_conflict'
  | 'same_name_multiple_codes';

/** Rows that were safely grouped together automatically. */
export interface ProductEntity {
  /** Stable key: `c:<code>` or `n:<normalized name>`. */
  key: string;
  displayName: string;
  normalizedName: string;
  code?: string;
  /** Indexes into the source row array. */
  rowIndexes: number[];
  method: MatchMethod;
  reason: string;
}

export interface PossibleMatch {
  /** Stable id built from the entity keys, so decisions survive re-checks. */
  id: string;
  kind: PossibleMatchKind;
  reason: string;
  /** First key is the record in question; the rest are its candidate matches. */
  entityKeys: string[];
  suggestedMasterKey: string;
  /** true when there are several candidates and the admin must pick which one(s). */
  needsChoice: boolean;
}

export interface KeptSeparateGroup {
  entityKeys: string[];
  reason: string;
}

export interface MatchDecision {
  matchId: string;
  action: 'merge' | 'separate';
  /** Entity keys to combine (defaults to all keys in the match). */
  mergeKeys?: string[];
  masterName?: string;
  decidedAt: number;
  decidedBy?: string;
}

export interface ConsolidationPlan {
  entities: ProductEntity[];
  possibleMatches: PossibleMatch[];
  keptSeparate: KeptSeparateGroup[];
  issues: SalesDataIssue[];
}

export interface ConsolidationSummary {
  sourceRows: number;
  /** Rows folded into another row automatically (duplicates removed). */
  autoCombinedRows: number;
  autoGroups: number;
  possibleMatches: number;
  pendingMatches: number;
  mergedByReview: number;
  keptSeparate: number;
  finalProducts: number;
  sourceQuantity: number;
  finalQuantity: number;
  sourceValue?: number;
  finalValue?: number;
}

/** Approved "these names are the same product" rule, reused on later uploads. */
export interface ProductMappingRule {
  aliasKey: string;
  alias: string;
  masterName: string;
  masterKey: string;
  createdAt: number;
  createdBy?: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Analysis

export interface SalesSummaryStats {
  totalProducts: number;
  totalQuantity: number;
  totalValue?: number;
  averageQuantity: number;
  medianQuantity: number;
  averageValue?: number;
  estimatedCost?: number;
  estimatedProfit?: number;
}

export type SalesRankMetric = 'quantity' | 'value' | 'unitValue';

export type SalesGroupKey =
  | 'high_qty_high_value'
  | 'high_qty_low_value'
  | 'low_qty_high_value'
  | 'low_qty_low_value';

export type SalesConcentrationTier = 'top50' | 'next30' | 'next15' | 'rest';

/** A product row with all derived values computed by code. */
export interface AnalyzedSalesProduct extends SalesProductRow {
  rankByQuantity: number;
  rankByValue?: number;
  unitValue?: number;
  estimatedCost?: number;
  estimatedProfit?: number;
  quantityShare: number;
  valueShare?: number;
  quantityGroup: 'high' | 'lower';
  valueGroup?: 'high' | 'lower';
  group?: SalesGroupKey;
  concentrationTier?: SalesConcentrationTier;
}

export interface SalesDistributionBucket {
  label: string;
  min: number;
  /** Inclusive upper bound; null means no upper limit. */
  max: number | null;
  count: number;
}

export interface SalesConcentration {
  productsFor50: number;
  productsFor80: number;
  productsFor95: number;
  /** Down-sampled cumulative curve for charting. */
  curve: { productCount: number; catalogPct: number; cumulativePct: number }[];
}

export interface SalesAnalysisResult {
  products: AnalyzedSalesProduct[];
  hasValue: boolean;
  hasCode: boolean;
  stats: SalesSummaryStats;
  quantityDistribution: SalesDistributionBucket[];
  valueDistribution?: SalesDistributionBucket[];
  highQuantityThreshold: number;
  highValueThreshold?: number;
  groupCounts?: Record<SalesGroupKey, number>;
  concentration?: SalesConcentration;
}

export interface SalesAiSummary {
  overallPicture: string;
  strongPerformers: string;
  slowSellers: string;
  quantityVsValue: string;
  toReview: string;
  nextActions: string[];
  limitations: string;
}

export interface StoredSalesAiSummary {
  summary: SalesAiSummary;
  model: string;
  provider: string;
  generatedAt: number;
}

export interface InventoryApplyRecord {
  at: number;
  by: string;
  target: StockTarget;
  updated: number;
  created: number;
  hiddenOrCleared: number;
}

/** Firestore `salesAnalyses/{id}` (product rows live in the `rows` subcollection). */
export interface SavedSalesAnalysis extends SalesAnalysisMeta {
  id: string;
  uploadedAt: number;
  uploadedBy: { uid: string; name: string };
  mapping: SalesColumnMapping;
  hasValue: boolean;
  hasCode: boolean;
  hasExpiry?: boolean;
  hasUnitPrice?: boolean;
  stats: SalesSummaryStats;
  warnings: SalesDataWarning[];
  issues?: SalesDataIssue[];
  reconciliation: SalesReconciliation;
  chunkCount: number;
  /** Number of chunks holding the original validated rows (audit trail). */
  sourceChunkCount?: number;
  consolidation?: ConsolidationSummary;
  decisions?: MatchDecision[];
  /** Original uploaded file in Firebase Storage (admin-only). */
  sourceFile?: { path: string; size: number; contentType: string };
  aiSummary?: StoredSalesAiSummary;
  inventoryApply?: InventoryApplyRecord;
  schemaVersion: 1;
}

export function analysisKind(a: { kind?: SalesUploadKind }): SalesUploadKind {
  return a.kind ?? 'sales';
}
