'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Gift, Search } from 'lucide-react';

import { addProduct, readCart, updateCartQuantity } from '@/lib/cart';
import { getProductById, getProducts } from '@/lib/data';
import type { BusinessProduct } from '@/lib/types';
import { imageOf, text, titleOf } from '@/lib/utils';

type ProductRecord = BusinessProduct & Record<string, unknown>;

type ComboBaseState = {
  productId: string;
  size: string;
  color: string;
  qty: number;
  tryAtHome: boolean;
  action: 'cart' | 'buy';
};

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

const customerPriceOf = (product: BusinessProduct): number => {
  const record = product as ProductRecord;

  const candidates = [
    record.offer_price,
    record.offerPrice,
    record.selling_price,
    record.sellingPrice,
    record.sell_price,
    record.sale_price,
    record.salePrice,
    record.customer_price,
    record.final_price,
    record.price,
    record.mrp,
    record.old_price,
  ];

  for (const candidate of candidates) {
    const value = numberValue(candidate);
    if (value !== null && value > 0) return value;
  }

  return 0;
};

const comboPriceOf = (product: BusinessProduct): number => {
  const sellingPrice = customerPriceOf(product);
  if (sellingPrice <= 0) return 0;

  // Internal launch combo pricing rule.
  // Keep the percentage out of customer-facing UI.
  return Math.max(1, Math.round(sellingPrice * 0.82));
};

const categoryOf = (product: BusinessProduct): string => {
  const record = product as ProductRecord;

  return text(
    record.main_category ||
      record.category ||
      record.sub_category,
  ).trim();
};

const isComboProduct = (product: BusinessProduct): boolean => {
  const record = product as ProductRecord;

  const stock = numberValue(
    record.stock_qty ?? record.stock_quantity,
  );

  const active =
    booleanValue(record.isActive ?? record.is_active) !== false;

  const inStock =
    booleanValue(record.is_in_stock) !== false &&
    !(stock !== null && stock <= 0);

  return active && inStock && customerPriceOf(product) > 0;
};

const ensureBaseProductInCart = (
  product: BusinessProduct,
  base: ComboBaseState,
) => {
  const selectedColor = base.color || '';
  const existing = readCart().find(
    (item) =>
      String(item.id) === String(product.id) &&
      (item.size || '') === (base.size || '') &&
      (item.color || '') === selectedColor,
  );

  const desiredQty = Math.max(1, Number(base.qty) || 1);

  if (existing) {
    const existingQty = Math.max(1, Number(existing.qty) || 1);

    if (desiredQty > existingQty) {
      updateCartQuantity(
        String(product.id),
        desiredQty,
        base.size || '',
        selectedColor,
      );
    }

    return;
  }

  addProduct(product, {
    size: base.size || '',
    color: selectedColor,
    qty: desiredQty,
  });
};

export default function ComboPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const action =
    searchParams.get('action') === 'buy' ? 'buy' : 'cart';

  const [baseProduct, setBaseProduct] =
    useState<BusinessProduct | null | undefined>(undefined);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [baseState, setBaseState] = useState<ComboBaseState>({
    productId: String(id || ''),
    size: '',
    color: '',
    qty: 1,
    tryAtHome: false,
    action,
  });

  useEffect(() => {
    let active = true;

    try {
      const raw = window.sessionStorage.getItem(
        `spotc-combo-base:${id}`,
      );

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ComboBaseState>;

        setBaseState({
          productId: String(id || ''),
          size: String(parsed.size || ''),
          color: String(parsed.color || ''),
          qty: Math.max(1, Number(parsed.qty) || 1),
          tryAtHome: parsed.tryAtHome === true,
          action,
        });
      }
    } catch {
      // Continue with safe defaults.
    }

    Promise.all([getProductById(String(id)), getProducts()])
      .then(([loadedBaseProduct, allProducts]) => {
        if (!active) return;

        setBaseProduct(loadedBaseProduct);

        if (!loadedBaseProduct) {
          setProducts([]);
          return;
        }

        setProducts(
          allProducts.filter(
            (item) =>
              String(item.id) !== String(loadedBaseProduct.id) &&
              isComboProduct(item),
          ),
        );
      })
      .catch(() => {
        if (!active) return;
        setBaseProduct(null);
        setProducts([]);
      });

    return () => {
      active = false;
    };
  }, [id, action]);

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(products.map(categoryOf).filter(Boolean)),
      ),
    ],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((item) => {
      const itemCategory = categoryOf(item);
      const matchesCategory =
        category === 'All' || itemCategory === category;

      if (!matchesCategory) return false;
      if (!q) return true;

      const record = item as ProductRecord;

      return [
        titleOf(item),
        itemCategory,
        text(record.sub_category),
        text(record.brand),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [products, category, search]);

  const selectedProducts = useMemo(
    () =>
      products.filter((item) =>
        selectedIds.includes(String(item.id)),
      ),
    [products, selectedIds],
  );

  const toggleProduct = (productId: string) => {
    setSelectedIds((current) => {
      if (current.includes(productId)) {
        return current.filter((idValue) => idValue !== productId);
      }

      if (current.length >= 5) return current;

      return [...current, productId];
    });
  };

  const finish = (includeCombo: boolean) => {
    if (!baseProduct) return;

    ensureBaseProductInCart(baseProduct, {
      ...baseState,
      action,
    });

    if (includeCombo) {
      selectedProducts.forEach((comboProduct) => {
        const comboPrice = comboPriceOf(comboProduct);
        if (comboPrice <= 0) return;

        const pricedProduct = {
          ...comboProduct,
          price: comboPrice,
          selling_price: comboPrice,
          sell_price: comboPrice,
          combo_price: comboPrice,
          is_combo_item: true,
          combo_parent_id: String(baseProduct.id),
          combo_original_price: customerPriceOf(comboProduct),
        } as BusinessProduct;

        addProduct(pricedProduct);
      });
    }

    try {
      window.sessionStorage.removeItem(
        `spotc-combo-base:${baseProduct.id}`,
      );
    } catch {
      // Nothing to clean up.
    }

    if (action === 'buy') {
      router.push('/checkout');
      return;
    }

    router.push('/cart');
  };

  if (baseProduct === undefined) {
    return (
      <main className="combo-page combo-loading">
        <p>Loading combo...</p>
      </main>
    );
  }

  if (!baseProduct) {
    return (
      <main className="combo-page combo-empty-page">
        <h1>Product not found</h1>
        <button type="button" onClick={() => router.push('/shop')}>
          Back to Shop
        </button>
      </main>
    );
  }

  const basePrice = customerPriceOf(baseProduct);

  return (
    <main className="combo-page">
      <div className="combo-shell">
        <header className="combo-topbar">
          <button
            type="button"
            className="combo-back"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft />
          </button>

          <div>
            <small>COMBO PRICES UNLOCKED</small>
            <h1>Choose up to 5 favourites</h1>
          </div>

          <strong className="combo-count">
            {selectedIds.length} / 5
          </strong>
        </header>

        <section className="combo-base-card">
          <img
            src={imageOf(baseProduct)}
            alt={titleOf(baseProduct)}
          />

          <div className="combo-base-copy">
            <small>YOUR DRESS</small>
            <strong>{titleOf(baseProduct)}</strong>
            <b>₹{Math.round(basePrice)}</b>

            {baseState.tryAtHome && (
              <span className="combo-try-badge">
                ✓ Try at Home
              </span>
            )}
          </div>
        </section>

        <section className="combo-intro">
          <div>
            <Gift aria-hidden="true" />
            <div>
              <strong>Combo Prices</strong>
              <p>
                Choose any 1–5 eligible items. Combo is optional.
              </p>
            </div>
          </div>
        </section>

        <div className="combo-search">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search combo products"
            aria-label="Search combo products"
          />
        </div>

        <div className="combo-categories">
          {categories.map((categoryName) => (
            <button
              type="button"
              key={categoryName}
              className={
                category === categoryName ? 'active' : ''
              }
              onClick={() => setCategory(categoryName)}
            >
              {categoryName}
            </button>
          ))}
        </div>

        <section className="combo-grid">
          {visibleProducts.length ? (
            visibleProducts.map((item) => {
              const productId = String(item.id);
              const selected = selectedIds.includes(productId);
              const comboPrice = comboPriceOf(item);
              const normalPrice = customerPriceOf(item);
              const disabled =
                selectedIds.length >= 5 && !selected;

              return (
                <button
                  type="button"
                  key={productId}
                  className={`combo-product-card${
                    selected ? ' selected' : ''
                  }`}
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => toggleProduct(productId)}
                >
                  <span className="combo-image-wrap">
                    <img
                      src={imageOf(item)}
                      alt={titleOf(item)}
                    />

                    {selected && (
                      <span className="combo-check">
                        <Check aria-hidden="true" />
                      </span>
                    )}
                  </span>

                  <span className="combo-product-copy">
                    <strong>{titleOf(item)}</strong>

                    <span className="combo-price">
                      <b>₹{Math.round(comboPrice)}</b>
                      {normalPrice > comboPrice && (
                        <del>₹{Math.round(normalPrice)}</del>
                      )}
                    </span>

                    <small>
                      {selected ? 'Selected' : 'Choose Combo'}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="combo-no-products">
              <Gift aria-hidden="true" />
              <strong>No combo products found</strong>
              <p>
                You can continue with the dress without adding a
                combo.
              </p>
            </div>
          )}
        </section>
      </div>

      <footer className="combo-footer">
        <div className="combo-footer-inner">
          <div className="combo-footer-copy">
            <strong>{selectedIds.length} of 5 selected</strong>
            <span>
              {selectedIds.length
                ? 'Selected products will use Combo Price.'
                : 'You can continue without a combo.'}
            </span>
          </div>

          <div className="combo-footer-actions">
            <button
              type="button"
              className="combo-skip"
              onClick={() => finish(false)}
            >
              Skip Combo
            </button>

            <button
              type="button"
              className="combo-continue"
              disabled={selectedIds.length === 0}
              onClick={() => finish(true)}
            >
              Continue with Combo
            </button>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .combo-page {
          min-height: 100vh;
          background: #f7f7f7;
          padding-bottom: 104px;
          color: #171717;
        }

        .combo-shell {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
          padding: 24px 0 36px;
        }

        .combo-topbar {
          display: grid;
          grid-template-columns: 44px 1fr auto;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
        }

        .combo-back {
          width: 42px;
          height: 42px;
          border: 1px solid #ddd;
          border-radius: 999px;
          background: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .combo-back :global(svg) {
          width: 20px;
          height: 20px;
        }

        .combo-topbar small {
          display: block;
          margin-bottom: 3px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: #8a6200;
        }

        .combo-topbar h1 {
          margin: 0;
          font-size: clamp(22px, 3vw, 32px);
          line-height: 1.1;
        }

        .combo-count {
          padding: 9px 13px;
          border-radius: 999px;
          background: #171717;
          color: #fff;
          white-space: nowrap;
        }

        .combo-base-card {
          display: grid;
          grid-template-columns: 94px 1fr;
          gap: 14px;
          padding: 12px;
          margin-bottom: 14px;
          border: 1px solid #e6e6e6;
          border-radius: 16px;
          background: #fff;
        }

        .combo-base-card img {
          width: 94px;
          height: 94px;
          object-fit: cover;
          border-radius: 12px;
          background: #f2f2f2;
        }

        .combo-base-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 4px;
        }

        .combo-base-copy > small {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: #777;
        }

        .combo-base-copy > strong {
          font-size: 15px;
          line-height: 1.25;
        }

        .combo-base-copy > b {
          font-size: 18px;
        }

        .combo-try-badge {
          margin-top: 2px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #eef9ef;
          font-size: 11px;
          font-weight: 800;
        }

        .combo-intro {
          padding: 14px 16px;
          margin-bottom: 14px;
          border-radius: 16px;
          background: #fff6d7;
          border: 1px solid #f1df9d;
        }

        .combo-intro > div {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .combo-intro :global(svg) {
          width: 22px;
          height: 22px;
          flex: 0 0 auto;
        }

        .combo-intro strong {
          display: block;
          margin-bottom: 2px;
        }

        .combo-intro p {
          margin: 0;
          color: #665a32;
          font-size: 13px;
        }

        .combo-search {
          min-height: 46px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          margin-bottom: 10px;
          border: 1px solid #ddd;
          border-radius: 13px;
          background: #fff;
        }

        .combo-search :global(svg) {
          width: 18px;
          height: 18px;
          color: #666;
        }

        .combo-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          font: inherit;
        }

        .combo-categories {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 0 14px;
          scrollbar-width: none;
        }

        .combo-categories::-webkit-scrollbar {
          display: none;
        }

        .combo-categories button {
          flex: 0 0 auto;
          border: 1px solid #ddd;
          border-radius: 999px;
          background: #fff;
          padding: 8px 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .combo-categories button.active {
          border-color: #171717;
          background: #171717;
          color: #fff;
        }

        .combo-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .combo-product-card {
          border: 1px solid #e4e4e4;
          border-radius: 16px;
          overflow: hidden;
          padding: 0;
          background: #fff;
          text-align: left;
          cursor: pointer;
        }

        .combo-product-card.selected {
          border: 2px solid #171717;
        }

        .combo-product-card:disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }

        .combo-image-wrap {
          display: block;
          position: relative;
          aspect-ratio: 1 / 1;
          background: #f2f2f2;
        }

        .combo-image-wrap img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .combo-check {
          position: absolute;
          top: 9px;
          right: 9px;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #171717;
          color: #fff;
        }

        .combo-check :global(svg) {
          width: 17px;
          height: 17px;
        }

        .combo-product-copy {
          display: block;
          padding: 11px;
        }

        .combo-product-copy > strong {
          display: block;
          min-height: 36px;
          font-size: 13px;
          line-height: 1.35;
        }

        .combo-price {
          display: flex;
          align-items: baseline;
          gap: 7px;
          margin-top: 6px;
        }

        .combo-price b {
          font-size: 17px;
        }

        .combo-price del {
          color: #888;
          font-size: 12px;
        }

        .combo-product-copy small {
          display: block;
          margin-top: 7px;
          font-weight: 800;
        }

        .combo-no-products {
          grid-column: 1 / -1;
          min-height: 220px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 7px;
          padding: 24px;
          text-align: center;
          border-radius: 16px;
          background: #fff;
          color: #666;
        }

        .combo-no-products p {
          margin: 0;
        }

        .combo-footer {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          border-top: 1px solid #ddd;
          background: rgba(255, 255, 255, 0.97);
        }

        .combo-footer-inner {
          width: min(1180px, calc(100% - 32px));
          min-height: 86px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .combo-footer-copy {
          display: grid;
          gap: 2px;
        }

        .combo-footer-copy span {
          color: #666;
          font-size: 12px;
        }

        .combo-footer-actions {
          display: flex;
          gap: 10px;
        }

        .combo-footer-actions button {
          min-height: 44px;
          padding: 0 18px;
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .combo-skip {
          border: 1px solid #d8d8d8;
          background: #fff;
        }

        .combo-continue {
          border: 1px solid #171717;
          background: #171717;
          color: #fff;
        }

        .combo-continue:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .combo-loading,
        .combo-empty-page {
          display: grid;
          place-items: center;
          align-content: center;
          gap: 12px;
        }

        @media (max-width: 800px) {
          .combo-shell {
            width: min(100% - 20px, 680px);
            padding-top: 12px;
          }

          .combo-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .combo-topbar {
            grid-template-columns: 40px 1fr auto;
            gap: 9px;
          }

          .combo-topbar h1 {
            font-size: 20px;
          }

          .combo-count {
            padding: 7px 10px;
            font-size: 12px;
          }

          .combo-footer-inner {
            width: 100%;
            padding: 10px;
            min-height: 0;
            align-items: stretch;
            flex-direction: column;
            gap: 8px;
          }

          .combo-footer-copy {
            display: none;
          }

          .combo-footer-actions {
            width: 100%;
          }

          .combo-footer-actions button {
            flex: 1;
            padding: 0 10px;
          }

          .combo-page {
            padding-bottom: 76px;
          }
        }
      `}</style>
    </main>
  );
}
