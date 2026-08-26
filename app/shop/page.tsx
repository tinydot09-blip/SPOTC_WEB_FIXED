import type { Metadata } from 'next';

import { ProductGrid } from '@/components/ProductGrid';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai',

  description:
    'Shop kids wear, girls dresses, boys wear, toys, earrings, hair accessories and fancy items at SPOTC in Karamadai and Mettupalayam. Special offers, free gifts and fast local delivery.',

  alternates: {
    canonical: 'https://www.spotc.in/shop',
  },

  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.spotc.in/shop',
    siteName: 'SPOTC',
    title: 'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',
    description:
      'Shop kids wear, toys and fancy items in Karamadai and Mettupalayam with special offers, free gifts and fast local delivery.',
  },
};

export default function ShopPage() {
  return (
    <main className="page shop-page">
      {/* PRODUCTS FIRST */}
      <ProductGrid />

      {/* SEO CONTENT - BEFORE FOOTER */}
      <section
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '28px 16px 24px',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 'clamp(22px, 3vw, 30px)',
            lineHeight: 1.2,
          }}
        >
          Kids Wear, Toys & Fancy Items in Karamadai
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: '900px',
            lineHeight: 1.6,
          }}
        >
          Shop SPOTC&apos;s collection of kids wear, girls dresses,
          boys wear, toys, earrings, hair accessories, keychains and
          fancy items in Karamadai and Mettupalayam. Discover special
          offers, free gifts and fast local delivery.
        </p>
      </section>

      {/* BOTTOM SPACE BEFORE FOOTER */}
      <div
        aria-hidden="true"
        style={{
          display: 'block',
          width: '100%',
          height: '32px',
          minHeight: '32px',
          flexShrink: 0,
          backgroundColor: '#f8f6f1',
        }}
      >
        &nbsp;
      </div>
    </main>
  );
}