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

function newestFirst<T extends { created_at?: unknown }>(
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

export async function getOffers(): Promise<BusinessListing[]> {
  const firestore = ensureFirestore();

  const snapshot = await getDocs(
    query(
      collection(firestore, 'BusinessListings'),
      limit(100),
    ),
  );

  const items = snapshot.docs.map((item) => ({
    id: item.id,
    ref: item.ref,
    ...item.data(),
  })) as BusinessListing[];

  return newestFirst(items)
    .filter((item) => item.isActive !== false)
    .filter((item) => item.isDeleted !== true)
    .filter((item) => item.isHidden !== true)
    .filter((item) => item.offer_is_active !== false)
    .filter((item) => {
      const approvalStatus = String(
        item.approval_status ?? item.status ?? '',
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
}

export async function getProducts(): Promise<
  BusinessProduct[]
> {
  const firestore = ensureFirestore();

  // Do not cut this to 40.
  // Offer-linked products can be older than the newest
  // products and would disappear from the offer feed.
  const snapshot = await getDocs(
    query(
      collection(firestore, 'BusinessProducts'),
      limit(500),
    ),
  );

  const items = snapshot.docs.map((item) => ({
    id: item.id,
    ref: item.ref,
    ...item.data(),
  })) as BusinessProduct[];

  /*
   * PRODUCT LIST / SHOP BEHAVIOUR
   * -----------------------------
   * Keep sold-out products hidden from normal product lists.
   *
   * Direct product pages are handled separately by
   * getProductById() below, so a sold-out product can still
   * exist at /product/[id] for Google SEO and show OutOfStock.
   */
  return newestFirst(items)
    .filter((item) => item.isActive !== false)
    .filter((item) => item.is_in_stock !== false)
    .filter(
      (item) =>
        item.stock_qty == null ||
        Number(item.stock_qty) > 0,
    );
}

export async function getSpots(): Promise<SpotItem[]> {
  const firestore = ensureFirestore();

  const snapshot = await getDocs(
    query(
      collection(firestore, 'Spot'),
      limit(100),
    ),
  );

  const items = snapshot.docs.map((item) => ({
    id: item.id,
    ref: item.ref,
    ...item.data(),
  })) as SpotItem[];

  return newestFirst(items)
    .filter(
      (item) =>
        !item.processing_status ||
        item.processing_status === 'ready',
    )
    .filter(
      (item) =>
        !item.status ||
        ['approved', 'active', 'ready'].includes(
          item.status.toLowerCase(),
        ),
    )
    .slice(0, 30);
}

export async function getBusinessBySlug(
  slug: string,
): Promise<BusinessListing | null> {
  const offers = await getOffers();

  const normalize = (value: unknown) =>
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
  const products = await getProducts();

  const businessId = business.id;

  const owner = String(
    business.owner_uid ?? '',
  );

  const name = String(
    business.business_name ||
      business.shop_name ||
      '',
  ).toLowerCase();

  return products.filter((product) => {
    const ref =
      typeof product.business_ref === 'object' &&
      product.business_ref !== null &&
      'id' in product.business_ref
        ? String(
            (
              product.business_ref as {
                id?: string;
              }
            ).id ?? '',
          )
        : String(product.business_ref ?? '');

    const productName = String(
      product.business_name ?? '',
    ).toLowerCase();

    return (
      ref.includes(businessId) ||
      (owner && product.owner_uid === owner) ||
      (name && productName === name)
    );
  });
}

export async function getProductById(
  id: string,
): Promise<BusinessProduct | null> {
  const firestore = ensureFirestore();

  /*
   * IMPORTANT
   * ---------
   * Fetch the individual Firestore document directly.
   *
   * Do NOT call getProducts() here because getProducts()
   * intentionally removes sold-out products.
   *
   * This lets an existing sold-out product page remain
   * available at /product/[id] and allows SEO structured
   * data to correctly report OutOfStock.
   */
  const productSnapshot = await getDoc(
    doc(
      firestore,
      'BusinessProducts',
      id,
    ),
  );

  if (!productSnapshot.exists()) {
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
   * A product with stock_qty = 0 or is_in_stock = false
   * is still returned here so the product page can show
   * Sold Out / OutOfStock.
   */
  if (product.isActive === false) {
    return null;
  }

  return product;
}