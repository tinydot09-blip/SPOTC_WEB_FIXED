'use client';

import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Gift,
  History,
  QrCode,
  ReceiptText,
  Search,
  Sparkles,
  Store,
  Tag,
  TicketCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { auth, firebaseReady } from '@/lib/firebase';

type RewardFilter = 'all' | 'active' | 'used' | 'expired' | 'bills';

type RewardItem = {
  id: string;
  source: 'coupon' | 'mystery';
  title: string;
  description: string;
  businessName: string;
  businessLogo: string;
  businessId: string;
  businessSlug: string;
  code: string;
  status: string;
  isUsed: boolean;
  expiresAt: Date | null;
  createdAt: Date | null;
  value: number;
  valueLabel: string;
  raw: DocumentData;
};

type BillItem = {
  id: string;
  businessName: string;
  amount: number;
  coins: number;
  status: string;
  createdAt: Date | null;
  imageUrl: string;
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

function formatDate(date: Date | null): string {
  if (!date) return 'No expiry';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function inferValue(data: DocumentData, description: string): {
  value: number;
  label: string;
} {
  const direct = numberOf(
    data.reward_value ??
      data.coupon_value ??
      data.discount_value ??
      data.cash_value ??
      data.amount ??
      data.value,
  );

  if (direct > 0) {
    return {
      value: direct,
      label: `Worth ₹${Math.round(direct).toLocaleString('en-IN')}`,
    };
  }

  const rupeeMatch = description.match(/₹\s*([\d,]+)/i);
  if (rupeeMatch?.[1]) {
    const parsed = Number(rupeeMatch[1].replace(/,/g, ''));

    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        value: parsed,
        label: `Worth ₹${Math.round(parsed).toLocaleString('en-IN')}`,
      };
    }
  }

  const percentMatch = description.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentMatch?.[1]) {
    return {
      value: 0,
      label: `${percentMatch[1]}% savings`,
    };
  }

  return {
    value: 0,
    label: 'Special reward',
  };
}

function mapReward(id: string, data: DocumentData, source: RewardItem['source']): RewardItem {
  const description =
    textOf(data.reward_description) ||
    textOf(data.coupon_description) ||
    textOf(data.description) ||
    textOf(data.reward_title) ||
    'A SPOTC reward is ready for you.';

  const value = inferValue(data, description);

  return {
    id,
    source,
    title:
      textOf(data.coupon_title) ||
      textOf(data.title) ||
      textOf(data.reward_title) ||
      textOf(data.mystery_box_title) ||
      'SPOTC Reward',
    description,
    businessName:
      textOf(data.business_name) ||
      textOf(data.sponsor_name) ||
      'SPOTC Partner',
    businessLogo:
      textOf(data.business_logo) ||
      textOf(data.logo_url),
    businessId: refIdOf(
      data.business_ref ??
        data.sponsor_business_ref ??
        data.business_ref_path,
    ),
    businessSlug:
      textOf(data.business_slug) ||
      textOf(data.slug) ||
      textOf(data.vanity_url) ||
      textOf(data.business_username),
    code:
      textOf(data.coupon_code) ||
      textOf(data.code) ||
      textOf(data.partner_code),
    status: textOf(data.status).toLowerCase() || 'active',
    isUsed: data.is_used === true || textOf(data.status).toLowerCase() === 'used',
    expiresAt: dateOf(data.expires_at),
    createdAt:
      dateOf(data.claimed_at) ||
      dateOf(data.created_at) ||
      dateOf(data.opened_at),
    value: value.value,
    valueLabel: value.label,
    raw: data,
  };
}

function mapBill(id: string, data: DocumentData): BillItem {
  return {
    id,
    businessName:
      textOf(data.business_name) ||
      textOf(data.shop_name) ||
      'SPOTC Business',
    amount: numberOf(data.bill_amount ?? data.total_amount ?? data.amount),
    coins: numberOf(
      data.estimated_coins ??
        data.purchased_shop_coins ??
        data.coins_added_value ??
        data.coins,
    ),
    status: textOf(data.status).toLowerCase() || 'pending',
    createdAt:
      dateOf(data.created_at) ||
      dateOf(data.updated_at),
    imageUrl: textOf(data.bill_image_url),
  };
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);

  if (!words.length) return 'S';

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardRewards() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [filter, setFilter] = useState<RewardFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RewardItem | null>(null);
  const [qrReward, setQrReward] = useState<RewardItem | null>(null);
  const [copiedCode, setCopiedCode] = useState('');
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
      setRewards([]);
      setBills([]);
      setLoading(false);
      return;
    }

    let active = true;
    const currentUser = user;

    async function loadRewards() {
      setLoading(true);

      try {
        const db = getFirestore();

        const [couponSnapshot, mysterySnapshot, billSnapshot] =
          await Promise.all([
            getDocs(
              query(
                collection(db, 'UserCoupons'),
                where(
                  'user_uid',
                  '==',
                  currentUser.uid,
                ),
                limit(100),
              ),
            ).catch(() => null),
            getDocs(
              query(
                collection(db, 'UserMysteryBoxes'),
                where(
                  'user_uid',
                  '==',
                  currentUser.uid,
                ),
                limit(100),
              ),
            ).catch(() => null),
            getDocs(
              query(
                collection(db, 'BillScanValidation'),
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

        const couponRewards =
          couponSnapshot?.docs.map((rewardDoc) =>
            mapReward(rewardDoc.id, rewardDoc.data(), 'coupon'),
          ) ?? [];

        const mysteryRewards =
          mysterySnapshot?.docs.map((rewardDoc) =>
            mapReward(rewardDoc.id, rewardDoc.data(), 'mystery'),
          ) ?? [];

        const uniqueRewards = new Map<string, RewardItem>();

        for (const reward of [...couponRewards, ...mysteryRewards]) {
          const key =
            reward.code ||
            `${reward.source}:${reward.title}:${reward.businessName}:${reward.id}`;

          if (!uniqueRewards.has(key)) uniqueRewards.set(key, reward);
        }

        setRewards(
          [...uniqueRewards.values()].sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          ),
        );

        setBills(
          (billSnapshot?.docs.map((billDoc) =>
            mapBill(billDoc.id, billDoc.data()),
          ) ?? []).sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          ),
        );
      } catch (error) {
        console.error('Rewards load failed:', error);
        setMessage('Some reward information could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRewards();

    return () => {
      active = false;
    };
  }, [authChecked, user]);

  const rewardState = (reward: RewardItem): 'active' | 'used' | 'expired' => {
    if (reward.isUsed) return 'used';

    if (
      reward.status === 'expired' ||
      (reward.expiresAt && reward.expiresAt.getTime() < Date.now())
    ) {
      return 'expired';
    }

    return 'active';
  };

  const summary = useMemo(() => {
    const activeRewards = rewards.filter(
      (reward) => rewardState(reward) === 'active',
    );
    const usedRewards = rewards.filter(
      (reward) => rewardState(reward) === 'used',
    );
    const expiringSoon = activeRewards.filter((reward) => {
      if (!reward.expiresAt) return false;
      const remaining = reward.expiresAt.getTime() - Date.now();
      return remaining > 0 && remaining <= 7 * 24 * 60 * 60 * 1000;
    });

    const totalValue = activeRewards.reduce(
      (sum, reward) => sum + reward.value,
      0,
    );

    const usedValue = usedRewards.reduce(
      (sum, reward) => sum + reward.value,
      0,
    );

    const approvedBills = bills.filter((bill) =>
      ['approved', 'verified', 'completed'].includes(bill.status),
    );

    const earnedCoins = approvedBills.reduce(
      (sum, bill) => sum + bill.coins,
      0,
    );

    const nextRewardTarget = 500;
    const nextRewardProgress = Math.min(
      100,
      (earnedCoins / nextRewardTarget) * 100,
    );

    return {
      active: activeRewards.length,
      used: usedRewards.length,
      expiring: expiringSoon.length,
      approvedBills: approvedBills.length,
      totalValue,
      usedValue,
      totalSaved: usedValue,
      earnedCoins,
      nextRewardTarget,
      nextRewardProgress,
      coinsRemaining: Math.max(0, nextRewardTarget - earnedCoins),
    };
  }, [rewards, bills]);

  const visibleRewards = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rewards.filter((reward) => {
      const state = rewardState(reward);

      const filterMatches =
        filter === 'all' ||
        (filter === 'active' && state === 'active') ||
        (filter === 'used' && state === 'used') ||
        (filter === 'expired' && state === 'expired');

      const searchMatches =
        !term ||
        reward.title.toLowerCase().includes(term) ||
        reward.description.toLowerCase().includes(term) ||
        reward.businessName.toLowerCase().includes(term) ||
        reward.code.toLowerCase().includes(term);

      return filterMatches && searchMatches;
    });
  }, [rewards, filter, search]);

  const visibleBills = useMemo(() => {
    const term = search.trim().toLowerCase();

    return bills.filter(
      (bill) =>
        !term ||
        bill.businessName.toLowerCase().includes(term) ||
        bill.status.toLowerCase().includes(term),
    );
  }, [bills, search]);

  const requireSignIn = (action: string): boolean => {
    if (user) return true;

    setMessage(`Sign in to ${action}. You can continue browsing this preview.`);
    return false;
  };

  const copyCode = async (reward: RewardItem) => {
    if (!requireSignIn('copy a real reward code')) return;

    if (!reward.code) {
      setMessage('This reward does not require a coupon code.');
      return;
    }

    try {
      await navigator.clipboard.writeText(reward.code);
      setCopiedCode(reward.code);
      window.setTimeout(() => setCopiedCode(''), 1800);
    } catch {
      setMessage('Unable to copy the coupon code.');
    }
  };

  const useReward = async (reward: RewardItem) => {
    if (!requireSignIn('use this reward')) return;

    if (reward.source !== 'coupon') {
      setMessage(
        reward.code
          ? `Show code ${reward.code} to the business.`
          : 'Open the reward and show it to the business.',
      );
      return;
    }

    const db = getFirestore();

    try {
      await updateDoc(doc(db, 'UserCoupons', reward.id), {
        is_used: true,
        status: 'used',
        used_at: Timestamp.now(),
      });

      setRewards((current) =>
        current.map((item) =>
          item.id === reward.id && item.source === 'coupon'
            ? { ...item, isUsed: true, status: 'used' }
            : item,
        ),
      );

      setSelected(null);
      setMessage('Reward marked as used.');
    } catch (error) {
      console.error('Use reward failed:', error);
      setMessage('Unable to update this reward right now.');
    }
  };

  const openBusiness = (reward: RewardItem) => {
    const slug = reward.businessSlug
      .trim()
      .replace(/^\/+|\/+$/g, '');

    if (slug) {
      window.location.href = `/${encodeURIComponent(slug)}`;
      return;
    }

    if (reward.businessId) {
      window.location.href =
        `/shop?business=${encodeURIComponent(reward.businessId)}`;
      return;
    }

    window.location.href = '/shop';
  };

  const qrPayloadOf = (reward: RewardItem): string => {
    return JSON.stringify({
      type: 'spotc_reward',
      version: 1,
      couponId: reward.id,
      userId: user?.uid ?? '',
      businessId: reward.businessId,
      businessSlug: reward.businessSlug,
      code: reward.code,
      rewardTitle: reward.title,
      expiresAt: reward.expiresAt
        ? reward.expiresAt.toISOString()
        : null,
      issuedAt: reward.createdAt
        ? reward.createdAt.toISOString()
        : null,
    });
  };

  if (!authChecked || loading) {
    return (
      <section className="reward-loading">
        <span />
        <p>Loading your rewards…</p>
      </section>
    );
  }

  return (
    <div className="reward-page">
      {!user && (
        <div className="dash-guest-preview-note">
          <Sparkles />
          <span>
            Guest preview: explore the complete Rewards page. Sign in only to
            claim, redeem, copy a real code or show a real QR.
          </span>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/login?next=/dashboard';
            }}
          >
            Sign In
          </button>
        </div>
      )}
      <section className="reward-hero">
        <div>
          <span className="reward-eyebrow"><Sparkles /> MY SPOTC VALUE</span>
          <h2>Your rewards, explained simply.</h2>
          <p>
            Active value is what you can save now. Claimed rewards show what you
            already used. Bill rewards show the coins earned from approved bills.
          </p>
        </div>

        <div className="reward-value">
          <small>ACTIVE REWARD VALUE</small>
          <strong>₹{Math.round(summary.totalValue).toLocaleString('en-IN')}</strong>
          <span>{summary.active} rewards ready to use</span>
        </div>
      </section>

      <section className="reward-impact-grid">
        <article className="reward-saved-card">
          <span className="reward-impact-icon"><WalletCards /></span>
          <div>
            <small>TOTAL SAVED WITH SPOTC</small>
            <strong>₹{Math.round(summary.totalSaved).toLocaleString('en-IN')}</strong>
            <p>
              {summary.used > 0
                ? `${summary.used} used rewards included`
                : 'Your used reward value will appear here'}
            </p>
          </div>
        </article>

        <article className="reward-next-card">
          <div className="reward-next-head">
            <div>
              <small>NEXT REWARD UNLOCK</small>
              <strong>
                {summary.coinsRemaining > 0
                  ? `${Math.round(summary.coinsRemaining)} coins to go`
                  : 'Reward unlocked'}
              </strong>
            </div>
            <span>{Math.round(summary.earnedCoins)} / {summary.nextRewardTarget}</span>
          </div>

          <div className="reward-next-progress">
            <span style={{ width: `${summary.nextRewardProgress}%` }} />
          </div>

          <p>
            {summary.coinsRemaining > 0
              ? 'Keep scanning approved bills to reach your next ₹500 reward milestone.'
              : 'You reached the milestone. Your next available reward will appear here.'}
          </p>
        </article>
      </section>

      <section className="reward-summary-grid">
        <article>
          <span className="reward-summary-icon green"><TicketCheck /></span>
          <div><small>Ready to Use</small><strong>{summary.active}</strong><p>Active rewards</p></div>
        </article>

        <article>
          <span className="reward-summary-icon purple"><Gift /></span>
          <div><small>Used Rewards</small><strong>{summary.used}</strong><p>Your savings history</p></div>
        </article>

        <article>
          <span className="reward-summary-icon orange"><Clock3 /></span>
          <div><small>Expiring Soon</small><strong>{summary.expiring}</strong><p>Within 7 days</p></div>
        </article>

        <article>
          <span className="reward-summary-icon blue"><ReceiptText /></span>
          <div><small>Approved Bills</small><strong>{summary.approvedBills}</strong><p>{Math.round(summary.earnedCoins)} coins earned</p></div>
        </article>
      </section>

      <section className="reward-toolbar">
        <div className="reward-tabs">
          {[
            ['all', 'All Rewards'],
            ['active', 'Ready to Use'],
            ['used', 'Used'],
            ['expired', 'Expired'],
            ['bills', 'Bill Rewards'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value as RewardFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="reward-search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rewards or business"
          />
        </label>
      </section>

      {message && (
        <div className="reward-message">
          <BadgeCheck />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}><X /></button>
        </div>
      )}

      {filter === 'bills' ? (
        <section className="reward-section">
          <div className="reward-section-head">
            <div>
              <h2>Bill reward history</h2>
              <p>Approved bills add coins. Pending bills are still being checked.</p>
            </div>
            <span><ReceiptText /> {visibleBills.length} bills</span>
          </div>

          {visibleBills.length ? (
            <div className="bill-list">
              {visibleBills.map((bill) => (
                <article key={bill.id}>
                  <span className="bill-icon"><ReceiptText /></span>

                  <div className="bill-copy">
                    <strong>{bill.businessName}</strong>
                    <p>
                      {bill.amount > 0
                        ? `Bill value ₹${Math.round(bill.amount).toLocaleString('en-IN')}`
                        : 'Bill submitted'}
                    </p>
                  </div>

                  <div className="bill-coins">
                    <strong>+{Math.round(bill.coins)}</strong>
                    <small>coins</small>
                  </div>

                  <span className={`reward-status ${bill.status}`}>
                    {bill.status || 'pending'}
                  </span>

                  <time>{formatDate(bill.createdAt)}</time>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ReceiptText />}
              title="No bill rewards found"
              description="Upload a bill from a SPOTC business. Coins appear after approval."
            />
          )}
        </section>
      ) : (
        <section className="reward-section">
          <div className="reward-section-head">
            <div>
              <h2>{filter === 'all' ? 'All rewards' : filter === 'active' ? 'Ready to use' : filter === 'used' ? 'Used rewards' : 'Expired rewards'}</h2>
              <p>Tap a reward to see its code, value, expiry and business details.</p>
            </div>
            <span><Gift /> {visibleRewards.length} rewards</span>
          </div>

          {visibleRewards.length ? (
            <div className="reward-card-grid">
              {visibleRewards.map((reward) => {
                const state = rewardState(reward);

                return (
                  <article className={`reward-card ${state}`} key={`${reward.source}-${reward.id}`}>
                    <div className="reward-card-top">
                      {reward.businessLogo ? (
                        <img src={reward.businessLogo} alt="" />
                      ) : (
                        <span className="reward-logo-fallback">
                          {initialsOf(reward.businessName)}
                        </span>
                      )}

                      <div>
                        <small>{reward.businessName}</small>
                        <strong>{reward.title}</strong>
                      </div>

                      <span className={`reward-status ${state}`}>{state}</span>
                    </div>

                    <p className="reward-description">{reward.description}</p>

                    <div className="reward-value-row">
                      <span><CircleDollarSign /> {reward.valueLabel}</span>
                      <time><CalendarDays /> {formatDate(reward.expiresAt)}</time>
                    </div>

                    {reward.code && (
                      <button
                        type="button"
                        className="reward-code"
                        onClick={() => void copyCode(reward)}
                      >
                        <span><small>COUPON CODE</small><strong>{reward.code}</strong></span>
                        {copiedCode === reward.code ? <CheckCircle2 /> : <Copy />}
                      </button>
                    )}

                    <div className="reward-card-actions">
                      <button type="button" onClick={() => setSelected(reward)}>
                        View Details <ChevronRight />
                      </button>

                      {state === 'active' && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            if (!requireSignIn('show a real reward QR')) return;
                            setQrReward(reward);
                          }}
                        >
                          <><QrCode /> Show Reward</>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : filter === 'all' && rewards.length === 0 ? (
            <SampleRewardPreview />
          ) : (
            <EmptyState
              icon={<Gift />}
              title="No rewards in this section"
              description={
                filter === 'active'
                  ? 'New active coupons and Mystery Box rewards will appear here.'
                  : filter === 'used'
                    ? 'Rewards you use will be saved here as your savings history.'
                    : filter === 'expired'
                      ? 'Expired rewards will be kept here for reference.'
                      : 'Your SPOTC rewards will appear after you earn or claim them.'
              }
            />
          )}
        </section>
      )}

      {selected && (
        <div className="reward-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="reward-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="reward-modal-close" onClick={() => setSelected(null)}><X /></button>

            <span className="reward-modal-icon"><Gift /></span>
            <small>{selected.businessName}</small>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>

            <div className="reward-explain-grid">
              <article>
                <CircleDollarSign />
                <span><small>WHAT IT IS WORTH</small><strong>{selected.valueLabel}</strong></span>
              </article>
              <article>
                <CalendarDays />
                <span><small>USE BEFORE</small><strong>{formatDate(selected.expiresAt)}</strong></span>
              </article>
              <article>
                <Store />
                <span><small>WHERE TO USE</small><strong>{selected.businessName}</strong></span>
              </article>
              <article>
                <Tag />
                <span><small>REWARD STATUS</small><strong>{rewardState(selected)}</strong></span>
              </article>
            </div>

            {selected.code && (
              <button type="button" className="reward-modal-code" onClick={() => void copyCode(selected)}>
                <span><small>SHOW OR COPY THIS CODE</small><strong>{selected.code}</strong></span>
                {copiedCode === selected.code ? <CheckCircle2 /> : <Copy />}
              </button>
            )}

            <div className="reward-modal-actions">
              <button type="button" onClick={() => openBusiness(selected)}>
                <Store /> View Business
              </button>

              {rewardState(selected) === 'active' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (!requireSignIn('show a real reward QR')) return;
                    setQrReward(selected);
                  }}
                >
                  <><QrCode /> Show QR</>
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {qrReward && (
        <div className="reward-modal-backdrop" onMouseDown={() => setQrReward(null)}>
          <section className="reward-qr-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="reward-modal-close" onClick={() => setQrReward(null)}><X /></button>
            <span className="reward-modal-icon purple"><QrCode /></span>
            <small>SHOW AT {qrReward.businessName.toUpperCase()}</small>
            <h2>{qrReward.title}</h2>

            <div className="reward-qr-box">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrPayloadOf(qrReward))}`}
                alt={`Secure SPOTC reward QR for ${qrReward.code || qrReward.id}`}
              />
            </div>

            <button type="button" className="reward-big-code" onClick={() => void copyCode(qrReward)}>
              <small>COUPON CODE</small>
              <strong>{qrReward.code || qrReward.id}</strong>
              <span>{copiedCode === qrReward.code ? 'Copied' : 'Tap to copy'}</span>
            </button>

            <p>
              Show this QR to the business before payment. It contains the
              coupon, user and business identifiers required for verification.
            </p>

            <div className="reward-redemption-note">
              <BadgeCheck />
              <span>
                The business must scan and verify this QR before the reward is
                marked as used. The customer cannot redeem it manually.
              </span>
            </div>

            <div className="reward-qr-actions">
              <button
                type="button"
                onClick={() => openBusiness(qrReward)}
              >
                <Store /> View Business
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => setQrReward(null)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .reward-page{width:100%;display:grid;gap:22px;color:#20252b}
        .reward-hero{position:relative;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:24px;overflow:hidden;border:1px solid #e4e7ec;border-radius:28px;background:radial-gradient(circle at 80% 20%,rgba(109,60,223,.14),transparent 28%),linear-gradient(135deg,#fff,#faf8ff);box-shadow:0 16px 42px rgba(42,48,61,.07)}
        .reward-hero:after{content:'🎁';position:absolute;right:285px;top:24px;font-size:72px;opacity:.18}
        .reward-eyebrow{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;color:#6634ce;background:#eee7ff;font-size:10px;font-weight:600;letter-spacing:.08em}
        .reward-hero h2{margin:12px 0 7px;font-size:clamp(26px,3vw,38px);line-height:1.12;font-weight:600;letter-spacing:-.03em}
        .reward-hero p{max-width:680px;margin:0;color:#6d7580;font-size:14px;line-height:1.6}
        .reward-value{position:relative;z-index:1;min-width:245px;padding:21px;border:1px solid #ddcffd;border-radius:21px;background:rgba(255,255,255,.88);box-shadow:0 15px 34px rgba(83,50,151,.10)}
        .reward-value small,.reward-value strong,.reward-value span{display:block}
        .reward-value small{color:#77658e;font-size:9px;letter-spacing:.09em}
        .reward-value strong{margin-top:6px;color:#5725bd;font-size:35px;font-weight:600}
        .reward-value span{margin-top:3px;color:#6d7580;font-size:12px}

        .reward-impact-grid{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:18px}
        .reward-impact-grid article{min-width:0;padding:21px;border:1px solid #e4e7ec;border-radius:22px;background:#fff;box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .reward-saved-card{display:flex;align-items:center;gap:15px;background:linear-gradient(135deg,#fffaf2,#fff)!important}
        .reward-impact-icon{width:56px;height:56px;display:grid;place-items:center;flex:0 0 auto;border-radius:18px;color:#d77900;background:#fff0db}
        .reward-impact-icon svg{width:27px}
        .reward-saved-card small,.reward-saved-card strong,.reward-saved-card p{display:block}
        .reward-saved-card small,.reward-next-card small{color:#7a6c5f;font-size:9px;letter-spacing:.08em}
        .reward-saved-card strong{margin-top:5px;color:#2a2118;font-size:30px;font-weight:600}
        .reward-saved-card p,.reward-next-card p{margin:6px 0 0;color:#707985;font-size:12px;line-height:1.5}
        .reward-next-card{background:radial-gradient(circle at 90% 0,rgba(109,60,223,.10),transparent 28%),linear-gradient(135deg,#fbf9ff,#fff)!important}
        .reward-next-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
        .reward-next-head strong{display:block;margin-top:5px;font-size:20px;font-weight:600}
        .reward-next-head>span{padding:7px 10px;border-radius:999px;color:#6532cd;background:#eee7ff;font-size:11px;font-weight:500}
        .reward-next-progress{height:11px;margin-top:16px;overflow:hidden;border-radius:999px;background:#eceef2}
        .reward-next-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#6b39d8,#8f64ee);box-shadow:0 0 16px rgba(107,57,216,.25)}

        .reward-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        .reward-summary-grid article{min-width:0;min-height:118px;padding:18px;display:flex;align-items:center;gap:14px;border:1px solid #e4e7ec;border-radius:21px;background:#fff;box-shadow:0 12px 30px rgba(42,48,61,.06)}
        .reward-summary-icon{width:52px;height:52px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px}
        .reward-summary-icon svg{width:24px}
        .reward-summary-icon.green{color:#159b50;background:#e8f8ef}
        .reward-summary-icon.purple{color:#6734da;background:#eee8ff}
        .reward-summary-icon.orange{color:#df7a00;background:#fff0db}
        .reward-summary-icon.blue{color:#1768e5;background:#eaf2ff}
        .reward-summary-grid small,.reward-summary-grid strong,.reward-summary-grid p{display:block}
        .reward-summary-grid small{font-size:11px;font-weight:500}
        .reward-summary-grid strong{margin-top:4px;font-size:26px;font-weight:600}
        .reward-summary-grid p{margin:6px 0 0;color:#707985;font-size:11px}

        .reward-toolbar{min-height:64px;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e4e7ec;border-radius:18px;background:#fff}
        .reward-tabs{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none}
        .reward-tabs::-webkit-scrollbar{display:none}
        .reward-tabs button{min-height:38px;padding:0 13px;flex:0 0 auto;border:1px solid transparent;border-radius:11px;color:#68717c;background:transparent;font-weight:500;cursor:pointer}
        .reward-tabs button.active{color:#995400;border-color:#f0c991;background:#fff2e1}
        .reward-search{width:min(320px,100%);height:44px;min-height:44px;padding:0 13px;display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;background:#fafbfc}
        .reward-search svg{width:18px;color:#818996}
        .reward-search input{width:100%;border:0;outline:0;background:transparent;color:#252a30}

        .reward-message{padding:13px 15px;display:flex;align-items:center;gap:10px;border:1px solid #cfe8d8;border-radius:14px;color:#25663f;background:#f1faf4}
        .reward-message svg{width:20px}.reward-message span{flex:1}.reward-message button{width:30px;height:30px;border:0;border-radius:9px;background:transparent;cursor:pointer}

        .reward-section{padding:22px;border:1px solid #e4e7ec;border-radius:26px;background:#fff;box-shadow:0 15px 40px rgba(42,48,61,.06)}
        .reward-section-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:20px}
        .reward-section-head h2{margin:0;font-size:23px;font-weight:600}
        .reward-section-head p{margin:5px 0 0;color:#707985;font-size:13px}
        .reward-section-head>span{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:999px;color:#5d35bc;background:#eee8ff;font-size:11px}
        .reward-section-head>span svg{width:15px}

        .reward-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .reward-card{min-width:0;min-height:330px;padding:18px;display:grid;grid-template-rows:auto auto auto auto 1fr;border:1px solid #e3e7ec;border-radius:21px;background:linear-gradient(180deg,#fff,#fbfcfe);box-shadow:0 11px 28px rgba(42,48,61,.06)}
        .reward-card.used{opacity:.72}.reward-card.expired{opacity:.60}
        .reward-card-top{display:grid;grid-template-columns:50px minmax(0,1fr) auto;align-items:center;gap:12px}
        .reward-card-top img,.reward-logo-fallback{width:50px;height:50px;display:grid;place-items:center;object-fit:cover;border-radius:15px;color:#fff;background:linear-gradient(135deg,#6e3cdd,#43219a);font-size:11px;font-weight:600}
        .reward-card-top small,.reward-card-top strong{display:block}
        .reward-card-top small{overflow:hidden;color:#707985;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
        .reward-card-top strong{margin-top:4px;overflow:hidden;font-size:15px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
        .reward-status{padding:6px 8px;border-radius:999px;font-size:9px;text-transform:capitalize}
        .reward-status.active,.reward-status.approved,.reward-status.verified,.reward-status.completed{color:#128645;background:#e8f8ee}
        .reward-status.used{color:#5e38b7;background:#eee8ff}
        .reward-status.expired,.reward-status.rejected{color:#b7414a;background:#fff0f1}
        .reward-status.pending{color:#b16900;background:#fff2df}
        .reward-description{min-height:44px;margin:16px 0 14px;color:#59636f;font-size:13px;line-height:1.55}
        .reward-value-row{min-height:30px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px}
        .reward-value-row span,.reward-value-row time{min-width:0;display:flex;align-items:center;gap:5px;color:#68717c;font-size:10px;white-space:nowrap}
        .reward-value-row span{color:#15904a}.reward-value-row svg{width:14px}
        .reward-code{width:100%;min-height:66px;margin-top:14px;padding:11px 13px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;border:1px dashed #d9c7ff;border-radius:13px;color:#5327ae;background:#f8f5ff;text-align:left;cursor:pointer;overflow:hidden}
        .reward-code small,.reward-code strong{display:block}.reward-code span{min-width:0}.reward-code small{font-size:8px;letter-spacing:.08em}.reward-code strong{margin-top:4px;overflow:hidden;font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.reward-code>svg{width:20px;height:20px;flex:0 0 auto}
        .reward-card-actions{align-self:end;margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .reward-card-actions button{min-width:0;min-height:42px;padding:0 12px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e1e4e9;border-radius:11px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer;white-space:nowrap}
        .reward-card-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}
        .reward-card-actions svg{width:16px}

        .bill-list{display:grid;gap:11px}
        .bill-list article{padding:14px;display:grid;grid-template-columns:46px minmax(0,1fr) auto auto auto;align-items:center;gap:13px;border:1px solid #e5e8ec;border-radius:16px;background:#fbfcfd}
        .bill-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;color:#1768e5;background:#eaf2ff}
        .bill-copy strong,.bill-copy p{display:block}.bill-copy strong{font-size:13px;font-weight:600}.bill-copy p{margin:4px 0 0;color:#727b86;font-size:11px}
        .bill-coins{text-align:right}.bill-coins strong,.bill-coins small{display:block}.bill-coins strong{color:#15914a;font-size:17px;font-weight:600}.bill-coins small{font-size:9px;color:#78818c}
        .bill-list time{color:#78818c;font-size:10px}

        .reward-empty-page,.reward-empty{min-height:340px;padding:30px;display:grid;place-items:center;align-content:center;text-align:center;border:1px solid #e4e7ec;border-radius:24px;background:#fff}
        .reward-empty-page>svg,.reward-empty>svg{width:50px;height:50px;color:#d67c0b}
        .reward-empty-page h2,.reward-empty h3{margin:12px 0 5px}.reward-empty-page p,.reward-empty p{max-width:520px;margin:0;color:#707985}
        .reward-loading{min-height:420px;display:grid;place-items:center;align-content:center;gap:13px;color:#717a85}
        .reward-loading span{width:36px;height:36px;border:3px solid #e0e3e8;border-top-color:#6b39d8;border-radius:50%;animation:rewardSpin .8s linear infinite}

        .reward-modal-backdrop{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:20px;background:rgba(20,24,30,.70);backdrop-filter:blur(7px)}
        .reward-modal,.reward-qr-modal{position:relative;width:min(620px,100%);max-height:90vh;overflow-y:auto;padding:27px;border:1px solid #e3e6eb;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}
        .reward-modal-close{position:absolute;right:16px;top:16px;width:38px;height:38px;display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:12px;background:#fff;cursor:pointer}
        .reward-modal-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;color:#d77900;background:#fff0db}
        .reward-modal-icon.purple{color:#6734da;background:#eee8ff}
        .reward-modal>small,.reward-qr-modal>small{display:block;margin-top:15px;color:#7655ae;font-size:10px;letter-spacing:.07em}
        .reward-modal h2,.reward-qr-modal h2{margin:7px 0;font-size:27px;font-weight:600}.reward-modal>p,.reward-qr-modal>p{color:#68717c;line-height:1.55}
        .reward-explain-grid{margin-top:19px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
        .reward-explain-grid article{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #e6e9ed;border-radius:14px;background:#fafbfc}
        .reward-explain-grid svg{width:20px;color:#6734da}.reward-explain-grid small,.reward-explain-grid strong{display:block}.reward-explain-grid small{font-size:8px;color:#7c8490}.reward-explain-grid strong{margin-top:3px;font-size:12px;font-weight:600;text-transform:capitalize}
        .reward-modal-code,.reward-big-code{width:100%;margin-top:17px;padding:14px;display:flex;align-items:center;justify-content:space-between;border:1px dashed #cdb9fc;border-radius:14px;color:#5125ab;background:#f8f5ff;text-align:left;cursor:pointer}
        .reward-modal-code small,.reward-modal-code strong,.reward-big-code small,.reward-big-code strong,.reward-big-code span{display:block}.reward-modal-code small,.reward-big-code small{font-size:8px}.reward-modal-code strong,.reward-big-code strong{margin-top:4px;font-size:20px;font-weight:600}
        .reward-modal-actions{margin-top:17px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.reward-modal-actions button,.reward-use-button{min-height:46px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #e0e4e9;border-radius:13px;background:#fff;font-weight:500;cursor:pointer}.reward-modal-actions button.primary,.reward-use-button{border-color:#6b39d8;color:#fff;background:#6b39d8}
        .reward-qr-modal{text-align:center}.reward-qr-modal .reward-modal-icon{margin:0 auto}.reward-qr-box{width:280px;max-width:100%;margin:20px auto;padding:10px;border:1px solid #e2e5e9;border-radius:20px;background:#fff;box-shadow:0 14px 35px rgba(43,49,60,.09)}.reward-qr-box img{width:100%;display:block;border-radius:13px}.reward-big-code{display:block;text-align:center}.reward-big-code span{margin-top:4px;color:#777f89;font-size:10px}.reward-use-button{width:100%;margin-top:15px}
        .reward-redemption-note{margin-top:15px;padding:12px 13px;display:flex;align-items:flex-start;gap:9px;border:1px solid #d7e9df;border-radius:13px;color:#3f6d50;background:#f3faf5;font-size:12px;line-height:1.45;text-align:left}
        .reward-redemption-note svg{width:18px;flex:0 0 auto}
        .reward-qr-actions{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .reward-qr-actions button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #e0e4e9;border-radius:13px;color:#4d5661;background:#fff;font-weight:500;cursor:pointer}
        .reward-qr-actions button.primary{border-color:#6b39d8;color:#fff;background:#6b39d8}
        .reward-qr-actions svg{width:17px}


        .reward-sample-wrap{
          padding:20px;
          border:1px dashed #cfd6e2;
          border-radius:22px;
          background:
            radial-gradient(circle at 92% 8%,rgba(109,60,223,.08),transparent 24%),
            linear-gradient(180deg,#fcfdff,#f8fafc);
        }

        .reward-sample-intro{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
          margin-bottom:18px;
        }

        .reward-sample-intro h3{
          margin:0;
          color:#252a31;
          font-size:19px;
          font-weight:600;
        }

        .reward-sample-intro p{
          max-width:700px;
          margin:6px 0 0;
          color:#707985;
          font-size:13px;
          line-height:1.5;
        }

        .reward-sample-badge{
          padding:8px 11px;
          flex:0 0 auto;
          border-radius:999px;
          color:#5d35bc;
          background:#eee8ff;
          font-size:10px;
          font-weight:600;
          letter-spacing:.08em;
        }

        .reward-sample-grid{
          display:grid;
          grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);
          gap:16px;
        }

        .reward-sample-card{
          min-width:0;
          padding:18px;
          border:1px solid #e2e6ec;
          border-radius:20px;
          background:#fff;
          box-shadow:0 12px 28px rgba(42,48,61,.06);
        }

        .reward-sample-card-top{
          display:flex;
          align-items:center;
          gap:12px;
        }

        .reward-sample-logo{
          width:48px;
          height:48px;
          display:grid;
          place-items:center;
          flex:0 0 auto;
          border-radius:15px;
          color:#fff;
          background:linear-gradient(135deg,#6d3cdf,#44219a);
          font-size:13px;
          font-weight:600;
        }

        .reward-sample-card-top div{
          min-width:0;
          flex:1;
        }

        .reward-sample-card-top small,
        .reward-sample-card-top strong{
          display:block;
        }

        .reward-sample-card-top small{
          color:#777f8a;
          font-size:10px;
        }

        .reward-sample-card-top strong{
          margin-top:4px;
          color:#20252b;
          font-size:16px;
          font-weight:600;
        }

        .reward-sample-tag{
          padding:6px 8px;
          border-radius:999px;
          color:#5d35bc;
          background:#eee8ff;
          font-size:9px;
          font-weight:600;
        }

        .reward-sample-description{
          margin:15px 0;
          color:#5f6873;
          font-size:13px;
          line-height:1.5;
        }

        .reward-sample-meta{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        }

        .reward-sample-meta article{
          padding:11px;
          border:1px solid #e7eaf0;
          border-radius:13px;
          background:#fafbfc;
        }

        .reward-sample-meta small,
        .reward-sample-meta strong{
          display:block;
        }

        .reward-sample-meta small{
          color:#7b8490;
          font-size:9px;
        }

        .reward-sample-meta strong{
          margin-top:4px;
          color:#2c3138;
          font-size:13px;
          font-weight:600;
        }

        .reward-sample-code{
          margin-top:13px;
          padding:11px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          border:1px dashed #cdb9fc;
          border-radius:13px;
          color:#5125ab;
          background:#f8f5ff;
        }

        .reward-sample-code small,
        .reward-sample-code strong{
          display:block;
        }

        .reward-sample-code small{
          font-size:8px;
          letter-spacing:.08em;
        }

        .reward-sample-code strong{
          margin-top:3px;
          font-size:15px;
          font-weight:600;
        }

        .reward-sample-code svg{
          width:19px;
        }

        .reward-sample-actions{
          margin-top:13px;
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:9px;
        }

        .reward-sample-actions button{
          min-height:40px;
          border:1px solid #e1e4e9;
          border-radius:11px;
          color:#68717c;
          background:#fff;
          font-weight:500;
          cursor:not-allowed;
          opacity:.72;
        }

        .reward-sample-actions button:last-child{
          border-color:#6b39d8;
          color:#fff;
          background:#6b39d8;
        }

        .reward-sample-bill{
          display:grid;
          align-content:start;
          gap:14px;
        }

        .reward-sample-bill-head{
          display:flex;
          align-items:center;
          gap:11px;
        }

        .reward-sample-bill-icon{
          width:46px;
          height:46px;
          display:grid;
          place-items:center;
          border-radius:14px;
          color:#1768e5;
          background:#eaf2ff;
        }

        .reward-sample-bill-icon svg{
          width:22px;
        }

        .reward-sample-bill-head h4{
          margin:0;
          font-size:16px;
          font-weight:600;
        }

        .reward-sample-bill-head p{
          margin:4px 0 0;
          color:#777f8a;
          font-size:11px;
        }

        .reward-sample-bill-list{
          display:grid;
          gap:10px;
        }

        .reward-sample-bill-row{
          padding:12px;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
          gap:12px;
          border:1px solid #e6e9ee;
          border-radius:14px;
          background:#fafbfc;
        }

        .reward-sample-bill-row strong,
        .reward-sample-bill-row small{
          display:block;
        }

        .reward-sample-bill-row strong{
          font-size:13px;
          font-weight:600;
        }

        .reward-sample-bill-row small{
          margin-top:4px;
          color:#77818c;
          font-size:10px;
        }

        .reward-sample-bill-row span{
          color:#15914a;
          font-size:14px;
          font-weight:600;
        }

        .reward-sample-note{
          margin-top:16px;
          padding:12px 14px;
          display:flex;
          align-items:center;
          gap:9px;
          border:1px solid #d7e9df;
          border-radius:13px;
          color:#3f6d50;
          background:#f3faf5;
          font-size:12px;
        }

        .reward-sample-note svg{
          width:18px;
          flex:0 0 auto;
        }

        @keyframes rewardSpin{to{transform:rotate(360deg)}}

        @media(max-width:1200px){
          .reward-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .reward-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .reward-impact-grid{grid-template-columns:1fr}
        }

        @media(max-width:850px){
          .reward-hero{display:block}.reward-value{margin-top:18px}.reward-hero:after{display:none}
          .reward-toolbar{align-items:stretch;flex-direction:column}.reward-search{width:100%}
          .reward-card-grid{grid-template-columns:1fr}
          .bill-list article{grid-template-columns:44px minmax(0,1fr) auto}.bill-list .reward-status,.bill-list time{grid-column:2/-1}
          .reward-sample-grid{grid-template-columns:1fr}
        }

        @media(max-width:620px){
          .reward-summary-grid,.reward-card-grid,.reward-impact-grid{grid-template-columns:1fr}
          .reward-section{padding:17px}.reward-section-head{display:block}.reward-section-head>span{margin-top:12px}
          .reward-card{min-height:auto}
          .reward-card-top{grid-template-columns:46px minmax(0,1fr)}
          .reward-card-top .reward-status{grid-column:2;justify-self:start;margin-top:6px}
          .reward-value-row{grid-template-columns:1fr;gap:7px}
          .reward-card-actions,.reward-modal-actions,.reward-explain-grid,.reward-sample-meta,.reward-sample-actions,.reward-qr-actions{grid-template-columns:1fr}
          .reward-hero{padding:22px}.reward-value{min-width:0}
          .reward-sample-wrap{padding:15px}
          .reward-sample-intro{display:block}
          .reward-sample-badge{display:inline-flex;margin-top:10px}
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

        @media(max-width:620px){
          .dash-guest-preview-note{
            align-items:flex-start;
            flex-wrap:wrap;
          }
          .dash-guest-preview-note button{
            width:100%;
          }
        }

      `}</style>
    </div>
  );
}

function SampleRewardPreview() {
  return (
    <div className="reward-sample-wrap">
      <div className="reward-sample-intro">
        <div>
          <h3>See how your real rewards will appear</h3>
          <p>
            These are sample cards only. Your actual coupons, bill rewards,
            values and expiry dates will replace them after you earn or claim a reward.
          </p>
        </div>

        <span className="reward-sample-badge">SAMPLE PREVIEW</span>
      </div>

      <div className="reward-sample-grid">
        <article className="reward-sample-card">
          <div className="reward-sample-card-top">
            <span className="reward-sample-logo">DF</span>

            <div>
              <small>DOTZ Fashion</small>
              <strong>₹250 OFF on purchases above ₹1,500</strong>
            </div>

            <span className="reward-sample-tag">SAMPLE</span>
          </div>

          <p className="reward-sample-description">
            Use this reward at checkout on an eligible order from the business.
          </p>

          <div className="reward-sample-meta">
            <article>
              <small>WHAT IT IS WORTH</small>
              <strong>₹250 savings</strong>
            </article>

            <article>
              <small>EXAMPLE EXPIRY</small>
              <strong>30 Aug 2026</strong>
            </article>
          </div>

          <div className="reward-sample-code">
            <span>
              <small>SAMPLE COUPON CODE</small>
              <strong>DOTZ250</strong>
            </span>
            <Copy />
          </div>

          <div className="reward-sample-actions">
            <button type="button" disabled>View Business</button>
            <button type="button" disabled>Show QR</button>
          </div>
        </article>

        <article className="reward-sample-card reward-sample-bill">
          <div className="reward-sample-bill-head">
            <span className="reward-sample-bill-icon">
              <ReceiptText />
            </span>

            <div>
              <h4>Sample bill rewards</h4>
              <p>Approved bills will show the coins they earned.</p>
            </div>
          </div>

          <div className="reward-sample-bill-list">
            <div className="reward-sample-bill-row">
              <div>
                <strong>Fresh Mart</strong>
                <small>Bill value ₹2,350 · Approved</small>
              </div>
              <span>+47 coins</span>
            </div>

            <div className="reward-sample-bill-row">
              <div>
                <strong>DOTZ Fashion</strong>
                <small>Bill value ₹1,800 · Approved</small>
              </div>
              <span>+36 coins</span>
            </div>
          </div>

          <div className="reward-sample-note">
            <BadgeCheck />
            Sample data is never counted in your wallet, savings or rewards.
          </div>
        </article>
      </div>
    </div>
  );
}


function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="reward-empty">
      {icon}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}