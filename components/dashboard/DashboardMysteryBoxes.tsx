'use client';

import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Gift,
  Lock,
  MapPin,
  Navigation,
  PackageOpen,
  Search,
  Sparkles,
  Star,
  Store,
  TicketCheck,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type BoxFilter = 'all' | 'available' | 'unlocked' | 'claimed';

type WalletData = {
  businessCoins: number;
  nearbyBonusPoints: number;
  levelBonusPoints: number;
  totalPoints: number;
};

type MysteryBoxRecord = {
  id: string;
  title: string;
  subtitle: string;
  rewardTitle: string;
  rewardSubtitle: string;
  rewardType: string;
  requiredPoints: number;
  priority: number;
  images: string[];
  businessId: string;
  businessName: string;
  businessLogo: string;
  websiteUrl: string;
  directionsUrl: string;
  expiresAt: Date | null;
  totalQuantity: number;
  unlockedCount: number;
  isActive: boolean;
  raw: DocumentData;
};

type UserMysteryBoxRecord = {
  id: string;
  mysteryBoxId: string;
  status: string;
  openedAt: Date | null;
  claimedAt: Date | null;
  couponId: string;
  raw: DocumentData;
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function numberOf(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();

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
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }

  return '';
}

function imagesOf(data: DocumentData): string[] {
  const candidates = [
    data.image_urls,
    data.images,
    data.gallery_images,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const images = candidate.map(textOf).filter(Boolean);
      if (images.length) return images;
    }
  }

  return [
    data.image_url,
    data.image,
    data.cover_image,
    data.thumbnail_url,
  ]
    .map(textOf)
    .filter(Boolean);
}

function mapMysteryBox(id: string, data: DocumentData): MysteryBoxRecord {
  return {
    id,
    title:
      textOf(data.title) ||
      textOf(data.name) ||
      'SPOTC Mystery Box',
    subtitle:
      textOf(data.subtitle) ||
      textOf(data.location_text) ||
      textOf(data.address),
    rewardTitle:
      textOf(data.reward_description) ||
      textOf(data.reward_title) ||
      textOf(data.reward) ||
      'Premium SPOTC Reward',
    rewardSubtitle:
      textOf(data.reward_subtitle) ||
      textOf(data.description) ||
      'Unlock the box to reveal and claim this reward.',
    rewardType:
      textOf(data.reward_type) ||
      'mystery_box',
    requiredPoints: Math.max(
      1,
      numberOf(data.required_points) || 500,
    ),
    priority: numberOf(data.priority) || 999,
    images: imagesOf(data),
    businessId:
      refIdOf(data.sponsor_business_ref) ||
      refIdOf(data.business_ref),
    businessName:
      textOf(data.sponsor_name) ||
      textOf(data.business_name) ||
      'SPOTC Sponsor',
    businessLogo:
      textOf(data.business_logo) ||
      textOf(data.sponsor_logo),
    websiteUrl:
      textOf(data.website_url) ||
      textOf(data.business_url),
    directionsUrl:
      textOf(data.directions_url) ||
      textOf(data.maps_url),
    expiresAt: dateOf(data.expires_at),
    totalQuantity: Math.max(0, numberOf(data.total_quantity)),
    unlockedCount: Math.max(0, numberOf(data.unlocked_count)),
    isActive: data.is_active !== false,
    raw: data,
  };
}

function mapUserBox(id: string, data: DocumentData): UserMysteryBoxRecord {
  return {
    id,
    mysteryBoxId: refIdOf(data.mystery_box_ref),
    status: textOf(data.status).toLowerCase() || 'unlocked',
    openedAt: dateOf(data.opened_at),
    claimedAt: dateOf(data.claimed_at),
    couponId: refIdOf(data.coupon_ref),
    raw: data,
  };
}

function formatDate(date: Date | null): string {
  if (!date) return 'No expiry';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function boxState(
  box: MysteryBoxRecord,
  userBox: UserMysteryBoxRecord | undefined,
): 'locked' | 'available' | 'unlocked' | 'claimed' | 'expired' | 'soldout' {
  if (userBox?.claimedAt || userBox?.status === 'claimed') return 'claimed';
  if (userBox) return 'unlocked';

  if (box.expiresAt && box.expiresAt.getTime() < Date.now()) return 'expired';

  if (
    box.totalQuantity > 0 &&
    box.unlockedCount >= box.totalQuantity
  ) {
    return 'soldout';
  }

  return 'locked';
}

const fallbackImages = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200',
];

export default function DashboardMysteryBoxes() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData>({
    businessCoins: 0,
    nearbyBonusPoints: 0,
    levelBonusPoints: 0,
    totalPoints: 0,
  });
  const [boxes, setBoxes] = useState<MysteryBoxRecord[]>([]);
  const [userBoxes, setUserBoxes] = useState<UserMysteryBoxRecord[]>([]);
  const [filter, setFilter] = useState<BoxFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MysteryBoxRecord | null>(null);
  const [busyId, setBusyId] = useState('');
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

  const loadData = async (currentUser: User) => {
    setLoading(true);

    try {
      const db = getFirestore();

      const [walletSnapshot, boxesSnapshot, userBoxesSnapshot] =
        await Promise.all([
          getDocs(
            query(
              collection(db, 'UserWallet'),
              where('user_uid', '==', currentUser.uid),
              limit(1),
            ),
          ).catch(() => null),
          getDocs(
            query(
              collection(db, 'MysteryBoxes'),
              where('is_active', '==', true),
              orderBy('priority', 'asc'),
              limit(50),
            ),
          ).catch(() =>
            getDocs(
              query(
                collection(db, 'MysteryBoxes'),
                where('is_active', '==', true),
                limit(50),
              ),
            ).catch(() => null),
          ),
          getDocs(
            query(
              collection(db, 'UserMysteryBoxes'),
              where('user_uid', '==', currentUser.uid),
              limit(100),
            ),
          ).catch(() => null),
        ]);

      const walletData =
        walletSnapshot?.docs[0]?.data() ?? {};

      const businessCoins = numberOf(
        walletData.business_coin_points,
      );

      const nearbyBonusPoints = numberOf(
        walletData.nearby_bonus_points,
      );

      const levelBonusPoints =
        Math.floor(businessCoins / 100) * 10;

      setWallet({
        businessCoins,
        nearbyBonusPoints,
        levelBonusPoints,
        totalPoints:
          businessCoins +
          nearbyBonusPoints +
          levelBonusPoints,
      });

      setBoxes(
        (boxesSnapshot?.docs.map((boxDoc) =>
          mapMysteryBox(boxDoc.id, boxDoc.data()),
        ) ?? []).sort((a, b) => a.priority - b.priority),
      );

      setUserBoxes(
        userBoxesSnapshot?.docs.map((userBoxDoc) =>
          mapUserBox(userBoxDoc.id, userBoxDoc.data()),
        ) ?? [],
      );
    } catch (error) {
      console.error('Mystery Boxes load failed:', error);
      setMessage('Some Mystery Box information could not be loaded.');
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

    void loadData(user);
  }, [authChecked, user]);

  const userBoxMap = useMemo(() => {
    return new Map(
      userBoxes.map((userBox) => [
        userBox.mysteryBoxId,
        userBox,
      ]),
    );
  }, [userBoxes]);

  const summary = useMemo(() => {
    let available = 0;
    let unlocked = 0;
    let claimed = 0;
    let expired = 0;

    for (const box of boxes) {
      const state = boxState(box, userBoxMap.get(box.id));

      if (
        state === 'locked' &&
        wallet.totalPoints >= box.requiredPoints
      ) {
        available += 1;
      }

      if (state === 'unlocked') unlocked += 1;
      if (state === 'claimed') claimed += 1;
      if (state === 'expired') expired += 1;
    }

    const nextBox = boxes
      .filter((box) => !userBoxMap.has(box.id))
      .filter((box) => {
        const state = boxState(box, undefined);
        return !['expired', 'soldout'].includes(state);
      })
      .sort((a, b) => a.requiredPoints - b.requiredPoints)[0];

    return {
      available,
      unlocked,
      claimed,
      expired,
      nextBox,
      pointsRemaining: nextBox
        ? Math.max(0, nextBox.requiredPoints - wallet.totalPoints)
        : 0,
    };
  }, [boxes, userBoxMap, wallet.totalPoints]);

  const visibleBoxes = useMemo(() => {
    const term = search.trim().toLowerCase();

    return boxes.filter((box) => {
      const userBox = userBoxMap.get(box.id);
      const rawState = boxState(box, userBox);
      const effectiveState =
        rawState === 'locked' &&
        wallet.totalPoints >= box.requiredPoints
          ? 'available'
          : rawState;

      const filterMatches =
        filter === 'all' ||
        (filter === 'available' && effectiveState === 'available') ||
        (filter === 'unlocked' && effectiveState === 'unlocked') ||
        (filter === 'claimed' && effectiveState === 'claimed');

      const searchMatches =
        !term ||
        box.title.toLowerCase().includes(term) ||
        box.rewardTitle.toLowerCase().includes(term) ||
        box.businessName.toLowerCase().includes(term) ||
        box.subtitle.toLowerCase().includes(term);

      return filterMatches && searchMatches;
    });
  }, [boxes, filter, search, userBoxMap, wallet.totalPoints]);

  const unlockBox = async (box: MysteryBoxRecord) => {
    if (!user || busyId) return;

    if (wallet.totalPoints < box.requiredPoints) {
      setMessage(
        `You need ${box.requiredPoints - wallet.totalPoints} more points to unlock this box.`,
      );
      return;
    }

    if (box.expiresAt && box.expiresAt.getTime() < Date.now()) {
      setMessage('This Mystery Box has expired.');
      return;
    }

    setBusyId(box.id);

    try {
      const db = getFirestore();
      const boxRef = doc(db, 'MysteryBoxes', box.id);
      const userBoxRef = doc(
        collection(db, 'UserMysteryBoxes'),
      );

      await runTransaction(db, async (transaction) => {
        const latestBoxSnapshot = await transaction.get(boxRef);

        if (!latestBoxSnapshot.exists()) {
          throw new Error('Mystery Box not found.');
        }

        const latestBox = latestBoxSnapshot.data();
        const expiresAt = dateOf(latestBox.expires_at);
        const totalQuantity = numberOf(latestBox.total_quantity);
        const unlockedCount = numberOf(latestBox.unlocked_count);

        if (expiresAt && expiresAt.getTime() < Date.now()) {
          throw new Error('This Mystery Box has expired.');
        }

        if (
          totalQuantity > 0 &&
          unlockedCount >= totalQuantity
        ) {
          throw new Error('This Mystery Box is sold out.');
        }

        const duplicateQuery = query(
          collection(db, 'UserMysteryBoxes'),
          where('user_uid', '==', user.uid),
          where('mystery_box_ref', '==', boxRef),
          limit(1),
        );

        const duplicateSnapshot = await getDocs(duplicateQuery);

        if (!duplicateSnapshot.empty) {
          throw new Error('Mystery Box already unlocked.');
        }

        transaction.set(userBoxRef, {
          user_uid: user.uid,
          user_ref: doc(db, 'users', user.uid),
          mystery_box_ref: boxRef,
          mystery_box_title: box.title,
          required_points: box.requiredPoints,
          reward_title: box.rewardTitle,
          reward_type: box.rewardType,
          business_ref: box.businessId
            ? doc(db, 'BusinessListings', box.businessId)
            : null,
          business_name: box.businessName,
          business_logo: box.businessLogo,
          status: 'unlocked',
          opened_at: serverTimestamp(),
          claimed_at: null,
          coupon_ref: null,
        });

        transaction.update(boxRef, {
          unlocked_count: unlockedCount + 1,
          updated_at: serverTimestamp(),
        });
      });

      setMessage(`🎉 ${box.title} unlocked successfully.`);
      await loadData(user);
    } catch (error) {
      console.error('Unlock Mystery Box failed:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to unlock this Mystery Box.',
      );
    } finally {
      setBusyId('');
    }
  };

  const claimReward = async (box: MysteryBoxRecord) => {
    if (!user || busyId) return;

    const userBox = userBoxMap.get(box.id);

    if (!userBox) {
      setMessage('Unlock this Mystery Box before claiming the reward.');
      return;
    }

    if (userBox.claimedAt || userBox.status === 'claimed') {
      setMessage('This reward has already been claimed.');
      return;
    }

    setBusyId(box.id);

    try {
      const db = getFirestore();
      const userBoxRef = doc(
        db,
        'UserMysteryBoxes',
        userBox.id,
      );

      const existingCouponSnapshot = await getDocs(
        query(
          collection(db, 'UserCoupons'),
          where(
            'user_ref',
            '==',
            doc(db, 'users', user.uid),
          ),
          where(
            'mystery_box_ref',
            '==',
            doc(db, 'MysteryBoxes', box.id),
          ),
          limit(1),
        ),
      ).catch(() => null);

      let couponId =
        existingCouponSnapshot?.docs[0]?.id ?? '';

      if (!couponId) {
        const couponRef = await addDoc(
          collection(db, 'UserCoupons'),
          {
            user_uid: user.uid,
            user_ref: doc(db, 'users', user.uid),
            mystery_box_ref: doc(
              db,
              'MysteryBoxes',
              box.id,
            ),
            user_mystery_box_ref: userBoxRef,
            title: box.title,
            coupon_title: box.title,
            reward_description: box.rewardTitle,
            coupon_description: box.rewardTitle,
            reward_subtitle: box.rewardSubtitle,
            business_name: box.businessName,
            business_logo: box.businessLogo,
            business_ref: box.businessId
              ? doc(
                  db,
                  'BusinessListings',
                  box.businessId,
                )
              : null,
            coupon_code:
              `SPOTC-${Date.now().toString(36).toUpperCase()}`,
            coupon_type: box.rewardType,
            expires_at:
              box.expiresAt ??
              Timestamp.fromDate(
                new Date(
                  Date.now() + 90 * 24 * 60 * 60 * 1000,
                ),
              ),
            status: 'active',
            is_used: false,
            claimed_at: serverTimestamp(),
            created_at: serverTimestamp(),
          },
        );

        couponId = couponRef.id;
      }

      await runTransaction(db, async (transaction) => {
        transaction.update(userBoxRef, {
          status: 'claimed',
          claimed_at: serverTimestamp(),
          coupon_ref: doc(
            db,
            'UserCoupons',
            couponId,
          ),
        });
      });

      setMessage(
        'Reward claimed. It is now available in your Rewards tab.',
      );
      await loadData(user);
    } catch (error) {
      console.error('Claim reward failed:', error);
      setMessage('Unable to claim this reward right now.');
    } finally {
      setBusyId('');
    }
  };

  const openExternal = (url: string) => {
    if (!url) {
      setMessage('This link is not available yet.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!authChecked || loading) {
    return (
      <section className="mystery-loading">
        <span />
        <p>Loading your Mystery Boxes…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="mystery-empty-page">
        <Gift />
        <h2>Sign in to unlock Mystery Boxes</h2>
        <p>
          Earn points, unlock sponsored rewards and claim them into your wallet.
        </p>
      </section>
    );
  }

  return (
    <div className="mystery-page">
      <section className="mystery-hero">
        <div>
          <span className="mystery-eyebrow">
            <Sparkles /> SPOTC MYSTERY BOXES
          </span>
          <h2>Turn everyday shopping into premium surprises.</h2>
          <p>
            Earn points from approved bills, reach each box target, unlock the
            reward and claim it into your Rewards wallet.
          </p>
        </div>

        <div className="mystery-points-card">
          <small>YOUR TOTAL POINTS</small>
          <strong>{Math.round(wallet.totalPoints)}</strong>
          <span>
            {summary.nextBox
              ? summary.pointsRemaining > 0
                ? `${Math.round(summary.pointsRemaining)} points to the next box`
                : 'Your next box is ready to unlock'
              : 'All available boxes completed'}
          </span>
        </div>
      </section>

      <section className="mystery-summary-grid">
        <article>
          <span className="mystery-summary-icon orange"><Zap /></span>
          <div><small>Ready to Unlock</small><strong>{summary.available}</strong><p>Targets completed</p></div>
        </article>

        <article>
          <span className="mystery-summary-icon purple"><PackageOpen /></span>
          <div><small>Unlocked</small><strong>{summary.unlocked}</strong><p>Waiting to be claimed</p></div>
        </article>

        <article>
          <span className="mystery-summary-icon green"><TicketCheck /></span>
          <div><small>Claimed Rewards</small><strong>{summary.claimed}</strong><p>Moved to Rewards wallet</p></div>
        </article>

        <article>
          <span className="mystery-summary-icon blue"><Star /></span>
          <div><small>Bonus Points</small><strong>{Math.round(wallet.nearbyBonusPoints + wallet.levelBonusPoints)}</strong><p>Nearby and level bonuses</p></div>
        </article>
      </section>

      {summary.nextBox && (
        <section className="mystery-next-card">
          <div className="mystery-next-copy">
            <span>NEXT TARGET</span>
            <h2>{summary.nextBox.title}</h2>
            <p>{summary.nextBox.rewardTitle}</p>
          </div>

          <div className="mystery-next-progress">
            <div>
              <span>
                {Math.round(wallet.totalPoints)} / {summary.nextBox.requiredPoints} pts
              </span>
              <strong>
                {Math.min(
                  100,
                  Math.round(
                    (wallet.totalPoints /
                      summary.nextBox.requiredPoints) *
                      100,
                  ),
                )}
                %
              </strong>
            </div>
            <div className="mystery-progress-track">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    (wallet.totalPoints /
                      summary.nextBox.requiredPoints) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
        </section>
      )}

      <section className="mystery-toolbar">
        <div className="mystery-tabs">
          {[
            ['all', 'All Boxes'],
            ['available', 'Ready to Unlock'],
            ['unlocked', 'Unlocked'],
            ['claimed', 'Claimed'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value as BoxFilter)}
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
            placeholder="Search reward, sponsor or place"
          />
        </label>
      </section>

      {message && (
        <div className="mystery-message">
          <BadgeCheck />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}><X /></button>
        </div>
      )}

      <section className="mystery-grid">
        {visibleBoxes.map((box, index) => {
          const userBox = userBoxMap.get(box.id);
          const rawState = boxState(box, userBox);
          const state =
            rawState === 'locked' &&
            wallet.totalPoints >= box.requiredPoints
              ? 'available'
              : rawState;

          const remaining = Math.max(
            0,
            box.requiredPoints - wallet.totalPoints,
          );

          const progress = Math.min(
            100,
            (wallet.totalPoints / box.requiredPoints) * 100,
          );

          const images = box.images.length
            ? box.images
            : fallbackImages;

          return (
            <article className={`mystery-card ${state}`} key={box.id}>
              <div
                className="mystery-card-image"
                style={{
                  backgroundImage: `url("${images[index % images.length]}")`,
                }}
              >
                <span className="mystery-sponsored">SPONSORED</span>
                <span className={`mystery-state ${state}`}>
                  {state === 'available'
                    ? 'Ready'
                    : state === 'unlocked'
                      ? 'Unlocked'
                      : state === 'claimed'
                        ? 'Claimed'
                        : state === 'expired'
                          ? 'Expired'
                          : state === 'soldout'
                            ? 'Sold Out'
                            : 'Locked'}
                </span>
              </div>

              <div className="mystery-card-content">
                <div className="mystery-card-title">
                  <div>
                    <small>{box.businessName}</small>
                    <h2>{box.title}</h2>
                  </div>
                  <strong>{box.requiredPoints} PTS</strong>
                </div>

                {box.subtitle && (
                  <p className="mystery-location">
                    <MapPin /> {box.subtitle}
                  </p>
                )}

                <div className="mystery-reward">
                  <Gift />
                  <span>
                    <strong>{box.rewardTitle}</strong>
                    <small>{box.rewardSubtitle}</small>
                  </span>
                </div>

                <div className="mystery-progress-head">
                  <span>{Math.round(wallet.totalPoints)} / {box.requiredPoints}</span>
                  <strong>{Math.round(progress)}%</strong>
                </div>

                <div className="mystery-progress-track">
                  <span style={{ width: `${progress}%` }} />
                </div>

                <p className="mystery-away">
                  {state === 'locked'
                    ? `${Math.round(remaining)} points left to unlock`
                    : state === 'available'
                      ? 'Target completed — unlock your box now'
                      : state === 'unlocked'
                        ? 'Box opened — claim the reward into your wallet'
                        : state === 'claimed'
                          ? 'Reward is available in your Rewards tab'
                          : state === 'soldout'
                            ? 'All available rewards have been unlocked'
                            : 'This Mystery Box is no longer active'}
                </p>

                <div className="mystery-card-actions">
                  <button
                    type="button"
                    onClick={() => setSelected(box)}
                  >
                    View Details <ChevronRight />
                  </button>

                  {state === 'available' && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busyId === box.id}
                      onClick={() => void unlockBox(box)}
                    >
                      <PackageOpen />
                      {busyId === box.id ? 'Unlocking…' : 'Unlock Box'}
                    </button>
                  )}

                  {state === 'unlocked' && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busyId === box.id}
                      onClick={() => void claimReward(box)}
                    >
                      <Gift />
                      {busyId === box.id ? 'Claiming…' : 'Claim Reward'}
                    </button>
                  )}

                  {state === 'claimed' && (
                    <button
                      type="button"
                      className="claimed"
                      onClick={() => {
                        window.location.href = '/dashboard?tab=rewards';
                      }}
                    >
                      <CheckCircle2 /> View Reward
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!visibleBoxes.length && (
        boxes.length === 0 && filter === 'all' ? (
          <MysterySamplePreview />
        ) : (
          <section className="mystery-empty-page">
            <Gift />
            <h2>No Mystery Boxes in this section</h2>
            <p>
              New sponsored boxes and earned rewards will appear here.
            </p>
          </section>
        )
      )}

      {selected && (
        <div
          className="mystery-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="mystery-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="mystery-modal-close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>

            <span className="mystery-modal-kicker">
              <Trophy /> PREMIUM REWARD
            </span>
            <h2>{selected.title}</h2>

            {selected.subtitle && (
              <p className="mystery-modal-location">
                <MapPin /> {selected.subtitle}
              </p>
            )}

            <div className="mystery-modal-reward">
              <Gift />
              <span>
                <small>YOU CAN UNLOCK</small>
                <strong>{selected.rewardTitle}</strong>
                <p>{selected.rewardSubtitle}</p>
              </span>
            </div>

            <div className="mystery-rule-grid">
              <article>
                <Star />
                <span>
                  <small>REQUIRED POINTS</small>
                  <strong>{selected.requiredPoints}</strong>
                </span>
              </article>
              <article>
                <CalendarDays />
                <span>
                  <small>VALID UNTIL</small>
                  <strong>{formatDate(selected.expiresAt)}</strong>
                </span>
              </article>
              <article>
                <Store />
                <span>
                  <small>SPONSORED BY</small>
                  <strong>{selected.businessName}</strong>
                </span>
              </article>
              <article>
                <PackageOpen />
                <span>
                  <small>REWARDS LEFT</small>
                  <strong>
                    {selected.totalQuantity > 0
                      ? Math.max(
                          0,
                          selected.totalQuantity -
                            selected.unlockedCount,
                        )
                      : 'Available'}
                  </strong>
                </span>
              </article>
            </div>

            <div className="mystery-rules">
              <strong>Reward rules</strong>
              <p>• Subject to sponsor availability.</p>
              <p>• Valid only for the issued SPOTC user.</p>
              <p>• Cannot be exchanged for cash.</p>
              <p>• Advance booking may be required.</p>
              <p>• The reward must be claimed before expiry.</p>
            </div>

            <div className="mystery-modal-actions">
              <button
                type="button"
                disabled={!selected.websiteUrl}
                onClick={() => openExternal(selected.websiteUrl)}
              >
                <ExternalLink /> View Sponsor
              </button>

              <button
                type="button"
                disabled={!selected.directionsUrl}
                onClick={() => openExternal(selected.directionsUrl)}
              >
                <Navigation /> Directions
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .mystery-page{width:100%;display:grid;gap:22px;color:#20252b}
        .mystery-hero{position:relative;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px;overflow:hidden;border:1px solid #e4e7ec;border-radius:28px;background:radial-gradient(circle at 82% 18%,rgba(109,60,223,.16),transparent 29%),linear-gradient(135deg,#fff,#faf8ff);box-shadow:0 16px 42px rgba(42,48,61,.07)}
        .mystery-hero:after{content:'🎁';position:absolute;right:290px;top:25px;font-size:72px;opacity:.17}
        .mystery-eyebrow,.mystery-modal-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#6532cd;background:#eee7ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .mystery-hero h2{margin:12px 0 7px;font-size:clamp(26px,3vw,38px);line-height:1.12;font-weight:600;letter-spacing:-.03em}
        .mystery-hero p{max-width:720px;margin:0;color:#6d7580;font-size:14px;line-height:1.6}
        .mystery-points-card{position:relative;z-index:1;min-width:250px;padding:21px;border:1px solid #ddcffd;border-radius:21px;background:rgba(255,255,255,.90);box-shadow:0 15px 34px rgba(83,50,151,.10)}
        .mystery-points-card small,.mystery-points-card strong,.mystery-points-card span{display:block}.mystery-points-card small{color:#77658e;font-size:9px;letter-spacing:.09em}.mystery-points-card strong{margin-top:6px;color:#5725bd;font-size:35px;font-weight:600}.mystery-points-card span{margin-top:3px;color:#6d7580;font-size:12px}

        .mystery-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        .mystery-summary-grid article{min-width:0;min-height:112px;padding:17px;display:flex;align-items:center;gap:13px;border:1px solid #e4e7ec;border-radius:21px;background:#fff;box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .mystery-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}.mystery-summary-icon svg{width:24px}.mystery-summary-icon.orange{color:#df7a00;background:#fff0db}.mystery-summary-icon.purple{color:#6734da;background:#eee8ff}.mystery-summary-icon.green{color:#159b50;background:#e8f8ef}.mystery-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .mystery-summary-grid small,.mystery-summary-grid strong,.mystery-summary-grid p{display:block}.mystery-summary-grid small{font-size:11px;font-weight:500}.mystery-summary-grid strong{margin-top:4px;font-size:26px;font-weight:600}.mystery-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .mystery-next-card{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:25px;border:1px solid #eadbf9;border-radius:21px;background:linear-gradient(135deg,#fcf9ff,#fff);box-shadow:0 10px 28px rgba(79,47,140,.06)}
        .mystery-next-copy span{color:#7140ca;font-size:9px;letter-spacing:.08em}.mystery-next-copy h2{margin:5px 0 3px;font-size:19px;font-weight:600}.mystery-next-copy p{margin:0;color:#707985;font-size:12px}.mystery-next-progress{width:min(520px,100%)}.mystery-next-progress>div:first-child{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;color:#655d70;font-size:11px}.mystery-next-progress strong{font-weight:600}

        .mystery-toolbar{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e4e7ec;border-radius:18px;background:#fff}
        .mystery-tabs{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}.mystery-tabs::-webkit-scrollbar{display:none}.mystery-tabs button{min-height:38px;padding:0 13px;flex:0 0 auto;border:1px solid transparent;border-radius:11px;color:#68717c;background:transparent;font-weight:500;cursor:pointer}.mystery-tabs button.active{color:#5f31bd;border-color:#d9c7ff;background:#f3efff}
        .mystery-toolbar label{width:min(320px,100%);min-height:40px;padding:0 12px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}.mystery-toolbar label svg{width:18px;color:#818996}.mystery-toolbar input{width:100%;border:0;outline:0;background:transparent}

        .mystery-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}.mystery-message svg{width:20px}.mystery-message span{flex:1}.mystery-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .mystery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .mystery-card{min-width:0;overflow:hidden;border:1px solid #e3e7ec;border-radius:24px;background:#fff;box-shadow:0 14px 36px rgba(42,48,61,.07)}
        .mystery-card-image{position:relative;height:205px;background-position:center;background-size:cover}.mystery-card-image:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,12,18,.05),rgba(12,12,18,.42))}
        .mystery-sponsored,.mystery-state{position:absolute;z-index:2;top:14px;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:600}.mystery-sponsored{left:14px;color:#fff;background:rgba(20,20,24,.60);backdrop-filter:blur(6px)}.mystery-state{right:14px;text-transform:capitalize}.mystery-state.locked{color:#5d6570;background:#fff}.mystery-state.available{color:#a15a00;background:#fff0db}.mystery-state.unlocked{color:#5e34ba;background:#eee8ff}.mystery-state.claimed{color:#138645;background:#e8f8ee}.mystery-state.expired,.mystery-state.soldout{color:#b5414a;background:#fff0f1}
        .mystery-card-content{padding:18px}.mystery-card-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.mystery-card-title small,.mystery-card-title h2{display:block}.mystery-card-title small{color:#7655ae;font-size:9px}.mystery-card-title h2{margin:4px 0 0;font-size:19px;font-weight:600}.mystery-card-title>strong{padding:7px 9px;flex:0 0 auto;border-radius:10px;color:#6133c1;background:#eee8ff;font-size:11px;font-weight:600}
        .mystery-location{margin:9px 0 0;display:flex;align-items:center;gap:5px;color:#727b86;font-size:11px}.mystery-location svg{width:15px}
        .mystery-reward{margin-top:14px;padding:13px;display:flex;align-items:flex-start;gap:10px;border:1px solid #eadcfb;border-radius:15px;background:#faf7ff}.mystery-reward>svg{width:22px;color:#6734da;flex:0 0 auto}.mystery-reward strong,.mystery-reward small{display:block}.mystery-reward strong{font-size:13px;font-weight:600}.mystery-reward small{margin-top:4px;color:#6e7782;font-size:10px;line-height:1.4}
        .mystery-progress-head{margin-top:15px;display:flex;align-items:center;justify-content:space-between;color:#69727d;font-size:10px}.mystery-progress-head strong{font-weight:600}.mystery-progress-track{height:10px;margin-top:8px;overflow:hidden;border-radius:999px;background:#eceef2}.mystery-progress-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#6b39d8,#9a72ee);box-shadow:0 0 16px rgba(107,57,216,.22)}
        .mystery-away{min-height:18px;margin:9px 0 0;color:#707985;font-size:11px}.mystery-card-actions{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mystery-card-actions button{min-height:42px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e1e4e9;border-radius:11px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}.mystery-card-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}.mystery-card-actions button.claimed{border-color:#cce8d6;color:#158849;background:#edf9f1}.mystery-card-actions button:disabled{opacity:.55}.mystery-card-actions svg{width:16px}

        .mystery-loading{min-height:420px;display:grid;place-items:center;align-content:center;gap:13px;color:#717a85}.mystery-loading span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#6b39d8;border-radius:50%;animation:mysterySpin .8s linear infinite}
        .mystery-empty-page{min-height:300px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}.mystery-empty-page>svg{width:50px;height:50px;color:#6b39d8}.mystery-empty-page h2{margin:12px 0 5px}.mystery-empty-page p{max-width:520px;margin:0;color:#707985}
        .mystery-sample{padding:20px;border:1px dashed #cfd6e2;border-radius:22px;background:radial-gradient(circle at 92% 8%,rgba(109,60,223,.08),transparent 24%),linear-gradient(180deg,#fcfdff,#f8fafc)}
        .mystery-sample-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:17px}
        .mystery-sample-head h3{margin:0;font-size:19px;font-weight:600}
        .mystery-sample-head p{max-width:720px;margin:6px 0 0;color:#707985;font-size:13px;line-height:1.5}
        .mystery-sample-head span{padding:8px 11px;flex:0 0 auto;border-radius:999px;color:#5d35bc;background:#eee8ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .mystery-sample-card{overflow:hidden;border:1px solid #e2e6ec;border-radius:22px;background:#fff;box-shadow:0 12px 28px rgba(42,48,61,.06)}
        .mystery-sample-card .mystery-card-actions button{cursor:not-allowed;opacity:.72}
        .mystery-sample-note{margin:14px 18px 18px;padding:12px 13px;display:flex;align-items:center;gap:8px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px}
        .mystery-sample-note svg{width:18px;flex:0 0 auto}


        .mystery-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .mystery-modal{position:relative;width:min(650px,100%);max-height:92vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}.mystery-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .mystery-modal>h2{margin:13px 0 6px;font-size:27px;font-weight:600}.mystery-modal-location{display:flex;align-items:center;gap:6px;color:#6f7883;font-size:12px}.mystery-modal-location svg{width:16px}
        .mystery-modal-reward{margin-top:18px;padding:15px;display:flex;gap:11px;border:1px solid #dfd0ff;border-radius:16px;background:#f8f5ff}.mystery-modal-reward>svg{width:25px;color:#6734da}.mystery-modal-reward small,.mystery-modal-reward strong,.mystery-modal-reward p{display:block}.mystery-modal-reward small{color:#7558aa;font-size:8px}.mystery-modal-reward strong{margin-top:4px;font-size:16px;font-weight:600}.mystery-modal-reward p{margin:5px 0 0;color:#69727d;font-size:11px}
        .mystery-rule-grid{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mystery-rule-grid article{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}.mystery-rule-grid svg{width:20px;color:#6734da}.mystery-rule-grid small,.mystery-rule-grid strong{display:block}.mystery-rule-grid small{color:#7c8490;font-size:8px}.mystery-rule-grid strong{margin-top:3px;font-size:12px;font-weight:600}
        .mystery-rules{margin-top:16px;padding:14px;border:1px solid #e7eaee;border-radius:14px;background:#fafbfc}.mystery-rules strong{display:block;margin-bottom:7px;font-size:13px}.mystery-rules p{margin:4px 0;color:#68717c;font-size:11px}
        .mystery-modal-actions{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mystery-modal-actions button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e0e4e9;border-radius:12px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}.mystery-modal-actions button:disabled{opacity:.45}.mystery-modal-actions svg{width:16px}

        @keyframes mysterySpin{to{transform:rotate(360deg)}}

        @media(max-width:1200px){
          .mystery-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media(max-width:900px){
          .mystery-hero{display:block}.mystery-points-card{margin-top:18px}.mystery-hero:after{display:none}
          .mystery-grid{grid-template-columns:1fr}
          .mystery-next-card{align-items:stretch;flex-direction:column}.mystery-next-progress{width:100%}
          .mystery-toolbar{align-items:stretch;flex-direction:column}.mystery-toolbar label{width:100%}
        }

        @media(max-width:620px){
          .mystery-summary-grid{grid-template-columns:1fr}
          .mystery-card-actions,.mystery-rule-grid,.mystery-modal-actions{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );


function MysterySamplePreview() {
  return (
    <section className="mystery-sample">
      <div className="mystery-sample-head">
        <div>
          <h3>See how your Mystery Boxes will appear</h3>
          <p>
            This is sample data only. Real sponsored boxes, reward values,
            points, expiry and claim status will replace it when boxes are published.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="mystery-sample-card">
        <div
          className="mystery-card-image"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200")',
          }}
        >
          <span className="mystery-sponsored">SPONSORED</span>
          <span className="mystery-state available">Ready</span>
        </div>

        <div className="mystery-card-content">
          <div className="mystery-card-title">
            <div>
              <small>Ooty Green Valley Resort</small>
              <h2>Family Stay Mystery Box</h2>
            </div>

            <strong>500 PTS</strong>
          </div>

          <p className="mystery-location">
            <MapPin /> Near Botanical Garden, Ooty
          </p>

          <div className="mystery-reward">
            <Gift />
            <span>
              <strong>4 Members FREE Stay</strong>
              <small>
                Breakfast Included · Premium Family Package
              </small>
            </span>
          </div>

          <div className="mystery-progress-head">
            <span>500 / 500</span>
            <strong>100%</strong>
          </div>

          <div className="mystery-progress-track">
            <span style={{ width: '100%' }} />
          </div>

          <p className="mystery-away">
            Target completed — unlock your box now
          </p>

          <div className="mystery-card-actions">
            <button type="button" disabled>
              View Details <ChevronRight />
            </button>

            <button type="button" className="primary" disabled>
              <PackageOpen /> Unlock Box
            </button>
          </div>
        </div>

        <div className="mystery-sample-note">
          <BadgeCheck />
          Sample boxes never use points and never create real rewards or coupons.
        </div>
      </article>
    </section>
  );
}


}