export const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();

export const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const slugify = (value: unknown): string =>
  text(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'business';

export const imageOf = (
  p: Record<string, unknown>,
): string =>
  text(
    p.product_thumbnail ||
      (Array.isArray(p.images) ? p.images[0] : '') ||
      p.image ||
      p.image_url ||
      p.image1,
  );

export const titleOf = (
  p: Record<string, unknown>,
): string =>
  text(p.title || p.product_name) || 'Product';

export const priceOf = (
  p: Record<string, unknown>,
): number => {
  const offerPrice = num(p.offer_price);
  const sellingPrice = num(p.selling_price);
  const salePrice = num(p.sale_price);
  const price = num(p.price);
  const mrp = num(p.mrp);

  if (offerPrice > 0) return offerPrice;
  if (sellingPrice > 0) return sellingPrice;
  if (salePrice > 0) return salePrice;
  if (price > 0) return price;

  return mrp;
};

export const oldPriceOf = (
  p: Record<string, unknown>,
): number => {
  const mrp = num(p.mrp);
  const oldPrice = num(p.old_price);
  const originalPrice = num(p.original_price);
  const regularPrice = num(p.regular_price);
  const listPrice = num(p.list_price);

  if (mrp > 0) return mrp;
  if (oldPrice > 0) return oldPrice;
  if (originalPrice > 0) return originalPrice;
  if (regularPrice > 0) return regularPrice;

  return listPrice;
};

export const discountOf = (
  p: Record<string, unknown>,
): number => {
  const price = priceOf(p);
  const old = oldPriceOf(p);

  if (old > price && price > 0) {
    return Math.round(
      ((old - price) / old) * 100,
    );
  }

  return Math.round(
    num(
      p.discount_percent ??
        p.discount,
    ),
  );
};