  'use client';

  import { usePathname } from 'next/navigation';
  import Footer from '@/components/Footer';

  export default function FooterWrapper() {
    const pathname = usePathname() || '';

    const hideFooter =
      pathname === '/dashboard' ||
      pathname.startsWith('/dashboard/') ||
      pathname === '/compare-online' ||
      pathname.startsWith('/compare-online/') ||
      pathname === '/order-success' ||
      pathname.startsWith('/order-success/');

    if (hideFooter) {
      return null;
    }

    return <Footer />;
  }