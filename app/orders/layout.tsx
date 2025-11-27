'use client';

import type React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
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

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
