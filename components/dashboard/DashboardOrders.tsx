'use client';

import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Headphones,
  MapPin,
  Package,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  Timestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type OrderFilter = 'all' | 'active' | 'delivered' | 'cancelled';

type OrderItem = {
  id: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
  productId: string;
};

type OrderRecord = {
  id: string;
  orderNumber: string;
  businessName: string;
  businessLogo: string;
  businessId: string;
  items: OrderItem[];
  subtotal: number;
  deliveryCharge: number;
  platformFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  address: string;
  phone: string;
  notes: string;
  raw: DocumentData;
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function refIdOf(value: unknown): string {
  if (typeof value === 'string') {
    const parts = value.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }

  return '';
}

function imageOf(item: DocumentData): string {
  return (
    textOf(item.image) ||
    textOf(item.image_url) ||
    textOf(item.product_image) ||
    textOf(item.thumbnail_url) ||
    textOf(item.product_thumbnail)
  );
}

function mapItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const record =
      typeof item === 'object' && item !== null
        ? (item as DocumentData)
        : {};

    const price = numberOf(
      record.price ??
        record.selling_price ??
        record.offer_price ??
        record.unit_price,
    );

    const quantity = Math.max(
      1,
      numberOf(record.quantity ?? record.qty ?? record.count) || 1,
    );

    return {
      id: textOf(record.id) || textOf(record.product_id) || `${index}`,
      title:
        textOf(record.title) ||
        textOf(record.product_name) ||
        textOf(record.name) ||
        'Product',
      image: imageOf(record),
      price,
      quantity,
      subtotal:
        numberOf(record.subtotal ?? record.line_total) ||
        price * quantity,
      size: textOf(record.size),
      color: textOf(record.color),
      productId:
        refIdOf(record.product_ref) ||
        textOf(record.product_id) ||
        textOf(record.productId),
    };
  });
}

function normalizeStatus(value: unknown): string {
  const status = textOf(value).toLowerCase().replace(/[_-]+/g, ' ');

  if (!status) return 'placed';
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('deliver')) return 'delivered';
  if (status.includes('out for')) return 'out for delivery';
  if (status === 'out') return 'out for delivery';
  if (status.includes('ready')) return 'ready';
  if (status.includes('confirm')) return 'confirmed';
  if (status.includes('process')) return 'processing';
  if (status.includes('pending')) return 'pending';
  if (status.includes('place')) return 'placed';

  return status;
}

function buildAddress(data: DocumentData): string {
  const direct =
    textOf(data.delivery_address) ||
    textOf(data.address_text) ||
    textOf(data.full_address);

  if (direct) return direct;

  const source =
    typeof data.address === 'object' && data.address !== null
      ? (data.address as DocumentData)
      : data;

  return [
    source.house_no,
    source.street,
    source.area,
    source.city,
    source.pincode,
  ]
    .map(textOf)
    .filter(Boolean)
    .join(', ');
}

function mapOrder(id: string, data: DocumentData): OrderRecord {
  const items = mapItems(data.items ?? data.order_items ?? data.products);

  const subtotal =
    numberOf(data.subtotal) ||
    items.reduce((sum, item) => sum + item.subtotal, 0);

  const deliveryCharge = numberOf(
    data.delivery_charge ?? data.delivery_fee,
  );

  const platformFee = numberOf(
    data.platform_fee ?? data.service_fee,
  );

  const discount = numberOf(
    data.discount ?? data.discount_amount,
  );

  const total =
    numberOf(data.total ?? data.grand_total ?? data.order_total) ||
    subtotal + deliveryCharge + platformFee - discount;

  return {
    id,
    orderNumber:
      textOf(data.order_number) ||
      textOf(data.order_no) ||
      textOf(data.order_id) ||
      `SPOTC-${id.slice(0, 8).toUpperCase()}`,
    businessName:
      textOf(data.business_name) ||
      textOf(data.shop_name) ||
      'SPOTC Business',
    businessLogo:
      textOf(data.business_logo) ||
      textOf(data.logo_url),
    businessId:
      refIdOf(data.business_ref) ||
      textOf(data.business_id),
    items,
    subtotal,
    deliveryCharge,
    platformFee,
    discount,
    total,
    paymentMethod:
      textOf(data.payment_method) ||
      textOf(data.payment_mode) ||
      'Cash on Delivery',
    status: normalizeStatus(
      data.order_status ??
        data.status ??
        data.delivery_status,
    ),
    createdAt: dateOf(data.created_at ?? data.order_date),
    updatedAt: dateOf(data.updated_at ?? data.status_updated_at),
    address: buildAddress(data),
    phone: textOf(data.phone ?? data.customer_phone),
    notes: textOf(data.notes ?? data.customer_note),
    raw: data,
  };
}

function formatDate(date: Date | null): string {
  if (!date) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);

  if (!words.length) return 'S';

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

const STATUS_STEPS = [
  'placed',
  'confirmed',
  'ready',
  'out for delivery',
  'delivered',
] as const;

function statusIndex(status: string): number {
  if (status === 'pending' || status === 'processing') return 0;
  const index = STATUS_STEPS.indexOf(
    status as (typeof STATUS_STEPS)[number],
  );
  return index >= 0 ? index : 0;
}

function statusLabel(status: string): string {
  if (status === 'out for delivery') return 'Out for delivery';

  return status
    .split(' ')
    .map((word) =>
      word ? word[0].toUpperCase() + word.slice(1) : '',
    )
    .join(' ');
}

export default function DashboardOrders() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OrderRecord | null>(null);
  const [copiedOrder, setCopiedOrder] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let active = true;
    const currentUser = user;

    async function loadOrders() {
      setLoading(true);

      try {
        const db = getFirestore();

        const snapshots = await Promise.all([
          getDocs(
            query(
              collection(db, 'Orders'),
              where('user_uid', '==', currentUser.uid),
              limit(100),
            ),
          ).catch(() => null),
          getDocs(
            query(
              collection(db, 'Orders'),
              where(
                'user_ref',
                '==',
                doc(db, 'users', currentUser.uid),
              ),
              limit(100),
            ),
          ).catch(() => null),
          getDocs(
            query(
              collection(db, 'Orders'),
              where(
                'user_ref',
                '==',
                doc(db, 'Users', currentUser.uid),
              ),
              limit(100),
            ),
          ).catch(() => null),
        ]);

        if (!active) return;

        const unique = new Map<string, OrderRecord>();

        for (const snapshot of snapshots) {
          for (const orderDoc of snapshot?.docs ?? []) {
            if (!unique.has(orderDoc.id)) {
              unique.set(
                orderDoc.id,
                mapOrder(orderDoc.id, orderDoc.data()),
              );
            }
          }
        }

        setOrders(
          [...unique.values()].sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          ),
        );
      } catch (error) {
        console.error('Orders load failed:', error);
        setMessage('Some order information could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, [authChecked, user]);

  const summary = useMemo(() => {
    const activeOrders = orders.filter(
      (order) =>
        !['delivered', 'cancelled'].includes(order.status),
    );

    const deliveredOrders = orders.filter(
      (order) => order.status === 'delivered',
    );

    const cancelledOrders = orders.filter(
      (order) => order.status === 'cancelled',
    );

    return {
      total: orders.length,
      active: activeOrders.length,
      delivered: deliveredOrders.length,
      cancelled: cancelledOrders.length,
      spent: deliveredOrders.reduce(
        (sum, order) => sum + order.total,
        0,
      ),
      saved: orders.reduce(
        (sum, order) => sum + order.discount,
        0,
      ),
    };
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const filterMatches =
        filter === 'all' ||
        (filter === 'active' &&
          !['delivered', 'cancelled'].includes(order.status)) ||
        (filter === 'delivered' &&
          order.status === 'delivered') ||
        (filter === 'cancelled' &&
          order.status === 'cancelled');

      const searchMatches =
        !term ||
        order.orderNumber.toLowerCase().includes(term) ||
        order.businessName.toLowerCase().includes(term) ||
        order.status.toLowerCase().includes(term) ||
        order.items.some((item) =>
          item.title.toLowerCase().includes(term),
        );

      return filterMatches && searchMatches;
    });
  }, [orders, filter, search]);

  const requireSignIn = (action: string): boolean => {
    if (user) return true;

    setMessage(`Sign in to ${action}. You can continue browsing this preview.`);
    return false;
  };

  const copyOrderNumber = async (orderNumber: string) => {
    if (!requireSignIn('copy a real order number')) return;

    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiedOrder(orderNumber);
      window.setTimeout(() => setCopiedOrder(''), 1800);
    } catch {
      setMessage('Unable to copy the order number.');
    }
  };

  const openBusiness = (order: OrderRecord) => {
    if (!requireSignIn('open a business from your real order')) return;

    window.location.href = order.businessId
      ? `/shop?business=${encodeURIComponent(order.businessId)}`
      : '/shop';
  };

  const shopAgain = (order: OrderRecord) => {
    if (!requireSignIn('shop again from a real order')) return;

    if (order.items.length === 1 && order.items[0].productId) {
      window.location.href =
        `/product/${encodeURIComponent(order.items[0].productId)}`;
      return;
    }

    openBusiness(order);
  };

  if (!authChecked || loading) {
    return (
      <section className="orders-loading">
        <span />
        <p>Loading your orders…</p>
      </section>
    );
  }

  return (
    <div className="orders-page">
      {!user && (
        <div className="dash-guest-preview-note">
          <Sparkles />
          <span>
            Guest preview: explore the complete Orders page. Sign in only to
            view, copy or manage your real orders.
          </span>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/login?next=/dashboard?tab=orders';
            }}
          >
            Sign In
          </button>
        </div>
      )}
      <section className="orders-hero">
        <div>
          <span className="orders-eyebrow">
            <Sparkles /> MY SPOTC ORDERS
          </span>
          <h2>Everything you ordered, in one place.</h2>
          <p>
            Track active orders, view delivery progress, check bill details
            and quickly shop again from businesses you trust.
          </p>
        </div>

        <div className="orders-value-card">
          <small>TOTAL DELIVERED VALUE</small>
          <strong>{money(summary.spent)}</strong>
          <span>{summary.delivered} completed orders</span>
        </div>
      </section>

      <section className="orders-summary-grid">
        <article>
          <span className="orders-summary-icon purple"><Package /></span>
          <div><small>Total Orders</small><strong>{summary.total}</strong><p>Complete history</p></div>
        </article>

        <article>
          <span className="orders-summary-icon orange"><Truck /></span>
          <div><small>Active Orders</small><strong>{summary.active}</strong><p>Being prepared or delivered</p></div>
        </article>

        <article>
          <span className="orders-summary-icon green"><PackageCheck /></span>
          <div><small>Delivered</small><strong>{summary.delivered}</strong><p>Successfully completed</p></div>
        </article>

        <article>
          <span className="orders-summary-icon blue"><CircleDollarSign /></span>
          <div><small>You Saved</small><strong>{money(summary.saved)}</strong><p>Order discounts</p></div>
        </article>
      </section>

      <section className="orders-toolbar">
        <div className="orders-tabs">
          {[
            ['all', 'All Orders'],
            ['active', 'Active'],
            ['delivered', 'Delivered'],
            ['cancelled', 'Cancelled'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value as OrderFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="orders-search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, business or product"
          />
        </label>
      </section>

      {message && (
        <div className="orders-message">
          <BadgeCheck />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}><X /></button>
        </div>
      )}

      <section className="orders-list-section">
        <div className="orders-section-head">
          <div>
            <h2>
              {filter === 'all'
                ? 'All orders'
                : filter === 'active'
                  ? 'Active orders'
                  : filter === 'delivered'
                    ? 'Delivered orders'
                    : 'Cancelled orders'}
            </h2>
            <p>
              Tap an order to see products, totals, address and delivery progress.
            </p>
          </div>

          <span><ShoppingBag /> {visibleOrders.length} orders</span>
        </div>

        {visibleOrders.length ? (
          <div className="orders-list">
            {visibleOrders.map((order) => {
              const firstItem = order.items[0];
              const extraItems = Math.max(0, order.items.length - 1);
              const cancelled = order.status === 'cancelled';
              const delivered = order.status === 'delivered';

              return (
                <article className="order-card" key={order.id}>
                  <div className="order-card-head">
                    <div className="order-business">
                      {order.businessLogo ? (
                        <img src={order.businessLogo} alt="" />
                      ) : (
                        <span>{initialsOf(order.businessName)}</span>
                      )}

                      <div>
                        <small>{order.businessName}</small>
                        <strong>{order.orderNumber}</strong>
                      </div>
                    </div>

                    <span className={`order-status ${order.status.replace(/\s+/g, '-')}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>

                  <div className="order-main">
                    <div className="order-product-preview">
                      {firstItem?.image ? (
                        <img src={firstItem.image} alt="" />
                      ) : (
                        <span><Package /></span>
                      )}

                      <div>
                        <strong>
                          {firstItem?.title || 'Order items'}
                        </strong>
                        <p>
                          {order.items.length
                            ? `${firstItem.quantity} × ${money(firstItem.price)}${
                                extraItems
                                  ? ` · +${extraItems} more item${extraItems === 1 ? '' : 's'}`
                                  : ''
                              }`
                            : 'Products are attached to this order'}
                        </p>
                      </div>
                    </div>

                    <div className="order-total">
                      <small>ORDER TOTAL</small>
                      <strong>{money(order.total)}</strong>
                      <span>{order.paymentMethod}</span>
                    </div>
                  </div>

                  {!cancelled && (
                    <div className="order-progress">
                      {STATUS_STEPS.map((step, index) => {
                        const reached =
                          index <= statusIndex(order.status);

                        return (
                          <div
                            key={step}
                            className={reached ? 'reached' : ''}
                          >
                            <span>
                              {reached ? <CheckCircle2 /> : index + 1}
                            </span>
                            <small>{statusLabel(step)}</small>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {cancelled && (
                    <div className="order-cancel-note">
                      <XCircle />
                      This order was cancelled. Open the details to review the order.
                    </div>
                  )}

                  <div className="order-card-footer">
                    <span>
                      <CalendarDays />
                      {formatDate(order.createdAt)}
                    </span>

                    <div>
                      <button
                        type="button"
                        onClick={() => setSelected(order)}
                      >
                        View Details <ChevronRight />
                      </button>

                      {(delivered || cancelled) && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => shopAgain(order)}
                        >
                          <RefreshCcw /> Shop Again
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : orders.length === 0 ? (
          <SampleOrdersPreview />
        ) : (
          <OrdersEmpty
            title="No orders in this section"
            description="Orders matching this filter will appear here."
          />
        )}
      </section>

      {selected && (
        <div className="order-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="order-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="order-modal-close" onClick={() => setSelected(null)}>
              <X />
            </button>

            <div className="order-modal-head">
              <span className="order-modal-icon"><Package /></span>
              <div>
                <small>{selected.businessName}</small>
                <h2>{selected.orderNumber}</h2>
                <p>Placed {formatDate(selected.createdAt)}</p>
              </div>
              <span className={`order-status ${selected.status.replace(/\s+/g, '-')}`}>
                {statusLabel(selected.status)}
              </span>
            </div>

            {selected.status !== 'cancelled' && (
              <div className="order-modal-timeline">
                {STATUS_STEPS.map((step, index) => {
                  const reached = index <= statusIndex(selected.status);

                  return (
                    <article key={step} className={reached ? 'reached' : ''}>
                      <span>{reached ? <CheckCircle2 /> : index + 1}</span>
                      <strong>{statusLabel(step)}</strong>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="order-modal-section">
              <h3>Items in this order</h3>

              <div className="order-items">
                {selected.items.length ? (
                  selected.items.map((item) => (
                    <article key={item.id}>
                      {item.image ? (
                        <img src={item.image} alt="" />
                      ) : (
                        <span><Package /></span>
                      )}

                      <div>
                        <strong>{item.title}</strong>
                        <p>
                          {[
                            item.size ? `Size ${item.size}` : '',
                            item.color ? item.color : '',
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Standard variant'}
                        </p>
                        <small>
                          {item.quantity} × {money(item.price)}
                        </small>
                      </div>

                      <b>{money(item.subtotal)}</b>
                    </article>
                  ))
                ) : (
                  <p className="order-no-items">
                    Product details are not available for this older order.
                  </p>
                )}
              </div>
            </div>

            <div className="order-details-grid">
              <article>
                <MapPin />
                <span>
                  <small>DELIVERY ADDRESS</small>
                  <strong>{selected.address || 'Address not available'}</strong>
                </span>
              </article>

              <article>
                <Banknote />
                <span>
                  <small>PAYMENT METHOD</small>
                  <strong>{selected.paymentMethod}</strong>
                </span>
              </article>

              <article>
                <Store />
                <span>
                  <small>FULFILLED BY</small>
                  <strong>{selected.businessName}</strong>
                </span>
              </article>

              <article>
                <Clock3 />
                <span>
                  <small>LAST UPDATED</small>
                  <strong>{formatDate(selected.updatedAt || selected.createdAt)}</strong>
                </span>
              </article>
            </div>

            <div className="order-bill">
              <div><span>Subtotal</span><strong>{money(selected.subtotal)}</strong></div>
              <div><span>Delivery charge</span><strong>{money(selected.deliveryCharge)}</strong></div>
              <div><span>Platform fee</span><strong>{money(selected.platformFee)}</strong></div>
              <div className="discount"><span>Discount</span><strong>-{money(selected.discount)}</strong></div>
              <div className="total"><span>Total paid</span><strong>{money(selected.total)}</strong></div>
            </div>

            <button
              type="button"
              className="order-number-copy"
              onClick={() => void copyOrderNumber(selected.orderNumber)}
            >
              <span>
                <small>ORDER NUMBER</small>
                <strong>{selected.orderNumber}</strong>
              </span>
              {copiedOrder === selected.orderNumber ? <CheckCircle2 /> : <Copy />}
            </button>

            <div className="order-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  window.location.href = '/contact';
                }}
              >
                <Headphones /> Get Help
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => shopAgain(selected)}
              >
                <RefreshCcw /> Shop Again
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .orders-page{width:100%;display:grid;gap:22px;color:#20252b}
        .orders-hero{position:relative;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px;overflow:hidden;border:1px solid #e4e7ec;border-radius:28px;background:radial-gradient(circle at 82% 18%,rgba(242,138,0,.13),transparent 28%),linear-gradient(135deg,#fff,#fffaf4);box-shadow:0 16px 42px rgba(42,48,61,.07)}
        .orders-hero:after{content:'📦';position:absolute;right:290px;top:24px;font-size:72px;opacity:.16}
        .orders-eyebrow{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#a95d00;background:#fff0db;font-size:10px;font-weight:600;letter-spacing:.08em}
        .orders-hero h2{margin:12px 0 7px;font-size:clamp(26px,3vw,38px);line-height:1.12;font-weight:600;letter-spacing:-.03em}
        .orders-hero p{max-width:700px;margin:0;color:#6d7580;font-size:14px;line-height:1.6}
        .orders-value-card{position:relative;z-index:1;min-width:250px;padding:21px;border:1px solid #f1d1a7;border-radius:21px;background:rgba(255,255,255,.90);box-shadow:0 15px 34px rgba(140,79,0,.09)}
        .orders-value-card small,.orders-value-card strong,.orders-value-card span{display:block}
        .orders-value-card small{color:#8d765e;font-size:9px;letter-spacing:.09em}
        .orders-value-card strong{margin-top:6px;color:#c46a00;font-size:34px;font-weight:600}
        .orders-value-card span{margin-top:3px;color:#6d7580;font-size:12px}

        .orders-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        .orders-summary-grid article{min-width:0;min-height:112px;padding:17px;display:flex;align-items:center;gap:13px;border:1px solid #e4e7ec;border-radius:21px;background:#fff;box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .orders-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}
        .orders-summary-icon svg{width:24px}
        .orders-summary-icon.purple{color:#6734da;background:#eee8ff}
        .orders-summary-icon.orange{color:#df7a00;background:#fff0db}
        .orders-summary-icon.green{color:#159b50;background:#e8f8ef}
        .orders-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .orders-summary-grid small,.orders-summary-grid strong,.orders-summary-grid p{display:block}
        .orders-summary-grid small{font-size:11px;font-weight:500}
        .orders-summary-grid strong{margin-top:4px;font-size:26px;font-weight:600}
        .orders-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .orders-toolbar{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e4e7ec;border-radius:18px;background:#fff}
        .orders-tabs{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}
        .orders-tabs::-webkit-scrollbar{display:none}
        .orders-tabs button{min-height:38px;padding:0 13px;flex:0 0 auto;border:1px solid transparent;border-radius:11px;color:#68717c;background:transparent;font-weight:500;cursor:pointer}
        .orders-tabs button.active{color:#995400;border-color:#f0c991;background:#fff2e1}
        .orders-search{width:min(320px,100%);min-height:40px;padding:0 12px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}
        .orders-search svg{width:18px;color:#818996}
        .orders-search input{width:100%;border:0;outline:0;background:transparent;color:#252a30}

        .orders-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}
        .orders-message svg{width:20px}.orders-message span{flex:1}.orders-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .orders-list-section{padding:22px;border:1px solid #e4e7ec;border-radius:26px;background:#fff;box-shadow:0 15px 40px rgba(42,48,61,.06)}
        .orders-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
        .orders-section-head h2{margin:0;font-size:23px;font-weight:600}
        .orders-section-head p{margin:5px 0 0;color:#707985;font-size:13px}
        .orders-section-head>span{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:999px;color:#a45c00;background:#fff0db;font-size:11px}
        .orders-section-head>span svg{width:15px}

        .orders-list{display:grid;gap:15px}
        .order-card{padding:18px;border:1px solid #e3e7ec;border-radius:22px;background:linear-gradient(180deg,#fff,#fbfcfe);box-shadow:0 11px 28px rgba(42,48,61,.06)}
        .order-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px}
        .order-business{display:flex;align-items:center;gap:11px;min-width:0}
        .order-business img,.order-business>span{width:46px;height:46px;display:grid;place-items:center;object-fit:cover;flex:0 0 auto;border-radius:15px;color:#fff;background:linear-gradient(135deg,#df8500,#a95400);font-size:11px;font-weight:600}
        .order-business small,.order-business strong{display:block}
        .order-business small{overflow:hidden;color:#707985;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
        .order-business strong{margin-top:3px;font-size:14px;font-weight:600}
        .order-status{padding:7px 9px;border-radius:999px;font-size:9px;white-space:nowrap}
        .order-status.placed,.order-status.pending,.order-status.processing{color:#a96100;background:#fff1df}
        .order-status.confirmed,.order-status.ready{color:#315fa8;background:#edf4ff}
        .order-status.out-for-delivery{color:#6035c4;background:#eee8ff}
        .order-status.delivered{color:#138645;background:#e8f8ee}
        .order-status.cancelled{color:#b5414a;background:#fff0f1}

        .order-main{margin-top:15px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #e7eaee;border-radius:17px;background:#fafbfc}
        .order-product-preview{display:flex;align-items:center;gap:12px;min-width:0}
        .order-product-preview img,.order-product-preview>span{width:62px;height:62px;display:grid;place-items:center;object-fit:cover;flex:0 0 auto;border-radius:14px;color:#777f8a;background:#eef1f4}
        .order-product-preview strong,.order-product-preview p{display:block}
        .order-product-preview strong{overflow:hidden;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
        .order-product-preview p{margin:5px 0 0;color:#707985;font-size:11px}
        .order-total{text-align:right;flex:0 0 auto}
        .order-total small,.order-total strong,.order-total span{display:block}
        .order-total small{color:#7a828d;font-size:8px;letter-spacing:.08em}
        .order-total strong{margin-top:4px;font-size:20px;font-weight:600}
        .order-total span{margin-top:4px;color:#707985;font-size:10px}

        .order-progress{position:relative;margin-top:18px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
        .order-progress:before{content:'';position:absolute;left:5%;right:5%;top:16px;height:3px;border-radius:999px;background:#e5e8ed}
        .order-progress>div{position:relative;z-index:1;display:grid;justify-items:center;text-align:center}
        .order-progress>div>span{width:34px;height:34px;display:grid;place-items:center;border:3px solid #e3e7ec;border-radius:50%;color:#7a828d;background:#fff;font-size:10px}
        .order-progress>div.reached>span{border-color:#19a85a;color:#fff;background:#19a85a}
        .order-progress>div svg{width:16px}
        .order-progress small{margin-top:7px;color:#7b838e;font-size:9px}
        .order-progress>div.reached small{color:#168848}

        .order-cancel-note{margin-top:15px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #f0d2d5;border-radius:13px;color:#a9434b;background:#fff5f6;font-size:12px}
        .order-cancel-note svg{width:18px}
        .order-card-footer{margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:14px}
        .order-card-footer>span{display:flex;align-items:center;gap:6px;color:#76808b;font-size:10px}
        .order-card-footer>span svg{width:14px}
        .order-card-footer>div{display:flex;gap:9px}
        .order-card-footer button{min-height:40px;padding:0 13px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e1e4e9;border-radius:11px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}
        .order-card-footer button.primary{border-color:#d97c00;color:#fff;background:#e58900}
        .order-card-footer svg{width:16px}

        .orders-loading{min-height:420px;display:grid;place-items:center;align-content:center;gap:13px;color:#717a85}
        .orders-loading span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#e58900;border-radius:50%;animation:ordersSpin .8s linear infinite}
        .orders-empty-page,.orders-empty{min-height:340px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}
        .orders-empty-page>svg,.orders-empty>svg{width:50px;height:50px;color:#d67c0b}
        .orders-empty-page h2,.orders-empty h3{margin:12px 0 5px}.orders-empty-page p,.orders-empty p{max-width:520px;margin:0;color:#707985}

        .orders-sample{padding:20px;border:1px dashed #cfd6e2;border-radius:22px;background:linear-gradient(180deg,#fcfdff,#f8fafc)}
        .orders-sample-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}
        .orders-sample-head h3{margin:0;font-size:19px;font-weight:600}.orders-sample-head p{margin:6px 0 0;color:#707985;font-size:13px}
        .orders-sample-head span{padding:8px 11px;border-radius:999px;color:#a35b00;background:#fff0db;font-size:10px;font-weight:600}
        .orders-sample-card{padding:18px;border:1px solid #e2e6ec;border-radius:20px;background:#fff;box-shadow:0 12px 28px rgba(42,48,61,.06)}
        .orders-sample-card .order-card-footer button{cursor:not-allowed;opacity:.7}
        .orders-sample-note{margin-top:14px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px}

        .order-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .order-modal{position:relative;width:min(760px,100%);max-height:92vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}
        .order-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .order-modal-head{padding-right:48px;display:grid;grid-template-columns:58px minmax(0,1fr) auto;align-items:center;gap:13px}
        .order-modal-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;color:#d77900;background:#fff0db}
        .order-modal-head small,.order-modal-head h2,.order-modal-head p{display:block}.order-modal-head small{color:#7a828d;font-size:10px}.order-modal-head h2{margin:5px 0 3px;font-size:25px;font-weight:600}.order-modal-head p{margin:0;color:#707985;font-size:11px}
        .order-modal-timeline{position:relative;margin-top:23px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
        .order-modal-timeline:before{content:'';position:absolute;left:6%;right:6%;top:18px;height:3px;background:#e5e8ed}
        .order-modal-timeline article{position:relative;z-index:1;display:grid;justify-items:center;text-align:center}
        .order-modal-timeline article>span{width:38px;height:38px;display:grid;place-items:center;border:3px solid #e3e7ec;border-radius:50%;color:#7a828d;background:#fff;font-size:10px}
        .order-modal-timeline article.reached>span{border-color:#19a85a;color:#fff;background:#19a85a}
        .order-modal-timeline svg{width:17px}.order-modal-timeline strong{margin-top:8px;font-size:10px;font-weight:500}
        .order-modal-section{margin-top:23px}.order-modal-section h3{margin:0 0 12px;font-size:16px;font-weight:600}
        .order-items{display:grid;gap:10px}
        .order-items article{padding:11px;display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:11px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}
        .order-items img,.order-items article>span{width:54px;height:54px;display:grid;place-items:center;object-fit:cover;border-radius:12px;background:#eef1f4}
        .order-items strong,.order-items p,.order-items small{display:block}.order-items strong{font-size:13px;font-weight:600}.order-items p{margin:4px 0;color:#777f8a;font-size:10px}.order-items small{color:#5f6873;font-size:10px}.order-items b{font-size:13px;font-weight:600}
        .order-no-items{padding:15px;color:#707985;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}
        .order-details-grid{margin-top:17px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .order-details-grid article{padding:13px;display:flex;align-items:flex-start;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}
        .order-details-grid svg{width:19px;color:#d77900;flex:0 0 auto}.order-details-grid small,.order-details-grid strong{display:block}.order-details-grid small{color:#7c8490;font-size:8px}.order-details-grid strong{margin-top:3px;font-size:12px;font-weight:500}
        .order-bill{margin-top:17px;padding:15px;border:1px solid #e6e9ed;border-radius:15px;background:#fafbfc}
        .order-bill>div{padding:6px 0;display:flex;justify-content:space-between;gap:12px;color:#5f6873;font-size:12px}
        .order-bill strong{font-weight:500}.order-bill .discount{color:#158a48}.order-bill .total{margin-top:5px;padding-top:12px;border-top:1px solid #e1e5ea;color:#222;font-size:15px}.order-bill .total strong{font-weight:600}
        .order-number-copy{width:100%;margin-top:15px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;border:1px dashed #efc58c;border-radius:14px;color:#9e5900;background:#fff8ee;text-align:left;cursor:pointer}
        .order-number-copy small,.order-number-copy strong{display:block}.order-number-copy small{font-size:8px}.order-number-copy strong{margin-top:3px;font-size:14px;font-weight:600}
        .order-modal-actions{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .order-modal-actions button{min-height:46px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #e0e4e9;border-radius:13px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}
        .order-modal-actions button.primary{border-color:#d97c00;color:#fff;background:#e58900}
        .order-modal-actions svg{width:17px}

        @keyframes ordersSpin{to{transform:rotate(360deg)}}

        @media(max-width:1200px){
          .orders-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media(max-width:850px){
          .orders-hero{display:block}.orders-value-card{margin-top:18px}.orders-hero:after{display:none}
          .orders-toolbar{align-items:stretch;flex-direction:column}.orders-search{width:100%}
        }

        @media(max-width:650px){
          .orders-summary-grid{grid-template-columns:1fr}
          .orders-list-section{padding:17px}.orders-section-head{display:block}.orders-section-head>span{margin-top:12px}
          .order-main{align-items:flex-start;flex-direction:column}.order-total{text-align:left}
          .order-progress{overflow-x:auto;grid-template-columns:repeat(5,110px);scrollbar-width:none}.order-progress::-webkit-scrollbar{display:none}
          .order-card-footer{align-items:flex-start;flex-direction:column}.order-card-footer>div{width:100%;display:grid;grid-template-columns:1fr}
          .order-modal{padding:21px}.order-modal-head{grid-template-columns:52px minmax(0,1fr);padding-right:38px}.order-modal-head>.order-status{grid-column:2;justify-self:start}
          .order-modal-timeline{overflow-x:auto;grid-template-columns:repeat(5,105px);scrollbar-width:none}.order-modal-timeline::-webkit-scrollbar{display:none}
          .order-details-grid,.order-modal-actions{grid-template-columns:1fr}
          .orders-sample-head{display:block}.orders-sample-head span{display:inline-flex;margin-top:10px}
        }

        .dash-guest-preview-note{
          width:100%;
          padding:12px 14px;
          display:flex;
          align-items:center;
          gap:9px;
          border:1px solid #cfe5f0;
          border-radius:14px;
          color:#245b6d;
          background:#eef9fc;
          font-size:12px;
          line-height:1.4;
        }
        .dash-guest-preview-note svg{
          width:18px;
          height:18px;
          flex:0 0 auto;
          color:#087e98;
        }
        .dash-guest-preview-note span{
          min-width:0;
          flex:1;
        }
        .dash-guest-preview-note button{
          min-height:36px;
          padding:0 13px;
          flex:0 0 auto;
          border:0;
          border-radius:10px;
          color:#fff;
          background:#087e98;
          font-weight:600;
          cursor:pointer;
        }

        @media(max-width:650px){
          .dash-guest-preview-note{
            align-items:flex-start;
            flex-wrap:wrap;
          }
          .dash-guest-preview-note button{
            width:100%;
          }
        }


        /* ===== FINAL MOBILE METRIC GRID: 2 CARDS PER ROW ===== */
        @media(max-width:650px){
          .orders-summary-grid{
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:10px!important;
          }

          .orders-summary-grid article{
            width:100%!important;
            min-width:0!important;
            min-height:112px!important;
            padding:13px 10px!important;
            display:flex!important;
            flex-direction:column!important;
            align-items:flex-start!important;
            justify-content:center!important;
            gap:8px!important;
            overflow:hidden!important;
            border-radius:17px!important;
          }

          .orders-summary-icon{
            width:40px!important;
            height:40px!important;
            border-radius:13px!important;
          }

          .orders-summary-icon svg{
            width:20px!important;
            height:20px!important;
          }

          .orders-summary-grid article>div{
            width:100%!important;
            min-width:0!important;
          }

          .orders-summary-grid small{
            font-size:10px!important;
            line-height:1.2!important;
            white-space:normal!important;
          }

          .orders-summary-grid strong{
            margin-top:3px!important;
            font-size:22px!important;
            line-height:1!important;
          }

          .orders-summary-grid p{
            margin-top:5px!important;
            font-size:9px!important;
            line-height:1.25!important;
            white-space:normal!important;
          }
        }

        @media(max-width:380px){
          .orders-summary-grid{
            gap:8px!important;
          }

          .orders-summary-grid article{
            padding:11px 9px!important;
          }

          .orders-summary-grid strong{
            font-size:20px!important;
          }
        }

      `}</style>
    </div>
  );
}

function OrdersEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="orders-empty">
      <Package />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function SampleOrdersPreview() {
  return (
    <div className="orders-sample">
      <div className="orders-sample-head">
        <div>
          <h3>See how your real orders will appear</h3>
          <p>
            This is sample data only. Your actual products, status and totals
            will replace it after you place an order.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="orders-sample-card">
        <div className="order-card-head">
          <div className="order-business">
            <span>DF</span>
            <div>
              <small>DOTZ Fashion</small>
              <strong>SPOTC-482916</strong>
            </div>
          </div>

          <span className="order-status out-for-delivery">
            Out for delivery
          </span>
        </div>

        <div className="order-main">
          <div className="order-product-preview">
            <span><Package /></span>
            <div>
              <strong>Premium Cotton Shirt</strong>
              <p>1 × ₹1,499 · +1 more item</p>
            </div>
          </div>

          <div className="order-total">
            <small>ORDER TOTAL</small>
            <strong>₹2,299</strong>
            <span>Cash on Delivery</span>
          </div>
        </div>

        <div className="order-progress">
          {STATUS_STEPS.map((step, index) => (
            <div key={step} className={index <= 3 ? 'reached' : ''}>
              <span>{index <= 3 ? <CheckCircle2 /> : index + 1}</span>
              <small>{statusLabel(step)}</small>
            </div>
          ))}
        </div>

        <div className="order-card-footer">
          <span><CalendarDays /> 21 Jul 2026, 12:30 PM</span>
          <div>
            <button type="button" disabled>View Details</button>
            <button type="button" className="primary" disabled>
              Track Order
            </button>
          </div>
        </div>

        <div className="orders-sample-note">
          <BadgeCheck />
          Sample orders are never counted in your order totals or spending.
        </div>
      </article>
    </div>
  );
}