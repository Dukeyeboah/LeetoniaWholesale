'use client';

import type React from 'react';

import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className='flex min-h-screen bg-background'>
      <AppSidebar />
      <main
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'
        }`}
      >
        <div
          className={`w-full py-8 md:py-10 px-4 md:px-8 mt-12 md:mt-0 ${
            isCollapsed ? 'max-w-full' : 'container max-w-6xl'
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
