import { StorefrontChrome } from '@/components/storefront-chrome';

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
