'use client';

import {
  ChevronRight,
  Gift,
  MapPin,
  Package,
  Search,
  X,
} from 'lucide-react';

import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  auth,
  firebaseReady,
} from '@/lib/firebase';

type OrderItem = {
  id: string;
  productId: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
  status: string;
  rawIndex: number;
};

type OrderGift = {
  id: string;
  productId: string;
  title: string;
  image: string;
  originalPrice: number;
  status: string;
};

type ReturnRequest = {
  rawIndex: number;
  productId: string;
  type: 'return' | 'exchange';
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'completed';
  requestedAt: number;
};

type OrderRecord = {
  id: string;
  orderNumber: string;
  businessName: string;
  items: OrderItem[];
  gifts: OrderGift[];
  subtotal: number;
  deliveryCharge: number;
  platformFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: Date | null;
  address: string;
  phone: string;
  deliveryAssigned: boolean;
  instantDelivery: boolean;
  deliveryOptionId: string;
  deliveryTitle: string;
  deliveryWindow: string;
  deliveredAt: Date | null;
  returnRequests: ReturnRequest[];
};

type OrderView = {
  key: string;
  parent: OrderRecord;
  item: OrderItem;
  gifts: OrderGift[];
};

type OrderFilter =
  | 'all'
  | 'active'
  | 'delivered'
  | 'cancelled';

type OrderSort =
  | 'newest'
  | 'oldest'
  | 'amount-high'
  | 'amount-low';

function textOf(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = Number(
      (value as { seconds?: unknown }).seconds,
    );

    return Number.isFinite(seconds)
      ? new Date(seconds * 1000)
      : null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  return null;
}

function imageOf(item: DocumentData): string {
  return (
    textOf(item.image) ||
    textOf(item.image_url) ||
    textOf(item.product_image) ||
    textOf(item.product_image_url) ||
    textOf(item.thumbnail_url) ||
    textOf(item.product_thumbnail)
  );
}

function normalizeStatus(value: unknown): string {
  const status = textOf(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  if (!status) return 'placed';
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('out for delivery')) return 'out for delivery';
  if (status.includes('deliver')) return 'delivered';
  if (status.includes('ready')) return 'ready';
  if (status.includes('confirm')) return 'confirmed';
  if (status.includes('process')) return 'processing';
  if (status.includes('pending')) return 'pending';
  if (status.includes('place')) return 'placed';

  return status;
}

function mapItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const record =
      typeof item === 'object' && item !== null
        ? (item as DocumentData)
        : {};

    const price = numberOf(
      record.price ??
        record.selling_price ??
        record.offer_price ??
        record.unit_price,
    );

    const quantity = Math.max(
      1,
      numberOf(
        record.quantity ??
          record.qty ??
          record.count,
      ) || 1,
    );

    const id =
      textOf(record.id) ||
      textOf(record.product_id) ||
      textOf(record.productId) ||
      String(index);

    const productId =
      textOf(record.product_id) ||
      textOf(record.productId) ||
      id;

    return {
      id,
      productId,
      title:
        textOf(record.title) ||
        textOf(record.product_name) ||
        textOf(record.name) ||
        'Product',
      image: imageOf(record),
      price,
      quantity,
      subtotal:
        numberOf(
          record.subtotal ??
            record.line_total,
        ) ||
        price * quantity,
      size: textOf(record.size),
      color: textOf(record.color),
      status: normalizeStatus(
        record.item_status ??
          record.status ??
          record.order_status ??
          'placed',
      ),
      rawIndex: index,
    };
  });
}

function mapGiftRecord(
  value: unknown,
  fallbackIndex: number,
): OrderGift | null {
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return null;
  }

  const record = value as DocumentData;

  const id =
    textOf(record.id) ||
    textOf(record.gift_id) ||
    textOf(record.giftId) ||
    textOf(record.product_id) ||
    `gift-${fallbackIndex}`;

  return {
    id,
    productId:
      textOf(record.source_product_id) ||
      textOf(record.sourceProductId) ||
      textOf(record.product_id) ||
      textOf(record.productId),
    title:
      textOf(record.title) ||
      textOf(record.product_name) ||
      textOf(record.name) ||
      textOf(record.gift_name) ||
      'FREE Gift',
    image: imageOf(record),
    originalPrice:
      numberOf(
        record.original_price ??
          record.originalPrice ??
          record.mrp ??
          record.price,
      ),
    status: normalizeStatus(
      record.gift_status ??
        record.status ??
        'placed',
    ),
  };
}

function giftsFromOrderData(
  data: DocumentData,
): OrderGift[] {
  const candidates: unknown[] = [];

  const topLevel = [
    data.free_gifts,
    data.selected_free_gifts,
    data.freeGifts,
    data.selectedFreeGifts,
    data.gifts,
  ];

  for (const value of topLevel) {
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  const unique = new Map<string, OrderGift>();

  candidates.forEach((value, index) => {
    const gift = mapGiftRecord(value, index);
    if (!gift) return;

    // Deduplicate the same gift stored in compatibility arrays.
    const key = [
      gift.productId || 'no-product',
      gift.id || 'no-id',
      gift.title,
      gift.image,
    ].join('::');

    if (!unique.has(key)) {
      unique.set(key, gift);
    }
  });

  return [...unique.values()];
}

type SavedFreeGift = {
  id: string;
  title: string;
  image: string;
  original_price: number;
  price: number;
  is_free_gift: boolean;
};

type SavedGiftBundle = {
  product_id: string;
  quantity: number;
  entitlement: number;
  gifts: SavedFreeGift[];
};

function readSavedGifts(
  productId: string,
): OrderGift[] {
  if (
    typeof window === 'undefined' ||
    !productId
  ) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        `spotc-free-gifts:${productId}`,
      );

    if (!raw) return [];

    const parsed =
      JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (
      !parsed ||
      !Array.isArray(parsed.gifts)
    ) {
      return [];
    }

    return parsed.gifts.map(
      (gift, index) => ({
        id:
          textOf(gift.id) ||
          `saved-gift-${index}`,
        productId:
          textOf(parsed.product_id) ||
          productId,
        title:
          textOf(gift.title) ||
          'FREE Gift',
        image: textOf(gift.image),
        originalPrice:
          numberOf(gift.original_price),
        status: 'placed',
      }),
    );
  } catch {
    return [];
  }
}

function giftsForItem(
  order: OrderRecord,
  item: OrderItem,
): OrderGift[] {
  const direct = order.gifts.filter(
    (gift) =>
      gift.status !== 'cancelled' &&
      gift.productId &&
      gift.productId === item.productId,
  );

  if (direct.length > 0) {
    return direct;
  }

  /*
   * Compatibility fallback for older orders that did not save gifts
   * into Firestore. New orders should use the persisted gift snapshots.
   */
  return readSavedGifts(
    item.productId || item.id,
  );
}

function buildAddress(
  data: DocumentData,
): string {
  const direct =
    textOf(data.delivery_address) ||
    textOf(data.address_text) ||
    textOf(data.full_address);

  if (direct) return direct;

  const source =
    typeof data.address === 'object' &&
    data.address !== null
      ? (data.address as DocumentData)
      : data;

  return [
    source.house_no,
    source.street,
    source.area,
    source.city,
    source.pincode,
  ]
    .map(textOf)
    .filter(Boolean)
    .join(', ');
}

type DeliveryDisplay = {
  id: string;
  title: string;
  window: string;
};

function deliveryDisplay(
  data: DocumentData,
): DeliveryDisplay {
  const rawId = textOf(
    data.delivery_option_id ??
      data.delivery_option ??
      data.delivery_slot_id ??
      data.delivery_slot ??
      data.delivery_type ??
      data.delivery_mode ??
      data.shipping_tier,
  ).toLowerCase();

  const rawTitle = textOf(
    data.delivery_option_title ??
      data.delivery_title ??
      data.delivery_slot_title ??
      data.delivery_slot_name ??
      data.shipping_tier,
  );

  const rawWindow = textOf(
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
    window =
      window ||
      'Delivery in about 15 mins';
  } else if (
    id.includes('morning') ||
    title.toLowerCase().includes('morning')
  ) {
    id = 'morning';
    title = title || 'Morning Slot';
    window =
      window ||
      'Delivery between 12 PM – 2 PM';
  } else if (
    id.includes('afternoon') ||
    title.toLowerCase().includes('afternoon')
  ) {
    id = 'afternoon';
    title = title || 'Afternoon Slot';
    window =
      window ||
      'Delivery between 6 PM – 7 PM';
  } else if (
    id.includes('overnight') ||
    id.includes('night') ||
    title.toLowerCase().includes('night')
  ) {
    id = 'overnight';
    title = title || 'Night Slot';
    window =
      window ||
      'Delivery between 6 AM – 8 AM';
  }

  if (
    !title &&
    numberOf(
      data.delivery_charge ??
        data.delivery_fee,
    ) > 0
  ) {
    id = 'instant';
    title = 'Instant Delivery';
    window =
      window ||
      'Delivery in about 15 mins';
  }

  return {
    id,
    title:
      title ||
      'Delivery slot not saved',
    window:
      window ||
      'Delivery time was not stored for this order.',
  };
}

function returnRequestsFromData(data: DocumentData): ReturnRequest[] {
  if (!Array.isArray(data.return_requests)) return [];

  return data.return_requests
    .map((value: unknown) => {
      const item =
        typeof value === 'object' && value !== null
          ? (value as DocumentData)
          : {};
      const type = textOf(item.type).toLowerCase();
      const status = textOf(item.status).toLowerCase();

      if (type !== 'return' && type !== 'exchange') return null;

      return {
        rawIndex: Math.max(0, Number(item.raw_index ?? item.rawIndex ?? 0) || 0),
        productId: textOf(item.product_id ?? item.productId),
        type: type as 'return' | 'exchange',
        reason: textOf(item.reason),
        status: (['requested', 'approved', 'rejected', 'completed'].includes(status)
          ? status
          : 'requested') as ReturnRequest['status'],
        requestedAt: Number(item.requested_at ?? item.requestedAt ?? 0) || 0,
      };
    })
    .filter((value): value is ReturnRequest => Boolean(value));
}

function mapOrder(
  id: string,
  data: DocumentData,
): OrderRecord {
  const deliveryInfo =
    deliveryDisplay(data);

  const items = mapItems(
    data.items ??
      data.order_items ??
      data.products,
  );

  const subtotal =
    numberOf(data.subtotal) ||
    items
      .filter(
        (item) =>
          item.status !== 'cancelled',
      )
      .reduce(
        (sum, item) =>
          sum + item.subtotal,
        0,
      );

  const deliveryCharge =
    numberOf(
      data.delivery_charge ??
        data.delivery_fee,
    );

  const platformFee =
    numberOf(
      data.platform_fee ??
        data.service_fee,
    );

  const discount =
    numberOf(
      data.discount ??
        data.discount_amount,
    );

  const total =
    numberOf(
      data.total ??
        data.grand_total ??
        data.order_total,
    ) ||
    subtotal +
      deliveryCharge +
      platformFee -
      discount;

  return {
    id,
    orderNumber:
      textOf(data.order_number) ||
      textOf(data.order_no) ||
      textOf(data.order_id) ||
      `SPOTC-${id
        .slice(0, 8)
        .toUpperCase()}`,
    businessName:
      textOf(data.business_name) ||
      textOf(data.shop_name) ||
      'SPOTC Shop',
    items,
    gifts:
      giftsFromOrderData(data),
    subtotal,
    deliveryCharge,
    platformFee,
    discount,
    total,
    paymentMethod:
      textOf(data.payment_method) ||
      textOf(data.payment_mode) ||
      'COD',
    status: normalizeStatus(
      data.order_status ??
        data.status ??
        data.delivery_status,
    ),
    createdAt: dateOf(
      data.created_at ??
        data.order_date,
    ),
    address: buildAddress(data),
    phone:
      textOf(data.customer_phone) ||
      textOf(data.phone),
    deliveryAssigned: Boolean(
      textOf(data.delivery_boy_id) ||
        textOf(
          data.delivery_partner_id,
        ) ||
        textOf(
          data.assigned_delivery_boy_id,
        ) ||
        textOf(
          data.delivery_assignment_status,
        ) === 'assigned' ||
        dateOf(
          data.delivery_assigned_at,
        ),
    ),
    instantDelivery:
      deliveryInfo.id === 'instant' ||
      [
        data.delivery_option_id,
        data.delivery_option,
        data.delivery_title,
        data.delivery_type,
        data.delivery_mode,
        data.delivery_speed,
        data.delivery_slot,
        data.estimated_delivery,
      ]
        .map(textOf)
        .join(' ')
        .toLowerCase()
        .match(
          /instant|15\s*(?:-|–|to)?\s*45\s*mins?|15\s*mins?/,
        ) !== null,
    deliveryOptionId:
      deliveryInfo.id,
    deliveryTitle:
      deliveryInfo.title,
    deliveryWindow:
      deliveryInfo.window,
    deliveredAt: dateOf(
      data.delivered_at ??
        data.delivery_completed_at ??
        data.updated_at,
    ),
    returnRequests: returnRequestsFromData(data),
  };
}

function money(value: number): string {
  return `₹${Math.round(
    value,
  ).toLocaleString('en-IN')}`;
}

function formatDateTime(
  date: Date | null,
): string {
  if (!date) return 'Date unavailable';

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
}

function statusLabel(
  status: string,
): string {
  return status
    .split(' ')
    .map((word) =>
      word
        ? word[0].toUpperCase() +
          word.slice(1)
        : '',
    )
    .join(' ');
}

function statusMessage(
  status: string,
): string {
  switch (status) {
    case 'placed':
      return 'Order placed';
    case 'pending':
      return 'Waiting for confirmation';
    case 'processing':
      return 'Being prepared';
    case 'confirmed':
      return 'Order confirmed';
    case 'ready':
      return 'Ready for delivery';
    case 'out for delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return statusLabel(status);
  }
}

function visibleItemStatus(
  order: OrderRecord,
  item: OrderItem,
): string {
  if (item.status === 'cancelled') {
    return 'cancelled';
  }

  if (order.status === 'cancelled') {
    return 'cancelled';
  }

  return order.status;
}

export default function DashboardOrders() {
  const [user, setUser] =
    useState<User | null>(
      auth?.currentUser ?? null,
    );

  const [
    authChecked,
    setAuthChecked,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    orders,
    setOrders,
  ] = useState<OrderRecord[]>([]);

  const [
    selected,
    setSelected,
  ] = useState<OrderView | null>(
    null,
  );

  const [
    filter,
    setFilter,
  ] = useState<OrderFilter>('all');

  const [
    sort,
    setSort,
  ] =
    useState<OrderSort>('newest');

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    cancellingKey,
    setCancellingKey,
  ] = useState('');

  const [
    returnBusyKey,
    setReturnBusyKey,
  ] = useState('');

  const [
    imagePreview,
    setImagePreview,
  ] =
    useState<string | null>(null);

  const [
    nowMs,
    setNowMs,
  ] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMs(Date.now()),
      1000,
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(
          nextUser &&
            !nextUser.isAnonymous
            ? nextUser
            : null,
        );

        setAuthChecked(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const currentUser = user;
    let active = true;

    async function loadOrders() {
      setLoading(true);

      try {
        const db =
          getFirestore();

        const snapshots =
          await Promise.all([
            getDocs(
              query(
                collection(
                  db,
                  'Orders',
                ),
                where(
                  'user_uid',
                  '==',
                  currentUser.uid,
                ),
                limit(100),
              ),
            ).catch(() => null),

            getDocs(
              query(
                collection(
                  db,
                  'Orders',
                ),
                where(
                  'user_ref',
                  '==',
                  doc(
                    db,
                    'Users',
                    currentUser.uid,
                  ),
                ),
                limit(100),
              ),
            ).catch(() => null),

            getDocs(
              query(
                collection(
                  db,
                  'Orders',
                ),
                where(
                  'user_ref',
                  '==',
                  doc(
                    db,
                    'users',
                    currentUser.uid,
                  ),
                ),
                limit(100),
              ),
            ).catch(() => null),
          ]);

        if (!active) return;

        const unique =
          new Map<
            string,
            OrderRecord
          >();

        for (const snapshot of snapshots) {
          for (
            const orderDoc of
            snapshot?.docs ?? []
          ) {
            if (
              !unique.has(orderDoc.id)
            ) {
              unique.set(
                orderDoc.id,
                mapOrder(
                  orderDoc.id,
                  orderDoc.data(),
                ),
              );
            }
          }
        }

        setOrders(
          [...unique.values()].sort(
            (a, b) =>
              (
                b.createdAt?.getTime() ??
                0
              ) -
              (
                a.createdAt?.getTime() ??
                0
              ),
          ),
        );
      } catch (error) {
        console.error(
          'Orders load failed:',
          error,
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, [
    authChecked,
    user,
  ]);

  const orderViews =
    useMemo<OrderView[]>(() => {
      const views: OrderView[] = [];

      for (const order of orders) {
        order.items.forEach(
          (item) => {
            views.push({
              key: `${order.id}:${item.rawIndex}`,
              parent: order,
              item,
              gifts:
                giftsForItem(
                  order,
                  item,
                ),
            });
          },
        );
      }

      return views;
    }, [orders]);

  function cancelWindowSeconds(
    view: OrderView,
  ): number {
    return view.parent.instantDelivery
      ? 2 * 60
      : 15 * 60;
  }

  function cancelSecondsLeft(
    view: OrderView,
  ): number {
    if (!view.parent.createdAt) {
      return 0;
    }

    const expiresAt =
      view.parent.createdAt.getTime() +
      cancelWindowSeconds(view) *
        1000;

    return Math.max(
      0,
      Math.ceil(
        (expiresAt - nowMs) /
          1000,
      ),
    );
  }

  function canCancelItem(
    view: OrderView,
  ): boolean {
    const status =
      visibleItemStatus(
        view.parent,
        view.item,
      );

    if (
      [
        'cancelled',
        'delivered',
        'out for delivery',
      ].includes(status)
    ) {
      return false;
    }

    if (
      view.parent.deliveryAssigned
    ) {
      return false;
    }

    return (
      cancelSecondsLeft(view) > 0
    );
  }

  function formatCancelCountdown(
    seconds: number,
  ): string {
    const minutes =
      Math.floor(seconds / 60);

    const remainingSeconds =
      seconds % 60;

    return `${minutes}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`;
  }

  function cancelHelpText(
    view: OrderView,
  ): string {
    const status =
      visibleItemStatus(
        view.parent,
        view.item,
      );

    if (status === 'cancelled') {
      return 'This item has been cancelled.';
    }

    if (
      status === 'delivered' ||
      status === 'out for delivery'
    ) {
      return 'Cancellation is no longer available.';
    }

    if (
      view.parent.deliveryAssigned
    ) {
      return 'Cancellation closed because delivery has been assigned.';
    }

    const seconds =
      cancelSecondsLeft(view);

    if (seconds <= 0) {
      return view.parent
        .instantDelivery
        ? 'The 2-minute cancellation window has ended.'
        : 'The 15-minute cancellation window has ended.';
    }

    return view.parent
      .instantDelivery
      ? `Instant delivery: cancel within ${formatCancelCountdown(seconds)}.`
      : `FREE delivery: cancel within ${formatCancelCountdown(seconds)}.`;
  }

  async function cancelItem(
    view: OrderView,
  ) {
    if (
      cancellingKey ||
      !canCancelItem(view)
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Cancel this product?\n\n${view.item.title}\n\nAny FREE gift linked to this product will also be cancelled.`,
      );

    if (!confirmed) return;

    setCancellingKey(view.key);

    try {
      const db =
        getFirestore();

      const orderRef = doc(
        db,
        'Orders',
        view.parent.id,
      );

      await runTransaction(
        db,
        async (transaction) => {
          const snapshot =
            await transaction.get(
              orderRef,
            );

          if (!snapshot.exists()) {
            throw new Error(
              'Order no longer exists.',
            );
          }

          const data =
            snapshot.data();

          const liveStatus =
            normalizeStatus(
              data.order_status ??
                data.status ??
                data.delivery_status,
            );

          if (
            [
              'cancelled',
              'delivered',
              'out for delivery',
            ].includes(liveStatus)
          ) {
            throw new Error(
              'This order can no longer be changed.',
            );
          }

          const deliveryAssigned =
            Boolean(
              textOf(
                data.delivery_boy_id,
              ) ||
                textOf(
                  data.delivery_partner_id,
                ) ||
                textOf(
                  data.assigned_delivery_boy_id,
                ) ||
                textOf(
                  data.delivery_assignment_status,
                ) === 'assigned' ||
                dateOf(
                  data.delivery_assigned_at,
                ),
            );

          if (deliveryAssigned) {
            throw new Error(
              'Delivery has already been assigned, so this item can no longer be cancelled.',
            );
          }

          const instantDelivery =
            [
              data.delivery_option_id,
              data.delivery_option,
              data.delivery_slot_id,
              data.delivery_slot,
              data.delivery_option_title,
              data.delivery_title,
              data.delivery_type,
              data.delivery_mode,
              data.delivery_speed,
              data.shipping_tier,
              data.estimated_delivery,
            ]
              .map(textOf)
              .join(' ')
              .toLowerCase()
              .match(
                /instant|15\s*(?:-|–|to)?\s*45\s*mins?|15\s*mins?/,
              ) !== null;

          const createdAt =
            dateOf(
              data.created_at ??
                data.order_date,
            );

          const cancellationWindowMs =
            instantDelivery
              ? 2 * 60 * 1000
              : 15 * 60 * 1000;

          if (
            !createdAt ||
            Date.now() -
              createdAt.getTime() >=
              cancellationWindowMs
          ) {
            throw new Error(
              instantDelivery
                ? 'The 2-minute cancellation window for instant delivery has ended.'
                : 'The 15-minute cancellation window for FREE delivery has ended.',
            );
          }

          const rawItems =
            Array.isArray(data.items)
              ? data.items
              : Array.isArray(
                    data.order_items,
                  )
                ? data.order_items
                : Array.isArray(
                      data.products,
                    )
                  ? data.products
                  : [];

          if (
            view.item.rawIndex < 0 ||
            view.item.rawIndex >=
              rawItems.length
          ) {
            throw new Error(
              'Unable to find this product in the order.',
            );
          }

          const nextItems =
            rawItems.map(
              (
                rawItem: unknown,
                index: number,
              ) => {
                const record =
                  typeof rawItem ===
                    'object' &&
                  rawItem !== null
                    ? {
                        ...(rawItem as Record<
                          string,
                          unknown
                        >),
                      }
                    : {};

                if (
                  index ===
                  view.item.rawIndex
                ) {
                  return {
                    ...record,
                    item_status:
                      'cancelled',
                    cancelled_at:
                      Timestamp.now(),
                    cancelled_by:
                      'customer',
                  };
                }

                return record;
              },
            );

          const activeItems =
            nextItems.filter(
              (rawItem) =>
                normalizeStatus(
                  (
                    rawItem as DocumentData
                  ).item_status ??
                    (
                      rawItem as DocumentData
                    ).status ??
                    'placed',
                ) !== 'cancelled',
            );

          const activeSubtotal =
            activeItems.reduce(
              (
                sum,
                rawItem,
              ) => {
                const record =
                  rawItem as DocumentData;

                const price =
                  numberOf(
                    record.price ??
                      record.selling_price ??
                      record.offer_price ??
                      record.unit_price,
                  );

                const quantity =
                  Math.max(
                    1,
                    numberOf(
                      record.quantity ??
                        record.qty ??
                        record.count,
                    ) || 1,
                  );

                return (
                  sum +
                  (
                    numberOf(
                      record.subtotal ??
                        record.line_total,
                    ) ||
                    price * quantity
                  )
                );
              },
              0,
            );

          const deliveryCharge =
            activeItems.length > 0
              ? numberOf(
                  data.delivery_charge ??
                    data.delivery_fee,
                )
              : 0;

          const platformFee =
            activeItems.length > 0
              ? numberOf(
                  data.platform_fee ??
                    data.service_fee,
                )
              : 0;

          const discount =
            activeItems.length > 0
              ? numberOf(
                  data.discount ??
                    data.discount_amount,
                )
              : 0;

          const nextTotal =
            Math.max(
              0,
              activeSubtotal +
                deliveryCharge +
                platformFee -
                discount,
            );

          const giftFields = [
            'free_gifts',
            'selected_free_gifts',
            'gifts',
          ] as const;

          const giftUpdates:
            Record<
              string,
              unknown
            > = {};

          for (
            const field
            of giftFields
          ) {
            const current =
              data[field];

            if (!Array.isArray(current)) {
              continue;
            }

            giftUpdates[field] =
              current.map(
                (
                  rawGift: unknown,
                ) => {
                  const record =
                    typeof rawGift ===
                      'object' &&
                    rawGift !== null
                      ? {
                          ...(rawGift as Record<
                            string,
                            unknown
                          >),
                        }
                      : {};

                  const sourceProductId =
                    textOf(
                      record.source_product_id,
                    ) ||
                    textOf(
                      record.sourceProductId,
                    ) ||
                    textOf(
                      record.product_id,
                    ) ||
                    textOf(
                      record.productId,
                    );

                  if (
                    sourceProductId &&
                    sourceProductId ===
                      view.item.productId
                  ) {
                    return {
                      ...record,
                      gift_status:
                        'cancelled',
                      cancelled_at:
                        Timestamp.now(),
                      cancelled_by:
                        'customer',
                    };
                  }

                  return record;
                },
              );
          }

          const allCancelled =
            activeItems.length === 0;

          transaction.update(
            orderRef,
            {
              items: nextItems,
              subtotal:
                activeSubtotal,
              delivery_charge:
                deliveryCharge,
              platform_fee:
                platformFee,
              discount,
              total: nextTotal,
              grand_total:
                nextTotal,
              cancelled_item_count:
                nextItems.length -
                activeItems.length,
              has_cancelled_items:
                nextItems.length !==
                activeItems.length,
              ...(allCancelled
                ? {
                    order_status:
                      'cancelled',
                    status:
                      'cancelled',
                    cancelled_at:
                      serverTimestamp(),
                    cancelled_by:
                      'customer',
                  }
                : {}),
              ...giftUpdates,
              updated_at:
                serverTimestamp(),
            },
          );
        },
      );

      setOrders(
        (current) =>
          current.map((order) => {
            if (
              order.id !==
              view.parent.id
            ) {
              return order;
            }

            const nextItems =
              order.items.map(
                (item) =>
                  item.rawIndex ===
                  view.item.rawIndex
                    ? {
                        ...item,
                        status:
                          'cancelled',
                      }
                    : item,
              );

            const activeItems =
              nextItems.filter(
                (item) =>
                  item.status !==
                  'cancelled',
              );

            const activeSubtotal =
              activeItems.reduce(
                (sum, item) =>
                  sum +
                  item.subtotal,
                0,
              );

            const allCancelled =
              activeItems.length === 0;

            const nextDelivery =
              allCancelled
                ? 0
                : order.deliveryCharge;

            const nextPlatform =
              allCancelled
                ? 0
                : order.platformFee;

            const nextDiscount =
              allCancelled
                ? 0
                : order.discount;

            const nextTotal =
              Math.max(
                0,
                activeSubtotal +
                  nextDelivery +
                  nextPlatform -
                  nextDiscount,
              );

            return {
              ...order,
              items: nextItems,
              gifts:
                order.gifts.map(
                  (gift) =>
                    gift.productId ===
                    view.item
                      .productId
                      ? {
                          ...gift,
                          status:
                            'cancelled',
                        }
                      : gift,
                ),
              subtotal:
                activeSubtotal,
              deliveryCharge:
                nextDelivery,
              platformFee:
                nextPlatform,
              discount:
                nextDiscount,
              total: nextTotal,
              status:
                allCancelled
                  ? 'cancelled'
                  : order.status,
            };
          }),
      );

      setSelected(null);
    } catch (error) {
      console.error(
        'Cancel item failed:',
        error,
      );

      window.alert(
        error instanceof Error
          ? error.message
          : 'Unable to cancel this product. Please try again.',
      );
    } finally {
      setCancellingKey('');
    }
  }

  function returnRequestFor(view: OrderView): ReturnRequest | null {
    return (
      view.parent.returnRequests.find(
        (request) =>
          request.rawIndex === view.item.rawIndex &&
          request.status !== 'rejected',
      ) ?? null
    );
  }

  function canRequestReturn(view: OrderView): boolean {
    if (visibleItemStatus(view.parent, view.item) !== 'delivered') return false;
    if (returnRequestFor(view)) return false;
    const deliveredAt = view.parent.deliveredAt;
    if (!deliveredAt) return false;
    return Date.now() - deliveredAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
  }

  async function requestReturnOrExchange(
    view: OrderView,
    type: 'return' | 'exchange',
  ) {
    if (!user || returnBusyKey || !canRequestReturn(view)) return;

    const reason = window.prompt(
      type === 'return'
        ? 'Why do you want to return this product?'
        : 'Why do you want to exchange this product?',
      '',
    );

    if (reason === null) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      window.alert('Please enter a reason.');
      return;
    }

    setReturnBusyKey(view.key);

    try {
      const firestore = getFirestore();
      const orderRef = doc(firestore, 'Orders', view.parent.id);

      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists()) throw new Error('Order no longer exists.');

        const data = snapshot.data();
        const liveStatus = normalizeStatus(
          data.order_status ?? data.status ?? data.delivery_status,
        );
        if (liveStatus !== 'delivered') {
          throw new Error('Return or exchange is available only after delivery.');
        }

        const deliveredAt = dateOf(
          data.delivered_at ?? data.delivery_completed_at ?? data.updated_at,
        );
        if (!deliveredAt || Date.now() - deliveredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
          throw new Error('The 7-day return / exchange window has ended.');
        }

        const existing = Array.isArray(data.return_requests)
          ? [...data.return_requests]
          : [];

        const alreadyOpen = existing.some((value) => {
          if (!value || typeof value !== 'object') return false;
          const request = value as DocumentData;
          const index = Number(request.raw_index ?? request.rawIndex ?? -1);
          const requestStatus = textOf(request.status).toLowerCase();
          return (
            index === view.item.rawIndex &&
            requestStatus !== 'rejected'
          );
        });

        if (alreadyOpen) {
          throw new Error('A return / exchange request already exists for this product.');
        }

        existing.push({
          raw_index: view.item.rawIndex,
          product_id: view.item.productId,
          product_title: view.item.title,
          quantity: view.item.quantity,
          type,
          reason: cleanReason,
          status: 'requested',
          requested_at: Date.now(),
          requested_by: user.uid,
        });

        transaction.update(orderRef, {
          return_requests: existing,
          updated_at: serverTimestamp(),
        });
      });

      const nextRequest: ReturnRequest = {
        rawIndex: view.item.rawIndex,
        productId: view.item.productId,
        type,
        reason: cleanReason,
        status: 'requested',
        requestedAt: Date.now(),
      };

      setOrders((current) =>
        current.map((order) =>
          order.id === view.parent.id
            ? { ...order, returnRequests: [...order.returnRequests, nextRequest] }
            : order,
        ),
      );
      setSelected((current) =>
        current && current.key === view.key
          ? {
              ...current,
              parent: {
                ...current.parent,
                returnRequests: [...current.parent.returnRequests, nextRequest],
              },
            }
          : current,
      );
      window.alert(
        `${type === 'return' ? 'Return' : 'Exchange'} request sent to SPOTC Admin.`,
      );
    } catch (error) {
      console.error('Return / exchange request failed:', error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Unable to send the request. Please try again.',
      );
    } finally {
      setReturnBusyKey('');
    }
  }

  const filteredViews =
    useMemo(() => {
      const queryText =
        search
          .trim()
          .toLowerCase();

      const result =
        orderViews.filter(
          (view) => {
            const itemStatus =
              visibleItemStatus(
                view.parent,
                view.item,
              );

            if (
              filter === 'active' &&
              [
                'delivered',
                'cancelled',
              ].includes(itemStatus)
            ) {
              return false;
            }

            if (
              filter ===
                'delivered' &&
              itemStatus !==
                'delivered'
            ) {
              return false;
            }

            if (
              filter ===
                'cancelled' &&
              itemStatus !==
                'cancelled'
            ) {
              return false;
            }

            if (!queryText) {
              return true;
            }

            return [
              view.parent
                .orderNumber,
              view.parent
                .businessName,
              view.item.title,
              itemStatus,
            ]
              .join(' ')
              .toLowerCase()
              .includes(queryText);
          },
        );

      return result.sort(
        (a, b) => {
          if (
            sort ===
            'amount-high'
          ) {
            return (
              b.item.subtotal -
              a.item.subtotal
            );
          }

          if (
            sort ===
            'amount-low'
          ) {
            return (
              a.item.subtotal -
              b.item.subtotal
            );
          }

          const aTime =
            a.parent
              .createdAt
              ?.getTime() ?? 0;

          const bTime =
            b.parent
              .createdAt
              ?.getTime() ?? 0;

          return sort ===
            'oldest'
            ? aTime - bTime
            : bTime - aTime;
        },
      );
    }, [
      orderViews,
      filter,
      sort,
      search,
    ]);

  if (
    !authChecked ||
    loading
  ) {
    return (
      <section className="simple-orders-state">
        <span />
        <p>Loading orders…</p>

        <style jsx>{`
          .simple-orders-state {
            min-height: 280px;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 12px;
            color: #756d65;
          }

          .simple-orders-state span {
            width: 34px;
            height: 34px;
            border: 3px solid #e9e2da;
            border-top-color: #d97800;
            border-radius: 50%;
            animation: spin .75s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="simple-orders-empty">
        <Package />
        <h2>
          Sign in to view orders
        </h2>
        <p>
          Your orders will appear here.
        </p>

        <style jsx>{`
          .simple-orders-empty {
            min-height: 320px;
            display: grid;
            place-content: center;
            justify-items: center;
            text-align: center;
            color: #6f675f;
          }

          .simple-orders-empty svg {
            width: 38px;
            height: 38px;
            margin-bottom: 10px;
          }

          .simple-orders-empty h2 {
            margin: 0;
            color: #181512;
          }

          .simple-orders-empty p {
            margin: 7px 0 0;
          }
        `}</style>
      </section>
    );
  }

  return (
    <div className="simple-orders-page">
      <header className="simple-orders-head">
        <div>
          <small>MY ORDERS</small>
          <h2>Orders</h2>
          <p>
            Each product is shown as a separate order.
          </p>
        </div>

        <span>
          {orderViews.length}{' '}
          {orderViews.length === 1
            ? 'order'
            : 'orders'}
        </span>
      </header>

      {orderViews.length > 0 && (
        <section className="simple-orders-tools">
          <div className="simple-orders-filters">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
                ['delivered', 'Delivered'],
                ['cancelled', 'Cancelled'],
              ] as Array<
                [
                  OrderFilter,
                  string,
                ]
              >
            ).map(
              ([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={
                    filter === id
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setFilter(id)
                  }
                >
                  {label}
                </button>
              ),
            )}
          </div>

          <div className="simple-orders-controls">
            <label className="simple-orders-search">
              <Search />
              <input
                value={search}
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search orders"
              />
            </label>

            <select
              value={sort}
              onChange={(
                event,
              ) =>
                setSort(
                  event.target
                    .value as OrderSort,
                )
              }
              aria-label="Sort orders"
            >
              <option value="newest">
                Newest first
              </option>
              <option value="oldest">
                Oldest first
              </option>
              <option value="amount-high">
                Amount: high to low
              </option>
              <option value="amount-low">
                Amount: low to high
              </option>
            </select>
          </div>
        </section>
      )}

      {orderViews.length === 0 ? (
        <section className="simple-orders-empty-card">
          <Package />
          <h3>No orders yet</h3>
          <p>
            Your placed orders will appear here.
          </p>
        </section>
      ) : filteredViews.length === 0 ? (
        <section className="simple-orders-empty-card">
          <Search />
          <h3>No matching orders</h3>
          <p>
            Try another filter or search.
          </p>
        </section>
      ) : (
        <section className="simple-orders-list">
          {filteredViews.map(
            (view) => {
              const itemStatus =
                visibleItemStatus(
                  view.parent,
                  view.item,
                );

              return (
                <article
                  key={view.key}
                  className="simple-order-card"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setSelected(view)
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        'Enter' ||
                      event.key === ' '
                    ) {
                      event.preventDefault();
                      setSelected(view);
                    }
                  }}
                >
                  <div className="simple-order-image">
                    {view.item.image ? (
                      <img
                        src={
                          view.item.image
                        }
                        alt={
                          view.item.title
                        }
                        title="Tap to zoom"
                        role="button"
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();
                          setImagePreview(
                            view.item.image,
                          );
                        }}
                      />
                    ) : (
                      <Package />
                    )}
                  </div>

                  <div className="simple-order-copy">
                    <div className="simple-order-top">
                      <span>
                        {
                          view.parent
                            .orderNumber
                        }
                        {' · '}
                        Item{' '}
                        {view.item.rawIndex +
                          1}
                      </span>

                      <em
                        className={`status-${itemStatus.replace(
                          /\s+/g,
                          '-',
                        )}`}
                      >
                        {statusLabel(
                          itemStatus,
                        )}
                      </em>
                    </div>

                    <strong>
                      {
                        view.item
                          .title
                      }
                    </strong>

                    <small className="simple-order-status-line">
                      {statusMessage(
                        itemStatus,
                      )}
                    </small>

                    <small>
                      Qty{' '}
                      {
                        view.item
                          .quantity
                      }
                      {' · '}
                      {formatDateTime(
                        view.parent
                          .createdAt,
                      )}
                    </small>

                    <small className="simple-order-delivery-line">
                      {
                        view.parent
                          .deliveryTitle
                      }
                      {' · '}
                      {
                        view.parent
                          .deliveryWindow
                      }
                    </small>

                    {view.gifts.length >
                      0 && (
                      <small className="simple-order-gift-count">
                        <Gift />
                        {
                          view.gifts
                            .length
                        }{' '}
                        FREE Gift
                        {view.gifts
                          .length === 1
                          ? ''
                          : 's'}{' '}
                        Included
                      </small>
                    )}
                  </div>

                  <div className="simple-order-total">
                    <div>
                      <strong>
                        {money(
                          view.item
                            .subtotal,
                        )}
                      </strong>

                      {canCancelItem(
                        view,
                      ) && (
                        <button
                          type="button"
                          className="simple-order-card-cancel"
                          disabled={
                            cancellingKey ===
                            view.key
                          }
                          onClick={(
                            event,
                          ) => {
                            event.stopPropagation();
                            void cancelItem(
                              view,
                            );
                          }}
                        >
                          {cancellingKey ===
                          view.key
                            ? 'Cancelling…'
                            : `Cancel ${formatCancelCountdown(
                                cancelSecondsLeft(
                                  view,
                                ),
                              )}`}
                        </button>
                      )}

                      {canRequestReturn(view) && (
                        <div className="simple-order-return-actions">
                          <button
                            type="button"
                            disabled={returnBusyKey === view.key}
                            onClick={(event) => {
                              event.stopPropagation();
                              void requestReturnOrExchange(view, 'return');
                            }}
                          >
                            Return
                          </button>
                          <button
                            type="button"
                            disabled={returnBusyKey === view.key}
                            onClick={(event) => {
                              event.stopPropagation();
                              void requestReturnOrExchange(view, 'exchange');
                            }}
                          >
                            Exchange
                          </button>
                        </div>
                      )}

                      {returnRequestFor(view) && (
                        <small className="simple-order-return-status">
                          {statusLabel(returnRequestFor(view)!.type)} · {statusLabel(returnRequestFor(view)!.status)}
                        </small>
                      )}
                    </div>

                    <ChevronRight />
                  </div>
                </article>
              );
            },
          )}
        </section>
      )}

      {selected && (
        <div
          className="simple-order-overlay"
          onMouseDown={() =>
            setSelected(null)
          }
        >
          <section
            className="simple-order-details"
            onMouseDown={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <header>
              <div>
                <small>
                  ORDER DETAILS
                </small>

                <h2>
                  {
                    selected.parent
                      .orderNumber
                  }
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelected(null)
                }
                aria-label="Close"
              >
                <X />
              </button>
            </header>

            <section
              className={`simple-details-cancel-top ${
                canCancelItem(
                  selected,
                )
                  ? 'active'
                  : ''
              }`}
            >
              <div>
                <strong>
                  Cancel this product
                </strong>
                <span>
                  {cancelHelpText(
                    selected,
                  )}
                </span>
              </div>

              {canCancelItem(
                selected,
              ) && (
                <button
                  type="button"
                  disabled={
                    cancellingKey ===
                    selected.key
                  }
                  onClick={() =>
                    void cancelItem(
                      selected,
                    )
                  }
                >
                  {cancellingKey ===
                  selected.key
                    ? 'Cancelling…'
                    : `Cancel · ${formatCancelCountdown(
                        cancelSecondsLeft(
                          selected,
                        ),
                      )}`}
                </button>
              )}
            </section>

            <div className="simple-details-status">
              <span>
                <small>Status</small>
                <strong>
                  {statusMessage(
                    visibleItemStatus(
                      selected.parent,
                      selected.item,
                    ),
                  )}
                </strong>
              </span>

              <span className="simple-details-date">
                <small>
                  Ordered on
                </small>

                <strong>
                  {formatDateTime(
                    selected.parent
                      .createdAt,
                  )}
                </strong>
              </span>
            </div>

            {returnRequestFor(selected) ? (
              <section className="simple-details-return-box">
                <strong>
                  {statusLabel(returnRequestFor(selected)!.type)} request · {statusLabel(returnRequestFor(selected)!.status)}
                </strong>
                <span>{returnRequestFor(selected)!.reason}</span>
              </section>
            ) : canRequestReturn(selected) ? (
              <section className="simple-details-return-box">
                <strong>7 Days Return & Exchange</strong>
                <span>Request a return or exchange for this delivered product.</span>
                <div>
                  <button
                    type="button"
                    disabled={returnBusyKey === selected.key}
                    onClick={() => void requestReturnOrExchange(selected, 'return')}
                  >
                    Return
                  </button>
                  <button
                    type="button"
                    disabled={returnBusyKey === selected.key}
                    onClick={() => void requestReturnOrExchange(selected, 'exchange')}
                  >
                    Exchange
                  </button>
                </div>
              </section>
            ) : null}

            <section className="simple-details-delivery">
              <div>
                <small>
                  Delivery option
                </small>
                <strong>
                  {
                    selected.parent
                      .deliveryTitle
                  }
                </strong>
                <p>
                  {
                    selected.parent
                      .deliveryWindow
                  }
                </p>
              </div>

              <div>
                <small>
                  Delivery charge
                </small>
                <strong>
                  {selected.parent
                    .deliveryCharge > 0
                    ? money(
                        selected.parent
                          .deliveryCharge,
                      )
                    : 'FREE'}
                </strong>
              </div>
            </section>

            <div className="simple-details-items">
              <article>
                <div>
                  {selected.item
                    .image ? (
                    <img
                      src={
                        selected.item
                          .image
                      }
                      alt={
                        selected.item
                          .title
                      }
                      title="Tap to zoom"
                      role="button"
                      onClick={() =>
                        setImagePreview(
                          selected.item
                            .image,
                        )
                      }
                    />
                  ) : (
                    <Package />
                  )}
                </div>

                <span>
                  <strong>
                    {
                      selected.item
                        .title
                    }
                  </strong>

                  <small>
                    Qty{' '}
                    {
                      selected.item
                        .quantity
                    }
                    {' · '}
                    {money(
                      selected.item
                        .price,
                    )}{' '}
                    each
                    {selected.item.size
                      ? ` · Size ${selected.item.size}`
                      : ''}
                    {selected.item.color
                      ? ` · ${selected.item.color}`
                      : ''}
                  </small>
                </span>

                <b>
                  {money(
                    selected.item
                      .subtotal,
                  )}
                </b>
              </article>
            </div>

            {selected.gifts.length >
              0 && (
              <section className="simple-details-gifts">
                <header>
                  <Gift />

                  <div>
                    <strong>
                      {
                        selected.gifts
                          .length
                      }{' '}
                      FREE Gift
                      {selected.gifts
                        .length === 1
                        ? ''
                        : 's'}{' '}
                      Included
                    </strong>

                    <small>
                      These gifts belong to this product and are cancelled with it.
                    </small>
                  </div>
                </header>

                <div className="simple-details-gifts-list">
                  {selected.gifts.map(
                    (gift) => (
                      <article
                        key={
                          gift.id
                        }
                      >
                        <div>
                          {gift.image ? (
                            <img
                              src={
                                gift.image
                              }
                              alt={
                                gift.title
                              }
                              title="Tap to zoom"
                              role="button"
                              onClick={() =>
                                setImagePreview(
                                  gift.image,
                                )
                              }
                            />
                          ) : (
                            <Gift />
                          )}
                        </div>

                        <span>
                          <strong>
                            {
                              gift.title
                            }
                          </strong>
                          <small>
                            FREE
                          </small>
                        </span>
                      </article>
                    ),
                  )}
                </div>
              </section>
            )}

            {selected.parent
              .address && (
              <div className="simple-details-address">
                <MapPin />

                <span>
                  <small>
                    Delivery Address
                  </small>

                  <strong>
                    {
                      selected.parent
                        .address
                    }
                  </strong>

                  {selected.parent
                    .phone && (
                    <p>
                      {
                        selected.parent
                          .phone
                      }
                    </p>
                  )}
                </span>
              </div>
            )}

            <div className="simple-details-bill">
              <p>
                <span>
                  Product total
                </span>
                <strong>
                  {money(
                    selected.item
                      .subtotal,
                  )}
                </strong>
              </p>

              <p>
                <span>
                  Delivery
                </span>
                <strong>
                  {selected.parent
                    .deliveryCharge > 0
                    ? money(
                        selected.parent
                          .deliveryCharge,
                      )
                    : 'FREE'}
                </strong>
              </p>

              <p className="total">
                <span>
                  This product
                </span>
                <strong>
                  {money(
                    selected.item
                      .subtotal,
                  )}
                </strong>
              </p>

              <small className="shared-bill-note">
                Delivery and any order-level discount are shared by the parent checkout. Cancelling this product recalculates the parent order total automatically.
              </small>
            </div>

            <div className="simple-details-payment">
              <span>Payment</span>
              <strong>
                {
                  selected.parent
                    .paymentMethod
                }
              </strong>
            </div>
          </section>
        </div>
      )}

      {imagePreview && (
        <div
          className="simple-image-preview"
          onMouseDown={() =>
            setImagePreview(null)
          }
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() =>
              setImagePreview(null)
            }
          >
            <X />
          </button>

          <img
            src={imagePreview}
            alt="Product preview"
            onMouseDown={(
              event,
            ) =>
              event.stopPropagation()
            }
          />
        </div>
      )}

      <style jsx>{`
        .simple-orders-page {
          width: 100%;
          color: #1d1915;
        }

        .simple-orders-head {
          margin-bottom: 16px;
          padding: 6px 2px 12px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .simple-orders-head small {
          color: #d97800;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .12em;
        }

        .simple-orders-head h2 {
          margin: 5px 0 2px;
          font-size: 30px;
          line-height: 1.1;
        }

        .simple-orders-head p {
          margin: 0;
          color: #777068;
          font-size: 13px;
        }

        .simple-orders-head > span {
          color: #81786e;
          font-size: 13px;
        }

        .simple-orders-tools {
          margin-bottom: 14px;
          padding: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #e5ded6;
          border-radius: 15px;
          background: #fff;
        }

        .simple-orders-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .simple-orders-filters button {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid transparent;
          border-radius: 10px;
          color: #6f675f;
          background: transparent;
          font-size: 12px;
          cursor: pointer;
        }

        .simple-orders-filters button.active {
          color: #995600;
          border-color: #edc995;
          background: #fff2df;
          font-weight: 600;
        }

        .simple-orders-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .simple-orders-search {
          width: 220px;
          min-height: 38px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #e4ddd6;
          border-radius: 10px;
          background: #faf9f7;
        }

        .simple-orders-search svg {
          width: 16px;
          color: #8b8178;
        }

        .simple-orders-search input {
          width: 100%;
          border: 0;
          outline: 0;
          color: #221e1a;
          background: transparent;
          font-size: 12px;
        }

        .simple-orders-controls select {
          min-height: 38px;
          padding: 0 30px 0 10px;
          border: 1px solid #e4ddd6;
          border-radius: 10px;
          color: #5f5851;
          background: #fff;
          font-size: 12px;
        }

        .simple-orders-list {
          display: grid;
          gap: 10px;
        }

        .simple-order-card {
          width: 100%;
          min-height: 92px;
          padding: 12px 14px;
          display: grid;
          grid-template-columns: 68px minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          border: 1px solid #e6dfd7;
          border-radius: 16px;
          color: inherit;
          background: #fff;
          text-align: left;
          cursor: pointer;
        }

        .simple-order-image {
          width: 68px;
          height: 68px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #9a8f84;
          background: #f7f3ee;
        }

        .simple-order-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: zoom-in;
        }

        .simple-order-copy {
          min-width: 0;
        }

        .simple-order-top {
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .simple-order-top > span {
          overflow: hidden;
          color: #8a8178;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .simple-order-top em {
          padding: 4px 7px;
          border-radius: 999px;
          color: #7e5a2e;
          background: #fff2df;
          font-size: 9px;
          font-style: normal;
          white-space: nowrap;
        }

        .simple-order-top em.status-delivered {
          color: #137c43;
          background: #e9f8ef;
        }

        .simple-order-top em.status-cancelled {
          color: #b23b43;
          background: #fff0f1;
        }

        .simple-order-top em.status-processing,
        .simple-order-top em.status-pending,
        .simple-order-top em.status-confirmed,
        .simple-order-top em.status-ready,
        .simple-order-top em.status-out-for-delivery {
          color: #176a8a;
          background: #eaf7fb;
        }

        .simple-order-copy > strong {
          display: block;
          overflow: hidden;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .simple-order-copy > small {
          display: block;
          margin-top: 5px;
          color: #827970;
          font-size: 11px;
        }

        .simple-order-status-line {
          color: #168648 !important;
          font-weight: 600;
        }

        .simple-order-delivery-line {
          color: #6d756f !important;
          font-size: 10px !important;
        }

        .simple-order-gift-count {
          display: inline-flex !important;
          align-items: center;
          gap: 5px;
          color: #168648 !important;
          font-weight: 600;
        }

        .simple-order-gift-count svg {
          width: 13px;
          height: 13px;
        }

        .simple-order-return-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:7px}
        .simple-order-return-actions button{border:1px solid #d8c5ad;background:#fffaf3;color:#8a4d00;border-radius:9px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer}
        .simple-order-return-status{display:block;margin-top:7px;color:#9a5b00;font-size:11px;font-weight:700}
        .simple-details-return-box{margin:14px 0;padding:14px;border:1px solid #ead8bf;background:#fffaf2;border-radius:14px;display:grid;gap:8px}
        .simple-details-return-box>strong{font-size:14px;color:#7d4800}
        .simple-details-return-box>span{font-size:12px;color:#74675b}
        .simple-details-return-box>div{display:flex;gap:8px}
        .simple-details-return-box button{border:0;background:#111;color:#fff;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}

        .simple-order-total {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .simple-order-total > div {
          display: grid;
          justify-items: end;
          gap: 7px;
        }

        .simple-order-total strong {
          font-size: 16px;
        }

        .simple-order-total svg {
          width: 18px;
          color: #8c8379;
        }

        .simple-order-card-cancel {
          min-height: 30px;
          padding: 0 11px;
          border: 1px solid #df8f96;
          border-radius: 9px;
          color: #a52f38;
          background: #fff3f3;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .simple-order-card-cancel:disabled {
          opacity: .6;
          cursor: wait;
        }

        .simple-orders-empty-card {
          min-height: 240px;
          display: grid;
          place-content: center;
          justify-items: center;
          border: 1px solid #e6dfd7;
          border-radius: 18px;
          background: #fff;
          text-align: center;
        }

        .simple-order-overlay {
          position: fixed;
          inset: 0;
          z-index: 500;
          padding: 24px;
          display: grid;
          place-items: center;
          background: rgba(24, 20, 16, .48);
          backdrop-filter: blur(4px);
          overflow: hidden;
        }

        .simple-order-details {
          width: min(720px, 100%);
          max-height: min(92vh, calc(100dvh - 48px));
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 24px;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 32px 90px rgba(0,0,0,.24);
        }

        .simple-order-details > header {
          position: sticky;
          top: 0;
          z-index: 30;
          margin: 0;
          padding: 0 0 18px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid #eee7df;
          background: #ffffff;
          box-shadow: 0 5px 14px rgba(30, 23, 17, .05);
        }

        .simple-order-details > header small {
          color: #c46a09;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .simple-order-details > header h2 {
          margin: 7px 0 0;
          font-size: 26px;
        }

        .simple-order-details > header > button {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          position: relative;
          z-index: 31;
          display: grid;
          place-items: center;
          align-self: flex-start;
          border: 1px solid #d9d1ca;
          border-radius: 13px;
          color: #111111;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, .08);
        }

        .simple-details-cancel-top {
          margin-top: 18px;
          padding: 17px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid #eadfe0;
          border-radius: 17px;
          background: #fffafa;
        }

        .simple-details-cancel-top.active {
          border-color: #e8aeb3;
          background: #fff2f3;
        }

        .simple-details-cancel-top strong,
        .simple-details-cancel-top span {
          display: block;
        }

        .simple-details-cancel-top span {
          margin-top: 4px;
          color: #806c6d;
          font-size: 12px;
        }

        .simple-details-cancel-top button {
          min-height: 44px;
          padding: 0 16px;
          border: 0;
          border-radius: 12px;
          color: #fff;
          background: #c73743;
          font-weight: 800;
          cursor: pointer;
        }

        .simple-details-status,
        .simple-details-delivery {
          margin-top: 18px;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          border: 1px solid #e7e1da;
          border-radius: 16px;
          background: #faf8f5;
        }

        .simple-details-status small,
        .simple-details-status strong,
        .simple-details-delivery small,
        .simple-details-delivery strong {
          display: block;
        }

        .simple-details-status small,
        .simple-details-delivery small {
          color: #83796f;
          font-size: 11px;
        }

        .simple-details-status strong,
        .simple-details-delivery strong {
          margin-top: 4px;
        }

        .simple-details-date {
          text-align: right;
        }

        .simple-details-delivery {
          background: #f5fbf7;
        }

        .simple-details-delivery p {
          margin: 5px 0 0;
          color: #587162;
          font-size: 12px;
        }

        .simple-details-items {
          margin-top: 18px;
          display: grid;
          gap: 10px;
        }

        .simple-details-items article {
          padding: 11px;
          display: grid;
          grid-template-columns: 82px minmax(0,1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid #e8e2dc;
          border-radius: 15px;
        }

        .simple-details-items article > div {
          width: 82px;
          height: 82px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #f5f1ec;
        }

        .simple-details-items img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: zoom-in;
        }

        .simple-details-items span {
          min-width: 0;
        }

        .simple-details-items strong,
        .simple-details-items small {
          display: block;
        }

        .simple-details-items small {
          margin-top: 5px;
          color: #81786f;
          font-size: 11px;
        }

        .simple-details-gifts {
          margin-top: 18px;
          padding: 16px;
          border: 1px solid #d8eadc;
          border-radius: 16px;
          background: #f7fcf8;
        }

        .simple-details-gifts > header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .simple-details-gifts > header > svg {
          color: #178746;
        }

        .simple-details-gifts > header strong,
        .simple-details-gifts > header small {
          display: block;
        }

        .simple-details-gifts > header small {
          margin-top: 3px;
          color: #617468;
          font-size: 11px;
        }

        .simple-details-gifts-list {
          margin-top: 12px;
          display: grid;
          gap: 9px;
        }

        .simple-details-gifts-list article {
          padding: 9px;
          display: grid;
          grid-template-columns: 62px minmax(0,1fr);
          align-items: center;
          gap: 11px;
          border: 1px solid #dce8df;
          border-radius: 13px;
          background: #fff;
        }

        .simple-details-gifts-list article > div {
          width: 62px;
          height: 62px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #eef7f0;
        }

        .simple-details-gifts-list img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: zoom-in;
        }

        .simple-details-gifts-list span strong,
        .simple-details-gifts-list span small {
          display: block;
        }

        .simple-details-gifts-list span small {
          margin-top: 4px;
          color: #168648;
          font-size: 11px;
          font-weight: 700;
        }

        .simple-details-address {
          margin-top: 18px;
          padding: 16px;
          display: flex;
          gap: 12px;
          border: 1px solid #e2e8e3;
          border-radius: 16px;
          background: #f7fbf8;
        }

        .simple-details-address svg {
          flex: 0 0 auto;
        }

        .simple-details-address small,
        .simple-details-address strong {
          display: block;
        }

        .simple-details-address small {
          color: #7c837e;
          font-size: 11px;
        }

        .simple-details-address strong {
          margin-top: 4px;
        }

        .simple-details-address p {
          margin: 5px 0 0;
          color: #777;
          font-size: 12px;
        }

        .simple-details-bill {
          margin-top: 18px;
          padding: 16px;
          border: 1px solid #e4ddd6;
          border-radius: 16px;
        }

        .simple-details-bill p {
          margin: 0 0 11px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .simple-details-bill p.total {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #e5ddd6;
          font-size: 17px;
        }

        .shared-bill-note {
          display: block;
          margin-top: 12px;
          color: #857b72;
          font-size: 10px;
          line-height: 1.5;
        }

        .simple-details-payment {
          margin-top: 18px;
          padding: 15px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          border-radius: 14px;
          background: #f7f3ed;
        }

        .simple-image-preview {
          position: fixed;
          inset: 0;
          z-index: 900;
          padding: 20px;
          display: grid;
          place-items: center;
          background: rgba(0,0,0,.82);
        }

        .simple-image-preview > button {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #111;
          background: #fff;
          cursor: pointer;
        }

        .simple-image-preview > img {
          max-width: min(900px, 94vw);
          max-height: 88vh;
          object-fit: contain;
          border-radius: 16px;
          background: #fff;
        }

        @media (max-width: 700px) {
          .simple-orders-tools {
            align-items: stretch;
            flex-direction: column;
          }

          .simple-orders-controls {
            width: 100%;
          }

          .simple-orders-search {
            width: 100%;
          }

          .simple-orders-controls select {
            width: 44%;
          }

          .simple-order-card {
            grid-template-columns: 86px minmax(0,1fr);
            align-items: start;
            padding: 12px;
          }

          .simple-order-image {
            width: 86px;
            height: 86px;
          }

          .simple-order-total {
            grid-column: 2;
            justify-content: space-between;
            margin-top: 2px;
          }

          .simple-order-total > div {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }

          .simple-order-card-cancel {
            min-height: 36px;
            padding: 0 13px;
            font-size: 11px;
          }

          .simple-order-overlay {
            padding:
              max(10px, env(safe-area-inset-top))
              10px
              max(10px, env(safe-area-inset-bottom));
            align-items: center;
          }

          .simple-order-details {
            width: 100%;
            max-height: calc(
              100dvh -
              max(20px, env(safe-area-inset-top)) -
              max(20px, env(safe-area-inset-bottom))
            );
            padding: 18px;
            border-radius: 24px;
          }

          .simple-order-details > header {
            top: 0;
            margin: 0;
            padding: 0 0 16px;
          }

          .simple-order-details > header h2 {
            padding-right: 8px;
            font-size: 24px;
            overflow-wrap: anywhere;
          }

          .simple-details-cancel-top {
            align-items: stretch;
            flex-direction: column;
          }

          .simple-details-cancel-top button {
            width: 100%;
          }

          .simple-details-items article {
            grid-template-columns: 72px minmax(0,1fr);
          }

          .simple-details-items article > div {
            width: 72px;
            height: 72px;
          }

          .simple-details-items article > b {
            grid-column: 2;
          }
        }
      `}</style>
    </div>
  );
}
