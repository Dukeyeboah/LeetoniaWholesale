'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, updateDoc, type UpdateData } from 'firebase/firestore';
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
  const [pharmacyLocation, setPharmacyLocation] = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');
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
    setPharmacyLocation(user.pharmacyLocation || '');
    setPharmacyPhone(user.pharmacyPhone || '');
  }, [user]);

  const handleSave = async () => {
    if (!db || !user) return;
    const nameTrim = name.trim();
    const jobTrim = jobRole.trim();
    const emailTrim = email.trim().toLowerCase();
    const locTrim = pharmacyLocation.trim();
    const pharmPhTrim = pharmacyPhone.trim();

    if (!nameTrim) {
      toast.error('Please enter your name.');
      return;
    }
    if (!jobTrim) {
      toast.error('Please enter your role.');
      return;
    }
    if (!locTrim) {
      toast.error('Please enter your pharmacy location.');
      return;
    }
    if (!pharmPhTrim) {
      toast.error('Please enter your pharmacy phone.');
      return;
    }

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
    if (!phoneOut) {
      toast.error('Please enter your contact phone number.');
      return;
    }

    const normalizedPharmPhone = normalizeGhanaPhoneToE164(pharmPhTrim);
    if (!isValidGhanaE164(normalizedPharmPhone)) {
      toast.error('Please enter a valid pharmacy phone number.');
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name: nameTrim,
        jobRole: jobTrim,
        pharmacyLocation: locTrim,
        pharmacyPhone: normalizedPharmPhone,
        phone: phoneOut,
      };
      if (canEditEmail) {
        patch.email = emailTrim;
      }

      await updateDoc(
        doc(db, 'users', user.id),
        omitUndefinedFields(patch) as UpdateData<Record<string, unknown>>
      );

      if (user.pharmacyId) {
        const pharmRef = doc(db, 'pharmacies', user.pharmacyId);
        const pharmSnap = await getDoc(pharmRef);
        if (pharmSnap.exists()) {
          await setDoc(
            pharmRef,
            {
              location: locTrim,
              phone: normalizedPharmPhone,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
      }

      await refreshUser();
      toast.success('Profile updated');
    } catch (e) {
      console.error(e);
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: string }).code)
          : '';
      toast.error(
        code === 'permission-denied'
          ? 'Could not save — Firestore rules may need to be deployed.'
          : 'Could not save profile. Please try again.'
      );
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
    <div className='mx-auto max-w-xl space-y-6'>
      <div className='text-center'>
        <h1 className='font-serif text-2xl font-bold text-primary'>Account</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Your pharmacy profile and contact details
        </p>
      </div>

      <Card>
        <CardHeader className='text-center'>
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
            <Label htmlFor='profile-name'>Your name</Label>
            <Input
              id='profile-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Full name'
              autoComplete='name'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='profile-job'>Your role</Label>
            <Input
              id='profile-job'
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder='e.g. Pharmacist, Owner, Buyer'
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
            <Label htmlFor='profile-phone'>Your contact phone</Label>
            <Input
              id='profile-phone'
              type='tel'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                if (!phone.trim()) return;
                const n = normalizeGhanaPhoneToE164(phone);
                if (n !== phone) setPhone(n);
              }}
              placeholder='+233243569981'
              autoComplete='tel'
            />
            <p className='text-xs text-muted-foreground'>
              Number we can reach you on for orders and updates.
            </p>
          </div>

          <div className='rounded-md border bg-muted/30 px-3 py-3 space-y-4'>
            <div>
              <p className='text-sm font-medium'>Pharmacy</p>
              <p className='text-sm text-muted-foreground'>
                {user.pharmacyName || 'Not set'}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                To change which pharmacy you are linked to, contact Leetonia
                Wholesale.
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='profile-pharm-location'>Pharmacy location</Label>
              <Input
                id='profile-pharm-location'
                value={pharmacyLocation}
                onChange={(e) => setPharmacyLocation(e.target.value)}
                placeholder='e.g. Madina, Accra'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='profile-pharm-phone'>Pharmacy phone</Label>
              <Input
                id='profile-pharm-phone'
                type='tel'
                value={pharmacyPhone}
                onChange={(e) => setPharmacyPhone(e.target.value)}
                onBlur={() => {
                  if (!pharmacyPhone.trim()) return;
                  const n = normalizeGhanaPhoneToE164(pharmacyPhone);
                  if (n !== pharmacyPhone) setPharmacyPhone(n);
                }}
                placeholder='Pharmacy business line'
              />
            </div>
          </div>

          <div className='flex justify-center pt-2'>
          <Button
            className='w-full sm:w-auto'
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
