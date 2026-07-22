'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  Bolt,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ChevronDown,
  ChevronLeft,
  FileText,
  GitCompareArrows,
  Heart,
  Info,
  MessageSquareText,
  Minus,
  PackageCheck,
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
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { addProduct } from '@/lib/cart';
import { getProductById, getProducts } from '@/lib/data';
import { requireGoogleLogin } from '@/lib/auth';
import { auth, firebaseReady } from '@/lib/firebase';
import type { BusinessProduct } from '@/lib/types';
import {
  discountOf,
  imageOf,
  oldPriceOf,
  priceOf,
  text,
  titleOf,
} from '@/lib/utils';

type ProductRecord = BusinessProduct & Record<string, unknown>;

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
  const images: string[] = [];

  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const url = text(value).trim();
    if (url.startsWith('http') && !images.includes(url)) images.push(url);
  };

  add(product.images);
  add(product.product_thumbnail);
  add(product.image);
  add(product.image_url);
  add(product.product_image);
  add(product.image1);
  add(product.image2);
  add(product.image3);
  add(product.image4);
  add(product.image5);

  return images;
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

  const [product, setProduct] = useState<BusinessProduct | null | undefined>(undefined);
  const [related, setRelated] = useState<BusinessProduct[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
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
  const [coinBackOpen, setCoinBackOpen] = useState(false);

  useEffect(() => {
    let active = true;

    setProduct(undefined);
    setRelated([]);
    setSelectedImage('');
    setQty(1);
    setReviews([]);
    setReviewMessage('');
    setRatingSnapshot(null);

    getProductById(id)
      .then((loadedProduct) => {
        if (!active) return;
        setProduct(loadedProduct);
        if (!loadedProduct) return;

        const record = loadedProduct as ProductRecord;
        const loadedImages = imageList(record);
        const loadedSizes = stringList(
          record.sizes,
          record.available_sizes,
          record.size_options,
          record.product_sizes,
          record.size,
        );
        const loadedColors = stringList(
          record.colors,
          record.available_colors,
          record.color_options,
          record.product_colors,
          record.color,
        );

        setSelectedImage(loadedImages[0] || imageOf(loadedProduct));
        setSize(loadedSizes[0] || '');
        setColor(loadedColors[0] || '');

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
          })
          .catch(() => active && setRelated([]))
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

  const record = product ? (product as ProductRecord) : null;
  const images = useMemo(() => (record ? imageList(record) : []), [record]);
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
  const colors = useMemo(
    () =>
      record
        ? stringList(
            record.colors,
            record.available_colors,
            record.color_options,
            record.product_colors,
            record.color,
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

  const price = priceOf(product);
  const oldPrice = oldPriceOf(product);
  const discount = discountOf(product);

  const rawStock = numberValue(record.stock_qty ?? record.stock_quantity);
  const hasStockField = record.stock_qty !== undefined || record.stock_quantity !== undefined;
  const explicitInStock = booleanValue(record.is_in_stock);
  const inStock =
    explicitInStock !== false && (!hasStockField || rawStock === null || rawStock > 0);
  const stockQuantity = rawStock !== null && rawStock > 0 ? Math.floor(rawStock) : null;
  const maximumQuantity = 99;

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

  const description = text(record.description || record.product_description);
  const deliveryText =
    text(record.delivery_text || record.delivery_estimate || record.estimated_delivery_text) ||
    'Nearby delivery';
  const deliveryDetails =
    text(record.delivery_details || record.shipping_details || record.delivery_description) ||
    'Delivery time and charges depend on the business location and your delivery address. Contact the business for an exact delivery estimate.';
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
    'Return or exchange availability is decided by the business. Keep the product, packaging and bill in original condition and contact the business promptly.';

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

  const productImage = selectedImage || images[0] || imageOf(product);

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
        selected_color: color || null,
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

  const addToCart = () => {
    if (!inStock) return alert('This product is out of stock');
    if (sizes.length > 0 && !size) return alert('Select a size');
    if (colors.length > 0 && !color) return alert('Select a colour');

    addProduct(product, { size, color, qty });
    router.push('/cart');
  };

  const openCompareOnline = () => {
    router.push(`/compare-online?id=${encodeURIComponent(product.id)}`);
  };

  const openShoppingCircle = async () => {
    if (!firebaseReady || askFriendsLoading) return;

    const currentUser = await requireGoogleLogin();
    if (!currentUser) return;

    if (!businessId) {
      alert('Business ID is missing for this product.');
      return;
    }

    setAskFriendsLoading(true);

    try {
      const db = getFirestore();
      const userRef = doc(db, 'Users', currentUser.uid);
      const businessRef = doc(db, 'BusinessListings', businessId);
      const safeTitle = titleOf(product)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      const sourceKey = `${businessId}_product_${productNumber}_${safeTitle}`;

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
      } else {
        const circleRef = doc(collection(db, 'ShoppingCircles'));
        circleId = circleRef.id;
        shareCode = `${circleId}_${Date.now()}`;

        await setDoc(circleRef, {
          created_by: userRef,
          business_ref: businessRef,
          business_id: businessId,
          business_name: businessName,
          product_ref: doc(db, 'BusinessProducts', product.id),
          product_id: product.id,
          product_source_key: sourceKey,
          product_no: productNumber,
          product_title: titleOf(product),
          product_image: productImage,
          product_price: price,
          selected_size: size || null,
          selected_color: color || null,
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
          expires_at: Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ),
        });
      }

      router.push(`/circle/${encodeURIComponent(shareCode)}`);
    } catch (error) {
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
      title: `Should I buy ${titleOf(product)}?`,
      text: `Help me decide about ${titleOf(product)} from ${businessName} on SPOTC.`,
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
      title: 'Product Description',
      subtitle: 'Details, brand, colour, size and availability',
      content: (
        <div className="pd-accordion-copy">
          <p>{description || 'Contact the business for additional product details.'}</p>
          <dl>
            <div><dt>Brand</dt><dd>{text(record.brand) || '—'}</dd></div>
            <div><dt>Colour</dt><dd>{colors.length ? colors.join(', ') : '—'}</dd></div>
            <div><dt>Size</dt><dd>{sizes.length ? sizes.join(', ') : '—'}</dd></div>
            <div><dt>Variant</dt><dd>{text(record.variant) || '—'}</dd></div>
            <div>
              <dt>Availability</dt>
              <dd>{inStock ? (stockQuantity ? `${stockQuantity} available` : 'Available') : 'Out of stock'}</dd>
            </div>
          </dl>
        </div>
      ),
    },
    {
      key: 'delivery',
      icon: Truck,
      title: 'Delivery / Free Shipping',
      subtitle: freeShipping ? 'Free shipping available' : deliveryText,
      content: (
        <div className="pd-accordion-copy">
          <p>{deliveryDetails}</p>
          <div className="pd-inline-benefits">
            <span><Truck />{deliveryText}</span>
            {freeShipping && <span><PackageCheck />Free shipping</span>}
            {codAvailable && <span><ShoppingBag />Cash on Delivery</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'returns',
      icon: RefreshCcw,
      title: 'Return & Exchange',
      subtitle: 'Business return and exchange policy',
      content: <div className="pd-accordion-copy"><p>{returnDetails}</p></div>,
    },
    {
      key: 'reviews',
      icon: MessageSquareText,
      title: 'Reviews',
      subtitle: finalReviewCount > 0 ? `${Math.round(finalReviewCount)} customer rating${finalReviewCount === 1 ? '' : 's'}` : 'Be the first to review',
      content: (
        <div className="pd-review-area">
          <div className="pd-review-summary">
            {finalRating !== null ? (
              <>
                <strong>{finalRating.toFixed(1)}</strong>
                <span><Star fill="currentColor" />Based on {Math.round(finalReviewCount)} rating{finalReviewCount === 1 ? '' : 's'}</span>
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
      <section className="pd-main">
        <div className="pd-gallery">
          <div
            className="pd-image"
            role="img"
            aria-label={titleOf(product)}
            style={{ backgroundImage: `url("${selectedImage || imageOf(product)}")` }}
          >
            {discount > 0 && (
              <span className="pd-discount-chip">{discount}% OFF</span>
            )}
            <span className="pd-delivery-chip"><Bolt fill="currentColor" />{deliveryMinutes} mins delivery</span>
          </div>

          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((image) => (
                <button
                  type="button"
                  aria-label="Select product image"
                  className={selectedImage === image ? 'active' : ''}
                  onClick={() => setSelectedImage(image)}
                  key={image}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pd-info">
          <p className="pd-brand">
            {businessName}
            {verified && <BadgeCheck size={17} className="pd-verified-icon" aria-label="Verified business" />}
          </p>
          <h1>{titleOf(product)}</h1>

          <div className="pd-rating">
            {finalRating !== null && <span><Star size={15} fill="currentColor" />{finalRating.toFixed(1)}</span>}
            {finalReviewCount > 0 && <span>{Math.round(finalReviewCount)} rating{finalReviewCount === 1 ? '' : 's'}</span>}
            <span className={inStock ? 'pd-stock-available' : 'pd-stock-unavailable'}>
              {inStock ? (stockQuantity ? `${stockQuantity} in stock` : 'In stock') : 'Out of stock'}
            </span>
          </div>

          <div className="pd-price">
            <strong>₹{Math.round(price)}</strong>
            {oldPrice > price && <del>₹{Math.round(oldPrice)}</del>}
            {oldPrice > price && <em>Save ₹{Math.round(oldPrice - price)}</em>}
          </div>

          <div className="pd-delivery">
            <Truck />
            <div>
              <strong>{freeShipping ? 'Free shipping' : deliveryText}</strong>
              <small>{codAvailable ? 'Local delivery · Cash on Delivery' : 'Local delivery'}</small>
            </div>
          </div>

          {sizes.length > 0 && (
            <div className="pd-option">
              <label>Size</label>
              <div>
                {sizes.map((option) => (
                  <button type="button" className={size === option ? 'active' : ''} onClick={() => setSize(option)} key={option}>{option}</button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div className="pd-option">
              <label>Colour</label>
              <div>
                {colors.map((option) => (
                  <button type="button" className={color === option ? 'active' : ''} onClick={() => setColor(option)} key={option}>{option}</button>
                ))}
              </div>
            </div>
          )}

          <div className="pd-purchase-row">
            <div className="pd-qty pd-qty-inline">
              <div>
                <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((current) => Math.max(1, current - 1))}><Minus /></button>
                <strong>{qty}</strong>
                <button type="button" aria-label="Increase quantity" disabled={!inStock || qty >= maximumQuantity} onClick={() => setQty((current) => Math.min(maximumQuantity, current + 1))}><Plus /></button>
              </div>
            </div>

            <button type="button" className={`pd-save pd-save-inline ${saved ? 'active' : ''}`} onClick={toggleSaved} disabled={saveBusy}>
              <Heart fill={saved ? 'currentColor' : 'none'} />{saveBusy ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </button>

            <button type="button" className="pd-add pd-add-inline" disabled={!inStock} onClick={addToCart}>
              <ShoppingBag />{inStock ? 'Add to cart' : 'Out of stock'}
            </button>
          </div>

          <div className="pd-peace-card pd-peace-compact">
            <span className="pd-shield-icon"><ShieldCheck fill="currentColor" /></span>
            <span>
              <strong>Shop with peace of mind</strong>
              <small>{verified ? 'Verified business' : 'Business contact'} · GPS location · Direct contact</small>
            </span>
          </div>
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
            <strong>Compare Online</strong>
            <small>Find similar products &amp; best prices</small>
            <em>SpotC Price ₹{Math.round(price)}</em>
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
            <strong>Ask Friends &amp; Family</strong>
            <small>{askFriendsLoading ? 'Creating Shopping Circle…' : 'Share with friends & family to get opinions'}</small>
          </span>
          <ChevronLeft className="pd-tool-arrow" />
        </button>

        <button
          type="button"
          className="pd-tool-card pd-tool-coin"
          onClick={() => setCoinBackOpen(true)}
        >
          <span className="pd-tool-icon"><CircleDollarSign /></span>
          <span className="pd-tool-copy">
            <strong>Earn CoinBack</strong>
            <small>Tap to know how SPOTC rewards work</small>
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
              const relatedStock = numberValue(relatedRecord.stock_qty ?? relatedRecord.stock_quantity);
              return (
                <Link className="pd-related-card" href={`/product/${item.id}`} key={item.id}>
                  <div
                    className="pd-related-image"
                    style={{ backgroundImage: `url("${imageOf(item)}")` }}
                  >
                    {discountOf(item) > 0 && (
                      <span className="pd-related-discount-chip">
                        {discountOf(item)}% OFF
                      </span>
                    )}
                  </div>
                  <small>{text(relatedRecord.business_name || relatedRecord.brand) || 'SPOTC Shop'}</small>
                  <h3>{titleOf(item)}</h3>
                  <p><strong>₹{Math.round(priceOf(item))}</strong>{oldPriceOf(item) > priceOf(item) && <del>₹{Math.round(oldPriceOf(item))}</del>}</p>
                  <span>{relatedStock !== null ? `${Math.max(0, Math.floor(relatedStock))} in stock` : 'Available'}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="pd-no-related">No related products are available right now.</p>
        )}
      </section>

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
                <small>{titleOf(product)}</small>
                <em>₹{Math.round(price)}</em>
                <b>15 min delivery · COD · Rewards</b>
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
                  <p>✓ Reward points and nearby coupons</p>
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

      {coinBackOpen && (
        <div className="pd-modal-backdrop" role="presentation" onMouseDown={() => setCoinBackOpen(false)}>
          <section className="pd-modal pd-coin-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pd-modal-close" type="button" onClick={() => setCoinBackOpen(false)}><X /></button>
            <CircleDollarSign className="pd-coin-large" />
            <h2>CoinBack on SPOTC</h2>
            <p>When users discover, enquire, visit or buy through SPOTC, participating businesses can reward them with coins or benefits. Available rewards depend on the business and offer.</p>
          </section>
        </div>
      )}

      <style jsx global>{`
        .pd-page{max-width:1240px;margin:0 auto;padding:24px 24px 72px;color:#17120d}.pd-top{display:flex;justify-content:space-between;margin-bottom:22px}.pd-top button,.pd-top a{display:inline-flex;align-items:center;gap:7px;border:0;background:#fff;color:#17120d;text-decoration:none;padding:10px 14px;border-radius:999px;font-weight:800;box-shadow:0 6px 22px rgba(37,24,12,.08);cursor:pointer}.pd-top svg{width:18px}.pd-main{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(380px,.94fr);gap:48px;align-items:start}.pd-image{position:relative;width:100%;aspect-ratio:4/5;border-radius:26px;background:#eee center/cover no-repeat;box-shadow:0 14px 45px rgba(37,24,12,.1)}.pd-discount-chip{position:absolute;left:16px;top:16px;padding:8px 11px;border-radius:10px;background:#f1b46d;color:#181008;font-size:12px;font-weight:900}
        .pd-delivery-chip{position:absolute;right:16px;top:16px;display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;background:#25c963;color:#fff;font-size:16px;font-weight:900;box-shadow:0 8px 20px rgba(37,201,99,.34)}
        .pd-delivery-chip svg{width:15px;height:15px}.pd-thumbs{display:flex;gap:10px;margin-top:12px;overflow:auto;padding-bottom:3px}.pd-thumbs button{width:76px;height:76px;padding:0;border:2px solid transparent;border-radius:13px;overflow:hidden;background:#eee;cursor:pointer;flex:0 0 auto}.pd-thumbs button.active{border-color:#17120d}.pd-thumbs img{width:100%;height:100%;object-fit:cover}.pd-info{padding-top:8px}.pd-brand{display:flex;align-items:center;gap:6px;margin:0 0 8px;color:#785f47;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.pd-verified-icon{color:#1976d2}.pd-info h1{font-size:clamp(30px,4vw,50px);line-height:1.05;margin:0 0 14px;letter-spacing:-.035em}.pd-rating{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:20px}.pd-rating span{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:999px;background:#fff;border:1px solid #eadfce;font-size:12px;font-weight:800}.pd-rating span:first-child{background:#1d6f42;color:#fff;border-color:#1d6f42}.pd-stock-available{color:#166c3a}.pd-stock-unavailable{color:#b32d24}.pd-price{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}.pd-price strong{font-size:34px}.pd-price del{color:#9a8b7c;font-size:18px}.pd-price em{font-style:normal;color:#1a7c42;font-weight:900}.pd-delivery{display:flex;gap:12px;align-items:center;padding:15px;border:1px solid #eadfce;background:#fffaf3;border-radius:17px;margin-bottom:22px}.pd-delivery svg{color:#9a5e23}.pd-delivery strong,.pd-delivery small{display:block}.pd-delivery small{margin-top:3px;color:#766657}.pd-option{margin:18px 0}.pd-option label,.pd-qty label{display:block;margin-bottom:9px;font-weight:900}.pd-option>div{display:flex;gap:8px;flex-wrap:wrap}.pd-option button{min-width:48px;padding:10px 13px;border:1px solid #d8c8b7;border-radius:11px;background:#fff;cursor:pointer;font-weight:800}.pd-option button.active{background:#17120d;color:#fff;border-color:#17120d}.pd-qty{margin:20px 0}.pd-qty>div{display:inline-flex;align-items:center;border:1px solid #dbcdbd;border-radius:13px;overflow:hidden;background:#fff}.pd-qty button{width:42px;height:42px;border:0;background:#fff;cursor:pointer}.pd-qty button:disabled{opacity:.35;cursor:not-allowed}.pd-qty svg{width:17px}.pd-qty strong{min-width:38px;text-align:center}.pd-actions{display:grid;grid-template-columns:145px 1fr;gap:10px;margin-top:22px}.pd-actions button{height:54px;border-radius:15px;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-actions svg{width:19px}.pd-save{border:1px solid #d8c8b7;background:#fff}.pd-save.active{color:#b42c37;border-color:#b42c37;background:#fff3f4}.pd-add{border:0;background:#17120d;color:#fff}.pd-add:disabled{opacity:.5;cursor:not-allowed}.pd-compare-card{width:100%;margin-top:12px;display:grid;grid-template-columns:34px 1fr 24px;gap:10px;align-items:center;padding:16px;border:1px solid #4f4438;border-radius:20px;background:#111217;color:#fff;text-align:left;cursor:pointer}.pd-compare-card:disabled{opacity:.65}.pd-compare-icon svg{width:24px}.pd-compare-card span:nth-child(2){display:grid;gap:3px}.pd-compare-card strong{font-size:16px}.pd-compare-card small{color:#aeadb1;font-weight:700}.pd-compare-card em{color:#f2b774;font-style:normal;font-size:13px;font-weight:900}.pd-compare-arrow{width:20px;transform:rotate(180deg);color:#9a9ba0}.pd-ask-friends{width:100%;height:56px;margin-top:14px;border:0;border-radius:18px;background:#f2b774;color:#17120d;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer}.pd-ask-friends:disabled{opacity:.65}.pd-ask-friends svg{width:20px}.pd-info-card,.pd-peace-card{width:100%;margin-top:18px;display:grid;grid-template-columns:42px 1fr 24px;gap:10px;align-items:center;padding:16px 18px;border:1px solid #34353a;border-radius:20px;background:#17181c;color:#fff;text-align:left}.pd-info-card{cursor:pointer}.pd-info-card strong,.pd-info-card small,.pd-peace-card strong,.pd-peace-card small{display:block}.pd-info-card small,.pd-peace-card small{color:#fff;font-size:12px;font-weight:700}.pd-coin-icon,.pd-shield-icon{width:32px;height:32px;display:grid;place-items:center}.pd-coin-icon{color:#f2b774}.pd-coin-icon svg{width:32px;height:32px}.pd-shield-icon{color:#28df6b}.pd-shield-icon svg{width:32px;height:32px}.pd-info-card>svg{width:21px;color:#bfc0c4}.pd-inline-benefits span{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#655647}.pd-inline-benefits svg{width:16px}.pd-accordions{margin-top:46px;border:1px solid #e4d7c8;border-radius:23px;overflow:hidden;background:#16171b;color:#fff}.pd-accordion+ .pd-accordion{border-top:1px solid rgba(255,255,255,.1)}.pd-accordion>button{width:100%;display:grid;grid-template-columns:32px 1fr 24px;gap:12px;align-items:center;padding:17px 18px;border:0;background:transparent;color:#fff;text-align:left;cursor:pointer}.pd-accordion-icon{width:25px}.pd-accordion>button span strong,.pd-accordion>button span small{display:block}.pd-accordion>button span strong{font-size:16px}.pd-accordion>button span small{margin-top:4px;color:rgba(255,255,255,.55);font-size:12px;font-weight:700}.pd-accordion-chevron{width:20px;transition:.2s}.pd-accordion.open .pd-accordion-chevron{transform:rotate(180deg)}.pd-accordion-content{padding:0 18px 20px 62px;color:rgba(255,255,255,.76)}.pd-accordion-copy p{margin:0 0 16px;line-height:1.65}.pd-accordion-copy dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}.pd-accordion-copy dl div{padding:12px;border-radius:12px;background:rgba(255,255,255,.055)}.pd-accordion-copy dt{font-size:11px;color:rgba(255,255,255,.48);font-weight:800;text-transform:uppercase}.pd-accordion-copy dd{margin:4px 0 0;color:#fff;font-weight:800}.pd-inline-benefits{display:flex;gap:12px;flex-wrap:wrap}.pd-inline-benefits span{color:#fff;background:rgba(255,255,255,.06);padding:9px 10px;border-radius:10px}.pd-review-area{display:grid;gap:20px}.pd-review-summary{display:flex;align-items:center;gap:14px}.pd-review-summary>strong{font-size:48px;color:#f2b774}.pd-review-summary>span{display:flex;align-items:center;gap:7px}.pd-review-summary svg{width:18px;color:#f2b774}.pd-review-form{padding:16px;border-radius:16px;background:rgba(255,255,255,.055)}.pd-review-form h3{margin:0 0 10px;color:#fff}.pd-star-input{display:flex;gap:4px;margin-bottom:12px}.pd-star-input button{border:0;background:transparent;color:#6f7075;padding:2px;cursor:pointer}.pd-star-input button.active{color:#f2b774}.pd-star-input svg{width:25px;height:25px}.pd-review-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pd-review-form input,.pd-review-form textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);background:#0f1014;color:#fff;border-radius:11px;padding:12px;font:inherit;margin-bottom:10px}.pd-submit-review{border:0;border-radius:11px;background:#f2b774;color:#181008;padding:11px 16px;font-weight:900;cursor:pointer}.pd-submit-review:disabled{opacity:.55}.pd-review-message{margin:10px 0 0!important;font-size:12px}.pd-review-list{display:grid;gap:10px}.pd-review-list article{padding:14px;border-radius:14px;background:rgba(255,255,255,.05)}.pd-review-list article>div:first-child{display:flex;justify-content:space-between;gap:12px}.pd-review-list article span{font-size:11px;color:rgba(255,255,255,.45)}.pd-review-stars{display:flex;gap:2px;margin:7px 0}.pd-review-stars svg{width:14px;color:#f2b774}.pd-review-list h4{margin:7px 0 3px;color:#fff}.pd-review-list p{margin:0;line-height:1.5}.pd-related-section{margin-top:48px}.pd-section-heading{display:flex;align-items:end;justify-content:space-between;margin-bottom:17px}.pd-section-heading small{font-weight:900;color:#99724b;letter-spacing:.12em}.pd-section-heading h2{margin:4px 0 0;font-size:28px}.pd-section-heading a{color:#17120d;font-weight:900}.pd-related-grid,.pd-related-loading{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.pd-related-card{text-decoration:none;color:#17120d;background:#fff;border:1px solid #eadfce;border-radius:17px;padding:10px}.pd-related-card>div{aspect-ratio:1/1;border-radius:12px;background:#eee center/cover no-repeat;margin-bottom:10px}.pd-related-card small{color:#8b755f;font-weight:800}.pd-related-card h3{font-size:15px;line-height:1.3;margin:5px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pd-related-card p{margin:0;display:flex;gap:7px;align-items:center}.pd-related-card del{font-size:12px;color:#948577}.pd-related-card>span{display:block;margin-top:7px;color:#217143;font-size:11px;font-weight:800}.pd-related-loading span{height:270px;border-radius:17px;background:#e6e1d9;animation:pdPulse 1.2s infinite alternate}.pd-no-related{color:#796b5d}.pd-modal-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}.pd-modal{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;border:1px solid #34353a;border-radius:26px;background:#090a0d;color:#fff;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.5)}.pd-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;border:1px solid #34353a;border-radius:50%;background:#17181c;color:#fff;display:grid;place-items:center;cursor:pointer}.pd-modal-close svg{width:19px}.pd-modal-handle{width:44px;height:4px;border-radius:99px;background:#555;margin:0 auto 14px}.pd-modal h2{margin:0 44px 18px 0;font-size:25px}.pd-spotc-product{display:grid;grid-template-columns:88px 1fr;gap:13px;padding:14px;border:1px solid rgba(242,183,116,.26);border-radius:20px;background:#15161a}.pd-spotc-product>div{width:88px;height:88px;border-radius:14px;background:#292a2e center/cover no-repeat}.pd-spotc-product span{display:grid;align-content:center;gap:4px}.pd-spotc-product small{color:#b8b8bc}.pd-spotc-product em{color:#f2b774;font-style:normal;font-size:20px;font-weight:900}.pd-spotc-product b{color:#30d970;font-size:11px}.pd-compare-steps{display:grid;gap:10px;margin-top:18px}.pd-compare-steps p{display:flex;align-items:center;gap:11px;margin:0;padding:13px;border-radius:14px;background:#15161a;font-weight:800}.pd-spinner{width:17px;height:17px;border:2px solid #555;border-top-color:#f2b774;border-radius:50%;animation:pdSpin .8s linear infinite}.pd-compare-steps>small{text-align:center;color:#8d8e93;margin-top:9px}.pd-compare-error{padding:18px;text-align:center}.pd-compare-error button{border:0;border-radius:12px;background:#f2b774;padding:11px 16px;font-weight:900;cursor:pointer}.pd-online-results{margin-top:18px}.pd-online-results h3{margin:0 0 10px}.pd-online-results>a{display:grid;grid-template-columns:70px 1fr;gap:12px;margin-bottom:10px;padding:11px;border:1px solid #2c2d31;border-radius:16px;background:#15161a;color:#fff;text-decoration:none}.pd-online-results>a.disabled{pointer-events:none;opacity:.6}.pd-online-results>a>div{width:70px;height:70px;border-radius:11px;background:#292a2e center/cover no-repeat}.pd-online-results>a span{display:grid;align-content:center;gap:4px}.pd-online-results>a small{color:#f2b774;font-weight:800}.pd-online-results>a em{color:#909196;font-style:normal;font-size:11px}.pd-why-spotc{margin-top:17px;padding:16px;border-radius:18px;background:#15161a}.pd-why-spotc p{margin:7px 0;color:#c6c7ca}.pd-circle-modal,.pd-coin-modal{max-width:460px;text-align:center}.pd-success-icon,.pd-coin-large{width:60px;height:60px;margin:5px auto 12px;color:#2cda69}.pd-coin-large{color:#f2b774}.pd-circle-modal h2,.pd-coin-modal h2{margin:0 40px 10px}.pd-circle-modal p,.pd-coin-modal p{color:#b7b8bc;line-height:1.6}.pd-circle-share,.pd-circle-copy{width:100%;height:50px;border-radius:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-circle-share{border:0;background:#f2b774;color:#17120d}.pd-circle-copy{margin-top:9px;border:1px solid #34353a;background:#17181c;color:#fff}.pd-circle-share svg,.pd-circle-copy svg{width:19px}@keyframes pdSpin{to{transform:rotate(360deg)}}.pd-page-loading{min-height:calc(100vh - 76px)}.pd-loader-top{display:flex;justify-content:space-between;margin-bottom:20px}.pd-loader-top span{width:80px;height:32px;border-radius:999px}.pd-loader-main{display:grid;grid-template-columns:1.08fr .92fr;gap:48px}.pd-loader-image{width:100%;aspect-ratio:4/5;border-radius:24px}.pd-loader-thumbnails{display:flex;gap:10px;margin-top:12px}.pd-loader-thumbnails span{width:74px;height:74px;border-radius:12px}.pd-loader-info{display:flex;flex-direction:column;align-items:flex-start;gap:16px}.pd-loader-line{display:block;height:13px;border-radius:999px}.pd-loader-brand{width:145px}.pd-loader-title{width:min(100%,430px);height:48px}.pd-loader-rating{display:flex;gap:10px}.pd-loader-rating span{width:92px;height:25px;border-radius:999px}.pd-loader-price{width:210px;height:34px}.pd-loader-delivery{width:100%;height:75px;border-radius:16px}.pd-loader-option-title{width:80px}.pd-loader-options{display:flex;gap:8px}.pd-loader-options span{width:60px;height:42px;border-radius:10px}.pd-loader-actions{width:100%;display:grid;grid-template-columns:150px 1fr;gap:10px;margin-top:10px}.pd-loader-actions span{height:52px;border-radius:14px}.pd-loader-top span,.pd-loader-image,.pd-loader-thumbnails span,.pd-loader-line,.pd-loader-rating span,.pd-loader-delivery,.pd-loader-options span,.pd-loader-actions span{position:relative;overflow:hidden;background:#e6e1d9}.pd-loader-top span:after,.pd-loader-image:after,.pd-loader-thumbnails span:after,.pd-loader-line:after,.pd-loader-rating span:after,.pd-loader-delivery:after,.pd-loader-options span:after,.pd-loader-actions span:after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.78),transparent);animation:pdShimmer 1.25s infinite}@keyframes pdShimmer{100%{transform:translateX(100%)}}@keyframes pdPulse{to{opacity:.5}}@media(max-width:900px){.pd-main{grid-template-columns:1fr;gap:28px}.pd-info{padding-top:0}.pd-related-grid,.pd-related-loading{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.pd-modal-backdrop{align-items:flex-end;padding:0}.pd-modal{width:100%;max-height:92vh;border-radius:26px 26px 0 0;padding:20px 16px}.pd-delivery-chip{right:10px;top:10px;padding:9px 11px;font-size:11px}.pd-page{padding:15px 14px 52px}.pd-main{gap:20px}.pd-image{border-radius:18px}.pd-info h1{font-size:31px}.pd-actions{grid-template-columns:1fr}.pd-accordions{margin-top:32px;border-radius:18px}.pd-accordion>button{padding:15px 13px;grid-template-columns:28px 1fr 20px}.pd-accordion-content{padding:0 13px 17px}.pd-accordion-copy dl{grid-template-columns:1fr}.pd-review-grid{grid-template-columns:1fr}.pd-related-grid,.pd-related-loading{gap:9px}.pd-related-card{padding:8px}.pd-loader-main{grid-template-columns:1fr;gap:28px}.pd-loader-actions{grid-template-columns:1fr}}.pd-purchase-row{display:grid;grid-template-columns:122px 130px minmax(190px,1fr);gap:12px;align-items:stretch;margin-top:24px}.pd-qty-inline{margin:0}.pd-qty-inline>div{width:100%;height:54px;display:grid;grid-template-columns:40px 1fr 40px;align-items:center;background:#17120d;border-color:#3c342b;color:#fff}.pd-qty-inline button{width:40px;height:52px;background:transparent;color:#fff}.pd-qty-inline strong{min-width:0}.pd-save-inline,.pd-add-inline{height:54px;border-radius:15px;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.pd-save-inline{border:1px solid #d8c8b7;background:#fff;color:#17120d}.pd-add-inline{border:0;background:#e4a044;color:#20150a}.pd-add-inline:hover{background:#eca94d}.pd-add-inline:disabled{opacity:.5;cursor:not-allowed}.pd-peace-compact{margin-top:16px}.pd-commerce-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:22px}.pd-tool-card{min-width:0;min-height:116px;display:grid;grid-template-columns:52px minmax(0,1fr) 22px;gap:13px;align-items:center;padding:17px 16px;border:1px solid #eadbc9;border-radius:18px;background:linear-gradient(135deg,#fff9ee 0%,#fff3df 100%);color:#17120d;text-align:left;cursor:pointer;box-shadow:0 8px 24px rgba(63,39,17,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.pd-tool-card:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(63,39,17,.11);border-color:#ddc3a4}.pd-tool-card:disabled{opacity:.65;cursor:not-allowed;transform:none}.pd-tool-friends{background:linear-gradient(135deg,#fff5ea 0%,#ffe7d8 100%)}.pd-tool-coin{background:linear-gradient(135deg,#fff9e9 0%,#fff4d9 100%)}.pd-tool-icon{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;background:#ffd58f;color:#4c2e0b}.pd-tool-friends .pd-tool-icon{background:#ffb878}.pd-tool-coin .pd-tool-icon{background:#ffe39b}.pd-tool-icon svg{width:25px;height:25px}.pd-tool-copy{min-width:0;display:grid;gap:4px}.pd-tool-copy strong{font-size:15px;line-height:1.15}.pd-tool-copy small{color:#6f6254;font-size:12px;line-height:1.35;font-weight:700}.pd-tool-copy em{margin-top:5px;color:#e77e1e;font-size:12px;font-style:normal;font-weight:900}.pd-tool-arrow{width:19px;transform:rotate(180deg);color:#4d4034}.pd-discount-chip{border-radius:999px!important;background:#f2a74d!important;color:#1d1309!important;box-shadow:0 7px 18px rgba(242,167,77,.32)}.pd-delivery-chip{padding:7px 10px;font-size:11px;box-shadow:0 6px 15px rgba(37,201,99,.28)}@media(max-width:900px){.pd-commerce-tools{grid-template-columns:repeat(3,minmax(220px,1fr));overflow-x:auto;padding-bottom:6px;scrollbar-width:none}.pd-commerce-tools::-webkit-scrollbar{display:none}}@media(max-width:620px){.pd-purchase-row{grid-template-columns:104px 104px minmax(0,1fr);gap:8px}.pd-save-inline,.pd-add-inline{font-size:13px}.pd-add-inline svg,.pd-save-inline svg{width:17px}.pd-commerce-tools{grid-template-columns:repeat(3,250px);margin-top:18px;margin-left:-14px;margin-right:-14px;padding:0 14px 8px}.pd-tool-card{min-height:104px;padding:14px;grid-template-columns:46px minmax(0,1fr) 18px}.pd-tool-icon{width:46px;height:46px;border-radius:13px}.pd-tool-copy strong{font-size:14px}.pd-tool-copy small{font-size:11px}.pd-discount-chip{left:10px;top:10px;padding:7px 9px;font-size:10px}.pd-delivery-chip{right:10px;top:10px;padding:7px 9px;font-size:10px}}@media(max-width:410px){.pd-purchase-row{grid-template-columns:96px 90px minmax(0,1fr);gap:6px}.pd-save-inline,.pd-add-inline{font-size:12px}.pd-save-inline{padding:0 8px}.pd-add-inline{padding:0 9px}.pd-qty-inline>div{grid-template-columns:30px 1fr 30px}.pd-qty-inline button{width:30px}}

        
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
      `}</style>
    </main>
  );
}