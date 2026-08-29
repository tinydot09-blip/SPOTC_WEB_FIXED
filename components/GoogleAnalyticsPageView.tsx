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
  gtag?: (...args: unknown[]) => void;
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
   * Resolve Firebase authentication first.
   *
   * This lets us determine whether the
   * signed-in visitor is one of the
   * SPOTC admin accounts.
   */
  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(user);
          setAuthResolved(true);
        },
        (error) => {
          console.error(
            '[SPOTC GA] Firebase auth check failed:',
            error,
          );

          /*
           * If authentication lookup fails,
           * treat this as a normal visitor
           * rather than blocking analytics
           * forever.
           */
          setCurrentUser(null);
          setAuthResolved(true);
        },
      );

    return unsubscribe;
  }, []);

  /*
   * Enable / disable Google Analytics.
   *
   * IMPORTANT:
   * We disable GA while authentication
   * is still loading. This prevents an
   * admin from sending analytics events
   * before Firebase tells us who they are.
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
      isBlockedRoute(pathname);

    const adminUser =
      authResolved &&
      isAdminUser(currentUser);

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
   * Send SPA page_view events only for
   * genuine customer traffic.
   */
  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    /*
     * Never track admin/delivery pages.
     */
    if (
      isBlockedRoute(pathname)
    ) {
      return;
    }

    /*
     * Wait until Firebase authentication
     * is resolved.
     */
    if (!authResolved) {
      return;
    }

    /*
     * Never track either SPOTC admin
     * account, even when the admin browses
     * customer-facing pages.
     */
    if (
      isAdminUser(currentUser)
    ) {
      return;
    }

    const gaWindow =
      window as GtagWindow;

    const gtag =
      gaWindow.gtag;

    if (
      typeof gtag !==
      'function'
    ) {
      return;
    }

    /*
     * Make absolutely sure analytics is
     * enabled for a normal customer.
     */
    gaWindow[
      `ga-disable-${GA_MEASUREMENT_ID}`
    ] = false;

    const query =
      searchParams.toString();

    const pagePath =
      query
        ? `${pathname}?${query}`
        : pathname;

    /*
     * Prevent duplicate page_view events
     * for the same Next.js route.
     */
    if (
      lastTrackedPathRef.current ===
      pagePath
    ) {
      return;
    }

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