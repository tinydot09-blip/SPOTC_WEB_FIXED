'use client';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  completeGoogleRedirectLogin,
  isUserProfileComplete,
} from '@/lib/auth';

import {
  auth,
  firebaseReady,
} from '@/lib/firebase';

const COMPLETE_PROFILE_PATH =
  '/complete-profile';

const PROFILE_SKIP_KEY =
  'spotc-profile-skipped';

const AUTH_RETURN_PATH_KEY =
  'spotc-auth-return-path';

/*
 * completeGoogleRedirectLogin() should not be restarted on every route.
 * Keep one shared promise for the lifetime of this browser bundle.
 */
let redirectLoginPromise:
  | Promise<User | null>
  | null = null;

function getRedirectLoginOnce(): Promise<User | null> {
  if (!redirectLoginPromise) {
    redirectLoginPromise =
      completeGoogleRedirectLogin()
        .catch((error) => {
          console.error(
            'Unable to complete Google redirect login:',
            error,
          );

          return null;
        });
  }

  return redirectLoginPromise;
}

function safeReturnPath(
  value: string | null,
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith(COMPLETE_PROFILE_PATH)
  ) {
    return '';
  }

  return value;
}

function readStoredReturnPath(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return safeReturnPath(
      sessionStorage.getItem(
        AUTH_RETURN_PATH_KEY,
      ) ||
        localStorage.getItem(
          AUTH_RETURN_PATH_KEY,
        ),
    );
  } catch {
    return '';
  }
}

function storeReturnPath(
  path: string,
) {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  const safePath =
    safeReturnPath(path);

  if (!safePath) {
    return;
  }

  try {
    sessionStorage.setItem(
      AUTH_RETURN_PATH_KEY,
      safePath,
    );

    localStorage.setItem(
      AUTH_RETURN_PATH_KEY,
      safePath,
    );
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

function clearStoredReturnPath() {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  try {
    sessionStorage.removeItem(
      AUTH_RETURN_PATH_KEY,
    );

    localStorage.removeItem(
      AUTH_RETURN_PATH_KEY,
    );
  } catch {
    // Nothing else is required.
  }
}

export default function ProfileCompletionGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname =
    usePathname();

  const router =
    useRouter();

  const checkingUserRef =
    useRef<string | null>(
      null,
    );

  /*
   * Cache the UID after we have confirmed the profile is complete.
   * This prevents a Firestore/profile check on every route change,
   * so Cart -> Address opens immediately.
   */
  const completeUidRef =
    useRef<string | null>(
      null,
    );

  /*
   * Only hide children during the very first auth/profile resolution
   * or when we genuinely need to redirect to Complete Profile.
   */
  const [gateReady, setGateReady] =
    useState(false);

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      setGateReady(true);
      return;
    }

    const firebaseAuth = auth;
    let active = true;

    const browserSearch =
      typeof window !== 'undefined'
        ? window.location.search
        : '';

    const currentQuery =
      browserSearch.startsWith('?')
        ? browserSearch.slice(1)
        : browserSearch;

    const currentPath =
      currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname;

    const browserParams =
      typeof window !== 'undefined'
        ? new URLSearchParams(
            window.location.search,
          )
        : new URLSearchParams();

    const nextFromQuery =
      safeReturnPath(
        browserParams.get('next'),
      );

    if (nextFromQuery) {
      storeReturnPath(
        nextFromQuery,
      );
    }

    const checkProfile =
      async (
        user: User | null,
        force = false,
      ) => {
        if (!active) {
          return;
        }

        /*
         * Not signed in / anonymous:
         * this gate should not create route flashes.
         * Individual protected actions can request login.
         */
        if (
          !user ||
          user.isAnonymous
        ) {
          checkingUserRef.current =
            null;
          completeUidRef.current =
            null;
          setGateReady(true);
          return;
        }

        const skippedUid =
          sessionStorage.getItem(
            PROFILE_SKIP_KEY,
          );

        if (
          skippedUid ===
          user.uid
        ) {
          setGateReady(true);
          return;
        }

        /*
         * Already verified during this session:
         * do not hit Firestore again just because pathname changed.
         */
        if (
          !force &&
          completeUidRef.current ===
            user.uid
        ) {
          const storedReturnPath =
            readStoredReturnPath();

          if (
            pathname.startsWith(
              COMPLETE_PROFILE_PATH,
            )
          ) {
            clearStoredReturnPath();

            router.replace(
              storedReturnPath ||
                '/offers',
            );

            return;
          }

          if (storedReturnPath) {
            clearStoredReturnPath();
          }

          setGateReady(true);
          return;
        }

        if (
          checkingUserRef.current ===
          user.uid
        ) {
          return;
        }

        checkingUserRef.current =
          user.uid;

        try {
          const complete =
            await isUserProfileComplete(
              user,
            );

          if (!active) {
            return;
          }

          const storedReturnPath =
            readStoredReturnPath();

          if (complete) {
            completeUidRef.current =
              user.uid;

            sessionStorage.removeItem(
              PROFILE_SKIP_KEY,
            );

            /*
             * Only consume the stored return path while actually
             * leaving Complete Profile. Never redirect /address,
             * /cart, /checkout, etc. because of an old stored path.
             */
            if (
              pathname.startsWith(
                COMPLETE_PROFILE_PATH,
              )
            ) {
              clearStoredReturnPath();

              router.replace(
                storedReturnPath ||
                  '/offers',
              );

              return;
            }

            if (storedReturnPath) {
              clearStoredReturnPath();
            }

            setGateReady(true);
            return;
          }

          /*
           * Profile is incomplete.
           * Save only the page the user is currently trying to access.
           */
          completeUidRef.current =
            null;

          if (
            !pathname.startsWith(
              COMPLETE_PROFILE_PATH,
            )
          ) {
            storeReturnPath(
              currentPath,
            );

            const returnPath =
              readStoredReturnPath();

            router.replace(
              returnPath
                ? `${COMPLETE_PROFILE_PATH}?next=${encodeURIComponent(
                    returnPath,
                  )}`
                : COMPLETE_PROFILE_PATH,
            );

            return;
          }

          setGateReady(true);
        } catch (
          error
        ) {
          console.error(
            'Unable to check profile completion:',
            error,
          );

          /*
           * Do not trap the user behind a blank gate because of a
           * temporary Firebase/network problem.
           */
          setGateReady(true);
        } finally {
          checkingUserRef.current =
            null;
        }
      };

    /*
     * Resolve Google redirect only once for the whole app bundle.
     * After that, normal page navigation relies on Firebase auth state.
     */
    void (async () => {
      const redirectUser =
        await getRedirectLoginOnce();

      if (!active) {
        return;
      }

      await checkProfile(
        redirectUser ||
          firebaseAuth.currentUser,
      );
    })();

    const unsubscribe =
      onAuthStateChanged(
        firebaseAuth,
        (user) => {
          void checkProfile(
            user,
          );
        },
      );

    const refreshProfile =
      () => {
        completeUidRef.current =
          null;

        setGateReady(false);

        void checkProfile(
          firebaseAuth.currentUser,
          true,
        );
      };

    window.addEventListener(
      'spotc-profile-updated',
      refreshProfile,
    );

    return () => {
      active = false;
      unsubscribe();

      window.removeEventListener(
        'spotc-profile-updated',
        refreshProfile,
      );
    };
  }, [
    pathname,
    router,
  ]);

  /*
   * Prevent previous/intermediate route content from flashing while
   * the first profile check is resolving.
   */
  if (!gateReady) {
    return (
      <div
        aria-label="Loading"
        aria-busy="true"
        style={{
          minHeight:
            'calc(100vh - 72px)',
          background:
            '#f7f5f1',
        }}
      />
    );
  }

  return <>{children}</>;
}