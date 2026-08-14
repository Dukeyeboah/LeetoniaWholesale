'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Mail, Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import { getPhoneSendVerificationErrorMessage } from '@/lib/phone-auth-errors';
import {
  ensureUserProfileAfterAuth,
  type AuthIntent,
} from '@/lib/ensure-user-profile';
import { useAuth } from '@/lib/auth-context';
import { normalizeGhanaPhoneToE164 } from '@/lib/ghana-phone';
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

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens on Create account when guests need to register before checkout. */
  defaultIntent?: AuthIntent;
  description?: string;
}

export function LoginDialog({
  open,
  onOpenChange,
  defaultIntent = 'signin',
  description,
}: LoginDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [showAdminPasskeyDialog, setShowAdminPasskeyDialog] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [authIntent, setAuthIntent] = useState<AuthIntent>(defaultIntent);
  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [altMethod, setAltMethod] = useState<'email' | 'phone' | null>(null);
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    if (open) {
      setAuthIntent(defaultIntent);
      setError('');
      setAltMethod(null);
      setConfirmationResult(null);
      setVerificationCode('');
    }
  }, [open, defaultIntent]);

  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return null;
    const recaptchaContainer = document.getElementById(
      'recaptcha-container-login-dialog'
    );
    if (recaptchaContainer) {
      recaptchaContainer.innerHTML = '';
    }
    return new RecaptchaVerifier(
      auth,
      'recaptcha-container-login-dialog',
      {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        },
      }
    );
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
        setError(result.message);
        return;
      }
      if (result.outcome === 'admin_passkey') {
        setPendingUser(firebaseUser);
        setShowAdminPasskeyDialog(true);
        return;
      }
      await refreshUser();
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error('Error ensuring user profile:', error);
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
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      await finishAuth(userCredential.user, 'signin');
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        setError(
          'No account with this email. Switch to Create account to register.'
        );
      } else if (
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        setError(
          'Wrong password or this account uses Google sign-in only — try the Google button.'
        );
      } else {
        setError(err.message || 'Failed to login.');
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
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const name = signUpDisplayName.trim();
      if (name) {
        await updateProfile(userCredential.user, { displayName: name });
      }
      await finishAuth(userCredential.user, 'signup');
      setConfirmPassword('');
      setSignUpDisplayName('');
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setError(
          'An account already exists with this email. Switch to Sign in or use Google.'
        );
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
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await finishAuth(userCredential.user, authIntent);
    } catch (err: any) {
      setError(
        err.message ||
          (authIntent === 'signup'
            ? 'Failed to sign up with Google.'
            : 'Failed to sign in with Google.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSendCode = async () => {
    setError('');
    setPhoneLoading(true);
    if (!auth) {
      setError('Authentication service unavailable.');
      setPhoneLoading(false);
      return;
    }

    const formattedPhone = phone.startsWith('+')
      ? phone
      : `+233${phone.replace(/^0/, '')}`;

    const maxAttempts = 2;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
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
          // continue; SDK may still proceed
        }
        const confirmation = await signInWithPhoneNumber(
          auth,
          formattedPhone,
          recaptchaVerifier
        );
        setConfirmationResult(confirmation);
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
      setError('Please send verification code first.');
      setLoading(false);
      return;
    }
    try {
      const userCredential = await confirmationResult.confirm(verificationCode);
      const formattedPhone = normalizeGhanaPhoneToE164(
        phone.startsWith('+') ? phone : `+233${phone.replace(/^0/, '')}`
      );
      await finishAuth(userCredential.user, authIntent, formattedPhone);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='gap-5 border-border/40 bg-white p-6 shadow-xl sm:max-w-[400px] sm:rounded-2xl'>
          <DialogHeader className='items-center space-y-3 text-center'>
            <div className='relative h-14 w-14 overflow-hidden rounded-xl'>
              <Image
                src='/images/LeetoniaWholesaleLogo.jpg'
                alt='Leetonia Wholesale'
                fill
                className='object-contain'
              />
            </div>
            <DialogTitle className='font-serif text-2xl font-semibold text-foreground'>
              {authIntent === 'signup' ? 'Create account' : 'Welcome back'}
            </DialogTitle>
            {authIntent === 'signup' && description ? (
              <DialogDescription className='text-center text-sm'>
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className='sr-only'>
                {authIntent === 'signup'
                  ? 'Create a Leetonia Wholesale account'
                  : 'Log in to your Leetonia Wholesale account'}
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type='button'
            onClick={handleGoogleAuth}
            disabled={loading}
            className='h-11 w-full rounded-lg bg-[#1a73e8] text-sm font-medium text-white hover:bg-[#1557b0]'
          >
            {loading ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <span className='mr-0.5 flex h-5 w-5 items-center justify-center rounded-sm bg-white'>
                <GoogleMark />
              </span>
            )}
            {authIntent === 'signup' ? 'Sign up with Google' : 'Log in with Google'}
          </Button>

          <div className='flex items-center gap-3'>
            <div className='h-px flex-1 bg-border' />
            <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              or
            </span>
            <div className='h-px flex-1 bg-border' />
          </div>

          <div className='flex justify-center gap-2'>
            <button
              type='button'
              onClick={() => {
                setAltMethod('email');
                setError('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                altMethod === 'email'
                  ? 'bg-secondary font-medium text-foreground'
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                altMethod === 'phone'
                  ? 'bg-secondary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Phone className='h-3.5 w-3.5' />
              Phone
            </button>
          </div>

          {altMethod === 'email' &&
            (authIntent === 'signin' ? (
              <form onSubmit={handleEmailLogin} className='space-y-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor='email'>Email</Label>
                  <Input
                    id='email'
                    type='email'
                    placeholder='your@email.com'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className='bg-white'
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='password'>Password</Label>
                  <Input
                    id='password'
                    type='password'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className='bg-white'
                  />
                </div>
                <Button type='submit' className='w-full' disabled={loading}>
                  {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Log in with email
                </Button>
              </form>
            ) : (
              <form onSubmit={handleEmailSignUp} className='space-y-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor='signup-name'>Your name</Label>
                  <Input
                    id='signup-name'
                    placeholder='e.g. Kwame Mensah'
                    value={signUpDisplayName}
                    onChange={(e) => setSignUpDisplayName(e.target.value)}
                    required
                    className='bg-white'
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='signup-email'>Email</Label>
                  <Input
                    id='signup-email'
                    type='email'
                    placeholder='your@email.com'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className='bg-white'
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='signup-password'>Password</Label>
                  <Input
                    id='signup-password'
                    type='password'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className='bg-white'
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='signup-confirm'>Confirm password</Label>
                  <Input
                    id='signup-confirm'
                    type='password'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className='bg-white'
                  />
                </div>
                <Button type='submit' className='w-full' disabled={loading}>
                  {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Create account
                </Button>
              </form>
            ))}

          {altMethod === 'phone' && (
            <div className='space-y-3'>
              <div id='recaptcha-container-login-dialog' />
              {!confirmationResult ? (
                <>
                  <div className='space-y-1.5'>
                    <Label htmlFor='phone'>Phone number (Ghana)</Label>
                    <Input
                      id='phone'
                      type='tel'
                      placeholder='0244123456'
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className='bg-white'
                    />
                    <p className='text-xs text-muted-foreground'>
                      Enter your number without the country code
                    </p>
                  </div>
                  <Button
                    onClick={handlePhoneSendCode}
                    className='w-full'
                    disabled={phoneLoading || !phone}
                  >
                    {phoneLoading && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Send code
                  </Button>
                </>
              ) : (
                <>
                  <div className='space-y-1.5'>
                    <Label htmlFor='code'>Verification code</Label>
                    <Input
                      id='code'
                      type='text'
                      placeholder='123456'
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
                      className='bg-white'
                    />
                  </div>
                  <Button
                    onClick={handlePhoneVerifyCode}
                    className='w-full'
                    disabled={loading || !verificationCode}
                  >
                    {loading && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Verify
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setConfirmationResult(null);
                      setVerificationCode('');
                    }}
                    className='w-full'
                  >
                    Change phone number
                  </Button>
                </>
              )}
            </div>
          )}

          <p className='text-center text-sm text-muted-foreground'>
            {authIntent === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type='button'
                  className='font-medium text-primary hover:underline'
                  onClick={() => {
                    setAuthIntent('signin');
                    setError('');
                    setAltMethod(null);
                  }}
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type='button'
                  className='font-medium text-primary hover:underline'
                  onClick={() => {
                    setAuthIntent('signup');
                    setError('');
                    setAltMethod(null);
                  }}
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        </DialogContent>
      </Dialog>
      {showAdminPasskeyDialog && pendingUser && (
        <AdminPasskeyDialog
          open={showAdminPasskeyDialog}
          onCancel={() => setShowAdminPasskeyDialog(false)}
          onSuccess={() => {
            setShowAdminPasskeyDialog(false);
            onOpenChange(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
