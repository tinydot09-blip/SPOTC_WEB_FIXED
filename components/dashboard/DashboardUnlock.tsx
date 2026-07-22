'use client';

import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Eye,
  Heart,
  ImageIcon,
  LockOpen,
  MapPin,
  Navigation,
  Search,
  Share2,
  Sparkles,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type UnlockFilter = 'all' | 'recent' | 'places' | 'experiences';

type UnlockedSpot = {
  id: string;
  caption: string;
  description: string;
  category: string;
  district: string;
  area: string;
  address: string;
  image: string;
  creatorName: string;
  creatorPhoto: string;
  createdAt: Date | null;
  unlockedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string;
  spotUrl: string;
  views: number;
  likes: number;
  isApproved: boolean;
  isHidden: boolean;
  processingStatus: string;
  raw: DocumentData;
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
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

function imageOf(data: DocumentData): string {
  const direct = [
    data.thumbnail_url,
    data.thumbnail,
    data.cover_image,
    data.image_url,
    data.image,
    data.photo_url,
    data.media_url,
  ]
    .map(textOf)
    .find(Boolean);

  if (direct) return direct;

  for (const key of ['images', 'image_urls', 'photos', 'gallery_images']) {
    if (Array.isArray(data[key])) {
      const first = data[key].map(textOf).find(Boolean);
      if (first) return first;
    }
  }

  return '';
}

function coordinateOf(data: DocumentData, key: 'latitude' | 'longitude'): number | null {
  const candidates =
    key === 'latitude'
      ? [data.latitude, data.lat, data.location_lat, data.spot_lat]
      : [data.longitude, data.lng, data.lon, data.location_lng, data.spot_lng];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  const geo =
    data.location ??
    data.spot_location ??
    data.business_location ??
    data.geo_point;

  if (geo && typeof geo === 'object') {
    const candidate =
      key === 'latitude'
        ? (geo as { latitude?: unknown; _lat?: unknown }).latitude ??
          (geo as { _lat?: unknown })._lat
        : (geo as { longitude?: unknown; _long?: unknown }).longitude ??
          (geo as { _long?: unknown })._long;

    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function mapSpot(id: string, data: DocumentData): UnlockedSpot {
  const latitude = coordinateOf(data, 'latitude');
  const longitude = coordinateOf(data, 'longitude');

  const mapsUrl =
    textOf(data.maps_url) ||
    textOf(data.directions_url) ||
    (latitude !== null && longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      : '');

  return {
    id,
    caption:
      textOf(data.caption) ||
      textOf(data.title) ||
      textOf(data.name) ||
      'Unlocked place',
    description:
      textOf(data.description) ||
      textOf(data.about) ||
      textOf(data.spot_description),
    category:
      textOf(data.category) ||
      textOf(data.spot_category) ||
      'Place',
    district:
      textOf(data.district_name) ||
      textOf(data.district) ||
      'Hidden location',
    area:
      textOf(data.area_name) ||
      textOf(data.area) ||
      textOf(data.locality),
    address:
      textOf(data.address) ||
      textOf(data.full_address) ||
      textOf(data.location_text),
    image: imageOf(data),
    creatorName:
      textOf(data.creator_name) ||
      textOf(data.user_name) ||
      textOf(data.created_by_name) ||
      'SPOTC Creator',
    creatorPhoto:
      textOf(data.creator_photo) ||
      textOf(data.creator_photo_url) ||
      textOf(data.user_photo),
    createdAt:
      dateOf(data.created_at) ||
      dateOf(data.approved_at),
    unlockedAt:
      dateOf(data.unlocked_at) ||
      dateOf(data.last_unlocked_at),
    latitude,
    longitude,
    mapsUrl,
    spotUrl:
      textOf(data.web_url) ||
      textOf(data.spot_url) ||
      `/spots/${id}`,
    views: Math.max(0, numberOf(data.views ?? data.view_count)),
    likes: Math.max(0, numberOf(data.likes ?? data.like_count)),
    isApproved:
      data.isApproved === true ||
      data.is_approved === true ||
      data.approved_at != null,
    isHidden:
      data.isHidden === true ||
      data.is_hidden === true ||
      data.hidden === true,
    processingStatus:
      textOf(data.processing_status).toLowerCase(),
    raw: data,
  };
}

function formatDate(date: Date | null): string {
  if (!date) return 'Date not available';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isUnlockedByUser(data: DocumentData, user: User): boolean {
  const unlocked = data.unlocked_by;

  if (!Array.isArray(unlocked)) return false;

  const uid = user.uid;
  const userPath = `users/${uid}`;

  return unlocked.some((entry) => {
    if (entry === uid || entry === userPath || entry === `/users/${uid}`) {
      return true;
    }

    if (
      entry &&
      typeof entry === 'object' &&
      'id' in entry &&
      (entry as { id?: unknown }).id === uid
    ) {
      return true;
    }

    if (
      entry &&
      typeof entry === 'object' &&
      'path' in entry &&
      textOf((entry as { path?: unknown }).path) === userPath
    ) {
      return true;
    }

    return false;
  });
}

const SAMPLE_IMAGE =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200';

export default function DashboardUnlock() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState<UnlockedSpot[]>([]);
  const [filter, setFilter] = useState<UnlockFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UnlockedSpot | null>(null);
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
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);

      try {
        const db = getFirestore();

        const approvedQuery = query(
          collection(db, 'Spot'),
          where('isApproved', '==', true),
          orderBy('created_at', 'desc'),
          limit(200),
        );

        const fallbackQuery = query(
          collection(db, 'Spot'),
          where('isApproved', '==', true),
          limit(200),
        );

        const snapshot = await getDocs(approvedQuery).catch(() =>
          getDocs(fallbackQuery),
        );

        const unlocked = snapshot.docs
          .filter((spotDoc) => isUnlockedByUser(spotDoc.data(), user))
          .map((spotDoc) => mapSpot(spotDoc.id, spotDoc.data()))
          .filter((spot) => {
            if (!spot.isApproved || spot.isHidden) return false;

            if (
              spot.processingStatus &&
              !['ready', 'completed', 'complete', 'approved'].includes(
                spot.processingStatus,
              )
            ) {
              return false;
            }

            return true;
          })
          .sort((a, b) => {
            const aTime =
              a.unlockedAt?.getTime() ??
              a.createdAt?.getTime() ??
              0;

            const bTime =
              b.unlockedAt?.getTime() ??
              b.createdAt?.getTime() ??
              0;

            return bTime - aTime;
          });

        setSpots(unlocked);
      } catch (error) {
        console.error('Unlocked places load failed:', error);
        setMessage('Some unlocked places could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authChecked, user]);

  const summary = useMemo(() => {
    const categories = new Set(
      spots.map((spot) => spot.category.toLowerCase()).filter(Boolean),
    );

    const districts = new Set(
      spots.map((spot) => spot.district.toLowerCase()).filter(Boolean),
    );

    const newest = spots[0] ?? null;

    return {
      total: spots.length,
      categories: categories.size,
      districts: districts.size,
      newest,
    };
  }, [spots]);

  const visibleSpots = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    const recentCutoff = now - 30 * 24 * 60 * 60 * 1000;

    return spots.filter((spot) => {
      const category = spot.category.toLowerCase();

      const filterMatches =
        filter === 'all' ||
        (filter === 'recent' &&
          (spot.unlockedAt ?? spot.createdAt)?.getTime()! >= recentCutoff) ||
        (filter === 'places' &&
          !['event', 'experience', 'activity', 'adventure'].some((value) =>
            category.includes(value),
          )) ||
        (filter === 'experiences' &&
          ['event', 'experience', 'activity', 'adventure'].some((value) =>
            category.includes(value),
          ));

      const searchMatches =
        !term ||
        spot.caption.toLowerCase().includes(term) ||
        spot.description.toLowerCase().includes(term) ||
        spot.category.toLowerCase().includes(term) ||
        spot.district.toLowerCase().includes(term) ||
        spot.area.toLowerCase().includes(term) ||
        spot.address.toLowerCase().includes(term) ||
        spot.creatorName.toLowerCase().includes(term);

      return filterMatches && searchMatches;
    });
  }, [spots, search, filter]);

  const shareSpot = async (spot: UnlockedSpot) => {
    const url = spot.spotUrl.startsWith('http')
      ? spot.spotUrl
      : `${window.location.origin}${spot.spotUrl}`;

    const messageText =
      `I unlocked ${spot.caption} on SPOTC. ` +
      `${spot.area || spot.district ? `${spot.area || spot.district}. ` : ''}` +
      'Discover this place with me.';

    try {
      if (navigator.share) {
        await navigator.share({
          title: spot.caption,
          text: messageText,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(`${messageText} ${url}`);
      setMessage('Spot link copied to clipboard.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      console.error('Share unlocked spot failed:', error);
      setMessage('Unable to share this place right now.');
    }
  };

  const openDirections = (spot: UnlockedSpot) => {
    if (!spot.mapsUrl) {
      setMessage('Directions are not available for this place.');
      return;
    }

    window.open(spot.mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const openSpot = (spot: UnlockedSpot) => {
    if (spot.spotUrl.startsWith('http')) {
      window.open(spot.spotUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = spot.spotUrl;
  };

  if (!authChecked || loading) {
    return (
      <section className="unlock-loading">
        <span />
        <p>Loading your unlocked places…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="unlock-empty">
        <LockOpen />
        <h2>Sign in to see unlocked places</h2>
        <p>
          Places you unlock from SPOTC Spots will be saved here automatically.
        </p>
      </section>
    );
  }

  return (
    <div className="unlock-page">
      <section className="unlock-hero">
        <div>
          <span className="unlock-eyebrow">
            <Sparkles /> YOUR SPOTC DISCOVERIES
          </span>

          <h2>Every place you unlock, saved in one premium collection.</h2>

          <p>
            Revisit hidden local places, open directions, share discoveries
            and continue exploring without searching again.
          </p>
        </div>

        <div className="unlock-total-card">
          <small>TOTAL UNLOCKED</small>
          <strong>{summary.total}</strong>
          <span>
            {summary.newest
              ? `Latest: ${summary.newest.caption}`
              : 'Start unlocking from the Spots feed'}
          </span>
        </div>
      </section>

      <section className="unlock-summary-grid">
        <article>
          <span className="unlock-summary-icon purple">
            <LockOpen />
          </span>
          <div>
            <small>Unlocked Places</small>
            <strong>{summary.total}</strong>
            <p>Saved permanently to your account</p>
          </div>
        </article>

        <article>
          <span className="unlock-summary-icon orange">
            <Compass />
          </span>
          <div>
            <small>Categories</small>
            <strong>{summary.categories}</strong>
            <p>Different discovery types</p>
          </div>
        </article>

        <article>
          <span className="unlock-summary-icon blue">
            <MapPin />
          </span>
          <div>
            <small>Areas Explored</small>
            <strong>{summary.districts}</strong>
            <p>Districts in your collection</p>
          </div>
        </article>

        <article>
          <span className="unlock-summary-icon green">
            <Trophy />
          </span>
          <div>
            <small>Explorer Status</small>
            <strong>
              {summary.total >= 10
                ? 'Pro'
                : summary.total >= 5
                  ? 'Active'
                  : 'Starter'}
            </strong>
            <p>Based on unlocked discoveries</p>
          </div>
        </article>
      </section>

      {summary.newest && (
        <section className="unlock-latest">
          <div>
            <span>LATEST DISCOVERY</span>
            <h2>{summary.newest.caption}</h2>
            <p>
              {summary.newest.area ||
                summary.newest.district ||
                'Location unlocked'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelected(summary.newest)}
          >
            View discovery <ChevronRight />
          </button>
        </section>
      )}

      <section className="unlock-toolbar">
        <div className="unlock-tabs">
          {[
            ['all', 'All Unlocks'],
            ['recent', 'Recent'],
            ['places', 'Places'],
            ['experiences', 'Experiences'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value as UnlockFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <label>
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search place, area or category"
          />
        </label>
      </section>

      {message && (
        <div className="unlock-message">
          <BadgeCheck />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}>
            <X />
          </button>
        </div>
      )}

      <section className="unlock-grid">
        {visibleSpots.map((spot) => (
          <article className="unlock-card" key={spot.id}>
            <div className="unlock-card-image">
              {spot.image ? (
                <img src={spot.image} alt={spot.caption} />
              ) : (
                <span className="unlock-image-placeholder">
                  <ImageIcon />
                </span>
              )}

              <span className="unlock-status">
                <LockOpen /> UNLOCKED
              </span>

              <span className="unlock-category">
                {spot.category}
              </span>
            </div>

            <div className="unlock-card-content">
              <div className="unlock-card-heading">
                <div>
                  <small>{spot.creatorName}</small>
                  <h2>{spot.caption}</h2>
                </div>

                <span>
                  <Star /> Saved
                </span>
              </div>

              <p className="unlock-location">
                <MapPin />
                {[spot.area, spot.district]
                  .filter(Boolean)
                  .join(', ') || 'Hidden location unlocked'}
              </p>

              {spot.description && (
                <p className="unlock-description">
                  {spot.description}
                </p>
              )}

              <div className="unlock-meta">
                <span>
                  <CalendarDays />
                  {formatDate(spot.unlockedAt ?? spot.createdAt)}
                </span>

                <span>
                  <Eye />
                  {Math.round(spot.views)} views
                </span>

                <span>
                  <Heart />
                  {Math.round(spot.likes)} likes
                </span>
              </div>

              <div className="unlock-actions">
                <button
                  type="button"
                  onClick={() => setSelected(spot)}
                >
                  View Details <ChevronRight />
                </button>

                <button
                  type="button"
                  className="primary"
                  onClick={() => openDirections(spot)}
                  disabled={!spot.mapsUrl}
                >
                  <Navigation /> Directions
                </button>

                <button
                  type="button"
                  onClick={() => void shareSpot(spot)}
                >
                  <Share2 /> Share
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {!visibleSpots.length &&
        (spots.length === 0 && filter === 'all' && !search.trim() ? (
          <UnlockSamplePreview />
        ) : (
          <section className="unlock-empty">
            <Compass />
            <h2>No unlocked places in this section</h2>
            <p>
              Try another filter or unlock more discoveries from the Spots
              feed.
            </p>
          </section>
        ))}

      {selected && (
        <div
          className="unlock-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="unlock-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="unlock-modal-close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>

            <div className="unlock-modal-image">
              {selected.image ? (
                <img src={selected.image} alt={selected.caption} />
              ) : (
                <span>
                  <ImageIcon />
                </span>
              )}

              <i>
                <LockOpen /> UNLOCKED DISCOVERY
              </i>
            </div>

            <span className="unlock-modal-kicker">
              <Trophy /> SAVED TO YOUR COLLECTION
            </span>

            <h2>{selected.caption}</h2>

            <p className="unlock-modal-location">
              <MapPin />
              {[selected.address, selected.area, selected.district]
                .filter(Boolean)
                .join(', ') || 'Unlocked location'}
            </p>

            {selected.description && (
              <p className="unlock-modal-description">
                {selected.description}
              </p>
            )}

            <div className="unlock-detail-grid">
              <article>
                <Compass />
                <span>
                  <small>CATEGORY</small>
                  <strong>{selected.category}</strong>
                </span>
              </article>

              <article>
                <CalendarDays />
                <span>
                  <small>UNLOCKED ON</small>
                  <strong>
                    {formatDate(
                      selected.unlockedAt ?? selected.createdAt,
                    )}
                  </strong>
                </span>
              </article>

              <article>
                <Eye />
                <span>
                  <small>SPOT VIEWS</small>
                  <strong>{Math.round(selected.views)}</strong>
                </span>
              </article>

              <article>
                <Heart />
                <span>
                  <small>SPOT LIKES</small>
                  <strong>{Math.round(selected.likes)}</strong>
                </span>
              </article>
            </div>

            <div className="unlock-value-note">
              <BadgeCheck />
              <span>
                <strong>Why this page is useful</strong>
                <small>
                  Your unlock is saved to your account, so you can revisit the
                  place, open directions and share it later.
                </small>
              </span>
            </div>

            <div className="unlock-modal-actions">
              <button
                type="button"
                onClick={() => openSpot(selected)}
              >
                <ExternalLink /> Open Spot
              </button>

              <button
                type="button"
                className="primary"
                disabled={!selected.mapsUrl}
                onClick={() => openDirections(selected)}
              >
                <Navigation /> Directions
              </button>

              <button
                type="button"
                onClick={() => void shareSpot(selected)}
              >
                <Share2 /> Share
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .unlock-page{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;display:grid;grid-template-columns:minmax(0,1fr);gap:20px;color:#20252b;text-align:left!important}
        .unlock-hero{position:relative;width:100%;min-height:178px;padding:24px 28px;display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,280px);align-items:center;gap:28px;overflow:hidden;border:1px solid #e4e7ec;border-radius:24px;background:radial-gradient(circle at 86% 16%,rgba(109,60,223,.16),transparent 31%),linear-gradient(135deg,#fff,#faf8ff);box-shadow:0 14px 36px rgba(42,48,61,.06);text-align:left!important}
        .unlock-hero:after{content:'📍';position:absolute;right:315px;top:22px;font-size:68px;opacity:.11}
        .unlock-eyebrow,.unlock-modal-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#6532cd;background:#eee7ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .unlock-hero h2{max-width:760px;margin:10px 0 7px;font-size:clamp(25px,2.35vw,36px);line-height:1.12;font-weight:600;letter-spacing:-.03em;text-align:left!important}
        .unlock-hero p{max-width:720px;margin:0;color:#6d7580;font-size:14px;line-height:1.6;text-align:left!important}
        .unlock-total-card{position:relative;z-index:1;width:100%;min-width:0;padding:18px 20px;border:1px solid #ddcffd;border-radius:18px;background:rgba(255,255,255,.92);box-shadow:0 13px 30px rgba(83,50,151,.09);text-align:left!important}
        .unlock-total-card small,.unlock-total-card strong,.unlock-total-card span{display:block}.unlock-total-card small{color:#77658e;font-size:9px;letter-spacing:.09em}.unlock-total-card strong{margin-top:6px;color:#5725bd;font-size:35px;font-weight:600}.unlock-total-card span{margin-top:3px;color:#6d7580;font-size:12px}

        .unlock-summary-grid{width:100%;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
        .unlock-summary-grid article{min-width:0;min-height:104px;padding:16px;display:flex;align-items:center;justify-content:flex-start;gap:13px;border:1px solid #e4e7ec;border-radius:19px;background:#fff;box-shadow:0 10px 25px rgba(42,48,61,.055);text-align:left!important}
        .unlock-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}.unlock-summary-icon svg{width:24px}.unlock-summary-icon.orange{color:#df7a00;background:#fff0db}.unlock-summary-icon.purple{color:#6734da;background:#eee8ff}.unlock-summary-icon.green{color:#159b50;background:#e8f8ef}.unlock-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .unlock-summary-grid small,.unlock-summary-grid strong,.unlock-summary-grid p{display:block;text-align:left!important}.unlock-summary-grid small{font-size:11px;font-weight:500}.unlock-summary-grid strong{margin-top:4px;font-size:24px;font-weight:600}.unlock-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .unlock-latest{width:100%;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #eadbf9;border-radius:18px;background:linear-gradient(135deg,#fcf9ff,#fff);box-shadow:0 9px 24px rgba(79,47,140,.055);text-align:left!important}
        .unlock-latest span{color:#7140ca;font-size:9px;letter-spacing:.08em;text-align:left!important}.unlock-latest h2{margin:5px 0 3px;font-size:19px;font-weight:600;text-align:left!important}.unlock-latest p{margin:0;color:#707985;font-size:12px;text-align:left!important}
        .unlock-latest button{min-height:42px;padding:0 15px;display:flex;align-items:center;gap:6px;border:1px solid #d9c7ff;border-radius:12px;color:#5f31bd;background:#f4f0ff;font-weight:500;cursor:pointer}.unlock-latest button svg{width:16px}

        .unlock-toolbar{width:100%;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e4e7ec;border-radius:16px;background:#fff}
        .unlock-tabs{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}.unlock-tabs::-webkit-scrollbar{display:none}.unlock-tabs button{min-height:38px;padding:0 13px;flex:0 0 auto;border:1px solid transparent;border-radius:11px;color:#68717c;background:transparent;font-weight:500;cursor:pointer}.unlock-tabs button.active{color:#5f31bd;border-color:#d9c7ff;background:#f3efff}
        .unlock-toolbar label{width:min(320px,100%);min-height:40px;padding:0 12px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}.unlock-toolbar label svg{width:18px;color:#818996}.unlock-toolbar input{width:100%;border:0;outline:0;background:transparent}

        .unlock-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}.unlock-message svg{width:20px}.unlock-message span{flex:1}.unlock-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .unlock-grid{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .unlock-card{min-width:0;overflow:hidden;border:1px solid #e3e7ec;border-radius:24px;background:#fff;box-shadow:0 14px 36px rgba(42,48,61,.07)}
        .unlock-card-image{position:relative;height:190px;overflow:hidden;background:#eff1f4}.unlock-card-image>img{width:100%;height:100%;object-fit:cover}.unlock-image-placeholder{width:100%;height:100%;display:grid;place-items:center;color:#8d96a2;background:linear-gradient(135deg,#f2f4f7,#e8ebf0)}.unlock-image-placeholder svg{width:42px;height:42px}
        .unlock-card-image:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,12,18,.04),rgba(12,12,18,.42))}
        .unlock-status,.unlock-category{position:absolute;z-index:2;top:14px;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:600}.unlock-status{left:14px;display:flex;align-items:center;gap:5px;color:#fff;background:rgba(89,45,187,.84);backdrop-filter:blur(6px)}.unlock-status svg{width:13px}.unlock-category{right:14px;color:#4d5661;background:#fff}
        .unlock-card-content{padding:18px;text-align:left!important}.unlock-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;text-align:left!important}.unlock-card-heading small,.unlock-card-heading h2{display:block}.unlock-card-heading small{color:#7655ae;font-size:9px}.unlock-card-heading h2{margin:4px 0 0;font-size:19px;font-weight:600}.unlock-card-heading>span{padding:7px 9px;display:flex;align-items:center;gap:4px;flex:0 0 auto;border-radius:10px;color:#138645;background:#e8f8ee;font-size:10px;font-weight:600}.unlock-card-heading>span svg{width:13px}
        .unlock-location{margin:9px 0 0;display:flex;align-items:center;gap:5px;color:#727b86;font-size:11px}.unlock-location svg{width:15px}
        .unlock-description{display:-webkit-box;margin:13px 0 0;overflow:hidden;color:#626b76;font-size:12px;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-align:left!important}
        .unlock-meta{margin-top:15px;padding:11px 0;display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}.unlock-meta span{display:flex;align-items:center;gap:5px;color:#7a838e;font-size:10px}.unlock-meta svg{width:14px}
        .unlock-actions{margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.unlock-actions button{min-height:42px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid #e1e4e9;border-radius:11px;color:#4d5661;background:#fff;font-size:11px;font-weight:500;cursor:pointer}.unlock-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.unlock-actions button:disabled{opacity:.45}.unlock-actions svg{width:15px}

        .unlock-empty,.unlock-loading{min-height:320px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}.unlock-empty>svg{width:50px;height:50px;color:#6b39d8}.unlock-empty h2{margin:12px 0 5px}.unlock-empty p{max-width:520px;margin:0;color:#707985}.unlock-loading{gap:13px;color:#717a85}.unlock-loading>span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#6b39d8;border-radius:50%;animation:unlockSpin .8s linear infinite}

        .unlock-sample{padding:20px;border:1px dashed #cfd6e2;border-radius:22px;background:radial-gradient(circle at 92% 8%,rgba(109,60,223,.08),transparent 24%),linear-gradient(180deg,#fcfdff,#f8fafc)}
        .unlock-sample-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:17px}.unlock-sample-head h3{margin:0;font-size:19px;font-weight:600}.unlock-sample-head p{max-width:720px;margin:6px 0 0;color:#707985;font-size:13px;line-height:1.5}.unlock-sample-head span{padding:8px 11px;flex:0 0 auto;border-radius:999px;color:#5d35bc;background:#eee8ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .unlock-sample-card{overflow:hidden;border:1px solid #e2e6ec;border-radius:22px;background:#fff;box-shadow:0 12px 28px rgba(42,48,61,.06)}.unlock-sample-card .unlock-actions button{cursor:not-allowed;opacity:.72}
        .unlock-sample-note{margin:14px 18px 18px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px}.unlock-sample-note svg{width:18px;flex:0 0 auto}

        .unlock-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .unlock-modal{position:relative;width:min(680px,100%);max-height:92vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}.unlock-modal-close{position:absolute;z-index:4;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .unlock-modal-image{position:relative;height:250px;margin:-27px -27px 20px;overflow:hidden;border-radius:26px 26px 0 0;background:#eef1f4}.unlock-modal-image img{width:100%;height:100%;object-fit:cover}.unlock-modal-image>span{width:100%;height:100%;display:grid;place-items:center;color:#87909c}.unlock-modal-image>span svg{width:54px;height:54px}.unlock-modal-image:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(10,10,15,.48))}.unlock-modal-image i{position:absolute;z-index:2;left:17px;bottom:17px;padding:8px 10px;display:flex;align-items:center;gap:6px;border-radius:999px;color:#fff;background:rgba(89,45,187,.85);font-size:10px;font-style:normal;font-weight:600}.unlock-modal-image i svg{width:14px}
        .unlock-modal>h2{margin:13px 0 6px;font-size:27px;font-weight:600}.unlock-modal-location{display:flex;align-items:flex-start;gap:6px;color:#6f7883;font-size:12px;line-height:1.5}.unlock-modal-location svg{width:16px;flex:0 0 auto}.unlock-modal-description{margin:15px 0 0;color:#626b76;font-size:13px;line-height:1.6}
        .unlock-detail-grid{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.unlock-detail-grid article{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}.unlock-detail-grid svg{width:20px;color:#6734da}.unlock-detail-grid small,.unlock-detail-grid strong{display:block}.unlock-detail-grid small{color:#7c8490;font-size:8px}.unlock-detail-grid strong{margin-top:3px;font-size:12px;font-weight:600}
        .unlock-value-note{margin-top:16px;padding:14px;display:flex;align-items:flex-start;gap:10px;border:1px solid #d7e9df;border-radius:14px;background:#f3faf5;color:#326545}.unlock-value-note>svg{width:20px;flex:0 0 auto}.unlock-value-note strong,.unlock-value-note small{display:block}.unlock-value-note strong{font-size:12px}.unlock-value-note small{margin-top:4px;color:#537661;font-size:10px;line-height:1.5}
        .unlock-modal-actions{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.unlock-modal-actions button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e0e4e9;border-radius:12px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}.unlock-modal-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.unlock-modal-actions button:disabled{opacity:.45}.unlock-modal-actions svg{width:16px}

        .dash-content>.unlock-page,
        .dash-content .unlock-page,
        .unlock-page>section,
        .unlock-page>.unlock-grid{max-width:none!important}
        .dash-content>.unlock-page{width:100%!important;margin-left:0!important;margin-right:0!important}
        .unlock-page,
        .unlock-page section,
        .unlock-page article,
        .unlock-page div,
        .unlock-page h1,
        .unlock-page h2,
        .unlock-page h3,
        .unlock-page p,
        .unlock-page small,
        .unlock-page strong,
        .unlock-page span{box-sizing:border-box}
        .unlock-page,
        .unlock-page .unlock-hero,
        .unlock-page .unlock-total-card,
        .unlock-page .unlock-summary-grid article,
        .unlock-page .unlock-latest,
        .unlock-page .unlock-card-content,
        .unlock-page .unlock-modal,
        .unlock-page .unlock-sample{text-align:left!important}
        .unlock-page .unlock-hero>div:first-child,
        .unlock-page .unlock-latest>div,
        .unlock-page .unlock-summary-grid article>div,
        .unlock-page .unlock-card-heading>div{align-items:flex-start!important;text-align:left!important}

        @keyframes unlockSpin{to{transform:rotate(360deg)}}

        @media(max-width:1200px){
          .unlock-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .unlock-hero{grid-template-columns:minmax(0,1fr) 240px}
        }

        @media(max-width:900px){
          .unlock-hero{display:block;min-height:0;padding:22px}.unlock-total-card{margin-top:18px}.unlock-hero:after{display:none}
          .unlock-grid{grid-template-columns:1fr}
          .unlock-toolbar{align-items:stretch;flex-direction:column}.unlock-toolbar label{width:100%}
        }

        @media(max-width:680px){
          .unlock-summary-grid{grid-template-columns:1fr}
          .unlock-actions,.unlock-detail-grid,.unlock-modal-actions{grid-template-columns:1fr}
          .unlock-latest{align-items:stretch;flex-direction:column}.unlock-latest button{justify-content:center}
          .unlock-sample-head{flex-direction:column}
        }
      `}</style>
    </div>
  );
}

function UnlockSamplePreview() {
  return (
    <section className="unlock-sample">
      <div className="unlock-sample-head">
        <div>
          <h3>See how unlocked discoveries will appear</h3>
          <p>
            This sample is shown only while your account has no real unlocked
            places. It disappears automatically after your first unlock.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="unlock-sample-card">
        <div className="unlock-card-image">
          <img src={SAMPLE_IMAGE} alt="Sample unlocked place" />
          <span className="unlock-status">
            <LockOpen /> UNLOCKED
          </span>
          <span className="unlock-category">Nature</span>
        </div>

        <div className="unlock-card-content">
          <div className="unlock-card-heading">
            <div>
              <small>SPOTC Local Creator</small>
              <h2>Hidden Valley Viewpoint</h2>
            </div>

            <span>
              <Star /> Saved
            </span>
          </div>

          <p className="unlock-location">
            <MapPin /> Karamadai, Coimbatore
          </p>

          <p className="unlock-description">
            A peaceful viewpoint discovered by the local SPOTC community.
          </p>

          <div className="unlock-meta">
            <span>
              <CalendarDays /> 21 Jul 2026
            </span>
            <span>
              <Eye /> 248 views
            </span>
            <span>
              <Heart /> 36 likes
            </span>
          </div>

          <div className="unlock-actions">
            <button type="button" disabled>
              View Details <ChevronRight />
            </button>
            <button type="button" className="primary" disabled>
              <Navigation /> Directions
            </button>
            <button type="button" disabled>
              <Share2 /> Share
            </button>
          </div>
        </div>

        <div className="unlock-sample-note">
          <BadgeCheck />
          Sample data does not write to Firebase or affect your real unlocks.
        </div>
      </article>
    </section>
  );
}