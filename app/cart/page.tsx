'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  Clock3,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';

import {
  readCart,
  writeCart,
  type CartItem,
} from '@/lib/cart';

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString(
    'en-IN',
  )}`;


type DeliveryOptionId =
  | 'instant'
  | 'morning'
  | 'afternoon'
  | 'overnight';

type DeliveryOption = {
  id: DeliveryOptionId;
  title: string;
  orderWindow: string;
  deliveryWindow: string;
  fee: number;
};

const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: 'instant',
    title: 'Instant Delivery',
    orderWindow: 'Order now',
    deliveryWindow: 'Delivery in about 15 mins',
    fee: 20,
  },
  {
    id: 'morning',
    title: 'Morning Slot',
    orderWindow: 'Order between 6 AM – 12 PM',
    deliveryWindow: 'Delivery between 12 PM – 2 PM',
    fee: 0,
  },
  {
    id: 'afternoon',
    title: 'Afternoon Slot',
    orderWindow: 'Order between 12 PM – 6 PM',
    deliveryWindow: 'Delivery between 6 PM – 7 PM',
    fee: 0,
  },
  {
    id: 'overnight',
    title: 'Night Slot',
    orderWindow: 'Order between 6 PM – 6 AM',
    deliveryWindow: 'Delivery between 6 AM – 8 AM',
    fee: 0,
  },
];


type SavedFreeGift = {
  id: string;
  title: string;
  image: string;
  original_price: number;
  price: number;
  is_free_gift: boolean;
};

type SavedGiftBundle = {
  product_id: string;
  quantity: number;
  entitlement: number;
  gifts: SavedFreeGift[];
};

const readSavedGifts = (
  productId: string,
): SavedGiftBundle | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(
      `spotc-free-gifts:${productId}`,
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (!parsed || !Array.isArray(parsed.gifts)) {
      return null;
    }

    return {
      product_id: String(parsed.product_id || productId),
      quantity: Number(parsed.quantity) || 1,
      entitlement: Number(parsed.entitlement) || parsed.gifts.length,
      gifts: parsed.gifts
        .filter(
          (gift): gift is SavedFreeGift =>
            Boolean(
              gift &&
                typeof gift === 'object' &&
                'id' in gift,
            ),
        )
        .map((gift) => ({
          id: String(gift.id),
          title: String(gift.title || 'FREE Gift'),
          image: String(gift.image || ''),
          original_price:
            Number(gift.original_price) || 0,
          price: 0,
          is_free_gift: true,
        })),
    };
  } catch {
    return null;
  }
};

export default function CartPage() {
  const [items, setItems] =
    useState<CartItem[]>([]);

  const [giftBundles, setGiftBundles] =
    useState<Record<string, SavedGiftBundle>>({});
  const [selectedDeliveryId, setSelectedDeliveryId] =
    useState<DeliveryOptionId>('instant');

  useEffect(() => {
    const cartItems = readCart();

    setItems(cartItems);

    const nextGiftBundles: Record<
      string,
      SavedGiftBundle
    > = {};

    cartItems.forEach((item) => {
      const bundle = readSavedGifts(item.id);

      if (bundle && bundle.gifts.length > 0) {
        nextGiftBundles[item.id] = bundle;
      }
    });

    setGiftBundles(nextGiftBundles);

    const savedDeliveryId = window.localStorage.getItem(
      'spotc-delivery-option',
    ) as DeliveryOptionId | null;

    if (
      savedDeliveryId &&
      DELIVERY_OPTIONS.some(
        (option) => option.id === savedDeliveryId,
      )
    ) {
      setSelectedDeliveryId(savedDeliveryId);
    }
  }, []);

  const updateCart = (
    nextItems: CartItem[],
  ) => {
    setItems(nextItems);
    writeCart(nextItems);
  };

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

  const selectedDelivery =
    DELIVERY_OPTIONS.find(
      (option) => option.id === selectedDeliveryId,
    ) ?? DELIVERY_OPTIONS[0];

  const delivery =
    items.length > 0 ? selectedDelivery.fee : 0;

  const total =
    subtotal + delivery;

  const selectDelivery = (
    optionId: DeliveryOptionId,
  ) => {
    setSelectedDeliveryId(optionId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-delivery-option',
        optionId,
      );
    }
  };

  const totalQuantity =
    items.reduce(
      (sum, item) =>
        sum + item.qty,
      0,
    );

  const totalFreeGifts = Object.values(
    giftBundles,
  ).reduce(
    (sum, bundle) =>
      sum + bundle.gifts.length,
    0,
  );

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
    const itemToRemove = items[itemIndex];

    const nextItems = items.filter(
      (_, index) =>
        index !== itemIndex,
    );

    updateCart(nextItems);

    if (
      itemToRemove &&
      !nextItems.some(
        (item) =>
          item.id === itemToRemove.id,
      )
    ) {
      window.localStorage.removeItem(
        `spotc-free-gifts:${itemToRemove.id}`,
      );

      setGiftBundles((current) => {
        const next = { ...current };
        delete next[itemToRemove.id];
        return next;
      });
    }
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
            Add products from the SPOTC Shop.
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
            {totalQuantity} product
            {totalQuantity === 1 ? '' : 's'}
          </span>
        </header>

        <div className="spotc-cart-layout">
          <section className="spotc-cart-main">
            <div className="spotc-cart-summary">
              <span className="spotc-summary-icon">
                <ShoppingBag size={21} />
              </span>

              <div>
                <strong>
                  {totalQuantity} product
                  {totalQuantity === 1 ? '' : 's'} in your cart
                </strong>

                <small>
                  All products are sold directly by SPOTC
                  {totalFreeGifts > 0
                    ? ` · ${totalFreeGifts} FREE gift${totalFreeGifts === 1 ? '' : 's'} included`
                    : ''}
                </small>
              </div>
            </div>

            <article className="spotc-products-card">
              <div className="spotc-products-card-head">
                <div>
                  <small>SPOTC PRODUCTS</small>
                  <h2>Your Items</h2>
                </div>

                <span>
                  {totalQuantity} item
                  {totalQuantity === 1 ? '' : 's'}
                  {totalFreeGifts > 0
                    ? ` + ${totalFreeGifts} FREE`
                    : ''}
                </span>
              </div>

              <div className="spotc-products-list">
                {items.map((item, index) => {
                  const freeGifts =
                    giftBundles[item.id]?.gifts || [];

                  return (
                    <div
                      className="spotc-product-with-gifts"
                      key={`${item.id}-${item.size}-${item.color}-${index}`}
                    >
                      <div className="spotc-cart-product">
                        <div className="spotc-product-image">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.title}
                            />
                          ) : (
                            <ShoppingBag size={27} />
                          )}
                        </div>

                        <div className="spotc-product-copy">
                          <h3>{item.title}</h3>

                          {(item.size || item.color) && (
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
                            {money(item.price)}
                          </strong>
                        </div>

                        <div className="spotc-cart-controls">
                          <div className="spotc-qty-control">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() =>
                                decreaseQuantity(index)
                              }
                            >
                              <Minus size={16} />
                            </button>

                            <span>{item.qty}</span>

                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() =>
                                increaseQuantity(index)
                              }
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <button
                            type="button"
                            className="spotc-remove-button"
                            aria-label="Remove product"
                            onClick={() =>
                              removeItem(index)
                            }
                          >
                            <Trash2 size={17} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {freeGifts.length > 0 && (
                        <div className="spotc-free-gifts">
                          <div className="spotc-free-gifts-title">
                            <span>🎁</span>
                            <strong>
                              FREE Gift
                              {freeGifts.length === 1 ? '' : 's'} Included
                            </strong>
                          </div>

                          <div className="spotc-free-gifts-list">
                            {freeGifts.map((gift) => (
                              <div
                                className="spotc-free-gift"
                                key={`${item.id}-${gift.id}`}
                              >
                                <div className="spotc-free-gift-image">
                                  {gift.image ? (
                                    <img
                                      src={gift.image}
                                      alt={gift.title}
                                    />
                                  ) : (
                                    <ShoppingBag size={22} />
                                  )}
                                </div>

                                <div className="spotc-free-gift-copy">
                                  <h4>{gift.title}</h4>

                                  <div className="spotc-free-gift-price">
                                    <strong>FREE</strong>

                                    {gift.original_price > 0 && (
                                      <span>
                                        {money(gift.original_price)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                           ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <section className="spotc-delivery-section">
                <div className="spotc-delivery-section-head">
                  <div>
                    <small>DELIVERY OPTION</small>
                    <h3>Choose delivery time</h3>
                  </div>

                  <strong>{money(delivery)}</strong>
                </div>

                <div className="spotc-delivery-options">
                  {DELIVERY_OPTIONS.map((option) => {
                    const selected =
                      option.id === selectedDeliveryId;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`spotc-delivery-option ${
                          selected ? 'active' : ''
                        }`}
                        onClick={() =>
                          selectDelivery(option.id)
                        }
                      >
                        <span className="spotc-delivery-option-icon">
                          {option.id === 'instant' ? (
                            <Truck size={20} />
                          ) : (
                            <Clock3 size={20} />
                          )}
                        </span>

                        <span className="spotc-delivery-option-copy">
                          <span className="spotc-delivery-option-title-row">
                            <strong>{option.title}</strong>
                            <b className={`spotc-delivery-fee ${
                              option.fee === 0 ? 'free' : ''
                            }`}>
                              {option.fee === 0
                                ? 'FREE'
                                : money(option.fee)}
                            </b>
                          </span>
                          <small>{option.orderWindow}</small>
                          <em>{option.deliveryWindow}</em>
                        </span>

                        <span
                          className="spotc-delivery-radio"
                          aria-hidden="true"
                        >
                          {selected ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <footer className="spotc-order-footer">
                <span>Products subtotal</span>

                <strong>{money(subtotal)}</strong>
              </footer>
            </article>
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
                <span>Delivery</span>

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

            <div className="spotc-delivery-note">
              <Truck size={19} />

              <span>
                <strong>{selectedDelivery.title}</strong>
                <small>{selectedDelivery.deliveryWindow}</small>
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

  .spotc-summary-icon {
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

  .spotc-products-card {
    padding: 22px;
    overflow: hidden;
    border: 1px solid #e4dbd2;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 12px 34px rgba(56, 39, 24, 0.06);
  }

  .spotc-products-card-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-products-card-head small {
    color: #b56611;
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .spotc-products-card-head h2 {
    margin: 4px 0 0;
    font-size: 22px;
    font-weight: 650;
  }

  .spotc-products-card-head > span {
    color: #776d64;
    font-size: 13px;
  }

  .spotc-products-list {
    margin-top: 17px;
    display: grid;
    gap: 14px;
  }

  .spotc-product-with-gifts {
    display: grid;
    gap: 9px;
  }

  .spotc-free-gifts {
    margin-left: 24px;
    padding: 13px 14px;
    border: 1px solid #cfe8d6;
    border-radius: 16px;
    background: #f1faf4;
  }

  .spotc-free-gifts-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
    color: #137333;
  }

  .spotc-free-gifts-title strong {
    font-size: 12px;
    font-weight: 750;
  }

  .spotc-free-gifts-list {
    display: grid;
    gap: 8px;
  }

  .spotc-free-gift {
    min-width: 0;
    padding: 9px;
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 11px;
    align-items: center;
    border: 1px solid #dcecdf;
    border-radius: 12px;
    background: #ffffff;
  }

  .spotc-free-gift-image {
    width: 58px;
    height: 58px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #7f9685;
    background: #f6faf7;
  }

  .spotc-free-gift-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .spotc-free-gift-copy {
    min-width: 0;
  }

  .spotc-free-gift-copy h4 {
    margin: 0;
    color: #24201c;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .spotc-free-gift-price {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spotc-free-gift-price strong {
    color: #137333;
    font-size: 14px;
    font-weight: 800;
  }

  .spotc-free-gift-price span {
    color: #8b948d;
    font-size: 11px;
    text-decoration: line-through;
  }

  .spotc-delivery-section {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid #d8eddf;
    border-radius: 17px;
    background: #f5fbf7;
  }

  .spotc-delivery-section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 13px;
  }

  .spotc-delivery-section-head small {
    color: #1a7a44;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .spotc-delivery-section-head h3 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 700;
  }

  .spotc-delivery-section-head > strong {
    color: #16783f;
    font-size: 17px;
    font-weight: 800;
  }

  .spotc-delivery-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .spotc-delivery-option {
    width: 100%;
    min-width: 0;
    padding: 13px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 24px;
    gap: 10px;
    align-items: center;
    border: 1px solid #dfe8e2;
    border-radius: 14px;
    color: #29241f;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
  }

  .spotc-delivery-option.active {
    border-color: #1a9a53;
    background: #edf9f1;
  }

  .spotc-delivery-option-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: #177a42;
    background: #e9f6ed;
  }

  .spotc-delivery-option-copy {
    min-width: 0;
  }

  .spotc-delivery-option-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .spotc-delivery-fee {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 7px;
    color: #8a4b00;
    background: #fff0d5;
    font-size: 11px;
    font-weight: 850;
    line-height: 1.2;
  }

  .spotc-delivery-fee.free {
    color: #08783d;
    background: #e5f7ec;
  }

  .spotc-delivery-option-copy strong,
  .spotc-delivery-option-copy small,
  .spotc-delivery-option-copy em {
    display: block;
  }

  .spotc-delivery-option-copy strong {
    font-size: 13px;
    font-weight: 750;
  }

  .spotc-delivery-option-copy small {
    margin-top: 3px;
    color: #6c746f;
    font-size: 11px;
    line-height: 1.35;
  }

  .spotc-delivery-option-copy em {
    margin-top: 4px;
    color: #177a42;
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
    line-height: 1.35;
  }

  .spotc-delivery-radio {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    justify-self: end;
    border: 1px solid #bfd4c6;
    border-radius: 50%;
    color: #ffffff;
    background: #ffffff;
    font-size: 12px;
    font-weight: 900;
  }

  .spotc-delivery-option.active .spotc-delivery-radio {
    border-color: #1a9a53;
    background: #1a9a53;
  }

  .spotc-order-footer {
    margin-top: 17px;
    padding-top: 17px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid #ece5dd;
  }

  .spotc-order-footer span {
    color: #72685f;
    font-size: 14px;
  }

  .spotc-order-footer strong {
    color: #bd6410;
    font-size: 20px;
    font-weight: 650;
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
    line-height: 1.45;
  }

  .spotc-delivery-note > span {
    min-width: 0;
  }

  .spotc-delivery-note strong,
  .spotc-delivery-note small {
    display: block;
  }

  .spotc-delivery-note strong {
    font-size: 14px;
    font-weight: 750;
  }

  .spotc-delivery-note small {
    margin-top: 2px;
    color: #756c63;
    font-size: 12px;
    font-weight: 550;
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

    .spotc-products-card {
      padding: 17px;
    }

    .spotc-delivery-options {
      grid-template-columns: 1fr;
    }

    .spotc-delivery-section {
      padding: 13px;
    }

    .spotc-products-card-head h2 {
      font-size: 24px;
    }

    .spotc-products-card-head > span {
      font-size: 13px;
    }

    .spotc-free-gifts {
      margin-left: 0;
      padding: 12px;
    }

    .spotc-free-gifts-title strong {
      font-size: 13px;
    }

    .spotc-free-gift {
      grid-template-columns: 62px minmax(0, 1fr);
      padding: 10px;
    }

    .spotc-free-gift-image {
      width: 62px;
      height: 62px;
    }

    .spotc-free-gift-copy h4 {
      font-size: 14px;
    }

    .spotc-free-gift-price strong {
      font-size: 15px;
    }

    .spotc-order-delivery {
      padding: 17px;
      gap: 13px;
    }

    .spotc-order-delivery svg {
      width: 23px;
      height: 23px;
      flex: 0 0 23px;
    }

    .spotc-order-delivery strong {
      font-size: 17px;
      font-weight: 750;
    }

    .spotc-order-delivery small {
      margin-top: 4px;
      font-size: 14px;
      line-height: 1.45;
    }

    .spotc-order-footer span {
      font-size: 17px;
      font-weight: 550;
    }

    .spotc-order-footer strong {
      font-size: 25px;
      font-weight: 800;
    }

    
    /* =========================================================
       MOBILE CART PRODUCT ALIGNMENT
       Image + product info on row 1.
       Quantity + Remove on row 2.
    ========================================================= */

    .spotc-cart-product {
      width: 100%;
      min-width: 0;
      padding: 12px;
      grid-template-columns: 88px minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 12px;
      row-gap: 12px;
      align-items: start;
    }

    .spotc-product-image {
      width: 88px;
      height: 88px;
      grid-column: 1;
      grid-row: 1;
      align-self: start;
      border-radius: 13px;
    }

    .spotc-product-copy {
      width: 100%;
      min-width: 0;
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    .spotc-product-copy h3 {
      width: 100%;
      max-width: none;
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
      word-break: normal;
      overflow-wrap: break-word;
    }

    .spotc-product-copy p {
      margin: 6px 0 0;
      font-size: 12px;
      line-height: 1.35;
    }

    .spotc-product-copy strong {
      margin-top: 8px;
      font-size: 18px;
      line-height: 1.2;
    }

    .spotc-cart-controls {
      width: 100%;
      min-width: 0;
      grid-column: 1 / -1;
      grid-row: 2;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .spotc-qty-control {
      height: 40px;
      flex: 0 0 auto;
      border-radius: 12px;
    }

    .spotc-qty-control button {
      width: 40px;
      height: 40px;
    }

    .spotc-qty-control span {
      min-width: 36px;
      font-size: 14px;
    }

    .spotc-remove-button {
      min-height: 40px;
      margin: 0;
      padding: 8px 6px;
      flex: 0 0 auto;
      justify-content: center;
      font-size: 12px;
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

    .spotc-products-card {
      padding: 12px;
    }

    .spotc-cart-product {
      padding: 11px;
      grid-template-columns: 80px minmax(0, 1fr);
      column-gap: 10px;
      row-gap: 10px;
    }

    .spotc-product-image {
      width: 80px;
      height: 80px;
      border-radius: 12px;
    }

    .spotc-product-copy h3 {
      font-size: 14px;
      line-height: 1.32;
    }

    .spotc-product-copy p {
      font-size: 11px;
    }

    .spotc-product-copy strong {
      font-size: 17px;
    }

    .spotc-cart-controls {
      gap: 8px;
    }

    .spotc-qty-control {
      height: 38px;
    }

    .spotc-qty-control button {
      width: 38px;
      height: 38px;
    }

    .spotc-qty-control span {
      min-width: 32px;
    }

    .spotc-remove-button {
      min-height: 38px;
    }

  }
`;