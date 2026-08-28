'use client';

import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  Gift,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  Truck,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth, db, firebaseReady } from '@/lib/firebase';
import {
  getBrowserNotificationState,
  requestAndRegisterBrowserNotifications,
  type BrowserNotificationState,
} from '@/lib/notifications';
import { readOrderById } from '@/lib/orders';

const SUPPORT_PHONE = '8072098066';
const SUPPORT_PHONE_HREF = 'tel:+918072098066';
const SUPPORT_WHATSAPP = '918072098066';
const SUPPORT_EMAIL = 'support@spotc.in';
const SUPPORT_ADDRESS =
  '#41-1, Kembe Gowder Colony 1st Street, Near EB Colony Bus Stop, Karamadai, Coimbatore - 641104, Tamil Nadu, India';
const SUPPORT_MAP_URL =
  'https://www.google.com/maps/dir/?api=1&destination=41-1%20Kembe%20Gowder%20Colony%201st%20Street%2C%20Near%20EB%20Colony%20Bus%20Stop%2C%20Karamadai%2C%20Coimbatore%20641104&travelmode=driving';

type OrderItem = {
  id?: string;
  title?: string;
  image?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  subtotal?: number;
};

type OrderData = {
  id: string;
  order_number?: string;
  order_status?: string;
  payment_method?: string;
  total?: number;
  estimated_delivery?: string;
  delivery_option_id?: string;
  delivery_option?: string;
  delivery_slot_id?: string;
  delivery_slot?: string;
  delivery_option_title?: string;
  delivery_title?: string;
  delivery_slot_title?: string;
  delivery_slot_name?: string;
  delivery_window?: string;
  delivery_time?: string;
  delivery_time_window?: string;
  delivery_slot_time?: string;
  delivery_slot_window?: string;
  created_at?: unknown;
  items?: OrderItem[];
};

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

type WhatsAppQuestion = {
  label: string;
  message: (orderNumber: string) => string;
};

const whatsappQuestions: WhatsAppQuestion[] = [
  {
    label: 'Where is my order?',
    message: (orderNumber) =>
      `Hi SPOTC, I would like to check the status of my order ${orderNumber}.`,
  },
  {
    label: 'When will my order be delivered?',
    message: (orderNumber) =>
      `Hi SPOTC, please let me know the expected delivery time for my order ${orderNumber}.`,
  },
  {
    label: 'I need help with a product',
    message: (orderNumber) =>
      `Hi SPOTC, I need help with a product in my order ${orderNumber}.`,
  },
  {
    label: 'I have a payment question',
    message: (orderNumber) =>
      `Hi SPOTC, I have a payment question regarding my order ${orderNumber}.`,
  },
  {
    label: 'I need help with size / exchange',
    message: (orderNumber) =>
      `Hi SPOTC, I need help regarding size or exchange for my order ${orderNumber}.`,
  },
  {
    label: 'Other question',
    message: (orderNumber) =>
      `Hi SPOTC, I need help with my order ${orderNumber}.`,
  },
];

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;

type DeliveryOptionId =
  | 'instant'
  | 'morning'
  | 'afternoon'
  | 'overnight';

type DeliveryOption = {
  id: DeliveryOptionId;
  title: string;
  deliveryWindow: string;
};

const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: 'instant',
    title: 'Instant Delivery',
    deliveryWindow: 'Delivery in about 15 mins',
  },
  {
    id: 'morning',
    title: 'Morning Slot',
    deliveryWindow: 'Delivery between 12 PM – 2 PM',
  },
  {
    id: 'afternoon',
    title: 'Afternoon Slot',
    deliveryWindow: 'Delivery between 6 PM – 7 PM',
  },
  {
    id: 'overnight',
    title: 'Night Slot',
    deliveryWindow: 'Delivery between 6 AM – 8 AM',
  },
];

const formatOrderDateTime = (
  value: unknown,
): string => {
  if (!value) return '';

  try {
    let date: Date | null = null;

    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (
        value as {
          toDate?: () => Date;
        }
      ).toDate === 'function'
    ) {
      date = (
        value as {
          toDate: () => Date;
        }
      ).toDate();
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'seconds' in value
    ) {
      const seconds = Number(
        (
          value as {
            seconds?: unknown;
          }
        ).seconds,
      );

      if (Number.isFinite(seconds)) {
        date = new Date(seconds * 1000);
      }
    } else {
      const parsed = new Date(
        value as string | number | Date,
      );

      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

const deliveryDetails = (
  order: OrderData,
): {
  title: string;
  window: string;
} => {
  const rawId = text(
    order.delivery_option_id ||
      order.delivery_option ||
      order.delivery_slot_id ||
      order.delivery_slot,
  ).toLowerCase();

  const savedTitle = text(
    order.delivery_option_title ||
      order.delivery_title ||
      order.delivery_slot_title ||
      order.delivery_slot_name,
  );

  const savedWindow = text(
    order.delivery_window ||
      order.delivery_time ||
      order.delivery_time_window ||
      order.delivery_slot_time ||
      order.delivery_slot_window,
  );

  const byId = DELIVERY_OPTIONS.find(
    (option) =>
      option.id === rawId ||
      (rawId === 'night' &&
        option.id === 'overnight'),
  );

  if (savedTitle || savedWindow || byId) {
    return {
      title:
        savedTitle ||
        byId?.title ||
        'Selected Delivery',
      window:
        savedWindow ||
        byId?.deliveryWindow ||
        text(order.estimated_delivery) ||
        'As selected at checkout',
    };
  }

  if (typeof window !== 'undefined') {
    const savedId = text(
      window.localStorage.getItem(
        'spotc-delivery-option',
      ),
    ).toLowerCase();

    const localOption = DELIVERY_OPTIONS.find(
      (option) => option.id === savedId,
    );

    if (localOption) {
      return {
        title: localOption.title,
        window: localOption.deliveryWindow,
      };
    }
  }

  return {
    title: 'Selected Delivery',
    window:
      text(order.estimated_delivery) ||
      'As selected at checkout',
  };
};

const readSavedGifts = (
  productId: string,
): SavedGiftBundle | null => {
  if (
    typeof window === 'undefined' ||
    !productId
  ) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `spotc-free-gifts:${productId}`,
    );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (
      !parsed ||
      !Array.isArray(parsed.gifts)
    ) {
      return null;
    }

    return {
      product_id: String(
        parsed.product_id || productId,
      ),
      quantity:
        Number(parsed.quantity) || 1,
      entitlement:
        Number(parsed.entitlement) ||
        parsed.gifts.length,
      gifts: parsed.gifts
        .filter(
          (
            gift,
          ): gift is SavedFreeGift =>
            Boolean(
              gift &&
                typeof gift === 'object' &&
                'id' in gift,
            ),
        )
        .map((gift) => ({
          id: String(gift.id),
          title: String(
            gift.title || 'FREE Gift',
          ),
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

const whatsappHref = (
  message: string,
): string =>
  `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    message,
  )}`;

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

const ga4ItemFromOrder = (
  item: OrderItem,
) => {
  const quantity = Math.max(
    1,
    Number(item.quantity ?? item.qty) || 1,
  );

  const price =
    Number(item.price) ||
    (Number(item.subtotal) > 0
      ? Number(item.subtotal) / quantity
      : 0);

  return {
    item_id: String(item.id || ''),
    item_name: String(
      item.title || 'SPOTC Product',
    ),
    price,
    quantity,
  };
};

export default function OrderSuccessPage() {
  const [orders, setOrders] =
    useState<OrderData[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [whatsappOrderNumber, setWhatsappOrderNumber] =
    useState<string | null>(null);
  const purchaseTrackedRef = useRef(false);
  const [notificationUser, setNotificationUser] =
    useState<User | null>(auth?.currentUser ?? null);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationState>('unsupported');
  const [notificationBusy, setNotificationBusy] =
    useState(false);
  const [notificationMessage, setNotificationMessage] =
    useState('');
  const [showNotificationPrompt, setShowNotificationPrompt] =
    useState(false);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      return;
    }

    return onAuthStateChanged(
      auth,
      async (nextUser) => {
        const signedInUser =
          nextUser && !nextUser.isAnonymous
            ? nextUser
            : null;

        setNotificationUser(
          signedInUser,
        );

        if (!signedInUser) {
          setShowNotificationPrompt(false);
          return;
        }

        const state =
          await getBrowserNotificationState().catch(
            () => 'unsupported' as const,
          );

        setNotificationPermission(
          state,
        );

        if (
          state === 'default' &&
          typeof window !== 'undefined'
        ) {
          const dismissed =
            window.localStorage.getItem(
              'spotc-order-alerts-dismissed',
            ) === '1';

          setShowNotificationPrompt(
            !dismissed,
          );
        } else {
          setShowNotificationPrompt(false);
        }
      },
    );
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      if (!firebaseReady || !db) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const params = new URLSearchParams(
          window.location.search,
        );

        const rawIds =
          params.get('ids') ||
          params.get('id') ||
          '';

        const ids = rawIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);

        const loadedOrders =
          await Promise.all(
            ids.map((id) =>
              readOrderById(db, id),
            ),
          );

        if (!active) return;

        setOrders(
          loadedOrders.filter(
            Boolean,
          ) as OrderData[],
        );
      } catch (error) {
        console.error(
          'Unable to load order confirmation:',
          error,
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      loading ||
      !orders.length ||
      purchaseTrackedRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    orders.forEach((order) => {
      const transactionId =
        text(order.order_number) ||
        text(order.id);

      if (!transactionId) return;

      const storageKey =
        `spotc-ga4-purchase:${transactionId}`;

      if (
        window.localStorage.getItem(
          storageKey,
        ) === '1'
      ) {
        return;
      }

      sendGa4Event('purchase', {
        transaction_id: transactionId,
        currency: 'INR',
        value: Number(order.total || 0),
        payment_type:
          text(order.payment_method) ||
          'Cash on Delivery',
        items: (order.items || []).map(
          ga4ItemFromOrder,
        ),
      });

      window.localStorage.setItem(
        storageKey,
        '1',
      );
    });

    purchaseTrackedRef.current = true;
    window.sessionStorage.removeItem(
      'spotc-ga4-checkout-snapshot',
    );
  }, [loading, orders]);

  useEffect(() => {
    if (!whatsappOrderNumber) {
      return;
    }

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setWhatsappOrderNumber(null);
      }
    };

    document.addEventListener(
      'keydown',
      closeOnEscape,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        closeOnEscape,
      );
    };
  }, [whatsappOrderNumber]);

  const totals = useMemo(
    () => ({
      amount: orders.reduce(
        (sum, order) =>
          sum + Number(order.total || 0),
        0,
      ),
    }),
    [orders],
  );

  const selectedFreeGifts = useMemo(() => {
    const giftMap =
      new Map<string, SavedFreeGift>();

    for (const order of orders) {
      for (const item of order.items || []) {
        const productId = text(item.id);
        const bundle =
          readSavedGifts(productId);

        for (const gift of
          bundle?.gifts || []) {
          giftMap.set(gift.id, gift);
        }
      }
    }

    return [...giftMap.values()];
  }, [orders]);

  const enableOrderAlerts = async () => {
    if (notificationBusy) {
      return;
    }

    if (!notificationUser) {
      setNotificationMessage(
        'Please sign in again to enable order alerts.',
      );
      return;
    }

    setNotificationBusy(true);
    setNotificationMessage(
      'Checking notification permission…',
    );

    try {
      const state =
        await requestAndRegisterBrowserNotifications(
          notificationUser,
        );

      setNotificationPermission(
        state,
      );

      if (state === 'granted') {
        setNotificationMessage(
          'Order alerts are turned on for this device.',
        );
        setShowNotificationPrompt(false);

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(
            'spotc-order-alerts-dismissed',
          );
        }
      } else if (state === 'denied') {
        setNotificationMessage(
          'Notifications are blocked in this browser.',
        );
      } else if (state === 'unsupported') {
        setNotificationMessage(
          'This browser does not support browser notifications.',
        );
      }
    } catch (error) {
      console.error(
        'Unable to enable order alerts:',
        error,
      );

      setNotificationMessage(
        error instanceof Error
          ? error.message
          : 'Unable to enable order alerts.',
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  const dismissOrderAlertsPrompt = () => {
    setShowNotificationPrompt(false);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'spotc-order-alerts-dismissed',
        '1',
      );
    }
  };

  if (loading) {
    return (
      <main className="spotc-success-state">
        <Loader2
          className="spotc-success-spin"
          size={36}
        />
        <p>Loading your order confirmation…</p>
        <style jsx global>{styles}</style>
      </main>
    );
  }

  if (!orders.length) {
    return (
      <main className="spotc-success-state">
        <Package size={44} />
        <h1>Order details not found</h1>
        <p>
          Open My Orders to view your latest
          purchases.
        </p>
        <Link
          href="/dashboard?tab=orders"
          className="spotc-success-state-link"
        >
          View My Orders
        </Link>
        <style jsx global>{styles}</style>
      </main>
    );
  }

  return (
    <main className="spotc-order-success">
      <div className="spotc-order-success__shell">
        <section className="spotc-order-success__hero">
          <div className="spotc-order-success__check">
            <CheckCircle2 size={58} />
          </div>

          <small>ORDER CONFIRMED</small>

          <h1>
            Thank you for shopping with SPOTC.
          </h1>

          <p>
            Your Cash on Delivery order
            {orders.length > 1 ? 's are' : ' is'}{' '}
            confirmed. Our local SPOTC team will
            handle your order and delivery.
          </p>

          <div className="spotc-order-success__grand-total">
            <span>Total Amount</span>
            <strong>{money(totals.amount)}</strong>
          </div>
        </section>

        {notificationUser &&
          notificationPermission !== 'granted' &&
          showNotificationPrompt && (
            <section className="spotc-order-alerts">
              <div className="spotc-order-alerts__icon">
                <Bell size={22} />
              </div>

              <div className="spotc-order-alerts__copy">
                <strong>Get delivery updates</strong>
                <p>
                  Know when your order is confirmed,
                  packed, out for delivery and delivered.
                </p>

                {notificationMessage && (
                  <span>
                    {notificationMessage}
                  </span>
                )}
              </div>

              <div className="spotc-order-alerts__actions">
                <button
                  type="button"
                  className="spotc-order-alerts__enable"
                  onClick={() =>
                    void enableOrderAlerts()
                  }
                  disabled={notificationBusy}
                >
                  {notificationBusy
                    ? 'Turning on…'
                    : 'Turn on order alerts'}
                </button>

                <button
                  type="button"
                  className="spotc-order-alerts__later"
                  onClick={dismissOrderAlertsPrompt}
                >
                  Not now
                </button>
              </div>
            </section>
          )}

        <section className="spotc-order-success__support-card">
          <div className="spotc-order-success__support-head">
            <div className="spotc-order-success__support-logo">
              S
            </div>

            <div>
              <small>LOCAL ORDER SUPPORT</small>
              <h2>SPOTC Karamadai</h2>
              <span>
                Local business. Local support.
              </span>
            </div>
          </div>

          <div className="spotc-order-success__address">
            <MapPin size={18} />
            <span>{SUPPORT_ADDRESS}</span>
          </div>

          <div className="spotc-order-success__support-actions">
            <a href={SUPPORT_PHONE_HREF}>
              <Phone size={17} />
              <span>Call</span>
            </a>

            <button
              type="button"
              className="spotc-order-success__whatsapp-button"
              onClick={() =>
                setWhatsappOrderNumber(
                  text(orders[0]?.order_number) ||
                    text(orders[0]?.id),
                )
              }
            >
              <MessageCircle size={17} />
              <span>WhatsApp</span>
            </button>

            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <Mail size={17} />
              <span>Email</span>
            </a>
          </div>

          <div className="spotc-order-success__support-details">
            <span>
              <strong>Phone:</strong>{' '}
              {SUPPORT_PHONE}
            </span>
            <span>
              <strong>Email:</strong>{' '}
              {SUPPORT_EMAIL}
            </span>
            <a
              href={SUPPORT_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Directions to SPOTC
            </a>
          </div>
        </section>

        <section className="spotc-order-success__orders">
          {orders.map((order) => {
            const orderNumber =
              text(order.order_number) ||
              order.id;

            const delivery =
              deliveryDetails(order);

            const orderedAt =
              formatOrderDateTime(
                order.created_at,
              );

            return (
              <article
                className="spotc-order-success__order-card"
                key={order.id}
              >
                <header className="spotc-order-success__order-head">
                  <div>
                    <small>ORDER NUMBER</small>
                    <strong>{orderNumber}</strong>
                  </div>

                  <button
                    type="button"
                    className="spotc-order-success__order-whatsapp"
                    onClick={() =>
                      setWhatsappOrderNumber(
                        orderNumber,
                      )
                    }
                  >
                    <MessageCircle size={16} />
                    Need help?
                  </button>
                </header>

                <div className="spotc-order-success__meta">
                  <span>
                    Status:{' '}
                    <strong>
                      {order.order_status ||
                        'Placed'}
                    </strong>
                  </span>

                  <span>
                    Payment:{' '}
                    <strong>
                      {order.payment_method ||
                        'COD'}
                    </strong>
                  </span>

                  {orderedAt && (
                    <span>
                      Ordered:{' '}
                      <strong>{orderedAt}</strong>
                    </span>
                  )}

                  <b>
                    {money(
                      Number(order.total || 0),
                    )}
                  </b>
                </div>

                <div className="spotc-order-success__delivery">
                  <Truck size={19} />
                  <span>
                    <strong>{delivery.title}</strong>
                    <small>{delivery.window}</small>
                  </span>
                </div>

                <div className="spotc-order-success__products">
                  {(order.items || []).map(
                    (item, index) => {
                      const quantity = Number(
                        item.quantity ||
                          item.qty ||
                          1,
                      );

                      const itemTotal = Number(
                        item.subtotal ||
                          Number(item.price || 0) *
                            quantity,
                      );

                      return (
                        <div
                          className="spotc-order-success__product"
                          key={`${item.id || 'item'}-${index}`}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={
                                item.title ||
                                'Product'
                              }
                            />
                          ) : (
                            <span className="spotc-order-success__product-fallback">
                              <Package size={23} />
                            </span>
                          )}

                          <div>
                            <strong>
                              {item.title ||
                                'Product'}
                            </strong>
                            <small>
                              Qty {quantity}
                            </small>
                          </div>

                          <b>{money(itemTotal)}</b>
                        </div>
                      );
                    },
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {selectedFreeGifts.length > 0 && (
          <section className="spotc-order-success__free-gifts">
            <div className="spotc-order-success__free-gifts-head">
              <Gift size={22} />
              <div>
                <strong>
                  {selectedFreeGifts.length} FREE Gift
                  {selectedFreeGifts.length === 1
                    ? ''
                    : 's'}{' '}
                  Included
                </strong>
                <p>
                  Your selected gifts are included
                  at no extra cost.
                </p>
              </div>
            </div>

            <div className="spotc-order-success__free-gifts-list">
              {selectedFreeGifts.map((gift) => (
                <article
                  className="spotc-order-success__free-gift"
                  key={gift.id}
                >
                  <div className="spotc-order-success__free-gift-image">
                    {gift.image ? (
                      <img
                        src={gift.image}
                        alt={gift.title}
                      />
                    ) : (
                      <Gift size={22} />
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

        <nav className="spotc-order-success__actions">
          <Link
            href="/dashboard?tab=orders"
            className="spotc-order-success__orders-button"
          >
            <ReceiptText size={19} />
            View My Orders
          </Link>

          <Link
            href="/shop"
            className="spotc-order-success__shopping-button"
          >
            Continue Shopping
          </Link>
        </nav>
      </div>

      {whatsappOrderNumber && (
        <div
          className="spotc-whatsapp-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="spotc-whatsapp-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setWhatsappOrderNumber(null);
            }
          }}
        >
          <div className="spotc-whatsapp-modal">
            <button
              type="button"
              className="spotc-whatsapp-close"
              aria-label="Close WhatsApp support"
              onClick={() =>
                setWhatsappOrderNumber(null)
              }
            >
              <X size={20} />
            </button>

            <div className="spotc-whatsapp-modal-icon">
              <MessageCircle size={23} />
            </div>

            <div className="spotc-whatsapp-modal-heading">
              <small>SPOTC WHATSAPP SUPPORT</small>
              <h2 id="spotc-whatsapp-title">
                How can we help?
              </h2>
              <p>
                Order: {whatsappOrderNumber}
              </p>
            </div>

            <div className="spotc-whatsapp-questions">
              {whatsappQuestions.map(
                (question) => (
                  <a
                    key={question.label}
                    href={whatsappHref(
                      question.message(
                        whatsappOrderNumber,
                      ),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      setWhatsappOrderNumber(null)
                    }
                  >
                    <span>{question.label}</span>
                    <span aria-hidden="true">›</span>
                  </a>
                ),
              )}
            </div>

            <p className="spotc-whatsapp-number">
              WhatsApp support: {SUPPORT_PHONE}
            </p>
          </div>
        </div>
      )}

      <style jsx global>{styles}</style>
    </main>
  );
}

const styles = `
  .spotc-order-success,
  .spotc-order-success *,
  .spotc-order-success *::before,
  .spotc-order-success *::after {
    box-sizing: border-box;
  }

  .spotc-order-success {
    width: 100%;
    min-height: 100vh;
    padding: 42px 20px 32px;
    color: #24201c;
    background:
      radial-gradient(circle at top center, rgba(34, 197, 94, 0.07), transparent 30rem),
      #f7f5f1;
  }

  .spotc-order-success__shell {
    width: min(980px, 100%);
    margin: 0 auto;
  }

  .spotc-order-success__hero {
    text-align: center;
  }

  .spotc-order-success__check {
    width: 86px;
    height: 86px;
    margin: 0 auto;
    display: grid;
    place-items: center;
    border: 2px solid rgba(25, 157, 79, 0.28);
    border-radius: 50%;
    color: #199d4f;
    background: #edf9f1;
  }

  .spotc-order-success__hero > small {
    display: block;
    margin-top: 16px;
    color: #ad620d;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.15em;
  }

  .spotc-order-success__hero h1 {
    max-width: 760px;
    margin: 14px auto 8px;
    color: #211d19;
    font-size: clamp(36px, 5vw, 58px);
    line-height: 1.04;
    font-weight: 750;
    letter-spacing: -0.04em;
  }

  .spotc-order-success__hero p {
    max-width: 700px;
    margin: 0 auto;
    color: #6f665e;
    font-size: 15px;
    line-height: 1.55;
  }

  .spotc-order-success__grand-total {
    width: min(370px, 100%);
    min-height: 56px;
    margin: 22px auto 0;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid #d9eee0;
    border-radius: 16px;
    background: #eaf8ef;
  }

  .spotc-order-success__grand-total span {
    color: #4d5f54;
    font-size: 14px;
  }

  .spotc-order-success__grand-total strong {
    color: #167b42;
    font-size: 20px;
  }

  .spotc-order-alerts {
    margin-top: 24px;
    padding: 18px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    border: 1px solid #d8e8f0;
    border-radius: 18px;
    background: #f7fbfd;
    box-shadow: 0 12px 30px rgba(16, 68, 91, 0.06);
  }

  .spotc-order-alerts__icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: #0b6f86;
    background: #e8f6fa;
  }

  .spotc-order-alerts__copy {
    min-width: 0;
  }

  .spotc-order-alerts__copy strong {
    display: block;
    color: #1f2c32;
    font-size: 15px;
  }

  .spotc-order-alerts__copy p {
    margin: 4px 0 0;
    color: #66767e;
    font-size: 12px;
    line-height: 1.45;
  }

  .spotc-order-alerts__copy span {
    display: block;
    margin-top: 6px;
    color: #8c4f0a;
    font-size: 11px;
    line-height: 1.4;
  }

  .spotc-order-alerts__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spotc-order-alerts__actions button {
    min-height: 42px;
    padding: 0 14px;
    border-radius: 12px;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .spotc-order-alerts__enable {
    border: 0;
    color: #fff;
    background: #0a7189;
  }

  .spotc-order-alerts__enable:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .spotc-order-alerts__later {
    border: 1px solid #d7e2e7;
    color: #58666d;
    background: #fff;
  }

  .spotc-order-success__support-card,
  .spotc-order-success__order-card,
  .spotc-order-success__free-gifts {
    border: 1px solid #e3dbd2;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 14px 36px rgba(48, 34, 22, 0.05);
  }

  .spotc-order-success__support-card {
    margin-top: 28px;
    padding: 20px;
  }

  .spotc-order-success__support-head {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .spotc-order-success__support-logo {
    width: 54px;
    height: 54px;
    flex: 0 0 54px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #fff;
    background: #4b1715;
    font-size: 22px;
    font-weight: 900;
  }

  .spotc-order-success__support-head small {
    display: block;
    color: #876f62;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  .spotc-order-success__support-head h2 {
    margin: 2px 0 2px;
    font-size: 20px;
    line-height: 1.2;
  }

  .spotc-order-success__support-head span {
    color: #677066;
    font-size: 12px;
  }

  .spotc-order-success__address {
    margin-top: 16px;
    padding: 13px 14px;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    border-radius: 13px;
    color: #675e56;
    background: #faf8f5;
    font-size: 13px;
    line-height: 1.5;
  }

  .spotc-order-success__address svg {
    flex: 0 0 auto;
    color: #d06c12;
  }

  .spotc-order-success__support-actions {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .spotc-order-success__support-actions a,
  .spotc-order-success__support-actions button {
    min-height: 44px;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid #ded6ce;
    border-radius: 13px;
    color: #29241f;
    background: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }

  .spotc-order-success__whatsapp-button {
    color: #137a40 !important;
    border-color: #c8e8d3 !important;
    background: #eff9f2 !important;
  }

  .spotc-order-success__support-details {
    margin-top: 13px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    color: #6b625a;
    font-size: 12px;
  }

  .spotc-order-success__support-details a {
    color: #7c5819;
    font-weight: 750;
    text-decoration: none;
  }

  .spotc-order-success__orders {
    margin-top: 18px;
    display: grid;
    gap: 18px;
  }

  .spotc-order-success__order-card {
    padding: 20px;
  }

  .spotc-order-success__order-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .spotc-order-success__order-head small {
    display: block;
    color: #776d64;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.08em;
  }

  .spotc-order-success__order-head strong {
    display: block;
    margin-top: 3px;
    overflow-wrap: anywhere;
    font-size: 15px;
  }

  .spotc-order-success__order-whatsapp {
    min-height: 38px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #c8e8d3;
    border-radius: 11px;
    color: #137a40;
    background: #eff9f2;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .spotc-order-success__meta {
    margin-top: 14px;
    padding: 13px 14px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 22px;
    border-radius: 13px;
    background: #faf8f5;
  }

  .spotc-order-success__meta span {
    color: #625951;
    font-size: 13px;
  }

  .spotc-order-success__meta span strong {
    color: #28231f;
    text-transform: capitalize;
  }

  .spotc-order-success__meta > b {
    margin-left: auto;
    font-size: 17px;
  }

  .spotc-order-success__delivery {
    margin-top: 12px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 9px;
    border-radius: 13px;
    color: #137b40;
    background: #edf9f1;
    font-size: 13px;
    font-weight: 650;
  }

  .spotc-order-success__delivery span {
    display: grid;
    gap: 2px;
  }

  .spotc-order-success__delivery strong {
    color: #116c38;
    font-size: 13px;
  }

  .spotc-order-success__delivery small {
    color: #2f8050;
    font-size: 12px;
    font-weight: 600;
  }

  .spotc-order-success__products {
    margin-top: 12px;
    display: grid;
    gap: 9px;
  }

  .spotc-order-success__product {
    padding: 9px;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid #ebe5de;
    border-radius: 14px;
    background: #fff;
  }

  .spotc-order-success__product img,
  .spotc-order-success__product-fallback {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    object-fit: cover;
    border-radius: 11px;
    color: #9d9288;
    background: #f1eee9;
  }

  .spotc-order-success__product > div {
    min-width: 0;
  }

  .spotc-order-success__product strong {
    display: block;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spotc-order-success__product small {
    display: block;
    margin-top: 3px;
    color: #756b62;
    font-size: 11px;
  }

  .spotc-order-success__product > b {
    font-size: 14px;
  }

  .spotc-order-success__free-gifts {
    margin-top: 18px;
    padding: 18px 20px;
    border-color: #cfe8d7;
    background: #f7fcf8;
  }

  .spotc-order-success__free-gifts-head {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    color: #176d3d;
  }

  .spotc-order-success__free-gifts-head strong {
    display: block;
    font-size: 15px;
  }

  .spotc-order-success__free-gifts-head p {
    margin: 3px 0 0;
    color: #5e7465;
    font-size: 12px;
  }

  .spotc-order-success__free-gifts-list {
    margin-top: 13px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .spotc-order-success__free-gift {
    min-width: 0;
    padding: 9px;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid #dcecdf;
    border-radius: 12px;
    background: #fff;
  }

  .spotc-order-success__free-gift-image {
    width: 54px;
    height: 54px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #6f9178;
    background: #f7fcf8;
  }

  .spotc-order-success__free-gift-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .spotc-order-success__free-gift strong {
    display: block;
    overflow: hidden;
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spotc-order-success__free-gift span {
    display: inline-block;
    margin-top: 4px;
    color: #168648;
    font-size: 12px;
    font-weight: 800;
  }

  .spotc-order-success__actions {
    margin-top: 20px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .spotc-order-success__actions a {
    min-height: 52px;
    padding: 12px 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border-radius: 14px;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
  }

  .spotc-order-success__orders-button {
    color: #fff;
    background: #171717;
  }

  .spotc-order-success__shopping-button {
    border: 1px solid #d9d1c9;
    color: #29241f;
    background: #fff;
  }

  .spotc-whatsapp-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    padding: 18px;
    display: grid;
    place-items: center;
    background: rgba(18, 16, 14, 0.58);
    backdrop-filter: blur(3px);
  }

  .spotc-whatsapp-modal {
    position: relative;
    width: min(440px, 100%);
    max-height: calc(100vh - 36px);
    overflow-y: auto;
    padding: 24px;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
  }

  .spotc-whatsapp-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #4f4841;
    background: #f2eee8;
    cursor: pointer;
  }

  .spotc-whatsapp-modal-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: #168b3c;
  }

  .spotc-whatsapp-modal-heading {
    margin-top: 12px;
  }

  .spotc-whatsapp-modal-heading small {
    color: #168b3c;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  .spotc-whatsapp-modal-heading h2 {
    margin: 3px 0 3px;
    font-size: 24px;
  }

  .spotc-whatsapp-modal-heading p {
    margin: 0;
    color: #756e66;
    font-size: 12px;
  }

  .spotc-whatsapp-questions {
    margin-top: 16px;
    display: grid;
    gap: 7px;
  }

  .spotc-whatsapp-questions a {
    min-height: 48px;
    padding: 0 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #e8e2da;
    border-radius: 11px;
    color: #24211d;
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
  }

  .spotc-whatsapp-questions a:hover {
    border-color: #cfe1d2;
    background: #f4fbf5;
  }

  .spotc-whatsapp-questions a span:last-child {
    color: #168b3c;
    font-size: 22px;
  }

  .spotc-whatsapp-number {
    margin: 14px 0 0;
    color: #766e67;
    font-size: 11px;
    text-align: center;
  }

  .spotc-success-state {
    min-height: 100vh;
    padding: 30px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    color: #24201c;
    text-align: center;
    background: #f7f5f1;
  }

  .spotc-success-state-link {
    margin-top: 8px;
    padding: 12px 18px;
    border-radius: 13px;
    color: #fff;
    background: #171717;
    text-decoration: none;
    font-weight: 700;
  }

  .spotc-success-spin {
    color: #199d4f;
    animation: spotcSuccessSpin 0.8s linear infinite;
  }

  @keyframes spotcSuccessSpin {
    to {
      transform: rotate(360deg);
    }
  }

  body:has(.spotc-order-success) .spotc-footer {
    margin-top: 0 !important;
  }

  @media (max-width: 680px) {
    .spotc-order-alerts {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      padding: 16px;
    }

    .spotc-order-alerts__actions {
      grid-column: 1 / -1;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr;
    }

    .spotc-order-alerts__actions button {
      width: 100%;
    }

    .spotc-order-success {
      padding: 26px 12px max(18px, env(safe-area-inset-bottom));
    }

    .spotc-order-success__hero h1 {
      font-size: 38px;
    }

    .spotc-order-success__support-card,
    .spotc-order-success__order-card {
      padding: 16px;
    }

    .spotc-order-success__support-actions {
      grid-template-columns: 1fr;
    }

    .spotc-order-success__support-details {
      display: grid;
      gap: 5px;
    }

    .spotc-order-success__order-head {
      align-items: flex-start;
    }

    .spotc-order-success__meta > b {
      width: 100%;
      margin-left: 0;
    }

    .spotc-order-success__product {
      grid-template-columns: 52px minmax(0, 1fr);
    }

    .spotc-order-success__product img,
    .spotc-order-success__product-fallback {
      width: 52px;
      height: 52px;
    }

    .spotc-order-success__product > b {
      grid-column: 2;
    }

    .spotc-order-success__free-gifts-list,
    .spotc-order-success__actions {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 430px) {
    .spotc-order-success__hero h1 {
      font-size: 32px;
    }

    .spotc-order-success__order-head {
      display: grid;
    }

    .spotc-order-success__order-whatsapp {
      width: fit-content;
    }

    .spotc-whatsapp-modal {
      padding: 20px 16px 16px;
      border-radius: 18px;
    }
  }
`;