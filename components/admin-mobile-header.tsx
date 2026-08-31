'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/hooks/use-notifications';

export function AdminMobileHeader() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  return (
    <header className='md:hidden sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background pl-14 pr-3'>
      <p className='truncate font-serif text-base font-bold text-primary'>
        Admin
      </p>
      {user ? (
        <Link
          href='/notifications'
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          className='relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent'
        >
          <Bell className='h-5 w-5' />
          {unreadCount > 0 ? (
            <span className='absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white'>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Link>
      ) : null}
    </header>
  );
}
