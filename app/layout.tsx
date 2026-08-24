import type { Metadata } from 'next';
import Script from 'next/script';

import './globals.css';

import { LanguageProvider } from '@/components/LanguageProvider';
import GoogleAnalyticsPageView from '@/components/GoogleAnalyticsPageView';
import NavigationLoader from '@/components/NavigationLoader';
import RouteShell from '@/components/RouteShell';

const GA_MEASUREMENT_ID = 'G-YLJ3YNCN2C';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.spotc.in'),

  title: {
    default: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',
    template: '%s | SPOTC',
  },

  description:
    'Shop kids wear, toys, fancy items, accessories and local offers in Karamadai and nearby areas. Fast local delivery from SPOTC — Namma Area, Namma Kadai.',

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
    'kids wear Mettupalayam',
    'toys Mettupalayam',
    'online shopping Karamadai',
    'local delivery Karamadai',
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

  alternates: {
    canonical: '/',
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

    url: 'https://www.spotc.in',

    siteName: 'SPOTC',

    title: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      'Shop kids wear, toys, fancy items, accessories and local offers in Karamadai and nearby areas. SPOTC — Namma Area, Namma Kadai.',
  },

  twitter: {
    card: 'summary_large_image',

    title: 'SPOTC — Kids Wear, Toys & Fancy Items in Karamadai',

    description:
      'Shop kids wear, toys, fancy items and accessories locally with SPOTC.',
  },

  category: 'shopping',
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