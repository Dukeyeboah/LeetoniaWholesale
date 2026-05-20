'use client';

import type React from 'react';
import Image from 'next/image';

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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, Mail, Phone, Chrome } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import { normalizeGhanaPhoneToE164, isValidGhanaE164 } from '@/lib/ghana-phone';
import { getPhoneSendVerificationErrorMessage } from '@/lib/phone-auth-errors';
import {
  ensureUserProfileAfterAuth,
  type AuthIntent,
} from '@/lib/ensure-user-profile';
import { AuthIntentToggle } from '@/components/auth-intent-toggle';
import { useAuth } from '@/lib/auth-context';
import { useState, useEffect } from 'react';

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    recaptchaWidgetId?: number;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneCooldownUntil, setPhoneCooldownUntil] = useState<number>(0);
  const [phoneCooldownNow, setPhoneCooldownNow] = useState<number>(Date.now());
  const [showAdminPasskeyDialog, setShowAdminPasskeyDialog] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [authIntent, setAuthIntent] = useState<AuthIntent>('signin');
  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const router = useRouter();
  const { refreshUser } = useAuth();

  // Initialize reCAPTCHA for phone auth
  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return null;

    // Reuse a single verifier instance to avoid:
    // "reCAPTCHA has already been rendered in this element"
    if (window.recaptchaVerifier) return window.recaptchaVerifier;

    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (recaptchaContainer) {
      recaptchaContainer.innerHTML = '';
    }

    const recaptchaVerifier = new RecaptchaVerifier(
      auth,
      'recaptcha-container',
      {
        // Invisible: small badge only; challenge runs when SMS is sent. Google may
        // still show a puzzle if risk is high — that is controlled by Firebase/Google.
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        },
      }
    );

    window.recaptchaVerifier = recaptchaVerifier;
    return recaptchaVerifier;
  };

  const resetPhoneFlow = () => {
    setConfirmationResult(null);
    setVerificationCode('');
    if (typeof window !== 'undefined' && window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      window.recaptchaVerifier = undefined;
      window.recaptchaWidgetId = undefined;
    }
    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (recaptchaContainer) recaptchaContainer.innerHTML = '';
  };

  useEffect(() => {
    const t = setInterval(() => setPhoneCooldownNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch {
          // ignore
        }
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth || !db) {
      setError(
        'Authentication service unavailable. Please check your Firebase configuration.'
      );
      setLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await finishAuth(userCredential.user, 'signin');
    } catch (err: any) {
      let errorMessage = 'Failed to login. Please check your credentials.';
      if (err.code === 'auth/user-not-found') {
        errorMessage =
          'No account with this email. Switch to Create account to register.';
      } else if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        errorMessage =
          'Incorrect email or password — or this account may use Google sign-in only. Open the Google tab and sign in with the same email (changing role in Firestore does not set a password).';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth || !db) {
      setError(
        'Authentication service unavailable. Please check your Firebase configuration.'
      );
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
      let errorMessage = 'Failed to create account.';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage =
          'An account already exists with this email. Switch to Sign in or use Google.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Use at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);

    if (!auth || !db) {
      setError(
        'Authentication service unavailable. Please check your Firebase configuration.'
      );
      setLoading(false);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await finishAuth(userCredential.user, authIntent);
    } catch (err: any) {
      let errorMessage =
        authIntent === 'signup'
          ? 'Failed to sign up with Google.'
          : 'Failed to sign in with Google.';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Google popup was closed.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPhoneLoading(true);

    if (Date.now() < phoneCooldownUntil) {
      const secs = Math.ceil((phoneCooldownUntil - Date.now()) / 1000);
      setError(`Please wait ${secs}s before requesting another code.`);
      setPhoneLoading(false);
      return;
    }

    if (!auth || !db) {
      setError(
        'Authentication service unavailable. Please check your Firebase configuration.'
      );
      setPhoneLoading(false);
      return;
    }

    // Format phone number for Ghana (+233)
    const formattedPhone = normalizeGhanaPhoneToE164(phone);

    // Validate Ghana phone number
    if (!isValidGhanaE164(formattedPhone)) {
      setError(
        'Please enter a valid Ghana phone number (e.g., 0244123456 or +233244123456)'
      );
      setPhoneLoading(false);
      return;
    }

    const maxAttempts = 2;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      try {
        resetPhoneFlow();
        const recaptchaVerifier = setupRecaptcha();
        if (!recaptchaVerifier) {
          setError('Failed to initialize reCAPTCHA. Please refresh the page.');
          setPhoneLoading(false);
          return;
        }

        try {
          await recaptchaVerifier.render();
        } catch {
          // ignore; signInWithPhoneNumber will attempt to continue
        }

        // Invisible reCAPTCHA executes as part of this call (user may see a quick overlay).
        const confirmation = await signInWithPhoneNumber(
          auth,
          formattedPhone,
          recaptchaVerifier
        );
        setConfirmationResult(confirmation);
        setPhoneCooldownUntil(Date.now() + 60_000);
        setError('');
        setPhoneLoading(false);
        return;
      } catch (err) {
        lastErr = err;
      }
    }

    const errMeta = lastErr as { code?: string } | undefined;
    if (errMeta?.code === 'auth/too-many-requests') {
      setPhoneCooldownUntil(Date.now() + 15 * 60_000);
    }
    setError(getPhoneSendVerificationErrorMessage(lastErr));
    setPhoneLoading(false);
  };

  const handlePhoneVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!confirmationResult) {
      setError('Please send the verification code first.');
      setLoading(false);
      return;
    }

    try {
      const userCredential = await confirmationResult.confirm(verificationCode);
      const formattedPhone = normalizeGhanaPhoneToE164(phone);
      await finishAuth(userCredential.user, authIntent, formattedPhone);
    } catch (err: any) {
      let errorMessage = 'Invalid verification code. Please try again.';
      if (err.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code.';
      } else if (err.code === 'auth/code-expired') {
        errorMessage = 'Verification code expired. Please request a new one.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
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
      router.push('/inventory');
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      setError('Could not complete sign-in. Please try again.');
    }
  };

  const handleAdminPasskeySuccess = () => {
    setShowAdminPasskeyDialog(false);
    setPendingUser(null);
    router.push('/admin');
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-secondary/30 p-4'>
      <Card className='w-full max-w-md shadow-lg border-border/60'>
        <CardHeader className='space-y-1 text-center'>
          <div className='flex justify-center mb-4'>
            <div className='relative h-16 w-16'>
              <Image
                src='/images/LeetoniaWholesaleLogo.jpg'
                alt='Leetonia Wholesale'
                fill
                className='object-contain'
                priority
              />
            </div>
          </div>
          <CardTitle className='text-2xl font-serif text-primary'>
            Leetonia Wholesale
          </CardTitle>
          <CardDescription>
            Sign in or create an account to access the ordering system
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <AuthIntentToggle
            value={authIntent}
            onChange={setAuthIntent}
            onClearError={() => setError('')}
          />
          <Tabs defaultValue='email' className='w-full'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='google'>
                <Chrome className='h-4 w-4 mr-2' />
                Google
              </TabsTrigger>
              <TabsTrigger value='email'>
                <Mail className='h-4 w-4 mr-2' />
                Email
              </TabsTrigger>
              <TabsTrigger value='phone'>
                <Phone className='h-4 w-4 mr-2' />
                Phone
              </TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant='destructive' className='mt-4'>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value='google' className='space-y-4 mt-4'>
              <Button
                onClick={handleGoogleAuth}
                className='w-full'
                disabled={loading}
                variant='outline'
              >
                {loading ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Chrome className='mr-2 h-4 w-4' />
                )}
                {authIntent === 'signup'
                  ? 'Sign up with Google'
                  : 'Sign in with Google'}
              </Button>
            </TabsContent>

            <TabsContent value='email' className='space-y-4 mt-4'>
              {authIntent === 'signin' ? (
                <form onSubmit={handleEmailLogin} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='email'>Email</Label>
                    <Input
                      id='email'
                      type='email'
                      placeholder='name@example.com'
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className='bg-background'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='password'>Password</Label>
                    <Input
                      id='password'
                      type='password'
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className='bg-background'
                    />
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    {loading ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : null}
                    Sign in with email
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleEmailSignUp} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='signup-name'>Your name</Label>
                    <Input
                      id='signup-name'
                      placeholder='e.g. Kwame Mensah'
                      value={signUpDisplayName}
                      onChange={(e) => setSignUpDisplayName(e.target.value)}
                      required
                      className='bg-background'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='signup-email'>Email</Label>
                    <Input
                      id='signup-email'
                      type='email'
                      placeholder='name@example.com'
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className='bg-background'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='signup-password'>Password</Label>
                    <Input
                      id='signup-password'
                      type='password'
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className='bg-background'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='signup-confirm'>Confirm password</Label>
                    <Input
                      id='signup-confirm'
                      type='password'
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className='bg-background'
                    />
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    {loading ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : null}
                    Create account
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value='phone' className='space-y-4 mt-4'>
              {!confirmationResult ? (
                <form onSubmit={handlePhoneSendCode} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='phone'>Phone Number (Ghana)</Label>
                    <Input
                      id='phone'
                      type='tel'
                      placeholder='+233243569981'
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => {
                        const normalized = normalizeGhanaPhoneToE164(phone);
                        if (normalized && normalized !== phone) {
                          setPhone(normalized);
                        }
                      }}
                      required
                      className='bg-background'
                    />
                    <p className='text-xs text-muted-foreground'>
                      Enter your Ghana phone number
                    </p>
                  </div>
                  <div id='recaptcha-container'></div>
                  <Button
                    type='submit'
                    className='w-full'
                    disabled={phoneLoading || phoneCooldownNow < phoneCooldownUntil}
                  >
                    {phoneLoading ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : null}
                    {phoneCooldownNow < phoneCooldownUntil
                      ? `Try again in ${Math.ceil(
                          (phoneCooldownUntil - phoneCooldownNow) / 1000
                        )}s`
                      : authIntent === 'signup'
                        ? 'Send code to create account'
                        : 'Send code to sign in'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handlePhoneVerifyCode} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='code'>Verification Code</Label>
                    <Input
                      id='code'
                      type='text'
                      placeholder='Enter 6-digit code'
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
                      maxLength={6}
                      className='bg-background'
                    />
                    <p className='text-xs text-muted-foreground'>
                      Enter the code sent to {phone}
                    </p>
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    {loading ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : null}
                    {authIntent === 'signup'
                      ? 'Verify and create account'
                      : 'Verify and sign in'}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-full'
                    onClick={() => {
                      resetPhoneFlow();
                    }}
                  >
                    Use Different Number
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className='flex justify-center border-t bg-muted/20 py-4'>
          <p className='text-xs text-muted-foreground text-center'>
            Protected area. Authorized personnel only.
          </p>
        </CardFooter>
      </Card>

      <AdminPasskeyDialog
        open={showAdminPasskeyDialog}
        onSuccess={handleAdminPasskeySuccess}
        onCancel={() => {
          setShowAdminPasskeyDialog(false);
          setPendingUser(null);
          router.push('/inventory');
        }}
      />
    </div>
  );
}
