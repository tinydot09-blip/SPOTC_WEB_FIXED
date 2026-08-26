import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Kids Wear, Toys & Fancy Items in Karamadai</h1>

      <p>
        Shop kids wear, girls dresses, boys wear, toys, earrings,
        hair accessories, keychains and fancy items from SPOTC in
        Karamadai and Mettupalayam. Special offers, free gifts and
        fast local delivery.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Link href="/shop">Shop Now</Link>
        <Link href="/offers">View Offers</Link>
      </div>
    </main>
  );
}