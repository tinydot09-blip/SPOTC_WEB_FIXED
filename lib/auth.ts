import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  auth,
  db,
  firebaseReady,
} from '@/lib/firebase';

let pendingGoogleLogin: Promise<User | null> | null = null;

export type SpotcUserProfile = {
  uid: string;
  display_name: string;
  email: string;
  photo_url: string;
  gender: string;
  date_of_birth: string;
  phone_number: string;
  whatsapp_number: string;
  profile_complete: boolean;
};

export function getProfileCompletionPercentage(
  profile: Partial<SpotcUserProfile> | null | undefined,
): number {
  if (!profile) {
    return 0;
  }

  const requiredFields = [
    profile.gender,
    profile.date_of_birth,
    profile.phone_number,
  ];

  const completedFields = requiredFields.filter(
    (value) =>
      typeof value === 'string' &&
      value.trim().length > 0,
  ).length;

  if (completedFields === 3) {
    return 100;
  }

  if (completedFields === 2) {
    return 67;
  }

  if (completedFields === 1) {
    return 33;
  }

  return 0;
}

export function isSpotcProfileComplete(
  profile: Partial<SpotcUserProfile> | null | undefined,
): boolean {
  return getProfileCompletionPercentage(profile) === 100;
}

async function saveGoogleUser(
  user: User,
): Promise<void> {
  if (!db || !user || user.isAnonymous) {
    return;
  }

  await setDoc(
    doc(db, 'Users', user.uid),
    {
      uid: user.uid,
      display_name: user.displayName || '',
      email: user.email || '',
      photo_url: user.photoURL || '',
      auth_provider: 'google',
      is_guest: false,
      last_login_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    {
      merge: true,
    },
  );
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: 'select_account',
  });

  return provider;
}

/*
 * Kept because ProfileCompletionGate.tsx imports this function.
 *
 * The current login flow uses signInWithPopup on desktop and mobile,
 * but this remains safe for users returning from an older redirect flow.
 */
export async function completeGoogleRedirectLogin():
  Promise<User | null> {
  if (!firebaseReady || !auth) {
    return null;
  }

  try {
    const result = await getRedirectResult(auth);

    if (
      !result?.user ||
      result.user.isAnonymous
    ) {
      return auth.currentUser &&
        !auth.currentUser.isAnonymous
        ? auth.currentUser
        : null;
    }

    await saveGoogleUser(result.user);

    return result.user;
  } catch (error) {
    console.error(
      'Google redirect login failed:',
      error,
    );

    return auth.currentUser &&
      !auth.currentUser.isAnonymous
      ? auth.currentUser
      : null;
  }
}

export async function getSpotcUserProfile(
  user: User,
): Promise<Partial<SpotcUserProfile> | null> {
  if (!db || !user || user.isAnonymous) {
    return null;
  }

  try {
    const snapshot = await getDoc(
      doc(db, 'Users', user.uid),
    );

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data() as Partial<SpotcUserProfile>;
  } catch (error) {
    console.error(
      'Loading SPOTC user profile failed:',
      error,
    );

    return null;
  }
}

export async function isUserProfileComplete(
  user: User,
): Promise<boolean> {
  const profile = await getSpotcUserProfile(user);

  return isSpotcProfileComplete(profile);
}

export async function requireGoogleLogin():
  Promise<User | null> {
  if (!firebaseReady || !auth) {
    throw new Error(
      'Firebase authentication is not configured.',
    );
  }

  const existingUser = auth.currentUser;

  if (
    existingUser &&
    !existingUser.isAnonymous
  ) {
    await saveGoogleUser(existingUser);

    return existingUser;
  }

  if (pendingGoogleLogin) {
    return pendingGoogleLogin;
  }

  pendingGoogleLogin = (async () => {
    try {
      const provider = createGoogleProvider();

      /*
       * Use popup on desktop and mobile.
       *
       * This keeps the current page and pending action alive.
       * After Google login succeeds, Save continues immediately.
       */
      const result = await signInWithPopup(
        auth,
        provider,
      );

      const user = result.user;

      if (
        !user ||
        user.isAnonymous
      ) {
        return null;
      }

      await saveGoogleUser(user);

      return user;
    } catch (error: unknown) {
      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      if (
        firebaseError.code ===
          'auth/popup-closed-by-user' ||
        firebaseError.code ===
          'auth/cancelled-popup-request'
      ) {
        return null;
      }

      if (
        firebaseError.code ===
        'auth/unauthorized-domain'
      ) {
        throw new Error(
          `This website domain is not authorized in Firebase Authentication. Add "${window.location.hostname}" under Firebase Authentication > Settings > Authorized domains.`,
        );
      }

      if (
        firebaseError.code ===
        'auth/popup-blocked'
      ) {
        throw new Error(
          'Google sign-in was blocked by the browser. Allow pop-ups for this website and try again.',
        );
      }

      if (
        firebaseError.code ===
        'auth/network-request-failed'
      ) {
        throw new Error(
          'Google sign-in could not connect. Check your internet connection and try again.',
        );
      }

      if (
        firebaseError.code ===
        'auth/operation-not-allowed'
      ) {
        throw new Error(
          'Google sign-in is not enabled in Firebase Authentication.',
        );
      }

      console.error(
        'Google login failed:',
        error,
      );

      throw new Error(
        firebaseError.message ||
          'Google sign in failed. Please try again.',
      );
    } finally {
      pendingGoogleLogin = null;
    }
  })();

  return pendingGoogleLogin;
}

export async function logoutUser():
  Promise<void> {
  if (!auth) {
    return;
  }

  await signOut(auth);
}