import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  auth,
  db,
  firebaseReady,
} from '@/lib/firebase';

let pendingGoogleLogin:
  | Promise<User | null>
  | null = null;

export async function requireGoogleLogin(): Promise<User | null> {
  if (!firebaseReady || !auth) {
    throw new Error(
      'Firebase authentication is not configured.',
    );
  }

  const existingUser =
    auth.currentUser;

  if (
    existingUser &&
    !existingUser.isAnonymous
  ) {
    return existingUser;
  }

  if (pendingGoogleLogin) {
    return pendingGoogleLogin;
  }

  pendingGoogleLogin = (async () => {
    try {
      const provider =
        new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: 'select_account',
      });

      const loginResult =
        await signInWithPopup(
          auth,
          provider,
        );

      const user =
        loginResult.user;

      if (
        !user ||
        user.isAnonymous
      ) {
        return null;
      }

      if (db) {
        await setDoc(
          doc(
            db,
            'Users',
            user.uid,
          ),
          {
            uid: user.uid,

            display_name:
              user.displayName || '',

            email:
              user.email || '',

            photo_url:
              user.photoURL || '',

            auth_provider:
              'google',

            is_guest:
              false,

            last_login_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),
          },
          {
            merge: true,
          },
        );
      }

      return user;
    } catch (error: unknown) {
      const firebaseError =
        error as {
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

      console.error(
        'Google login failed:',
        error,
      );

      throw error;
    } finally {
      pendingGoogleLogin = null;
    }
  })();

  return pendingGoogleLogin;
}

export async function logoutUser(): Promise<void> {
  if (!auth) {
    return;
  }

  await signOut(auth);
}