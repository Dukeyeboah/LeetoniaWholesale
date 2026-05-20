import { signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';
import { isAdminEmail } from '@/lib/admin-config';
import { omitUndefinedFields } from '@/lib/firestore-sanitize';
import { inferSignInProvider } from '@/lib/auth-providers';

export type AuthIntent = 'signin' | 'signup';

export const SIGN_IN_NO_ACCOUNT_MESSAGE =
  'No account found. Switch to Create account to register first.';

export const SIGN_UP_ACCOUNT_EXISTS_MESSAGE =
  'An account already exists with these details. Switch to Sign in.';

export type EnsureUserProfileResult =
  | { outcome: 'success' }
  | { outcome: 'admin_passkey' }
  | { outcome: 'rejected'; message: string };

/**
 * After Firebase Auth succeeds, sync Firestore `users/{uid}`.
 * Sign-in never creates a new profile; sign-up creates one when missing.
 */
export async function ensureUserProfileAfterAuth(
  firebaseUser: FirebaseUser,
  intent: AuthIntent,
  options?: { phoneE164?: string }
): Promise<EnsureUserProfileResult> {
  if (!db || !auth) {
    return { outcome: 'rejected', message: 'Database unavailable.' };
  }

  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);
  const email = firebaseUser.email || '';
  const phoneE164 = options?.phoneE164 || firebaseUser.phoneNumber || '';

  if (userDoc.exists()) {
    const userData = userDoc.data() as User;
    const hasPrivilegedRole =
      userData.role === 'admin' || userData.role === 'super_admin';

    if (intent === 'signup') {
      if (isAdminEmail(email) && !hasPrivilegedRole) {
        return { outcome: 'admin_passkey' };
      }
      return { outcome: 'rejected', message: SIGN_UP_ACCOUNT_EXISTS_MESSAGE };
    }

    if (isAdminEmail(email) && !hasPrivilegedRole) {
      return { outcome: 'admin_passkey' };
    }

    if (phoneE164 && !userData.phone) {
      await setDoc(userDocRef, { phone: phoneE164 }, { merge: true });
    }
    return { outcome: 'success' };
  }

  // No Firestore profile yet
  if (intent === 'signin') {
    if (isAdminEmail(email)) {
      return createNewUserProfile(firebaseUser, email, phoneE164, true);
    }
    await signOut(auth);
    return { outcome: 'rejected', message: SIGN_IN_NO_ACCOUNT_MESSAGE };
  }

  return createNewUserProfile(firebaseUser, email, phoneE164, isAdminEmail(email));
}

async function createNewUserProfile(
  firebaseUser: FirebaseUser,
  email: string,
  phoneE164: string,
  needsAdminPasskey: boolean
): Promise<EnsureUserProfileResult> {
  if (!db) {
    return { outcome: 'rejected', message: 'Database unavailable.' };
  }

  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const newUser: User = {
    id: firebaseUser.uid,
    email,
    phone: phoneE164,
    role: 'client',
    name:
      firebaseUser.displayName?.trim() ||
      phoneE164 ||
      email ||
      '',
    signInProvider: inferSignInProvider(firebaseUser),
    ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
    createdAt: Date.now(),
  };

  if (needsAdminPasskey) {
    await setDoc(
      userDocRef,
      omitUndefinedFields(newUser as unknown as Record<string, unknown>)
    );
    return { outcome: 'admin_passkey' };
  }

  await setDoc(
    userDocRef,
    omitUndefinedFields(newUser as unknown as Record<string, unknown>)
  );
  return { outcome: 'success' };
}
