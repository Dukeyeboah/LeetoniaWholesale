'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Package,
  ShoppingCart,
  ClipboardList,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  MoreHorizontal,
  LogOut,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-context';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Menu } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSidebar } from './sidebar-context';
import { useNotifications } from '@/hooks/use-notifications';
import { Badge } from '@/components/ui/badge';

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, isAdmin, isStaff, viewMode, setViewMode, hasPermission } = useAuth();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { unreadCount } = useNotifications(user?.id);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show client routes when in client view or not admin/staff
  const showClientRoutes = (!isAdmin && !isStaff) || viewMode === 'client';
  // Show admin routes when admin and in admin view
  const showAdminRoutes = isAdmin && viewMode === 'admin';
  // Show staff routes when staff
  const showStaffRoutes = isStaff && viewMode === 'staff';

  const routes = [
    {
      name: 'Inventory',
      path: '/inventory',
      icon: Package,
      show: true,
    },
    {
      name: 'My Cart',
      path: '/cart',
      icon: ShoppingCart,
      show: showClientRoutes,
    },
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

  const NavContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className='flex h-full flex-col gap-4'>
      <div
        className={`flex items-center border-b gap-3 ${
          collapsed ? 'px-3 py-4 justify-center' : 'px-6 py-4'
        }`}
      >
        <div className='relative h-10 w-10 flex-shrink-0'>
          <Image
            src='/images/LeetoniaWholesaleLogo.jpg'
            alt='Leetonia Wholesale'
            fill
            className='object-contain'
            priority
          />
        </div>
        {!collapsed && (
          <span className='text-lg font-serif font-bold text-primary truncate'>
            Leetonia Wholesale
          </span>
        )}
      </div>
      <div className='flex-1 px-4 py-4'>
        <nav className='grid gap-2'>
          {routes
            .filter((r) => r.show)
            .map((route) => {
              const isActive = pathname === route.path;
              return (
                <Link
                  key={route.path}
                  href={route.path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                  title={collapsed ? route.name : undefined}
                >
                  <route.icon className='h-4 w-4 flex-shrink-0' />
                  {!collapsed && <span>{route.name}</span>}
                </Link>
              );
            })}
          {user && (
            <Link
              href='/notifications'
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative ${
                collapsed ? 'justify-center' : ''
              } ${
                pathname === '/notifications'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              title={collapsed ? 'Notifications' : undefined}
            >
              <Bell className='h-4 w-4 flex-shrink-0' />
              {!collapsed && <span>Notifications</span>}
              {unreadCount > 0 && (
                <Badge
                  variant='destructive'
                  className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs'
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Link>
          )}
        </nav>
      </div>
      {user && (
        <div className='border-t p-4'>
          <div
            className={`mb-4 flex items-center gap-3 ${
              collapsed ? 'justify-center' : 'px-2'
            }`}
          >
            {collapsed ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-10 w-10 rounded-full relative'
                  >
                    <Avatar className='h-10 w-10'>
                      <AvatarImage
                        src={user.photoURL}
                        alt={user.name || user.email}
                      />
                      <AvatarFallback className='bg-secondary text-primary font-bold'>
                        {user.name?.charAt(0).toUpperCase() ||
                          user.email?.charAt(0).toUpperCase() ||
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <MoreHorizontal className='absolute -bottom-1 -right-1 h-3 w-3 bg-background rounded-full p-0.5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onClick={() => logout()}
                    variant='destructive'
                  >
                    <LogOut className='mr-2 h-4 w-4' />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Avatar className='h-8 w-8'>
                  <AvatarImage
                    src={user.photoURL}
                    alt={user.name || user.email}
                  />
                  <AvatarFallback className='bg-secondary text-primary font-bold'>
                    {user.name?.charAt(0).toUpperCase() ||
                      user.email?.charAt(0).toUpperCase() ||
                      'U'}
                  </AvatarFallback>
                </Avatar>
                <div className='overflow-hidden flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {user.name || 'User'}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {user.email}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' size='icon' className='h-8 w-8'>
                      <MoreVertical className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      onClick={() => logout()}
                      variant='destructive'
                    >
                      <LogOut className='mr-2 h-4 w-4' />
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {isAdmin && !collapsed && (
            <div className='mb-4 p-3 rounded-lg bg-secondary/50 border border-border/50'>
              <div className='flex items-center justify-between mb-2'>
                <Label
                  htmlFor='view-mode'
                  className='text-xs font-medium flex items-center gap-2'
                >
                  {viewMode === 'admin' ? (
                    <LayoutDashboard className='h-3 w-3' />
                  ) : (
                    <ShoppingCart className='h-3 w-3' />
                  )}
                  {viewMode === 'admin' ? 'Admin View' : 'Client View'}
                </Label>
                <Switch
                  id='view-mode'
                  checked={viewMode === 'admin'}
                  onCheckedChange={(checked) =>
                    setViewMode(checked ? 'admin' : 'client')
                  }
                />
              </div>
              <p className='text-[10px] text-muted-foreground'>
                Switch between admin and client interfaces
              </p>
            </div>
          )}
          {isStaff && !collapsed && (
            <div className='mb-4 p-3 rounded-lg bg-secondary/50 border border-border/50'>
              <div className='flex items-center justify-between mb-2'>
                <Label
                  htmlFor='staff-view-mode'
                  className='text-xs font-medium flex items-center gap-2'
                >
                  {viewMode === 'staff' ? (
                    <LayoutDashboard className='h-3 w-3' />
                  ) : (
                    <ShoppingCart className='h-3 w-3' />
                  )}
                  {viewMode === 'staff' ? 'Staff View' : 'Client View'}
                </Label>
                <Switch
                  id='staff-view-mode'
                  checked={viewMode === 'staff'}
                  onCheckedChange={(checked) =>
                    setViewMode(checked ? 'staff' : 'client')
                  }
                />
              </div>
              <p className='text-[10px] text-muted-foreground'>
                Switch between staff and client interfaces
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={`hidden border-r bg-sidebar md:block fixed inset-y-0 z-30 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64 lg:w-72'
        }`}
      >
        <NavContent collapsed={isCollapsed} />
        <Button
          variant='ghost'
          size='icon'
          className='absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-sm hover:bg-secondary z-10'
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronRight className='h-3 w-3' />
          ) : (
            <ChevronLeft className='h-3 w-3' />
          )}
        </Button>
      </div>

      {/* Mobile Sheet - only render after mount to avoid Radix ID hydration mismatch */}
      {mounted ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='md:hidden fixed top-4 left-4 z-40 bg-background/80 backdrop-blur border shadow-sm'
            >
              <Menu className='h-5 w-5' />
              <span className='sr-only'>Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side='left' className='p-0 w-72'>
            <SheetTitle className='sr-only'>Navigation Menu</SheetTitle>
            <NavContent />
          </SheetContent>
        </Sheet>
      ) : (
        <div
          className='md:hidden fixed top-4 left-4 z-40 h-10 w-10 rounded-md border border-transparent'
          aria-hidden
        />
      )}
    </>
  );
}
