'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GitCompareArrows,
  Gift,
  Heart,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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

type ShopMainCategory =
  (typeof SHOP_MAIN_CATEGORIES)[number];

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

const imageOf = (product: BusinessProduct): string =>
  product.product_thumbnail ||
  product.images?.[0] ||
  product.image ||
  product.image_url ||
  product.image1 ||
  '';

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

const freeGiftCount = (price: number): number => {
  if (price < 80) return 0;
  if (price < 200) return 1;
  return Math.floor(price / 100);
};

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

type ProductGridProps = {
  hideBusinessName?: boolean;
};

export function ProductGrid({
  hideBusinessName = false,
}: ProductGridProps) {
  const router = useRouter();
  const delivery = useDeliveryAvailability();

  const [items, setItems] =
    useState<BusinessProduct[] | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('Featured');
  const [mainCategory, setMainCategory] = useState<ShopMainCategory>('Girl Dress');
  const [subCategory, setSubCategory] = useState('All');

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    getProducts()
      .then(setItems)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
        setItems([]);
      });
  }, []);

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

  const mainCategories = useMemo(
    () => [...SHOP_MAIN_CATEGORIES],
    [],
  );

  const subCategories = useMemo(() => {
    /*
     * Toys uses a small, fixed set of grouped categories.
     */
    if (mainCategory === 'Toys') {
      return [...TOY_SUB_CATEGORIES];
    }

    /*
     * Girl Dress uses fixed age bands.
     */
    if (mainCategory === 'Girl Dress') {
      const hasOtherAges = (items || []).some(
        (product) =>
          shopMainCategoryOf(product) ===
            'Girl Dress' &&
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
     * Earrings keeps the real Firestore subcategories.
     */
    const unique =
      new Map<string, string>();

    (items || [])
      .filter(
        (product) =>
          shopMainCategoryOf(product) ===
          mainCategory,
      )
      .map((product) =>
        shopSubCategoryOf(
          product,
          mainCategory,
        ),
      )
      .filter(Boolean)
      .forEach((value) => {
        const key =
          value.toLowerCase();

        if (!unique.has(key)) {
          unique.set(key, value);
        }
      });

    return [
      'All',
      ...Array.from(
        unique.values(),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    ];
  }, [items, mainCategory]);

  useEffect(() => {
    if (
      !mainCategories.includes(
        mainCategory as ShopMainCategory,
      )
    ) {
      setMainCategory('Girl Dress');
      setSubCategory('All');
    }
  }, [mainCategories, mainCategory]);

  const filteredProducts = useMemo(() => {
    const searchQuery = search.toLowerCase().trim();

    const result = [...(items || [])].filter(
      (product) => {
        const searchableText = [
          titleOf(product),
          product.brand,
          product.business_name,
          product.shop_name,
          product.businessName,
          product.main_category,
          product.sub_category,
          product.category,
          product.color,
          product.size,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const productMainCategory =
          shopMainCategoryOf(product);

        /*
         * Do not force products from other categories
         * into the current three Shop tabs.
         */
        if (!productMainCategory) {
          return false;
        }

        const productSubCategory =
          shopSubCategoryOf(
            product,
            productMainCategory,
          );

        const matchesSearch =
          !searchQuery ||
          searchableText.includes(searchQuery);

        const matchesMainCategory =
          productMainCategory ===
          mainCategory;

        const matchesSubCategory =
          subCategory === 'All' ||
          productSubCategory ===
            subCategory;

        return (
          matchesSearch &&
          matchesMainCategory &&
          matchesSubCategory
        );
      },
    );

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

    return result;
  }, [
    items,
    search,
    sort,
    mainCategory,
    subCategory,
  ]);

  const toggleCompare = (id: string) => {
    setCompare((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      } else {
        alert('You can select a maximum of 3 products.');
      }

      return next;
    });
  };

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
      <div className="loading-grid">
        Loading products from Firebase…
      </div>
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
      <section className="spotc-shop-category-toolbar">
        <div
          className="spotc-main-category-strip"
          aria-label="Main product categories"
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
                setMainCategory(categoryName);
                setSubCategory('All');
              }}
            >
              {categoryName}
            </button>
          ))}
        </div>

        <div className="sort-box spotc-shop-sort-box">
          <SlidersHorizontal size={18} />

          <select
            value={sort}
            aria-label="Sort products"
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
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </section>

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
            onClick={() =>
              setSubCategory(categoryName)
            }
          >
            {categoryName}
          </button>
        ))}
      </div>

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
                  {compare.size} product
                  {compare.size > 1 ? 's' : ''} selected
                </strong>

                <span>
                  Select up to 3 products and ask friends.
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
    ? 'Creating circle…'
    : 'Ask Friends'}
</button>
          </aside>,
          document.body,
        )}

      <section
        className={`product-grid rich ${
          hideBusinessName
            ? 'business-product-grid'
            : 'shop-product-grid'
        }`}
      >
        {filteredProducts.map((item) => {
          const price = priceOf(item);
          const oldPrice = oldPriceOf(item);
          const discount = discountOf(item);
          const giftCount = freeGiftCount(price);
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
                  aria-label={`Open ${titleOf(item)}`}
                  style={{
                    backgroundImage: `url("${image}")`,
                  }}
                />

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

                <button
                  type="button"
                  className={`compare-check ${
                    compare.has(item.id) ? 'on' : ''
                  }`}
                  onClick={() =>
                    toggleCompare(item.id)
                  }
                >
                  <GitCompareArrows size={15} />

                  {compare.has(item.id)
                    ? 'Added'
                    : 'Ask Friends'}
                </button>
              </div>

              <div className="product-copy">
                <Link
                  href={`/product/${item.id}`}
                  className="product-title-link"
                >
                  <h3>{titleOf(item)}</h3>
                </Link>

                <div className="product-stock-row">
                  <span className="product-delivery-badge">
                    <ShoppingBag
                      size={13}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span>15 mins delivery</span>
                  </span>

                  <small className="product-stock-text">
                    {stock > 0
                      ? `${stock} left`
                      : 'In stock'}
                  </small>
                </div>

                {giftCount > 0 && (
                  <Link
                    href={`/product/${item.id}?gift=1`}
                    className="product-free-gift-chip"
                    aria-label={`Select ${giftCount} free ${giftCount === 1 ? 'gift' : 'gifts'} with ${titleOf(item)}`}
                  >
                    <Gift size={14} strokeWidth={2.2} aria-hidden="true" />
                    <span>
                      {giftCount} FREE {giftCount === 1 ? 'gift' : 'gifts'} included
                    </span>
                  </Link>
                )}

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
                      Save ₹
                      {Math.round(
                        oldPrice - price,
                      )}
                    </span>
                  )}
                </div>


<div className="product-actions">
                  <button
                    type="button"
                    className="product-add-button product-add-to-cart-button"
                    disabled={!delivery.canPurchase}
                    aria-disabled={!delivery.canPurchase}
                    title={
                      delivery.canPurchase
                        ? 'Add to cart'
                        : delivery.status === 'outside'
                          ? 'Ordering will be available in your area shortly'
                          : 'Enable location to check delivery availability'
                    }
                    onClick={() => {
                      if (!delivery.canPurchase) {
                        if (delivery.status === 'outside') {
                          alert(
                            'SPOTC is coming to your area shortly. You can browse all products now, but ordering is not available yet.',
                          );
                        } else {
                          alert(
                            'Please enable location so SPOTC can check delivery availability.',
                          );
                          delivery.requestLocation();
                        }
                        return;
                      }

                      if (giftCount > 0) {
                        router.push(
                          `/product/${encodeURIComponent(String(item.id))}?gift=1&action=cart`,
                        );
                        return;
                      }

                      addProduct(item);
                      alert('1 product added');
                    }}
                  >
                    <ShoppingBag size={16} />
                    <span>{delivery.canPurchase ? 'Add to Cart' : 'Browse'}</span>
                  </button>

                  <button
                    type="button"
                    className="product-buy-now-button"
                    disabled={!delivery.canPurchase}
                    aria-disabled={!delivery.canPurchase}
                    title={
                      delivery.canPurchase
                        ? 'Buy now'
                        : delivery.status === 'outside'
                          ? 'Ordering will be available in your area shortly'
                          : 'Enable location to check delivery availability'
                    }
                    onClick={() => {
                      if (!delivery.canPurchase) {
                        if (delivery.status === 'outside') {
                          alert(
                            'SPOTC is coming to your area shortly. You can browse all products now, but ordering is not available yet.',
                          );
                        } else {
                          alert(
                            'Please enable location so SPOTC can check delivery availability.',
                          );
                          delivery.requestLocation();
                        }
                        return;
                      }

                      if (giftCount > 0) {
                        router.push(
                          `/product/${encodeURIComponent(String(item.id))}?gift=1&action=buy`,
                        );
                        return;
                      }

                      addProduct(item);
                      router.push('/cart');
                    }}
                  >
                    <ShoppingBag size={16} />
                    <span>{delivery.canPurchase ? 'Buy Now' : 'Browse'}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!filteredProducts.length && (
        <EmptyState
          title="No products found"
          body="Try a different search term or category."
        />
      )}

      <style jsx global>{`
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
         * SHOP PRODUCT CARD — DELIVERY + STOCK ROW
         * Matches the placement used on the Business product cards.
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

        /*
         * PRODUCT CARD CONTENT SPACING FIX
         * Keeps title, delivery, gift, price and actions compact
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

        .product-card.rich .product-stock-row {
          margin-top: 6px !important;
          margin-bottom: 8px !important;
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

          @media (max-width: 700px) {
            .spotc-shop-category-toolbar {
              gap: 8px;
              margin-bottom: 8px;
            }

            .spotc-main-category-strip {
              flex: 1 1 auto;
              gap: 7px;
            }

            .spotc-main-category-strip button {
              min-height: 36px;
              padding: 0 12px;
              font-size: 12px;
            }

            .spotc-shop-sort-box {
              width: 128px !important;
              min-width: 128px !important;
              max-width: 128px !important;
            }

            .spotc-shop-sort-box select {
              font-size: 11px !important;
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
            .spotc-shop-sort-box {
              width: 112px !important;
              min-width: 112px !important;
              max-width: 112px !important;
            }

            .spotc-main-category-strip button {
              padding: 0 10px;
            }
          }

      `}</style>
    </>
  );
}