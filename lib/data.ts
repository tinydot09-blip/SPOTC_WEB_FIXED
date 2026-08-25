import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';

import { db, firebaseReady } from './firebase';
import type {
  BusinessListing,
  BusinessProduct,
  SpotItem,
} from './types';

/*
 * ============================================================
 * SPOTC DATA CACHE
 * ============================================================
 *
 * Why:
 * Offers, Shop and AppShell can all request the same products.
 * Without caching, each call creates another Firestore request.
 *
 * This cache:
 * - makes Offers -> Shop much faster
 * - makes Shop -> Offers much faster
 * - prevents duplicate simultaneous requests
 * - automatically refreshes after 60 seconds
 *
 * IMPORTANT:
 * getProductById() remains a direct Firestore read because sold-out
 * products must still be available on their individual SEO page.
 */

const CACHE_TTL = 60_000;

type CacheEntry<T> = {
  data: T | null;
  loadedAt: number;
  promise: Promise<T> | null;
};

const offersCache: CacheEntry<BusinessListing[]> = {
  data: null,
  loadedAt: 0,
  promise: null,
};

const productsCache: CacheEntry<BusinessProduct[]> = {
  data: null,
  loadedAt: 0,
  promise: null,
};

const spotsCache: CacheEntry<SpotItem[]> = {
  data: null,
  loadedAt: 0,
  promise: null,
};

function cacheIsFresh<T>(
  cache: CacheEntry<T>,
): boolean {
  return (
    cache.data !== null &&
    Date.now() - cache.loadedAt < CACHE_TTL
  );
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value
  ) {
    const toMillis = (
      value as {
        toMillis?: () => number;
      }
    ).toMillis;

    if (typeof toMillis === 'function') {
      return toMillis.call(value);
    }
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  return 0;
}

function newestFirst<
  T extends {
    created_at?: unknown;
  },
>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      timestampMillis(b.created_at) -
      timestampMillis(a.created_at),
  );
}

function ensureFirestore() {
  if (!firebaseReady || !db) {
    throw new Error(
      'Firebase is not configured. Check .env.local and restart npm run dev.',
    );
  }

  return db;
}

/*
 * ============================================================
 * CACHE RESET HELPERS
 * ============================================================
 *
 * These can be called later after Admin creates/updates/deletes
 * products or offers if immediate refresh is required.
 */

export function clearOffersCache(): void {
  offersCache.data = null;
  offersCache.loadedAt = 0;
  offersCache.promise = null;
}

export function clearProductsCache(): void {
  productsCache.data = null;
  productsCache.loadedAt = 0;
  productsCache.promise = null;
}

export function clearSpotsCache(): void {
  spotsCache.data = null;
  spotsCache.loadedAt = 0;
  spotsCache.promise = null;
}

export function clearDataCache(): void {
  clearOffersCache();
  clearProductsCache();
  clearSpotsCache();
}

/*
 * ============================================================
 * OFFERS
 * ============================================================
 */

export async function getOffers(
  forceRefresh = false,
): Promise<BusinessListing[]> {
  if (
    !forceRefresh &&
    cacheIsFresh(offersCache)
  ) {
    return offersCache.data!;
  }

  /*
   * If another component already started loading offers,
   * reuse the same Promise instead of another Firestore query.
   */
  if (
    !forceRefresh &&
    offersCache.promise
  ) {
    return offersCache.promise;
  }

  const loadPromise = (async () => {
    const firestore = ensureFirestore();

    const snapshot = await getDocs(
      query(
        collection(
          firestore,
          'BusinessListings',
        ),
        limit(100),
      ),
    );

    const items = snapshot.docs.map(
      (item) => ({
        id: item.id,
        ref: item.ref,
        ...item.data(),
      }),
    ) as BusinessListing[];

    const result = newestFirst(items)
      .filter(
        (item) =>
          item.isActive !== false,
      )
      .filter(
        (item) =>
          item.isDeleted !== true,
      )
      .filter(
        (item) =>
          item.isHidden !== true,
      )
      .filter(
        (item) =>
          item.offer_is_active !== false,
      )
      .filter((item) => {
        const approvalStatus = String(
          item.approval_status ??
            item.status ??
            '',
        )
          .trim()
          .toLowerCase();

        return (
          item.approved === true ||
          item.isApproved === true ||
          approvalStatus === 'approved'
        );
      })
      .filter((item) => {
        const processingStatus = String(
          item.processing_status ?? '',
        )
          .trim()
          .toLowerCase();

        return (
          !processingStatus ||
          processingStatus === 'ready'
        );
      })
      .slice(0, 30);

    offersCache.data = result;
    offersCache.loadedAt = Date.now();

    return result;
  })();

  offersCache.promise = loadPromise;

  try {
    return await loadPromise;
  } finally {
    if (
      offersCache.promise === loadPromise
    ) {
      offersCache.promise = null;
    }
  }
}

/*
 * ============================================================
 * PRODUCTS
 * ============================================================
 */

export async function getProducts(
  forceRefresh = false,
): Promise<BusinessProduct[]> {
  /*
   * FAST PATH
   *
   * Offers -> Shop:
   * OfferFeed has already loaded products.
   * ProductGrid receives them immediately.
   *
   * Shop -> Offers:
   * ProductGrid has already loaded products.
   * OfferFeed receives them immediately.
   */
  if (
    !forceRefresh &&
    cacheIsFresh(productsCache)
  ) {
    return productsCache.data!;
  }

  /*
   * REQUEST DEDUPLICATION
   *
   * Example:
   *
   * ProductGrid -> getProducts()
   * AppShell     -> getProducts()
   *
   * Both now share ONE Firestore request.
   */
  if (
    !forceRefresh &&
    productsCache.promise
  ) {
    return productsCache.promise;
  }

  const loadPromise = (async () => {
    const firestore = ensureFirestore();

    /*
     * Do not reduce this to 40.
     *
     * Offer-linked products can be older than the newest
     * products and would disappear from the offer feed.
     */
    const snapshot = await getDocs(
      query(
        collection(
          firestore,
          'BusinessProducts',
        ),
        limit(500),
      ),
    );

    const items = snapshot.docs.map(
      (item) => ({
        id: item.id,
        ref: item.ref,
        ...item.data(),
      }),
    ) as BusinessProduct[];

    /*
     * PRODUCT LIST / SHOP BEHAVIOUR
     * -----------------------------
     * Keep sold-out products hidden from normal product lists.
     *
     * Direct product pages are handled separately by
     * getProductById() below.
     *
     * Therefore a sold-out product can still exist at:
     *
     * /product/[id]
     *
     * for Google SEO and show OutOfStock.
     */
    const result = newestFirst(items)
      .filter(
        (item) =>
          item.isActive !== false,
      )
      .filter(
        (item) =>
          item.is_in_stock !== false,
      )
      .filter(
        (item) =>
          item.stock_qty == null ||
          Number(item.stock_qty) > 0,
      );

    productsCache.data = result;
    productsCache.loadedAt = Date.now();

    return result;
  })();

  productsCache.promise = loadPromise;

  try {
    return await loadPromise;
  } finally {
    if (
      productsCache.promise === loadPromise
    ) {
      productsCache.promise = null;
    }
  }
}

/*
 * ============================================================
 * SPOTS
 * ============================================================
 */

export async function getSpots(
  forceRefresh = false,
): Promise<SpotItem[]> {
  if (
    !forceRefresh &&
    cacheIsFresh(spotsCache)
  ) {
    return spotsCache.data!;
  }

  if (
    !forceRefresh &&
    spotsCache.promise
  ) {
    return spotsCache.promise;
  }

  const loadPromise = (async () => {
    const firestore = ensureFirestore();

    const snapshot = await getDocs(
      query(
        collection(
          firestore,
          'Spot',
        ),
        limit(100),
      ),
    );

    const items = snapshot.docs.map(
      (item) => ({
        id: item.id,
        ref: item.ref,
        ...item.data(),
      }),
    ) as SpotItem[];

    const result = newestFirst(items)
      .filter(
        (item) =>
          !item.processing_status ||
          item.processing_status ===
            'ready',
      )
      .filter(
        (item) =>
          !item.status ||
          [
            'approved',
            'active',
            'ready',
          ].includes(
            item.status.toLowerCase(),
          ),
      )
      .slice(0, 30);

    spotsCache.data = result;
    spotsCache.loadedAt = Date.now();

    return result;
  })();

  spotsCache.promise = loadPromise;

  try {
    return await loadPromise;
  } finally {
    if (
      spotsCache.promise === loadPromise
    ) {
      spotsCache.promise = null;
    }
  }
}

/*
 * ============================================================
 * BUSINESS
 * ============================================================
 */

export async function getBusinessBySlug(
  slug: string,
): Promise<BusinessListing | null> {
  const offers = await getOffers();

  const normalize = (
    value: unknown,
  ) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  return (
    offers.find(
      (item) =>
        normalize(
          item.business_name ||
            item.shop_name ||
            item.id,
        ) === slug ||
        item.id === slug,
    ) ?? null
  );
}

export async function getBusinessProducts(
  business: BusinessListing,
): Promise<BusinessProduct[]> {
  const products =
    await getProducts();

  const businessId =
    business.id;

  const owner = String(
    business.owner_uid ?? '',
  );

  const name = String(
    business.business_name ||
      business.shop_name ||
      '',
  ).toLowerCase();

  return products.filter(
    (product) => {
      const ref =
        typeof product.business_ref ===
          'object' &&
        product.business_ref !== null &&
        'id' in product.business_ref
          ? String(
              (
                product.business_ref as {
                  id?: string;
                }
              ).id ?? '',
            )
          : String(
              product.business_ref ??
                '',
            );

      const productName = String(
        product.business_name ?? '',
      ).toLowerCase();

      return (
        ref.includes(businessId) ||
        (owner &&
          product.owner_uid ===
            owner) ||
        (name &&
          productName === name)
      );
    },
  );
}

/*
 * ============================================================
 * SINGLE PRODUCT
 * ============================================================
 */

export async function getProductById(
  id: string,
): Promise<BusinessProduct | null> {
  /*
   * If the product is already in our active product cache,
   * return it immediately.
   *
   * This makes opening a product from Shop faster too.
   */
  if (
    cacheIsFresh(productsCache) &&
    productsCache.data
  ) {
    const cachedProduct =
      productsCache.data.find(
        (product) =>
          product.id === id,
      );

    if (cachedProduct) {
      return cachedProduct;
    }
  }

  const firestore = ensureFirestore();

  /*
   * IMPORTANT
   * ---------
   *
   * Fetch the individual Firestore document directly
   * when it is not in the active-product cache.
   *
   * Do NOT depend only on getProducts() here because
   * getProducts() intentionally removes sold-out products.
   *
   * This lets an existing sold-out product page remain
   * available at:
   *
   * /product/[id]
   *
   * and allows SEO structured data to report OutOfStock.
   */
  const productSnapshot =
    await getDoc(
      doc(
        firestore,
        'BusinessProducts',
        id,
      ),
    );

  if (
    !productSnapshot.exists()
  ) {
    return null;
  }

  const product = {
    id: productSnapshot.id,
    ref: productSnapshot.ref,
    ...productSnapshot.data(),
  } as BusinessProduct;

  /*
   * Completely disabled products should not remain public.
   *
   * stock_qty = 0
   * or
   * is_in_stock = false
   *
   * is still returned so the product page can display
   * Sold Out / OutOfStock.
   */
  if (
    product.isActive === false
  ) {
    return null;
  }

  return product;
}