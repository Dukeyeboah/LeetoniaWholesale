import { StorefrontChrome } from '@/components/storefront-chrome';

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
