'use client';

import {
  usePathname,
  useSearchParams,
} from 'next/navigation';
import {
  Suspense,
  useEffect,
  useRef,
} from 'react';

function MetaPixelPageViewInner() {
  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  const lastTrackedPathRef =
    useRef('');

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const query =
      searchParams.toString();

    const pagePath =
      query
        ? `${pathname}?${query}`
        : pathname;

    if (
      lastTrackedPathRef.current ===
      pagePath
    ) {
      return;
    }

    const fbq = (
      window as typeof window & {
        fbq?: (
          ...args: unknown[]
        ) => void;
      }
    ).fbq;

    if (
      typeof fbq !==
      'function'
    ) {
      return;
    }

    fbq(
      'track',
      'PageView',
    );

    lastTrackedPathRef.current =
      pagePath;
  }, [
    pathname,
    searchParams,
  ]);

  return null;
}

export default function MetaPixelPageView() {
  return (
    <Suspense fallback={null}>
      <MetaPixelPageViewInner />
    </Suspense>
  );
}