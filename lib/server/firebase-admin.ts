import fs from 'node:fs';
import path from 'node:path';
import { cert, applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Credentials, in order:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (full JSON, recommended on hosting)
 *   FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS  (file path)
 *   Application default credentials
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    return initializeApp({ credential: cert(JSON.parse(json)), projectId });
  }
  const p =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (p) {
    const resolved = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (fs.existsSync(resolved)) {
      return initializeApp({
        credential: cert(JSON.parse(fs.readFileSync(resolved, 'utf8'))),
        projectId,
      });
    }
  }
  return initializeApp({ credential: applicationDefault(), projectId });
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
  const decoded = await getAuth(adminApp()).verifyIdToken(token);
  return { uid: decoded.uid };
}

export async function getFirebaseUserRole(uid: string): Promise<string | null> {
  const snap = await getFirestore(adminApp()).collection('users').doc(uid).get();
  const role = snap.get('role');
  return typeof role === 'string' ? role : null;
}
