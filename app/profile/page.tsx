'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, updateDoc, type UpdateData } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { omitUndefinedFields } from '@/lib/firestore-sanitize';
import { inferSignInProvider, type SignInProvider } from '@/lib/auth-providers';
import {
  normalizeGhanaPhoneToE164,
  isValidGhanaE164,
} from '@/lib/ghana-phone';
import { ArrowLeft, User } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function providerLabel(p: SignInProvider): string {
  switch (p) {
    case 'phone':
      return 'Phone';
    case 'google':
      return 'Google';
    default:
      return 'Email & password';
  }
}

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const provider: SignInProvider =
    user?.signInProvider ??
    (auth?.currentUser ? inferSignInProvider(auth.currentUser) : 'email');

  const canEditEmail = provider === 'phone';
  const canEditPhone = provider === 'email' || provider === 'google';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setJobRole(user.jobRole || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
  }, [user]);

  const handleSave = async () => {
    if (!db || !user) return;
    const nameTrim = name.trim();
    const jobTrim = jobRole.trim();
    const emailTrim = email.trim().toLowerCase();

    if (canEditEmail) {
      if (!emailTrim) {
        toast.error('Add an email so we can reach you (invoices and updates).');
        return;
      }
      if (!EMAIL_RE.test(emailTrim)) {
        toast.error('Please enter a valid email address.');
        return;
      }
    }

    let phoneOut = phone.trim();
    if (canEditPhone && phoneOut) {
      phoneOut = normalizeGhanaPhoneToE164(phoneOut);
      if (!isValidGhanaE164(phoneOut)) {
        toast.error(
          'Please enter a valid Ghana phone number (e.g. 020… or +233…).'
        );
        return;
      }
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name: nameTrim,
        jobRole: jobTrim,
      };
      if (canEditEmail) {
        patch.email = emailTrim;
      }
      if (canEditPhone) {
        patch.phone = phoneOut ? phoneOut : '';
      }

      await updateDoc(
        doc(db, 'users', user.id),
        omitUndefinedFields(patch) as UpdateData<Record<string, unknown>>
      );
      await refreshUser();
      toast.success('Profile updated');
    } catch (e) {
      console.error(e);
      toast.error('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className='text-sm text-muted-foreground py-12'>Loading…</div>
    );
  }

  return (
    <div className='space-y-8 max-w-xl'>
      <div className='flex items-center gap-4'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/inventory'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back
          </Link>
        </Button>
        <div className='flex items-center gap-2'>
          <User className='h-8 w-8 text-primary' />
          <h1 className='text-2xl font-serif font-bold text-primary'>
            Your profile
          </h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            Signed in with <strong>{providerLabel(provider)}</strong>.
            {canEditEmail &&
              ' You can add or update your email; your sign-in phone number is fixed.'}
            {canEditPhone &&
              ' You can update your contact phone; your sign-in email is fixed.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='profile-name'>Name</Label>
            <Input
              id='profile-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Your name'
              autoComplete='name'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='profile-job'>Job role (optional)</Label>
            <Input
              id='profile-job'
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder='e.g. Pharmacist, Owner'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='profile-email'>Email</Label>
            <Input
              id='profile-email'
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!canEditEmail}
              placeholder={canEditEmail ? 'name@example.com' : ''}
              className={!canEditEmail ? 'bg-muted' : ''}
            />
            {!canEditEmail && (
              <p className='text-xs text-muted-foreground'>
                This address is tied to your {providerLabel(provider)} account
                and cannot be changed here.
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='profile-phone'>Phone</Label>
            <Input
              id='profile-phone'
              type='tel'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                if (!canEditPhone || !phone.trim()) return;
                const n = normalizeGhanaPhoneToE164(phone);
                if (n !== phone) setPhone(n);
              }}
              disabled={!canEditPhone}
              placeholder={
                canEditPhone ? '+233243569981' : 'Sign-in phone (fixed)'
              }
              className={!canEditPhone ? 'bg-muted' : ''}
            />
            {!canEditPhone && (
              <p className='text-xs text-muted-foreground'>
                You sign in with this number. To use a different number, create
                a new account or contact support.
              </p>
            )}
          </div>

          {user.pharmacyName && (
            <div className='rounded-md border bg-muted/30 px-3 py-2 text-sm'>
              <p className='font-medium'>Pharmacy</p>
              <p className='text-muted-foreground'>{user.pharmacyName}</p>
              <p className='text-xs text-muted-foreground mt-1'>
                To change pharmacy affiliation, contact Leetonia Wholesale.
              </p>
            </div>
          )}

          <Button
            className='w-full sm:w-auto'
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
