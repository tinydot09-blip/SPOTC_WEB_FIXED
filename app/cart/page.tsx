'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  CircleDollarSign,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  X,
} from 'lucide-react';

import {
  readCart,
  writeCart,
  type CartItem,
} from '@/lib/cart';

type CartGroup = {
  key: string;
  businessId: string;
  businessName: string;
  items: Array<{
    item: CartItem;
    index: number;
  }>;
  subtotal: number;
  quantity: number;
};

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString(
    'en-IN',
  )}`;

const groupKeyOf = (
  item: CartItem,
): string =>
  item.businessId?.trim() ||
  item.businessName?.trim().toLowerCase() ||
  'spotc-shop';

export default function CartPage() {
  const [items, setItems] =
    useState<CartItem[]>([]);

  const [rewardsSheetOpen, setRewardsSheetOpen] =
    useState(false);

  useEffect(() => {
    setItems(readCart());
  }, []);

  const updateCart = (
    nextItems: CartItem[],
  ) => {
    setItems(nextItems);
    writeCart(nextItems);
  };

  const groups = useMemo<CartGroup[]>(() => {
    const map = new Map<
      string,
      CartGroup
    >();

    items.forEach((item, index) => {
      const key = groupKeyOf(item);

      const current =
        map.get(key) ??
        ({
          key,
          businessId:
            item.businessId || '',
          businessName:
            item.businessName ||
            'SPOTC Shop',
          items: [],
          subtotal: 0,
          quantity: 0,
        } satisfies CartGroup);

      current.items.push({
        item,
        index,
      });

      current.subtotal +=
        item.price * item.qty;

      current.quantity += item.qty;

      map.set(key, current);
    });

    return [...map.values()];
  }, [items]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          item.price * item.qty,
        0,
      ),
    [items],
  );

  const shopCount = groups.length;
  const delivery =
    items.length > 0
      ? shopCount * 20
      : 0;

  const total =
    subtotal + delivery;

  const totalQuantity =
    items.reduce(
      (sum, item) =>
        sum + item.qty,
      0,
    );

  const totalRewardPoints =
    Math.max(
      1,
      Math.round(subtotal / 50),
    );

  const availableCoupons = [
    {
      code: 'SPOTC100',
      title: '₹100 OFF',
      description:
        'Use on eligible orders above ₹999.',
      condition:
        'Applied separately at checkout.',
    },
    {
      code: 'FREEDEL',
      title: 'Free Delivery',
      description:
        'Free local delivery on eligible orders.',
      condition:
        'Subject to business delivery area.',
    },
    {
      code: 'NEXT5',
      title: 'Extra 5% OFF',
      description:
        'Save 5% on your next eligible purchase.',
      condition:
        'Valid for one future order.',
    },
  ];

  const decreaseQuantity = (
    itemIndex: number,
  ) => {
    updateCart(
      items.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              qty: Math.max(
                1,
                item.qty - 1,
              ),
            }
          : item,
      ),
    );
  };

  const increaseQuantity = (
    itemIndex: number,
  ) => {
    updateCart(
      items.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              qty: item.qty + 1,
            }
          : item,
      ),
    );
  };

  const removeItem = (
    itemIndex: number,
  ) => {
    updateCart(
      items.filter(
        (_, index) =>
          index !== itemIndex,
      ),
    );
  };

  if (!items.length) {
    return (
      <main className="spotc-cart-page">
        <section className="spotc-empty-cart">
          <div>
            <ShoppingBag size={34} />
          </div>

          <h1>Your cart is empty</h1>

          <p>
            Add products from Shop or a
            nearby business.
          </p>

          <Link href="/shop">
            Continue shopping
          </Link>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="spotc-cart-page">
      <div className="spotc-cart-shell">
        <header className="spotc-cart-head">
          <div>
            <small>SPOTC CART</small>
            <h1>My Cart</h1>
          </div>

          <span>
            {shopCount} shop
            {shopCount === 1 ? '' : 's'}
            {' · '}
            {totalQuantity} product
            {totalQuantity === 1
              ? ''
              : 's'}
          </span>
        </header>

        <div className="spotc-cart-layout">
          <section className="spotc-cart-main">
            <div className="spotc-cart-summary">
              <span className="spotc-summary-icon">
                <Store size={21} />
              </span>

              <div>
                <strong>
                  {shopCount} shop
                  {shopCount === 1
                    ? ''
                    : 's'}
                  {' · '}
                  {totalQuantity} product
                  {totalQuantity === 1
                    ? ''
                    : 's'}
                </strong>

                <small>
                  Delivery calculated
                  separately for each shop
                </small>
              </div>
            </div>

            {groups.map((group) => (
              <article
                className="spotc-shop-card"
                key={group.key}
              >
                <header className="spotc-shop-head">
                  <span>
                    <Store size={20} />
                  </span>

                  <div>
                    <small>SHOP</small>
                    <h2>
                      {group.businessName}
                    </h2>
                  </div>
                </header>

                <div className="spotc-shop-products">
                  {group.items.map(
                    ({
                      item,
                      index,
                    }) => (
                      <div
                        className="spotc-cart-product"
                        key={`${item.id}-${item.size}-${item.color}-${index}`}
                      >
                        <div className="spotc-product-image">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.title}
                            />
                          ) : (
                            <ShoppingBag
                              size={27}
                            />
                          )}
                        </div>

                        <div className="spotc-product-copy">
                          <h3>
                            {item.title}
                          </h3>

                          {(item.size ||
                            item.color) && (
                            <p>
                              {[
                                item.size &&
                                  `Size: ${item.size}`,
                                item.color &&
                                  `Colour: ${item.color}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}

                          <strong>
                            {money(
                              item.price,
                            )}
                          </strong>
                        </div>

                        <div className="spotc-cart-controls">
                          <div className="spotc-qty-control">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() =>
                                decreaseQuantity(
                                  index,
                                )
                              }
                            >
                              <Minus
                                size={16}
                              />
                            </button>

                            <span>
                              {item.qty}
                            </span>

                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() =>
                                increaseQuantity(
                                  index,
                                )
                              }
                            >
                              <Plus
                                size={16}
                              />
                            </button>
                          </div>

                          <button
                            type="button"
                            className="spotc-remove-button"
                            aria-label="Remove product"
                            onClick={() =>
                              removeItem(
                                index,
                              )
                            }
                          >
                            <Trash2
                              size={17}
                            />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="spotc-shop-delivery">
                  <Truck size={19} />

                  <div>
                    <strong>
                      Delivery ₹20
                    </strong>

                    <small>
                      Today in 15–45 mins
                      where available
                    </small>
                  </div>
                </div>

                <footer className="spotc-shop-footer">
                  <span>
                    Shop subtotal
                  </span>

                  <strong>
                    {money(
                      group.subtotal,
                    )}
                  </strong>
                </footer>
              </article>
            ))}
          </section>

          <aside className="spotc-bill-card">
            <h2>Bill details</h2>

            <div className="spotc-bill-lines">
              <p>
                <span>Subtotal</span>
                <strong>
                  {money(subtotal)}
                </strong>
              </p>

              <p>
                <span>
                  Delivery ({shopCount}{' '}
                  shop
                  {shopCount === 1
                    ? ''
                    : 's'}
                  )
                </span>

                <strong>
                  {money(delivery)}
                </strong>
              </p>

              <p>
                <span>Platform fee</span>
                <strong>₹0</strong>
              </p>
            </div>

            <div className="spotc-total-row">
              <span>Total</span>
              <strong>
                {money(total)}
              </strong>
            </div>

            <button
              type="button"
              className="spotc-rewards-highlight"
              onClick={() =>
                setRewardsSheetOpen(true)
              }
              aria-label={`Earn ${totalRewardPoints} SPOTC points and view ${availableCoupons.length} available coupons`}
            >
              <span className="spotc-rewards-highlight-icon">
                <CircleDollarSign
                  aria-hidden="true"
                />
              </span>

              <span className="spotc-rewards-highlight-copy">
                <strong>
                  Earn {totalRewardPoints}{' '}
                  SPOTC points
                </strong>

                <small>
                  {availableCoupons.length}{' '}
                  coupons available · Tap to
                  view
                </small>
              </span>

              <ChevronLeft
                className="spotc-rewards-highlight-arrow"
                aria-hidden="true"
              />
            </button>

            <div className="spotc-delivery-note">
              <Truck size={19} />

              <span>
                15–45 mins nearby
                delivery where available
              </span>
            </div>

            <Link
              className="spotc-checkout-button"
              href="/address"
            >
              Continue to Address
            </Link>
          </aside>
        </div>
      </div>


      {rewardsSheetOpen && (
        <div
          className="spotc-rewards-backdrop"
          role="presentation"
          onMouseDown={() =>
            setRewardsSheetOpen(false)
          }
        >
          <section
            className="spotc-rewards-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="SPOTC rewards and available coupons"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="spotc-rewards-close"
              aria-label="Close rewards and coupons"
              onClick={() =>
                setRewardsSheetOpen(false)
              }
            >
              <X />
            </button>

            <div className="spotc-rewards-handle" />

            <div className="spotc-rewards-sheet-heading">
              <span>
                <CircleDollarSign />
              </span>

              <div>
                <small>
                  REWARDS &amp; COUPONS
                </small>

                <h2>
                  Earn {totalRewardPoints}{' '}
                  SPOTC points
                </h2>

                <p>
                  Points are estimated from
                  your current cart and do
                  not reduce the displayed
                  product discounts.
                </p>
              </div>
            </div>

            <div className="spotc-rewards-points-card">
              <strong>
                {totalRewardPoints}
              </strong>

              <span>SPOTC points</span>

              <small>
                Estimated for this cart
              </small>
            </div>

            <div className="spotc-coupon-list">
              <div className="spotc-coupon-list-title">
                <h3>
                  {availableCoupons.length}{' '}
                  available coupons
                </h3>

                <span>Use separately</span>
              </div>

              {availableCoupons.map(
                (coupon) => (
                  <article
                    className="spotc-coupon-card"
                    key={coupon.code}
                  >
                    <div className="spotc-coupon-badge">
                      {coupon.title}
                    </div>

                    <div className="spotc-coupon-copy">
                      <strong>
                        {coupon.description}
                      </strong>

                      <small>
                        {coupon.condition}
                      </small>

                      <code>
                        {coupon.code}
                      </code>
                    </div>
                  </article>
                ),
              )}
            </div>

            <p className="spotc-coupon-note">
              Coupons are not included in
              the displayed product
              discounts. Eligibility and
              final coupon application are
              confirmed at checkout.
            </p>

            <button
              type="button"
              className="spotc-rewards-done"
              onClick={() =>
                setRewardsSheetOpen(false)
              }
            >
              Done
            </button>
          </section>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  .spotc-cart-page {
    min-height: 0;
    padding: 34px 26px 20px;
    color: #201c18;
    background:
      radial-gradient(
        circle at top left,
        rgba(230, 121, 24, 0.06),
        transparent 28rem
      ),
      #f7f5f1;
  }

  .spotc-cart-shell {
    width: min(1420px, 100%);
    margin: 0 auto;
  }

  .spotc-cart-head {
    margin-bottom: 24px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }

  .spotc-cart-head small {
    color: #b56611;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }

  .spotc-cart-head h1 {
    margin: 7px 0 0;
    font-size: clamp(38px, 5vw, 56px);
    line-height: 1;
    font-weight: 650;
    letter-spacing: -0.04em;
  }

  .spotc-cart-head > span {
    color: #6e655d;
    font-size: 14px;
  }

  .spotc-cart-layout {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr)
      minmax(320px, 370px);
    gap: 24px;
    align-items: start;
  }

  .spotc-cart-main {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .spotc-cart-summary {
    min-height: 76px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 13px;
    border: 1px solid #e5ddd4;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 10px 26px
      rgba(56, 39, 24, 0.05);
  }

  .spotc-summary-icon,
  .spotc-shop-head > span {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    color: #b76510;
    background: #fff0df;
  }

  .spotc-cart-summary strong,
  .spotc-cart-summary small {
    display: block;
  }

  .spotc-cart-summary strong {
    font-size: 16px;
    font-weight: 650;
  }

  .spotc-cart-summary small {
    margin-top: 4px;
    color: #1c9a51;
    font-size: 12px;
    font-weight: 550;
  }

  .spotc-shop-card {
    padding: 22px;
    overflow: hidden;
    border: 1px solid #e4dbd2;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 12px 34px
      rgba(56, 39, 24, 0.06);
  }

  .spotc-shop-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .spotc-shop-head small {
    color: #81766c;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 0.12em;
  }

  .spotc-shop-head h2 {
    margin: 3px 0 0;
    font-size: 21px;
    font-weight: 650;
  }

  .spotc-shop-products {
    margin-top: 17px;
    display: grid;
    gap: 14px;
  }

  .spotc-cart-product {
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns:
      120px minmax(0, 1fr) 160px;
    gap: 20px;
    align-items: center;
    border: 1px solid #ebe4dc;
    border-radius: 18px;
    background: #fcfbf9;
  }

  .spotc-product-image {
    width: 120px;
    height: 120px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: #a3988e;
    background: #f1ede8;
  }

  .spotc-product-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .spotc-product-copy {
    min-width: 0;
  }

  .spotc-product-copy h3 {
    margin: 0;
    max-width: 540px;
    color: #211d19;
    font-size: 18px;
    line-height: 1.35;
    font-weight: 600;
  }

  .spotc-product-copy p {
    margin: 9px 0 0;
    color: #81766d;
    font-size: 13px;
  }

  .spotc-product-copy strong {
    display: block;
    margin-top: 12px;
    color: #c7680b;
    font-size: 19px;
    font-weight: 650;
  }

  .spotc-cart-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 11px;
  }

  .spotc-qty-control {
    height: 42px;
    display: flex;
    align-items: center;
    overflow: hidden;
    border: 1px solid #ddd5cd;
    border-radius: 13px;
    background: #ffffff;
  }

  .spotc-qty-control button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    color: #29241f;
    background: transparent;
    cursor: pointer;
  }

  .spotc-qty-control span {
    min-width: 40px;
    text-align: center;
    font-size: 14px;
    font-weight: 650;
  }

  .spotc-remove-button {
    padding: 7px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: #81776e;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
  }

  .spotc-remove-button:hover {
    color: #c73d32;
  }

  .spotc-shop-delivery {
    margin-top: 16px;
    padding: 14px 15px;
    display: flex;
    align-items: center;
    gap: 11px;
    border: 1px solid #d8eddf;
    border-radius: 15px;
    color: #177a42;
    background: #eff9f2;
  }

  .spotc-shop-delivery strong,
  .spotc-shop-delivery small {
    display: block;
  }

  .spotc-shop-delivery strong {
    font-size: 13px;
    font-weight: 650;
  }

  .spotc-shop-delivery small {
    margin-top: 3px;
    color: #4e7d60;
    font-size: 11px;
  }

  .spotc-shop-footer {
    margin-top: 17px;
    padding-top: 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid #ece5dd;
  }

  .spotc-shop-footer span {
    color: #72685f;
    font-size: 14px;
  }

  .spotc-shop-footer strong {
    color: #bd6410;
    font-size: 20px;
    font-weight: 650;
  }

  .spotc-bill-card {
    position: sticky;
    top: 92px;
    padding: 22px;
    border: 1px solid #e4dbd2;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 12px 34px
      rgba(56, 39, 24, 0.06);
  }

  .spotc-bill-card h2 {
    margin: 0 0 18px;
    font-size: 24px;
    font-weight: 650;
  }

  .spotc-bill-lines {
    display: grid;
    gap: 15px;
  }

  .spotc-bill-lines p,
  .spotc-total-row {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-bill-lines span {
    color: #655c54;
    font-size: 14px;
  }

  .spotc-bill-lines strong {
    font-size: 14px;
    font-weight: 650;
  }

  .spotc-total-row {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid #d9d1c9;
  }

  .spotc-total-row span {
    font-size: 19px;
    font-weight: 550;
  }

  .spotc-total-row strong {
    font-size: 22px;
    font-weight: 700;
  }

  .spotc-delivery-note {
    margin-top: 17px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 11px;
    border-radius: 15px;
    color: #4e473f;
    background: #f4eee3;
    font-size: 16px;
    font-weight: 550;
    line-height: 1.45;
  }

  .spotc-rewards-highlight {
    width: 100%;
    margin-top: 17px;
    padding: 16px 18px;
    display: grid;
    grid-template-columns:
      52px minmax(0, 1fr) 22px;
    gap: 14px;
    align-items: center;
    border: 1px solid #e3bd63;
    border-radius: 18px;
    color: #20180d;
    background:
      linear-gradient(
        135deg,
        #fff8dc,
        #ffedaf
      );
    text-align: left;
    cursor: pointer;
    box-shadow: 0 10px 24px
      rgba(151, 100, 15, 0.09);
  }

  .spotc-rewards-highlight-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #f1ac31;
    background: #17120d;
  }

  .spotc-rewards-highlight-icon svg {
    width: 30px;
    height: 30px;
  }

  .spotc-rewards-highlight-copy {
    min-width: 0;
  }

  .spotc-rewards-highlight-copy strong,
  .spotc-rewards-highlight-copy small {
    display: block;
  }

  .spotc-rewards-highlight-copy strong {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.3;
  }

  .spotc-rewards-highlight-copy small {
    margin-top: 5px;
    color: #71572f;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.4;
  }

  .spotc-rewards-highlight-arrow {
    width: 22px;
    transform: rotate(180deg);
    color: #765517;
  }

  .spotc-rewards-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    padding: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.68);
    backdrop-filter: blur(6px);
  }

  .spotc-rewards-sheet {
    position: relative;
    width: min(680px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    padding: 26px;
    border: 1px solid #ead39a;
    border-radius: 28px;
    color: #1c1710;
    background: #fffaf0;
    box-shadow: 0 30px 90px
      rgba(0, 0, 0, 0.42);
  }

  .spotc-rewards-close {
    position: absolute;
    top: 17px;
    right: 17px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #ffffff;
    background: #17120d;
    cursor: pointer;
  }

  .spotc-rewards-close svg {
    width: 23px;
    height: 23px;
  }

  .spotc-rewards-handle {
    width: 50px;
    height: 5px;
    margin: 0 auto 20px;
    border-radius: 99px;
    background: #5d5a55;
  }

  .spotc-rewards-sheet-heading {
    padding-right: 50px;
    display: grid;
    grid-template-columns: 62px 1fr;
    gap: 16px;
    align-items: start;
  }

  .spotc-rewards-sheet-heading > span {
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: #f0ad35;
    background: #17120d;
  }

  .spotc-rewards-sheet-heading > span svg {
    width: 36px;
    height: 36px;
  }

  .spotc-rewards-sheet-heading small {
    color: #8b641f;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .spotc-rewards-sheet-heading h2 {
    margin: 5px 0 8px;
    font-size: 30px;
    line-height: 1.15;
  }

  .spotc-rewards-sheet-heading p {
    margin: 0;
    color: #766b5d;
    font-size: 17px;
    line-height: 1.55;
  }

  .spotc-rewards-points-card {
    margin-top: 24px;
    padding: 24px;
    border-radius: 24px;
    color: #ffffff;
    background:
      linear-gradient(
        135deg,
        #17120d,
        #30230f
      );
  }

  .spotc-rewards-points-card strong,
  .spotc-rewards-points-card span,
  .spotc-rewards-points-card small {
    display: block;
  }

  .spotc-rewards-points-card strong {
    color: #f7b53d;
    font-size: 48px;
    line-height: 1;
  }

  .spotc-rewards-points-card span {
    margin-top: 10px;
    font-size: 23px;
    font-weight: 850;
  }

  .spotc-rewards-points-card small {
    margin-top: 7px;
    color: #cfc5b5;
    font-size: 16px;
  }

  .spotc-coupon-list {
    margin-top: 26px;
  }

  .spotc-coupon-list-title {
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
  }

  .spotc-coupon-list-title h3 {
    margin: 0;
    font-size: 23px;
  }

  .spotc-coupon-list-title span {
    padding: 7px 11px;
    border-radius: 999px;
    color: #805a18;
    background: #f6e9c8;
    font-size: 13px;
    font-weight: 800;
  }

  .spotc-coupon-card {
    margin-top: 14px;
    padding: 17px;
    display: grid;
    grid-template-columns: 145px 1fr;
    gap: 18px;
    align-items: center;
    border: 1px dashed #cda849;
    border-radius: 20px;
    background: #ffffff;
  }

  .spotc-coupon-badge {
    min-height: 104px;
    padding: 14px;
    display: grid;
    place-items: center;
    border-radius: 17px;
    color: #805310;
    background: #fff0bd;
    font-size: 19px;
    font-weight: 900;
    text-align: center;
  }

  .spotc-coupon-copy strong,
  .spotc-coupon-copy small,
  .spotc-coupon-copy code {
    display: block;
  }

  .spotc-coupon-copy strong {
    font-size: 18px;
    line-height: 1.4;
  }

  .spotc-coupon-copy small {
    margin-top: 7px;
    color: #7f7466;
    font-size: 15px;
    line-height: 1.45;
  }

  .spotc-coupon-copy code {
    width: fit-content;
    margin-top: 11px;
    padding: 7px 11px;
    border-radius: 9px;
    color: #f3b33c;
    background: #17120d;
    font-family: inherit;
    font-size: 14px;
    font-weight: 900;
  }

  .spotc-coupon-note {
    margin: 22px 0 0;
    padding: 17px;
    border-radius: 16px;
    color: #756b5e;
    background: #f3ead8;
    font-size: 15px;
    line-height: 1.55;
  }

  .spotc-rewards-done {
    width: 100%;
    min-height: 54px;
    margin-top: 16px;
    border: 0;
    border-radius: 15px;
    color: #ffffff;
    background: #17120d;
    font-size: 17px;
    font-weight: 850;
    cursor: pointer;
  }

  .spotc-checkout-button {
    min-height: 56px;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    color: #ffffff;
    background: #171717;
    text-decoration: none;
    font-size: 17px;
    font-weight: 800;
  }

  .spotc-checkout-button:hover {
    background: #2a2927;
  }


  :global(body:has(.spotc-cart-page) .spotc-footer) {
    margin-top: 10px !important;
  }

  .spotc-empty-cart {
    width: min(520px, calc(100% - 28px));
    margin: 90px auto 0;
    padding: 42px 28px;
    display: grid;
    justify-items: center;
    border: 1px solid #e2dad1;
    border-radius: 24px;
    background: #ffffff;
    text-align: center;
  }

  .spotc-empty-cart > div {
    width: 68px;
    height: 68px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    color: #b76510;
    background: #fff0df;
  }

  .spotc-empty-cart h1 {
    margin: 18px 0 6px;
  }

  .spotc-empty-cart p {
    margin: 0;
    color: #776d64;
  }

  .spotc-empty-cart a {
    margin-top: 18px;
    padding: 12px 18px;
    border-radius: 13px;
    color: #ffffff;
    background: #171717;
    text-decoration: none;
  }

  @media (max-width: 980px) {
    .spotc-cart-layout {
      grid-template-columns: 1fr;
    }

    .spotc-bill-card {
      position: static;
    }
  }

  @media (max-width: 700px) {
    .spotc-cart-page {
      min-height: 0;
      padding: 20px 12px 10px;
    }


    .spotc-rewards-highlight {
      grid-template-columns:
        50px minmax(0, 1fr) 20px;
      padding: 15px;
      gap: 12px;
    }

    .spotc-rewards-highlight-icon {
      width: 50px;
      height: 50px;
    }

    .spotc-rewards-highlight-copy strong {
      font-size: 18px;
    }

    .spotc-rewards-highlight-copy small {
      font-size: 14px;
    }

    .spotc-rewards-backdrop {
      padding: 0;
      align-items: flex-end;
    }

    .spotc-rewards-sheet {
      width: 100%;
      max-height: 92vh;
      padding: 24px 18px
        calc(
          118px +
          env(safe-area-inset-bottom)
        );
      border-radius: 28px 28px 0 0;
    }

    .spotc-rewards-sheet-heading {
      grid-template-columns: 58px 1fr;
      padding-right: 45px;
      gap: 14px;
    }

    .spotc-rewards-sheet-heading > span {
      width: 58px;
      height: 58px;
    }

    .spotc-rewards-sheet-heading h2 {
      font-size: 27px;
    }

    .spotc-rewards-sheet-heading p {
      font-size: 16px;
    }

    .spotc-coupon-card {
      grid-template-columns: 128px 1fr;
      gap: 14px;
      padding: 14px;
    }

    .spotc-coupon-badge {
      min-height: 100px;
      font-size: 17px;
    }

    .spotc-coupon-copy strong {
      font-size: 17px;
    }

    .spotc-coupon-copy small {
      font-size: 14px;
    }

    .spotc-cart-head {
      align-items: flex-start;
    }

    .spotc-cart-head h1 {
      font-size: 38px;
    }

    .spotc-cart-head > span {
      padding-top: 9px;
      text-align: right;
    }

    /* MOBILE: enlarge only the cart product/shop block */
    .spotc-cart-summary {
      min-height: 88px;
      padding: 18px;
    }

    .spotc-cart-summary strong {
      font-size: 19px;
      font-weight: 750;
      line-height: 1.35;
    }

    .spotc-cart-summary small {
      margin-top: 5px;
      font-size: 15px;
      line-height: 1.45;
    }

    .spotc-shop-card {
      padding: 17px;
    }

    .spotc-shop-head {
      gap: 14px;
    }

    .spotc-shop-head > span {
      width: 48px;
      height: 48px;
      flex-basis: 48px;
    }

    .spotc-shop-head small {
      font-size: 12px;
      font-weight: 750;
    }

    .spotc-shop-head h2 {
      margin-top: 4px;
      font-size: 26px;
      font-weight: 750;
    }

    .spotc-cart-product {
      grid-template-columns:
        104px minmax(0, 1fr);
      gap: 15px;
      padding: 14px;
    }

    .spotc-product-image {
      width: 104px;
      height: 104px;
    }

    .spotc-product-copy h3 {
      font-size: 18px;
      line-height: 1.38;
      font-weight: 700;
    }

    .spotc-product-copy p {
      margin-top: 9px;
      font-size: 14px;
      line-height: 1.4;
    }

    .spotc-product-copy strong {
      margin-top: 10px;
      font-size: 21px;
      font-weight: 750;
    }

    .spotc-cart-controls {
      grid-column: 1 / -1;
      flex-direction: row;
      justify-content: space-between;
      gap: 14px;
    }

    .spotc-qty-control {
      height: 50px;
      border-radius: 15px;
    }

    .spotc-qty-control button {
      width: 50px;
      height: 50px;
    }

    .spotc-qty-control span {
      min-width: 50px;
      font-size: 18px;
      font-weight: 750;
    }

    .spotc-remove-button {
      font-size: 16px;
      font-weight: 600;
    }

    .spotc-remove-button span {
      display: inline;
    }

    .spotc-shop-delivery {
      padding: 17px;
      gap: 13px;
    }

    .spotc-shop-delivery svg {
      width: 23px;
      height: 23px;
      flex: 0 0 23px;
    }

    .spotc-shop-delivery strong {
      font-size: 17px;
      font-weight: 750;
    }

    .spotc-shop-delivery small {
      margin-top: 4px;
      font-size: 14px;
      line-height: 1.45;
    }

    .spotc-shop-footer span {
      font-size: 17px;
      font-weight: 550;
    }

    .spotc-shop-footer strong {
      font-size: 25px;
      font-weight: 800;
    }
  }

  @media (max-width: 420px) {
    .spotc-cart-head {
      display: block;
    }

    .spotc-cart-head > span {
      display: block;
      padding-top: 8px;
      text-align: left;
    }

    .spotc-cart-summary {
      align-items: flex-start;
    }

  }
`;