import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
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
    const provider = createGoogleProvider();

    try {
      const loginResult = await signInWithPopup(
        auth,
        provider,
      );

      const user = loginResult.user;

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
        firebaseError.code ===
          'auth/popup-closed-by-user' ||
        firebaseError.code ===
          'auth/cancelled-popup-request'
      ) {
        return null;
      }

      /*
       * Chrome or another browser may block the Google popup.
       * When that happens, automatically switch to full-page
       * Google redirect login.
       */
      if (
        firebaseError.code === 'auth/popup-blocked' ||
        firebaseError.code ===
          'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          sessionStorage.setItem(
            'spotc_google_login_redirect',
            window.location.href,
          );

          await signInWithRedirect(
            auth,
            provider,
          );

          return null;
        } catch (redirectError) {
          console.error(
            'Google redirect login failed:',
            redirectError,
          );

          throw redirectError;
        }
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