'use client';

import Link from 'next/link';
import {
  BadgeCheck,
  GitCompareArrows,
  Heart,
  MessageCircle,
  Navigation,
  Phone,
  Search,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import { useParams } from 'next/navigation';
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

function readCoordinates(
  business: BusinessListing,
): BusinessCoordinates | null {
  const source =
    business.business_location ||
    business.location;

  if (!source || typeof source !== 'object') {
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
          {Array.from({ length: 4 }).map((_, index) => (
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
  const params = useParams<{ slug: string }>();

  const slug = decodeURIComponent(
    String(params.slug || ''),
  );

  const [business, setBusiness] = useState<
    BusinessListing | null | undefined
  >(undefined);

  const [products, setProducts] = useState<
    BusinessProduct[]
  >([]);

  const [productsLoading, setProductsLoading] =
    useState(true);

  const [search, setSearch] = useState('');
  const [category, setCategory] =
    useState('All');

  const [sort, setSort] =
    useState('Featured');

  useEffect(() => {
    let active = true;

    setBusiness(undefined);
    setProducts([]);
    setProductsLoading(true);

    getBusinessBySlug(slug)
      .then((loadedBusiness) => {
        if (!active) {
          return;
        }

        setBusiness(loadedBusiness);

        if (!loadedBusiness) {
          setProductsLoading(false);
          return;
        }

        /*
         * The business header is shown immediately.
         * Products load separately and do not block the header.
         */
        getBusinessProducts(loadedBusiness)
          .then((loadedProducts) => {
            if (!active) {
              return;
            }

            setProducts(loadedProducts);
          })
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

            setProductsLoading(false);
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
      ...Array.from(new Set(values)),
    ];
  }, [products]);

  const filtered = useMemo(() => {
    const query = search
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

        const productCategory = text(
          product.main_category ||
            product.category ||
            product.sub_category,
        );

        const matchesSearch =
          !query ||
          searchable.includes(query);

        const matchesCategory =
          category === 'All' ||
          productCategory === category;

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
    business.is_business_verified === true;

  const coordinates =
    readCoordinates(business);

  const directionsUrl = coordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates.latitude},${coordinates.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        address,
      )}`;

  return (
    <main className="business-page">
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
              {text(business.category) ||
                'Shopping'}{' '}
              ·{' '}
              {business.is_open === false
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
                <MessageCircle size={19} />
                WhatsApp
              </a>
            )}

            <a
              className="directions"
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={19} />
              Directions
            </a>
          </div>
        </div>
      </section>

      <section className="business-shop">
        <div className="business-shop-title">
          <div>
            <small>SHOP PRODUCTS</small>

            <h2>
              Everything from {name}
            </h2>
          </div>

          <span>
            {filtered.length} products
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
                  category === categoryName
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
            {filtered.map((product) => {
              const price =
                priceOf(product);

              const oldPrice =
                oldPriceOf(product);

              const discount =
                discountOf(product);

              const stock = Number(
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

                    {discount > 0 && (
                      <span className="discount-chip">
                        {discount}% OFF
                      </span>
                    )}

                    <button
                      type="button"
                      className="heart-btn"
                      aria-label="Save product"
                    >
                      <Heart size={18} />
                    </button>
                  </div>

                  <div className="product-copy">
                    <Link
                      href={`/product/${product.id}`}
                      className="product-title-link"
                    >
                      <h3>
                        {titleOf(product)}
                      </h3>
                    </Link>

                    <div className="product-stock-row">
                      <span className="delivery-chip">
                        <ShoppingBag
                          size={13}
                        />
                        15 mins delivery
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

                      {oldPrice > price && (
                        <del>
                          ₹
                          {Math.round(
                            oldPrice,
                          )}
                        </del>
                      )}

                      {oldPrice > price && (
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
                          price / 50,
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
                        Compare Online
                      </a>

                      <button
                        type="button"
                        className="product-add-button"
                        onClick={() => {
                          addProduct(
                            product,
                          );

                          alert(
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
            })}
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
  );
}