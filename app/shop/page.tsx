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

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys and fancy items in Karamadai and Mettupalayam with special offers, free gifts and fast local delivery.',
  },

  twitter: {
    card: 'summary_large_image',

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys and fancy items in Karamadai and Mettupalayam with special offers, free gifts and fast local delivery.',
  },
};

export default function ShopPage() {
  return (
    <main className="page shop-page">
      {/* EXISTING PRODUCT GRID */}
      <ProductGrid />

      {/* FULL WIDTH SEO SECTION */}
      <section
        style={{
          position: 'relative',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          width: '100vw',
          backgroundColor: '#f8f6f1',
          boxSizing: 'border-box',
          padding: '26px 0 34px',
        }}
      >
        {/* SAME CONTENT WIDTH / ALIGNMENT AS SITE */}
        <div
          style={{
            width: '100%',
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '0 20px',
            boxSizing: 'border-box',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              fontSize: 'clamp(22px, 3vw, 30px)',
              lineHeight: 1.2,
              fontWeight: 800,
              color: '#111',
            }}
          >
            Kids Wear, Toys & Fancy Items in Karamadai
          </h2>

          <p
            style={{
              width: '100%',
              margin: 0,
              fontSize: '16px',
              lineHeight: 1.7,
              color: '#333',
            }}
          >
            Shop kids wear, girls dresses, boys wear, toys,
            earrings, hair accessories, keychains and fancy
            items at SPOTC in Karamadai and Mettupalayam.
            Find kids party dresses, girls frocks, casual
            wear, toys and accessories with special offers,
            free gifts and fast local 15 minutes delivery in
            Karamadai, Teacher Colony, EB Colony and nearby
            areas.
          </p>

          <p
            style={{
              width: '100%',
              margin: '12px 0 0',
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#555',
            }}
          >
            Looking for kids dress shops in Karamadai,
            toys near Mettupalayam or fancy items near you?
            Browse SPOTC products online and discover local
            deals available for nearby 15 minutes delivery.
          </p>
        </div>
      </section>
    </main>
  );
}