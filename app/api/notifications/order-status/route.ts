import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import {
  getAdminAuth,
  getAdminDb,
  getAdminMessaging,
} from '@/lib/firebase-admin';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'picking'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

const ALLOWED_STATUSES = new Set<OrderStatus>([
  'pending',
  'confirmed',
  'picking',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function customerUid(data: FirebaseFirestore.DocumentData): string {
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

function itemTitles(
  data: FirebaseFirestore.DocumentData,
): string[] {
  if (!Array.isArray(data.items)) return [];

  return data.items
    .filter(
      (item: FirebaseFirestore.DocumentData) =>
        item?.is_free_gift !== true &&
        item?.isFreeGift !== true &&
        text(item?.type).toLowerCase() !== 'free_gift',
    )
    .map((item: FirebaseFirestore.DocumentData) =>
      text(
        item.title ??
          item.product_name ??
          item.name,
      ),
    )
    .filter(Boolean);
}

function freeGiftCount(
  data: FirebaseFirestore.DocumentData,
): number {
  const candidates: FirebaseFirestore.DocumentData[] = [];

  for (const source of [
    data.free_gifts,
    data.selected_free_gifts,
    data.freeGifts,
    data.selectedFreeGifts,
    data.gifts,
  ]) {
    if (Array.isArray(source)) {
      candidates.push(...source);
    }
  }

  const unique = new Set<string>();

  candidates.forEach((gift, index) => {
    if (!gift || typeof gift !== 'object') return;

    const key =
      text(
        gift.id ??
          gift.product_id ??
          gift.productId ??
          gift.gift_id ??
          gift.giftId,
      ) ||
      [
        text(gift.title ?? gift.name ?? gift.gift_name),
        text(gift.image ?? gift.image_url ?? gift.thumbnail_url),
      ]
        .filter(Boolean)
        .join('|') ||
      `gift-${index}`;

    unique.add(key);
  });

  return unique.size;
}

function deliveryText(
  data: FirebaseFirestore.DocumentData,
): string {
  const title = text(
    data.delivery_option_title ??
      data.delivery_title ??
      data.delivery_slot_title ??
      data.delivery_slot_name,
  );

  const window = text(
    data.delivery_window ??
      data.delivery_time ??
      data.delivery_time_window ??
      data.delivery_slot_time ??
      data.delivery_slot_window ??
      data.estimated_delivery,
  );

  return [title, window].filter(Boolean).join(' • ');
}

function notificationCopy(
  status: OrderStatus,
  product: string,
  giftCount: number,
  delivery: string,
): { title: string; body: string } {
  const gift =
    giftCount > 0
      ? ` + ${giftCount} FREE gift${giftCount === 1 ? '' : 's'}`
      : '';

  const item = product || 'Your order';

  switch (status) {
    case 'confirmed':
      return {
        title: 'SPOTC — Order Confirmed',
        body: `${item}${gift} confirmed.${delivery ? ` ${delivery}` : ''}`,
      };
    case 'picking':
      return {
        title: 'SPOTC — Preparing Your Order',
        body: `${item}${gift} is being picked for you.`,
      };
    case 'packed':
      return {
        title: 'SPOTC — Order Packed',
        body: `${item}${gift} is packed and ready for delivery.`,
      };
    case 'out_for_delivery':
      return {
        title: 'SPOTC — Out for Delivery',
        body: `${item}${gift} is on the way to you.`,
      };
    case 'delivered':
      return {
        title: 'SPOTC — Delivered',
        body: `${item}${gift} has been delivered.`,
      };
    case 'cancelled':
      return {
        title: 'SPOTC — Order Cancelled',
        body: `${item}${gift} has been cancelled.`,
      };
    default:
      return {
        title: 'SPOTC — Order Update',
        body: `${item} status has been updated.`,
      };
  }
}

async function requireSignedInAdmin(request: NextRequest) {
  const authorization =
    request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED');
  }

  const idToken = authorization.slice(7).trim();

  if (!idToken) {
    throw new Error('UNAUTHENTICATED');
  }

  const decoded =
    await getAdminAuth().verifyIdToken(idToken);

  /*
   * Keep this server route restricted to the same permanent
   * SPOTC admin accounts used by the admin UI.
   */
  const allowedEmails = new Set([
    'tinydot09@gmail.com',
    'shashanth.in09@gmail.com',
  ]);

  const email = text(decoded.email).toLowerCase();

  if (!email || !allowedEmails.has(email)) {
    throw new Error('FORBIDDEN');
  }

  return decoded;
}

export async function POST(request: NextRequest) {
  try {
    await requireSignedInAdmin(request);

    const body = (await request.json()) as {
      orderId?: unknown;
      status?: unknown;
    };

    const orderId = text(body.orderId);
    const status = text(body.status) as OrderStatus;

    if (!orderId || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid order notification request.',
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
    const uid = customerUid(order);

    if (!uid) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This order does not contain a customer user ID, so a push notification cannot be routed.',
        },
        { status: 422 },
      );
    }

    const userRef =
      adminDb.collection('Users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'The customer user record was not found.',
        },
        { status: 404 },
      );
    }

    const userData = userSnap.data() || {};

    const tokens = Array.from(
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

    const titles = itemTitles(order);
    const firstProduct =
      titles.length > 1
        ? `${titles[0]} + ${titles.length - 1} more`
        : titles[0] || 'Your order';

    const gifts = freeGiftCount(order);
    const delivery = deliveryText(order);
    const copy = notificationCopy(
      status,
      firstProduct,
      gifts,
      delivery,
    );

    const notificationRef =
      userRef.collection('Notifications').doc();

    await notificationRef.set({
      type: 'order_status',
      order_id: orderId,
      order_number: orderNumber(orderId, order),
      status,
      title: copy.title,
      body: copy.body,
      url: '/dashboard?tab=orders',
      is_read: false,
      created_at: FieldValue.serverTimestamp(),
    });

    if (tokens.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        message:
          'Dashboard notification saved. This customer has no browser notification token yet.',
      });
    }

    /*
     * Data-only payload:
     * firebase-messaging-sw.js displays it, avoiding
     * duplicate background notifications.
     */
    const response =
      await getAdminMessaging().sendEachForMulticast({
        tokens,
        data: {
          title: copy.title,
          body: copy.body,
          url: '/dashboard?tab=orders',
          orderId,
          orderNumber: orderNumber(orderId, order),
          status,
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
        },
      });

    const invalidTokens: string[] = [];

    response.responses.forEach((result, index) => {
      if (result.success) return;

      const code = result.error?.code || '';

      if (
        code ===
          'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    if (invalidTokens.length > 0) {
      await userRef.set(
        {
          fcm_tokens:
            FieldValue.arrayRemove(...invalidTokens),
          browser_notification_updated_at:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: response.successCount,
      failed: response.failureCount,
      message:
        response.successCount > 0
          ? 'Customer notification sent.'
          : 'No browser notification was delivered.',
    });
  } catch (error) {
    console.error(
      '[SPOTC] Order notification route failed:',
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown notification error.';

    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Admin sign-in is required.',
        },
        { status: 401 },
      );
    }

    if (message === 'FORBIDDEN') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This account is not allowed to send order notifications.',
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
