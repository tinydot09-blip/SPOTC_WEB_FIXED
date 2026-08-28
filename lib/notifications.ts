'use client';

import { getApp } from 'firebase/app';
import type { User } from 'firebase/auth';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from 'firebase/messaging';
import {
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type BrowserNotificationState =
  | NotificationPermission
  | 'unsupported';

const SERVICE_WORKER_PATH =
  '/firebase-messaging-sw.js';

const VAPID_KEY =
  process.env
    .NEXT_PUBLIC_FIREBASE_VAPID_KEY
    ?.trim() || '';

function browserAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined'
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function getBrowserNotificationState():
  Promise<BrowserNotificationState> {
  if (
    !browserAvailable() ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    return 'unsupported';
  }

  const supported =
    await isSupported().catch(() => false);

  if (!supported) {
    return 'unsupported';
  }

  return Notification.permission;
}

async function getServiceWorkerRegistration():
  Promise<ServiceWorkerRegistration> {
  if (
    !browserAvailable() ||
    !('serviceWorker' in navigator)
  ) {
    throw new Error(
      'Browser notifications are not supported on this device.',
    );
  }

  let registration =
    await navigator.serviceWorker.getRegistration(
      '/',
    );

  if (!registration) {
    registration =
      await withTimeout(
        navigator.serviceWorker.register(
          SERVICE_WORKER_PATH,
          {
            scope: '/',
          },
        ),
        8000,
        'SPOTC service worker registration timed out.',
      );
  }

  const readyRegistration =
    await withTimeout(
      navigator.serviceWorker.ready,
      8000,
      'SPOTC service worker did not become ready.',
    );

  return registration || readyRegistration;
}

async function saveTokenForUser(
  user: User,
  token: string,
): Promise<void> {
  if (!db) {
    throw new Error(
      'SPOTC could not connect to Firestore.',
    );
  }

  try {
    await setDoc(
      doc(db, 'Users', user.uid),
      {
        uid: user.uid,
        fcm_tokens: arrayUnion(token),
        fcm_token_last: token,
        browser_notifications_enabled: true,
        browser_notification_permission:
          'granted',
        browser_notification_user_agent:
          typeof navigator !== 'undefined'
            ? navigator.userAgent
            : '',
        browser_notification_updated_at:
          serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      {
        merge: true,
      },
    );
  } catch (error) {
    console.error(
      '[SPOTC] Unable to save FCM token:',
      error,
    );

    throw new Error(
      'Notifications were allowed, but SPOTC could not save this device. Check Firestore permissions.',
    );
  }
}

async function createAndSaveToken(
  user: User,
): Promise<string> {
  if (!VAPID_KEY) {
    throw new Error(
      'SPOTC notification setup is incomplete: VAPID key is missing from the deployed site.',
    );
  }

  const supported =
    await isSupported().catch(() => false);

  if (!supported) {
    throw new Error(
      'This browser does not support SPOTC browser notifications.',
    );
  }

  const registration =
    await getServiceWorkerRegistration();

  const messaging =
    getMessaging(getApp());

  let token = '';

  try {
    token =
      await withTimeout(
        getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration:
            registration,
        }),
        12000,
        'Firebase notification token request timed out.',
      );
  } catch (error) {
    console.error(
      '[SPOTC] Firebase getToken failed:',
      error,
    );

    throw new Error(
      'SPOTC could not register this browser for order alerts.',
    );
  }

  if (!token) {
    throw new Error(
      'Firebase did not return a notification token for this device.',
    );
  }

  await saveTokenForUser(
    user,
    token,
  );

  return token;
}

/**
 * Must be called directly from a user action.
 * Example: tapping "Turn on order alerts".
 */
export async function requestAndRegisterBrowserNotifications(
  user: User,
): Promise<BrowserNotificationState> {
  if (
    !browserAvailable() ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator)
  ) {
    throw new Error(
      'Browser notifications are not supported on this device.',
    );
  }

  const supported =
    await isSupported().catch(() => false);

  if (!supported) {
    throw new Error(
      'This browser does not support SPOTC browser notifications.',
    );
  }

  let permission =
    Notification.permission;

  /*
   * IMPORTANT:
   * If the user previously blocked notifications,
   * Chrome will not show the permission popup again.
   */
  if (permission === 'denied') {
    throw new Error(
      'Notifications are already blocked for spotc.in on this device.',
    );
  }

  if (permission === 'default') {
    try {
      permission =
        await Notification.requestPermission();
    } catch (error) {
      console.error(
        '[SPOTC] Notification permission request failed:',
        error,
      );

      throw new Error(
        'Chrome could not open the notification permission request.',
      );
    }
  }

  if (permission === 'denied') {
    throw new Error(
      'Notifications were blocked on this device.',
    );
  }

  if (permission !== 'granted') {
    throw new Error(
      'Notification permission was not allowed.',
    );
  }

  await createAndSaveToken(user);

  return 'granted';
}

/**
 * Refresh/save an existing FCM token without showing
 * a browser permission prompt.
 */
export async function refreshBrowserNotificationToken(
  user: User,
): Promise<string | null> {
  const state =
    await getBrowserNotificationState();

  if (state !== 'granted') {
    return null;
  }

  return createAndSaveToken(user);
}

export async function listenForForegroundNotifications(
  callback: (
    payload: MessagePayload,
  ) => void,
): Promise<() => void> {
  if (
    !browserAvailable() ||
    !(await isSupported().catch(
      () => false,
    ))
  ) {
    return () => {};
  }

  const messaging =
    getMessaging(getApp());

  return onMessage(
    messaging,
    callback,
  );
}

/**
 * Mobile Chrome does not reliably support
 * `new Notification(...)`.
 * Use the service worker to display foreground
 * notifications too.
 */
export function showForegroundBrowserNotification(
  payload: MessagePayload,
): void {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const title =
    payload.notification?.title ||
    payload.data?.title ||
    'SPOTC';

  const body =
    payload.notification?.body ||
    payload.data?.body ||
    'You have a new order update.';

  const url =
    payload.data?.url ||
    '/dashboard?tab=orders';

  void navigator.serviceWorker.ready
    .then((registration) =>
      registration.showNotification(
        title,
        {
          body,
          icon:
            '/images/web-logo-color.png',
          badge:
            '/images/web-logo-color.png',
          tag:
            payload.data?.orderId ||
            'spotc-order-update',
          data: {
            url,
            orderId:
              payload.data?.orderId ||
              '',
          },
        },
      ),
    )
    .catch((error) => {
      console.error(
        '[SPOTC] Foreground notification failed:',
        error,
      );
    });
}
