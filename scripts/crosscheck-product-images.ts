/**
 * Cross-check wholesale product names vs Storage image filenames, then fix imageUrl.
 *
 *   pnpm crosscheck-images              # report only
 *   pnpm crosscheck-images --apply      # write imageUrl (needs Admin credentials)
 *   pnpm crosscheck-images --min-score 0.9
 *
 * Credentials (for --apply): same as sync:cash-pharmacies
 *   GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  type StorageReference,
} from 'firebase/storage';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import {
  assignBestImageMatches,
  expectedImageBasenames,
  normalizeImageBasename,
  storagePathFromImageUrl,
  type ImageFileEntry,
  type ProductEntry,
} from '../lib/product-image-match';

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const APPLY = process.argv.includes('--apply');
const minScoreArg = process.argv.find((a) => a.startsWith('--min-score='));
const MIN_SCORE = minScoreArg
  ? Math.max(0.5, Math.min(1, Number(minScoreArg.split('=')[1])))
  : 0.82;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getServiceAccountFromEnv(): Record<string, unknown> | null {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    return JSON.parse(jsonRaw) as Record<string, unknown>;
  }
  const p =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!p) return null;
  const resolved = path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<string, unknown>;
}

async function listImagesRecursive(
  storageRef: StorageReference
): Promise<ImageFileEntry[]> {
  const out: ImageFileEntry[] = [];
  const listing = await listAll(storageRef);
  for (const item of listing.items) {
    const filename = item.name;
    if (!/\.(jpe?g|png|webp|gif)$/i.test(filename)) continue;
    out.push({
      filename,
      fullPath: item.fullPath,
      normalized: normalizeImageBasename(filename),
    });
  }
  for (const prefix of listing.prefixes) {
    out.push(...(await listImagesRecursive(prefix)));
  }
  return out;
}

async function main() {
  console.log('Cross-check: product names ↔ inventory images\n');
  console.log(`Mode: ${APPLY ? 'APPLY (update Firestore)' : 'report only'}`);
  console.log(`Min match score: ${MIN_SCORE}\n`);

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const snap = await getDocs(collection(db, 'inventory'));
  const allProducts = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ProductEntry, 'id'>),
  })) as ProductEntry[];

  const storefrontProducts = allProducts.filter((p) => !p.isHidden);
  console.log(
    `Products: ${allProducts.length} total, ${storefrontProducts.length} visible on storefront\n`
  );

  console.log('Listing images under inventoryImages/ …');
  const files = await listImagesRecursive(ref(storage, 'inventoryImages'));
  console.log(`Found ${files.length} image files\n`);

  const { pairings, unpairedProducts, unpairedFiles } = assignBestImageMatches(
    storefrontProducts,
    files,
    MIN_SCORE
  );

  let alreadyCorrect = 0;
  let needsUpdate = 0;
  let wrongCurrent = 0;
  const toUpdate: typeof pairings = [];

  for (const p of pairings) {
    const expected = expectedImageBasenames(p.productName);
    const nameAligned = expected.some(
      (e) => normalizeImageBasename(e) === normalizeImageBasename(p.filename)
    );
    const currentPath = storagePathFromImageUrl(p.previousImageUrl);
    const currentBasename = currentPath
      ? path.basename(currentPath)
      : null;

    if (
      currentPath === p.fullPath ||
      (p.previousImageUrl &&
        nameAligned &&
        currentBasename &&
        normalizeImageBasename(currentBasename) ===
          normalizeImageBasename(p.filename))
    ) {
      alreadyCorrect++;
      continue;
    }

    if (
      currentBasename &&
      normalizeImageBasename(currentBasename) !==
        normalizeImageBasename(p.filename) &&
      p.similarity >= MIN_SCORE
    ) {
      wrongCurrent++;
    }

    needsUpdate++;
    toUpdate.push(p);
  }

  const urlByPath = new Map<string, string>();
  for (const p of toUpdate) {
    try {
      const url = await getDownloadURL(ref(storage, p.fullPath));
      urlByPath.set(p.fullPath, url);
    } catch {
      /* broken storage ref */
    }
  }
  if (APPLY) {
    const withUrl = toUpdate.filter((p) => urlByPath.has(p.fullPath));
    toUpdate.length = 0;
    toUpdate.push(...withUrl);
    needsUpdate = withUrl.length;
  }

  console.log('='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`Matched pairs (score ≥ ${MIN_SCORE}): ${pairings.length}`);
  console.log(`  Already correct: ${alreadyCorrect}`);
  console.log(`  Will fix / set imageUrl: ${needsUpdate}`);
  console.log(`  Likely wrong image before fix: ${wrongCurrent}`);
  console.log(`Visible products with no image file: ${unpairedProducts.length}`);
  console.log(`Image files with no product match: ${unpairedFiles.length}`);

  if (toUpdate.length > 0) {
    console.log('\nSample fixes (first 25):');
    console.log(
      'Product'.padEnd(52) +
        'Image file'.padEnd(42) +
        'Score'
    );
    console.log('-'.repeat(100));
    toUpdate.slice(0, 25).forEach((p) => {
      console.log(
        `${p.productName.substring(0, 50).padEnd(52)}${p.filename.substring(0, 40).padEnd(42)}${p.similarity.toFixed(2)}`
      );
    });
    if (toUpdate.length > 25) {
      console.log(`… and ${toUpdate.length - 25} more`);
    }
  }

  if (unpairedProducts.length > 0) {
    console.log('\nVisible products — no matching image (first 20):');
    unpairedProducts.slice(0, 20).forEach((p) => {
      const expected = expectedImageBasenames(p.name)[0] || '(n/a)';
      console.log(`  - ${p.name}`);
      console.log(`    expected file like: ${expected}`);
    });
  }

  if (unpairedFiles.length > 0) {
    console.log('\nStorage images — no product match (first 20):');
    unpairedFiles.slice(0, 20).forEach((f) => {
      console.log(`  - ${f.fullPath}`);
    });
  }

  const reportPath = path.join(
    __dirname,
    '../data/product-image-crosscheck-report.json'
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minScore: MIN_SCORE,
        summary: {
          matched: pairings.length,
          alreadyCorrect,
          needsUpdate,
          wrongCurrent,
          unpairedProducts: unpairedProducts.length,
          unpairedFiles: unpairedFiles.length,
        },
        updates: toUpdate.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          filename: p.filename,
          fullPath: p.fullPath,
          similarity: p.similarity,
          imageUrl: urlByPath.get(p.fullPath),
          previousImageUrl: p.previousImageUrl,
        })),
        unpairedProductNames: unpairedProducts.map((p) => p.name),
        unpairedFilePaths: unpairedFiles.map((f) => f.fullPath),
      },
      null,
      2
    )
  );
  console.log(`\nFull report: ${reportPath}`);

  if (!APPLY) {
    console.log('\nRun with --apply to write imageUrl fields (requires service account).');
    return;
  }

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    console.error(
      '\n--apply requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH in .env.local'
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  const adminDb = admin.firestore();

  let updated = 0;
  let errors = 0;
  for (const p of toUpdate) {
    const imageUrl = urlByPath.get(p.fullPath);
    if (!imageUrl) continue;
    try {
      await adminDb.collection('inventory').doc(p.productId).update({
        imageUrl,
        updatedAt: Date.now(),
      });
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated}…`);
      }
    } catch (e) {
      errors++;
      console.error(`  Failed ${p.productName}:`, e);
    }
  }

  console.log(`\nDone. Updated ${updated} products. Errors: ${errors}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
