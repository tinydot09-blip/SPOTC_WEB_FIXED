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
      'Service workers are not supported in this browser.',
    );
  }

  const registration =
    await navigator.serviceWorker.register(
      SERVICE_WORKER_PATH,
      {
        scope: '/',
      },
    );

  await navigator.serviceWorker.ready;

  return registration;
}

async function saveTokenForUser(
  user: User,
  token: string,
): Promise<void> {
  if (!db) {
    throw new Error(
      'Firebase Firestore is not available.',
    );
  }

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
}

async function createAndSaveToken(
  user: User,
): Promise<string> {
  if (!VAPID_KEY) {
    throw new Error(
      'NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing from .env.local.',
    );
  }

  const supported =
    await isSupported().catch(() => false);

  if (!supported) {
    throw new Error(
      'Firebase browser notifications are not supported in this browser.',
    );
  }

  const registration =
    await getServiceWorkerRegistration();

  const messaging =
    getMessaging(getApp());

  const token =
    await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration:
        registration,
    });

  if (!token) {
    throw new Error(
      'Firebase did not return a browser notification token.',
    );
  }

  await saveTokenForUser(
    user,
    token,
  );

  return token;
}

/**
 * Call this only from a user action such as tapping
 * "Enable browser notifications".
 */
export async function requestAndRegisterBrowserNotifications(
  user: User,
): Promise<BrowserNotificationState> {
  const state =
    await getBrowserNotificationState();

  if (state === 'unsupported') {
    return 'unsupported';
  }

  let permission =
    Notification.permission;

  if (permission !== 'granted') {
    permission =
      await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return permission;
  }

  await createAndSaveToken(user);

  return 'granted';
}

/**
 * Refresh/save the FCM token without showing a permission prompt.
 * Safe to call on login when the browser already has permission.
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

export function showForegroundBrowserNotification(
  payload: MessagePayload,
): void {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
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

  const notification =
    new Notification(title, {
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
    });

  notification.onclick = () => {
    window.focus();

    window.location.href =
      String(
        notification.data?.url ||
          '/dashboard?tab=orders',
      );

    notification.close();
  };
}
