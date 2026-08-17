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

function safeReturnPath(
  value: string | null,
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith(
      COMPLETE_PROFILE_PATH,
    )
  ) {
    return '';
  }

  return value;
}

function readStoredReturnPath(): string {
  if (
    typeof window === 'undefined'
  ) {
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
    // Storage may be unavailable.
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
    // Nothing else required.
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

  const [gateReady, setGateReady] =
    useState(false);

  /*
   * Prevent duplicate Firestore profile checks for
   * the same signed-in user.
   */
  const checkingUidRef =
    useRef<string | null>(
      null,
    );

  /*
   * Once a user is confirmed complete during this
   * browser session, route changes do not need
   * another profile query.
   */
  const completeUidRef =
    useRef<string | null>(
      null,
    );

  /*
   * Prevent more than one redirect from being fired
   * during the same auth/profile resolution.
   */
  const redirectingRef =
    useRef(false);

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      setGateReady(true);
      return;
    }

    const firebaseAuth =
      auth;

    let active =
      true;

    redirectingRef.current =
      false;

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

    /*
     * Preserve ?next= only when it is genuinely supplied.
     */
    if (
      typeof window !== 'undefined'
    ) {
      const params =
        new URLSearchParams(
          window.location.search,
        );

      const nextFromQuery =
        safeReturnPath(
          params.get('next'),
        );

      if (nextFromQuery) {
        storeReturnPath(
          nextFromQuery,
        );
      }
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
         * Guest / signed-out users:
         * do not redirect anywhere.
         */
        if (
          !user ||
          user.isAnonymous
        ) {
          checkingUidRef.current =
            null;

          completeUidRef.current =
            null;

          setGateReady(true);
          return;
        }

        const skippedUid =
          typeof window !==
          'undefined'
            ? sessionStorage.getItem(
                PROFILE_SKIP_KEY,
              )
            : null;

        if (
          skippedUid ===
          user.uid
        ) {
          setGateReady(true);
          return;
        }

        /*
         * Already confirmed complete.
         */
        if (
          !force &&
          completeUidRef.current ===
            user.uid
        ) {
          if (
            pathname.startsWith(
              COMPLETE_PROFILE_PATH,
            )
          ) {
            if (
              redirectingRef.current
            ) {
              return;
            }

            redirectingRef.current =
              true;

            const returnPath =
              readStoredReturnPath();

            clearStoredReturnPath();

            router.replace(
              returnPath ||
                '/offers',
            );

            return;
          }

          clearStoredReturnPath();
          setGateReady(true);
          return;
        }

        /*
         * Do not start the same profile check twice.
         */
        if (
          checkingUidRef.current ===
          user.uid
        ) {
          return;
        }

        checkingUidRef.current =
          user.uid;

        try {
          const complete =
            await isUserProfileComplete(
              user,
            );

          if (!active) {
            return;
          }

          if (complete) {
            completeUidRef.current =
              user.uid;

            if (
              typeof window !==
              'undefined'
            ) {
              sessionStorage.removeItem(
                PROFILE_SKIP_KEY,
              );
            }

            /*
             * Only redirect when we are actually
             * leaving Complete Profile.
             */
            if (
              pathname.startsWith(
                COMPLETE_PROFILE_PATH,
              )
            ) {
              if (
                redirectingRef.current
              ) {
                return;
              }

              redirectingRef.current =
                true;

              const returnPath =
                readStoredReturnPath();

              clearStoredReturnPath();

              router.replace(
                returnPath ||
                  '/offers',
              );

              return;
            }

            /*
             * Important:
             * Do not redirect from Offers, Shop,
             * Cart, Address, Checkout, etc.
             */
            clearStoredReturnPath();

            setGateReady(true);
            return;
          }

          /*
           * Profile incomplete.
           */
          completeUidRef.current =
            null;

          if (
            !pathname.startsWith(
              COMPLETE_PROFILE_PATH,
            )
          ) {
            if (
              redirectingRef.current
            ) {
              return;
            }

            redirectingRef.current =
              true;

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
        } catch (error) {
          console.error(
            'Unable to check profile completion:',
            error,
          );

          /*
           * Never leave the screen blank because
           * Firestore temporarily failed.
           */
          setGateReady(true);
        } finally {
          checkingUidRef.current =
            null;
        }
      };

    /*
     * ONE auth source only.
     *
     * signInWithPopup() updates Firebase Auth and this
     * callback fires once the user is signed in.
     *
     * We intentionally do NOT call
     * completeGoogleRedirectLogin() here anymore.
     */
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

        redirectingRef.current =
          false;

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
      active =
        false;

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
   * Neutral shell while auth/profile state is resolving.
   * This prevents the previous route from flashing.
   */
  if (!gateReady) {
    return (
      <div
        aria-label="Loading"
        aria-busy="true"
        style={{
          width: '100%',
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