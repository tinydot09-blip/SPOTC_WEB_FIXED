import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';

import { ProductGrid } from '@/components/ProductGrid';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BusinessProduct } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai',

  description:
    'Shop kids wear, girls dresses, boys wear, toys, earrings, gifts, hair accessories and fancy items online in Karamadai. Local delivery available from SPOTC.',

  alternates: {
    canonical: '/shop',
  },

  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.spotc.in/shop',
    siteName: 'SPOTC',

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys, gifts, earrings and fancy items online in Karamadai with convenient local delivery.',
  },

  twitter: {
    card: 'summary_large_image',

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys, gifts, earrings and fancy items online in Karamadai.',
  },
};

const shopJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',

  name: 'Kids Wear, Toys & Fancy Items in Karamadai',

  url: 'https://www.spotc.in/shop',

  description:
    'Shop kids wear, toys, earrings, gifts, hair accessories and fancy items online in Karamadai.',

  isPartOf: {
    '@type': 'WebSite',
    name: 'SPOTC',
    url: 'https://www.spotc.in',
  },

  about: [
    {
      '@type': 'Thing',
      name: 'Kids Wear',
    },
    {
      '@type': 'Thing',
      name: 'Toys',
    },
    {
      '@type': 'Thing',
      name: 'Fancy Items',
    },
    {
      '@type': 'Thing',
      name: 'Gifts',
    },
    {
      '@type': 'Thing',
      name: 'Earrings',
    },
    {
      '@type': 'Thing',
      name: 'Hair Accessories',
    },
  ],
};

/*
 * Firebase Admin values such as Timestamp, GeoPoint and DocumentReference
 * cannot be passed directly from a Server Component into ProductGrid.
 * This converts only the small initial product batch into plain JSON-safe
 * values. The normal browser-side getProducts() call still loads the full
 * catalogue after hydration.
 */
function toSerializable(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown> & {
      toDate?: () => Date;
      path?: string;
      latitude?: number;
      longitude?: number;
    };

    // Firestore Timestamp
    if (typeof record.toDate === 'function') {
      try {
        return record.toDate().toISOString();
      } catch {
        // Continue with the plain-object fallback below.
      }
    }

    // Firestore DocumentReference
    if (typeof record.path === 'string' && record.path) {
      return record.path;
    }

    // Firestore GeoPoint
    if (
      typeof record.latitude === 'number' &&
      typeof record.longitude === 'number'
    ) {
      return {
        latitude: record.latitude,
        longitude: record.longitude,
      };
    }

    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record)) {
      if (typeof item === 'function' || item === undefined) continue;
      output[key] = toSerializable(item);
    }

    return output;
  }

  return String(value);
}

function isAvailableProduct(product: Record<string, unknown>): boolean {
  if (product.isActive === false || product.is_active === false) {
    return false;
  }

  if (product.is_in_stock === false) {
    return false;
  }

  const rawStock = product.stock_qty ?? product.stock_quantity;

  if (rawStock !== undefined && rawStock !== null && rawStock !== '') {
    const stock = Number(rawStock);

    if (Number.isFinite(stock) && stock <= 0) {
      return false;
    }
  }

  return true;
}

/*
 * Keep this first payload deliberately small.
 * We try Girl Dress first because it is the default /shop category.
 * If older records do not use main_category consistently, the fallback
 * query fills the batch from the normal BusinessProducts collection.
 */
const getInitialShopProducts = unstable_cache(
  async (): Promise<BusinessProduct[]> => {
    const db = getAdminDb();
    const productsById = new Map<string, BusinessProduct>();

    try {
      const dressSnapshot = await db
        .collection('BusinessProducts')
        .where('main_category', 'in', [
          'Girl Dress',
          'Girls Dress',
          'Kids Wear',
        ])
        .limit(16)
        .get();

      for (const item of dressSnapshot.docs) {
        const raw = {
          id: item.id,
          ...item.data(),
        } as Record<string, unknown>;

        if (!isAvailableProduct(raw)) continue;

        productsById.set(
          item.id,
          toSerializable(raw) as BusinessProduct,
        );
      }
    } catch (error) {
      console.error('Initial Girl Dress query failed:', error);
    }

    if (productsById.size < 12) {
      const fallbackSnapshot = await db
        .collection('BusinessProducts')
        .limit(40)
        .get();

      for (const item of fallbackSnapshot.docs) {
        if (productsById.size >= 16) break;

        const raw = {
          id: item.id,
          ...item.data(),
        } as Record<string, unknown>;

        if (!isAvailableProduct(raw)) continue;

        productsById.set(
          item.id,
          toSerializable(raw) as BusinessProduct,
        );
      }
    }

    return Array.from(productsById.values()).slice(0, 16);
  },
  ['spotc-shop-initial-products-v1'],
  {
    revalidate: 60,
  },
);

export default async function ShopPage() {
  let initialProducts: BusinessProduct[] = [];

  try {
    initialProducts = await getInitialShopProducts();
  } catch (error) {
    /*
     * Fail safely. If Firebase Admin is temporarily unavailable, ProductGrid
     * falls back to its existing client-side Firebase loading path.
     */
    console.error('Initial shop product load failed:', error);
  }

  return (
    <main className="page shop-page">
      <h1
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Kids Wear, Toys & Fancy Items in Karamadai
      </h1>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(shopJsonLd).replace(
            /</g,
            '\\u003c',
          ),
        }}
      />

      <ProductGrid initialProducts={initialProducts} />

      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '28px',
          minHeight: '28px',
        }}
      />

      <section
        style={{
          position: 'relative',
          left: '50%',
          marginLeft: '-50vw',
          width: '100vw',
          backgroundColor: '#f8f6f1',
          boxSizing: 'border-box',
          padding: '30px 0 36px',
        }}
      >
        <div
          style={{
            width: '100%',
            paddingLeft: 'clamp(20px, 12.8vw, 245px)',
            paddingRight: 'clamp(20px, 12.8vw, 245px)',
            boxSizing: 'border-box',
          }}
        >
          <h2
            style={{
              margin: '0 0 14px',
              fontSize: 'clamp(22px, 3vw, 30px)',
              lineHeight: 1.2,
              fontWeight: 800,
              color: '#111',
            }}
          >
            Shop Kids Wear, Toys & Fancy Items in Karamadai
          </h2>

          <p
            style={{
              margin: 0,
              width: '100%',
              fontSize: '16px',
              lineHeight: 1.7,
              color: '#333',
            }}
          >
            Shop kids wear, girls dresses, boys wear, toys,
            earrings, hair accessories, keychains, gifts and
            fancy items online at SPOTC in Karamadai.
            Discover kids party dresses, girls frocks, casual
            wear, toys and accessories with special offers
            and free gifts on eligible orders.
          </p>

          <p
            style={{
              margin: '14px 0 0',
              width: '100%',
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#555',
            }}
          >
            Looking for a kids wear shop, toy shop, gift shop
            or fancy items in Karamadai? Browse SPOTC online
            for products available for local delivery in
            Karamadai, Teacher Colony, EB Colony and nearby
            areas.
          </p>

          <p
            style={{
              margin: '14px 0 0',
              width: '100%',
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#555',
            }}
          >
            SPOTC also serves shoppers looking for kids wear,
            toys and accessories around Mettupalayam.
            Delivery times and availability depend on the
            customer's location and selected products.
          </p>
        </div>
      </section>
    </main>
  );
}
