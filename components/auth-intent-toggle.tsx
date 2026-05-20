'use client';

import { Button } from '@/components/ui/button';
import type { AuthIntent } from '@/lib/ensure-user-profile';

type Props = {
  value: AuthIntent;
  onChange: (intent: AuthIntent) => void;
  onClearError?: () => void;
  className?: string;
};

export function AuthIntentToggle({
  value,
  onChange,
  onClearError,
  className,
}: Props) {
  return (
    <div
      className={`flex rounded-lg border p-1 bg-muted/40 ${className ?? ''}`}
    >
      <Button
        type='button'
        variant={value === 'signin' ? 'secondary' : 'ghost'}
        className='flex-1'
        size='sm'
        onClick={() => {
          onChange('signin');
          onClearError?.();
        }}
      >
        Sign in
      </Button>
      <Button
        type='button'
        variant={value === 'signup' ? 'secondary' : 'ghost'}
        className='flex-1'
        size='sm'
        onClick={() => {
          onChange('signup');
          onClearError?.();
        }}
      >
        Create account
      </Button>
    </div>
  );
}
