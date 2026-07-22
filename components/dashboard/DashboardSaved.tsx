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

type SavedFilter = 'all' | 'products' | 'offers' | 'businesses' | 'spots';

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

  if (type === 'product') return targetId ? `/product/${targetId}` : '/shop';
  if (type === 'offer') return targetId ? `/offers/${targetId}` : '/offers';
  if (type === 'business') {
    const slug =
      textOf(data.business_slug) ||
      textOf(data.slug);

    return slug
      ? `/${slug}`
      : targetId
        ? `/shop/${targetId}`
        : '/shop';
  }

  return targetId ? `/spots/${targetId}` : '/spots';
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
        enriched.sort((a, b) => {
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
        (filter === 'offers' && item.type === 'offer') ||
        (filter === 'businesses' && item.type === 'business') ||
        (filter === 'spots' && item.type === 'spot');

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

  const removeSaved = async (item: SavedItem) => {
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
    if (!item.link) {
      setMessage('This saved item does not have an active link.');
      return;
    }

    if (item.link.startsWith('http')) {
      window.open(item.link, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = item.link;
  };

  const shareItem = async (item: SavedItem) => {
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
        <p>Loading your saved collection…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="saved-empty">
        <Heart />
        <h2>Sign in to view Saved items</h2>
        <p>
          Products, offers, businesses and Spots you save will appear here.
        </p>
      </section>
    );
  }

  return (
    <div className="saved-page">
      <section className="saved-hero">
        <div>
          <span className="saved-eyebrow">
            <Sparkles /> YOUR SPOTC COLLECTION
          </span>

          <h2>Everything you liked, organized and ready to revisit.</h2>

          <p>
            Return to saved products, local offers, favourite businesses and
            discovered Spots without searching again.
          </p>
        </div>

        <div className="saved-total-card">
          <small>TOTAL SAVED</small>
          <strong>{summary.total}</strong>
          <span>
            {summary.total
              ? `${summary.products} products · ${summary.offers} offers`
              : 'Start saving from Shop, Offers and Spots'}
          </span>
        </div>
      </section>

      <section className="saved-summary-grid">
        <article>
          <span className="saved-summary-icon purple">
            <ShoppingBag />
          </span>
          <div>
            <small>Saved Products</small>
            <strong>{summary.products}</strong>
            <p>Products to compare or buy later</p>
          </div>
        </article>

        <article>
          <span className="saved-summary-icon orange">
            <Tag />
          </span>
          <div>
            <small>Saved Offers</small>
            <strong>{summary.offers}</strong>
            <p>Deals you do not want to miss</p>
          </div>
        </article>

        <article>
          <span className="saved-summary-icon blue">
            <Store />
          </span>
          <div>
            <small>Businesses</small>
            <strong>{summary.businesses}</strong>
            <p>Favourite local shops</p>
          </div>
        </article>

        <article>
          <span className="saved-summary-icon green">
            <CircleDollarSign />
          </span>
          <div>
            <small>Saved Product Value</small>
            <strong>₹{Math.round(summary.totalValue)}</strong>
            <p>Current combined saved price</p>
          </div>
        </article>
      </section>

      <section className="saved-value-banner">
        <div>
          <span>SMART SAVING</span>
          <h2>Review saved items before offers expire or stock runs out.</h2>
          <p>
            Expired offers and unavailable products remain visible with a clear
            status so users understand why an item cannot be opened.
          </p>
        </div>

        <PackageCheck />
      </section>

      <section className="saved-toolbar">
        <div className="saved-tabs">
          {[
            ['all', 'All Saved'],
            ['products', 'Products'],
            ['offers', 'Offers'],
            ['businesses', 'Businesses'],
            ['spots', 'Spots'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() =>
                setFilter(value as SavedFilter)
              }
            >
              {label}
            </button>
          ))}
        </div>

        <label>
          <Search />
          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search saved item, shop or area"
          />
        </label>
      </section>

      {message && (
        <div className="saved-message">
          <BadgeCheck />
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage('')}
          >
            <X />
          </button>
        </div>
      )}

      <section className="saved-grid">
        {visibleItems.map((item) => {
          const expired =
            item.expiresAt != null &&
            item.expiresAt.getTime() < Date.now();

          const unavailable =
            !item.isActive ||
            (item.type === 'product' && !item.inStock);

          return (
            <article
              className={`saved-card ${
                expired || unavailable ? 'inactive' : ''
              }`}
              key={`${item.sourceCollection}:${item.id}`}
            >
              <div className="saved-card-image">
                {item.image ? (
                  <img src={item.image} alt={item.title} />
                ) : (
                  <span className="saved-image-placeholder">
                    <ImageIcon />
                  </span>
                )}

                <span className="saved-type">
                  {typeLabel(item.type)}
                </span>

                <button
                  type="button"
                  className="saved-remove-top"
                  disabled={removingId === item.id}
                  onClick={() => void removeSaved(item)}
                  aria-label={`Remove ${item.title}`}
                >
                  <Heart fill="currentColor" />
                </button>

                {(expired || unavailable) && (
                  <span className="saved-unavailable">
                    {expired
                      ? 'Expired'
                      : item.type === 'product'
                        ? 'Out of stock'
                        : 'Unavailable'}
                  </span>
                )}
              </div>

              <div className="saved-card-content">
                <div className="saved-card-heading">
                  <div>
                    <small>
                      {item.businessName ||
                        item.subtitle ||
                        typeLabel(item.type)}
                    </small>
                    <h2>{item.title}</h2>
                  </div>

                  {item.discountText && (
                    <span>{item.discountText}</span>
                  )}
                </div>

                {item.area && (
                  <p className="saved-location">
                    <MapPin /> {item.area}
                  </p>
                )}

                {item.description && (
                  <p className="saved-description">
                    {item.description}
                  </p>
                )}

                {item.price > 0 && (
                  <div className="saved-price">
                    <strong>
                      ₹{item.price.toFixed(0)}
                    </strong>

                    {item.oldPrice > item.price && (
                      <del>
                        ₹{item.oldPrice.toFixed(0)}
                      </del>
                    )}
                  </div>
                )}

                <div className="saved-meta">
                  <span>
                    <Clock3 />
                    Saved {formatDate(item.savedAt)}
                  </span>

                  {item.expiresAt && (
                    <span>
                      <Tag />
                      Ends {formatDate(item.expiresAt)}
                    </span>
                  )}
                </div>

                <div className="saved-actions">
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                  >
                    View Details <ChevronRight />
                  </button>

                  <button
                    type="button"
                    className="primary"
                    disabled={expired || unavailable}
                    onClick={() => openItem(item)}
                  >
                    <ExternalLink />
                    {item.type === 'product'
                      ? 'Open Product'
                      : item.type === 'business'
                        ? 'View Shop'
                        : item.type === 'spot'
                          ? 'Open Spot'
                          : 'View Offer'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void shareItem(item)}
                  >
                    <Share2 /> Share
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!visibleItems.length &&
        (items.length === 0 &&
        filter === 'all' &&
        !search.trim() ? (
          <SavedSamplePreview />
        ) : (
          <section className="saved-empty">
            <Heart />
            <h2>No saved items in this section</h2>
            <p>
              Try another filter or save more products, offers, businesses and
              Spots.
            </p>
          </section>
        ))}

      {selected && (
        <div
          className="saved-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="saved-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="saved-modal-close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>

            <div className="saved-modal-image">
              {selected.image ? (
                <img
                  src={selected.image}
                  alt={selected.title}
                />
              ) : (
                <span>
                  <ImageIcon />
                </span>
              )}

              <i>{typeLabel(selected.type)}</i>
            </div>

            <span className="saved-modal-kicker">
              <Heart fill="currentColor" /> SAVED TO YOUR COLLECTION
            </span>

            <h2>{selected.title}</h2>

            {(selected.businessName || selected.area) && (
              <p className="saved-modal-subtitle">
                {[selected.businessName, selected.area]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            {selected.description && (
              <p className="saved-modal-description">
                {selected.description}
              </p>
            )}

            <div className="saved-detail-grid">
              <article>
                <ShoppingBag />
                <span>
                  <small>ITEM TYPE</small>
                  <strong>
                    {typeLabel(selected.type)}
                  </strong>
                </span>
              </article>

              <article>
                <Clock3 />
                <span>
                  <small>SAVED ON</small>
                  <strong>
                    {formatDate(selected.savedAt)}
                  </strong>
                </span>
              </article>

              <article>
                <Store />
                <span>
                  <small>BUSINESS</small>
                  <strong>
                    {selected.businessName || 'SPOTC'}
                  </strong>
                </span>
              </article>

              <article>
                <CircleDollarSign />
                <span>
                  <small>CURRENT PRICE</small>
                  <strong>
                    {selected.price > 0
                      ? `₹${selected.price.toFixed(0)}`
                      : 'Not applicable'}
                  </strong>
                </span>
              </article>
            </div>

            <div className="saved-value-note">
              <BadgeCheck />
              <span>
                <strong>Saved-item protection</strong>
                <small>
                  Removing this item only deletes your saved reference. It does
                  not delete the original product, offer, business or Spot.
                </small>
              </span>
            </div>

            <div className="saved-modal-actions">
              <button
                type="button"
                onClick={() => openItem(selected)}
              >
                <ExternalLink /> Open Item
              </button>

              <button
                type="button"
                onClick={() => void shareItem(selected)}
              >
                <Share2 /> Share
              </button>

              <button
                type="button"
                className="danger"
                disabled={removingId === selected.id}
                onClick={() =>
                  void removeSaved(selected)
                }
              >
                <Trash2 />
                {removingId === selected.id
                  ? 'Removing…'
                  : 'Remove Saved'}
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .saved-page{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;display:grid;grid-template-columns:minmax(0,1fr);gap:20px;color:#20252b;text-align:left!important}
        .saved-hero{position:relative;width:100%;min-height:178px;padding:24px 28px;display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,280px);align-items:center;gap:28px;overflow:hidden;border:1px solid #e4e7ec;border-radius:24px;background:radial-gradient(circle at 86% 16%,rgba(109,60,223,.16),transparent 31%),linear-gradient(135deg,#fff,#faf8ff);box-shadow:0 14px 36px rgba(42,48,61,.06);text-align:left!important}
        .saved-hero:after{content:'♥';position:absolute;right:315px;top:18px;color:#d7c3ff;font-size:80px;opacity:.16}
        .saved-eyebrow,.saved-modal-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#6532cd;background:#eee7ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .saved-eyebrow svg,.saved-modal-kicker svg{width:16px}
        .saved-hero h2{max-width:760px;margin:10px 0 7px;font-size:clamp(25px,2.35vw,36px);line-height:1.12;font-weight:600;letter-spacing:-.03em;text-align:left!important}
        .saved-hero p{max-width:720px;margin:0;color:#6d7580;font-size:14px;line-height:1.6;text-align:left!important}
        .saved-total-card{position:relative;z-index:1;width:100%;min-width:0;padding:18px 20px;border:1px solid #ddcffd;border-radius:18px;background:rgba(255,255,255,.92);box-shadow:0 13px 30px rgba(83,50,151,.09);text-align:left!important}
        .saved-total-card small,.saved-total-card strong,.saved-total-card span{display:block}.saved-total-card small{color:#77658e;font-size:9px;letter-spacing:.09em}.saved-total-card strong{margin-top:6px;color:#5725bd;font-size:35px;font-weight:600}.saved-total-card span{margin-top:3px;color:#6d7580;font-size:12px}

        .saved-summary-grid{width:100%;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
        .saved-summary-grid article{min-width:0;min-height:104px;padding:16px;display:flex;align-items:center;justify-content:flex-start;gap:13px;border:1px solid #e4e7ec;border-radius:19px;background:#fff;box-shadow:0 10px 25px rgba(42,48,61,.055);text-align:left!important}
        .saved-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}.saved-summary-icon svg{width:24px}.saved-summary-icon.orange{color:#df7a00;background:#fff0db}.saved-summary-icon.purple{color:#6734da;background:#eee8ff}.saved-summary-icon.green{color:#159b50;background:#e8f8ef}.saved-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .saved-summary-grid small,.saved-summary-grid strong,.saved-summary-grid p{display:block;text-align:left!important}.saved-summary-grid small{font-size:11px;font-weight:500}.saved-summary-grid strong{margin-top:4px;font-size:24px;font-weight:600}.saved-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .saved-value-banner{width:100%;padding:17px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #eadbf9;border-radius:18px;background:linear-gradient(135deg,#fcf9ff,#fff);box-shadow:0 9px 24px rgba(79,47,140,.055)}
        .saved-value-banner span{color:#7140ca;font-size:9px;letter-spacing:.08em}.saved-value-banner h2{margin:5px 0 3px;font-size:19px;font-weight:600}.saved-value-banner p{max-width:900px;margin:0;color:#707985;font-size:12px;line-height:1.5}.saved-value-banner>svg{width:38px;height:38px;color:#6734da;flex:0 0 auto}

        .saved-toolbar{width:100%;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e4e7ec;border-radius:16px;background:#fff}
        .saved-tabs{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}.saved-tabs::-webkit-scrollbar{display:none}.saved-tabs button{min-height:38px;padding:0 13px;flex:0 0 auto;border:1px solid transparent;border-radius:11px;color:#68717c;background:transparent;font-weight:500;cursor:pointer}.saved-tabs button.active{color:#5f31bd;border-color:#d9c7ff;background:#f3efff}
        .saved-toolbar label{width:min(330px,100%);min-height:40px;padding:0 12px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}.saved-toolbar label svg{width:18px;color:#818996}.saved-toolbar input{width:100%;border:0;outline:0;background:transparent}

        .saved-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}.saved-message svg{width:20px}.saved-message span{flex:1}.saved-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .saved-grid{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
        .saved-card{min-width:0;overflow:hidden;border:1px solid #e3e7ec;border-radius:22px;background:#fff;box-shadow:0 12px 32px rgba(42,48,61,.065)}.saved-card.inactive{opacity:.78}
        .saved-card-image{position:relative;height:190px;overflow:hidden;background:#eff1f4}.saved-card-image>img{width:100%;height:100%;object-fit:cover}.saved-image-placeholder{width:100%;height:100%;display:grid;place-items:center;color:#8d96a2;background:linear-gradient(135deg,#f2f4f7,#e8ebf0)}.saved-image-placeholder svg{width:42px;height:42px}
        .saved-card-image:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,12,18,.03),rgba(12,12,18,.32))}
        .saved-type,.saved-unavailable{position:absolute;z-index:2;top:13px;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:600}.saved-type{left:13px;color:#fff;background:rgba(89,45,187,.84);backdrop-filter:blur(6px)}.saved-unavailable{right:52px;color:#a13d45;background:#fff0f1}
        .saved-remove-top{position:absolute;z-index:3;right:13px;top:13px;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:50%;color:#e04757;background:#fff;box-shadow:0 6px 18px rgba(20,24,30,.18);cursor:pointer}.saved-remove-top svg{width:17px}.saved-remove-top:disabled{opacity:.55}

        .saved-card-content{padding:17px;text-align:left!important}.saved-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.saved-card-heading small,.saved-card-heading h2{display:block}.saved-card-heading small{color:#7655ae;font-size:9px}.saved-card-heading h2{margin:4px 0 0;font-size:18px;font-weight:600}.saved-card-heading>span{padding:6px 8px;flex:0 0 auto;border-radius:9px;color:#138645;background:#e8f8ee;font-size:9px;font-weight:600}
        .saved-location{margin:8px 0 0;display:flex;align-items:center;gap:5px;color:#727b86;font-size:11px}.saved-location svg{width:14px}
        .saved-description{display:-webkit-box;margin:11px 0 0;overflow:hidden;color:#626b76;font-size:11px;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2}
        .saved-price{margin-top:13px;display:flex;align-items:center;gap:8px}.saved-price strong{font-size:20px;font-weight:600}.saved-price del{color:#969da7;font-size:12px}
        .saved-meta{margin-top:13px;padding:10px 0;display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}.saved-meta span{display:flex;align-items:center;gap:5px;color:#7a838e;font-size:9px}.saved-meta svg{width:13px}
        .saved-actions{margin-top:13px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.saved-actions button{min-height:40px;padding:0 7px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid #e1e4e9;border-radius:10px;color:#4d5661;background:#fff;font-size:10px;font-weight:500;cursor:pointer}.saved-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.saved-actions button:disabled{opacity:.45}.saved-actions svg{width:14px}

        .saved-empty,.saved-loading{min-height:320px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}.saved-empty>svg{width:50px;height:50px;color:#6b39d8}.saved-empty h2{margin:12px 0 5px}.saved-empty p{max-width:520px;margin:0;color:#707985}.saved-loading{gap:13px;color:#717a85}.saved-loading>span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#6b39d8;border-radius:50%;animation:savedSpin .8s linear infinite}

        .saved-sample{padding:20px;border:1px dashed #cfd6e2;border-radius:22px;background:radial-gradient(circle at 92% 8%,rgba(109,60,223,.08),transparent 24%),linear-gradient(180deg,#fcfdff,#f8fafc)}
        .saved-sample-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:17px}.saved-sample-head h3{margin:0;font-size:19px;font-weight:600}.saved-sample-head p{max-width:720px;margin:6px 0 0;color:#707985;font-size:13px;line-height:1.5}.saved-sample-head span{padding:8px 11px;flex:0 0 auto;border-radius:999px;color:#5d35bc;background:#eee8ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .saved-sample-card{max-width:500px;overflow:hidden;border:1px solid #e2e6ec;border-radius:22px;background:#fff;box-shadow:0 12px 28px rgba(42,48,61,.06)}.saved-sample-card .saved-actions button,.saved-sample-card .saved-remove-top{cursor:not-allowed;opacity:.72}
        .saved-sample-note{margin:14px 18px 18px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px}.saved-sample-note svg{width:18px;flex:0 0 auto}

        .saved-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .saved-modal{position:relative;width:min(680px,100%);max-height:92vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28);text-align:left!important}.saved-modal-close{position:absolute;z-index:4;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .saved-modal-image{position:relative;height:250px;margin:-27px -27px 20px;overflow:hidden;border-radius:26px 26px 0 0;background:#eef1f4}.saved-modal-image img{width:100%;height:100%;object-fit:cover}.saved-modal-image>span{width:100%;height:100%;display:grid;place-items:center;color:#87909c}.saved-modal-image>span svg{width:54px;height:54px}.saved-modal-image:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(10,10,15,.48))}.saved-modal-image i{position:absolute;z-index:2;left:17px;bottom:17px;padding:8px 10px;border-radius:999px;color:#fff;background:rgba(89,45,187,.85);font-size:10px;font-style:normal;font-weight:600}
        .saved-modal>h2{margin:13px 0 6px;font-size:27px;font-weight:600}.saved-modal-subtitle{color:#6f7883;font-size:12px}.saved-modal-description{margin:15px 0 0;color:#626b76;font-size:13px;line-height:1.6}
        .saved-detail-grid{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.saved-detail-grid article{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}.saved-detail-grid svg{width:20px;color:#6734da}.saved-detail-grid small,.saved-detail-grid strong{display:block}.saved-detail-grid small{color:#7c8490;font-size:8px}.saved-detail-grid strong{margin-top:3px;font-size:12px;font-weight:600}
        .saved-value-note{margin-top:16px;padding:14px;display:flex;align-items:flex-start;gap:10px;border:1px solid #d7e9df;border-radius:14px;background:#f3faf5;color:#326545}.saved-value-note>svg{width:20px;flex:0 0 auto}.saved-value-note strong,.saved-value-note small{display:block}.saved-value-note strong{font-size:12px}.saved-value-note small{margin-top:4px;color:#537661;font-size:10px;line-height:1.5}
        .saved-modal-actions{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.saved-modal-actions button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e0e4e9;border-radius:12px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}.saved-modal-actions button.danger{border-color:#f0cdd1;color:#b33e48;background:#fff4f5}.saved-modal-actions button:disabled{opacity:.45}.saved-modal-actions svg{width:16px}

        .dash-content>.saved-page,.dash-content .saved-page{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
        .saved-page,.saved-page section,.saved-page article,.saved-page div,.saved-page h1,.saved-page h2,.saved-page h3,.saved-page p,.saved-page small,.saved-page strong,.saved-page span{box-sizing:border-box}
        @keyframes savedSpin{to{transform:rotate(360deg)}}

        @media(max-width:1250px){
          .saved-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .saved-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .saved-hero{grid-template-columns:minmax(0,1fr) 240px}
        }

        @media(max-width:900px){
          .saved-hero{display:block;min-height:0;padding:22px}.saved-total-card{margin-top:18px}.saved-hero:after{display:none}
          .saved-toolbar{align-items:stretch;flex-direction:column}.saved-toolbar label{width:100%}
          .saved-value-banner{align-items:flex-start}
        }

        @media(max-width:680px){
          .saved-summary-grid,.saved-grid{grid-template-columns:1fr}
          .saved-actions,.saved-detail-grid,.saved-modal-actions{grid-template-columns:1fr}
          .saved-sample-head{flex-direction:column}
          .saved-value-banner>svg{display:none}
        }
      `}</style>
    </div>
  );
}

function SavedSamplePreview() {
  return (
    <section className="saved-sample">
      <div className="saved-sample-head">
        <div>
          <h3>See how saved items will appear</h3>
          <p>
            This sample is displayed only while your account has no real saved
            items. It disappears automatically after your first save.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="saved-sample-card">
        <div className="saved-card-image">
          <img src={SAMPLE_IMAGE} alt="Sample saved product" />

          <span className="saved-type">Product</span>

          <button
            type="button"
            className="saved-remove-top"
            disabled
          >
            <Heart fill="currentColor" />
          </button>
        </div>

        <div className="saved-card-content">
          <div className="saved-card-heading">
            <div>
              <small>DOTZ Fashion</small>
              <h2>Premium Casual Shirt</h2>
            </div>

            <span>25% OFF</span>
          </div>

          <p className="saved-location">
            <MapPin /> Mettupalayam
          </p>

          <p className="saved-description">
            A saved product preview with current price, shop, share and remove
            actions.
          </p>

          <div className="saved-price">
            <strong>₹899</strong>
            <del>₹1,199</del>
          </div>

          <div className="saved-meta">
            <span>
              <Clock3 /> Saved 21 Jul 2026
            </span>
          </div>

          <div className="saved-actions">
            <button type="button" disabled>
              View Details <ChevronRight />
            </button>

            <button
              type="button"
              className="primary"
              disabled
            >
              <ExternalLink /> Open Product
            </button>

            <button type="button" disabled>
              <Share2 /> Share
            </button>
          </div>
        </div>

        <div className="saved-sample-note">
          <BadgeCheck />
          Sample data never writes to Firebase or changes real saved items.
        </div>
      </article>
    </section>
  );
}