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
export const CART_CHANGE_EVENT = 'spotc-cart-change';

const businessIdOf = (product: BusinessProduct): string => {
  const record = product as BusinessProduct & {
    business_id?: unknown;
    parent_business_id?: unknown;
    business_ref?: unknown;
  };

  const directId = text(
    record.business_id || record.parent_business_id,
  ).trim();

  if (directId) return directId;

  const reference = record.business_ref;

  if (reference && typeof reference === 'object') {
    const referenceRecord = reference as {
      id?: unknown;
      path?: unknown;
    };

    const id = text(referenceRecord.id).trim();
    if (id) return id;

    const path = text(referenceRecord.path).trim();

    if (path) {
      return path.split('/').filter(Boolean).pop() || '';
    }
  }

  return text(reference).trim();
};

const cartItemKey = (
  item: Pick<CartItem, 'id' | 'size' | 'color'>,
): string =>
  `${item.id}:${item.size || ''}:${item.color || ''}`;

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const storedValue = window.localStorage.getItem(CART_KEY);
    if (!storedValue) return [];

    const parsed = JSON.parse(storedValue) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const normalizedItems: CartItem[] = [];

    parsed
      .filter(
        (item): item is CartItem =>
          Boolean(
            item &&
              typeof item === 'object' &&
              'id' in item,
          ),
      )
      .forEach((item) => {
        const normalizedItem: CartItem = {
          ...item,
          id: String(item.id),
          title: String(item.title || 'Product'),
          image: String(item.image || ''),
          price: Number(item.price) || 0,
          qty: 1,
          size: String(item.size || ''),
          color: String(item.color || ''),
        };

        const key = cartItemKey(normalizedItem);
        if (seen.has(key)) return;

        seen.add(key);
        normalizedItems.push(normalizedItem);
      });

    return normalizedItems;
  } catch {
    return [];
  }
}

export function getCartCount(): number {
  return readCart().length;
}

function notifyCartChange(items: CartItem[]): void {
  if (typeof window === 'undefined') return;

  const count = items.length;

  window.dispatchEvent(
    new CustomEvent(CART_CHANGE_EVENT, {
      detail: {
        items,
        count,
      },
    }),
  );

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: CART_KEY,
      newValue: JSON.stringify(items),
      storageArea: window.localStorage,
    }),
  );
}

export function writeCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;

  const seen = new Set<string>();

  const normalizedItems = items
    .filter((item) => Boolean(item?.id))
    .map((item) => ({
      ...item,
      id: String(item.id),
      title: String(item.title || 'Product'),
      image: String(item.image || ''),
      qty: 1,
      price: Number(item.price) || 0,
      size: item.size || '',
      color: item.color || '',
    }))
    .filter((item) => {
      const key = cartItemKey(item);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  window.localStorage.setItem(
    CART_KEY,
    JSON.stringify(normalizedItems),
  );

  notifyCartChange(normalizedItems);
}

export function addProduct(
  product: BusinessProduct,
  options?: {
    size?: string;
    color?: string;
    qty?: number;
  },
): void {
  if (typeof window === 'undefined') return;

  const items = readCart();

  const size = text(options?.size ?? product.size).trim();
  const color = text(options?.color ?? product.color).trim();

  const productId = String(product.id);
  const cartKey = `${productId}:${size}:${color}`;

  const existingItem = items.find(
    (item) => cartItemKey(item) === cartKey,
  );

  if (existingItem) {
    existingItem.qty = 1;
  } else {
    items.push({
      id: productId,
      title: titleOf(product),
      image: imageOf(product),
      price: priceOf(product),
      qty: 1,
      businessId: businessIdOf(product),
      businessName: text(product.business_name).trim(),
      size,
      color,
    });
  }

  writeCart(items);
}

export function updateCartQuantity(
  id: string,
  quantity: number,
  size = '',
  color = '',
): void {
  if (quantity <= 0) {
    removeCartItem(id, size, color);
    return;
  }

  const items = readCart();

  const item = items.find(
    (cartItem) =>
      cartItem.id === id &&
      (cartItem.size || '') === size &&
      (cartItem.color || '') === color,
  );

  if (!item) return;

  item.qty = 1;
  writeCart(items);
}

export function removeCartItem(
  id: string,
  size = '',
  color = '',
): void {
  const items = readCart().filter(
    (item) =>
      !(
        item.id === id &&
        (item.size || '') === size &&
        (item.color || '') === color
      ),
  );

  writeCart(items);
}

export function clearCart(): void {
  writeCart([]);
}

export function saveOrder(order: unknown): void {
  if (typeof window === 'undefined') return;

  let orders: unknown[] = [];

  try {
    const storedValue = window.localStorage.getItem(ORDERS_KEY);
    const parsed = storedValue ? JSON.parse(storedValue) : [];

    if (Array.isArray(parsed)) {
      orders = parsed;
    }
  } catch {
    orders = [];
  }

  orders.unshift(order);

  window.localStorage.setItem(
    ORDERS_KEY,
    JSON.stringify(orders),
  );
}

export function readOrders(): unknown[] {
  if (typeof window === 'undefined') return [];

  try {
    const storedValue = window.localStorage.getItem(ORDERS_KEY);
    if (!storedValue) return [];

    const parsed = JSON.parse(storedValue) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}