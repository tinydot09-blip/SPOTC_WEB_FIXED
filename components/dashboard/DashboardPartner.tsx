'use client';

import {
  BadgeCheck,
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  Gift,
  Handshake,
  Link2,
  Package,
  QrCode,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type PartnerRecord = {
  id: string;
  businessId: string;
  businessName: string;
  businessLogo: string;
  businessSlug: string;
  partnerCode: string;
  status: string;
  commissionPercent: number;
  totalClicks: number;
  totalOrders: number;
  totalSales: number;
  totalCommission: number;
  availableBalance: number;
  withdrawnAmount: number;
  createdAt: Date | null;
  raw: DocumentData;
};

type PartnerRequest = {
  id: string;
  businessNames: string[];
  status: string;
  createdAt: Date | null;
};

type ProductRecord = {
  id: string;
  title: string;
  image: string;
  price: number;
  oldPrice: number;
  discount: string;
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function dateOf(value: unknown): Date | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  if (value instanceof Date) return value;

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

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDate(date: Date | null): string {
  if (!date) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'S';
}

function mapPartner(id: string, data: DocumentData): PartnerRecord {
  return {
    id,
    businessId:
      refIdOf(data.business_ref) ||
      textOf(data.business_id),
    businessName:
      textOf(data.business_name) ||
      textOf(data.shop_name) ||
      'SPOTC Business',
    businessLogo:
      textOf(data.business_logo) ||
      textOf(data.logo_url),
    businessSlug:
      textOf(data.business_slug) ||
      textOf(data.slug) ||
      textOf(data.vanity_url) ||
      textOf(data.business_username),
    partnerCode:
      textOf(data.partner_code) ||
      textOf(data.code) ||
      `SPOTC-${id.slice(0, 6).toUpperCase()}`,
    status: textOf(data.status).toLowerCase() || 'active',
    commissionPercent:
      numberOf(data.commission_percent) || 5,
    totalClicks: numberOf(data.total_clicks),
    totalOrders: numberOf(data.total_orders),
    totalSales: numberOf(data.total_sales),
    totalCommission: numberOf(data.total_commission),
    availableBalance: numberOf(data.available_balance),
    withdrawnAmount: numberOf(data.withdrawn_amount),
    createdAt: dateOf(data.created_at),
    raw: data,
  };
}

function mapRequest(id: string, data: DocumentData): PartnerRequest {
  const namesRaw = data.business_names;

  return {
    id,
    businessNames: Array.isArray(namesRaw)
      ? namesRaw.map(textOf).filter(Boolean)
      : [textOf(data.business_name)].filter(Boolean),
    status: textOf(data.status).toLowerCase() || 'pending',
    createdAt: dateOf(data.created_at),
  };
}

function mapProduct(id: string, data: DocumentData): ProductRecord {
  return {
    id,
    title:
      textOf(data.title) ||
      textOf(data.product_name) ||
      'Product',
    image:
      textOf(data.product_thumbnail) ||
      textOf(data.image) ||
      textOf(data.image_url) ||
      textOf(data.thumbnail_url) ||
      (Array.isArray(data.images) ? textOf(data.images[0]) : ''),
    price: numberOf(
      data.price ??
        data.offer_price ??
        data.selling_price,
    ),
    oldPrice: numberOf(
      data.old_price ??
        data.mrp,
    ),
    discount: textOf(data.discount),
  };
}

export default function DashboardPartner() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPartner, setSelectedPartner] =
    useState<PartnerRecord | null>(null);
  const [productsPartner, setProductsPartner] =
    useState<PartnerRecord | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [qrPartner, setQrPartner] = useState<PartnerRecord | null>(null);
  const [withdrawPartner, setWithdrawPartner] =
    useState<PartnerRecord | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [copied, setCopied] = useState('');
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
      setPartners([]);
      setRequests([]);
      setLoading(false);
      return;
    }

    let active = true;
    const currentUser = user;

    async function loadPartnerData() {
      setLoading(true);

      try {
        const db = getFirestore();

        const [partnerSnapshot, requestSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, 'BusinessPartners'),
              where(
                'partner_uid',
                '==',
                currentUser.uid,
              ),
              limit(100),
            ),
          ).catch(() => null),
          getDocs(
            query(
              collection(db, 'ShopPartnerRequests'),
              where(
                'user_uid',
                '==',
                currentUser.uid,
              ),
              limit(100),
            ),
          ).catch(() => null),
        ]);

        if (!active) return;

        setPartners(
          (partnerSnapshot?.docs.map((partnerDoc) =>
            mapPartner(partnerDoc.id, partnerDoc.data()),
          ) ?? []).sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          ),
        );

        setRequests(
          (requestSnapshot?.docs.map((requestDoc) =>
            mapRequest(requestDoc.id, requestDoc.data()),
          ) ?? []).sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          ),
        );
      } catch (error) {
        console.error('Partner dashboard load failed:', error);
        setMessage('Some partner information could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPartnerData();

    return () => {
      active = false;
    };
  }, [authChecked, user]);

  const summary = useMemo(() => {
    const activePartners = partners.filter(
      (partner) => partner.status === 'active',
    );

    const totalClicks = partners.reduce(
      (sum, partner) => sum + partner.totalClicks,
      0,
    );

    const totalOrders = partners.reduce(
      (sum, partner) => sum + partner.totalOrders,
      0,
    );

    const totalSales = partners.reduce(
      (sum, partner) => sum + partner.totalSales,
      0,
    );

    const totalCommission = partners.reduce(
      (sum, partner) => sum + partner.totalCommission,
      0,
    );

    const available = partners.reduce(
      (sum, partner) => sum + partner.availableBalance,
      0,
    );

    const withdrawn = partners.reduce(
      (sum, partner) => sum + partner.withdrawnAmount,
      0,
    );

    return {
      shops: partners.length,
      activeShops: activePartners.length,
      clicks: totalClicks,
      orders: totalOrders,
      sales: totalSales,
      commission: totalCommission,
      available,
      withdrawn,
      conversion:
        totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0,
    };
  }, [partners]);

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return partners;

    return partners.filter(
      (partner) =>
        partner.businessName.toLowerCase().includes(term) ||
        partner.partnerCode.toLowerCase().includes(term) ||
        partner.status.toLowerCase().includes(term),
    );
  }, [partners, search]);

  const pendingRequests = requests.filter(
    (request) => request.status === 'pending',
  );

  const requireSignIn = (action: string): boolean => {
    if (user) return true;

    setMessage(`Sign in to ${action}. You can continue browsing this preview.`);
    return false;
  };

  const partnerLinkOf = (partner: PartnerRecord): string => {
    if (partner.partnerCode) {
      return `${window.location.origin}/r/${encodeURIComponent(
        partner.partnerCode,
      )}`;
    }

    if (partner.businessSlug) {
      return `${window.location.origin}/${encodeURIComponent(
        partner.businessSlug,
      )}`;
    }

    return `${window.location.origin}/shop?business=${encodeURIComponent(
      partner.businessId,
    )}`;
  };

  const openBusiness = (partner: PartnerRecord) => {
    if (partner.businessSlug) {
      window.location.href = `/${encodeURIComponent(
        partner.businessSlug.replace(/^\/+|\/+$/g, ''),
      )}`;
      return;
    }

    window.location.href = partner.businessId
      ? `/shop?business=${encodeURIComponent(partner.businessId)}`
      : '/shop';
  };

  const sharePartnerShop = async (partner: PartnerRecord) => {
    if (!requireSignIn('share a real partner shop')) return;

    const url = partnerLinkOf(partner);
    const text =
      `Shop ${partner.businessName} on SPOTC through my partner link. ` +
      `I earn ${partner.commissionPercent}% commission on successful orders.`;

    try {
      const share =
        typeof navigator.share === 'function'
          ? navigator.share.bind(navigator)
          : null;

      if (share) {
        await share({
          title: partner.businessName,
          text,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(partner.id);
      window.setTimeout(() => setCopied(''), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('Unable to share this partner shop right now.');
    }
  };

  const copyPartnerLink = async (partner: PartnerRecord) => {
    if (!requireSignIn('copy a real partner link')) return;

    try {
      await navigator.clipboard.writeText(partnerLinkOf(partner));
      setCopied(partner.id);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setMessage('Unable to copy the partner link.');
    }
  };

  const loadProducts = async (partner: PartnerRecord) => {
    if (!requireSignIn('load products for a real partner shop')) return;

    setProductsPartner(partner);
    setProductsLoading(true);
    setProducts([]);

    try {
      const db = getFirestore();
      const snapshots = await Promise.all([
        partner.businessId
          ? getDocs(
              query(
                collection(db, 'BusinessProducts'),
                where(
                  'business_ref',
                  '==',
                  doc(db, 'BusinessListings', partner.businessId),
                ),
                where('isActive', '==', true),
                limit(100),
              ),
            ).catch(() => null)
          : Promise.resolve(null),
        getDocs(
          query(
            collection(db, 'BusinessProducts'),
            where('business_name', '==', partner.businessName),
            where('isActive', '==', true),
            limit(100),
          ),
        ).catch(() => null),
      ]);

      const unique = new Map<string, ProductRecord>();

      for (const snapshot of snapshots) {
        for (const productDoc of snapshot?.docs ?? []) {
          unique.set(
            productDoc.id,
            mapProduct(productDoc.id, productDoc.data()),
          );
        }
      }

      setProducts([...unique.values()]);
    } catch (error) {
      console.error('Partner products load failed:', error);
      setMessage('Unable to load products for this shop.');
    } finally {
      setProductsLoading(false);
    }
  };

  const shareProduct = async (
    partner: PartnerRecord,
    product: ProductRecord,
  ) => {
    if (!requireSignIn('share a real partner product')) return;

    const url =
      `${window.location.origin}/product/${encodeURIComponent(
        product.id,
      )}?partner=${encodeURIComponent(partner.partnerCode)}`;

    const text =
      `${product.title} from ${partner.businessName} — ` +
      `${money(product.price)} on SPOTC.`;

    try {
      const share =
        typeof navigator.share === 'function'
          ? navigator.share.bind(navigator)
          : null;

      if (share) {
        await share({
          title: product.title,
          text,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(`${text} ${url}`);
      setMessage('Product link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('Unable to share this product.');
    }
  };

  const submitWithdraw = async () => {
    if (!user || !withdrawPartner || withdrawBusy) return;

    const amount = Number(withdrawAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > withdrawPartner.availableBalance
    ) {
      setMessage('Enter a valid withdrawal amount within the available balance.');
      return;
    }

    setWithdrawBusy(true);

    try {
      const db = getFirestore();

      await addDoc(collection(db, 'PartnerWithdrawRequests'), {
        partner_ref: doc(
          db,
          'BusinessPartners',
          withdrawPartner.id,
        ),
        partner_uid: user.uid,
        partner_name: user.displayName ?? '',
        partner_email: user.email ?? '',
        business_ref: withdrawPartner.businessId
          ? doc(
              db,
              'BusinessListings',
              withdrawPartner.businessId,
            )
          : null,
        business_name: withdrawPartner.businessName,
        partner_code: withdrawPartner.partnerCode,
        amount,
        status: 'pending',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setWithdrawPartner(null);
      setWithdrawAmount('');
      setMessage('Withdrawal request submitted for review.');
    } catch (error) {
      console.error('Withdraw request failed:', error);
      setMessage('Unable to submit the withdrawal request.');
    } finally {
      setWithdrawBusy(false);
    }
  };

  if (!authChecked || loading) {
    return (
      <section className="partner-loading">
        <span />
        <p>Loading your partner dashboard…</p>
      </section>
    );
  }

  return (
    <div className="partner-page">
      {!user && (
        <div className="dash-guest-preview-note">
          <Sparkles />
          <span>
            Guest preview: explore the complete Partner page. Sign in only to
            apply, share, copy links, load products or withdraw.
          </span>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/login?next=/dashboard?tab=partner';
            }}
          >
            Sign In
          </button>
        </div>
      )}
      <section className="partner-hero">
        <div>
          <span className="partner-eyebrow">
            <Sparkles /> SPOTC SHOP PARTNER
          </span>
          <h2>Own the online sales. Share, sell and earn.</h2>
          <p>
            Manage nearby SPOTC shops, share their products and earn
            commission on every successful order generated through your
            partner link.
          </p>
        </div>

        <div className="partner-hero-value">
          <small>AVAILABLE TO WITHDRAW</small>
          <strong>{money(summary.available)}</strong>
          <span>{summary.activeShops} active partner shops</span>
        </div>
      </section>

      <section className="partner-summary-grid">
        <article>
          <span className="partner-summary-icon green">
            <WalletCards />
          </span>
          <div>
            <small>Available</small>
            <strong>{money(summary.available)}</strong>
            <p>Ready for withdrawal</p>
          </div>
        </article>

        <article>
          <span className="partner-summary-icon orange">
            <TrendingUp />
          </span>
          <div>
            <small>Total Earned</small>
            <strong>{money(summary.commission)}</strong>
            <p>Lifetime commission</p>
          </div>
        </article>

        <article>
          <span className="partner-summary-icon purple">
            <Store />
          </span>
          <div>
            <small>Partner Shops</small>
            <strong>{summary.shops}</strong>
            <p>{summary.activeShops} active</p>
          </div>
        </article>

        <article>
          <span className="partner-summary-icon blue">
            <ShoppingBag />
          </span>
          <div>
            <small>Partner Orders</small>
            <strong>{summary.orders}</strong>
            <p>{money(summary.sales)} in sales</p>
          </div>
        </article>
      </section>

      <section className="partner-insight-grid">
        <article>
          <div>
            <small>LINK PERFORMANCE</small>
            <strong>{summary.clicks.toLocaleString('en-IN')} clicks</strong>
            <p>
              {summary.conversion.toFixed(1)}% of clicks became successful orders.
            </p>
          </div>
          <BarChart3 />
        </article>

        <article>
          <div>
            <small>WITHDRAWN SO FAR</small>
            <strong>{money(summary.withdrawn)}</strong>
            <p>Approved partner payouts already completed.</p>
          </div>
          <Banknote />
        </article>

        <article>
          <div>
            <small>STANDARD COMMISSION</small>
            <strong>5% per sale</strong>
            <p>Final percentage follows each active partner agreement.</p>
          </div>
          <CircleDollarSign />
        </article>
      </section>

      {pendingRequests.length > 0 && (
        <section className="partner-pending">
          <div>
            <Clock3 />
            <span>
              <strong>
                {pendingRequests.length} partner request
                {pendingRequests.length === 1 ? '' : 's'} pending
              </strong>
              <small>
                Selected shops are reviewing your request. Approved shops
                will appear below automatically.
              </small>
            </span>
          </div>

          <div className="partner-pending-list">
            {pendingRequests.slice(0, 3).map((request) => (
              <span key={request.id}>
                {request.businessNames.join(', ') || 'Selected shops'}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="partner-toolbar">
        <div>
          <h2>My partner shops</h2>
          <p>
            Share a shop, promote products, show your QR or request a payout.
          </p>
        </div>

        <label>
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shop or partner ID"
          />
        </label>
      </section>

      {message && (
        <div className="partner-message">
          <BadgeCheck />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}>
            <X />
          </button>
        </div>
      )}

      {visiblePartners.length ? (
        <section className="partner-shop-grid">
          {visiblePartners.map((partner) => (
            <article className="partner-shop-card" key={partner.id}>
              <div className="partner-shop-head">
                {partner.businessLogo ? (
                  <img src={partner.businessLogo} alt="" />
                ) : (
                  <span>{initialsOf(partner.businessName)}</span>
                )}

                <div>
                  <small>PARTNER SHOP</small>
                  <strong>{partner.businessName}</strong>
                  <p>Partner ID: {partner.partnerCode}</p>
                </div>

                <span
                  className={`partner-status ${
                    partner.status === 'active' ? 'active' : 'pending'
                  }`}
                >
                  {partner.status === 'active' ? 'Active' : partner.status}
                </span>
              </div>

              <div className="partner-commission-strip">
                <span>
                  <CircleDollarSign />
                  {partner.commissionPercent.toFixed(0)}% commission
                </span>
                <strong>{money(partner.availableBalance)} available</strong>
              </div>

              <div className="partner-metrics">
                <article>
                  <small>Clicks</small>
                  <strong>{partner.totalClicks.toLocaleString('en-IN')}</strong>
                </article>
                <article>
                  <small>Orders</small>
                  <strong>{partner.totalOrders.toLocaleString('en-IN')}</strong>
                </article>
                <article>
                  <small>Sales</small>
                  <strong>{money(partner.totalSales)}</strong>
                </article>
                <article>
                  <small>Earned</small>
                  <strong>{money(partner.totalCommission)}</strong>
                </article>
              </div>

              <div className="partner-link-box">
                <span>
                  <small>YOUR PARTNER LINK</small>
                  <strong>
                    /r/{partner.partnerCode}
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={() => void copyPartnerLink(partner)}
                >
                  {copied === partner.id ? (
                    <CheckCircle2 />
                  ) : (
                    <Copy />
                  )}
                </button>
              </div>

              <div className="partner-shop-actions">
                <button
                  type="button"
                  onClick={() => void sharePartnerShop(partner)}
                >
                  <Share2 /> Share Shop
                </button>

                <button
                  type="button"
                  onClick={() => void loadProducts(partner)}
                >
                  <Package /> Products
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!requireSignIn('show a real partner QR')) return;
                    setQrPartner(partner);
                  }}
                >
                  <QrCode /> QR Code
                </button>

                <button
                  type="button"
                  className="primary"
                  disabled={partner.availableBalance <= 0}
                  onClick={() => {
                    if (!requireSignIn('withdraw real partner earnings')) return;
                    setWithdrawPartner(partner);
                    setWithdrawAmount('');
                  }}
                >
                  <WalletCards /> Withdraw
                </button>
              </div>

              <button
                type="button"
                className="partner-view-shop"
                onClick={() => {
                  if (!requireSignIn('view real partner performance')) return;
                  setSelectedPartner(partner);
                }}
              >
                View full shop performance <ChevronRight />
              </button>
            </article>
          ))}
        </section>
      ) : partners.length === 0 ? (
        <PartnerSamplePreview />
      ) : (
        <section className="partner-empty-page">
          <Store />
          <h2>No partner shop found</h2>
          <p>Try another shop name or partner ID.</p>
        </section>
      )}

      {selectedPartner && (
        <div
          className="partner-modal-backdrop"
          onMouseDown={() => setSelectedPartner(null)}
        >
          <section
            className="partner-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="partner-modal-close"
              onClick={() => setSelectedPartner(null)}
            >
              <X />
            </button>

            <div className="partner-modal-head">
              {selectedPartner.businessLogo ? (
                <img src={selectedPartner.businessLogo} alt="" />
              ) : (
                <span>{initialsOf(selectedPartner.businessName)}</span>
              )}

              <div>
                <small>PARTNER PERFORMANCE</small>
                <h2>{selectedPartner.businessName}</h2>
                <p>
                  Active since {formatDate(selectedPartner.createdAt)}
                </p>
              </div>
            </div>

            <div className="partner-modal-stats">
              <article>
                <Users />
                <span>
                  <small>LINK CLICKS</small>
                  <strong>{selectedPartner.totalClicks}</strong>
                </span>
              </article>
              <article>
                <ShoppingBag />
                <span>
                  <small>ORDERS</small>
                  <strong>{selectedPartner.totalOrders}</strong>
                </span>
              </article>
              <article>
                <TrendingUp />
                <span>
                  <small>SALES GENERATED</small>
                  <strong>{money(selectedPartner.totalSales)}</strong>
                </span>
              </article>
              <article>
                <Gift />
                <span>
                  <small>COMMISSION EARNED</small>
                  <strong>{money(selectedPartner.totalCommission)}</strong>
                </span>
              </article>
            </div>

            <div className="partner-performance-note">
              <Sparkles />
              <span>
                <strong>Grow your earnings</strong>
                Share products with clear prices and offers. Product links
                usually convert better than a general shop link.
              </span>
            </div>

            <div className="partner-modal-actions">
              <button
                type="button"
                onClick={() => openBusiness(selectedPartner)}
              >
                <Store /> Open Shop
              </button>

              <button
                type="button"
                onClick={() => void sharePartnerShop(selectedPartner)}
              >
                <Share2 /> Share Shop
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => void loadProducts(selectedPartner)}
              >
                <Package /> Share Products
              </button>
            </div>
          </section>
        </div>
      )}

      {productsPartner && (
        <div
          className="partner-modal-backdrop"
          onMouseDown={() => setProductsPartner(null)}
        >
          <section
            className="partner-modal partner-products-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="partner-modal-close"
              onClick={() => setProductsPartner(null)}
            >
              <X />
            </button>

            <span className="partner-modal-kicker">
              <Package /> SHARE PRODUCTS
            </span>
            <h2>{productsPartner.businessName}</h2>
            <p>
              Every shared product link includes your partner code. Estimated
              earnings use the shop’s {productsPartner.commissionPercent}% rate.
            </p>

            {productsLoading ? (
              <div className="partner-products-loading">
                <span />
                Loading products…
              </div>
            ) : products.length ? (
              <div className="partner-products-list">
                {products.map((product) => (
                  <article key={product.id}>
                    {product.image ? (
                      <img src={product.image} alt="" />
                    ) : (
                      <span><Package /></span>
                    )}

                    <div>
                      <strong>{product.title}</strong>
                      <p>
                        {money(product.price)}
                        {product.oldPrice > product.price
                          ? ` · MRP ${money(product.oldPrice)}`
                          : ''}
                      </p>
                      <small>
                        Estimated commission{' '}
                        {money(
                          product.price *
                            (productsPartner.commissionPercent / 100),
                        )}
                      </small>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void shareProduct(productsPartner, product)
                      }
                    >
                      <Share2 /> Share
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="partner-products-empty">
                <Package />
                <h3>No active products found</h3>
                <p>
                  Products will appear after the business publishes them.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {qrPartner && (
        <div
          className="partner-modal-backdrop"
          onMouseDown={() => setQrPartner(null)}
        >
          <section
            className="partner-qr-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="partner-modal-close"
              onClick={() => setQrPartner(null)}
            >
              <X />
            </button>

            <span className="partner-modal-kicker">
              <QrCode /> PARTNER QR
            </span>
            <h2>{qrPartner.businessName}</h2>
            <p>
              Customers can scan this QR to open the shop through your partner link.
            </p>

            <div className="partner-qr-box">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                  partnerLinkOf(qrPartner),
                )}`}
                alt={`Partner QR for ${qrPartner.businessName}`}
              />
            </div>

            <button
              type="button"
              className="partner-qr-code"
              onClick={() => void copyPartnerLink(qrPartner)}
            >
              <small>PARTNER ID</small>
              <strong>{qrPartner.partnerCode}</strong>
              <span>
                {copied === qrPartner.id ? 'Link copied' : 'Tap to copy link'}
              </span>
            </button>

            <div className="partner-performance-note">
              <BadgeCheck />
              <span>
                Orders are attributed only when customers open the shop through
                this partner link or QR.
              </span>
            </div>
          </section>
        </div>
      )}

      {withdrawPartner && (
        <div
          className="partner-modal-backdrop"
          onMouseDown={() => setWithdrawPartner(null)}
        >
          <section
            className="partner-withdraw-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="partner-modal-close"
              onClick={() => setWithdrawPartner(null)}
            >
              <X />
            </button>

            <span className="partner-modal-kicker">
              <WalletCards /> WITHDRAW COMMISSION
            </span>
            <h2>{withdrawPartner.businessName}</h2>
            <p>
              Available balance: <strong>{money(withdrawPartner.availableBalance)}</strong>
            </p>

            <label className="partner-withdraw-field">
              <span>Withdrawal amount</span>
              <div>
                <b>₹</b>
                <input
                  type="number"
                  min="1"
                  max={withdrawPartner.availableBalance}
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="Enter amount"
                />
              </div>
            </label>

            <div className="partner-withdraw-info">
              <Clock3 />
              <span>
                Withdrawal requests are reviewed before payout. The available
                balance should be deducted only after approval.
              </span>
            </div>

            <button
              type="button"
              className="partner-withdraw-submit"
              disabled={withdrawBusy}
              onClick={() => void submitWithdraw()}
            >
              {withdrawBusy ? 'Submitting…' : 'Submit Withdrawal Request'}
            </button>
          </section>
        </div>
      )}

      <style jsx global>{`
        .partner-page{width:100%;display:grid;gap:22px;color:#20252b}
        .partner-hero{position:relative;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px;overflow:hidden;border:1px solid #e4e7ec;border-radius:28px;background:radial-gradient(circle at 82% 18%,rgba(109,60,223,.14),transparent 28%),linear-gradient(135deg,#fff,#faf8ff);box-shadow:0 16px 42px rgba(42,48,61,.07)}
        .partner-hero:after{content:'🤝';position:absolute;right:290px;top:25px;font-size:70px;opacity:.16}
        .partner-eyebrow,.partner-modal-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#6532cd;background:#eee7ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .partner-hero h2{margin:12px 0 7px;font-size:clamp(26px,3vw,38px);line-height:1.12;font-weight:600;letter-spacing:-.03em}
        .partner-hero p{max-width:720px;margin:0;color:#6d7580;font-size:14px;line-height:1.6}
        .partner-hero-value{position:relative;z-index:1;min-width:250px;padding:21px;border:1px solid #ddcffd;border-radius:21px;background:rgba(255,255,255,.90);box-shadow:0 15px 34px rgba(83,50,151,.10)}
        .partner-hero-value small,.partner-hero-value strong,.partner-hero-value span{display:block}
        .partner-hero-value small{color:#77658e;font-size:9px;letter-spacing:.09em}
        .partner-hero-value strong{margin-top:6px;color:#5725bd;font-size:34px;font-weight:600}
        .partner-hero-value span{margin-top:3px;color:#6d7580;font-size:12px}

        .partner-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        .partner-summary-grid>article{min-width:0;min-height:112px;padding:17px;display:flex;align-items:center;gap:13px;border:1px solid #e4e7ec;border-radius:21px;background:#fff;box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .partner-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}
        .partner-summary-icon svg{width:24px}
        .partner-summary-icon.green{color:#159b50;background:#e8f8ef}
        .partner-summary-icon.orange{color:#df7a00;background:#fff0db}
        .partner-summary-icon.purple{color:#6734da;background:#eee8ff}
        .partner-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .partner-summary-grid small,.partner-summary-grid strong,.partner-summary-grid p{display:block}
        .partner-summary-grid small{font-size:11px;font-weight:500}
        .partner-summary-grid strong{margin-top:4px;font-size:25px;font-weight:600}
        .partner-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .partner-insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .partner-insight-grid article{padding:18px;display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #e4e7ec;border-radius:20px;background:#fff}
        .partner-insight-grid small,.partner-insight-grid strong,.partner-insight-grid p{display:block}
        .partner-insight-grid small{color:#7b8490;font-size:9px;letter-spacing:.08em}
        .partner-insight-grid strong{margin-top:5px;font-size:19px;font-weight:600}
        .partner-insight-grid p{margin:5px 0 0;color:#707985;font-size:11px;line-height:1.45}
        .partner-insight-grid svg{width:31px;color:#6b39d8;flex:0 0 auto}

        .partner-pending{padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #efd8b5;border-radius:18px;background:#fff9ef}
        .partner-pending>div:first-child{display:flex;align-items:center;gap:11px}
        .partner-pending svg{width:22px;color:#d97900}.partner-pending strong,.partner-pending small{display:block}.partner-pending strong{font-size:13px;font-weight:600}.partner-pending small{margin-top:4px;color:#71685d;font-size:11px}
        .partner-pending-list{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.partner-pending-list span{padding:6px 9px;border-radius:999px;color:#9b5900;background:#fff0db;font-size:9px}

        .partner-toolbar{padding:17px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #e4e7ec;border-radius:20px;background:#fff}
        .partner-toolbar h2{margin:0;font-size:22px;font-weight:600}.partner-toolbar p{margin:5px 0 0;color:#707985;font-size:12px}
        .partner-toolbar label{width:min(320px,100%);min-height:42px;padding:0 12px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}
        .partner-toolbar label svg{width:18px;color:#818996}.partner-toolbar input{width:100%;border:0;outline:0;background:transparent}

        .partner-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}
        .partner-message svg{width:20px}.partner-message span{flex:1}.partner-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .partner-shop-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .partner-shop-card{min-width:0;padding:19px;border:1px solid #e3e7ec;border-radius:23px;background:linear-gradient(180deg,#fff,#fbfcfe);box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .partner-shop-head{display:grid;grid-template-columns:50px minmax(0,1fr) auto;align-items:center;gap:12px}
        .partner-shop-head img,.partner-shop-head>span:first-child{width:50px;height:50px;display:grid;place-items:center;object-fit:cover;border-radius:16px;color:#fff;background:linear-gradient(135deg,#6d3cdf,#43219a);font-size:12px;font-weight:600}
        .partner-shop-head small,.partner-shop-head strong,.partner-shop-head p{display:block}.partner-shop-head small{color:#76658d;font-size:8px;letter-spacing:.08em}.partner-shop-head strong{margin-top:3px;overflow:hidden;font-size:16px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.partner-shop-head p{margin:4px 0 0;color:#737c87;font-size:10px}
        .partner-status{padding:6px 8px;border-radius:999px;font-size:9px;text-transform:capitalize}.partner-status.active{color:#138645;background:#e8f8ee}.partner-status.pending{color:#a96100;background:#fff1df}
        .partner-commission-strip{margin-top:15px;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #d9caff;border-radius:14px;background:#f8f5ff}
        .partner-commission-strip span{display:flex;align-items:center;gap:6px;color:#6034bf;font-size:11px}.partner-commission-strip span svg{width:16px}.partner-commission-strip strong{font-size:12px;font-weight:600}
        .partner-metrics{margin-top:14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .partner-metrics article{padding:10px;border:1px solid #e7eaee;border-radius:13px;background:#fafbfc}.partner-metrics small,.partner-metrics strong{display:block}.partner-metrics small{color:#78818c;font-size:8px}.partner-metrics strong{margin-top:4px;font-size:12px;font-weight:600}
        .partner-link-box{margin-top:13px;padding:10px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px dashed #cdb9fc;border-radius:13px;color:#5125ab;background:#f8f5ff}
        .partner-link-box small,.partner-link-box strong{display:block}.partner-link-box small{font-size:8px}.partner-link-box strong{margin-top:3px;font-size:12px;font-weight:600}.partner-link-box button{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:10px;color:#5d31bd;background:#eee7ff;cursor:pointer}.partner-link-box svg{width:17px}
        .partner-shop-actions{margin-top:14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .partner-shop-actions button{min-height:42px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid #e0e4e9;border-radius:11px;color:#4d5661;background:#fff;font-size:10px;font-weight:500;cursor:pointer}
        .partner-shop-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.partner-shop-actions button:disabled{opacity:.45;cursor:not-allowed}.partner-shop-actions svg{width:15px}
        .partner-view-shop{width:100%;margin-top:12px;min-height:38px;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:11px;color:#6734da;background:#f2edff;font-weight:500;cursor:pointer}.partner-view-shop svg{width:16px}

        .partner-empty-page{min-height:340px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}.partner-empty-page>svg{width:50px;height:50px;color:#6b39d8}.partner-empty-page h2{margin:12px 0 5px}.partner-empty-page p{max-width:520px;margin:0;color:#707985}
        .partner-loading{min-height:420px;display:grid;place-items:center;align-content:center;gap:13px;color:#717a85}.partner-loading span,.partner-products-loading span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#6b39d8;border-radius:50%;animation:partnerSpin .8s linear infinite}

        .partner-sample{padding:20px;border:1px dashed #cfd6e2;border-radius:22px;background:radial-gradient(circle at 92% 8%,rgba(109,60,223,.08),transparent 24%),linear-gradient(180deg,#fcfdff,#f8fafc)}
        .partner-sample-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.partner-sample-head h3{margin:0;font-size:19px;font-weight:600}.partner-sample-head p{margin:6px 0 0;color:#707985;font-size:13px}.partner-sample-head span{padding:8px 11px;border-radius:999px;color:#5d35bc;background:#eee8ff;font-size:10px;font-weight:600}
        .partner-sample-card{padding:18px;border:1px solid #e2e6ec;border-radius:20px;background:#fff;box-shadow:0 12px 28px rgba(42,48,61,.06)}
        .partner-sample-note{margin-top:14px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px}

        .partner-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .partner-modal,.partner-qr-modal,.partner-withdraw-modal{position:relative;width:min(720px,100%);max-height:92vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}
        .partner-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .partner-modal-head{padding-right:45px;display:grid;grid-template-columns:58px minmax(0,1fr);align-items:center;gap:13px}.partner-modal-head img,.partner-modal-head>span{width:58px;height:58px;display:grid;place-items:center;object-fit:cover;border-radius:18px;color:#fff;background:#6b39d8}.partner-modal-head small,.partner-modal-head h2,.partner-modal-head p{display:block}.partner-modal-head small{color:#7655ae;font-size:9px}.partner-modal-head h2{margin:5px 0 3px;font-size:25px;font-weight:600}.partner-modal-head p{margin:0;color:#707985;font-size:11px}
        .partner-modal-stats{margin-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.partner-modal-stats article{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}.partner-modal-stats svg{width:20px;color:#6734da}.partner-modal-stats small,.partner-modal-stats strong{display:block}.partner-modal-stats small{font-size:8px;color:#7c8490}.partner-modal-stats strong{margin-top:3px;font-size:13px;font-weight:600}
        .partner-performance-note{margin-top:16px;padding:13px;display:flex;align-items:flex-start;gap:9px;border:1px solid #d7e9df;border-radius:14px;color:#3f6d50;background:#f3faf5;font-size:12px;line-height:1.45}.partner-performance-note svg{width:19px;flex:0 0 auto}.partner-performance-note strong{display:block}
        .partner-modal-actions{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.partner-modal-actions button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e0e4e9;border-radius:12px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}.partner-modal-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.partner-modal-actions svg{width:16px}

        .partner-products-modal>h2,.partner-qr-modal>h2,.partner-withdraw-modal>h2{margin:12px 0 6px;font-size:25px;font-weight:600}.partner-products-modal>p,.partner-qr-modal>p,.partner-withdraw-modal>p{color:#68717c;font-size:13px;line-height:1.5}
        .partner-products-loading{min-height:220px;display:grid;place-items:center;align-content:center;gap:12px;color:#707985}
        .partner-products-list{margin-top:17px;display:grid;gap:10px}.partner-products-list article{padding:11px;display:grid;grid-template-columns:62px minmax(0,1fr) auto;align-items:center;gap:11px;border:1px solid #e6e9ed;border-radius:15px;background:#fafbfc}.partner-products-list img,.partner-products-list article>span{width:62px;height:62px;display:grid;place-items:center;object-fit:cover;border-radius:13px;background:#eef1f4}.partner-products-list strong,.partner-products-list p,.partner-products-list small{display:block}.partner-products-list strong{font-size:13px;font-weight:600}.partner-products-list p{margin:4px 0;color:#707985;font-size:11px}.partner-products-list small{color:#14904a;font-size:10px}.partner-products-list button{min-height:38px;padding:0 11px;display:flex;align-items:center;gap:5px;border:0;border-radius:11px;color:#fff;background:#6b39d8;font-weight:500;cursor:pointer}.partner-products-list button svg{width:15px}.partner-products-empty{min-height:240px;display:grid;place-items:center;align-content:center;text-align:center}.partner-products-empty svg{width:45px;color:#6b39d8}.partner-products-empty h3{margin:10px 0 4px}.partner-products-empty p{margin:0;color:#707985}

        .partner-qr-modal{text-align:center;width:min(500px,100%)}.partner-qr-modal .partner-modal-kicker{margin-right:auto}.partner-qr-box{width:280px;max-width:100%;margin:20px auto;padding:10px;border:1px solid #e2e5e9;border-radius:20px;background:#fff;box-shadow:0 14px 35px rgba(43,49,60,.09)}.partner-qr-box img{width:100%;display:block;border-radius:13px}.partner-qr-code{width:100%;padding:13px;border:1px dashed #cdb9fc;border-radius:14px;color:#5125ab;background:#f8f5ff;cursor:pointer}.partner-qr-code small,.partner-qr-code strong,.partner-qr-code span{display:block}.partner-qr-code small{font-size:8px}.partner-qr-code strong{margin-top:4px;font-size:20px;font-weight:600}.partner-qr-code span{margin-top:4px;color:#777f89;font-size:10px}

        .partner-withdraw-modal{width:min(500px,100%)}.partner-withdraw-field{margin-top:18px;display:block}.partner-withdraw-field>span{display:block;margin-bottom:7px;color:#5f6873;font-size:11px}.partner-withdraw-field>div{min-height:48px;padding:0 13px;display:flex;align-items:center;gap:8px;border:1px solid #e1e5ea;border-radius:13px;background:#fafbfc}.partner-withdraw-field b{font-weight:500}.partner-withdraw-field input{width:100%;border:0;outline:0;background:transparent;font-size:16px}.partner-withdraw-info{margin-top:14px;padding:12px;display:flex;align-items:flex-start;gap:8px;border:1px solid #efd9b7;border-radius:13px;color:#79613f;background:#fff9ef;font-size:11px;line-height:1.45}.partner-withdraw-info svg{width:18px;flex:0 0 auto}.partner-withdraw-submit{width:100%;min-height:47px;margin-top:15px;border:0;border-radius:13px;color:#fff;background:#6b39d8;font-weight:600;cursor:pointer}.partner-withdraw-submit:disabled{opacity:.55}

        @keyframes partnerSpin{to{transform:rotate(360deg)}}

        @media(max-width:1200px){
          .partner-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .partner-shop-grid{grid-template-columns:1fr}
        }

        @media(max-width:900px){
          .partner-hero{display:block}.partner-hero-value{margin-top:18px}.partner-hero:after{display:none}
          .partner-insight-grid{grid-template-columns:1fr}
          .partner-toolbar{align-items:stretch;flex-direction:column}.partner-toolbar label{width:100%}
          .partner-pending{align-items:flex-start;flex-direction:column}.partner-pending-list{justify-content:flex-start}
        }

        @media(max-width:650px){
          .partner-summary-grid{grid-template-columns:1fr}
          .partner-shop-head{grid-template-columns:48px minmax(0,1fr)}.partner-shop-head>.partner-status{grid-column:2;justify-self:start}
          .partner-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
          .partner-shop-actions{grid-template-columns:repeat(2,minmax(0,1fr))}
          .partner-modal-stats,.partner-modal-actions{grid-template-columns:1fr}
          .partner-products-list article{grid-template-columns:54px minmax(0,1fr)}.partner-products-list button{grid-column:1/-1;justify-content:center}
          .partner-sample-head{display:block}.partner-sample-head span{display:inline-flex;margin-top:10px}
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

        /* ===== FINAL MOBILE METRIC GRID: 2 CARDS PER ROW ===== */
        @media(max-width:650px){
          .partner-summary-grid{
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:10px!important;
          }

          .partner-summary-grid>article{
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

          .partner-summary-icon{
            width:40px!important;
            height:40px!important;
            border-radius:13px!important;
          }

          .partner-summary-icon svg{
            width:20px!important;
            height:20px!important;
          }

          .partner-summary-grid>article>div{
            width:100%!important;
            min-width:0!important;
          }

          .partner-summary-grid small{
            font-size:10px!important;
            line-height:1.2!important;
            white-space:normal!important;
          }

          .partner-summary-grid strong{
            margin-top:3px!important;
            font-size:21px!important;
            line-height:1!important;
          }

          .partner-summary-grid p{
            margin-top:5px!important;
            font-size:9px!important;
            line-height:1.25!important;
            white-space:normal!important;
          }

          .dash-guest-preview-note{
            align-items:flex-start;
            flex-wrap:wrap;
          }

          .dash-guest-preview-note button{
            width:100%;
          }
        }

        @media(max-width:380px){
          .partner-summary-grid{
            gap:8px!important;
          }

          .partner-summary-grid>article{
            padding:11px 9px!important;
          }

          .partner-summary-grid strong{
            font-size:19px!important;
          }
        }

      `}</style>
    </div>
  );
}

function PartnerSamplePreview() {
  return (
    <section className="partner-sample">
      <div className="partner-sample-head">
        <div>
          <h3>See how your partner shop will appear</h3>
          <p>
            This is sample data only. Real clicks, orders, sales and commission
            will replace it after a shop approves your request.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="partner-sample-card">
        <div className="partner-shop-head">
          <span>DF</span>
          <div>
            <small>PARTNER SHOP</small>
            <strong>DOTZ Fashion</strong>
            <p>Partner ID: SPOTC-DF120</p>
          </div>
          <span className="partner-status active">Active</span>
        </div>

        <div className="partner-commission-strip">
          <span>
            <CircleDollarSign /> 5% commission
          </span>
          <strong>₹1,250 available</strong>
        </div>

        <div className="partner-metrics">
          <article><small>Clicks</small><strong>842</strong></article>
          <article><small>Orders</small><strong>28</strong></article>
          <article><small>Sales</small><strong>₹46,500</strong></article>
          <article><small>Earned</small><strong>₹2,325</strong></article>
        </div>

        <div className="partner-shop-actions">
          <button type="button" disabled><Share2 /> Share Shop</button>
          <button type="button" disabled><Package /> Products</button>
          <button type="button" disabled><QrCode /> QR Code</button>
          <button type="button" className="primary" disabled>
            <WalletCards /> Withdraw
          </button>
        </div>

        <div className="partner-sample-note">
          <BadgeCheck />
          Sample data is never counted in your earnings, sales or withdrawals.
        </div>
      </article>
    </section>
  );
}