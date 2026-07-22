export const text = (value: unknown): string => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
export const num = (value: unknown): number => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };
export const slugify = (value: unknown): string => text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
export const imageOf = (p: Record<string, unknown>): string => text(p.product_thumbnail || (Array.isArray(p.images) ? p.images[0] : '') || p.image || p.image_url || p.image1);
export const titleOf = (p: Record<string, unknown>): string => text(p.title || p.product_name) || 'Product';
export const priceOf = (p: Record<string, unknown>): number => num(p.offer_price ?? p.price);
export const oldPriceOf = (p: Record<string, unknown>): number => num(p.old_price ?? p.original_price ?? p.mrp);
export const discountOf = (p: Record<string, unknown>): number => { const price=priceOf(p), old=oldPriceOf(p); return old>price&&price>0 ? Math.round((old-price)/old*100) : Math.round(num(p.discount ?? p.discount_percent)); };
