import type { User as FirebaseUser } from 'firebase/auth';

/** How the user most recently authenticates; stored on Firestore `users` for profile UX. */
export type SignInProvider = 'phone' | 'email' | 'google';

export function inferSignInProvider(
  firebaseUser: FirebaseUser
): SignInProvider {
  const ids = firebaseUser.providerData.map((p) => p.providerId);
  if (ids.includes('phone')) return 'phone';
  if (ids.includes('google.com')) return 'google';
  if (ids.includes('password')) return 'email';
  return 'email';
}
