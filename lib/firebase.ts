import {
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app';

import {
  getAuth,
  type Auth,
} from 'firebase/auth';

import {
  getFirestore,
  type Firestore,
} from 'firebase/firestore';

import {
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage';

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
 * IMPORTANT:
 *
 * SPOTC's normal website uses Firebase's DEFAULT app.
 *
 * Delivery uses a separate named Firebase app:
 * "spotc-delivery".
 *
 * getApps().length > 0 is NOT enough because the
 * delivery app may exist while the DEFAULT app does not.
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

const authInstance: Auth =
  getAuth(app);

const firestoreInstance: Firestore =
  getFirestore(app);

const storageInstance: FirebaseStorage =
  getStorage(app);

export const auth =
  authInstance;

export const db =
  firestoreInstance;

export const storage =
  storageInstance;

export const firebaseProjectId =
  firebaseConfig.projectId;