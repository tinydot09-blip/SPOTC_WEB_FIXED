'use client';

import {
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Heart,
  ImageIcon,
  MapPin,
  PackageCheck,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type SavedFilter = 'all' | 'products' | 'offers';

type SavedItemType = 'product' | 'offer' | 'business' | 'spot';

type SavedItem = {
  id: string;
  sourceCollection: string;
  type: SavedItemType;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  businessName: string;
  businessId: string;
  targetId: string;
  price: number;
  oldPrice: number;
  discountText: string;
  savedAt: Date | null;
  expiresAt: Date | null;
  area: string;
  link: string;
  isActive: boolean;
  inStock: boolean;
  raw: DocumentData;
};

type Summary = {
  total: number;
  products: number;
  offers: number;
  businesses: number;
  spots: number;
  totalValue: number;
};

function textOf(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  if (value instanceof Date) return value;

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function refIdOf(value: unknown): string {
  if (typeof value === 'string') {
    const parts = value.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }

  return '';
}

function imageOf(data: DocumentData): string {
  const direct = [
    data.image,
    data.image_url,
    data.product_thumbnail,
    data.thumbnail_url,
    data.cover_image,
    data.logo_url,
    data.business_logo,
    data.photo_url,
  ]
    .map(textOf)
    .find(Boolean);

  if (direct) return direct;

  for (const key of ['images', 'image_urls', 'gallery_images']) {
    if (Array.isArray(data[key])) {
      const first = data[key].map(textOf).find(Boolean);
      if (first) return first;
    }
  }

  return '';
}

function inferType(data: DocumentData, collectionName: string): SavedItemType {
  const explicit = textOf(
    data.item_type ??
      data.saved_type ??
      data.type ??
      data.entity_type,
  ).toLowerCase();

  if (explicit.includes('offer')) return 'offer';
  if (explicit.includes('business') || explicit.includes('shop')) {
    return 'business';
  }
  if (explicit.includes('spot') || explicit.includes('place')) {
    return 'spot';
  }

  const collectionLower = collectionName.toLowerCase();

  if (collectionLower.includes('offer')) return 'offer';
  if (collectionLower.includes('business')) return 'business';
  if (collectionLower.includes('spot')) return 'spot';

  if (
    data.offer_ref ||
    data.business_offer_ref ||
    data.offer_id
  ) {
    return 'offer';
  }

  if (
    data.business_ref &&
    !data.product_ref &&
    !data.offer_ref
  ) {
    return 'business';
  }

  if (data.spot_ref || data.spot_id) return 'spot';

  return 'product';
}

function targetIdOf(data: DocumentData, type: SavedItemType): string {
  if (type === 'product') {
    return (
      refIdOf(data.product_ref) ||
      textOf(data.product_id) ||
      refIdOf(data.item_ref)
    );
  }

  if (type === 'offer') {
    return (
      refIdOf(data.offer_ref) ||
      refIdOf(data.business_offer_ref) ||
      textOf(data.offer_id) ||
      refIdOf(data.item_ref)
    );
  }

  if (type === 'business') {
    return (
      refIdOf(data.business_ref) ||
      textOf(data.business_id) ||
      refIdOf(data.item_ref)
    );
  }

  return (
    refIdOf(data.spot_ref) ||
    textOf(data.spot_id) ||
    refIdOf(data.item_ref)
  );
}

function defaultLink(type: SavedItemType, targetId: string, data: DocumentData): string {
  const provided =
    textOf(data.web_url) ||
    textOf(data.link) ||
    textOf(data.url);

  if (provided) return provided;

  if (type === 'product') {
    return targetId
      ? `/product/${encodeURIComponent(targetId)}`
      : '/shop';
  }

  // Business/offer/spot pages are not used by the current Saved flow.
  // Saved now opens products only.
  return '/shop';
}

function mapSavedDoc(
  collectionName: string,
  savedDoc: QueryDocumentSnapshot<DocumentData>,
): SavedItem {
  const data = savedDoc.data();
  const type = inferType(data, collectionName);
  const targetId = targetIdOf(data, type);

  const title =
    textOf(data.title) ||
    textOf(data.product_name) ||
    textOf(data.offer_title) ||
    textOf(data.business_name) ||
    textOf(data.caption) ||
    textOf(data.name) ||
    'Saved item';

  const subtitle =
    textOf(data.brand) ||
    textOf(data.category) ||
    textOf(data.area_name) ||
    textOf(data.location_text);

  const price = numberOf(
    data.price ??
      data.offer_price ??
      data.selling_price,
  );

  const oldPrice = numberOf(
    data.old_price ??
      data.mrp ??
      data.original_price,
  );

  return {
    id: savedDoc.id,
    sourceCollection: collectionName,
    type,
    title,
    subtitle,
    description:
      textOf(data.description) ||
      textOf(data.offer_description) ||
      textOf(data.about),
    image: imageOf(data),
    businessName:
      textOf(data.business_name) ||
      textOf(data.shop_name) ||
      textOf(data.seller_name),
    businessId:
      refIdOf(data.business_ref) ||
      textOf(data.business_id),
    targetId,
    price,
    oldPrice,
    discountText:
      textOf(data.discount) ||
      textOf(data.discount_text) ||
      (oldPrice > price && price > 0
        ? `${Math.round(((oldPrice - price) / oldPrice) * 100)}% OFF`
        : ''),
    savedAt:
      dateOf(data.saved_at) ||
      dateOf(data.created_at) ||
      dateOf(data.updated_at),
    expiresAt:
      dateOf(data.expires_at) ||
      dateOf(data.offer_end_at),
    area:
      textOf(data.area_name) ||
      textOf(data.area) ||
      textOf(data.city) ||
      textOf(data.location_text),
    link: defaultLink(type, targetId, data),
    isActive: data.isActive !== false && data.is_active !== false,
    inStock:
      data.is_in_stock !== false &&
      (data.stock_qty == null || numberOf(data.stock_qty) > 0),
    raw: data,
  };
}

async function enrichSavedItem(item: SavedItem): Promise<SavedItem> {
  if (!item.targetId) return item;

  const db = getFirestore();

  const targetCollection =
    item.type === 'product'
      ? 'BusinessProducts'
      : item.type === 'offer'
        ? 'BusinessListings'
        : item.type === 'business'
          ? 'BusinessListings'
          : 'Spot';

  try {
    const targetSnapshot = await getDoc(
      doc(db, targetCollection, item.targetId),
    );

    if (!targetSnapshot.exists()) return item;

    const target = targetSnapshot.data();

    const title =
      textOf(target.title) ||
      textOf(target.product_name) ||
      textOf(target.business_name) ||
      textOf(target.caption) ||
      item.title;

    const price = numberOf(
      target.price ??
        target.offer_price ??
        target.selling_price ??
        item.price,
    );

    const oldPrice = numberOf(
      target.old_price ??
        target.mrp ??
        target.original_price ??
        item.oldPrice,
    );

    return {
      ...item,
      title,
      subtitle:
        textOf(target.brand) ||
        textOf(target.category) ||
        textOf(target.area_name) ||
        item.subtitle,
      description:
        textOf(target.description) ||
        textOf(target.about) ||
        item.description,
      image: imageOf(target) || item.image,
      businessName:
        textOf(target.business_name) ||
        textOf(target.shop_name) ||
        item.businessName,
      businessId:
        refIdOf(target.business_ref) ||
        textOf(target.business_id) ||
        item.businessId,
      price,
      oldPrice,
      discountText:
        textOf(target.discount) ||
        textOf(target.discount_text) ||
        (oldPrice > price && price > 0
          ? `${Math.round(((oldPrice - price) / oldPrice) * 100)}% OFF`
          : item.discountText),
      expiresAt:
        dateOf(target.expires_at) ||
        dateOf(target.offer_end_at) ||
        item.expiresAt,
      area:
        textOf(target.area_name) ||
        textOf(target.area) ||
        textOf(target.city) ||
        item.area,
      isActive:
        target.isActive !== false &&
        target.is_active !== false,
      inStock:
        target.is_in_stock !== false &&
        (target.stock_qty == null ||
          numberOf(target.stock_qty) > 0),
      raw: {
        ...item.raw,
        target_snapshot: target,
      },
    };
  } catch {
    return item;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return 'Recently saved';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function typeLabel(type: SavedItemType): string {
  if (type === 'product') return 'Product';
  if (type === 'offer') return 'Offer';
  if (type === 'business') return 'Business';
  return 'Spot';
}

const SAMPLE_IMAGE =
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200';

export default function DashboardSaved() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [filter, setFilter] = useState<SavedFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SavedItem | null>(null);
  const [removingId, setRemovingId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(
        nextUser && !nextUser.isAnonymous ? nextUser : null,
      );
      setAuthChecked(true);
    });
  }, []);

  const loadSaved = async (currentUser: User) => {
    setLoading(true);

    try {
      const db = getFirestore();

      const sources = [
        'SavedItems',
        'SavedProducts',
        'UserSavedProducts',
        'SavedOffers',
        'SavedBusinesses',
        'SavedSpots',
      ];

      const sourceResults = await Promise.all(
        sources.map(async (source) => {
          const sourceCollection = collection(db, source);

          const attempts = [
            query(
              sourceCollection,
              where('user_uid', '==', currentUser.uid),
              orderBy('created_at', 'desc'),
              limit(100),
            ),
            query(
              sourceCollection,
              where('user_uid', '==', currentUser.uid),
              limit(100),
            ),
            query(
              sourceCollection,
              where('uid', '==', currentUser.uid),
              limit(100),
            ),
            query(
              sourceCollection,
              where(
                'user_ref',
                '==',
                doc(db, 'users', currentUser.uid),
              ),
              limit(100),
            ),
          ];

          for (const attempt of attempts) {
            try {
              const snapshot = await getDocs(attempt);
              return snapshot.docs.map((savedDoc) =>
                mapSavedDoc(source, savedDoc),
              );
            } catch {
              // Try next compatible schema.
            }
          }

          return [] as SavedItem[];
        }),
      );

      const merged = sourceResults.flat();

      const deduped = Array.from(
        new Map(
          merged.map((item) => [
            `${item.type}:${item.targetId || item.id}`,
            item,
          ]),
        ).values(),
      );

      const enriched = await Promise.all(
        deduped.map(enrichSavedItem),
      );

      setItems(
        enriched
          .filter(
            (item) =>
              item.type === 'product' ||
              item.type === 'offer',
          )
          .sort((a, b) => {
            const aTime = a.savedAt?.getTime() ?? 0;
            const bTime = b.savedAt?.getTime() ?? 0;
            return bTime - aTime;
          }),
      );
    } catch (error) {
      console.error('Saved items load failed:', error);
      setMessage('Some saved items could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;

    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    void loadSaved(user);
  }, [authChecked, user]);

  const summary = useMemo<Summary>(() => {
    return items.reduce(
      (current, item) => {
        current.total += 1;

        if (item.type === 'product') current.products += 1;
        if (item.type === 'offer') current.offers += 1;
        if (item.type === 'business') current.businesses += 1;
        if (item.type === 'spot') current.spots += 1;

        if (item.price > 0) current.totalValue += item.price;

        return current;
      },
      {
        total: 0,
        products: 0,
        offers: 0,
        businesses: 0,
        spots: 0,
        totalValue: 0,
      },
    );
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'products' && item.type === 'product') ||
        (filter === 'offers' && item.type === 'offer');

      const matchesSearch =
        !term ||
        item.title.toLowerCase().includes(term) ||
        item.subtitle.toLowerCase().includes(term) ||
        item.businessName.toLowerCase().includes(term) ||
        item.area.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [items, filter, search]);

  const requireSignIn = (action: string): boolean => {
    if (user) return true;

    setMessage(`Sign in to ${action}. You can continue browsing this preview.`);
    return false;
  };

  const removeSaved = async (item: SavedItem) => {
    if (!requireSignIn('remove a real saved item')) return;
    if (removingId) return;

    setRemovingId(item.id);

    try {
      const db = getFirestore();

      await deleteDoc(
        doc(db, item.sourceCollection, item.id),
      );

      setItems((current) =>
        current.filter(
          (savedItem) =>
            !(
              savedItem.id === item.id &&
              savedItem.sourceCollection === item.sourceCollection
            ),
        ),
      );

      if (selected?.id === item.id) setSelected(null);

      setMessage(`${item.title} removed from Saved.`);
    } catch (error) {
      console.error('Remove saved item failed:', error);
      setMessage('Unable to remove this item right now.');
    } finally {
      setRemovingId('');
    }
  };

  const openItem = (item: SavedItem) => {
    if (!requireSignIn('open a real saved item')) return;

    const productId =
      item.type === 'product'
        ? item.targetId
        : textOf(
            item.raw.product_id ??
              item.raw.linked_product_id,
          ) ||
          refIdOf(
            item.raw.product_ref ??
              item.raw.linked_product_ref,
          );

    if (!productId) {
      setMessage(
        'This saved offer is not linked to a product.',
      );
      return;
    }

    window.location.href =
      `/product/${encodeURIComponent(productId)}`;
  };

  const shareItem = async (item: SavedItem) => {
    if (!requireSignIn('share a real saved item')) return;

    const url = item.link.startsWith('http')
      ? item.link
      : `${window.location.origin}${item.link}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: item.title,
          text: `Saved on SPOTC: ${item.title}`,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage('Saved item link copied.');
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return;
      }

      setMessage('Unable to share this item.');
    }
  };


  if (!authChecked || loading) {
    return (
      <section className="saved-loading">
        <span />
        <p>Loading your saved items…</p>

        <style jsx>{`
          .saved-loading {
            min-height: 280px;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 12px;
            color: #717a85;
          }

          .saved-loading > span {
            width: 34px;
            height: 34px;
            border: 3px solid #e0e3e8;
            border-top-color: #ca6808;
            border-radius: 50%;
            animation: savedSpin .8s linear infinite;
          }

          @keyframes savedSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </section>
    );
  }

  return (
    <div className="saved-page saved-page-simple">
      {!user && (
        <div className="dash-guest-preview-note">
          <Sparkles />
          <span>
            Sign in to view and manage your real saved items.
          </span>

          <button
            type="button"
            onClick={() => {
              window.location.href =
                '/login?next=/dashboard?tab=saved';
            }}
          >
            Sign In
          </button>
        </div>
      )}

      <header className="saved-simple-head">
        <div>
          <small>SAVED</small>

          <h2>Saved</h2>

          <p>
            Products and offer videos you want to come back to.
          </p>
        </div>

        <span>
          {summary.total}{' '}
          {summary.total === 1
            ? 'item'
            : 'items'}
        </span>
      </header>

      <section className="saved-simple-toolbar">
        <div className="saved-simple-tabs">
          {[
            ['all', 'All'],
            ['products', 'Products'],
            ['offers', 'Offers'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={
                filter === value
                  ? 'active'
                  : ''
              }
              onClick={() =>
                setFilter(
                  value as SavedFilter,
                )
              }
            >
              {label}
            </button>
          ))}
        </div>

        {items.length > 5 && (
          <label className="saved-simple-search">
            <Search />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search saved"
            />
          </label>
        )}
      </section>

      {message && (
        <div className="saved-message">
          <BadgeCheck />

          <span>{message}</span>

          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
            aria-label="Close message"
          >
            <X />
          </button>
        </div>
      )}

      {visibleItems.length > 0 ? (
        <section className="saved-simple-list">
          {visibleItems.map((item) => {
            const expired =
              item.expiresAt != null &&
              item.expiresAt.getTime() <
                Date.now();

            const unavailable =
              !item.isActive ||
              (
                item.type === 'product' &&
                !item.inStock
              );

            const disabled =
              expired ||
              unavailable;

            return (
              <article
                key={`${item.sourceCollection}:${item.id}`}
                className={
                  disabled
                    ? 'saved-simple-card inactive'
                    : 'saved-simple-card'
                }
              >
                <div className="saved-simple-image">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                    />
                  ) : (
                    <ImageIcon />
                  )}
                </div>

                <div className="saved-simple-copy">
                  <div className="saved-simple-top">
                    <span>
                      {typeLabel(item.type)}
                    </span>

                    {disabled && (
                      <em>
                        {expired
                          ? 'Expired'
                          : item.type ===
                              'product'
                            ? 'Out of stock'
                            : 'Unavailable'}
                      </em>
                    )}
                  </div>

                  <strong>
                    {item.title}
                  </strong>

                  {(item.businessName ||
                    item.area) && (
                    <small>
                      {[
                        item.businessName,
                        item.area,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  )}

                  <div className="saved-simple-bottom">
                    {item.price > 0 && (
                      <b>
                        ₹
                        {item.price.toFixed(
                          0,
                        )}
                      </b>
                    )}

                    <span>
                      Saved{' '}
                      {formatDate(
                        item.savedAt,
                      )}
                    </span>
                  </div>
                </div>

                <div className="saved-simple-actions">
                  <button
                    type="button"
                    className="saved-simple-remove"
                    disabled={
                      removingId ===
                      item.id
                    }
                    onClick={(event) => {
                      event.stopPropagation();

                      void removeSaved(
                        item,
                      );
                    }}
                    aria-label={`Remove ${item.title}`}
                  >
                    <Heart
                      fill="currentColor"
                    />
                  </button>

                  <button
                    type="button"
                    className="saved-simple-open"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      openItem(item);
                    }}
                  >
                    {item.type === 'offer'
                      ? 'View Product'
                      : 'Open'}
                    <ChevronRight />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="saved-simple-empty">
          <Heart />

          <h3>
            {items.length === 0
              ? 'No saved items yet'
              : 'No items in this section'}
          </h3>

          <p>
            {items.length === 0
              ? 'Save a product or offer video and it will appear here.'
              : 'Try another filter or search.'}
          </p>

          {items.length === 0 && (
            <button
              type="button"
              onClick={() => {
                window.location.href =
                  '/shop';
              }}
            >
              Browse Products
            </button>
          )}
        </section>
      )}

      <style jsx global>{`
        .saved-page-simple {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid;
          gap: 14px;
          color: #201c18;
        }

        .saved-simple-head {
          padding: 4px 2px 8px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        .saved-simple-head small {
          color: #ca6808;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .11em;
        }

        .saved-simple-head h2 {
          margin: 5px 0 3px;
          font-size: 30px;
          line-height: 1.1;
          font-weight: 650;
        }

        .saved-simple-head p {
          margin: 0;
          color: #756e67;
          font-size: 13px;
        }

        .saved-simple-head > span {
          color: #817970;
          font-size: 12px;
          white-space: nowrap;
        }

        .saved-simple-toolbar {
          padding: 9px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #e5dfd8;
          border-radius: 13px;
          background: #fff;
        }

        .saved-simple-tabs {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .saved-simple-tabs::-webkit-scrollbar {
          display: none;
        }

        .saved-simple-tabs button {
          min-height: 34px;
          padding: 0 11px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 9px;
          color: #6b645d;
          background: transparent;
          font-size: 11px;
          cursor: pointer;
        }

        .saved-simple-tabs button.active {
          color: #9a5600;
          border-color: #edc995;
          background: #fff3e4;
          font-weight: 700;
        }

        .saved-simple-search {
          width: min(240px, 100%);
          min-height: 36px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #e4ddd6;
          border-radius: 10px;
          background: #faf9f7;
        }

        .saved-simple-search svg {
          width: 15px;
          color: #8b8178;
        }

        .saved-simple-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          font-size: 11px;
        }

        .saved-message {
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #cfe8d8;
          border-radius: 12px;
          color: #25663f;
          background: #f1faf4;
          font-size: 12px;
        }

        .saved-message > svg {
          width: 17px;
        }

        .saved-message span {
          flex: 1;
        }

        .saved-message button {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
        }

        .saved-message button svg {
          width: 15px;
        }

        .saved-simple-list {
          display: grid;
          gap: 9px;
        }

        .saved-simple-card {
          min-width: 0;
          padding: 10px 12px;
          display: grid;
          grid-template-columns:
            72px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid #e5dfd8;
          border-radius: 14px;
          background: #fff;
          cursor: default;
        }

        .saved-simple-card.inactive {
          opacity: .65;
        }

        .saved-simple-image {
          width: 72px;
          height: 72px;
          overflow: hidden;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #969da6;
          background: #f3f4f6;
        }

        .saved-simple-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .saved-simple-image > svg {
          width: 26px;
          height: 26px;
        }

        .saved-simple-copy {
          min-width: 0;
        }

        .saved-simple-top {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .saved-simple-top > span {
          color: #7655ae;
          font-size: 9px;
          text-transform: uppercase;
        }

        .saved-simple-top em {
          padding: 3px 6px;
          border-radius: 999px;
          color: #a13d45;
          background: #fff0f1;
          font-size: 8px;
          font-style: normal;
        }

        .saved-simple-copy > strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .saved-simple-copy > small {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: #817970;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .saved-simple-bottom {
          margin-top: 7px;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .saved-simple-bottom b {
          font-size: 14px;
        }

        .saved-simple-bottom span {
          color: #8a827a;
          font-size: 9px;
        }

        .saved-simple-actions {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .saved-simple-actions button {
          cursor: pointer;
        }

        .saved-simple-remove {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border: 1px solid #efcfd3;
          border-radius: 10px;
          color: #e04757;
          background: #fff;
        }

        .saved-simple-remove svg {
          width: 15px;
        }

        .saved-simple-open {
          min-height: 36px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 1px solid #171814;
          border-radius: 10px;
          color: #fff;
          background: #171814;
          font-size: 10px;
          font-weight: 700;
        }

        .saved-simple-open svg {
          width: 13px;
        }

        .saved-simple-open:disabled,
        .saved-simple-remove:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .saved-simple-empty,
        .saved-loading {
          min-height: 260px;
          padding: 28px 20px;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 8px;
          border: 1px solid #e5dfd8;
          border-radius: 16px;
          background: #fff;
          text-align: center;
        }

        .saved-simple-empty > svg {
          width: 36px;
          height: 36px;
          color: #ca6808;
        }

        .saved-simple-empty h3 {
          margin: 7px 0 0;
        }

        .saved-simple-empty p {
          margin: 0;
          color: #817970;
          font-size: 12px;
        }

        .saved-simple-empty button {
          margin-top: 8px;
          min-height: 40px;
          padding: 0 14px;
          border: 0;
          border-radius: 10px;
          color: #fff;
          background: #171814;
          cursor: pointer;
        }

        .saved-loading {
          border: 0;
          background: transparent;
          color: #717a85;
        }

        .saved-loading > span {
          width: 34px;
          height: 34px;
          border: 3px solid #e0e3e8;
          border-top-color: #ca6808;
          border-radius: 50%;
          animation: savedSpin .8s linear infinite;
        }

        @keyframes savedSpin {
          to {
            transform: rotate(360deg);
          }
        }

        .dash-guest-preview-note {
          width: 100%;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #cfe5f0;
          border-radius: 12px;
          color: #245b6d;
          background: #eef9fc;
          font-size: 12px;
        }

        .dash-guest-preview-note svg {
          width: 18px;
          height: 18px;
          flex: 0 0 auto;
          color: #087e98;
        }

        .dash-guest-preview-note span {
          min-width: 0;
          flex: 1;
        }

        .dash-guest-preview-note button {
          min-height: 34px;
          padding: 0 12px;
          border: 0;
          border-radius: 9px;
          color: #fff;
          background: #087e98;
          cursor: pointer;
        }

        @media (max-width: 650px) {
          .saved-simple-head h2 {
            font-size: 26px;
          }

          .saved-simple-head > span {
            display: none;
          }

          .saved-simple-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .saved-simple-search {
            width: 100%;
          }

          .saved-simple-card {
            grid-template-columns:
              58px minmax(0, 1fr) auto;
            gap: 9px;
            padding: 9px;
          }

          .saved-simple-image {
            width: 58px;
            height: 58px;
          }

          .saved-simple-copy > strong {
            font-size: 13px;
          }

          .saved-simple-bottom span {
            display: none;
          }

          .saved-simple-open {
            min-width: 36px;
            width: 36px;
            padding: 0;
            font-size: 0;
          }

          .saved-simple-remove {
            width: 34px;
            height: 34px;
          }
        }

        @media (max-width: 430px) {
          .saved-simple-top > span {
            display: none;
          }

          .saved-simple-copy > small {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}