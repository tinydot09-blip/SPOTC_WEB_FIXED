'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Gift,
  Loader2,
  MapPin,
  Package,
  Truck,
} from 'lucide-react';
import type { User } from 'firebase/auth';

import {
  clearCart,
  readCart,
  saveOrder,
  type CartItem,
} from '@/lib/cart';
import {
  formatAddress,
  loadUserAddresses,
  selectedAddressFrom,
  type SavedAddress,
} from '@/lib/addresses';
import { requireGoogleLogin } from '@/lib/auth';
import { db, firebaseReady } from '@/lib/firebase';
import PageLoader from '@/components/PageLoader';
import { groupCartByBusiness } from '@/lib/delivery';
import { distanceKm, SPOTC_DELIVERY_CENTER } from '@/lib/delivery-radius';
import {
  createBusinessOrder,
  type CreatedOrder,
} from '@/lib/orders';

const money = (value: number) =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;


type AddressDeliveryStatus =
  | 'available'
  | 'outside'
  | 'location_missing';

const addressCoordinate = (
  address: SavedAddress,
  keys: string[],
): number | null => {
  const raw = address as SavedAddress & Record<string, unknown>;

  for (const key of keys) {
    const value = Number(raw[key]);

    if (Number.isFinite(value) && value !== 0) {
      return value;
    }
  }

  return null;
};

const getAddressDeliveryCheck = (address: SavedAddress | null) => {
  if (!address) {
    return {
      status: 'location_missing' as AddressDeliveryStatus,
      distanceKm: null as number | null,
    };
  }

  const latitude = addressCoordinate(address, [
    'latitude',
    'lat',
    'delivery_lat',
  ]);

  const longitude = addressCoordinate(address, [
    'longitude',
    'lng',
    'lon',
    'delivery_lng',
  ]);

  if (latitude == null || longitude == null) {
    return {
      status: 'location_missing' as AddressDeliveryStatus,
      distanceKm: null as number | null,
    };
  }

  const calculatedDistance = distanceKm(
    { latitude, longitude },
    {
      latitude: SPOTC_DELIVERY_CENTER.latitude,
      longitude: SPOTC_DELIVERY_CENTER.longitude,
    },
  );

  return {
    status:
      calculatedDistance <= SPOTC_DELIVERY_CENTER.radiusKm
        ? ('available' as AddressDeliveryStatus)
        : ('outside' as AddressDeliveryStatus),
    distanceKm: calculatedDistance,
  };
};

type DeliveryOptionId =
  | 'instant'
  | 'morning'
  | 'afternoon'
  | 'overnight';

type DeliveryOption = {
  id: DeliveryOptionId;
  title: string;
  deliveryWindow: string;
  fee: number;
};

const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: 'instant',
    title: 'Instant Delivery',
    deliveryWindow: 'Delivery in about 15 mins',
    fee: 20,
  },
  {
    id: 'morning',
    title: 'Morning Slot',
    deliveryWindow: 'Delivery between 12 PM – 2 PM',
    fee: 0,
  },
  {
    id: 'afternoon',
    title: 'Afternoon Slot',
    deliveryWindow: 'Delivery between 6 PM – 7 PM',
    fee: 0,
  },
  {
    id: 'overnight',
    title: 'Night Slot',
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
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `spotc-free-gifts:${productId}`,
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (!parsed || !Array.isArray(parsed.gifts)) {
      return null;
    }

    return {
      product_id: String(parsed.product_id || productId),
      quantity: Number(parsed.quantity) || 1,
      entitlement:
        Number(parsed.entitlement) || parsed.gifts.length,
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

const ga4ItemFromCart = (item: CartItem) => ({
  item_id: String(item.id),
  item_name: String(item.title || 'SPOTC Product'),
  item_variant:
    [
      item.size ? `Size ${item.size}` : '',
      item.color ? `Colour ${item.color}` : '',
    ]
      .filter(Boolean)
      .join(' / ') || undefined,
  price: Number(item.price) || 0,
  quantity: Math.max(1, Number(item.qty) || 1),
});

export default function CheckoutPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [giftBundles, setGiftBundles] =
    useState<Record<string, SavedGiftBundle>>({});
  const [selectedDeliveryId, setSelectedDeliveryId] =
    useState<DeliveryOptionId>('instant');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const checkoutTrackedRef = useRef('');

  const groups = useMemo(
    () => groupCartByBusiness(items),
    [items],
  );

  useEffect(() => {
    let active = true;

    const prepareCheckout = async () => {
      const cart = readCart();

      if (!cart.length) {
        router.replace('/cart');
        return;
      }

      setItems(cart);

      const nextGiftBundles: Record<
        string,
        SavedGiftBundle
      > = {};

      cart.forEach((item) => {
        const bundle = readSavedGifts(item.id);

        if (bundle && bundle.gifts.length > 0) {
          nextGiftBundles[item.id] = bundle;
        }
      });

      setGiftBundles(nextGiftBundles);

      const savedDeliveryId =
        window.localStorage.getItem(
          'spotc-delivery-option',
        ) as DeliveryOptionId | null;

      if (
        savedDeliveryId &&
        DELIVERY_OPTIONS.some(
          (option) =>
            option.id === savedDeliveryId,
        )
      ) {
        setSelectedDeliveryId(savedDeliveryId);
      }

      if (!firebaseReady || !db) {
        setLoading(false);
        return;
      }

      const firestore = db;

      const currentUser = await requireGoogleLogin();

      if (!currentUser || !active) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const addressList = await loadUserAddresses(
        firestore,
        currentUser,
      );

      const selectedAddress = selectedAddressFrom(addressList);

      if (!selectedAddress) {
        router.replace('/address');
        return;
      }

      setAddress(selectedAddress);

      if (active) {
        setLoading(false);
      }
    };

    void prepareCheckout();

    return () => {
      active = false;
    };
  }, [router]);

  const subtotal = groups.reduce(
    (sum, group) => sum + group.subtotal,
    0,
  );

  const selectedDelivery =
    DELIVERY_OPTIONS.find(
      (option) =>
        option.id === selectedDeliveryId,
    ) ?? DELIVERY_OPTIONS[0];

  const delivery =
    items.length > 0
      ? selectedDelivery.fee
      : 0;

  const total = subtotal + delivery;

  const addressDeliveryCheck = useMemo(
    () => getAddressDeliveryCheck(address),
    [address],
  );

  const canDeliverToAddress =
    addressDeliveryCheck.status === 'available';

  const selectedFreeGifts = Object.values(
    giftBundles,
  ).flatMap((bundle) => bundle.gifts);

  const totalFreeGifts =
    selectedFreeGifts.length;

  useEffect(() => {
    if (loading || !items.length || !address) return;

    const signature = [
      ...items.map(
        (item) =>
          `${item.id}:${item.qty}:${item.price}:${item.size}:${item.color}`,
      ),
      selectedDelivery.id,
    ].join('|');

    if (checkoutTrackedRef.current === signature) return;

    sendGa4Event('add_shipping_info', {
      currency: 'INR',
      value: total,
      shipping_tier: selectedDelivery.title,
      items: items.map(ga4ItemFromCart),
    });

    sendGa4Event('add_payment_info', {
      currency: 'INR',
      value: total,
      payment_type: 'Cash on Delivery',
      items: items.map(ga4ItemFromCart),
    });

    checkoutTrackedRef.current = signature;
  }, [
    address,
    items,
    loading,
    selectedDelivery.id,
    selectedDelivery.title,
    total,
  ]);

  const place = async () => {
    if (
      placing ||
      !db ||
      !user ||
      !address ||
      !groups.length
    ) {
      return;
    }

    if (!canDeliverToAddress) {
      if (addressDeliveryCheck.status === 'outside') {
        window.alert(
          'Delivery is not available at this address yet. SPOTC currently delivers within 5 km of our Karamadai dispatch point.',
        );
      } else {
        window.alert(
          'Please verify this delivery address location before placing the order.',
        );
      }

      return;
    }

    const firestore = db;
    const currentUser = user;
    const selectedAddress = address;

    setPlacing(true);

    try {
      const created: CreatedOrder[] = [];

      for (const [groupIndex, group] of groups.entries()) {
        const order = await createBusinessOrder({
          db: firestore,
          user: currentUser,
          group: {
            ...group,
            // Own SPOTC products may not have a business id/ref.
            // createBusinessOrder needs a non-empty business id to build
            // the Firestore business reference.
            businessId: group.businessId || 'SPOTC',
            businessName: group.businessName || 'SPOTC Shop',
            delivery:
              groupIndex === 0
                ? delivery
                : 0,
          },
          address: selectedAddress,
          discount: 0,
          rewards: {
            purchasePoints: 0,
            nearbyBonusPoints: 0,
            totalPoints: 0,
            couponCount: 0,
            couponValueEach: 0,
            couponTotalValue: 0,
            status: 'pending_delivery',
          },
        });

        created.push(order);

        saveOrder({
          id: order.orderNumber,
          order_document_id: order.documentId,
          order_number: order.orderNumber,
          business_name: order.businessName,
          total: order.total,
          created_at: new Date().toISOString(),
        });
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'spotc-ga4-checkout-snapshot',
          JSON.stringify({
            currency: 'INR',
            value: total,
            items: items.map(ga4ItemFromCart),
            created_order_ids: created.map((order) => order.documentId),
          }),
        );
      }

      clearCart();

      router.push(
        `/order-success?ids=${encodeURIComponent(
          created.map((order) => order.documentId).join(','),
        )}`,
      );
    } catch (error) {
      console.error('SPOTC order placement failed:', error);

      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to place your order. Please try again.';

      alert(`Unable to place your order.\n\n${message}`);
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!address || !user || !db) {
    return (
      <main className="checkout-state">
        <MapPin />
        <h1>Delivery address required</h1>

        <button onClick={() => router.push('/address')}>
          Select Address
        </button>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-shell">
        <header className="checkout-head">
          <div>
            <small>CHECKOUT</small>
            <h1>Order Summary</h1>
          </div>

          <span>Cash on Delivery</span>
        </header>

        <section className="selected-address">
          <MapPin />

          <div>
            <strong>Deliver to {address.addressType}</strong>
            <p>{formatAddress(address)}</p>
            <small>{address.phone}</small>
          </div>

          <button onClick={() => router.push('/address')}>
            Change
          </button>
        </section>

        {addressDeliveryCheck.status !== 'available' && (
          <section
            className={`address-delivery-warning ${
              addressDeliveryCheck.status === 'outside'
                ? 'is-outside'
                : 'is-missing'
            }`}
            role="alert"
          >
            <MapPin />

            <div>
              <strong>
                {addressDeliveryCheck.status === 'outside'
                  ? 'Delivery not available at this address yet'
                  : 'Verify delivery location'}
              </strong>

              <p>
                {addressDeliveryCheck.status === 'outside'
                  ? `This address is ${
                      addressDeliveryCheck.distanceKm?.toFixed(1) ?? ''
                    } km from our current SPOTC delivery point. We currently deliver within ${SPOTC_DELIVERY_CENTER.radiusKm} km.`
                  : 'This saved address does not have a verified map location. Select or update the address location before ordering.'}
              </p>

              <small>
                SPOTC is coming to your area shortly. You can continue browsing all products.
              </small>
            </div>

            <button
              type="button"
              onClick={() => router.push('/address')}
            >
              {addressDeliveryCheck.status === 'outside'
                ? 'Change address'
                : 'Verify address'}
            </button>
          </section>
        )}

        <div className="checkout-grid">
          <section className="checkout-main">
            {groups.map((group, groupIndex) => (
              <article className="checkout-shop" key={group.key}>
                <header>
                  <div>
                    <small>SHOP</small>
                    <h2>{group.businessName}</h2>
                  </div>

                  <span>{group.totalQuantity} items</span>
                </header>

                {group.items.map((item, index) => (
                  <div
                    className="checkout-item"
                    key={`${item.id}-${index}`}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.title} />
                    ) : (
                      <span>
                        <Package />
                      </span>
                    )}

                    <div>
                      <strong>{item.title}</strong>

                      <small>
                        Qty {item.qty}
                        {item.size
                          ? ` · Size ${item.size}`
                          : ''}
                      </small>
                    </div>

                    <b>{money(item.price * item.qty)}</b>
                  </div>
                ))}

                <div className="shop-bill">
                  <p>
                    <span>Subtotal</span>
                    <strong>{money(group.subtotal)}</strong>
                  </p>

                  <p>
                    <span>Delivery</span>
                    <strong>
                      {money(
                        groupIndex === 0
                          ? delivery
                          : 0,
                      )}
                    </strong>
                  </p>

                  <p className="shop-total">
                    <span>Shop total</span>
                    <strong>
                      {money(
                        group.subtotal +
                          (groupIndex === 0
                            ? delivery
                            : 0),
                      )}
                    </strong>
                  </p>
                </div>
              </article>
            ))}

            {totalFreeGifts > 0 && (
              <section className="free-gift-card">
                <div className="free-gift-card-head">
                  <Gift />

                  <div>
                    <strong>
                      {totalFreeGifts} FREE Gift
                      {totalFreeGifts === 1 ? '' : 's'} Included
                    </strong>

                    <small>
                      Your selected gifts are included at no extra cost
                    </small>
                  </div>


                </div>

                <div className="free-gift-checkout-list">
                  {selectedFreeGifts.map((gift) => (
                    <article
                      key={gift.id}
                      className="free-gift-checkout-item"
                    >
                      <div className="free-gift-checkout-image">
                        {gift.image ? (
                          <img
                            src={gift.image}
                            alt={gift.title}
                          />
                        ) : (
                          <Gift />
                        )}
                      </div>

                      <div>
                        <strong>{gift.title}</strong>
                        <span>FREE</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}


            <section className="payment-card">
              <Banknote />

              <div>
                <strong>Cash on Delivery</strong>
                <small>
                  Pay the shop when your order arrives
                </small>
              </div>
            </section>

          </section>

          <aside className="final-bill">
            <h2>Bill Details</h2>

            <p>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </p>

            <p>
              <span>Delivery</span>
              <strong>{money(delivery)}</strong>
            </p>

            <p>
              <span>Platform Fee</span>
              <strong>₹0</strong>
            </p>


            <p className="final-total">
              <span>Total Payable</span>
              <strong>{money(total)}</strong>
            </p>

            <div className="delivery-banner">
              <Truck />

              <span>
                <strong>{selectedDelivery.title}</strong>
                <small>{selectedDelivery.deliveryWindow}</small>
              </span>
            </div>

            <button
              onClick={() => void place()}
              disabled={placing || !canDeliverToAddress}
              title={
                canDeliverToAddress
                  ? 'Place cash on delivery order'
                  : addressDeliveryCheck.status === 'outside'
                    ? 'Delivery is not available at this address yet'
                    : 'Verify the delivery address location first'
              }
            >
              {placing ? (
                <>
                  <Loader2 className="spin" />
                  Placing Order…
                </>
              ) : !canDeliverToAddress ? (
                addressDeliveryCheck.status === 'outside'
                  ? 'Delivery unavailable at this address'
                  : 'Verify address to order'
              ) : (
                `Place COD Order · ${money(total)}`
              )}
            </button>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .checkout-page {
          min-height: 0;
          padding: 28px 20px 20px;
          background: #f7f5f1;
        }

        .checkout-shell {
          width: min(1240px, 100%);
          margin: auto;
        }

        .checkout-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .checkout-head small {
          color: #d66d0d;
          letter-spacing: 0.12em;
        }

        .checkout-head h1 {
          margin: 5px 0 0;
        }

        .selected-address,
        .payment-card,
        .free-gift-card,
        .checkout-shop,
        .final-bill {
          border: 1px solid #e4dcd3;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 12px 32px rgba(48, 34, 22, 0.05);
        }

        .selected-address {
          padding: 20px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }

        .selected-address p,
        .selected-address small {
          margin: 5px 0 0;
          color: #746a61;
        }

        .selected-address button {
          border: 0;
          color: #d66d0d;
          background: transparent;
          font-weight: 600;
          cursor: pointer;
        }


        .address-delivery-warning {
          margin: -4px 0 20px;
          padding: 16px 18px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 13px;
          border: 1px solid #f2c982;
          border-radius: 16px;
          background: #fff8e8;
        }

        .address-delivery-warning > svg {
          color: #d97706;
        }

        .address-delivery-warning strong,
        .address-delivery-warning p,
        .address-delivery-warning small {
          display: block;
        }

        .address-delivery-warning p {
          margin: 4px 0 0;
          color: #6f5a3f;
          line-height: 1.45;
        }

        .address-delivery-warning small {
          margin-top: 4px;
          color: #8a704f;
        }

        .address-delivery-warning button {
          min-height: 40px;
          padding: 0 14px;
          border: 0;
          border-radius: 11px;
          color: #ffffff;
          background: #171717;
          font-weight: 600;
          cursor: pointer;
        }

        .address-delivery-warning.is-outside {
          border-color: #efb0a8;
          background: #fff4f2;
        }

        .address-delivery-warning.is-outside > svg {
          color: #c24132;
        }

        .checkout-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 20px;
          align-items: start;
        }

        .checkout-main {
          display: grid;
          gap: 18px;
        }

        .checkout-shop {
          padding: 20px;
        }

        .checkout-shop > header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
        }

        .checkout-item {
          padding: 13px 0;
          display: grid;
          grid-template-columns: 64px 1fr auto;
          align-items: center;
          gap: 13px;
          border-top: 1px solid #eee8e1;
        }

        .checkout-item img,
        .checkout-item > span {
          width: 64px;
          height: 64px;
          display: grid;
          place-items: center;
          object-fit: cover;
          border-radius: 14px;
          background: #f1eee9;
        }

        .checkout-item small,
        .payment-card small {
          display: block;
          margin-top: 5px;
          color: #766d64;
        }

        .shop-bill {
          margin-top: 12px;
          padding: 15px;
          border-radius: 15px;
          background: #faf8f5;
        }

        .shop-bill p,
        .final-bill p {
          display: flex;
          justify-content: space-between;
        }

        .shop-total,
        .final-total {
          padding-top: 12px;
          border-top: 1px solid #e7e0d8;
          font-size: 18px;
        }

        .payment-card {
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .free-gift-card {
          padding: 18px;
        }

        .free-gift-card-head {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 13px;
        }

        .free-gift-card-head > svg {
          color: #168648;
        }

        .free-gift-card-head strong,
        .free-gift-card-head small {
          display: block;
        }

        .free-gift-card-head strong {
          font-weight: 400;
        }

        .free-gift-card-head small {
          margin-top: 4px;
          color: #766d64;
        }

        .free-gift-checkout-list {
          margin-top: 14px;
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .free-gift-checkout-item {
          min-width: 0;
          padding: 10px;
          display: grid;
          grid-template-columns: 54px minmax(0, 1fr);
          align-items: center;
          gap: 11px;
          border: 1px solid #dcecdf;
          border-radius: 13px;
          background: #f7fcf8;
        }

        .free-gift-checkout-image {
          width: 54px;
          height: 54px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #6f9178;
          background: #ffffff;
        }

        .free-gift-checkout-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .free-gift-checkout-item strong {
          display: block;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 400;
        }

        .free-gift-checkout-item span {
          display: inline-block;
          margin-top: 5px;
          color: #168648;
          font-size: 12px;
          font-weight: 500;
        }

        .final-bill {
          position: sticky;
          top: 92px;
          padding: 20px;
        }

        .delivery-banner {
          margin: 16px 0;
          padding: 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 13px;
          color: #147a41;
          background: #edf9f1;
        }

        .delivery-banner > span {
          min-width: 0;
        }

        .delivery-banner strong,
        .delivery-banner small {
          display: block;
        }

        .delivery-banner small {
          margin-top: 2px;
          color: #4b7c5f;
          font-size: 12px;
        }

        .final-bill button {
          width: 100%;
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 14px;
          color: #fff;
          background: #22c55e;
          font-weight: 700;
          cursor: pointer;
        }

        .final-bill button:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .checkout-state {
          min-height: 100vh;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 12px;
          background: #f7f5f1;
        }

        .checkout-state button {
          padding: 11px 16px;
          border: 0;
          border-radius: 12px;
          color: #fff;
          background: #22c55e;
          cursor: pointer;
        }

        .spin {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        :global(body:has(.checkout-page) .spotc-footer) {
          margin-top: 0 !important;
        }

        @media (max-width: 900px) {
          .checkout-grid {
            grid-template-columns: 1fr;
          }

          .final-bill {
            position: static;
          }
        }

        @media (max-width: 620px) {
          .address-delivery-warning {
            grid-template-columns: auto minmax(0, 1fr);
          }

          .address-delivery-warning button {
            grid-column: 1 / -1;
            width: 100%;
          }

          .checkout-page {
            padding:
              18px 12px 10px;
          }

          .free-gift-checkout-list {
            grid-template-columns: 1fr;
          }

          .free-gift-card-head {
            grid-template-columns:
              auto minmax(0, 1fr);
          }

        }
      `}</style>
    </main>
  );
}