import type { Metadata } from 'next';

import ProductDetail from './ProductDetail';
import { getProductById } from '@/lib/data';

const SITE_URL = 'https://www.spotc.in';

type ProductPageProps = {
  params: {
    id: string;
  };
};

type ProductRecord = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(
    String(value ?? '')
      .replace(/[₹,%]/g, '')
      .trim(),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getProductTitle(
  product: ProductRecord,
): string {
  return (
    text(product.title) ||
    text(product.product_name) ||
    text(product.name) ||
    'Shop Product'
  );
}

function getProductDescription(
  product: ProductRecord,
): string {
  const description =
    text(product.description) ||
    text(product.product_description) ||
    text(product.highlights) ||
    text(product.features);

  if (description) {
    return description.slice(0, 160);
  }

  const title =
    getProductTitle(product);

  return `Shop ${title} from SPOTC with fast local delivery in Karamadai and nearby areas.`;
}

function getProductImage(
  product: ProductRecord,
): string {
  const directImage =
    text(product.product_thumbnail) ||
    text(product.studio_image_url) ||
    text(product.image_url) ||
    text(product.product_image) ||
    text(product.image);

  if (directImage.startsWith('http')) {
    return directImage;
  }

  if (Array.isArray(product.images)) {
    const firstImage =
      product.images.find(
        (item) =>
          typeof item === 'string' &&
          item.startsWith('http'),
      );

    if (
      typeof firstImage === 'string'
    ) {
      return firstImage;
    }
  }

  return '';
}

function getProductPrice(
  product: ProductRecord,
): number {
  const offerPrice =
    numberValue(product.offer_price);

  const sellingPrice =
    numberValue(product.selling_price);

  const price =
    numberValue(product.price);

  const mrp =
    numberValue(
      product.mrp ??
        product.old_price,
    );

  if (offerPrice > 0) {
    return offerPrice;
  }

  if (sellingPrice > 0) {
    return sellingPrice;
  }

  if (price > 0) {
    return price;
  }

  return mrp;
}

function productInStock(
  product: ProductRecord,
): boolean {
  if (
    product.is_in_stock === false
  ) {
    return false;
  }

  const stockValue =
    product.stock_qty ??
    product.stock_quantity;

  if (
    stockValue !== undefined &&
    stockValue !== null &&
    numberValue(stockValue) <= 0
  ) {
    return false;
  }

  return true;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const productId = params.id;

  const productUrl =
    `${SITE_URL}/product/${encodeURIComponent(
      productId,
    )}`;

  try {
    const product =
      await getProductById(productId);

    if (!product) {
      return {
        title: 'Product Not Found',

        description:
          'This product is currently unavailable on SPOTC.',

        alternates: {
          canonical: productUrl,
        },

        robots: {
          index: false,
          follow: true,
        },
      };
    }

    const record =
      product as unknown as ProductRecord;

    const title =
      getProductTitle(record);

    const description =
      getProductDescription(record);

    const image =
      getProductImage(record);

    return {
      title,

      description,

      alternates: {
        canonical: productUrl,
      },

      robots: {
        index: true,
        follow: true,

        googleBot: {
          index: true,
          follow: true,
          'max-image-preview':
            'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        },
      },

      openGraph: {
        type: 'website',
        locale: 'en_IN',
        url: productUrl,
        siteName: 'SPOTC',

        title:
          `${title} | SPOTC`,

        description,

        ...(image
          ? {
              images: [
                {
                  url: image,
                  alt: title,
                },
              ],
            }
          : {}),
      },

      twitter: {
        card:
          'summary_large_image',

        title:
          `${title} | SPOTC`,

        description,

        ...(image
          ? {
              images: [image],
            }
          : {}),
      },
    };
  } catch (error) {
    console.error(
      'Failed to generate product metadata:',
      error,
    );

    return {
      title: 'Shop Product',

      description:
        'Shop kids wear, toys, fancy items and accessories from SPOTC.',

      alternates: {
        canonical: productUrl,
      },
    };
  }
}

export default async function ProductPage({
  params,
}: ProductPageProps) {
  const productId = params.id;

  let productJsonLd:
    | Record<string, unknown>
    | null = null;

  let breadcrumbJsonLd:
    | Record<string, unknown>
    | null = null;

  try {
    const product =
      await getProductById(productId);

    if (product) {
      const record =
        product as unknown as ProductRecord;

      const title =
        getProductTitle(record);

      const description =
        getProductDescription(record);

      const image =
        getProductImage(record);

      const price =
        getProductPrice(record);

      const inStock =
        productInStock(record);

      const productUrl =
        `${SITE_URL}/product/${encodeURIComponent(
          productId,
        )}`;

      const brand =
        text(record.brand) ||
        'SPOTC';

      const category =
        text(
          record.main_category ||
            record.category ||
            record.sub_category,
        );

      productJsonLd = {
        '@context':
          'https://schema.org',

        '@type':
          'Product',

        name:
          title,

        description,

        ...(image
          ? {
              image: [image],
            }
          : {}),

        sku:
          String(productId),

        ...(category
          ? {
              category,
            }
          : {}),

        brand: {
          '@type':
            'Brand',

          name:
            brand,
        },

        url:
          productUrl,

        ...(price > 0
          ? {
              offers: {
                '@type':
                  'Offer',

                url:
                  productUrl,

                priceCurrency:
                  'INR',

                price:
                  price.toFixed(2),

                availability:
                  inStock
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',

                itemCondition:
                  'https://schema.org/NewCondition',

                seller: {
                  '@type':
                    'Organization',

                  name:
                    'SPOTC Technologies',

                  url:
                    SITE_URL,
                },
              },
            }
          : {}),
      };

      breadcrumbJsonLd = {
        '@context':
          'https://schema.org',

        '@type':
          'BreadcrumbList',

        itemListElement: [
          {
            '@type':
              'ListItem',

            position:
              1,

            name:
              'SPOTC',

            item:
              `${SITE_URL}/offers`,
          },

          {
            '@type':
              'ListItem',

            position:
              2,

            name:
              'Shop',

            item:
              `${SITE_URL}/shop`,
          },

          {
            '@type':
              'ListItem',

            position:
              3,

            name:
              title,

            item:
              productUrl,
          },
        ],
      };
    }
  } catch (error) {
    console.error(
      'Failed to generate product structured data:',
      error,
    );
  }

  return (
    <>
      {productJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html:
              JSON.stringify(
                productJsonLd,
              ).replace(
                /</g,
                '\\u003c',
              ),
          }}
        />
      ) : null}

      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html:
              JSON.stringify(
                breadcrumbJsonLd,
              ).replace(
                /</g,
                '\\u003c',
              ),
          }}
        />
      ) : null}

      <ProductDetail />
    </>
  );
}