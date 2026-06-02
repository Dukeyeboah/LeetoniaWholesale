/**
 * Reset wholesale / storefront inventory to ONLY `data/updatedStock.json`.
 *
 * - Deletes every Firestore `inventory` doc not in the canonical list (removes duplicates / legacy rows).
 * - Writes one product per Drug row (stable id `sf_*` from drug name).
 * - Matches images under Storage `inventoryImages/**` by filename ↔ Drug name.
 * - Products without a matching image get no imageUrl (letter placeholder in the UI).
 * - Preserves `storeroomStock` and `reservedQty` per product name when possible.
 *
 *   pnpm reset-storefront              # report only
 *   pnpm reset-storefront --apply      # writes Firestore (service account required)
 *   pnpm reset-storefront --min-score=0.9
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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
  buildStorefrontResetPlan,
  loadStorefrontRowsFromJson,
  type StorefrontResetProduct,
} from '../lib/reset-storefront-inventory';
import {
  normalizeImageBasename,
  type ImageFileEntry,
} from '../lib/product-image-match';
import type { Product } from '@/types';

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const APPLY = process.argv.includes('--apply');
const minScoreArg = process.argv.find((a) => a.startsWith('--min-score='));
const MIN_SCORE = minScoreArg
  ? Math.max(0.5, Math.min(1, Number(minScoreArg.split('=')[1])))
  : 0.96;

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function resolveImageUrls(
  products: StorefrontResetProduct[],
  pairingsById: Map<string, string>
): Promise<Map<string, string>> {
  const storage = getStorage(initializeApp(firebaseConfig));
  const urls = new Map<string, string>();
  for (const p of products) {
    const fullPath = pairingsById.get(p.id);
    if (!fullPath) continue;
    try {
      urls.set(p.id, await getDownloadURL(ref(storage, fullPath)));
    } catch (e) {
      console.warn(`  No URL for ${p.name} → ${fullPath}`, e);
    }
  }
  return urls;
}

async function main() {
  console.log('Reset wholesale inventory from data/updatedStock.json\n');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'report only'}`);
  console.log(`Fuzzy match floor: ${MIN_SCORE}\n`);

  const rows = loadStorefrontRowsFromJson();
  console.log(`Stock rows in JSON: ${rows.length}`);

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const snap = await getDocs(collection(db, 'inventory'));
  const existing = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Product
  );
  console.log(`Existing Firestore inventory docs: ${existing.length}`);

  console.log('Listing Storage inventoryImages/ …');
  const files = await listImagesRecursive(ref(storage, 'inventoryImages'));
  console.log(`Image files found: ${files.length}\n`);

  const plan = buildStorefrontResetPlan(rows, existing, files, MIN_SCORE);

  console.log('='.repeat(72));
  console.log('PLAN');
  console.log('='.repeat(72));
  console.log(`Canonical storefront products: ${plan.products.length}`);
  console.log(`  With matched image: ${plan.withImage}`);
  console.log(`  Letter placeholder (no image): ${plan.withoutImage}`);
  console.log(`  Skipped JSON rows: ${plan.skippedRows}`);
  console.log(`  Firestore docs to DELETE: ${plan.toDeleteIds.length}`);
  console.log(`  Storage images unmatched to stock: ${plan.unpairedImagePaths.length}`);

  const sampleWith = plan.products.filter((p) => p.imageFilename).slice(0, 8);
  const sampleWithout = plan.products.filter((p) => !p.imageFilename).slice(0, 8);
  if (sampleWith.length) {
    console.log('\nSample matched images:');
    for (const p of sampleWith) {
      console.log(
        `  ${p.name.substring(0, 48)} → ${p.imageFilename} (score ${p.matchScore.toFixed(2)})`
      );
    }
  }
  if (sampleWithout.length) {
    console.log('\nSample without image (placeholder letter in app):');
    for (const p of sampleWithout) {
      console.log(`  ${p.name}`);
    }
  }
  if (plan.toDeleteIds.length > 0) {
    console.log('\nSample doc ids to delete (legacy / duplicate):');
    plan.toDeleteIds.slice(0, 12).forEach((id) => console.log(`  ${id}`));
    if (plan.toDeleteIds.length > 12) {
      console.log(`  … and ${plan.toDeleteIds.length -  12} more`);
    }
  }

  const reportPath = path.join(
    __dirname,
    '../data/storefront-reset-report.json'
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minScore: MIN_SCORE,
        summary: {
          canonicalProducts: plan.products.length,
          withImage: plan.withImage,
          withoutImage: plan.withoutImage,
          toDelete: plan.toDeleteIds.length,
          unpairedImages: plan.unpairedImagePaths.length,
        },
        products: plan.products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          quantity: p.wholesaleStock,
          imageFilename: p.imageFilename,
          matchScore: p.matchScore,
        })),
        toDeleteIds: plan.toDeleteIds,
        unpairedImagePaths: plan.unpairedImagePaths.slice(0, 500),
      },
      null,
      2
    )
  );
  console.log(`\nReport: ${reportPath}`);

  if (!APPLY) {
    console.log('\nRun with --apply to reset Firestore (requires service account).');
    return;
  }

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    console.error(
      '\n--apply requires GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH'
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  const adminDb = admin.firestore();

  const pathByProductId = new Map<string, string>();
  for (const p of plan.products) {
    if (p.imageFullPath) pathByProductId.set(p.id, p.imageFullPath);
  }

  console.log('\nResolving image download URLs…');
  const imageUrls = await resolveImageUrls(plan.products, pathByProductId);

  console.log('Writing canonical products…');
  let written = 0;
  for (const batch of chunk(plan.products, 400)) {
    const wb = adminDb.batch();
    for (const p of batch) {
      const ref = adminDb.collection('inventory').doc(p.id);
      const imageUrl = imageUrls.get(p.id);
      const payload: Record<string, unknown> = {
        name: p.name,
        category: p.category,
        ...(p.subCategory ? { subCategory: p.subCategory } : {}),
        price: p.price,
        stock: p.stock,
        wholesaleStock: p.wholesaleStock,
        storeroomStock: p.storeroomStock,
        reservedQty: p.reservedQty,
        unit: p.unit,
        description: p.description,
        isHidden: p.isHidden,
        updatedAt: Date.now(),
      };
      if (imageUrl) {
        payload.imageUrl = imageUrl;
      }
      // Full replace: omit imageUrl so old URLs are not kept (UI shows letter placeholder).
      wb.set(ref, payload, { merge: false });
      written++;
    }
    await wb.commit();
    console.log(`  Written ${written}…`);
  }

  console.log('Deleting non-canonical inventory docs…');
  let deleted = 0;
  for (const batch of chunk(plan.toDeleteIds, 400)) {
    const wb = adminDb.batch();
    for (const id of batch) {
      wb.delete(adminDb.collection('inventory').doc(id));
      deleted++;
    }
    await wb.commit();
    console.log(`  Deleted ${deleted}…`);
  }

  console.log(`\nDone. Upserted ${written} products. Deleted ${deleted} legacy docs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
