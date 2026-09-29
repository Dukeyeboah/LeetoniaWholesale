/**
 * Product consolidation — runs after validation and before any analysis.
 *
 * Matching order (deterministic, no AI):
 *   1. exact product code / SKU / barcode
 *   2. exact normalised name
 *   3. admin-approved mapping rule
 *   4. everything else uncertain → "possible match" for admin review
 *
 * Rows that differ in strength, pack size, dosage form, adult/child, release
 * type or product code are never combined automatically.
 */
import {
  attributeConflicts,
  attributeDifferences,
  attributeSignature,
  boundedLevenshtein,
  extractAttributes,
  fnvHash,
  normalizeCode,
  normalizeForMatch,
  stripPack,
  type ProductAttributes,
} from '@/lib/sales-analytics/normalize';
import type {
  ConsolidationPlan,
  ConsolidationSummary,
  KeptSeparateGroup,
  MatchDecision,
  MatchMethod,
  PossibleMatch,
  PossibleMatchKind,
  ProductEntity,
  ProductMappingRule,
  SalesDataIssue,
  SalesProductRow,
  SalesSourceRow,
} from '@/lib/sales-analytics/types';

const TRUNCATION_MIN_LENGTH = 20;
const MAX_CANDIDATES = 10;
const MAX_POSSIBLE_MATCHES = 1500;
const MAX_KEPT_SEPARATE = 300;
const MAX_SPELLING_BLOCK = 300;

type RowInfo = {
  key: string;
  effKey: string;
  code: string;
  rule?: ProductMappingRule;
};

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  let best = values[0] ?? '';
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function sumQuantity(rows: SalesSourceRow[], idx: number[]): number {
  let s = 0;
  for (const i of idx) s += rows[i].quantity;
  return s;
}

export function roundTotal(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Group validated rows and list everything that needs an admin decision. */
export function planConsolidation(
  rows: SalesSourceRow[],
  rules: ProductMappingRule[] = []
): ConsolidationPlan {
  const keyCache = new Map<string, string>();
  const attrCache = new Map<string, ProductAttributes>();
  const attrsOf = (key: string) => {
    let a = attrCache.get(key);
    if (!a) {
      a = extractAttributes(key);
      attrCache.set(key, a);
    }
    return a;
  };
  const ruleByAlias = new Map(rules.map((r) => [r.aliasKey, r]));
  const resolve = (key: string): { effKey: string; rule?: ProductMappingRule } => {
    let k = key;
    let rule: ProductMappingRule | undefined;
    for (let hop = 0; hop < 5; hop++) {
      const r = ruleByAlias.get(k);
      if (!r || r.masterKey === k) break;
      rule = r;
      k = r.masterKey;
    }
    return { effKey: k, rule };
  };

  const info: RowInfo[] = rows.map((r) => {
    let key = keyCache.get(r.name);
    if (key === undefined) {
      key = normalizeForMatch(r.name);
      keyCache.set(r.name, key);
    }
    const { effKey, rule } = resolve(key);
    return { key, effKey, code: normalizeCode(r.code), ...(rule ? { rule } : {}) };
  });

  const issues: SalesDataIssue[] = [];
  const possibleMatches: PossibleMatch[] = [];
  const keptSeparate: KeptSeparateGroup[] = [];
  const entities = new Map<string, ProductEntity>();

  const describe = (idx: number[], key: string, method: MatchMethod, reason: string): ProductEntity => {
    const mapped = idx.map((i) => info[i].rule).filter(Boolean) as ProductMappingRule[];
    const displayName = mapped.length
      ? mapped[mapped.length - 1].masterName
      : mostFrequent(idx.map((i) => rows[i].name));
    const code = idx.map((i) => rows[i].code).find(Boolean);
    return {
      key,
      displayName,
      normalizedName: mostFrequent(idx.map((i) => info[i].effKey)),
      ...(code ? { code } : {}),
      rowIndexes: idx,
      method,
      reason,
    };
  };

  const methodFor = (idx: number[], grouped: MatchMethod): MatchMethod => {
    if (idx.some((i) => info[i].rule)) return 'mapping';
    return idx.length > 1 ? grouped : 'single';
  };

  const reasonFor = (idx: number[], method: MatchMethod, code?: string): string => {
    const names = new Set(idx.map((i) => rows[i].name));
    if (method === 'mapping') {
      const rule = idx.map((i) => info[i].rule).find(Boolean);
      return `Approved mapping rule → "${rule?.masterName ?? ''}"`;
    }
    if (method === 'code') {
      return names.size > 1
        ? `Same product code (${code}); name written ${names.size} different ways`
        : `Same product code (${code})`;
    }
    if (method === 'name') {
      return names.size > 1
        ? 'Same name after standardising spacing, capitals and punctuation'
        : 'Identical name';
    }
    return 'Single row';
  };

  // Split rows into coded and codeless.
  const codeGroups = new Map<string, number[]>();
  const nameGroups = new Map<string, number[]>();
  info.forEach((r, i) => {
    if (r.code) {
      const g = codeGroups.get(r.code);
      if (g) g.push(i);
      else codeGroups.set(r.code, [i]);
    } else {
      const g = nameGroups.get(r.effKey);
      if (g) g.push(i);
      else nameGroups.set(r.effKey, [i]);
    }
  });

  const seenPairs = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const entityQty = (key: string) => sumQuantity(rows, entities.get(key)?.rowIndexes ?? []);
  const differentCodes = (a: ProductEntity, b: ProductEntity) =>
    !!a.code && !!b.code && normalizeCode(a.code) !== normalizeCode(b.code);

  const addMatch = (
    kind: PossibleMatchKind,
    subjectKey: string,
    candidateKeys: string[],
    reason: string,
    opts: { allowDifferentCodes?: boolean; suggested?: string; needsChoice?: boolean } = {}
  ) => {
    if (possibleMatches.length >= MAX_POSSIBLE_MATCHES) return;
    const subject = entities.get(subjectKey);
    if (!subject) return;
    const candidates = candidateKeys.filter((k) => {
      const c = entities.get(k);
      if (!c || k === subjectKey || seenPairs.has(pairKey(subjectKey, k))) return false;
      return opts.allowDifferentCodes || !differentCodes(subject, c);
    });
    if (candidates.length === 0) return;
    const limited = candidates.slice(0, MAX_CANDIDATES);
    for (const k of limited) seenPairs.add(pairKey(subjectKey, k));
    const keys = [subjectKey, ...limited];
    possibleMatches.push({
      id: `${kind}:${fnvHash([...keys].sort().join('\n'))}`,
      kind,
      reason,
      entityKeys: keys,
      suggestedMasterKey: opts.suggested && keys.includes(opts.suggested) ? opts.suggested : limited[0],
      needsChoice: opts.needsChoice ?? limited.length > 1,
    });
  };

  // 1. Exact product code.
  const codeConflicts: { code: string; keys: string[]; conflicts: string[] }[] = [];
  for (const [code, idx] of codeGroups) {
    const bySig = new Map<string, { attrs: ProductAttributes; idx: number[] }>();
    for (const i of idx) {
      const attrs = attrsOf(info[i].effKey);
      const sig = `${attributeSignature(attrs)}#${attrs.base.split(' ')[0]}`;
      const g = bySig.get(sig);
      if (g) g.idx.push(i);
      else bySig.set(sig, { attrs, idx: [i] });
    }
    const clusters = [...bySig.entries()];
    const conflicts = new Set<string>();
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const x = clusters[a][1].attrs;
        const y = clusters[b][1].attrs;
        for (const c of attributeConflicts(x, y)) conflicts.add(c);
        const fx = x.base.split(' ')[0];
        const fy = y.base.split(' ')[0];
        if (fx && fy && fx !== fy) conflicts.add(`product name ("${fx}" vs "${fy}")`);
      }
    }
    if (conflicts.size === 0) {
      const method = methodFor(idx, 'code');
      const key = `c:${code}`;
      entities.set(key, describe(idx, key, method, reasonFor(idx, method, code)));
      continue;
    }
    const keys: string[] = [];
    for (const [sig, g] of clusters) {
      const key = `c:${code}#${fnvHash(sig)}`;
      const method = methodFor(g.idx, 'code');
      entities.set(key, describe(g.idx, key, method, reasonFor(g.idx, method, code)));
      keys.push(key);
    }
    codeConflicts.push({ code, keys, conflicts: [...conflicts] });
  }

  // Index coded entities by every name they appear under.
  const codedByName = new Map<string, Set<string>>();
  for (const e of entities.values()) {
    for (const i of e.rowIndexes) {
      const k = info[i].effKey;
      const s = codedByName.get(k);
      if (s) s.add(e.key);
      else codedByName.set(k, new Set([e.key]));
    }
  }

  // 2 + 3. Exact normalised name (after approved mapping rules).
  const sameNameMultiCode: { nameKey: string; codeKeys: string[] }[] = [];
  for (const [effKey, idx] of nameGroups) {
    const coded = codedByName.get(effKey);
    if (coded && coded.size === 1) {
      const target = entities.get([...coded][0])!;
      target.rowIndexes = [...target.rowIndexes, ...idx].sort((a, b) => a - b);
      if (target.method === 'single') target.method = 'name';
      target.reason = `${target.reason}; plus ${idx.length} row(s) without a code that have the same name`;
      continue;
    }
    const method = methodFor(idx, 'name');
    const key = `n:${effKey}`;
    entities.set(key, describe(idx, key, method, reasonFor(idx, method)));
    if (coded && coded.size > 1) sameNameMultiCode.push({ nameKey: key, codeKeys: [...coded] });
  }

  const list = [...entities.values()];
  const attrsOfEntity = (e: ProductEntity) => attrsOf(e.normalizedName);
  const byQtyDesc = (keys: string[]) => [...keys].sort((a, b) => entityQty(b) - entityQty(a));

  // Conflicting codes.
  for (const c of codeConflicts) {
    const [subject, ...rest] = byQtyDesc(c.keys);
    const names = c.keys.map((k) => `"${entities.get(k)!.displayName}"`).join(', ');
    addMatch(
      'same_code_conflict',
      subject,
      rest,
      `Product code ${c.code} is used for names that differ in ${c.conflicts.join('; ')}. They were kept apart — merge only if they really are one product.`,
      { allowDifferentCodes: true }
    );
    issues.push({
      name: entities.get(subject)!.displayName,
      problem: `Product code ${c.code} is used for different products: ${names}`,
      excluded: false,
    });
  }
  const codeSetsDone = new Set<string>();
  for (const [nameKey, keys] of codedByName) {
    if (keys.size < 2) continue;
    const sorted = [...keys].sort();
    const id = sorted.join('\n');
    if (codeSetsDone.has(id)) continue;
    codeSetsDone.add(id);
    const codes = sorted.map((k) => entities.get(k)!.code).filter(Boolean);
    if (new Set(codes.map((c) => normalizeCode(c))).size < 2) continue;
    if (keptSeparate.length < MAX_KEPT_SEPARATE) {
      keptSeparate.push({
        entityKeys: sorted,
        reason: `Same name but different product codes (${codes.join(', ')})`,
      });
    }
    for (let a = 0; a < sorted.length; a++) {
      for (let b = a + 1; b < sorted.length; b++) seenPairs.add(pairKey(sorted[a], sorted[b]));
    }
    issues.push({
      name: entities.get(sorted[0])!.displayName,
      problem: `The name "${nameKey}" appears with different product codes: ${codes.join(', ')}`,
      excluded: false,
    });
  }
  for (const s of sameNameMultiCode) {
    const codes = s.codeKeys.map((k) => entities.get(k)!.code).join(', ');
    addMatch(
      'same_name_multiple_codes',
      s.nameKey,
      byQtyDesc(s.codeKeys),
      `These rows have no code, and the same name is used by ${s.codeKeys.length} products with different codes (${codes}). Choose which one they belong to, or keep them separate.`,
      { allowDifferentCodes: true, needsChoice: true }
    );
  }

  // Truncated names: a long-enough name that is the start of other names.
  const sorted = [...list].sort((a, b) =>
    a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0
  );
  const names = sorted.map((e) => e.normalizedName);
  const lowerBound = (target: string) => {
    let lo = 0;
    let hi = names.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (names[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const e of sorted) {
    const prefix = e.normalizedName;
    if (prefix.length < TRUNCATION_MIN_LENGTH) continue;
    const attrs = attrsOfEntity(e);
    const candidates: string[] = [];
    for (let i = lowerBound(prefix); i < sorted.length && names[i].startsWith(prefix); i++) {
      const c = sorted[i];
      if (c.key === e.key || c.normalizedName === prefix) continue;
      if (attributeConflicts(attrs, attrsOfEntity(c)).length) continue;
      candidates.push(c.key);
    }
    if (candidates.length === 0) continue;
    if (candidates.length === 1) {
      addMatch(
        'truncated',
        e.key,
        candidates,
        `"${e.displayName}" looks like a shortened (cut-off) version of "${entities.get(candidates[0])!.displayName}".`
      );
    } else {
      addMatch(
        'truncated_multiple',
        e.key,
        byQtyDesc(candidates),
        `"${e.displayName}" looks cut off and could be any of ${candidates.length} longer names. Choose which one it belongs to, or keep it separate.`,
        { needsChoice: true }
      );
    }
  }

  // Same name, but only some records list a pack size.
  const byPackless = new Map<string, ProductEntity[]>();
  for (const e of list) {
    const k = stripPack(e.normalizedName);
    if (!k) continue;
    const g = byPackless.get(k);
    if (g) g.push(e);
    else byPackless.set(k, [e]);
  }
  for (const group of byPackless.values()) {
    if (group.length < 2) continue;
    const withPack = group.filter((e) => attrsOfEntity(e).pack);
    const noPack = group.filter((e) => !attrsOfEntity(e).pack);
    if (!withPack.length || !noPack.length) continue;
    for (const e of noPack) {
      const keys = byQtyDesc(withPack.map((w) => w.key));
      addMatch(
        'missing_pack',
        e.key,
        keys,
        keys.length === 1
          ? `Same name, but only "${entities.get(keys[0])!.displayName}" shows a pack size.`
          : `Same name without a pack size, while ${keys.length} records list different pack sizes. Choose which one it belongs to, or keep it separate.`,
        { needsChoice: keys.length > 1 }
      );
    }
  }

  // Same base name where one record leaves out details the other has.
  const byBaseName = new Map<string, ProductEntity[]>();
  for (const e of list) {
    const a = attrsOfEntity(e);
    if (a.base.length < 4) continue;
    const g = byBaseName.get(a.base);
    if (g) g.push(e);
    else byBaseName.set(a.base, [e]);
  }
  const detailCount = (a: ProductAttributes) =>
    (a.measures.length ? 1 : 0) + (a.pack ? 1 : 0) + (a.form ? 1 : 0) + (a.population ? 1 : 0) + (a.release ? 1 : 0);
  const coveredBy = (s: ProductAttributes, c: ProductAttributes) =>
    (!s.measures.length || s.measures.join(',') === c.measures.join(',')) &&
    (!s.pack || s.pack === c.pack) &&
    (!s.form || s.form === c.form) &&
    (!s.population || s.population === c.population) &&
    (!s.release || s.release === c.release) &&
    detailCount(c) > detailCount(s);
  for (const group of byBaseName.values()) {
    if (group.length < 2 || group.length > MAX_SPELLING_BLOCK) continue;
    for (const e of group) {
      const a = attrsOfEntity(e);
      const keys = byQtyDesc(
        group.filter((c) => c.key !== e.key && coveredBy(a, attrsOfEntity(c))).map((c) => c.key)
      );
      if (!keys.length) continue;
      addMatch(
        'missing_detail',
        e.key,
        keys,
        keys.length === 1
          ? `Same product name, but "${e.displayName}" leaves out details (strength, pack or form) shown on "${entities.get(keys[0])!.displayName}".`
          : `"${e.displayName}" leaves out details and could be any of ${keys.length} more specific products. Choose which one it belongs to, or keep it separate.`
      );
    }
  }

  // Same words and attributes, in a different order or abbreviated form.
  const byWording = new Map<string, ProductEntity[]>();
  for (const e of list) {
    const a = attrsOfEntity(e);
    if (!a.base) continue;
    const k = `${a.base.split(' ').sort().join(' ')}#${attributeSignature(a)}`;
    const g = byWording.get(k);
    if (g) g.push(e);
    else byWording.set(k, [e]);
  }
  for (const group of byWording.values()) {
    if (group.length < 2) continue;
    const [subject, ...rest] = byQtyDesc(group.map((e) => e.key));
    addMatch(
      'wording',
      subject,
      rest,
      'Same words, strength, pack and form, written in a different order or abbreviated (for example "Tab" vs "Tablets").',
      { suggested: subject, needsChoice: false }
    );
  }

  // Likely spelling differences (same numbers, same attributes).
  const blocks = new Map<string, ProductEntity[]>();
  for (const e of list) {
    const a = attrsOfEntity(e);
    if (a.base.length < 5) continue;
    const k = `${a.base.slice(0, 3)}#${attributeSignature(a)}#${a.numbers}`;
    const g = blocks.get(k);
    if (g) g.push(e);
    else blocks.set(k, [e]);
  }
  for (const group of blocks.values()) {
    if (group.length < 2 || group.length > MAX_SPELLING_BLOCK) continue;
    for (let x = 0; x < group.length; x++) {
      for (let y = x + 1; y < group.length; y++) {
        const a = attrsOfEntity(group[x]).base;
        const b = attrsOfEntity(group[y]).base;
        if (a === b) continue;
        const max = Math.min(a.length, b.length) >= 12 ? 2 : 1;
        const d = boundedLevenshtein(a, b, max);
        if (d < 1 || d > max) continue;
        const ta = new Set(a.split(' '));
        const tb = new Set(b.split(' '));
        const diff = [...ta].filter((t) => !tb.has(t)).concat([...tb].filter((t) => !ta.has(t)));
        if (diff.some((t) => t.length <= 2)) continue;
        const [subject, other] = byQtyDesc([group[x].key, group[y].key]);
        addMatch(
          'spelling',
          subject,
          [other],
          `Names differ by ${d} letter${d > 1 ? 's' : ''} with the same strength, pack and form — possibly a spelling difference.`,
          { suggested: subject, needsChoice: false }
        );
      }
    }
  }

  // Kept separate: same base name, different medical attributes.
  const byBase = new Map<string, ProductEntity[]>();
  for (const e of list) {
    const a = attrsOfEntity(e);
    if (!a.base) continue;
    const g = byBase.get(a.base);
    if (g) g.push(e);
    else byBase.set(a.base, [e]);
  }
  for (const group of byBase.values()) {
    if (group.length < 2 || keptSeparate.length >= MAX_KEPT_SEPARATE) continue;
    const reasons = new Set<string>();
    for (let x = 0; x < group.length; x++) {
      for (let y = x + 1; y < group.length; y++) {
        if (seenPairs.has(pairKey(group[x].key, group[y].key))) continue;
        for (const r of attributeDifferences(attrsOfEntity(group[x]), attrsOfEntity(group[y]))) {
          reasons.add(r);
        }
        if (differentCodes(group[x], group[y])) reasons.add('product code');
      }
    }
    if (reasons.size === 0) continue;
    keptSeparate.push({
      entityKeys: group.slice(0, 20).map((e) => e.key),
      reason: `Similar names kept apart — different ${[...reasons].slice(0, 4).join('; ')}`,
    });
  }

  return { entities: list, possibleMatches, keptSeparate, issues };
}

export interface ConsolidationResult {
  products: SalesProductRow[];
  summary: ConsolidationSummary;
  /** Entity keys behind each product (same order as `products`). */
  productEntityKeys: string[][];
}

function unitPriceOf(rows: SalesSourceRow[], idx: number[]): number | undefined {
  const priced = idx.map((i) => rows[i]).filter((r) => r.unitPrice !== undefined);
  if (!priced.length) return undefined;
  const first = priced[0].unitPrice!;
  if (priced.every((r) => r.unitPrice === first)) return first;
  const qty = priced.reduce((s, r) => s + r.quantity, 0);
  if (qty > 0) return priced.reduce((s, r) => s + r.unitPrice! * r.quantity, 0) / qty;
  return priced.reduce((s, r) => s + r.unitPrice!, 0) / priced.length;
}

/** Only decisions that still point at a match in this plan. */
export function activeDecisions(plan: ConsolidationPlan, decisions: MatchDecision[]): MatchDecision[] {
  const ids = new Set(plan.possibleMatches.map((m) => m.id));
  const latest = new Map<string, MatchDecision>();
  for (const d of [...decisions].sort((a, b) => a.decidedAt - b.decidedAt)) {
    if (ids.has(d.matchId)) latest.set(d.matchId, d);
  }
  return [...latest.values()];
}

/**
 * Build the final product list: automatic groups plus admin-approved merges.
 * Undecided possible matches stay as separate products.
 */
export function applyConsolidation(
  rows: SalesSourceRow[],
  plan: ConsolidationPlan,
  decisions: MatchDecision[],
  opts: { hasValue: boolean }
): ConsolidationResult {
  const entityByKey = new Map(plan.entities.map((e) => [e.key, e]));
  const matchById = new Map(plan.possibleMatches.map((m) => [m.id, m]));
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const applied: { keys: string[]; decision: MatchDecision; match: PossibleMatch }[] = [];
  for (const d of activeDecisions(plan, decisions)) {
    if (d.action !== 'merge') continue;
    const match = matchById.get(d.matchId)!;
    const keys = (d.mergeKeys ?? match.entityKeys).filter(
      (k) => entityByKey.has(k) && match.entityKeys.includes(k)
    );
    if (keys.length < 2) continue;
    for (const k of keys.slice(1)) union(keys[0], k);
    applied.push({ keys, decision: d, match });
  }

  const groups = new Map<string, string[]>();
  for (const e of plan.entities) {
    const r = find(e.key);
    const g = groups.get(r);
    if (g) g.push(e.key);
    else groups.set(r, [e.key]);
  }

  const products: { row: SalesProductRow; keys: string[]; first: number }[] = [];
  for (const [root, keys] of groups) {
    const members = keys.map((k) => entityByKey.get(k)!);
    const idx = members.flatMap((m) => m.rowIndexes).sort((a, b) => a - b);
    const quantity = idx.reduce((s, i) => s + rows[i].quantity, 0);
    const reviewed = members.length > 1;
    const lastDecision = reviewed
      ? [...applied].reverse().find((a) => find(a.keys[0]) === root)
      : undefined;
    const master =
      (lastDecision && entityByKey.get(lastDecision.match.suggestedMasterKey) &&
      keys.includes(lastDecision.match.suggestedMasterKey)
        ? entityByKey.get(lastDecision.match.suggestedMasterKey)
        : undefined) ??
      [...members].sort(
        (a, b) => sumQuantity(rows, b.rowIndexes) - sumQuantity(rows, a.rowIndexes)
      )[0];
    const name = lastDecision?.decision.masterName?.trim() || master.displayName;
    const row: SalesProductRow = {
      name,
      quantity,
      rowCount: idx.length,
      sourceRows: idx.map((i) => rows[i].rowNumber),
      normalizedName: master.normalizedName,
      matchMethod: reviewed ? 'admin' : master.method,
      confidence: reviewed ? 'reviewed' : 'high',
      decision: reviewed ? 'approved' : 'auto',
    };
    const code = master.code ?? members.find((m) => m.code)?.code;
    if (code) row.code = code;
    if (opts.hasValue) row.value = idx.reduce((s, i) => s + (rows[i].value ?? 0), 0);
    const price = unitPriceOf(rows, idx);
    if (price !== undefined) row.unitPrice = price;
    const expiries = idx.map((i) => rows[i].expiry).filter(Boolean) as string[];
    if (expiries.length) row.expiry = expiries.sort()[0];
    const batches = idx
      .filter((i) => rows[i].batch || rows[i].expiry)
      .map((i) => `${rows[i].batch ?? ''}|${rows[i].expiry ?? ''}`);
    if (batches.length) row.batchCount = new Set(batches).size;
    if (lastDecision) row.decidedAt = lastDecision.decision.decidedAt;
    products.push({ row, keys, first: idx[0] ?? 0 });
  }
  products.sort((a, b) => a.first - b.first);

  const sourceQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const finalQuantity = products.reduce((s, p) => s + p.row.quantity, 0);
  const summary: ConsolidationSummary = {
    sourceRows: rows.length,
    autoCombinedRows: plan.entities.reduce((s, e) => s + e.rowIndexes.length - 1, 0),
    autoGroups: plan.entities.filter((e) => e.rowIndexes.length > 1).length,
    possibleMatches: plan.possibleMatches.length,
    pendingMatches:
      plan.possibleMatches.length - activeDecisions(plan, decisions).length,
    mergedByReview: applied.length,
    keptSeparate: plan.keptSeparate.length,
    finalProducts: products.length,
    sourceQuantity,
    finalQuantity,
  };
  if (opts.hasValue) {
    summary.sourceValue = roundTotal(rows.reduce((s, r) => s + (r.value ?? 0), 0));
    summary.finalValue = roundTotal(products.reduce((s, p) => s + (p.row.value ?? 0), 0));
  }
  return {
    products: products.map((p) => p.row),
    summary,
    productEntityKeys: products.map((p) => p.keys),
  };
}

/** Plan + apply in one go. */
export function consolidateRows(
  rows: SalesSourceRow[],
  opts: { hasValue: boolean; rules?: ProductMappingRule[]; decisions?: MatchDecision[] }
): ConsolidationResult & { plan: ConsolidationPlan } {
  const plan = planConsolidation(rows, opts.rules ?? []);
  return { plan, ...applyConsolidation(rows, plan, opts.decisions ?? [], opts) };
}

/**
 * Turn an approved merge into mapping rules (alias name → master name) so the
 * same names are combined automatically on future uploads.
 */
export function mappingRulesForDecision(
  rows: SalesSourceRow[],
  plan: ConsolidationPlan,
  decision: MatchDecision,
  meta: { now: number; by?: string }
): ProductMappingRule[] {
  if (decision.action !== 'merge') return [];
  const match = plan.possibleMatches.find((m) => m.id === decision.matchId);
  if (!match) return [];
  const keys = decision.mergeKeys ?? match.entityKeys;
  const entityByKey = new Map(plan.entities.map((e) => [e.key, e]));
  const master = entityByKey.get(match.suggestedMasterKey) ?? entityByKey.get(keys[0]);
  const masterName = decision.masterName?.trim() || master?.displayName || '';
  const masterKey = normalizeForMatch(masterName);
  if (!masterKey) return [];
  const out = new Map<string, ProductMappingRule>();
  for (const k of keys) {
    const e = entityByKey.get(k);
    if (!e) continue;
    for (const i of e.rowIndexes) {
      const aliasKey = normalizeForMatch(rows[i].name);
      if (aliasKey === masterKey || out.has(aliasKey)) continue;
      out.set(aliasKey, {
        aliasKey,
        alias: rows[i].name,
        masterName,
        masterKey,
        createdAt: meta.now,
        updatedAt: meta.now,
        ...(meta.by ? { createdBy: meta.by } : {}),
      });
    }
  }
  return [...out.values()];
}

/** Totals for one entity, for review screens. */
export function entityTotals(rows: SalesSourceRow[], e: ProductEntity) {
  let quantity = 0;
  let value = 0;
  let hasValue = false;
  for (const i of e.rowIndexes) {
    quantity += rows[i].quantity;
    if (rows[i].value !== undefined) {
      value += rows[i].value!;
      hasValue = true;
    }
  }
  return {
    quantity,
    value: hasValue ? value : undefined,
    averagePrice: hasValue && quantity > 0 ? value / quantity : undefined,
  };
}
