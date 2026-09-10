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

const GA_MEASUREMENT_ID =
  'G-YLJ3YNCN2C';

const BLOCKED_ROUTE_PREFIXES = [
  '/admin',
  '/delivery',
];

type GtagWindow = typeof window & {
  gtag?: (
    ...args: unknown[]
  ) => void;

  [key: `ga-disable-${string}`]:
    | boolean
    | undefined;
};

function isBlockedRoute(
  pathname: string,
): boolean {
  return BLOCKED_ROUTE_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(
        `${prefix}/`,
      ),
  );
}

function GoogleAnalyticsPageViewInner() {
  const pathname =
    usePathname() || '/';

  const searchParams =
    useSearchParams();

  const lastTrackedPathRef =
    useRef('');

  /*
   * Disable Google Analytics completely
   * on internal/admin routes.
   *
   * IMPORTANT:
   * Do not initialize Firebase Auth here.
   * Normal customers should not download
   * Firebase Authentication simply for
   * analytics page-view tracking.
   */
  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const gaWindow =
      window as GtagWindow;

    gaWindow[
      `ga-disable-${GA_MEASUREMENT_ID}`
    ] = isBlockedRoute(
      pathname,
    );
  }, [pathname]);

  /*
   * Track normal customer page views.
   *
   * Google Analytics is loaded with
   * Next.js lazyOnload, so gtag may not
   * exist immediately.
   *
   * Briefly retry until GA is ready.
   */
  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    if (
      isBlockedRoute(
        pathname,
      )
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

    const sendPageView =
      (): boolean => {
        const gaWindow =
          window as GtagWindow;

        const gtag =
          gaWindow.gtag;

        if (
          typeof gtag !==
          'function'
        ) {
          return false;
        }

        gaWindow[
          `ga-disable-${GA_MEASUREMENT_ID}`
        ] = false;

        gtag(
          'event',
          'page_view',
          {
            page_title:
              document.title,

            page_location:
              window.location.href,

            page_path:
              pagePath,

            send_to:
              GA_MEASUREMENT_ID,
          },
        );

        lastTrackedPathRef.current =
          pagePath;

        return true;
      };

    if (
      sendPageView()
    ) {
      return;
    }

    let attempts = 0;

    const timer =
      window.setInterval(
        () => {
          attempts += 1;

          if (
            sendPageView() ||
            attempts >= 40
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

export default function GoogleAnalyticsPageView() {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsPageViewInner />
    </Suspense>
  );
}