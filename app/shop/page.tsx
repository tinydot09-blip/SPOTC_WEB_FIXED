import { ProductGrid } from '@/components/ProductGrid';

export default function ShopPage() {
  return (
    <main className="page shop-page">
      <section className="hero shop-hero">
        <p className="eyebrow">
          CURATED NEAR YOU
        </p>

        <h1>Shop Near by. Find more.</h1>

        <p>
          Real products from nearby businesses, ready to discover.
        </p>
      </section>

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