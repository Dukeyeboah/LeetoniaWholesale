'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Download,
  FileSpreadsheet,
  Loader2,
  Package,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth, db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { analyzeSales } from '@/lib/sales-analytics/analyze';
import {
  applyConsolidation,
  mappingRulesForDecision,
  planConsolidation,
} from '@/lib/sales-analytics/consolidate';
import { downloadConsolidatedWorkbook } from '@/lib/sales-analytics/consolidated-workbook';
import { SALES_CURRENCIES } from '@/lib/sales-analytics/format';
import {
  buildSalesRows,
  isSupportedSalesFile,
  readSalesSpreadsheet,
  SalesFileError,
  suggestColumnMapping,
  UNMAPPED,
  validateColumnMapping,
  type SalesWorkbook,
} from '@/lib/sales-analytics/parse';
import {
  saveProductMappingRules,
  saveSalesAnalysis,
  type SaveStage,
} from '@/lib/sales-analytics/store';
import type {
  ConsolidationPlan,
  MatchDecision,
  ProductMappingRule,
  SalesBuildResult,
  SalesColumnMapping,
  SalesPeriodType,
  SalesUploadKind,
  StockTarget,
} from '@/lib/sales-analytics/types';
import {
  ConsolidationReview,
  ConsolidationSummaryCards,
  MappingRulesDialog,
} from '@/components/sales-analysis/consolidation-review';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Props = {
  rules: ProductMappingRule[];
  onCancel: () => void;
  onSaved: (id: string) => void;
};

type Mapping = Required<SalesColumnMapping>;

type FieldDef = {
  key: keyof Mapping;
  label: string;
  required: boolean;
  help: string;
};

const KIND_INFO: Record<
  SalesUploadKind,
  { label: string; description: string; icon: typeof TrendingUp }
> = {
  sales: {
    label: 'Sales',
    description: 'Quantities sold (and sales value if you have it) for a period.',
    icon: TrendingUp,
  },
  expiry: {
    label: 'Expiry list',
    description: 'Products with expiry dates — see what expires in a date range.',
    icon: CalendarClock,
  },
  stock: {
    label: 'Stock list',
    description: 'Current stock count for wholesale or the warehouse. Can update inventory.',
    icon: Package,
  },
};

function fieldsFor(kind: SalesUploadKind): FieldDef[] {
  const name: FieldDef = { key: 'name', label: 'Product name', required: true, help: 'Item description / product name.' };
  const code: FieldDef = { key: 'code', label: 'Product code / SKU', required: false, help: 'Optional. Rows with the same code are combined.' };
  const unitPrice: FieldDef = { key: 'unitPrice', label: 'Unit price', required: false, help: 'Optional.' };
  const batch: FieldDef = { key: 'batch', label: 'Batch number', required: false, help: 'Optional.' };
  if (kind === 'expiry') {
    return [
      name,
      { key: 'expiry', label: 'Expiry date', required: true, help: 'e.g. 31/12/2026, 12/2026 or an Excel date.' },
      { key: 'quantity', label: 'Quantity', required: false, help: 'Optional. Units with this expiry.' },
      batch,
      code,
      { ...unitPrice, help: 'Optional — shows the value at risk.' },
    ];
  }
  if (kind === 'stock') {
    return [
      name,
      { key: 'quantity', label: 'Stock quantity', required: true, help: 'Units on hand. Blank counts as 0.' },
      code,
      { ...unitPrice, help: 'Optional — can also update prices.' },
      { key: 'expiry', label: 'Expiry date', required: false, help: 'Optional.' },
      batch,
    ];
  }
  return [
    name,
    { key: 'quantity', label: 'Quantity sold', required: true, help: 'How many units were sold.' },
    { key: 'value', label: 'Sales value', required: false, help: 'Money received. Optional — adds value and profit analysis.' },
    code,
    unitPrice,
  ];
}

function onlyFields(mapping: Mapping, kind: SalesUploadKind): Mapping {
  const keep = new Set(fieldsFor(kind).map((f) => f.key));
  const out = { ...mapping };
  (Object.keys(out) as (keyof Mapping)[]).forEach((k) => {
    if (!keep.has(k)) out[k] = UNMAPPED;
  });
  return out;
}

function defaultPeriod() {
  const y = new Date().getFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cellText(c: unknown): string {
  if (c == null) return '';
  return String(c);
}

/** Let React paint the loading state before heavy synchronous work starts. */
const nextPaint = () => new Promise<void>((r) => setTimeout(r, 30));

const SAVE_STAGE_LABEL: Record<SaveStage, string> = {
  file: 'Saving original file…',
  rows: 'Saving products…',
  record: 'Finishing…',
};

export function SalesUploadWizard({ rules, onCancel, onSaved }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<SalesUploadKind>('sales');
  const [stockTarget, setStockTarget] = useState<StockTarget>('wholesale');
  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState(defaultPeriod().start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod().end);
  const [listDate, setListDate] = useState(todayIso());
  const [currency, setCurrency] = useState<string>('GHS');
  const [periodType, setPeriodType] = useState<SalesPeriodType>('full_year');
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<SalesWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [build, setBuild] = useState<SalesBuildResult | null>(null);
  const [plan, setPlan] = useState<ConsolidationPlan | null>(null);
  const [decisions, setDecisions] = useState<MatchDecision[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);

  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const fields = fieldsFor(kind);
  const isSnapshot = kind !== 'sales';

  const chooseFile = async (f: File) => {
    setFileError(null);
    setWorkbook(null);
    setMapping(null);
    if (!isSupportedSalesFile(f.name)) {
      setFile(null);
      setFileError('Please choose an Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }
    setFile(f);
    if (!name.trim()) {
      setName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());
    }
    setReading(true);
    await nextPaint();
    try {
      const wb = readSalesSpreadsheet(await f.arrayBuffer(), f.name);
      setWorkbook(wb);
      setSheetIndex(0);
      setMapping(suggestColumnMapping(wb.sheets[0].headers, wb.sheets[0].rows));
    } catch (e) {
      setFile(null);
      setFileError(
        e instanceof SalesFileError ? e.message : 'We could not read this file. Please try another.'
      );
    } finally {
      setReading(false);
    }
  };

  const step1Error = useMemo(() => {
    if (!name.trim()) return 'Give this upload a name.';
    if (!workbook) return 'Choose a file.';
    if (isSnapshot) return listDate ? null : 'Choose the date of this list.';
    if (!periodStart || !periodEnd) return 'Choose the start and end dates.';
    if (periodStart > periodEnd) return 'The start date must be before the end date.';
    return null;
  }, [name, workbook, periodStart, periodEnd, isSnapshot, listDate]);

  const activeMapping = mapping ? onlyFields(mapping, kind) : null;
  const mappingError =
    sheet && activeMapping
      ? validateColumnMapping(activeMapping, sheet.headers.length, kind)
      : 'Choose columns.';

  const hasValue = !!build?.hasValue;
  const result = useMemo(
    () => (build && plan ? applyConsolidation(build.rows, plan, decisions, { hasValue: build.hasValue }) : null),
    [build, plan, decisions]
  );

  const meta = () => ({
    name: name.trim(),
    periodStart: isSnapshot ? listDate : periodStart,
    periodEnd: isSnapshot ? listDate : periodEnd,
    currency,
    periodType: isSnapshot ? ('partial_year' as const) : periodType,
    fileName: file?.name ?? '',
    kind,
    ...(kind === 'stock' ? { stockTarget } : {}),
  });

  const handleCheck = async () => {
    if (!sheet || !activeMapping || !workbook || mappingError) return;
    setBusy('Checking products…');
    await nextPaint();
    try {
      const b = buildSalesRows(sheet, activeMapping, {
        flagTextNumbers: workbook.kind === 'excel',
        kind,
      });
      if (b.rows.length === 0) {
        toast.error('No valid product rows were found with these columns.');
        return;
      }
      setBusy('Finding duplicates…');
      await nextPaint();
      setBuild(b);
      setPlan(planConsolidation(b.rows, rules));
      setDecisions([]);
      setStep(3);
    } catch (e) {
      console.error('check sales rows', e);
      toast.error('Something went wrong while checking the file.');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!build || !plan || !result) return;
    setBusy('Preparing Excel…');
    await nextPaint();
    try {
      await downloadConsolidatedWorkbook({
        meta: meta(),
        hasValue,
        sourceRows: build.rows,
        plan,
        decisions,
        result,
        rules,
        issues: build.issues,
      });
    } catch (e) {
      console.error('consolidated workbook', e);
      toast.error('Could not create the Excel file.');
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!build || !plan || !result || !activeMapping || !file) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error('Please sign in again.');
      return;
    }
    setBusy('Analysing…');
    await nextPaint();
    try {
      const analysis = analyzeSales(result.products, {
        hasValue: build.hasValue,
        hasCode: build.hasCode,
      });
      const by = user?.name || user?.email || 'Admin';
      const newRules = decisions.flatMap((d) =>
        mappingRulesForDecision(build.rows, plan, d, { now: Date.now(), by })
      );
      const { id, fileStored } = await saveSalesAnalysis(db, {
        meta: meta(),
        mapping: activeMapping,
        build,
        products: result.products,
        stats: analysis.stats,
        consolidation: result.summary,
        decisions,
        uploadedBy: { uid, name: by },
        file,
        storage,
        onStage: (s) => setBusy(SAVE_STAGE_LABEL[s]),
      });
      if (newRules.length) {
        try {
          await saveProductMappingRules(db, newRules);
        } catch (e) {
          console.error('save mapping rules', e);
          toast.warning('The analysis was saved, but the new mapping rules could not be stored.');
        }
      }
      toast.success(`Saved ${result.products.length.toLocaleString()} products.`);
      if (!fileStored) {
        toast.warning('The analysis was saved, but the original file could not be stored.');
      }
      onSaved(id);
    } catch (e) {
      console.error('save sales analysis', e);
      toast.error('Could not save the analysis. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const steps = ['Upload file', 'Confirm columns', 'Check products'];

  return (
    <div className='space-y-4 rounded-2xl border bg-card p-3 sm:p-4'>
      <ol className='flex items-center gap-2 text-xs'>
        {steps.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <li key={label} className='flex min-w-0 flex-1 items-center gap-1.5'>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary text-primary'
                )}
              >
                {n}
              </span>
              <span className={cn('truncate', active ? 'font-medium' : 'text-muted-foreground')}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {busy ? (
        <div
          role='status'
          className='flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary'
        >
          <Loader2 className='h-4 w-4 animate-spin' />
          {busy}
        </div>
      ) : null}

      {step === 1 ? (
        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>What are you uploading?</Label>
            <div className='grid gap-2 sm:grid-cols-3'>
              {(Object.keys(KIND_INFO) as SalesUploadKind[]).map((k) => {
                const info = KIND_INFO[k];
                const Icon = info.icon;
                return (
                  <button
                    key={k}
                    type='button'
                    onClick={() => setKind(k)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors hover:bg-muted/40',
                      kind === k && 'border-primary ring-2 ring-primary/40'
                    )}
                  >
                    <span className='flex items-center gap-2 text-sm font-medium'>
                      <Icon className='h-4 w-4 text-primary' />
                      {info.label}
                    </span>
                    <span className='mt-1 block text-xs text-muted-foreground'>{info.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {kind === 'stock' ? (
            <div className='space-y-1.5'>
              <Label>Which stock is this?</Label>
              <Select value={stockTarget} onValueChange={(v) => setStockTarget(v as StockTarget)}>
                <SelectTrigger className='w-full sm:w-72'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='wholesale'>Wholesale (what customers see)</SelectItem>
                  <SelectItem value='warehouse'>Warehouse / storeroom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className='space-y-1.5'>
            <Label htmlFor='sa-name'>Name</Label>
            <Input
              id='sa-name'
              placeholder={
                kind === 'sales'
                  ? 'e.g. 2025 full-year sales'
                  : kind === 'expiry'
                    ? 'e.g. Expiry list September 2026'
                    : 'e.g. Wholesale stock count 28 Sep'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className='space-y-1.5'>
            <Label>File</Label>
            <input
              ref={fileRef}
              type='file'
              accept='.xlsx,.xls,.csv'
              className='hidden'
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void chooseFile(f);
                e.target.value = '';
              }}
            />
            <button
              type='button'
              onClick={() => fileRef.current?.click()}
              className='flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left hover:bg-muted/40'
            >
              {reading ? (
                <Loader2 className='h-6 w-6 shrink-0 animate-spin text-muted-foreground' />
              ) : file ? (
                <FileSpreadsheet className='h-6 w-6 shrink-0 text-emerald-600' />
              ) : (
                <Upload className='h-6 w-6 shrink-0 text-muted-foreground' />
              )}
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>
                  {reading ? 'Reading file…' : file ? file.name : 'Choose Excel or CSV file'}
                </span>
                <span className='block text-xs text-muted-foreground'>
                  {workbook && sheet
                    ? `${sheet.rows.length.toLocaleString()} rows found`
                    : '.xlsx, .xls or .csv · up to 10 MB · duplicate rows are fine, they are checked next'}
                </span>
              </span>
            </button>
            {fileError ? <p className='text-xs text-destructive'>{fileError}</p> : null}
            <p className='text-[11px] text-muted-foreground'>
              The file is kept privately with this upload so you can download it again later.
            </p>
          </div>

          {isSnapshot ? (
            <div className='space-y-1.5'>
              <Label htmlFor='sa-date'>Date of this list</Label>
              <Input
                id='sa-date'
                type='date'
                className='sm:w-56'
                value={listDate}
                onChange={(e) => setListDate(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor='sa-start'>Start date</Label>
                  <Input id='sa-start' type='date' value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='sa-end'>End date</Label>
                  <Input id='sa-end' type='date' value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
              </div>
              <div className='space-y-1.5'>
                <Label>Period</Label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as SalesPeriodType)}>
                  <SelectTrigger className='w-full sm:w-56'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='full_year'>Full year</SelectItem>
                    <SelectItem value='partial_year'>Partial year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className='space-y-1.5'>
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className='w-full sm:w-56'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALES_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button type='button' variant='outline' onClick={onCancel}>
              Cancel
            </Button>
            <Button type='button' disabled={!!step1Error || reading} onClick={() => setStep(2)}>
              Next: confirm columns
              <ArrowRight className='ml-2 h-4 w-4' />
            </Button>
          </div>
          {step1Error && workbook ? (
            <p className='text-right text-xs text-muted-foreground'>{step1Error}</p>
          ) : null}
        </div>
      ) : null}

      {step === 2 && sheet && mapping ? (
        <div className='space-y-4'>
          {workbook && workbook.sheets.length > 1 ? (
            <div className='space-y-1.5'>
              <Label>Sheet</Label>
              <Select
                value={String(sheetIndex)}
                onValueChange={(v) => {
                  const i = Number(v);
                  setSheetIndex(i);
                  setMapping(suggestColumnMapping(workbook.sheets[i].headers, workbook.sheets[i].rows));
                }}
              >
                <SelectTrigger className='w-full sm:w-72'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workbook.sheets.map((s, i) => (
                    <SelectItem key={s.name} value={String(i)}>
                      {s.name} ({s.rows.length.toLocaleString()} rows)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <p className='text-sm text-muted-foreground'>
            We guessed which columns to use. Please check them and correct any that are wrong.
          </p>

          <div className='grid gap-3 sm:grid-cols-2'>
            {fields.map((f) => (
              <div key={f.key} className='space-y-1.5'>
                <Label>
                  {f.label}
                  {f.required ? <span className='text-destructive'> *</span> : null}
                </Label>
                <Select
                  value={String(mapping[f.key])}
                  onValueChange={(v) => setMapping({ ...mapping, [f.key]: Number(v) })}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!f.required ? (
                      <SelectItem value={String(UNMAPPED)}>Not in this file</SelectItem>
                    ) : (
                      <SelectItem value={String(UNMAPPED)} disabled>
                        Choose a column
                      </SelectItem>
                    )}
                    {sheet.headers.map((h, i) => (
                      <SelectItem key={`${h}-${i}`} value={String(i)}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-[11px] text-muted-foreground'>{f.help}</p>
              </div>
            ))}
          </div>

          <div className='space-y-1.5'>
            <p className='text-xs font-medium text-muted-foreground'>
              Preview — first {Math.min(10, sheet.rows.length)} rows
            </p>
            <div className='w-full overflow-x-auto rounded-md border'>
              <table className='w-full min-w-[32rem] text-xs'>
                <thead className='bg-muted/40'>
                  <tr>
                    {sheet.headers.map((h, i) => {
                      const field = fields.find((f) => mapping[f.key] === i);
                      return (
                        <th
                          key={`${h}-${i}`}
                          className={cn(
                            'whitespace-nowrap px-2 py-1.5 text-left font-medium',
                            field && 'bg-teal-50 text-teal-900'
                          )}
                        >
                          {h}
                          {field ? (
                            <span className='block text-[10px] font-normal text-teal-700'>→ {field.label}</span>
                          ) : null}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {sheet.rows.slice(0, 10).map((r, ri) => (
                    <tr key={ri}>
                      {sheet.headers.map((_, ci) => (
                        <td key={ci} className='max-w-[14rem] truncate px-2 py-1'>
                          {cellText(r[ci])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {mappingError ? <p className='text-xs text-destructive'>{mappingError}</p> : null}

          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-between'>
            <Button type='button' variant='outline' onClick={() => setStep(1)} disabled={!!busy}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Button type='button' onClick={() => void handleCheck()} disabled={!!mappingError || !!busy}>
              {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              {busy ?? 'Next: check products'}
              {busy ? null : <ArrowRight className='ml-2 h-4 w-4' />}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && build && plan && result ? (
        <div className='space-y-4'>
          <div>
            <h3 className='text-sm font-semibold'>Product consolidation</h3>
            <p className='text-xs text-muted-foreground'>
              Rows with the same product code or the same standardised name are combined automatically.
              Rows that differ in strength, pack size, form, adult/child, release type or code are never
              combined automatically. Anything uncertain is listed below for you to decide.
            </p>
          </div>

          <ConsolidationSummaryCards summary={result.summary} />

          {result.summary.sourceQuantity !== result.summary.finalQuantity ||
          result.summary.sourceValue !== result.summary.finalValue ? (
            <p className='rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
              Totals do not reconcile — please report this file.
            </p>
          ) : (
            <p className='text-[11px] text-muted-foreground'>
              Totals check: {result.summary.sourceQuantity.toLocaleString()} units
              {hasValue ? ` and ${currency} ${result.summary.sourceValue?.toLocaleString()}` : ''} in the
              source rows = the same in the final records.
            </p>
          )}

          <ConsolidationReview
            rows={build.rows}
            plan={plan}
            decisions={decisions}
            summary={result.summary}
            hasValue={hasValue}
            currency={currency}
            decidedBy={user?.name || user?.email || undefined}
            onDecisionsChange={setDecisions}
          />

          <div className='flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center'>
            <Button type='button' variant='outline' onClick={() => setStep(2)} disabled={!!busy}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Button type='button' variant='ghost' size='sm' onClick={() => setRulesOpen(true)}>
              Mapping rules ({rules.length})
            </Button>
            <div className='flex flex-col gap-2 sm:ml-auto sm:flex-row'>
              <Button type='button' variant='outline' onClick={() => void handleDownload()} disabled={!!busy}>
                <Download className='mr-2 h-4 w-4' />
                Download Consolidated Excel
              </Button>
              <Button type='button' onClick={() => void handleSave()} disabled={!!busy}>
                {busy ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                {busy ??
                  (result.summary.pendingMatches > 0
                    ? 'Continue with confirmed data'
                    : 'Save and view analysis')}
              </Button>
            </div>
          </div>
          {result.summary.pendingMatches > 0 ? (
            <p className='text-right text-[11px] text-muted-foreground'>
              {result.summary.pendingMatches} possible match(es) not reviewed yet — they will stay as
              separate products. You can review them later from the saved analysis.
            </p>
          ) : null}
          <MappingRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={rules} />
        </div>
      ) : null}
    </div>
  );
}
