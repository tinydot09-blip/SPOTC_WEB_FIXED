import {
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app';

import {
  getFirestore,
  type Firestore,
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

export const firebaseReady = true;

/*
 * Public browsing Firebase entry point.
 *
 * IMPORTANT:
 * This file intentionally does NOT import firebase/auth and does NOT call
 * getAuth(). Shop visitors can therefore browse Firestore products without
 * initializing Firebase Authentication.
 *
 * Existing authenticated/admin pages continue using lib/firebase.ts.
 */
const existingDefaultApp =
  getApps().find(
    (firebaseApp) =>
      firebaseApp.name ===
      '[DEFAULT]',
  );

let app: FirebaseApp;

if (existingDefaultApp) {
  app = existingDefaultApp;
} else {
  app = initializeApp(
    firebaseConfig,
  );
}

const firestoreInstance: Firestore =
  getFirestore(app);

export const db =
  firestoreInstance;

export const firebaseProjectId =
  firebaseConfig.projectId;
