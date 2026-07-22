'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Gift,
  Loader2,
  MapPin,
  Package,
  TicketPercent,
  Trophy,
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
import { groupCartByBusiness } from '@/lib/delivery';
import { getWelcomeDiscount } from '@/lib/discount';
import { calculateRewards } from '@/lib/rewards';
import {
  createBusinessOrder,
  type CreatedOrder,
} from '@/lib/orders';

const money = (value: number) =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;

export default function CheckoutPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [discounts, setDiscounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

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

      const discountPairs = await Promise.all(
        groupCartByBusiness(cart).map(async (group) => {
          const discount = await getWelcomeDiscount({
            db: firestore,
            user: currentUser,
            businessId: group.businessId,
            subtotal: group.subtotal,
          });

          return [group.key, discount] as const;
        }),
      );

      if (active) {
        setDiscounts(Object.fromEntries(discountPairs));
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

  const delivery = groups.reduce(
    (sum, group) => sum + group.delivery,
    0,
  );

  const totalDiscount = groups.reduce(
    (sum, group) => sum + (discounts[group.key] || 0),
    0,
  );

  const total = subtotal + delivery - totalDiscount;
  const rewards = calculateRewards(subtotal);

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

    const firestore = db;
    const currentUser = user;
    const selectedAddress = address;

    setPlacing(true);

    try {
      const created: CreatedOrder[] = [];

      for (const group of groups) {
        const order = await createBusinessOrder({
          db: firestore,
          user: currentUser,
          group,
          address: selectedAddress,
          discount: discounts[group.key] || 0,
          rewards: calculateRewards(group.subtotal),
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

      clearCart();

      router.push(
        `/order-success?ids=${encodeURIComponent(
          created.map((order) => order.documentId).join(','),
        )}`,
      );
    } catch (error) {
      console.error(error);
      alert('Unable to place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <main className="checkout-state">
        <Loader2 className="spin" />
        <p>Preparing your checkout…</p>
      </main>
    );
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

        <div className="checkout-grid">
          <section className="checkout-main">
            {groups.map((group) => (
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
                    <strong>{money(group.delivery)}</strong>
                  </p>

                  <p className="discount">
                    <span>Welcome Discount</span>
                    <strong>
                      -{money(discounts[group.key] || 0)}
                    </strong>
                  </p>

                  <p className="shop-total">
                    <span>Shop total</span>
                    <strong>
                      {money(
                        group.subtotal +
                          group.delivery -
                          (discounts[group.key] || 0),
                      )}
                    </strong>
                  </p>
                </div>
              </article>
            ))}

            <section className="payment-card">
              <Banknote />

              <div>
                <strong>Cash on Delivery</strong>
                <small>
                  Pay the shop when your order arrives
                </small>
              </div>
            </section>

            <section className="rewards-card">
              <header>
                <Gift />
                <h2>Rewards You’ll Earn</h2>
              </header>

              <article>
                <Trophy />

                <div>
                  <strong>Reward Points</strong>
                  <small>
                    2 points for every ₹100 spent
                  </small>
                </div>

                <b>{rewards.purchasePoints} Points</b>
              </article>

              <article>
                <Gift />

                <div>
                  <strong>Bonus Rewards</strong>
                  <small>
                    5 bonus points from each of 3 nearby shops
                  </small>
                </div>

                <b className="green">
                  +{rewards.nearbyBonusPoints} Points
                </b>
              </article>

              <article>
                <TicketPercent />

                <div>
                  <strong>Exclusive Coupons</strong>
                  <small>
                    Coupons from 3 nearby shops
                  </small>
                </div>

                <b className="orange">
                  {rewards.couponCount} Coupons
                </b>
              </article>

              <footer>
                Total Rewards: {rewards.totalPoints} Points +{' '}
                {rewards.couponCount} Coupons
              </footer>

              <p className="pending-note">
                Rewards and coupons unlock after successful
                delivery.
              </p>
            </section>
          </section>

          <aside className="final-bill">
            <h2>Bill Details</h2>

            <p>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </p>

            <p>
              <span>Delivery ({groups.length} shops)</span>
              <strong>{money(delivery)}</strong>
            </p>

            <p>
              <span>Platform Fee</span>
              <strong>₹0</strong>
            </p>

            <p className="discount">
              <span>Welcome Discount</span>
              <strong>-{money(totalDiscount)}</strong>
            </p>

            <hr />

            <p className="final-total">
              <span>Total Payable</span>
              <strong>{money(total)}</strong>
            </p>

            <div className="delivery-banner">
              <Truck />
              Delivery in 15–45 mins where available
            </div>

            <button
              onClick={() => void place()}
              disabled={placing}
            >
              {placing ? (
                <>
                  <Loader2 className="spin" />
                  Placing Order…
                </>
              ) : (
                `Place COD Order · ${money(total)}`
              )}
            </button>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .checkout-page {
          min-height: 100vh;
          padding: 28px 20px 80px;
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
        .rewards-card,
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
        .payment-card small,
        .rewards-card small {
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

        .discount {
          color: #17944d;
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

        .rewards-card {
          padding: 20px;
        }

        .rewards-card header,
        .rewards-card article {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 13px;
        }

        .rewards-card article {
          padding: 17px 0;
          border-top: 1px solid #eee8e1;
        }

        .rewards-card b {
          color: #bc6a19;
        }

        .rewards-card .green {
          color: #17944d;
        }

        .rewards-card .orange {
          color: #e08100;
        }

        .rewards-card footer {
          padding: 15px;
          border-radius: 14px;
          color: #146d3a;
          background: #eaf8ef;
          font-weight: 700;
        }

        .pending-note {
          color: #69736c;
          font-size: 12px;
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
          gap: 8px;
          border-radius: 13px;
          color: #147a41;
          background: #edf9f1;
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
        }

        .spin {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .checkout-grid {
            grid-template-columns: 1fr;
          }

          .final-bill {
            position: static;
          }
        }
      `}</style>
    </main>
  );
}