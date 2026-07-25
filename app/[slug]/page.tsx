'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitCompareArrows,
  Handshake,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Navigation,
  Phone,
  Search,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  useParams,
  useRouter,
} from 'next/navigation';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { addProduct } from '@/lib/cart';
import {
  getBusinessBySlug,
  getBusinessProducts,
} from '@/lib/data';
import {
  auth,
  db,
  firebaseReady,
} from '@/lib/firebase';
import {
  requireGoogleLogin,
} from '@/lib/auth';
import type {
  BusinessListing,
  BusinessProduct,
} from '@/lib/types';
import {
  discountOf,
  imageOf,
  oldPriceOf,
  priceOf,
  text,
  titleOf,
} from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';

type BusinessCoordinates = {
  latitude: number;
  longitude: number;
};

type ShopPartnerRecord = {
  partner_uid: string;
  partner_name: string;
  partner_email: string;
  partner_photo_url: string;

  business_id: string;
  business_name: string;
  business_slug: string;
  business_logo: string;

  partner_code: string;
  commission_percent: number;
  status: 'active' | 'paused' | 'blocked';

  total_clicks: number;
  total_orders: number;
  total_sales: number;
  total_commission: number;
  available_balance: number;
  withdrawn_amount: number;
};

function readCoordinates(
  business: BusinessListing,
): BusinessCoordinates | null {
  const source =
    business.business_location ||
    business.location;

  if (
    !source ||
    typeof source !== 'object'
  ) {
    return null;
  }

  const value = source as {
    latitude?: unknown;
    longitude?: unknown;
    _lat?: unknown;
    _long?: unknown;
  };

  const latitude = Number(
    value.latitude ?? value._lat,
  );

  const longitude = Number(
    value.longitude ?? value._long,
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude === 0 ||
    longitude === 0
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function generatePartnerCode(): string {
  const characters =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const randomValues =
    new Uint32Array(9);

  if (
    typeof window !== 'undefined' &&
    window.crypto
  ) {
    window.crypto.getRandomValues(
      randomValues,
    );
  } else {
    for (
      let index = 0;
      index < randomValues.length;
      index += 1
    ) {
      randomValues[index] =
        Math.floor(
          Math.random() *
            characters.length,
        );
    }
  }

  const first = Array.from(
    randomValues.slice(0, 4),
  )
    .map(
      (value) =>
        characters[
          value %
            characters.length
        ],
    )
    .join('');

  const second = Array.from(
    randomValues.slice(4, 9),
  )
    .map(
      (value) =>
        characters[
          value %
            characters.length
        ],
    )
    .join('');

  return `SPOTC-${first}-${second}`;
}

function getPartnerDocumentId(
  userUid: string,
  businessId: string,
): string {
  return `${userUid}_${businessId}`;
}

function BusinessPageLoader() {
  return (
    <main
      className="business-page business-page-loading"
      aria-label="Loading business"
      aria-busy="true"
    >
      <section className="business-hero">
        <div className="business-loader-cover" />

        <div className="business-profile business-loader-profile">
          <div className="business-loader-logo" />

          <div className="business-loader-details">
            <div className="business-loader-line business-loader-name" />
            <div className="business-loader-line business-loader-address" />
            <div className="business-loader-line business-loader-status" />
          </div>

          <div className="business-loader-actions">
            <div className="business-loader-button" />
            <div className="business-loader-button" />
            <div className="business-loader-button" />
          </div>
        </div>
      </section>

      <section className="business-shop">
        <div className="business-loader-shop-title">
          <div>
            <div className="business-loader-line business-loader-small" />
            <div className="business-loader-line business-loader-heading" />
          </div>
        </div>

        <div className="business-loader-toolbar">
          <div />
          <div />
        </div>

        <div className="business-loader-products">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              className="business-loader-product"
              key={index}
            >
              <div className="business-loader-product-image" />

              <div className="business-loader-product-copy">
                <div className="business-loader-line" />
                <div className="business-loader-line business-loader-short" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function BusinessPage() {
  const params =
    useParams<{ slug: string }>();

  const router = useRouter();

  const slug = decodeURIComponent(
    String(params.slug || ''),
  );

  const [business, setBusiness] =
    useState<
      | BusinessListing
      | null
      | undefined
    >(undefined);

  const [products, setProducts] =
    useState<BusinessProduct[]>([]);

  const [
    productsLoading,
    setProductsLoading,
  ] = useState(true);

  const [search, setSearch] =
    useState('');

  const [category, setCategory] =
    useState('All');

  const [sort, setSort] =
    useState('Featured');

  const [
    firebaseUser,
    setFirebaseUser,
  ] = useState<User | null>(null);

  const [
    authLoading,
    setAuthLoading,
  ] = useState(true);

  const [
    partnerChecking,
    setPartnerChecking,
  ] = useState(false);

  const [
    partnerRecord,
    setPartnerRecord,
  ] =
    useState<ShopPartnerRecord | null>(
      null,
    );

  const [
    joinSheetOpen,
    setJoinSheetOpen,
  ] = useState(false);

  const [
    successOpen,
    setSuccessOpen,
  ] = useState(false);

  const [
    joiningPartner,
    setJoiningPartner,
  ] = useState(false);

  const [
    partnerError,
    setPartnerError,
  ] = useState('');

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      setFirebaseUser(null);
      setAuthLoading(false);
      return;
    }

    const unsubscribe =
      onAuthStateChanged(
        auth,
        (nextUser) => {
          if (
            nextUser &&
            !nextUser.isAnonymous
          ) {
            setFirebaseUser(
              nextUser,
            );
          } else {
            setFirebaseUser(null);
            setPartnerRecord(null);
          }

          setAuthLoading(false);
        },
      );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    setBusiness(undefined);
    setProducts([]);
    setProductsLoading(true);
    setPartnerRecord(null);
    setJoinSheetOpen(false);
    setSuccessOpen(false);
    setPartnerError('');

    getBusinessBySlug(slug)
      .then((loadedBusiness) => {
        if (!active) {
          return;
        }

        setBusiness(
          loadedBusiness,
        );

        if (!loadedBusiness) {
          setProductsLoading(false);
          return;
        }

        getBusinessProducts(
          loadedBusiness,
        )
          .then(
            (loadedProducts) => {
              if (!active) {
                return;
              }

              setProducts(
                loadedProducts,
              );
            },
          )
          .catch(() => {
            if (!active) {
              return;
            }

            setProducts([]);
          })
          .finally(() => {
            if (!active) {
              return;
            }

            setProductsLoading(
              false,
            );
          });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setBusiness(null);
        setProductsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;

    const loadExistingPartnership =
      async () => {
        if (
          !firebaseUser ||
          !business ||
          !db
        ) {
          setPartnerRecord(null);
          setPartnerChecking(false);
          return;
        }

        const businessId =
          text(business.id);

        if (!businessId) {
          setPartnerChecking(false);
          return;
        }

        setPartnerChecking(true);

        try {
          const partnerDocumentId =
            getPartnerDocumentId(
              firebaseUser.uid,
              businessId,
            );

          const partnerSnapshot =
            await getDoc(
              doc(
                db,
                'BusinessPartners',
                partnerDocumentId,
              ),
            );

          if (!active) {
            return;
          }

          if (
            partnerSnapshot.exists()
          ) {
            setPartnerRecord(
              partnerSnapshot.data() as ShopPartnerRecord,
            );
          } else {
            setPartnerRecord(null);
          }
        } catch (error) {
          console.error(
            'Shop partner check failed:',
            error,
          );

          if (active) {
            setPartnerRecord(null);
          }
        } finally {
          if (active) {
            setPartnerChecking(
              false,
            );
          }
        }
      };

    void loadExistingPartnership();

    return () => {
      active = false;
    };
  }, [
    firebaseUser,
    business,
  ]);

  useEffect(() => {
    if (
      !joinSheetOpen &&
      !successOpen
    ) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    joinSheetOpen,
    successOpen,
  ]);

  const categories = useMemo(() => {
    const values = products
      .map((product) =>
        text(
          product.main_category ||
            product.category ||
            product.sub_category,
        ),
      )
      .filter(Boolean);

    return [
      'All',
      ...Array.from(
        new Set(values),
      ),
    ];
  }, [products]);

  const filtered = useMemo(() => {
    const queryValue = search
      .trim()
      .toLowerCase();

    const data = products.filter(
      (product) => {
        const searchable = [
          titleOf(product),
          product.brand,
          product.color,
          product.size,
          product.main_category,
          product.sub_category,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const productCategory =
          text(
            product.main_category ||
              product.category ||
              product.sub_category,
          );

        const matchesSearch =
          !queryValue ||
          searchable.includes(
            queryValue,
          );

        const matchesCategory =
          category === 'All' ||
          productCategory ===
            category;

        return (
          matchesSearch &&
          matchesCategory
        );
      },
    );

    if (sort === 'Low Price') {
      data.sort(
        (first, second) =>
          priceOf(first) -
          priceOf(second),
      );
    }

    if (sort === 'High Price') {
      data.sort(
        (first, second) =>
          priceOf(second) -
          priceOf(first),
      );
    }

    if (sort === 'Discount') {
      data.sort(
        (first, second) =>
          discountOf(second) -
          discountOf(first),
      );
    }

    return data;
  }, [
    products,
    search,
    category,
    sort,
  ]);

  if (business === undefined) {
    return <BusinessPageLoader />;
  }

  if (!business) {
    return (
      <EmptyState
        title="Business not found"
        body="This SPOTC business link is unavailable."
      />
    );
  }

  const businessId =
    text(business.id);

  const name =
    text(
      business.business_name ||
        business.shop_name,
    ) || 'SPOTC Business';

  const phone = text(
    business.phone ||
      business.business_phone,
  );

  const whatsapp = text(
    business.whatsapp ||
      business.whatsapp_number ||
      phone,
  );

  const logo = text(
    business.logo_url ||
      business.business_logo_url,
  );

  const address =
    text(
      business.address ||
        business.businessAddress,
    ) || 'Local business';

  const verified =
    business.isVerified === true ||
    business.is_business_verified ===
      true;

  const coordinates =
    readCoordinates(business);

  const directionsUrl = coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.latitude},${coordinates.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        address,
      )}`;

  const partnerLink =
    typeof window !== 'undefined' &&
    partnerRecord?.partner_code
      ? `${window.location.origin}/${encodeURIComponent(
          slug,
        )}?partner=${encodeURIComponent(
          partnerRecord.partner_code,
        )}`
      : '';

  const openJoinFlow = async () => {
    setPartnerError('');

    if (partnerRecord) {
      router.push(
        '/dashboard?tab=partner',
      );
      return;
    }

    if (
      authLoading ||
      joiningPartner
    ) {
      return;
    }

    if (!firebaseUser) {
      try {
        const signedInUser =
          await requireGoogleLogin();

        /*
         * On mobile, Google redirect login can return null
         * because the browser is navigating to Google.
         */
        if (!signedInUser) {
          return;
        }

        setFirebaseUser(
          signedInUser,
        );
      } catch (error) {
        console.error(
          'Shop partner sign-in failed:',
          error,
        );

        window.alert(
          error instanceof Error
            ? `Sign in failed: ${error.message}`
            : 'Google sign in failed. Please try again.',
        );

        return;
      }
    }

    setJoinSheetOpen(true);
  };

  const createPartnership =
    async () => {
      setPartnerError('');

      if (
        !firebaseReady ||
        !auth ||
        !db
      ) {
        setPartnerError(
          'Firebase is not ready. Please try again.',
        );
        return;
      }

      let currentUser =
        auth.currentUser ||
        firebaseUser;

      if (!currentUser) {
        try {
          currentUser =
            await requireGoogleLogin();

          if (!currentUser) {
            return;
          }

          setFirebaseUser(
            currentUser,
          );
        } catch (error) {
          console.error(
            'Shop partner login failed:',
            error,
          );

          setPartnerError(
            error instanceof Error
              ? error.message
              : 'Please sign in and try again.',
          );

          return;
        }
      }

      if (!businessId) {
        setPartnerError(
          'Business information is missing. Please refresh the page.',
        );
        return;
      }

      setJoiningPartner(true);

      try {
        const partnerDocumentId =
          getPartnerDocumentId(
            currentUser.uid,
            businessId,
          );

        const partnerReference =
          doc(
            db,
            'BusinessPartners',
            partnerDocumentId,
          );

        const existingSnapshot =
          await getDoc(
            partnerReference,
          );

        if (
          existingSnapshot.exists()
        ) {
          const existingRecord =
            existingSnapshot.data() as ShopPartnerRecord;

          setPartnerRecord(
            existingRecord,
          );
          setJoinSheetOpen(false);
          setSuccessOpen(true);
          return;
        }

        const partnerCode =
          generatePartnerCode();

        const record: ShopPartnerRecord =
          {
            partner_uid:
              currentUser.uid,

            partner_name:
              currentUser.displayName?.trim() ||
              currentUser.email?.split(
                '@',
              )[0] ||
              'SPOTC Partner',

            partner_email:
              currentUser.email || '',

            partner_photo_url:
              currentUser.photoURL || '',

            business_id:
              businessId,

            business_name:
              name,

            business_slug:
              slug,

            business_logo:
              logo,

            partner_code:
              partnerCode,

            commission_percent:
              5,

            status: 'active',

            total_clicks: 0,
            total_orders: 0,
            total_sales: 0,
            total_commission: 0,
            available_balance: 0,
            withdrawn_amount: 0,
          };

        await setDoc(
          partnerReference,
          {
            ...record,

            business_ref: doc(
              db,
              'BusinessListings',
              businessId,
            ),

            created_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),
          },
        );

        setPartnerRecord(record);
        setJoinSheetOpen(false);
        setSuccessOpen(true);
      } catch (error) {
        console.error(
          'Creating shop partnership failed:',
          error,
        );

        setPartnerError(
          error instanceof Error
            ? error.message
            : 'Unable to create your partnership. Please try again.',
        );
      } finally {
        setJoiningPartner(false);
      }
    };

  const copyPartnerCode =
    async () => {
      if (
        !partnerRecord?.partner_code
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          partnerRecord.partner_code,
        );

        window.alert(
          'Partner ID copied',
        );
      } catch {
        window.prompt(
          'Copy your Partner ID',
          partnerRecord.partner_code,
        );
      }
    };

  const sharePartnerShop =
    async () => {
      if (
        !partnerRecord ||
        !partnerLink
      ) {
        return;
      }

      const shareText =
        `Shop from ${name} on SPOTC using my partner link.`;

      try {
        if (navigator.share) {
          await navigator.share({
            title: `${name} on SPOTC`,
            text: shareText,
            url: partnerLink,
          });

          return;
        }

        await navigator.clipboard.writeText(
          partnerLink,
        );

        window.alert(
          'Partner shop link copied',
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        window.prompt(
          'Copy your partner shop link',
          partnerLink,
        );
      }
    };

  return (
    <>
      <main className="page business-page">
        <section className="business-hero">
          <div
            className="business-cover"
            style={{
              backgroundImage: `url(${text(
                business.thumbnail_url,
              )})`,
            }}
          />

          <div className="business-profile">
            <div className="business-page-logo">
              {logo ? (
                <img
                  src={logo}
                  alt={`${name} logo`}
                />
              ) : (
                name.charAt(0)
              )}
            </div>

            <div className="business-profile-details">
              <h1>
                <span>{name}</span>

                {verified && (
                  <BadgeCheck
                    className="business-verified-icon"
                    size={25}
                    strokeWidth={2.4}
                    aria-label="Verified business"
                  />
                )}
              </h1>

              <p>{address}</p>

              <span className="business-open-status">
                {text(
                  business.category,
                ) || 'Shopping'}{' '}
                ·{' '}
                {business.is_open ===
                false
                  ? 'Closed now'
                  : 'Open now'}
              </span>
            </div>

            <div className="business-cta">
              {phone && (
                <a href={`tel:${phone}`}>
                  <Phone size={19} />
                  Call
                </a>
              )}

              {whatsapp && (
                <a
                  className="wa"
                  href={`https://wa.me/${whatsapp.replace(
                    /\D/g,
                    '',
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle
                    size={19}
                  />
                  WhatsApp
                </a>
              )}

              <a
                className="directions"
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation
                  size={19}
                />
                Directions
              </a>
            </div>
          </div>
        </section>

        <section className="business-shop">
          <div className="shop-partner-card">
            <div className="shop-partner-card-icon">
              {partnerRecord ? (
                <CheckCircle2
                  size={28}
                />
              ) : (
                <Handshake size={28} />
              )}
            </div>

            <div className="shop-partner-card-copy">
              <strong>
                {partnerRecord
                  ? `You're a ${name} Shop Partner`
                  : 'Become a Shop Partner'}
              </strong>

              <span>
                {partnerRecord
                  ? `Partner ID: ${partnerRecord.partner_code}`
                  : `Earn 5% commission by promoting ${name}.`}
              </span>
            </div>

            <div className="shop-partner-card-actions">
              {partnerRecord ? (
                <>
                  <button
                    type="button"
                    className="shop-partner-secondary-button"
                    onClick={() =>
                      void sharePartnerShop()
                    }
                  >
                    <Share2 size={17} />
                    Share
                  </button>

                  <button
                    type="button"
                    className="shop-partner-primary-button"
                    onClick={() =>
                      router.push(
                        '/dashboard?tab=partner',
                      )
                    }
                  >
                    <LayoutDashboard
                      size={17}
                    />
                    Dashboard
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="shop-partner-primary-button"
                  disabled={
                    authLoading ||
                    partnerChecking
                  }
                  onClick={() =>
                    void openJoinFlow()
                  }
                >
                  {partnerChecking
                    ? 'Checking...'
                    : 'Join'}
                </button>
              )}
            </div>
          </div>

          <div className="business-shop-title">
            <div>
              <small>
                SHOP PRODUCTS
              </small>

              <h2>
                Everything from {name}
              </h2>
            </div>

            <span>
              {filtered.length}{' '}
              products
            </span>
          </div>

          <div className="shop-toolbar">
            <div className="shop-search">
              <Search size={19} />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder={`Search in ${name}`}
              />
            </div>

            <div className="sort-box">
              <SlidersHorizontal
                size={18}
              />

              <select
                value={sort}
                onChange={(event) =>
                  setSort(
                    event.target.value,
                  )
                }
              >
                {[
                  'Featured',
                  'Low Price',
                  'High Price',
                  'Discount',
                ].map((option) => (
                  <option key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="category-strip">
            {categories.map(
              (categoryName) => (
                <button
                  type="button"
                  className={
                    category ===
                    categoryName
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setCategory(
                      categoryName,
                    )
                  }
                  key={categoryName}
                >
                  {categoryName}
                </button>
              ),
            )}
          </div>

          {productsLoading ? (
            <div className="business-product-loading-grid">
              {Array.from({
                length: 4,
              }).map((_, index) => (
                <div
                  className="business-loader-product"
                  key={index}
                >
                  <div className="business-loader-product-image" />

                  <div className="business-loader-product-copy">
                    <div className="business-loader-line" />
                    <div className="business-loader-line business-loader-short" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="product-grid rich">
              {filtered.map(
                (product) => {
                  const price =
                    priceOf(product);

                  const oldPrice =
                    oldPriceOf(
                      product,
                    );

                  const discount =
                    discountOf(
                      product,
                    );

                  const stock =
                    Number(
                      product.stock_qty ??
                        product.stock_quantity ??
                        0,
                    );

                  return (
                    <article
                      className="product-card rich"
                      key={product.id}
                    >
                      <div className="product-image-wrap">
                        <Link
                          href={`/product/${product.id}`}
                          className="product-image"
                          aria-label={`Open ${titleOf(
                            product,
                          )}`}
                          style={{
                            backgroundImage: `url("${imageOf(
                              product,
                            )}")`,
                          }}
                        />

                        {discount >
                          0 && (
                          <span className="discount-chip">
                            {discount}%
                            OFF
                          </span>
                        )}

                        <button
                          type="button"
                          className="heart-btn"
                          aria-label="Save product"
                        >
                          <Heart
                            size={18}
                          />
                        </button>
                      </div>

                      <div className="product-copy">
                        <Link
                          href={`/product/${product.id}`}
                          className="product-title-link"
                        >
                          <h3>
                            {titleOf(
                              product,
                            )}
                          </h3>
                        </Link>

                        <div className="product-stock-row">
                          <span className="delivery-chip">
                            <ShoppingBag
                              size={13}
                            />
                            15 mins
                            delivery
                          </span>

                          <small>
                            {stock > 0
                              ? `${stock} left`
                              : 'In stock'}
                          </small>
                        </div>

                        <div className="price">
                          <strong>
                            ₹
                            {Math.round(
                              price,
                            )}
                          </strong>

                          {oldPrice >
                            price && (
                            <del>
                              ₹
                              {Math.round(
                                oldPrice,
                              )}
                            </del>
                          )}

                          {oldPrice >
                            price && (
                            <span>
                              Save ₹
                              {Math.round(
                                oldPrice -
                                  price,
                              )}
                            </span>
                          )}
                        </div>

                        <div className="reward-row">
                          Earn{' '}
                          {Math.max(
                            1,
                            Math.round(
                              price /
                                50,
                            ),
                          )}{' '}
                          SPOTC points
                        </div>

                        <div className="product-actions">
                          <a
                            className="product-compare-online"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
                              titleOf(
                                product,
                              ),
                            )}`}
                          >
                            <GitCompareArrows
                              size={16}
                            />
                            Compare
                            Online
                          </a>

                          <button
                            type="button"
                            className="product-add-button"
                            onClick={() => {
                              addProduct(
                                product,
                              );

                              window.alert(
                                '1 product added',
                              );
                            }}
                          >
                            <ShoppingBag
                              size={16}
                            />
                            Add
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}

          {!productsLoading &&
            !filtered.length && (
              <EmptyState
                title="No products found"
                body="Try a different search term or category."
              />
            )}
        </section>
      </main>

      {joinSheetOpen && (
        <div
          className="shop-partner-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setJoinSheetOpen(
                false,
              );
              setPartnerError('');
            }
          }}
        >
          <section
            className="shop-partner-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-partner-sheet-title"
          >
            <div className="shop-partner-sheet-handle" />

            <button
              type="button"
              className="shop-partner-sheet-close"
              aria-label="Close"
              onClick={() => {
                setJoinSheetOpen(false);
                setPartnerError('');
              }}
            >
              <X size={20} />
            </button>

            <div className="shop-partner-sheet-heading">
              <div>
                <Handshake
                  size={27}
                />
              </div>

              <h2 id="shop-partner-sheet-title">
                Become a Shop Partner
              </h2>
            </div>

            <p className="shop-partner-sheet-description">
              Promote {name} and earn
              5% commission on every
              eligible completed order
              under your partner ID.
            </p>

            <div className="shop-partner-benefits">
              <div>
                <Check size={18} />
                <span>
                  Share this shop with
                  friends and family
                </span>
              </div>

              <div>
                <Check size={18} />
                <span>
                  Share products and
                  offers on WhatsApp
                </span>
              </div>

              <div>
                <Check size={18} />
                <span>
                  Earn commission after
                  the order is delivered
                </span>
              </div>

              <div>
                <Check size={18} />
                <span>
                  Track orders and
                  earnings in your
                  dashboard
                </span>
              </div>
            </div>

            {partnerError && (
              <div className="shop-partner-error">
                {partnerError}
              </div>
            )}

            <button
              type="button"
              className="shop-partner-accept-button"
              disabled={joiningPartner}
              onClick={() =>
                void createPartnership()
              }
            >
              {joiningPartner
                ? 'Creating your Partner ID...'
                : 'Accept & Become Partner'}
            </button>
          </section>
        </div>
      )}

      {successOpen &&
        partnerRecord && (
          <div
            className="shop-partner-overlay shop-partner-success-overlay"
            role="presentation"
          >
            <section
              className="shop-partner-success"
              role="dialog"
              aria-modal="true"
              aria-labelledby="shop-partner-success-title"
            >
              <div className="shop-partner-success-icon">
                <BadgeCheck
                  size={62}
                  strokeWidth={2.4}
                />
              </div>

              <h2 id="shop-partner-success-title">
                Congratulations!
              </h2>

              <p>
                You are now an official
                Shop Partner of{' '}
                <strong>
                  {name}
                </strong>
              </p>

              <div className="shop-partner-code-box">
                <span>
                  Partner ID
                </span>

                <strong>
                  {
                    partnerRecord.partner_code
                  }
                </strong>

                <button
                  type="button"
                  onClick={() =>
                    void copyPartnerCode()
                  }
                >
                  <Copy size={16} />
                  Copy ID
                </button>
              </div>

              <div className="shop-partner-success-actions">
                <button
                  type="button"
                  className="shop-partner-success-share"
                  onClick={() =>
                    void sharePartnerShop()
                  }
                >
                  <Share2 size={18} />
                  Share Shop
                </button>

                <button
                  type="button"
                  className="shop-partner-success-dashboard"
                  onClick={() => {
                    setSuccessOpen(false);

                    router.push(
                      '/dashboard?tab=partner',
                    );
                  }}
                >
                  <ExternalLink
                    size={18}
                  />
                  Open Dashboard
                </button>
              </div>

              <button
                type="button"
                className="shop-partner-success-continue"
                onClick={() =>
                  setSuccessOpen(false)
                }
              >
                Continue Shopping
              </button>
            </section>
          </div>
        )}

      <style jsx global>{`
        .shop-partner-card {
          width: 100%;
          margin: 0 0 30px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          border: 1px solid
            #e5c895;
          border-radius: 20px;
          background: linear-gradient(
            135deg,
            #fffdf8,
            #fff8ec
          );
          box-shadow: 0 12px 34px
            rgba(
              91,
              63,
              15,
              0.08
            );
        }

        .shop-partner-card-icon {
          width: 52px;
          height: 52px;
          flex: 0 0 52px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #9b6413;
          background: #f9e7c7;
        }

        .shop-partner-card-copy {
          min-width: 0;
          flex: 1;
        }

        .shop-partner-card-copy strong,
        .shop-partner-card-copy span {
          display: block;
        }

        .shop-partner-card-copy strong {
          color: #191714;
          font-size: 18px;
          font-weight: 850;
          line-height: 1.2;
        }

        .shop-partner-card-copy span {
          margin-top: 5px;
          color: #696158;
          font-size: 14px;
          font-weight: 550;
          line-height: 1.4;
        }

        .shop-partner-card-actions {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .shop-partner-primary-button,
        .shop-partner-secondary-button {
          min-height: 42px;
          padding: 0 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .shop-partner-primary-button {
          border: 1px solid
            #d88f24;
          color: #19140d;
          background: #f5b861;
        }

        .shop-partner-primary-button:hover {
          background: #eda844;
        }

        .shop-partner-primary-button:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .shop-partner-secondary-button {
          border: 1px solid
            #d8c8b2;
          color: #4f3a1b;
          background: #fff;
        }

        .shop-partner-overlay {
          position: fixed;
          inset: 0;
          z-index: 100000;
          padding: 24px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(
            8,
            7,
            6,
            0.68
          );
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(
            4px
          );
        }

        .shop-partner-sheet {
          position: relative;
          width: min(
            620px,
            100%
          );
          padding: 18px 28px 28px;
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.1
            );
          border-radius: 28px 28px 18px
            18px;
          color: #f9f7f4;
          background: #111014;
          box-shadow: 0 -20px 70px
            rgba(0, 0, 0, 0.42);
          animation: shopPartnerSheetIn
            220ms ease-out;
        }

        @keyframes shopPartnerSheetIn {
          from {
            opacity: 0;
            transform: translateY(
              35px
            );
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .shop-partner-sheet-handle {
          width: 56px;
          height: 5px;
          margin: 0 auto 25px;
          border-radius: 999px;
          background: #5f5d64;
        }

        .shop-partner-sheet-close {
          position: absolute;
          top: 17px;
          right: 18px;
          width: 36px;
          height: 36px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #ddd9d2;
          background: #27252b;
          cursor: pointer;
        }

        .shop-partner-sheet-heading {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .shop-partner-sheet-heading > div {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #f5b861;
          background: #2f261d;
        }

        .shop-partner-sheet-heading h2 {
          margin: 0;
          color: #fff;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: -0.5px;
        }

        .shop-partner-sheet-description {
          margin: 19px 0 22px;
          color: #c9c6cc;
          font-size: 16px;
          font-weight: 550;
          line-height: 1.55;
        }

        .shop-partner-benefits {
          display: grid;
          gap: 15px;
        }

        .shop-partner-benefits > div {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          color: #f1eff2;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.45;
        }

        .shop-partner-benefits svg {
          width: 23px;
          height: 23px;
          flex: 0 0 23px;
          padding: 3px;
          border-radius: 50%;
          color: #09160e;
          background: #2dd477;
          stroke-width: 3;
        }

        .shop-partner-error {
          margin-top: 20px;
          padding: 12px 14px;
          border: 1px solid
            #7c3131;
          border-radius: 12px;
          color: #ffcccc;
          background: #341818;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.45;
        }

        .shop-partner-accept-button {
          width: 100%;
          min-height: 56px;
          margin-top: 28px;
          padding: 0 20px;
          border: 0;
          border-radius: 17px;
          color: #17110a;
          background: #f3b565;
          font-family: inherit;
          font-size: 17px;
          font-weight: 900;
          cursor: pointer;
        }

        .shop-partner-accept-button:hover {
          background: #eba64f;
        }

        .shop-partner-accept-button:disabled {
          opacity: 0.68;
          cursor: wait;
        }

        .shop-partner-success-overlay {
          align-items: center;
        }

        .shop-partner-success {
          width: min(
            500px,
            100%
          );
          padding: 34px;
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.09
            );
          border-radius: 28px;
          color: #f7f5f2;
          background: #111014;
          box-shadow: 0 30px 90px
            rgba(0, 0, 0, 0.5);
          text-align: center;
          animation: shopPartnerSuccessIn
            230ms ease-out;
        }

        @keyframes shopPartnerSuccessIn {
          from {
            opacity: 0;
            transform: scale(0.94)
              translateY(18px);
          }

          to {
            opacity: 1;
            transform: scale(1)
              translateY(0);
          }
        }

        .shop-partner-success-icon {
          width: 96px;
          height: 96px;
          margin: 0 auto 18px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #09170f;
          background: #2ed477;
        }

        .shop-partner-success h2 {
          margin: 0;
          color: #fff;
          font-size: 31px;
          font-weight: 950;
          letter-spacing: -0.8px;
        }

        .shop-partner-success > p {
          margin: 11px 0 25px;
          color: #bbb7bf;
          font-size: 16px;
          line-height: 1.5;
        }

        .shop-partner-code-box {
          padding: 20px;
          border: 1px solid
            #29272d;
          border-radius: 19px;
          background: #060607;
        }

        .shop-partner-code-box span,
        .shop-partner-code-box strong {
          display: block;
        }

        .shop-partner-code-box span {
          color: #969198;
          font-size: 14px;
        }

        .shop-partner-code-box strong {
          margin-top: 8px;
          color: #f4b35f;
          font-size: clamp(
            20px,
            5vw,
            29px
          );
          font-weight: 950;
          letter-spacing: 0.8px;
          overflow-wrap: anywhere;
        }

        .shop-partner-code-box button {
          margin: 15px auto 0;
          padding: 8px 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid
            #514438;
          border-radius: 999px;
          color: #ead6bd;
          background: #201b17;
          font-family: inherit;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
        }

        .shop-partner-success-actions {
          margin-top: 18px;
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 10px;
        }

        .shop-partner-success-actions button,
        .shop-partner-success-continue {
          min-height: 50px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 14px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 850;
          cursor: pointer;
        }

        .shop-partner-success-share {
          border: 1px solid
            #3a383e;
          color: #f1edf3;
          background: #242228;
        }

        .shop-partner-success-dashboard {
          border: 1px solid
            #2388d0;
          color: #fff;
          background: #2798e7;
        }

        .shop-partner-success-continue {
          width: 100%;
          margin-top: 11px;
          border: 0;
          color: #d4d0d6;
          background: transparent;
        }

        @media (max-width: 700px) {
          .shop-partner-card {
            margin-bottom: 22px;
            padding: 14px;
            gap: 11px;
            border-radius: 17px;
          }

          .shop-partner-card-icon {
            width: 45px;
            height: 45px;
            flex-basis: 45px;
          }

          .shop-partner-card-copy strong {
            font-size: 15px;
          }

          .shop-partner-card-copy span {
            font-size: 12px;
          }

          .shop-partner-card-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .shop-partner-primary-button,
          .shop-partner-secondary-button {
            min-height: 38px;
            padding: 0 13px;
            font-size: 12px;
          }

          .shop-partner-overlay {
            padding: 0;
          }

          .shop-partner-sheet {
            width: 100%;
            max-height: calc(
              100dvh - 30px
            );
            padding: 13px 21px
              calc(
                22px +
                  env(
                    safe-area-inset-bottom,
                    0px
                  )
              );
            overflow-y: auto;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 28px 28px 0 0;
          }

          .shop-partner-sheet-heading h2 {
            font-size: 22px;
          }

          .shop-partner-sheet-description {
            font-size: 15px;
          }

          .shop-partner-success-overlay {
            padding: 16px;
          }

          .shop-partner-success {
            padding: 28px 20px
              calc(
                24px +
                  env(
                    safe-area-inset-bottom,
                    0px
                  )
              );
            border-radius: 24px;
          }

          .shop-partner-success h2 {
            font-size: 27px;
          }

          .shop-partner-success-actions {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 430px) {
          .shop-partner-card {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .shop-partner-card-copy {
            width: calc(
              100% - 60px
            );
            flex: 1 1
              calc(100% - 60px);
          }

          .shop-partner-card-actions {
            width: 100%;
            flex-direction: row;
          }

          .shop-partner-card-actions
            button {
            flex: 1;
          }
        }
      `}</style>
    </>
  );
}