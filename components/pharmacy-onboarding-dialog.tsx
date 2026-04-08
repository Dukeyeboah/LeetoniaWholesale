'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
  SEED_PHARMACIES,
  createPharmacyFromSignup,
  ensurePharmacyDocument,
  getSeedPharmacy,
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

type PharmOption = { id: string; name: string };

function seedOptionsSorted(): PharmOption[] {
  return [...SEED_PHARMACIES].map((s) => ({ id: s.id, name: s.name })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function mergePharmacyOptions(fromDb: PharmOption[]): PharmOption[] {
  const seedMissing = SEED_PHARMACIES.filter(
    (s) => !fromDb.some((x) => x.id === s.id)
  ).map((s) => ({ id: s.id, name: s.name }));
  return [...fromDb, ...seedMissing].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

type Props = {
  open: boolean;
  onComplete: () => void;
};

export function PharmacyOnboardingDialog({ open, onComplete }: Props) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [jobRole, setJobRole] = useState('');
  const [pharmacySource, setPharmacySource] = useState<'list' | 'add'>('list');
  /** Always seed from curated list so the UI works before/without Firestore. */
  const [pharmacyOptions, setPharmacyOptions] = useState<PharmOption[]>(
    seedOptionsSorted
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => seedOptionsSorted()[0]?.id ?? ''
  );
  const [newPharmacyName, setNewPharmacyName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      collection(db, 'pharmacies'),
      (snapshot) => {
        const fromDb: PharmOption[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: (typeof data.name === 'string' && data.name) || d.id,
          };
        });
        const merged = mergePharmacyOptions(fromDb);
        setPharmacyOptions(merged);
        setSelectedId((prev) => {
          if (prev && merged.some((m) => m.id === prev)) return prev;
          return merged[0]?.id ?? '';
        });
      },
      (err) => {
        console.error('pharmacies list', err);
        toast.error('Could not load pharmacies from the server; showing default list.');
        const fallback = seedOptionsSorted();
        setPharmacyOptions(fallback);
        setSelectedId((prev) =>
          prev && fallback.some((m) => m.id === prev)
            ? prev
            : fallback[0]?.id ?? ''
        );
      }
    );
    return () => unsub();
  }, [db]);

  const selectedLabel = useMemo(() => {
    const o = pharmacyOptions.find((p) => p.id === selectedId);
    return o?.name ?? '';
  }, [pharmacyOptions, selectedId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;

    const trimmedName = name.trim();
    const trimmedRole = jobRole.trim();
    if (!trimmedName || !trimmedRole) {
      toast.error('Please enter your name and role.');
      return;
    }

    setSaving(true);
    try {
      let pharmacyId: string;
      let pharmacyName: string;

      if (pharmacySource === 'list') {
        const fromList = pharmacyOptions.find((p) => p.id === selectedId);
        if (!fromList) {
          toast.error('Select a pharmacy.');
          return;
        }
        pharmacyId = selectedId;
        pharmacyName = fromList.name;
        const seed = getSeedPharmacy(selectedId);
        if (seed) {
          await ensurePharmacyDocument(db, pharmacyId, pharmacyName);
        }
      } else {
        const added = newPharmacyName.trim();
        if (!added) {
          toast.error('Enter the pharmacy name to add.');
          return;
        }
        const created = await createPharmacyFromSignup(db, added, user.id);
        pharmacyId = created.pharmacyId;
        pharmacyName = created.pharmacyName;
      }

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
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement;
          // Select dropdown is portaled outside dialog; don't steal/block those clicks.
          if (
            t.closest('[data-slot="select-content"]') ||
            t.closest('[data-radix-select-content]') ||
            t.closest('[data-radix-popper-content-wrapper]')
          ) {
            return;
          }
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement;
          if (
            t.closest('[data-slot="select-content"]') ||
            t.closest('[data-radix-select-content]') ||
            t.closest('[data-radix-popper-content-wrapper]')
          ) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className='sm:max-w-md max-h-[90vh] overflow-y-auto'
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Tell us about you</DialogTitle>
            <DialogDescription>
              Wholesale orders are tied to your pharmacy. Pick an existing
              pharmacy or add yours so a super admin can verify it later.
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
                onValueChange={(v) => setPharmacySource(v as 'list' | 'add')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className='z-[200] max-h-60'>
                  <SelectItem value='list'>Choose from list</SelectItem>
                  <SelectItem value='add'>Add pharmacy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pharmacySource === 'list' ? (
              <div className='grid gap-2'>
                <Label htmlFor='onboard-pharmacy'>Pharmacy</Label>
                <Select
                  value={selectedId || undefined}
                  onValueChange={setSelectedId}
                  disabled={pharmacyOptions.length === 0}
                >
                  <SelectTrigger id='onboard-pharmacy' className='w-full'>
                    <SelectValue placeholder='Select pharmacy' />
                  </SelectTrigger>
                  <SelectContent className='z-[200] max-h-60'>
                    {pharmacyOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLabel && (
                  <p className='text-xs text-muted-foreground'>
                    Selected: {selectedLabel}
                  </p>
                )}
              </div>
            ) : (
              <div className='grid gap-2'>
                <Label htmlFor='onboard-add-pharmacy'>Pharmacy name</Label>
                <Input
                  id='onboard-add-pharmacy'
                  value={newPharmacyName}
                  onChange={(e) => setNewPharmacyName(e.target.value)}
                  placeholder='Official pharmacy name'
                />
                <p className='text-xs text-muted-foreground'>
                  This will appear in the pharmacy list for review. You can place
                  orders once saved.
                </p>
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
