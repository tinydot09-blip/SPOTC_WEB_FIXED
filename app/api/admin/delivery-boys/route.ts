import { NextRequest, NextResponse } from 'next/server';

import {
  getAdminAuth,
  getAdminDb,
} from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const ADMIN_EMAILS = [
  'tinydot09@gmail.com',
  'shashanth.in09@gmail.com',
];

function cleanPhone(value: unknown): string {
  return String(value ?? '')
    .replace(/\D+/g, '')
    .trim();
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function riderEmail(phone: string): string {
  return `delivery-${phone}@spotc.in`;
}

async function verifyAdmin(
  request: NextRequest,
) {
  const authorization =
    request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const idToken = authorization
    .slice(7)
    .trim();

  if (!idToken) {
    throw new Error('UNAUTHORIZED');
  }

  const auth = getAdminAuth();
  const adminDb = getAdminDb();

  const decoded =
    await auth.verifyIdToken(idToken);

  const email =
    decoded.email?.trim().toLowerCase() || '';

  if (
    ADMIN_EMAILS.includes(email)
  ) {
    return decoded;
  }

  const userSnap =
    await adminDb
      .collection('Users')
      .doc(decoded.uid)
      .get();

  const userData =
    userSnap.exists
      ? userSnap.data()
      : null;

  const allowed =
    userData?.is_admin === true ||
    userData?.isAdmin === true ||
    userData?.role === 'admin' ||
    userData?.role === 'super_admin';

  if (!allowed) {
    throw new Error('FORBIDDEN');
  }

  return decoded;
}

export async function POST(
  request: NextRequest,
) {
  try {
    const adminUser =
      await verifyAdmin(request);

    const body = await request.json();

    const name =
      cleanText(body.name);

    const phone =
      cleanPhone(body.phone);

    const pin =
      cleanText(body.pin);

    const vehicleNumber =
      cleanText(
        body.vehicleNumber,
      ).toUpperCase();

    if (!name) {
      return NextResponse.json(
        {
          error:
            'Delivery boy name is required.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      phone.length < 10 ||
      phone.length > 15
    ) {
      return NextResponse.json(
        {
          error:
            'Enter a valid mobile number.',
        },
        {
          status: 400,
        },
      );
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        {
          error:
            'PIN must contain 4 to 6 digits.',
        },
        {
          status: 400,
        },
      );
    }

    const auth = getAdminAuth();
    const adminDb = getAdminDb();

    /*
     * Firebase email/password authentication requires
     * a password of at least 6 characters.
     *
     * If Admin enters a 4 or 5 digit PIN, pad the
     * internal Firebase password. The rider will still
     * enter only the PIN on the SPOTC login page.
     */
    const firebasePassword =
      `SP${pin}#`.padEnd(8, '0');

    const email =
      riderEmail(phone);

    /*
     * Make sure the phone number has not already been
     * registered as another delivery boy.
     */
    const duplicate =
      await adminDb
        .collection('DeliveryBoys')
        .where('phone', '==', phone)
        .limit(1)
        .get();

    if (!duplicate.empty) {
      return NextResponse.json(
        {
          error:
            'A delivery boy with this mobile number already exists.',
        },
        {
          status: 409,
        },
      );
    }

    let firebaseUser;

    try {
      firebaseUser =
        await auth.createUser({
          email,
          password:
            firebasePassword,
          displayName: name,
          disabled: false,
        });
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code,
            )
          : '';

      if (
        code ===
        'auth/email-already-exists'
      ) {
        return NextResponse.json(
          {
            error:
              'This mobile number already has a delivery login.',
          },
          {
            status: 409,
          },
        );
      }

      throw error;
    }

    try {
      await adminDb
        .collection('DeliveryBoys')
        .doc(firebaseUser.uid)
        .set({
          uid: firebaseUser.uid,

          name,
          phone,
          vehicle_number:
            vehicleNumber,

          auth_email: email,

          role: 'delivery_boy',
          is_active: true,

          assigned_orders: 0,
          active_deliveries: 0,
          completed_deliveries: 0,

          created_by_uid:
            adminUser.uid,

          created_by_email:
            adminUser.email || '',

          created_at:
            new Date(),

          updated_at:
            new Date(),
        });
    } catch (error) {
      /*
       * If Firestore creation fails, remove the Auth
       * account so we don't leave a half-created rider.
       */
      await auth
        .deleteUser(firebaseUser.uid)
        .catch(() => undefined);

      throw error;
    }

    return NextResponse.json({
      ok: true,

      deliveryBoy: {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name,
        phone,
        vehicleNumber,
        isActive: true,
      },
    });
  } catch (error) {
    console.error(
      'Create delivery boy API failed:',
      error,
    );

    if (
      error instanceof Error &&
      error.message === 'UNAUTHORIZED'
    ) {
      return NextResponse.json(
        {
          error:
            'Admin login required.',
        },
        {
          status: 401,
        },
      );
    }

    if (
      error instanceof Error &&
      error.message === 'FORBIDDEN'
    ) {
      return NextResponse.json(
        {
          error:
            'You do not have admin permission.',
        },
        {
          status: 403,
        },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create delivery boy.',
      },
      {
        status: 500,
      },
    );
  }
}