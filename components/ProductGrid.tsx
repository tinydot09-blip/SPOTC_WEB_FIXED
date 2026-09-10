'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GitCompareArrows,
  Gift,
  Heart,
  Info,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { addProduct } from '@/lib/cart';
import { getProducts } from '@/lib/data';
import {
  auth,
  db,
  firebaseProjectId,
  firebaseReady,
} from '@/lib/firebase';
import { requireGoogleLogin } from '@/lib/auth';
import type { BusinessProduct } from '@/lib/types';
import { EmptyState } from './EmptyState';
import { useDeliveryAvailability } from '@/lib/delivery-radius';
import { useSpotcLanguage } from '@/components/LanguageProvider';

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textValue = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim();

const SHOP_MAIN_CATEGORIES = [
  'Girl Dress',
  'Earrings',
  'Toys',
] as const;

type ShopMainCategory = string;

type ProductCategoryConfig = {
  id: string;
  name: string;
  subcategories: string[];
  isActive: boolean;
  sortOrder: number;
};

const FALLBACK_CATEGORY_CONFIGS: ProductCategoryConfig[] = [
  {
    id: 'girl-dress',
    name: 'Girl Dress',
    subcategories: [
      '0-1 Years',
      '1-2 Years',
      '2-3 Years',
      '3-5 Years',
      '6-8 Years',
      '9-12 Years',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'earrings',
    name: 'Earrings',
    subcategories: [],
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'toys',
    name: 'Toys',
    subcategories: [
      'Dolls & Pretend Play',
      'Vehicles & Guns',
      'Learning & Creative',
      'Balls & Outdoor',
      'Fun & Fidget',
      'Other Toys',
    ],
    isActive: true,
    sortOrder: 3,
  },
];

const SHOP_CATEGORY_ORDER = [
  'Girl Dress',
  'Earrings',
  'Fancy Items',
  'Toys',
  'Keychains',
] as const;

const mergeCategoryConfigs = (
  firestoreCategories: ProductCategoryConfig[],
): ProductCategoryConfig[] => {
  const merged = new Map<string, ProductCategoryConfig>();

  for (const item of FALLBACK_CATEGORY_CONFIGS) {
    merged.set(item.name.toLowerCase(), item);
  }

  for (const item of firestoreCategories) {
    if (!item.name || !item.isActive) continue;
    merged.set(item.name.toLowerCase(), item);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aPreferred = SHOP_CATEGORY_ORDER.findIndex(
      (name) => name.toLowerCase() === a.name.toLowerCase(),
    );
    const bPreferred = SHOP_CATEGORY_ORDER.findIndex(
      (name) => name.toLowerCase() === b.name.toLowerCase(),
    );

    if (aPreferred !== -1 || bPreferred !== -1) {
      if (aPreferred === -1) return 1;
      if (bPreferred === -1) return -1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    }

    const orderDifference = a.sortOrder - b.sortOrder;
    if (orderDifference !== 0) return orderDifference;

    return a.name.localeCompare(b.name);
  });
};

const GIRL_DRESS_AGE_GROUPS = [
  'All',
  '0-1 Years',
  '1-2 Years',
  '2-3 Years',
  '3-5 Years',
  '6-8 Years',
  '9-12 Years',
] as const;

const TOY_SUB_CATEGORIES = [
  'All',
  'Dolls & Pretend Play',
  'Vehicles & Guns',
  'Learning & Creative',
  'Balls & Outdoor',
  'Fun & Fidget',
  'Other Toys',
] as const;

/*
 * Only products that genuinely belong to one of the three current
 * Shop main categories are shown in this grid.
 *
 * IMPORTANT:
 * We do NOT force unknown/fancy/accessory items into Toys or Girl Dress.
 * This prevents future products such as headbands, bangles, chains,
 * keychains, clips, pottu, watches, sunglasses, etc. from appearing
 * under the wrong main category.
 */
const normalizedProductText = (
  product: BusinessProduct,
): string =>
  [
    product.main_category,
    product.category,
    product.sub_category,
    product.child_category,
    product.title,
    product.product_name,
    product.brand,
    product.age_group,
    product.gender,
    product.audience,
    product.search_text,
    Array.isArray(product.tags)
      ? product.tags.join(' ')
      : '',
    Array.isArray(product.search_tags)
      ? product.search_tags.join(' ')
      : '',
    Array.isArray(product.keywords)
      ? product.keywords.join(' ')
      : '',
  ]
    .map(textValue)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const isExplicitToyProduct = (
  product: BusinessProduct,
): boolean => {
  const main = textValue(
    product.main_category || '',
  ).toLowerCase();

  const category = textValue(
    product.category || '',
  ).toLowerCase();

  const sub = textValue(
    product.sub_category || '',
  ).toLowerCase();

  const child = textValue(
    product.child_category || '',
  ).toLowerCase();

  const combined =
    normalizedProductText(product);

  /*
   * Firestore classification wins first.
   */
  if (
    main === 'toys' ||
    main === 'toy' ||
    category === 'toys' ||
    category === 'toy'
  ) {
    return true;
  }

  /*
   * Strong toy category/title fallbacks for older products.
   */
  return (
    sub.includes('toy') ||
    child.includes('toy') ||
    sub.includes('doll') ||
    child.includes('doll') ||
    combined.includes('fashion doll') ||
    combined.includes('baby doll') ||
    combined.includes('barbie') ||
    combined.includes('toy gun') ||
    combined.includes('water gun') ||
    combined.includes('soft bullet') ||
    combined.includes('toy car') ||
    combined.includes('toy vehicle') ||
    combined.includes('play ball') ||
    combined.includes('plastic ball') ||
    combined.includes('drawing board') ||
    combined.includes('magnetic board') ||
    combined.includes('magic slate') ||
    combined.includes('fidget toy') ||
    combined.includes('spinner toy') ||
    combined.includes('puzzle toy') ||
    combined.includes('slime toy') ||
    combined.includes('sand toy') ||
    combined.includes('beach toy') ||
    combined.includes('animal figure') ||
    combined.includes('animal figurine') ||
    combined.includes('building block') ||
    combined.includes('blocks toy') ||
    combined.includes('pretend play') ||
    combined.includes('educational toy')
  );
};

const isEarringProduct = (
  product: BusinessProduct,
): boolean => {
  const main = textValue(
    product.main_category || '',
  ).toLowerCase();

  const category = textValue(
    product.category || '',
  ).toLowerCase();

  const sub = textValue(
    product.sub_category || '',
  ).toLowerCase();

  const child = textValue(
    product.child_category || '',
  ).toLowerCase();

  const combined =
    normalizedProductText(product);

  if (
    main === 'earrings' ||
    main === 'earring' ||
    category === 'earrings' ||
    category === 'earring' ||
    sub === 'earrings' ||
    sub === 'earring' ||
    child === 'earrings' ||
    child === 'earring'
  ) {
    return true;
  }

  return (
    combined.includes('earring') ||
    combined.includes('ear ring') ||
    combined.includes('ear stud') ||
    combined.includes('stud earring') ||
    combined.includes('drop earring') ||
    combined.includes('hoop earring') ||
    combined.includes('jhumka') ||
    combined.includes('jhumki')
  );
};

const isGirlDressProduct = (
  product: BusinessProduct,
): boolean => {
  const main = textValue(
    product.main_category || '',
  ).toLowerCase();

  const category = textValue(
    product.category || '',
  ).toLowerCase();

  const sub = textValue(
    product.sub_category || '',
  ).toLowerCase();

  const child = textValue(
    product.child_category || '',
  ).toLowerCase();

  const combined =
    normalizedProductText(product);

  /*
   * Explicit toy/fancy accessory guards must run before clothing logic.
   */
  if (isExplicitToyProduct(product)) {
    return false;
  }

  const accessoryWords = [
    'headband',
    'hair band',
    'hairband',
    'hair clip',
    'hairclip',
    'hair pin',
    'hairpin',
    'scrunchie',
    'bangle',
    'bracelet',
    'necklace',
    'chain',
    'keychain',
    'key chain',
    'pottu',
    'bindi',
    'sunglass',
    'sunglasses',
    'eyeglass',
    'watch',
    'wallet',
    'handbag',
    'purse',
    'crown',
    'tiara',
    'costume accessory',
    'costume prop',
    'horns headband',
  ];

  if (
    accessoryWords.some((word) =>
      combined.includes(word),
    )
  ) {
    return false;
  }

  /*
   * Explicit Firestore dress classification.
   */
  if (
    main === 'girl dress' ||
    main === 'girls dress' ||
    main === 'girls wear' ||
    main === 'kids wear' ||
    category === 'girl dress' ||
    category === 'girls dress' ||
    sub === 'girl dress' ||
    sub === 'girls dress' ||
    child === 'girl dress' ||
    child === 'girls dress'
  ) {
    return true;
  }

  /*
   * Strong clothing terms only.
   * Avoid broad words such as "party", "costume", "fashion", or "gown"
   * on their own because toys/accessories can contain those words.
   */
  return (
    combined.includes('girls frock') ||
    combined.includes('girl frock') ||
    combined.includes('kids frock') ||
    combined.includes('baby frock') ||
    combined.includes('girls kurti') ||
    combined.includes('girl kurti') ||
    combined.includes('girls lehenga') ||
    combined.includes('girl lehenga') ||
    combined.includes('girls salwar') ||
    combined.includes('girl salwar') ||
    combined.includes('girls top and skirt') ||
    combined.includes('girl top and skirt') ||
    combined.includes('girls top & skirt') ||
    combined.includes('girl top & skirt') ||
    combined.includes('girls clothing set') ||
    combined.includes('girl clothing set') ||
    combined.includes('girls dress') ||
    combined.includes('girl dress')
  );
};

const shopMainCategoryOf = (
  product: BusinessProduct,
): ShopMainCategory | null => {
  /*
   * Priority is deliberate:
   * Toys first prevents dolls wearing dresses/gowns becoming clothing.
   * Earrings next.
   * Girl Dress next.
   * Anything else stays unclassified instead of being shown wrongly.
   */
  if (isExplicitToyProduct(product)) {
    return 'Toys';
  }

  if (isEarringProduct(product)) {
    return 'Earrings';
  }

  if (isGirlDressProduct(product)) {
    return 'Girl Dress';
  }

  return null;
};

const dynamicShopMainCategoryOf = (
  product: BusinessProduct,
  availableCategories: string[],
): ShopMainCategory | null => {
  const explicit = textValue(
    product.main_category ||
      product.category ||
      '',
  );

  if (explicit) {
    const exact = availableCategories.find(
      (category) =>
        category.toLowerCase() ===
        explicit.toLowerCase(),
    );

    if (exact) {
      return exact;
    }
  }

  const legacy = shopMainCategoryOf(product);

  if (!legacy) {
    return null;
  }

  return (
    availableCategories.find(
      (category) =>
        category.toLowerCase() ===
        legacy.toLowerCase(),
    ) || null
  );
};

const extractNumbers = (
  value: string,
): number[] =>
  (value.match(/\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((value) =>
      Number.isFinite(value),
    );

const normalizeGirlDressAgeBand = (
  value: string,
): string | null => {
  const raw = value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return null;

  /*
   * Exact/current admin-style values.
   */
  if (
    /(^|\D)0\s*(?:-|to)\s*1\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '0-1 Years';
  }

  if (
    /(^|\D)1\s*(?:-|to)\s*2\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '1-2 Years';
  }

  if (
    /(^|\D)2\s*(?:-|to)\s*3\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '2-3 Years';
  }

  if (
    /(^|\D)3\s*(?:-|to)\s*5\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '3-5 Years';
  }

  if (
    /(^|\D)6\s*(?:-|to)\s*8\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '6-8 Years';
  }

  if (
    /(^|\D)9\s*(?:-|to)\s*12\s*(?:year|years|yr|yrs)/.test(raw)
  ) {
    return '9-12 Years';
  }

  /*
   * Month-based baby sizes.
   */
  const monthRange = raw.match(
    /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:month|months|mo|mos)/,
  );

  if (monthRange) {
    const minMonths =
      Number(monthRange[1]);
    const maxMonths =
      Number(monthRange[2]);
    const middleMonths =
      (minMonths + maxMonths) / 2;

    if (middleMonths < 12) {
      return '0-1 Years';
    }

    if (middleMonths < 24) {
      return '1-2 Years';
    }

    if (middleMonths < 36) {
      return '2-3 Years';
    }
  }

  if (
    raw.includes('newborn') ||
    raw.includes('infant')
  ) {
    return '0-1 Years';
  }

  /*
   * Generic year ranges / single ages / values like "2+ Years".
   */
  const numbers =
    extractNumbers(raw);

  if (!numbers.length) {
    return null;
  }

  let minAge = numbers[0];
  let maxAge =
    numbers.length > 1
      ? numbers[1]
      : numbers[0];

  if (
    raw.includes('month') ||
    raw.includes(' mo')
  ) {
    minAge /= 12;
    maxAge /= 12;
  }

  if (raw.includes('+')) {
    maxAge = minAge;
  }

  const age =
    (minAge + maxAge) / 2;

  if (age < 1) {
    return '0-1 Years';
  }

  if (age < 2) {
    return '1-2 Years';
  }

  if (age < 3) {
    return '2-3 Years';
  }

  if (age <= 5) {
    return '3-5 Years';
  }

  if (age <= 8) {
    return '6-8 Years';
  }

  if (age <= 12) {
    return '9-12 Years';
  }

  return null;
};

const girlDressAgeBandOf = (
  product: BusinessProduct,
): string => {
  /*
   * Prefer the dedicated Firestore age_group first.
   * Then use size, title and product name only as fallbacks.
   */
  const candidates = [
    product.age_group,
    product.age,
    product.size,
    product.title,
    product.product_name,
  ];

  for (const candidate of candidates) {
    const band =
      normalizeGirlDressAgeBand(
        textValue(candidate),
      );

    if (band) return band;
  }

  return 'Other Ages';
};

const toySubCategoryOf = (
  product: BusinessProduct,
): string => {
  const combined =
    normalizedProductText(product);

  /*
   * 1. Dolls & Pretend Play
   */
  if (
    combined.includes('doll') ||
    combined.includes('barbie') ||
    combined.includes('pretend play') ||
    combined.includes('kitchen set') ||
    combined.includes('doctor set') ||
    combined.includes('makeup set') ||
    combined.includes('beauty set') ||
    combined.includes('role play') ||
    combined.includes('tea set')
  ) {
    return 'Dolls & Pretend Play';
  }

  /*
   * 2. Vehicles & Guns
   */
  if (
    combined.includes('toy gun') ||
    combined.includes('water gun') ||
    combined.includes('soft bullet') ||
    combined.includes('dart gun') ||
    combined.includes('shooting') ||
    combined.includes('pistol') ||
    combined.includes('rifle') ||
    combined.includes('toy car') ||
    combined.includes('car toy') ||
    combined.includes('vehicle') ||
    combined.includes('truck') ||
    combined.includes('bus toy') ||
    combined.includes('bike toy') ||
    combined.includes('motorcycle toy') ||
    combined.includes('train toy') ||
    combined.includes('airplane toy') ||
    combined.includes('aeroplane toy') ||
    combined.includes('helicopter toy') ||
    combined.includes('construction vehicle')
  ) {
    return 'Vehicles & Guns';
  }

  /*
   * 3. Learning & Creative
   */
  if (
    combined.includes('activity book') ||
    combined.includes('drawing') ||
    combined.includes('drawing board') ||
    combined.includes('magnetic board') ||
    combined.includes('magic slate') ||
    combined.includes('writing board') ||
    combined.includes('colouring') ||
    combined.includes('coloring') ||
    combined.includes('sticker') ||
    combined.includes('puzzle') ||
    combined.includes('alphabet') ||
    combined.includes('number learning') ||
    combined.includes('learning toy') ||
    combined.includes('educational toy') ||
    combined.includes('building block') ||
    combined.includes('blocks toy') ||
    combined.includes('shape sorter') ||
    combined.includes('flash card')
  ) {
    return 'Learning & Creative';
  }

  /*
   * 4. Balls & Outdoor
   */
  if (
    combined.includes('play ball') ||
    combined.includes('plastic ball') ||
    combined.includes('ball set') ||
    combined.includes('balloon') ||
    combined.includes('beach toy') ||
    combined.includes('sand toy') ||
    combined.includes('bucket shovel') ||
    combined.includes('outdoor toy') ||
    combined.includes('flying disc') ||
    combined.includes('frisbee') ||
    combined.includes('skipping rope') ||
    combined.includes('bat ball')
  ) {
    return 'Balls & Outdoor';
  }

  /*
   * 5. Fun & Fidget
   */
  if (
    combined.includes('fidget') ||
    combined.includes('spinner') ||
    combined.includes('slime') ||
    combined.includes('squishy') ||
    combined.includes('pop it') ||
    combined.includes('pop-it') ||
    combined.includes('light-up') ||
    combined.includes('light up') ||
    combined.includes('musical toy') ||
    combined.includes('sound toy') ||
    combined.includes('wind up') ||
    combined.includes('wind-up') ||
    combined.includes('yo-yo') ||
    combined.includes('yoyo')
  ) {
    return 'Fun & Fidget';
  }

  /*
   * Everything that is genuinely classified as Toys
   * but does not match the groups above stays here.
   */
  return 'Other Toys';
};

const shopSubCategoryOf = (
  product: BusinessProduct,
  mainCategory: ShopMainCategory,
): string => {
  if (mainCategory === 'Girl Dress') {
    return girlDressAgeBandOf(product);
  }

  if (mainCategory === 'Toys') {
    return toySubCategoryOf(product);
  }

  const sub = textValue(
    product.sub_category ||
      product.child_category ||
      product.category ||
      product.main_category ||
      '',
  );

  return sub || 'Other';
};

const imageOf = (product: BusinessProduct): string => {
  const record = product as BusinessProduct & Record<string, unknown>;

  return textValue(
    record.thumbnail_url ||
      record.thumbnailUrl ||
      record.thumb_url ||
      record.thumbUrl ||
      record.web_thumbnail_url ||
      record.card_image_url ||
      record.product_thumbnail ||
      product.images?.[0] ||
      product.image ||
      product.image_url ||
      product.image1 ||
      '',
  );
};

const titleOf = (product: BusinessProduct): string =>
  product.title || product.product_name || 'Product';

const businessNameOf = (product: BusinessProduct): string =>
  String(
    product.business_name ||
      product.shop_name ||
      product.businessName ||
      product.brand ||
      'SPOTC Shop',
  );

const priceOf = (product: BusinessProduct): number => {
  const offerPrice = numberValue(product.offer_price);
  const sellingPrice = numberValue(product.selling_price);
  const price = numberValue(product.price);
  const mrp = numberValue(product.mrp ?? product.old_price);

  if (offerPrice > 0) return offerPrice;
  if (sellingPrice > 0) return sellingPrice;
  if (price > 0) return price;
  return mrp;
};

const oldPriceOf = (product: BusinessProduct): number =>
  numberValue(
    product.old_price ??
      product.original_price ??
      product.mrp,
  );

const isComboEligible = (
  product: BusinessProduct,
  price: number,
): boolean =>
  isGirlDressProduct(product) && price >= 100;

const discountOf = (product: BusinessProduct): number => {
  const price = priceOf(product);
  const oldPrice = oldPriceOf(product);

  if (oldPrice > price && price > 0) {
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  }

  return Math.round(
    numberValue(product.discount ?? product.discount_percent),
  );
};


/*
 * VISITOR-SESSION FEATURED SHUFFLE
 * --------------------------------
 * Each browser session gets its own seed, so different visitors see a
 * different Featured product order. The order remains stable while that
 * visitor browses, opens a product, and comes back during the same session.
 */
const getOrCreateVisitorSessionSeed = (): string => {
  if (typeof window === 'undefined') return 'server';

  const key = 'spotc-visitor-session-seed';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, seed);
  return seed;
};

const seededHash = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const shuffleFeaturedProducts = (
  products: BusinessProduct[],
  visitorSeed: string,
): BusinessProduct[] =>
  [...products].sort((a, b) => {
    const aValue = [
      visitorSeed,
      'shop',
      textValue(a.id),
      titleOf(a),
      textValue(a.color),
      textValue(a.sub_category),
      textValue(a.age_group),
    ].join('|');

    const bValue = [
      visitorSeed,
      'shop',
      textValue(b.id),
      titleOf(b),
      textValue(b.color),
      textValue(b.sub_category),
      textValue(b.age_group),
    ].join('|');

    return seededHash(aValue) - seededHash(bValue);
  });

const businessIdOf = (product: BusinessProduct): string => {
  const value =
    product.business_ref ??
    product.business_id ??
    product.businessId;

  if (typeof value === 'string') {
    return value.split('/').filter(Boolean).pop() ?? '';
  }

  if (
    value &&
    typeof value === 'object' &&
    'id' in value
  ) {
    return String(
      (value as { id?: unknown }).id ?? '',
    );
  }

  return '';
};


const normalizeSearchValue = (value: unknown): string =>
  textValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const searchTokensOf = (product: BusinessProduct): string[] => {
  const values: unknown[] = [
    product.title,
    product.product_name,
    product.brand,
    product.main_category,
    product.category,
    product.sub_category,
    product.child_category,
    product.color,
    product.size,
    product.age_group,
    product.gender,
    product.audience,
    product.description,
    product.search_text,
    Array.isArray(product.tags) ? product.tags.join(' ') : '',
    Array.isArray(product.search_tags) ? product.search_tags.join(' ') : '',
    Array.isArray(product.keywords) ? product.keywords.join(' ') : '',
  ];

  return normalizeSearchValue(values.map(textValue).filter(Boolean).join(' '))
    .split(' ')
    .filter(Boolean);
};

const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );

      diagonal = above;
    }
  }

  return previous[b.length];
};

const tokenMatchesQuery = (productToken: string, queryToken: string): boolean => {
  if (!productToken || !queryToken) return false;

  if (
    productToken.includes(queryToken) ||
    queryToken.includes(productToken)
  ) {
    return true;
  }

  // Allows small typing mistakes such as "ballon" -> "balloon".
  const maxDistance =
    queryToken.length <= 4 ? 1 :
    queryToken.length <= 8 ? 1 :
    2;

  return editDistance(productToken, queryToken) <= maxDistance;
};

const productMatchesGlobalSearch = (
  product: BusinessProduct,
  rawQuery: string,
): boolean => {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return true;

  const queryTokens = query.split(' ').filter(Boolean);
  const productTokens = searchTokensOf(product);

  if (!queryTokens.length) return true;
  if (!productTokens.length) return false;

  return queryTokens.every((queryToken) =>
    productTokens.some((productToken) =>
      tokenMatchesQuery(productToken, queryToken),
    ),
  );
};

type ProductGridProps = {
  hideBusinessName?: boolean;
  initialProducts?: BusinessProduct[];
};

export function ProductGrid({
  hideBusinessName = false,
  initialProducts = [],
}: ProductGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const delivery = useDeliveryAvailability();
  const { language, t, productTitle } = useSpotcLanguage();

  const [items, setItems] =
    useState<BusinessProduct[] | null>(() => {
      /*
       * SERVER-RENDERED FAST PATH
       * -------------------------
       * /shop can pass a small first batch from Firebase Admin so real
       * product cards are present in the initial HTML. This improves
       * first paint/LCP while the existing client request continues to
       * refresh the full catalogue after hydration.
       */
      if (initialProducts.length > 0) {
        return initialProducts;
      }

      if (typeof window === 'undefined') {
        return null;
      }

      const cached = (
        window as typeof window & {
          __spotcProductsCache?: BusinessProduct[];
          __spotcProductsCacheAt?: number;
        }
      ).__spotcProductsCache;

      return Array.isArray(cached) && cached.length > 0
        ? cached
        : null;
    });
  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('Featured');
  const [visitorSeed, setVisitorSeed] = useState('server');

  useEffect(() => {
    setVisitorSeed(getOrCreateVisitorSessionSeed());
  }, []);

  const [categoryConfigs, setCategoryConfigs] =
    useState<ProductCategoryConfig[]>(FALLBACK_CATEGORY_CONFIGS);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const initialCategoryParam = searchParams.get('category');
  const initialSubCategoryParam = searchParams.get('subcategory');

  const [mainCategory, setMainCategory] =
    useState<ShopMainCategory>(
      initialCategoryParam || 'Girl Dress',
    );
  const [subCategory, setSubCategory] =
    useState(initialSubCategoryParam || 'All');

  const [user, setUser] =
    useState<User | null>(auth?.currentUser ?? null);
  const [saved, setSaved] =
    useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState('');
  const [compare, setCompare] =
    useState<Set<string>>(new Set());
  const [compareBusy, setCompareBusy] =
    useState(false);
  const [mounted, setMounted] = useState(false);
  const [tryAtHomeIds, setTryAtHomeIds] =
    useState<Set<string>>(new Set());
  const [showTryAtHomeInfo, setShowTryAtHomeInfo] =
    useState(false);

  const tryAtHomeKindOf = (
    product: BusinessProduct,
  ): 'dress' | 'earring' | null => {
    const price = priceOf(product);

    if (isGirlDressProduct(product) && price >= 100) {
      return 'dress';
    }

    if (isEarringProduct(product) && price >= 80) {
      return 'earring';
    }

    return null;
  };

  const toggleTryAtHome = (product: BusinessProduct) => {
    const productId = String(product.id);
    const kind = tryAtHomeKindOf(product);

    if (!kind) return;

    if (tryAtHomeIds.has(productId)) {
      setTryAtHomeIds((current) => {
        const next = new Set(current);
        next.delete(productId);

        try {
          window.localStorage.setItem(
            'spotc_try_at_home_ids',
            JSON.stringify(Array.from(next)),
          );
        } catch {
          // Local storage is optional.
        }

        return next;
      });
      return;
    }

    const selectedProducts = (items ?? []).filter((candidate) =>
      tryAtHomeIds.has(String(candidate.id)),
    );

    const selectedDressCount = selectedProducts.filter(
      (candidate) => tryAtHomeKindOf(candidate) === 'dress',
    ).length;

    const selectedEarringCount = selectedProducts.filter(
      (candidate) => tryAtHomeKindOf(candidate) === 'earring',
    ).length;

    if (kind === 'dress' && selectedDressCount >= 2) {
      alert(
        language === 'ta'
          ? 'Try at Home-க்கு அதிகபட்சம் 2 dress மட்டும் தேர்வு செய்யலாம்.'
          : 'You can select a maximum of 2 dresses for Try at Home.',
      );
      return;
    }

    if (kind === 'earring' && selectedEarringCount >= 2) {
      alert(
        language === 'ta'
          ? 'Try at Home-க்கு அதிகபட்சம் 2 earrings மட்டும் தேர்வு செய்யலாம்.'
          : 'You can select a maximum of 2 earrings for Try at Home.',
      );
      return;
    }

    setTryAtHomeIds((current) => {
      const next = new Set(current);
      next.add(productId);

      try {
        window.localStorage.setItem(
          'spotc_try_at_home_ids',
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // Local storage is optional.
      }

      return next;
    });
  };

  const localizedTitleOf = (item: BusinessProduct): string => {
    const record = item as BusinessProduct & Record<string, unknown>;
    const tamilTitle = textValue(record.title_ta ?? record.product_name_ta);

    if (language === 'ta' && tamilTitle) {
      return tamilTitle;
    }

    const englishTitle = titleOf(item);
    return language === 'ta' ? productTitle(englishTitle) : englishTitle;
  };

  const categoryLabel = (value: string): string => t(value);

  useEffect(() => {
    setMounted(true);

    try {
      const stored = window.localStorage.getItem(
        'spotc_try_at_home_ids',
      );
      const parsed = stored ? JSON.parse(stored) : [];

      if (Array.isArray(parsed)) {
        setTryAtHomeIds(
          new Set(
            parsed
              .map((value) => String(value))
              .filter(Boolean),
          ),
        );
      }
    } catch {
      // Ignore malformed local Try at Home state.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    try {
      window.localStorage.setItem(
        'spotc_try_at_home_ids',
        JSON.stringify(Array.from(tryAtHomeIds)),
      );
    } catch {
      // Local storage is optional; checkout still validates the booking.
    }
  }, [mounted, tryAtHomeIds]);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!db) {
        if (active) {
          setCategoryConfigs(FALLBACK_CATEGORY_CONFIGS);
          setCategoriesLoaded(true);
        }
        return;
      }

      try {
        const snapshot = await getDocs(
          collection(db, 'ProductCategories'),
        );

        if (!active) return;

        const loaded = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;

            return {
              id: item.id,
              name: textValue(data.name),
              subcategories: Array.isArray(data.subcategories)
                ? data.subcategories
                    .map((value) => textValue(value))
                    .filter(Boolean)
                : [],
              isActive: data.is_active !== false,
              sortOrder: numberValue(data.sort_order),
            } satisfies ProductCategoryConfig;
          })
          .filter((item) => item.name && item.isActive);

        setCategoryConfigs(
          mergeCategoryConfigs(loaded),
        );
      } catch (reason) {
        console.error(
          'Loading ProductCategories failed:',
          reason,
        );

        if (active) {
          setCategoryConfigs(FALLBACK_CATEGORY_CONFIGS);
        }
      } finally {
        if (active) {
          setCategoriesLoaded(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const mainCategories = useMemo(
    () =>
      categoryConfigs
        .filter((item) => item.isActive)
        .map((item) => item.name)
        .filter(Boolean),
    [categoryConfigs],
  );

  useEffect(() => {
    if (!categoriesLoaded || mainCategories.length === 0) return;

    const categoryParam = searchParams.get('category');
    const subCategoryParam = searchParams.get('subcategory');

    if (!categoryParam) {
      const defaultCategory = mainCategories.includes('Girl Dress')
        ? 'Girl Dress'
        : mainCategories[0];

      setMainCategory(defaultCategory);
      setSubCategory('All');
      return;
    }

    const matched = mainCategories.find(
      (category) =>
        category.toLowerCase() === categoryParam.toLowerCase(),
    );

    if (!matched) return;

    setMainCategory(matched);
    setSubCategory(subCategoryParam || 'All');
  }, [searchParams, mainCategories, categoriesLoaded]);

  useEffect(() => {
    const resetShop = () => {
      const defaultCategory = mainCategories.includes('Girl Dress')
        ? 'Girl Dress'
        : mainCategories[0] || 'Girl Dress';

      setMainCategory(defaultCategory);
      setSubCategory('All');
      setSearch('');
      setSort('Featured');

      window.dispatchEvent(
        new CustomEvent('spotc-search-sync', { detail: '' }),
      );
    };

    window.addEventListener('spotc-shop-reset', resetShop);
    return () => window.removeEventListener('spotc-shop-reset', resetShop);
  }, [mainCategories]);

  useEffect(() => {
    const querySearch = searchParams.get('search') || '';

    if (querySearch) {
      setSearch(querySearch);

      window.dispatchEvent(
        new CustomEvent('spotc-page-search', {
          detail: querySearch,
        }),
      );
    }
  }, [searchParams]);

  useEffect(() => {
    const browserCache =
      typeof window !== 'undefined'
        ? (
            window as typeof window & {
              __spotcProductsCache?: BusinessProduct[];
              __spotcProductsCacheAt?: number;
            }
          )
        : null;

    const cachedProducts =
      browserCache?.__spotcProductsCache;

    const cachedAt =
      browserCache?.__spotcProductsCacheAt || 0;

    const cacheIsFresh =
      Array.isArray(cachedProducts) &&
      cachedProducts.length > 0 &&
      Date.now() - cachedAt < 5 * 60 * 1000;

    if (cacheIsFresh) {
      setItems(cachedProducts);
      setError(null);
      return;
    }

    let active = true;

    getProducts()
      .then((products) => {
        if (!active) return;

        setItems(products);
        setError(null);

        if (browserCache) {
          browserCache.__spotcProductsCache =
            products;
          browserCache.__spotcProductsCacheAt =
            Date.now();
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;

        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
        setItems([]);
      });

    return () => {
      active = false;
    };
  }, []);

  /*
   * CATEGORY IMAGE WARM-UP
   * ----------------------
   * After the main Shop content is visible, quietly preload the first two
   * product images from the other main categories. This makes switching to
   * Earrings, Fancy Items, Toys and Keychains feel much faster without
   * changing product data, category logic, cart, compare, save or URLs.
   *
   * The delay keeps these background image requests away from the initial
   * LCP-critical work.
   */
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !items ||
      items.length === 0 ||
      mainCategories.length === 0
    ) {
      return;
    }

    const categoryNames = [
      'Girl Dress',
      'Earrings',
      'Fancy Items',
      'Toys',
      'Keychains',
    ];

    const urls = new Set<string>();

    for (const categoryName of categoryNames) {
      if (
        categoryName.toLowerCase() ===
        mainCategory.toLowerCase()
      ) {
        continue;
      }

      let added = 0;

      for (const product of items) {
        if (added >= 2) {
          break;
        }

        const productCategory =
          dynamicShopMainCategoryOf(
            product,
            mainCategories,
          );

        if (
          !productCategory ||
          productCategory.toLowerCase() !==
            categoryName.toLowerCase()
        ) {
          continue;
        }

        const url = imageOf(product);

        if (!url || urls.has(url)) {
          continue;
        }

        urls.add(url);
        added += 1;
      }
    }

    if (urls.size === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      urls.forEach((url) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
      });
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    items,
    mainCategory,
    mainCategories,
  ]);

  useEffect(() => {
    if (!auth) return;

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(
        currentUser && !currentUser.isAnonymous
          ? currentUser
          : null,
      );
    });
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setSaved(new Set());
      return;
    }

    const currentDb = db;
    const currentUser = user;

    const loadSavedProducts = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(currentDb, 'SavedProducts'),
            where(
              'user_uid',
              '==',
              currentUser.uid,
            ),
          ),
        );

        const ids = snapshot.docs
          .map((savedDoc) => {
            const data = savedDoc.data();

            if (
              data.product_ref &&
              typeof data.product_ref === 'object' &&
              'id' in data.product_ref
            ) {
              return String(data.product_ref.id);
            }

            return textValue(
              data.product_id ??
                data.target_id ??
                data.item_id,
            );
          })
          .filter(Boolean);

        setSaved(new Set(ids));
      } catch (reason) {
        console.error(
          'Loading saved products failed:',
          reason,
        );
      }
    };

    void loadSavedProducts();
  }, [user]);

  useEffect(() => {
    const handleHeaderSearch = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setSearch(String(customEvent.detail || ''));
    };

    window.addEventListener(
      'spotc-page-search',
      handleHeaderSearch,
    );

    return () => {
      window.removeEventListener(
        'spotc-page-search',
        handleHeaderSearch,
      );
    };
  }, []);

  const subCategories = useMemo(() => {
    /*
     * Girl Dress keeps the existing age-band behavior because older
     * products may store age in size/title rather than sub_category.
     */
    if (mainCategory === 'Girl Dress') {
      const hasOtherAges = (items || []).some(
        (product) =>
          dynamicShopMainCategoryOf(
            product,
            mainCategories,
          ) === 'Girl Dress' &&
          girlDressAgeBandOf(product) ===
            'Other Ages',
      );

      return hasOtherAges
        ? [
            ...GIRL_DRESS_AGE_GROUPS,
            'Other Ages',
          ]
        : [...GIRL_DRESS_AGE_GROUPS];
    }

    /*
     * Toys keeps the existing grouped fallback for old toy records.
     * If Admin has configured toy subcategories, those values are used.
     */
    const configuredCategory =
      categoryConfigs.find(
        (item) =>
          item.name.toLowerCase() ===
          mainCategory.toLowerCase(),
      );

    const configuredSubcategories =
      configuredCategory?.subcategories || [];

    if (
      configuredSubcategories.length > 0 &&
      mainCategory !== 'Girl Dress'
    ) {
      return [
        'All',
        ...Array.from(
          new Set(configuredSubcategories),
        ),
      ];
    }

    if (mainCategory === 'Toys') {
      return [...TOY_SUB_CATEGORIES];
    }

    /*
     * For categories without configured subcategories, derive them from
     * the actual products so older inventory remains browseable.
     */
    const unique = new Map<string, string>();

    (items || [])
      .filter(
        (product) =>
          dynamicShopMainCategoryOf(
            product,
            mainCategories,
          ) === mainCategory,
      )
      .map((product) =>
        shopSubCategoryOf(
          product,
          mainCategory,
        ),
      )
      .filter(Boolean)
      .forEach((value) => {
        const key = value.toLowerCase();

        if (!unique.has(key)) {
          unique.set(key, value);
        }
      });

    return [
      'All',
      ...Array.from(unique.values()).sort(
        (a, b) => a.localeCompare(b),
      ),
    ];
  }, [
    items,
    mainCategory,
    categoryConfigs,
    mainCategories,
  ]);

  useEffect(() => {
    if (!categoriesLoaded || mainCategories.length === 0) {
      return;
    }

    const exists = mainCategories.some(
      (category) =>
        category.toLowerCase() ===
        mainCategory.toLowerCase(),
    );

    if (!exists) {
      setMainCategory(
        mainCategories.includes('Girl Dress')
          ? 'Girl Dress'
          : mainCategories[0],
      );
      setSubCategory('All');
    }
  }, [
    mainCategories,
    mainCategory,
    categoriesLoaded,
  ]);

  const filteredProducts = useMemo(() => {
    const searchQuery = search.trim();

    const result = [...(items || [])].filter((product) => {
      /*
       * LIVE SHOP AVAILABILITY:
       * Hide inactive, explicitly out-of-stock, and zero-stock products
       * from normal browsing AND global search.
       *
       * The product remains in Firestore/Admin so it can be restocked later.
       */
      const stock = numberValue(
        product.stock_qty ??
          product.stock_quantity,
      );

      if (
        product.isActive === false ||
        product.is_in_stock === false ||
        stock <= 0
      ) {
        return false;
      }

      /*
       * GLOBAL SEARCH:
       * When the header search has text, search across ALL shop products.
       * Do not restrict results to the currently selected main/sub category.
       * This also includes currently-unclassified products so searches such
       * as "balloon" can still find Home & Party / other future categories.
       */
      if (searchQuery) {
        return productMatchesGlobalSearch(product, searchQuery);
      }

      /*
       * Normal browsing mode keeps the current category/subcategory rules.
       */
      const productMainCategory =
        dynamicShopMainCategoryOf(
          product,
          mainCategories,
        );

      if (!productMainCategory) {
        return false;
      }

      const productSubCategory =
        shopSubCategoryOf(product, productMainCategory);

      const matchesMainCategory =
        productMainCategory === mainCategory;

      const matchesSubCategory =
        subCategory === 'All' ||
        productSubCategory === subCategory;

      return matchesMainCategory && matchesSubCategory;
    });

    if (sort === 'Price: Low to High') {
      result.sort(
        (a, b) => priceOf(a) - priceOf(b),
      );
    }

    if (sort === 'Price: High to Low') {
      result.sort(
        (a, b) => priceOf(b) - priceOf(a),
      );
    }

    if (sort === 'Newest') {
      result.reverse();
    }

    if (sort === 'Biggest Discount') {
      result.sort(
        (a, b) => discountOf(b) - discountOf(a),
      );
    }

    /*
     * Featured = shuffled/mixed catalogue order.
     * Apply after stock/category filtering.
     * Search and explicit sort choices keep their own order.
     */
    if (sort === 'Featured' && !searchQuery) {
      return shuffleFeaturedProducts(result, visitorSeed);
    }

    return result;
  }, [
    items,
    search,
    sort,
    mainCategory,
    subCategory,
    mainCategories,
    visitorSeed,
  ]);

  const openComparisonShoppingCircle = async () => {
    if (!db || compareBusy) return;

    const selectedProducts = (items || []).filter((product) =>
      compare.has(String(product.id)),
    );

    if (selectedProducts.length < 2) {
      alert('Select at least 2 products to ask friends.');
      return;
    }

    let currentUser = user;

    if (!currentUser) {
      currentUser = await requireGoogleLogin();

      if (!currentUser || currentUser.isAnonymous) {
        return;
      }

      setUser(currentUser);
    }

    setCompareBusy(true);

    try {
      const circleReference = doc(
        collection(db, 'ShoppingCircles'),
      );

      const shareCode = `${circleReference.id}_${Date.now()}`;

      const circleProducts = selectedProducts.map((product) => ({
        id: String(product.id),
        title: titleOf(product),
        image: imageOf(product),
        price: priceOf(product),
        old_price: oldPriceOf(product),
        discount: discountOf(product),
        business_name: businessNameOf(product),
        shop_name: businessNameOf(product),
        business_id: businessIdOf(product),
      }));

      const productVoteFields: Record<string, number> = {};

      circleProducts.forEach((_product, index) => {
        productVoteFields[`product_${index}_votes`] = 0;
      });

      await setDoc(circleReference, {
        created_by: doc(db, 'users', currentUser.uid),
        created_by_uid: currentUser.uid,
        owner_uid: currentUser.uid,

        comparison_mode: true,
        products: circleProducts,
        product_ids: circleProducts.map((product) => product.id),

        question: 'Which one should I buy?',
        share_code: shareCode,
        status: 'active',

        participants: 0,
        comments_count: 0,
        none_votes: 0,

        vote_buy_it: 0,
        vote_looks_good: 0,
        vote_not_sure: 0,
        vote_dont_buy: 0,

        ...productVoteFields,

        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),

        expires_at: Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ),
      });

      setCompare(new Set());

      router.push(
        `/circle/${encodeURIComponent(shareCode)}`,
      );
    } catch (reason) {
      console.error(
        'Creating comparison Shopping Circle failed:',
        reason,
      );

      alert(
        reason instanceof Error
          ? `Shopping Circle failed: ${reason.message}`
          : 'Could not create the Shopping Circle.',
      );
    } finally {
      setCompareBusy(false);
    }
  };

  const toggleSavedProduct = async (
    product: BusinessProduct,
  ) => {
    if (!db || savingId) return;

    let activeUser = user;

    if (!activeUser) {
      activeUser = await requireGoogleLogin();

      if (!activeUser) return;

      setUser(activeUser);
    }

    const productId = textValue(product.id);

    if (!productId) {
      alert('This product does not have a valid ID.');
      return;
    }

    const savedDocumentId =
      `${activeUser.uid}_${productId}`;

    const savedReference = doc(
      db,
      'SavedProducts',
      savedDocumentId,
    );

    setSavingId(productId);

    try {
      if (saved.has(productId)) {
        await deleteDoc(savedReference);

        setSaved((current) => {
          const next = new Set(current);
          next.delete(productId);
          return next;
        });

        alert('Product removed from Saved');
        return;
      }

      const productReference = doc(
        db,
        'BusinessProducts',
        productId,
      );

      const businessId = businessIdOf(product);
      const price = priceOf(product);
      const oldPrice = oldPriceOf(product);
      const discount = discountOf(product);

      await setDoc(savedReference, {
        user_uid: activeUser.uid,
        uid: activeUser.uid,
        user_ref: doc(
          db,
          'users',
          activeUser.uid,
        ),

        item_type: 'product',
        saved_type: 'product',

        product_id: productId,
        target_id: productId,
        product_ref: productReference,
        item_ref: productReference,

        business_id: businessId,
        business_ref: businessId
          ? doc(
              db,
              'BusinessListings',
              businessId,
            )
          : null,
        business_name: businessNameOf(product),

        title: titleOf(product),
        product_name: titleOf(product),
        brand: textValue(product.brand),
        category: textValue(
          product.main_category ||
            product.category ||
            product.sub_category,
        ),

        image: imageOf(product),
        image_url: imageOf(product),
        product_thumbnail: imageOf(product),
        images: Array.isArray(product.images)
          ? product.images
          : imageOf(product)
            ? [imageOf(product)]
            : [],

        price,
        old_price: oldPrice,
        discount:
          discount > 0
            ? `${discount}% OFF`
            : '',

        isActive: product.isActive !== false,
        is_active: product.isActive !== false,
        is_in_stock:
          product.is_in_stock !== false,
        stock_qty: numberValue(
          product.stock_qty ??
            product.stock_quantity,
        ),

        web_url: `/product/${productId}`,
        saved_at: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setSaved((current) => {
        const next = new Set(current);
        next.add(productId);
        return next;
      });

      alert('Product saved to your dashboard');
    } catch (reason) {
      console.error(
        'Saving product failed:',
        reason,
      );

      alert(
        reason instanceof Error
          ? `Save failed: ${reason.message}`
          : 'Save failed. Please try again.',
      );
    } finally {
      setSavingId('');
    }
  };

  if (items === null) {
    return (
      <>
        <section
          className="spotc-shop-loading-shell"
          aria-busy="true"
          aria-label="Loading products"
        >
          <div className="spotc-shop-loading-toolbar" aria-hidden="true">
            <div className="spotc-shop-skeleton spotc-shop-skeleton-tab" />
            <div className="spotc-shop-skeleton spotc-shop-skeleton-tab" />
            <div className="spotc-shop-skeleton spotc-shop-skeleton-tab" />
          </div>

          <div className="spotc-shop-loading-grid" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                className="spotc-shop-loading-card"
                key={`shop-loading-${index}`}
              >
                <div className="spotc-shop-skeleton spotc-shop-loading-image" />
                <div className="spotc-shop-loading-copy">
                  <div className="spotc-shop-skeleton spotc-shop-loading-title" />
                  <div className="spotc-shop-skeleton spotc-shop-loading-title short" />
                  <div className="spotc-shop-skeleton spotc-shop-loading-price" />
                  <div className="spotc-shop-skeleton spotc-shop-loading-action" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <style jsx global>{`
          .spotc-shop-loading-shell {
            width: 100%;
            max-width: 1440px;
            margin: 0 auto;
            padding: 12px 16px 32px;
            box-sizing: border-box;
            min-height: 1120px;
          }

          .spotc-shop-loading-toolbar {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 46px;
            margin-bottom: 16px;
            overflow: hidden;
          }

          .spotc-shop-loading-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 18px;
            width: 100%;
          }

          .spotc-shop-loading-card {
            min-width: 0;
            min-height: 490px;
            overflow: hidden;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 18px;
            background: #fff;
          }

          .spotc-shop-skeleton {
            position: relative;
            overflow: hidden;
            background: #f1f1f1;
          }

          .spotc-shop-skeleton::after {
            content: '';
            position: absolute;
            inset: 0;
            transform: translateX(-100%);
            background: linear-gradient(
              90deg,
              transparent,
              rgba(255, 255, 255, 0.62),
              transparent
            );
            animation: spotcShopSkeletonShimmer 1.35s infinite;
          }

          .spotc-shop-skeleton-tab {
            flex: 0 0 112px;
            height: 38px;
            border-radius: 999px;
          }

          .spotc-shop-loading-image {
            width: 100%;
            aspect-ratio: 4 / 5;
          }

          .spotc-shop-loading-copy {
            padding: 12px;
          }

          .spotc-shop-loading-title {
            width: 88%;
            height: 15px;
            border-radius: 6px;
            margin-bottom: 8px;
          }

          .spotc-shop-loading-title.short {
            width: 60%;
          }

          .spotc-shop-loading-price {
            width: 42%;
            height: 18px;
            border-radius: 6px;
            margin: 15px 0 14px;
          }

          .spotc-shop-loading-action {
            width: 100%;
            height: 42px;
            border-radius: 11px;
          }

          @keyframes spotcShopSkeletonShimmer {
            100% {
              transform: translateX(100%);
            }
          }

          @media (max-width: 1000px) {
            .spotc-shop-loading-grid {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
          }

          @media (max-width: 700px) {
            .spotc-shop-loading-shell {
              padding: 8px 10px 24px;
              min-height: 2140px;
            }

            .spotc-shop-loading-toolbar {
              margin-bottom: 12px;
            }

            .spotc-shop-skeleton-tab {
              flex-basis: 96px;
              height: 36px;
            }

            .spotc-shop-loading-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              column-gap: 10px;
              row-gap: 14px;
            }

            .spotc-shop-loading-card {
              min-height: 500px;
              border-radius: 14px;
            }

            .spotc-shop-loading-copy {
              padding: 10px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .spotc-shop-skeleton::after {
              animation: none;
            }
          }
        `}</style>
      </>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Firebase could not load products"
        body={`${error} Project: ${
          firebaseProjectId || 'not configured'
        }`}
      />
    );
  }

  if (!firebaseReady) {
    return (
      <EmptyState
        title="Firebase configuration is missing"
        body="Create .env.local beside package.json, then restart npm.cmd run dev."
      />
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        title="Firebase connected — no available products found"
        body="BusinessProducts was read successfully, but no active in-stock products matched the current rules."
      />
    );
  }

  return (
    <>
      <div
        className="spotc-shop-trust-strip"
        aria-label="Shopping assurances"
      >
        <span>🔒 Secure Checkout</span>
        <i aria-hidden="true">•</i>
        <span>🤝 Cash on Delivery</span>
        <i aria-hidden="true">•</i>
        <span>📍 Local Delivery Only</span>
      </div>

      <section className="spotc-shop-category-toolbar">
        <div
          className="spotc-main-category-strip"
          aria-label={t('Main product categories')}
        >
          {mainCategories.map((categoryName) => (
            <button
              key={categoryName}
              type="button"
              className={
                mainCategory === categoryName
                  ? 'active'
                  : ''
              }
              onClick={() => {
                if (categoryName === mainCategory) {
                  return;
                }

                // Update the selected category immediately without triggering
                // a Next.js navigation/re-render cycle.
                setMainCategory(categoryName);
                setSubCategory('All');
                setSearch('');

                window.dispatchEvent(
                  new CustomEvent('spotc-search-sync', {
                    detail: '',
                  }),
                );

                // IMPORTANT:
                // Main-category changes must create a REAL browser history entry.
                // Using replaceState removes the previous category from history,
                // which makes Android swipe-back jump to an older product/page.
                const params = new URLSearchParams();
                params.set('category', categoryName);

                router.push(
                  `/shop?${params.toString()}`,
                  { scroll: false },
                );
              }}
            >
              {categoryLabel(categoryName)}
            </button>
          ))}
        </div>

        <div className="sort-box spotc-shop-sort-box spotc-shop-sort-desktop">
          <SlidersHorizontal size={18} />

          <select
            value={sort}
            aria-label={t('Sort products')}
            onChange={(event) =>
              setSort(event.target.value)
            }
          >
            {[
              'Featured',
              'Newest',
              'Price: Low to High',
              'Price: High to Low',
              'Biggest Discount',
            ].map((option) => (
              <option key={option} value={option}>{t(option)}</option>
            ))}
          </select>
        </div>

        <div
          className="spotc-shop-sort-mobile"
          aria-label={t('Sort products')}
          title={t('Sort products')}
        >
          <SlidersHorizontal size={19} aria-hidden="true" />

          <select
            value={sort}
            aria-label={t('Sort products')}
            onChange={(event) =>
              setSort(event.target.value)
            }
          >
            {[
              'Featured',
              'Newest',
              'Price: Low to High',
              'Price: High to Low',
              'Biggest Discount',
            ].map((option) => (
              <option key={option} value={option}>{t(option)}</option>
            ))}
          </select>
        </div>
      </section>

      {search.trim() ? (
        <div className="spotc-global-search-status" role="status">
          {language === 'ta' ? 'தேடல் முடிவுகள்' : 'Search results for'}{' '}<strong>“{search.trim()}”</strong> · {filteredProducts.length}{' '}
          {filteredProducts.length === 1 ? t('product') : t('products')}
        </div>
      ) : (
        <div
          className="spotc-sub-category-strip"
          aria-label={`${mainCategory} subcategories`}
        >
          {subCategories.map((categoryName) => (
            <button
              key={categoryName}
              type="button"
              className={
                subCategory === categoryName
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setSubCategory(categoryName);

                if (search.trim()) {
                  setSearch('');

                  window.dispatchEvent(
                    new CustomEvent('spotc-search-sync', {
                      detail: '',
                    }),
                  );
                }

                const params = new URLSearchParams();
                params.set('category', mainCategory);

                if (categoryName !== 'All') {
                  params.set('subcategory', categoryName);
                }

                // Subcategory changes also need a real history entry so
                // mobile swipe-back restores the exact previous Shop state.
                router.push(
                  `/shop?${params.toString()}`,
                  { scroll: false },
                );
              }}
            >
              {categoryLabel(categoryName)}
            </button>
          ))}
        </div>
      )}

      {mounted &&
        compare.size > 0 &&
        createPortal(
          <aside
            className="spotc-compare-float"
            role="status"
            aria-live="polite"
          >
            <div className="spotc-compare-float__left">
              <span className="spotc-compare-float__icon">
                <GitCompareArrows size={18} />
              </span>

              <div className="spotc-compare-float__copy">
                <strong>
                  {compare.size} {compare.size > 1 ? t('products selected') : t('product selected')}
                </strong>

                <span>
                  {t('Select up to 3 products and ask friends.')}
                </span>
              </div>
            </div>

           <button
  type="button"
  onClick={() =>
    void openComparisonShoppingCircle()
  }
  disabled={compareBusy}
>
  {compareBusy
    ? t('Creating circle…')
    : t('Ask Friends')}
</button>
          </aside>,
          document.body,
        )}

      {mounted &&
        showTryAtHomeInfo &&
        createPortal(
          <div
            className="try-at-home-info-backdrop"
            role="presentation"
            onClick={() => setShowTryAtHomeInfo(false)}
          >
            <div
              className="try-at-home-info-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="try-at-home-info-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="try-at-home-info-header">
                <strong id="try-at-home-info-title">
                  {t('Try at Home')}
                </strong>
                <button
                  type="button"
                  className="try-at-home-info-close"
                  aria-label={t('Close')}
                  onClick={() => setShowTryAtHomeInfo(false)}
                >
                  ×
                </button>
              </div>

              <div className="try-at-home-info-content">
                <p>
                  {language === 'ta'
                    ? 'வீட்டிலேயே பொருட்களை பார்த்து/முயற்சி செய்து வாங்கலாம்.'
                    : 'Select eligible items and try them at home before you decide to buy.'}
                </p>
                <ul>
                  <li>
                    {language === 'ta'
                      ? '₹100 மற்றும் அதற்கு மேற்பட்ட dresses.'
                      : 'Dresses priced ₹100 and above are eligible.'}
                  </li>
                  <li>
                    {language === 'ta'
                      ? '₹80 மற்றும் அதற்கு மேற்பட்ட earrings.'
                      : 'Earrings priced ₹80 and above are eligible.'}
                  </li>
                  <li>
                    {language === 'ta'
                      ? 'ஒரே booking-ல் அதிகபட்சம் 2 dresses மற்றும் 2 earrings தேர்வு செய்யலாம்.'
                      : 'Choose up to 2 dresses and up to 2 earrings in one booking.'}
                  </li>
                  <li>
                    {language === 'ta'
                      ? 'ஒரு user-க்கு ஒரு நாளில் 1 Try at Home booking மட்டும்.'
                      : 'One Try at Home booking per user per day.'}
                  </li>
                  <li>
                    {language === 'ta'
                      ? 'Checkout-ல் கிடைக்கும் நேர slot-ஐ தேர்வு செய்யலாம்.'
                      : 'Choose an available Try at Home time slot at checkout.'}
                  </li>
                </ul>
              </div>

              <button
                type="button"
                className="try-at-home-info-done"
                onClick={() => setShowTryAtHomeInfo(false)}
              >
                {t('Got it')}
              </button>
            </div>
          </div>,
          document.body,
        )}

      <section
        className={`product-grid rich ${
          hideBusinessName
            ? 'business-product-grid'
            : 'shop-product-grid'
        }`}
      >
        {filteredProducts.map((item, itemIndex) => {
          const price = priceOf(item);
          const oldPrice = oldPriceOf(item);
          const discount = discountOf(item);
          const comboEligible = isComboEligible(item, price);
          const tryAtHomeKind = tryAtHomeKindOf(item);
          const tryAtHomeEligible = tryAtHomeKind !== null;
          const image = imageOf(item);
          const stock = numberValue(
            item.stock_qty ??
              item.stock_quantity,
          );
          const isSaving =
            savingId === item.id;

          return (
            <article
              className="product-card rich"
              key={item.id}
            >
              <div className="product-image-wrap">
                <Link
                  href={`/product/${item.id}`}
                  className="product-image"
                  aria-label={`${t('Open')} ${localizedTitleOf(item)}`}
                >
                  {image ? (
                    <img
                      src={image}
                      alt={localizedTitleOf(item)}
                      loading={itemIndex < 2 ? 'eager' : 'lazy'}
                      decoding="async"
                      fetchPriority={itemIndex === 0 ? 'high' : 'auto'}
                      width={640}
                      height={800}
                    />
                  ) : null}
                </Link>

                {discount > 0 && (
                  <span className="discount-chip">
                    {discount}% OFF
                  </span>
                )}

                <button
                  type="button"
                  aria-label={
                    saved.has(item.id)
                      ? 'Remove saved product'
                      : 'Save product'
                  }
                  className={`heart-btn ${
                    saved.has(item.id) ? 'on' : ''
                  }`}
                  disabled={isSaving}
                  onClick={() =>
                    void toggleSavedProduct(item)
                  }
                >
                  <Heart
  size={19}
  color={saved.has(item.id) ? "#ef4444" : "#171717"}
  strokeWidth={2}
  fill={saved.has(item.id) ? "#ef4444" : "none"}
/>
                </button>

                {comboEligible && (
                  <Link
                    href={`/combo/${encodeURIComponent(String(item.id))}?action=cart`}
                    className="product-image-gift-badge"
                    aria-label={`${t('Choose Combo')} · ${localizedTitleOf(item)}`}
                  >
                    <Gift size={16} strokeWidth={2.4} aria-hidden="true" />
                    <span>
                      <strong>{t('Choose Combo')}</strong>
                    </span>
                  </Link>
                )}
              </div>

              <div className="product-copy">
                <Link
                  href={`/product/${item.id}`}
                  className="product-title-link"
                >
                  <h3>{localizedTitleOf(item)}</h3>
                </Link>

                <div className="price">
                  <strong>
                    ₹{Math.round(price)}
                  </strong>

                  {oldPrice > price && (
                    <del>
                      ₹{Math.round(oldPrice)}
                    </del>
                  )}

                  {discount > 0 && (
                    <span>
                      {t('Save')} ₹{Math.round(oldPrice - price)}
                    </span>
                  )}
                </div>

                <div className="product-try-home-row">
                  {tryAtHomeEligible ? (
                    <div className="product-try-home-left">
                      <label
                        className="product-try-home-option"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={tryAtHomeIds.has(String(item.id))}
                          onChange={() => toggleTryAtHome(item)}
                          aria-label={`${t('Try at home')} · ${localizedTitleOf(item)}`}
                        />
                        <span>{t('Try at home')}</span>
                      </label>

                      <button
                        type="button"
                        className="product-try-home-info-button"
                        aria-label={t('Try at Home information')}
                        title={t('Try at Home information')}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setShowTryAtHomeInfo(true);
                        }}
                      >
                        <Info size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}

                  <small className="product-stock-text">
                    {stock > 0
                      ? language === 'ta'
                        ? `${stock} மட்டும் உள்ளது`
                        : `${stock} left`
                      : t('Out of stock')}
                  </small>
                </div>

<div className="product-actions">
                  <button
                    type="button"
                    className="product-add-button product-add-to-cart-button"
                    disabled={!delivery.canPurchase}
                    aria-disabled={!delivery.canPurchase}
                    title={
                      delivery.canPurchase
                        ? t('Add to cart')
                        : delivery.status === 'outside'
                          ? 'Ordering will be available in your area shortly'
                          : t('Enable location to check delivery availability')
                    }
                    onClick={() => {
                      if (!delivery.canPurchase) {
                        if (delivery.status === 'outside') {
                          alert(t('SPOTC is coming to your area shortly. You can browse all products now, but ordering is not available yet.'));
                        } else {
                          alert(t('Please enable location so SPOTC can check delivery availability.'));
                          delivery.requestLocation();
                        }
                        return;
                      }

                      if (comboEligible) {

                        try {
                          window.sessionStorage.setItem(
                            `spotc-combo-base:${item.id}`,
                            JSON.stringify({
                              productId: String(item.id),
                              size: '',
                              color: '',
                              qty: 1,
                              tryAtHome: tryAtHomeIds.has(String(item.id)),
                              action: 'cart',
                            }),
                          );
                        } catch {
                          // Combo page can still load the product.
                        }

                        router.push(
                          `/combo/${encodeURIComponent(String(item.id))}?action=cart`,
                        );
                        return;
                      }

                      addProduct(item, {
                        tryAtHome: tryAtHomeIds.has(String(item.id)),
                      });
                      alert(t('1 product added'));
                    }}
                  >
                    <ShoppingBag size={16} />
                    <span>{delivery.canPurchase ? t('Add to Cart') : t('Browse')}</span>
                  </button>

                  <button
                    type="button"
                    className="product-buy-now-button"
                    disabled={!delivery.canPurchase}
                    aria-disabled={!delivery.canPurchase}
                    title={
                      delivery.canPurchase
                        ? t('Buy now')
                        : delivery.status === 'outside'
                          ? 'Ordering will be available in your area shortly'
                          : t('Enable location to check delivery availability')
                    }
                    onClick={() => {
                      if (!delivery.canPurchase) {
                        if (delivery.status === 'outside') {
                          alert(t('SPOTC is coming to your area shortly. You can browse all products now, but ordering is not available yet.'));
                        } else {
                          alert(t('Please enable location so SPOTC can check delivery availability.'));
                          delivery.requestLocation();
                        }
                        return;
                      }

                      if (comboEligible) {

                        try {
                          window.sessionStorage.setItem(
                            `spotc-combo-base:${item.id}`,
                            JSON.stringify({
                              productId: String(item.id),
                              size: '',
                              color: '',
                              qty: 1,
                              tryAtHome: tryAtHomeIds.has(String(item.id)),
                              action: 'buy',
                            }),
                          );
                        } catch {
                          // Combo page can still load the product.
                        }

                        router.push(
                          `/combo/${encodeURIComponent(String(item.id))}?action=buy`,
                        );
                        return;
                      }

                      // Buy Now must not increase the quantity when this exact
                      // product/variant is already in the cart. Add it only when it
                      // is not already present, then continue to the cart.
                      let alreadyInCart = false;

                      if (typeof window !== 'undefined') {
                        try {
                          const storedCart = window.localStorage.getItem('spotc_cart');
                          const parsedCart = storedCart ? JSON.parse(storedCart) : [];

                          if (Array.isArray(parsedCart)) {
                            const productId = String(item.id);
                            const productSize = textValue(item.size || '');
                            const productColor = textValue(item.color || '');

                            alreadyInCart = parsedCart.some((rawItem) => {
                              if (!rawItem || typeof rawItem !== 'object') return false;

                              const cartItem = rawItem as Record<string, unknown>;
                              const isFreeGift =
                                cartItem.isFreeGift === true ||
                                cartItem.is_free_gift === true;

                              if (isFreeGift) return false;

                              return (
                                String(cartItem.id ?? '') === productId &&
                                textValue(cartItem.size || '') === productSize &&
                                textValue(cartItem.color || '') === productColor
                              );
                            });
                          }
                        } catch {
                          alreadyInCart = false;
                        }
                      }

                      if (!alreadyInCart) {
                        addProduct(item, {
                          tryAtHome: tryAtHomeIds.has(String(item.id)),
                        });
                      }

                      router.push('/cart');
                    }}
                  >
                    <ShoppingBag size={16} />
                    <span>{delivery.canPurchase ? t('Buy Now') : t('Browse')}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!filteredProducts.length && (
        <EmptyState
          title={t('No products found')}
          body={t('Try a different search term or category.')}
        />
      )}

      <style jsx global>{`
        /*
         * PERFORMANCE
         * -----------
         * Let the browser skip layout/paint work for product cards that are
         * far below the viewport. This keeps category changes and scrolling
         * responsive even when a category contains many products.
         */
        .shop-product-grid > .product-card.rich {
          content-visibility: auto;
          contain-intrinsic-size: 520px;
        }

        .product-card.rich .product-image {
          display: block;
          overflow: hidden;
          background: #f4f1ec;
        }

        .product-card.rich .product-image img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
        }

        .spotc-global-search-status {
          width: 100%;
          margin: 0 0 14px;
          padding: 10px 2px;
          color: #5f574d;
          font-size: 13px;
          line-height: 1.35;
        }

        .spotc-global-search-status strong {
          color: #171717;
          font-weight: 800;
        }

        .product-add-button:disabled,
        .product-buy-now-button:disabled {
          opacity: 0.55 !important;
          cursor: not-allowed !important;
        }

        .product-card.rich .product-actions {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 8px !important;
          width: 100% !important;
        }

        .product-card.rich .product-add-to-cart-button,
        .product-card.rich .product-buy-now-button {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 40px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 7px !important;
          padding: 0 12px !important;
          border-radius: 10px !important;
          font: inherit !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
          cursor: pointer !important;
          box-sizing: border-box !important;
          white-space: nowrap !important;
        }

        .product-card.rich .product-add-to-cart-button {
          border: 1px solid #d8d1c7 !important;
          background: #ffffff !important;
          color: #171717 !important;
        }

        .product-card.rich .product-buy-now-button {
          border: 1px solid #171717 !important;
          background: #171717 !important;
          color: #ffffff !important;
        }

        .product-card.rich .product-add-to-cart-button:hover {
          background: #f7f4ee !important;
        }

        .product-card.rich .product-buy-now-button:hover {
          background: #000000 !important;
        }

        @media (max-width: 700px) {
          .product-card.rich .product-actions {
            gap: 6px !important;
          }

          .product-card.rich .product-add-to-cart-button,
          .product-card.rich .product-buy-now-button {
            min-height: 38px !important;
            padding: 0 8px !important;
            font-size: 11px !important;
            border-radius: 9px !important;
          }
        }

        /*
         * SHOP PRODUCT CARD — CHOOSE COMBO BADGE ON PRODUCT IMAGE
         * Dresses priced at ₹100 or more can show this combo entry point.
         */
        .product-card.rich .product-image-gift-badge {
          position: absolute;
          left: 14px;
          bottom: 14px;
          z-index: 6;
          width: fit-content;
          max-width: calc(100% - 28px);
          min-height: 34px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 2px solid #ffffff;
          border-radius: 999px;
          color: #171717;
          background: linear-gradient(135deg, #ffd84d 0%, #ffb800 100%);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.22);
          font-size: 13px;
          font-weight: 800;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .product-card.rich .product-image-gift-badge:hover {
          transform: translateY(-1px);
          box-shadow: 0 7px 18px rgba(0, 0, 0, 0.24);
        }

        .product-card.rich .product-image-gift-badge:active {
          transform: translateY(0);
        }

        .product-card.rich .product-image-gift-badge strong {
          font-weight: 900;
        }

        .product-card.rich .product-image-gift-badge svg {
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
        }

        @media (max-width: 700px) {
          .product-card.rich .product-image-gift-badge {
            left: 10px;
            bottom: 10px;
            max-width: calc(100% - 20px);
            min-height: 31px;
            padding: 0 10px;
            gap: 5px;
            font-size: 11px;
          }

          .product-card.rich .product-image-gift-badge svg {
            width: 14px;
            height: 14px;
            flex-basis: 14px;
          }
        }

        /*
         * SHOP PRODUCT CARD — TRY AT HOME + STOCK ROW
         */
        .product-card.rich .product-free-gift-chip {
          width: fit-content;
          max-width: 100%;
          min-height: 28px;
          margin: 0 0 10px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          border: 1px solid rgba(247, 183, 51, 0.42);
          border-radius: 9px;
          color: #3a2505;
          background: rgba(255, 250, 240, 0.96);
          box-shadow: none;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
          box-sizing: border-box;
          text-shadow: none;
        }

        .product-card.rich .product-free-gift-chip:hover {
          transform: none;
          box-shadow: none;
        }

        .product-card.rich .product-free-gift-chip:active {
          transform: none;
        }

        .product-card.rich .product-free-gift-chip svg {
          width: 14px;
          height: 14px;
          flex: 0 0 14px;
        }

        .product-card.rich .product-stock-row {
          width: 100%;
          min-height: 25px;
          margin: 7px 0 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .product-card.rich .product-delivery-badge {
          min-width: 0;
          height: 24px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 999px;
          color: #087b3f;
          background: #e8f7ed;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }

        .product-card.rich .product-delivery-badge svg {
          width: 13px;
          height: 13px;
          flex: 0 0 13px;
        }

        .product-card.rich .product-stock-text {
          flex: 0 0 auto;
          margin: 0;
          color: #7b6a43;
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
        }

        .product-card.rich .product-try-home-row {
          width: 100%;
          min-height: 30px;
          margin: 7px 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .product-card.rich .product-try-home-option {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #171717;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          cursor: pointer;
          user-select: none;
        }

        .product-card.rich .product-try-home-option input {
          width: 17px;
          height: 17px;
          margin: 0;
          flex: 0 0 17px;
          accent-color: #171717;
          cursor: pointer;
        }

        @media (max-width: 700px) {
          .product-card.rich .product-try-home-row {
            min-height: 27px;
            margin-top: 6px;
            margin-bottom: 8px;
            gap: 6px;
          }

          .product-card.rich .product-try-home-option {
            gap: 5px;
            font-size: 11px;
          }

          .product-card.rich .product-try-home-option input {
            width: 15px;
            height: 15px;
            flex-basis: 15px;
          }

          .product-card.rich .product-stock-text {
            font-size: 11px;
          }
        }

        /*
         * PRODUCT CARD CONTENT SPACING FIX
         * Keeps title, combo, price, Try at Home and actions compact
         * and removes the large empty gaps visible in the card.
         */
        .product-card.rich .product-copy {
          padding-top: 14px !important;
          padding-bottom: 14px !important;
        }

        .product-card.rich .product-title-link,
        .product-card.rich .product-title-link h3 {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .product-card.rich .product-free-gift-chip {
          margin-top: 0 !important;
          margin-bottom: 12px !important;
        }

        .product-card.rich .price {
          margin-top: 0 !important;
          margin-bottom: 6px !important;
        }

.product-card.rich .product-actions {
          margin-top: 0 !important;
        }

        @media (max-width: 700px) {
          .product-card.rich .product-free-gift-chip {
            max-width: 100%;
            min-height: 27px;
            margin-bottom: 9px;
            padding: 0 8px;
            gap: 5px;
            border-radius: 8px;
            font-size: 11px;
          }

          .product-card.rich .product-free-gift-chip svg {
            width: 13px;
            height: 13px;
            flex-basis: 13px;
          }

          .product-card.rich .product-stock-row {
            margin-top: 6px;
            margin-bottom: 8px;
          }

          .product-card.rich .product-delivery-badge {
            height: 23px;
            padding: 0 8px;
            gap: 4px;
            font-size: 11px;
          }

          .product-card.rich .product-stock-text {
            font-size: 11px;
          }


          .product-card.rich .product-copy {
            padding-top: 12px !important;
            padding-bottom: 12px !important;
          }

          .product-card.rich .product-stock-row {
            margin-top: 6px !important;
            margin-bottom: 8px !important;
          }

          .product-card.rich .product-free-gift-chip {
            margin-bottom: 10px !important;
          }

          .product-card.rich .price {
            margin-top: 0 !important;
            margin-bottom: 5px !important;
          }

.product-card.rich .product-actions {
            margin-top: 0 !important;
          }
        }

        .spotc-compare-float {
          position: fixed !important;
          top: 88px !important;
          left: 50% !important;
          right: auto !important;
          bottom: auto !important;
          z-index: 2147483000 !important;

          width: min(1360px, calc(100vw - 40px)) !important;
          min-height: 62px !important;
          margin: 0 !important;
          padding: 10px 12px 10px 15px !important;

          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 18px !important;
          flex-wrap: nowrap !important;

          transform: translateX(-50%) !important;

          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 17px !important;
          color: #ffffff !important;
          background: linear-gradient(
  135deg,
  #0b3d91 0%,
  #1d4ed8 55%,
  #2563eb 100%
) !important;

          box-shadow:
            0 20px 50px rgba(29, 78, 216, 0.35),
  0 8px 18px rgba(11, 61, 145, 0.25) !important;

          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;

          animation: spotcCompareFloatIn 180ms ease-out;
        }

        .spotc-compare-float__left {
          min-width: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 11px !important;
        }

        .spotc-compare-float__icon {
          width: 34px !important;
          height: 34px !important;
          flex: 0 0 34px !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 10px !important;
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.18) !important;
        }

        .spotc-compare-float__copy {
          min-width: 0 !important;
          display: flex !important;
          align-items: baseline !important;
          gap: 10px !important;
        }

        .spotc-compare-float__copy strong {
          flex: 0 0 auto !important;
          margin: 0 !important;
          color: #ffffff !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
        }

        .spotc-compare-float__copy span {
          min-width: 0 !important;
          overflow: hidden !important;
          color: rgba(255, 255, 255, 0.68) !important;
          font-size: 13px !important;
          line-height: 1.2 !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .spotc-compare-float > button {
          flex: 0 0 auto !important;
          min-width: 132px !important;
          min-height: 40px !important;
          margin: 0 !important;
          padding: 9px 18px !important;

          border: 0 !important;
          border-radius: 999px !important;

          color: #171717 !important;
          background: #ffffff !important;

          cursor: pointer !important;
          font-size: 14px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .spotc-compare-float > button:hover {
          background: #f1f1f1 !important;
        }

        @keyframes spotcCompareFloatIn {
          from {
            opacity: 0;
            transform: translate(-50%, -12px);
          }

          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        /*
         * BUSINESS PAGE MOBILE GRID FIX
         * Applied only when ProductGrid is rendered with hideBusinessName=true.
         * The /shop page keeps its current working width and alignment.
         */
        @media (max-width: 700px) {
          .business-product-grid {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            column-gap: 10px !important;
            row-gap: 14px !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }

          .business-product-grid > .product-card.rich {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .business-product-grid .product-image-wrap,
          .business-product-grid .product-image,
          .business-product-grid .product-copy,
          .business-product-grid .product-title-link,
          .business-product-grid .product-actions {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          .business-product-grid .product-copy {
            padding-left: 11px !important;
            padding-right: 11px !important;
          }

          .business-product-grid .product-title-link,
          .business-product-grid .product-title-link h3 {
            overflow-wrap: anywhere !important;
            word-break: normal !important;
          }

          .business-product-grid .product-stock-row {
            min-width: 0 !important;
            gap: 4px !important;
            overflow: hidden !important;
          }

          .business-product-grid .product-delivery-badge {
            min-width: 0 !important;
            max-width: calc(100% - 40px) !important;
            padding-left: 7px !important;
            padding-right: 7px !important;
            overflow: hidden !important;
          }

          .business-product-grid .product-delivery-badge span {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .business-product-grid .product-stock-text {
            flex: 0 0 auto !important;
            max-width: 38px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .business-product-grid .price {
            min-width: 0 !important;
            max-width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: baseline !important;
            gap: 3px 6px !important;
          }

          .business-product-grid .price strong,
          .business-product-grid .price del,
          .business-product-grid .price span {
            max-width: 100% !important;
            overflow-wrap: anywhere !important;
          }

          .business-product-grid .product-actions {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: stretch !important;
            gap: 7px !important;
          }

          .business-product-grid .product-compare-online,
          .business-product-grid .product-add-button {
            min-width: 0 !important;
            max-width: 100% !important;
            height: 44px !important;
            margin: 0 !important;
            padding: 0 9px !important;
            box-sizing: border-box !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 5px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
          }

          .business-product-grid .product-compare-online span {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .business-product-grid .product-add-button {
            width: auto !important;
            min-width: 70px !important;
            flex: 0 0 auto !important;
          }
        }

        @media (max-width: 700px) {
          .spotc-compare-float {
            top: auto !important;
            right: 10px !important;
            bottom: calc(58px + env(safe-area-inset-bottom)) !important;
            left: 10px !important;

            width: auto !important;
            min-height: 60px !important;
            padding: 9px 10px !important;
            gap: 10px !important;

            transform: none !important;
            border-radius: 16px !important;

            animation: spotcCompareFloatMobileIn 180ms ease-out;
          }

          .spotc-compare-float__left {
            gap: 8px !important;
          }

          .spotc-compare-float__icon {
            width: 32px !important;
            height: 32px !important;
            flex-basis: 32px !important;
          }

          .spotc-compare-float__copy {
            display: block !important;
          }

          .spotc-compare-float__copy strong {
            display: block !important;
            font-size: 13px !important;
          }

          .spotc-compare-float__copy span {
            display: block !important;
            max-width: 145px !important;
            margin-top: 3px !important;
            font-size: 10px !important;
          }

          .spotc-compare-float > button {
            min-width: auto !important;
            min-height: 38px !important;
            padding: 8px 13px !important;
            font-size: 12px !important;
          }

          @keyframes spotcCompareFloatMobileIn {
            from {
              opacity: 0;
              transform: translateY(12px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        }
          /* =====================================================
             SHOP CATEGORY NAVIGATION
             Main categories: Toys / Earrings / Girl Dress
             Toys: grouped into 6 simple customer-facing categories
             Girl Dress: fixed age groups from 0-12 Years
          ===================================================== */

          .spotc-shop-trust-strip {
            width: 100%;
            min-height: 42px;

            /*
             * Pull the assurance strip up to the top edge of the Shop content.
             * The Shop page/container has spacing above ProductGrid; this removes
             * that visible cream gap so the trust strip sits directly below the
             * site header.
             */
            margin: -24px 0 12px;
            padding: 9px 16px;

            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;

            overflow-x: auto;
            overflow-y: hidden;

            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;

            color: #ffffff;
            background:
              linear-gradient(
                180deg,
                #211a14 0%,
                #15110e 100%
              );

            box-shadow:
              0 5px 16px rgba(0, 0, 0, 0.10);

            box-sizing: border-box;

            font-size: 12px;
            font-weight: 750;
            line-height: 1.2;

            white-space: nowrap;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          .spotc-shop-trust-strip::-webkit-scrollbar {
            display: none;
          }

          .spotc-shop-trust-strip span {
            flex: 0 0 auto;
            color: #ffffff;
          }

          .spotc-shop-trust-strip i {
            flex: 0 0 auto;
            color: rgba(255, 255, 255, 0.42);
            font-style: normal;
            font-weight: 800;
          }

          .spotc-shop-category-toolbar {
            width: 100%;
            margin: 0 0 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
          }

          .spotc-main-category-strip {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 9px;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          .spotc-main-category-strip::-webkit-scrollbar,
          .spotc-sub-category-strip::-webkit-scrollbar {
            display: none;
          }

          .spotc-main-category-strip button,
          .spotc-sub-category-strip button {
            flex: 0 0 auto;
            border: 1px solid #ded8cf;
            border-radius: 999px;
            color: #655f58;
            background: #ffffff;
            font: inherit;
            line-height: 1;
            white-space: nowrap;
            cursor: pointer;
          }

          .spotc-main-category-strip button {
            min-height: 42px;
            padding: 0 20px;
            font-size: 14px;
            font-weight: 750;
          }

          .spotc-main-category-strip button.active {
            border-color: #171717;
            color: #ffffff;
            background: #171717;
          }

          .spotc-shop-sort-box {
            width: auto !important;
            min-width: 185px !important;
            margin: 0 0 0 auto !important;
            flex: 0 0 auto;
          }

          .spotc-sub-category-strip {
            width: 100%;
            min-width: 0;
            margin: 0 0 16px;
            padding: 0 0 1px;
            display: flex;
            align-items: center;
            gap: 9px;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          .spotc-sub-category-strip button {
            min-height: 36px;
            padding: 0 15px;
            font-size: 13px;
            font-weight: 650;
          }

          .spotc-sub-category-strip button.active {
            border-color: #e0a12e;
            color: #7c5000;
            background: #fff5df;
          }

          .spotc-shop-sort-mobile {
            display: none;
          }

          @media (max-width: 700px) {
            .spotc-shop-trust-strip {
              /*
               * Mobile: remove the full gap between the 62px sticky header and
               * the first Shop control. The strip becomes the first dark band
               * immediately below the header.
               */
              width: calc(100% + 32px);
              min-height: 40px;

              margin:
                -24px
                -16px
                10px;

              padding: 8px 14px;

              justify-content: center;
              gap: 7px;

              border-right: 0;
              border-left: 0;
              border-radius: 0;

              color: #ffffff;
              background:
                linear-gradient(
                  180deg,
                  #211a14 0%,
                  #15110e 100%
                );

              box-shadow:
                0 4px 12px rgba(0, 0, 0, 0.10);

              font-size: 10.5px;
            }

            .spotc-shop-category-toolbar {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 8px;
            }

            /* Categories use all remaining width and swipe horizontally. */
            .spotc-main-category-strip {
              flex: 1 1 auto;
              width: auto;
              min-width: 0;
              gap: 8px;
              padding: 0 1px 2px;
              scroll-behavior: smooth;
              overscroll-behavior-x: contain;
              scroll-snap-type: x proximity;
            }

            .spotc-main-category-strip button {
              min-height: 38px;
              padding: 0 14px;
              font-size: 13px;
              scroll-snap-align: start;
            }

            /* Mobile uses a separate real icon-only sort control.
               Hide the desktop Featured dropdown completely. */
            .spotc-shop-sort-desktop {
              display: none !important;
            }

            .spotc-shop-sort-mobile {
              position: relative;
              flex: 0 0 42px;
              width: 42px;
              min-width: 42px;
              max-width: 42px;
              height: 42px;
              min-height: 42px;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
              margin: 0;
              overflow: hidden;
              box-sizing: border-box;
              border: 1px solid #d8d8d8;
              border-radius: 12px;
              background: #ffffff;
              color: #222222;
            }

            .spotc-shop-sort-mobile > svg {
              width: 19px;
              height: 19px;
              flex: 0 0 19px;
              pointer-events: none;
            }

            .spotc-shop-sort-mobile select {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              opacity: 0;
              cursor: pointer;
              appearance: none;
              -webkit-appearance: none;
            }

            .spotc-sub-category-strip {
              gap: 7px;
              margin-bottom: 13px;
            }

            .spotc-sub-category-strip button {
              min-height: 33px;
              padding: 0 12px;
              font-size: 11px;
            }
          }

          @media (max-width: 420px) {
            .spotc-main-category-strip button {
              padding: 0 12px;
              font-size: 12px;
            }

            .spotc-shop-sort-mobile {
              flex-basis: 40px;
              width: 40px;
              min-width: 40px;
              max-width: 40px;
              height: 40px;
              min-height: 40px;
            }
          }


          /* PRODUCT TITLE: ONE LINE + ELLIPSIS */
          .product-card.rich .product-title-link,
          .product-card.rich .product-title-link h3 {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
          }


          /* PRODUCT CARD TITLE + PRICE ALIGNMENT */
          .product-card.rich .product-title-link h3 {
            margin: 0 0 4px !important;
            font-weight: 500 !important;
            line-height: 1.25 !important;
          }

          .product-card.rich .price {
            margin-top: 0 !important;
            margin-bottom: 7px !important;
            display: flex !important;
            align-items: baseline !important;
            gap: 7px !important;
            line-height: 1.2 !important;
          }

          .product-card.rich .price strong {
            font-weight: 700 !important;
          }

          @media (max-width: 700px) {
            .product-card.rich .product-title-link h3 {
              margin-bottom: 3px !important;
              font-weight: 500 !important;
              line-height: 1.2 !important;
            }

            .product-card.rich .price {
              margin-top: 0 !important;
              margin-bottom: 6px !important;
              gap: 5px !important;
            }
          }


          /* FINAL PRODUCT CARD SPACING / ALIGNMENT */
          .product-card.rich .product-content,
          .product-card.rich .product-info {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .product-card.rich .product-title-link h3 {
            margin: 0 0 3px !important;
            font-weight: 500 !important;
            line-height: 1.2 !important;
          }

          .product-card.rich .price {
            margin: 0 0 10px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: baseline !important;
            gap: 6px !important;
            line-height: 1.15 !important;
          }

          .product-card.rich .product-try-home-row {
            margin: 0 0 10px !important;
            min-height: 22px !important;
            padding: 0 !important;
            align-items: center !important;
          }

          .product-card.rich .product-actions {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }

          @media (max-width: 700px) {
            .product-card.rich .product-content,
            .product-card.rich .product-info {
              padding-left: 16px !important;
              padding-right: 16px !important;
            }

            .product-card.rich .product-title-link h3 {
              margin-bottom: 3px !important;
              line-height: 1.18 !important;
            }

            .product-card.rich .price {
              margin-bottom: 9px !important;
              gap: 5px !important;
            }

            .product-card.rich .product-try-home-row {
              margin-bottom: 9px !important;
              min-height: 21px !important;
            }
          }



          .product-card.rich .product-try-home-left {
            display: inline-flex !important;
            align-items: center !important;
            gap: 5px !important;
            min-width: 0;
          }

          .product-card.rich .product-try-home-info-button {
            width: 20px;
            height: 20px;
            padding: 0;
            border: 0;
            border-radius: 999px;
            background: transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #555;
            flex: 0 0 auto;
          }

          .product-card.rich .product-try-home-info-button:hover {
            background: rgba(0, 0, 0, 0.06);
          }

          .try-at-home-info-backdrop {
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.42);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }

          .try-at-home-info-modal {
            width: min(420px, 100%);
            background: #fff;
            border-radius: 16px;
            padding: 18px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
          }

          .try-at-home-info-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
          }

          .try-at-home-info-header strong {
            font-size: 18px;
            line-height: 1.2;
          }

          .try-at-home-info-close {
            width: 32px;
            height: 32px;
            border: 0;
            background: transparent;
            border-radius: 999px;
            font-size: 25px;
            line-height: 1;
            cursor: pointer;
          }

          .try-at-home-info-content {
            font-size: 14px;
            line-height: 1.5;
            color: #333;
          }

          .try-at-home-info-content p {
            margin: 0 0 10px;
          }

          .try-at-home-info-content ul {
            margin: 0;
            padding-left: 20px;
          }

          .try-at-home-info-content li + li {
            margin-top: 6px;
          }

          .try-at-home-info-done {
            width: 100%;
            margin-top: 16px;
            min-height: 42px;
            border: 0;
            border-radius: 10px;
            background: #171717;
            color: #fff;
            font-weight: 700;
            cursor: pointer;
          }

          /* FINAL CARD CONTENT SPACING — uses the actual .product-copy wrapper */
          .product-card.rich .product-copy {
            padding: 10px 16px 14px !important;
          }

          .product-card.rich .product-title-link {
            margin: 0 !important;
            padding: 0 !important;
          }

          .product-card.rich .product-title-link h3 {
            margin: 0 0 2px !important;
            padding: 0 !important;
            font-weight: 500 !important;
            line-height: 1.2 !important;
          }

          .product-card.rich .price {
            margin: 0 0 9px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: baseline !important;
            gap: 6px !important;
            line-height: 1.15 !important;
          }

          .product-card.rich .product-try-home-row {
            margin: 0 0 10px !important;
            padding: 0 !important;
            min-height: 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }

          .product-card.rich .product-actions {
            margin: 0 !important;
            padding: 0 !important;
          }

          @media (max-width: 700px) {
            .product-card.rich .product-copy {
              padding: 9px 16px 12px !important;
            }

            .product-card.rich .product-title-link h3 {
              margin-bottom: 2px !important;
            }

            .product-card.rich .price {
              margin-bottom: 8px !important;
            }

            .product-card.rich .product-try-home-row {
              margin-bottom: 9px !important;
              min-height: 20px !important;
            }
          }

      `}</style>
    </>
  );
}