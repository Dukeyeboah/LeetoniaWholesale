/**
 * One-time / occasional sync: import `data/cash-customers.json` into Firestore `pharmacies`.
 *
 * **Preferred (no Firebase password; works for Google-only sign-in):** use a service account.
 *   - Firebase Console → Project settings → Service accounts → Generate new private key.
 *   - Put the JSON outside the repo and point to it (do not commit):
 *       export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *     or in `.env.local`:
 *       GOOGLE_APPLICATION_CREDENTIALS=...
 *       FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/key.json   (relative to repo root)
 *     or `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'` (awkward; prefer file).
 *   - Run: `pnpm sync:cash-pharmacies`
 *
 * **Alternative:** client SDK + Email/Password (only if that provider is enabled and the user has a password).
 *   - `SYNC_PHARM_ADMIN_EMAIL` / `SYNC_PHARM_ADMIN_PASSWORD` in `.env.local`
 *   - Or: `pnpm exec tsx scripts/sync-cash-pharmacies.ts you@example.com 'password'`
 *
 * Re-running merges by stable doc id (hash of row + index) so it is safe to repeat.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  writeBatch,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'node:crypto';
import {
  currentMonthKey,
  DEFAULT_MONTHLY_LIMIT_GHS,
} from '../lib/pharmacies';

type CashRow = {
  client: string;
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

function stableCashId(row: CashRow, index: number): string {
  const h = createHash('sha256')
    .update(
      `${row.client}\0${String(row.location)}\0${String(row.phone)}\0${index}`
    )
    .digest('hex')
    .slice(0, 24);
  return `cash_${h}`;
}

function buildPayload(row: CashRow) {
  const name = (row.client || '').trim();
  return {
    name,
    location: row.location,
    phone: row.phone,
    customerBillingType: 'cash',
    allowsAccountCredit: false,
    source: 'cash_import',
    monthlyLimitGHS: DEFAULT_MONTHLY_LIMIT_GHS,
    monthSpendGHS: 0,
    monthKey: currentMonthKey(),
    updatedAt: Date.now(),
    pendingVerification: false,
  };
}

async function mainWithAdmin(sa: Record<string, unknown>) {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa as admin.ServiceAccount) });
  }
  const db = admin.firestore();

  const jsonPath = path.join(__dirname, '../data/cash-customers.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing data/cash-customers.json');
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CashRow[];

  let batch = db.batch();
  let n = 0;
  let written = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const payload = buildPayload(row);
    if (!payload.name) continue;

    const id = stableCashId(row, i);
    const ref = db.collection('pharmacies').doc(id);
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

  console.log(`Done (Admin SDK). Upserted ${written} cash pharmacy documents.`);
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
        '  pnpm exec tsx scripts/sync-cash-pharmacies.ts <email> <password>\n' +
        'Note: Google sign-in only does not set an Email/Password — use a service account instead.'
    );
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, '../data/cash-customers.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing data/cash-customers.json');
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CashRow[];

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
    const payload = buildPayload(row);
    if (!payload.name) continue;

    const id = stableCashId(row, i);
    const ref = doc(db, 'pharmacies', id);
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
  console.log(`Done. Upserted ${written} cash pharmacy documents.`);
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
