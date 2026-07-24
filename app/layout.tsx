import type { Metadata } from 'next';

import './globals.css';

import { AppShell } from '@/components/AppShell';
import FooterWrapper from '@/components/FooterWrapper';
import ProfileCompletionGate from '@/components/ProfileCompletionGate';

export const metadata: Metadata = {
  title: 'SPOTC — Namma Area, Namma Kadai',
  description: 'Local offers, products and spots.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ProfileCompletionGate>
          <AppShell>{children}</AppShell>
          <FooterWrapper />
        </ProfileCompletionGate>
      </body>
    </html>
  );
}