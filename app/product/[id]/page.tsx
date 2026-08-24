import type { Metadata } from 'next';

import ProductDetail from './ProductDetail';

const SITE_URL = 'https://www.spotc.in';

type ProductPageProps = {
  params: {
    id: string;
  };
};

export function generateMetadata({
  params,
}: ProductPageProps): Metadata {
  const productId = params.id;
  const productUrl = `${SITE_URL}/product/${encodeURIComponent(productId)}`;

  return {
    title: 'Shop Product',

    description:
      'Shop this product from SPOTC. Explore kids wear, toys, fancy items and accessories with fast local delivery in Karamadai and nearby areas.',

    alternates: {
      canonical: productUrl,
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
      url: productUrl,
      siteName: 'SPOTC',
      title: 'Shop Product | SPOTC',
      description:
        'Shop this product from SPOTC with fast local delivery in Karamadai and nearby areas.',
    },

    twitter: {
      card: 'summary_large_image',
      title: 'Shop Product | SPOTC',
      description:
        'Shop this product from SPOTC with fast local delivery.',
    },
  };
}

export default function ProductPage() {
  return <ProductDetail />;
}