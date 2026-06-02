'use client';

import type { Pharmacy } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  creditAvailableGHS,
  getCreditBalanceGHS,
  getCreditLimitGHS,
  pharmacyUsesCreditLine,
} from '@/lib/pharmacy-credit';

type Props = {
  pharmacy: Pharmacy;
  segment: 'cash' | 'credit';
  isAdmin: boolean;
  isSuperAdmin: boolean;
  onManage: (p: Pharmacy) => void;
  onVerify?: (p: Pharmacy) => void;
  onDelete?: (p: Pharmacy) => void;
};

export function AdminPharmacyMobileCard({
  pharmacy: p,
  segment,
  isAdmin,
  isSuperAdmin,
  onManage,
  onVerify,
  onDelete,
}: Props) {
  const isCredit = pharmacyUsesCreditLine(p);
  const cap = getCreditLimitGHS(p);
  const outstanding = getCreditBalanceGHS(p);
  const available = creditAvailableGHS(p);

  return (
    <div className='p-4 space-y-3 border-b last:border-0 min-w-0'>
      <div className='min-w-0'>
        <p className='font-medium break-words'>{p.name}</p>
        <p className='text-xs text-muted-foreground font-mono break-all'>
          {p.id}
        </p>
      </div>
      {segment === 'cash' ? (
        <dl className='grid grid-cols-2 gap-x-3 gap-y-1 text-sm'>
          <dt className='text-muted-foreground'>Location</dt>
          <dd className='text-right break-words'>{p.location ?? '—'}</dd>
          <dt className='text-muted-foreground'>Contact</dt>
          <dd className='text-right break-words'>{p.contactPerson ?? '—'}</dd>
          <dt className='text-muted-foreground'>Phone</dt>
          <dd className='text-right break-words'>{p.phone ?? '—'}</dd>
        </dl>
      ) : (
        <dl className='grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums'>
          <dt className='text-muted-foreground'>Billing</dt>
          <dd className='text-right'>{isCredit ? 'Credit' : 'Cash'}</dd>
          <dt className='text-muted-foreground'>Credit cap</dt>
          <dd className='text-right'>₵{cap.toFixed(2)}</dd>
          <dt className='text-muted-foreground'>Outstanding</dt>
          <dd className='text-right'>₵{outstanding.toFixed(2)}</dd>
          <dt className='text-muted-foreground'>Available</dt>
          <dd className='text-right'>₵{available.toFixed(2)}</dd>
        </dl>
      )}
      <div className='flex flex-wrap gap-2'>
        {p.pendingVerification === true ? (
          <Badge variant='outline'>Pending review</Badge>
        ) : (
          <Badge
            variant='outline'
            className='bg-emerald-50 text-emerald-800 border-emerald-200'
          >
            Verified
          </Badge>
        )}
        {segment === 'credit' && cap > 0 && outstanding > cap + 1e-6 && (
          <Badge variant='destructive'>Over limit</Badge>
        )}
      </div>
      <div className='flex flex-col gap-2'>
        {isAdmin && (
          <>
            <Button
              variant='default'
              size='sm'
              className='w-full'
              onClick={() => onManage(p)}
            >
              Manage
            </Button>
            {p.pendingVerification === true && onVerify && (
              <Button
                variant='secondary'
                size='sm'
                className='w-full'
                onClick={() => onVerify(p)}
              >
                Mark verified
              </Button>
            )}
          </>
        )}
        {isSuperAdmin && onDelete && (
          <Button
            variant='outline'
            size='sm'
            className='w-full text-destructive border-destructive/30 hover:bg-destructive/10'
            onClick={() => onDelete(p)}
          >
            <Trash2 className='mr-1 h-3.5 w-3.5' />
            Delete
          </Button>
        )}
        {!isAdmin && (
          <span className='text-xs text-muted-foreground text-center'>
            View only
          </span>
        )}
      </div>
    </div>
  );
}
