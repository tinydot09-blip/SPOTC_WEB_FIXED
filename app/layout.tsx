import type { Metadata } from 'next';
import './globals.css';

import { AppShell } from '@/components/AppShell';
import FooterWrapper from '@/components/FooterWrapper';

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
        <AppShell>{children}</AppShell>
        <FooterWrapper />
      </body>
    </html>
  );
}