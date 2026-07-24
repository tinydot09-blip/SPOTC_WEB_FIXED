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
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import {
  completeGoogleRedirectLogin,
  isUserProfileComplete,
} from '@/lib/auth';

import {
  auth,
  firebaseReady,
} from '@/lib/firebase';

const PUBLIC_PROFILE_PATH = '/complete-profile';

export default function ProfileCompletionGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const checkingUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      return;
    }

    let active = true;

    const checkProfile = async (
      user: User | null,
    ) => {
      if (
        !active ||
        !user ||
        user.isAnonymous
      ) {
        checkingUserRef.current = null;
        return;
      }

      if (pathname.startsWith(PUBLIC_PROFILE_PATH)) {
        return;
      }

      if (checkingUserRef.current === user.uid) {
        return;
      }

      checkingUserRef.current = user.uid;

      try {
        const complete =
          await isUserProfileComplete(user);

        if (!active) {
          return;
        }

        if (!complete) {
          router.replace(PUBLIC_PROFILE_PATH);
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

    void (async () => {
  const redirectUser =
    await completeGoogleRedirectLogin();

  await checkProfile(
    redirectUser || auth.currentUser,
  );
})();

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        void checkProfile(user);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [pathname, router]);

  return children;
}