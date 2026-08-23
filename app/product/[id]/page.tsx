'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  Bolt,
  CheckCircle2,
  Clock3,
  Copy,
  ChevronDown,
  ChevronLeft,
  FileText,
  GitCompareArrows,
  Gift,
  Heart,
  Info,
  MessageSquareText,
  Minus,
  PackageCheck,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { EmptyState } from '@/components/EmptyState';
import { useSpotcLanguage } from '@/components/LanguageProvider';
import { addProduct } from '@/lib/cart';
import { getProductById, getProducts } from '@/lib/data';
import { requireGoogleLogin } from '@/lib/auth';
import { auth, firebaseReady } from '@/lib/firebase';
import type { BusinessProduct } from '@/lib/types';
import {
  discountOf,
  imageOf,
  oldPriceOf,
  text,
  titleOf,
} from '@/lib/utils';

type ProductRecord = BusinessProduct & Record<string, unknown>;

type ProductMediaItem = {
  type: 'image' | 'video';
  role: 'ai' | 'front' | 'back' | 'video' | 'additional' | 'image';
  url: string;
  label: string;
  order: number;
  poster?: string;
};

const productMediaList = (product: ProductRecord): ProductMediaItem[] => {
  const output: ProductMediaItem[] = [];

  const addMedia = (
    type: 'image' | 'video',
    role: ProductMediaItem['role'],
    value: unknown,
    label: string,
    order: number,
    poster?: unknown,
  ) => {
    const url = text(value).trim();
    if (!url.startsWith('http')) return;
    if (output.some((item) => item.url === url)) return;

    const posterUrl = text(poster).trim();

    output.push({
      type,
      role,
      url,
      label,
      order,
      ...(posterUrl.startsWith('http') ? { poster: posterUrl } : {}),
    });
  };

  /*
   * Current SPOTC admin structure:
   * media: [
   *   { type:'image', role:'ai', slot:'ai_main', url:'...', order:1 },
   *   { type:'image', role:'front', slot:'real_front', url:'...', order:2 },
   *   { type:'image', role:'back', slot:'real_back', url:'...', order:3 },
   *   { type:'image', role:'additional', slot:'detail', url:'...', order:4 },
   *   { type:'video', role:'video', slot:'product_video', url:'...', order:5 }
   * ]
   */
  if (Array.isArray(product.media)) {
    product.media.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== 'object') return;

      const item = rawItem as Record<string, unknown>;
      const rawType = text(item.type).trim().toLowerCase();
      const rawRole = text(item.role).trim().toLowerCase();
      const rawSlot = text(item.slot).trim().toLowerCase();

      const mediaType: 'image' | 'video' =
        rawType === 'video' ||
        rawRole === 'video' ||
        rawSlot === 'product_video'
          ? 'video'
          : 'image';

      const role: ProductMediaItem['role'] =
        rawRole === 'ai' || rawSlot === 'ai_main'
          ? 'ai'
          : rawRole === 'front' || rawSlot === 'real_front'
            ? 'front'
            : rawRole === 'back' || rawSlot === 'real_back'
              ? 'back'
              : rawRole === 'video' || rawSlot === 'product_video'
                ? 'video'
                : rawRole === 'additional' ||
                    rawRole === 'detail' ||
                    rawSlot === 'detail'
                  ? 'additional'
                  : 'image';

      const label =
        role === 'ai'
          ? 'Main'
          : role === 'front'
            ? 'Front'
            : role === 'back'
              ? 'Back'
              : role === 'video'
                ? 'Video'
                : role === 'additional'
                  ? 'Detail'
                  : `Image ${index + 1}`;

      const productPoster =
        product.product_thumbnail ??
        product.image_url ??
        product.image ??
        product.studio_image_url ??
        (Array.isArray(product.images) ? product.images[0] : '');

      addMedia(
        mediaType,
        role,
        item.url ?? item.image_url ?? item.video_url,
        label,
        numberValue(item.order) ?? index + 1,
        role === 'video'
          ? item.poster ??
              item.thumbnail_url ??
              item.poster_url ??
              productPoster
          : item.poster ??
              item.thumbnail_url ??
              item.poster_url,
      );
    });
  }

  /*
   * Preferred new Firestore structure:
   * product_media: [
   *   { type:'image', role:'ai', url:'...', order:1 },
   *   { type:'image', role:'front', url:'...', order:2 },
   *   { type:'image', role:'back', url:'...', order:3 },
   *   { type:'video', role:'video', url:'...', order:4, poster:'...' },
   *   { type:'image', role:'additional', url:'...', order:5 }
   * ]
   */
  if (Array.isArray(product.product_media)) {
    product.product_media.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== 'object') return;

      const item = rawItem as Record<string, unknown>;
      const rawType = text(item.type).trim().toLowerCase();
      const rawRole = text(item.role).trim().toLowerCase();
      const mediaType: 'image' | 'video' =
        rawType === 'video' || rawRole === 'video' ? 'video' : 'image';

      const role: ProductMediaItem['role'] =
        rawRole === 'ai'
          ? 'ai'
          : rawRole === 'front'
            ? 'front'
            : rawRole === 'back'
              ? 'back'
              : rawRole === 'video'
                ? 'video'
                : rawRole === 'additional' || rawRole === 'detail'
                  ? 'additional'
                  : 'image';

      const label =
        role === 'ai'
          ? 'AI'
          : role === 'front'
            ? 'Front'
            : role === 'back'
              ? 'Back'
              : role === 'video'
                ? 'Video'
                : role === 'additional'
                  ? 'Detail'
                  : `Image ${index + 1}`;

      addMedia(
        mediaType,
        role,
        item.url ?? item.image_url ?? item.video_url,
        label,
        numberValue(item.order) ?? index + 1,
        role === 'video'
          ? item.poster ??
              item.thumbnail_url ??
              item.poster_url ??
              product.product_thumbnail ??
              product.image_url ??
              product.image ??
              product.studio_image_url ??
              (Array.isArray(product.images) ? product.images[0] : '')
          : item.poster ??
              item.thumbnail_url ??
              item.poster_url,
      );
    });
  }

  /*
   * Compatibility with the admin/app fields we are going to use.
   * These also let the web gallery work before product_media is populated.
   */
  addMedia(
    'image',
    'ai',
    product.ai_image_url ?? product.product_thumbnail ?? product.studio_image_url,
    'AI',
    1,
  );
  addMedia(
    'image',
    'front',
    product.real_front_url ??
      product.real_front_image_url ??
      product.raw_image_url ??
      product.front_image_url ??
      product.product_front_image,
    'Front',
    2,
  );
  addMedia(
    'image',
    'back',
    product.real_back_url ??
      product.real_back_image_url ??
      product.back_image_url ??
      product.product_back_image,
    'Back',
    3,
  );
  addMedia(
    'video',
    'video',
    product.product_video_url ??
      product.video_url ??
      product.product_video ??
      product.playback_url,
    'Video',
    4,
    product.video_thumbnail_url ??
      product.product_thumbnail ??
      product.image_url ??
      product.image ??
      product.studio_image_url ??
      product.thumbnail_url ??
      (Array.isArray(product.images) ? product.images[0] : ''),
  );
  addMedia(
    'image',
    'additional',
    product.additional_image_url ??
      product.detail_image_url ??
      product.product_additional_image,
    'Detail',
    5,
  );

  /*
   * Older products: keep the current image fields working.
   * Use these only to fill missing slots and never duplicate URLs.
   */
  if (output.length < 5) {
    imageList(product).forEach((url, index) => {
      if (output.length >= 5) return;
      addMedia('image', 'image', url, `Image ${index + 1}`, 20 + index);
    });
  }

  return output
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);
};

type ReviewRecord = {
  id: string;
  rating: number;
  title: string;
  comment: string;
  reviewer_name: string;
  created_at?: unknown;
};

type OnlineProductRecord = {
  id: string;
  title: string;
  platform: string;
  image: string;
  url: string;
  matchScore: number;
};

type CompareState = 'closed' | 'loading' | 'ready' | 'error';

type AccordionKey = 'description' | 'delivery' | 'returns' | 'reviews';

const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(String(value).replace(/[₹,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const customerPriceOf = (product: BusinessProduct): number => {
  const record = product as BusinessProduct & Record<string, unknown>;

  const offerPrice = numberValue(record.offer_price) ?? 0;
  const sellingPrice = numberValue(record.selling_price) ?? 0;
  const price = numberValue(record.price) ?? 0;
  const mrp = numberValue(record.mrp ?? record.old_price) ?? 0;

  if (offerPrice > 0) return offerPrice;
  if (sellingPrice > 0) return sellingPrice;
  if (price > 0) return price;
  return mrp;
};
const sendGa4Event = (
  eventName: string,
  parameters: Record<string, unknown>,
) => {
  if (typeof window === 'undefined') return;

  const gtag = (
    window as typeof window & {
      gtag?: (...args: unknown[]) => void;
    }
  ).gtag;

  if (typeof gtag === 'function') {
    gtag('event', eventName, parameters);
  }
};

const ga4ItemFromProduct = (
  product: BusinessProduct,
  quantity = 1,
) => {
  const record = product as ProductRecord;

  return {
    item_id: String(product.id),
    item_name: titleOf(product),
    item_brand: text(record.brand).trim() || undefined,
    item_category:
      text(record.main_category || record.category).trim() || undefined,
    item_category2:
      text(record.sub_category).trim() || undefined,
    item_variant:
      [
        text(record.color).trim(),
        text(record.size).trim(),
      ]
        .filter(Boolean)
        .join(' / ') || undefined,
    price: customerPriceOf(product),
    quantity,
  };
};

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  return null;
};

const stringList = (...values: unknown[]): string[] => {
  const output: string[] = [];

  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const raw = text(value).trim();
    if (!raw) return;

    raw
      .split(/[,/|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!output.includes(item)) output.push(item);
      });
  };

  values.forEach(add);
  return output;
};

const imageList = (product: ProductRecord): string[] => {
  const customerImages: string[] = [];

  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const url = text(value).trim();

    if (
      url.startsWith('http') &&
      !customerImages.includes(url)
    ) {
      customerImages.push(url);
    }
  };

  /*
   * product_thumbnail is the final customer-facing
   * AI Studio image. When it exists, do not expose
   * the raw business-upload images from product.images.
   */
  const studioThumbnail = text(product.product_thumbnail).trim();

  if (studioThumbnail.startsWith('http')) {
    add(studioThumbnail);

    /*
     * Add only separately stored finished/studio images.
     * Do not add product.images here because that array
     * contains the original raw business upload.
     */
    add(product.product_image);
    add(product.image_url);
    add(product.real_front_url);
    add(product.real_back_url);
    add(product.detail_image_url);
    add(product.image1);
    add(product.image2);
    add(product.image3);
    add(product.image4);
    add(product.image5);

    return customerImages;
  }

  /*
   * Fallback for older products that do not yet have
   * an AI Studio thumbnail.
   */
  add(product.image);
  add(product.product_image);
  add(product.image_url);
  add(product.real_front_url);
  add(product.real_back_url);
  add(product.detail_image_url);

  if (customerImages.length === 0 && Array.isArray(product.images)) {
    add(product.images[0]);
  }

  return customerImages;
};

const dateText = (value: unknown): string => {
  if (!value) return '';

  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const toDate = (value as { toDate?: () => Date }).toDate;
      if (toDate) {
        return toDate.call(value).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }

    const date = new Date(value as string | number | Date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    return '';
  }

  return '';
};

const persistentReviewerId = (): string => {
  const key = 'spotc-reviewer-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const created =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(key, created);
  return created;
};

const referenceId = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { id?: unknown; path?: unknown };
  if (candidate.id) return text(candidate.id).trim();
  const path = text(candidate.path).trim();
  return path ? path.split('/').filter(Boolean).pop() || '' : '';
};
const isTryOnSupported = (product: ProductRecord): boolean => {
  const categoryText = [
    product.main_category,
    product.sub_category,
    product.category,
    product.product_type,
    product.audience,
    product.title,
    product.product_name,
  ]
    .map((value) => text(value).trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  const blockedCategories = [
    'shoe',
    'shoes',
    'footwear',
    'sandal',
    'sandals',
    'slipper',
    'slippers',
    'sneaker',
    'sneakers',
    'boot',
    'boots',
    'watch',
    'watches',
    'bag',
    'bags',
    'handbag',
    'wallet',
    'belt',
    'cap',
    'caps',
    'hat',
    'hats',
    'sunglass',
    'sunglasses',
    'jewellery',
    'jewelry',
    'accessory',
    'accessories',
  ];

  if (
    blockedCategories.some((blockedCategory) =>
      categoryText.includes(blockedCategory),
    )
  ) {
    return false;
  }

  const supportedCategories = [
    'shirt',
    't-shirt',
    'tshirt',
    'polo',
    'top',
    'blouse',
    'pant',
    'pants',
    'jeans',
    'trouser',
    'trousers',
    'dress',
    'gown',
    'kurti',
    'kurta',
    'salwar',
    'chudi',
    'churidar',
    'saree',
    'lehenga',
    'jacket',
    'blazer',
    'hoodie',
    'sweater',
  ];

  return supportedCategories.some((supportedCategory) =>
    categoryText.includes(supportedCategory),
  );
};

function ProductPageLoader() {
  return (
    <main className="pd-page pd-page-loading" aria-label="Loading product" aria-busy="true">
      <div className="pd-loader-top"><span /><span /></div>
      <section className="pd-loader-main">
        <div>
          <div className="pd-loader-image" />
          <div className="pd-loader-thumbnails"><span /><span /><span /></div>
        </div>
        <div className="pd-loader-info">
          <span className="pd-loader-line pd-loader-brand" />
          <span className="pd-loader-line pd-loader-title" />
          <div className="pd-loader-rating"><span /><span /></div>
          <span className="pd-loader-line pd-loader-price" />
          <span className="pd-loader-delivery" />
          <span className="pd-loader-line pd-loader-option-title" />
          <div className="pd-loader-options"><span /><span /><span /></div>
          <div className="pd-loader-actions"><span /><span /></div>
        </div>
      </section>

    </main>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { language, t, productTitle } = useSpotcLanguage();

  const [product, setProduct] = useState<BusinessProduct | null | undefined>(undefined);
  const [related, setRelated] = useState<BusinessProduct[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [selectedMediaUrl, setSelectedMediaUrl] = useState('');
  const [zoomActive, setZoomActive] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({
    x: 50,
    y: 50,
  });
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState(1);
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<AccordionKey>('description');

  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [ratingSnapshot, setRatingSnapshot] = useState<{
    average: number | null;
    count: number;
    veryGood: number;
    good: number;
    fair: number;
  } | null>(null);

  const [compareState, setCompareState] = useState<CompareState>('closed');
  const [compareProducts, setCompareProducts] = useState<OnlineProductRecord[]>([]);
  const [compareError, setCompareError] = useState('');
  const [askFriendsLoading, setAskFriendsLoading] = useState(false);
  const [circleResult, setCircleResult] = useState<{
    id: string;
    shareCode: string;
  } | null>(null);
  const [giftPreviewOpen, setGiftPreviewOpen] = useState(false);
  const [giftProducts, setGiftProducts] = useState<BusinessProduct[]>([]);
  const [giftSearch, setGiftSearch] = useState('');
  const [giftCategory, setGiftCategory] = useState('All');
  const [selectedGiftIds, setSelectedGiftIds] = useState<string[]>([]);
  const giftProductsRef = useRef<HTMLDivElement | null>(null);
  const viewItemTrackedRef = useRef('');
  const [tryOnOpen, setTryOnOpen] = useState(false);
const [tryOnImage, setTryOnImage] = useState<File | null>(null);
const [tryOnPreview, setTryOnPreview] = useState('');
const [tryOnResult, setTryOnResult] = useState('');
const [tryOnLoading, setTryOnLoading] = useState(false);
const [fullscreenTryOn, setFullscreenTryOn] = useState(false);
    

  useEffect(() => {
    if (!giftPreviewOpen) return;

    const frame = window.requestAnimationFrame(() => {
      if (giftProductsRef.current) {
        giftProductsRef.current.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [giftPreviewOpen, giftCategory, giftSearch]);

  useEffect(() => {
    let active = true;

    setProduct(undefined);
    setRelated([]);
    setSelectedImage('');
    setSelectedMediaUrl('');
    setZoomActive(false);
    setZoomPosition({ x: 50, y: 50 });
    setQty(1);
    setReviews([]);
    setReviewMessage('');
    setRatingSnapshot(null);
    setGiftPreviewOpen(false);
    setGiftProducts([]);
    setGiftSearch('');
    setGiftCategory('All');
    setSelectedGiftIds([]);

    getProductById(id)
      .then((loadedProduct) => {
        if (!active) return;
        setProduct(loadedProduct);
        if (!loadedProduct) return;

        const record = loadedProduct as ProductRecord;

        // GA4 ecommerce: track one product-detail view per product ID.
        if (
          typeof window !== 'undefined' &&
          viewItemTrackedRef.current !== String(loadedProduct.id)
        ) {
          const itemPrice = customerPriceOf(loadedProduct);

          sendGa4Event('view_item', {
            currency: 'INR',
            value: itemPrice,
            items: [ga4ItemFromProduct(loadedProduct, 1)],
          });

          viewItemTrackedRef.current = String(loadedProduct.id);
        }

        const loadedImages = imageList(record);
        const loadedMedia = productMediaList(record);
        const loadedSizes = stringList(
          record.sizes,
          record.available_sizes,
          record.size_options,
          record.product_sizes,
          record.size,
        );
        const loadedSelectableColors = stringList(
          record.available_colors,
          record.color_options,
          record.product_colors,
          record.colors,
        );

        const loadedStock = numberValue(
          record.stock_qty ?? record.stock_quantity,
        );

        const shouldSelectColour =
          loadedStock !== 1 &&
          loadedSelectableColors.length > 1;

        const firstMedia = loadedMedia[0];
        const firstImage =
          loadedMedia.find((item) => item.type === 'image')?.url ||
          loadedImages[0] ||
          imageOf(loadedProduct);

        setSelectedMediaUrl(firstMedia?.url || firstImage);
        setSelectedImage(
          firstMedia?.type === 'image' ? firstMedia.url : firstImage,
        );
        setSize(loadedSizes[0] || '');
        setColor(
          shouldSelectColour
            ? loadedSelectableColors[0] || ''
            : '',
        );

        const currentUser = auth?.currentUser;

        if (!currentUser || currentUser.isAnonymous || !firebaseReady) {
          setSaved(false);
        } else {
          const db = getFirestore();
          const savedReference = doc(
            db,
            'SavedProducts',
            `${currentUser.uid}_${loadedProduct.id}`,
          );

          getDoc(savedReference)
            .then((savedSnapshot) => {
              if (active) setSaved(savedSnapshot.exists());
            })
            .catch((error) => {
              console.error('Loading saved product failed:', error);
              if (active) setSaved(false);
            });
        }

        setRelatedLoading(true);
        getProducts()
          .then((allProducts) => {
            if (!active) return;

            const matching = allProducts
              .filter((item) => {
                if (item.id === loadedProduct.id) return false;

                const itemRecord = item as ProductRecord;
                const stock = numberValue(itemRecord.stock_qty ?? itemRecord.stock_quantity);
                const itemInStock =
                  booleanValue(itemRecord.is_in_stock) !== false &&
                  !(stock !== null && stock <= 0);

                if (!itemInStock) return false;

                return (
                  item.main_category === loadedProduct.main_category ||
                  item.sub_category === loadedProduct.sub_category ||
                  item.category === loadedProduct.category
                );
              })
              .slice(0, 4);

            setRelated(matching);

            // FREE GIFT POOL
            // Show only active + in-stock BusinessProducts with selling price below ₹50.
            // Do not show the main paid product itself.
            const eligibleGifts = allProducts.filter((item) => {
              if (item.id === loadedProduct.id) return false;

              const giftRecord = item as ProductRecord;
              const giftPrice = customerPriceOf(item);
              const giftStock = numberValue(
                giftRecord.stock_qty ?? giftRecord.stock_quantity,
              );

              const giftActive =
                booleanValue(giftRecord.isActive ?? giftRecord.is_active) !== false;

              const giftInStock =
                booleanValue(giftRecord.is_in_stock) !== false &&
                !(giftStock !== null && giftStock <= 0);

              return (
                giftActive &&
                giftInStock &&
                giftPrice > 0 &&
                giftPrice < 50
              );
            });

            setGiftProducts(eligibleGifts);
          })
          .catch(() => {
            if (!active) return;
            setRelated([]);
            setGiftProducts([]);
          })
          .finally(() => active && setRelatedLoading(false));
      })
      .catch(() => active && setProduct(null));

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!product || !firebaseReady) return;

    let active = true;
    setReviewsLoading(true);

    const db = getFirestore();
    const reviewsQuery = query(
      collection(db, 'BusinessProducts', product.id, 'Reviews'),
      orderBy('created_at', 'desc'),
      limit(20),
    );

    getDocs(reviewsQuery)
      .then((snapshot) => {
        if (!active) return;
        setReviews(
          snapshot.docs.map((reviewDoc) => {
            const data = reviewDoc.data();
            return {
              id: reviewDoc.id,
              rating: numberValue(data.rating) ?? 0,
              title: text(data.title),
              comment: text(data.comment),
              reviewer_name: text(data.reviewer_name) || 'SPOTC customer',
              created_at: data.created_at,
            };
          }),
        );
      })
      .catch(() => active && setReviews([]))
      .finally(() => active && setReviewsLoading(false));

    return () => {
      active = false;
    };
  }, [product]);

  useEffect(() => {
    if (!product || typeof window === 'undefined') return;

    const query = new URLSearchParams(window.location.search);
    if (query.get('gift') !== '1') return;

    const currentPrice = customerPriceOf(product);
    const currentGiftCount =
      currentPrice < 80
        ? 0
        : currentPrice < 200
          ? 1
          : Math.floor(currentPrice / 100);

    if (currentGiftCount > 0) {
      setGiftPreviewOpen(true);
    }
  }, [product]);

  const record = product ? (product as ProductRecord) : null;
  const images = useMemo(() => (record ? imageList(record) : []), [record]);
  const productMedia = useMemo(
    () => (record ? productMediaList(record) : []),
    [record],
  );
  const sizes = useMemo(
    () =>
      record
        ? stringList(
            record.sizes,
            record.available_sizes,
            record.size_options,
            record.product_sizes,
            record.size,
          )
        : [],
    [record],
  );
  /*
   * COLOUR VARIANTS
   * ----------------
   * `record.color` is descriptive product information generated/saved by
   * the admin (for example: "Multi-color (Orange), Black, White, Brown").
   * It must NOT automatically become customer-selectable colour buttons.
   *
   * Only explicit variant fields can create colour choices.
   */
  const selectableColors = useMemo(
    () =>
      record
        ? stringList(
            record.available_colors,
            record.color_options,
            record.product_colors,
            record.colors,
          )
        : [],
    [record],
  );

  if (product === undefined) return <ProductPageLoader />;

  if (!product || !record) {
    return (
      <EmptyState
        title="Product not found"
        body="This product may be unavailable or out of stock."
      />
    );
  }

  const selectedMedia =
    productMedia.find((item) => item.url === selectedMediaUrl) ||
    productMedia[0] ||
    null;

  const price = customerPriceOf(product);

  // FREE gift rule:
  // ₹80–₹199 = 1 gift per item
  // ₹200–₹299 = 2 gifts per item
  // ₹300–₹399 = 3 gifts per item
  // and so on — +1 gift for every completed ₹100.
  const freeGiftCountPerItem =
    price < 80 ? 0 : price < 200 ? 1 : Math.floor(price / 100);

  // Quantity also increases the customer's FREE gift entitlement.
  // Example: ₹999 = 9 gifts per item; qty 2 = 18 FREE gifts.
  const freeGiftCount = freeGiftCountPerItem * qty;

  const giftCategories = [
    'All',
    ...Array.from(
      new Set(
        giftProducts
          .map((item) => {
            const itemRecord = item as ProductRecord;
            return text(
              itemRecord.main_category ||
                itemRecord.category ||
                itemRecord.sub_category,
            ).trim();
          })
          .filter(Boolean),
      ),
    ),
  ];

  const visibleGiftProducts = giftProducts.filter((item) => {
    const itemRecord = item as ProductRecord;

    const itemCategory = text(
      itemRecord.main_category ||
        itemRecord.category ||
        itemRecord.sub_category,
    ).trim();

    const matchesCategory =
      giftCategory === 'All' || itemCategory === giftCategory;

    const searchValue = giftSearch.trim().toLowerCase();
    const searchable = [
      titleOf(item),
      itemRecord.brand,
      itemRecord.main_category,
      itemRecord.category,
      itemRecord.sub_category,
    ]
      .map((value) => text(value).toLowerCase())
      .join(' ');

    const matchesSearch =
      !searchValue || searchable.includes(searchValue);

    return matchesCategory && matchesSearch;
  });

  const selectedGiftProducts = giftProducts.filter((item) =>
    selectedGiftIds.includes(String(item.id)),
  );

  const oldPrice = oldPriceOf(product);
  const discount = discountOf(product);
const rawStock = numberValue(record.stock_qty ?? record.stock_quantity);
  const hasStockField = record.stock_qty !== undefined || record.stock_quantity !== undefined;
  const explicitInStock = booleanValue(record.is_in_stock);
  const inStock =
    explicitInStock !== false && (!hasStockField || rawStock === null || rawStock > 0);
  const stockQuantity = rawStock !== null && rawStock > 0 ? Math.floor(rawStock) : null;
  const maximumQuantity = stockQuantity !== null ? Math.min(99, stockQuantity) : 99;

  /*
   * Show a Colour selector only when the customer genuinely has a choice:
   * - never for a single remaining piece;
   * - never for descriptive "multicolour/assorted" product colour text;
   * - only when 2+ explicit colour variants are stored.
   */
  const showColorSelector =
    stockQuantity !== 1 &&
    selectableColors.length > 1;

  const verified =
    record.isVerified === true ||
    record.is_verified === true ||
    record.is_business_verified === true;

  const businessName =
    text(record.business_name || record.shop_name || record.businessName || record.brand) ||
    'SPOTC Shop';

  const storedAverage = numberValue(
    record.average_rating ?? record.rating_average ?? record.rating ?? record.review_rating,
  );
  const storedReviewCount =
    numberValue(
      record.reviews_count ?? record.review_count ?? record.ratings_count ?? record.rating_count,
    ) ?? 0;
  const storedVeryGood =
    numberValue(record.rating_very_good ?? record.product_rating_very_good) ?? 0;
  const storedGood = numberValue(record.rating_good ?? record.product_rating_good) ?? 0;
  const storedFair = numberValue(record.rating_fair ?? record.product_rating_fair) ?? 0;

  const veryGood = ratingSnapshot?.veryGood ?? storedVeryGood;
  const good = ratingSnapshot?.good ?? storedGood;
  const fair = ratingSnapshot?.fair ?? storedFair;
  const calculatedCount = veryGood + good + fair;
  const calculatedAverage =
    calculatedCount > 0 ? (veryGood * 5 + good * 4 + fair * 3) / calculatedCount : null;
  const finalRating =
    ratingSnapshot?.average ??
    (storedAverage !== null && storedAverage > 0 ? storedAverage : calculatedAverage);
  const finalReviewCount =
    ratingSnapshot?.count ?? (storedReviewCount > 0 ? storedReviewCount : calculatedCount);

  const englishProductTitle = titleOf(product);
  const tamilProductTitle = text(record.title_ta || record.product_name_ta).trim();
  const displayProductTitle =
    language === 'ta'
      ? tamilProductTitle || productTitle(englishProductTitle)
      : englishProductTitle;

  const englishDescription = text(record.description || record.product_description);
  const tamilDescription = text(record.description_ta || record.product_description_ta).trim();
  const description =
    language === 'ta' && tamilDescription
      ? tamilDescription
      : englishDescription;

  const englishHighlightsText = text(record.highlights || record.features);
  const tamilHighlightsText = text(record.highlights_ta || record.features_ta).trim();
  const highlightsText =
    language === 'ta' && tamilHighlightsText
      ? tamilHighlightsText
      : englishHighlightsText;

  const mainCategoryText = text(
    record.main_category || record.category,
  ).trim();

  const subCategoryText = text(record.sub_category).trim();

  const isGirlDressProduct =
    mainCategoryText.toLowerCase() === 'girl dress' ||
    mainCategoryText.toLowerCase().includes('girl dress');

  const descriptiveColours = stringList(
    record.color,
    record.secondary_color,
  );

  const structuredMeasurements =
    record.garment_measurements &&
    typeof record.garment_measurements === 'object'
      ? (record.garment_measurements as Record<string, unknown>)
      : {};

  const onePieceMeasurements =
    structuredMeasurements.one_piece &&
    typeof structuredMeasurements.one_piece === 'object'
      ? (structuredMeasurements.one_piece as Record<string, unknown>)
      : {};

  const topMeasurements =
    record.top_measurements && typeof record.top_measurements === 'object'
      ? (record.top_measurements as Record<string, unknown>)
      : structuredMeasurements.top &&
          typeof structuredMeasurements.top === 'object'
        ? (structuredMeasurements.top as Record<string, unknown>)
        : {};

  const bottomMeasurements =
    record.bottom_measurements && typeof record.bottom_measurements === 'object'
      ? (record.bottom_measurements as Record<string, unknown>)
      : structuredMeasurements.bottom &&
          typeof structuredMeasurements.bottom === 'object'
        ? (structuredMeasurements.bottom as Record<string, unknown>)
        : {};

  const thirdPieceMeasurements =
    record.third_piece_measurements &&
    typeof record.third_piece_measurements === 'object'
      ? (record.third_piece_measurements as Record<string, unknown>)
      : structuredMeasurements.third_piece &&
          typeof structuredMeasurements.third_piece === 'object'
        ? (structuredMeasurements.third_piece as Record<string, unknown>)
        : {};

  const setTypeText = text(
    record.set_type ||
      structuredMeasurements.set_type ||
      (numberValue(record.piece_count) === 3
        ? '3 Piece'
        : numberValue(record.piece_count) === 2
          ? '2 Piece'
          : '1 Piece'),
  ).trim();

  const isMultiPieceDress =
    setTypeText === '2 Piece' || setTypeText === '3 Piece';

  const productDetailRows = (
    isGirlDressProduct
      ? [
          {
            label: 'Age Group',
            value: text(
              record.age_group || record.sub_category,
            ).trim(),
          },
          {
            label: 'Dress Type',
            value: text(record.dress_type).trim(),
          },
          {
            label: 'Set Type',
            value: setTypeText,
          },
          {
            label: 'Colour',
            value: descriptiveColours.join(', '),
          },
          {
            label: 'Material',
            value: text(
              record.material || record.fabric,
            ).trim(),
          },
          {
            label: 'Pattern',
            value: text(
              record.pattern || record.style,
            ).trim(),
          },
          {
            label: 'Available Sizes',
            value: sizes.join(', '),
          },

          ...(isMultiPieceDress
            ? [
                {
                  label: 'Top Type',
                  value: text(topMeasurements.type).trim(),
                },
                {
                  label: 'Top Chest',
                  value: text(topMeasurements.chest).trim(),
                },
                {
                  label: 'Top Length',
                  value: text(topMeasurements.length).trim(),
                },
                {
                  label: 'Top Shoulder',
                  value: text(topMeasurements.shoulder).trim(),
                },
                {
                  label: 'Top Sleeve Length',
                  value: text(topMeasurements.sleeve).trim(),
                },
                {
                  label: 'Bottom Type',
                  value: text(bottomMeasurements.type).trim(),
                },
                {
                  label: 'Bottom Waist',
                  value: text(bottomMeasurements.waist).trim(),
                },
                {
                  label: 'Max Stretch Waist',
                  value: text(bottomMeasurements.max_waist).trim(),
                },
                {
                  label: 'Hip',
                  value: text(bottomMeasurements.hip).trim(),
                },
                {
                  label: 'Bottom Length',
                  value: text(bottomMeasurements.length).trim(),
                },
                {
                  label: 'Inseam',
                  value: text(bottomMeasurements.inseam).trim(),
                },
                ...(setTypeText === '3 Piece'
                  ? [
                      {
                        label: 'Third Piece Type',
                        value: text(thirdPieceMeasurements.type).trim(),
                      },
                      {
                        label: 'Third Piece Chest',
                        value: text(thirdPieceMeasurements.chest).trim(),
                      },
                      {
                        label: 'Third Piece Waist',
                        value: text(thirdPieceMeasurements.waist).trim(),
                      },
                      {
                        label: 'Third Piece Length',
                        value: text(thirdPieceMeasurements.length).trim(),
                      },
                    ]
                  : []),
              ]
            : [
                {
                  label: 'Dress Length',
                  value: text(
                    onePieceMeasurements.length ||
                      record.dress_length ||
                      record.garment_length,
                  ).trim(),
                },
                {
                  label: 'Chest',
                  value: text(
                    onePieceMeasurements.chest ||
                      record.chest_size ||
                      record.chest ||
                      record.bust_size,
                  ).trim(),
                },
                {
                  label: 'Waist',
                  value: text(
                    onePieceMeasurements.waist ||
                      record.waist_size ||
                      record.waist,
                  ).trim(),
                },
                {
                  label: 'Shoulder',
                  value: text(
                    onePieceMeasurements.shoulder ||
                      record.shoulder_size,
                  ).trim(),
                },
                {
                  label: 'Sleeve Length',
                  value: text(
                    onePieceMeasurements.sleeve ||
                      record.sleeve_length,
                  ).trim(),
                },
              ]),

          {
            label: 'Brand',
            value: text(record.brand).trim(),
          },
          {
            label: 'Availability',
            value: inStock
              ? stockQuantity
                ? `${stockQuantity} in stock`
                : 'In stock'
              : 'Out of stock',
          },
        ]
      : [
          {
            label: 'Brand',
            value: text(record.brand).trim(),
          },
          {
            label: 'Category',
            value: mainCategoryText,
          },
          {
            label: 'Sub Category',
            value: subCategoryText,
          },
          {
            label: 'Colour',
            value: descriptiveColours.join(', '),
          },
          {
            label: 'Size',
            value: sizes.join(', '),
          },
          {
            label: 'Material',
            value: text(
              record.material || record.fabric,
            ).trim(),
          },
          {
            label: 'Pattern',
            value: text(
              record.pattern || record.style,
            ).trim(),
          },
          {
            label: 'Availability',
            value: inStock
              ? stockQuantity
                ? `${stockQuantity} in stock`
                : 'In stock'
              : 'Out of stock',
          },
        ]
  ).filter((item) => item.value);

  const deliveryText =
    text(record.delivery_text || record.delivery_estimate || record.estimated_delivery_text) ||
    'Fast local delivery';

  const deliveryDetails =
    text(record.delivery_details || record.shipping_details || record.delivery_description) ||
    'Choose the delivery option that suits you. Instant Delivery is available for ₹20 and is targeted for about 15 minutes when available in your area. Morning Slot: orders placed between 6 AM and 12 PM are delivered between 12 PM and 2 PM. Afternoon Slot: orders placed between 12 PM and 6 PM are delivered between 6 PM and 7 PM. Night Slot: orders placed between 6 PM and 6 AM are delivered between 6 AM and 8 AM. Scheduled delivery slots are FREE. Delivery availability may depend on your service area and current delivery capacity.';
  const freeShipping = booleanValue(record.free_shipping ?? record.is_free_shipping) === true;
  const codAvailable =
    booleanValue(record.cod_available ?? record.cash_on_delivery) !== false;
  const returnDetails =
    text(
      record.return_policy ||
        record.return_exchange_policy ||
        record.exchange_policy ||
        record.returns_text,
    ) ||
    'For eligible clothing orders, the delivery partner can wait for up to 5 minutes while you check the dress and try the fit. If the size and fit are right, keep the item and complete the order. If it does not fit, hand the item back to the delivery partner immediately. If another suitable size or set is available, an exchange can be arranged. The product, tags and packaging must remain in original condition. This doorstep try-and-return option applies only to eligible items.';

  const businessId =
    text(record.business_id || record.parent_business_id).trim() ||
    referenceId(record.business_ref) ||
    referenceId(record.parent_business_ref);

  const productNumber =
    Math.max(
      1,
      Math.floor(
        numberValue(record.product_index || record.product_no || record.image_index) ?? 1,
      ),
    );

  const deliveryMinutes =
    Math.max(
      1,
      Math.floor(
        numberValue(
          record.delivery_minutes ||
            record.estimated_delivery_minutes ||
            record.delivery_time_minutes,
        ) ?? 15,
      ),
    );

  const productImage =
    selectedImage ||
    productMedia.find((item) => item.type === 'image')?.url ||
    images[0] ||
    imageOf(product);

  const toggleSaved = async () => {
    if (!firebaseReady || saveBusy) return;

    const currentUser = await requireGoogleLogin();
    if (!currentUser) return;

    const db = getFirestore();
    const savedReference = doc(
      db,
      'SavedProducts',
      `${currentUser.uid}_${product.id}`,
    );

    setSaveBusy(true);

    try {
      if (saved) {
        await deleteDoc(savedReference);
        setSaved(false);
        return;
      }

      const productReference = doc(db, 'BusinessProducts', product.id);

      await setDoc(savedReference, {
        user_uid: currentUser.uid,
        uid: currentUser.uid,
        user_ref: doc(db, 'users', currentUser.uid),

        item_type: 'product',
        saved_type: 'product',

        product_id: product.id,
        target_id: product.id,
        item_id: product.id,
        product_ref: productReference,
        item_ref: productReference,

        business_id: businessId,
        business_ref: businessId
          ? doc(db, 'BusinessListings', businessId)
          : null,
        business_name: businessName,

        title: titleOf(product),
        product_name: titleOf(product),
        brand: text(record.brand),
        category: text(
          record.main_category || record.category || record.sub_category,
        ),
        description,

        image: productImage,
        image_url: productImage,
        product_thumbnail: productImage,
        images: images.length ? images : productImage ? [productImage] : [],

        price,
        old_price: oldPrice,
        discount: discount > 0 ? `${discount}% OFF` : '',

        selected_size: size || null,
        selected_color: showColorSelector ? color || null : null,
        isActive: record.isActive !== false,
        is_active: record.isActive !== false,
        is_in_stock: inStock,
        stock_qty: stockQuantity,

        web_url: `/product/${product.id}`,
        saved_at: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setSaved(true);
    } catch (error) {
      console.error('Saving product failed:', error);
      alert(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : 'Save failed. Please try again.',
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleFreeGift = (giftId: string) => {
    setSelectedGiftIds((current) => {
      if (current.includes(giftId)) {
        return current.filter((id) => id !== giftId);
      }

      if (current.length >= freeGiftCount) {
        return current;
      }

      return [...current, giftId];
    });
  };

  const confirmFreeGifts = () => {
    if (selectedGiftIds.length !== freeGiftCount) return;
    setGiftPreviewOpen(false);
  };

  const saveSelectedGiftsForCart = () => {
    if (typeof window === 'undefined' || freeGiftCount <= 0) return;

    const selectedGifts = selectedGiftProducts.map((gift) => ({
      id: String(gift.id),
      title: titleOf(gift),
      image: imageOf(gift),
      original_price: customerPriceOf(gift),
      price: 0,
      is_free_gift: true,
    }));

    window.localStorage.setItem(
      `spotc-free-gifts:${product.id}`,
      JSON.stringify({
        product_id: product.id,
        quantity: qty,
        entitlement: freeGiftCount,
        gifts: selectedGifts,
      }),
    );
  };

  const validatePurchaseOptions = (): boolean => {
    if (!inStock) {
      alert('This product is out of stock');
      return false;
    }

    if (sizes.length > 0 && !size) {
      alert('Select a size');
      return false;
    }

    if (showColorSelector && !color) {
      alert('Select a colour');
      return false;
    }

    if (
      freeGiftCount > 0 &&
      selectedGiftIds.length !== freeGiftCount
    ) {
      setGiftPreviewOpen(true);
      alert(
        `Choose ${freeGiftCount} FREE ${
          freeGiftCount === 1 ? 'gift' : 'gifts'
        } before continuing.`,
      );
      return false;
    }

    return true;
  };

  const addToCart = () => {
    if (!validatePurchaseOptions()) return;

    saveSelectedGiftsForCart();
    addProduct(product, { size, color: showColorSelector ? color : '', qty });

    sendGa4Event('add_to_cart', {
      currency: 'INR',
      value: price * qty,
      items: [
        {
          ...ga4ItemFromProduct(product, qty),
          item_variant:
            [
              size ? `Size ${size}` : '',
              showColorSelector && color ? `Colour ${color}` : '',
            ]
              .filter(Boolean)
              .join(' / ') || undefined,
        },
      ],
      spotc_action: 'add_to_cart',
    });

    alert('1 product added to cart');
  };

  const buyNow = () => {
    if (!validatePurchaseOptions()) return;

    saveSelectedGiftsForCart();
    addProduct(product, { size, color: showColorSelector ? color : '', qty });

    sendGa4Event('add_to_cart', {
      currency: 'INR',
      value: price * qty,
      items: [
        {
          ...ga4ItemFromProduct(product, qty),
          item_variant:
            [
              size ? `Size ${size}` : '',
              showColorSelector && color ? `Colour ${color}` : '',
            ]
              .filter(Boolean)
              .join(' / ') || undefined,
        },
      ],
      spotc_action: 'buy_now',
    });

    sendGa4Event('select_content', {
      content_type: 'product',
      content_id: String(product.id),
      spotc_action: 'buy_now',
    });

    router.push('/cart');
  };

  const openCompareOnline = () => {
    router.push(`/compare-online?id=${encodeURIComponent(product.id)}`);
  };

  const openShoppingCircle = async () => {
    if (!firebaseReady || askFriendsLoading) return;

    const currentUser = await requireGoogleLogin();
    if (!currentUser) return;

    setAskFriendsLoading(true);

    try {
      const db = getFirestore();
      const userRef = doc(db, 'Users', currentUser.uid);

      /*
       * SPOTC-owned products do not always have a BusinessListings ID.
       * Shopping Circle must work from the product itself, so business
       * information is optional here.
       */
      const businessRef = businessId
        ? doc(db, 'BusinessListings', businessId)
        : null;

      const safeTitle = titleOf(product)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      /*
       * Use the actual BusinessProduct ID as the stable source key.
       * This works for both SPOTC-owned products and business products.
       */
      const sourceKey = `product_${String(product.id)}_${safeTitle}`;

      const existingQuery = query(
        collection(db, 'ShoppingCircles'),
        where('created_by', '==', userRef),
        where('product_source_key', '==', sourceKey),
        where('status', '==', 'active'),
        limit(1),
      );

      const existingSnapshot = await getDocs(existingQuery);

      let circleId = '';
      let shareCode = '';

      if (!existingSnapshot.empty) {
        const existingCircle = existingSnapshot.docs[0];

        circleId = existingCircle.id;
        shareCode =
          text(existingCircle.data().share_code) ||
          `${circleId}_${Date.now()}`;

        await setDoc(
          existingCircle.ref,
          {
            product_ref: doc(db, 'BusinessProducts', product.id),
            product_id: product.id,
            product_title: displayProductTitle,
            product_image: tryOnResult || productImage,
            tryon_image: tryOnResult || null,
            product_price: price,
            selected_size: size || null,
            selected_color: showColorSelector ? color || null : null,
            business_ref: businessRef,
            business_id: businessId || '',
            business_name: businessName,
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        const circleRef = doc(collection(db, 'ShoppingCircles'));
        circleId = circleRef.id;
        shareCode = `${circleId}_${Date.now()}`;

        await setDoc(circleRef, {
          created_by: userRef,

          // Optional for SPOTC-owned products.
          business_ref: businessRef,
          business_id: businessId || '',
          business_name: businessName,

          product_ref: doc(db, 'BusinessProducts', product.id),
          product_id: product.id,
          product_source_key: sourceKey,
          product_no: productNumber,
          product_title: displayProductTitle,
          product_image: tryOnResult || productImage,
          tryon_image: tryOnResult || null,
          product_price: price,
          selected_size: size || null,
          selected_color: showColorSelector ? color || null : null,

          question: 'Should I buy this?',
          share_code: shareCode,
          status: 'active',

          participants: 0,
          vote_buy_it: 0,
          vote_looks_good: 0,
          vote_not_sure: 0,
          vote_dont_buy: 0,
          comments_count: 0,

          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          expires_at: Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ),
        });
      }

      router.push(`/circle/${encodeURIComponent(shareCode)}`);
    } catch (error) {
      console.error('Ask friends failed:', error);

      alert(
        error instanceof Error
          ? `Ask friends failed: ${error.message}`
          : 'Ask friends failed. Please try again.',
      );
    } finally {
      setAskFriendsLoading(false);
    }
  };

  const shareCircle = async () => {
    if (!circleResult) return;

    const shareUrl = `${window.location.origin}/circle/${encodeURIComponent(
      circleResult.shareCode,
    )}`;

    const shareData = {
      title: language === 'ta' ? `${displayProductTitle} வாங்கலாமா?` : `Should I buy ${displayProductTitle}?`,
      text: language === 'ta' ? `${displayProductTitle} பற்றி முடிவு செய்ய உதவுங்கள்.` : `Help me decide about ${displayProductTitle} from ${businessName} on SPOTC.`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Shopping Circle link copied.');
      }
    } catch {
      // The user can cancel the native share sheet.
    }
  };
const onTryOnImage = (
  event: React.ChangeEvent<HTMLInputElement>,
) => {
  const file = event.target.files?.[0];

  if (!file) return;

  setTryOnImage(file);
  setTryOnResult('');

  const reader = new FileReader();

  reader.onload = () => {
    setTryOnPreview(reader.result as string);
  };

  reader.readAsDataURL(file);
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read the uploaded photo.'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Unable to read the uploaded photo.'));
    };

    reader.readAsDataURL(file);
  });



const getGeneratedImage = (value: unknown): string => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/9j/') ||
      trimmed.startsWith('iVBOR')
    ) {
      if (trimmed.startsWith('/9j/')) {
        return `data:image/jpeg;base64,${trimmed}`;
      }

      if (trimmed.startsWith('iVBOR')) {
        return `data:image/png;base64,${trimmed}`;
      }

      return trimmed;
    }

    return '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = getGeneratedImage(item);
      if (image) return image;
    }

    return '';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    const likelyFields = [
      'image',
      'image_url',
      'result',
      'result_image',
      'result_image_base64',
      'output',
      'outputs',
      'images',
      'generated_image',
      'generated_images',
    ];

    for (const field of likelyFields) {
      const image = getGeneratedImage(record[field]);
      if (image) return image;
    }

    for (const nestedValue of Object.values(record)) {
      const image = getGeneratedImage(nestedValue);
      if (image) return image;
    }
  }

  return '';
};

const generateTryOn = async () => {
  if (!tryOnImage) {
    alert('Please upload a full-body photo.');
    return;
  }

  if (!productImage) {
    alert('The product image is missing.');
    return;
  }

  if (tryOnLoading) return;

  setTryOnLoading(true);
  setTryOnResult('');

  try {
    const personImageBase64 = await fileToDataUrl(tryOnImage);

    const startResponse = await fetch('/api/try-on', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
     body: JSON.stringify({
  person_image_base64: personImageBase64,
  garment_image_url: productImage,
  category: 'tops',
  garment_photo_type: 'model',
  quality: 'Balanced',
  tryon_mode: 'Natural / Maskless',
  seed_mode: 'Random',
  clean_flatlay: false,
}),
    });

    const startData = await startResponse.json();

    if (!startResponse.ok || !startData.success) {
      throw new Error(
        startData.error || 'Unable to start the AI try-on.',
      );
    }

    const jobId = String(startData.job_id || '').trim();

    if (!jobId) {
      throw new Error('RunPod did not return a job ID.');
    }

    const maximumChecks = 120;

    for (let check = 0; check < maximumChecks; check += 1) {
      await wait(3000);

      const statusResponse = await fetch(
        `/api/try-on?jobId=${encodeURIComponent(jobId)}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const statusData = await statusResponse.json();

      if (!statusResponse.ok || !statusData.success) {
        throw new Error(
          statusData.error || 'Unable to check the AI try-on status.',
        );
      }

      const status = String(statusData.status || '').toUpperCase();

      if (status === 'COMPLETED') {
        const generatedImage = getGeneratedImage(statusData.output);

        if (!generatedImage) {
          console.error(
            'RunPod completed without a recognised image:',
            statusData,
          );

          throw new Error(
            'RunPod completed, but no generated image was returned.',
          );
        }

        setTryOnResult(generatedImage);
        return;
      }

      if (
        status === 'FAILED' ||
        status === 'CANCELLED' ||
        status === 'TIMED_OUT'
      ) {
        const errorMessage =
          typeof statusData.error === 'string'
            ? statusData.error
            : `RunPod job ended with status ${status}.`;

        throw new Error(errorMessage);
      }
    }

    throw new Error(
      'The AI try-on is taking too long. Please try again.',
    );
  } catch (error) {
    console.error('AI try-on failed:', error);

    alert(
      error instanceof Error
        ? `Try On failed: ${error.message}`
        : 'Try On failed. Please try again.',
    );
   } finally {
    setTryOnLoading(false);
  }
};

const saveTryOnImage = async () => {
  if (!tryOnResult) return;

  try {
    const response = await fetch(tryOnResult);
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `spotc-tryon-${product.id}.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Saving Try On image failed:', error);

    const link = document.createElement('a');
    link.href = tryOnResult;
    link.download = `spotc-tryon-${product.id}.png`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};

const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReviewMessage('');

    if (!firebaseReady) {
      setReviewMessage('Firebase is not configured. Review was not submitted.');
      return;
    }

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewMessage('Select a star rating first.');
      return;
    }

    if (!reviewComment.trim()) {
      setReviewMessage('Write a short review before submitting.');
      return;
    }

    setReviewSubmitting(true);

    try {
      const db = getFirestore();
      const currentUser = auth?.currentUser ?? null;
      const reviewerId = currentUser?.uid || persistentReviewerId();
      const reviewerName =
        reviewName.trim() || currentUser?.displayName || 'SPOTC customer';
      const productRef = doc(db, 'BusinessProducts', product.id);
      const reviewRef = doc(db, 'BusinessProducts', product.id, 'Reviews', reviewerId);

      const result = await runTransaction(db, async (transaction) => {
        const [productSnapshot, oldReviewSnapshot] = await Promise.all([
          transaction.get(productRef),
          transaction.get(reviewRef),
        ]);

        if (!productSnapshot.exists()) throw new Error('Product document not found.');

        const productData = productSnapshot.data();
        const oldRating = oldReviewSnapshot.exists()
          ? numberValue(oldReviewSnapshot.data().rating)
          : null;

        let reviewCount = numberValue(productData.reviews_count) ?? 0;
        let ratingTotal = numberValue(productData.rating_total);

        if (ratingTotal === null) {
          const existingAverage = numberValue(productData.average_rating) ?? 0;
          ratingTotal = existingAverage * reviewCount;
        }

        let nextVeryGood = numberValue(productData.rating_very_good) ?? 0;
        let nextGood = numberValue(productData.rating_good) ?? 0;
        let nextFair = numberValue(productData.rating_fair) ?? 0;

        const changeBucket = (rating: number, delta: number) => {
          if (rating === 5) nextVeryGood = Math.max(0, nextVeryGood + delta);
          else if (rating === 4) nextGood = Math.max(0, nextGood + delta);
          else if (rating <= 3) nextFair = Math.max(0, nextFair + delta);
        };

        if (oldRating === null) {
          reviewCount += 1;
          ratingTotal += reviewRating;
        } else {
          ratingTotal = ratingTotal - oldRating + reviewRating;
          changeBucket(oldRating, -1);
        }

        changeBucket(reviewRating, 1);
        const averageRating = reviewCount > 0 ? ratingTotal / reviewCount : 0;

        transaction.set(
          reviewRef,
          {
            product_id: product.id,
            product_ref: productRef,
            reviewer_uid: currentUser?.uid || null,
            reviewer_id: reviewerId,
            reviewer_name: reviewerName,
            rating: reviewRating,
            title: reviewTitle.trim(),
            comment: reviewComment.trim(),
            updated_at: serverTimestamp(),
            ...(oldReviewSnapshot.exists() ? {} : { created_at: serverTimestamp() }),
          },
          { merge: true },
        );

        transaction.update(productRef, {
          reviews_count: reviewCount,
          rating_count: reviewCount,
          rating_total: ratingTotal,
          average_rating: averageRating,
          rating_average: averageRating,
          rating_very_good: nextVeryGood,
          rating_good: nextGood,
          rating_fair: nextFair,
          updated_at: serverTimestamp(),
        });

        const businessId = text(
          productData.business_id || record.business_id || record.parent_business_id,
        ).trim();
        const productIndex = numberValue(
          productData.product_index || record.product_index || record.image_index,
        );

        if (businessId && productIndex !== null && productIndex >= 1 && productIndex <= 20) {
          const legacyBusinessRef = doc(db, 'BusinessListings', businessId);
          const legacySnapshot = await transaction.get(legacyBusinessRef);

          if (legacySnapshot.exists()) {
            const legacyData = legacySnapshot.data();
            const prefix = `image${Math.floor(productIndex)}_rating_`;
            let legacyVeryGood = numberValue(legacyData[`${prefix}very_good`]) ?? 0;
            let legacyGood = numberValue(legacyData[`${prefix}good`]) ?? 0;
            let legacyFair = numberValue(legacyData[`${prefix}fair`]) ?? 0;

            const legacyChange = (rating: number, delta: number) => {
              if (rating === 5) legacyVeryGood = Math.max(0, legacyVeryGood + delta);
              else if (rating === 4) legacyGood = Math.max(0, legacyGood + delta);
              else if (rating <= 3) legacyFair = Math.max(0, legacyFair + delta);
            };

            if (oldRating !== null) legacyChange(oldRating, -1);
            legacyChange(reviewRating, 1);

            transaction.update(legacyBusinessRef, {
              [`${prefix}very_good`]: legacyVeryGood,
              [`${prefix}good`]: legacyGood,
              [`${prefix}fair`]: legacyFair,
            });
          }
        }

        return {
          average: averageRating,
          count: reviewCount,
          veryGood: nextVeryGood,
          good: nextGood,
          fair: nextFair,
          reviewerId,
          reviewerName,
        };
      });

      setRatingSnapshot(result);
      setReviews((current) => {
        const nextReview: ReviewRecord = {
          id: result.reviewerId,
          rating: reviewRating,
          title: reviewTitle.trim(),
          comment: reviewComment.trim(),
          reviewer_name: result.reviewerName,
          created_at: new Date(),
        };

        return [nextReview, ...current.filter((item) => item.id !== result.reviewerId)];
      });
      setReviewTitle('');
      setReviewComment('');
      setReviewRating(0);
      setReviewMessage('Your review has been saved to Firestore.');
    } catch (error) {
      setReviewMessage(
        error instanceof Error
          ? `Review could not be saved: ${error.message}`
          : 'Review could not be saved. Check Firestore rules and try again.',
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  const accordionItems: Array<{
    key: AccordionKey;
    icon: typeof FileText;
    title: string;
    subtitle: string;
    content: React.ReactNode;
  }> = [
    {
      key: 'description',
      icon: FileText,
      title: t('Product Description'),
      subtitle: t('Details, brand, colour, size and availability'),
      content: (
        <div className="pd-accordion-copy" data-i18n-product-description="true">
          <p>
            {description ||
              t('Contact SPOTC for additional product details.')}
          </p>

          {highlightsText && (
            <div className="pd-description-highlights">
              <strong>{t('Highlights')}</strong>
              <ul>
                {highlightsText
                  .split(/\n|•/)
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((item) => (
                    <li key={item}>{item}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'delivery',
      icon: Truck,
      title: t('Delivery / Free Shipping'),
      subtitle: freeShipping ? t('Free shipping available') : t(deliveryText),
      content: (
        <div className="pd-accordion-copy">
          <p>{deliveryDetails}</p>

          <dl className="pd-delivery-slots">
            <div>
              <dt>{t('Instant')}</dt>
              <dd>{t('About 15 mins · ₹20')}</dd>
            </div>
            <div>
              <dt>{t('Morning')}</dt>
              <dd>{t('Order 6 AM–12 PM · Delivery 12–2 PM · FREE')}</dd>
            </div>
            <div>
              <dt>{t('Afternoon')}</dt>
              <dd>{t('Order 12–6 PM · Delivery 6–7 PM · FREE')}</dd>
            </div>
            <div>
              <dt>{t('Night')}</dt>
              <dd>{t('Order 6 PM–6 AM · Delivery 6–8 AM · FREE')}</dd>
            </div>
          </dl>

          <div className="pd-inline-benefits">
            <span><Truck />Fast local delivery</span>
            {codAvailable && <span><ShoppingBag />Cash on Delivery</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'returns',
      icon: RefreshCcw,
      title: t('Return & Exchange'),
      subtitle: '5-minute doorstep fit check for eligible clothing',
      content: <div className="pd-accordion-copy"><p>{returnDetails}</p></div>,
    },
    {
      key: 'reviews',
      icon: MessageSquareText,
      title: t('Reviews'),
      subtitle: finalReviewCount > 0 ? `${Math.round(finalReviewCount)} customer rating${finalReviewCount === 1 ? '' : 's'}` : 'Be the first to review',
      content: (
        <div className="pd-review-area">
          <div className="pd-review-summary">
            {finalRating !== null ? (
              <>
                <strong>{finalRating.toFixed(1)}</strong>
                <span><Star fill="currentColor" />Based on {Math.round(finalReviewCount)} {finalReviewCount === 1 ? t('rating') : t('ratings')}</span>
              </>
            ) : (
              <p>No customer ratings yet.</p>
            )}
          </div>

          <form className="pd-review-form" onSubmit={submitReview}>
            <h3>Write a review</h3>
            <div className="pd-star-input" aria-label="Review rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  className={star <= reviewRating ? 'active' : ''}
                  onClick={() => setReviewRating(star)}
                >
                  <Star fill="currentColor" />
                </button>
              ))}
            </div>
            <div className="pd-review-grid">
              <input
                value={reviewName}
                onChange={(event) => setReviewName(event.target.value)}
                placeholder="Your name (optional)"
                maxLength={60}
              />
              <input
                value={reviewTitle}
                onChange={(event) => setReviewTitle(event.target.value)}
                placeholder="Review title (optional)"
                maxLength={100}
              />
            </div>
            <textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder="What did you like or dislike?"
              maxLength={1000}
              rows={4}
              required
            />
            <button className="pd-submit-review" type="submit" disabled={reviewSubmitting}>
              {reviewSubmitting ? 'Saving review…' : 'Submit review'}
            </button>
            {reviewMessage && <p className="pd-review-message">{reviewMessage}</p>}
          </form>

          <div className="pd-review-list">
            {reviewsLoading ? (
              <p>Loading reviews…</p>
            ) : reviews.length ? (
              reviews.map((review) => (
                <article key={review.id}>
                  <div>
                    <strong>{review.reviewer_name}</strong>
                    <span>{dateText(review.created_at)}</span>
                  </div>
                  <div className="pd-review-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} fill={star <= review.rating ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  {review.title && <h4>{review.title}</h4>}
                  <p>{review.comment}</p>
                </article>
              ))
            ) : (
              <p>No written reviews yet.</p>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <main className="pd-page">
      <div className="pd-shop-category-bar" aria-label="Shop categories">
        <div className="pd-shop-category-list">
          {[
            'Girl Dress',
            'Earrings',
            'Fancy Items',
            'Toys',
            'Keychains',
          ].map((categoryName) => {
            const isActive =
              mainCategoryText.trim().toLowerCase() ===
              categoryName.trim().toLowerCase();

            return (
              <button
                key={categoryName}
                type="button"
                className={`pd-shop-category-pill${isActive ? ' active' : ''}`}
                onClick={() =>
                  router.push(
                    `/shop?category=${encodeURIComponent(categoryName)}`,
                  )
                }
              >
                {categoryName}
              </button>
            );
          })}
        </div>

        <select
          className="pd-shop-sort"
          aria-label="Sort shop products"
          defaultValue="Featured"
          onChange={(event) => {
            const sortValue = event.target.value;
            router.push(
              `/shop?sort=${encodeURIComponent(sortValue)}${
                mainCategoryText
                  ? `&category=${encodeURIComponent(mainCategoryText)}`
                  : ''
              }`,
            );
          }}
        >
          <option value="Featured">Sort</option>
          <option value="Low Price">Low Price</option>
          <option value="High Price">High Price</option>
          <option value="Discount">Discount</option>
        </select>
      </div>

      <section className="pd-main">
        <div className="pd-gallery">
          {selectedMedia?.type === 'video' ? (
            <div className="pd-image pd-media-video-shell">
              {discount > 0 && (
                <span className="pd-discount-chip">{discount}% OFF</span>
              )}

              <span className="pd-delivery-chip">
                <Clock3 aria-hidden="true" />
                <span>{deliveryMinutes} mins delivery</span>
              </span>

              <video
                key={selectedMedia.url}
                className="pd-media-video"
                src={selectedMedia.url}
                poster={selectedMedia.poster || productImage || undefined}
                controls
                playsInline
                preload="metadata"
              />
            </div>
          ) : (
            <div
              className="pd-image pd-image-zoom"
              role="img"
              aria-label={displayProductTitle}
              onMouseEnter={() => {
                setZoomActive(true);
              }}
              onMouseMove={(event) => {
                const bounds =
                  event.currentTarget.getBoundingClientRect();

                const x = Math.max(
                  0,
                  Math.min(
                    100,
                    ((event.clientX - bounds.left) /
                      bounds.width) *
                      100,
                  ),
                );

                const y = Math.max(
                  0,
                  Math.min(
                    100,
                    ((event.clientY - bounds.top) /
                      bounds.height) *
                      100,
                  ),
                );

                setZoomPosition({ x, y });
              }}
              onMouseLeave={() => {
                setZoomActive(false);
              }}
              style={{
                backgroundImage: `url("${
                  selectedMedia?.url ||
                  selectedImage ||
                  imageOf(product)
                }")`,
              }}
            >
              {discount > 0 && (
                <span className="pd-discount-chip">{discount}% OFF</span>
              )}

              <span className="pd-delivery-chip">
                <Clock3 aria-hidden="true" />
                <span>{deliveryMinutes} mins delivery</span>
              </span>
            </div>
          )}

          {productMedia.length > 1 && (
            <div
              className="pd-thumbs pd-media-thumbs"
              aria-label="Product media"
            >
              {productMedia.map((media) => (
                <button
                  type="button"
                  aria-label={`View ${media.label}`}
                  title={media.label}
                  className={
                    selectedMedia?.url === media.url ? 'active' : ''
                  }
                  onClick={() => {
                    setSelectedMediaUrl(media.url);

                    if (media.type === 'image') {
                      setSelectedImage(media.url);
                    }
                  }}
                  key={`${media.type}-${media.role}-${media.url}`}
                >
                  {media.type === 'video' ? (
                    <>
                      <video
                        className="pd-media-thumb-video"
                        src={media.url}
                        muted
                        playsInline
                        preload="metadata"
                      />

                      <span
                        className="pd-media-play"
                        aria-hidden="true"
                      >
                        <Play fill="currentColor" />
                      </span>
                    </>
                  ) : (
                    <img
                      src={media.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={152}
                      height={152}
                    />
                  )}

                </button>
              ))}
            </div>
          )}
        </div>

        {zoomActive &&
          selectedMedia?.type !== 'video' && (
            <div
              className="pd-zoom-panel"
              aria-hidden="true"
              style={{
                backgroundImage: `url("${
                  selectedMedia?.url ||
                  selectedImage ||
                  imageOf(product)
                }")`,
                backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
              }}
            />
          )}

        <div className="pd-info">
          <h1>{displayProductTitle}</h1>

          <div className="pd-rating">
            {finalRating !== null && <span><Star size={15} fill="currentColor" />{finalRating.toFixed(1)}</span>}
            {finalReviewCount > 0 && <span>{Math.round(finalReviewCount)} {finalReviewCount === 1 ? t('rating') : t('ratings')}</span>}
            <span className={inStock ? 'pd-stock-available' : 'pd-stock-unavailable'}>
              {inStock
                ? stockQuantity
                  ? language === 'ta' ? `${stockQuantity} ஸ்டாக்கில் உள்ளது` : `${stockQuantity} in stock`
                  : t('In stock')
                : t('Out of stock')}
            </span>
          </div>

          <div className="pd-price">
            <strong>₹{Math.round(price)}</strong>
            {oldPrice > price && <del>₹{Math.round(oldPrice)}</del>}
            {oldPrice > price && <em>{t('Save')} ₹{Math.round(oldPrice - price)}</em>}
          </div>
{showColorSelector && (
            <div className="pd-option">
              <label>{t('Colour')}</label>
              <div>
                {selectableColors.map((option) => (
                  <button
                    type="button"
                    className={color === option ? 'active' : ''}
                    onClick={() => setColor(option)}
                    key={option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pd-purchase-benefits" aria-label={t('Purchase benefits')}>
            <span>
              <Clock3 aria-hidden="true" />
              {t('15 mins delivery')}
            </span>

            {codAvailable && (
              <span>
                <PackageCheck aria-hidden="true" />
                {t('Cash on Delivery')}
              </span>
            )}

            <span>
              <CheckCircle2 aria-hidden="true" />
              {t('Ready stock')}
            </span>
          </div>

          {freeGiftCount > 0 && (
            <>
              <button
                type="button"
                className="pd-free-gift-cta"
                onClick={() => setGiftPreviewOpen(true)}
                aria-expanded={giftPreviewOpen}
              >
                <span className="pd-free-gift-cta-icon">
                  <Gift aria-hidden="true" />
                </span>

                <span className="pd-free-gift-cta-copy">
                  <strong>
                    {language === 'ta'
                      ? `${freeGiftCount} ${freeGiftCount === 1
                          ? 'இலவச பரிசு சேர்க்கப்பட்டுள்ளது'
                          : 'இலவச பரிசுகள் சேர்க்கப்பட்டுள்ளன'}`
                      : freeGiftCount === 1
                        ? '1 FREE Gift Included'
                        : `${freeGiftCount} FREE Gifts Included`}
                  </strong>
                  <small>
                    {language === 'ta'
                      ? selectedGiftIds.length > 0
                        ? `${selectedGiftIds.length} / ${freeGiftCount} தேர்வு செய்யப்பட்டது · திருத்த தட்டவும்`
                        : qty > 1
                          ? `ஒவ்வொரு பொருளுக்கும் ${freeGiftCountPerItem} × ${qty} பொருட்கள் · பரிசுகளைத் தேர்ந்தெடுக்கவும்`
                          : freeGiftCount === 1
                            ? 'உங்கள் இலவச பரிசைத் தேர்ந்தெடுக்கவும்'
                            : `${freeGiftCount} இலவச பரிசுகளைத் தேர்ந்தெடுக்கவும்`
                      : selectedGiftIds.length > 0
                        ? `${selectedGiftIds.length} of ${freeGiftCount} selected · Tap to edit`
                        : qty > 1
                          ? `${freeGiftCountPerItem} per item × ${qty} items · Choose gifts`
                          : freeGiftCount === 1
                            ? 'Choose your FREE gift'
                            : `Choose any ${freeGiftCount} FREE gifts`}
                  </small>
                </span>

                <ChevronLeft
                  className="pd-free-gift-cta-arrow"
                  aria-hidden="true"
                />
              </button>


            </>
          )}

          <div className={`pd-purchase-row ${stockQuantity === 1 ? 'pd-purchase-row-no-qty' : ''}`}>
            {stockQuantity !== 1 && (
              <div className="pd-qty pd-qty-inline">
                <div>
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={qty <= 1}
                    onClick={() => {
                      setQty((current) => {
                        const nextQty = Math.max(1, current - 1);
                        const nextGiftLimit =
                          freeGiftCountPerItem * nextQty;

                        setSelectedGiftIds((selected) =>
                          selected.slice(0, nextGiftLimit),
                        );

                        return nextQty;
                      });
                    }}
                  >
                    <Minus />
                  </button>

                  <strong>{qty}</strong>

                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={!inStock || qty >= maximumQuantity}
                    onClick={() =>
                      setQty((current) =>
                        Math.min(maximumQuantity, current + 1),
                      )
                    }
                  >
                    <Plus />
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              className="pd-cart-secondary"
              disabled={!inStock}
              onClick={addToCart}
            >
              <ShoppingBag />
              <span>{inStock ? t('Add to cart') : t('Out of stock')}</span>
            </button>

            <button
              type="button"
              className="pd-buy-primary"
              disabled={!inStock}
              onClick={buyNow}
            >
              <Bolt />
              <span>{inStock ? t('Buy Now') : t('Out of stock')}</span>
            </button>
          </div>

          {productDetailRows.length > 0 && (
            <section
              className="pd-inline-details"
              aria-label="Product details"
            >
              <div className="pd-inline-details-heading">
                <div>
                  <small>{t('PRODUCT DETAILS')}</small>
                  <h2>
                    {isGirlDressProduct
                      ? t('Dress details & measurements')
                      : t('Product details')}
                  </h2>
                </div>
              </div>

              <dl className="pd-inline-details-grid">
                {productDetailRows.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

        </div>
      </section>

      <section className="pd-commerce-tools" aria-label="Shopping tools">
        <button
          type="button"
          className="pd-tool-card pd-tool-compare"
          onClick={openCompareOnline}
          disabled={compareState === 'loading'}
        >
          <span className="pd-tool-icon"><GitCompareArrows /></span>
          <span className="pd-tool-copy">
            <strong>{t('Compare Online')}</strong>
            <small>{t('Find similar products & best prices')}</small>
            <em>{t('SpotC Price')} ₹{Math.round(price)}</em>
          </span>
          <ChevronLeft className="pd-tool-arrow" />
        </button>

        <button
          type="button"
          className="pd-tool-card pd-tool-friends"
          onClick={openShoppingCircle}
          disabled={askFriendsLoading}
        >
          <span className="pd-tool-icon"><Users /></span>
          <span className="pd-tool-copy">
            <strong>{t('Ask Friends & Family')}</strong>
            <small>{askFriendsLoading ? t('Creating Shopping Circle…') : t('Share with friends & family to get opinions')}</small>
          </span>
          <ChevronLeft className="pd-tool-arrow" />
        </button>
</section>

      <section className="pd-accordions" aria-label="Product information">
        {accordionItems.map((item) => {
          const Icon = item.icon;
          const open = openAccordion === item.key;

          return (
            <article className={`pd-accordion ${open ? 'open' : ''}`} key={item.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenAccordion(open ? 'description' : item.key)}
              >
                <Icon className="pd-accordion-icon" />
                <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                <ChevronDown className="pd-accordion-chevron" />
              </button>
              {open && <div className="pd-accordion-content">{item.content}</div>}
            </article>
          );
        })}
      </section>

      <section className="pd-related-section">
        <div className="pd-section-heading">
          <div><small>MORE TO DISCOVER</small><h2>Related products</h2></div>
          <Link href="/shop">View all</Link>
        </div>

        {relatedLoading ? (
          <div className="pd-related-loading"><span /><span /><span /><span /></div>
        ) : related.length ? (
          <div className="pd-related-grid">
            {related.map((item) => {
              const relatedRecord = item as ProductRecord;
              const relatedStock = numberValue(
                relatedRecord.stock_qty ?? relatedRecord.stock_quantity,
              );
              const relatedPrice = customerPriceOf(item);
              const relatedOldPrice = oldPriceOf(item);
const relatedFreeGiftCount =
                relatedPrice < 80
                  ? 0
                  : relatedPrice < 200
                    ? 1
                    : Math.floor(relatedPrice / 100);
              const relatedDeliveryMinutes = Math.max(
                1,
                Math.floor(
                  numberValue(
                    relatedRecord.delivery_minutes ||
                      relatedRecord.estimated_delivery_minutes ||
                      relatedRecord.delivery_time_minutes,
                  ) ?? 15,
                ),
              );

              return (
                <Link className="pd-related-card" href={`/product/${item.id}`} key={item.id}>
                  <div className="pd-related-image">
                    {imageOf(item) ? (
                      <img
                        src={imageOf(item)}
                        alt={titleOf(item)}
                        loading="lazy"
                        decoding="async"
                        width={480}
                        height={600}
                        className="pd-related-image-file"
                      />
                    ) : null}

                    {discountOf(item) > 0 && (
                      <span className="pd-related-discount-chip">
                        {discountOf(item)}% OFF
                      </span>
                    )}
                  </div>

                  <h3>{titleOf(item)}</h3>

                  <div className="pd-related-delivery">
                    <Clock3 aria-hidden="true" />
                    <span>{relatedDeliveryMinutes} mins delivery</span>
                  </div>

                  <div className="pd-related-price-row">
                    <strong>₹{Math.round(relatedPrice)}</strong>

                    {relatedOldPrice > relatedPrice && (
                      <del>₹{Math.round(relatedOldPrice)}</del>
                    )}

                    {relatedOldPrice > relatedPrice && (
                      <em>
                        Save ₹{Math.round(relatedOldPrice - relatedPrice)}
                      </em>
                    )}
                  </div>
{relatedFreeGiftCount > 0 && (
                    <div className="pd-related-gift">
                      <Gift aria-hidden="true" />
                      <span>
                        {relatedFreeGiftCount === 1
                          ? '1 FREE gift with this item'
                          : `${relatedFreeGiftCount} FREE gifts with this item`}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="pd-no-related">No related products are available right now.</p>
        )}
      </section>

      {giftPreviewOpen &&
        freeGiftCount > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pd-modal-backdrop pd-gift-selector-backdrop"
            role="presentation"
            onMouseDown={() => setGiftPreviewOpen(false)}
          >
          <section
            className="pd-modal pd-gift-selector"
            role="dialog"
            aria-modal="true"
            aria-label={`Choose ${freeGiftCount} FREE gifts`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="pd-gift-selector-header">
              <div>
                <span className="pd-gift-selector-kicker">
                  FREE WITH THIS ORDER
                </span>
                <h2>
                  Choose {freeGiftCount} FREE{' '}
                  {freeGiftCount === 1 ? 'gift' : 'gifts'}
                </h2>
              
              </div>

              <button
                type="button"
                className="pd-modal-close pd-gift-selector-close"
                aria-label="Close FREE gift selector"
                onClick={() => setGiftPreviewOpen(false)}
              >
                <X />
              </button>
            </header>

            <div className="pd-gift-selector-toolbar">
              <label className="pd-gift-search">
                <span className="pd-gift-search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  value={giftSearch}
                  onChange={(event) => setGiftSearch(event.target.value)}
                  placeholder="Search FREE gifts"
                  aria-label="Search FREE gifts"
                />
              </label>


            </div>

            {giftCategories.length > 1 && (
              <div
                className="pd-gift-categories"
                aria-label="FREE gift categories"
              >
                {giftCategories.map((categoryName) => (
                  <button
                    type="button"
                    key={categoryName}
                    className={
                      giftCategory === categoryName ? 'active' : ''
                    }
                    onClick={() => setGiftCategory(categoryName)}
                  >
                    {categoryName}
                  </button>
                ))}
              </div>
            )}

            <div className="pd-gift-products" ref={giftProductsRef}>
              {visibleGiftProducts.length ? (
                visibleGiftProducts.map((gift) => {
                  const giftId = String(gift.id);
                  const selected =
                    selectedGiftIds.includes(giftId);
                  const limitReached =
                    selectedGiftIds.length >= freeGiftCount &&
                    !selected;

                  return (
                    <button
                      type="button"
                      key={giftId}
                      className={`pd-gift-product ${
                        selected ? 'selected' : ''
                      }`}
                      disabled={limitReached}
                      aria-pressed={selected}
                      onClick={() => toggleFreeGift(giftId)}
                    >
                      <span
                        className="pd-gift-product-image"
                        style={{
                          backgroundImage: imageOf(gift)
                            ? `url("${imageOf(gift)}")`
                            : undefined,
                        }}
                      >
                        {selected && (
                          <b
                            className="pd-gift-selected-tick"
                            aria-hidden="true"
                          >
                            ✓
                          </b>
                        )}
                      </span>

                      <span className="pd-gift-product-copy">
                        <strong>{titleOf(gift)}</strong>

                        <span className="pd-gift-price-row">
                          <b>FREE</b>
                        </span>

                        <small>
                          {selected ? '✓ Selected' : '+ Select'}
                        </small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="pd-gift-empty">
                  <Gift aria-hidden="true" />
                  <strong>No matching FREE gifts</strong>
                  <p>Try another search or category.</p>
                </div>
              )}
            </div>

            <footer className="pd-gift-selector-footer">
              <div>
                <strong>
                  {selectedGiftIds.length} of {freeGiftCount} selected
                </strong>
                <span>
                  {selectedGiftIds.length === freeGiftCount
                    ? 'Your FREE gifts are ready.'
                    : `Choose ${
                        freeGiftCount - selectedGiftIds.length
                      } more.`}
                </span>
              </div>

              <button
                type="button"
                disabled={
                  selectedGiftIds.length !== freeGiftCount
                }
                onClick={confirmFreeGifts}
              >
                {selectedGiftIds.length === freeGiftCount
                  ? 'Confirm FREE Gifts'
                  : `Select ${
                      freeGiftCount - selectedGiftIds.length
                    } more`}
              </button>
            </footer>
          </section>
          </div>,
          document.body,
        )}

      {compareState !== 'closed' && (
        <div className="pd-modal-backdrop" role="presentation" onMouseDown={() => setCompareState('closed')}>
          <section
            className="pd-modal pd-compare-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Compare Online"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="pd-modal-close" type="button" onClick={() => setCompareState('closed')}><X /></button>
            <div className="pd-modal-handle" />
            <h2>{compareState === 'loading' ? 'Preparing AI Comparison' : 'Compare Online'}</h2>

            <div className="pd-spotc-product">
              <div style={{ backgroundImage: `url("${productImage}")` }} />
              <span>
                <strong>{businessName}</strong>
                <small>{displayProductTitle}</small>
                <em>₹{Math.round(price)}</em>
                <b>15 min delivery · COD</b>
              </span>
            </div>

            {compareState === 'loading' && (
              <div className="pd-compare-steps">
                <p><span className="pd-spinner" />Understanding the product</p>
                <p><span className="pd-spinner" />Finding similar online products</p>
                <p><span className="pd-spinner" />Checking official product links</p>
                <p><span className="pd-spinner" />Calculating SPOTC value</p>
                <small>First comparison may take 5–15 seconds. The next one opens faster.</small>
              </div>
            )}

            {compareState === 'error' && (
              <div className="pd-compare-error">
                <p>Comparison failed: {compareError}</p>
                <button type="button" onClick={openCompareOnline}>Try again</button>
              </div>
            )}

            {compareState === 'ready' && (
              <div className="pd-online-results">
                <h3>Similar Products Online</h3>
                {compareProducts.length ? compareProducts.map((item) => (
                  <a key={item.id} href={item.url || '#'} target="_blank" rel="noreferrer" className={!item.url ? 'disabled' : ''}>
                    <div style={{ backgroundImage: item.image ? `url("${item.image}")` : undefined }} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.platform} · {Math.round(item.matchScore)}% match</small>
                      <em>{item.url ? 'Open official product link' : 'Official link unavailable'}</em>
                    </span>
                  </a>
                )) : <p>No reliable online match was found yet.</p>}

                <div className="pd-why-spotc">
                  <h3>Why SpotC Wins</h3>
                  <p>✓ 15 min local delivery instead of waiting days</p>
                  <p>✓ Cash on Delivery</p>
                  <p>✓ Local exchange support</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {circleResult && (
        <div className="pd-modal-backdrop" role="presentation" onMouseDown={() => setCircleResult(null)}>
          <section className="pd-modal pd-circle-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pd-modal-close" type="button" onClick={() => setCircleResult(null)}><X /></button>
            <CheckCircle2 className="pd-success-icon" />
            <h2>Shopping Circle Ready</h2>
            <p>Your product question has been created. Share it with friends and family from SPOTC.</p>
            <button type="button" className="pd-circle-share" onClick={shareCircle}><Users />Share with friends</button>
            <button
              type="button"
              className="pd-circle-copy"
              onClick={async () => {
                const link = `${window.location.origin}/circle/${encodeURIComponent(circleResult.shareCode)}`;
                await navigator.clipboard.writeText(link);
                alert('Shopping Circle link copied.');
              }}
            ><Copy />Copy link</button>
          </section>
        </div>
      )}

      {tryOnOpen && (
  <div
    className="pd-modal-backdrop"
    onMouseDown={() => setTryOnOpen(false)}
  >
    <section
      className="pd-modal pd-tryon-sheet"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        className="pd-modal-close"
        type="button"
        onClick={() => setTryOnOpen(false)}
      >
        <X />
      </button>

      <div className="pd-modal-handle" />

      <h2 className="pd-tryon-title">
        AI Virtual Try On
      </h2>

      <p className="pd-tryon-subtitle">
        Upload one full-body photo to see yourself wearing this product.
      </p>

      <div className="pd-tryon-guide">
        <div className="pd-tryon-guide-copy">
          <span className="pd-tryon-guide-kicker">PHOTO GUIDE</span>

          <h3>Use a clear full-body photo</h3>

          <ul className="pd-tryon-tip-list">
            <li><span>✓</span>Stand facing the camera</li>
            <li><span>✓</span>Keep your full body visible</li>
            <li><span>✓</span>Keep your arms relaxed</li>
            <li><span>✓</span>Use a plain background</li>
            <li><span>✓</span>Use bright, even lighting</li>
          </ul>
        </div>

        <figure className="pd-tryon-sample">
  <img
    src="/images/tryon-photo-guide-girl.png"
    alt="Recommended full-body pose for virtual try-on"
  />
  <figcaption>Recommended pose</figcaption>
</figure>
      </div>

      {tryOnPreview && !tryOnResult && (
  <div
    className="pd-tryon-preview"
    style={{
      backgroundImage: `url("${tryOnPreview}")`,
    }}
  />
)}

      <input
        id="spotc-tryon-upload"
        type="file"
        accept="image/*"
        hidden
        onChange={onTryOnImage}
      />

      <div className="pd-tryon-actions-row">
  <button
    className="pd-tryon-upload"
    type="button"
    onClick={() =>
      document
        .getElementById('spotc-tryon-upload')
        ?.click()
    }
  >
    {tryOnImage
      ? 'Change Photo'
      : 'Upload Full Body Photo'}
  </button>

  <button
    className="pd-tryon-generate"
    type="button"
    disabled={!tryOnImage || tryOnLoading}
    onClick={generateTryOn}
  >
    {tryOnLoading
      ? 'Generating...'
      : 'Generate AI Try On'}
  </button>
</div>

      {tryOnResult && (
        <>
          <div
    className="pd-tryon-result"
    onClick={() => setFullscreenTryOn(true)}
>
    <img
        src={tryOnResult}
        alt="AI Try On"
    />
</div>
{fullscreenTryOn && (
  <div
    className="pd-tryon-fullscreen"
    role="presentation"
    onClick={() => setFullscreenTryOn(false)}
  >
    <button
      type="button"
      className="pd-tryon-fullscreen-close"
      aria-label="Close fullscreen image"
      onClick={() => setFullscreenTryOn(false)}
    >
      <X />
    </button>

    <div
      className="pd-fullscreen-image"
      onClick={(event) => event.stopPropagation()}
    >
      <img
        src={tryOnResult}
        alt="AI virtual try-on fullscreen result"
      />
    </div>
  </div>
)}

          <div className="pd-tryon-actions">
           <button
className="pd-tryon-save"
type="button"
onClick={saveTryOnImage}
>
Save Image
</button>

           <button
className="pd-tryon-circle"
type="button"
disabled={!tryOnResult}
onClick={openShoppingCircle}
>
              Add to Shopping Circle
            </button>
          </div>
        </>
      )}
    </section>
  </div>
)}

      <style jsx global>{`
        /* FREE GIFT — FINAL PREMIUM SOFT STYLE */
        .pd-free-gift-cta{
          border:1px solid #efd49f!important;
          background:linear-gradient(135deg,#fffaf0 0%,#fff2d5 100%)!important;
          color:#3b290b!important;
          box-shadow:0 7px 22px rgba(133,87,16,.09)!important;
        }

        .pd-free-gift-cta:hover{
          border-color:#e6c47e!important;
          box-shadow:0 9px 26px rgba(133,87,16,.13)!important;
        }

        .pd-free-gift-cta-icon{
          background:#fff0c4!important;
          color:#b27612!important;
          border:1px solid #efd79f!important;
          box-shadow:none!important;
        }

        .pd-free-gift-cta-copy strong{
          color:#33230a!important;
          font-weight:900!important;
        }

        .pd-free-gift-cta-copy small{
          color:#82652f!important;
        }

        .pd-related-card > .pd-related-gift{
          width:auto!important;
          max-width:100%!important;
          min-height:25px!important;
          height:25px!important;
          flex:0 0 25px!important;
          margin-top:auto!important;
          padding:0 8px!important;

          display:inline-flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          align-self:flex-start!important;
          gap:5px!important;

          border:1px solid #efd9ae!important;
          border-radius:8px!important;
          background:#fff9ed!important;
          color:#8b5b0b!important;
          box-shadow:none!important;

          font-size:9.5px!important;
          font-weight:850!important;
          line-height:1!important;
          white-space:nowrap!important;
          box-sizing:border-box!important;
        }

        .pd-related-card > .pd-related-gift svg{
          width:11px!important;
          height:11px!important;
          flex:0 0 11px!important;
          color:#ba7a12!important;
        }

        .pd-related-card > .pd-related-delivery{
          width:100%!important;
          height:23px!important;
          min-height:23px!important;
          flex:0 0 23px!important;
          margin:0 0 6px!important;
          padding:0!important;
          display:flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:5px!important;
          background:transparent!important;
          border:0!important;
        }

        @media(max-width:620px){
          .pd-related-card > .pd-related-gift{
            min-height:24px!important;
            height:24px!important;
            flex-basis:24px!important;
            padding:0 7px!important;
            font-size:9px!important;
          }
        }
        /* RELATED PRODUCT FREE GIFT — FINAL SOFT ALIGNED STYLE */
        .pd-related-card > .pd-related-gift{
          width:100%!important;
          min-height:28px!important;
          height:28px!important;
          flex:0 0 28px!important;
          margin-top:auto!important;
          padding:0 9px!important;

          display:flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:5px!important;

          border:1px solid #f1ddb5!important;
          border-radius:9px!important;
          background:#fff9ed!important;
          color:#8a5707!important;
          box-shadow:none!important;

          font-size:10px!important;
          font-weight:850!important;
          line-height:1!important;
          box-sizing:border-box!important;
          overflow:hidden!important;
        }

        .pd-related-card > .pd-related-gift svg{
          width:11px!important;
          height:11px!important;
          flex:0 0 11px!important;
          color:#c1841f!important;
        }

        .pd-related-card > .pd-related-gift span{
          display:block!important;
          min-width:0!important;
          white-space:nowrap!important;
          overflow:hidden!important;
          text-overflow:ellipsis!important;
        }

        .pd-related-card > .pd-related-delivery{
          width:100%!important;
          height:23px!important;
          min-height:23px!important;
          flex:0 0 23px!important;
          margin:0 0 6px!important;
          padding:0!important;
          display:flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:5px!important;
          background:transparent!important;
          border:0!important;
          border-radius:0!important;
        }
        /* RELATED PRODUCTS — SOFT FREE GIFT CHIP + ALIGNMENT */
        .pd-related-card > .pd-related-gift{
          width:100%!important;
          max-width:100%!important;
          min-height:30px!important;
          height:30px!important;
          flex:0 0 30px!important;
          margin-top:auto!important;
          padding:0 10px!important;

          display:flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:6px!important;

          border:1px solid #f0d8a8!important;
          border-radius:10px!important;

          background:#fff7e6!important;
          color:#7a4b00!important;

          box-shadow:none!important;

          font-size:10.5px!important;
          font-weight:800!important;
          line-height:1!important;

          box-sizing:border-box!important;
          white-space:nowrap!important;
          overflow:hidden!important;
        }

        .pd-related-card > .pd-related-gift svg{
          width:12px!important;
          height:12px!important;
          flex:0 0 12px!important;
          color:#b7791f!important;
        }

        .pd-related-card > .pd-related-gift span{
          display:block!important;
          min-width:0!important;
          overflow:hidden!important;
          text-overflow:ellipsis!important;
          white-space:nowrap!important;
        }

        .pd-related-card > .pd-related-delivery{
          width:100%!important;
          min-height:24px!important;
          height:24px!important;
          flex:0 0 24px!important;
          margin:0 0 6px!important;
          padding:0!important;

          display:flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:5px!important;

          background:transparent!important;
          border:0!important;
          border-radius:0!important;

          color:#0b8a45!important;
          font-size:10.5px!important;
          font-weight:800!important;
        }

        .pd-related-card > .pd-related-delivery svg{
          width:12px!important;
          height:12px!important;
          flex:0 0 12px!important;
        }

        @media(max-width:620px){
          .pd-related-card > .pd-related-gift{
            min-height:28px!important;
            height:28px!important;
            flex-basis:28px!important;
            padding:0 8px!important;
            border-radius:9px!important;
            font-size:9.5px!important;
          }

          .pd-related-card > .pd-related-delivery{
            min-height:22px!important;
            height:22px!important;
            flex-basis:22px!important;
            font-size:9.5px!important;
          }
        }
        /* RELATED PRODUCTS — PERFECT ROW ALIGNMENT */
        .pd-related-card{
          display:flex!important;
          flex-direction:column!important;
          height:100%!important;
          box-sizing:border-box!important;
        }

        .pd-related-card > .pd-related-image{
          flex:0 0 auto!important;
          width:100%!important;
          aspect-ratio:1 / 1!important;
          margin-bottom:10px!important;
        }

        .pd-related-card h3{
          height:40px!important;
          min-height:40px!important;
          max-height:40px!important;
          margin:0 0 7px!important;
          line-height:1.28!important;
          display:-webkit-box!important;
          -webkit-line-clamp:2!important;
          -webkit-box-orient:vertical!important;
          overflow:hidden!important;
        }

        .pd-related-card > .pd-related-delivery{
          flex:0 0 24px!important;
          min-height:24px!important;
          height:24px!important;
          margin:0 0 6px!important;
          align-self:flex-start!important;
        }

        .pd-related-card > .pd-related-price-row{
          flex:0 0 24px!important;
          min-height:24px!important;
          height:24px!important;
          margin:0!important;
          align-items:center!important;
        }

        .pd-related-card > .pd-related-points{
          flex:0 0 18px!important;
          min-height:18px!important;
          height:18px!important;
          margin:4px 0 0!important;
          line-height:18px!important;
        }

        .pd-related-card > .pd-related-stock{
          display:none!important;
        }

        .pd-related-card > .pd-related-gift{
          flex:0 0 28px!important;
          min-height:28px!important;
          height:28px!important;
          margin-top:auto!important;
          padding:0 8px!important;
          display:inline-flex!important;
          align-items:center!important;
          align-self:flex-start!important;
          gap:5px!important;
          border:1px solid #efb63d!important;
          border-radius:999px!important;
          background:linear-gradient(180deg,#ffe28b 0%,#ffc247 100%)!important;
          color:#2b1b04!important;
          font-size:10.5px!important;
          font-weight:900!important;
          line-height:1!important;
          box-sizing:border-box!important;
          white-space:nowrap!important;
        }

        .pd-related-card > .pd-related-gift svg{
          width:12px!important;
          height:12px!important;
          flex:0 0 12px!important;
        }

        .pd-related-card > .pd-related-delivery{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:flex-start!important;
          align-self:flex-start!important;
          margin-top:0!important;
          margin-bottom:7px!important;
        }

        @media(max-width:620px){
          .pd-related-card h3{
            height:36px!important;
            min-height:36px!important;
            max-height:36px!important;
            font-size:13px!important;
          }

          .pd-related-card > .pd-related-delivery{
            flex-basis:22px!important;
            min-height:22px!important;
            height:22px!important;
          }

          .pd-related-card > .pd-related-price-row{
            flex-basis:22px!important;
            min-height:22px!important;
            height:22px!important;
          }

          .pd-related-card > .pd-related-gift{
            flex-basis:26px!important;
            min-height:26px!important;
            height:26px!important;
            padding:0 7px!important;
            font-size:9.5px!important;
          }
        }
        /* FREE GIFT CTA */
        .pd-free-gift-cta{
          width:100%;
          min-height:64px;
          margin:18px 0 14px;
          padding:11px 14px;
          display:grid;
          grid-template-columns:42px minmax(0,1fr) 22px;
          align-items:center;
          gap:11px;
          border:1px solid #efb63d;
          border-radius:16px;
          color:#2b1b04;
          background:linear-gradient(135deg,#fff8e7 0%,#ffe7a6 100%);
          box-shadow:0 8px 24px rgba(217,156,43,.12);
          cursor:pointer;
          text-align:left;
          font-family:inherit;
          box-sizing:border-box;
        }
        .pd-free-gift-cta:hover{
          border-color:#e7a827;
          box-shadow:0 10px 28px rgba(217,156,43,.18);
        }
        .pd-free-gift-cta-icon{
          width:40px;
          height:40px;
          display:grid;
          place-items:center;
          border-radius:12px;
          color:#7a4b00;
          background:linear-gradient(180deg,#ffd86c 0%,#f7b733 100%);
        }
        .pd-free-gift-cta-icon svg{width:21px;height:21px}
        .pd-free-gift-cta-copy{min-width:0}
        .pd-free-gift-cta-copy strong,
        .pd-free-gift-cta-copy small{display:block}
        .pd-free-gift-cta-copy strong{
          font-size:15px;
          font-weight:950;
          line-height:1.2;
        }
        .pd-free-gift-cta-copy small{
          margin-top:4px;
          color:#7d612b;
          font-size:12px;
          font-weight:700;
          line-height:1.3;
        }
        .pd-free-gift-cta-arrow{
          width:18px;
          height:18px;
          color:#87560d;
          transition:transform 160ms ease;
        }
        .pd-free-gift-cta-arrow.open{transform:rotate(-90deg)}
        .pd-free-gift-preview{
          margin:-4px 0 14px;
          padding:13px 14px;
          border:1px dashed #e0b75f;
          border-radius:14px;
          background:#fffdf6;
          color:#33220a;
        }
        .pd-free-gift-preview strong{
          display:block;
          font-size:13px;
          font-weight:900;
        }
        .pd-free-gift-preview p{
          margin:4px 0 0;
          color:#7b6a43;
          font-size:12px;
          line-height:1.4;
        }

        /* RELATED PRODUCTS — PRODUCT-ONLY DETAILS */
        .pd-related-card > small{
          display:none!important;
        }
        .pd-related-card > .pd-related-delivery,
        .pd-related-card > .pd-related-price-row,
        .pd-related-card > .pd-related-points{
          aspect-ratio:auto!important;
          width:auto;
          height:auto;
          min-height:0;
          border-radius:0;
          background:transparent;
          margin-bottom:0;
        }

        .pd-related-delivery{
          width:max-content;
          max-width:100%;
          min-height:23px;
          margin:7px 0 8px;
          padding:0 8px;
          display:inline-flex;
          align-items:center;
          gap:5px;
          border-radius:999px;
          color:#087b3f;
          background:#e8f7ed;
          font-size:11px;
          font-weight:800;
          line-height:1;
          box-sizing:border-box;
        }
        .pd-related-delivery svg{
          width:12px;
          height:12px;
          flex:0 0 12px;
        }
        .pd-related-price-row{
          display:flex;
          align-items:baseline;
          flex-wrap:wrap;
          gap:4px 7px;
          margin-top:1px;
        }
        .pd-related-price-row strong{
          color:#17120d;
          font-size:17px;
          font-weight:900;
        }
        .pd-related-price-row del{
          color:#948577;
          font-size:12px;
          font-weight:600;
        }
        .pd-related-price-row em{
          color:#087b3f;
          font-size:12px;
          font-weight:900;
          font-style:normal;
        }
        .pd-related-card{
          display:flex;
          flex-direction:column;
          height:100%;
          box-sizing:border-box;
        }

        .pd-related-card h3{
          min-height:39px;
          margin:6px 0 2px;
        }

        .pd-related-price-row{
          min-height:24px;
          margin-top:2px;
        }

        .pd-related-gift{
          margin-top:auto!important;
        }

        @media(max-width:620px){
          .pd-free-gift-cta{
            min-height:58px;
            margin:14px 0 12px;
            padding:10px 11px;
            grid-template-columns:38px minmax(0,1fr) 18px;
            gap:9px;
            border-radius:14px;
          }
          .pd-free-gift-cta-icon{
            width:36px;
            height:36px;
            border-radius:10px;
          }
          .pd-free-gift-cta-icon svg{width:19px;height:19px}
          .pd-free-gift-cta-copy strong{font-size:14px}
          .pd-free-gift-cta-copy small{font-size:11px}
          .pd-related-price-row strong{font-size:15px}
          .pd-related-price-row del,
          .pd-related-price-row em,
        }
        .pd-page{max-width:1240px;margin:0 auto;padding:24px 24px 0;color:#17120d}
.pd-shop-category-bar{
  display:grid;
  grid-template-columns:minmax(0,560px) minmax(0,1fr);
  align-items:center;
  column-gap:36px;
  margin:0 0 22px;
}
.pd-shop-category-list{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
  overflow-x:auto;
  scrollbar-width:none;
}
.pd-shop-category-list::-webkit-scrollbar{display:none}
.pd-shop-category-pill{flex:0 0 auto;min-height:42px;padding:0 20px;border:1px solid #ded7cf;border-radius:999px;background:#fff;color:#5d5146;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:all .18s ease}
.pd-shop-category-pill:hover{border-color:#bdb3a8;color:#17120d}
.pd-shop-category-pill.active{border-color:#171717;background:#171717;color:#fff}
.pd-shop-sort{
  width:150px;
  min-height:48px;
  padding:0 16px;
  justify-self:end;
  border:1px solid #ded7cf;
  border-radius:16px;
  background:#fff;
  color:#17120d;
  font-family:inherit;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
}
.pd-top{display:flex;justify-content:space-between;margin-bottom:22px}.pd-top button,.pd-top a{display:inline-flex;align-items:center;gap:7px;border:0;background:#fff;color:#17120d;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:800;box-shadow:0 6px 22px rgba(37,24,12,.08);cursor:pointer}.pd-top svg{width:18px}.pd-main{position:relative;display:grid;grid-template-columns:minmax(0,1.06fr) minmax(380px,.94fr);gap:48px;align-items:start}.pd-image{position:relative;width:100%;aspect-ratio:4/5;border-radius:26px;background:#eee center/cover no-repeat;box-shadow:0 14px 45px rgba(37,24,12,.1)}.pd-discount-chip{position:absolute;left:16px;top:16px;padding:8px 11px;border-radius:10px;background:#f1b46d;color:#181008;font-size:12px;font-weight:900}
        .pd-delivery-chip{position:absolute;right:16px;top:16px;display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;background:#25c963;color:#fff;font-size:16px;font-weight:900;box-shadow:0 8px 20px rgba(37,201,99,.34)}
        .pd-delivery-chip svg{width:15px;height:15px}.pd-thumbs{display:flex;gap:10px;margin-top:12px;overflow:auto;padding-bottom:3px}.pd-thumbs button{width:76px;height:76px;padding:0;border:2px solid transparent;border-radius:13px;overflow:hidden;background:#eee;cursor:pointer;flex:0 0 auto}.pd-thumbs button.active{border-color:#17120d}.pd-thumbs img{width:100%;height:100%;object-fit:cover}
.pd-related-image{overflow:hidden}
.pd-related-image-file{width:100%;height:100%;display:block;object-fit:cover}

/* PRODUCT MEDIA GALLERY — AI / FRONT / BACK / VIDEO / DETAIL */
.pd-media-video-shell{display:grid;place-items:center;overflow:hidden;background:#111!important}
.pd-media-video{width:100%;height:100%;display:block;object-fit:contain;background:#111}
.pd-image-zoom{
  cursor:zoom-in;
}

.pd-zoom-panel{
  position:absolute;
  z-index:40;
  top:0;
  right:0;
  width:calc(47% - 8px);
  height:min(72vh,760px);
  min-height:560px;
  border:1px solid #dedbd6;
  border-radius:20px;
  background-color:#fff;
  background-repeat:no-repeat;
  background-size:260%;
  box-shadow:0 18px 50px rgba(20,16,12,.18);
  pointer-events:none;
}

.pd-media-thumb-video{width:100%;height:100%;display:block;object-fit:cover;background:#17181c;pointer-events:none}
.pd-media-thumbs{gap:9px}
.pd-media-thumbs button{position:relative;width:82px;height:88px;border:1px solid #dfd4c7;border-radius:12px;background:#fff;overflow:hidden;box-sizing:border-box}
.pd-media-thumbs button.active{border:2px solid #17120d}
.pd-media-thumbs img{width:100%;height:100%;display:block;object-fit:cover;background:#eee}
.pd-media-label{display:none}
.pd-media-play{position:absolute;left:50%;top:50%;width:30px;height:30px;display:grid;place-items:center;transform:translate(-50%,-50%);border-radius:50%;background:rgba(17,18,20,.82);color:#fff;pointer-events:none}
.pd-media-play svg{width:14px;height:14px;margin-left:2px}
.pd-media-video-placeholder{width:100%;height:100%;display:block;background:#17181c}
.pd-info{padding-top:8px}.pd-brand{display:flex;align-items:center;gap:6px;margin:0 0 8px;color:#785f47;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.pd-verified-icon{color:#1976d2}.pd-info h1{font-size:clamp(30px,4vw,50px);line-height:1.05;margin:0 0 14px;letter-spacing:-.035em}.pd-rating{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:20px}.pd-rating span{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:999px;background:#fff;border:1px solid #eadfce;font-size:12px;font-weight:800}.pd-rating span:first-child{background:#1d6f42;color:#fff;border-color:#1d6f42}.pd-stock-available{color:#166c3a}.pd-stock-unavailable{color:#b32d24}.pd-price{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}.pd-price strong{font-size:34px}.pd-price del{color:#9a8b7c;font-size:18px}.pd-price em{font-style:normal;color:#1a7c42;font-weight:900}.pd-delivery{display:flex;gap:12px;align-items:center;padding:15px;border:1px solid #eadfce;background:#fffaf3;border-radius:17px;margin-bottom:22px}.pd-delivery svg{color:#9a5e23}.pd-delivery strong,.pd-delivery small{display:block}.pd-delivery small{margin-top:3px;color:#766657}.pd-option{margin:18px 0}.pd-option label,.pd-qty label{display:block;margin-bottom:9px;font-weight:900}.pd-option>div{display:flex;gap:8px;flex-wrap:wrap}.pd-option button{min-width:48px;padding:10px 13px;border:1px solid #d8c8b7;border-radius:11px;background:#fff;cursor:pointer;font-weight:800}
        .pd-option{
  margin:18px 0;
}

.pd-option label{
  display:block;
  margin-bottom:9px;
  font-weight:900;
}

.pd-option>div{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}

.pd-option button{
  min-width:48px;
  padding:10px 13px;
  border:1px solid #d8c8b7;
  border-radius:11px;
  background:#ffffff;
  color:#17120d;
  cursor:pointer;
  font-weight:800;
  transition:.2s ease;
}

.pd-option button:hover{
  border-color:#17120d;
}

.pd-option button.active{
  background:#ffffff !important;
  color:#17120d !important;
  border:1px solid #17120d !important;
  box-shadow:none !important;
}.pd-qty{margin:20px 0}.pd-qty>div{display:inline-flex;align-items:center;border:1px solid #dbcdbd;border-radius:13px;overflow:hidden;background:#fff}.pd-qty button{width:42px;height:42px;border:0;background:#fff;cursor:pointer}.pd-qty button:disabled{opacity:.35;cursor:not-allowed}.pd-qty svg{width:17px}.pd-qty strong{min-width:38px;text-align:center}.pd-actions{display:grid;grid-template-columns:145px 1fr;gap:10px;margin-top:22px}.pd-actions button{height:54px;border-radius:15px;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-actions svg{width:19px}.pd-save{border:1px solid #d8c8b7;background:#fff}.pd-save.active{color:#b42c37;border-color:#b42c37;background:#fff3f4}.pd-add{border:0;background:#17120d;color:#fff}.pd-add:disabled{opacity:.5;cursor:not-allowed}.pd-compare-card{width:100%;margin-top:12px;display:grid;grid-template-columns:34px 1fr 24px;gap:10px;align-items:center;padding:16px;border:1px solid #4f4438;border-radius:20px;background:#111217;color:#fff;text-align:left;cursor:pointer}.pd-compare-card:disabled{opacity:.65}.pd-compare-icon svg{width:24px}.pd-compare-card span:nth-child(2){display:grid;gap:3px}.pd-compare-card strong{font-size:16px}.pd-compare-card small{color:#aeadb1;font-weight:700}.pd-compare-card em{color:#f2b774;font-style:normal;font-size:13px;font-weight:900}.pd-compare-arrow{width:20px;transform:rotate(180deg);color:#9a9ba0}.pd-ask-friends{width:100%;height:56px;margin-top:14px;border:0;border-radius:18px;background:#f2b774;color:#17120d;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer}.pd-ask-friends:disabled{opacity:.65}.pd-ask-friends svg{width:20px}.pd-info-card,.pd-peace-card{width:100%;margin-top:18px;display:grid;grid-template-columns:42px 1fr 24px;gap:10px;align-items:center;padding:16px 18px;border:1px solid #34353a;border-radius:20px;background:#17181c;color:#fff;text-align:left}.pd-info-card{cursor:pointer}.pd-info-card strong,.pd-info-card small,.pd-peace-card strong,.pd-peace-card small{display:block}.pd-info-card small,.pd-peace-card small{color:#fff;font-size:12px;font-weight:700}.pd-coin-icon,.pd-shield-icon{width:32px;height:32px;display:grid;place-items:center}.pd-coin-icon{color:#f2b774}.pd-coin-icon svg{width:32px;height:32px}.pd-shield-icon{color:#28df6b}.pd-shield-icon svg{width:32px;height:32px}.pd-info-card>svg{width:21px;color:#bfc0c4}.pd-inline-benefits span{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#655647}.pd-inline-benefits svg{width:16px}.pd-accordions{margin-top:46px;border:1px solid #e4d7c8;border-radius:23px;overflow:hidden;background:#16171b;color:#fff}.pd-accordion+ .pd-accordion{border-top:1px solid rgba(255,255,255,.1)}.pd-accordion>button{width:100%;display:grid;grid-template-columns:32px 1fr 24px;gap:12px;align-items:center;padding:17px 18px;border:0;background:transparent;color:#fff;text-align:left;cursor:pointer}.pd-accordion-icon{width:25px}.pd-accordion>button span strong,.pd-accordion>button span small{display:block}.pd-accordion>button span strong{font-size:16px}.pd-accordion>button span small{margin-top:4px;color:rgba(255,255,255,.55);font-size:12px;font-weight:700}.pd-accordion-chevron{width:20px;transition:.2s}.pd-accordion.open .pd-accordion-chevron{transform:rotate(180deg)}.pd-accordion-content{padding:0 18px 20px 62px;color:rgba(255,255,255,.76)}.pd-accordion-copy p{margin:0 0 16px;line-height:1.65}.pd-accordion-copy dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}.pd-accordion-copy dl div{padding:12px;border-radius:12px;background:rgba(255,255,255,.055)}.pd-accordion-copy dt{font-size:11px;color:rgba(255,255,255,.48);font-weight:800;text-transform:uppercase}.pd-accordion-copy dd{margin:4px 0 0;color:#fff;font-weight:800}.pd-inline-benefits{display:flex;gap:12px;flex-wrap:wrap}.pd-inline-benefits span{color:#fff;background:rgba(255,255,255,.06);padding:9px 10px;border-radius:10px}.pd-review-area{display:grid;gap:20px}.pd-review-summary{display:flex;align-items:center;gap:14px}.pd-review-summary>strong{font-size:48px;color:#f2b774}.pd-review-summary>span{display:flex;align-items:center;gap:7px}.pd-review-summary svg{width:18px;color:#f2b774}.pd-review-form{padding:16px;border-radius:16px;background:rgba(255,255,255,.055)}.pd-review-form h3{margin:0 0 10px;color:#fff}.pd-star-input{display:flex;gap:4px;margin-bottom:12px}.pd-star-input button{border:0;background:transparent;color:#6f7075;padding:2px;cursor:pointer}.pd-star-input button.active{color:#f2b774}.pd-star-input svg{width:25px;height:25px}.pd-review-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pd-review-form input,.pd-review-form textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:#0f1014;color:#fff;border-radius:11px;padding:12px;font:inherit;margin-bottom:10px}.pd-submit-review{border:0;border-radius:11px;background:#f2b774;color:#181008;padding:11px 16px;font-weight:900;cursor:pointer}.pd-submit-review:disabled{opacity:.55}.pd-review-message{margin:10px 0 0!important;font-size:12px}.pd-review-list{display:grid;gap:10px}.pd-review-list article{padding:14px;border-radius:14px;background:rgba(255,255,255,.05)}.pd-review-list article>div:first-child{display:flex;justify-content:space-between;gap:12px}.pd-review-list article span{font-size:11px;color:rgba(255,255,255,.45)}.pd-review-stars{display:flex;gap:2px;margin:7px 0}.pd-review-stars svg{width:14px;color:#f2b774}.pd-review-list h4{margin:7px 0 3px;color:#fff}.pd-review-list p{margin:0;line-height:1.5}.pd-related-section{margin-top:48px}.pd-section-heading{display:flex;align-items:end;justify-content:space-between;margin-bottom:17px}.pd-section-heading small{font-weight:900;color:#99724b;letter-spacing:.12em}.pd-section-heading h2{margin:4px 0 0;font-size:28px}.pd-section-heading a{color:#17120d;font-weight:900}.pd-related-grid,.pd-related-loading{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.pd-related-card{text-decoration:none;color:#17120d;background:#fff;border:1px solid #eadfce;border-radius:17px;padding:10px}.pd-related-card>.pd-related-image{aspect-ratio:1/1;border-radius:12px;background:#eee center/cover no-repeat;margin-bottom:10px}.pd-related-card small{color:#8b755f;font-weight:800}.pd-related-card h3{font-size:15px;line-height:1.3;margin:5px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pd-related-card p{margin:0;display:flex;gap:7px;align-items:center}.pd-related-card del{font-size:12px;color:#948577}.pd-related-card>span{display:block;margin-top:7px;color:#217143;font-size:11px;font-weight:800}.pd-related-loading span{height:270px;border-radius:17px;background:#e6e1d9;animation:pdPulse 1.2s infinite alternate}.pd-no-related{color:#796b5d}.pd-modal-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}.pd-modal{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;border:1px solid #34353a;border-radius:26px;background:#090a0d;color:#fff;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.5)}.pd-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;border:1px solid #34353a;border-radius:50%;background:#17181c;color:#fff;display:grid;place-items:center;cursor:pointer}.pd-modal-close svg{width:19px}.pd-modal-handle{width:44px;height:4px;border-radius:99px;background:#555;margin:0 auto 14px}.pd-modal h2{margin:0 44px 18px 0;font-size:25px}.pd-spotc-product{display:grid;grid-template-columns:88px 1fr;gap:13px;padding:14px;border:1px solid rgba(242,183,116,.26);border-radius:20px;background:#15161a}.pd-spotc-product>div{width:88px;height:88px;border-radius:14px;background:#292a2e center/cover no-repeat}.pd-spotc-product span{display:grid;align-content:center;gap:4px}.pd-spotc-product small{color:#b8b8bc}.pd-spotc-product em{color:#f2b774;font-style:normal;font-size:20px;font-weight:900}.pd-spotc-product b{color:#30d970;font-size:11px}.pd-compare-steps{display:grid;gap:10px;margin-top:18px}.pd-compare-steps p{display:flex;align-items:center;gap:11px;margin:0;padding:13px;border-radius:14px;background:#15161a;font-weight:800}.pd-spinner{width:17px;height:17px;border:2px solid #555;border-top-color:#f2b774;border-radius:50%;animation:pdSpin .8s linear infinite}.pd-compare-steps>small{text-align:center;color:#8d8e93;margin-top:9px}.pd-compare-error{padding:18px;text-align:center}.pd-compare-error button{border:0;border-radius:12px;background:#f2b774;padding:11px 16px;font-weight:900;cursor:pointer}.pd-online-results{margin-top:18px}.pd-online-results h3{margin:0 0 10px}.pd-online-results>a{display:grid;grid-template-columns:70px 1fr;gap:12px;margin-bottom:10px;padding:11px;border:1px solid #2c2d31;border-radius:16px;background:#15161a;color:#fff;text-decoration:none}.pd-online-results>a.disabled{pointer-events:none;opacity:.6}.pd-online-results>a>div{width:70px;height:70px;border-radius:11px;background:#292a2e center/cover no-repeat}.pd-online-results>a span{display:grid;align-content:center;gap:4px}.pd-online-results>a small{color:#f2b774;font-weight:800}.pd-online-results>a em{color:#909196;font-style:normal;font-size:11px}.pd-why-spotc{margin-top:17px;padding:16px;border-radius:18px;background:#15161a}.pd-why-spotc p{margin:7px 0;color:#c6c7ca}.pd-circle-modal,.pd-coin-modal{max-width:460px;text-align:center}.pd-success-icon,.pd-coin-large{width:60px;height:60px;margin:5px auto 12px;color:#2cda69}.pd-coin-large{color:#f2b774}.pd-circle-modal h2,.pd-coin-modal h2{margin:0 40px 10px}.pd-circle-modal p,.pd-coin-modal p{color:#b7b8bc;line-height:1.6}.pd-circle-share,.pd-circle-copy{width:100%;height:50px;border-radius:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-circle-share{border:0;background:#f2b774;color:#17120d}.pd-circle-copy{margin-top:9px;border:1px solid #34353a;background:#17181c;color:#fff}.pd-circle-share svg,.pd-circle-copy svg{width:19px}@keyframes pdSpin{to{transform:rotate(360deg)}}.pd-page-loading{min-height:calc(100vh - 76px)}.pd-loader-top{display:flex;justify-content:space-between;margin-bottom:20px}.pd-loader-top span{width:80px;height:32px;border-radius:999px}.pd-loader-main{display:grid;grid-template-columns:1.08fr .92fr;gap:48px}.pd-loader-image{width:100%;aspect-ratio:4/5;border-radius:24px}.pd-loader-thumbnails{display:flex;gap:10px;margin-top:12px}.pd-loader-thumbnails span{width:74px;height:74px;border-radius:12px}.pd-loader-info{display:flex;flex-direction:column;align-items:flex-start;gap:16px}.pd-loader-line{display:block;height:13px;border-radius:999px}.pd-loader-brand{width:145px}.pd-loader-title{width:min(100%,430px);height:48px}.pd-loader-rating{display:flex;gap:10px}.pd-loader-rating span{width:92px;height:25px;border-radius:999px}.pd-loader-price{width:210px;height:34px}.pd-loader-delivery{width:100%;height:75px;border-radius:16px}.pd-loader-option-title{width:80px}.pd-loader-options{display:flex;gap:8px}.pd-loader-options span{width:60px;height:42px;border-radius:10px}.pd-loader-actions{width:100%;display:grid;grid-template-columns:150px 1fr;gap:10px;margin-top:10px}.pd-loader-actions span{height:52px;border-radius:14px}.pd-loader-top span,.pd-loader-image,.pd-loader-thumbnails span,.pd-loader-line,.pd-loader-rating span,.pd-loader-delivery,.pd-loader-options span,.pd-loader-actions span{position:relative;overflow:hidden;background:#e6e1d9}.pd-loader-top span:after,.pd-loader-image:after,.pd-loader-thumbnails span:after,.pd-loader-line:after,.pd-loader-rating span:after,.pd-loader-delivery:after,.pd-loader-options span:after,.pd-loader-actions span:after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.78),transparent);animation:pdShimmer 1.25s infinite}@keyframes pdShimmer{100%{transform:translateX(100%)}}@keyframes pdPulse{to{opacity:.5}}@media(max-width:900px){.pd-main{grid-template-columns:1fr;gap:28px}.pd-info{padding-top:0}.pd-related-grid,.pd-related-loading{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){
.pd-shop-category-bar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin:0 0 14px;
}
.pd-shop-category-list{gap:8px}
.pd-shop-category-pill{min-height:38px;padding:0 16px;font-size:13px}
.pd-shop-sort{
  width:132px;
  flex:0 0 132px;
  min-height:40px;
  padding:0 14px;

  border-radius:13px;
  font-size:12px;
}
.pd-image-zoom{cursor:default!important;background-size:cover!important;background-position:center!important}.pd-zoom-panel{display:none!important}.pd-modal-backdrop{align-items:flex-end;padding:0}.pd-modal{width:100%;max-height:92vh;border-radius:26px 26px 0 0;padding:20px 16px}.pd-delivery-chip{right:10px;top:10px;padding:9px 11px;font-size:11px}.pd-page{padding:15px 14px 0}.pd-main{gap:20px}.pd-image{border-radius:18px}.pd-media-thumbs{margin-left:-2px;margin-right:-2px;padding-left:2px;padding-right:2px}.pd-media-thumbs button{width:70px;height:78px;border-radius:11px}.pd-media-thumbs img,.pd-media-thumb-video,.pd-media-video-placeholder{height:100%}.pd-media-label{display:none}.pd-media-play{top:50%;width:27px;height:27px}.pd-media-play svg{width:12px;height:12px}.pd-info h1{font-size:31px}.pd-actions{grid-template-columns:1fr}.pd-accordions{margin-top:32px;border-radius:18px}.pd-accordion>button{padding:15px 13px;grid-template-columns:28px 1fr 20px}.pd-accordion-content{padding:0 13px 17px}.pd-accordion-copy dl{grid-template-columns:1fr}.pd-review-grid{grid-template-columns:1fr}.pd-related-grid,.pd-related-loading{gap:9px}.pd-related-card{padding:8px}.pd-loader-main{grid-template-columns:1fr;gap:28px}.pd-loader-actions{grid-template-columns:1fr}}.pd-purchase-row{display:grid;grid-template-columns:122px 130px minmax(190px,1fr);gap:12px;align-items:stretch;margin-top:24px}.pd-qty-inline{margin:0}.pd-qty-inline>div{width:100%;height:54px;display:grid;grid-template-columns:40px 1fr 40px;align-items:center;background:#17120d;border-color:#3c342b;color:#fff}.pd-qty-inline button{width:40px;height:52px;background:transparent;color:#fff}.pd-qty-inline strong{min-width:0}.pd-save-inline,.pd-add-inline{height:54px;border-radius:15px;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-save-inline{border:1px solid #d8c8b7;background:#fff;color:#17120d}.pd-add-inline{border:0;background:#e4a044;color:#20150a}.pd-add-inline:hover{background:#eca94d}.pd-add-inline:disabled{opacity:.5;cursor:not-allowed}.pd-peace-compact{margin-top:16px}.pd-commerce-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:22px}.pd-tool-card{min-width:0;min-height:116px;display:grid;grid-template-columns:52px minmax(0,1fr) 22px;gap:13px;align-items:center;padding:17px 16px;border:1px solid #eadbc9;border-radius:18px;background:linear-gradient(135deg,#fff9ee 0%,#fff3df 100%);color:#17120d;text-align:left;cursor:pointer;box-shadow:0 8px 24px rgba(63,39,17,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.pd-tool-card:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(63,39,17,.11);border-color:#ddc3a4}.pd-tool-card:disabled{opacity:.65;cursor:not-allowed;transform:none}.pd-tool-friends{background:linear-gradient(135deg,#fff5ea 0%,#ffe7d8 100%)}.pd-tool-coin{background:linear-gradient(135deg,#fff9e9 0%,#fff4d9 100%)}.pd-tool-icon{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;background:#ffd58f;color:#4c2e0b}.pd-tool-friends .pd-tool-icon{background:#ffb878}.pd-tool-coin .pd-tool-icon{background:#ffe39b}.pd-tool-icon svg{width:25px;height:25px}.pd-tool-copy{min-width:0;display:grid;gap:4px}.pd-tool-copy strong{font-size:15px;line-height:1.15}.pd-tool-copy small{color:#6f6254;font-size:12px;line-height:1.35;font-weight:700}.pd-tool-copy em{margin-top:5px;color:#e77e1e;font-size:12px;font-style:normal;font-weight:900}.pd-tool-arrow{width:19px;transform:rotate(180deg);color:#4d4034}.pd-discount-chip{border-radius:999px!important;background:#f2a74d!important;color:#1d1309!important;box-shadow:0 7px 18px rgba(242,167,77,.32)}.pd-delivery-chip{padding:7px 10px;font-size:11px;box-shadow:0 6px 15px rgba(37,201,99,.28)}@media(max-width:900px){.pd-commerce-tools{grid-template-columns:repeat(3,minmax(220px,1fr));overflow-x:auto;padding-bottom:6px;scrollbar-width:none}.pd-commerce-tools::-webkit-scrollbar{display:none}}@media(max-width:620px){.pd-purchase-row{grid-template-columns:104px 104px minmax(0,1fr);gap:8px}.pd-save-inline,.pd-add-inline{font-size:13px}.pd-add-inline svg,.pd-save-inline svg{width:17px}.pd-commerce-tools{grid-template-columns:repeat(3,250px);margin-top:18px;margin-left:-14px;margin-right:-14px;padding:0 14px 8px}.pd-tool-card{min-height:104px;padding:14px;grid-template-columns:46px minmax(0,1fr) 18px}.pd-tool-icon{width:46px;height:46px;border-radius:13px}.pd-tool-copy strong{font-size:14px}.pd-tool-copy small{font-size:11px}.pd-discount-chip{left:10px;top:10px;padding:7px 9px;font-size:10px}.pd-delivery-chip{right:10px;top:10px;padding:7px 9px;font-size:10px}}@media(max-width:410px){.pd-purchase-row{grid-template-columns:96px 90px minmax(0,1fr);gap:6px}.pd-save-inline,.pd-add-inline{font-size:12px}.pd-save-inline{padding:0 8px}.pd-add-inline{padding:0 9px}.pd-qty-inline>div{grid-template-columns:30px 1fr 30px}.pd-qty-inline button{width:30px}}

/* =========================================================
   TRY ON — KEEP ACTION BUTTONS VISIBLE ON MOBILE
========================================================= */


@media (max-width: 700px) {
  .pd-modal-backdrop:has(.pd-tryon-sheet) {
    align-items: flex-end !important;
    padding: 0 !important;
  }

  .pd-tryon-sheet {
    width: 100% !important;
    height: auto !important;
    max-height: calc(
      100dvh - 58px - env(safe-area-inset-bottom)
    ) !important;

    padding:
      18px
      16px
      calc(118px + env(safe-area-inset-bottom))
      !important;

    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    border-radius: 24px 24px 0 0 !important;
  }

  .pd-tryon-preview {
    width: min(290px, 100%) !important;
    max-height: 48dvh !important;
    aspect-ratio: 3 / 4 !important;
    margin-bottom: 16px !important;
    background-size: contain !important;
  }

  
}
        /* =========================================
   QUANTITY SELECTOR
========================================= */

.pd-qty-inline{
  margin:0 !important;
}

.pd-qty-inline>div{
  width:100% !important;
  height:54px !important;

  display:grid !important;
  grid-template-columns:42px 1fr 42px !important;

  align-items:center !important;
  justify-items:center !important;

  background:#ffffff !important;

  border:1px solid #17120d !important;
  border-radius:15px !important;

  overflow:hidden !important;
}

.pd-qty-inline button{
  width:42px !important;
  height:54px !important;

  display:grid !important;
  place-items:center !important;

  border:0 !important;

  background:#ffffff !important;
  color:#17120d !important;

  cursor:pointer;
}

.pd-qty-inline button:hover{
  background:#f7f7f7 !important;
}

.pd-qty-inline button:disabled{
  opacity:.35 !important;
}

.pd-qty-inline button svg{
  width:18px !important;
  height:18px !important;
  stroke-width:2.5 !important;
}

.pd-qty-inline strong{
  width:100% !important;

  display:grid !important;
  place-items:center !important;

  color:#17120d !important;

  font-size:18px !important;
  font-weight:800 !important;

  line-height:1 !important;
}
        /* Final product-header fixes */
        .pd-page{padding-top:28px}
        .pd-top{display:none!important}
        .pd-discount-chip{
          position:absolute;
          top:16px;
          left:16px;
          z-index:6;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:30px;
          padding:7px 14px;
          border-radius:999px;
          background:#f59e2f;
          color:#fff;
          font-size:12px;
          font-weight:900;
          line-height:1;
          letter-spacing:.01em;
          box-shadow:0 7px 18px rgba(245,158,47,.3);
        }
        .pd-delivery-chip{
          position:absolute;
          top:16px;
          right:16px;
          left:auto;
          width:auto;
          z-index:6;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:5px;
          min-height:28px;
          padding:6px 10px;
          border-radius:999px;
          background:#20c763;
          color:#fff;
          font-size:15px;
          font-weight:900;
          line-height:1;
          white-space:nowrap;
          box-shadow:0 7px 16px rgba(32,199,99,.3);
        }
        .pd-delivery-chip svg{
          width:12px;
          height:12px;
          flex:0 0 auto;
        }
        @media(max-width:620px){
          .pd-page{padding-top:14px}
          .pd-discount-chip{
            top:10px;
            left:10px;
            min-height:27px;
            padding:6px 10px;
            font-size:10px;
          }
          .pd-delivery-chip{
            top:10px;
            right:10px;
            min-height:26px;
            padding:6px 9px;
            font-size:13px;
          }
          .pd-delivery-chip svg{
            width:11px;
            height:11px;
          }
        }

        .pd-related-card > .pd-related-image{
          position:relative;
          aspect-ratio:1/1;
          border-radius:12px;
          background:#eee center/cover no-repeat;
          margin-bottom:10px;
          overflow:hidden;
        }

        .pd-related-card > .pd-related-image > .pd-related-discount-chip{
          position:absolute!important;
          top:9px!important;
          left:9px!important;
          right:auto!important;
          bottom:auto!important;
          width:max-content!important;
          min-width:0!important;
          height:auto!important;
          min-height:24px!important;
          margin:0!important;
        padding:9px 16px!important;
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          border:0!important;
          border-radius:999px!important;
          background:#cc6a00!important;
          color:#fff!important;
          font-size:14px!important;
          font-weight:900!important;
          line-height:1!important;
          white-space:nowrap!important;
          box-shadow:0 5px 12px rgba(245,158,47,.28)!important;
          z-index:5!important;
        }

        /* Force image chips to ignore conflicting global span styles */
        .pd-image > .pd-discount-chip{
          position:absolute!important;
          top:16px!important;
          left:16px!important;
          right:auto!important;
          bottom:auto!important;
          width:max-content!important;
          min-width:0!important;
          max-width:calc(50% - 24px)!important;
          height:auto!important;
          min-height:30px!important;
          margin:0!important;
          padding:7px 14px!important;
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          border:0!important;
          border-radius:999px!important;
          background:#f59e2f!important;
          color:#fff!important;
          font-size:12px!important;
          font-weight:900!important;
          line-height:1!important;
          white-space:nowrap!important;
          box-shadow:0 7px 18px rgba(245,158,47,.30)!important;
          z-index:20!important;
        }

       .pd-image > .pd-delivery-chip{
    position:absolute!important;
    top:16px!important;
    right:16px!important;

    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:7px!important;
width:200px;
    padding:10px 16px!important;

    background:#20c763!important;
    color:#fff!important;

    border-radius:999px!important;

    font-size:15px!important;
    font-weight:900!important;
    line-height:1!important;

    white-space:nowrap!important;
}

.pd-image > .pd-delivery-chip svg{
    width:16px!important;
    height:16px!important;
    flex:0 0 16px!important;
}

        @media(max-width:620px){
          .pd-image > .pd-discount-chip{
            top:10px!important;
            left:10px!important;
            max-width:calc(50% - 15px)!important;
            min-height:27px!important;
            padding:6px 10px!important;
            font-size:10px!important;
          }

          .pd-image > .pd-delivery-chip{
            top:10px!important;
            right:10px!important;
            max-width:calc(50% - 15px)!important;
            min-height:26px!important;
            padding:6px 9px!important;
            font-size:9px!important;
          }
        }

        @media(prefers-reduced-motion:reduce){.pd-loader-top span:after,.pd-loader-image:after,.pd-loader-thumbnails span:after,.pd-loader-line:after,.pd-loader-rating span:after,.pd-loader-delivery:after,.pd-loader-options span:after,.pd-loader-actions span:after{animation:none}}

        /* =========================================================
           PRODUCT DETAIL — FINAL MOBILE ALIGNMENT AND BADGE FIX
        ========================================================== */

        .pd-image > .pd-discount-chip {
          min-height: 42px !important;
          padding: 0 17px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 999px !important;
          font-size: 17px !important;
          font-weight: 850 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .pd-image > .pd-delivery-chip {
          width: auto !important;
          max-width: none !important;
          min-height: 42px !important;
          padding: 0 17px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          border-radius: 999px !important;
          font-size: 17px !important;
          font-weight: 850 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .pd-image > .pd-delivery-chip > span {
          display: block !important;
          line-height: 1 !important;
        }

        .pd-image > .pd-delivery-chip svg {
          width: 19px !important;
          height: 19px !important;
          min-width: 19px !important;
          flex: 0 0 19px !important;
          display: block !important;
          fill: none !important;
          stroke: currentColor !important;
          stroke-width: 2.4 !important;
        }

        .pd-purchase-row .pd-qty-inline {
          height: 54px !important;
          margin: 0 !important;
          align-self: stretch !important;
        }

        .pd-purchase-row .pd-qty-inline > div {
          width: 100% !important;
          height: 54px !important;
          min-height: 54px !important;
          display: grid !important;
          grid-template-columns: 40px minmax(34px, 1fr) 40px !important;
          align-items: center !important;
          justify-items: center !important;
          overflow: hidden !important;
          border-radius: 15px !important;
        }

        .pd-purchase-row .pd-qty-inline button {
          width: 40px !important;
          height: 54px !important;
          min-width: 40px !important;
          min-height: 54px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          border: 0 !important;
          line-height: 1 !important;
        }

        .pd-purchase-row .pd-qty-inline button svg {
          width: 19px !important;
          height: 19px !important;
          display: block !important;
        }

        .pd-purchase-row .pd-qty-inline strong {
          width: 100% !important;
          min-width: 0 !important;
          height: 54px !important;
          margin: 0 !important;
          display: grid !important;
          place-items: center !important;
          font-size: 18px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
          text-align: center !important;
        }

       @media (max-width: 700px) {

          .pd-image > .pd-discount-chip {
            top: 12px !important;
            left: 12px !important;
            max-width: none !important;
            min-height: 39px !important;
            padding: 0 14px !important;
            font-size: 16px !important;
          }

          .pd-image > .pd-delivery-chip {
            top: 12px !important;
            right: 12px !important;
            max-width: none !important;
            min-height: 39px !important;
            padding: 0 14px !important;
            gap: 7px !important;
            font-size: 16px !important;
          }

          .pd-image > .pd-delivery-chip svg {
            width: 18px !important;
            height: 18px !important;
            min-width: 18px !important;
            flex-basis: 18px !important;
          }

          .pd-purchase-row {
            grid-template-columns: 0.92fr 1fr 1.55fr !important;
            gap: 10px !important;
            align-items: stretch !important;
          }

          .pd-purchase-row .pd-qty-inline,
          .pd-purchase-row .pd-qty-inline > div,
          .pd-purchase-row .pd-qty-inline button,
          .pd-save-inline,
          .pd-add-inline {
            height: 54px !important;
            min-height: 54px !important;
          }
        }

        @media (max-width: 390px) {
          .pd-image > .pd-discount-chip {
            min-height: 36px !important;
            padding: 0 12px !important;
            font-size: 14px !important;
          }

          .pd-image > .pd-delivery-chip {
            min-height: 36px !important;
            padding: 0 12px !important;
            font-size: 14px !important;
          }

          .pd-image > .pd-delivery-chip svg {
            width: 17px !important;
            height: 17px !important;
            min-width: 17px !important;
            flex-basis: 17px !important;
          }
        }
/* Desktop-only typography refinement */
        @media (min-width: 1024px) {
          .pd-info h1 {
            font-size: 42px !important;
            line-height: 1.08 !important;
            font-weight: 500 !important;
            letter-spacing: -0.02em !important;
          }

          .pd-brand,
          .pd-rating span,
          .pd-price strong,
          .pd-price del,
          .pd-price em,
          .pd-option label,
          .pd-option button,
          .pd-qty strong,
          .pd-save,
          .pd-add,
          .pd-peace-card strong,
          .pd-peace-card small {
            font-weight: 500 !important;
          }

          .pd-price strong {
            font-size: 34px !important;
          }
        }

        /* PRODUCT DETAIL — COMPACT PURCHASE BENEFITS */
        .pd-purchase-benefits {
          margin-top: 18px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pd-purchase-benefits > span {
          min-height: 34px;
          padding: 0 11px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #dce9df;
          border-radius: 999px;
          color: #17683a;
          background: #f3faf5;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }

        .pd-purchase-benefits svg {
          width: 15px;
          height: 15px;
          flex: 0 0 15px;
          stroke-width: 2;
        }

        @media (max-width: 620px) {
          .pd-purchase-benefits {
            margin-top: 14px;
            gap: 6px;
          }

          .pd-purchase-benefits > span {
            min-height: 31px;
            padding: 0 9px;
            font-size: 11px;
          }
        }

        /* =========================================
           PRODUCT PURCHASE BUTTONS — FINAL
        ========================================= */
        .pd-purchase-row {
          display: grid !important;
          grid-template-columns: minmax(122px, 0.75fr) minmax(170px, 1fr) minmax(170px, 1fr) !important;
          align-items: stretch !important;
          gap: 12px !important;
          margin-top: 24px !important;
        }

        .pd-cart-secondary,
        .pd-buy-primary {
          width: 100% !important;
          height: 54px !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 16px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          border-radius: 15px !important;
          font: inherit !important;
          font-size: 15px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          cursor: pointer !important;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease !important;
        }

        .pd-cart-secondary {
          border: 1.5px solid #e4a044 !important;
          background: #ffffff !important;
          color: #17120d !important;
        }

        .pd-cart-secondary:hover {
          background: #fff8eb !important;
          border-color: #d99325 !important;
        }

        .pd-buy-primary {
          border: 1.5px solid #e4a044 !important;
          background: #e4a044 !important;
          color: #20150a !important;
          box-shadow: 0 9px 22px rgba(228, 160, 68, 0.24) !important;
        }

        .pd-buy-primary:hover {
          background: #eca94d !important;
          border-color: #eca94d !important;
        }

        .pd-cart-secondary:active,
        .pd-buy-primary:active {
          transform: scale(0.98) !important;
        }

        .pd-cart-secondary:disabled,
        .pd-buy-primary:disabled {
          cursor: not-allowed !important;
          opacity: 0.5 !important;
          transform: none !important;
        }

        .pd-cart-secondary svg,
        .pd-buy-primary svg {
          width: 19px !important;
          height: 19px !important;
          min-width: 19px !important;
          stroke-width: 2.2 !important;
        }

        @media (max-width: 620px) {
          .pd-purchase-row {
            grid-template-columns: 104px minmax(0, 1fr) minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .pd-cart-secondary,
          .pd-buy-primary {
            height: 54px !important;
            padding: 0 8px !important;
            gap: 5px !important;
            border-radius: 14px !important;
            font-size: 12px !important;
          }

          .pd-cart-secondary svg,
          .pd-buy-primary svg {
            width: 16px !important;
            height: 16px !important;
            min-width: 16px !important;
          }
        }

        @media (max-width: 410px) {
          .pd-purchase-row {
            grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr) !important;
            gap: 6px !important;
          }

          .pd-cart-secondary,
          .pd-buy-primary {
            padding: 0 5px !important;
            font-size: 11px !important;
          }
        }


        /* =========================================================
           FINAL MOBILE PURCHASE + SHOPPING TOOL ALIGNMENT OVERRIDES
           Keep this block LAST so it wins over older duplicate rules.
        ========================================================= */

        .pd-purchase-row {
          align-items: stretch !important;
        }

        .pd-purchase-row .pd-qty-inline {
          width: 100% !important;
          min-width: 0 !important;
          height: 54px !important;
          margin: 0 !important;
          padding: 0 !important;
          align-self: stretch !important;
        }

        .pd-purchase-row .pd-qty-inline > div {
          width: 100% !important;
          height: 54px !important;
          min-height: 54px !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 10px !important;
          display: grid !important;
          grid-template-columns: 34px minmax(24px, 1fr) 34px !important;
          align-items: center !important;
          justify-items: center !important;
          overflow: hidden !important;
          border: 1.5px solid #17120d !important;
          border-radius: 15px !important;
          background: #ffffff !important;
        }

        .pd-purchase-row .pd-qty-inline button {
          width: 34px !important;
          height: 50px !important;
          min-width: 34px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          border: 0 !important;
          background: transparent !important;
        }

        .pd-purchase-row .pd-qty-inline strong {
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: center !important;
          font-size: 18px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
        }

        .pd-purchase-row .pd-qty-inline svg {
          width: 18px !important;
          height: 18px !important;
          stroke-width: 2.5 !important;
        }

        .pd-cart-secondary,
        .pd-buy-primary {
          height: 54px !important;
          min-height: 54px !important;
          box-sizing: border-box !important;
          font-size: 16px !important;
        }

        .pd-tool-card {
          align-items: center !important;
        }

        .pd-tool-copy {
          min-width: 0 !important;
          align-self: center !important;
        }

        .pd-tool-copy strong {
          font-size: 17px !important;
          line-height: 1.18 !important;
        }

        .pd-tool-copy small {
          font-size: 14px !important;
          line-height: 1.32 !important;
        }

        .pd-tool-copy em {
          font-size: 14px !important;
          line-height: 1.25 !important;
        }

        .pd-tool-arrow {
          align-self: center !important;
        }

        @media (max-width: 620px) {
          .pd-purchase-row {
            grid-template-columns: 104px minmax(0, 1fr) minmax(0, 1fr) !important;
            align-items: stretch !important;
            gap: 8px !important;
          }

          .pd-purchase-row .pd-qty-inline,
          .pd-purchase-row .pd-qty-inline > div,
          .pd-cart-secondary,
          .pd-buy-primary {
            height: 54px !important;
            min-height: 54px !important;
          }

          .pd-purchase-row .pd-qty-inline > div {
            padding: 0 5px !important;
            grid-template-columns: 28px minmax(22px, 1fr) 28px !important;
            border-radius: 14px !important;
          }

          .pd-purchase-row .pd-qty-inline button {
            width: 28px !important;
            min-width: 28px !important;
            height: 50px !important;
          }

          .pd-purchase-row .pd-qty-inline strong {
            font-size: 17px !important;
          }

          .pd-purchase-row .pd-qty-inline svg {
            width: 17px !important;
            height: 17px !important;
          }

          .pd-cart-secondary,
          .pd-buy-primary {
            padding: 0 8px !important;
            gap: 5px !important;
            font-size: 13px !important;
            line-height: 1.05 !important;
          }

          .pd-cart-secondary svg,
          .pd-buy-primary svg {
            width: 17px !important;
            height: 17px !important;
            min-width: 17px !important;
          }

          .pd-tool-copy strong {
            font-size: 16px !important;
          }

          .pd-tool-copy small {
            font-size: 13px !important;
          }

          .pd-tool-copy em {
            font-size: 13px !important;
          }
        }

        @media (max-width: 410px) {
          .pd-purchase-row {
            grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr) !important;
            gap: 6px !important;
          }

          .pd-cart-secondary,
          .pd-buy-primary {
            padding: 0 5px !important;
            font-size: 12px !important;
          }
        }



        /* =========================================================
           SPOTC FREE GIFT SELECTOR
           Desktop: centred modal
           Mobile: near-full-screen bottom sheet
        ========================================================= */

        .pd-gift-selector-backdrop {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483646 !important;
          padding: 24px !important;
          isolation: isolate !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .pd-gift-selector {
          width: min(980px, calc(100vw - 48px)) !important;
          height: min(820px, calc(100dvh - 48px)) !important;
          max-height: calc(100dvh - 48px) !important;
          padding: 0 !important;
          display: grid !important;
          grid-template-rows:
            auto
            auto
            auto
            minmax(0, 1fr)
            auto !important;
          overflow: hidden !important;
          border: 1px solid #e8e1d6 !important;
          border-radius: 24px !important;
          background: #fffdf9 !important;
          color: #171717 !important;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.22) !important;
        }

        .pd-gift-selector-header {
          position: relative !important;
          padding: 22px 68px 15px 22px !important;
          border-bottom: 1px solid #eee7dc !important;
          background: #fffdf9 !important;
        }

        .pd-gift-selector-kicker {
          display: block !important;
          margin-bottom: 5px !important;
          color: #b56b06 !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          letter-spacing: 0.1em !important;
        }

        .pd-gift-selector-header h2 {
          margin: 0 !important;
          color: #171717 !important;
          font-size: 25px !important;
          font-weight: 800 !important;
          line-height: 1.15 !important;
          letter-spacing: -0.025em !important;
        }

        .pd-gift-selector-header p {
          margin: 6px 0 0 !important;
          color: #6c6256 !important;
          font-size: 13px !important;
          line-height: 1.4 !important;
        }

        .pd-gift-selector-close {
          top: 18px !important;
          right: 18px !important;
          background: #f7f3ed !important;
          color: #171717 !important;
        }

        .pd-gift-selector-toolbar {
          padding: 13px 22px !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
          align-items: center !important;
          gap: 12px !important;
          border-bottom: 1px solid #eee7dc !important;
          background: #ffffff !important;
        }

        .pd-gift-search {
          min-width: 0 !important;
          height: 42px !important;
          padding: 0 13px !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          border: 1px solid #ddd5c9 !important;
          border-radius: 12px !important;
          background: #faf8f4 !important;
          box-sizing: border-box !important;
        }

        .pd-gift-search-icon {
          color: #7a7064 !important;
          font-size: 22px !important;
          line-height: 1 !important;
        }

        .pd-gift-search input {
          width: 100% !important;
          min-width: 0 !important;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          color: #171717 !important;
          font: inherit !important;
          font-size: 13px !important;
        }

        .pd-gift-counter {
          min-width: 118px !important;
          height: 42px !important;
          padding: 0 13px !important;
          display: flex !important;
          align-items: baseline !important;
          justify-content: center !important;
          gap: 4px !important;
          border: 1px solid #f0c36e !important;
          border-radius: 12px !important;
          background: #fff5dc !important;
          color: #4b3006 !important;
          box-sizing: border-box !important;
        }

        .pd-gift-counter strong {
          font-size: 18px !important;
          font-weight: 800 !important;
        }

        .pd-gift-counter span {
          font-size: 11px !important;
          font-weight: 600 !important;
        }

        .pd-gift-categories {
          padding: 11px 22px !important;
          display: flex !important;
          gap: 8px !important;
          overflow-x: auto !important;
          border-bottom: 1px solid #eee7dc !important;
          background: #fffdf9 !important;
          scrollbar-width: none !important;
        }

        .pd-gift-categories::-webkit-scrollbar {
          display: none !important;
        }

        .pd-gift-categories button {
          flex: 0 0 auto !important;
          min-height: 32px !important;
          padding: 0 13px !important;
          border: 1px solid #ddd5c9 !important;
          border-radius: 999px !important;
          background: #ffffff !important;
          color: #4b453e !important;
          font-family: inherit !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
        }

        .pd-gift-categories button.active {
          border-color: #e8a531 !important;
          background: #fff1cf !important;
          color: #573400 !important;
        }

        .pd-gift-products {
          min-height: 0 !important;
          padding: 16px 22px 22px !important;
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          grid-auto-flow: row !important;
          grid-auto-rows: max-content !important;
          align-items: start !important;
          align-content: start !important;
          gap: 14px 12px !important;
          overflow-y: auto !important;
          background: #f7f4ef !important;
          overscroll-behavior: contain !important;
        }

        .pd-gift-product {
          width: 100% !important;
          min-width: 0 !important;
          height: 100% !important;
          min-height: 344px !important;
          max-height: none !important;
          padding: 0 !important;
          display: grid !important;
          grid-template-rows: 220px minmax(112px, auto) !important;
          align-self: stretch !important;
          overflow: hidden !important;
          border: 1px solid #e2dbd0 !important;
          border-radius: 15px !important;
          background: #ffffff !important;
          color: #171717 !important;
          text-align: left !important;
          cursor: pointer !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
          appearance: none !important;
          -webkit-appearance: none !important;
        }

        .pd-gift-product:hover {
          border-color: #d7b064 !important;
        }

        .pd-gift-product.selected {
          border: 2px solid #e6a22d !important;
          background: #fffaf0 !important;
        }

        .pd-gift-product:disabled {
          opacity: 0.46 !important;
          cursor: not-allowed !important;
        }

        .pd-gift-product-image {
          position: relative !important;
          width: 100% !important;
          height: 220px !important;
          min-height: 220px !important;
          aspect-ratio: auto !important;
          display: block !important;
          overflow: hidden !important;
          background-color: #ffffff !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
          border-bottom: 1px solid #eee7dc !important;
          box-sizing: border-box !important;
        }

        .pd-gift-product-image > em {
          position: absolute !important;
          left: 8px !important;
          bottom: 8px !important;
          min-height: 24px !important;
          padding: 0 8px !important;
          display: inline-flex !important;
          align-items: center !important;
          border-radius: 999px !important;
          background: #171717 !important;
          color: #ffffff !important;
          font-size: 10px !important;
          font-style: normal !important;
          font-weight: 800 !important;
          letter-spacing: 0.04em !important;
        }

        .pd-gift-selected-tick {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          width: 28px !important;
          height: 28px !important;
          display: grid !important;
          place-items: center !important;
          border: 2px solid #ffffff !important;
          border-radius: 50% !important;
          background: #e8a531 !important;
          color: #171717 !important;
          font-size: 15px !important;
          font-weight: 900 !important;
        }

        .pd-gift-product-copy {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 112px !important;
          padding: 11px 11px 12px !important;
          display: grid !important;
          grid-template-rows: minmax(34px, auto) auto auto !important;
          align-content: start !important;
          gap: 7px !important;
          position: relative !important;
          z-index: 2 !important;
          visibility: visible !important;
          opacity: 1 !important;
          overflow: hidden !important;
          background: #ffffff !important;
          color: #171717 !important;
          box-sizing: border-box !important;
        }

        .pd-gift-product-copy > strong {
          width: 100% !important;
          min-height: 34px !important;
          margin: 0 !important;
          display: -webkit-box !important;
          overflow: hidden !important;
          visibility: visible !important;
          opacity: 1 !important;
          color: #171717 !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          line-height: 1.32 !important;
          text-align: left !important;
          -webkit-box-orient: vertical !important;
          -webkit-line-clamp: 2 !important;
        }

        .pd-gift-price-row {
          width: 100% !important;
          min-height: 22px !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        .pd-gift-price-row del {
          color: #7c7267 !important;
          font-size: 12px !important;
          font-weight: 600 !important;
        }

        .pd-gift-price-row b {
          min-height: 22px !important;
          padding: 0 8px !important;
          display: inline-flex !important;
          align-items: center !important;
          border-radius: 999px !important;
          background: #e8f7ed !important;
          color: #087b3f !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
        }

        .pd-gift-product-copy > small {
          width: fit-content !important;
          min-height: 25px !important;
          padding: 0 9px !important;
          display: inline-flex !important;
          align-items: center !important;
          border: 1px solid #e7b457 !important;
          border-radius: 8px !important;
          background: #fff7e7 !important;
          color: #8a5100 !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        .pd-gift-product.selected .pd-gift-product-copy {
          background: #fffaf0 !important;
        }

        .pd-gift-product.selected .pd-gift-product-copy > small {
          border-color: #a7d9b7 !important;
          background: #e9f8ee !important;
          color: #14743e !important;
        }

        .pd-gift-empty {
          grid-column: 1 / -1 !important;
          min-height: 220px !important;
          display: grid !important;
          place-items: center !important;
          align-content: center !important;
          gap: 7px !important;
          color: #6f665b !important;
          text-align: center !important;
        }

        .pd-gift-empty svg {
          width: 34px !important;
          height: 34px !important;
          color: #c98315 !important;
        }

        .pd-gift-empty strong {
          color: #302a24 !important;
        }

        .pd-gift-empty p {
          margin: 0 !important;
          font-size: 12px !important;
        }

        .pd-gift-selector-footer {
          padding:
            13px
            22px
            calc(13px + env(safe-area-inset-bottom)) !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) auto !important;
          align-items: center !important;
          gap: 16px !important;
          border-top: 1px solid #e4ddd3 !important;
          background: #ffffff !important;
          box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.05) !important;
        }

        .pd-gift-selector-footer > div {
          min-width: 0 !important;
          display: grid !important;
          gap: 3px !important;
        }

        .pd-gift-selector-footer > div strong {
          color: #171717 !important;
          font-size: 13px !important;
          font-weight: 800 !important;
        }

        .pd-gift-selector-footer > div span {
          color: #756a5e !important;
          font-size: 11px !important;
        }

        .pd-gift-selector-footer > button {
          min-width: 180px !important;
          min-height: 44px !important;
          padding: 0 18px !important;
          border: 0 !important;
          border-radius: 12px !important;
          background: #e9a437 !important;
          color: #17120b !important;
          font-family: inherit !important;
          font-size: 13px !important;
          font-weight: 800 !important;
          cursor: pointer !important;
        }

        .pd-gift-selector-footer > button:disabled {
          background: #e3ddd4 !important;
          color: #999087 !important;
          cursor: not-allowed !important;
        }

        @media (max-width: 820px) {
          .pd-gift-products {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 700px) {
          .pd-gift-selector-backdrop {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483000 !important;
            align-items: flex-end !important;
            padding: 0 !important;
          }

          .pd-gift-selector {
            width: 100% !important;
            max-width: 100% !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            margin: 0 !important;
            display: grid !important;
            grid-template-rows:
              auto
              auto
              auto
              minmax(0, 1fr)
              auto !important;
            overflow: hidden !important;
            border: 0 !important;
            border-radius: 0 !important;
          }

          .pd-gift-selector-header {
            padding: 18px 58px 12px 14px !important;
          }

          .pd-gift-selector-header h2 {
            font-size: 21px !important;
          }

          .pd-gift-selector-header p {
            font-size: 11px !important;
          }

          .pd-gift-selector-close {
            top: 13px !important;
            right: 12px !important;
          }

          .pd-gift-selector-toolbar {
            padding: 10px 12px !important;
            gap: 8px !important;
          }

          .pd-gift-search {
            height: 40px !important;
          }

          .pd-gift-counter {
            min-width: 96px !important;
            height: 40px !important;
            padding: 0 9px !important;
          }

          .pd-gift-counter strong {
            font-size: 16px !important;
          }

          .pd-gift-counter span {
            font-size: 9px !important;
          }

          .pd-gift-categories {
            padding: 9px 12px !important;
          }

          .pd-gift-products {
            width: 100% !important;
            min-height: 0 !important;
            height: 100% !important;
            padding: 11px 12px 28px !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-auto-flow: row !important;
            grid-auto-rows: max-content !important;
            align-items: start !important;
            align-content: start !important;
            gap: 10px !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
            box-sizing: border-box !important;
          }

          .pd-gift-product {
            min-height: 270px !important;
            height: 100% !important;
            grid-template-rows: 170px minmax(96px, auto) !important;
            border-radius: 13px !important;
          }

          .pd-gift-product-image {
            height: 170px !important;
            min-height: 170px !important;
            background-size: cover !important;
          }

          .pd-gift-product-copy {
            min-height: 96px !important;
            padding: 9px 9px 10px !important;
            gap: 6px !important;
          }

          .pd-gift-product-copy > strong {
            min-height: 31px !important;
            font-size: 11px !important;
          }

          .pd-gift-price-row del {
            font-size: 11px !important;
          }

          .pd-gift-price-row b {
            min-height: 20px !important;
            padding: 0 7px !important;
            font-size: 10px !important;
          }

          .pd-gift-product-copy > small {
            min-height: 23px !important;
            padding: 0 8px !important;
            font-size: 10px !important;
          }

          .pd-gift-selector-footer {
            position: sticky !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 20 !important;
            width: 100% !important;
            min-height: 78px !important;
            padding:
              10px
              12px
              max(12px, env(safe-area-inset-bottom)) !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            gap: 8px !important;
            flex-shrink: 0 !important;
            border-top: 1px solid #e4ddd3 !important;
            background: #ffffff !important;
            box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08) !important;
            box-sizing: border-box !important;
          }

          .pd-gift-selector-footer > div strong {
            font-size: 12px !important;
          }

          .pd-gift-selector-footer > div span {
            font-size: 9px !important;
          }

          .pd-gift-selector-footer > button {
            min-width: 138px !important;
            min-height: 46px !important;
            padding: 0 12px !important;
            font-size: 11px !important;
            border-radius: 12px !important;
            flex: 0 0 auto !important;
          }
        }




        /* =========================================================
           FREE GIFT SELECTOR — FINAL CLEAN CARD OVERRIDES
        ========================================================= */
        .pd-gift-product-image {
          background-size: cover !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
        }

        .pd-gift-product-image > em {
          display: none !important;
        }

        .pd-gift-price-row del {
          display: none !important;
        }

        /* =========================================================
           SPOTC AI VIRTUAL TRY ON — FINAL
        ========================================================= */

        .pd-image > .pd-tryon-chip {
          position: absolute !important;
          left: auto !important;
          top: auto !important;
          right: 16px !important;
          bottom: 16px !important;
          z-index: 40 !important;
          min-width: 112px !important;
          height: 44px !important;
          padding: 0 16px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 7px !important;
          border: 0 !important;
          border-radius: 999px !important;
          background: #171717 !important;
          color: #ffffff !important;
          font-family: inherit !important;
          font-size: 14px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          cursor: pointer !important;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28) !important;
          transition: transform 0.2s ease, background 0.2s ease !important;
        }

        .pd-image > .pd-tryon-chip span {
          color: #ffffff !important;
        }

        .pd-image > .pd-tryon-chip:hover {
          transform: translateY(-2px) !important;
          background: #000000 !important;
        }

        .pd-modal-backdrop:has(.pd-tryon-sheet) {
          z-index: 5000 !important;
        }

        .pd-tryon-sheet {
          position: relative !important;
          width: min(620px, calc(100vw - 32px)) !important;
          max-height: 90vh !important;
          padding: 28px !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          box-sizing: border-box !important;
          border: 1px solid #34353a !important;
          border-radius: 28px !important;
          background: #090a0d !important;
          color: #ffffff !important;
        }

        .pd-tryon-title {
          margin: 0 54px 8px 0 !important;
          color: #ffffff !important;
          font-size: 30px !important;
          font-weight: 900 !important;
          line-height: 1.1 !important;
        }

        .pd-tryon-subtitle {
          margin: 0 0 22px !important;
          color: #c7c8cc !important;
          font-size: 15px !important;
          line-height: 1.5 !important;
        }

        .pd-tryon-guide {
          margin: 0 0 20px !important;
          padding: 18px !important;
          border: 1px solid #303238 !important;
          border-radius: 18px !important;
          background: #15161a !important;
        }

        .pd-tryon-guide h3 {
          margin: 0 0 14px !important;
          color: #ffffff !important;
          font-size: 18px !important;
          font-weight: 900 !important;
        }

        .pd-tryon-guide p {
          margin: 9px 0 !important;
          color: #eeeeef !important;
          font-size: 14px !important;
          line-height: 1.35 !important;
        }

        .pd-tryon-preview {
          width: min(320px, 100%) !important;
          aspect-ratio: 3 / 4 !important;
          margin: 0 auto 20px !important;
          border: 1px solid #34353a !important;
          border-radius: 20px !important;
          background-color: #1b1c20 !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }

        .pd-tryon-upload,
        .pd-tryon-generate {
          width: 100% !important;
          min-height: 54px !important;
          margin: 0 !important;
          padding: 0 18px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 15px !important;
          font-family: inherit !important;
          font-size: 15px !important;
          font-weight: 900 !important;
          cursor: pointer !important;
          box-sizing: border-box !important;
        }

        .pd-tryon-upload {
          border: 1px solid #44464d !important;
          background: #ffffff !important;
          color: #171717 !important;
        }

        .pd-tryon-generate {
          margin-top: 12px !important;
          border: 0 !important;
          background: #eaa13a !important;
          color: #17120d !important;
        }

        .pd-tryon-generate:disabled {
          background: #383a40 !important;
          color: #8f9197 !important;
          opacity: 1 !important;
          cursor: not-allowed !important;
        }

        .pd-tryon-result {
          width: min(380px, 100%) !important;
          margin: 22px auto 0 !important;
        }

        .pd-tryon-result img {
          display: block !important;
          width: 100% !important;
          height: auto !important;
          border: 1px solid #34353a !important;
          border-radius: 20px !important;
        }

        .pd-tryon-actions {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 12px !important;
          margin-top: 16px !important;
        }

        .pd-tryon-save,
        .pd-tryon-circle {
          min-height: 52px !important;
          padding: 0 14px !important;
          border-radius: 14px !important;
          font-family: inherit !important;
          font-size: 14px !important;
          font-weight: 900 !important;
          cursor: pointer !important;
        }

        .pd-tryon-save {
          border: 1px solid #484a50 !important;
          background: #1c1d22 !important;
          color: #ffffff !important;
        }

        .pd-tryon-circle {
          border: 0 !important;
          background: #22c765 !important;
          color: #07150c !important;
        }

        @media (max-width: 700px) {
          .pd-image > .pd-tryon-chip {
            top: auto !important;
            left: auto !important;
            right: 10px !important;
            bottom: 10px !important;
            min-width: 96px !important;
            height: 38px !important;
            padding: 0 12px !important;
            font-size: 12px !important;
          }

          .pd-modal-backdrop:has(.pd-tryon-sheet) {
            align-items: flex-end !important;
            padding: 0 !important;
          }

          .pd-tryon-sheet {
            width: 100% !important;
            max-width: 100% !important;
            max-height: 92dvh !important;
            padding: 22px 18px calc(22px + env(safe-area-inset-bottom)) !important;
            border-right: 0 !important;
            border-bottom: 0 !important;
            border-left: 0 !important;
            border-radius: 26px 26px 0 0 !important;
          }

          .pd-tryon-title {
            font-size: 25px !important;
          }

          .pd-tryon-actions {
            grid-template-columns: 1fr !important;
          }
        }


        /* =========================================================
           TRY ON SAMPLE PHOTO — FINAL
        ========================================================= */

        .pd-tryon-guide {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 150px !important;
          align-items: center !important;
          gap: 22px !important;
        }

        .pd-tryon-guide-text {
          min-width: 0 !important;
        }

        .pd-tryon-guide-text h3 {
          margin: 0 0 14px !important;
        }

        .pd-tryon-guide-text p {
          margin: 9px 0 !important;
        }

        .pd-tryon-sample {
          width: 150px !important;
          margin: 0 !important;
          padding: 10px !important;
          border: 1px solid #34363c !important;
          border-radius: 18px !important;
          background: #0f1014 !important;
          box-sizing: border-box !important;
        }

        .pd-tryon-sample img {
          display: block !important;
          width: 100% !important;
          aspect-ratio: 2 / 3 !important;
          object-fit: cover !important;
          border-radius: 13px !important;
          background: #f3f1ec !important;
        }

        .pd-tryon-sample figcaption {
          margin-top: 8px !important;
          color: #31d778 !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          line-height: 1.2 !important;
          text-align: center !important;
          text-transform: uppercase !important;
          letter-spacing: 0.04em !important;
        }

        @media (max-width: 700px) {
          .pd-tryon-guide {
            grid-template-columns: minmax(0, 1fr) 108px !important;
            gap: 14px !important;
            padding: 16px !important;
          }

          .pd-tryon-sample {
            width: 108px !important;
            padding: 7px !important;
            border-radius: 14px !important;
          }

          .pd-tryon-sample img {
            border-radius: 10px !important;
          }

          .pd-tryon-sample figcaption {
            margin-top: 6px !important;
            font-size: 10px !important;
          }

          .pd-tryon-guide-text h3 {
            font-size: 17px !important;
          }

          .pd-tryon-guide-text p {
            margin: 7px 0 !important;
            font-size: 12px !important;
          }
        }

        @media (max-width: 430px) {
          .pd-tryon-guide {
            grid-template-columns: 1fr 92px !important;
            gap: 10px !important;
            padding: 14px !important;
          }

          .pd-tryon-sample {
            width: 92px !important;
            padding: 6px !important;
          }

          .pd-tryon-guide-text p {
            font-size: 11px !important;
          }
        }


        /* =========================================================
           AI TRY ON — PROFESSIONAL GUIDE OVERRIDES
        ========================================================= */

        .pd-tryon-sheet {
          width: min(640px, calc(100vw - 32px)) !important;
          padding: 30px !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          border-radius: 28px !important;
          background:
            radial-gradient(circle at top right, rgba(255,255,255,.035), transparent 34%),
            #090a0d !important;
          box-shadow: 0 34px 90px rgba(0,0,0,.56) !important;
        }

        .pd-tryon-title {
          margin: 0 56px 8px 0 !important;
          font-size: 31px !important;
          font-weight: 950 !important;
          letter-spacing: -.03em !important;
        }

        .pd-tryon-subtitle {
          margin: 0 0 22px !important;
          color: #b8bbc2 !important;
          font-size: 15px !important;
          line-height: 1.5 !important;
        }

        .pd-tryon-guide {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 156px !important;
          align-items: center !important;
          gap: 24px !important;
          margin: 0 0 20px !important;
          padding: 22px !important;
          border: 1px solid rgba(255,255,255,.105) !important;
          border-radius: 22px !important;
          background:
            linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.015)),
            #121318 !important;
        }

        .pd-tryon-guide-copy {
          min-width: 0 !important;
        }

        .pd-tryon-guide-kicker {
          display: block !important;
          margin: 0 0 7px !important;
          color: #34d17c !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          letter-spacing: .15em !important;
        }

        .pd-tryon-guide-copy h3 {
          margin: 0 0 16px !important;
          color: #ffffff !important;
          font-size: 20px !important;
          font-weight: 900 !important;
          line-height: 1.2 !important;
          letter-spacing: -.015em !important;
        }

        .pd-tryon-tip-list {
          display: grid !important;
          gap: 10px !important;
          margin: 0 !important;
          padding: 0 !important;
          list-style: none !important;
        }

        .pd-tryon-tip-list li {
          display: flex !important;
          align-items: flex-start !important;
          gap: 9px !important;
          color: #e4e6ea !important;
          font-size: 14px !important;
          font-weight: 650 !important;
          line-height: 1.35 !important;
        }

        .pd-tryon-tip-list li span {
          width: 18px !important;
          height: 18px !important;
          flex: 0 0 18px !important;
          display: grid !important;
          place-items: center !important;
          margin-top: 1px !important;
          border-radius: 50% !important;
          color: #07150c !important;
          background: #34d17c !important;
          font-size: 11px !important;
          font-weight: 950 !important;
        }

        .pd-tryon-sample {
          position: relative !important;
          width: 156px !important;
          margin: 0 !important;
          padding: 8px !important;
          overflow: hidden !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          border-radius: 18px !important;
          background: #0d0e12 !important;
          box-sizing: border-box !important;
        }

        .pd-tryon-sample img {
          display: block !important;
          width: 100% !important;
          aspect-ratio: 2 / 3 !important;
          object-fit: cover !important;
          border-radius: 13px !important;
          background: #e9e4da !important;
        }

        .pd-tryon-sample figcaption {
          margin-top: 8px !important;
          color: #c8cbd1 !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          line-height: 1.2 !important;
          text-align: center !important;
          text-transform: uppercase !important;
          letter-spacing: .08em !important;
        }

        .pd-tryon-upload,
        .pd-tryon-generate {
          min-height: 54px !important;
          border-radius: 16px !important;
          font-size: 15px !important;
          font-weight: 900 !important;
        }

        .pd-tryon-upload {
          border: 1px solid rgba(255,255,255,.12) !important;
          background: #ffffff !important;
          color: #171717 !important;
          box-shadow: 0 8px 22px rgba(0,0,0,.16) !important;
        }

        .pd-tryon-generate {
          margin-top: 12px !important;
          background: linear-gradient(135deg, #f2b35f, #e49b37) !important;
          color: #18120b !important;
        }

        .pd-tryon-generate:disabled {
          background: #34363d !important;
          color: #8b8e96 !important;
          box-shadow: none !important;
        }

        @media (max-width: 700px) {
          .pd-tryon-sheet {
            width: 100% !important;
            max-height: 92dvh !important;
            padding: 22px 18px calc(22px + env(safe-area-inset-bottom)) !important;
            border-radius: 26px 26px 0 0 !important;
          }

          .pd-tryon-title {
            font-size: 26px !important;
          }

          .pd-tryon-guide {
            grid-template-columns: minmax(0, 1fr) 112px !important;
            gap: 14px !important;
            padding: 16px !important;
          }

          .pd-tryon-sample {
            width: 112px !important;
            padding: 6px !important;
            border-radius: 15px !important;
          }

          .pd-tryon-guide-copy h3 {
            margin-bottom: 12px !important;
            font-size: 16px !important;
          }

          .pd-tryon-tip-list {
            gap: 7px !important;
          }

          .pd-tryon-tip-list li {
            gap: 7px !important;
            font-size: 12px !important;
          }

          .pd-tryon-tip-list li span {
            width: 16px !important;
            height: 16px !important;
            flex-basis: 16px !important;
            font-size: 9px !important;
          }
        }

        @media (max-width: 430px) {
          .pd-tryon-guide {
            grid-template-columns: minmax(0, 1fr) 94px !important;
            gap: 10px !important;
            padding: 14px !important;
          }

          .pd-tryon-sample {
            width: 94px !important;
          }

          .pd-tryon-tip-list li {
            font-size: 11px !important;
          }

          .pd-tryon-guide-kicker {
            font-size: 9px !important;
          }
        }
          .pd-tryon-result {
  cursor: zoom-in;
}

.pd-tryon-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.94);
  overflow: auto;
}

.pd-fullscreen-image {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.pd-fullscreen-image img {
  display: block;
  max-width: 95vw;
  max-height: 92vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 14px;
  user-select: none;
}

.pd-tryon-fullscreen-close {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 10001;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  color: #17120d;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.pd-tryon-fullscreen-close svg {
  width: 22px;
  height: 22px;
}



        /* =========================================================
           FINAL TRY-ON MOBILE FIX
           - Removes sticky Upload/Generate buttons
           - Keeps both buttons in normal scroll flow
           - Prevents overlap with the mobile bottom navigation
        ========================================================= */

        

        .pd-tryon-sample img {
          width: 100% !important;
          height: auto !important;
          aspect-ratio: 2 / 3 !important;
          object-fit: cover !important;
          object-position: center top !important;
        }

        @media (max-width: 700px) {
          .pd-modal-backdrop:has(.pd-tryon-sheet) {
            align-items: flex-end !important;
            padding: 0 !important;
          }

          .pd-tryon-sheet {
            width: 100% !important;
            height: auto !important;
            max-height: calc(
              100dvh - 58px - env(safe-area-inset-bottom)
            ) !important;

            padding:
              22px
              16px
              calc(28px + env(safe-area-inset-bottom))
              !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
            border-radius: 26px 26px 0 0 !important;
            box-sizing: border-box !important;
          }

          .pd-tryon-preview {
            width: min(320px, 100%) !important;
            height: auto !important;
            max-height: none !important;
            aspect-ratio: 3 / 4 !important;
            margin: 18px auto !important;
            background-position: center !important;
            background-repeat: no-repeat !important;
            background-size: contain !important;
          }      
        }
          /* ---------- TRY ON MOBILE FIX ---------- */

.pd-tryon-actions-row {
    position: static !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    gap: 12px !important;
    width: 100% !important;
    margin: 18px 0 0 !important;
    padding: 0 !important;
}

.pd-tryon-actions-row .pd-tryon-upload,
.pd-tryon-actions-row .pd-tryon-generate {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 54px !important;
    margin: 0 !important;
    z-index: auto !important;
}

@media (max-width: 760px) {
    .pd-modal-backdrop:has(.pd-tryon-sheet) {
        align-items: flex-end !important;
        padding: 0 !important;
    }

    .pd-tryon-sheet {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: calc(
            100dvh - 58px - env(safe-area-inset-bottom)
        ) !important;
        padding:
            22px
            16px
            calc(110px + env(safe-area-inset-bottom))
            !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        border-radius: 26px 26px 0 0 !important;
        box-sizing: border-box !important;
    }

    .pd-tryon-actions-row {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 12px !important;
        margin-top: 18px !important;
    }

    .pd-tryon-actions-row .pd-tryon-upload,
    .pd-tryon-actions-row .pd-tryon-generate {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        visibility: visible !important;
        opacity: 1 !important;
        flex-shrink: 0 !important;
    }
}


/* =========================================================
   RELATED PRODUCTS — FINAL ALIGNMENT + SOFT FREE GIFT CHIP
   IMPORTANT: kept at the END so older CSS cannot override it.
========================================================= */

.pd-related-grid{
  align-items:stretch !important;
}

.pd-related-card{
  display:grid !important;
  grid-template-rows:
    auto
    42px
    24px
    26px
    18px
    30px !important;
  row-gap:6px !important;
  height:100% !important;
  padding:10px !important;
  box-sizing:border-box !important;
  align-content:start !important;
}

.pd-related-card > .pd-related-image{
  width:100% !important;
  aspect-ratio:1 / 1 !important;
  margin:0 !important;
  border-radius:12px !important;
  overflow:hidden !important;
}

.pd-related-card h3{
  height:42px !important;
  min-height:42px !important;
  max-height:42px !important;
  margin:0 !important;
  display:-webkit-box !important;
  -webkit-line-clamp:2 !important;
  -webkit-box-orient:vertical !important;
  overflow:hidden !important;
  font-size:15px !important;
  line-height:1.35 !important;
  align-self:start !important;
}

.pd-related-card > .pd-related-delivery{
  width:100% !important;
  height:24px !important;
  min-height:24px !important;
  margin:0 !important;
  padding:0 !important;
  display:flex !important;
  align-items:center !important;
  justify-content:flex-start !important;
  gap:5px !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  color:#0a8745 !important;
  font-size:10.5px !important;
  font-weight:850 !important;
  line-height:1 !important;
}

.pd-related-card > .pd-related-delivery svg{
  width:12px !important;
  height:12px !important;
  flex:0 0 12px !important;
}

.pd-related-card > .pd-related-price-row{
  width:100% !important;
  height:26px !important;
  min-height:26px !important;
  margin:0 !important;
  padding:0 !important;
  display:flex !important;
  align-items:center !important;
  flex-wrap:nowrap !important;
  gap:6px !important;
  overflow:hidden !important;
}

.pd-related-price-row strong{
  flex:0 0 auto !important;
  font-size:16px !important;
  line-height:1 !important;
}

.pd-related-price-row del{
  flex:0 0 auto !important;
  font-size:10.5px !important;
  line-height:1 !important;
}

.pd-related-price-row em{
  min-width:0 !important;
  font-size:10.5px !important;
  line-height:1 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}

.pd-related-card > .pd-related-points{
  width:100% !important;
  height:18px !important;
  min-height:18px !important;
  margin:0 !important;
  padding:0 !important;
  display:flex !important;
  align-items:center !important;
  color:#9a5b00 !important;
  font-size:10px !important;
  font-weight:850 !important;
  line-height:1 !important;
}

.pd-related-card > .pd-related-gift{
  width:100% !important;
  height:30px !important;
  min-height:30px !important;
  margin:0 !important;
  padding:0 9px !important;

  display:flex !important;
  align-items:center !important;
  justify-content:flex-start !important;
  gap:7px !important;

  border:1px solid #eadfc8 !important;
  border-radius:9px !important;
  background:#fffdf8 !important;
  color:#4b3820 !important;
  box-shadow:none !important;

  font-size:10px !important;
  font-weight:850 !important;
  line-height:1 !important;
  box-sizing:border-box !important;
  overflow:hidden !important;
}

.pd-related-card > .pd-related-gift svg{
  width:15px !important;
  height:15px !important;
  flex:0 0 15px !important;
  padding:3px !important;
  border-radius:6px !important;
  background:#fff0c9 !important;
  color:#a66b09 !important;
  box-sizing:content-box !important;
}

.pd-related-card > .pd-related-gift span{
  min-width:0 !important;
  display:block !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}

/* Remove any legacy stock row from related cards. */
.pd-related-card > .pd-related-stock{
  display:none !important;
}

/* Mobile keeps the same visual row alignment. */
@media(max-width:620px){
  .pd-related-card{
    grid-template-rows:
      auto
      38px
      22px
      24px
      17px
      28px !important;
    row-gap:5px !important;
    padding:8px !important;
  }

  .pd-related-card h3{
    height:38px !important;
    min-height:38px !important;
    max-height:38px !important;
    font-size:13px !important;
  }

  .pd-related-card > .pd-related-delivery{
    height:22px !important;
    min-height:22px !important;
    font-size:9.5px !important;
  }

  .pd-related-card > .pd-related-price-row{
    height:24px !important;
    min-height:24px !important;
  }

  .pd-related-price-row strong{
    font-size:14px !important;
  }

  .pd-related-card > .pd-related-points{
    height:17px !important;
    min-height:17px !important;
    font-size:9px !important;
  }

  .pd-related-card > .pd-related-gift{
    height:28px !important;
    min-height:28px !important;
    padding:0 7px !important;
    gap:5px !important;
    font-size:9px !important;
  }

  .pd-related-card > .pd-related-gift svg{
    width:13px !important;
    height:13px !important;
    padding:2px !important;
  }
}


/* =========================================================
   RELATED PRODUCT META — LARGER, CLEARER TEXT
========================================================= */
.pd-related-card > .pd-related-delivery{
  font-size:12px !important;
  font-weight:850 !important;
}

.pd-related-card > .pd-related-delivery svg{
  width:13px !important;
  height:13px !important;
  flex:0 0 13px !important;
}

.pd-related-card > .pd-related-points{
  font-size:11.5px !important;
  font-weight:850 !important;
}

.pd-related-card > .pd-related-gift{
  font-size:11.5px !important;
  font-weight:850 !important;
}

.pd-related-card > .pd-related-gift svg{
  width:15px !important;
  height:15px !important;
  flex:0 0 15px !important;
}

@media(max-width:620px){
  .pd-related-card > .pd-related-delivery{
    font-size:10.5px !important;
  }

  .pd-related-card > .pd-related-points{
    font-size:10px !important;
  }

  .pd-related-card > .pd-related-gift{
    font-size:10px !important;
  }
}

        
        /* =========================================================
           SPOTC PRODUCT DETAIL — FINAL LAYOUT FIX
           1. Stock 1: hide quantity selector.
           2. Two shopping-tool cards fill the full available width.
           3. All CTA chevrons sit at the far right and point RIGHT.
        ========================================================= */

        /* PURCHASE ROW */
        .pd-purchase-row.pd-purchase-row-no-qty{
          grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
        }

        .pd-purchase-row.pd-purchase-row-no-qty .pd-cart-secondary,
        .pd-purchase-row.pd-purchase-row-no-qty .pd-buy-primary{
          width:100% !important;
          min-width:0 !important;
        }

        /* COMPARE + ASK FRIENDS — EXACTLY TWO CARDS ACROSS */
        .pd-commerce-tools{
          width:100% !important;
          display:grid !important;
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          gap:14px !important;
          overflow:visible !important;
          box-sizing:border-box !important;
        }

        .pd-commerce-tools > .pd-tool-card{
          width:100% !important;
          max-width:none !important;
          min-width:0 !important;
          box-sizing:border-box !important;
        }

        /* TOOL CARD ARROWS — FAR RIGHT + POINT RIGHT */
        .pd-tool-arrow{
          width:19px !important;
          height:19px !important;
          justify-self:end !important;
          align-self:center !important;
          transform:rotate(180deg) !important;
          transform-origin:center !important;
          color:#4d4034 !important;
          flex:0 0 auto !important;
        }

        /* FREE GIFT ARROW — FAR RIGHT + POINT RIGHT */
        .pd-free-gift-cta-arrow{
          width:18px !important;
          height:18px !important;
          justify-self:end !important;
          align-self:center !important;
          transform:rotate(180deg) !important;
          transform-origin:center !important;
          color:#87560d !important;
          flex:0 0 auto !important;
        }

        .pd-free-gift-cta-arrow.open{
          transform:rotate(180deg) !important;
        }

        /* TABLET */
        @media(max-width:900px){
          .pd-commerce-tools{
            grid-template-columns:repeat(2,minmax(0,1fr)) !important;
            overflow:visible !important;
            padding-bottom:0 !important;
          }
        }

        /* MOBILE — EACH TOOL CARD USES FULL WIDTH */
        @media(max-width:620px){
          .pd-commerce-tools{
            grid-template-columns:1fr !important;
            gap:10px !important;
            margin-top:18px !important;
            margin-left:0 !important;
            margin-right:0 !important;
            padding:0 !important;
            overflow:visible !important;
          }

          .pd-tool-card{
            width:100% !important;
            min-height:96px !important;
            grid-template-columns:46px minmax(0,1fr) 20px !important;
          }

          .pd-purchase-row.pd-purchase-row-no-qty{
            grid-template-columns:repeat(2,minmax(0,1fr)) !important;
            gap:8px !important;
          }
        }

        @media(max-width:410px){
          .pd-purchase-row.pd-purchase-row-no-qty{
            grid-template-columns:repeat(2,minmax(0,1fr)) !important;
            gap:6px !important;
          }
        }


        /* =========================================================
           RELATED PRODUCTS — REMOVE EMPTY WHITE SPACE
           Let each card keep its natural content height instead of
           stretching to the tallest card in the grid row.
        ========================================================= */
        .pd-related-grid{
          align-items:start !important;
        }

        .pd-related-card{
          height:auto !important;
          min-height:0 !important;
          align-self:start !important;
        }

        .pd-related-card > .pd-related-image{
          flex:none !important;
        }

        @media(max-width:900px){
          .pd-related-grid{
            align-items:start !important;
          }
        }


        /* =========================================================
           RELATED PRODUCTS — TRUE EMPTY-SPACE FIX
           Older CSS reserved fixed grid rows for points/gifts even
           when those elements are not rendered. Force natural flow.
        ========================================================= */
        .pd-related-grid{
          align-items:start !important;
          grid-auto-rows:auto !important;
        }

        .pd-related-grid > .pd-related-card{
          display:flex !important;
          flex-direction:column !important;
          grid-template-rows:none !important;
          height:auto !important;
          min-height:0 !important;
          max-height:none !important;
          align-self:start !important;
          justify-content:flex-start !important;
          align-content:flex-start !important;
          padding:10px !important;
          row-gap:0 !important;
        }

        .pd-related-grid > .pd-related-card > .pd-related-image{
          flex:0 0 auto !important;
          margin-bottom:8px !important;
        }

        .pd-related-grid > .pd-related-card > h3{
          height:auto !important;
          min-height:0 !important;
          max-height:none !important;
          margin:0 0 7px !important;
          flex:0 0 auto !important;
        }

        .pd-related-grid > .pd-related-card > .pd-related-delivery{
          flex:0 0 auto !important;
          height:auto !important;
          min-height:0 !important;
          margin:0 0 7px !important;
        }

        .pd-related-grid > .pd-related-card > .pd-related-price-row{
          flex:0 0 auto !important;
          height:auto !important;
          min-height:0 !important;
          margin:0 !important;
        }

        .pd-related-grid > .pd-related-card > .pd-related-gift{
          flex:0 0 auto !important;
          height:auto !important;
          min-height:28px !important;
          margin:8px 0 0 !important;
        }

        @media(max-width:620px){
          .pd-related-grid > .pd-related-card{
            padding:8px !important;
          }

          .pd-related-grid > .pd-related-card > h3{
            height:auto !important;
            min-height:0 !important;
            max-height:none !important;
          }
        }

/* =========================================================
   PRODUCT DETAILS — RIGHT COLUMN WHITE-SPACE FILL
========================================================= */

.pd-inline-details{
  margin-top:22px;
  padding-top:18px;
  border-top:1px solid #eadfce;
}

.pd-inline-details-heading{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}

.pd-inline-details-heading small{
  display:block;
  margin-bottom:3px;
  color:#a76612;
  font-size:10px;
  font-weight:500;
  letter-spacing:.12em;
}

.pd-inline-details-heading h2{
  margin:0;
  color:#17120d;
  font-size:18px;
  font-weight:500;
  line-height:1.2;
}

.pd-inline-details-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
  margin:0;
}

.pd-inline-details-grid > div{
  min-width:0;
  padding:11px 12px;
  border:1px solid #eadfce;
  border-radius:12px;
  background:#fff;
}

.pd-inline-details-grid dt{
  margin:0 0 3px;
  color:#8c7661;
  font-size:10px;
  font-weight:500;
  letter-spacing:.05em;
  text-transform:uppercase;
}

.pd-inline-details-grid dd{
  margin:0;
  color:#17120d;
  font-size:13px;
  font-weight:400;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.pd-description-highlights{
  margin-top:16px;
}

.pd-description-highlights > strong{
  display:block;
  margin-bottom:8px;
}

.pd-description-highlights ul{
  margin:0;
  padding-left:20px;
}

.pd-description-highlights li{
  margin:5px 0;
  line-height:1.45;
}

@media (max-width:760px){
  .pd-inline-details{
    margin-top:18px;
    padding-top:16px;
  }

  .pd-inline-details-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px;
  }

  .pd-inline-details-grid > div{
    padding:10px;
  }

  .pd-inline-details-heading h2{
    font-size:17px;
  }
}

@media (max-width:430px){
  .pd-inline-details-grid{
    grid-template-columns:1fr;
  }
}
      `}
</style>
    </main>
  );

}