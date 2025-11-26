import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

try {
  const hasValidKey =
    typeof window !== 'undefined' &&
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.length > 10 &&
    !firebaseConfig.apiKey.includes('FIREBASE_API_KEY');

  if (hasValidKey) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  } else {
    console.error(
      'Firebase credentials missing or invalid. Please configure your .env.local file.'
    );
    if (typeof window !== 'undefined') {
      console.error('Required environment variables:');
      console.error('- NEXT_PUBLIC_FIREBASE_API_KEY');
      console.error('- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
      console.error('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
      console.error('- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
      console.error('- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
      console.error('- NEXT_PUBLIC_FIREBASE_APP_ID');
    }
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

export { app, auth, db, storage };
