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
      return (
        trimmed.split('/').filter(Boolean).pop() || ''
      );
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

function normalizeStatus(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isComboItem(item: OrderItem): boolean {
  return (
    item.is_combo_item === true ||
    Boolean(text(item.combo_parent_id))
  );
}

function isTryAtHomeItem(item: OrderItem): boolean {
  /*
   * Try at Home belongs only to the MAIN product.
   * Combo child items must never be treated as
   * independent Try-at-Home items.
   */
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

    const orderRef = db
      .collection('Orders')
      .doc(orderId);

    let completedTryAtHome = false;

    await db.runTransaction(
      async (transaction) => {
        const orderSnap =
          await transaction.get(orderRef);

        if (!orderSnap.exists) {
          throw new Error(
            'Order no longer exists.',
          );
        }

        const order =
          (orderSnap.data() || {}) as OrderData;

        if (
          text(order.delivery_boy_id) !== riderUid
        ) {
          throw new Error(
            'This order is not assigned to the logged-in delivery boy.',
          );
        }

        const tryAtHomeOrder =
          isTryAtHomeOrder(order);

        completedTryAtHome = tryAtHomeOrder;

        const status = normalizeStatus(
          order.order_status ?? order.status,
        );

        /*
         * Idempotency guard:
         * if this API is called again after a successful
         * completion, do not reduce stock a second time.
         */
        if (status === 'delivered') {
          return;
        }

        if (status === 'cancelled') {
          throw new Error(
            'Cancelled orders cannot be delivered.',
          );
        }

        if (status !== 'out_for_delivery') {
          throw new Error(
            tryAtHomeOrder
              ? 'Try at Home visit must be started before completion.'
              : 'Order must be Out for Delivery before completion.',
          );
        }

        /*
         * Final completion means the customer accepted
         * the order. Payment must therefore be confirmed
         * before stock is converted from reserved -> sold.
         */
        if (
          normalizeStatus(order.payment_status) !==
          'paid'
        ) {
          throw new Error(
            tryAtHomeOrder
              ? 'Confirm payment after the customer accepts the Try at Home order before completing the visit.'
              : 'Payment must be confirmed before delivery completion.',
          );
        }

        const inventoryState =
          normalizeStatus(order.inventory_state);

        /*
         * A completed/sold order must never be processed
         * again. This is an additional double-stock guard.
         */
        if (inventoryState === 'sold') {
          transaction.update(orderRef, {
            order_status: 'delivered',
            status: 'delivered',
            delivery_status: 'delivered',
            delivery_assignment_status: 'delivered',
            delivered_at:
              order.delivered_at ||
              FieldValue.serverTimestamp(),
            updated_at:
              FieldValue.serverTimestamp(),
          });

          return;
        }

        if (inventoryState !== 'reserved') {
          throw new Error(
            'Inventory is not reserved for this order. Ask Admin to verify the order before delivery.',
          );
        }

        const items = Array.isArray(order.items)
          ? (order.items as OrderItem[])
          : [];

        const activeItems = items.filter(
          (item) => {
            const itemStatus = normalizeStatus(
              item.item_status ?? item.status,
            );

            return itemStatus !== 'cancelled';
          },
        );

        /*
         * Try at Home applies ONLY to main items.
         * Combo children remain part of the same order,
         * but are not independent Try-at-Home items.
         *
         * We still sell/release inventory for ALL active
         * order items after payment because combo children
         * are included in the accepted order.
         */
        const tryAtHomeMainItems =
          tryAtHomeOrder
            ? activeItems.filter(isTryAtHomeItem)
            : [];

        const quantitiesByProduct =
          new Map<string, number>();

        for (const item of activeItems) {
          const productId =
            productIdFromItem(item);

          if (!productId) continue;

          quantitiesByProduct.set(
            productId,
            (quantitiesByProduct.get(productId) ||
              0) + quantityOf(item),
          );
        }

        const products = new Map<
          string,
          {
            ref: FirebaseFirestore.DocumentReference;
            data: FirebaseFirestore.DocumentData;
          }
        >();

        for (const [productId] of
          quantitiesByProduct) {
          const productRef = db
            .collection('BusinessProducts')
            .doc(productId);

          const productSnap =
            await transaction.get(productRef);

          if (!productSnap.exists) {
            throw new Error(
              `Product ${productId} was not found.`,
            );
          }

          products.set(productId, {
            ref: productRef,
            data: productSnap.data() || {},
          });
        }

        for (const [
          productId,
          qty,
        ] of quantitiesByProduct) {
          const product =
            products.get(productId);

          if (!product) continue;

          const currentStock = Math.max(
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

          const currentSold = Math.max(
            0,
            numberValue(
              product.data.sold_qty ?? 0,
            ),
          );

          if (currentStock < qty) {
            throw new Error(
              `${text(
                product.data.title ??
                  product.data.product_name ??
                  productId,
              )} physical stock is below the ordered quantity.`,
            );
          }

          if (currentReserved < qty) {
            throw new Error(
              `${text(
                product.data.title ??
                  product.data.product_name ??
                  productId,
              )} reserved quantity is below the ordered quantity.`,
            );
          }

          const nextStock =
            currentStock - qty;

          const nextReserved =
            currentReserved - qty;

          transaction.update(product.ref, {
            stock_qty: nextStock,
            stock_quantity: nextStock,
            reserved_qty: nextReserved,
            available_qty: Math.max(
              0,
              nextStock - nextReserved,
            ),
            sold_qty: currentSold + qty,
            is_in_stock:
              nextStock - nextReserved > 0,
            updated_at:
              FieldValue.serverTimestamp(),
          });
        }

        transaction.update(orderRef, {
          order_status: 'delivered',
          status: 'delivered',
          delivery_status: 'delivered',
          delivery_assignment_status:
            'delivered',
          inventory_state: 'sold',

          /*
           * Canonical Try-at-Home completion fields.
           * These are harmless for normal delivery orders.
           */
          ...(tryAtHomeOrder
            ? {
                fulfillment_type:
                  'try_at_home',
                is_try_at_home: true,
                try_at_home: true,
                try_at_home_status:
                  'completed',
                try_at_home_completed_at:
                  FieldValue.serverTimestamp(),
                try_at_home_completed_by:
                  riderUid,
                try_at_home_completed_by_name:
                  text(rider.name) ||
                  'Delivery Boy',
                try_at_home_item_count:
                  tryAtHomeMainItems.length ||
                  numberValue(
                    order.try_at_home_item_count,
                  ),
              }
            : {}),

          delivered_at:
            FieldValue.serverTimestamp(),
          delivery_completed_at:
            FieldValue.serverTimestamp(),
          delivery_completed_by: riderUid,
          delivery_completed_by_name:
            text(rider.name) ||
            'Delivery Boy',
          updated_at:
            FieldValue.serverTimestamp(),
        });
      },
    );

    return NextResponse.json({
      ok: true,
      message: completedTryAtHome
        ? 'Try at Home visit completed and inventory updated.'
        : 'Order delivered and inventory updated.',
    });
  } catch (error) {
    console.error(
      'Delivery completion failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to complete delivery.',
      },
      { status: 400 },
    );
  }
}
