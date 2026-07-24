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

      {/*
       * Real document-flow spacing between the final product
       * row and FooterWrapper. This does not collapse and is
       * not affected by footer margin rules.
       */}
      <div
        className="shop-footer-gap"
        aria-hidden="true"
      />

      <style jsx>{`
        .shop-footer-gap {
          width: 100%;
          height: 32px;
          min-height: 32px;
          flex: 0 0 32px;
          display: block;
          background: #f8f6f1;
        }

        @media (min-width: 761px) {
          .shop-footer-gap {
            height: 50px;
            min-height: 50px;
            flex-basis: 50px;
          }
        }
      `}</style>
    </main>
  );
}