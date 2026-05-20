'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
  SEED_PHARMACIES,
  createPharmacyFromSignup,
  ensurePharmacyDocument,
  getSeedPharmacy,
} from '@/lib/pharmacies';
import { formatPharmacyPickerLabel } from '@/lib/pharmacy-display';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type PharmOption = {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
};

function seedOptionsSorted(): PharmOption[] {
  return [...SEED_PHARMACIES].map((s) => ({ id: s.id, name: s.name }));
}

function mergePharmacyOptions(fromDb: PharmOption[]): PharmOption[] {
  const seedMissing = SEED_PHARMACIES.filter(
    (s) => !fromDb.some((x) => x.id === s.id)
  ).map((s) => ({ id: s.id, name: s.name }));
  return [...fromDb, ...seedMissing];
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
  const [pharmacyOptions, setPharmacyOptions] = useState<PharmOption[]>(
    seedOptionsSorted
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => seedOptionsSorted()[0]?.id ?? ''
  );
  const [listSearch, setListSearch] = useState('');
  const [newPharmacyName, setNewPharmacyName] = useState('');
  const [pharmacyLocation, setPharmacyLocation] = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
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
            location: data.location ?? null,
            phone: data.phone ?? null,
          };
        });
        const merged = mergePharmacyOptions(fromDb).sort((a, b) =>
          formatPharmacyPickerLabel(a).localeCompare(
            formatPharmacyPickerLabel(b),
            undefined,
            { sensitivity: 'base' }
          )
        );
        setPharmacyOptions(merged);
        setSelectedId((prev) => {
          if (prev && merged.some((m) => m.id === prev)) return prev;
          return merged[0]?.id ?? '';
        });
      },
      (err) => {
        console.error('pharmacies list', err);
        toast.error(
          'Could not load pharmacies from the server; showing default list.'
        );
        const fallback = mergePharmacyOptions([]);
        setPharmacyOptions(fallback);
        setSelectedId((prev) =>
          prev && fallback.some((m) => m.id === prev)
            ? prev
            : fallback[0]?.id ?? ''
        );
      }
    );
    return () => unsub();
  }, []);

  const selectedOption = useMemo(
    () => pharmacyOptions.find((p) => p.id === selectedId),
    [pharmacyOptions, selectedId]
  );

  const filteredOptions = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return pharmacyOptions;
    return pharmacyOptions.filter((p) => {
      const label = formatPharmacyPickerLabel(p).toLowerCase();
      return label.includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [pharmacyOptions, listSearch]);

  useEffect(() => {
    if (pharmacySource !== 'list' || !selectedOption) return;
    setPharmacyLocation(selectedOption.location?.trim() || '');
    setPharmacyPhone(selectedOption.phone?.trim() || '');
  }, [pharmacySource, selectedOption?.id, selectedOption?.location, selectedOption?.phone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;

    const trimmedName = name.trim();
    const trimmedRole = jobRole.trim();
    const loc = pharmacyLocation.trim();
    const pharmPh = pharmacyPhone.trim();
    const contact = contactPhone.trim();

    if (!trimmedName || !trimmedRole) {
      toast.error('Please enter your name and role.');
      return;
    }
    if (!loc) {
      toast.error('Enter the pharmacy location.');
      return;
    }
    if (!pharmPh) {
      toast.error('Enter the pharmacy phone number.');
      return;
    }
    if (!contact) {
      toast.error('Enter your contact phone number.');
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
        const pharmRef = doc(db, 'pharmacies', pharmacyId);
        const pharmSnap = await getDoc(pharmRef);
        if (pharmSnap.exists()) {
          await setDoc(
            pharmRef,
            { location: loc, phone: pharmPh, updatedAt: Date.now() },
            { merge: true }
          );
        }
      } else {
        const added = newPharmacyName.trim();
        if (!added) {
          toast.error('Enter the pharmacy name.');
          return;
        }
        const created = await createPharmacyFromSignup(db, added, user.id, {
          location: loc,
          phone: pharmPh,
          customerBillingType: 'cash',
        });
        pharmacyId = created.pharmacyId;
        pharmacyName = created.pharmacyName;
      }

      await setDoc(
        doc(db, 'users', user.id),
        {
          name: trimmedName,
          jobRole: trimmedRole,
          phone: contact,
          pharmacyId,
          pharmacyName,
          pharmacyLocation: loc,
          pharmacyPhone: pharmPh,
          pharmacyProfileComplete: true,
        },
        { merge: true }
      );

      await refreshUser();
      toast.success('Profile saved. Welcome!');
      onComplete();
    } catch (err) {
      console.error(err);
      const msg =
        err && typeof err === 'object' && 'code' in err && err.code === 'permission-denied'
          ? 'Permission denied saving your profile. Ask an admin to deploy the latest Firestore rules.'
          : 'Could not save your profile. Please try again.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className='sm:max-w-md max-h-[90vh] overflow-y-auto'
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Set up your profile</DialogTitle>
            <DialogDescription>
              Wholesale orders are tied to your pharmacy. Enter your name and
              the pharmacy you represent.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='onboard-name'>Your name</Label>
              <Input
                id='onboard-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Full name'
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

            <div className='grid gap-3'>
              <Label>Pharmacy</Label>
              <RadioGroup
                value={pharmacySource}
                onValueChange={(v) => setPharmacySource(v as 'list' | 'add')}
                className='gap-3'
              >
                <div className='flex items-center gap-2'>
                  <RadioGroupItem value='list' id='pharm-source-list' />
                  <Label
                    htmlFor='pharm-source-list'
                    className='font-normal cursor-pointer'
                  >
                    Choose from list
                  </Label>
                </div>
                <div className='flex items-center gap-2'>
                  <RadioGroupItem value='add' id='pharm-source-add' />
                  <Label
                    htmlFor='pharm-source-add'
                    className='font-normal cursor-pointer'
                  >
                    Add new pharmacy
                  </Label>
                </div>
              </RadioGroup>

              {pharmacySource === 'list' ? (
                <div className='grid gap-3 pl-1 border-l-2 border-muted ml-1'>
                  <div className='grid gap-2'>
                    <Label htmlFor='onboard-search'>Find your pharmacy</Label>
                    <div className='relative'>
                      <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                      <Input
                        id='onboard-search'
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                        placeholder='Search by name, area, or phone…'
                        className='pl-9'
                        autoComplete='off'
                      />
                    </div>
                    <div
                      role='listbox'
                      aria-label='Pharmacy list'
                      className='max-h-56 overflow-y-auto overscroll-y-contain rounded-md border bg-background'
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {filteredOptions.length === 0 ? (
                        <p className='p-3 text-sm text-muted-foreground text-center'>
                          No pharmacy found.
                        </p>
                      ) : (
                        filteredOptions.map((p) => {
                          const label = formatPharmacyPickerLabel(p);
                          const isSelected = selectedId === p.id;
                          return (
                            <button
                              key={p.id}
                              type='button'
                              role='option'
                              aria-selected={isSelected}
                              className={cn(
                                'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0',
                                isSelected && 'bg-accent'
                              )}
                              onClick={() => setSelectedId(p.id)}
                            >
                              <Check
                                className={cn(
                                  'mt-0.5 h-4 w-4 shrink-0',
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <span className='truncate'>{label}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className='grid gap-3 pl-1 border-l-2 border-muted ml-1'>
                  <div className='grid gap-2'>
                    <Label htmlFor='onboard-add-pharmacy'>Pharmacy name</Label>
                    <Input
                      id='onboard-add-pharmacy'
                      value={newPharmacyName}
                      onChange={(e) => setNewPharmacyName(e.target.value)}
                      placeholder='Official pharmacy name'
                    />
                  </div>
                </div>
              )}

              <div className='grid gap-2'>
                <Label htmlFor='onboard-location'>Pharmacy location</Label>
                <Input
                  id='onboard-location'
                  value={pharmacyLocation}
                  onChange={(e) => setPharmacyLocation(e.target.value)}
                  placeholder='e.g. Madina, Accra, branch name'
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='onboard-pharm-phone'>Pharmacy phone</Label>
                <Input
                  id='onboard-pharm-phone'
                  type='tel'
                  value={pharmacyPhone}
                  onChange={(e) => setPharmacyPhone(e.target.value)}
                  placeholder='Pharmacy line (e.g. 0244…)'
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='onboard-contact-phone'>Your contact phone</Label>
                <Input
                  id='onboard-contact-phone'
                  type='tel'
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder='Number we can reach you on'
                  required
                  autoComplete='tel'
                />
              </div>
            </div>
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
