'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

const GA_MEASUREMENT_ID = 'G-YLJ3YNCN2C';

function GoogleAnalyticsPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef('');

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

    // Prevent duplicate page_view events for the same Next.js route.
    if (lastTrackedPathRef.current === pagePath) return;

    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pagePath,
      send_to: GA_MEASUREMENT_ID,
    });

    lastTrackedPathRef.current = pagePath;
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