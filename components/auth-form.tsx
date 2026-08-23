'use client';

import { useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getPhoneSendVerificationErrorMessage } from '@/lib/phone-auth-errors';
import {
  ensureUserProfileAfterAuth,
  type AuthIntent,
} from '@/lib/ensure-user-profile';
import {
  clearAuthIntentGate,
  setAuthIntentGate,
} from '@/lib/auth-intent-gate';
import { useAuth } from '@/lib/auth-context';
import { normalizeGhanaPhoneToE164, isValidGhanaE164 } from '@/lib/ghana-phone';
import Image from 'next/image';

function GoogleMark() {
  return (
    <svg className='h-4 w-4 shrink-0' viewBox='0 0 24 24' aria-hidden>
      <path
        fill='#EA4335'
        d='M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7.1 0-.7-.1-1.4-.2-2.1H12Z'
      />
      <path
        fill='#34A853'
        d='M12 23c3 0 5.5-.9 7.3-2.6l-3.1-2.4c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.5-4l-3.2 2.5C5.3 20.8 8.4 23 12 23Z'
      />
      <path
        fill='#FBBC05'
        d='M6.5 14.1c-.2-.6-.3-1.3-.3-2.1s.1-1.5.3-2.1L3.3 7.4C2.5 9 2 10.4 2 12s.5 3 1.3 4.6l3.2-2.5Z'
      />
      <path
        fill='#4285F4'
        d='M12 4.8c1.6 0 3 .5 4.1 1.6L19 3.5C17.2 1.9 14.8 1 12 1 8.4 1 5.3 3.2 3.3 6.4l3.2 2.5C7.3 6.5 9.5 4.8 12 4.8Z'
      />
    </svg>
  );
}

type AuthFormProps = {
  defaultIntent?: AuthIntent;
  description?: string;
  recaptchaContainerId: string;
  onAuthenticated: () => void;
  onAdminAuthenticated?: () => void;
};

export function AuthForm({
  defaultIntent = 'signup',
  description,
  recaptchaContainerId,
  onAuthenticated,
  onAdminAuthenticated,
}: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneCooldownUntil, setPhoneCooldownUntil] = useState(0);
  const [phoneCooldownNow, setPhoneCooldownNow] = useState(Date.now());
  const [showAdminPasskeyDialog, setShowAdminPasskeyDialog] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [authIntent, setAuthIntent] = useState<AuthIntent>(defaultIntent);
  const [altMethod, setAltMethod] = useState<'email' | 'phone' | null>(null);
  const [gateDialog, setGateDialog] = useState<'no_account' | 'account_exists' | null>(
    null
  );
  const { refreshUser } = useAuth();

  useEffect(() => {
    setAuthIntent(defaultIntent);
    setError('');
    setAltMethod(null);
    setConfirmationResult(null);
    setVerificationCode('');
  }, [defaultIntent]);

  useEffect(() => {
    const t = setInterval(() => setPhoneCooldownNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return null;
    const recaptchaContainer = document.getElementById(recaptchaContainerId);
    if (recaptchaContainer) recaptchaContainer.innerHTML = '';
    return new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        setError('reCAPTCHA expired. Please try again.');
      },
    });
  };

  const switchIntent = (intent: AuthIntent) => {
    setAuthIntent(intent);
    setError('');
    setAltMethod(null);
    setConfirmationResult(null);
    setVerificationCode('');
    setPassword('');
    setConfirmPassword('');
  };

  const showGateDialog = (kind: 'no_account' | 'account_exists') => {
    setError('');
    setGateDialog(kind);
  };

  const dismissGateDialog = () => {
    const kind = gateDialog;
    setGateDialog(null);
    if (kind === 'no_account') switchIntent('signup');
    if (kind === 'account_exists') switchIntent('signin');
  };

  const finishAuth = async (
    firebaseUser: Parameters<typeof ensureUserProfileAfterAuth>[0],
    intent: AuthIntent,
    phoneE164?: string
  ) => {
    try {
      const result = await ensureUserProfileAfterAuth(firebaseUser, intent, {
        phoneE164,
      });
      if (result.outcome === 'rejected') {
        if (result.reason === 'no_account' || result.reason === 'account_exists') {
          showGateDialog(result.reason);
          return;
        }
        setError(result.message);
        return;
      }
      if (result.outcome === 'admin_passkey') {
        setPendingUser(firebaseUser);
        setShowAdminPasskeyDialog(true);
        return;
      }
      await refreshUser();
      onAuthenticated();
    } catch (err) {
      console.error('Error ensuring user profile:', err);
      setError('Could not complete sign-in. Please try again.');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (!auth || !db) {
      setError('Authentication service unavailable.');
      setLoading(false);
      return;
    }
    try {
      setAuthIntentGate('signin');
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await finishAuth(userCredential.user, 'signin');
    } catch (err: any) {
      clearAuthIntentGate();
      if (err?.code === 'auth/user-not-found') {
        showGateDialog('no_account');
      } else if (
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        setError(
          'Wrong password, or this account uses Google. If you have not signed up yet, create an account first. If you signed up with Google, use Log in with Google.'
        );
      } else {
        setError(err.message || 'Failed to log in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (!auth || !db) {
      setError('Authentication service unavailable.');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    try {
      setAuthIntentGate('signup');
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await finishAuth(userCredential.user, 'signup');
      setConfirmPassword('');
    } catch (err: any) {
      clearAuthIntentGate();
      if (err?.code === 'auth/email-already-in-use') {
        showGateDialog('account_exists');
      } else if (err?.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(err.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    if (!auth) {
      setError('Authentication service unavailable.');
      setLoading(false);
      return;
    }
    try {
      setAuthIntentGate(authIntent);
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await finishAuth(userCredential.user, authIntent);
    } catch (err: any) {
      clearAuthIntentGate();
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in was closed.');
      } else {
        setError(
          err.message ||
            (authIntent === 'signup'
              ? 'Failed to create account with Google.'
              : 'Failed to log in with Google.')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSendCode = async () => {
    setError('');
    setPhoneLoading(true);
    if (Date.now() < phoneCooldownUntil) {
      const secs = Math.ceil((phoneCooldownUntil - Date.now()) / 1000);
      setError(`Please wait ${secs}s before requesting another code.`);
      setPhoneLoading(false);
      return;
    }
    if (!auth) {
      setError('Authentication service unavailable.');
      setPhoneLoading(false);
      return;
    }

    const formattedPhone = normalizeGhanaPhoneToE164(
      phone.startsWith('+') ? phone : phone
    );
    if (!isValidGhanaE164(formattedPhone)) {
      setError('Enter a valid Ghana number (e.g. 0244… or +233…).');
      setPhoneLoading(false);
      return;
    }

    const maxAttempts = 2;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      try {
        const recaptchaVerifier = setupRecaptcha();
        if (!recaptchaVerifier) {
          setError('Failed to initialize reCAPTCHA.');
          setPhoneLoading(false);
          return;
        }
        try {
          await recaptchaVerifier.render();
        } catch {
          // continue
        }
        const confirmation = await signInWithPhoneNumber(
          auth,
          formattedPhone,
          recaptchaVerifier
        );
        setConfirmationResult(confirmation);
        setPhoneCooldownUntil(Date.now() + 60_000);
        setPhoneLoading(false);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    setError(getPhoneSendVerificationErrorMessage(lastErr));
    setPhoneLoading(false);
  };

  const handlePhoneVerifyCode = async () => {
    setError('');
    setLoading(true);
    if (!confirmationResult) {
      setError('Please send a verification code first.');
      setLoading(false);
      return;
    }
    try {
      setAuthIntentGate(authIntent);
      const userCredential = await confirmationResult.confirm(verificationCode);
      await finishAuth(
        userCredential.user,
        authIntent,
        normalizeGhanaPhoneToE164(phone)
      );
    } catch (err: any) {
      clearAuthIntentGate();
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const isSignup = authIntent === 'signup';
  const phoneWaiting = phoneCooldownNow < phoneCooldownUntil;

  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-col items-center space-y-3 text-center'>
        <div className='relative h-14 w-14 overflow-hidden rounded-xl'>
          <Image
            src='/images/LeetoniaWholesaleLogo.jpg'
            alt='Leetonia Wholesale'
            fill
            className='object-contain'
            priority
          />
        </div>
        <div className='space-y-1.5'>
          <h2 className='font-serif text-2xl font-semibold text-foreground'>
            {isSignup ? 'Create account' : 'Welcome back'}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {isSignup
              ? description ||
                'Create your account to start ordering for your pharmacy. We will ask for your details next.'
              : 'Log in to your Leetonia Wholesale account.'}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type='button'
        onClick={handleGoogleAuth}
        disabled={loading}
        className='h-12 w-full rounded-xl bg-[#1a73e8] text-[15px] font-medium text-white shadow-sm hover:bg-[#1557b0]'
      >
        {loading ? (
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        ) : (
          <span className='mr-2 flex h-6 w-6 items-center justify-center rounded-sm bg-white'>
            <GoogleMark />
          </span>
        )}
        {isSignup ? 'Create account with Google' : 'Log in with Google'}
      </Button>

      <div className='flex items-center gap-3'>
        <div className='h-px flex-1 bg-border' />
        <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          or
        </span>
        <div className='h-px flex-1 bg-border' />
      </div>

      <div className='flex rounded-full border border-border/70 bg-muted/30 p-1'>
        <button
          type='button'
          onClick={() => {
            setAltMethod('email');
            setError('');
            setConfirmationResult(null);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm transition-colors ${
            altMethod === 'email'
              ? 'bg-white font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mail className='h-3.5 w-3.5' />
          Email
        </button>
        <button
          type='button'
          onClick={() => {
            setAltMethod('phone');
            setError('');
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm transition-colors ${
            altMethod === 'phone'
              ? 'bg-white font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Phone className='h-3.5 w-3.5' />
          Phone
        </button>
      </div>

      {altMethod === 'email' &&
        (isSignup ? (
          <form onSubmit={handleEmailSignUp} className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='auth-email'>Email</Label>
              <Input
                id='auth-email'
                type='email'
                placeholder='your@email.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className='bg-white'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='auth-password'>Password</Label>
              <Input
                id='auth-password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className='bg-white'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='auth-confirm'>Confirm password</Label>
              <Input
                id='auth-confirm'
                type='password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className='bg-white'
              />
            </div>
            <Button type='submit' className='h-11 w-full' disabled={loading}>
              {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Create account with email
            </Button>
          </form>
        ) : (
          <form onSubmit={handleEmailLogin} className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='auth-email'>Email</Label>
              <Input
                id='auth-email'
                type='email'
                placeholder='your@email.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className='bg-white'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='auth-password'>Password</Label>
              <Input
                id='auth-password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className='bg-white'
              />
            </div>
            <Button type='submit' className='h-11 w-full' disabled={loading}>
              {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Log in with email
            </Button>
          </form>
        ))}

      {altMethod === 'phone' && (
        <div className='space-y-3'>
          <div id={recaptchaContainerId} />
          {!confirmationResult ? (
            <>
              <div className='space-y-1.5'>
                <Label htmlFor='auth-phone'>Phone number (Ghana)</Label>
                <Input
                  id='auth-phone'
                  type='tel'
                  placeholder='0244… or +233…'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className='bg-white'
                />
              </div>
              <Button
                type='button'
                onClick={handlePhoneSendCode}
                className='h-11 w-full'
                disabled={phoneLoading || !phone || phoneWaiting}
              >
                {phoneLoading && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {phoneWaiting
                  ? `Try again in ${Math.ceil(
                      (phoneCooldownUntil - phoneCooldownNow) / 1000
                    )}s`
                  : 'Send code'}
              </Button>
            </>
          ) : (
            <>
              <div className='space-y-1.5'>
                <Label htmlFor='auth-code'>Verification code</Label>
                <Input
                  id='auth-code'
                  type='text'
                  placeholder='123456'
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  required
                  maxLength={6}
                  className='bg-white'
                />
              </div>
              <Button
                type='button'
                onClick={handlePhoneVerifyCode}
                className='h-11 w-full'
                disabled={loading || !verificationCode}
              >
                {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {isSignup ? 'Verify and create account' : 'Verify and log in'}
              </Button>
              <Button
                type='button'
                variant='outline'
                className='w-full'
                onClick={() => {
                  setConfirmationResult(null);
                  setVerificationCode('');
                }}
              >
                Change phone number
              </Button>
            </>
          )}
        </div>
      )}

      <p className='text-center text-sm text-muted-foreground'>
        {isSignup ? (
          <>
            Already have an account?{' '}
            <button
              type='button'
              className='font-semibold text-primary hover:underline'
              onClick={() => switchIntent('signin')}
            >
              Log in
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              type='button'
              className='font-semibold text-primary hover:underline'
              onClick={() => switchIntent('signup')}
            >
              Create account
            </button>
          </>
        )}
      </p>

      {showAdminPasskeyDialog && pendingUser && (
        <AdminPasskeyDialog
          open={showAdminPasskeyDialog}
          onCancel={() => setShowAdminPasskeyDialog(false)}
          onSuccess={() => {
            setShowAdminPasskeyDialog(false);
            (onAdminAuthenticated ?? onAuthenticated)();
          }}
        />
      )}

      <AlertDialog
        open={gateDialog !== null}
        onOpenChange={(open) => {
          if (!open) dismissGateDialog();
        }}
      >
        <AlertDialogContent className='sm:max-w-md'>
          {gateDialog === 'no_account' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>No account found</AlertDialogTitle>
                <AlertDialogDescription>
                  You don&apos;t have a Leetonia Wholesale account yet, so you
                  can&apos;t log in. Google and other sign-in methods only work
                  after you&apos;ve created an account. Please sign up first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>Create account</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>You already have an account</AlertDialogTitle>
                <AlertDialogDescription>
                  This account is already registered, so you can&apos;t sign up
                  again. Log in instead — including Log in with Google if that
                  is how you created it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>Log in</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
