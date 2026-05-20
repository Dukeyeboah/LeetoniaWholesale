import { signOut, type User as FirebaseUser } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { isAdminEmail } from '@/lib/admin-config';
import { inferSignInProvider } from '@/lib/auth-providers';

export const GOOGLE_SIGN_IN_NO_ACCOUNT_MESSAGE =
  'No account found for this Google email. Create an account on the Email tab (Sign up), then you can sign in with Google.';

export function isGoogleSignIn(firebaseUser: FirebaseUser): boolean {
  return inferSignInProvider(firebaseUser) === 'google';
}

/**
 * Google may only sign in existing users (Firestore profile). New pharmacy clients
 * must register via email sign-up first. Whitelisted admin emails may still onboard via Google.
 */
export async function rejectGoogleSignInWithoutProfile(
  auth: Auth,
  firebaseUser: FirebaseUser,
  profileExists: boolean
): Promise<string | null> {
  if (!isGoogleSignIn(firebaseUser) || profileExists) {
    return null;
  }
  const email = firebaseUser.email || '';
  if (isAdminEmail(email)) {
    return null;
  }
  await signOut(auth);
  return GOOGLE_SIGN_IN_NO_ACCOUNT_MESSAGE;
}
