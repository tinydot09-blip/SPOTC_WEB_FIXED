import {
  getApp,
  getApps,
  initializeApp,
} from 'firebase/app';

import {
  getAuth,
} from 'firebase/auth';

import {
  getFirestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:
    'AIzaSyD88tq10uSyzJO-F55KRlg9p8NqWn-15Xw',

  authDomain:
    'spotit-9lnwv9.firebaseapp.com',

  projectId:
    'spotit-9lnwv9',

  storageBucket:
    'spotit-9lnwv9.firebasestorage.app',

  messagingSenderId:
    '457147494277',

  appId:
    '1:457147494277:web:be35b6dcad2a7c31831eec',
};

const DELIVERY_APP_NAME =
  'spotc-delivery';

const deliveryApp =
  getApps().some(
    (app) =>
      app.name ===
      DELIVERY_APP_NAME,
  )
    ? getApp(
        DELIVERY_APP_NAME,
      )
    : initializeApp(
        firebaseConfig,
        DELIVERY_APP_NAME,
      );

export const deliveryAuth =
  getAuth(deliveryApp);

export const deliveryDb =
  getFirestore(deliveryApp);