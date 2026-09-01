import type { Metadata } from 'next';

import { ProductGrid } from '@/components/ProductGrid';
import ShareCampaignBar from '@/components/ShareCampaignBar';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai',

  description:
    'Shop kids wear, girls dresses, boys wear, toys, earrings, gifts, hair accessories and fancy items online in Karamadai. Local delivery available from SPOTC.',

  alternates: {
    canonical: '/shop',
  },

  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.spotc.in/shop',
    siteName: 'SPOTC',

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys, gifts, earrings and fancy items online in Karamadai with convenient local delivery.',
  },

  twitter: {
    card: 'summary_large_image',

    title:
      'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      'Shop kids wear, toys, gifts, earrings and fancy items online in Karamadai.',
  },
};

const shopJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',

  name: 'Kids Wear, Toys & Fancy Items in Karamadai',

  url: 'https://www.spotc.in/shop',

  description:
    'Shop kids wear, toys, earrings, gifts, hair accessories and fancy items online in Karamadai.',

  isPartOf: {
    '@type': 'WebSite',
    name: 'SPOTC',
    url: 'https://www.spotc.in',
  },

  about: [
    {
      '@type': 'Thing',
      name: 'Kids Wear',
    },
    {
      '@type': 'Thing',
      name: 'Toys',
    },
    {
      '@type': 'Thing',
      name: 'Fancy Items',
    },
    {
      '@type': 'Thing',
      name: 'Gifts',
    },
    {
      '@type': 'Thing',
      name: 'Earrings',
    },
    {
      '@type': 'Thing',
      name: 'Hair Accessories',
    },
  ],
};

export default function ShopPage() {
  return (
    <main className="page shop-page">
      <h1
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Kids Wear, Toys & Fancy Items in Karamadai
      </h1>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(shopJsonLd).replace(
            /</g,
            '\\u003c',
          ),
        }}
      />

      <ShareCampaignBar />

      <ProductGrid />

      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '28px',
          minHeight: '28px',
        }}
      />

      <section
        style={{
          position: 'relative',
          left: '50%',
          marginLeft: '-50vw',
          width: '100vw',
          backgroundColor: '#f8f6f1',
          boxSizing: 'border-box',
          padding: '30px 0 36px',
        }}
      >
        <div
          style={{
            width: '100%',
            paddingLeft: 'clamp(20px, 12.8vw, 245px)',
            paddingRight: 'clamp(20px, 12.8vw, 245px)',
            boxSizing: 'border-box',
          }}
        >
          <h2
            style={{
              margin: '0 0 14px',
              fontSize: 'clamp(22px, 3vw, 30px)',
              lineHeight: 1.2,
              fontWeight: 800,
              color: '#111',
            }}
          >
            Shop Kids Wear, Toys & Fancy Items in Karamadai
          </h2>

          <p
            style={{
              margin: 0,
              width: '100%',
              fontSize: '16px',
              lineHeight: 1.7,
              color: '#333',
            }}
          >
            Shop kids wear, girls dresses, boys wear, toys,
            earrings, hair accessories, keychains, gifts and
            fancy items online at SPOTC in Karamadai.
            Discover kids party dresses, girls frocks, casual
            wear, toys and accessories with special offers
            and free gifts on eligible orders.
          </p>

          <p
            style={{
              margin: '14px 0 0',
              width: '100%',
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#555',
            }}
          >
            Looking for a kids wear shop, toy shop, gift shop
            or fancy items in Karamadai? Browse SPOTC online
            for products available for local delivery in
            Karamadai, Teacher Colony, EB Colony and nearby
            areas.
          </p>

          <p
            style={{
              margin: '14px 0 0',
              width: '100%',
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#555',
            }}
          >
            SPOTC also serves shoppers looking for kids wear,
            toys and accessories around Mettupalayam.
            Delivery times and availability depend on the
            customer's location and selected products.
          </p>
        </div>
      </section>
    </main>
  );
}
