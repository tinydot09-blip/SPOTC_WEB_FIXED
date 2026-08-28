/* SPOTC Firebase Cloud Messaging Service Worker */

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyD88tq10uSyzJO-F55KRlg9p8NqWn-15Xw',
  authDomain: 'spotit-9lnwv9.firebaseapp.com',
  projectId: 'spotit-9lnwv9',
  storageBucket: 'spotit-9lnwv9.firebasestorage.app',
  messagingSenderId: '457147494277',
  appId: '1:457147494277:web:be35b6dcad2a7c31831eec',
});

const messaging = firebase.messaging();

/*
 * Activate new service-worker versions immediately.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * FCM data-only background message.
 */
messaging.onBackgroundMessage((payload) => {
  console.log(
    '[SPOTC] Background FCM received:',
    payload
  );

  const data = payload?.data || {};

  const title =
    data.title ||
    payload?.notification?.title ||
    'SPOTC';

  const body =
    data.body ||
    payload?.notification?.body ||
    'You have a new order update.';

  const url =
    data.url ||
    '/dashboard?tab=orders';

  const orderId =
    data.orderId || '';

  const options = {
    body,

    icon: '/images/web-logo-color.png',
    badge: '/images/web-logo-color.png',

    data: {
      url,
      orderId,
    },

    tag:
      orderId ||
      `spotc-${Date.now()}`,

    renotify: true,
    requireInteraction: false,
  };

  return self.registration.showNotification(
    title,
    options
  );
});

/*
 * Notification click:
 * open/focus SPOTC Orders.
 */
self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const relativeUrl =
      event.notification?.data?.url ||
      '/dashboard?tab=orders';

    const targetUrl = new URL(
      relativeUrl,
      self.location.origin
    ).href;

    event.waitUntil(
      self.clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then((clientList) => {
          for (const client of clientList) {
            if (
              client.url.startsWith(
                self.location.origin
              )
            ) {
              if ('navigate' in client) {
                client.navigate(
                  targetUrl
                );
              }

              if ('focus' in client) {
                return client.focus();
              }
            }
          }

          if (self.clients.openWindow) {
            return self.clients.openWindow(
              targetUrl
            );
          }

          return undefined;
        })
    );
  }
);