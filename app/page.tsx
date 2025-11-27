'use client';

import Image from 'next/image';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, useSidebar } from '@/components/sidebar-context';

function HomeContent() {
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
          <div className='flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8'>
            <div className='relative h-32 w-32 md:h-40 md:w-40'>
              <Image
                src='/images/LeetoniaWholesaleLogo.jpg'
                alt='Leetonia Wholesale'
                fill
                className='object-contain'
                priority
              />
            </div>
            <div className='space-y-2'>
              <h1 className='text-3xl md:text-4xl font-serif font-bold text-foreground'>
                Leetonia Wholesale
              </h1>
              <p className='text-muted-foreground text-lg'>
                Accra's premier wholesale pharmacy ordering system.
              </p>
            </div>
            <div className='pt-4'>
              <a href='/inventory'>
                <button className='px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors'>
                  Browse Inventory
                </button>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <SidebarProvider>
      <HomeContent />
    </SidebarProvider>
  );
}
