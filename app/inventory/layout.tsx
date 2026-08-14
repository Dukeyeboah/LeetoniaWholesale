import { StorefrontChrome } from '@/components/storefront-chrome';

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontChrome wide>{children}</StorefrontChrome>;
}
