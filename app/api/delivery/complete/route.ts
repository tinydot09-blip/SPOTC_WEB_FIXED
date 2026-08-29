import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import {
  getAdminAuth,
  getAdminDb,
} from '@/lib/firebase-admin';

type OrderItem = Record<string, unknown>;

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

function normalizeStatus(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get('authorization') || '';

    if (!authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { ok: false, error: 'Missing delivery authentication.' },
        { status: 401 },
      );
    }

    const token = authorization.slice('Bearer '.length).trim();

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
        { ok: false, error: 'Delivery account was not found.' },
        { status: 403 },
      );
    }

    const rider = riderSnap.data() || {};

    if (
      text(rider.role) !== 'delivery_boy' ||
      rider.is_active === false
    ) {
      return NextResponse.json(
        { ok: false, error: 'Delivery account is not active.' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      orderId?: unknown;
    };

    const orderId = text(body.orderId);

    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: 'Order ID is required.' },
        { status: 400 },
      );
    }

    const orderRef = db.collection('Orders').doc(orderId);

    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order no longer exists.');
      }

      const order = orderSnap.data() || {};

      if (text(order.delivery_boy_id) !== riderUid) {
        throw new Error(
          'This order is not assigned to the logged-in delivery boy.',
        );
      }

      const status = normalizeStatus(
        order.order_status ?? order.status,
      );

      if (status === 'cancelled') {
        throw new Error('Cancelled orders cannot be delivered.');
      }

      if (status === 'delivered') {
        return;
      }

      if (status !== 'out_for_delivery') {
        throw new Error(
          'Order must be Out for Delivery before completion.',
        );
      }

      if (
        normalizeStatus(order.payment_status) !== 'paid'
      ) {
        throw new Error(
          'Payment must be confirmed before delivery completion.',
        );
      }

      const inventoryState =
        normalizeStatus(order.inventory_state);

      if (inventoryState !== 'reserved') {
        throw new Error(
          'Inventory is not reserved for this order. Ask Admin to verify the order before delivery.',
        );
      }

      const items = Array.isArray(order.items)
        ? (order.items as OrderItem[])
        : [];

      const quantitiesByProduct = new Map<string, number>();

      for (const item of items) {
        const itemStatus = normalizeStatus(
          item.item_status ?? item.status,
        );

        if (itemStatus === 'cancelled') {
          continue;
        }

        const productId = productIdFromItem(item);
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

      for (const [productId, qty] of quantitiesByProduct) {
        const product = products.get(productId);
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
          numberValue(product.data.reserved_qty ?? 0),
        );

        const currentSold = Math.max(
          0,
          numberValue(product.data.sold_qty ?? 0),
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

        const nextStock = currentStock - qty;
        const nextReserved = currentReserved - qty;

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
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(orderRef, {
        order_status: 'delivered',
        status: 'delivered',
        delivery_status: 'delivered',
        delivery_assignment_status: 'delivered',
        inventory_state: 'sold',
        delivered_at: FieldValue.serverTimestamp(),
        delivery_completed_at:
          FieldValue.serverTimestamp(),
        delivery_completed_by: riderUid,
        delivery_completed_by_name:
          text(rider.name) || 'Delivery Boy',
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      message: 'Order delivered and inventory updated.',
    });
  } catch (error) {
    console.error('Delivery completion failed:', error);

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
