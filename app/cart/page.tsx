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

type CartPriceMeta = CartItem & {
  mrp?: unknown;
  old_price?: unknown;
  oldPrice?: unknown;
  original_price?: unknown;
  originalPrice?: unknown;
  compare_at_price?: unknown;
  compareAtPrice?: unknown;
  list_price?: unknown;
  listPrice?: unknown;
};

const cartMrpOf = (item: CartItem): number => {
  const meta = item as CartPriceMeta;
  const candidates = [
    meta.mrp,
    meta.old_price,
    meta.oldPrice,
    meta.original_price,
    meta.originalPrice,
    meta.compare_at_price,
    meta.compareAtPrice,
    meta.list_price,
    meta.listPrice,
    isComboCartItem(item)
      ? comboMetaOf(item).combo_original_price
      : undefined,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return Number(item.price) || 0;
};

const cartDiscountPercentOf = (item: CartItem): number => {
  const price = Number(item.price) || 0;
  const mrp = cartMrpOf(item);

  if (mrp <= price || price <= 0) return 0;

  return Math.round(((mrp - price) / mrp) * 100);
};

type TryAtHomeCartItem = CartItem & {
  try_at_home?: boolean;
  tryAtHome?: boolean;
  main_category?: unknown;
  category?: unknown;
  sub_category?: unknown;
  child_category?: unknown;
  product_name?: unknown;
};

type TryAtHomeKind = 'dress' | 'earring';

const tryAtHomeMetaOf = (item: CartItem): TryAtHomeCartItem =>
  item as TryAtHomeCartItem;

const isTryAtHomeCartItem = (item: CartItem): boolean => {
  // Combo children must never be Try at Home items.
  if (isComboCartItem(item)) return false;

  const meta = tryAtHomeMetaOf(item);

  return (
    meta.try_at_home === true ||
    meta.tryAtHome === true
  );
};

const tryAtHomeKindOf = (
  item: CartItem,
): TryAtHomeKind | null => {
  if (isComboCartItem(item)) return null;

  const meta = tryAtHomeMetaOf(item);
  const price = Number(item.price) || 0;

  const combined = [
    meta.main_category,
    meta.category,
    meta.sub_category,
    meta.child_category,
    meta.product_name,
    item.title,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  const isEarring =
    combined.includes('earring') ||
    combined.includes('ear ring') ||
    combined.includes('ear stud') ||
    combined.includes('jhumka') ||
    combined.includes('jhumki');

  if (isEarring && price >= 80) {
    return 'earring';
  }

  const looksLikeToy =
    combined.includes('toy') ||
    combined.includes('doll') ||
    combined.includes('gun') ||
    combined.includes('car toy') ||
    combined.includes('magic slate') ||
    combined.includes('fidget');

  if (looksLikeToy) {
    return null;
  }

  const isDress =
    combined.includes('girl dress') ||
    combined.includes('girls dress') ||
    combined.includes('girls wear') ||
    combined.includes('kids wear') ||
    combined.includes('frock') ||
    combined.includes('kurti') ||
    combined.includes('lehenga') ||
    combined.includes('salwar') ||
    combined.includes('palazzo') ||
    combined.includes('co-ord') ||
    combined.includes('coord') ||
    combined.includes('top and skirt') ||
    combined.includes('top & skirt') ||
    (
      (combined.includes('girl') || combined.includes('girls')) &&
      (
        combined.includes('top') ||
        combined.includes('dress') ||
        combined.includes('set')
      )
    );

  if (isDress && price >= 100) {
    return 'dress';
  }

  return null;
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

  if (selectedDate > todayKey) return true;
  if (selectedDate < todayKey) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slot.startMinutes > nowMinutes;
};

const preferredTryAtHomeSlotId = (
  selectedDate: string,
  now: Date = new Date(),
): string => {
  const nextSlot = TRY_AT_HOME_SLOTS.find((slot) =>
    isTryAtHomeSlotAvailable(slot, selectedDate, now),
  );

  return nextSlot?.id || '';
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
    orderWindow: 'Order between 6 AM – 12 PM',
    deliveryWindow: 'Delivery between 12 PM – 2 PM',
    fee: 0,
  },
  {
    id: 'afternoon',
    title: 'Afternoon Slot',
    orderWindow: 'Order between 12 PM – 6 PM',
    deliveryWindow: 'Delivery between 6 PM – 7 PM',
    fee: 0,
  },
  {
    id: 'overnight',
    title: 'Night Slot',
    orderWindow: 'Order between 6 PM – 6 AM',
    deliveryWindow: 'Delivery between 6 AM – 8 AM',
    fee: 0,
  },
];


const isDeliveryOptionAvailable = (
  id: DeliveryOptionId,
  now: Date = new Date(),
): boolean => {
  const hour = now.getHours();

  if (id === 'instant') {
    return hour >= 7 && hour < 20;
  }

  if (id === 'morning') {
    return hour >= 6 && hour < 12;
  }

  if (id === 'afternoon') {
    return hour >= 12 && hour < 18;
  }

  return hour >= 18 || hour < 6;
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

  const [selectedTryAtHomeDate, setSelectedTryAtHomeDate] =
    useState<string>(() => localDateKey(new Date()));

  const [selectedTryAtHomeSlotId, setSelectedTryAtHomeSlotId] =
    useState<string>(() =>
      preferredTryAtHomeSlotId(
        localDateKey(new Date()),
        new Date(),
      ),
    );

  const [tryAtHomeSlotConfirmed, setTryAtHomeSlotConfirmed] =
    useState(false);

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

  const selectTryAtHomeDate = (value: string) => {
    const today = localDateKey(new Date());
    if (!value || value < today) return;

    setSelectedTryAtHomeDate(value);
    setTryAtHomeSlotConfirmed(false);

    const nextSlotId = preferredTryAtHomeSlotId(
      value,
      new Date(),
    );
    setSelectedTryAtHomeSlotId(nextSlotId);
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
    setTryAtHomeSlotConfirmed(false);
  };

  const confirmTryAtHomeSlot = () => {
    const slot = TRY_AT_HOME_SLOTS.find(
      (item) => item.id === selectedTryAtHomeSlotId,
    );

    if (
      !slot ||
      !isTryAtHomeSlotAvailable(
        slot,
        selectedTryAtHomeDate,
        new Date(),
      )
    ) {
      return;
    }

    setTryAtHomeSlotConfirmed(true);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-try-at-home-date',
        selectedTryAtHomeDate,
      );

      window.localStorage.setItem(
        'spotc-try-at-home-slot-id',
        slot.id,
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

    // Cart is now the only source of truth for Try at Home selection.
    // Remove the legacy ProductGrid selection key so stale selections
    // can never re-activate Try at Home in the cart.
    try {
      window.localStorage.removeItem('spotc_try_at_home_ids');
    } catch {
      // localStorage is optional; cart flags still remain the source of truth.
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

  const toggleTryAtHome = (
    itemIndex: number,
  ) => {
    const item = items[itemIndex];
    if (!item) return;

    const kind = tryAtHomeKindOf(item);
    if (!kind) return;

    const currentlySelected = isTryAtHomeCartItem(item);

    if (!currentlySelected) {
      const selectedOfSameKind = items.filter(
        (candidate) =>
          isTryAtHomeCartItem(candidate) &&
          tryAtHomeKindOf(candidate) === kind,
      ).length;

      if (selectedOfSameKind >= 2) {
        alert(
          kind === 'dress'
            ? 'You can select up to 2 dresses for Try at Home.'
            : 'You can select up to 2 earrings for Try at Home.',
        );
        return;
      }
    }

    const nextItems = items.map(
      (currentItem, index) => {
        if (index !== itemIndex) return currentItem;

        return {
          ...currentItem,
          tryAtHome: !currentlySelected,
          try_at_home: !currentlySelected,
        } as CartItem;
      },
    );

    updateCart(nextItems);

    // Any change to the selected Try-at-Home products must be
    // reconfirmed before checkout.
    setTryAtHomeSlotConfirmed(false);

    const stillHasTryAtHomeItems = nextItems.some(
      (candidate) => isTryAtHomeCartItem(candidate),
    );

    if (!stillHasTryAtHomeItems && typeof window !== 'undefined') {
      window.localStorage.removeItem('spotc-try-at-home-date');
      window.localStorage.removeItem('spotc-try-at-home-slot-id');
      window.localStorage.removeItem('spotc-try-at-home-slot');
    }
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
        isTryAtHomeCartItem(item),
      ),
    [items],
  );

  const hasTryAtHomeItems = tryAtHomeItems.length > 0;

  const tryAtHomeDates = useMemo(
    () => tryAtHomeDateOptions(deliveryClock, 7),
    [deliveryClock],
  );

  const selectedTryAtHomeSlot =
    TRY_AT_HOME_SLOTS.find(
      (slot) => slot.id === selectedTryAtHomeSlotId,
    ) || null;

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
    items.length === 0 || hasTryAtHomeItems
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
                          const itemMrp = cartMrpOf(item);
                          const itemDiscount = cartDiscountPercentOf(item);
                          const tryAtHomeKind =
                            !isChild ? tryAtHomeKindOf(item) : null;
                          const tryAtHomeSelected =
                            isTryAtHomeCartItem(item);

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
                                    <p className="spotc-product-variation">
                                      {[
                                        item.size && `Size: ${item.size}`,
                                        item.color && `Colour: ${item.color}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  )}

                                  <div className="spotc-product-price-row">
                                    <strong>
                                      {money(
                                        item.price *
                                          Math.max(1, Number(item.qty) || 1),
                                      )}
                                    </strong>

                                    {itemMrp > item.price && (
                                      <del>{money(itemMrp)}</del>
                                    )}

                                    {itemDiscount > 0 && (
                                      <span className="spotc-discount-badge">
                                        {itemDiscount}% OFF
                                      </span>
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
                                  <div className="spotc-cart-controls-left">
                                    {tryAtHomeKind && (
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={tryAtHomeSelected}
                                        className={`spotc-try-at-home-switch-row ${
                                          tryAtHomeSelected ? 'selected' : ''
                                        }`}
                                        onClick={() => toggleTryAtHome(index)}
                                      >
                                        <span className="spotc-try-at-home-switch-label">
                                          🏠 Try at Home
                                        </span>

                                        <span
                                          className="spotc-try-at-home-switch"
                                          aria-hidden="true"
                                        >
                                          <span />
                                        </span>
                                      </button>
                                    )}
                                  </div>

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

              {hasTryAtHomeItems ? (
                <section className="spotc-try-at-home-section">
                  <div className="spotc-try-at-home-head">
                    <div className="spotc-try-at-home-title">
                      <span className="spotc-try-at-home-icon">
                        <Clock3 size={20} />
                      </span>

                      <div>
                        <small>TRY AT HOME</small>
                        <h3>Choose date and time</h3>
                        <p>
                          Select a 30-minute visit between 9:00 AM and 6:00 PM.
                        </p>
                      </div>
                    </div>

                  </div>

                  <div className="spotc-try-date-toolbar">
                    <strong>
                      {formatTryAtHomeMonth(selectedTryAtHomeDate)}
                    </strong>
                    <span>Next 7 days</span>
                  </div>

                  <div className="spotc-try-date-strip">
                    {tryAtHomeDates.map((dateValue) => {
                      const selected =
                        dateValue === selectedTryAtHomeDate;

                      return (
                        <button
                          key={dateValue}
                          type="button"
                          className={`spotc-try-date-card ${
                            selected ? 'active' : ''
                          }`}
                          aria-pressed={selected}
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

                  <div className="spotc-try-time-head">
                    <strong>Select time</strong>
                    <span>30-minute slots</span>
                  </div>

                  {availableTryAtHomeSlots.length > 0 ? (
                    <div className="spotc-try-time-grid">
                      {TRY_AT_HOME_SLOTS.map((slot) => {
                        const available =
                          isTryAtHomeSlotAvailable(
                            slot,
                            selectedTryAtHomeDate,
                            deliveryClock,
                          );
                        const selected =
                          available &&
                          slot.id === selectedTryAtHomeSlotId;

                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={!available}
                            aria-disabled={!available}
                            aria-pressed={selected}
                            className={`spotc-try-time-slot ${
                              selected ? 'active' : ''
                            } ${
                              !available ? 'disabled' : ''
                            }`}
                            onClick={() =>
                              selectTryAtHomeSlot(slot)
                            }
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="spotc-try-no-slots">
                      No slots left for this date. Choose another day.
                    </div>
                  )}

                  <div className="spotc-try-booking-footer">
                    <div>
                      <span className="spotc-try-free">FREE VISIT</span>
                      <p>
                        Try before you buy · Max 2 dresses + 2 earrings · One booking per day
                      </p>
                    </div>

                    <button
                      type="button"
                      className={`spotc-try-confirm ${
                        tryAtHomeSlotConfirmed ? 'confirmed' : ''
                      }`}
                      disabled={!selectedTryAtHomeSlot}
                      onClick={confirmTryAtHomeSlot}
                    >
                      {tryAtHomeSlotConfirmed
                        ? '✓ Slot Confirmed'
                        : selectedTryAtHomeSlot
                          ? `Confirm ${selectedTryAtHomeSlot.label}`
                          : 'Choose another date'}
                    </button>
                  </div>
                </section>
              ) : (
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

            {hasTryAtHomeItems ? (
              <div className="spotc-delivery-note spotc-try-at-home-note">
                <Clock3 size={19} />

                <span>
                  <strong>Try at Home</strong>
                  <small>
                    {selectedTryAtHomeDate}
                    {selectedTryAtHomeSlot
                      ? ` · ${selectedTryAtHomeSlot.label}`
                      : ''}
                  </small>
                </span>
              </div>
            ) : (
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
                if (hasTryAtHomeItems) {
                  if (!selectedTryAtHomeSlot) {
                    event.preventDefault();
                    alert('Please choose a Try at Home date and time.');
                    return;
                  }

                  if (!tryAtHomeSlotConfirmed) {
                    event.preventDefault();
                    alert('Please confirm your Try at Home slot.');
                    return;
                  }

                  window.localStorage.setItem(
                    'spotc-try-at-home-date',
                    selectedTryAtHomeDate,
                  );
                  window.localStorage.setItem(
                    'spotc-try-at-home-slot-id',
                    selectedTryAtHomeSlot.id,
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
                  delivery_option: hasTryAtHomeItems
                    ? undefined
                    : selectedDelivery.id,
                  try_at_home: hasTryAtHomeItems,
                  try_at_home_date: hasTryAtHomeItems
                    ? selectedTryAtHomeDate
                    : undefined,
                  try_at_home_slot: hasTryAtHomeItems
                    ? selectedTryAtHomeSlot?.id
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

  .spotc-try-at-home-switch-row {
    width: fit-content;
    min-width: 176px;
    margin-top: 10px;
    padding: 8px 10px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border: 1px solid #ded8d1;
    border-radius: 999px;
    color: #2f2a25;
    background: #ffffff;
    font-family: inherit;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease;
  }

  .spotc-try-at-home-switch-row:hover {
    border-color: #b7d6c2;
    background: #fbfefc;
  }

  .spotc-try-at-home-switch-row.selected {
    border-color: #a8d5b8;
    background: #f1faf4;
    box-shadow: 0 0 0 2px rgba(22, 134, 72, 0.05);
  }

  .spotc-try-at-home-switch-label {
    color: #2b2926;
    font-size: 13px;
    font-weight: 750;
    line-height: 1;
    white-space: nowrap;
  }

  .spotc-try-at-home-switch {
    position: relative;
    width: 42px;
    height: 24px;
    flex: 0 0 42px;
    display: block;
    border-radius: 999px;
    background: #d9d9d9;
    transition: background 160ms ease;
  }

  .spotc-try-at-home-switch > span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    transition: transform 160ms ease;
  }

  .spotc-try-at-home-switch-row.selected
    .spotc-try-at-home-switch {
    background: #159447;
  }

  .spotc-try-at-home-switch-row.selected
    .spotc-try-at-home-switch > span {
    transform: translateX(18px);
  }

  .spotc-try-at-home-badge {
    width: fit-content;
    margin-top: 8px;
    padding: 5px 9px;
    display: inline-flex;
    align-items: center;
    border: 1px solid #e8cfd8;
    border-radius: 999px;
    color: #943554;
    background: #fff4f7;
    font-size: 11px;
    font-weight: 650;
  }

  .spotc-try-at-home-section {
    margin-top: 16px;
    padding: 18px;
    border: 1px solid #eadfd8;
    border-radius: 18px;
    background: #ffffff;
  }

  .spotc-try-at-home-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-try-at-home-title {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 11px;
  }

  .spotc-try-at-home-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    color: #b35a22;
    background: #fff1e6;
  }

  .spotc-try-at-home-title small {
    display: block;
    color: #aa5b28;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.11em;
  }

  .spotc-try-at-home-title h3 {
    margin: 3px 0 0;
    color: #2a231f;
    font-size: 19px;
    font-weight: 600;
  }

  .spotc-try-at-home-title p {
    margin: 4px 0 0;
    color: #756b64;
    font-size: 13px;
    line-height: 1.4;
  }

  .spotc-try-at-home-count {
    flex: 0 0 auto;
    padding: 7px 10px;
    border: 1px solid #e8ded7;
    border-radius: 10px;
    color: #6d625b;
    background: #faf8f6;
    font-size: 12px;
  }

  .spotc-try-date-toolbar {
    margin-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .spotc-try-date-toolbar strong {
    color: #302822;
    font-size: 14px;
    font-weight: 600;
  }

  .spotc-try-date-toolbar span {
    color: #8b8078;
    font-size: 11px;
  }

  .spotc-try-date-strip {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(7, minmax(58px, 1fr));
    gap: 8px;
  }

  .spotc-try-date-card {
    min-height: 67px;
    padding: 8px 6px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    border: 1px solid #ded6cf;
    border-radius: 13px;
    color: #625951;
    background: #ffffff;
    cursor: pointer;
  }

  .spotc-try-date-card span {
    font-size: 12px;
    font-weight: 450;
  }

  .spotc-try-date-card strong {
    color: #29231f;
    font-size: 18px;
    font-weight: 600;
  }

  .spotc-try-date-card.active {
    border-color: #e47b2f;
    color: #cf681d;
    background: #fff7f0;
  }

  .spotc-try-date-card.active strong {
    color: #cf681d;
  }

  .spotc-try-time-head {
    margin-top: 18px;
    margin-bottom: 10px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .spotc-try-time-head strong {
    color: #302822;
    font-size: 14px;
    font-weight: 600;
  }

  .spotc-try-time-head span {
    color: #8b8078;
    font-size: 11px;
  }

  .spotc-try-time-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .spotc-try-time-slot {
    min-width: 0;
    min-height: 40px;
    padding: 8px 7px;
    border: 1px solid #e3ddd8;
    border-radius: 999px;
    color: #38302a;
    background: #f9f7f5;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .spotc-try-time-slot.active {
    border-color: #e47b2f;
    color: #c95f16;
    background: #fff4ea;
  }

  .spotc-try-time-slot.disabled,
  .spotc-try-time-slot:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .spotc-try-no-slots {
    padding: 14px;
    border: 1px solid #eadfd8;
    border-radius: 12px;
    color: #785d4d;
    background: #fff8f3;
    font-size: 12px;
  }

  .spotc-try-booking-footer {
    margin-top: 16px;
    padding-top: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-top: 1px solid #eee7e1;
  }

  .spotc-try-booking-footer > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }

  .spotc-try-booking-footer p {
    margin: 0;
    color: #605751;
    font-size: 13px;
    line-height: 1.45;
  }

  .spotc-try-free {
    padding: 5px 9px;
    border: 1px solid #cfe9d8;
    border-radius: 999px;
    color: #177143;
    background: #eef8f2;
    font-size: 11px;
    font-weight: 600;
  }

  .spotc-try-confirm {
    min-height: 42px;
    flex: 0 0 auto;
    padding: 0 15px;
    border: 0;
    border-radius: 11px;
    color: #ffffff;
    background: #df762a;
    font-family: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
  }

  .spotc-try-confirm.confirmed {
    background: #17854a;
  }

  .spotc-try-confirm:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .spotc-try-at-home-note {
    border-color: #eadfd8;
    background: #fff8f3;
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

  .spotc-product-variation {
    margin: 6px 0 0;
    color: #7a726b;
    font-size: 13px;
    line-height: 1.35;
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

  .spotc-discount-badge {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    color: #087c36;
    background: #e9f8ee;
    font-size: 11px;
    font-weight: 850;
    line-height: 1;
    white-space: nowrap;
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
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .spotc-cart-controls-left {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
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

    .spotc-products-card {
      padding: 17px;
    }

    .spotc-delivery-options {
      grid-template-columns: 1fr;
    }

    .spotc-try-at-home-switch-row {
      min-width: 164px;
      margin-top: 8px;
      padding: 7px 9px;
      gap: 12px;
    }

    .spotc-try-at-home-switch-label {
      font-size: 12px;
    }

    .spotc-try-at-home-switch {
      width: 40px;
      height: 22px;
      flex-basis: 40px;
    }

    .spotc-try-at-home-switch > span {
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
    }

    .spotc-try-at-home-switch-row.selected
      .spotc-try-at-home-switch > span {
      transform: translateX(18px);
    }

    .spotc-try-at-home-section {
      padding: 14px;
      border-radius: 15px;
    }

    .spotc-try-at-home-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 11px;
    }

    .spotc-try-at-home-count {
      width: 100%;
      text-align: center;
    }

    .spotc-try-date-strip {
      display: flex;
      overflow-x: auto;
      gap: 7px;
      padding-bottom: 4px;
      scrollbar-width: none;
    }

    .spotc-try-date-strip::-webkit-scrollbar {
      display: none;
    }

    .spotc-try-date-card {
      min-width: 62px;
      flex: 0 0 62px;
    }

    .spotc-try-time-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }

    .spotc-try-time-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .spotc-try-time-slot {
      min-height: 42px;
      font-size: 11px;
    }

    .spotc-try-booking-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .spotc-try-confirm {
      width: 100%;
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
      padding-top: 10px;
      border-top: 1px solid #f0ebe5;
    }

    .spotc-cart-controls-left {
      flex: 1 1 auto;
      justify-content: flex-start;
    }


    .spotc-remove-button {
      min-height: 40px;
      margin: 0;
      padding: 8px 6px;
      flex: 0 0 auto;
      justify-content: center;
      font-size: 12px;
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


    .spotc-remove-button {
      min-height: 38px;
    }

  }
`;