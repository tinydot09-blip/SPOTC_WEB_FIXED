import type { Metadata } from 'next';

import { ProductGrid } from '@/components/ProductGrid';

export const metadata: Metadata = {
  title: 'Shop Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

  description:
    'Shop kids wear, toys, fancy items, accessories and more from SPOTC with fast local delivery in Karamadai and nearby areas.',

  alternates: {
    canonical: 'https://www.spotc.in/shop',
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.spotc.in/shop',
    siteName: 'SPOTC',
    title: 'Shop Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',
    description:
      'Shop kids wear, toys, fancy items and accessories from SPOTC with fast local delivery.',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Shop Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',
    description:
      'Shop kids wear, toys, fancy items and accessories from SPOTC.',
  },
};

export default function ShopPage() {
  return (
    <main className="page shop-page">
      <ProductGrid />

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