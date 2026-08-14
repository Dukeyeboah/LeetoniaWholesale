import { StorefrontChrome } from '@/components/storefront-chrome';

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
