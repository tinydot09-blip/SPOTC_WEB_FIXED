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

let pendingGoogleLogin: Promise<User | null> | null = null;

async function saveGoogleUser(user: User): Promise<void> {
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

export async function requireGoogleLogin(): Promise<User | null> {
  if (!firebaseReady || !auth) {
    throw new Error(
      'Firebase authentication is not configured.',
    );
  }

  const existingUser = auth.currentUser;

  if (existingUser && !existingUser.isAnonymous) {
    await saveGoogleUser(existingUser);
    return existingUser;
  }

  if (pendingGoogleLogin) {
    return pendingGoogleLogin;
  }

  pendingGoogleLogin = (async () => {
    try {
      /*
       * Popup is intentionally used for desktop and mobile.
       * It returns the User directly, so checkout and every other
       * protected action can continue immediately after account selection.
       */
      const result = await signInWithPopup(
        auth,
        createGoogleProvider(),
      );

      const user = result.user;

      if (!user || user.isAnonymous) {
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
        firebaseError.code === 'auth/popup-closed-by-user' ||
        firebaseError.code === 'auth/cancelled-popup-request'
      ) {
        return null;
      }

      if (firebaseError.code === 'auth/unauthorized-domain') {
        throw new Error(
          `This website domain is not authorized in Firebase Authentication. Add "${window.location.hostname}" under Firebase Authentication > Settings > Authorized domains.`,
        );
      }

      if (firebaseError.code === 'auth/popup-blocked') {
        throw new Error(
          'The browser blocked the Google sign-in window. Allow pop-ups for this website and tap Sign in again.',
        );
      }

      console.error('Google login failed:', error);

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

export async function logoutUser(): Promise<void> {
  if (!auth) {
    return;
  }

  await signOut(auth);
}