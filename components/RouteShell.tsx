'use client';

import { usePathname } from 'next/navigation';

import { AppShell } from '@/components/AppShell';
import FooterWrapper from '@/components/FooterWrapper';
import ProfileCompletionGate from '@/components/ProfileCompletionGate';

export default function RouteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isDeliveryRoute =
    pathname === '/delivery' ||
    pathname.startsWith('/delivery/');

  if (isDeliveryRoute) {
    return <>{children}</>;
  }

  return (
    <ProfileCompletionGate>
      <AppShell>{children}</AppShell>
      <FooterWrapper />
    </ProfileCompletionGate>
  );
}