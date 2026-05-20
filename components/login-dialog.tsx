'use client';

import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Mail, Phone, Chrome } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import { getPhoneSendVerificationErrorMessage } from '@/lib/phone-auth-errors';
import {
  ensureUserProfileAfterAuth,
  type AuthIntent,
} from '@/lib/ensure-user-profile';
import { AuthIntentToggle } from '@/components/auth-intent-toggle';
import { useAuth } from '@/lib/auth-context';
import { normalizeGhanaPhoneToE164 } from '@/lib/ghana-phone';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
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
  const [authIntent, setAuthIntent] = useState<AuthIntent>('signin');
  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const router = useRouter();
  const { refreshUser } = useAuth();

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
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Sign in or create account</DialogTitle>
            <DialogDescription>
              Sign in if you already have an account, or create one to order.
            </DialogDescription>
          </DialogHeader>
          <AuthIntentToggle
            value={authIntent}
            onChange={setAuthIntent}
            onClearError={() => setError('')}
          />
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
            <TabsContent value='google' className='space-y-4'>
              <Button
                onClick={handleGoogleAuth}
                className='w-full'
                variant='outline'
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Please wait…
                  </>
                ) : (
                  <>
                    <Chrome className='mr-2 h-4 w-4' />
                    {authIntent === 'signup'
                      ? 'Sign up with Google'
                      : 'Sign in with Google'}
                  </>
                )}
              </Button>
            </TabsContent>
            <TabsContent value='email' className='space-y-4'>
              {authIntent === 'signin' ? (
                <form onSubmit={handleEmailLogin} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='email'>Email</Label>
                    <Input
                      id='email'
                      type='email'
                      placeholder='your@email.com'
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
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
                    />
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    {loading && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
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
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='signup-email'>Email</Label>
                    <Input
                      id='signup-email'
                      type='email'
                      placeholder='your@email.com'
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
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
                    />
                  </div>
                  <Button type='submit' className='w-full' disabled={loading}>
                    {loading && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    Create account
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value='phone' className='space-y-4'>
              {/* Invisible reCAPTCHA mounts here; badge is usually bottom-right of the page */}
              <div id='recaptcha-container-login-dialog' />
              {!confirmationResult ? (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='phone'>Phone Number (Ghana)</Label>
                    <Input
                      id='phone'
                      type='tel'
                      placeholder='0244123456'
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <p className='text-xs text-muted-foreground'>
                      Enter your Ghana phone number without the country code
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
                    {authIntent === 'signup'
                      ? 'Send code to create account'
                      : 'Send code to sign in'}
                  </Button>
                </>
              ) : (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='code'>Verification Code</Label>
                    <Input
                      id='code'
                      type='text'
                      placeholder='123456'
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
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
                    {authIntent === 'signup'
                      ? 'Verify and create account'
                      : 'Verify and sign in'}
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setConfirmationResult(null);
                      setVerificationCode('');
                    }}
                    className='w-full'
                  >
                    Change Phone Number
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
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
