"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Heart,
  Loader2,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Reply,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { requireGoogleLogin } from '@/lib/auth';
import { auth, firebaseReady } from '@/lib/firebase';

function getAppFirestore() {
  const currentAuth = auth;

  if (!currentAuth) {
    throw new Error('Firebase authentication is not available.');
  }

  return getFirestore(currentAuth.app);
}

type ShoppingCirclePageProps = {
  shareCode: string;
};

type CircleProduct = {
  id?: string;
  title?: string;
  image?: string;
  price?: number | string;
  old_price?: number | string;
  discount?: number | string;
  business_name?: string;
  shop_name?: string;
};

type CircleData = {
  comparison_mode?: boolean;
  products?: CircleProduct[];
  product_title?: string;
  product_image?: string;
  product_price?: number | string;
  product_old_price?: number | string;
  product_discount?: number | string;
  business_name?: string;
  question?: string;
  share_code?: string;
  participants?: number;
  comments_count?: number;
  vote_buy_it?: number;
  vote_looks_good?: number;
  vote_not_sure?: number;
  vote_dont_buy?: number;
  none_votes?: number;
  status?: string;
  [key: string]: unknown;
};

type CircleMessage = {
  id: string;
  ref: DocumentReference<DocumentData>;
  user_uid: string;
  sender_name: string;
  sender_photo: string;
  message_type: 'text' | 'vote' | 'voice';
  message: string;
  vote: string;
  voice_url: string;
  voice_duration: number;
  reply_to_name: string;
  reply_to_text: string;
  created_at?: Timestamp;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'S';

const timeAgo = (value?: Timestamp) => {
  if (!value) return 'Just now';
  const seconds = Math.max(0, Math.floor((Date.now() - value.toMillis()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

const shortTitle = (title: string) =>
  title.trim().split(/\s+/).slice(0, 3).join(' ') || 'Product';

function formatMoney(value: unknown) {
  return `₹${n(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function voteField(vote: string) {
  if (vote.startsWith('product_')) return `${vote}_votes`;
  if (vote === 'none') return 'none_votes';
  if (vote === 'buy_it') return 'vote_buy_it';
  if (vote === 'looks_good') return 'vote_looks_good';
  if (vote === 'dont_buy') return 'vote_dont_buy';
  return 'vote_not_sure';
}

const singleProductVoteOptions: Array<
  [vote: string, label: string, Icon: LucideIcon, countKey: keyof CircleData]
> = [
  ['buy_it', 'Buy it', Heart, 'vote_buy_it'],
  ['looks_good', 'Looks good', ThumbsUp, 'vote_looks_good'],
  ['not_sure', 'Not sure', Sparkles, 'vote_not_sure'],
  ['dont_buy', "Don't buy", ThumbsDown, 'vote_dont_buy'],
];

export default function ShoppingCirclePage({ shareCode }: ShoppingCirclePageProps) {
  const router = useRouter();
  const [circleRef, setCircleRef] = useState<DocumentReference<DocumentData> | null>(null);
  const [circle, setCircle] = useState<CircleData | null>(null);
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myVote, setMyVote] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<CircleMessage | null>(null);
  const [menuMessage, setMenuMessage] = useState<CircleMessage | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingUrl, setPlayingUrl] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firebaseReady || !shareCode.trim()) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const currentAuth = auth;
    if (!currentAuth) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const db = getAppFirestore();
    let stopCircle: (() => void) | undefined;
    let stopMessages: (() => void) | undefined;
    let cancelled = false;

    async function resolveCircle() {
      try {
        const result = await getDocs(
          query(
            collection(db, 'ShoppingCircles'),
            where('share_code', '==', shareCode.trim()),
            limit(1),
          ),
        );

        if (cancelled) return;
        const found = result.docs[0];

        if (!found) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const ref = found.ref;
        setCircleRef(ref);

        stopCircle = onSnapshot(ref, (snapshot) => {
          if (!snapshot.exists()) {
            setNotFound(true);
            return;
          }

          const data = snapshot.data() as CircleData;
          const status = String(data.status ?? 'active').toLowerCase();
          if (['deleted', 'removed', 'closed'].includes(status)) {
            setNotFound(true);
            return;
          }

          setCircle(data);
          setLoading(false);
        });

        stopMessages = onSnapshot(
          query(
            collection(db, 'ShoppingCircleMessages'),
            where('circle_ref', '==', ref),
          ),
          (snapshot) => {
            const next = snapshot.docs
              .map((item) => {
                const data = item.data();

                return {
                  id: item.id,
                  ref: item.ref,
                  user_uid: String(data.user_uid ?? ''),
                  sender_name: String(
                    data.sender_name ?? 'SPOTC User',
                  ),
                  sender_photo: String(
                    data.sender_photo ?? '',
                  ),
                  message_type: (
                    data.message_type ?? 'text'
                  ) as CircleMessage['message_type'],
                  message: String(data.message ?? ''),
                  vote: String(data.vote ?? ''),
                  voice_url: String(data.voice_url ?? ''),
                  voice_duration: n(
                    data.voice_duration,
                  ),
                  reply_to_name: String(
                    data.reply_to_name ?? '',
                  ),
                  reply_to_text: String(
                    data.reply_to_text ?? '',
                  ),
                  created_at:
                    data.created_at instanceof Timestamp
                      ? data.created_at
                      : undefined,
                };
              })
              .sort((a, b) => {
                const aTime =
                  a.created_at?.toMillis() ?? 0;
                const bTime =
                  b.created_at?.toMillis() ?? 0;

                return aTime - bTime;
              });

            setMessages(next);

            const uid = auth?.currentUser?.uid;
            const mine = uid
              ? next.find(
                  (item) =>
                    item.user_uid === uid &&
                    item.vote,
                )
              : undefined;

            setMyVote(mine?.vote ?? '');
          },
          (snapshotError) => {
            console.error(
              'Shopping Circle messages listener failed:',
              snapshotError,
            );
          },
        );
      } catch (error) {
        console.error('Shopping Circle load failed', error);
        setNotFound(true);
        setLoading(false);
      }
    }

    void resolveCircle();

    return () => {
      cancelled = true;
      stopCircle?.();
      stopMessages?.();
    };
  }, [shareCode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const comparisonMode = circle?.comparison_mode === true;
  const products = Array.isArray(circle?.products) ? circle!.products! : [];

  const summary = useMemo(() => {
    if (!circle) return { title: 'Circle Summary', text: 'Waiting for opinions.', tone: 'gold' };

    if (comparisonMode) {
      const counts = products.map((_, index) => n(circle[`product_${index}_votes`]));
      const none = n(circle.none_votes);
      const best = Math.max(0, ...counts);

      if (best === 0 && none === 0) {
        return { title: 'Circle Summary', text: 'Share this circle and ask friends to vote.', tone: 'gold' };
      }

      if (none > best) {
        return { title: 'Circle Summary', text: 'Most people are not convinced yet. Compare more options before buying.', tone: 'red' };
      }

      const winners = counts.map((count, index) => ({ count, index })).filter((item) => item.count === best);
      if (winners.length !== 1) {
        return { title: 'Circle Summary', text: 'The vote is close. Check price, size and return policy before deciding.', tone: 'gold' };
      }

      const product = products[winners[0].index];
      return { title: 'Circle Summary', text: `${shortTitle(product?.title ?? 'This product')} is currently the most recommended choice.`, tone: 'green' };
    }

    const positive = n(circle.vote_buy_it) + n(circle.vote_looks_good);
    const negative = n(circle.vote_dont_buy);
    const unsure = n(circle.vote_not_sure);

    if (positive + negative + unsure === 0) {
      return { title: 'Circle Summary', text: 'Share this circle and ask friends to vote.', tone: 'gold' };
    }
    if (positive > negative && positive >= unsure) {
      return { title: 'Circle Summary', text: 'Most friends are positive. This looks like a good product to buy.', tone: 'green' };
    }
    if (negative > positive) {
      return { title: 'Circle Summary', text: 'Friends are warning against this purchase. Consider waiting or comparing.', tone: 'red' };
    }
    return { title: 'Circle Summary', text: 'Opinions are mixed. Check size, price and return policy before buying.', tone: 'gold' };
  }, [circle, comparisonMode, products]);

  async function ensureUser() {
    const user = auth?.currentUser ?? (await requireGoogleLogin());
    if (!user) throw new Error('Please sign in to continue.');
    return user;
  }

  async function registerParticipant() {
    if (!circleRef) return;
    const user = await ensureUser();
    const db = getAppFirestore();
    const participantRef = doc(db, 'ShoppingCircleParticipants', `${circleRef.id}_${user.uid}`);

    await runTransaction(db, async (transaction) => {
      const participant = await transaction.get(participantRef);
      if (participant.exists()) return;

      transaction.set(participantRef, {
        circle_ref: circleRef,
        user_uid: user.uid,
        user_ref: doc(db, 'users', user.uid),
        name: user.displayName || 'SPOTC User',
        photo: user.photoURL || '',
        joined_at: serverTimestamp(),
      });
      transaction.update(circleRef, {
        participants: increment(1),
        updated_at: serverTimestamp(),
      });
    });
  }

  async function submitVote(vote: string, label: string) {
    if (!circleRef || busy) return;
    setBusy(true);

    try {
      const user = await ensureUser();
      await registerParticipant();
      const db = getAppFirestore();
      const messageRef = doc(db, 'ShoppingCircleMessages', `${circleRef.id}_${user.uid}_vote`);

      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(messageRef);
        const oldVote = existing.exists() ? String(existing.data().vote ?? '') : '';

        if (oldVote === vote) return;

        const updates: Record<string, unknown> = {
          [voteField(vote)]: increment(1),
          updated_at: serverTimestamp(),
        };
        if (oldVote) updates[voteField(oldVote)] = increment(-1);

        transaction.update(circleRef, updates);
        transaction.set(
          messageRef,
          {
            circle_ref: circleRef,
            sender_ref: doc(db, 'users', user.uid),
            user_uid: user.uid,
            sender_name: user.displayName || 'SPOTC User',
            sender_photo: user.photoURL || '',
            message_type: 'vote',
            message: label,
            vote,
            voice_url: '',
            voice_duration: 0,
            is_guest: false,
            created_at: existing.exists() ? existing.data().created_at ?? serverTimestamp() : serverTimestamp(),
            updated_at: serverTimestamp(),
            reply_to_name: '',
            reply_to_text: '',
            reply_to_uid: '',
          },
          { merge: true },
        );
      });

      setMyVote(vote);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Vote failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const clean = message.trim();
    if (!circleRef || !clean || busy) return;
    setBusy(true);

    try {
      const user = await ensureUser();
      await registerParticipant();
      const db = getAppFirestore();
      const messageRef = doc(collection(db, 'ShoppingCircleMessages'));

      await runTransaction(db, async (transaction) => {
        transaction.set(messageRef, {
          circle_ref: circleRef,
          sender_ref: doc(db, 'users', user.uid),
          user_uid: user.uid,
          sender_name: user.displayName || 'SPOTC User',
          sender_photo: user.photoURL || '',
          message_type: 'text',
          message: clean,
          vote: '',
          voice_url: '',
          voice_duration: 0,
          is_guest: false,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          reply_to_name: replyTo?.sender_name ?? '',
          reply_to_text: replyTo?.message || (replyTo?.vote ? `${replyTo.vote}: ${replyTo.message}` : ''),
          reply_to_uid: replyTo?.user_uid ?? '',
        });
        transaction.update(circleRef, {
          comments_count: increment(1),
          updated_at: serverTimestamp(),
        });
      });

      setMessage('');
      setReplyTo(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Message failed.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage(item: CircleMessage) {
    if (!circleRef || item.user_uid !== auth?.currentUser?.uid) return;
    if (!window.confirm('Delete this message?')) return;

    const db = getAppFirestore();
    await runTransaction(db, async (transaction) => {
      transaction.delete(item.ref);

      if (item.vote) {
        transaction.update(circleRef, {
          [voteField(item.vote)]: increment(-1),
          updated_at: serverTimestamp(),
        });
      } else {
        transaction.update(circleRef, {
          comments_count: increment(-1),
          updated_at: serverTimestamp(),
        });
      }
    });

    if (item.vote) setMyVote('');
    setMenuMessage(null);
  }

  async function reportMessage(item: CircleMessage) {
    const user = await ensureUser();
    const db = getAppFirestore();

    await setDoc(doc(collection(db, 'ShoppingCircleReports')), {
      circle_ref: circleRef,
      message_ref: item.ref,
      reported_by_uid: user.uid,
      reported_by_ref: doc(db, 'users', user.uid),
      message_user_uid: item.user_uid,
      message_text: item.message,
      status: 'new',
      created_at: serverTimestamp(),
    });

    setMenuMessage(null);
    alert('Reported. SPOTC will review it.');
  }

  async function shareCircle() {
    const url = window.location.href;
    const text = comparisonMode
      ? 'Help me choose the best product in my SPOTC Shopping Circle.'
      : `Should I buy ${circle?.product_title || 'this product'}? Vote in my SPOTC Shopping Circle.`;

    const share =
      typeof navigator.share === 'function'
        ? navigator.share.bind(navigator)
        : null;

    if (share) {
      await share({
        title: 'SPOTC Shopping Circle',
        text,
        url,
      });
      return;
    }

    await navigator.clipboard.writeText(url);
    alert('Shopping Circle link copied.');
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    alert('Link copied.');
  }

  async function startRecording() {
    if (recording || busy) return;

    try {
      await ensureUser();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await uploadVoice(blob, recordSeconds);
      };

      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      recorder.start();
    } catch {
      alert('Microphone permission is required.');
    }
  }

  function stopRecording() {
    if (!recording) return;
    setRecording(false);
    mediaRecorderRef.current?.stop();
  }

  async function uploadVoice(blob: Blob, duration: number) {
    if (!circleRef || blob.size === 0) return;
    setBusy(true);

    try {
      const user = await ensureUser();
      await registerParticipant();
      const fileName = `shopping_circle/voice/${circleRef.id}_${Date.now()}.webm`;
      const response = await fetch(
        `https://spotc-ai-product-studio.tinydot09.workers.dev/upload-voice?fileName=${encodeURIComponent(fileName)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        },
      );

      if (!response.ok) throw new Error('Voice upload failed.');
      const result = (await response.json()) as { voice_url?: string; voiceUrl?: string };
      const voiceUrl = result.voice_url || result.voiceUrl;
      if (!voiceUrl) throw new Error('Voice URL missing.');

      const db = getAppFirestore();
      const messageRef = doc(collection(db, 'ShoppingCircleMessages'));

      await runTransaction(db, async (transaction) => {
        transaction.set(messageRef, {
          circle_ref: circleRef,
          sender_ref: doc(db, 'users', user.uid),
          user_uid: user.uid,
          sender_name: user.displayName || 'SPOTC User',
          sender_photo: user.photoURL || '',
          message_type: 'voice',
          message: '',
          vote: '',
          voice_url: voiceUrl,
          voice_duration: Math.max(1, duration),
          is_guest: false,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          reply_to_name: replyTo?.sender_name ?? '',
          reply_to_text: replyTo?.message ?? '',
          reply_to_uid: replyTo?.user_uid ?? '',
        });
        transaction.update(circleRef, {
          comments_count: increment(1),
          updated_at: serverTimestamp(),
        });
      });

      setReplyTo(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Voice message failed.');
    } finally {
      setBusy(false);
    }
  }

  async function playVoice(url: string) {
    if (!url) return;

    if (audioRef.current && playingUrl === url) {
      audioRef.current.pause();
      setPlayingUrl('');
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingUrl(url);
    audio.onended = () => setPlayingUrl('');
    await audio.play();
  }

  if (loading) {
    return (
      <main className="sc-state">
        <Loader2 className="spin" size={34} />
        <h1>Opening Shopping Circle</h1>
        <p>Loading live votes and messages…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (notFound || !circle || !circleRef) {
    return (
      <main className="sc-state">
        <ShoppingBag size={42} />
        <h1>Shopping Circle unavailable</h1>
        <p>This link may be invalid, closed or removed.</p>
        <button onClick={() => router.push('/shop')}>Continue shopping</button>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <button className="icon-button" onClick={() => router.back()} aria-label="Go back">
          <ArrowLeft size={21} />
        </button>

        <div className="brand-block">
          <span className="eyebrow">SPOTC</span>
          <strong>Shopping Circle</strong>
        </div>

        <div className="top-actions">
          <button className="icon-button" onClick={copyLink} aria-label="Copy link">
            <Copy size={19} />
          </button>
          <button className="share-button" onClick={shareCircle}>
            <Share2 size={18} />
            Share
          </button>
        </div>
      </header>

      <div className="sc-layout">
        <section className="sc-main">
          {comparisonMode ? (
            <section className="hero-card">
              <div className="hero-heading">
                <div>
                  <span className="eyebrow">COMPARE TOGETHER</span>
                  <h1>Which one should I buy?</h1>
                </div>
                <span className="live-badge"><span /> Live circle</span>
              </div>

              <div className="product-strip">
                {products.map((product, index) => {
                  const vote = `product_${index}`;
                  return (
                    <article className="compare-product" key={`${product.id || product.title}-${index}`}>
                      <div className="compare-image">
                        {product.image ? <img src={product.image} alt={product.title || 'Product'} /> : <ShoppingBag size={40} />}
                        <span className="choice-number">{index + 1}</span>
                      </div>
                      <div className="compare-copy">
                        <span>{product.business_name || product.shop_name || 'SPOTC Shop'}</span>
                        <h2>{product.title || 'Product'}</h2>
                        <div className="price-row">
                          <strong>{formatMoney(product.price)}</strong>
                          {n(product.old_price) > n(product.price) && <del>{formatMoney(product.old_price)}</del>}
                        </div>
                        <button
                          className={myVote === vote ? 'vote-choice selected' : 'vote-choice'}
                          onClick={() => submitVote(vote, `Voted for ${product.title || `Product ${index + 1}`}`)}
                          disabled={busy}
                        >
                          {myVote === vote ? <Check size={17} /> : <ThumbsUp size={17} />}
                          {myVote === vote ? 'My choice' : 'Vote for this'}
                          <span>{n(circle[`product_${index}_votes`])}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <button
                className={myVote === 'none' ? 'none-choice selected' : 'none-choice'}
                onClick={() => submitVote('none', 'None of these')}
                disabled={busy}
              >
                Not convinced by any option
                <strong>{n(circle.none_votes)}</strong>
              </button>
            </section>
          ) : (
            <section className="hero-card single-hero">
              <div className="single-media">
                {circle.product_image ? (
                  <img src={circle.product_image} alt={circle.product_title || 'Product'} />
                ) : (
                  <ShoppingBag size={58} />
                )}
                <span className="live-badge media-live"><span /> Live circle</span>
              </div>

              <div className="single-copy">
                <span className="eyebrow">{circle.business_name || 'SPOTC SHOP'}</span>
                <h1>{circle.product_title || 'Product'}</h1>
                <div className="price-row large">
                  <strong>{formatMoney(circle.product_price)}</strong>
                  {n(circle.product_old_price) > n(circle.product_price) && (
                    <del>{formatMoney(circle.product_old_price)}</del>
                  )}
                  {n(circle.product_discount) > 0 && <em>{n(circle.product_discount)}% OFF</em>}
                </div>

                <div className="question-card">
                  <MessageCircle size={19} />
                  <span>{circle.question || 'Should I buy this?'}</span>
                </div>

                <div className="vote-grid">
                  {singleProductVoteOptions.map(
                    ([vote, label, Icon, countKey]) => (
                      <button
                        key={vote}
                        className={
                          myVote === vote
                            ? 'vote-tile selected'
                            : 'vote-tile'
                        }
                        onClick={() => submitVote(vote, label)}
                        disabled={busy}
                      >
                        <Icon size={21} />
                        <span>{label}</span>
                        <strong>{n(circle[countKey])}</strong>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>
          )}

          <section className={`summary-card ${summary.tone}`}>
            <div className="summary-icon"><Sparkles size={23} /></div>
            <div>
              <span>{summary.title}</span>
              <h2>{summary.text}</h2>
            </div>
          </section>

          <section className="mobile-chat-wrap">
            <ChatPanel
              messages={messages}
              circle={circle}
              message={message}
              setMessage={setMessage}
              submitMessage={submitMessage}
              busy={busy}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              setMenuMessage={setMenuMessage}
              playVoice={playVoice}
              playingUrl={playingUrl}
              recording={recording}
              recordSeconds={recordSeconds}
              startRecording={startRecording}
              stopRecording={stopRecording}
              chatEndRef={chatEndRef}
            />
          </section>
        </section>

        <aside className="sc-side">
          <ChatPanel
            messages={messages}
            circle={circle}
            message={message}
            setMessage={setMessage}
            submitMessage={submitMessage}
            busy={busy}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            setMenuMessage={setMenuMessage}
            playVoice={playVoice}
            playingUrl={playingUrl}
            recording={recording}
            recordSeconds={recordSeconds}
            startRecording={startRecording}
            stopRecording={stopRecording}
            chatEndRef={chatEndRef}
          />
        </aside>
      </div>

      {menuMessage && (
        <div className="modal-backdrop" onClick={() => setMenuMessage(null)}>
          <div className="message-menu" onClick={(event) => event.stopPropagation()}>
            <div className="menu-head">
              <strong>Message actions</strong>
              <button onClick={() => setMenuMessage(null)}><X size={20} /></button>
            </div>
            <button onClick={() => { setReplyTo(menuMessage); setMenuMessage(null); }}>
              <Reply size={18} /> Reply
            </button>
            {menuMessage.user_uid === auth?.currentUser?.uid ? (
              <button className="danger" onClick={() => deleteMessage(menuMessage)}>
                <Trash2 size={18} /> Delete
              </button>
            ) : (
              <button className="danger" onClick={() => reportMessage(menuMessage)}>
                <MoreHorizontal size={18} /> Report
              </button>
            )}
          </div>
        </div>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

type ChatPanelProps = {
  messages: CircleMessage[];
  circle: CircleData;
  message: string;
  setMessage: (value: string) => void;
  submitMessage: (event: FormEvent) => void;
  busy: boolean;
  replyTo: CircleMessage | null;
  setReplyTo: (value: CircleMessage | null) => void;
  setMenuMessage: (value: CircleMessage | null) => void;
  playVoice: (url: string) => void;
  playingUrl: string;
  recording: boolean;
  recordSeconds: number;
  startRecording: () => void;
  stopRecording: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
};

function ChatPanel({
  messages,
  circle,
  message,
  setMessage,
  submitMessage,
  busy,
  replyTo,
  setReplyTo,
  setMenuMessage,
  playVoice,
  playingUrl,
  recording,
  recordSeconds,
  startRecording,
  stopRecording,
  chatEndRef,
}: ChatPanelProps) {
  return (
    <section className="chat-card">
      <div className="chat-head">
        <div>
          <span className="eyebrow">LIVE DISCUSSION</span>
          <h2>Shopping Chat</h2>
        </div>
        <div className="circle-stats">
          <span><Users size={15} /> {n(circle.participants)}</span>
          <span><MessageCircle size={15} /> {n(circle.comments_count)}</span>
        </div>
      </div>

      <div className="chat-body">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div><MessageCircle size={30} /></div>
            <h3>Start the conversation</h3>
            <p>Ask friends what they think about this purchase.</p>
          </div>
        ) : (
          messages.map((item) => {
            const mine = item.user_uid === auth?.currentUser?.uid;
            return (
              <article className={mine ? 'chat-message mine' : 'chat-message'} key={item.id}>
                {!mine && (
                  item.sender_photo ? (
                    <img className="avatar" src={item.sender_photo} alt="" />
                  ) : (
                    <div className="avatar fallback">{initials(item.sender_name)}</div>
                  )
                )}

                <button className="bubble" onClick={() => setMenuMessage(item)}>
                  {!mine && <strong>{item.sender_name}</strong>}
                  {(item.reply_to_name || item.reply_to_text) && (
                    <div className="reply-preview">
                      <b>{item.reply_to_name || 'Reply'}</b>
                      <span>{item.reply_to_text}</span>
                    </div>
                  )}

                  {item.message_type === 'voice' && item.voice_url ? (
                    <div className="voice-row" onClick={(event) => { event.stopPropagation(); playVoice(item.voice_url); }}>
                      {playingUrl === item.voice_url ? <Pause size={23} /> : <Play size={23} />}
                      <span className="voice-wave">▂▄▆█▆▄▂▄▆</span>
                      <em>{Math.floor(item.voice_duration / 60)}:{String(item.voice_duration % 60).padStart(2, '0')}</em>
                    </div>
                  ) : item.vote ? (
                    <div className="vote-message"><ThumbsUp size={16} /> {item.message}</div>
                  ) : (
                    <p>{item.message}</p>
                  )}

                  <time>{timeAgo(item.created_at)}</time>
                </button>
              </article>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="chat-compose" onSubmit={submitMessage}>
        {replyTo && (
          <div className="replying">
            <Reply size={16} />
            <div>
              <strong>Replying to {replyTo.sender_name}</strong>
              <span>{replyTo.message || 'Voice message'}</span>
            </div>
            <button type="button" onClick={() => setReplyTo(null)}><X size={17} /></button>
          </div>
        )}

        {recording && (
          <div className="recording-line">
            <span className="record-dot" />
            Recording {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            <button type="button" onClick={stopRecording}>Send voice</button>
          </div>
        )}

        <div className="compose-row">
          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault();

                if (
                  message.trim() &&
                  !busy &&
                  !recording
                ) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder="Message friends…"
            rows={1}
            disabled={busy || recording}
          />

          {!message.trim() ? (
            <button
              type="button"
              className={recording ? 'send-round recording' : 'send-round'}
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              aria-label="Record voice"
            >
              <Mic size={21} />
            </button>
          ) : (
            <button className="send-round" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

const styles = `
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f5f4ef; }
  :global(button), :global(textarea) { font: inherit; }
  :global(.spin) { animation: sc-spin .8s linear infinite; }
  @keyframes sc-spin { to { transform: rotate(360deg); } }

  .sc-shell {
    min-height: 100vh;
    color: #171814;
    background:
      radial-gradient(circle at 8% 0%, rgba(242,183,116,.17), transparent 26rem),
      radial-gradient(circle at 96% 20%, rgba(34,197,94,.10), transparent 30rem),
      #f5f4ef;
    padding: 28px;
  }

  .sc-topbar {
    max-width: 1460px;
    margin: 0 auto 22px;
    min-height: 68px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid rgba(20,20,15,.08);
    border-radius: 22px;
    background: rgba(255,255,255,.84);
    backdrop-filter: blur(18px);
    box-shadow: 0 16px 50px rgba(39,35,25,.08);
    position: sticky;
    top: 14px;
    z-index: 20;
  }

  .icon-button, .share-button, .menu-head button {
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    color: #20211d;
    background: #f0efe9;
  }

  .brand-block { display: grid; gap: 2px; flex: 1; }
  .brand-block strong { font-size: 18px; letter-spacing: -.02em; }
  .eyebrow { color: #6a6b62; font-size: 11px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; }
  .top-actions { display: flex; align-items: center; gap: 9px; }
  .share-button {
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    color: white;
    background: #171814;
    font-weight: 850;
  }

  .sc-layout {
    width: min(1460px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 430px;
    gap: 22px;
    align-items: start;
  }

  .sc-main { display: grid; gap: 18px; min-width: 0; }
  .hero-card, .summary-card, .chat-card {
    border: 1px solid rgba(20,20,15,.08);
    background: rgba(255,255,255,.92);
    box-shadow: 0 20px 60px rgba(40,36,25,.08);
  }

  .hero-card { border-radius: 30px; padding: 28px; overflow: hidden; }
  .hero-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
  .hero-heading h1, .single-copy h1 { margin: 7px 0 0; font-size: clamp(27px, 4vw, 48px); line-height: 1.02; letter-spacing: -.045em; }
  .live-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 12px; border-radius: 999px;
    color: #16783a; background: #e9f8ed; font-size: 12px; font-weight: 900;
  }
  .live-badge span, .record-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 5px rgba(34,197,94,.13); }

  .product-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(240px, 1fr);
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .compare-product {
    min-width: 0;
    border: 1px solid #e4e2da;
    border-radius: 22px;
    overflow: hidden;
    background: #fbfaf6;
  }

  .compare-image { height: 220px; display: grid; place-items: center; position: relative; background: #efeee8; overflow: hidden; }
  .compare-image img { width: 100%; height: 100%; object-fit: cover; }
  .choice-number { position: absolute; top: 12px; left: 12px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; color: white; background: rgba(15,16,14,.88); font-weight: 900; }
  .compare-copy { padding: 17px; }
  .compare-copy > span { color: #77786e; font-size: 12px; font-weight: 850; text-transform: uppercase; }
  .compare-copy h2 { min-height: 48px; margin: 6px 0 12px; font-size: 20px; line-height: 1.2; }
  .price-row { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .price-row strong { font-size: 24px; }
  .price-row del { color: #8a8a82; }
  .price-row em { color: #11813b; background: #e7f7eb; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-style: normal; font-weight: 900; }

  .vote-choice, .none-choice, .vote-tile {
    border: 0; cursor: pointer; font-weight: 900;
  }
  .vote-choice {
    width: 100%; margin-top: 15px; padding: 12px 13px;
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 9px;
    border-radius: 14px; color: #2a2b26; background: #ecebe5;
  }
  .vote-choice span { min-width: 28px; height: 28px; padding: 0 7px; display: grid; place-items: center; border-radius: 999px; background: white; }
  .vote-choice.selected, .none-choice.selected, .vote-tile.selected { color: white; background: #1c9b4a; }
  .none-choice { width: 100%; margin-top: 15px; padding: 14px 18px; display: flex; justify-content: space-between; border-radius: 15px; color: #53544d; background: #efeee8; }

  .single-hero { display: grid; grid-template-columns: minmax(330px, .92fr) minmax(0, 1.08fr); gap: 30px; }
  .single-media { min-height: 520px; position: relative; display: grid; place-items: center; overflow: hidden; border-radius: 24px; background: #ecebe5; }
  .single-media img { width: 100%; height: 100%; object-fit: cover; }
  .media-live { position: absolute; top: 16px; left: 16px; }
  .single-copy { align-self: center; padding: 8px 8px 8px 0; }
  .price-row.large { margin-top: 18px; }
  .price-row.large strong { font-size: 34px; }
  .question-card { margin: 24px 0 18px; padding: 15px; display: flex; gap: 10px; align-items: center; border-radius: 16px; background: #f2f0e9; font-weight: 850; }
  .vote-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
  .vote-tile { min-height: 62px; padding: 13px 14px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; text-align: left; border-radius: 16px; color: #242520; background: #ecebe5; }
  .vote-tile strong { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,.86); color: #20211d; }

  .summary-card { min-height: 126px; padding: 22px; display: flex; gap: 16px; align-items: flex-start; border-radius: 24px; }
  .summary-card.green { background: linear-gradient(135deg, #f5fff7, #e7f7eb); border-color: #ccebd5; }
  .summary-card.red { background: linear-gradient(135deg, #fff8f7, #fde9e6); border-color: #f1d0ca; }
  .summary-card.gold { background: linear-gradient(135deg, #fffdf7, #f7eddd); border-color: #ead9bf; }
  .summary-icon { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 16px; background: rgba(255,255,255,.8); }
  .summary-card span { color: #6a6b62; font-size: 11px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
  .summary-card h2 { max-width: 760px; margin: 7px 0 0; font-size: clamp(19px, 2vw, 26px); line-height: 1.25; letter-spacing: -.025em; }

  .sc-side { position: sticky; top: 104px; }
  .chat-card { height: calc(100vh - 126px); min-height: 610px; display: grid; grid-template-rows: auto 1fr auto; border-radius: 28px; overflow: hidden; }
  .chat-head { padding: 21px 21px 17px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eceae2; }
  .chat-head h2 { margin: 4px 0 0; font-size: 23px; letter-spacing: -.03em; }
  .circle-stats { display: flex; gap: 8px; }
  .circle-stats span { display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px; border-radius: 999px; background: #f0efe9; font-size: 12px; font-weight: 850; }

  .chat-body { min-height: 0; overflow-y: auto; padding: 18px; background: linear-gradient(180deg, #fbfaf6, #f4f2eb); }
  .empty-chat { height: 100%; min-height: 290px; display: grid; place-content: center; justify-items: center; text-align: center; color: #73746c; }
  .empty-chat div { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 22px; background: white; box-shadow: 0 10px 34px rgba(30,27,20,.08); }
  .empty-chat h3 { margin: 14px 0 5px; color: #272822; }
  .empty-chat p { margin: 0; }

  .chat-message { margin-bottom: 13px; display: flex; align-items: flex-end; gap: 8px; }
  .chat-message.mine { justify-content: flex-end; }
  .avatar { width: 30px; height: 30px; flex: 0 0 auto; object-fit: cover; border-radius: 50%; }
  .avatar.fallback { display: grid; place-items: center; color: #201f1b; background: #f2b774; font-size: 11px; font-weight: 900; }
  .bubble { max-width: 82%; padding: 11px 12px 9px; border: 0; cursor: pointer; text-align: left; border-radius: 17px 17px 17px 5px; color: #282923; background: white; box-shadow: 0 8px 24px rgba(35,32,24,.06); }
  .mine .bubble { color: white; background: #1e7d48; border-radius: 17px 17px 5px 17px; }
  .bubble > strong { display: block; margin-bottom: 4px; color: #a36122; font-size: 11px; }
  .mine .bubble > strong { color: #c9f6d8; }
  .bubble p { margin: 0; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bubble time { display: block; margin-top: 5px; color: inherit; opacity: .55; font-size: 10px; text-align: right; }
  .reply-preview { margin-bottom: 7px; padding: 8px; display: grid; gap: 2px; border-left: 3px solid #f2b774; border-radius: 8px; background: rgba(0,0,0,.06); }
  .reply-preview b { font-size: 10px; }
  .reply-preview span { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; opacity: .75; }
  .vote-message, .voice-row { display: flex; align-items: center; gap: 8px; font-weight: 850; }
  .voice-row em { font-size: 11px; font-style: normal; opacity: .7; }
  .voice-wave { letter-spacing: -2px; opacity: .65; }

  .chat-compose { padding: 12px; border-top: 1px solid #eceae2; background: white; }
  .replying, .recording-line { margin-bottom: 8px; padding: 9px 10px; border-radius: 13px; background: #f2f0e9; }
  .replying { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; }
  .replying div { min-width: 0; display: grid; }
  .replying strong { font-size: 11px; }
  .replying span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #72736b; font-size: 11px; }
  .replying button { border: 0; background: transparent; cursor: pointer; }
  .recording-line { display: flex; align-items: center; gap: 9px; color: #b02323; font-weight: 850; font-size: 12px; }
  .recording-line .record-dot { background: #e53838; box-shadow: 0 0 0 5px rgba(229,56,56,.13); animation: pulse 1s infinite alternate; }
  @keyframes pulse { to { opacity: .35; } }
  .recording-line button { margin-left: auto; border: 0; border-radius: 999px; padding: 7px 10px; color: white; background: #b02323; cursor: pointer; font-weight: 850; }

  .compose-row { display: grid; grid-template-columns: 1fr auto; gap: 9px; align-items: end; }
  .compose-row textarea { width: 100%; min-height: 48px; max-height: 120px; resize: none; border: 1px solid #e4e2da; outline: none; padding: 13px 15px; border-radius: 17px; color: #242520; background: #f7f6f2; }
  .compose-row textarea:focus { border-color: #9a9a8d; background: white; }
  .send-round { width: 48px; height: 48px; border: 0; border-radius: 16px; display: grid; place-items: center; cursor: pointer; color: white; background: #171814; }
  .send-round.recording { background: #bd2b2b; }

  .mobile-chat-wrap { display: none; }
  .modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 20px; background: rgba(14,15,12,.46); backdrop-filter: blur(6px); }
  .message-menu { width: min(430px, 100%); padding: 12px; border-radius: 22px; background: white; box-shadow: 0 22px 70px rgba(0,0,0,.22); }
  .menu-head { padding: 7px 7px 12px; display: flex; justify-content: space-between; align-items: center; }
  .menu-head button { width: 36px; height: 36px; border-radius: 12px; background: #f0efe9; }
  .message-menu > button { width: 100%; border: 0; padding: 14px; display: flex; align-items: center; gap: 10px; border-radius: 14px; cursor: pointer; color: #242520; background: transparent; font-weight: 850; }
  .message-menu > button:hover { background: #f4f3ee; }
  .message-menu > button.danger { color: #bc2828; }

  .sc-state { min-height: 72vh; display: grid; place-content: center; justify-items: center; text-align: center; padding: 30px; color: #22231e; background: #f5f4ef; }
  .sc-state h1 { margin: 16px 0 7px; }
  .sc-state p { margin: 0 0 18px; color: #73746c; }
  .sc-state button { border: 0; border-radius: 14px; padding: 13px 18px; color: white; background: #171814; cursor: pointer; font-weight: 850; }

  @media (max-width: 1050px) {
    .sc-layout { grid-template-columns: 1fr; }
    .sc-side { display: none; }
    .mobile-chat-wrap { display: block; }
    .mobile-chat-wrap .chat-card { height: 720px; min-height: 620px; }
  }

  @media (max-width: 760px) {
    .sc-shell { padding: 10px; }
    .sc-topbar { top: 7px; margin-bottom: 10px; min-height: 60px; border-radius: 18px; }
    .brand-block strong { font-size: 15px; }
    .share-button { width: 44px; padding: 0; }
    .share-button :global(svg) { margin: 0; }
    .share-button { font-size: 0; }
    .hero-card { padding: 16px; border-radius: 22px; }
    .hero-heading h1, .single-copy h1 { font-size: 31px; }
    .live-badge { padding: 8px 10px; }
    .product-strip { grid-auto-columns: 82%; }
    .single-hero { grid-template-columns: 1fr; gap: 19px; }
    .single-media { min-height: 390px; }
    .single-copy { padding: 0; }
    .vote-grid { grid-template-columns: 1fr; }
    .summary-card { border-radius: 20px; }
    .mobile-chat-wrap .chat-card { height: 76vh; min-height: 600px; border-radius: 22px; }
    .chat-head { padding: 17px; }
    .circle-stats span { padding: 7px 8px; }
    .bubble { max-width: 88%; }
  }
`;