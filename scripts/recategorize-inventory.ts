/**
 * Reassign category + subCategory on all Firestore inventory from product names.
 *
 *   pnpm recategorize-inventory           # report
 *   pnpm recategorize-inventory --apply   # write Firestore
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { classifyProduct } from '../lib/drug-categorizer';
import { PRODUCT_CATEGORIES } from '../lib/categories';
import type { Product } from '@/types';

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const APPLY = process.argv.includes('--apply');

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
  if (jsonRaw) return JSON.parse(jsonRaw) as Record<string, unknown>;
  const p =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!p) return null;
  const resolved = path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<string, unknown>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'inventory'));
  const products = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Product
  );

  const updates: {
    id: string;
    name: string;
    oldCategory: string;
    newCategory: string;
    subCategory?: string;
  }[] = [];

  const categoryCounts: Record<string, number> = {};
  const subCounts: Record<string, number> = {};

  for (const p of products) {
    const { category, subCategory } = classifyProduct(
      p.name,
      p.description || p.name,
      { previousCategory: p.category }
    );
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (subCategory) {
      subCounts[subCategory] = (subCounts[subCategory] || 0) + 1;
    }
    if (p.category !== category || p.subCategory !== subCategory) {
      updates.push({
        id: p.id,
        name: p.name,
        oldCategory: p.category || '',
        newCategory: category,
        subCategory,
      });
    }
  }

  console.log(`Inventory docs: ${products.length}`);
  console.log(`Would update: ${updates.length}`);
  console.log('\nCategory distribution:');
  for (const cat of PRODUCT_CATEGORIES) {
    const n = categoryCounts[cat] || 0;
    if (n > 0) console.log(`  ${cat}: ${n}`);
  }
  console.log('\nSubcategory distribution:');
  for (const [sub, n] of Object.entries(subCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sub}: ${n}`);
  }
  if (updates.length > 0) {
    console.log('\nSample changes:');
    updates.slice(0, 12).forEach((u) => {
      console.log(
        `  ${u.name.slice(0, 40)} | ${u.oldCategory || '—'} → ${u.newCategory}${u.subCategory ? ` (${u.subCategory})` : ''}`
      );
    });
  }

  const reportPath = path.join(__dirname, '../data/recategorize-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: products.length,
        toUpdate: updates.length,
        categoryCounts,
        subCounts,
        sample: updates.slice(0, 100),
      },
      null,
      2
    )
  );
  console.log(`\nReport: ${reportPath}`);

  if (!APPLY) {
    console.log('\nDry run — pass --apply to update Firestore.');
    return;
  }

  const sa = getServiceAccountFromEnv();
  if (!sa) {
    console.error('Missing service account for --apply');
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  const adminDb = admin.firestore();
  let written = 0;
  for (const batch of chunk(updates, 400)) {
    const wb = adminDb.batch();
    for (const u of batch) {
      const payload: Record<string, unknown> = {
        category: u.newCategory,
        updatedAt: Date.now(),
      };
      if (u.subCategory) {
        payload.subCategory = u.subCategory;
      } else {
        payload.subCategory = admin.firestore.FieldValue.delete();
      }
      wb.update(adminDb.collection('inventory').doc(u.id), payload);
      written++;
    }
    await wb.commit();
    console.log(`  Updated ${written}…`);
  }
  console.log(`\nDone. Updated ${written} products.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
