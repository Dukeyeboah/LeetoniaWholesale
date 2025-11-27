'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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
import type { User } from '@/types';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import { isAdminEmail } from '@/lib/admin-config';

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
  const router = useRouter();

  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return null;
    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (recaptchaContainer) {
      recaptchaContainer.innerHTML = '';
    }
    const recaptchaVerifier = new RecaptchaVerifier(
      auth,
      'recaptcha-container',
      {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        },
      }
    );
    return recaptchaVerifier;
  };

  const ensureUserProfile = async (firebaseUser: any, phoneNumber?: string) => {
    if (!db) return;
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      const email = firebaseUser.email || '';
      if (!userDoc.exists()) {
        const shouldBeAdmin = isAdminEmail(email);
        const newUser: User = {
          id: firebaseUser.uid,
          email: email,
          phone: phoneNumber || firebaseUser.phoneNumber || '',
          role: shouldBeAdmin ? 'admin' : 'client',
          name: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || undefined,
          createdAt: Date.now(),
        };
        if (shouldBeAdmin) {
          const userWithoutRole = { ...newUser, role: 'client' as const };
          await setDoc(userDocRef, userWithoutRole);
          setPendingUser(firebaseUser);
          setShowAdminPasskeyDialog(true);
          return;
        }
        await setDoc(userDocRef, newUser);
        onOpenChange(false);
        router.refresh();
      } else {
        const userData = userDoc.data() as User;
        if (isAdminEmail(email) && userData.role !== 'admin') {
          setPendingUser(firebaseUser);
          setShowAdminPasskeyDialog(true);
          return;
        }
        if (phoneNumber && !userData.phone) {
          await setDoc(userDocRef, { phone: phoneNumber }, { merge: true });
        }
        onOpenChange(false);
        router.refresh();
      }
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      onOpenChange(false);
      router.refresh();
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
      await ensureUserProfile(userCredential.user);
    } catch (err: any) {
      setError(err.message || 'Failed to login.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
      await ensureUserProfile(userCredential.user);
    } catch (err: any) {
      setError(err.message || 'Failed to login with Google.');
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
    try {
      const recaptchaVerifier = setupRecaptcha();
      if (!recaptchaVerifier) {
        setError('Failed to initialize reCAPTCHA.');
        setPhoneLoading(false);
        return;
      }
      const formattedPhone = phone.startsWith('+')
        ? phone
        : `+233${phone.replace(/^0/, '')}`;
      const confirmation = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );
      setConfirmationResult(confirmation);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setPhoneLoading(false);
    }
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
      await ensureUserProfile(userCredential.user, phone);
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
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              Please sign in to add items to your cart and place orders.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Tabs defaultValue='email' className='w-full'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='email'>
                <Mail className='h-4 w-4 mr-2' />
                Email
              </TabsTrigger>
              <TabsTrigger value='google'>
                <Chrome className='h-4 w-4 mr-2' />
                Google
              </TabsTrigger>
              <TabsTrigger value='phone'>
                <Phone className='h-4 w-4 mr-2' />
                Phone
              </TabsTrigger>
            </TabsList>
            <TabsContent value='email' className='space-y-4'>
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
                  {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Sign In
                </Button>
              </form>
            </TabsContent>
            <TabsContent value='google' className='space-y-4'>
              <Button
                onClick={handleGoogleLogin}
                className='w-full'
                variant='outline'
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Chrome className='mr-2 h-4 w-4' />
                    Sign in with Google
                  </>
                )}
              </Button>
            </TabsContent>
            <TabsContent value='phone' className='space-y-4'>
              <div id='recaptcha-container' className='hidden' />
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
                    Send Verification Code
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
                    Verify Code
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
          onOpenChange={setShowAdminPasskeyDialog}
          firebaseUser={pendingUser}
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
