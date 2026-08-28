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

messaging.onBackgroundMessage((payload) => {
  console.log(
    '[SPOTC] Background notification:',
    payload
  );

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

  self.registration.showNotification(title, {
    body,
    icon: '/images/web-logo-color.png',
    badge: '/images/web-logo-color.png',

    data: {
      url,
      orderId:
        payload.data?.orderId || '',
    },

    tag:
      payload.data?.orderId ||
      'spotc-order-update',

    renotify: true,
  });
});

self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification.data?.url ||
      '/dashboard?tab=orders';

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then((clientList) => {
          for (const client of clientList) {
            if (
              'focus' in client
            ) {
              client.navigate(targetUrl);
              return client.focus();
            }
          }

          if (clients.openWindow) {
            return clients.openWindow(
              targetUrl
            );
          }
        })
    );
  }
);