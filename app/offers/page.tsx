import type { Metadata } from 'next';

import { OfferFeed } from '@/components/OfferFeed';

export const metadata: Metadata = {
  title: 'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

  description:
    "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai. Enjoy special offers, free gifts and fast local delivery.",

  alternates: {
    canonical: 'https://www.spotc.in/offers',
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.spotc.in/offers',
    siteName: 'SPOTC',

    title: 'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai with special offers, free gifts and fast local delivery.",
  },

  twitter: {
    card: 'summary_large_image',

    title: 'Kids Wear, Toys & Fancy Items in Karamadai | SPOTC',

    description:
      "Shop SPOTC's own kids wear, toys, fancy items and accessories in Karamadai with special offers, free gifts and fast local delivery.",
  },
};

export default function OffersPage() {
  return (
    <main className="offers-page">
      <OfferFeed />
    </main>
  );
}