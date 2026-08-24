'use client';

import {
  PENDING_VERIFICATION_MESSAGE,
  REJECTED_AFFILIATION_MESSAGE,
  type ClientPharmacyAffiliation,
} from '@/lib/pharmacy-affiliation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  status: Extract<ClientPharmacyAffiliation, 'pending' | 'rejected'>;
  onAcknowledge: () => void;
};

export function PharmacyVerificationDialog({ status, onAcknowledge }: Props) {
  const pending = status === 'pending';

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className='sm:max-w-md'
      >
        <DialogHeader>
          <DialogTitle>
            {pending
              ? 'Account pending verification'
              : 'Affiliation not confirmed'}
          </DialogTitle>
          <DialogDescription>
            {pending
              ? PENDING_VERIFICATION_MESSAGE
              : REJECTED_AFFILIATION_MESSAGE}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type='button' className='w-full sm:w-auto' onClick={onAcknowledge}>
            I understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
