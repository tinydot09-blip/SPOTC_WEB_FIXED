import {
  GoogleAuthProvider,
  getRedirectResult,
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
let pendingRedirectResult: Promise<User | null> | null = null;

async function saveGoogleUser(user: User): Promise<void> {
  if (!db || !user || user.isAnonymous) return;

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
    { merge: true },
  );
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: 'select_account',
  });

  return provider;
}

function shouldUseRedirectLogin(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isMobileUserAgent =
    /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/.test(
      userAgent,
    );

  const isSmallTouchDevice =
    window.matchMedia?.('(pointer: coarse)').matches === true &&
    window.innerWidth <= 1024;

  return isMobileUserAgent || isSmallTouchDevice;
}

function saveReturnUrl(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      'spotc_google_login_return_url',
      window.location.href,
    );
  } catch {
    // Some private browsers can block sessionStorage.
  }
}

export function consumeGoogleLoginReturnUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const returnUrl = window.sessionStorage.getItem(
      'spotc_google_login_return_url',
    );

    window.sessionStorage.removeItem(
      'spotc_google_login_return_url',
    );

    return returnUrl;
  } catch {
    return null;
  }
}

export async function completeGoogleRedirectLogin(): Promise<User | null> {
  if (!firebaseReady || !auth) return null;

  if (pendingRedirectResult) return pendingRedirectResult;

  pendingRedirectResult = (async () => {
    try {
      const redirectResult = await getRedirectResult(auth);
      const user =
        redirectResult?.user ??
        (auth.currentUser && !auth.currentUser.isAnonymous
          ? auth.currentUser
          : null);

      if (!user || user.isAnonymous) return null;

      await saveGoogleUser(user);
      return user;
    } catch (error) {
      console.error('Completing Google redirect login failed:', error);
      throw error;
    } finally {
      pendingRedirectResult = null;
    }
  })();

  return pendingRedirectResult;
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

  if (pendingGoogleLogin) return pendingGoogleLogin;

  pendingGoogleLogin = (async () => {
    const provider = createGoogleProvider();

    /*
     * Mobile browsers are more reliable with redirect authentication.
     * Start redirect immediately instead of waiting for popup failure.
     */
    if (shouldUseRedirectLogin()) {
      saveReturnUrl();
      await signInWithRedirect(auth, provider);
      return null;
    }

    try {
      const loginResult = await signInWithPopup(auth, provider);
      const user = loginResult.user;

      if (!user || user.isAnonymous) return null;

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

      if (
        firebaseError.code === 'auth/popup-blocked' ||
        firebaseError.code ===
          'auth/operation-not-supported-in-this-environment' ||
        firebaseError.code === 'auth/web-storage-unsupported'
      ) {
        saveReturnUrl();
        await signInWithRedirect(auth, provider);
        return null;
      }

      console.error('Google login failed:', error);
      throw error;
    } finally {
      pendingGoogleLogin = null;
    }
  })();

  return pendingGoogleLogin;
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}