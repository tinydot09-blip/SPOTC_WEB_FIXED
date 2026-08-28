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
  title: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
};

type OrderRecord = {
  id: string;
  orderNumber: string;
  businessName: string;
  items: OrderItem[];
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
};

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
): SavedGiftBundle | null {
  if (
    typeof window === 'undefined' ||
    !productId
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        `spotc-free-gifts:${productId}`,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (
      !parsed ||
      !Array.isArray(parsed.gifts)
    ) {
      return null;
    }

    return {
      product_id:
        String(
          parsed.product_id ||
            productId,
        ),

      quantity:
        Number(parsed.quantity) || 1,

      entitlement:
        Number(parsed.entitlement) ||
        parsed.gifts.length,

      gifts: parsed.gifts
        .filter(
          (
            gift,
          ): gift is SavedFreeGift =>
            Boolean(
              gift &&
                typeof gift ===
                  'object' &&
                'id' in gift,
            ),
        )
        .map((gift) => ({
          id: String(gift.id),
          title:
            String(
              gift.title ||
                'FREE Gift',
            ),
          image:
            String(gift.image || ''),
          original_price:
            Number(
              gift.original_price,
            ) || 0,
          price: 0,
          is_free_gift: true,
        })),
    };
  } catch {
    return null;
  }
}

function giftsForOrder(
  order: OrderRecord,
): SavedFreeGift[] {
  const unique =
    new Map<
      string,
      SavedFreeGift
    >();

  for (const item of order.items) {
    const bundle =
      readSavedGifts(item.id);

    for (const gift of
      bundle?.gifts || []) {
      unique.set(
        gift.id,
        gift,
      );
    }
  }

  return [
    ...unique.values(),
  ];
}

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

function isActiveStatus(
  status: string,
): boolean {
  return ![
    'delivered',
    'cancelled',
  ].includes(status);
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

function textOf(
  value: unknown,
): string {
  return typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim();
}

function numberOf(
  value: unknown,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function dateOf(
  value: unknown,
): Date | null {
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
      (
        value as {
          seconds?: unknown;
        }
      ).seconds,
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

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  return null;
}

function imageOf(
  item: DocumentData,
): string {
  return (
    textOf(item.image) ||
    textOf(item.image_url) ||
    textOf(item.product_image) ||
    textOf(item.thumbnail_url) ||
    textOf(item.product_thumbnail)
  );
}

function mapItems(
  value: unknown,
): OrderItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    (item, index) => {
      const record =
        typeof item === 'object' &&
        item !== null
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

      return {
        id:
          textOf(record.id) ||
          textOf(record.product_id) ||
          String(index),

        title:
          textOf(record.title) ||
          textOf(
            record.product_name,
          ) ||
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

        size:
          textOf(record.size),

        color:
          textOf(record.color),
      };
    },
  );
}

function normalizeStatus(
  value: unknown,
): string {
  const status = textOf(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  if (!status) {
    return 'placed';
  }

  if (status.includes('cancel')) {
    return 'cancelled';
  }

  if (
    status.includes(
      'out for delivery',
    )
  ) {
    return 'out for delivery';
  }

  if (status.includes('deliver')) {
    return 'delivered';
  }

  if (status.includes('ready')) {
    return 'ready';
  }

  if (status.includes('confirm')) {
    return 'confirmed';
  }

  if (status.includes('process')) {
    return 'processing';
  }

  if (status.includes('pending')) {
    return 'pending';
  }

  if (status.includes('place')) {
    return 'placed';
  }

  return status;
}

function buildAddress(
  data: DocumentData,
): string {
  const direct =
    textOf(data.delivery_address) ||
    textOf(data.address_text) ||
    textOf(data.full_address);

  if (direct) {
    return direct;
  }

  const source =
    typeof data.address ===
      'object' &&
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

  if (
    !title &&
    numberOf(
      data.delivery_charge ??
        data.delivery_fee,
    ) > 0
  ) {
    id = 'instant';
    title = 'Instant Delivery';
    window = window || 'Delivery in about 15 mins';
  }

  return {
    id,
    title: title || 'Delivery slot not saved',
    window:
      window ||
      'Delivery time was not stored for this order.',
  };
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
    items.reduce(
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
      textOf(
        data.business_name,
      ) ||
      textOf(data.shop_name) ||
      'SPOTC Shop',

    items,

    subtotal,
    deliveryCharge,
    platformFee,
    discount,
    total,

    paymentMethod:
      textOf(
        data.payment_method,
      ) ||
      textOf(
        data.payment_mode,
      ) ||
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

    address:
      buildAddress(data),

    phone:
      textOf(
        data.customer_phone ??
          data.phone,
      ),

    deliveryAssigned: Boolean(
      textOf(data.delivery_boy_id) ||
        textOf(data.delivery_partner_id) ||
        textOf(data.assigned_delivery_boy_id) ||
        textOf(data.delivery_assignment_status) === 'assigned' ||
        dateOf(data.delivery_assigned_at),
    ),

    instantDelivery:
      deliveryInfo.id === 'instant' ||
      [
        data.delivery_type,
        data.delivery_mode,
        data.delivery_speed,
        data.delivery_slot,
        data.estimated_delivery,
      ]
        .map(textOf)
        .join(' ')
        .toLowerCase()
        .match(/instant|15\s*(?:-|–|to)?\s*45\s*mins?|15\s*mins?/) !== null,

    deliveryOptionId:
      deliveryInfo.id,

    deliveryTitle:
      deliveryInfo.title,

    deliveryWindow:
      deliveryInfo.window,
  };
}

function money(
  value: number,
): string {
  return `₹${Math.round(
    value,
  ).toLocaleString('en-IN')}`;
}

function formatDate(
  date: Date | null,
): string {
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(date);
}

function formatDateTime(
  date: Date | null,
): string {
  if (!date) {
    return 'Date unavailable';
  }

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
  ] = useState<OrderRecord[]>(
    [],
  );

  const [
    selected,
    setSelected,
  ] =
    useState<OrderRecord | null>(
      null,
    );

  const [
    filter,
    setFilter,
  ] =
    useState<OrderFilter>(
      'all',
    );

  const [
    sort,
    setSort,
  ] =
    useState<OrderSort>(
      'newest',
    );

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    cancellingId,
    setCancellingId,
  ] = useState('');

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [
    nowMs,
    setNowMs,
  ] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMs(Date.now()),
      1000,
    );

    return () => window.clearInterval(timer);
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
    if (!authChecked) {
      return;
    }

    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    // Keep a non-null user reference for the async loader below.
    // TypeScript does not preserve the state narrowing inside nested async functions.
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
            ).catch(
              () => null,
            ),

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
            ).catch(
              () => null,
            ),

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
            ).catch(
              () => null,
            ),
          ]);

        if (!active) {
          return;
        }

        const unique =
          new Map<
            string,
            OrderRecord
          >();

        for (
          const snapshot
          of snapshots
        ) {
          for (
            const orderDoc
            of snapshot?.docs ??
            []
          ) {
            if (
              !unique.has(
                orderDoc.id,
              )
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
          [
            ...unique.values(),
          ].sort(
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

  function cancelWindowSeconds(
    order: OrderRecord,
  ): number {
    return order.instantDelivery
      ? 2 * 60
      : 15 * 60;
  }

  function cancelSecondsLeft(
    order: OrderRecord,
  ): number {
    if (!order.createdAt) {
      return 0;
    }

    const expiresAt =
      order.createdAt.getTime() +
      cancelWindowSeconds(order) * 1000;

    return Math.max(
      0,
      Math.ceil((expiresAt - nowMs) / 1000),
    );
  }

  function canCancelOrder(
    order: OrderRecord,
  ): boolean {
    if (
      ['cancelled', 'delivered', 'out for delivery'].includes(
        order.status,
      )
    ) {
      return false;
    }

    if (order.deliveryAssigned) {
      return false;
    }

    return cancelSecondsLeft(order) > 0;
  }

  function formatCancelCountdown(
    seconds: number,
  ): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  function cancelHelpText(
    order: OrderRecord,
  ): string {
    if (order.status === 'cancelled') {
      return 'This order has been cancelled.';
    }

    if (
      order.status === 'delivered' ||
      order.status === 'out for delivery'
    ) {
      return 'Cancellation is no longer available.';
    }

    if (order.deliveryAssigned) {
      return 'Cancellation closed because delivery has been assigned.';
    }

    const seconds = cancelSecondsLeft(order);

    if (seconds <= 0) {
      return order.instantDelivery
        ? 'The 2-minute cancellation window has ended.'
        : 'The 15-minute cancellation window has ended.';
    }

    return order.instantDelivery
      ? `Instant delivery: cancel within ${formatCancelCountdown(seconds)}.`
      : `FREE delivery: cancel within ${formatCancelCountdown(seconds)}.`;
  }

  async function cancelOrder(
    order: OrderRecord,
  ) {
    if (
      cancellingId ||
      !canCancelOrder(order)
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel order ${order.orderNumber}?\n\nThis cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setCancellingId(order.id);

    try {
      const db = getFirestore();
      const orderRef = doc(
        db,
        'Orders',
        order.id,
      );

      await runTransaction(
        db,
        async (transaction) => {
          const snapshot =
            await transaction.get(orderRef);

          if (!snapshot.exists()) {
            throw new Error(
              'Order no longer exists.',
            );
          }

          const data = snapshot.data();

          const liveStatus =
            normalizeStatus(
              data.order_status ??
                data.status ??
                data.delivery_status,
            );

          const deliveryAssigned =
            Boolean(
              textOf(data.delivery_boy_id) ||
                textOf(data.delivery_partner_id) ||
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

          if (
            ['cancelled', 'delivered', 'out for delivery'].includes(
              liveStatus,
            )
          ) {
            throw new Error(
              'This order can no longer be cancelled.',
            );
          }

          if (deliveryAssigned) {
            throw new Error(
              'Delivery has already been assigned, so this order can no longer be cancelled.',
            );
          }

          const instantDelivery = [
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
            Date.now() - createdAt.getTime() >=
              cancellationWindowMs
          ) {
            throw new Error(
              instantDelivery
                ? 'The 2-minute cancellation window for instant delivery has ended.'
                : 'The 15-minute cancellation window for FREE delivery has ended.',
            );
          }

          transaction.update(
            orderRef,
            {
              order_status: 'cancelled',
              status: 'cancelled',
              cancelled_at:
                serverTimestamp(),
              cancelled_by:
                'customer',
              updated_at:
                serverTimestamp(),
            },
          );
        },
      );

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: 'cancelled',
              }
            : item,
        ),
      );

      setSelected((current) =>
        current?.id === order.id
          ? {
              ...current,
              status: 'cancelled',
            }
          : current,
      );
    } catch (error) {
      console.error(
        'Cancel order failed:',
        error,
      );

      window.alert(
        error instanceof Error
          ? error.message
          : 'Unable to cancel this order. Please try again.',
      );
    } finally {
      setCancellingId('');
    }
  }

  const filteredOrders =
    useMemo(() => {
      const queryText =
        search
          .trim()
          .toLowerCase();

      const result =
        orders.filter(
          (order) => {
            if (
              filter ===
                'active' &&
              !isActiveStatus(
                order.status,
              )
            ) {
              return false;
            }

            if (
              filter ===
                'delivered' &&
              order.status !==
                'delivered'
            ) {
              return false;
            }

            if (
              filter ===
                'cancelled' &&
              order.status !==
                'cancelled'
            ) {
              return false;
            }

            if (!queryText) {
              return true;
            }

            const haystack = [
              order.orderNumber,
              order.businessName,
              order.status,
              ...order.items.map(
                (item) =>
                  item.title,
              ),
            ]
              .join(' ')
              .toLowerCase();

            return haystack.includes(
              queryText,
            );
          },
        );

      return result.sort(
        (a, b) => {
          if (
            sort ===
            'amount-high'
          ) {
            return (
              b.total -
              a.total
            );
          }

          if (
            sort ===
            'amount-low'
          ) {
            return (
              a.total -
              b.total
            );
          }

          const aTime =
            a.createdAt?.getTime() ??
            0;

          const bTime =
            b.createdAt?.getTime() ??
            0;

          return sort === 'oldest'
            ? aTime - bTime
            : bTime - aTime;
        },
      );
    }, [
      orders,
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
        <h2>Sign in to view orders</h2>
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
          <small>
            MY ORDERS
          </small>

          <h2>Orders</h2>

          <p>
            Tap any order to
            view full details.
          </p>
        </div>

        <span>
          {orders.length}{' '}
          {orders.length === 1
            ? 'order'
            : 'orders'}
        </span>
      </header>

      {orders.length > 0 && (
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
              ([
                id,
                label,
              ]) => (
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
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search orders"
              />
            </label>

            <select
              value={sort}
              onChange={(event) =>
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

      {orders.length === 0 ? (
        <section className="simple-orders-empty-card">
          <Package />

          <h3>No orders yet</h3>

          <p>
            Your placed orders
            will appear here.
          </p>
        </section>
      ) : filteredOrders.length === 0 ? (
        <section className="simple-orders-empty-card">
          <Search />

          <h3>No matching orders</h3>

          <p>
            Try another filter or search.
          </p>
        </section>
      ) : (
        <section className="simple-orders-list">
          {filteredOrders.map(
            (order) => {
              const firstItem =
                order.items[0];

              const freeGifts =
                giftsForOrder(
                  order,
                );

              return (
                <article
                  key={order.id}
                  className="simple-order-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(order)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(order);
                    }
                  }}
                >
                  <div className="simple-order-image">
                    {firstItem?.image ? (
                      <img
                        src={firstItem.image}
                        alt={firstItem.title}
                        onClick={(event) => {
                          event.stopPropagation();
                          setImagePreview(firstItem.image);
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
                          order.orderNumber
                        }
                      </span>

                      <em
                        className={`status-${order.status.replace(
                          /\s+/g,
                          '-',
                        )}`}
                      >
                        {statusLabel(
                          order.status,
                        )}
                      </em>
                    </div>

                    <strong>
                      {firstItem?.title ||
                        order.businessName}
                    </strong>

                    <small className="simple-order-status-line">
                      {statusMessage(
                        order.status,
                      )}
                    </small>

                    <small>
                      {order.items.length}{' '}
                      {order.items.length ===
                      1
                        ? 'item'
                        : 'items'}
                      {' · '}
                      {formatDateTime(
                        order.createdAt,
                      )}
                    </small>

                    <small className="simple-order-delivery-line">
                      {order.deliveryTitle}
                      {' · '}
                      {order.deliveryWindow}
                    </small>

                    {freeGifts.length > 0 && (
                      <small className="simple-order-gift-count">
                        <Gift />
                        {freeGifts.length}{' '}
                        FREE Gift
                        {freeGifts.length === 1
                          ? ''
                          : 's'}{' '}
                        Included
                      </small>
                    )}
                  </div>

                  <div className="simple-order-total">
                    <div>
                      <strong>{money(order.total)}</strong>

                      {canCancelOrder(order) && (
                        <button
                          type="button"
                          className="simple-order-card-cancel"
                          disabled={cancellingId === order.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void cancelOrder(order);
                          }}
                        >
                          {cancellingId === order.id
                            ? 'Cancelling…'
                            : 'Cancel'}
                        </button>
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
                    selected.orderNumber
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

            <div className="simple-details-status">
              <span>
                <small>Status</small>
                <strong>
                  {statusMessage(
                    selected.status,
                  )}
                </strong>
              </span>

              <span className="simple-details-date">
                <small>
                  Ordered on
                </small>

                <strong>
                  {formatDateTime(
                    selected.createdAt,
                  )}
                </strong>
              </span>
            </div>

            <section className={`simple-details-cancel-top ${canCancelOrder(selected) ? 'active' : ''}`}>
              <div>
                <strong>Cancellation</strong>
                <span>{cancelHelpText(selected)}</span>
              </div>

              {canCancelOrder(selected) && (
                <button
                  type="button"
                  disabled={cancellingId === selected.id}
                  onClick={() => void cancelOrder(selected)}
                >
                  {cancellingId === selected.id
                    ? 'Cancelling…'
                    : 'Cancel Order'}
                </button>
              )}
            </section>

            <section className="simple-details-delivery">
              <div>
                <small>Delivery option</small>
                <strong>{selected.deliveryTitle}</strong>
                <p>{selected.deliveryWindow}</p>
              </div>

              <div>
                <small>Delivery charge</small>
                <strong>
                  {selected.deliveryCharge > 0
                    ? money(selected.deliveryCharge)
                    : 'FREE'}
                </strong>
              </div>
            </section>

            <div className="simple-details-items">
              {selected.items.map(
                (item) => (
                  <article
                    key={item.id}
                  >
                    <div>
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          onClick={() => setImagePreview(item.image)}
                        />
                      ) : (
                        <Package />
                      )}
                    </div>

                    <span>
                      <strong>
                        {
                          item.title
                        }
                      </strong>

                      <small>
                        Qty {item.quantity}
                        {' · '}
                        {money(item.price)} each
                        {item.size
                          ? ` · Size ${item.size}`
                          : ''}
                        {item.color
                          ? ` · ${item.color}`
                          : ''}
                      </small>
                    </span>

                    <b>
                      {money(
                        item.subtotal,
                      )}
                    </b>
                  </article>
                ),
              )}
            </div>

            {giftsForOrder(
              selected,
            ).length > 0 && (
              <section className="simple-details-gifts">
                <header>
                  <Gift />

                  <div>
                    <strong>
                      {giftsForOrder(
                        selected,
                      ).length}{' '}
                      FREE Gift
                      {giftsForOrder(
                        selected,
                      ).length === 1
                        ? ''
                        : 's'}{' '}
                      Included
                    </strong>

                    <small>
                      Included at no extra cost
                    </small>
                  </div>
                </header>

                <div className="simple-details-gifts-list">
                  {giftsForOrder(
                    selected,
                  ).map((gift) => (
                    <article
                      key={gift.id}
                    >
                      <div>
                        {gift.image ? (
                          <img
                            src={gift.image}
                            alt={gift.title}
                            onClick={() => setImagePreview(gift.image)}
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
                  ))}
                </div>
              </section>
            )}

            {selected.address && (
              <div className="simple-details-address">
                <MapPin />

                <span>
                  <small>
                    Delivery Address
                  </small>

                  <strong>
                    {
                      selected.address
                    }
                  </strong>

                  {selected.phone && (
                    <p>
                      {
                        selected.phone
                      }
                    </p>
                  )}
                </span>
              </div>
            )}

            <div className="simple-details-bill">
              <p>
                <span>
                  Subtotal
                </span>

                <strong>
                  {money(
                    selected.subtotal,
                  )}
                </strong>
              </p>

              <p>
                <span>
                  Delivery
                </span>

                <strong>
                  {selected.deliveryCharge >
                  0
                    ? money(
                        selected.deliveryCharge,
                      )
                    : 'FREE'}
                </strong>
              </p>

              <p>
                <span>
                  Platform fee
                </span>

                <strong>
                  {money(
                    selected.platformFee,
                  )}
                </strong>
              </p>

              {selected.discount >
                0 && (
                <p>
                  <span>
                    Discount
                  </span>

                  <strong>
                    -
                    {money(
                      selected.discount,
                    )}
                  </strong>
                </p>
              )}

              <p className="total">
                <span>
                  Total
                </span>

                <strong>
                  {money(
                    selected.total,
                  )}
                </strong>
              </p>
            </div>

            <div className="simple-details-payment">
              <span>
                Payment
              </span>

              <strong>
                {
                  selected.paymentMethod
                }
              </strong>
            </div>

            <div className="simple-details-help">
              <span>Need help with this order?</span>
              <small>
                Keep the order number ready when contacting SPOTC support.
              </small>
            </div>

          </section>
        </div>
      )}

      {imagePreview && (
        <div
          className="simple-image-preview"
          onMouseDown={() => setImagePreview(null)}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setImagePreview(null)}
          >
            <X />
          </button>

          <img
            src={imagePreview}
            alt="Product preview"
            onMouseDown={(event) => event.stopPropagation()}
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
          cursor: pointer;
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
          transition:
            border-color .15s ease,
            box-shadow .15s ease,
            transform .15s ease;
        }

        .simple-order-card:hover {
          border-color: #e4ba86;
          box-shadow: 0 9px 24px rgba(37, 28, 18, .07);
          transform: translateY(-1px);
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
        }

        .simple-order-image svg {
          width: 26px;
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

        .simple-order-copy > .simple-order-status-line {
          color: #168648;
          font-weight: 600;
        }

        .simple-order-copy > .simple-order-delivery-line {
          color: #6d756f;
          font-size: 10px;
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

        .simple-order-top em.status-processing,
        .simple-order-top em.status-pending,
        .simple-order-top em.status-confirmed,
        .simple-order-top em.status-ready,
        .simple-order-top em.status-out-for-delivery {
          color: #176a8a;
          background: #eaf7fb;
        }

        .simple-order-total {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .simple-order-total strong {
          font-size: 16px;
        }

        .simple-order-total svg {
          width: 18px;
          color: #8c8379;
        }

        .simple-order-total > div {
          display: grid;
          justify-items: end;
          gap: 7px;
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

        .simple-orders-empty-card svg {
          width: 36px;
          height: 36px;
          color: #978b80;
        }

        .simple-orders-empty-card h3 {
          margin: 12px 0 0;
        }

        .simple-orders-empty-card p {
          margin: 6px 0 0;
          color: #81786e;
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
        }

        .simple-order-details {
          width: min(640px, 100%);
          max-height: min(86vh, 780px);
          overflow-y: auto;
          padding: 22px;
          border: 1px solid #e6dfd7;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 30px 90px rgba(0, 0, 0, .22);
        }

        .simple-order-details > header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .simple-order-details > header small {
          color: #d97800;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .12em;
        }

        .simple-order-details > header h2 {
          margin: 5px 0 0;
          font-size: 20px;
        }

        .simple-order-details > header button {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid #e3dcd4;
          border-radius: 11px;
          background: #fff;
          cursor: pointer;
        }

        .simple-order-details > header button svg {
          width: 18px;
        }

        .simple-details-status,
        .simple-details-payment {
          margin-top: 18px;
          padding: 13px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-radius: 12px;
          background: #f8f5f1;
        }

        .simple-details-status > span {
          min-width: 0;
        }

        .simple-details-status small,
        .simple-details-status strong {
          display: block;
        }

        .simple-details-status small,
        .simple-details-payment span {
          color: #766f67;
          font-size: 11px;
        }

        .simple-details-status strong,
        .simple-details-payment strong {
          margin-top: 3px;
          font-size: 13px;
        }

        .simple-details-date {
          text-align: right;
        }

        .simple-details-cancel-top {
          margin-top: 14px;
          padding: 13px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #ead9da;
          border-radius: 12px;
          background: #fffafa;
        }

        .simple-details-cancel-top.active {
          border-color: #e09aa0;
          background: #fff1f2;
          box-shadow: 0 0 0 2px rgba(185, 57, 67, .05);
        }

        .simple-details-cancel-top strong,
        .simple-details-cancel-top span {
          display: block;
        }

        .simple-details-cancel-top strong {
          color: #9f2933;
          font-size: 12px;
        }

        .simple-details-cancel-top span {
          margin-top: 3px;
          color: #735f61;
          font-size: 10px;
        }

        .simple-details-cancel-top button {
          min-height: 36px;
          padding: 0 13px;
          flex: 0 0 auto;
          border: 1px solid #cc6972;
          border-radius: 10px;
          color: #fff;
          background: #b93641;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .simple-details-cancel-top button:disabled {
          opacity: .6;
          cursor: wait;
        }

        .simple-details-delivery {
          margin-top: 16px;
          padding: 13px 14px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          border: 1px solid #dcecdf;
          border-radius: 12px;
          background: #f7fcf8;
        }

        .simple-details-delivery small,
        .simple-details-delivery strong,
        .simple-details-delivery p {
          display: block;
        }

        .simple-details-delivery small {
          color: #6f786f;
          font-size: 10px;
        }

        .simple-details-delivery strong {
          margin-top: 3px;
          color: #176a3c;
          font-size: 13px;
        }

        .simple-details-delivery p {
          margin: 4px 0 0;
          color: #617469;
          font-size: 11px;
          line-height: 1.4;
        }

        .simple-details-items {
          margin-top: 16px;
          display: grid;
          gap: 9px;
        }

        .simple-details-items article {
          padding: 10px;
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr) auto;
          align-items: center;
          gap: 11px;
          border: 1px solid #ece5de;
          border-radius: 13px;
        }

        .simple-details-items article > div {
          width: 58px;
          height: 58px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #988d82;
          background: #f7f4ef;
        }

        .simple-details-items img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: zoom-in;
        }

        .simple-details-items article > span {
          min-width: 0;
        }

        .simple-details-items article > span strong {
          display: block;
          font-size: 13px;
          font-weight: 600;
        }

        .simple-details-items article > span small {
          display: block;
          margin-top: 4px;
          color: #81786f;
          font-size: 11px;
        }

        .simple-details-items article > b {
          font-size: 13px;
        }

        .simple-details-gifts {
          margin-top: 16px;
          padding: 14px;
          border: 1px solid #dcecdf;
          border-radius: 13px;
          background: #f7fcf8;
        }

        .simple-details-gifts > header {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #168648;
        }

        .simple-details-gifts > header > svg {
          width: 20px;
          height: 20px;
          flex: 0 0 auto;
        }

        .simple-details-gifts > header strong,
        .simple-details-gifts > header small {
          display: block;
        }

        .simple-details-gifts > header strong {
          font-size: 13px;
          font-weight: 600;
        }

        .simple-details-gifts > header small {
          margin-top: 3px;
          color: #688171;
          font-size: 10px;
        }

        .simple-details-gifts-list {
          margin-top: 12px;
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 8px;
        }

        .simple-details-gifts-list article {
          min-width: 0;
          padding: 9px;
          display: grid;
          grid-template-columns:
            48px minmax(0, 1fr);
          align-items: center;
          gap: 9px;
          border: 1px solid #dcecdf;
          border-radius: 11px;
          background: #fff;
        }

        .simple-details-gifts-list article > div {
          width: 48px;
          height: 48px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 9px;
          color: #7b9a83;
          background: #f7fcf8;
        }

        .simple-details-gifts-list article img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: zoom-in;
        }

        .simple-details-gifts-list article > span {
          min-width: 0;
        }

        .simple-details-gifts-list article strong {
          display: block;
          overflow: hidden;
          font-size: 12px;
          font-weight: 500;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .simple-details-gifts-list article small {
          display: block;
          margin-top: 4px;
          color: #168648;
          font-size: 11px;
          font-weight: 600;
        }

        .simple-details-address {
          margin-top: 16px;
          padding: 14px;
          display: flex;
          gap: 11px;
          border: 1px solid #e3ece5;
          border-radius: 13px;
          background: #f6fbf7;
        }

        .simple-details-address > svg {
          width: 20px;
          flex: 0 0 auto;
          color: #168648;
        }

        .simple-details-address small,
        .simple-details-address strong {
          display: block;
        }

        .simple-details-address small {
          color: #738077;
          font-size: 10px;
        }

        .simple-details-address strong {
          margin-top: 4px;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.5;
        }

        .simple-details-address p {
          margin: 4px 0 0;
          color: #777069;
          font-size: 11px;
        }

        .simple-details-bill {
          margin-top: 16px;
          padding: 14px;
          border: 1px solid #e8e1da;
          border-radius: 13px;
        }

        .simple-details-bill p {
          margin: 0 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          font-size: 12px;
        }

        .simple-details-bill p:last-child {
          margin-bottom: 0;
        }

        .simple-details-bill p > span {
          color: #746d65;
        }

        .simple-details-bill .total {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5ddd5;
          font-size: 15px;
        }

        .simple-details-bill .total > span {
          color: #191612;
          font-weight: 600;
        }

        .simple-details-help {
          margin-top: 12px;
          padding: 12px 13px;
          border: 1px solid #ece5de;
          border-radius: 11px;
          background: #fbfaf8;
        }

        .simple-details-help span,
        .simple-details-help small {
          display: block;
        }

        .simple-details-help span {
          color: #2a2520;
          font-size: 12px;
          font-weight: 600;
        }

        .simple-details-help small {
          margin-top: 4px;
          color: #7a726a;
          font-size: 10px;
          line-height: 1.4;
        }

        .simple-details-cancel {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #ece5de;
        }

        .simple-details-cancel p {
          margin: 0 0 10px;
          color: #776f67;
          font-size: 11px;
          line-height: 1.45;
        }

        .simple-details-cancel button {
          width: 100%;
          min-height: 42px;
          border: 1px solid #e1a6aa;
          border-radius: 11px;
          color: #a72f38;
          background: #fff5f5;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .simple-details-cancel button:hover {
          border-color: #cc737a;
          background: #ffeded;
        }

        .simple-details-cancel button:disabled {
          opacity: .6;
          cursor: wait;
        }

        .simple-image-preview {
          position: fixed;
          inset: 0;
          z-index: 900;
          padding: 24px;
          display: grid;
          place-items: center;
          background: rgba(0, 0, 0, .86);
        }

        .simple-image-preview > img {
          width: min(92vw, 760px);
          max-height: 86vh;
          object-fit: contain;
          border-radius: 14px;
          background: #fff;
        }

        .simple-image-preview > button {
          position: fixed;
          top: 18px;
          right: 18px;
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #111;
          background: #fff;
          cursor: pointer;
        }

        .simple-order-image img {
          cursor: zoom-in;
        }

        @media (max-width: 650px) {
          .simple-orders-head {
            align-items: flex-start;
          }

          .simple-orders-tools {
            display: grid;
          }

          .simple-orders-controls {
            width: 100%;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .simple-orders-search {
            width: 100%;
          }

          .simple-orders-filters {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 2px;
          }

          .simple-orders-head h2 {
            font-size: 26px;
          }

          .simple-order-card {
            grid-template-columns: 58px minmax(0, 1fr) auto;
            gap: 10px;
            padding: 10px;
          }

          .simple-order-image {
            width: 58px;
            height: 58px;
          }

          .simple-order-copy > strong {
            font-size: 13px;
          }

          .simple-order-top em {
            display: none;
          }

          .simple-order-total strong {
            font-size: 14px;
          }

          .simple-order-total svg {
            width: 16px;
          }

          .simple-details-gifts-list {
            grid-template-columns: 1fr;
          }

          .simple-order-overlay {
            padding: 10px;
            align-items: end;
          }

          .simple-order-details {
            width: 100%;
            max-height: 88vh;
            padding: 18px 14px;
            border-radius: 22px 22px 12px 12px;
          }
        }
      `}</style>
    </div>
  );
}