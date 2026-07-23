'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Share2,
  ShoppingBag,
  Users,
} from 'lucide-react';
import {
  collection,
  doc,
  DocumentData,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth, firebaseReady } from '@/lib/firebase';

type ShoppingCircleItem = {
  id: string;
  shareCode: string;
  productTitle: string;
  productImage: string;
  question: string;
  businessName: string;
  status: string;
  participants: number;
  commentsCount: number;
  totalVotes: number;
  createdAt: Date | null;
};

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim();

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateValue = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Timestamp) return value.toDate();

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeCircle = (
  id: string,
  data: DocumentData,
): ShoppingCircleItem => {
  const totalVotes =
    numberValue(data.vote_buy_it) +
    numberValue(data.vote_looks_good) +
    numberValue(data.vote_not_sure) +
    numberValue(data.vote_dont_buy);

  return {
    id,
    shareCode: text(data.share_code) || id,
    productTitle:
      text(data.product_title) ||
      text(data.title) ||
      text(data.product_name) ||
      'Shopping Circle product',
    productImage:
      text(data.product_image) ||
      text(data.image) ||
      text(data.image_url) ||
      text(data.product_thumbnail),
    question: text(data.question) || 'Should I buy this?',
    businessName:
      text(data.business_name) ||
      text(data.shop_name) ||
      'SPOTC Shop',
    status: text(data.status).toLowerCase() || 'active',
    participants: numberValue(data.participants),
    commentsCount: numberValue(data.comments_count),
    totalVotes,
    createdAt: dateValue(data.created_at),
  };
};

const formatDate = (date: Date | null): string => {
  if (!date) return 'Recently created';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function DashboardShoppingCircles() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(
    auth?.currentUser ?? null,
  );
  const [circles, setCircles] = useState<ShoppingCircleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCircleId, setCopiedCircleId] = useState('');

  useEffect(() => {
    if (!auth) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCircles() {
      if (!firebaseReady || !auth) {
        if (!cancelled) {
          setCircles([]);
          setError('Firebase is not ready.');
          setLoading(false);
        }
        return;
      }

      if (!currentUser) {
        if (!cancelled) {
          setCircles([]);
          setError('');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      try {
        const db = getFirestore(auth.app);
        const userRef = doc(db, 'Users', currentUser.uid);

        let snapshot;

        try {
          snapshot = await getDocs(
            query(
              collection(db, 'ShoppingCircles'),
              where('created_by', '==', userRef),
              orderBy('created_at', 'desc'),
              limit(50),
            ),
          );
        } catch (indexedQueryError) {
          console.warn(
            'Shopping Circles ordered query failed. Retrying without orderBy:',
            indexedQueryError,
          );

          snapshot = await getDocs(
            query(
              collection(db, 'ShoppingCircles'),
              where('created_by', '==', userRef),
              limit(50),
            ),
          );
        }

        if (cancelled) return;

        const loaded = snapshot.docs
          .map((circleDoc) =>
            normalizeCircle(circleDoc.id, circleDoc.data()),
          )
          .sort(
            (a, b) =>
              (b.createdAt?.getTime() ?? 0) -
              (a.createdAt?.getTime() ?? 0),
          );

        setCircles(loaded);
      } catch (loadError) {
        console.error('Loading Shopping Circles failed:', loadError);

        if (!cancelled) {
          setCircles([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load your Shopping Circles.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCircles();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const activeCircles = useMemo(
    () =>
      circles.filter(
        (circle) =>
          circle.status !== 'closed' &&
          circle.status !== 'completed' &&
          circle.status !== 'expired',
      ),
    [circles],
  );

  const completedCircles = useMemo(
    () =>
      circles.filter(
        (circle) =>
          circle.status === 'closed' ||
          circle.status === 'completed' ||
          circle.status === 'expired',
      ),
    [circles],
  );

  const summary = useMemo(() => {
    return circles.reduce(
      (current, circle) => {
        current.participants += circle.participants;
        current.comments += circle.commentsCount;
        current.votes += circle.totalVotes;
        return current;
      },
      {
        participants: 0,
        comments: 0,
        votes: 0,
      },
    );
  }, [circles]);

  const requireSignIn = (action: string): boolean => {
    if (currentUser) return true;

    setError(`Sign in to ${action}. You can continue browsing this preview.`);
    return false;
  };

  const openCircle = (circle: ShoppingCircleItem) => {
    if (!requireSignIn('open a real Shopping Circle')) return;
    router.push(`/circle/${encodeURIComponent(circle.shareCode)}`);
  };

  const copyCircleLink = async (
    event: React.MouseEvent<HTMLButtonElement>,
    circle: ShoppingCircleItem,
  ) => {
    event.stopPropagation();

    if (!requireSignIn('copy a real Shopping Circle link')) return;

    const link = `${window.location.origin}/circle/${encodeURIComponent(
      circle.shareCode,
    )}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedCircleId(circle.id);
      window.setTimeout(() => setCopiedCircleId(''), 1800);
    } catch (copyError) {
      console.error('Copying Shopping Circle link failed:', copyError);
      alert('Could not copy the link.');
    }
  };

  const shareCircle = async (
    event: React.MouseEvent<HTMLButtonElement>,
    circle: ShoppingCircleItem,
  ) => {
    event.stopPropagation();

    if (!requireSignIn('share a real Shopping Circle')) return;

    const url = `${window.location.origin}/circle/${encodeURIComponent(
      circle.shareCode,
    )}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: circle.question,
          text: `Help me decide about ${circle.productTitle} on SPOTC.`,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopiedCircleId(circle.id);
      window.setTimeout(() => setCopiedCircleId(''), 1800);
    } catch {
      // The user may cancel the native share sheet.
    }
  };

  const renderCircleCard = (circle: ShoppingCircleItem) => (
    <article
      key={circle.id}
      className="circle-card"
      role="button"
      tabIndex={0}
      onClick={() => openCircle(circle)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCircle(circle);
        }
      }}
    >
      <div className="circle-image">
        {circle.productImage ? (
          <img src={circle.productImage} alt={circle.productTitle} />
        ) : (
          <ShoppingBag />
        )}

        <span className={`circle-status ${circle.status}`}>
          {circle.status === 'active'
            ? 'Active'
            : circle.status || 'Active'}
        </span>
      </div>

      <div className="circle-content">
        <p className="circle-business">{circle.businessName}</p>
        <h3>{circle.productTitle}</h3>
        <p className="circle-question">{circle.question}</p>

        <div className="circle-stats">
          <span>
            <Users />
            {circle.participants} participant
            {circle.participants === 1 ? '' : 's'}
          </span>

          <span>
            <MessageCircle />
            {circle.commentsCount} comment
            {circle.commentsCount === 1 ? '' : 's'}
          </span>

          <span>
            <Users />
            {circle.totalVotes} vote
            {circle.totalVotes === 1 ? '' : 's'}
          </span>
        </div>

        <div className="circle-footer">
          <span>
            <Clock3 />
            {formatDate(circle.createdAt)}
          </span>

          <div className="circle-actions">
            <button
              type="button"
              aria-label="Copy Shopping Circle link"
              onClick={(event) => void copyCircleLink(event, circle)}
            >
              <Copy />
              {copiedCircleId === circle.id ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              aria-label="Share Shopping Circle"
              onClick={(event) => void shareCircle(event, circle)}
            >
              <Share2 />
              Share
            </button>

            <button
              type="button"
              className="open-circle"
              onClick={(event) => {
                event.stopPropagation();
                openCircle(circle);
              }}
            >
              <ExternalLink />
              Open chat
            </button>
          </div>
        </div>
      </div>
    </article>
  );

  if (loading) {
    return (
      <section className="circles-state">
        <Loader2 className="spin" />
        <h2>Loading Shopping Circles</h2>
        <p>Getting your product questions, votes and chats…</p>

        <style jsx>{styles}</style>
      </section>
    );
  }

  return (
    <section className="circles-page">
      <header className="circles-header">
        <div>
          <span>SHOPPING WITH PEOPLE YOU TRUST</span>
          <h2>Shopping Circles</h2>
          <p>
            Open a circle to continue the chat, view votes and share it with
            friends and family.
          </p>
        </div>

        <div className="circles-count">
          <strong>{activeCircles.length}</strong>
          <span>active</span>
        </div>
      </header>

      {!currentUser && (
        <div className="dash-guest-preview-note">
          <Users />
          <span>
            Guest preview: explore how Shopping Circles work. Sign in only to
            open, copy or share your real circles.
          </span>
          <button
            type="button"
            onClick={() => {
              router.push('/login?next=/dashboard?tab=circles');
            }}
          >
            Sign In
          </button>
        </div>
      )}

      <section className="circles-summary-grid">
        <article>
          <span className="circles-summary-icon orange">
            <Users />
          </span>
          <div>
            <small>Active Circles</small>
            <strong>{activeCircles.length}</strong>
            <p>Open shopping decisions</p>
          </div>
        </article>

        <article>
          <span className="circles-summary-icon purple">
            <ShoppingBag />
          </span>
          <div>
            <small>Completed</small>
            <strong>{completedCircles.length}</strong>
            <p>Finished discussions</p>
          </div>
        </article>

        <article>
          <span className="circles-summary-icon blue">
            <MessageCircle />
          </span>
          <div>
            <small>Comments</small>
            <strong>{summary.comments}</strong>
            <p>Friends and family replies</p>
          </div>
        </article>

        <article>
          <span className="circles-summary-icon green">
            <Users />
          </span>
          <div>
            <small>Total Votes</small>
            <strong>{summary.votes}</strong>
            <p>Shopping opinions received</p>
          </div>
        </article>
      </section>

      {error && <div className="circles-error">{error}</div>}

      {circles.length === 0 ? (
        currentUser ? (
          <div className="circles-empty">
            <div className="empty-icon">
              <Users />
            </div>

            <h3>No Shopping Circles yet</h3>
            <p>
              Open a product and tap <strong>Ask Friends &amp; Family</strong>.
              Your new circle will appear here automatically.
            </p>

            <button type="button" onClick={() => router.push('/shop')}>
              <ShoppingBag />
              Browse products
            </button>
          </div>
        ) : (
          <ShoppingCircleSamplePreview />
        )
      ) : (
        <>
          <section className="circles-section">
            <div className="section-title">
              <h3>Active circles</h3>
              <span>{activeCircles.length}</span>
            </div>

            {activeCircles.length > 0 ? (
              <div className="circles-grid">
                {activeCircles.map(renderCircleCard)}
              </div>
            ) : (
              <p className="section-empty">You have no active circles.</p>
            )}
          </section>

          {completedCircles.length > 0 && (
            <section className="circles-section completed-section">
              <div className="section-title">
                <h3>Completed circles</h3>
                <span>{completedCircles.length}</span>
              </div>

              <div className="circles-grid">
                {completedCircles.map(renderCircleCard)}
              </div>
            </section>
          )}
        </>
      )}

      <style jsx>{styles}</style>
    </section>
  );
}

function ShoppingCircleSamplePreview() {
  return (
    <section className="circles-sample">
      <div className="circles-sample-head">
        <div>
          <h3>See how Shopping Circles will appear</h3>
          <p>
            This sample is shown while you are browsing as a guest. Real
            products, comments, participants and votes appear after sign-in.
          </p>
        </div>

        <span>SAMPLE PREVIEW</span>
      </div>

      <article className="circle-card">
        <div className="circle-image">
          <ShoppingBag />
          <span className="circle-status active">Active</span>
        </div>

        <div className="circle-content">
          <p className="circle-business">DOTZ Fashion</p>
          <h3>Premium Casual Shirt</h3>
          <p className="circle-question">Should I buy this for the weekend?</p>

          <div className="circle-stats">
            <span><Users /> 4 participants</span>
            <span><MessageCircle /> 7 comments</span>
            <span><Users /> 9 votes</span>
          </div>

          <div className="circle-footer">
            <span><Clock3 /> Recently created</span>

            <div className="circle-actions">
              <button type="button" disabled><Copy /> Copy</button>
              <button type="button" disabled><Share2 /> Share</button>
              <button type="button" className="open-circle" disabled>
                <ExternalLink /> Open chat
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  :global(.spin) {
    animation: circles-spin 0.8s linear infinite;
  }

  @keyframes circles-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .circles-page {
    width: 100%;
    color: #171814;
  }

  .circles-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }

  .circles-header > div:first-child {
    min-width: 0;
  }

  .circles-header span {
    color: #ca6808;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .circles-header h2 {
    margin: 6px 0 7px;
    font-size: 30px;
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .circles-header p {
    margin: 0;
    color: #67707c;
    line-height: 1.55;
  }

  .circles-count {
    min-width: 96px;
    padding: 12px 16px;
    border: 1px solid #ead6bd;
    border-radius: 16px;
    background: #fff8ef;
    text-align: center;
  }

  .circles-count strong,
  .circles-count span {
    display: block;
  }

  .circles-count strong {
    color: #b85b00;
    font-size: 25px;
  }

  .circles-count span {
    margin-top: 1px;
    color: #876b4c;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .circles-error {
    margin-bottom: 18px;
    padding: 13px 15px;
    border: 1px solid #efcbc7;
    border-radius: 14px;
    color: #a52b25;
    background: #fff1ef;
    font-weight: 750;
  }

  .circles-empty,
  .circles-state {
    min-height: 420px;
    display: grid;
    place-content: center;
    justify-items: center;
    padding: 40px 24px;
    border: 1px dashed #d9dde4;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.64);
    text-align: center;
  }

  .circles-state {
    border: 0;
    background: transparent;
  }

  .circles-state > :global(svg) {
    width: 38px;
    height: 38px;
    color: #ca6808;
  }

  .circles-state h2,
  .circles-empty h3 {
    margin: 15px 0 7px;
  }

  .circles-state p,
  .circles-empty p {
    max-width: 520px;
    margin: 0;
    color: #6d7580;
    line-height: 1.55;
  }

  .empty-icon {
    width: 68px;
    height: 68px;
    display: grid;
    place-items: center;
    border-radius: 21px;
    color: #b65b08;
    background: #fff0df;
  }

  .empty-icon :global(svg) {
    width: 31px;
    height: 31px;
  }

  .circles-empty button {
    margin-top: 20px;
    min-height: 47px;
    padding: 0 17px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 13px;
    color: white;
    background: #171814;
    cursor: pointer;
    font-weight: 850;
  }

  .circles-empty button :global(svg) {
    width: 18px;
    height: 18px;
  }

  .circles-section + .circles-section {
    margin-top: 30px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 13px;
  }

  .section-title h3 {
    margin: 0;
    font-size: 18px;
  }

  .section-title span {
    min-width: 27px;
    height: 27px;
    padding: 0 8px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    color: #7a5c3b;
    background: #f8ead9;
    font-size: 11px;
    font-weight: 900;
  }

  .section-empty {
    margin: 0;
    padding: 22px;
    border: 1px dashed #d9dde4;
    border-radius: 17px;
    color: #737b86;
    background: rgba(255, 255, 255, 0.55);
  }

  .circles-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .circle-card {
    min-width: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    border: 1px solid #e1e5eb;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 12px 35px rgba(38, 43, 51, 0.06);
    cursor: pointer;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }

  .circle-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 17px 42px rgba(38, 43, 51, 0.1);
  }

  .circle-card:focus-visible {
    outline: 3px solid rgba(202, 104, 8, 0.23);
    outline-offset: 2px;
  }

  .circle-image {
    position: relative;
    min-height: 205px;
    overflow: hidden;
    display: grid;
    place-items: center;
    color: #9ba2ab;
    background: #f2f3f5;
  }

  .circle-image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .circle-image > :global(svg) {
    width: 38px;
    height: 38px;
  }

  .circle-status {
    position: absolute;
    left: 10px;
    bottom: 10px;
    padding: 6px 9px;
    border-radius: 999px;
    color: #fff;
    background: rgba(31, 35, 40, 0.82);
    font-size: 10px;
    font-weight: 900;
    text-transform: capitalize;
  }

  .circle-status.active {
    background: #168446;
  }

  .circle-content {
    min-width: 0;
    padding: 17px;
    display: flex;
    flex-direction: column;
  }

  .circle-business {
    margin: 0;
    overflow: hidden;
    color: #b45b08;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .circle-content h3 {
    margin: 5px 0 7px;
    overflow: hidden;
    font-size: 17px;
    line-height: 1.3;
    letter-spacing: -0.02em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .circle-question {
    margin: 0;
    overflow: hidden;
    color: #5f6874;
    font-size: 13px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .circle-stats {
    margin-top: 13px;
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .circle-stats span {
    padding: 6px 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    color: #5c6672;
    background: #f3f5f7;
    font-size: 10px;
    font-weight: 750;
  }

  .circle-stats span :global(svg) {
    width: 13px;
    height: 13px;
  }

  .circle-footer {
    margin-top: auto;
    padding-top: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .circle-footer > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #7a828c;
    font-size: 10px;
    font-weight: 750;
  }

  .circle-footer > span :global(svg) {
    width: 13px;
    height: 13px;
  }

  .circle-actions {
    display: flex;
    gap: 6px;
  }

  .circle-actions button {
    min-height: 34px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid #dde1e6;
    border-radius: 10px;
    color: #49525e;
    background: #fff;
    cursor: pointer;
    font-size: 10px;
    font-weight: 850;
  }

  .circle-actions button :global(svg) {
    width: 13px;
    height: 13px;
  }

  .circle-actions .open-circle {
    border-color: #171814;
    color: #fff;
    background: #171814;
  }

  .completed-section {
    opacity: 0.86;
  }

  .dash-guest-preview-note {
    width: 100%;
    margin-bottom: 18px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid #cfe5f0;
    border-radius: 14px;
    color: #245b6d;
    background: #eef9fc;
    font-size: 12px;
    line-height: 1.4;
  }

  .dash-guest-preview-note > :global(svg) {
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
    min-height: 36px;
    padding: 0 13px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 10px;
    color: #fff;
    background: #087e98;
    font-weight: 800;
    cursor: pointer;
  }

  .circles-summary-grid {
    margin-bottom: 22px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .circles-summary-grid article {
    min-width: 0;
    min-height: 104px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 13px;
    border: 1px solid #e4e7ec;
    border-radius: 19px;
    background: #fff;
    box-shadow: 0 10px 25px rgba(42, 48, 61, 0.055);
  }

  .circles-summary-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 17px;
  }

  .circles-summary-icon > :global(svg) {
    width: 24px;
    height: 24px;
  }

  .circles-summary-icon.orange {
    color: #df7a00;
    background: #fff0db;
  }

  .circles-summary-icon.purple {
    color: #6734da;
    background: #eee8ff;
  }

  .circles-summary-icon.blue {
    color: #1768e5;
    background: #eaf2ff;
  }

  .circles-summary-icon.green {
    color: #159b50;
    background: #e8f8ef;
  }

  .circles-summary-grid small,
  .circles-summary-grid strong,
  .circles-summary-grid p {
    display: block;
  }

  .circles-summary-grid small {
    font-size: 11px;
    font-weight: 700;
  }

  .circles-summary-grid strong {
    margin-top: 4px;
    font-size: 24px;
    font-weight: 800;
  }

  .circles-summary-grid p {
    margin: 6px 0 0;
    color: #707985;
    font-size: 11px;
  }

  .circles-sample {
    padding: 20px;
    border: 1px dashed #cfd6e2;
    border-radius: 22px;
    background:
      radial-gradient(circle at 92% 8%, rgba(202, 104, 8, 0.08), transparent 24%),
      linear-gradient(180deg, #fcfdff, #f8fafc);
  }

  .circles-sample-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 17px;
  }

  .circles-sample-head h3 {
    margin: 0;
    font-size: 19px;
  }

  .circles-sample-head p {
    max-width: 720px;
    margin: 6px 0 0;
    color: #707985;
    font-size: 13px;
    line-height: 1.5;
  }

  .circles-sample-head span {
    padding: 8px 11px;
    flex: 0 0 auto;
    border-radius: 999px;
    color: #9a4c00;
    background: #fff0df;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  .circles-sample .circle-card {
    max-width: 760px;
    cursor: default;
  }

  .circles-sample .circle-card:hover {
    transform: none;
  }

  .circles-sample .circle-actions button {
    cursor: not-allowed;
    opacity: 0.68;
  }

  @media (max-width: 1120px) {
    .circles-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .circles-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .circles-summary-grid article {
      min-height: 112px;
      padding: 13px 10px;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 8px;
      overflow: hidden;
      border-radius: 17px;
    }

    .circles-summary-icon {
      width: 40px;
      height: 40px;
      border-radius: 13px;
    }

    .circles-summary-icon > :global(svg) {
      width: 20px;
      height: 20px;
    }

    .circles-summary-grid article > div {
      width: 100%;
      min-width: 0;
    }

    .circles-summary-grid small {
      font-size: 10px;
      line-height: 1.2;
    }

    .circles-summary-grid strong {
      margin-top: 3px;
      font-size: 21px;
      line-height: 1;
    }

    .circles-summary-grid p {
      margin-top: 5px;
      font-size: 9px;
      line-height: 1.25;
    }

    .dash-guest-preview-note {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .dash-guest-preview-note button {
      width: 100%;
    }

    .circles-header {
      align-items: flex-start;
    }

    .circles-header h2 {
      font-size: 25px;
    }

    .circles-count {
      min-width: 76px;
      padding: 9px 11px;
    }

    .circle-card {
      grid-template-columns: 105px minmax(0, 1fr);
    }

    .circle-image {
      min-height: 190px;
    }

    .circle-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .circle-actions {
      width: 100%;
    }

    .circle-actions button {
      flex: 1;
    }
  }

  @media (max-width: 480px) {
    .circles-header {
      display: block;
    }

    .circles-count {
      width: 100%;
      margin-top: 13px;
    }

    .circle-card {
      grid-template-columns: 88px minmax(0, 1fr);
    }

    .circle-content {
      padding: 13px;
    }

    .circle-stats span:first-child {
      display: none;
    }

    .circle-actions button:not(.open-circle) {
      width: 35px;
      padding: 0;
      font-size: 0;
    }
  }
`;