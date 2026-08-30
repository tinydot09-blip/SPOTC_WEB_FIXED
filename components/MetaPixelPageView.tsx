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

  const firstLoad =
    useRef(true);

  const lastPath =
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

    const currentPath =
      query
        ? `${pathname}?${query}`
        : pathname;

    /*
     * First PageView is already fired
     * from app/layout.tsx.
     *
     * This component tracks only
     * Next.js client-side navigation.
     */
    if (firstLoad.current) {
      firstLoad.current =
        false;

      lastPath.current =
        currentPath;

      return;
    }

    if (
      lastPath.current ===
      currentPath
    ) {
      return;
    }

    const sendPageView = () => {
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
        return false;
      }

      fbq(
        'track',
        'PageView',
      );

      lastPath.current =
        currentPath;

      return true;
    };

    /*
     * In most cases Meta Pixel
     * is already available.
     */
    if (sendPageView()) {
      return;
    }

    /*
     * If the external Meta script
     * is still loading, retry briefly
     * instead of losing the event.
     */
    let attempts = 0;

    const timer =
      window.setInterval(
        () => {
          attempts += 1;

          if (
            sendPageView() ||
            attempts >= 20
          ) {
            window.clearInterval(
              timer,
            );
          }
        },
        250,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
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