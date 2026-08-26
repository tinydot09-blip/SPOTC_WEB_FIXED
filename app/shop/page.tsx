import type { Metadata } from 'next';
import { ProductGrid } from '@/components/ProductGrid';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai',
  description:
    'Shop kids wear, girls dresses, boys wear, toys, earrings, hair accessories and fancy items in Karamadai and Mettupalayam with offers, free gifts and fast local delivery.',
  alternates: {
    canonical: 'https://www.spotc.in/shop',
  },
};

export default function ShopPage() {
  return (
    <main className="page shop-page">
      <section
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '18px 16px 8px',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 'clamp(24px, 4vw, 34px)',
          }}
        >
          Kids Wear, Toys & Fancy Items in Karamadai
        </h1>

        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Shop SPOTC&apos;s collection of kids wear, girls dresses,
          boys wear, toys, earrings, hair accessories, keychains and
          fancy items in Karamadai and Mettupalayam.
        </p>
      </section>

      <ProductGrid />

      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '32px',
          backgroundColor: '#f8f6f1',
        }}
      />
    </main>
  );
}