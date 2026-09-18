import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import {
  getAdminAuth,
  getAdminDb,
} from '@/lib/firebase-admin';

type OrderItem = Record<string, unknown>;
type OrderData = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function quantityOf(item: OrderItem): number {
  return Math.max(
    1,
    Number.parseInt(
      text(item.quantity ?? item.qty ?? item.count ?? 1),
      10,
    ) || 1,
  );
}

function productIdFromItem(item: OrderItem): string {
  const candidate =
    item.product_ref ??
    item.product_id ??
    item.productId ??
    item.business_product_id ??
    item.id;

  if (!candidate) return '';

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.includes('/')) {
      return trimmed.split('/').filter(Boolean).pop() || '';
    }
    return trimmed;
  }

  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'id' in candidate
  ) {
    return text((candidate as { id?: unknown }).id);
  }

  return '';
}

function isComboItem(item: OrderItem): boolean {
  return (
    item.is_combo_item === true ||
    Boolean(text(item.combo_parent_id))
  );
}

function isTryAtHomeItem(item: OrderItem): boolean {
  if (isComboItem(item)) return false;

  return (
    item.try_at_home === true ||
    item.tryAtHome === true
  );
}

function isTryAtHomeOrder(order: OrderData): boolean {
  const deliveryId = text(
    order.delivery_option_id ??
      order.delivery_option ??
      order.delivery_slot_id ??
      order.delivery_slot ??
      order.delivery_type ??
      order.fulfillment_type,
  ).toLowerCase();

  const deliveryTitle = text(
    order.delivery_option_title ??
      order.delivery_title ??
      order.delivery_slot_title ??
      order.delivery_slot_name,
  ).toLowerCase();

  return (
    order.is_try_at_home === true ||
    order.try_at_home === true ||
    deliveryId.includes('try_at_home') ||
    deliveryId.includes('try at home') ||
    deliveryTitle.includes('try at home') ||
    text(order.fulfillment_type).toLowerCase() ===
      'try_at_home'
  );
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get('authorization') || '';

    if (!authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing delivery authentication.',
        },
        { status: 401 },
      );
    }

    const token = authorization
      .slice('Bearer '.length)
      .trim();

    const auth = getAdminAuth();
    const db = getAdminDb();

    const decoded = await auth.verifyIdToken(token);
    const riderUid = decoded.uid;

    const riderSnap = await db
      .collection('DeliveryBoys')
      .doc(riderUid)
      .get();

    if (!riderSnap.exists) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Delivery account was not found.',
        },
        { status: 403 },
      );
    }

    const rider = riderSnap.data() || {};

    if (
      text(rider.role) !== 'delivery_boy' ||
      rider.is_active === false
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Delivery account is not active.',
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      orderId?: unknown;
      reason?: unknown;
    };

    const orderId = text(body.orderId);
    const reason = text(body.reason) || 'Not delivered';

    if (!orderId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Order ID is required.',
        },
        { status: 400 },
      );
    }

    const orderRef = db
      .collection('Orders')
      .doc(orderId);

    let releasedTryAtHome = false;

    await db.runTransaction(async (transaction) => {
      const orderSnap =
        await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order no longer exists.');
      }

      const order =
        (orderSnap.data() || {}) as OrderData;

      if (text(order.delivery_boy_id) !== riderUid) {
        throw new Error(
          'This order is not assigned to the logged-in delivery boy.',
        );
      }

      const status = normalizeStatus(
        order.order_status ?? order.status,
      );

      if (status === 'delivered') {
        throw new Error(
          'Delivered orders cannot be changed to Not Delivered.',
        );
      }

      if (status === 'cancelled') {
        throw new Error(
          'Cancelled order inventory is already handled.',
        );
      }

      const tryAtHomeOrder =
        isTryAtHomeOrder(order);

      const inventoryState =
        normalizeStatus(order.inventory_state);

      const items = Array.isArray(order.items)
        ? (order.items as OrderItem[])
        : [];

      const activeTryAtHomeItems = items.filter((item) => {
        const itemStatus = normalizeStatus(
          item.item_status ?? item.status,
        );

        return (
          itemStatus !== 'cancelled' &&
          isTryAtHomeItem(item)
        );
      });

      /*
       * Try-at-Home checkout reserves only the MAIN Try-at-Home items.
       * A failed visit releases those reservations. Combo children are
       * intentionally excluded.
       */
      if (
        tryAtHomeOrder &&
        inventoryState !== 'released' &&
        inventoryState !== 'sold' &&
        activeTryAtHomeItems.length > 0
      ) {
        const quantitiesByProduct =
          new Map<string, number>();

        for (const item of activeTryAtHomeItems) {
          const productId =
            productIdFromItem(item);

          if (!productId) continue;

          quantitiesByProduct.set(
            productId,
            (quantitiesByProduct.get(productId) || 0) +
              quantityOf(item),
          );
        }

        const products = new Map<
          string,
          {
            ref: FirebaseFirestore.DocumentReference;
            data: FirebaseFirestore.DocumentData;
          }
        >();

        for (const [productId] of quantitiesByProduct) {
          const productRef = db
            .collection('BusinessProducts')
            .doc(productId);

          const productSnap =
            await transaction.get(productRef);

          if (!productSnap.exists) continue;

          products.set(productId, {
            ref: productRef,
            data: productSnap.data() || {},
          });
        }

        for (const [productId, qty] of
          quantitiesByProduct) {
          const product =
            products.get(productId);

          if (!product) continue;

          const stock = Math.max(
            0,
            numberValue(
              product.data.stock_qty ??
                product.data.stock_quantity ??
                0,
            ),
          );

          const currentReserved = Math.max(
            0,
            numberValue(
              product.data.reserved_qty ?? 0,
            ),
          );

          const nextReserved = Math.max(
            0,
            currentReserved - qty,
          );

          transaction.update(product.ref, {
            reserved_qty: nextReserved,
            available_qty: Math.max(
              0,
              stock - nextReserved,
            ),
            reservation_status:
              nextReserved <= 0
                ? 'available'
                : nextReserved >= stock
                  ? 'reserved'
                  : 'partially_reserved',
            reserved_for_try_at_home:
              nextReserved > 0,
            is_in_stock:
              stock - nextReserved > 0,
            updated_at:
              FieldValue.serverTimestamp(),
          });
        }

        releasedTryAtHome = true;
      }

      transaction.update(orderRef, {
        delivery_status: 'not_delivered',
        delivery_assignment_status: 'not_delivered',
        delivery_failure_reason: reason,
        delivery_failed_at:
          FieldValue.serverTimestamp(),
        delivery_failed_by: riderUid,
        delivery_failed_by_name:
          text(rider.name) || 'Delivery Boy',

        ...(tryAtHomeOrder
          ? {
              inventory_state: 'released',
              inventory_released_at:
                FieldValue.serverTimestamp(),
              try_at_home_status: 'not_purchased',
              try_at_home_completed_at:
                FieldValue.serverTimestamp(),
              try_at_home_completed_by:
                riderUid,
              try_at_home_completed_by_name:
                text(rider.name) ||
                'Delivery Boy',
            }
          : {}),

        updated_at:
          FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      message: releasedTryAtHome
        ? 'Not Delivered. Try at Home reservation released and product is available again.'
        : 'Order marked Not Delivered.',
    });
  } catch (error) {
    console.error(
      'Delivery Not Delivered update failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update delivery result.',
      },
      { status: 400 },
    );
  }
}
