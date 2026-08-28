'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { auth, db } from '@/lib/firebase';

type OrderRow = {
  id: string;
  data: DocumentData;
};

type ProductInfo = {
  id: string;
  title: string;
  image: string;
  sku: string;
  rack: string;
  box: string;
  slot: string;
  stock: number;
  reserved: number;
  sold: number;
  available: number;
};

type DeliveryBoyInfo = {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  isActive: boolean;
};

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'picking'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

type InventoryState = 'none' | 'reserved' | 'sold' | 'released';

type StatusFilter = 'all' | OrderStatus;
type PeriodFilter = 'all' | 'today' | 'delivered_today';
type SortOption = 'newest' | 'oldest' | 'total_high' | 'total_low';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STATUS_FLOW: Array<{
  value: OrderStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'picking', label: 'Picking' },
  { value: 'packed', label: 'Packed' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  return Number(value) || 0;
}

function createdMillis(data: DocumentData): number {
  const value = data.created_at;

  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampMillis(value: unknown): number {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }

  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTodayMillis(millis: number): boolean {
  if (!millis) return false;

  const date = new Date(millis);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function deliveredMillis(data: DocumentData): number {
  return timestampMillis(
    data.delivered_at ??
      data.deliveredAt ??
      data.updated_at ??
      data.updatedAt,
  );
}

function formatDate(data: DocumentData): string {
  const value = data.created_at;

  try {
    if (value?.toDate) {
      return value.toDate().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const millis = createdMillis(data);
    if (!millis) return '—';

    return new Date(millis).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function normalizeStatus(value: unknown): OrderStatus {
  const raw = text(value).toLowerCase().replace(/\s+/g, '_');

  if (
    raw === 'confirmed' ||
    raw === 'accepted' ||
    raw === 'processing'
  ) {
    return 'confirmed';
  }

  if (raw === 'picking' || raw === 'picked') {
    return 'picking';
  }

  if (raw === 'packed' || raw === 'ready') {
    return 'packed';
  }

  if (
    raw === 'out_for_delivery' ||
    raw === 'out_for_delivery_' ||
    raw === 'shipped' ||
    raw === 'dispatch' ||
    raw === 'dispatched'
  ) {
    return 'out_for_delivery';
  }

  if (
    raw === 'delivered' ||
    raw === 'completed' ||
    raw === 'complete'
  ) {
    return 'delivered';
  }

  if (
    raw === 'cancelled' ||
    raw === 'canceled' ||
    raw === 'rejected'
  ) {
    return 'cancelled';
  }

  return 'pending';
}

function normalizeInventoryState(value: unknown): InventoryState {
  const raw = text(value).toLowerCase();

  if (raw === 'reserved') return 'reserved';
  if (raw === 'sold') return 'sold';
  if (raw === 'released') return 'released';

  return 'none';
}

function orderNumber(row: OrderRow): string {
  return (
    text(row.data.order_number) ||
    text(row.data.order_id) ||
    row.id
  );
}

function orderItems(data: DocumentData): DocumentData[] {
  return Array.isArray(data.items) ? data.items : [];
}

type FreeGiftInfo = {
  id: string;
  title: string;
  image: string;
  originalPrice: number;
};

function freeGiftsFromOrder(data: DocumentData): FreeGiftInfo[] {
  const candidates: unknown[] = [];

  const topLevelSources = [
    data.free_gifts,
    data.selected_free_gifts,
    data.freeGifts,
    data.selectedFreeGifts,
    data.gifts,
  ];

  for (const source of topLevelSources) {
    if (Array.isArray(source)) {
      candidates.push(...source);
    }
  }

  for (const item of orderItems(data)) {
    if (
      item?.is_free_gift === true ||
      item?.isFreeGift === true ||
      text(item?.type).toLowerCase() === 'free_gift'
    ) {
      candidates.push(item);
    }

    const nestedSources = [
      item?.free_gifts,
      item?.selected_free_gifts,
      item?.freeGifts,
      item?.selectedFreeGifts,
      item?.gifts,
    ];

    for (const source of nestedSources) {
      if (Array.isArray(source)) {
        candidates.push(...source);
      }
    }
  }

  const unique = new Map<string, FreeGiftInfo>();

  candidates.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return;

    const gift = candidate as DocumentData;

    const id =
      text(
        gift.id ??
          gift.product_id ??
          gift.productId ??
          gift.gift_id ??
          gift.giftId,
      ) || `gift-${index}`;

    const title =
      text(
        gift.title ??
          gift.product_name ??
          gift.name ??
          gift.gift_name ??
          gift.giftName,
      ) || 'FREE Gift';

    const image = text(
      gift.image ??
        gift.image_url ??
        gift.product_image ??
        gift.product_image_url ??
        gift.thumbnail_url,
    );

    const originalPrice = Math.max(
      0,
      numberValue(
        gift.original_price ??
          gift.originalPrice ??
          gift.mrp ??
          gift.price ??
          0,
      ),
    );

    unique.set(id, {
      id,
      title,
      image,
      originalPrice,
    });
  });

  return [...unique.values()];
}

function quantityOf(item: DocumentData): number {
  return Math.max(
    1,
    Number.parseInt(
      text(item.quantity ?? item.qty ?? 1),
      10,
    ) || 1,
  );
}

function itemTitle(item: DocumentData): string {
  return text(
    item.title ??
      item.product_name ??
      item.name ??
      'Product',
  );
}

function itemImage(item: DocumentData): string {
  return text(
    item.image ??
      item.image_url ??
      item.product_image ??
      item.thumbnail_url,
  );
}

function productIdFromItem(item: DocumentData): string {
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
    return text(
      (candidate as { id?: unknown }).id,
    );
  }

  return '';
}

function customerName(data: DocumentData): string {
  return text(
    data.customer_name ??
      data.user_name ??
      data.name ??
      data.delivery_name ??
      data.address?.name ??
      'Customer',
  );
}

function customerPhone(data: DocumentData): string {
  return text(
    data.customer_phone ??
      data.phone ??
      data.phone_number ??
      data.delivery_phone ??
      data.address?.phone ??
      data.address?.phone_number,
  );
}

function addressText(data: DocumentData): string {
  const address = data.address ?? data.delivery_address;

  if (typeof address === 'string') {
    return address.trim();
  }

  if (address && typeof address === 'object') {
    return [
      address.house_no,
      address.street,
      address.area,
      address.city,
      address.pincode,
    ]
      .map(text)
      .filter(Boolean)
      .join(', ');
  }

  return text(
    data.address_text ??
      data.delivery_address_text ??
      data.shipping_address,
  );
}

function paymentLabel(data: DocumentData): string {
  const payment = text(
    data.payment_method ??
      data.payment_mode ??
      data.payment_type,
  ).toLowerCase();

  if (!payment) return '—';

  if (
    payment === 'cod' ||
    payment.includes('cash')
  ) {
    return 'COD';
  }

  return payment.toUpperCase();
}

function orderTotal(data: DocumentData): number {
  return numberValue(
    data.total ??
      data.grand_total ??
      data.total_amount ??
      data.amount ??
      0,
  );
}

function itemUnitPrice(item: DocumentData): number {
  return Math.max(
    0,
    numberValue(
      item.price ??
        item.unit_price ??
        item.selling_price ??
        item.offer_price ??
        item.final_price ??
        0,
    ),
  );
}

function itemLineTotal(item: DocumentData): number {
  const stored = numberValue(
    item.subtotal ??
      item.line_total ??
      item.total ??
      item.amount,
  );

  if (stored > 0) return stored;

  return itemUnitPrice(item) * quantityOf(item);
}

function orderSubtotal(data: DocumentData): number {
  const stored = numberValue(
    data.subtotal ??
      data.products_subtotal ??
      data.item_subtotal,
  );

  if (stored > 0) return stored;

  return orderItems(data).reduce(
    (sum, item) => sum + itemLineTotal(item),
    0,
  );
}

function orderDeliveryCharge(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(
      data.delivery_charge ??
        data.delivery_fee ??
        data.shipping_charge ??
        data.shipping_fee ??
        0,
    ),
  );
}

function orderPlatformFee(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(
      data.platform_fee ??
        data.service_fee ??
        data.handling_fee ??
        0,
    ),
  );
}

function orderDiscount(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(
      data.discount ??
        data.discount_amount ??
        data.coupon_discount ??
        0,
    ),
  );
}

type DeliveryBookingInfo = {
  id: string;
  title: string;
  window: string;
};

function deliveryBookingInfo(
  data: DocumentData,
): DeliveryBookingInfo {
  const rawId = text(
    data.delivery_option_id ??
      data.delivery_option ??
      data.delivery_slot_id ??
      data.delivery_slot ??
      data.delivery_type ??
      data.delivery_mode ??
      data.shipping_tier,
  ).toLowerCase();

  const rawTitle = text(
    data.delivery_option_title ??
      data.delivery_title ??
      data.delivery_slot_title ??
      data.delivery_slot_name ??
      data.shipping_tier,
  );

  const rawWindow = text(
    data.delivery_window ??
      data.delivery_time ??
      data.delivery_time_window ??
      data.delivery_slot_time ??
      data.delivery_slot_window ??
      data.estimated_delivery,
  );

  let id = rawId;
  let title = rawTitle;
  let window = rawWindow;

  if (
    id.includes('instant') ||
    title.toLowerCase().includes('instant')
  ) {
    id = 'instant';
    title = title || 'Instant Delivery';
    window = window || 'Delivery in about 15 mins';
  } else if (
    id.includes('morning') ||
    title.toLowerCase().includes('morning')
  ) {
    id = 'morning';
    title = title || 'Morning Slot';
    window = window || 'Delivery between 12 PM – 2 PM';
  } else if (
    id.includes('afternoon') ||
    title.toLowerCase().includes('afternoon')
  ) {
    id = 'afternoon';
    title = title || 'Afternoon Slot';
    window = window || 'Delivery between 6 PM – 7 PM';
  } else if (
    id.includes('overnight') ||
    id.includes('night') ||
    title.toLowerCase().includes('night')
  ) {
    id = 'overnight';
    title = title || 'Night Slot';
    window = window || 'Delivery between 6 AM – 8 AM';
  }

  /*
   * Older orders may only contain the delivery charge.
   * ₹20 uniquely identifies the Instant Delivery option.
   * A FREE charge does NOT identify morning/afternoon/night,
   * so never guess a free slot.
   */
  if (!title && orderDeliveryCharge(data) > 0) {
    id = 'instant';
    title = 'Instant Delivery';
    window = window || 'Delivery in about 15 mins';
  }

  return {
    id,
    title: title || 'Delivery slot not saved',
    window:
      window ||
      'The customer delivery time was not stored in this order.',
  };
}

function productInfoFromData(
  id: string,
  data: DocumentData,
): ProductInfo {
  const images = Array.isArray(data.images)
    ? data.images
    : [];

  const stock = Math.max(
    0,
    numberValue(
      data.stock_qty ??
        data.stock_quantity ??
        0,
    ),
  );

  const reserved = Math.max(
    0,
    numberValue(data.reserved_qty ?? 0),
  );

  const sold = Math.max(
    0,
    numberValue(data.sold_qty ?? 0),
  );

  const storedAvailable = Number(
    data.available_qty,
  );

  const available =
    Number.isFinite(storedAvailable) &&
    storedAvailable >= 0
      ? storedAvailable
      : Math.max(0, stock - reserved);

  return {
    id,
    title: text(
      data.title ??
        data.product_name ??
        'Product',
    ),
    image: text(
      images[0] ??
        data.image_url ??
        data.image ??
        data.product_image_url ??
        data.thumbnail_url,
    ),
    sku: text(data.sku),
    rack: text(
      data.rack ?? data.rack_location,
    ),
    box: text(
      data.box ?? data.box_location,
    ),
    slot: text(
      data.slot ?? data.slot_location,
    ),
    stock,
    reserved,
    sold,
    available,
  };
}

export default function AdminOrdersPage() {
  const [orders, setOrders] =
    useState<OrderRow[]>([]);
  const [products, setProducts] = useState<
    Record<string, ProductInfo>
  >({});

  const [deliveryBoys, setDeliveryBoys] =
    useState<DeliveryBoyInfo[]>([]);

  const [selectedDeliveryBoyByOrder, setSelectedDeliveryBoyByOrder] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] =
    useState<PeriodFilter>('all');
  const [sortBy, setSortBy] =
    useState<SortOption>('newest');

  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [expandedOrderId, setExpandedOrderId] =
    useState('');

  const [previewImage, setPreviewImage] =
    useState<{ src: string; title: string } | null>(null);

  async function loadData(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    if (showLoader) setLoading(true);

    try {
      let orderSnap;

      try {
        orderSnap = await getDocs(
          query(
            collection(db, 'Orders'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        orderSnap = await getDocs(
          collection(db, 'Orders'),
        );
      }

      const productSnap = await getDocs(
        collection(db, 'BusinessProducts'),
      );

      const deliveryBoySnap = await getDocs(
        collection(db, 'DeliveryBoys'),
      );

      const activeDeliveryBoys: DeliveryBoyInfo[] =
        deliveryBoySnap.docs
          .map((item) => {
            const data = item.data();

            return {
              id: item.id,
              name: text(data.name) || 'Delivery Boy',
              phone: text(data.phone),
              vehicleNumber: text(data.vehicle_number),
              isActive: data.is_active !== false,
            };
          })
          .filter((item) => item.isActive)
          .sort((a, b) => a.name.localeCompare(b.name));

      setDeliveryBoys(activeDeliveryBoys);

      const productMap: Record<
        string,
        ProductInfo
      > = {};

      productSnap.docs.forEach((item) => {
        productMap[item.id] =
          productInfoFromData(
            item.id,
            item.data(),
          );
      });

      setProducts(productMap);

      setOrders(
        orderSnap.docs.map((item) => ({
          id: item.id,
          data: item.data(),
        })),
      );

      setMessage('');
    } catch (error) {
      console.error(
        'Admin orders load failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load orders.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(
        window.location.search,
      );

      const status = params.get('status');
      if (
        status === 'pending' ||
        status === 'confirmed' ||
        status === 'picking' ||
        status === 'packed' ||
        status === 'out_for_delivery' ||
        status === 'delivered' ||
        status === 'cancelled'
      ) {
        setStatusFilter(status);
      }

      const period = params.get('period');
      if (
        period === 'today' ||
        period === 'delivered_today'
      ) {
        setPeriodFilter(period);
      }
    }

    void loadData();
  }, []);

  const summary = useMemo(() => {
    const pending = orders.filter(
      ({ data }) =>
        normalizeStatus(data.order_status) ===
        'pending',
    ).length;

    const processing = orders.filter(
      ({ data }) => {
        const status = normalizeStatus(
          data.order_status,
        );

        return (
          status === 'confirmed' ||
          status === 'picking' ||
          status === 'packed' ||
          status === 'out_for_delivery'
        );
      },
    ).length;

    const delivered = orders.filter(
      ({ data }) =>
        normalizeStatus(data.order_status) ===
        'delivered',
    ).length;

    const cancelled = orders.filter(
      ({ data }) =>
        normalizeStatus(data.order_status) ===
        'cancelled',
    ).length;

    const revenue = orders.reduce(
      (sum, { data }) =>
        normalizeStatus(data.order_status) ===
        'delivered'
          ? sum + orderTotal(data)
          : sum,
      0,
    );

    return {
      total: orders.length,
      pending,
      processing,
      delivered,
      cancelled,
      revenue,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const next = orders.filter((row) => {
      const status = normalizeStatus(
        row.data.order_status,
      );

      if (
        statusFilter !== 'all' &&
        status !== statusFilter
      ) {
        return false;
      }

      if (
        periodFilter === 'today' &&
        !isTodayMillis(
          createdMillis(row.data),
        )
      ) {
        return false;
      }

      if (
        periodFilter === 'delivered_today' &&
        !isTodayMillis(
          deliveredMillis(row.data),
        )
      ) {
        return false;
      }

      if (!needle) return true;

      const productTerms = orderItems(
        row.data,
      ).flatMap((item) => {
        const productId =
          productIdFromItem(item);
        const product = productId
          ? products[productId]
          : undefined;

        return [
          itemTitle(item),
          productId,
          product?.sku,
          product?.rack,
          product?.box,
          product?.slot,
        ];
      });

      return [
        row.id,
        orderNumber(row),
        customerName(row.data),
        customerPhone(row.data),
        paymentLabel(row.data),
        addressText(row.data),
        ...productTerms,
      ].some((value) =>
        text(value)
          .toLowerCase()
          .includes(needle),
      );
    });

    next.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return (
            createdMillis(a.data) -
            createdMillis(b.data)
          );

        case 'total_high':
          return (
            orderTotal(b.data) -
            orderTotal(a.data)
          );

        case 'total_low':
          return (
            orderTotal(a.data) -
            orderTotal(b.data)
          );

        case 'newest':
        default:
          return (
            createdMillis(b.data) -
            createdMillis(a.data)
          );
      }
    });

    return next;
  }, [
    orders,
    products,
    search,
    statusFilter,
    periodFilter,
    sortBy,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    periodFilter,
    sortBy,
    pageSize,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filtered.slice(
      start,
      start + pageSize,
    );
  }, [filtered, page, pageSize]);

  const pageStart =
    filtered.length === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const pageEnd = Math.min(
    page * pageSize,
    filtered.length,
  );

  async function sendOrderStatusNotification(
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    const user = auth?.currentUser;

    if (!user) {
      throw new Error(
        'Admin session is not available for notification sending.',
      );
    }

    const idToken = await user.getIdToken();

    const response = await fetch(
      '/api/notifications/order-status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          orderId,
          status,
        }),
      },
    );

    const rawResponse = await response.text();

let result: {
  ok?: boolean;
  sent?: number;
  message?: string;
  error?: string;
} = {};

try {
  result = rawResponse
    ? JSON.parse(rawResponse)
    : {};
} catch {
  // Keep rawResponse for diagnostics below.
}

if (!response.ok) {
  throw new Error(
    result.error ||
      `Notification API failed (${response.status}): ${
        rawResponse || response.statusText
      }`,
  );
}
  }

  async function changeOrderStatus(
    row: OrderRow,
    nextStatus: OrderStatus,
  ) {
    if (!db || busyId) return;

    // Keep a non-null Firestore reference for the entire async transaction.
    // TypeScript does not preserve narrowing of the imported nullable `db`
    // inside nested async callbacks.
    const firestore = db;

    const currentStatus = normalizeStatus(
      row.data.order_status,
    );

    if (currentStatus === nextStatus) {
      return;
    }

    if (
      currentStatus === 'delivered' &&
      nextStatus !== 'delivered'
    ) {
      setMessage(
        'Delivered orders cannot be moved backwards from this page.',
      );
      return;
    }

    if (
      currentStatus === 'cancelled' &&
      nextStatus !== 'cancelled'
    ) {
      setMessage(
        'Cancelled orders cannot be reactivated from this page.',
      );
      return;
    }

    if (
      nextStatus === 'cancelled' &&
      !window.confirm(
        `Cancel order ${orderNumber(
          row,
        )}? Reserved stock will be released.`,
      )
    ) {
      return;
    }

    if (
      nextStatus === 'delivered' &&
      !window.confirm(
        `Mark order ${orderNumber(
          row,
        )} as delivered?\n\nThis will reduce physical stock and increase Sold Qty.`,
      )
    ) {
      return;
    }

    setBusyId(row.id);
    setMessage('');

    try {
      const orderRef = doc(
        firestore,
        'Orders',
        row.id,
      );

      await runTransaction(
        firestore,
        async (transaction) => {
          const orderSnap =
            await transaction.get(orderRef);

          if (!orderSnap.exists()) {
            throw new Error(
              'Order no longer exists.',
            );
          }

          const liveOrder =
            orderSnap.data();

          const liveStatus = normalizeStatus(
            liveOrder.order_status,
          );

          const liveInventoryState =
            normalizeInventoryState(
              liveOrder.inventory_state,
            );

          const items =
            orderItems(liveOrder);

          const quantitiesByProduct =
            new Map<string, number>();

          for (const item of items) {
            const productId =
              productIdFromItem(item);

            if (!productId) continue;

            quantitiesByProduct.set(
              productId,
              (quantitiesByProduct.get(
                productId,
              ) || 0) + quantityOf(item),
            );
          }

          const productSnaps = new Map<
            string,
            {
              ref: DocumentReference;
              data: DocumentData;
            }
          >();

          for (const [
            productId,
          ] of quantitiesByProduct) {
            const productRef = doc(
              firestore,
              'BusinessProducts',
              productId,
            );

            const productSnap =
              await transaction.get(
                productRef,
              );

            if (!productSnap.exists()) {
              throw new Error(
                `Product ${productId} was not found.`,
              );
            }

            productSnaps.set(productId, {
              ref: productRef,
              data: productSnap.data(),
            });
          }

          let nextInventoryState =
            liveInventoryState;

          const movingIntoReservedFlow =
            nextStatus === 'confirmed' ||
            nextStatus === 'picking' ||
            nextStatus === 'packed' ||
            nextStatus ===
              'out_for_delivery';

          if (
            movingIntoReservedFlow &&
            liveInventoryState === 'none'
          ) {
            for (const [
              productId,
              qty,
            ] of quantitiesByProduct) {
              const product =
                productSnaps.get(
                  productId,
                );

              if (!product) continue;

              const currentStock =
                Math.max(
                  0,
                  numberValue(
                    product.data.stock_qty ??
                      product.data
                        .stock_quantity ??
                      0,
                  ),
                );

              const currentReserved =
                Math.max(
                  0,
                  numberValue(
                    product.data
                      .reserved_qty ?? 0,
                  ),
                );

              const currentAvailable =
                Math.max(
                  0,
                  currentStock -
                    currentReserved,
                );

              if (
                currentAvailable < qty
              ) {
                throw new Error(
                  `${text(
                    product.data.title ??
                      product.data
                        .product_name ??
                      productId,
                  )} has only ${currentAvailable} available, but order needs ${qty}.`,
                );
              }

              const nextReserved =
                currentReserved + qty;

              transaction.update(
                product.ref,
                {
                  reserved_qty:
                    nextReserved,
                  available_qty:
                    Math.max(
                      0,
                      currentStock -
                        nextReserved,
                    ),
                  is_in_stock:
                    currentStock -
                      nextReserved >
                    0,
                  updated_at:
                    serverTimestamp(),
                },
              );
            }

            nextInventoryState =
              'reserved';
          }

          if (
            nextStatus === 'cancelled' &&
            liveInventoryState ===
              'reserved'
          ) {
            for (const [
              productId,
              qty,
            ] of quantitiesByProduct) {
              const product =
                productSnaps.get(
                  productId,
                );

              if (!product) continue;

              const currentStock =
                Math.max(
                  0,
                  numberValue(
                    product.data.stock_qty ??
                      product.data
                        .stock_quantity ??
                      0,
                  ),
                );

              const currentReserved =
                Math.max(
                  0,
                  numberValue(
                    product.data
                      .reserved_qty ?? 0,
                  ),
                );

              const nextReserved =
                Math.max(
                  0,
                  currentReserved - qty,
                );

              transaction.update(
                product.ref,
                {
                  reserved_qty:
                    nextReserved,
                  available_qty:
                    Math.max(
                      0,
                      currentStock -
                        nextReserved,
                    ),
                  is_in_stock:
                    currentStock -
                      nextReserved >
                    0,
                  updated_at:
                    serverTimestamp(),
                },
              );
            }

            nextInventoryState =
              'released';
          }

          if (
            nextStatus === 'delivered' &&
            liveInventoryState !== 'sold'
          ) {
            if (
              liveInventoryState !==
              'reserved'
            ) {
              throw new Error(
                'This order has not reserved inventory yet. Confirm it before marking it delivered.',
              );
            }

            for (const [
              productId,
              qty,
            ] of quantitiesByProduct) {
              const product =
                productSnaps.get(
                  productId,
                );

              if (!product) continue;

              const currentStock =
                Math.max(
                  0,
                  numberValue(
                    product.data.stock_qty ??
                      product.data
                        .stock_quantity ??
                      0,
                  ),
                );

              const currentReserved =
                Math.max(
                  0,
                  numberValue(
                    product.data
                      .reserved_qty ?? 0,
                  ),
                );

              const currentSold =
                Math.max(
                  0,
                  numberValue(
                    product.data.sold_qty ??
                      0,
                  ),
                );

              if (currentStock < qty) {
                throw new Error(
                  `${text(
                    product.data.title ??
                      product.data
                        .product_name ??
                      productId,
                  )} physical stock is below ordered quantity.`,
                );
              }

              const nextStock =
                Math.max(
                  0,
                  currentStock - qty,
                );

              const nextReserved =
                Math.max(
                  0,
                  currentReserved - qty,
                );

              transaction.update(
                product.ref,
                {
                  stock_qty: nextStock,
                  stock_quantity:
                    nextStock,
                  reserved_qty:
                    nextReserved,
                  available_qty:
                    Math.max(
                      0,
                      nextStock -
                        nextReserved,
                    ),
                  sold_qty:
                    currentSold + qty,
                  is_in_stock:
                    nextStock -
                      nextReserved >
                    0,
                  updated_at:
                    serverTimestamp(),
                },
              );
            }

            nextInventoryState = 'sold';
          }

          const orderUpdate: DocumentData =
            {
              order_status:
                nextStatus,
              status: nextStatus,
              inventory_state:
                nextInventoryState,
              updated_at:
                serverTimestamp(),
            };

          if (
            nextStatus === 'confirmed' &&
            liveStatus !== 'confirmed'
          ) {
            orderUpdate.confirmed_at =
              serverTimestamp();
          }

          if (nextStatus === 'picking') {
            orderUpdate.picking_at =
              serverTimestamp();
          }

          if (nextStatus === 'packed') {
            orderUpdate.packed_at =
              serverTimestamp();
          }

          if (
            nextStatus ===
            'out_for_delivery'
          ) {
            orderUpdate
              .out_for_delivery_at =
              serverTimestamp();
          }

          if (
            nextStatus === 'delivered'
          ) {
            orderUpdate.delivered_at =
              serverTimestamp();
          }

          if (
            nextStatus === 'cancelled'
          ) {
            orderUpdate.cancelled_at =
              serverTimestamp();
          }

          transaction.update(
            orderRef,
            orderUpdate,
          );
        },
      );

      let notificationNote = '';

      try {
        await sendOrderStatusNotification(
          row.id,
          nextStatus,
        );
      } catch (notificationError) {
        console.error(
          'Order notification failed:',
          notificationError,
        );

        notificationNote =
          notificationError instanceof Error
            ? ` Notification: ${notificationError.message}`
            : ' Customer notification could not be sent.';
      }

      await loadData(false);

      setMessage(
        `Order ${orderNumber(
          row,
        )} updated to ${
          STATUS_FLOW.find(
            (item) =>
              item.value === nextStatus,
          )?.label ?? nextStatus
        }.${notificationNote}`,
      );
    } catch (error) {
      console.error(
        'Order status update failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Order update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function assignDeliveryBoy(
    row: OrderRow,
  ) {
    if (!db || busyId) return;

    const selectedId =
      selectedDeliveryBoyByOrder[row.id] ||
      text(row.data.delivery_boy_id);

    if (!selectedId) {
      setMessage(
        'Select a delivery boy before assigning this order.',
      );
      return;
    }

    const deliveryBoy = deliveryBoys.find(
      (item) => item.id === selectedId,
    );

    if (!deliveryBoy) {
      setMessage(
        'The selected delivery boy is not active. Choose another delivery boy.',
      );
      return;
    }

    const status = normalizeStatus(
      row.data.order_status,
    );

    if (
      status !== 'packed' &&
      status !== 'out_for_delivery'
    ) {
      setMessage(
        'A delivery boy can be assigned after the order is packed.',
      );
      return;
    }

    setBusyId(row.id);
    setMessage('');

    try {
      await updateDoc(
        doc(db, 'Orders', row.id),
        {
          delivery_boy_id:
            deliveryBoy.id,
          delivery_boy_name:
            deliveryBoy.name,
          delivery_boy_phone:
            deliveryBoy.phone,
          delivery_boy_vehicle:
            deliveryBoy.vehicleNumber,
          delivery_assigned_at:
            serverTimestamp(),
          delivery_assignment_status:
            'assigned',
          updated_at:
            serverTimestamp(),
        },
      );

      setSelectedDeliveryBoyByOrder(
        (current) => {
          const next = {
            ...current,
          };

          delete next[row.id];

          return next;
        },
      );

      await loadData(false);

      setMessage(
        `Order ${orderNumber(
          row,
        )} assigned to ${deliveryBoy.name}.`,
      );
    } catch (error) {
      console.error(
        'Assign delivery boy failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Assignment failed: ${error.message}`
          : 'Failed to assign delivery boy.',
      );
    } finally {
      setBusyId('');
    }
  }

  function nextPrimaryStatus(
    status: OrderStatus,
  ): OrderStatus | null {
    switch (status) {
      case 'pending':
        return 'confirmed';
      case 'confirmed':
        return 'picking';
      case 'picking':
        return 'packed';
      case 'packed':
      case 'out_for_delivery':
        return null;
      default:
        return null;
    }
  }

  async function deleteOrder(row: OrderRow) {
    if (!db || busyId) return;

    const status = normalizeStatus(row.data.order_status);
    const inventoryState = normalizeInventoryState(
      row.data.inventory_state,
    );

    const warning =
      inventoryState === 'reserved'
        ? '\n\nReserved stock will be released before deleting this order.'
        : inventoryState === 'sold' || status === 'delivered'
          ? '\n\nThis order has already affected sold stock. The order record will be deleted, but stock and Sold Qty will NOT be reversed.'
          : '';

    const confirmed = window.confirm(
      `Permanently delete order ${orderNumber(row)}?${warning}\n\nThis cannot be undone.`,
    );

    if (!confirmed) return;

    const firestore = db;

    setBusyId(row.id);
    setMessage('');

    try {
      const orderRef = doc(
        firestore,
        'Orders',
        row.id,
      );

      if (inventoryState === 'reserved') {
        await runTransaction(
          firestore,
          async (transaction) => {
            const liveOrderSnap =
              await transaction.get(orderRef);

            if (!liveOrderSnap.exists()) {
              throw new Error(
                'Order no longer exists.',
              );
            }

            const liveOrder =
              liveOrderSnap.data();

            const liveInventoryState =
              normalizeInventoryState(
                liveOrder.inventory_state,
              );

            const quantitiesByProduct =
              new Map<string, number>();

            for (const item of orderItems(liveOrder)) {
              const productId =
                productIdFromItem(item);

              if (!productId) continue;

              quantitiesByProduct.set(
                productId,
                (quantitiesByProduct.get(
                  productId,
                ) || 0) + quantityOf(item),
              );
            }

            if (liveInventoryState === 'reserved') {
              const productSnaps = new Map<
                string,
                {
                  ref: DocumentReference;
                  data: DocumentData;
                }
              >();

              for (const [productId] of quantitiesByProduct) {
                const productRef = doc(
                  firestore,
                  'BusinessProducts',
                  productId,
                );

                const productSnap =
                  await transaction.get(
                    productRef,
                  );

                if (productSnap.exists()) {
                  productSnaps.set(productId, {
                    ref: productRef,
                    data: productSnap.data(),
                  });
                }
              }

              for (const [
                productId,
                qty,
              ] of quantitiesByProduct) {
                const product =
                  productSnaps.get(productId);

                if (!product) continue;

                const currentStock =
                  Math.max(
                    0,
                    numberValue(
                      product.data.stock_qty ??
                        product.data.stock_quantity ??
                        0,
                    ),
                  );

                const currentReserved =
                  Math.max(
                    0,
                    numberValue(
                      product.data.reserved_qty ??
                        0,
                    ),
                  );

                const nextReserved =
                  Math.max(
                    0,
                    currentReserved - qty,
                  );

                transaction.update(
                  product.ref,
                  {
                    reserved_qty:
                      nextReserved,
                    available_qty:
                      Math.max(
                        0,
                        currentStock -
                          nextReserved,
                      ),
                    is_in_stock:
                      currentStock -
                        nextReserved >
                      0,
                    updated_at:
                      serverTimestamp(),
                  },
                );
              }
            }

            transaction.delete(orderRef);
          },
        );
      } else {
        await deleteDoc(orderRef);
      }

      setOrders((prev) =>
        prev.filter(
          (item) => item.id !== row.id,
        ),
      );

      if (expandedOrderId === row.id) {
        setExpandedOrderId('');
      }

      setMessage(
        `Order ${orderNumber(row)} deleted successfully.`,
      );
    } catch (error) {
      console.error(
        'Delete order failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Delete failed: ${error.message}`
          : 'Failed to delete order.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function deleteAllOrders() {
    if (!db || deletingAll || orders.length === 0) return;

    const confirmed = window.confirm(
      `DELETE ALL ${orders.length} ORDERS?\n\nThis permanently deletes every document in the Orders collection. This cannot be undone.`
    );

    if (!confirmed) return;

    const finalConfirmed = window.confirm(
      'Final confirmation: permanently delete ALL orders now?'
    );

    if (!finalConfirmed) return;

    const firestore = db;

    setDeletingAll(true);
    setMessage('');

    try {
      const snapshot = await getDocs(collection(firestore, 'Orders'));

      // Firestore write batches support a maximum of 500 writes.
      for (let start = 0; start < snapshot.docs.length; start += 450) {
        const batch = writeBatch(firestore);
        const chunk = snapshot.docs.slice(start, start + 450);

        chunk.forEach((orderDoc) => {
          batch.delete(orderDoc.ref);
        });

        await batch.commit();
      }

      setOrders([]);
      setPage(1);
      setExpandedOrderId('');
      setMessage(
        `Deleted ${snapshot.size} order${snapshot.size === 1 ? '' : 's'} successfully.`
      );

      await loadData(false);
    } catch (error) {
      console.error('Delete all orders failed:', error);

      setMessage(
        error instanceof Error
          ? `Delete all orders failed: ${error.message}`
          : 'Failed to delete all orders.'
      );
    } finally {
      setDeletingAll(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setPeriodFilter('all');
    setSortBy('newest');
  }

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>
            Orders
          </h1>

          <p style={pageSubtitle}>
            Confirm, pick, pack and complete
            customer orders with inventory
            tracking.
          </p>
        </div>

        <div style={headerActions}>
          <button
            type="button"
            onClick={() =>
              void loadData(false)
            }
            style={refreshButton}
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            disabled={deletingAll || orders.length === 0}
            onClick={() =>
              void deleteAllOrders()
            }
            style={{
              ...deleteAllButton,
              opacity:
                deletingAll || orders.length === 0
                  ? 0.45
                  : 1,
              cursor:
                deletingAll || orders.length === 0
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {deletingAll
              ? 'Deleting…'
              : `Delete All Orders (${orders.length})`}
          </button>
        </div>
      </div>

      <div style={summaryGrid}>
        <SummaryCard
          label="Total Orders"
          value={summary.total}
        />
        <SummaryCard
          label="Pending"
          value={summary.pending}
          warning={summary.pending > 0}
        />
        <SummaryCard
          label="Processing"
          value={summary.processing}
        />
        <SummaryCard
          label="Delivered"
          value={summary.delivered}
        />
        <SummaryCard
          label="Cancelled"
          value={summary.cancelled}
        />
        <SummaryCard
          label="Delivered Revenue"
          value={`₹${summary.revenue.toFixed(
            0,
          )}`}
        />
      </div>

      <div style={controlsCard}>
        <input
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value,
            )
          }
          placeholder="Search order, customer, phone, product, SKU, rack, box…"
          style={searchInput}
        />

        <div style={filterRow}>
          <label style={filterLabelWrap}>
            <span style={filterLabel}>
              Status
            </span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as StatusFilter,
                )
              }
              style={filterSelect}
            >
              <option value="all">
                All Status
              </option>

              {STATUS_FLOW.map(
                (status) => (
                  <option
                    key={status.value}
                    value={status.value}
                  >
                    {status.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label style={filterLabelWrap}>
            <span style={filterLabel}>
              Period
            </span>

            <select
              value={periodFilter}
              onChange={(event) =>
                setPeriodFilter(
                  event.target
                    .value as PeriodFilter,
                )
              }
              style={filterSelect}
            >
              <option value="all">
                All Dates
              </option>
              <option value="today">
                Placed Today
              </option>
              <option value="delivered_today">
                Delivered Today
              </option>
            </select>
          </label>

          <label style={filterLabelWrap}>
            <span style={filterLabel}>
              Sort
            </span>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target
                    .value as SortOption,
                )
              }
              style={filterSelect}
            >
              <option value="newest">
                Newest First
              </option>
              <option value="oldest">
                Oldest First
              </option>
              <option value="total_high">
                Total High–Low
              </option>
              <option value="total_low">
                Total Low–High
              </option>
            </select>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            style={clearButton}
          >
            Clear Filters
          </button>

          <div style={matchCount}>
            {filtered.length} matching
            order
            {filtered.length === 1
              ? ''
              : 's'}
          </div>
        </div>
      </div>

      {message && (
        <div style={messageBox}>
          <span>{message}</span>

          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
            style={messageClose}
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div style={loadingBox}>
          Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div style={emptyBox}>
          No matching orders.
        </div>
      ) : (
        <div style={orderList}>
          {paginated.map((row) => {
            const status =
              normalizeStatus(
                row.data.order_status,
              );

            const inventoryState =
              normalizeInventoryState(
                row.data.inventory_state,
              );

            const items =
              orderItems(row.data);

            const freeGifts =
              freeGiftsFromOrder(row.data);

            const expanded =
              expandedOrderId === row.id;

            const nextStatus =
              nextPrimaryStatus(status);

            const busy =
              busyId === row.id;

            const bookedDelivery =
              deliveryBookingInfo(row.data);

            const bookedSubtotal =
              orderSubtotal(row.data);

            const bookedDeliveryCharge =
              orderDeliveryCharge(row.data);

            const bookedPlatformFee =
              orderPlatformFee(row.data);

            const bookedDiscount =
              orderDiscount(row.data);

            const bookedTotal =
              orderTotal(row.data) ||
              Math.max(
                0,
                bookedSubtotal +
                  bookedDeliveryCharge +
                  bookedPlatformFee -
                  bookedDiscount,
              );

            return (
              <article
                key={row.id}
                style={orderCard}
              >
                <div style={orderTop}>
                  <div>
                    <div
                      style={orderNumberStyle}
                    >
                      {orderNumber(row)}
                    </div>

                    <div style={orderDate}>
                      {formatDate(
                        row.data,
                      )}
                    </div>
                  </div>

                  <div style={topRight}>
                    <StatusBadge
                      status={status}
                    />

                    <span
                      style={inventoryBadge}
                      title="Inventory state"
                    >
                      {inventoryState}
                    </span>

                    <span style={totalText}>
                      ₹{bookedTotal.toFixed(0)}
                    </span>
                  </div>
                </div>

                <div style={orderMetaGrid}>
                  <div>
                    <span style={metaLabel}>
                      Customer
                    </span>
                    <div>
                      {customerName(row.data)}
                    </div>
                    <div style={mutedText}>
                      {customerPhone(row.data) ||
                        'No phone'}
                    </div>
                  </div>

                  <div>
                    <span style={metaLabel}>
                      Payment
                    </span>
                    <div>
                      {paymentLabel(row.data)}
                    </div>
                    <div style={mutedText}>
                      Total payable ₹
                      {bookedTotal.toFixed(0)}
                    </div>
                  </div>

                  <div>
                    <span style={metaLabel}>
                      Booked Delivery
                    </span>
                    <div style={deliveryTitleText}>
                      {bookedDelivery.title}
                    </div>
                    <div style={deliveryWindowText}>
                      {bookedDelivery.window}
                    </div>
                    <div style={mutedText}>
                      Charge:{' '}
                      {bookedDeliveryCharge > 0
                        ? `₹${bookedDeliveryCharge.toFixed(0)}`
                        : 'FREE'}
                    </div>
                  </div>

                  <div>
                    <span style={metaLabel}>
                      Delivery Address
                    </span>
                    <div style={addressLine}>
                      {addressText(row.data) ||
                        'Address not stored in order'}
                    </div>
                  </div>

                  <div>
                    <span style={metaLabel}>
                      Delivery Boy
                    </span>

                    <div>
                      {text(
                        row.data.delivery_boy_name,
                      ) || 'Not assigned'}
                    </div>

                    {text(
                      row.data.delivery_boy_phone,
                    ) && (
                      <div style={mutedText}>
                        {text(
                          row.data.delivery_boy_phone,
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <span style={metaLabel}>
                      Items
                    </span>
                    <div>
                      {items.reduce(
                        (sum, item) =>
                          sum + quantityOf(item),
                        0,
                      )}{' '}
                      unit(s)
                      {freeGifts.length > 0
                        ? ` + ${freeGifts.length} FREE gift${
                            freeGifts.length === 1 ? '' : 's'
                          }`
                        : ''}
                    </div>
                    <div style={mutedText}>
                      Products ₹
                      {bookedSubtotal.toFixed(0)}
                    </div>
                  </div>
                </div>

                <div style={itemsWrap}>
                  {items
                    .slice(
                      0,
                      expanded
                        ? items.length
                        : 2,
                    )
                    .map(
                      (
                        item,
                        itemIndex,
                      ) => {
                        const productId =
                          productIdFromItem(
                            item,
                          );

                        const product =
                          productId
                            ? products[
                                productId
                              ]
                            : undefined;

                        const image =
                          product?.image ||
                          itemImage(item);

                        return (
                          <div
                            key={`${row.id}-${productId}-${itemIndex}`}
                            style={itemRow}
                          >
                            {image ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewImage({
                                    src: image,
                                    title:
                                      product?.title ||
                                      itemTitle(item),
                                  })
                                }
                                style={imagePreviewButton}
                                title="View large image"
                                aria-label="View large product image"
                              >
                                <img
                                  src={image}
                                  alt={
                                    product?.title ||
                                    itemTitle(item)
                                  }
                                  style={itemImageStyle}
                                />
                              </button>
                            ) : (
                              <div
                                style={itemImagePlaceholder}
                              />
                            )}

                            <div
                              style={itemMain}
                            >
                              <div
                                style={itemTitleStyle}
                              >
                                {product?.title ||
                                  itemTitle(
                                    item,
                                  )}
                              </div>

                              <div
                                style={itemSub}
                              >
                                Qty {quantityOf(item)}
                                {' • '}
                                ₹{itemUnitPrice(item).toFixed(0)}
                                {' each • '}
                                Line ₹
                                {itemLineTotal(item).toFixed(0)}
                                {product?.sku
                                  ? ` • SKU ${product.sku}`
                                  : ''}
                              </div>
                            </div>

                            <div
                              style={pickLocation}
                            >
                              {product ? (
                                product.rack ||
                                product.box ||
                                product.slot ? (
                                  <>
                                    <div
                                      style={locationMain}
                                    >
                                      📍{' '}
                                      {product.rack ||
                                        'Rack —'}
                                    </div>
                                    <div
                                      style={itemSub}
                                    >
                                      {[
                                        product.box,
                                        product.slot,
                                      ]
                                        .filter(
                                          Boolean,
                                        )
                                        .join(
                                          ' • ',
                                        ) ||
                                        'Box / Slot not set'}
                                    </div>
                                  </>
                                ) : (
                                  <span
                                    style={locationMissing}
                                  >
                                    Location missing
                                  </span>
                                )
                              ) : (
                                <span
                                  style={locationMissing}
                                >
                                  Product link missing
                                </span>
                              )}
                            </div>

                            <div
                              style={stockInfo}
                            >
                              {product ? (
                                <>
                                  <div>
                                    Avail{' '}
                                    {product.available}
                                  </div>
                                  <div
                                    style={itemSub}
                                  >
                                    Reserved{' '}
                                    {product.reserved}
                                    {' • '}
                                    Sold{' '}
                                    {product.sold}
                                  </div>
                                </>
                              ) : (
                                '—'
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}

                  {items.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId(
                          expanded
                            ? ''
                            : row.id,
                        )
                      }
                      style={expandButton}
                    >
                      {expanded
                        ? 'Show less'
                        : `Show ${
                            items.length -
                            2
                          } more item(s)`}
                    </button>
                  )}
                </div>

                <div style={bookingSummary}>
                  <div style={bookingSummaryHead}>
                    <strong>Customer Booking Details</strong>
                    <span>
                      What the customer selected at checkout
                    </span>
                  </div>

                  <div style={bookingSummaryGrid}>
                    <div style={bookingSummaryCell}>
                      <span style={metaLabel}>
                        Delivery option
                      </span>
                      <strong>
                        {bookedDelivery.title}
                      </strong>
                      <small style={bookingSmallText}>
                        {bookedDelivery.window}
                      </small>
                    </div>

                    <div style={bookingSummaryCell}>
                      <span style={metaLabel}>
                        Products subtotal
                      </span>
                      <strong>
                        ₹{bookedSubtotal.toFixed(0)}
                      </strong>
                    </div>

                    <div style={bookingSummaryCell}>
                      <span style={metaLabel}>
                        Delivery charge
                      </span>
                      <strong>
                        {bookedDeliveryCharge > 0
                          ? `₹${bookedDeliveryCharge.toFixed(0)}`
                          : 'FREE'}
                      </strong>
                    </div>

                    <div style={bookingSummaryCell}>
                      <span style={metaLabel}>
                        Platform fee
                      </span>
                      <strong>
                        ₹{bookedPlatformFee.toFixed(0)}
                      </strong>
                    </div>

                    {bookedDiscount > 0 && (
                      <div style={bookingSummaryCell}>
                        <span style={metaLabel}>
                          Discount
                        </span>
                        <strong style={discountText}>
                          −₹{bookedDiscount.toFixed(0)}
                        </strong>
                      </div>
                    )}

                    <div style={bookingTotalCell}>
                      <span style={metaLabel}>
                        Total payable
                      </span>
                      <strong>
                        ₹{bookedTotal.toFixed(0)}
                      </strong>
                    </div>
                  </div>
                </div>

                {freeGifts.length > 0 && (
                  <div style={freeGiftSection}>
                    <div style={freeGiftHeader}>
                      <span style={freeGiftIcon}>
                        🎁
                      </span>

                      <div>
                        <div style={freeGiftHeading}>
                          {freeGifts.length} FREE Gift
                          {freeGifts.length === 1
                            ? ''
                            : 's'}{' '}
                          Included
                        </div>

                        <div style={freeGiftSubheading}>
                          Pack with this order at no extra cost.
                        </div>
                      </div>
                    </div>

                    <div style={freeGiftList}>
                      {freeGifts.map((gift) => (
                        <div
                          key={`${row.id}-gift-${gift.id}`}
                          style={freeGiftRow}
                        >
                          {gift.image ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage({
                                  src: gift.image,
                                  title: gift.title,
                                })
                              }
                              style={giftImagePreviewButton}
                              title="View large gift image"
                              aria-label="View large free gift image"
                            >
                              <img
                                src={gift.image}
                                alt={gift.title}
                                style={freeGiftImage}
                              />
                            </button>
                          ) : (
                            <div
                              style={freeGiftPlaceholder}
                            >
                              🎁
                            </div>
                          )}

                          <div style={freeGiftMain}>
                            <div style={freeGiftTitle}>
                              {gift.title}
                            </div>

                            <div style={freeGiftPriceRow}>
                              <span style={freeBadge}>
                                FREE
                              </span>

                              {gift.originalPrice > 0 && (
                                <span
                                  style={freeGiftOldPrice}
                                >
                                  ₹
                                  {gift.originalPrice.toFixed(
                                    0,
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={orderActions}>
                  {(status === 'packed' ||
                    status === 'out_for_delivery') && (
                    <div style={deliveryAssignWrap}>
                      <select
                        value={
                          selectedDeliveryBoyByOrder[
                            row.id
                          ] ||
                          text(
                            row.data.delivery_boy_id,
                          )
                        }
                        onChange={(event) =>
                          setSelectedDeliveryBoyByOrder(
                            (current) => ({
                              ...current,
                              [row.id]:
                                event.target.value,
                            }),
                          )
                        }
                        style={deliveryBoySelect}
                        disabled={busy}
                      >
                        <option value="">
                          Select delivery boy
                        </option>

                        {deliveryBoys.map(
                          (deliveryBoy) => (
                            <option
                              key={deliveryBoy.id}
                              value={deliveryBoy.id}
                            >
                              {deliveryBoy.name}
                              {deliveryBoy.phone
                                ? ` • ${deliveryBoy.phone}`
                                : ''}
                            </option>
                          ),
                        )}
                      </select>

                      <button
                        type="button"
                        disabled={
                          busy ||
                          deliveryBoys.length === 0
                        }
                        onClick={() =>
                          void assignDeliveryBoy(
                            row,
                          )
                        }
                        style={{
                          ...assignDeliveryButton,
                          opacity:
                            busy ||
                            deliveryBoys.length ===
                              0
                              ? 0.5
                              : 1,
                        }}
                      >
                        {text(
                          row.data.delivery_boy_id,
                        )
                          ? 'Reassign Delivery Boy'
                          : 'Assign Delivery Boy'}
                      </button>

                      {deliveryBoys.length ===
                        0 && (
                        <span
                          style={
                            noDeliveryBoyText
                          }
                        >
                          Create an active delivery
                          boy in Delivery first.
                        </span>
                      )}
                    </div>
                  )}

                  {nextStatus && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void changeOrderStatus(
                          row,
                          nextStatus,
                        )
                      }
                      style={{
                        ...primaryAction,
                        opacity: busy
                          ? 0.5
                          : 1,
                      }}
                    >
                      {nextStatus ===
                      'confirmed'
                        ? 'Confirm Order'
                        : nextStatus ===
                            'picking'
                          ? 'Start Picking'
                          : nextStatus ===
                              'packed'
                            ? 'Mark Packed'
                            : nextStatus ===
                                'out_for_delivery'
                              ? 'Out for Delivery'
                              : 'Mark Delivered'}
                    </button>
                  )}

                  {status !== 'delivered' &&
                    status !==
                      'cancelled' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void changeOrderStatus(
                            row,
                            'cancelled',
                          )
                        }
                        style={{
                          ...cancelButton,
                          opacity: busy
                            ? 0.5
                            : 1,
                        }}
                      >
                        Cancel
                      </button>
                    )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void deleteOrder(row)
                    }
                    style={{
                      ...deleteOrderButton,
                      opacity: busy ? 0.5 : 1,
                      cursor: busy
                        ? 'not-allowed'
                        : 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {previewImage && (
        <div
          style={imageModalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewImage(null);
            }
          }}
        >
          <div style={imageModalCard}>
            <div style={imageModalHeader}>
              <div style={imageModalTitle}>{previewImage.title}</div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={imageModalClose}
                aria-label="Close image"
              >
                ×
              </button>
            </div>
            <div style={imageModalBody}>
              <img
                src={previewImage.src}
                alt={previewImage.title}
                style={imageModalImage}
              />
            </div>
          </div>
        </div>
      )}

      {!loading &&
        filtered.length > 0 && (
          <div style={paginationBar}>
            <div style={paginationInfo}>
              Showing {pageStart}–
              {pageEnd} of{' '}
              {filtered.length}
            </div>

            <div
              style={paginationRight}
            >
              <label style={rowsLabel}>
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(
                      Number(
                        event.target
                          .value,
                      ),
                    );
                    setPage(1);
                  }}
                  style={pageSizeSelect}
                >
                  {PAGE_SIZE_OPTIONS.map(
                    (size) => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <button
                type="button"
                disabled={page <= 1}
                onClick={() =>
                  setPage((prev) =>
                    Math.max(
                      1,
                      prev - 1,
                    ),
                  )
                }
                style={{
                  ...pageButton,
                  opacity:
                    page <= 1
                      ? 0.4
                      : 1,
                }}
              >
                ‹
              </button>

              <div style={pageNumber}>
                Page {page} of{' '}
                {totalPages}
              </div>

              <button
                type="button"
                disabled={
                  page >= totalPages
                }
                onClick={() =>
                  setPage((prev) =>
                    Math.min(
                      totalPages,
                      prev + 1,
                    ),
                  )
                }
                style={{
                  ...pageButton,
                  opacity:
                    page >=
                    totalPages
                      ? 0.4
                      : 1,
                }}
              >
                ›
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>
        {label}
      </div>

      <div
        style={{
          ...summaryValue,
          color: warning
            ? '#a34a00'
            : '#111',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  const config: Record<
    OrderStatus,
    React.CSSProperties
  > = {
    pending: {
      background: '#fff4dc',
      color: '#9a6100',
    },
    confirmed: {
      background: '#eaf2ff',
      color: '#3157a4',
    },
    picking: {
      background: '#eee9ff',
      color: '#6941c6',
    },
    packed: {
      background: '#e8f7f2',
      color: '#08775e',
    },
    out_for_delivery: {
      background: '#e7f3ff',
      color: '#0068a8',
    },
    delivered: {
      background: '#ebf8ee',
      color: '#137333',
    },
    cancelled: {
      background: '#fff0f0',
      color: '#b42318',
    },
  };

  return (
    <span
      style={{
        ...statusBadgeBase,
        ...config[status],
      }}
    >
      {STATUS_FLOW.find(
        (item) =>
          item.value === status,
      )?.label ?? status}
    </span>
  );
}

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const pageTitle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 30,
  fontWeight: 400,
};

const pageSubtitle: React.CSSProperties = {
  margin: 0,
  color: '#666',
};

const headerActions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

const deleteAllButton: React.CSSProperties = {
  border: '1px solid #efb7b3',
  background: '#fff1f0',
  color: '#b42318',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 500,
};

const refreshButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fff',
  color: '#222',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 400,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 12,
  margin: '22px 0',
};

const summaryCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
  padding: 15,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  fontWeight: 400,
};

const summaryValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 25,
  fontWeight: 400,
};

const controlsCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 15,
  padding: 14,
  marginBottom: 15,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: '12px 13px',
  fontSize: 14,
  outline: 'none',
  marginBottom: 10,
};

const filterRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'end',
  flexWrap: 'wrap',
};

const filterLabelWrap: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  minWidth: 170,
};

const filterLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#666',
  fontWeight: 400,
};

const filterSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 9,
  padding: '9px 10px',
  background: '#fff',
  fontWeight: 400,
};

const clearButton: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 9,
  background: '#fff',
  padding: '9px 11px',
  cursor: 'pointer',
  fontWeight: 400,
};

const matchCount: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  color: '#777',
};

const messageBox: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
  padding: '11px 13px',
  background: '#fff8e8',
  border: '1px solid #f0d598',
  borderRadius: 10,
  fontSize: 13,
};

const messageClose: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 20,
  cursor: 'pointer',
};

const loadingBox: React.CSSProperties = {
  padding: 28,
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 15,
};

const emptyBox: React.CSSProperties = {
  padding: 36,
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 15,
  textAlign: 'center',
  color: '#777',
};

const orderList: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const orderCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 16,
  overflow: 'hidden',
};

const orderTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '14px 16px',
  borderBottom: '1px solid #eee',
  background: '#fafafa',
};

const orderNumberStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 400,
};

const orderDate: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  marginTop: 3,
};

const topRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const statusBadgeBase: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 400,
};

const inventoryBadge: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  background: '#f0f0f0',
  color: '#666',
  borderRadius: 8,
  fontSize: 10,
  textTransform: 'uppercase',
};

const totalText: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 400,
  marginLeft: 6,
};

const orderMetaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 14,
  padding: '14px 16px',
  borderBottom: '1px solid #eee',
  fontSize: 13,
};

const metaLabel: React.CSSProperties = {
  display: 'block',
  color: '#888',
  fontSize: 10,
  marginBottom: 4,
};

const mutedText: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
};

const addressLine: React.CSSProperties = {
  maxWidth: 360,
  lineHeight: 1.4,
};

const deliveryTitleText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1f5135',
};

const deliveryWindowText: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  lineHeight: 1.35,
  color: '#168648',
};

const bookingSummary: React.CSSProperties = {
  margin: '12px 16px',
  padding: 14,
  border: '1px solid #e5ded6',
  borderRadius: 12,
  background: '#fbfaf8',
};

const bookingSummaryHead: React.CSSProperties = {
  marginBottom: 12,
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
};

const bookingSummaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 10,
};

const bookingSummaryCell: React.CSSProperties = {
  minWidth: 0,
  padding: '10px 11px',
  border: '1px solid #ece5de',
  borderRadius: 10,
  background: '#fff',
  fontSize: 13,
};

const bookingTotalCell: React.CSSProperties = {
  minWidth: 0,
  padding: '10px 11px',
  border: '1px solid #c9e4d2',
  borderRadius: 10,
  background: '#f2faf4',
  color: '#176b37',
  fontSize: 14,
};

const bookingSmallText: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  color: '#6d756f',
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1.4,
};

const discountText: React.CSSProperties = {
  color: '#168648',
};

const itemsWrap: React.CSSProperties = {
  padding: '0 16px',
};

const itemRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    '52px minmax(200px,1.6fr) minmax(150px,1fr) minmax(110px,.6fr)',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0',
  borderBottom: '1px solid #f0f0f0',
};

const imagePreviewButton: React.CSSProperties = {
  width: 52,
  height: 52,
  flex: '0 0 52px',
  padding: 0,
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  cursor: 'zoom-in',
  overflow: 'hidden',
};

const giftImagePreviewButton: React.CSSProperties = {
  width: 48,
  height: 48,
  flex: '0 0 48px',
  padding: 0,
  border: 0,
  borderRadius: 8,
  background: 'transparent',
  cursor: 'zoom-in',
  overflow: 'hidden',
};

const imageModalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 5000,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background: 'rgba(0,0,0,.78)',
};

const imageModalCard: React.CSSProperties = {
  width: 'min(760px, 96vw)',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 24px 80px rgba(0,0,0,.35)',
};

const imageModalHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 14px',
  borderBottom: '1px solid #eee',
};

const imageModalTitle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
  fontWeight: 700,
};

const imageModalClose: React.CSSProperties = {
  width: 34,
  height: 34,
  border: 0,
  borderRadius: 9,
  background: '#f1f1f1',
  color: '#222',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
};

const imageModalBody: React.CSSProperties = {
  minHeight: 240,
  maxHeight: 'calc(92vh - 60px)',
  padding: 16,
  display: 'grid',
  placeItems: 'center',
  overflow: 'auto',
  background: '#f7f7f7',
};

const imageModalImage: React.CSSProperties = {
  display: 'block',
  maxWidth: '100%',
  maxHeight: 'calc(92vh - 100px)',
  width: 'auto',
  height: 'auto',
  objectFit: 'contain',
};

const itemImageStyle: React.CSSProperties = {
  width: 50,
  height: 50,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#f7f7f7',
  border: '1px solid #eee',
  borderRadius: 9,
};

const itemImagePlaceholder: React.CSSProperties = {
  width: 50,
  height: 50,
  background: '#f2f2f2',
  borderRadius: 9,
};

const itemMain: React.CSSProperties = {
  minWidth: 0,
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: 13,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const itemSub: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
  marginTop: 3,
};

const pickLocation: React.CSSProperties = {
  minWidth: 0,
};

const locationMain: React.CSSProperties = {
  fontSize: 12,
};

const locationMissing: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 7px',
  borderRadius: 7,
  background: '#fff1e5',
  color: '#a34a00',
  fontSize: 10,
};

const stockInfo: React.CSSProperties = {
  fontSize: 11,
};

const expandButton: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#555',
  padding: '10px 0',
  cursor: 'pointer',
  fontSize: 12,
};

const freeGiftSection: React.CSSProperties = {
  margin: '0 16px 12px',
  padding: 12,
  border: '1px solid #cfe8d6',
  borderRadius: 12,
  background: '#f3faf5',
};

const freeGiftHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  marginBottom: 10,
};

const freeGiftIcon: React.CSSProperties = {
  fontSize: 19,
  lineHeight: 1,
};

const freeGiftHeading: React.CSSProperties = {
  color: '#176b37',
  fontSize: 12,
  fontWeight: 700,
};

const freeGiftSubheading: React.CSSProperties = {
  marginTop: 2,
  color: '#6f7d73',
  fontSize: 10,
};

const freeGiftList: React.CSSProperties = {
  display: 'grid',
  gap: 7,
};

const freeGiftRow: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 8,
  border: '1px solid #dcecdf',
  borderRadius: 10,
  background: '#fff',
};

const freeGiftImage: React.CSSProperties = {
  width: 48,
  height: 48,
  flex: '0 0 48px',
  objectFit: 'contain',
  objectPosition: 'center',
  border: '1px solid #edf1ee',
  borderRadius: 8,
  background: '#f8fbf9',
};

const freeGiftPlaceholder: React.CSSProperties = {
  width: 48,
  height: 48,
  flex: '0 0 48px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 8,
  background: '#f8fbf9',
  fontSize: 20,
};

const freeGiftMain: React.CSSProperties = {
  minWidth: 0,
};

const freeGiftTitle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#222',
  fontSize: 12,
  fontWeight: 600,
};

const freeGiftPriceRow: React.CSSProperties = {
  marginTop: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

const freeBadge: React.CSSProperties = {
  display: 'inline-flex',
  padding: '3px 6px',
  borderRadius: 999,
  background: '#e9f7ed',
  color: '#137333',
  fontSize: 10,
  fontWeight: 800,
};

const freeGiftOldPrice: React.CSSProperties = {
  color: '#929a94',
  fontSize: 10,
  textDecoration: 'line-through',
};

const deliveryAssignWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginRight: 'auto',
};

const deliveryBoySelect: React.CSSProperties = {
  minWidth: 220,
  minHeight: 38,
  border: '1px solid #d7d7d7',
  borderRadius: 9,
  padding: '0 10px',
  background: '#fff',
  color: '#222',
  fontSize: 12,
  outline: 'none',
};

const assignDeliveryButton: React.CSSProperties = {
  minHeight: 38,
  border: 0,
  borderRadius: 9,
  padding: '0 13px',
  background: '#111',
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const noDeliveryBoyText: React.CSSProperties = {
  color: '#a34a00',
  fontSize: 10,
};

const deleteOrderButton: React.CSSProperties = {
  border: '1px solid #efb7b3',
  background: '#fff1f0',
  color: '#b42318',
  borderRadius: 9,
  padding: '10px 14px',
  fontWeight: 400,
};

const orderActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '12px 16px',
  background: '#fafafa',
};

const primaryAction: React.CSSProperties = {
  border: 0,
  background: '#111',
  color: '#fff',
  borderRadius: 9,
  padding: '10px 14px',
  fontWeight: 400,
  cursor: 'pointer',
};

const cancelButton: React.CSSProperties = {
  border: '1px solid #efb7b3',
  background: '#fff7f6',
  color: '#b42318',
  borderRadius: 9,
  padding: '10px 14px',
  fontWeight: 400,
  cursor: 'pointer',
};

const paginationBar: React.CSSProperties = {
  marginTop: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const paginationInfo: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
};

const paginationRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const rowsLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: '#777',
};

const pageSizeSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '6px 7px',
  background: '#fff',
};

const pageButton: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  fontSize: 18,
  cursor: 'pointer',
};

const pageNumber: React.CSSProperties = {
  minWidth: 95,
  textAlign: 'center',
  fontSize: 11,
};