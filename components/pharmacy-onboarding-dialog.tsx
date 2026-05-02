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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Check, ChevronsUpDown } from 'lucide-react';
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newPharmacyName, setNewPharmacyName] = useState('');
  const [newPharmacyLocation, setNewPharmacyLocation] = useState('');
  const [newPharmacyPhone, setNewPharmacyPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCashSyncHint, setShowCashSyncHint] = useState(false);

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
        const hasCashImport = snapshot.docs.some(
          (d) => d.data().source === 'cash_import'
        );
        setShowCashSyncHint(!hasCashImport && snapshot.size < 500);
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
        setShowCashSyncHint(true);
      }
    );
    return () => unsub();
  }, []);

  const selectedOption = useMemo(
    () => pharmacyOptions.find((p) => p.id === selectedId),
    [pharmacyOptions, selectedId]
  );

  const selectedLabel = selectedOption
    ? formatPharmacyPickerLabel(selectedOption)
    : '';

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
        const loc = newPharmacyLocation.trim();
        const ph = newPharmacyPhone.trim();
        if (!loc) {
          toast.error('Enter the pharmacy location (area or branch).');
          return;
        }
        if (!ph) {
          toast.error('Enter the pharmacy phone number.');
          return;
        }
        const created = await createPharmacyFromSignup(db, added, user.id, {
          location: loc,
          phone: ph,
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
          if (
            t.closest('[data-slot="select-content"]') ||
            t.closest('[data-radix-select-content]') ||
            t.closest('[data-radix-popper-content-wrapper]') ||
            t.closest('[data-slot="popover-content"]')
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
            t.closest('[data-radix-popper-content-wrapper]') ||
            t.closest('[data-slot="popover-content"]')
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
              Wholesale orders are tied to your pharmacy. Search the cash
              customer list, or add a new pharmacy (location and phone required)
              so a super admin can verify it.
            </DialogDescription>
          </DialogHeader>

          <div className='grid gap-4 py-4'>
            {showCashSyncHint && (
              <Alert>
                <AlertDescription className='text-sm'>
                  The full cash-customer directory may not be loaded yet. An
                  admin should run{' '}
                  <code className='text-xs bg-muted px-1 rounded'>
                    pnpm sync:cash-pharmacies
                  </code>{' '}
                  once (uses <code className='text-xs bg-muted px-1 rounded'>data/cash-customers.json</code>
                  ) to import every row into Firestore.
                </AlertDescription>
              </Alert>
            )}

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
                  <SelectItem value='add'>Add new pharmacy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pharmacySource === 'list' ? (
              <div className='grid gap-2'>
                <Label>Search pharmacy</Label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      role='combobox'
                      aria-expanded={pickerOpen}
                      className='w-full justify-between font-normal'
                      disabled={pharmacyOptions.length === 0}
                    >
                      <span className='truncate text-left'>
                        {selectedLabel || 'Select pharmacy…'}
                      </span>
                      <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className='w-[var(--radix-popover-trigger-width)] p-0 z-[250]'
                    align='start'
                  >
                    <Command>
                      <CommandInput placeholder='Search name, area, phone…' />
                      <CommandList className='max-h-72'>
                        <CommandEmpty>No pharmacy found.</CommandEmpty>
                        <CommandGroup>
                          {pharmacyOptions.map((p) => {
                            const label = formatPharmacyPickerLabel(p);
                            return (
                              <CommandItem
                                key={p.id}
                                value={`${label} ${p.id}`}
                                onSelect={() => {
                                  setSelectedId(p.id);
                                  setPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedId === p.id
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                <span className='truncate'>{label}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedLabel && (
                  <p className='text-xs text-muted-foreground'>
                    Selected: {selectedLabel}
                  </p>
                )}
              </div>
            ) : (
              <div className='grid gap-3'>
                <div className='grid gap-2'>
                  <Label htmlFor='onboard-add-pharmacy'>Pharmacy name</Label>
                  <Input
                    id='onboard-add-pharmacy'
                    value={newPharmacyName}
                    onChange={(e) => setNewPharmacyName(e.target.value)}
                    placeholder='Official pharmacy name'
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='onboard-add-location'>Location</Label>
                  <Input
                    id='onboard-add-location'
                    value={newPharmacyLocation}
                    onChange={(e) => setNewPharmacyLocation(e.target.value)}
                    placeholder='e.g. Madina, Accra, branch name'
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='onboard-add-phone'>Phone number</Label>
                  <Input
                    id='onboard-add-phone'
                    type='tel'
                    value={newPharmacyPhone}
                    onChange={(e) => setNewPharmacyPhone(e.target.value)}
                    placeholder='e.g. 0244… or +233…'
                  />
                </div>
                <p className='text-xs text-muted-foreground'>
                  New entries are saved as cash customers, appear in this list
                  for others, and stay pending until a super admin verifies them.
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
