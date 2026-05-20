/**
 * Match inventory product names to image filenames in Storage.
 * Filenames are expected to mirror drug names (sanitized, often UPPERCASE).
 */

export function normalizeForImageMatch(str: string): string {
  return str
    .toUpperCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

/** Basename without extension, normalized for comparison. */
export function normalizeImageBasename(filename: string): string {
  const base = filename.replace(/\.(jpe?g|png|webp|gif)$/i, '');
  return normalizeForImageMatch(base);
}

export function sanitizeFileNameForImage(
  name: string,
  preserveCase: boolean = true
): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  if (!preserveCase) {
    sanitized = sanitized.toLowerCase();
  }
  return sanitized;
}

export function expectedImageBasenames(
  productName: string
): string[] {
  const upper = sanitizeFileNameForImage(productName, true);
  const lower = sanitizeFileNameForImage(productName, false);
  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  const names = new Set<string>();
  for (const base of [upper, lower]) {
    if (!base) continue;
    for (const ext of exts) {
      names.add(`${base}${ext}`);
      names.add(`${base}${ext.toUpperCase()}`);
    }
  }
  return [...names];
}

export function calculateNameSimilarity(a: string, b: string): number {
  const s1 = normalizeForImageMatch(a);
  const s2 = normalizeForImageMatch(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

export type ImageFileEntry = {
  filename: string;
  fullPath: string;
  normalized: string;
};

export type ProductEntry = {
  id: string;
  name: string;
  imageUrl?: string;
  isHidden?: boolean;
};

export type ProductImagePairing = {
  productId: string;
  productName: string;
  filename: string;
  fullPath: string;
  similarity: number;
  previousImageUrl?: string;
};

function fileStem(filename: string): string {
  return filename.replace(/\.(jpe?g|png|webp|gif)$/i, '');
}

/** True when Storage filename matches the usual UPPERCASE_underscore image naming. */
export function isExactImageNameMatch(
  productName: string,
  filename: string
): boolean {
  const stem = fileStem(filename);
  const expected = [
    sanitizeFileNameForImage(productName, true),
    sanitizeFileNameForImage(productName, false),
  ].filter(Boolean);
  if (expected.some((e) => e === stem || e.toUpperCase() === stem.toUpperCase())) {
    return true;
  }
  return (
    normalizeImageBasename(stem) === normalizeForImageMatch(productName)
  );
}

/** Greedy one-to-one: exact filename matches first, then fuzzy above minScore. */
export function assignBestImageMatches(
  products: ProductEntry[],
  files: ImageFileEntry[],
  minScore: number
): {
  pairings: ProductImagePairing[];
  unpairedProducts: ProductEntry[];
  unpairedFiles: ImageFileEntry[];
} {
  type Candidate = {
    product: ProductEntry;
    file: ImageFileEntry;
    score: number;
    exact: boolean;
  };
  const candidates: Candidate[] = [];

  for (const product of products) {
    for (const file of files) {
      const exact = isExactImageNameMatch(product.name, file.filename);
      const score = exact
        ? 1
        : calculateNameSimilarity(product.name, fileStem(file.filename));
      if (exact || score >= minScore) {
        candidates.push({ product, file, score, exact });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return b.score - a.score;
  });

  const usedProductIds = new Set<string>();
  const usedPaths = new Set<string>();
  const pairings: ProductImagePairing[] = [];

  for (const c of candidates) {
    if (usedProductIds.has(c.product.id) || usedPaths.has(c.file.fullPath)) {
      continue;
    }
    usedProductIds.add(c.product.id);
    usedPaths.add(c.file.fullPath);
    pairings.push({
      productId: c.product.id,
      productName: c.product.name,
      filename: c.file.filename,
      fullPath: c.file.fullPath,
      similarity: c.score,
      previousImageUrl: c.product.imageUrl,
    });
  }

  const unpairedProducts = products.filter((p) => !usedProductIds.has(p.id));
  const unpairedFiles = files.filter((f) => !usedPaths.has(f.fullPath));

  return { pairings, unpairedProducts, unpairedFiles };
}

/** Extract storage object path from a Firebase download URL if possible. */
export function storagePathFromImageUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const m = url.match(/\/o\/([^?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
