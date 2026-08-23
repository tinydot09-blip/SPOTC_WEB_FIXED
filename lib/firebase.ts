import {
  getApp,
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
  apiKey: 'AIzaSyD88tq10uSyzJO-F55KRlg9p8NqWn-15Xw',
  authDomain: 'spotit-9lnwv9.firebaseapp.com',
  projectId: 'spotit-9lnwv9',
  storageBucket: 'spotit-9lnwv9.firebasestorage.app',
  messagingSenderId: '457147494277',
  appId: '1:457147494277:web:be35b6dcad2a7c31831eec',
};

export const firebaseReady = true;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

app = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);

authInstance = getAuth(app);
firestoreInstance = getFirestore(app);
storageInstance = getStorage(app);

export const auth = authInstance;
export const db = firestoreInstance;
export const storage = storageInstance;

export const firebaseProjectId = firebaseConfig.projectId;