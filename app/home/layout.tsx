import type { ReactNode } from 'react';
import { StorefrontChrome } from '@/components/storefront-chrome';

export default function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
