export type AuthIntent = 'signin' | 'signup';

const AUTH_INTENT_GATE_KEY = 'lw_auth_intent_gate';

/** Remember whether the in-progress auth attempt is sign-in or sign-up. */
export function setAuthIntentGate(intent: AuthIntent) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AUTH_INTENT_GATE_KEY, intent);
}

export function getAuthIntentGate(): AuthIntent | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(AUTH_INTENT_GATE_KEY);
  if (value === 'signin' || value === 'signup') return value;
  return null;
}

export function clearAuthIntentGate() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_INTENT_GATE_KEY);
}
