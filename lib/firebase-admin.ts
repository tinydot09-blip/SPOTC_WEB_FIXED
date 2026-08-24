import {
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const encoded =
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error(
      'FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 is missing.',
    );
  }

  let serviceAccount: ServiceAccountJson;

  try {
    const json = Buffer.from(
      encoded,
      'base64',
    ).toString('utf8');

    serviceAccount =
      JSON.parse(json) as ServiceAccountJson;
  } catch (error) {
    console.error(
      'Firebase service account decode failed:',
      error,
    );

    throw new Error(
      'Firebase Admin service account is invalid.',
    );
  }

  if (
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error(
      'Firebase Admin service account fields are missing.',
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
  });

  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}