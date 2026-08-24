import type { MetadataRoute } from 'next';

import { getProducts } from '@/lib/data';

const BASE_URL = 'https://www.spotc.in';

function sitemapDate(value: unknown): Date {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return new Date();
    }
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/shop`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/offers`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    
  ];

  try {
    const products = await getProducts();

    const productPages: MetadataRoute.Sitemap = products.map((product) => {
      const record = product as typeof product & Record<string, unknown>;

      return {
        url: `${BASE_URL}/product/${encodeURIComponent(String(product.id))}`,

        lastModified: sitemapDate(
          record.updated_at ??
            record.updatedAt ??
            record.created_at ??
            record.createdAt,
        ),

        changeFrequency: 'daily' as const,

        priority: 0.8,
      };
    });

    return [...staticPages, ...productPages];
  } catch (error) {
    console.error('Failed to load products for sitemap:', error);

    // Keep sitemap working even if Firebase is temporarily unavailable.
    return staticPages;
  }
}