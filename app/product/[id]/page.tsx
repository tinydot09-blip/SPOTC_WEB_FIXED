import type { Metadata } from 'next';
import { cache } from 'react';

import ProductDetail from './ProductDetail';
import { getProductById } from '@/lib/data';

const SITE_URL = 'https://www.spotc.in';

type ProductPageProps = {
  params: {
    id: string;
  };
};

type ProductRecord = Record<string, unknown>;

/*
 * React cache deduplicates the product read used by generateMetadata()
 * and ProductPage() during the same server render.
 */
const getProduct = cache((id: string) => getProductById(id));

/*
 * ProductDetail is a Client Component. Firestore values such as
 * DocumentReference / Timestamp cannot be passed to it directly.
 * Convert them to plain serializable values first.
 */
function toClientValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toClientValue);
  }

  if (typeof value === 'object') {
    const candidate = value as {
      id?: unknown;
      path?: unknown;
      toDate?: () => Date;
    };

    if (typeof candidate.toDate === 'function') {
      try {
        return candidate.toDate().toISOString();
      } catch {
        return null;
      }
    }

    if (
      typeof candidate.id === 'string' &&
      typeof candidate.path === 'string'
    ) {
      return {
        id: candidate.id,
        path: candidate.path,
      };
    }

    const output: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(
      ([key, item]) => {
        if (typeof item === 'function') return;
        output[key] = toClientValue(item);
      },
    );

    return output;
  }

  return String(value);
}

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

  return `Shop ${title} from SPOTC's own collection with fast local delivery in Karamadai and nearby areas.`;
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

function getProductActualPrice(
  product: ProductRecord,
): number {
  return numberValue(
    product.mrp ??
      product.old_price ??
      product.actual_price,
  );
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

function isClothingProduct(
  product: ProductRecord,
): boolean {
  const searchable = [
    product.main_category,
    product.category,
    product.sub_category,
    product.product_type,
    product.title,
    product.product_name,
  ]
    .map((value) =>
      text(value).toLowerCase(),
    )
    .filter(Boolean)
    .join(' ');

  const clothingTerms = [
    'dress',
    'frock',
    'shirt',
    't-shirt',
    'tshirt',
    'top',
    'pant',
    'pants',
    'trouser',
    'jeans',
    'kurti',
    'kurta',
    'salwar',
    'churidar',
    'gown',
    'lehenga',
    'skirt',
    'shorts',
    'romper',
    'jumpsuit',
    'nightwear',
    'clothing',
    'kids wear',
    'boys wear',
    'girls wear',
    'girl dress',
    'boy dress',
  ];

  return clothingTerms.some(
    (term) =>
      searchable.includes(term),
  );
}

function getShippingDetails() {
  return [
    {
      '@type': 'OfferShippingDetails',

      shippingRate: {
        '@type': 'MonetaryAmount',
        value: '20.00',
        currency: 'INR',
      },

      shippingDestination: {
        '@type': 'DefinedRegion',
        addressCountry: 'IN',
        addressRegion: 'Tamil Nadu',
      },

      deliveryTime: {
        '@type': 'ShippingDeliveryTime',

        handlingTime: {
          '@type': 'QuantitativeValue',
          minValue: 0,
          maxValue: 0,
          unitCode: 'DAY',
        },

        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: 0,
          maxValue: 1,
          unitCode: 'DAY',
        },
      },
    },
  ];
}

function getMerchantReturnPolicy(
  product: ProductRecord,
) {
  const clothing =
    isClothingProduct(product);

  if (!clothing) {
    return {
      '@type':
        'MerchantReturnPolicy',

      applicableCountry:
        'IN',

      returnPolicyCategory:
        'https://schema.org/MerchantReturnNotPermitted',
    };
  }

  return {
    '@type':
      'MerchantReturnPolicy',

    applicableCountry:
      'IN',

    returnPolicyCategory:
      'https://schema.org/MerchantReturnFiniteReturnWindow',

    merchantReturnDays:
      0,

    returnFees:
      'https://schema.org/FreeReturn',
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const productId =
    params.id;

  const productUrl =
    `${SITE_URL}/product/${encodeURIComponent(
      productId,
    )}`;

  try {
    const product =
      await getProduct(productId);

    if (!product) {
      return {
        title:
          'Product Not Found',

        description:
          'This product is currently unavailable on SPOTC.',

        alternates: {
          canonical:
            productUrl,
        },

        robots: {
          index:
            false,

          follow:
            true,
        },
      };
    }

    const record =
      product as unknown as ProductRecord;

    const title =
      getProductTitle(record);

    const seoTitle =
      `${title} in Karamadai`;

    const offerPrice =
      getProductPrice(record);

    const actualPrice =
      getProductActualPrice(record);

    const description =
      actualPrice > offerPrice && offerPrice > 0
        ? `Actual Price ₹${Math.round(actualPrice)} • Offer Price ₹${Math.round(offerPrice)}`
        : offerPrice > 0
          ? `Offer Price ₹${Math.round(offerPrice)}`
          : 'Shop this product on SPOTC.';

    const image =
      getProductImage(record);

    return {
      title: seoTitle,

      description,

      alternates: {
        canonical:
          productUrl,
      },

      robots: {
        index:
          true,

        follow:
          true,

        googleBot: {
          index:
            true,

          follow:
            true,

          'max-image-preview':
            'large',

          'max-snippet':
            -1,

          'max-video-preview':
            -1,
        },
      },

      openGraph: {
        type:
          'website',

        locale:
          'en_IN',

        url:
          productUrl,

        siteName:
          'SPOTC',

        title:
          `${seoTitle} | SPOTC`,

        description,

        ...(image
          ? {
              images: [
                {
                  url:
                    image,

                  alt:
                    title,
                },
              ],
            }
          : {}),
      },

      twitter: {
        card:
          'summary_large_image',

        title:
          `${seoTitle} | SPOTC`,

        description,

        ...(image
          ? {
              images: [
                image,
              ],
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
      title:
        'Shop Product',

      description:
        "Shop SPOTC's own collection of kids wear, toys, fancy items and accessories in Karamadai.",

      alternates: {
        canonical:
          productUrl,
      },
    };
  }
}

export default async function ProductPage({
  params,
}: ProductPageProps) {
  const productId =
    params.id;

  let productJsonLd:
    | Record<string, unknown>
    | null = null;

  let breadcrumbJsonLd:
    | Record<string, unknown>
    | null = null;

  let initialProduct: import('@/lib/types').BusinessProduct | null = null;

  try {
    const product =
      await getProduct(productId);

    initialProduct = product;

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

      const shippingDetails =
        getShippingDetails();

      const merchantReturnPolicy =
        getMerchantReturnPolicy(
          record,
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
              image: [
                image,
              ],
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

                shippingDetails,

                hasMerchantReturnPolicy:
                  merchantReturnPolicy,
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

      <ProductDetail
        initialProduct={
          toClientValue(initialProduct) as import('@/lib/types').BusinessProduct | null
        }
      />
    </>
  );
}