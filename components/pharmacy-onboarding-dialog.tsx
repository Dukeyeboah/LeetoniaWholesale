'use client';

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
  SEED_PHARMACIES,
  ensurePharmacyDocument,
  getSeedPharmacy,
  slugifyForCustomPharmacyId,
} from '@/lib/pharmacies';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onComplete: () => void;
};

export function PharmacyOnboardingDialog({ open, onComplete }: Props) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [jobRole, setJobRole] = useState('');
  const [pharmacySource, setPharmacySource] = useState<'list' | 'other'>(
    'list'
  );
  const [selectedId, setSelectedId] = useState<string>(SEED_PHARMACIES[0]!.id);
  const [customPharmacyName, setCustomPharmacyName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;

    const trimmedName = name.trim();
    const trimmedRole = jobRole.trim();
    if (!trimmedName || !trimmedRole) {
      toast.error('Please enter your name and role.');
      return;
    }

    let pharmacyId: string;
    let pharmacyName: string;

    if (pharmacySource === 'list') {
      const seed = getSeedPharmacy(selectedId);
      if (!seed) {
        toast.error('Select a pharmacy.');
        return;
      }
      pharmacyId = seed.id;
      pharmacyName = seed.name;
    } else {
      const custom = customPharmacyName.trim();
      if (!custom) {
        toast.error('Enter your pharmacy name or pick one from the list.');
        return;
      }
      const slug = slugifyForCustomPharmacyId(custom);
      pharmacyId = `custom_${slug}_${user.id.slice(0, 8)}`;
      pharmacyName = custom;
    }

    setSaving(true);
    try {
      await ensurePharmacyDocument(db, pharmacyId, pharmacyName, {
        isCustom: pharmacySource === 'other',
      });

      await setDoc(
        doc(db, 'users', user.id),
        {
          name: trimmedName,
          jobRole: trimmedRole,
          pharmacyId,
          pharmacyName,
          pharmacyProfileComplete: true,
        },
        { merge: true }
      );

      await refreshUser();
      toast.success('Profile saved. Welcome!');
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error('Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className='sm:max-w-md'
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Tell us about you</DialogTitle>
            <DialogDescription>
              Wholesale orders are tied to your pharmacy. Add your details so we
              can label orders and track monthly limits correctly.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='onboard-name'>Full name</Label>
              <Input
                id='onboard-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Your name'
                required
                autoComplete='name'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='onboard-role'>Your role</Label>
              <Input
                id='onboard-role'
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                placeholder='e.g. Pharmacist, Owner, Buyer'
                required
              />
            </div>
            <div className='grid gap-2'>
              <Label>Pharmacy</Label>
              <Select
                value={pharmacySource}
                onValueChange={(v) => setPharmacySource(v as 'list' | 'other')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='list'>Choose from list</SelectItem>
                  <SelectItem value='other'>My pharmacy is not listed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pharmacySource === 'list' ? (
              <div className='grid gap-2'>
                <Label htmlFor='onboard-pharmacy'>Pharmacy</Label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger id='onboard-pharmacy'>
                    <SelectValue placeholder='Select pharmacy' />
                  </SelectTrigger>
                  <SelectContent className='max-h-60'>
                    {SEED_PHARMACIES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className='grid gap-2'>
                <Label htmlFor='onboard-custom-pharmacy'>Pharmacy name</Label>
                <Input
                  id='onboard-custom-pharmacy'
                  value={customPharmacyName}
                  onChange={(e) => setCustomPharmacyName(e.target.value)}
                  placeholder='Enter pharmacy name'
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type='submit' disabled={saving} className='w-full sm:w-auto'>
              {saving ? 'Saving…' : 'Continue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
