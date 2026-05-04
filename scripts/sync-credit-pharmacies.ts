/**
 * Import `data/credit_customers.json` into Firestore `pharmacies` as credit accounts.
 *
 * Same auth options as `sync-cash-pharmacies.ts` (service account recommended):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 *   pnpm sync:credit-pharmacies
 *
 * Re-running merges by stable doc id (hash of row + index).
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, writeBatch } from 'firebase/firestore';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'node:crypto';
import {
  currentMonthKey,
  DEFAULT_CREDIT_LIMIT_GHS,
  DEFAULT_MONTHLY_LIMIT_GHS,
} from '../lib/pharmacies';

type CreditRow = {
  client: string;
  contact_person: string | null;
  location: string | null;
  phone: string | null;
};

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

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
  if (!fs.existsSync(resolved)) {
    console.error(`Service account file not found: ${resolved}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<string, unknown>;
}

const argvEmail = process.argv[2];
const argvPassword = process.argv[3];
const email =
  process.env.SYNC_PHARM_ADMIN_EMAIL?.trim() || argvEmail?.trim();
const password =
  process.env.SYNC_PHARM_ADMIN_PASSWORD || argvPassword;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function stableCreditId(row: CreditRow, index: number): string {
  const h = createHash('sha256')
    .update(
      `credit\0${row.client}\0${String(row.contact_person)}\0${String(row.location)}\0${String(row.phone)}\0${index}`
    )
    .digest('hex')
    .slice(0, 24);
  return `credit_${h}`;
}

function buildPayload(row: CreditRow, isNewDoc: boolean) {
  const name = (row.client || '').trim();
  const contact =
    row.contact_person != null && String(row.contact_person).trim() !== ''
      ? String(row.contact_person).trim()
      : null;
  return {
    name,
    contactPerson: contact,
    location: row.location,
    phone: row.phone,
    customerBillingType: 'credit',
    allowsAccountCredit: true,
    creditLimitGHS: DEFAULT_CREDIT_LIMIT_GHS,
    ...(isNewDoc ? { creditBalanceGHS: 0 } : {}),
    source: 'credit_import',
    monthlyLimitGHS: DEFAULT_MONTHLY_LIMIT_GHS,
    monthSpendGHS: 0,
    monthKey: currentMonthKey(),
    updatedAt: Date.now(),
    pendingVerification: false,
    verifiedAt: Date.now(),
  };
}

async function mainWithAdmin(sa: Record<string, unknown>) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
    });
  }
  const db = admin.firestore();

  const jsonPath = path.join(__dirname, '../data/credit_customers.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing data/credit_customers.json');
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CreditRow[];

  let batch = db.batch();
  let n = 0;
  let written = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const id = stableCreditId(row, i);
    const ref = db.collection('pharmacies').doc(id);
    const snap = await ref.get();
    const payload = buildPayload(row, !snap.exists);
    if (!payload.name) continue;

    batch.set(ref, payload, { merge: true });
    n++;
    written++;

    if (n >= 450) {
      await batch.commit();
      console.log(`Committed batch… (${written} docs so far)`);
      batch = db.batch();
      n = 0;
    }
  }

  if (n > 0) {
    await batch.commit();
  }

  console.log(`Done (Admin SDK). Upserted ${written} credit pharmacy documents.`);
}

async function mainWithClientSdk() {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !firebaseConfig.appId
  ) {
    console.error(
      'Missing NEXT_PUBLIC_FIREBASE_* in environment (e.g. .env.local) for client sign-in.'
    );
    process.exit(1);
  }

  if (!email || !password) {
    console.error(
      'Use a service account (see script header), or set SYNC_PHARM_ADMIN_EMAIL and SYNC_PHARM_ADMIN_PASSWORD, or run:\n' +
        '  pnpm exec tsx scripts/sync-credit-pharmacies.ts <email> <password>'
    );
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, '../data/credit_customers.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing data/credit_customers.json');
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CreditRow[];

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInWithEmailAndPassword(auth, email, password);
  console.log('Signed in as', email);

  let batch = writeBatch(db);
  let n = 0;
  let written = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const id = stableCreditId(row, i);
    const ref = doc(db, 'pharmacies', id);
    const snap = await getDoc(ref);
    const payload = buildPayload(row, !snap.exists);
    if (!payload.name) continue;

    batch.set(ref, payload, { merge: true });
    n++;
    written++;

    if (n >= 450) {
      await batch.commit();
      console.log(`Committed batch… (${written} docs so far)`);
      batch = writeBatch(db);
      n = 0;
    }
  }

  if (n > 0) {
    await batch.commit();
  }

  await signOut(auth);
  console.log(`Done. Upserted ${written} credit pharmacy documents.`);
}

async function main() {
  const sa = getServiceAccountFromEnv();
  if (sa) {
    await mainWithAdmin(sa);
    return;
  }
  await mainWithClientSdk();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
