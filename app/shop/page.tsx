import { ProductGrid } from '@/components/ProductGrid';

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