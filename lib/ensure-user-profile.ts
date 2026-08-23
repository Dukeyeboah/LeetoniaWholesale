import { signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';
import { isAdminEmail } from '@/lib/admin-config';
import { omitUndefinedFields } from '@/lib/firestore-sanitize';
import { inferSignInProvider } from '@/lib/auth-providers';
import { clearAuthIntentGate, type AuthIntent } from '@/lib/auth-intent-gate';

export type { AuthIntent };

export type AuthGateReason = 'no_account' | 'account_exists' | 'other';

export const SIGN_IN_NO_ACCOUNT_MESSAGE =
  "You don't have an account yet. Create one first — Google and other sign-in methods only work after you've signed up.";

export const SIGN_UP_ACCOUNT_EXISTS_MESSAGE =
  'This account is already registered. You cannot sign up again — log in instead.';

export type EnsureUserProfileResult =
  | { outcome: 'success' }
  | { outcome: 'admin_passkey' }
  | { outcome: 'rejected'; reason: AuthGateReason; message: string };

function rejected(
  reason: AuthGateReason,
  message: string
): EnsureUserProfileResult {
  return { outcome: 'rejected', reason, message };
}

/**
 * After Firebase Auth succeeds, sync Firestore `users/{uid}`.
 * Sign-in never creates a new profile; sign-up creates one when missing.
 */
export async function ensureUserProfileAfterAuth(
  firebaseUser: FirebaseUser,
  intent: AuthIntent,
  options?: { phoneE164?: string }
): Promise<EnsureUserProfileResult> {
  try {
    if (!db || !auth) {
      return rejected('other', 'Database unavailable.');
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
        await signOut(auth);
        return rejected('account_exists', SIGN_UP_ACCOUNT_EXISTS_MESSAGE);
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
      return rejected('no_account', SIGN_IN_NO_ACCOUNT_MESSAGE);
    }

    return createNewUserProfile(
      firebaseUser,
      email,
      phoneE164,
      isAdminEmail(email)
    );
  } finally {
    clearAuthIntentGate();
  }
}

async function createNewUserProfile(
  firebaseUser: FirebaseUser,
  email: string,
  phoneE164: string,
  needsAdminPasskey: boolean
): Promise<EnsureUserProfileResult> {
  if (!db) {
    return rejected('other', 'Database unavailable.');
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

  try {
    await setDoc(
      userDocRef,
      omitUndefinedFields(newUser as unknown as Record<string, unknown>)
    );
  } catch (e) {
    console.error('createNewUserProfile', e);
    await signOut(auth);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : '';
    if (code === 'permission-denied') {
      return rejected(
        'other',
        'Could not create your account (Firestore permissions). Deploy the latest firestore.rules and try again.'
      );
    }
    return rejected('other', 'Could not create your account. Please try again.');
  }
  if (needsAdminPasskey) {
    return { outcome: 'admin_passkey' };
  }
  return { outcome: 'success' };
}
