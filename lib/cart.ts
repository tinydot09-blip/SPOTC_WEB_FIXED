import type { BusinessProduct } from './types';
import { imageOf, priceOf, text, titleOf } from './utils';

export type CartItem = {
  id: string;
  title: string;
  image: string;
  price: number;
  qty: number;
  businessId?: string;
  businessName?: string;
  size?: string;
  color?: string;
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
    'id' | 'size' | 'color'
  >,
): string =>
  `${item.id}:${item.size || ''}:${
    item.color || ''
  }`;

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
          existing.qty +=
            normalizedItem.qty;

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
        };

      const key =
        cartItemKey(
          normalizedItem,
        );

      const existing =
        merged.get(key);

      if (existing) {
        existing.qty +=
          normalizedItem.qty;

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

  const productId =
    String(
      product.id,
    );

  const cartKey =
    `${productId}:${size}:${color}`;

  const existingItem =
    items.find(
      (item) =>
        cartItemKey(
          item,
        ) === cartKey,
    );

  if (existingItem) {
    /*
     * Add selected quantity to
     * existing quantity.
     *
     * Example:
     * cart already 1
     * product page qty 2
     * result becomes 3
     */
    existingItem.qty =
      safeQuantity(
        existingItem.qty,
      ) +
      quantityToAdd;
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
        priceOf(
          product,
        ),

      qty:
        quantityToAdd,

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

  item.qty =
    safeQuantity(
      quantity,
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