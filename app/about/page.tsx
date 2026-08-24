import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About SPOTC | Local Shopping in Karamadai',
  description:
    'Learn about SPOTC, a local online shopping platform serving Karamadai and nearby areas in Coimbatore.',
};

export default function AboutPage() {
  return (
    <main
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '48px 20px 72px',
        lineHeight: 1.7,
      }}
    >
      <h1
        style={{
          fontSize: '32px',
          marginBottom: '20px',
        }}
      >
        About SPOTC
      </h1>

      <p>
        SPOTC is a local online shopping platform focused on making
        everyday shopping convenient for customers in Karamadai,
        Coimbatore and nearby areas.
      </p>

      <p>
        Customers can discover products online, view offers and order
        products for local delivery.
      </p>

      <h2 style={{ marginTop: '32px' }}>
        What We Sell
      </h2>

      <p>
        Our collection includes kids wear, toys, fancy items,
        fashion accessories and other selected products.
      </p>

      <h2 style={{ marginTop: '32px' }}>
        Local Delivery
      </h2>

      <p>
        SPOTC focuses on local delivery so customers can conveniently
        shop for products available in their area.
      </p>

      <h2 style={{ marginTop: '32px' }}>
        Our Company
      </h2>

      <p>
        SPOTC is operated by SPOTC TECHNOLOGIES PRIVATE LIMITED.
      </p>

      <p style={{ marginTop: '40px' }}>
        <Link href="/shop">
          Shop on SPOTC
        </Link>
      </p>
    </main>
  );
}