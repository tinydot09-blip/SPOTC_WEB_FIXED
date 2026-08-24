import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact & Support | SPOTC',
  description:
    'Contact SPOTC for order, delivery, payment and shopping support in Karamadai, Coimbatore.',
};

export default function ContactPage({
  searchParams,
}: {
  searchParams?: {
    type?: string;
  };
}) {
  const support =
    searchParams?.type === 'support';

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
          marginBottom: '12px',
        }}
      >
        {support
          ? 'Help & Support'
          : 'Contact SPOTC'}
      </h1>

      <p>
        {support
          ? 'Need help with an order, delivery, payment or product? We are here to help.'
          : 'Have a question about SPOTC, your order or delivery? Contact our support team.'}
      </p>

      <section style={{ marginTop: '32px' }}>
        <h2>Customer Support</h2>

        <p>
          For order status, delivery questions,
          product issues or payment support,
          please contact SPOTC and include your
          order number when available.
        </p>
      </section>

      <section style={{ marginTop: '32px' }}>
        <h2>Service Area</h2>

        <p>
          SPOTC currently provides local shopping
          and delivery services in Karamadai,
          Coimbatore and supported nearby areas.
        </p>
      </section>

      <section style={{ marginTop: '32px' }}>
        <h2>Need help with an order?</h2>

        <p>
          You can also check your existing orders
          from your SPOTC account.
        </p>

        <Link href="/orders">
          View My Orders
        </Link>
      </section>

      <p style={{ marginTop: '40px' }}>
        <Link href="/shop">
          Continue Shopping
        </Link>
      </p>
    </main>
  );
}