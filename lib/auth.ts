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
      const provider = createGoogleProvider();

      /*
       * Use popup on desktop and mobile.
       *
       * This keeps the current SPOTC page alive, so the Save action
       * continues immediately after the user chooses a Google account.
       */
      const result = await signInWithPopup(auth, provider);

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
          'Google sign-in was blocked by the browser. Allow pop-ups for this website and try again.',
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