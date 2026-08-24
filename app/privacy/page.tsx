import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | SPOTC',
  description:
    'Read the SPOTC privacy policy and learn how information is collected and used when using SPOTC.',
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '48px 20px 72px',
        lineHeight: 1.7,
      }}
    >
      <h1>Privacy Policy</h1>

      <p>Last updated: August 24, 2026</p>

      <p>
        SPOTC TECHNOLOGIES respects your privacy.
        This Privacy Policy explains how information may be collected
        and used when you use SPOTC.
      </p>

      <h2>Information We Collect</h2>

      <p>
        We may collect information you provide when creating an account,
        placing an order, adding a delivery address or contacting support.
      </p>

      <p>
        This may include your name, email address, phone number,
        delivery address and information related to your orders.
      </p>

      <h2>How We Use Information</h2>

      <p>
        Information may be used to operate SPOTC, process orders,
        provide delivery, communicate with customers, provide customer
        support and improve our services.
      </p>

      <h2>Location Information</h2>

      <p>
        Location information may be used when necessary to determine
        service availability and provide local delivery.
      </p>

      <h2>Account Security</h2>

      <p>
        Users are responsible for maintaining appropriate security
        over their account and devices.
      </p>

      <h2>Account Deletion</h2>

      <p>
        Users who want to request deletion of their SPOTC account
        can use our account deletion page.
      </p>

      <p>
        <Link href="/delete-account">
          Account Deletion
        </Link>
      </p>

      <h2>Contact</h2>

      <p>
        Questions about this Privacy Policy can be submitted through
        our contact page.
      </p>

      <p>
        <Link href="/contact">
          Contact SPOTC
        </Link>
      </p>
    </main>
  );
}
