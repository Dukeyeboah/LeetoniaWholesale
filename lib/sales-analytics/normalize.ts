/**
 * Deterministic product-name normalisation and attribute extraction used by
 * consolidation. Nothing here guesses: it only standardises formatting and
 * pulls out medically meaningful tokens so they can be compared exactly.
 */

const MEASURE_UNITS = 'mg|mcg|g|kg|ml|l|iu|%|mmol|meq|units?|u';
const PACK_WORDS =
  'tabs|tablets|caps|capsules|sachets|pcs|pieces|vials|ampoules|amps|packs|strips|bottles|pessaries|suppositories';

/**
 * Normalise a product name for matching. Keeps every number and unit, so
 * "Paracetamol 500 mg" and "paracetamol 500MG" match but 500mg vs 1g never do.
 */
export function normalizeForMatch(raw: string): string {
  let s = raw.normalize('NFKC').toLowerCase();
  s = s
    .replace(/[\u2018\u2019\u201a\u201b\u2032`´]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/×/g, 'x')
    .replace(/µg|μg/g, 'mcg');
  s = s.replace(/['"]/g, '');
  // Decimal / thousands commas inside numbers.
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/[,;:_]/g, ' ');
  // Periods only survive as decimal points.
  s = s.replace(/(^|\s)\.(?=\d)/g, (_, pre: string) => `${pre}0.`);
  s = s.replace(/\.(?!\d)|(?<!\d)\./g, ' ');
  s = s.replace(/(\d+)\.0+(?!\d)/g, '$1').replace(/(\d+\.\d*?[1-9])0+(?!\d)/g, '$1');
  // No spaces around slashes, dashes, plus signs and brackets.
  s = s.replace(/\s*([/\-+()[\]])\s*/g, '$1');
  // Join numbers to their units: "500 mg" → "500mg", "30 tabs" → "30tabs".
  s = s.replace(
    new RegExp(`(\\d)\\s+(${MEASURE_UNITS}|${PACK_WORDS}|s)(?![a-z])`, 'g'),
    '$1$2'
  );
  s = s
    .replace(/(\d)(mgs)(?![a-z])/g, '$1mg')
    .replace(/(\d)(gm|gms|gram|grams)(?![a-z])/g, '$1g')
    .replace(/(\d)(mls|millilitres?|milliliters?)(?![a-z])/g, '$1ml');
  // Pack multipliers: "x 30" → "x30", "3 x 10" → "3x10".
  s = s.replace(/(\d)\s*x\s*(\d)/g, '$1x$2').replace(/(^|\s)x\s+(\d)/g, '$1x$2');
  return s.replace(/\s+/g, ' ').trim();
}

/** Uppercase, no spaces / dashes / dots — so "ab-123" and "AB 123" are one code. */
export function normalizeCode(raw: string | undefined): string {
  if (!raw) return '';
  return raw.normalize('NFKC').toUpperCase().replace(/[\s\-._]/g, '');
}

const FORM_WORDS: Record<string, string> = {
  tab: 'tablet', tabs: 'tablet', tablet: 'tablet', tablets: 'tablet', tb: 'tablet', tabl: 'tablet',
  cap: 'capsule', caps: 'capsule', capsule: 'capsule', capsules: 'capsule',
  syr: 'syrup', syrup: 'syrup', syrp: 'syrup',
  susp: 'suspension', suspension: 'suspension', sus: 'suspension',
  inj: 'injection', injection: 'injection', injections: 'injection', amp: 'injection', ampoule: 'injection', vial: 'injection',
  cream: 'cream', crm: 'cream', creme: 'cream',
  oint: 'ointment', ointment: 'ointment', ung: 'ointment',
  gel: 'gel', jelly: 'gel',
  drop: 'drops', drops: 'drops', drp: 'drops', gtt: 'drops',
  supp: 'suppository', supps: 'suppository', suppository: 'suppository', suppositories: 'suppository',
  pess: 'pessary', pessary: 'pessary', pessaries: 'pessary',
  sachet: 'sachet', sachets: 'sachet', sach: 'sachet', sac: 'sachet',
  lotion: 'lotion', spray: 'spray', inhaler: 'inhaler', puff: 'inhaler', nebules: 'nebule', nebule: 'nebule',
  soln: 'solution', sol: 'solution', solution: 'solution', elixir: 'elixir', elx: 'elixir',
  powder: 'powder', pwd: 'powder', granules: 'granules', lozenge: 'lozenge', lozenges: 'lozenge',
  shampoo: 'shampoo', soap: 'soap', patch: 'patch', patches: 'patch', emulsion: 'emulsion',
};

const CHILD_WORDS = new Set([
  'child', 'children', 'childrens', 'kid', 'kids', 'paed', 'paeds', 'paediatric', 'pediatric',
  'ped', 'infant', 'infants', 'junior', 'jnr', 'baby', 'babies', 'toddler',
]);
const ADULT_WORDS = new Set(['adult', 'adults']);
const EXTENDED_WORDS = new Set([
  'er', 'xr', 'sr', 'cr', 'mr', 'xl', 'la', 'retard', 'extended', 'sustained', 'controlled',
  'modified', 'prolonged', 'slow',
]);
const IMMEDIATE_WORDS = new Set(['ir', 'immediate']);

const MEASURE_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)(${MEASURE_UNITS})(?:/(\\d+(?:\\.\\d+)?)?(mg|mcg|g|kg|ml|l|iu|dose|actuation))?(?![a-z])`,
  'g'
);
const PACK_RES: RegExp[] = [
  /(?<![a-z\d])(\d+)x(\d+)(?![a-z\d])/g,
  /(?<![a-z\d])x(\d+)(?![a-z\d])/g,
  /(?<![a-z\d])(\d+)x(?![a-z\d])/g,
  /(?<![a-z\d])(\d+)s(?![a-z\d])/g,
  new RegExp(`(?<![a-z\\d])(\\d+)(${PACK_WORDS})(?![a-z])`, 'g'),
  /(?<![a-z\d])(?:pk|pack)(?:of)?\s*(?:of\s*)?(\d+)(?![a-z\d])/g,
  /\((\d+)\)/g,
];

export interface ProductAttributes {
  /** Strengths, concentrations and volumes, e.g. "500mg", "5mg/5ml", "100ml". Sorted. */
  measures: string[];
  /** Pack size, e.g. "30" or "3x10". */
  pack: string | null;
  form: string | null;
  population: 'child' | 'adult' | null;
  release: 'extended' | 'immediate' | null;
  /** Name with every attribute removed. */
  base: string;
  /** Every number in the name, in order — used to block unsafe spelling matches. */
  numbers: string;
}

function packFromMatch(m: RegExpExecArray, reIndex: number): string {
  if (reIndex === 0) return `${m[1]}x${m[2]}`;
  return m[1];
}

/** Remove pack-size tokens from a normalised name. */
export function stripPack(key: string): string {
  let s = key;
  for (const re of PACK_RES) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Extract comparable attributes from an already-normalised name. */
export function extractAttributes(key: string): ProductAttributes {
  const measures: string[] = [];
  let rest = key.replace(MEASURE_RE, (full) => {
    measures.push(full);
    return ' ';
  });

  let pack: string | null = null;
  PACK_RES.forEach((re, i) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      if (pack === null) pack = packFromMatch(m, i);
      return ' ';
    });
  });

  const forms = new Set<string>();
  let population: ProductAttributes['population'] = null;
  let release: ProductAttributes['release'] = null;
  const baseTokens: string[] = [];
  for (const tok of rest.split(/[\s/()[\]+-]+/)) {
    if (!tok) continue;
    const form = FORM_WORDS[tok];
    if (form) {
      forms.add(form);
      continue;
    }
    if (CHILD_WORDS.has(tok)) {
      population = 'child';
      continue;
    }
    if (ADULT_WORDS.has(tok)) {
      population = population ?? 'adult';
      continue;
    }
    if (EXTENDED_WORDS.has(tok)) {
      release = 'extended';
      continue;
    }
    if (IMMEDIATE_WORDS.has(tok)) {
      release = release ?? 'immediate';
      continue;
    }
    baseTokens.push(tok);
  }

  return {
    measures: measures.sort(),
    pack,
    form: forms.size ? [...forms].sort().join('+') : null,
    population,
    release,
    base: baseTokens.join(' '),
    numbers: (key.match(/\d+(?:\.\d+)?/g) ?? []).join('|'),
  };
}

/** Exact attribute signature (every attribute, missing counts as a value). */
export function attributeSignature(a: ProductAttributes): string {
  return [a.measures.join(','), a.pack ?? '', a.form ?? '', a.population ?? '', a.release ?? ''].join('|');
}

/**
 * List the attributes that are present on BOTH sides and differ. An attribute
 * missing on one side is not a conflict (the name may just be shortened).
 */
export function attributeConflicts(a: ProductAttributes, b: ProductAttributes): string[] {
  const out: string[] = [];
  if (a.measures.length && b.measures.length && a.measures.join(',') !== b.measures.join(',')) {
    out.push(`strength/volume (${a.measures.join(', ')} vs ${b.measures.join(', ')})`);
  }
  if (a.pack && b.pack && a.pack !== b.pack) out.push(`pack size (${a.pack} vs ${b.pack})`);
  if (a.form && b.form && a.form !== b.form) out.push(`dosage form (${a.form} vs ${b.form})`);
  if (a.population && b.population && a.population !== b.population) {
    out.push(`adult vs child (${a.population} vs ${b.population})`);
  }
  if (a.release && b.release && a.release !== b.release) {
    out.push(`release type (${a.release} vs ${b.release})`);
  }
  return out;
}

/** Attributes that differ at all, including present-vs-missing. */
export function attributeDifferences(a: ProductAttributes, b: ProductAttributes): string[] {
  const out = attributeConflicts(a, b);
  if (!!a.measures.length !== !!b.measures.length) out.push('strength/volume only on one name');
  if (!!a.pack !== !!b.pack) out.push('pack size only on one name');
  if (!!a.form !== !!b.form) out.push('dosage form only on one name');
  if (!!a.population !== !!b.population) out.push('adult/child only on one name');
  if (!!a.release !== !!b.release) out.push('release type only on one name');
  return out;
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Small, stable string hash (FNV-1a) for Firestore-safe map keys. */
export function fnvHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
