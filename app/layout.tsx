import type { Metadata } from 'next';
import Script from 'next/script';

import './globals.css';

import { LanguageProvider } from '@/components/LanguageProvider';
import GoogleAnalyticsPageView from '@/components/GoogleAnalyticsPageView';
import NavigationLoader from '@/components/NavigationLoader';
import RouteShell from '@/components/RouteShell';

const GA_MEASUREMENT_ID = 'G-YLJ3YNCN2C';

const SITE_URL = 'https://www.spotc.in';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',
    template: '%s | SPOTC',
  },

  description:
    "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai with special offers, free gifts and fast local delivery.",

  applicationName: 'SPOTC',

  keywords: [
    'SPOTC',
    'SPOTC Karamadai',
    'kids wear Karamadai',
    'kids dress Karamadai',
    'kids clothes Karamadai',
    'toys Karamadai',
    'fancy items Karamadai',
    'earrings Karamadai',
    'hair accessories Karamadai',
    'kids accessories Karamadai',
    'kids wear Mettupalayam',
    'toys Mettupalayam',
    'online shopping Karamadai',
    'local delivery Karamadai',
    'free gifts Karamadai',
    'Teacher Colony shopping',
    'EB Colony shopping',
  ],

  authors: [
    {
      name: 'SPOTC Technologies',
    },
  ],

  creator: 'SPOTC Technologies',
  publisher: 'SPOTC Technologies',

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
    url: SITE_URL,
    siteName: 'SPOTC',

    title:
      'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai with special offers, free gifts and fast local delivery.",
  },

  twitter: {
    card: 'summary_large_image',

    title:
      'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      "Shop SPOTC's own kids wear, toys, fancy items and accessories with special offers, free gifts and fast local delivery.",
  },

  category: 'shopping',
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',

  name: 'SPOTC Technologies',

  alternateName: 'SPOTC',

  url: SITE_URL,

  description:
    "SPOTC offers its own collection of kids wear, toys, fancy items and accessories in Karamadai with special offers, free gifts and fast local delivery.",

  brand: {
    '@type': 'Brand',
    name: 'SPOTC',
  },
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',

  name: 'SPOTC',

  alternateName: 'SPOTC Technologies',

  url: SITE_URL,

  description:
    "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai.",

  publisher: {
    '@type': 'Organization',
    name: 'SPOTC Technologies',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />

        <Script
          id="google-analytics"
          strategy="afterInteractive"
        >
          {`
            window.dataLayer = window.dataLayer || [];

            function gtag(){
              dataLayer.push(arguments);
            }

            window.gtag = gtag;

            gtag('js', new Date());

            gtag(
              'config',
              '${GA_MEASUREMENT_ID}',
              {
                send_page_view: false
              }
            );
          `}
        </Script>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              organizationJsonLd,
            ).replace(/</g, '\\u003c'),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              websiteJsonLd,
            ).replace(/</g, '\\u003c'),
          }}
        />
      </head>

      <body>
        <GoogleAnalyticsPageView />

        <LanguageProvider>
          <NavigationLoader />

          <RouteShell>
            {children}
          </RouteShell>
        </LanguageProvider>
      </body>
    </html>
  );
}