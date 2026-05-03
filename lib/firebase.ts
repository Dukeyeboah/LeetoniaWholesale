// import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// import { getAuth, type Auth } from 'firebase/auth';
// import { getFirestore, type Firestore } from 'firebase/firestore';
// import { getStorage, type FirebaseStorage } from 'firebase/storage';

// const firebaseConfig = {
//   apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
//   authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
//   projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
//   storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
//   appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
// };

// // Initialize Firebase
// let app: FirebaseApp | undefined;
// let auth: Auth | undefined;
// let db: Firestore | undefined;
// let storage: FirebaseStorage | undefined;

// try {
//   const hasValidKey =
//     typeof window !== 'undefined' &&
//     firebaseConfig.apiKey &&
//     firebaseConfig.apiKey.length > 10 &&
//     !firebaseConfig.apiKey.includes('FIREBASE_API_KEY');

//   if (hasValidKey) {
//     app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
//     auth = getAuth(app);
//     db = getFirestore(app);
//     storage = getStorage(app);
//   } else if (typeof window !== 'undefined') {
//     // Only warn in the browser when credentials are missing (not during build/SSR where window is undefined)
//     console.error(
//       'Firebase credentials missing or invalid. Please configure your .env.local file.'
//     );
//     console.error('Required environment variables:');
//     console.error('- NEXT_PUBLIC_FIREBASE_API_KEY');
//     console.error('- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
//     console.error('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
//     console.error('- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
//     console.error('- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
//     console.error('- NEXT_PUBLIC_FIREBASE_APP_ID');
//   }
// } catch (error) {
//   console.error('Error initializing Firebase:', error);
// }

// export { app, auth, db, storage };

// import { initializeApp, getApps, getApp } from 'firebase/app';
// import { getAuth } from 'firebase/auth';
// import { getFirestore } from 'firebase/firestore';
// import { getStorage } from 'firebase/storage';

// const firebaseConfig = {
//   apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
//   authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
//   projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
//   storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
//   messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
//   appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
// };

// const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// export const auth = getAuth(app);
// export const db = getFirestore(app);
// export const storage = getStorage(app);

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const auth = getAuth(app);
export const storage = getStorage(app);

/**
 * App Check (optional).
 * - Prefer `NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_V3_SITE_KEY` (reCAPTCHA v3) for
 *   web App Check — it avoids stacking two reCAPTCHA Enterprise sessions on the same
 *   page as Firebase Phone Auth (which also tries Enterprise, then v2).
 * - If you only set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` (Enterprise), we defer
 *   initialization by a few seconds so the phone SMS reCAPTCHA can finish first.
 */
if (typeof window !== 'undefined') {
  const v3Key = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_V3_SITE_KEY;
  const enterpriseKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  const deferEnterpriseMs = Math.max(
    0,
    Number(process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEFER_MS ?? '3500')
  );

  const tryInit = (provider: ReCaptchaV3Provider | ReCaptchaEnterpriseProvider) => {
    try {
      initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // ignore double-init in fast refresh
    }
  };

  if (v3Key) {
    tryInit(new ReCaptchaV3Provider(v3Key));
  } else if (enterpriseKey) {
    window.setTimeout(() => {
      tryInit(new ReCaptchaEnterpriseProvider(enterpriseKey));
    }, Number.isFinite(deferEnterpriseMs) ? deferEnterpriseMs : 3500);
  }
}

