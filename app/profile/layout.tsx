import { StorefrontChrome } from '@/components/storefront-chrome';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
