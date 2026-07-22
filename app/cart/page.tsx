'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  Gift,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
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

  const purchasePoints =
    Math.floor(subtotal / 100) * 2;

  const nearbyBonusPoints = 15;

  const totalRewardPoints =
    purchasePoints +
    nearbyBonusPoints;

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

            <div className="spotc-reward-box">
              <Gift size={20} />

              <div>
                <strong>
                  {totalRewardPoints}{' '}
                  pending reward points
                </strong>

                <small>
                  {purchasePoints}{' '}
                  purchase points + 15
                  nearby-shop bonus points
                </small>

                <small>
                  Plus 3 nearby coupons
                  after delivery
                </small>
              </div>
            </div>

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

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  .spotc-cart-page {
    min-height: 100vh;
    padding: 34px 26px 90px;
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

  .spotc-reward-box,
  .spotc-delivery-note {
    margin-top: 17px;
    padding: 14px;
    display: flex;
    align-items: flex-start;
    gap: 11px;
    border-radius: 15px;
    background: #f4eee3;
  }

  .spotc-reward-box strong,
  .spotc-reward-box small {
    display: block;
  }

  .spotc-reward-box strong {
    font-size: 13px;
    font-weight: 650;
  }

  .spotc-reward-box small {
    margin-top: 4px;
    color: #81766d;
    font-size: 10px;
    line-height: 1.4;
  }

  .spotc-delivery-note {
    align-items: center;
    color: #4e473f;
    font-size: 13px;
    line-height: 1.4;
  }

  .spotc-checkout-button {
    min-height: 50px;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    color: #ffffff;
    background: #171717;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
  }

  .spotc-checkout-button:hover {
    background: #2a2927;
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
      padding: 20px 12px 90px;
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

    .spotc-shop-card {
      padding: 15px;
    }

    .spotc-cart-product {
      grid-template-columns:
        92px minmax(0, 1fr);
      gap: 13px;
      padding: 12px;
    }

    .spotc-product-image {
      width: 92px;
      height: 92px;
    }

    .spotc-product-copy h3 {
      font-size: 14px;
    }

    .spotc-product-copy p {
      font-size: 11px;
    }

    .spotc-product-copy strong {
      margin-top: 8px;
      font-size: 16px;
    }

    .spotc-cart-controls {
      grid-column: 1 / -1;
      flex-direction: row;
      justify-content: space-between;
    }

    .spotc-remove-button span {
      display: inline;
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

    .spotc-shop-footer strong {
      font-size: 18px;
    }
  }
`;