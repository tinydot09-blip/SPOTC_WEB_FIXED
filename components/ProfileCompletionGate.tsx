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

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      return;
    }

    // Keep a non-null Firebase Auth reference for this entire effect.
    // TypeScript does not preserve narrowing of the imported nullable `auth`
    // inside nested callbacks such as refreshProfile.
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
      ) => {
        if (
          !active ||
          !user ||
          user.isAnonymous
        ) {
          checkingUserRef.current =
            null;

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
            sessionStorage.removeItem(
              PROFILE_SKIP_KEY,
            );

            /*
             * IMPORTANT:
             * Only use spotc-auth-return-path when the
             * user is actually returning from the
             * Complete Profile page.
             *
             * Previously this gate redirected from ANY
             * page (for example /address) to an old
             * stored path such as /offers.
             */
            if (
              pathname.startsWith(
                COMPLETE_PROFILE_PATH,
              )
            ) {
              if (storedReturnPath) {
                clearStoredReturnPath();

                router.replace(
                  storedReturnPath,
                );

                return;
              }

              clearStoredReturnPath();

              router.replace(
                '/offers',
              );

              return;
            }

            /*
             * User is already complete and is navigating
             * normally. Never hijack the page because of
             * an old stored auth/profile return path.
             */
            if (storedReturnPath) {
              clearStoredReturnPath();
            }

            return;
          }

          /*
           * Profile is incomplete.
           * Remember the page the user was trying to use,
           * then send them to Complete Profile.
           */
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
          }
        } catch (
          error
        ) {
          console.error(
            'Unable to check profile completion:',
            error,
          );
        } finally {
          checkingUserRef.current =
            null;
        }
      };

    void (async () => {
      try {
        const redirectUser =
          await completeGoogleRedirectLogin();

        await checkProfile(
          redirectUser ||
            firebaseAuth.currentUser,
        );
      } catch (
        redirectError
      ) {
        console.error(
          'Unable to complete Google redirect login:',
          redirectError,
        );

        await checkProfile(
          firebaseAuth.currentUser,
        );
      }
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
        void checkProfile(
          firebaseAuth.currentUser,
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

  return <>{children}</>;
}