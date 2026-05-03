/**
 * User-facing copy for Firebase Phone Auth / Identity Toolkit SMS failures.
 * Console often shows reCAPTCHA Enterprise → v2 fallback, 400/503, or error -39.
 */

export function getPhoneSendVerificationErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();

  if (code === 'auth/invalid-app-credential') {
    return (
      'reCAPTCHA could not be verified for this browser. Add your domain under Firebase → Authentication → Settings → Authorized domains, disable strict extensions (ad blockers, SES/lockdown), and try again. Or sign in with Google.'
    );
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Invalid phone number format.';
  }
  if (code === 'auth/too-many-requests') {
    return (
      'Too many SMS attempts. Wait 15–60 minutes or try another network, or use Google sign-in instead.'
    );
  }

  if (
    msg.includes('-39') ||
    msg.includes('error-code:-39') ||
    code.includes('-39')
  ) {
    return (
      'Firebase did not send the SMS (internal error 39 — often SMS fraud protection, unsupported region, or reCAPTCHA assessment). Retry later, try Google sign-in, or in Google Cloud / Firebase review Identity Platform SMS & reCAPTCHA settings and billing.'
    );
  }

  if (msg.includes('503') || msg.includes(' 503')) {
    return (
      'Google’s SMS service returned a temporary error (503). Wait a minute and try again.'
    );
  }

  if (msg.includes('recaptcha') && msg.includes('enterprise')) {
    return (
      'reCAPTCHA Enterprise did not verify. We deferred App Check Enterprise so phone auth can run first — refresh and try again. For App Check, prefer a reCAPTCHA v3 site key (see NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_V3_SITE_KEY in lib/firebase.ts).'
    );
  }

  if (e?.message && typeof e.message === 'string') {
    return e.message;
  }
  return 'Failed to send verification code.';
}
