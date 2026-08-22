'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function RootPage() {
  const { user, loading, isAdmin, isStaff, viewMode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const customerHome =
      Boolean(user) && ((!isAdmin && !isStaff) || viewMode === 'client');
    router.replace(customerHome ? '/home' : '/inventory');
  }, [loading, user, isAdmin, isStaff, viewMode, router]);

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='h-8 w-8 animate-spin rounded-full border-b-2 border-primary' />
    </div>
  );
}
