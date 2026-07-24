'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function FooterWrapper() {
  const pathname = usePathname();

  const hideFooter =
    pathname.startsWith('/offers') ||
    pathname.startsWith('/spots') ||
    pathname.startsWith('/circle/');

  if (hideFooter) {
    return null;
  }

  return <Footer />;
}