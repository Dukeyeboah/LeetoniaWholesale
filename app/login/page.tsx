'use client';

import type React from 'react';
import Image from 'next/image';

import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type UserCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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
import type { User } from '@/types';
import { AdminPasskeyDialog } from '@/components/admin-passkey-dialog';
import { isAdminEmail } from '@/lib/admin-config';
import { useState, useEffect } from 'react';

export default function LoginPage() {
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

  // Initialize reCAPTCHA for phone auth
  const setupRecaptcha = () => {
    if (typeof window === 'undefined' || !auth) return null;

    // Clear any existing recaptcha
    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (recaptchaContainer) {
      recaptchaContainer.innerHTML = '';
    }

    const recaptchaVerifier = new RecaptchaVerifier(
      auth,
      'recaptcha-container',
      {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        },
      }
    );

    return recaptchaVerifier;
  };

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
        email,
        password
      );
      await ensureUserProfile(userCredential.user);
    } catch (err: any) {
      let errorMessage = 'Failed to login. Please check your credentials.';
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
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

  const handleGoogleLogin = async () => {
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
      await ensureUserProfile(userCredential.user);
    } catch (err: any) {
      let errorMessage = 'Failed to sign in with Google.';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed.';
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

    if (!auth || !db) {
      setError(
        'Authentication service unavailable. Please check your Firebase configuration.'
      );
      setPhoneLoading(false);
      return;
    }

    // Format phone number for Ghana (+233)
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '+233' + formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('233')) {
        formattedPhone = '+' + formattedPhone;
      } else {
        formattedPhone = '+233' + formattedPhone;
      }
    }

    // Validate Ghana phone number
    if (!formattedPhone.match(/^\+233[0-9]{9}$/)) {
      setError(
        'Please enter a valid Ghana phone number (e.g., 0244123456 or +233244123456)'
      );
      setPhoneLoading(false);
      return;
    }

    try {
      const recaptchaVerifier = setupRecaptcha();
      if (!recaptchaVerifier) {
        setError('Failed to initialize reCAPTCHA. Please refresh the page.');
        setPhoneLoading(false);
        return;
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );
      setConfirmationResult(confirmation);
      setError('');
    } catch (err: any) {
      let errorMessage = 'Failed to send verification code.';
      if (err.code === 'auth/invalid-phone-number') {
        errorMessage = 'Invalid phone number format.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setPhoneLoading(false);
    }
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
      await ensureUserProfile(userCredential.user, phone);
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

  // Ensure user profile exists in Firestore
  const ensureUserProfile = async (firebaseUser: any, phoneNumber?: string) => {
    if (!db) return;

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      const email = firebaseUser.email || '';

      if (!userDoc.exists()) {
        // Check if email is in admin whitelist
        const shouldBeAdmin = isAdminEmail(email);

        // Create new user profile
        const newUser: User = {
          id: firebaseUser.uid,
          email: email,
          phone: phoneNumber || firebaseUser.phoneNumber || '',
          role: shouldBeAdmin ? 'admin' : 'client',
          name: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || undefined,
          createdAt: Date.now(),
        };

        // If admin email, don't set role yet - require passkey
        if (shouldBeAdmin) {
          const userWithoutRole = { ...newUser, role: 'client' as const };
          await setDoc(userDocRef, userWithoutRole);
          // Show passkey dialog
          setPendingUser(firebaseUser);
          setShowAdminPasskeyDialog(true);
          return;
        }

        await setDoc(userDocRef, newUser);
        router.push('/inventory');
      } else {
        const userData = userDoc.data() as User;

        // If user is admin email but not admin role, show passkey dialog
        if (isAdminEmail(email) && userData.role !== 'admin') {
          setPendingUser(firebaseUser);
          setShowAdminPasskeyDialog(true);
          return;
        }

        // Update phone if provided and not already set
        if (phoneNumber && !userData.phone) {
          await setDoc(userDocRef, { phone: phoneNumber }, { merge: true });
        }

        router.push('/inventory');
      }
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      // Don't block login if profile creation fails
      router.push('/inventory');
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
            Sign in to access the ordering system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue='email' className='w-full'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='email'>
                <Mail className='h-4 w-4 mr-2' />
                Email
              </TabsTrigger>
              <TabsTrigger value='phone'>
                <Phone className='h-4 w-4 mr-2' />
                Phone
              </TabsTrigger>
              <TabsTrigger value='google'>
                <Chrome className='h-4 w-4 mr-2' />
                Google
              </TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant='destructive' className='mt-4'>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value='email' className='space-y-4 mt-4'>
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
                  Sign In with Email
                </Button>
              </form>
            </TabsContent>

            <TabsContent value='phone' className='space-y-4 mt-4'>
              {!confirmationResult ? (
                <form onSubmit={handlePhoneSendCode} className='space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='phone'>Phone Number (Ghana)</Label>
                    <Input
                      id='phone'
                      type='tel'
                      placeholder='0244123456 or +233244123456'
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
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
                    disabled={phoneLoading}
                  >
                    {phoneLoading ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : null}
                    Send Verification Code
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
                    Verify Code
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
                    Use Different Number
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value='google' className='space-y-4 mt-4'>
              <Button
                onClick={handleGoogleLogin}
                className='w-full'
                disabled={loading}
                variant='outline'
              >
                {loading ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <Chrome className='mr-2 h-4 w-4' />
                )}
                Sign In with Google
              </Button>
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
