'use client';

import {
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';

import {
  usePathname,
  useRouter,
  useSearchParams,
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

const COMPLETE_PROFILE_PATH = '/complete-profile';
const PROFILE_SKIP_KEY = 'spotc-profile-skipped';
const AUTH_RETURN_PATH_KEY = 'spotc-auth-return-path';

function safeReturnPath(value: string | null): string {
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
      sessionStorage.getItem(AUTH_RETURN_PATH_KEY) ||
        localStorage.getItem(AUTH_RETURN_PATH_KEY),
    );
  } catch {
    return '';
  }
}

function storeReturnPath(path: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const safePath = safeReturnPath(path);

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
    // Storage may be unavailable in private browsing.
  }
}

function clearStoredReturnPath() {
  if (typeof window === 'undefined') {
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const checkingUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      return;
    }

    const activeAuth: Auth = auth;
    let effectActive = true;

    const currentQuery = searchParams.toString();

    const currentPath = currentQuery
      ? `${pathname}?${currentQuery}`
      : pathname;

    const nextFromQuery = safeReturnPath(
      searchParams.get('next'),
    );

    if (nextFromQuery) {
      storeReturnPath(nextFromQuery);
    }

    const checkProfile = async (
      user: User | null,
    ) => {
      if (
        !effectActive ||
        !user ||
        user.isAnonymous
      ) {
        checkingUserRef.current = null;
        return;
      }

      let skippedUid = '';

      try {
        skippedUid =
          sessionStorage.getItem(
            PROFILE_SKIP_KEY,
          ) || '';
      } catch {
        skippedUid = '';
      }

      if (skippedUid === user.uid) {
        return;
      }

      if (
        checkingUserRef.current === user.uid
      ) {
        return;
      }

      checkingUserRef.current = user.uid;

      try {
        const profileComplete =
          await isUserProfileComplete(user);

        if (!effectActive) {
          return;
        }

        const storedReturnPath =
          readStoredReturnPath();

        if (profileComplete) {
          try {
            sessionStorage.removeItem(
              PROFILE_SKIP_KEY,
            );
          } catch {
            // Nothing else is required.
          }

          if (
            storedReturnPath &&
            currentPath !== storedReturnPath
          ) {
            clearStoredReturnPath();
            router.replace(storedReturnPath);
            return;
          }

          if (
            pathname.startsWith(
              COMPLETE_PROFILE_PATH,
            )
          ) {
            if (storedReturnPath) {
              clearStoredReturnPath();
              router.replace(storedReturnPath);
            } else {
              router.replace('/');
            }
          }

          return;
        }

        if (
          !pathname.startsWith(
            COMPLETE_PROFILE_PATH,
          )
        ) {
          storeReturnPath(currentPath);

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
      } catch (error) {
        console.error(
          'Unable to check profile completion:',
          error,
        );
      } finally {
        checkingUserRef.current = null;
      }
    };

    const completeRedirectLogin =
      async () => {
        try {
          const redirectUser =
            await completeGoogleRedirectLogin();

          await checkProfile(
            redirectUser ||
              activeAuth.currentUser,
          );
        } catch (redirectError) {
          console.error(
            'Unable to complete Google redirect login:',
            redirectError,
          );

          await checkProfile(
            activeAuth.currentUser,
          );
        }
      };

    void completeRedirectLogin();

    const unsubscribe =
      onAuthStateChanged(
        activeAuth,
        (user) => {
          void checkProfile(user);
        },
      );

    const refreshProfile = () => {
      void checkProfile(
        activeAuth.currentUser,
      );
    };

    window.addEventListener(
      'spotc-profile-updated',
      refreshProfile,
    );

    return () => {
      effectActive = false;
      unsubscribe();

      window.removeEventListener(
        'spotc-profile-updated',
        refreshProfile,
      );
    };
  }, [
    pathname,
    router,
    searchParams,
  ]);

  return <>{children}</>;
}