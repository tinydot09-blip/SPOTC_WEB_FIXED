'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GitCompareArrows,
  Heart,
  Search,
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

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textValue = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim();

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

const priceOf = (product: BusinessProduct): number =>
  numberValue(product.offer_price ?? product.price);

const oldPriceOf = (product: BusinessProduct): number =>
  numberValue(
    product.old_price ??
      product.original_price ??
      product.mrp,
  );

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

  const [items, setItems] =
    useState<BusinessProduct[] | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('Featured');
  const [category, setCategory] = useState('All');

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

  const categories = useMemo(() => {
    const values = (items || [])
      .map((product) =>
        String(
          product.main_category ||
            product.category ||
            product.sub_category ||
            '',
        ).trim(),
      )
      .filter(Boolean);

    return [
      'All',
      ...Array.from(new Set(values)).slice(0, 8),
    ];
  }, [items]);

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

        const productCategory = String(
          product.main_category ||
            product.category ||
            product.sub_category ||
            '',
        );

        const matchesSearch =
          !searchQuery ||
          searchableText.includes(searchQuery);

        const matchesCategory =
          category === 'All' ||
          productCategory === category;

        return matchesSearch && matchesCategory;
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
  }, [items, search, sort, category]);

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
      <section className="shop-toolbar">
        <div className="shop-search">
          <Search size={19} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search products, brands, colours…"
          />
        </div>

        <div className="sort-box">
          <SlidersHorizontal size={18} />

          <select
            value={sort}
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

      <div className="category-strip">
        {categories.map((categoryName) => (
          <button
            key={categoryName}
            type="button"
            className={
              category === categoryName
                ? 'active'
                : ''
            }
            onClick={() =>
              setCategory(categoryName)
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

      <section className="product-grid rich">
        {filteredProducts.map((item) => {
          const price = priceOf(item);
          const oldPrice = oldPriceOf(item);
          const discount = discountOf(item);
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
                    ? 'Selected'
                    : 'Compare'}
                </button>
              </div>

              <div className="product-copy">
                {!hideBusinessName && (
                  <p className="product-brand">
                    {businessNameOf(item)}
                  </p>
                )}

                <Link
                  href={`/product/${item.id}`}
                  className="product-title-link"
                >
                  <h3>{titleOf(item)}</h3>
                </Link>

                <div className="product-stock-row">
                  <small>
                    {stock > 0
                      ? `${stock} left`
                      : 'In stock'}
                  </small>
                </div>

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

                <div className="reward-row">
                  Earn{' '}
                  {Math.max(
                    1,
                    Math.round(price / 50),
                  )}{' '}
                  SPOTC points
                </div>

                <div className="product-actions">
                  <Link
                    className="product-compare-online"
                    href={`/compare-online?id=${encodeURIComponent(
                      item.id,
                    )}`}
                  >
                    <GitCompareArrows
                      size={16}
                    />

                    <span>Compare Online</span>
                  </Link>

                  <button
                    type="button"
                    className="product-add-button"
                    onClick={() => {
                      addProduct(item);
                      alert('1 product added');
                    }}
                  >
                    <ShoppingBag size={16} />

                    <span>Add</span>
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
      `}</style>
    </>
  );
}