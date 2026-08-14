'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  Package,
  ShoppingCart,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  LogIn,
  Bell,
  User,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/hooks/use-notifications';
import { useCart } from '@/hooks/use-cart';
import { Badge } from '@/components/ui/badge';

export function StorefrontTopBar() {
  const pathname = usePathname();
  const { user, logout, isAdmin, isStaff, viewMode, setViewMode } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const { cart } = useCart();
  const [mounted, setMounted] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const scrollTimer = useRef<number | null>(null);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

    const setNavHeight = (hidden: boolean) => {
      document.documentElement.style.setProperty(
        '--storefront-nav-h',
        hidden && isMobile() ? '0px' : '3rem'
      );
    };

    setNavHeight(false);

    const onScroll = () => {
      if (!isMobile()) {
        setNavHidden(false);
        setNavHeight(false);
        return;
      }
      setNavHidden(true);
      setNavHeight(true);
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(() => {
        setNavHidden(false);
        setNavHeight(false);
      }, 220);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
      document.documentElement.style.setProperty('--storefront-nav-h', '3rem');
    };
  }, []);

  const showClientRoutes = (!isAdmin && !isStaff) || viewMode === 'client';
  const showAdminRoutes = isAdmin && viewMode === 'admin';
  const showStaffRoutes = isStaff && viewMode === 'staff';

  const routes = [
    { name: 'Inventory', path: '/inventory', icon: Package, show: true },
    { name: 'My Cart', path: '/cart', icon: ShoppingCart, show: showClientRoutes },
    {
      name: 'My Orders',
      path: '/orders',
      icon: ClipboardList,
      show: showClientRoutes,
    },
    {
      name: 'Admin Dashboard',
      path: '/admin',
      icon: LayoutDashboard,
      show: showAdminRoutes,
    },
    {
      name: 'Staff Dashboard',
      path: '/staff',
      icon: LayoutDashboard,
      show: showStaffRoutes,
    },
  ];

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-background transition-transform duration-200 ease-out md:translate-y-0 ${
        navHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className='flex h-12 items-center gap-2 px-4 md:px-6'>
        <Link
          href='/inventory'
          className='flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden'
        >
          <span className='relative h-9 w-9 shrink-0 overflow-hidden rounded-md'>
            <Image
              src='/images/LeetoniaWholesaleLogo.jpg'
              alt=''
              fill
              className='object-contain'
              priority
            />
          </span>
          <span className='truncate font-serif text-base font-bold text-primary sm:text-lg'>
            Leetonia Wholesale
          </span>
        </Link>

        <div className='flex shrink-0 items-center gap-1'>
          <Link
            href='/cart'
            aria-label={
              cartCount > 0 ? `Open cart, ${cartCount} items` : 'Open cart'
            }
            className='relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent'
          >
            <ShoppingCart className='h-5 w-5' />
            {cartCount > 0 && (
              <span className='absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground'>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-10 w-10 shrink-0'
                  aria-label='Open menu'
                >
                  <Menu className='h-5 w-5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-52'>
                {user && (
                  <>
                    <DropdownMenuLabel className='font-normal'>
                      <p className='truncate text-sm font-medium'>
                        {user.name || 'User'}
                      </p>
                      <p className='truncate text-xs font-normal text-muted-foreground'>
                        {user.email || user.phone || '—'}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                {routes
                  .filter((r) => r.show)
                  .map((route) => (
                    <DropdownMenuItem key={route.path} asChild>
                      <Link
                        href={route.path}
                        className={
                          pathname === route.path ? 'font-medium' : undefined
                        }
                      >
                        <route.icon />
                        {route.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                {user && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href='/notifications'>
                        <Bell />
                        Notifications
                        {unreadCount > 0 && (
                          <Badge
                            variant='destructive'
                            className='ml-auto h-5 min-w-5 px-1 text-xs'
                          >
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href='/profile'>
                        <User />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        setViewMode(viewMode === 'admin' ? 'client' : 'admin')
                      }
                    >
                      {viewMode === 'admin'
                        ? 'Switch to client view'
                        : 'Switch to admin view'}
                    </DropdownMenuItem>
                  </>
                )}
                {isStaff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        setViewMode(viewMode === 'staff' ? 'client' : 'staff')
                      }
                    >
                      {viewMode === 'staff'
                        ? 'Switch to client view'
                        : 'Switch to staff view'}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {user ? (
                  <DropdownMenuItem variant='destructive' onSelect={() => logout()}>
                    <LogOut />
                    Log out
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href='/login'>
                      <LogIn />
                      Log in / Sign up
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className='h-10 w-10' aria-hidden />
          )}
        </div>
      </div>
    </header>
  );
}
