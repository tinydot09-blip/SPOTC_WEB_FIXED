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
    'Shop kids wear, toys, earrings, hair accessories, gifts and fancy items online in Karamadai at SPOTC. Local delivery available in Karamadai and nearby areas.',

  alternates: {
    canonical: '/',
  },

  applicationName: 'SPOTC',

  // Fine to keep, but Google does not rely heavily on meta keywords.
  keywords: [
    'SPOTC',
    'SPOTC Karamadai',
    'kids wear in Karamadai',
    'kids dress in Karamadai',
    'kids clothing in Karamadai',
    'toy shop in Karamadai',
    'toys in Karamadai',
    'gift shop in Karamadai',
    'fancy items in Karamadai',
    'earrings in Karamadai',
    'hair accessories in Karamadai',
    'kids accessories Karamadai',
    'kids wear Mettupalayam',
    'toys Mettupalayam',
    'online shopping Karamadai',
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

    title: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      'Shop kids wear, toys, earrings, gifts and fancy items online in Karamadai with local delivery from SPOTC.',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      'Shop kids wear, toys, earrings, gifts and fancy items online in Karamadai with local delivery.',
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
    'SPOTC is an online shopping service offering kids wear, toys, earrings, hair accessories, gifts and fancy items in Karamadai.',

  brand: {
    '@type': 'Brand',
    name: 'SPOTC',
  },

  areaServed: [
    {
      '@type': 'Place',
      name: 'Karamadai',
    },
    {
      '@type': 'Place',
      name: 'Mettupalayam',
    },
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',

  name: 'SPOTC',
  alternateName: 'SPOTC.in',

  url: SITE_URL,

  description:
    'Shop kids wear, toys, gifts, earrings, hair accessories and fancy items online in Karamadai.',

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