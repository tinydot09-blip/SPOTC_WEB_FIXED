import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import {
  getAdminAuth,
  getAdminDb,
  getAdminMessaging,
} from '@/lib/firebase-admin';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function customerUid(
  data: FirebaseFirestore.DocumentData,
): string {
  const direct =
    data.user_uid ??
    data.user_id ??
    data.customer_uid ??
    data.customer_id ??
    data.uid;

  if (typeof direct === 'string') {
    return direct.trim();
  }

  if (
    direct &&
    typeof direct === 'object' &&
    typeof direct.id === 'string'
  ) {
    return direct.id.trim();
  }

  const ref = data.user_ref ?? data.customer_ref;

  if (
    ref &&
    typeof ref === 'object' &&
    typeof ref.id === 'string'
  ) {
    return ref.id.trim();
  }

  if (typeof ref === 'string') {
    return ref.split('/').filter(Boolean).pop() || '';
  }

  return '';
}

function orderNumber(
  id: string,
  data: FirebaseFirestore.DocumentData,
): string {
  return (
    text(data.order_number) ||
    text(data.order_id) ||
    id
  );
}

function orderTotal(
  data: FirebaseFirestore.DocumentData,
): number {
  return numberValue(
    data.total ??
      data.grand_total ??
      data.total_amount ??
      data.amount ??
      0,
  );
}

async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  url: string,
  orderId: string,
  number: string,
) {
  if (tokens.length === 0) {
    return;
  }

  try {
    await getAdminMessaging().sendEachForMulticast({
      tokens,
      data: {
        title,
        body,
        url,
        orderId,
        orderNumber: number,
        type: 'order_placed',
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
      },
    });
  } catch (error) {
    // Notification failure must never fail the order.
    console.error(
      '[SPOTC] Order placed push failed:',
      error,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get('authorization') || '';

    if (!authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Sign-in required.',
        },
        { status: 401 },
      );
    }

    const idToken = authorization.slice(7).trim();

    if (!idToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Sign-in required.',
        },
        { status: 401 },
      );
    }

    const decoded =
      await getAdminAuth().verifyIdToken(idToken);

    const body = (await request.json()) as {
      orderId?: unknown;
    };

    const orderId = text(body.orderId);

    if (!orderId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Order ID is required.',
        },
        { status: 400 },
      );
    }

    const adminDb = getAdminDb();

    const orderRef =
      adminDb.collection('Orders').doc(orderId);

    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Order was not found.',
        },
        { status: 404 },
      );
    }

    const order = orderSnap.data() || {};

    /*
     * SECURITY:
     * The signed-in customer may only trigger a
     * notification for their own order.
     */
    const uid = customerUid(order);

    if (!uid || uid !== decoded.uid) {
      return NextResponse.json(
        {
          ok: false,
          error: 'This order does not belong to you.',
        },
        { status: 403 },
      );
    }

    const number = orderNumber(orderId, order);
    const total = orderTotal(order);

    /*
     * CUSTOMER NOTIFICATION
     */
    const userRef =
      adminDb.collection('Users').doc(uid);

    const userSnap = await userRef.get();
    const userData = userSnap.exists
      ? userSnap.data() || {}
      : {};

    const customerTokens = Array.from(
      new Set(
        [
          ...(Array.isArray(userData.fcm_tokens)
            ? userData.fcm_tokens
            : []),
          userData.fcm_token_last,
        ]
          .map(text)
          .filter(Boolean),
      ),
    );

    const customerTitle =
      'SPOTC — Order Placed';

    const customerBody =
      `We received your order #${number}.`;

    await userRef
      .collection('Notifications')
      .doc()
      .set({
        type: 'order_placed',
        order_id: orderId,
        order_number: number,
        status: 'pending',
        title: customerTitle,
        body: customerBody,
        url: '/dashboard?tab=orders',
        is_read: false,
        created_at: FieldValue.serverTimestamp(),
      });

    await sendPush(
      customerTokens,
      customerTitle,
      customerBody,
      '/dashboard?tab=orders',
      orderId,
      number,
    );

    /*
     * ADMIN NOTIFICATION
     *
     * Save one shared admin notification.
     * This can later be used by an Admin
     * notification bell/page.
     */
    const adminTitle = 'SPOTC — New Order';

    const adminBody =
      `Order #${number} received • ₹${Math.round(total)}`;

    await adminDb
      .collection('AdminNotifications')
      .doc()
      .set({
        type: 'new_order',
        order_id: orderId,
        order_number: number,
        title: adminTitle,
        body: adminBody,
        url: `/admin/orders?search=${encodeURIComponent(
          number,
        )}`,
        is_read: false,
        created_at: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({
      ok: true,
      orderId,
      orderNumber: number,
      customerNotification: true,
      adminNotification: true,
    });
  } catch (error) {
    console.error(
      '[SPOTC] Order placed notification failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Notification failed.',
      },
      { status: 500 },
    );
  }
}