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
  DocumentReference,
  QuerySnapshot,
  getDoc,
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
  relation: 'mine' | 'joined';
  latestMessage: string;
  latestSender: string;
  latestAt: Date | null;
  hasNewActivity: boolean;
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
  metadata?: {
    relation?: 'mine' | 'joined';
    latestMessage?: string;
    latestSender?: string;
    latestAt?: Date | null;
    lastSeenAt?: Date | null;
  },
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
    relation: metadata?.relation ?? 'mine',
    latestMessage: metadata?.latestMessage ?? '',
    latestSender: metadata?.latestSender ?? '',
    latestAt: metadata?.latestAt ?? null,
    hasNewActivity:
      Boolean(metadata?.latestAt) &&
      (!metadata?.lastSeenAt ||
        (metadata.latestAt?.getTime() ?? 0) >
          metadata.lastSeenAt.getTime()),
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

const formatActivityTime = (date: Date | null): string => {
  if (!date) return '';

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000),
  );

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return formatDate(date);
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
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

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

        const circleDocuments = new Map<
          string,
          { id: string; data: DocumentData }
        >();

        const ownedCircleIds = new Set<string>();
        const participantLastSeen = new Map<string, Date | null>();

        const addCircleSnapshot = (
          snapshot: QuerySnapshot<DocumentData>,
        ) => {
          snapshot.docs.forEach((circleDocument) => {
            circleDocuments.set(circleDocument.id, {
              id: circleDocument.id,
              data: circleDocument.data(),
            });
          });
        };

        const createdByReferences = [
          doc(db, 'Users', currentUser.uid),
          doc(db, 'users', currentUser.uid),
        ];

        for (const createdByReference of createdByReferences) {
          try {
            const createdSnapshot = await getDocs(
              query(
                collection(db, 'ShoppingCircles'),
                where('created_by', '==', createdByReference),
                limit(50),
              ),
            );

            addCircleSnapshot(createdSnapshot);
            createdSnapshot.docs.forEach((item) =>
              ownedCircleIds.add(item.id),
            );
          } catch (createdQueryError) {
            console.warn(
              'Shopping Circles created_by query failed:',
              createdQueryError,
            );
          }
        }

        const creatorUidFields = [
          'created_by_uid',
          'creator_uid',
          'owner_uid',
          'user_uid',
        ] as const;

        for (const fieldName of creatorUidFields) {
          try {
            const createdByUidSnapshot = await getDocs(
              query(
                collection(db, 'ShoppingCircles'),
                where(fieldName, '==', currentUser.uid),
                limit(50),
              ),
            );

            addCircleSnapshot(createdByUidSnapshot);
            createdByUidSnapshot.docs.forEach((item) =>
              ownedCircleIds.add(item.id),
            );
          } catch (createdByUidError) {
            console.warn(
              `Shopping Circles ${fieldName} query failed:`,
              createdByUidError,
            );
          }
        }

        try {
          const participantSnapshot = await getDocs(
            query(
              collection(db, 'ShoppingCircleParticipants'),
              where('user_uid', '==', currentUser.uid),
              limit(100),
            ),
          );

          const joinedCircleSnapshots = await Promise.all(
            participantSnapshot.docs.map(async (participantDocument) => {
              const participantData = participantDocument.data();
              const circleReference = participantData.circle_ref;
              const participantCircleId =
                text(participantData.circle_id) ||
                (
                  circleReference &&
                  typeof circleReference === 'object' &&
                  'id' in circleReference
                    ? text(
                        (circleReference as { id?: unknown }).id,
                      )
                    : ''
                );

              if (participantCircleId) {
                participantLastSeen.set(
                  participantCircleId,
                  dateValue(participantData.last_seen_at),
                );
              }

              if (
                circleReference &&
                typeof circleReference === 'object' &&
                'path' in circleReference
              ) {
                try {
                  return await getDoc(
                    circleReference as DocumentReference<DocumentData>,
                  );
                } catch (circleReadError) {
                  console.warn(
                    'Unable to read joined Shopping Circle reference:',
                    circleReadError,
                  );
                }
              }

              const circleId = text(participantData.circle_id);

              if (circleId) {
                try {
                  return await getDoc(
                    doc(db, 'ShoppingCircles', circleId),
                  );
                } catch (circleIdReadError) {
                  console.warn(
                    'Unable to read joined Shopping Circle by ID:',
                    circleIdReadError,
                  );
                }
              }

              const shareCode = text(participantData.share_code);

              if (shareCode) {
                try {
                  const shareCodeSnapshot = await getDocs(
                    query(
                      collection(db, 'ShoppingCircles'),
                      where('share_code', '==', shareCode),
                      limit(1),
                    ),
                  );

                  return shareCodeSnapshot.docs[0] ?? null;
                } catch (shareCodeReadError) {
                  console.warn(
                    'Unable to read joined Shopping Circle by share code:',
                    shareCodeReadError,
                  );
                }
              }

              return null;
            }),
          );

          joinedCircleSnapshots.forEach((circleSnapshot) => {
            if (circleSnapshot?.exists()) {
              circleDocuments.set(circleSnapshot.id, {
                id: circleSnapshot.id,
                data: circleSnapshot.data(),
              });
            }
          });
        } catch (participantQueryError) {
          console.warn(
            'Shopping Circle participant query failed:',
            participantQueryError,
          );
        }

        if (cancelled) return;

        const loaded = await Promise.all(
          Array.from(circleDocuments.values()).map(
            async (circleDocument) => {
              let latestMessage = '';
              let latestSender = '';
              let latestAt: Date | null = null;

              try {
                const circleReference = doc(
                  db,
                  'ShoppingCircles',
                  circleDocument.id,
                );

                const messageSnapshot = await getDocs(
                  query(
                    collection(db, 'ShoppingCircleMessages'),
                    where('circle_ref', '==', circleReference),
                    limit(100),
                  ),
                );

                const latest = messageSnapshot.docs
                  .map((messageDocument) => {
                    const messageData = messageDocument.data();
                    const messageType = text(
                      messageData.message_type,
                    );
                    const vote = text(messageData.vote);
                    const voiceUrl = text(messageData.voice_url);

                    return {
                      sender: text(messageData.sender_name) || 'SPOTC User',
                      body:
                        messageType === 'voice' || voiceUrl
                          ? 'Voice message'
                          : vote
                            ? text(messageData.message) || 'Voted'
                            : text(messageData.message),
                      createdAt: dateValue(messageData.created_at),
                    };
                  })
                  .sort(
                    (a, b) =>
                      (b.createdAt?.getTime() ?? 0) -
                      (a.createdAt?.getTime() ?? 0),
                  )[0];

                if (latest) {
                  latestMessage = latest.body;
                  latestSender = latest.sender;
                  latestAt = latest.createdAt;
                }
              } catch (messageLoadError) {
                console.warn(
                  'Unable to load latest Shopping Circle message:',
                  messageLoadError,
                );
              }

              return normalizeCircle(
                circleDocument.id,
                circleDocument.data,
                {
                  relation: ownedCircleIds.has(circleDocument.id)
                    ? 'mine'
                    : 'joined',
                  latestMessage,
                  latestSender,
                  latestAt,
                  lastSeenAt:
                    participantLastSeen.get(circleDocument.id) ??
                    null,
                },
              );
            },
          ),
        );

        loaded.sort(
          (a, b) =>
            (b.latestAt?.getTime() ??
              b.createdAt?.getTime() ??
              0) -
            (a.latestAt?.getTime() ??
              a.createdAt?.getTime() ??
              0),
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

  const myActiveCircles = useMemo(
    () =>
      activeCircles.filter(
        (circle) => circle.relation === 'mine',
      ),
    [activeCircles],
  );

  const joinedActiveCircles = useMemo(
    () =>
      activeCircles.filter(
        (circle) => circle.relation === 'joined',
      ),
    [activeCircles],
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
      className="circle-simple-card"
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
      <div className="circle-simple-image">
        {circle.productImage ? (
          <img src={circle.productImage} alt={circle.productTitle} />
        ) : (
          <ShoppingBag />
        )}
      </div>

      <div className="circle-simple-copy">
        <div className="circle-simple-top">
          <strong>{circle.productTitle}</strong>
          {circle.hasNewActivity && (
            <span className="circle-simple-new">New</span>
          )}
        </div>

        <small className="circle-simple-question">
          {circle.question}
        </small>

        {circle.latestMessage ? (
          <div
            className={
              circle.hasNewActivity
                ? 'circle-simple-latest new'
                : 'circle-simple-latest'
            }
          >
            <MessageCircle />
            <span>
              <strong>{circle.latestSender || 'SPOTC User'}</strong>
              <small>{circle.latestMessage}</small>
            </span>
            <time>{formatActivityTime(circle.latestAt)}</time>
          </div>
        ) : (
          <small className="circle-simple-no-message">No messages yet</small>
        )}

        <div className="circle-simple-meta">
          <span>
            {circle.commentsCount} comment
            {circle.commentsCount === 1 ? '' : 's'}
          </span>
          <span>
            {circle.totalVotes} vote
            {circle.totalVotes === 1 ? '' : 's'}
          </span>
          <span>{formatDate(circle.createdAt)}</span>
        </div>
      </div>

      <button
        type="button"
        className="circle-simple-open"
        onClick={(event) => {
          event.stopPropagation();
          openCircle(circle);
        }}
      >
        Open
        <ExternalLink />
      </button>
    </article>
  );

  if (loading) {
    return (
      <section className="circles-state">
        <Loader2 className="spin" />
        <h2>Loading Shopping Circles</h2>
        <p>Getting your circles…</p>

        <style jsx>{styles}</style>
      </section>
    );
  }

  const filteredCircles =
    filter === 'active'
      ? activeCircles
      : completedCircles;

  return (
    <section className="circles-page">
      <header className="circles-simple-header">
        <div>
          <span>SHOPPING CIRCLES</span>
          <h2>Shopping Circles</h2>
          <p>
            Open a circle to continue the conversation and see the latest opinions.
          </p>
        </div>
      </header>

      {!currentUser && (
        <div className="dash-guest-preview-note">
          <Users />
          <span>Sign in to open your real Shopping Circles.</span>
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
          <section className="circles-simple-toolbar">
            <div className="circles-simple-tabs">
              <button
                type="button"
                className={filter === 'active' ? 'active' : ''}
                onClick={() => setFilter('active')}
              >
                Active
                <span>{activeCircles.length}</span>
              </button>

              <button
                type="button"
                className={filter === 'completed' ? 'active' : ''}
                onClick={() => setFilter('completed')}
              >
                Completed
                <span>{completedCircles.length}</span>
              </button>
            </div>

            <small>
              {filteredCircles.length}{' '}
              {filteredCircles.length === 1 ? 'circle' : 'circles'}
            </small>
          </section>

          {filteredCircles.length > 0 ? (
            <section className="circles-simple-list">
              {filteredCircles.map(renderCircleCard)}
            </section>
          ) : (
            <section className="circles-simple-empty-filter">
              <MessageCircle />
              <h3>
                No {filter === 'active' ? 'active' : 'completed'} circles
              </h3>
              <p>
                {filter === 'active'
                  ? 'Your active Shopping Circles will appear here.'
                  : 'Completed Shopping Circles will appear here.'}
              </p>
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
    <section className="circles-simple-empty-filter">
      <Users />
      <h3>Shopping Circles</h3>
      <p>Sign in to view the circles you created or joined.</p>
    </section>
  );
}

const styles = `
  :global(*) { box-sizing: border-box; }
  :global(.spin) { animation: circles-spin .8s linear infinite; }

  @keyframes circles-spin {
    to { transform: rotate(360deg); }
  }

  .circles-page {
    width: 100%;
    color: #171814;
  }

  .circles-simple-header {
    margin-bottom: 16px;
    padding: 4px 2px 8px;
  }

  .circles-simple-header span {
    color: #ca6808;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .11em;
  }

  .circles-simple-header h2 {
    margin: 5px 0 3px;
    font-size: 30px;
    line-height: 1.1;
  }

  .circles-simple-header p {
    margin: 0;
    color: #6f7780;
    font-size: 13px;
    line-height: 1.5;
  }

  .dash-guest-preview-note {
    width: 100%;
    margin-bottom: 14px;
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
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    color: #fff;
    background: #087e98;
    font-weight: 700;
    cursor: pointer;
  }

  .circles-error {
    margin-bottom: 14px;
    padding: 11px 13px;
    border: 1px solid #efcbc7;
    border-radius: 12px;
    color: #a52b25;
    background: #fff1ef;
    font-size: 12px;
  }

  .circles-state,
  .circles-empty,
  .circles-simple-empty-filter {
    min-height: 260px;
    display: grid;
    place-content: center;
    justify-items: center;
    padding: 28px 20px;
    border: 1px solid #e3e6eb;
    border-radius: 16px;
    background: #fff;
    text-align: center;
  }

  .circles-state {
    border: 0;
    background: transparent;
  }

  .circles-state > :global(svg),
  .circles-simple-empty-filter > :global(svg) {
    width: 34px;
    height: 34px;
    color: #ca6808;
  }

  .empty-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: #b65b08;
    background: #fff0df;
  }

  .empty-icon :global(svg) {
    width: 27px;
    height: 27px;
  }

  .circles-state h2,
  .circles-empty h3,
  .circles-simple-empty-filter h3 {
    margin: 12px 0 6px;
  }

  .circles-state p,
  .circles-empty p,
  .circles-simple-empty-filter p {
    max-width: 500px;
    margin: 0;
    color: #6d7580;
    font-size: 12px;
    line-height: 1.5;
  }

  .circles-empty button {
    margin-top: 16px;
    min-height: 42px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 0;
    border-radius: 11px;
    color: #fff;
    background: #171814;
    cursor: pointer;
    font-weight: 700;
  }

  .circles-empty button :global(svg) {
    width: 16px;
    height: 16px;
  }

  .circles-simple-toolbar {
    margin-bottom: 12px;
    padding: 9px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #e4e7ec;
    border-radius: 13px;
    background: #fff;
  }

  .circles-simple-tabs {
    display: flex;
    gap: 6px;
  }

  .circles-simple-tabs button {
    min-height: 34px;
    padding: 0 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: #666f79;
    background: transparent;
    font-size: 11px;
    cursor: pointer;
  }

  .circles-simple-tabs button span {
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    color: #7a7168;
    background: #f0ede9;
    font-size: 9px;
  }

  .circles-simple-tabs button.active {
    border-color: #edc995;
    color: #9a5600;
    background: #fff3e4;
    font-weight: 700;
  }

  .circles-simple-toolbar > small {
    color: #817970;
    font-size: 11px;
  }

  .circles-simple-list {
    display: grid;
    gap: 9px;
  }

  .circle-simple-card {
    min-width: 0;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid #e3e6eb;
    border-radius: 14px;
    background: #fff;
    cursor: pointer;
    transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
  }

  .circle-simple-card:hover {
    border-color: #e1bd8f;
    box-shadow: 0 8px 22px rgba(38,43,51,.06);
    transform: translateY(-1px);
  }

  .circle-simple-card:focus-visible {
    outline: 3px solid rgba(202,104,8,.18);
    outline-offset: 2px;
  }

  .circle-simple-image {
    width: 72px;
    height: 72px;
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: #969da6;
    background: #f3f4f6;
  }

  .circle-simple-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .circle-simple-image > :global(svg) {
    width: 26px;
    height: 26px;
  }

  .circle-simple-copy { min-width: 0; }

  .circle-simple-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .circle-simple-top > strong {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .circle-simple-new {
    padding: 4px 6px;
    flex: 0 0 auto;
    border-radius: 999px;
    color: #fff;
    background: #ef4444;
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .circle-simple-question {
    display: block;
    margin-top: 3px;
    overflow: hidden;
    color: #7b838d;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .circle-simple-latest {
    margin-top: 8px;
    padding: 8px 9px;
    display: grid;
    grid-template-columns: 17px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border-radius: 10px;
    background: #f7f8fa;
  }

  .circle-simple-latest.new { background: #eef5ff; }

  .circle-simple-latest > :global(svg) {
    width: 15px;
    height: 15px;
    color: #087e98;
  }

  .circle-simple-latest span,
  .circle-simple-latest strong,
  .circle-simple-latest small {
    min-width: 0;
    display: block;
  }

  .circle-simple-latest strong {
    overflow: hidden;
    color: #3b434c;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .circle-simple-latest small {
    margin-top: 1px;
    overflow: hidden;
    color: #69727c;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .circle-simple-latest time {
    color: #8a929b;
    font-size: 8px;
    white-space: nowrap;
  }

  .circle-simple-no-message {
    display: block;
    margin-top: 7px;
    color: #9a9188;
    font-size: 10px;
  }

  .circle-simple-meta {
    margin-top: 7px;
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .circle-simple-meta span {
    color: #858d96;
    font-size: 9px;
  }

  .circle-simple-open {
    min-height: 36px;
    padding: 0 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid #171814;
    border-radius: 10px;
    color: #fff;
    background: #171814;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .circle-simple-open :global(svg) {
    width: 13px;
    height: 13px;
  }

  @media (max-width: 650px) {
    .circles-simple-header h2 { font-size: 26px; }

    .circles-simple-toolbar { align-items: flex-start; }
    .circles-simple-toolbar > small { display: none; }

    .circle-simple-card {
      grid-template-columns: 58px minmax(0, 1fr) auto;
      gap: 9px;
      padding: 9px;
    }

    .circle-simple-image {
      width: 58px;
      height: 58px;
    }

    .circle-simple-top > strong { font-size: 13px; }
    .circle-simple-latest { margin-top: 6px; }
    .circle-simple-meta span:last-child { display: none; }

    .circle-simple-open {
      min-width: 36px;
      width: 36px;
      padding: 0;
      font-size: 0;
    }
  }

  @media (max-width: 430px) {
    .circle-simple-question { display: none; }
    .circle-simple-latest time { display: none; }

    .circle-simple-latest {
      grid-template-columns: 15px minmax(0, 1fr);
    }

    .circle-simple-meta { gap: 7px; }
  }
`;