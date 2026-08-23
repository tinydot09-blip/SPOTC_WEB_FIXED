'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const GA_MEASUREMENT_ID = 'G-YLJ3YNCN2C';

function GoogleAnalyticsPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const gtag = (
      window as typeof window & {
        gtag?: (...args: unknown[]) => void;
      }
    ).gtag;

    if (typeof gtag !== 'function') return;

    const query = searchParams.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;

    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pagePath,
      send_to: GA_MEASUREMENT_ID,
    });
  }, [pathname, searchParams]);

  return null;
}

export default function GoogleAnalyticsPageView() {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsPageViewInner />
    </Suspense>
  );
}