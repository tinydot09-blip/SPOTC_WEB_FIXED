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

    let active = true;

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

        if (
          pathname.startsWith(
            COMPLETE_PROFILE_PATH,
          )
        ) {
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

          if (complete) {
            sessionStorage.removeItem(
              PROFILE_SKIP_KEY,
            );

            return;
          }

          router.replace(
            COMPLETE_PROFILE_PATH,
          );
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
            auth.currentUser,
        );
      } catch (
        redirectError
      ) {
        console.error(
          'Unable to complete Google redirect login:',
          redirectError,
        );

        await checkProfile(
          auth.currentUser,
        );
      }
    })();

    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          void checkProfile(
            user,
          );
        },
      );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    pathname,
    router,
  ]);

  return <>{children}</>;
}