import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms & Conditions | SPOTC',
  description:
    'Read the terms and conditions for shopping and using SPOTC.',
};

export default function TermsPage() {
  return (
    <main
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '48px 20px 72px',
        lineHeight: 1.7,
      }}
    >
      <h1>Terms & Conditions</h1>

      <p>Last updated: August 24, 2026</p>

      <p>
        These Terms & Conditions apply when you access or use SPOTC
        services provided by SPOTC TECHNOLOGIES PRIVATE LIMITED.
      </p>

      <h2>Products</h2>

      <p>
        Product availability, colours, sizes, prices and offers may vary
        depending on current inventory.
      </p>

      <h2>Orders</h2>

      <p>
        An order is subject to product availability and successful
        confirmation by SPOTC.
      </p>

      <h2>Pricing</h2>

      <p>
        Product prices and applicable delivery charges are displayed
        before an order is confirmed. Prices and promotional offers may
        change from time to time.
      </p>

      <h2>Delivery</h2>

      <p>
        Delivery availability and estimated delivery time depend on the
        customer&apos;s location, product availability and the delivery
        option selected during checkout.
      </p>

      <h2>Returns & Exchanges</h2>

      <p>
        Return or exchange eligibility depends on the product category
        and the policy displayed for that product or order.
      </p>

      <h2>Free Gifts & Offers</h2>

      <p>
        Promotional gifts and special offers are subject to eligibility,
        availability and the conditions shown at the time of purchase.
      </p>

      <h2>Acceptable Use</h2>

      <p>
        Users must not misuse SPOTC, attempt to interfere with the
        service or use the platform for unlawful activities.
      </p>

      <h2>Contact</h2>

      <p>
        For questions about these terms or an order, contact SPOTC.
      </p>

      <p>
        <Link href="/contact">
          Contact SPOTC
        </Link>
      </p>
    </main>
  );
}