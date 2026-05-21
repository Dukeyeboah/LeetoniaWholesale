/**
 * Apply `data/storeroom.json` to Firestore storeroom fields only.
 * Does not change wholesale `price`, `stock`, `wholesaleStock`, or `isHidden`.
 *
 *   pnpm reset-storeroom              # report only
 *   pnpm reset-storeroom --apply      # writes Firestore (service account required)
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
import { buildStoreroomInventoryPlan } from '../lib/reset-storeroom-inventory';
import {
  normalizeImageBasename,
  type ImageFileEntry,
} from '../lib/product-image-match';
import { getStoreroomRows } from '../lib/warehouse-data';
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

async function main() {
  const rows = getStoreroomRows();
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const snap = await getDocs(collection(db, 'inventory'));
  const products = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Product
  );

  const imagesRef = ref(storage, 'inventoryImages');
  const imageFiles = await listImagesRecursive(imagesRef);
  const plan = buildStoreroomInventoryPlan(
    rows,
    products,
    imageFiles,
    MIN_SCORE
  );

  const reportPath = path.join(__dirname, '../data/storeroom-reset-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply: APPLY,
        rowCount: rows.length,
        ...plan,
        updates: plan.updates.slice(0, 50),
        updatesTruncated: plan.updates.length > 50,
      },
      null,
      2
    )
  );

  console.log('Storeroom inventory plan');
  console.log(`  Rows in storeroom.json: ${rows.length}`);
  console.log(`  Updates: ${plan.updates.length}`);
  console.log(`    by name: ${plan.matchedByName}, by code: ${plan.matchedByCode}, new: ${plan.newProducts}`);
  console.log(`  Clear storeroom on ${plan.clearStoreroomIds.length} other products`);
  console.log(`  Images: ${plan.withImage} matched, ${plan.withoutImage} without`);
  console.log(`  Skipped: ${plan.skipped}`);
  console.log(`  Report: ${reportPath}`);

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write Firestore.');
    return;
  }

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    console.error(
      'Missing service account. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  const adminDb = admin.firestore();
  const clientStorage = getStorage(app);
  const urlByPath = new Map<string, string>();
  for (const u of plan.updates) {
    if (!u.imageFullPath || urlByPath.has(u.imageFullPath)) continue;
    try {
      urlByPath.set(
        u.imageFullPath,
        await getDownloadURL(ref(clientStorage, u.imageFullPath))
      );
    } catch (e) {
      console.warn(`  No URL for ${u.imageFullPath}`, e);
    }
  }

  const BATCH = 400;
  for (const part of chunk(plan.updates, BATCH)) {
    const batch = adminDb.batch();
    for (const u of part) {
      const docRef = adminDb.collection('inventory').doc(u.id);
      const payload: Record<string, unknown> = {
        storeroomStock: u.storeroomStock,
        storeroomPrice: u.storeroomPrice,
        code: u.code,
        updatedAt: Date.now(),
      };
      if (u.isNew) {
        Object.assign(payload, {
          name: u.name,
          description: u.description,
          category: 'Uncategorized',
          price: 0,
          stock: 0,
          wholesaleStock: 0,
          reservedQty: 0,
          unit: 'unit',
          isHidden: true,
        });
      }
      if (u.imageFullPath) {
        const url = urlByPath.get(u.imageFullPath);
        if (url) {
          payload.imageUrl = url;
          payload.imageFilename = u.imageFilename;
          payload.imageFullPath = u.imageFullPath;
        }
      }
      batch.set(docRef, payload, { merge: true });
    }
    await batch.commit();
  }

  for (const part of chunk(plan.clearStoreroomIds, BATCH)) {
    const batch = adminDb.batch();
    for (const id of part) {
      batch.update(adminDb.collection('inventory').doc(id), {
        storeroomStock: 0,
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  console.log('\nApplied storeroom sync to Firestore.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
