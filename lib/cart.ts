import type { BusinessProduct } from './types';
import { imageOf, priceOf, text, titleOf } from './utils';

export type CartItem = {
  id: string;
  title: string;
  image: string;
  price: number;
  qty: number;
  stockQty?: number;
  businessId?: string;
  businessName?: string;
  size?: string;
  color?: string;
  freeGiftCountPerItem?: number;
  is_combo_item?: boolean;
  combo_parent_id?: string;
  combo_original_price?: number;
  combo_price?: number;
  try_at_home?: boolean;
  tryAtHome?: boolean;

  // Preserve customer-facing price metadata for normal/main products.
  mrp?: number;
  old_price?: number;
  original_price?: number;
  discount?: number;
};

const CART_KEY = 'spotc_cart';
const ORDERS_KEY = 'spotc_orders';

export const CART_CHANGE_EVENT =
  'spotc-cart-change';

function safeQuantity(
  value: unknown,
  fallback = 1,
): number {
  const quantity = Number(value);

  if (
    !Number.isFinite(quantity) ||
    quantity < 1
  ) {
    return fallback;
  }

  return Math.floor(quantity);
}

function normalizeStockQuantity(
  value: unknown,
): number | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return undefined;
  }

  const quantity = Number(value);

  if (!Number.isFinite(quantity)) {
    return undefined;
  }

  return Math.max(
    0,
    Math.floor(quantity),
  );
}

function stockQuantityOf(
  product: BusinessProduct,
): number | undefined {
  return normalizeStockQuantity(
    product.stock_qty ??
      product.stock_quantity,
  );
}

function numericValue(
  value: unknown,
): number | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
}

type ProductPriceRecord = BusinessProduct & {
  mrp?: unknown;
  old_price?: unknown;
  oldPrice?: unknown;
  original_price?: unknown;
  originalPrice?: unknown;
  compare_at_price?: unknown;
  compareAtPrice?: unknown;
  list_price?: unknown;
  listPrice?: unknown;
  discount?: unknown;
};

function originalPriceOf(
  product: BusinessProduct,
): number | undefined {
  const record = product as ProductPriceRecord;
  const sellingPrice = priceOf(product);

  const candidates = [
    record.mrp,
    record.old_price,
    record.oldPrice,
    record.original_price,
    record.originalPrice,
    record.compare_at_price,
    record.compareAtPrice,
    record.list_price,
    record.listPrice,
  ];

  for (const candidate of candidates) {
    const value = numericValue(candidate);

    if (
      value !== undefined &&
      value > sellingPrice
    ) {
      return value;
    }
  }

  return undefined;
}

function discountPercentOf(
  product: BusinessProduct,
  originalPrice?: number,
): number | undefined {
  const record = product as ProductPriceRecord;
  const direct = numericValue(record.discount);

  if (
    direct !== undefined &&
    direct > 0
  ) {
    return Math.round(direct);
  }

  const sellingPrice = priceOf(product);

  if (
    originalPrice !== undefined &&
    originalPrice > sellingPrice &&
    sellingPrice > 0
  ) {
    return Math.round(
      ((originalPrice - sellingPrice) /
        originalPrice) *
        100,
    );
  }

  return undefined;
}

function freeGiftCountPerItemOf(
  _product: BusinessProduct,
): number {
  return 0;
}

const businessIdOf = (
  product: BusinessProduct,
): string => {
  const record =
    product as BusinessProduct & {
      business_id?: unknown;
      parent_business_id?: unknown;
      business_ref?: unknown;
    };

  const directId = text(
    record.business_id ||
      record.parent_business_id,
  ).trim();

  if (directId) {
    return directId;
  }

  const reference =
    record.business_ref;

  if (
    reference &&
    typeof reference === 'object'
  ) {
    const referenceRecord =
      reference as {
        id?: unknown;
        path?: unknown;
      };

    const id = text(
      referenceRecord.id,
    ).trim();

    if (id) {
      return id;
    }

    const path = text(
      referenceRecord.path,
    ).trim();

    if (path) {
      return (
        path
          .split('/')
          .filter(Boolean)
          .pop() || ''
      );
    }
  }

  return text(reference).trim();
};

const cartItemKey = (
  item: Pick<
    CartItem,
    'id' | 'size' | 'color' | 'is_combo_item' | 'combo_parent_id'
  >,
): string =>
  `${item.id}:${item.size || ''}:${item.color || ''}:${
    item.is_combo_item ? 'combo' : 'normal'
  }:${item.combo_parent_id || ''}`;

export function readCart(): CartItem[] {
  if (
    typeof window === 'undefined'
  ) {
    return [];
  }

  try {
    const storedValue =
      window.localStorage.getItem(
        CART_KEY,
      );

    if (!storedValue) {
      return [];
    }

    const parsed = JSON.parse(
      storedValue,
    ) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen =
      new Map<string, CartItem>();

    parsed
      .filter(
        (item): item is CartItem =>
          Boolean(
            item &&
              typeof item ===
                'object' &&
              'id' in item,
          ),
      )
      .forEach((item) => {
        const normalizedItem: CartItem =
          {
            ...item,

            id: String(
              item.id,
            ),

            title: String(
              item.title ||
                'Product',
            ),

            image: String(
              item.image || '',
            ),

            price:
              Number(
                item.price,
              ) || 0,

            qty: safeQuantity(
              item.qty,
            ),

            stockQty:
              normalizeStockQuantity(
                item.stockQty,
              ),

            businessId:
              String(
                item.businessId ||
                  '',
              ),

            businessName:
              String(
                item.businessName ||
                  '',
              ),

            size: String(
              item.size || '',
            ),

            color: String(
              item.color || '',
            ),

            freeGiftCountPerItem: 0,
            is_combo_item: item.is_combo_item === true,
            combo_parent_id: String(item.combo_parent_id || ''),
            combo_original_price:
              Number.isFinite(Number(item.combo_original_price))
                ? Number(item.combo_original_price)
                : undefined,
            combo_price:
              Number.isFinite(Number(item.combo_price))
                ? Number(item.combo_price)
                : undefined,
            try_at_home:
              item.try_at_home === true ||
              item.tryAtHome === true,
            tryAtHome:
              item.try_at_home === true ||
              item.tryAtHome === true,

            mrp:
              numericValue(item.mrp),
            old_price:
              numericValue(item.old_price),
            original_price:
              numericValue(item.original_price),
            discount:
              numericValue(item.discount),
          };

        const key =
          cartItemKey(
            normalizedItem,
          );

        const existing =
          seen.get(key);

        /*
         * If an old cart somehow contains
         * the same line multiple times,
         * combine their quantities.
         */
        if (existing) {
          if (existing.is_combo_item || normalizedItem.is_combo_item) {
            existing.qty = 1;
            existing.price = normalizedItem.price;
            return;
          }
          const mergedQuantity =
            existing.qty +
            normalizedItem.qty;

          const stockQty =
            existing.stockQty ??
            normalizedItem.stockQty;

          existing.stockQty =
            stockQty;

          existing.qty =
            stockQty === undefined
              ? mergedQuantity
              : Math.min(
                  mergedQuantity,
                  Math.max(1, stockQty),
                );

          return;
        }

        seen.set(
          key,
          normalizedItem,
        );
      });

    return Array.from(
      seen.values(),
    );
  } catch {
    return [];
  }
}

export function getCartCount(): number {
  return readCart().reduce(
    (total, item) =>
      total +
      safeQuantity(
        item.qty,
      ),
    0,
  );
}

function notifyCartChange(
  items: CartItem[],
): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  const count =
    items.reduce(
      (total, item) =>
        total +
        safeQuantity(
          item.qty,
        ),
      0,
    );

  window.dispatchEvent(
    new CustomEvent(
      CART_CHANGE_EVENT,
      {
        detail: {
          items,
          count,
        },
      },
    ),
  );

  /*
   * Native storage normally updates
   * other tabs only.
   *
   * Dispatching it manually lets
   * AppShell update immediately in
   * the current tab too.
   */
  window.dispatchEvent(
    new StorageEvent(
      'storage',
      {
        key: CART_KEY,

        newValue:
          JSON.stringify(
            items,
          ),

        storageArea:
          window.localStorage,
      },
    ),
  );
}

export function writeCart(
  items: CartItem[],
): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  const merged =
    new Map<
      string,
      CartItem
    >();

  items
    .filter(
      (item) =>
        Boolean(
          item?.id,
        ),
    )
    .forEach((item) => {
      const normalizedItem: CartItem =
        {
          ...item,

          id: String(
            item.id,
          ),

          title: String(
            item.title ||
              'Product',
          ),

          image: String(
            item.image || '',
          ),

          price:
            Number(
              item.price,
            ) || 0,

          qty: safeQuantity(
            item.qty,
          ),

          stockQty:
            normalizeStockQuantity(
              item.stockQty,
            ),

          businessId:
            item.businessId ||
            '',

          businessName:
            item.businessName ||
            '',

          size:
            item.size || '',

          color:
            item.color || '',

          freeGiftCountPerItem: 0,
          is_combo_item: item.is_combo_item === true,
          combo_parent_id: String(item.combo_parent_id || ''),
          combo_original_price:
            Number.isFinite(Number(item.combo_original_price))
              ? Number(item.combo_original_price)
              : undefined,
          combo_price:
            Number.isFinite(Number(item.combo_price))
              ? Number(item.combo_price)
              : undefined,
          try_at_home:
            item.try_at_home === true ||
            item.tryAtHome === true,
          tryAtHome:
            item.try_at_home === true ||
            item.tryAtHome === true,

          mrp:
            numericValue(item.mrp),
          old_price:
            numericValue(item.old_price),
          original_price:
            numericValue(item.original_price),
          discount:
            numericValue(item.discount),
        };

      const key =
        cartItemKey(
          normalizedItem,
        );

      const existing =
        merged.get(key);

      if (existing) {
        if (existing.is_combo_item || normalizedItem.is_combo_item) {
          existing.qty = 1;
          existing.price = normalizedItem.price;
          return;
        }
        const mergedQuantity =
          existing.qty +
          normalizedItem.qty;

        const stockQty =
          existing.stockQty ??
          normalizedItem.stockQty;

        existing.stockQty =
          stockQty;

        existing.qty =
          stockQty === undefined
            ? mergedQuantity
            : Math.min(
                mergedQuantity,
                Math.max(1, stockQty),
              );

        return;
      }

      merged.set(
        key,
        normalizedItem,
      );
    });

  const normalizedItems =
    Array.from(
      merged.values(),
    );

  window.localStorage.setItem(
    CART_KEY,
    JSON.stringify(
      normalizedItems,
    ),
  );

  notifyCartChange(
    normalizedItems,
  );
}

export function addProduct(
  product: BusinessProduct,
  options?: {
    size?: string;
    color?: string;
    qty?: number;
    price?: number;
    isComboItem?: boolean;
    comboParentId?: string;
    comboOriginalPrice?: number;
    comboPrice?: number;
    tryAtHome?: boolean;
  },
): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  const items =
    readCart();

  const size = text(
    options?.size ??
      product.size,
  ).trim();

  const color = text(
    options?.color ??
      product.color,
  ).trim();

  const quantityToAdd =
    safeQuantity(
      options?.qty,
    );

  const availableStock =
    stockQuantityOf(product);

  /*
   * Only normal/main products use the product's own MRP here.
   * Combo children keep using combo_original_price so the cart
   * continues to show the intended combo saving percentage.
   */
  const productOriginalPrice =
    options?.isComboItem === true
      ? undefined
      : originalPriceOf(product);

  const productDiscount =
    options?.isComboItem === true
      ? undefined
      : discountPercentOf(
          product,
          productOriginalPrice,
        );

  if (
    availableStock !== undefined &&
    availableStock <= 0
  ) {
    return;
  }

  const productId =
    String(
      product.id,
    );

  const isComboItem = options?.isComboItem === true;
  const comboParentId = String(options?.comboParentId || '');

  const cartKey = cartItemKey({
    id: productId,
    size,
    color,
    is_combo_item: isComboItem,
    combo_parent_id: comboParentId,
  });

  const existingItem =
    items.find(
      (item) =>
        cartItemKey(
          item,
        ) === cartKey,
    );

  if (existingItem) {
    /*
     * Keep the cart quantity within the
     * product's current available stock.
     */
    existingItem.stockQty =
      availableStock;
    existingItem.freeGiftCountPerItem = 0;
    existingItem.is_combo_item = isComboItem;
    existingItem.combo_parent_id = comboParentId;
    existingItem.combo_original_price = options?.comboOriginalPrice;
    existingItem.combo_price = options?.comboPrice;
    existingItem.try_at_home = options?.tryAtHome === true;
    existingItem.tryAtHome = options?.tryAtHome === true;

    if (!isComboItem) {
      existingItem.mrp = productOriginalPrice;
      existingItem.old_price = productOriginalPrice;
      existingItem.original_price = productOriginalPrice;
      existingItem.discount = productDiscount;

      // Keep selected product variation data current.
      existingItem.size = size;
      existingItem.color = color;
    }

    if (isComboItem) {
      existingItem.qty = 1;
      existingItem.price =
        Number(options?.comboPrice ?? options?.price) || priceOf(product);
      writeCart(items);
      return;
    }

    const requestedQuantity =
      safeQuantity(
        existingItem.qty,
      ) +
      quantityToAdd;

    existingItem.qty =
      availableStock === undefined
        ? requestedQuantity
        : Math.min(
            requestedQuantity,
            availableStock,
          );
  } else {
    items.push({
      id: productId,

      title:
        titleOf(
          product,
        ),

      image:
        imageOf(
          product,
        ),

      price:
        Number(options?.comboPrice ?? options?.price) ||
        priceOf(product),

      qty:
        isComboItem
          ? 1
          : availableStock === undefined
            ? quantityToAdd
            : Math.min(
                quantityToAdd,
                availableStock,
              ),

      stockQty:
        availableStock,

      freeGiftCountPerItem: 0,
      is_combo_item: isComboItem,
      combo_parent_id: comboParentId,
      combo_original_price: options?.comboOriginalPrice,
      combo_price: options?.comboPrice,
      try_at_home: options?.tryAtHome === true,
      tryAtHome: options?.tryAtHome === true,

      mrp:
        isComboItem
          ? undefined
          : productOriginalPrice,
      old_price:
        isComboItem
          ? undefined
          : productOriginalPrice,
      original_price:
        isComboItem
          ? undefined
          : productOriginalPrice,
      discount:
        isComboItem
          ? undefined
          : productDiscount,

      businessId:
        businessIdOf(
          product,
        ),

      businessName:
        text(
          product.business_name,
        ).trim(),

      size,
      color,
    });
  }

  writeCart(
    items,
  );
}

export function updateCartQuantity(
  id: string,
  quantity: number,
  size = '',
  color = '',
): void {
  if (
    quantity <= 0
  ) {
    removeCartItem(
      id,
      size,
      color,
    );

    return;
  }

  const items =
    readCart();

  const item =
    items.find(
      (cartItem) =>
        cartItem.id ===
          id &&
        (
          cartItem.size ||
          ''
        ) === size &&
        (
          cartItem.color ||
          ''
        ) === color,
    );

  if (!item) {
    return;
  }

  if (item.is_combo_item) {
    item.qty = 1;
    writeCart(items);
    return;
  }

  const requestedQuantity =
    safeQuantity(
      quantity,
    );

  item.qty =
    item.stockQty === undefined
      ? requestedQuantity
      : Math.min(
          requestedQuantity,
          Math.max(
            1,
            item.stockQty,
          ),
        );

  writeCart(
    items,
  );
}

export function removeCartItem(
  id: string,
  size = '',
  color = '',
): void {
  const items =
    readCart().filter(
      (item) =>
        !(
          item.id ===
            id &&
          (
            item.size ||
            ''
          ) === size &&
          (
            item.color ||
            ''
          ) === color
        ),
    );

  writeCart(
    items,
  );
}

export function clearCart(): void {
  writeCart([]);
}

export function saveOrder(
  order: unknown,
): void {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  let orders:
    unknown[] = [];

  try {
    const storedValue =
      window.localStorage.getItem(
        ORDERS_KEY,
      );

    const parsed =
      storedValue
        ? JSON.parse(
            storedValue,
          )
        : [];

    if (
      Array.isArray(
        parsed,
      )
    ) {
      orders =
        parsed;
    }
  } catch {
    orders = [];
  }

  orders.unshift(
    order,
  );

  window.localStorage.setItem(
    ORDERS_KEY,
    JSON.stringify(
      orders,
    ),
  );
}

export function readOrders(): unknown[] {
  if (
    typeof window === 'undefined'
  ) {
    return [];
  }

  try {
    const storedValue =
      window.localStorage.getItem(
        ORDERS_KEY,
      );

    if (
      !storedValue
    ) {
      return [];
    }

    const parsed =
      JSON.parse(
        storedValue,
      ) as unknown;

    return Array.isArray(
      parsed,
    )
      ? parsed
      : [];
  } catch {
    return [];
  }
}
