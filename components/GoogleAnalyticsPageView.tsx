'use client';

import {
  usePathname,
  useSearchParams,
} from 'next/navigation';

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';

const GA_MEASUREMENT_ID =
  'G-YLJ3YNCN2C';

const ADMIN_EMAILS = new Set([
  'tinydot09@gmail.com',
  'shashanth.in09@gmail.com',
]);

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

function isAdminUser(
  user: User | null,
): boolean {
  const email =
    user?.email
      ?.trim()
      .toLowerCase() || '';

  return (
    email.length > 0 &&
    ADMIN_EMAILS.has(email)
  );
}

function GoogleAnalyticsPageViewInner() {
  const pathname =
    usePathname() || '/';

  const searchParams =
    useSearchParams();

  const lastTrackedPathRef =
    useRef('');

  const [
    authResolved,
    setAuthResolved,
  ] = useState(false);

  const [
    currentUser,
    setCurrentUser,
  ] = useState<User | null>(
    null,
  );

  /*
   * Resolve Firebase authentication.
   *
   * We need this so SPOTC admin traffic
   * is not counted in Google Analytics.
   */
  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(
            user,
          );

          setAuthResolved(
            true,
          );
        },
        (error) => {
          console.error(
            '[SPOTC GA] Firebase auth check failed:',
            error,
          );

          /*
           * If authentication lookup fails,
           * continue as a normal visitor.
           */
          setCurrentUser(
            null,
          );

          setAuthResolved(
            true,
          );
        },
      );

    return unsubscribe;
  }, []);

  /*
   * Keep Google Analytics disabled while
   * authentication is resolving, or when
   * the visitor is an admin.
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

    const blockedRoute =
      isBlockedRoute(
        pathname,
      );

    const adminUser =
      authResolved &&
      isAdminUser(
        currentUser,
      );

    const shouldDisable =
      blockedRoute ||
      !authResolved ||
      adminUser;

    gaWindow[
      `ga-disable-${GA_MEASUREMENT_ID}`
    ] = shouldDisable;
  }, [
    pathname,
    authResolved,
    currentUser,
  ]);

  /*
   * Track customer page views.
   *
   * Google Analytics itself is now loaded
   * with Next.js lazyOnload.
   *
   * Because of that, gtag may not exist
   * immediately when this effect runs.
   *
   * We briefly retry instead of losing
   * the page_view.
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

    if (
      !authResolved
    ) {
      return;
    }

    if (
      isAdminUser(
        currentUser,
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

    /*
     * Already tracked.
     */
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

        /*
         * Enable tracking for genuine
         * customer traffic.
         */
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

    /*
     * GA may already be ready.
     */
    if (
      sendPageView()
    ) {
      return;
    }

    /*
     * GA uses lazyOnload, so wait for
     * the script if necessary.
     *
     * 40 x 250 ms gives it up to
     * approximately 10 seconds.
     */
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
    authResolved,
    currentUser,
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