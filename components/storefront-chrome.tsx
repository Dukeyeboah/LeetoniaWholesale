'use client';

import type React from 'react';
import { Suspense } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { StorefrontTopBar } from '@/components/storefront-top-bar';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';
import { useAuth } from '@/lib/auth-context';

function StorefrontNavFallback() {
  return <header className='sticky top-0 z-40 h-12 w-full bg-background md:h-14' />;
}

function LayoutContent({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { isCollapsed } = useSidebar();
  const { isAdmin, isStaff, viewMode } = useAuth();
  const useStorefrontNav =
    (!isAdmin && !isStaff) || viewMode === 'client';

  if (useStorefrontNav) {
    return (
      <div className='flex min-h-screen flex-col bg-background'>
        <Suspense fallback={<StorefrontNavFallback />}>
          <StorefrontTopBar />
        </Suspense>
        <main className='w-full min-w-0 flex-1'>
          <div className='w-full px-4 pt-1 pb-2 md:px-8 md:pt-2 md:pb-4'>{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen bg-background'>
      <AppSidebar />
      <main
        className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:ml-20' : 'md:ml-64 lg:ml-72'
        }`}
      >
        <div
          className={`w-full px-4 py-8 md:px-8 md:py-10 mt-12 md:mt-0 ${
            wide || isCollapsed ? 'max-w-full' : 'container max-w-6xl'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export function StorefrontChrome({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <SidebarProvider>
      <LayoutContent wide={wide}>{children}</LayoutContent>
    </SidebarProvider>
  );
}
