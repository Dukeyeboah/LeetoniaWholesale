'use client';

import type React from 'react';

import { AppSidebar } from '@/components/app-sidebar';
import { AdminMobileHeader } from '@/components/admin-mobile-header';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const { viewMode, setViewMode } = useAuth();
  const syncedAdminView = useRef(false);

  useEffect(() => {
    if (syncedAdminView.current || viewMode === 'admin') return;
    syncedAdminView.current = true;
    setViewMode('admin');
  }, [viewMode, setViewMode]);

  return (
    <div className='flex min-h-screen max-w-[100vw] overflow-x-clip bg-background'>
      <AppSidebar />
      <main
        className={`flex min-h-screen min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'
        }`}
      >
        <AdminMobileHeader />
        <div
          className={`w-full min-w-0 max-w-full flex-1 overflow-x-clip px-3 py-3 sm:px-4 sm:py-5 md:px-8 md:py-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
            isCollapsed ? '' : 'lg:container lg:max-w-6xl'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/inventory');
      }
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
