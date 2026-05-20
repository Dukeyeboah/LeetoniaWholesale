'use client';

import { Loader2 } from 'lucide-react';

type Props = {
  title: string;
  subtitle?: string;
  className?: string;
};

export function AdminLoadingPanel({ title, subtitle, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 px-4 ${className ?? ''}`}
    >
      <Loader2 className='h-9 w-9 animate-spin text-primary' aria-hidden />
      <p className='text-sm font-medium text-center'>{title}</p>
      {subtitle ? (
        <p className='text-sm text-muted-foreground text-center max-w-md animate-pulse'>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
