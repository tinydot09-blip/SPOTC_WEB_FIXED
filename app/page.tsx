import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai',

  description:
    'Shop kids wear, girls dresses, boys wear, toys, earrings, hair accessories and fancy items from SPOTC in Karamadai and Mettupalayam. Special offers, free gifts and fast local delivery.',

  alternates: {
    canonical: 'https://www.spotc.in/',
  },
};

export default function Home() {
  return (
    <main
      style={{
        minHeight: 'calc(100vh - 120px)',
        background: '#f8f6f1',
      }}
    >
      <section
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '56px 20px 48px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          SPOTC • Karamadai
        </p>

        <h1
          style={{
            margin: '0 auto',
            maxWidth: '800px',
            fontSize: 'clamp(30px, 5vw, 52px)',
            lineHeight: 1.1,
            fontWeight: 800,
          }}
        >
          Kids Wear, Toys & Fancy Items in Karamadai
        </h1>

        <p
          style={{
            maxWidth: '760px',
            margin: '20px auto 0',
            fontSize: '17px',
            lineHeight: 1.7,
          }}
        >
          Shop kids wear, girls dresses, boys wear, toys,
          earrings, hair accessories, keychains and fancy
          items from SPOTC in Karamadai and Mettupalayam.
          Discover special offers, free gifts and fast
          local delivery.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginTop: '28px',
          }}
        >
          <Link
            href="/offers"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '150px',
              padding: '13px 22px',
              borderRadius: '10px',
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            View Offers
          </Link>

          <Link
            href="/shop"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '150px',
              padding: '13px 22px',
              borderRadius: '10px',
              border: '1px solid #111',
              color: '#111',
              textDecoration: 'none',
              fontWeight: 700,
              background: '#fff',
            }}
          >
            Shop Now
          </Link>
        </div>

        <div
          style={{
            marginTop: '42px',
            paddingTop: '28px',
            borderTop: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '28px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <span>🎁 Free Gifts</span>
          <span>🚚 Fast Local Delivery</span>
          <span>📍 Karamadai & Nearby</span>
        </div>
      </section>
    </main>
  );
}