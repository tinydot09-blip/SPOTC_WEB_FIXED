import type { Metadata } from 'next';

import { OfferFeed } from '@/components/OfferFeed';

export const metadata: Metadata = {
  title: 'Local Offers & Deals in Karamadai | SPOTC',

  description:
    'Discover local offers, deals, kids wear, toys, fancy items and accessories on SPOTC with fast local delivery in Karamadai and nearby areas.',

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
    title: 'Local Offers & Deals in Karamadai | SPOTC',
    description:
      'Discover local offers, deals, kids wear, toys, fancy items and accessories with fast local delivery.',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Local Offers & Deals in Karamadai | SPOTC',
    description:
      'Discover local offers and deals from SPOTC with fast local delivery.',
  },
};

export default function OffersPage() {
  return (
    <main className="offers-page">
      <OfferFeed />
    </main>
  );
}