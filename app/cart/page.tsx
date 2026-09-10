'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock3,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';

import {
  readCart,
  writeCart,
  type CartItem,
} from '@/lib/cart';

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString(
    'en-IN',
  )}`;

type ComboCartItem = CartItem & {
  is_combo_item?: boolean;
  combo_parent_id?: string;
  combo_original_price?: number;
  combo_price?: number;
};

const comboMetaOf = (item: CartItem): ComboCartItem =>
  item as ComboCartItem;

const isComboCartItem = (item: CartItem): boolean => {
  const meta = comboMetaOf(item);
  return (
    meta.is_combo_item === true ||
    Boolean(String(meta.combo_parent_id || '').trim())
  );
};

const comboParentIdOf = (item: CartItem): string =>
  String(comboMetaOf(item).combo_parent_id || '');

const comboOriginalPriceOf = (item: CartItem): number => {
  const meta = comboMetaOf(item);
  const original = Number(meta.combo_original_price);
  return Number.isFinite(original) && original > 0
    ? original
    : Number(item.price) || 0;
};

const freeGiftCountPerItemFromPrice = (
  _price: number,
): number => 0;

const freeGiftEntitlementForItem = (item: CartItem): number => {
  const perItem =
    Number.isFinite(Number(item.freeGiftCountPerItem))
      ? Math.max(0, Math.floor(Number(item.freeGiftCountPerItem)))
      : freeGiftCountPerItemFromPrice(Number(item.price) || 0);

  return perItem * Math.max(1, Number(item.qty) || 1);
};


type DeliveryOptionId =
  | 'instant'
  | 'morning'
  | 'afternoon'
  | 'overnight';

type DeliveryOption = {
  id: DeliveryOptionId;
  title: string;
  orderWindow: string;
  deliveryWindow: string;
  fee: number;
};

const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: 'instant',
    title: 'Instant Delivery',
    orderWindow: 'Order now',
    deliveryWindow: 'Delivery in about 15 mins',
    fee: 20,
  },
  {
    id: 'morning',
    title: 'Morning Slot',
    orderWindow: 'Book before 12 PM',
    deliveryWindow: 'Delivery between 12 PM – 2 PM',
    fee: 0,
  },
  {
    id: 'afternoon',
    title: 'Afternoon Slot',
    orderWindow: 'Book before 6 PM',
    deliveryWindow: 'Delivery between 6 PM – 7 PM',
    fee: 0,
  },
  {
    id: 'overnight',
    title: 'Night Slot',
    orderWindow: 'Available for next morning',
    deliveryWindow: 'Delivery between 6 AM – 8 AM',
    fee: 0,
  },
];


const isDeliveryOptionAvailable = (
  id: DeliveryOptionId,
  now: Date = new Date(),
): boolean => {
  const hour = now.getHours();

  // Instant delivery is available from 7 AM to 8 PM.
  if (id === 'instant') {
    return hour >= 7 && hour < 20;
  }

  // Morning slot can be booked until the 12 PM cutoff.
  if (id === 'morning') {
    return hour < 12;
  }

  // Afternoon slot can be booked until the 6 PM cutoff.
  if (id === 'afternoon') {
    return hour < 18;
  }

  // Night slot is the final scheduled option and remains bookable.
  if (id === 'overnight') {
    return true;
  }

  return false;
};

const preferredDeliveryOptionId = (
  now: Date = new Date(),
): DeliveryOptionId => {
  const hour = now.getHours();

  if (hour >= 6 && hour < 12) {
    return 'morning';
  }

  if (hour >= 12 && hour < 18) {
    return 'afternoon';
  }

  return 'overnight';
};


type TryAtHomeCartItem = CartItem & {
  try_at_home?: boolean;
  tryAtHome?: boolean;
};

const tryAtHomeMetaOf = (item: CartItem): TryAtHomeCartItem =>
  item as TryAtHomeCartItem;

const isTryAtHomeCartItem = (
  item: CartItem,
  selectedIds: Set<string>,
): boolean => {
  // Combo children never inherit Try at Home automatically.
  if (isComboCartItem(item)) return false;

  const meta = tryAtHomeMetaOf(item);

  return (
    meta.try_at_home === true ||
    meta.tryAtHome === true ||
    selectedIds.has(String(item.id))
  );
};

type TryAtHomeSlot = {
  id: string;
  label: string;
  startMinutes: number;
};

const formatTryAtHomeTime = (minutes: number): string => {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
};

const TRY_AT_HOME_SLOTS: TryAtHomeSlot[] = Array.from(
  { length: 18 },
  (_, index) => {
    const startMinutes = 9 * 60 + index * 30;
    const endMinutes = startMinutes + 30;

    return {
      id: `${startMinutes}-${endMinutes}`,
      label: `${formatTryAtHomeTime(startMinutes)} – ${formatTryAtHomeTime(endMinutes)}`,
      startMinutes,
    };
  },
);

const localDateKey = (date: Date): string => {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 10);
};

const dateFromLocalKey = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, Math.max(0, month - 1), day);
};

const formatTryAtHomeMonth = (value: string): string =>
  dateFromLocalKey(value).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

const formatTryAtHomeWeekday = (value: string): string =>
  dateFromLocalKey(value).toLocaleDateString('en-IN', {
    weekday: 'short',
  });

const formatTryAtHomeDay = (value: string): string =>
  dateFromLocalKey(value).toLocaleDateString('en-IN', {
    day: 'numeric',
  });

const tryAtHomeDateOptions = (
  start: Date = new Date(),
  count = 7,
): string[] =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return localDateKey(date);
  });

const isTryAtHomeSlotAvailable = (
  slot: TryAtHomeSlot,
  selectedDate: string,
  now: Date = new Date(),
): boolean => {
  const todayKey = localDateKey(now);

  // Future dates can use every slot from 9 AM to 6 PM.
  if (selectedDate > todayKey) return true;

  // Past dates are never available.
  if (selectedDate < todayKey) return false;

  // For today, only future 30-minute slots can be selected.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slot.startMinutes > nowMinutes;
};

const preferredTryAtHomeSlotId = (
  selectedDate: string = localDateKey(new Date()),
  now: Date = new Date(),
): string => {
  const nextSlot = TRY_AT_HOME_SLOTS.find((slot) =>
    isTryAtHomeSlotAvailable(slot, selectedDate, now),
  );

  return nextSlot?.id || TRY_AT_HOME_SLOTS[0].id;
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

const readSavedGifts = (
  productId: string,
): SavedGiftBundle | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(
      `spotc-free-gifts:${productId}`,
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (!parsed || !Array.isArray(parsed.gifts)) {
      return null;
    }

    return {
      product_id: String(parsed.product_id || productId),
      quantity: Number(parsed.quantity) || 1,
      entitlement: Number(parsed.entitlement) || parsed.gifts.length,
      gifts: parsed.gifts
        .filter(
          (gift): gift is SavedFreeGift =>
            Boolean(
              gift &&
                typeof gift === 'object' &&
                'id' in gift,
            ),
        )
        .map((gift) => ({
          id: String(gift.id),
          title: String(gift.title || 'FREE Gift'),
          image: String(gift.image || ''),
          original_price:
            Number(gift.original_price) || 0,
          price: 0,
          is_free_gift: true,
        })),
    };
  } catch {
    return null;
  }
};

const sendGa4Event = (
  eventName: string,
  parameters: Record<string, unknown>,
) => {
  if (typeof window === 'undefined') return;

  const gtag = (
    window as typeof window & {
      gtag?: (...args: unknown[]) => void;
    }
  ).gtag;

  if (typeof gtag === 'function') {
    gtag('event', eventName, parameters);
  }
};

const ga4ItemFromCart = (item: CartItem) => ({
  item_id: String(item.id),
  item_name: String(item.title || 'SPOTC Product'),
  item_variant:
    [
      item.size ? `Size ${item.size}` : '',
      item.color ? `Colour ${item.color}` : '',
    ]
      .filter(Boolean)
      .join(' / ') || undefined,
  price: Number(item.price) || 0,
  quantity: Math.max(1, Number(item.qty) || 1),
});

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] =
    useState<CartItem[]>([]);

  const [giftBundles, setGiftBundles] =
    useState<Record<string, SavedGiftBundle>>({});
  const [pendingGiftQuantity, setPendingGiftQuantity] =
    useState<{
      itemIndex: number;
      productId: string;
      nextQuantity: number;
    } | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] =
    useState<DeliveryOptionId>('instant');

  const [tryAtHomeIds, setTryAtHomeIds] =
    useState<Set<string>>(new Set());

  const [selectedTryAtHomeSlotId, setSelectedTryAtHomeSlotId] =
    useState<string>(() =>
      preferredTryAtHomeSlotId(localDateKey(new Date())),
    );

  const [selectedTryAtHomeDate, setSelectedTryAtHomeDate] =
    useState<string>(() => {
      const now = new Date();
      const local = new Date(
        now.getTime() - now.getTimezoneOffset() * 60_000,
      );
      return local.toISOString().slice(0, 10);
    });

  const [deliveryClock, setDeliveryClock] =
    useState(() => new Date());

  const selectedDelivery =
    DELIVERY_OPTIONS.find(
      (option) => option.id === selectedDeliveryId,
    ) ?? DELIVERY_OPTIONS[0];

  const selectDelivery = (
    option: DeliveryOption,
  ) => {
    const now = new Date();

    if (!isDeliveryOptionAvailable(option.id, now)) {
      return;
    }

    setDeliveryClock(now);
    setSelectedDeliveryId(option.id);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-delivery-option',
        option.id,
      );

      window.localStorage.setItem(
        'spotc-delivery-selection',
        JSON.stringify({
          id: option.id,
          title: option.title,
          orderWindow: option.orderWindow,
          deliveryWindow: option.deliveryWindow,
          fee: option.fee,
        }),
      );
    }
  };

  const selectTryAtHomeSlot = (slot: TryAtHomeSlot) => {
    if (
      !isTryAtHomeSlotAvailable(
        slot,
        selectedTryAtHomeDate,
        new Date(),
      )
    ) {
      return;
    }

    setSelectedTryAtHomeSlotId(slot.id);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-try-at-home-slot-id',
        slot.id,
      );

      window.localStorage.setItem(
        'spotc-try-at-home-date',
        selectedTryAtHomeDate,
      );

      window.localStorage.setItem(
        'spotc-try-at-home-slot',
        JSON.stringify({
          ...slot,
          date: selectedTryAtHomeDate,
        }),
      );
    }
  };

  const selectTryAtHomeDate = (value: string) => {
    const today = localDateKey(new Date());
    if (!value || value < today) return;

    setSelectedTryAtHomeDate(value);

    const nextSlotId = preferredTryAtHomeSlotId(
      value,
      new Date(),
    );
    setSelectedTryAtHomeSlotId(nextSlotId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-try-at-home-date',
        value,
      );
      window.localStorage.setItem(
        'spotc-try-at-home-slot-id',
        nextSlotId,
      );
    }
  };

  const viewCartTrackedRef = useRef(false);

  useEffect(() => {
    const cartItems = readCart();

    const parentIds = new Set(
      cartItems
        .filter((item) => !isComboCartItem(item))
        .map((item) => String(item.id)),
    );

    const validatedCartItems = cartItems.filter((item) => {
      if (!isComboCartItem(item)) return true;
      const parentId = comboParentIdOf(item);
      return Boolean(parentId) && parentIds.has(parentId);
    });

    if (validatedCartItems.length !== cartItems.length) {
      writeCart(validatedCartItems);
    }

    setItems(validatedCartItems);

    try {
      const rawTryAtHomeIds =
        window.localStorage.getItem('spotc_try_at_home_ids');
      const parsedTryAtHomeIds = rawTryAtHomeIds
        ? JSON.parse(rawTryAtHomeIds)
        : [];

      if (Array.isArray(parsedTryAtHomeIds)) {
        setTryAtHomeIds(
          new Set(
            parsedTryAtHomeIds
              .map((value) => String(value))
              .filter(Boolean),
          ),
        );
      }
    } catch {
      setTryAtHomeIds(new Set());
    }

    const todayKey = localDateKey(new Date());
    const savedTryAtHomeDate =
      window.localStorage.getItem('spotc-try-at-home-date');

    const nextTryAtHomeDate =
      savedTryAtHomeDate && savedTryAtHomeDate >= todayKey
        ? savedTryAtHomeDate
        : todayKey;

    setSelectedTryAtHomeDate(nextTryAtHomeDate);

    const savedTryAtHomeSlotId =
      window.localStorage.getItem('spotc-try-at-home-slot-id');

    const savedTryAtHomeSlot =
      TRY_AT_HOME_SLOTS.find(
        (slot) => slot.id === savedTryAtHomeSlotId,
      );

    if (
      savedTryAtHomeSlot &&
      isTryAtHomeSlotAvailable(
        savedTryAtHomeSlot,
        nextTryAtHomeDate,
        new Date(),
      )
    ) {
      setSelectedTryAtHomeSlotId(savedTryAtHomeSlot.id);
    } else {
      setSelectedTryAtHomeSlotId(
        preferredTryAtHomeSlotId(
          nextTryAtHomeDate,
          new Date(),
        ),
      );
    }

    const nextGiftBundles: Record<
      string,
      SavedGiftBundle
    > = {};

    validatedCartItems.forEach((item) => {
      const bundle = readSavedGifts(item.id);

      if (bundle && bundle.gifts.length > 0) {
        nextGiftBundles[item.id] = bundle;
      }
    });

    setGiftBundles(nextGiftBundles);

    const savedDeliveryId =
      window.localStorage.getItem(
        'spotc-delivery-option',
      ) as DeliveryOptionId | null;

    const now = new Date();

    const savedDeliveryIsValid =
      Boolean(savedDeliveryId) &&
      DELIVERY_OPTIONS.some(
        (option) =>
          option.id === savedDeliveryId,
      ) &&
      isDeliveryOptionAvailable(
        savedDeliveryId as DeliveryOptionId,
        now,
      );

    const nextDeliveryId =
      savedDeliveryIsValid && savedDeliveryId
        ? savedDeliveryId
        : preferredDeliveryOptionId(now);

    const nextDelivery =
      DELIVERY_OPTIONS.find(
        (option) => option.id === nextDeliveryId,
      ) ?? DELIVERY_OPTIONS[0];

    setDeliveryClock(now);
    setSelectedDeliveryId(nextDelivery.id);

    window.localStorage.setItem(
      'spotc-delivery-option',
      nextDelivery.id,
    );

    window.localStorage.setItem(
      'spotc-delivery-selection',
      JSON.stringify(nextDelivery),
    );

  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setDeliveryClock(new Date()),
      30_000,
    );

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const selectedSlot = TRY_AT_HOME_SLOTS.find(
      (slot) => slot.id === selectedTryAtHomeSlotId,
    );

    if (
      selectedSlot &&
      isTryAtHomeSlotAvailable(
        selectedSlot,
        selectedTryAtHomeDate,
        deliveryClock,
      )
    ) {
      return;
    }

    const nextSlotId = preferredTryAtHomeSlotId(
      selectedTryAtHomeDate,
      deliveryClock,
    );
    setSelectedTryAtHomeSlotId(nextSlotId);

    const nextSlot = TRY_AT_HOME_SLOTS.find(
      (slot) => slot.id === nextSlotId,
    );

    if (nextSlot && typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-try-at-home-slot-id',
        nextSlot.id,
      );
      window.localStorage.setItem(
        'spotc-try-at-home-slot',
        JSON.stringify(nextSlot),
      );
    }
  }, [
    deliveryClock,
    selectedTryAtHomeDate,
    selectedTryAtHomeSlotId,
  ]);

  useEffect(() => {
    if (
      isDeliveryOptionAvailable(
        selectedDeliveryId,
        deliveryClock,
      )
    ) {
      return;
    }

    const nextDeliveryId =
      preferredDeliveryOptionId(
        deliveryClock,
      );

    const nextDelivery =
      DELIVERY_OPTIONS.find(
        (option) =>
          option.id === nextDeliveryId,
      ) ?? DELIVERY_OPTIONS[0];

    setSelectedDeliveryId(
      nextDelivery.id,
    );

    window.localStorage.setItem(
      'spotc-delivery-option',
      nextDelivery.id,
    );

    window.localStorage.setItem(
      'spotc-delivery-selection',
      JSON.stringify(nextDelivery),
    );
  }, [
    deliveryClock,
    selectedDeliveryId,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingProductId =
      window.localStorage.getItem(
        'spotc-cart-pending-qty-product-id',
      );

    const pendingQty = Number(
      window.localStorage.getItem(
        'spotc-cart-pending-qty',
      ),
    );

    const pendingIndex = Number(
      window.localStorage.getItem(
        'spotc-cart-pending-item-index',
      ),
    );

    if (
      !pendingProductId ||
      !Number.isFinite(pendingQty) ||
      pendingQty < 2 ||
      !Number.isFinite(pendingIndex)
    ) {
      return;
    }

    const cartItems = readCart();
    const currentItem = cartItems[pendingIndex];

    if (
      !currentItem ||
      currentItem.id !== pendingProductId
    ) {
      return;
    }

    const returnedBundle =
      readSavedGifts(pendingProductId);

    let previousBundle:
      SavedGiftBundle | null = null;

    try {
      const previousRaw =
        window.localStorage.getItem(
          'spotc-cart-pending-existing-gift-bundle',
        );

      if (previousRaw) {
        const parsed =
          JSON.parse(previousRaw) as SavedGiftBundle;

        if (
          parsed &&
          Array.isArray(parsed.gifts)
        ) {
          previousBundle = parsed;
        }
      }
    } catch {
      previousBundle = null;
    }

    if (!returnedBundle) {
      return;
    }

    /*
     * The product page's normal Change Gift flow can replace the
     * stored gift bundle with only the newly selected gift.
     *
     * For cart quantity increase we must APPEND the new gift:
     *
     * qty 1: [old gift]
     * tap + and choose new gift
     * qty 2: [old gift, new gift]
     */
    let mergedGifts: SavedFreeGift[] =
      returnedBundle.gifts;

    const previousGifts =
      previousBundle?.gifts || [];

    if (
      previousGifts.length > 0 &&
      returnedBundle.gifts.length < pendingQty
    ) {
      const newGift =
        returnedBundle.gifts[
          returnedBundle.gifts.length - 1
        ];

      if (!newGift) {
        return;
      }

      mergedGifts = [
        ...previousGifts,
        newGift,
      ];
    }

    if (
      mergedGifts.length < pendingQty
    ) {
      return;
    }

    const finalBundle: SavedGiftBundle = {
      product_id: pendingProductId,
      quantity: Math.floor(pendingQty),
      entitlement: Math.floor(pendingQty),
      gifts: mergedGifts.slice(
        0,
        Math.floor(pendingQty),
      ),
    };

    window.localStorage.setItem(
      `spotc-free-gifts:${pendingProductId}`,
      JSON.stringify(finalBundle),
    );

    const nextItems = cartItems.map(
      (item, index) =>
        index === pendingIndex
          ? {
              ...item,
              qty: Math.floor(pendingQty),
            }
          : item,
    );

    writeCart(nextItems);
    setItems(nextItems);

    setGiftBundles((current) => ({
      ...current,
      [pendingProductId]: finalBundle,
    }));

    window.localStorage.removeItem(
      'spotc-cart-pending-qty-product-id',
    );
    window.localStorage.removeItem(
      'spotc-cart-pending-qty',
    );
    window.localStorage.removeItem(
      'spotc-cart-pending-item-index',
    );
    window.localStorage.removeItem(
      'spotc-cart-pending-existing-gift-bundle',
    );

    setPendingGiftQuantity(null);
  }, []);

  useEffect(() => {
    if (!items.length || viewCartTrackedRef.current) return;

    sendGa4Event('view_cart', {
      currency: 'INR',
      value: items.reduce(
        (sum, item) =>
          sum +
          (Number(item.price) || 0) *
            Math.max(1, Number(item.qty) || 1),
        0,
      ),
      items: items.map(ga4ItemFromCart),
    });

    viewCartTrackedRef.current = true;
  }, [items]);

  const updateCart = (
    nextItems: CartItem[],
  ) => {
    setItems(nextItems);
    writeCart(nextItems);
  };

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          item.price *
            Math.max(1, Number(item.qty) || 1),
        0,
      ),
    [items],
  );

  const comboSavings = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!isComboCartItem(item)) return sum;

        const qty = Math.max(1, Number(item.qty) || 1);
        const original = comboOriginalPriceOf(item);
        const comboPrice = Number(item.price) || 0;

        return sum + Math.max(0, original - comboPrice) * qty;
      }, 0),
    [items],
  );

  const tryAtHomeItems = useMemo(
    () =>
      items.filter((item) =>
        isTryAtHomeCartItem(item, tryAtHomeIds),
      ),
    [items, tryAtHomeIds],
  );

  const directDeliveryItems = useMemo(
    () =>
      items.filter(
        (item) => !isTryAtHomeCartItem(item, tryAtHomeIds),
      ),
    [items, tryAtHomeIds],
  );

  const hasTryAtHomeItems = tryAtHomeItems.length > 0;
  const hasDirectDeliveryItems = directDeliveryItems.length > 0;

  const tryAtHomeDates = useMemo(
    () => tryAtHomeDateOptions(deliveryClock, 7),
    [deliveryClock],
  );

  const selectedTryAtHomeSlot =
    TRY_AT_HOME_SLOTS.find(
      (slot) => slot.id === selectedTryAtHomeSlotId,
    ) ??
    TRY_AT_HOME_SLOTS.find((slot) =>
      isTryAtHomeSlotAvailable(
        slot,
        selectedTryAtHomeDate,
        deliveryClock,
      ),
    ) ??
    TRY_AT_HOME_SLOTS[0];

  const availableTryAtHomeSlots = TRY_AT_HOME_SLOTS.filter(
    (slot) =>
      isTryAtHomeSlotAvailable(
        slot,
        selectedTryAtHomeDate,
        deliveryClock,
      ),
  );

  /*
   * SINGLE DELIVERY SOURCE OF TRUTH
   * --------------------------------
   * The selected delivery option object controls:
   * - green selected card
   * - delivery charge
   * - bill delivery name
   * - total
   * - GA4 checkout shipping value
   */
  const delivery =
    hasTryAtHomeItems || !hasDirectDeliveryItems
      ? 0
      : selectedDeliveryId === 'instant'
        ? 20
        : 0;

  const total =
    subtotal + delivery;

  const totalFreeGifts = Object.values(
    giftBundles,
  ).reduce(
    (sum, bundle) =>
      sum + bundle.gifts.length,
    0,
  );

  const firstItemMissingGifts = items.find((item) => {
    const required = freeGiftEntitlementForItem(item);
    if (required <= 0) return false;

    const selected = giftBundles[item.id]?.gifts.length || 0;
    return selected < required;
  });

  const hasMissingFreeGifts = Boolean(firstItemMissingGifts);

  const chooseMissingFreeGifts = (item: CartItem) => {
    if (typeof window === 'undefined') return;

    const quantity = Math.max(1, Number(item.qty) || 1);

    router.push(
      `/product/${encodeURIComponent(item.id)}?gift=1&fromCartGift=1&cartGiftQty=${quantity}`,
    );
  };

  const chooseGiftForAddedQuantity = (
    itemIndex: number,
    productId: string,
    nextQuantity: number,
  ) => {
    if (typeof window === 'undefined') return;

    setPendingGiftQuantity({
      itemIndex,
      productId,
      nextQuantity,
    });

    window.localStorage.setItem(
      'spotc-cart-pending-qty-product-id',
      productId,
    );

    window.localStorage.setItem(
      'spotc-cart-pending-qty',
      String(nextQuantity),
    );

    window.localStorage.setItem(
      'spotc-cart-pending-item-index',
      String(itemIndex),
    );

    const existingBundle =
      giftBundles[productId];

    if (existingBundle) {
      window.localStorage.setItem(
        'spotc-cart-pending-existing-gift-bundle',
        JSON.stringify(existingBundle),
      );
    } else {
      window.localStorage.removeItem(
        'spotc-cart-pending-existing-gift-bundle',
      );
    }

    /*
     * Re-use the product page's existing free-gift picker.
     * We are adding a NEW gift slot, so giftIndex is the
     * zero-based index of the newly-required gift.
     */
    const newGiftIndex = Math.max(0, nextQuantity - 1);

    router.push(
      `/product/${encodeURIComponent(productId)}?changeGift=1&giftIndex=${newGiftIndex}&fromCart=1`,
    );
  };

  const changeFreeGift = (
    productId: string,
    giftId: string,
    giftIndex: number,
  ) => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      'spotc-change-free-gift-product-id',
      productId,
    );

    window.localStorage.setItem(
      'spotc-change-free-gift-id',
      giftId,
    );

    window.localStorage.setItem(
      'spotc-change-free-gift-index',
      String(giftIndex),
    );

    router.push(
      `/product/${encodeURIComponent(productId)}?changeGift=1&giftId=${encodeURIComponent(
        giftId,
      )}&giftIndex=${giftIndex}`,
    );
  };

  const updateItemQuantity = (
    itemIndex: number,
    nextQuantity: number,
  ) => {
    const item = items[itemIndex];
    if (!item) return;

    const currentQuantity = Math.max(
      1,
      Number(item.qty) || 1,
    );

    const availableStock =
      item.stockQty;

    const safeQuantity = Math.max(
      1,
      Math.min(
        Math.floor(nextQuantity),
        availableStock ??
          Number.MAX_SAFE_INTEGER,
      ),
    );

    if (safeQuantity === currentQuantity) return;

    const currentBundle =
      giftBundles[item.id];

    /*
     * INCREASE:
     * If this product has free gifts, do not increase the
     * paid quantity until the customer selects the additional gift.
     */
    if (
      safeQuantity > currentQuantity &&
      currentBundle
    ) {
      chooseGiftForAddedQuantity(
        itemIndex,
        item.id,
        safeQuantity,
      );
      return;
    }

    /*
     * DECREASE:
     * Quantity can reduce immediately. Extra gifts are trimmed
     * so 2 -> 1 also becomes 2 gifts -> 1 gift.
     */
    const nextItems = items.map(
      (currentItem, index) =>
        index === itemIndex
          ? {
              ...currentItem,
              qty: safeQuantity,
            }
          : currentItem,
    );

    updateCart(nextItems);

    if (currentBundle) {
      const nextBundle: SavedGiftBundle = {
        ...currentBundle,
        quantity: safeQuantity,
        entitlement: safeQuantity,
        gifts: currentBundle.gifts.slice(
          0,
          safeQuantity,
        ),
      };

      window.localStorage.setItem(
        `spotc-free-gifts:${item.id}`,
        JSON.stringify(nextBundle),
      );

      setGiftBundles((current) => ({
        ...current,
        [item.id]: nextBundle,
      }));
    }
  };

  const removeItem = (
    itemIndex: number,
  ) => {
    const itemToRemove = items[itemIndex];
    if (!itemToRemove) return;

    const removingComboItem = isComboCartItem(itemToRemove);
    const removedParentId = String(itemToRemove.id);

    const nextItems = items.filter((item, index) => {
      if (index === itemIndex) return false;

      if (
        !removingComboItem &&
        isComboCartItem(item) &&
        comboParentIdOf(item) === removedParentId
      ) {
        return false;
      }

      return true;
    });

    updateCart(nextItems);

    sendGa4Event('remove_from_cart', {
      currency: 'INR',
      value:
        (Number(itemToRemove.price) || 0) *
        Math.max(1, Number(itemToRemove.qty) || 1),
      items: [ga4ItemFromCart(itemToRemove)],
    });

    window.localStorage.removeItem(
      `spotc-free-gifts:${itemToRemove.id}`,
    );

    setGiftBundles((current) => {
      const next = { ...current };
      delete next[itemToRemove.id];
      return next;
    });
  };

  const cartGroups = (() => {
    const used = new Set<number>();
    const groups: Array<{
      parentIndex: number;
      parent: CartItem;
      children: Array<{ item: CartItem; index: number }>;
      isPickedWithLove: boolean;
    }> = [];

    items.forEach((item, index) => {
      if (used.has(index) || isComboCartItem(item)) return;

      const children = items
        .map((child, childIndex) => ({ item: child, index: childIndex }))
        .filter(
          ({ item: child }) =>
            isComboCartItem(child) &&
            comboParentIdOf(child) === String(item.id),
        );

      used.add(index);
      children.forEach(({ index: childIndex }) => used.add(childIndex));

      groups.push({
        parentIndex: index,
        parent: item,
        children,
        isPickedWithLove: children.length > 0,
      });
    });

    // Safety fallback for any orphan line that somehow reaches the UI.
    items.forEach((item, index) => {
      if (used.has(index)) return;
      groups.push({
        parentIndex: index,
        parent: item,
        children: [],
        isPickedWithLove: false,
      });
    });

    return groups;
  })();

  if (!items.length) {
    return (
      <main className="spotc-cart-page">
        <section className="spotc-empty-cart">
          <div>
            <ShoppingBag size={34} />
          </div>

          <h1>Your cart is empty</h1>

          <p>
            Add products from the SPOTC Shop.
          </p>

          <Link href="/shop">
            Continue shopping
          </Link>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="spotc-cart-page">
      <div className="spotc-cart-shell">
        <header className="spotc-cart-head">
          <div>
            <small>SPOTC CART</small>

            <div className="spotc-cart-title-row">
              <button
                type="button"
                className="spotc-cart-back-button"
                aria-label="Go back"
                onClick={() => router.back()}
              >
                <ArrowLeft size={23} />
              </button>

              <h1>My Cart</h1>
            </div>
          </div>
        </header>

        <div className="spotc-cart-layout">
          <section className="spotc-cart-main">
            <div className="spotc-cart-summary">
              <span className="spotc-summary-icon">
                <ShoppingBag size={21} />
              </span>

              <div>
                <strong>Your cart</strong>
                <small>
                  All products are sold directly by SPOTC
                </small>
              </div>
            </div>

            <article className="spotc-products-card">
              <div className="spotc-products-card-head">
                <div>
                  <small>SPOTC PRODUCTS</small>
                  <h2>Your Items</h2>
                </div>

                
              </div>

              <div className="spotc-products-list">
                {cartGroups.map((group, groupIndex) => {
                  const groupLines = [
                    { item: group.parent, index: group.parentIndex, isChild: false },
                    ...group.children.map(({ item, index }) => ({
                      item,
                      index,
                      isChild: true,
                    })),
                  ];

                  return (
                    <section
                      className={`spotc-cart-group${
                        group.isPickedWithLove ? ' picked-with-love' : ''
                      }`}
                      key={`${group.parent.id}-${group.parent.size}-${group.parent.color}-${groupIndex}`}
                    >
                      {group.isPickedWithLove && (
                        <div className="spotc-cart-group-head">
                          <span aria-hidden="true">♡</span>
                          <div>
                            <small>SPOTC COLLECTION</small>
                            <strong>Picked With Love</strong>
                          </div>
                          <em>
                            {groupLines.length} item{groupLines.length === 1 ? '' : 's'}
                          </em>
                        </div>
                      )}

                      <div className="spotc-cart-group-lines">
                        {groupLines.map(({ item, index, isChild }) => {
                          const comboItem = isComboCartItem(item);
                          const comboOriginalPrice = comboOriginalPriceOf(item);

                          return (
                            <div
                              className={`spotc-product-with-gifts${
                                isChild ? ' spotc-picked-child' : ''
                              }`}
                              key={`${item.id}-${item.size}-${item.color}-${index}`}
                            >
                              <div className="spotc-cart-product">
                                <div className="spotc-product-image">
                                  {item.image ? (
                                    <img src={item.image} alt={item.title} />
                                  ) : (
                                    <ShoppingBag size={27} />
                                  )}
                                </div>

                                <div className="spotc-product-copy">
                                  <h3>{item.title}</h3>

                                  {(item.size || item.color) && (
                                    <p>
                                      {[
                                        item.size && `Size: ${item.size}`,
                                        item.color && `Colour: ${item.color}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  )}

                                  {isTryAtHomeCartItem(item, tryAtHomeIds) && (
                                    <span className="spotc-try-at-home-badge">
                                      ✓ Try at Home
                                    </span>
                                  )}

                                  <div className="spotc-product-price-row">
                                    <strong>
                                      {money(
                                        item.price *
                                          Math.max(1, Number(item.qty) || 1),
                                      )}
                                    </strong>

                                    {comboItem &&
                                      comboOriginalPrice > item.price && (
                                        <del>
                                          {money(comboOriginalPrice)}
                                        </del>
                                      )}

                                    {comboItem && (
                                      <span className="spotc-combo-price-badge">
                                        Combo Price
                                      </span>
                                    )}
                                  </div>

                                  {!comboItem &&
                                    Math.max(1, Number(item.qty) || 1) > 1 && (
                                      <small className="spotc-line-price-note">
                                        {money(item.price)} each
                                      </small>
                                    )}
                                </div>

                                <div className="spotc-cart-controls">
                                  {!comboItem &&
                                    (item.stockQty === undefined ||
                                      item.stockQty > 1) && (
                                      <div
                                        className="spotc-cart-quantity"
                                        aria-label="Product quantity"
                                      >
                                        <button
                                          type="button"
                                          aria-label="Decrease quantity"
                                          disabled={
                                            Math.max(
                                              1,
                                              Number(item.qty) || 1,
                                            ) <= 1
                                          }
                                          onClick={() =>
                                            updateItemQuantity(
                                              index,
                                              Math.max(
                                                1,
                                                Number(item.qty) || 1,
                                              ) - 1,
                                            )
                                          }
                                        >
                                          <Minus size={16} />
                                        </button>

                                        <strong>
                                          {Math.max(
                                            1,
                                            Number(item.qty) || 1,
                                          )}
                                        </strong>

                                        <button
                                          type="button"
                                          aria-label="Increase quantity"
                                          disabled={
                                            item.stockQty !== undefined &&
                                            Math.max(
                                              1,
                                              Number(item.qty) || 1,
                                            ) >= item.stockQty
                                          }
                                          onClick={() =>
                                            updateItemQuantity(
                                              index,
                                              Math.max(
                                                1,
                                                Number(item.qty) || 1,
                                              ) + 1,
                                            )
                                          }
                                        >
                                          <Plus size={16} />
                                        </button>
                                      </div>
                                    )}

                                  <button
                                    type="button"
                                    className="spotc-remove-button"
                                    aria-label="Remove product"
                                    onClick={() => removeItem(index)}
                                  >
                                    <Trash2 size={17} />
                                    <span>Remove</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {hasTryAtHomeItems && (
                <section className="spotc-try-at-home-section">
                  <div className="spotc-try-at-home-hero">
                    <div className="spotc-try-at-home-hero-icon">
                      <Clock3 size={21} />
                    </div>

                    <div className="spotc-try-at-home-hero-copy">
                      <small>TRY AT HOME</small>
                      <h3>Choose your visit time</h3>
                      <p>
                        Pick a convenient 30-minute slot between 9:00 AM and 6:00 PM.
                      </p>
                    </div>

                    <div className="spotc-try-at-home-summary">
                      <strong>{tryAtHomeItems.length}</strong>
                      <span>
                        selected item{tryAtHomeItems.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="spotc-try-booking-panel">
                    <div className="spotc-try-booking-top">
                      <div>
                        <small>CHOOSE DATE AND TIME</small>
                        <h4>Book your Try at Home visit</h4>
                      </div>

                      <div className="spotc-try-month-label">
                        <Clock3 size={17} />
                        <strong>
                          {formatTryAtHomeMonth(selectedTryAtHomeDate)}
                        </strong>
                      </div>
                    </div>

                    <div className="spotc-try-date-strip" role="list">
                      {tryAtHomeDates.map((dateValue) => {
                        const active =
                          dateValue === selectedTryAtHomeDate;

                        return (
                          <button
                            type="button"
                            key={dateValue}
                            className={`spotc-try-date-card ${
                              active ? 'active' : ''
                            }`}
                            aria-pressed={active}
                            onClick={() =>
                              selectTryAtHomeDate(dateValue)
                            }
                          >
                            <span>
                              {formatTryAtHomeWeekday(dateValue)}
                            </span>
                            <strong>
                              {formatTryAtHomeDay(dateValue)}
                            </strong>
                          </button>
                        );
                      })}
                    </div>

                    <div className="spotc-try-time-section">
                      <div className="spotc-try-time-heading-row">
                        <strong>Select time</strong>
                        <span>30-minute slots · 9:00 AM – 6:00 PM</span>
                      </div>

                      {availableTryAtHomeSlots.length > 0 ? (
                        <div className="spotc-try-at-home-slots">
                          {TRY_AT_HOME_SLOTS.map((slot) => {
                            const available =
                              isTryAtHomeSlotAvailable(
                                slot,
                                selectedTryAtHomeDate,
                                deliveryClock,
                              );

                            const selected =
                              available &&
                              slot.id === selectedTryAtHomeSlot.id;

                            return (
                              <button
                                key={slot.id}
                                type="button"
                                disabled={!available}
                                aria-disabled={!available}
                                className={`spotc-try-at-home-slot ${
                                  selected ? 'active' : ''
                                } ${
                                  !available ? 'disabled' : ''
                                }`}
                                aria-pressed={selected}
                                onClick={() =>
                                  selectTryAtHomeSlot(slot)
                                }
                              >
                                <strong>{slot.label}</strong>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="spotc-try-at-home-no-slots">
                          <strong>No slots available for this date</strong>
                          <span>
                            Choose another day from the dates above.
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="spotc-try-confirm-button"
                      onClick={() =>
                        selectTryAtHomeSlot(selectedTryAtHomeSlot)
                      }
                    >
                      Confirm {selectedTryAtHomeSlot.label}
                    </button>
                  </div>

                  <div className="spotc-try-at-home-footer">
                    <span className="spotc-try-at-home-free">FREE VISIT</span>
                    <span>
                      Try before you buy · Max 2 dresses + 2 earrings · One booking per day
                    </span>
                  </div>
                </section>
              )}

              {!hasTryAtHomeItems && hasDirectDeliveryItems && (
                <section
                  key={selectedDeliveryId}
                  className="spotc-delivery-section"
                >
                  <div className="spotc-delivery-section-head">
                    <div>
                      <small>DELIVERY OPTION</small>
                      <h3>Choose delivery time</h3>
                    </div>

                    <strong>{delivery === 0 ? 'FREE' : money(delivery)}</strong>
                  </div>

                  <div className="spotc-delivery-options">
                    {DELIVERY_OPTIONS.map((option) => {
                      const available =
                        isDeliveryOptionAvailable(
                          option.id,
                          deliveryClock,
                        );

                      const selected =
                        available &&
                        option.id === selectedDelivery.id;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!available}
                          aria-disabled={!available}
                          className={`spotc-delivery-option ${
                            selected ? 'active' : ''
                          } ${
                            !available ? 'disabled' : ''
                          }`}
                          onClick={() =>
                            selectDelivery(option)
                          }
                        >
                          <span className="spotc-delivery-option-icon">
                            {option.id === 'instant' ? (
                              <Truck size={20} />
                            ) : (
                              <Clock3 size={20} />
                            )}
                          </span>

                          <span className="spotc-delivery-option-copy">
                            <span className="spotc-delivery-option-title-row">
                              <strong>{option.title}</strong>
                              <b className={`spotc-delivery-fee ${
                                option.fee === 0 ? 'free' : ''
                              }`}>
                                {option.fee === 0
                                  ? 'FREE'
                                  : money(option.fee)}
                              </b>
                            </span>
                            <small>{option.orderWindow}</small>
                            <em>
                              {available
                                ? option.deliveryWindow
                                : 'Unavailable now'}
                            </em>
                          </span>

                          <span
                            className="spotc-delivery-radio"
                            aria-hidden="true"
                          >
                            {selected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

            </article>
          </section>

          <aside
            key={selectedDeliveryId}
            className="spotc-bill-card"
          >
            <h2>Bill details</h2>

            <div className="spotc-bill-lines">
              <p>
                <span>Subtotal</span>
                <strong>
                  {money(subtotal)}
                </strong>
              </p>

              <p>
                <span>Delivery</span>

                <strong>
                  {delivery === 0 ? 'FREE' : money(delivery)}
                </strong>
              </p>
              <p>
                <span>Platform fee</span>
                <strong>₹0</strong>
              </p>
              {comboSavings > 0 && (
                <p className="spotc-combo-savings-line">
                  <span>Combo savings</span>
                  <strong>-{money(comboSavings)}</strong>
                </p>
              )}
            </div>

            <div className="spotc-total-row">
              <span>Total</span>
              <strong>
                {money(total)}
              </strong>
            </div>

            {hasTryAtHomeItems && (
              <div className="spotc-delivery-note spotc-try-note">
                <Clock3 size={19} />

                <span>
                  <strong>Try at Home</strong>
                  <small>
                    {selectedTryAtHomeDate} · {selectedTryAtHomeSlot.label}
                  </small>
                </span>
              </div>
            )}

            {!hasTryAtHomeItems && hasDirectDeliveryItems && (
              <div className="spotc-delivery-note">
                <Truck size={19} />

                <span>
                  <strong>{selectedDelivery.title}</strong>
                  <small>{selectedDelivery.deliveryWindow}</small>
                </span>
              </div>
            )}

            <Link
              className="spotc-checkout-button"
              href="/address"
              onClick={(event) => {
                if (hasTryAtHomeItems && typeof window !== 'undefined') {
                  window.localStorage.setItem(
                    'spotc-try-at-home-slot-id',
                    selectedTryAtHomeSlot.id,
                  );
                  window.localStorage.setItem(
                    'spotc-try-at-home-date',
                    selectedTryAtHomeDate,
                  );
                  window.localStorage.setItem(
                    'spotc-try-at-home-slot',
                    JSON.stringify({
                      ...selectedTryAtHomeSlot,
                      date: selectedTryAtHomeDate,
                    }),
                  );
                }

                sendGa4Event('begin_checkout', {
                  currency: 'INR',
                  value: total,
                  shipping: delivery,
                  items: items.map(ga4ItemFromCart),
                  delivery_option:
                    !hasTryAtHomeItems && hasDirectDeliveryItems
                      ? selectedDelivery.id
                      : undefined,
                  try_at_home: hasTryAtHomeItems,
                  try_at_home_date: hasTryAtHomeItems
                    ? selectedTryAtHomeDate
                    : undefined,
                  try_at_home_slot: hasTryAtHomeItems
                    ? selectedTryAtHomeSlot.id
                    : undefined,
                });
              }}
            >
              Continue to Address
            </Link>
          </aside>
        </div>
      </div>


      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  .spotc-cart-page {
    min-height: 0;
    padding: 34px 26px 20px;
    color: #201c18;
    background:
      radial-gradient(
        circle at top left,
        rgba(230, 121, 24, 0.06),
        transparent 28rem
      ),
      #f7f5f1;
  }

  .spotc-cart-shell {
    width: min(1420px, 100%);
    margin: 0 auto;
  }

  .spotc-cart-head {
    margin-bottom: 24px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }

  .spotc-cart-head small {
    color: #b56611;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }

  .spotc-cart-title-row {
    margin-top: 7px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .spotc-cart-back-button {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border: 1px solid #ded6cd;
    border-radius: 50%;
    color: #2a2520;
    background: #ffffff;
    cursor: pointer;
  }

  .spotc-cart-back-button:hover {
    background: #f5f1eb;
  }

  .spotc-cart-head h1 {
    margin: 0;
    font-size: clamp(38px, 5vw, 56px);
    line-height: 1;
    font-weight: 650;
    letter-spacing: -0.04em;
  }

  .spotc-cart-head > span {
    color: #6e655d;
    font-size: 14px;
  }

  .spotc-cart-layout {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr)
      minmax(320px, 370px);
    gap: 24px;
    align-items: start;
  }

  .spotc-cart-main {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .spotc-cart-summary {
    min-height: 76px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 13px;
    border: 1px solid #e5ddd4;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 10px 26px
      rgba(56, 39, 24, 0.05);
  }

  .spotc-summary-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    color: #b76510;
    background: #fff0df;
  }

  .spotc-cart-summary strong,
  .spotc-cart-summary small {
    display: block;
  }

  .spotc-cart-summary strong {
    font-size: 16px;
    font-weight: 650;
  }

  .spotc-cart-summary small {
    margin-top: 4px;
    color: #1c9a51;
    font-size: 12px;
    font-weight: 550;
  }

  .spotc-products-card {
    padding: 22px;
    overflow: hidden;
    border: 1px solid #e4dbd2;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 12px 34px rgba(56, 39, 24, 0.06);
  }

  .spotc-products-card-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-products-card-head small {
    color: #b56611;
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .spotc-products-card-head h2 {
    margin: 4px 0 0;
    font-size: 22px;
    font-weight: 650;
  }

  .spotc-products-card-head > span {
    color: #776d64;
    font-size: 13px;
  }

  .spotc-products-list {
    margin-top: 17px;
    display: grid;
    gap: 14px;
  }

  .spotc-cart-group {
    overflow: hidden;
    border: 1px solid #ebe4dc;
    border-radius: 18px;
    background: #fcfbf9;
  }

  .spotc-cart-group.picked-with-love {
    border-color: #ead8c5;
    background: #fffdf9;
    box-shadow: 0 8px 24px rgba(94, 62, 31, 0.05);
  }

  .spotc-cart-group-head {
    min-height: 66px;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border-bottom: 1px solid #eee2d5;
    background: linear-gradient(90deg, #fff6ec 0%, #fffdf9 100%);
  }

  .spotc-cart-group-head > span {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #b76510;
    background: #ffffff;
    border: 1px solid #ead8c5;
    font-size: 23px;
    line-height: 1;
  }

  .spotc-cart-group-head small,
  .spotc-cart-group-head strong {
    display: block;
  }

  .spotc-cart-group-head small {
    color: #a86a2c;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .spotc-cart-group-head strong {
    margin-top: 2px;
    color: #2a211a;
    font-size: 17px;
    font-weight: 750;
  }

  .spotc-cart-group-head em {
    color: #7b6c5e;
    font-size: 11px;
    font-style: normal;
    font-weight: 650;
  }

  .spotc-cart-group-lines {
    display: grid;
  }

  .spotc-cart-group .spotc-cart-product {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .spotc-cart-group .spotc-product-with-gifts + .spotc-product-with-gifts {
    border-top: 1px solid #eee7df;
  }

  .spotc-picked-child .spotc-cart-product {
    padding-top: 13px;
    padding-bottom: 13px;
  }

  .spotc-picked-child .spotc-product-image {
    width: 92px;
    height: 92px;
  }

  .spotc-product-with-gifts {
    display: grid;
    gap: 9px;
  }

  .spotc-free-gifts {
    margin-left: 0;
    padding: 18px 20px;
    border: 1px solid #e3dbd2;
    border-radius: 18px;
    background: #ffffff;
  }

  .spotc-free-gifts-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    color: #211d19;
  }

  .spotc-free-gifts-title-copy {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .spotc-free-gifts-title-icon {
    flex: 0 0 auto;
    font-size: 20px;
    line-height: 1;
  }

  .spotc-free-gifts-title-copy > div {
    min-width: 0;
  }

  .spotc-free-gifts-title strong {
    display: block;
    color: #211d19;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.3;
  }

  .spotc-free-gifts-title small {
    display: block;
    margin-top: 4px;
    color: #756b62;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.35;
  }

  .spotc-free-gifts-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .spotc-free-gift {
    width: 100%;
    min-width: 0;
    padding: 10px;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    border: 1px solid #d6eadb;
    border-radius: 13px;
    background: #f7fcf8;
  }

  .spotc-free-gift-image {
    width: 64px;
    height: 64px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #7f9685;
    background: #eef7f0;
  }

  .spotc-free-gift-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .spotc-free-gift-copy {
    min-width: 0;
  }

  .spotc-free-gift-copy h4 {
    margin: 0;
    color: #24201c;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
  }

  .spotc-free-gift-price {
    margin-top: 5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spotc-free-gift-price strong {
    color: #168648;
    font-size: 12px;
    font-weight: 600;
  }

  .spotc-free-gift-price span {
    display: none;
  }

  .spotc-change-gift-button {
    flex: 0 0 auto;
    padding: 7px 13px;
    border: 1px solid #d8d0c7;
    border-radius: 10px;
    color: #167a42;
    background: #ffffff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
  }

  .spotc-change-gift-button:hover {
    background: #f8faf8;
  }

  .spotc-change-gift-button-header {
    min-width: 88px;
    min-height: 38px;
  }

 .spotc-delivery-section {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #d8eddf;
  border-radius: 17px;
  background: #ffffff;
}

  .spotc-delivery-section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 13px;
  }

  .spotc-delivery-section-head small {
    color: #1a7a44;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .spotc-delivery-section-head h3 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 700;
  }

  .spotc-delivery-section-head > strong {
    color: #16783f;
    font-size: 17px;
    font-weight: 800;
  }

  .spotc-delivery-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .spotc-delivery-option {
    width: 100%;
    min-width: 0;
    padding: 13px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 24px;
    gap: 10px;
    align-items: center;
    border: 1px solid #dfe8e2;
    border-radius: 14px;
    color: #29241f;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
  }

  .spotc-delivery-option.active {
    border-color: #1a9a53;
    background: #edf9f1;
  }


  .spotc-delivery-option.disabled,
  .spotc-delivery-option:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    border-color: #e3e3e3;
    background: #f5f5f5;
  }

  .spotc-delivery-option.disabled .spotc-delivery-option-icon {
    color: #8b8b8b;
    background: #ececec;
  }

  .spotc-delivery-option.disabled .spotc-delivery-fee,
  .spotc-delivery-option.disabled .spotc-delivery-fee.free {
    color: #777777;
    background: #e9e9e9;
  }

  .spotc-delivery-option.disabled .spotc-delivery-option-copy em {
    color: #a13b3b;
    font-weight: 700;
  }

  .spotc-delivery-option-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: #177a42;
    background: #e9f6ed;
  }

  .spotc-delivery-option-copy {
    min-width: 0;
  }

  .spotc-delivery-option-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .spotc-delivery-fee {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 7px;
    color: #8a4b00;
    background: #fff0d5;
    font-size: 11px;
    font-weight: 850;
    line-height: 1.2;
  }

  .spotc-delivery-fee.free {
    color: #08783d;
    background: #e5f7ec;
  }

  .spotc-delivery-option-copy strong,
  .spotc-delivery-option-copy small,
  .spotc-delivery-option-copy em {
    display: block;
  }

  .spotc-delivery-option-copy strong {
    font-size: 13px;
    font-weight: 750;
  }

  .spotc-delivery-option-copy small {
    margin-top: 3px;
    color: #6c746f;
    font-size: 11px;
    line-height: 1.35;
  }

  .spotc-delivery-option-copy em {
  margin-top: 4px;
  color: #177a42;
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
  line-height: 1.35;
}
  .spotc-delivery-radio {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    justify-self: end;
    border: 1px solid #bfd4c6;
    border-radius: 50%;
    color: #ffffff;
    background: #ffffff;
    font-size: 12px;
    font-weight: 900;
  }

  .spotc-delivery-option.active .spotc-delivery-radio {
    border-color: #1a9a53;
    background: #1a9a53;
  }

  .spotc-order-footer {
    margin-top: 17px;
    padding-top: 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid #ece5dd;
  }

  .spotc-order-footer span {
    color: #72685f;
    font-size: 14px;
  }

  .spotc-order-footer strong {
    color: #bd6410;
    font-size: 20px;
    font-weight: 650;
  }

  .spotc-cart-product {
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns:
      120px minmax(0, 1fr) 160px;
    gap: 20px;
    align-items: center;
    border: 1px solid #ebe4dc;
    border-radius: 18px;
    background: #fcfbf9;
  }

  .spotc-product-image {
    width: 120px;
    height: 120px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: #a3988e;
    background: #f1ede8;
  }

  .spotc-product-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .spotc-product-copy {
    min-width: 0;
  }

  .spotc-product-copy h3 {
    margin: 0;
    max-width: 540px;
    color: #211d19;
    font-size: 18px;
    line-height: 1.35;
    font-weight: 600;
  }

  .spotc-product-copy p {
    margin: 9px 0 0;
    color: #81766d;
    font-size: 13px;
  }

  .spotc-product-copy strong {
    display: block;
    margin-top: 12px;
    color: #c7680b;
    font-size: 19px;
    font-weight: 650;
  }

  .spotc-product-price-row {
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 7px;
  }

  .spotc-product-price-row > strong {
    margin-top: 0;
  }

  .spotc-product-price-row del {
    color: #968c83;
    font-size: 13px;
    font-weight: 500;
  }

  .spotc-combo-price-badge {
    padding: 3px 7px;
    border-radius: 999px;
    color: #147c43;
    background: #e8f7ed;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.2;
    white-space: nowrap;
  }

  .spotc-combo-savings-line span,
  .spotc-combo-savings-line strong {
    color: #168648 !important;
    font-weight: 750 !important;
  }

  .spotc-line-price-note {
    display: block;
    margin-top: 4px;
    color: #81766d;
    font-size: 11px;
    font-weight: 600;
  }

  .spotc-cart-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 11px;
  }

  .spotc-cart-quantity {
    min-width: 126px;
    height: 42px;
    display: grid;
    grid-template-columns: 38px minmax(38px, 1fr) 38px;
    align-items: center;
    overflow: hidden;
    border: 1px solid #d6cec5;
    border-radius: 12px;
    background: #ffffff;
  }

  .spotc-cart-quantity button {
    height: 100%;
    display: grid;
    place-items: center;
    border: 0;
    color: #25211d;
    background: transparent;
    cursor: pointer;
  }

  .spotc-cart-quantity button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .spotc-cart-quantity > strong {
    margin: 0;
    color: #171717;
    font-size: 16px;
    font-weight: 800;
    text-align: center;
  }

  .spotc-remove-button {
    padding: 7px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: #81776e;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
  }

  .spotc-remove-button:hover {
    color: #c73d32;
  }

  .spotc-bill-card {
    position: sticky;
    top: 92px;
    padding: 22px;
    border: 1px solid #e4dbd2;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 12px 34px
      rgba(56, 39, 24, 0.06);
  }

  .spotc-bill-card h2 {
    margin: 0 0 18px;
    font-size: 24px;
    font-weight: 650;
  }

  .spotc-bill-lines {
    display: grid;
    gap: 15px;
  }

  .spotc-bill-lines p,
  .spotc-total-row {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-bill-lines span {
    color: #655c54;
    font-size: 14px;
  }

  .spotc-bill-lines strong {
    font-size: 14px;
    font-weight: 650;
  }

  .spotc-total-row {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid #d9d1c9;
  }

  .spotc-total-row span {
    font-size: 19px;
    font-weight: 550;
  }

  .spotc-total-row strong {
    font-size: 22px;
    font-weight: 700;
  }

  .spotc-delivery-note {
    margin-top: 17px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 11px;
    border-radius: 15px;
    color: #4e473f;
    background: #f4eee3;
    line-height: 1.45;
  }

  .spotc-delivery-note > span {
    min-width: 0;
  }

  .spotc-delivery-note strong,
  .spotc-delivery-note small {
    display: block;
  }

  .spotc-delivery-note strong {
    font-size: 14px;
    font-weight: 750;
  }

  .spotc-delivery-note small {
    margin-top: 2px;
    color: #756c63;
    font-size: 12px;
    font-weight: 550;
  }

  .spotc-checkout-button {
    min-height: 56px;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    color: #ffffff;
    background: #171717;
    text-decoration: none;
    font-size: 17px;
    font-weight: 800;
  }

  .spotc-checkout-button:hover {
    background: #2a2927;
  }


  :global(body:has(.spotc-cart-page) .spotc-footer) {
    margin-top: 10px !important;
  }

  .spotc-empty-cart {
    width: min(520px, calc(100% - 28px));
    margin: 90px auto 0;
    padding: 42px 28px;
    display: grid;
    justify-items: center;
    border: 1px solid #e2dad1;
    border-radius: 24px;
    background: #ffffff;
    text-align: center;
  }

  .spotc-empty-cart > div {
    width: 68px;
    height: 68px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    color: #b76510;
    background: #fff0df;
  }

  .spotc-empty-cart h1 {
    margin: 18px 0 6px;
  }

  .spotc-empty-cart p {
    margin: 0;
    color: #776d64;
  }

  .spotc-empty-cart a {
    margin-top: 18px;
    padding: 12px 18px;
    border-radius: 13px;
    color: #ffffff;
    background: #171717;
    text-decoration: none;
  }

.spotc-try-at-home-badge {
width: fit-content;
margin-top: 9px;
padding: 5px 10px;
display: inline-flex;
align-items: center;
border: 1px solid #ead8df;
border-radius: 999px;
color: #8f3151;
background: #fff5f8;
font-size: 11px;
font-weight: 800;
line-height: 1;
  }

  .spotc-try-at-home-section {
margin-top: 18px;
padding: 18px;
overflow: hidden;
border: 1px solid #ecdce2;
border-radius: 20px;
background:
  linear-gradient(180deg, #fffafb 0%, #ffffff 64%);
box-shadow: 0 10px 28px rgba(88, 48, 62, 0.06);
  }

  .spotc-try-at-home-hero {
display: grid;
grid-template-columns: 44px minmax(0, 1fr) auto;
align-items: center;
gap: 12px;
padding-bottom: 15px;
border-bottom: 1px solid #f1e5e9;
  }

  .spotc-try-at-home-hero-icon {
width: 44px;
height: 44px;
display: grid;
place-items: center;
border-radius: 14px;
color: #9b3b5a;
background: #fdebf1;
  }

  .spotc-try-at-home-hero-copy {
min-width: 0;
  }

  .spotc-try-at-home-hero-copy small {
display: block;
color: #9b3b5a;
font-size: 10px;
font-weight: 850;
letter-spacing: 0.12em;
  }

  .spotc-try-at-home-hero-copy h3 {
    margin: 3px 0 0;
    color: #241c1f;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.015em;
  }

  .spotc-try-at-home-hero-copy p {
    margin: 5px 0 0;
    color: #6f6267;
    font-size: 14px;
    line-height: 1.5;
  }

  .spotc-try-at-home-summary {
min-width: 76px;
padding: 9px 11px;
text-align: center;
border: 1px solid #ead8df;
border-radius: 13px;
background: #ffffff;
  }

  .spotc-try-at-home-summary strong,
  .spotc-try-at-home-summary span {
display: block;
  }

  .spotc-try-at-home-summary strong {
color: #8f3151;
font-size: 18px;
font-weight: 850;
line-height: 1;
  }

  .spotc-try-at-home-summary span {
margin-top: 4px;
color: #806f75;
font-size: 10px;
font-weight: 650;
  }

  .spotc-try-booking-panel {
margin-top: 16px;
padding: 16px;
border: 1px solid #ece6e1;
border-radius: 18px;
background: #ffffff;
  }

  .spotc-try-booking-top {
padding-bottom: 13px;
display: flex;
align-items: center;
justify-content: space-between;
gap: 14px;
border-bottom: 1px solid #eee8e4;
  }

  .spotc-try-booking-top small {
display: block;
color: #877b75;
font-size: 10px;
font-weight: 800;
letter-spacing: 0.11em;
  }

  .spotc-try-booking-top h4 {
    margin: 4px 0 0;
    color: #251f1b;
    font-size: 18px;
    font-weight: 600;
  }

  .spotc-try-month-label {
min-height: 38px;
padding: 8px 11px;
display: inline-flex;
align-items: center;
gap: 8px;
border: 1px solid #e6dfda;
border-radius: 11px;
color: #2f2925;
background: #fbfaf8;
  }

  .spotc-try-month-label strong {
    font-size: 13px;
    font-weight: 600;
  }

  .spotc-try-date-strip {
margin-top: 14px;
display: grid;
grid-template-columns: repeat(7, minmax(58px, 1fr));
gap: 8px;
  }

  .spotc-try-date-card {
    min-height: 70px;
    padding: 9px 7px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    border: 1px solid #ddd5cf;
    border-radius: 14px;
    color: #5f5752;
    background: #ffffff;
    cursor: pointer;
    transition:
      background 0.16s ease,
      color 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease,
      box-shadow 0.16s ease;
  }

  .spotc-try-date-card:hover {
transform: translateY(-1px);
background: #f7f4f1;
  }

  .spotc-try-date-card span {
    font-size: 12px;
    font-weight: 500;
  }

  .spotc-try-date-card strong {
    color: #28221f;
    font-size: 18px;
    font-weight: 600;
  }

  .spotc-try-date-card.active {
    border-color: #ef7f2d;
    color: #d96818;
    background: #fff7f0;
    box-shadow: 0 6px 16px rgba(239, 127, 45, 0.10);
  }

  .spotc-try-date-card.active strong {
    color: #d96818;
  }

  .spotc-try-time-section {
margin-top: 16px;
  }

  .spotc-try-time-heading-row {
display: flex;
align-items: baseline;
justify-content: space-between;
gap: 12px;
margin-bottom: 10px;
  }

  .spotc-try-time-heading-row strong {
    color: #2f2925;
    font-size: 15px;
    font-weight: 600;
  }

  .spotc-try-time-heading-row span {
    color: #82766f;
    font-size: 12px;
  }

  .spotc-try-at-home-slots {
display: grid;
grid-template-columns: repeat(6, minmax(0, 1fr));
gap: 8px;
  }

  .spotc-try-at-home-slot {
min-width: 0;
min-height: 42px;
padding: 9px 8px;
border: 1px solid #ece7e3;
border-radius: 999px;
color: #2d2824;
background: #f8f7f5;
text-align: center;
cursor: pointer;
transition:
  background 0.16s ease,
  color 0.16s ease,
  border-color 0.16s ease,
  box-shadow 0.16s ease,
  transform 0.16s ease;
  }

  .spotc-try-at-home-slot strong {
    display: block;
    overflow: hidden;
    font-size: 12px;
    font-weight: 550;
    line-height: 1.25;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .spotc-try-at-home-slot:hover:not(:disabled) {
transform: translateY(-1px);
border-color: #e4a675;
background: #fff8f2;
  }

  .spotc-try-at-home-slot.active {
border-color: #ef7f2d;
color: #d66513;
background: #fff5ed;
box-shadow: inset 0 0 0 1px rgba(239, 127, 45, 0.1);
  }

  .spotc-try-at-home-slot.disabled,
  .spotc-try-at-home-slot:disabled {
opacity: 0.42;
cursor: not-allowed;
color: #9f9995;
background: #f3f2f1;
  }

  .spotc-try-at-home-no-slots {
padding: 14px;
display: grid;
gap: 4px;
border: 1px solid #eadfd8;
border-radius: 13px;
color: #745f53;
background: #fff8f3;
  }

  .spotc-try-at-home-no-slots strong {
font-size: 12px;
font-weight: 800;
  }

  .spotc-try-at-home-no-slots span {
font-size: 11px;
  }

  .spotc-try-confirm-button {
width: min(240px, 100%);
min-height: 46px;
margin: 16px 0 0 auto;
padding: 0 18px;
display: block;
border: 0;
border-radius: 13px;
color: #ffffff;
background: #ef7f2d;
font: inherit;
font-size: 13px;
font-weight: 850;
cursor: pointer;
box-shadow: 0 8px 18px rgba(239, 127, 45, 0.2);
  }

  .spotc-try-confirm-button:hover {
background: #dc6f21;
  }

  .spotc-try-at-home-footer {
    margin-top: 16px;
    padding-top: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    border-top: 1px solid #eee4e7;
    color: #5f5559;
    font-size: 13px;
    line-height: 1.5;
  }

  .spotc-try-at-home-free {
    padding: 5px 10px;
    border: 1px solid #cdebd8;
    border-radius: 999px;
    color: #176f43;
    background: #eef9f2;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  @media (max-width: 980px) {
    .spotc-cart-layout {
      grid-template-columns: 1fr;
    }

    .spotc-bill-card {
      position: static;
    }
  }

  @media (max-width: 700px) {
    .spotc-cart-page {
      min-height: 0;
      padding: 20px 12px 10px;
    }





    .spotc-cart-head {
      align-items: flex-start;
    }

    .spotc-cart-head h1 {
      font-size: 38px;
    }

    .spotc-cart-title-row {
      gap: 10px;
    }

    .spotc-cart-back-button {
      width: 38px;
      height: 38px;
      flex-basis: 38px;
    }

    .spotc-cart-head > span {
      padding-top: 9px;
      text-align: right;
    }

    /* MOBILE: enlarge only the cart product/shop block */
    .spotc-cart-summary {
      min-height: 88px;
      padding: 18px;
    }

    .spotc-cart-summary strong {
      font-size: 19px;
      font-weight: 750;
      line-height: 1.35;
    }

    .spotc-cart-summary small {
      margin-top: 5px;
      font-size: 15px;
      line-height: 1.45;
    }

    .spotc-products-card {
      padding: 17px;
    }

    .spotc-delivery-options {
      grid-template-columns: 1fr;
    }

  .spotc-delivery-section {
      padding: 13px;
    }

    .spotc-products-card-head h2 {
      font-size: 24px;
    }

    .spotc-products-card-head > span {
      font-size: 13px;
    }

    .spotc-free-gifts {
      padding: 15px;
    }

    .spotc-free-gifts-title {
      gap: 12px;
    }

    .spotc-free-gifts-title strong {
      font-size: 15px;
    }

    .spotc-free-gifts-title small {
      font-size: 11px;
    }

    .spotc-free-gift {
      width: 100%;
      grid-template-columns: 58px minmax(0, 1fr);
      padding: 9px;
    }

    .spotc-change-gift-button {
      padding: 7px 11px;
      font-size: 12px;
    }

    .spotc-free-gift-image {
      width: 58px;
      height: 58px;
    }

    .spotc-free-gift-copy h4 {
      font-size: 13px;
    }

    .spotc-free-gift-price strong {
      font-size: 12px;
    }

    .spotc-order-delivery {
      padding: 17px;
      gap: 13px;
    }

    .spotc-order-delivery svg {
      width: 23px;
      height: 23px;
      flex: 0 0 23px;
    }

    .spotc-order-delivery strong {
      font-size: 17px;
      font-weight: 750;
    }

    .spotc-order-delivery small {
      margin-top: 4px;
      font-size: 14px;
      line-height: 1.45;
    }

    .spotc-order-footer span {
      font-size: 17px;
      font-weight: 550;
    }

    .spotc-order-footer strong {
      font-size: 25px;
      font-weight: 800;
    }

    
    .spotc-cart-group-head {
      min-height: 60px;
      padding: 10px 12px;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 9px;
    }

    .spotc-cart-group-head > span {
      width: 34px;
      height: 34px;
      font-size: 20px;
    }

    .spotc-cart-group-head strong {
      font-size: 15px;
    }

    .spotc-cart-group-head em {
      font-size: 10px;
    }

    /* =========================================================
       MOBILE CART PRODUCT ALIGNMENT
       Image + product info on row 1.
       Remove action on row 2.
    ========================================================= */

    .spotc-cart-product {
      width: 100%;
      min-width: 0;
      padding: 12px;
      grid-template-columns: 88px minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 12px;
      row-gap: 12px;
      align-items: start;
    }

    .spotc-product-image {
      width: 88px;
      height: 88px;
      grid-column: 1;
      grid-row: 1;
      align-self: start;
      border-radius: 13px;
    }

    .spotc-product-copy {
      width: 100%;
      min-width: 0;
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    .spotc-product-copy h3 {
      width: 100%;
      max-width: none;
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
      word-break: normal;
      overflow-wrap: break-word;
    }

    .spotc-product-copy p {
      margin: 6px 0 0;
      font-size: 12px;
      line-height: 1.35;
    }

    .spotc-product-copy strong {
      margin-top: 8px;
      font-size: 18px;
      line-height: 1.2;
    }

    .spotc-cart-controls {
      width: 100%;
      min-width: 0;
      grid-column: 1 / -1;
      grid-row: 2;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .spotc-cart-quantity {
      min-width: 116px;
      height: 40px;
      grid-template-columns: 36px minmax(36px, 1fr) 36px;
    }

    .spotc-remove-button {
      min-height: 40px;
      margin: 0;
      padding: 8px 6px;
      flex: 0 0 auto;
      justify-content: center;
      font-size: 12px;
    }

    /* Try at Home booking — mobile */
    .spotc-try-at-home-section {
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 16px;
    }

    .spotc-try-at-home-hero {
      grid-template-columns: 40px minmax(0, 1fr);
      align-items: start;
    }

    .spotc-try-at-home-summary {
      grid-column: 1 / -1;
      min-width: 0;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-align: left;
    }

    .spotc-try-at-home-summary strong,
    .spotc-try-at-home-summary span {
      display: inline;
      margin: 0;
    }

    .spotc-try-booking-panel {
      padding: 13px;
      border-radius: 15px;
    }

    .spotc-try-booking-top {
      align-items: flex-start;
      flex-direction: column;
    }

    .spotc-try-month-label {
      width: 100%;
      justify-content: center;
    }

    .spotc-try-date-strip {
      display: flex;
      overflow-x: auto;
      gap: 7px;
      padding-bottom: 5px;
      scrollbar-width: none;
    }

    .spotc-try-date-strip::-webkit-scrollbar {
      display: none;
    }

    .spotc-try-date-card {
      min-width: 62px;
      flex: 0 0 62px;
      min-height: 62px;
    }

    .spotc-try-time-heading-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }

    .spotc-try-at-home-slots {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .spotc-try-at-home-slot {
      min-height: 40px;
      padding: 8px 5px;
    }

    .spotc-try-at-home-slot strong {
      font-size: 11.5px;
      font-weight: 550;
    }

    .spotc-try-confirm-button {
      width: 100%;
    }

    .spotc-try-at-home-footer {
      font-size: 12.5px;
      line-height: 1.5;
    }

    .spotc-try-at-home-free {
      font-size: 10.5px;
    }

@media (max-width: 420px) {
    .spotc-cart-head {
      display: block;
    }

    .spotc-cart-head > span {
      display: block;
      padding-top: 8px;
      text-align: left;
    }

    .spotc-cart-summary {
      align-items: flex-start;
    }

    .spotc-products-card {
      padding: 12px;
    }

    .spotc-cart-product {
      padding: 11px;
      grid-template-columns: 80px minmax(0, 1fr);
      column-gap: 10px;
      row-gap: 10px;
    }

    .spotc-product-image {
      width: 80px;
      height: 80px;
      border-radius: 12px;
    }

    .spotc-product-copy h3 {
      font-size: 14px;
      line-height: 1.32;
    }

    .spotc-product-copy p {
      font-size: 11px;
    }

    .spotc-product-copy strong {
      font-size: 17px;
    }

    .spotc-cart-controls {
      gap: 8px;
    }

    .spotc-cart-quantity {
      min-width: 108px;
      height: 38px;
      grid-template-columns: 34px minmax(34px, 1fr) 34px;
    }

    .spotc-remove-button {
      min-height: 38px;
    }

  }
`;