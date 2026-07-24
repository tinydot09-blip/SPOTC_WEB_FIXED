"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Heart,
  Loader2,
  MessageCircle,
  MessageSquareText,
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
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';
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
type CircleTab =
  | 'discussion'
  | 'details'
  | 'participants';

type CircleParticipant = {
  id: string;
  user_uid: string;
  name: string;
  photo: string;
  joined_at?: Timestamp;
  last_seen_at?: Timestamp;
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
  const [activeTab, setActiveTab] =
  useState<CircleTab>('discussion');

const [participants, setParticipants] =
  useState<CircleParticipant[]>([]);

const [participantsLoading, setParticipantsLoading] =
  useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mobileChatRef = useRef<HTMLElement | null>(null);

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
  if (!circleRef) {
    setParticipants([]);
    return;
  }

  const db = getAppFirestore();

  setParticipantsLoading(true);

  const participantsQuery = query(
    collection(db, 'ShoppingCircleParticipants'),
    where('circle_ref', '==', circleRef),
  );

  const unsubscribe = onSnapshot(
    participantsQuery,
    (snapshot) => {
      const nextParticipants =
        snapshot.docs
          .map((participantDocument) => {
            const data = participantDocument.data();

            return {
              id: participantDocument.id,
              user_uid: String(data.user_uid ?? ''),
              name: String(
                data.name ??
                  data.user_name ??
                  'SPOTC User',
              ),
              photo: String(
                data.photo ??
                  data.user_photo ??
                  '',
              ),
              joined_at:
                data.joined_at instanceof Timestamp
                  ? data.joined_at
                  : undefined,
              last_seen_at:
                data.last_seen_at instanceof Timestamp
                  ? data.last_seen_at
                  : undefined,
            } satisfies CircleParticipant;
          })
          .sort((a, b) => {
            const aTime =
              a.joined_at?.toMillis() ?? 0;

            const bTime =
              b.joined_at?.toMillis() ?? 0;

            return aTime - bTime;
          });

      setParticipants(nextParticipants);
      setParticipantsLoading(false);
    },
    (error) => {
      console.error(
        'Shopping Circle participants listener failed:',
        error,
      );

      setParticipants([]);
      setParticipantsLoading(false);
    },
  );

  return unsubscribe;
}, [circleRef]);
  useEffect(() => {
    if (!firebaseReady || !auth || !circleRef) {
      return;
    }

    const activeAuth: Auth = auth;
    let cancelled = false;

    const joinSignedInUser = async (
      user: User | null,
    ) => {
      if (
        cancelled ||
        !user ||
        user.isAnonymous
      ) {
        return;
      }

      try {
        const db = getAppFirestore();
        const participantRef = doc(
          db,
          'ShoppingCircleParticipants',
          `${circleRef.id}_${user.uid}`,
        );

        await runTransaction(db, async (transaction) => {
          const participantSnapshot =
            await transaction.get(participantRef);

          if (participantSnapshot.exists()) {
            transaction.set(
              participantRef,
              {
                last_seen_at: serverTimestamp(),
                updated_at: serverTimestamp(),
              },
              { merge: true },
            );
            return;
          }

          transaction.set(participantRef, {
            circle_ref: circleRef,
            circle_id: circleRef.id,
            share_code: shareCode.trim(),
            user_uid: user.uid,
            user_ref: doc(db, 'users', user.uid),
            name: user.displayName || 'SPOTC User',
            photo: user.photoURL || '',
            joined_at: serverTimestamp(),
            last_seen_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });

          transaction.update(circleRef, {
            participants: increment(1),
            updated_at: serverTimestamp(),
          });
        });
      } catch (error) {
        console.error(
          'Automatic Shopping Circle participant registration failed:',
          error,
        );
      }
    };

    void joinSignedInUser(activeAuth.currentUser);

    const unsubscribe = onAuthStateChanged(
      activeAuth,
      (user) => {
        void joinSignedInUser(user);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [circleRef, shareCode]);

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
    const currentUser = auth?.currentUser ?? null;

    if (currentUser && !currentUser.isAnonymous) {
      return currentUser;
    }

    const returnPath = `/circle/${encodeURIComponent(shareCode)}`;

    try {
      sessionStorage.setItem('spotc-auth-return-path', returnPath);
      localStorage.setItem('spotc-auth-return-path', returnPath);
    } catch {
      // Storage can be unavailable in private browsing. Login can still continue.
    }

    const user = await requireGoogleLogin();

    if (!user || user.isAnonymous) {
      throw new Error('Please sign in to continue.');
    }

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
        circle_id: circleRef.id,
        share_code: shareCode.trim(),
        user_uid: user.uid,
        user_ref: doc(db, 'users', user.uid),
        name: user.displayName || 'SPOTC User',
        photo: user.photoURL || '',
        joined_at: serverTimestamp(),
        last_seen_at: serverTimestamp(),
        updated_at: serverTimestamp(),
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

  function openChat() {
    mobileChatRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    window.setTimeout(() => {
      const input = mobileChatRef.current?.querySelector(
        'textarea',
      ) as HTMLTextAreaElement | null;

      input?.focus();
    }, 550);
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

  const totalVotes = comparisonMode
    ? products.reduce(
        (sum, _product, index) =>
          sum + n(circle[`product_${index}_votes`]),
        n(circle.none_votes),
      )
    : n(circle.vote_buy_it) +
      n(circle.vote_looks_good) +
      n(circle.vote_not_sure) +
      n(circle.vote_dont_buy) +
      n(circle.none_votes);

  const recentMessages = messages.filter(
    (item) => item.message_type !== 'vote',
  );

  return (
    <main className="sc-shell">
      <header className="sc-topbar">
        <button
          className="icon-button back"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ArrowLeft size={23} />
        </button>

        <div className="brand-block">
          <strong>Shopping Circle</strong>
          <button type="button" className="share-code" onClick={copyLink}>
            Share code: {shareCode.slice(0, 14)}
            <Copy size={14} />
          </button>
        </div>

        <div className="top-actions">
          <span className="member-pill">
            <Users size={18} />
            {n(circle.participants)}
          </span>
          <button
            className="icon-button"
            onClick={shareCircle}
            aria-label="Share Shopping Circle"
          >
            <Share2 size={19} />
          </button>
        </div>
      </header>

      <div className="sc-layout">
        <section className="sc-main">
          {comparisonMode ? (
            <section className="product-card comparison-card">
              <div className="section-kicker">COMPARE TOGETHER</div>
              <h1>Which one should I buy?</h1>

              <div className="product-strip">
                {products.map((product, index) => {
                  const vote = `product_${index}`;

                  return (
                    <article
                      className="compare-product"
                      key={`${product.id || product.title}-${index}`}
                    >
                      <div className="compare-image">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.title || 'Product'}
                          />
                        ) : (
                          <ShoppingBag size={42} />
                        )}
                        <span className="choice-number">{index + 1}</span>
                      </div>

                      <div className="compare-copy">
                        <span>
                          {product.business_name ||
                            product.shop_name ||
                            'SPOTC Shop'}
                        </span>
                        <h2>{product.title || 'Product'}</h2>
                        <div className="price-row">
                          <strong>{formatMoney(product.price)}</strong>
                          {n(product.old_price) > n(product.price) && (
                            <del>{formatMoney(product.old_price)}</del>
                          )}
                        </div>

                        <button
                          className={
                            myVote === vote
                              ? 'compare-vote selected'
                              : 'compare-vote'
                          }
                          onClick={() =>
                            submitVote(
                              vote,
                              `Voted for ${
                                product.title || `Product ${index + 1}`
                              }`,
                            )
                          }
                          disabled={busy}
                        >
                          {myVote === vote ? (
                            <Check size={17} />
                          ) : (
                            <ThumbsUp size={17} />
                          )}
                          <span>
                            {myVote === vote ? 'My choice' : 'Vote for this'}
                          </span>
                          <b>{n(circle[`product_${index}_votes`])}</b>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <button
                className={
                  myVote === 'none'
                    ? 'none-choice selected'
                    : 'none-choice'
                }
                onClick={() => submitVote('none', 'None of these')}
                disabled={busy}
              >
                <X size={18} />
                None of these
                <strong>{n(circle.none_votes)}</strong>
              </button>
            </section>
          ) : (
            <section className="product-card">
              <div className="product-summary">
                <div className="product-image">
                  {circle.product_image ? (
                    <img
                      src={circle.product_image}
                      alt={circle.product_title || 'Product'}
                    />
                  ) : (
                    <ShoppingBag size={52} />
                  )}
                </div>

                <div className="product-info">
                  <h1>{circle.product_title || 'Product'}</h1>

                  <div className="price-row large">
                    <strong>{formatMoney(circle.product_price)}</strong>
                    {n(circle.product_old_price) >
                      n(circle.product_price) && (
                      <del>{formatMoney(circle.product_old_price)}</del>
                    )}
                    {n(circle.product_discount) > 0 && (
                      <em>{n(circle.product_discount)}% OFF</em>
                    )}
                  </div>

                  <div className="store-row">
                    <span>
                      {circle.business_name || 'SPOTC Official Store'}
                    </span>
                    <span className="verified">
                      <Check size={11} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="circle-meta">
                <span>
                  <i />
                  Active
                </span>
                <span>Created recently</span>
                <span className="votes-open">
                  <MessageCircle size={15} />
                  Open for votes
                </span>
              </div>
            </section>
          )}

          {!comparisonMode && (
            <section className="vote-card">
              <div className="vote-heading">
                <div>
                  <h2>What&apos;s the verdict?</h2>
                  <p>Tap to vote</p>
                </div>
                {busy && <Loader2 className="spin" size={20} />}
              </div>

              <div className="vote-grid">
                {singleProductVoteOptions.map(
                  ([vote, label, Icon, countKey]) => (
                    <button
                      key={vote}
                      className={
                        myVote === vote
                          ? `vote-tile ${vote} selected`
                          : `vote-tile ${vote}`
                      }
                      onClick={() => submitVote(vote, label)}
                      disabled={busy}
                    >
                      <Icon size={25} />
                      <span>{label}</span>
                      <strong>{n(circle[countKey])}</strong>
                    </button>
                  ),
                )}

                <button
                  className={
                    myVote === 'none'
                      ? 'vote-tile none selected'
                      : 'vote-tile none'
                  }
                  onClick={() => submitVote('none', 'No opinion')}
                  disabled={busy}
                >
                  <X size={25} />
                  <span>None</span>
                  <strong>{n(circle.none_votes)}</strong>
                </button>
              </div>

              <div className="vote-total">
                <div>
                  <span>Total votes</span>
                  <strong>{totalVotes}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>Voting live</strong>
                </div>
              </div>
            </section>
          )}

          <section className={`summary-card ${summary.tone}`}>
            <div className="summary-icon">
              <Sparkles size={21} />
            </div>
            <div>
              <span>{summary.title}</span>
              <h2>{summary.text}</h2>
            </div>
          </section>

          <section className="discussion-card">
  <nav
    className="circle-tabs"
    aria-label="Shopping Circle sections"
  >
    <button
      type="button"
      className={
        activeTab === 'discussion'
          ? 'active'
          : ''
      }
      onClick={() =>
        setActiveTab('discussion')
      }
    >
      Discussion
    </button>

    <button
      type="button"
      className={
        activeTab === 'details'
          ? 'active'
          : ''
      }
      onClick={() =>
        setActiveTab('details')
      }
    >
      Details
    </button>

    <button
      type="button"
      className={
        activeTab === 'participants'
          ? 'active'
          : ''
      }
      onClick={() =>
        setActiveTab('participants')
      }
    >
      Participants
    </button>
  </nav>

  {activeTab === 'discussion' && (
    <>
      <button
        type="button"
        className="chat-entry"
        onClick={openChat}
      >
        <span className="chat-entry-icon">
          <MessageSquareText size={22} />
        </span>

        <span className="chat-entry-copy">
          <strong>
            Friends &amp; Family Chat
          </strong>

          <small>
            Chat with your group about this product
          </small>
        </span>

        <span className="chat-entry-count">
          {n(circle.participants)}
        </span>

        <ArrowLeft
          className="entry-arrow"
          size={19}
        />
      </button>

      <div className="recent-head">
        <h3>Recent messages</h3>

        <button
          type="button"
          onClick={openChat}
        >
          View all
        </button>
      </div>

      {recentMessages.length > 0 ? (
        <div className="recent-list">
          {recentMessages
            .slice(-5)
            .reverse()
            .map((item) => (
              <button
                type="button"
                className="recent-item"
                key={`recent-${item.id}`}
                onClick={openChat}
              >
                {item.sender_photo ? (
                  <img
                    src={item.sender_photo}
                    alt=""
                  />
                ) : (
                  <span className="recent-avatar">
                    {initials(
                      item.sender_name,
                    )}
                  </span>
                )}

                <span className="recent-copy">
                  <strong>
                    {item.sender_name}
                  </strong>

                  <small>
                    {item.message_type ===
                    'voice'
                      ? 'Voice message'
                      : item.message}
                  </small>
                </span>

                <time>
                  {timeAgo(
                    item.created_at,
                  )}
                </time>
              </button>
            ))}
        </div>
      ) : (
        <button
          type="button"
          className="empty-recent"
          onClick={openChat}
        >
          <MessageCircle size={22} />

          <span>
            <strong>
              Start the discussion
            </strong>

            <small>
              Be the first to share an opinion.
            </small>
          </span>
        </button>
      )}
    </>
  )}

  {activeTab === 'details' && (
    <div className="circle-tab-panel">
      <div className="circle-detail-row">
        <span>Circle status</span>
        <strong>
          {String(
            circle.status || 'active',
          )}
        </strong>
      </div>

      <div className="circle-detail-row">
        <span>Share code</span>
        <strong>
          {circle.share_code ||
            shareCode}
        </strong>
      </div>

      <div className="circle-detail-row">
        <span>Total votes</span>
        <strong>{totalVotes}</strong>
      </div>

      <div className="circle-detail-row">
        <span>Messages</span>
        <strong>
          {n(circle.comments_count)}
        </strong>
      </div>

      <div className="circle-detail-row">
        <span>Participants</span>
        <strong>
          {Math.max(
            n(circle.participants),
            participants.length,
          )}
        </strong>
      </div>

      <div className="circle-question-box">
        <span>Question</span>

        <strong>
          {circle.question ||
            'Which one should I buy?'}
        </strong>
      </div>
    </div>
  )}

  {activeTab === 'participants' && (
    <div className="circle-tab-panel">
      <div className="participants-heading">
        <div>
          <strong>
            Circle participants
          </strong>

          <span>
            {Math.max(
              n(circle.participants),
              participants.length,
            )}{' '}
            people joined
          </span>
        </div>

        <Users size={21} />
      </div>

      {participantsLoading ? (
        <div className="participants-state">
          <Loader2
            className="spin"
            size={23}
          />

          Loading participants…
        </div>
      ) : participants.length > 0 ? (
        <div className="participants-list">
          {participants.map(
            (participant) => (
              <div
                className="participant-row"
                key={participant.id}
              >
                {participant.photo ? (
                  <img
                    src={
                      participant.photo
                    }
                    alt=""
                  />
                ) : (
                  <span className="participant-avatar">
                    {initials(
                      participant.name,
                    )}
                  </span>
                )}

                <span className="participant-copy">
                  <strong>
                    {participant.name}
                  </strong>

                  <small>
                    Joined{' '}
                    {timeAgo(
                      participant.joined_at,
                    )}
                  </small>
                </span>

                <span className="participant-status">
                  Active
                </span>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="participants-state">
          <Users size={25} />

          No registered participants yet.
        </div>
      )}
    </div>
  )}
</section>

          <section className="mobile-chat-wrap" ref={mobileChatRef}>
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

      <button
        type="button"
        className="floating-chat-button"
        onClick={openChat}
        aria-label="Open Shopping Circle chat"
      >
        <span className="floating-chat-icon">
          <MessageSquareText size={21} />
          {messages.length > 0 && (
            <b>{Math.min(messages.length, 99)}</b>
          )}
        </span>
        <span>
          <strong>Shopping Chat</strong>
          <small>
            {messages.length > 0
              ? `${messages.length} message${
                  messages.length === 1 ? '' : 's'
                }`
              : 'Start discussion'}
          </small>
        </span>
      </button>

      {menuMessage && (
        <div
          className="modal-backdrop"
          onClick={() => setMenuMessage(null)}
        >
          <div
            className="message-menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="menu-head">
              <strong>Message actions</strong>
              <button onClick={() => setMenuMessage(null)}>
                <X size={20} />
              </button>
            </div>

            <button
              onClick={() => {
                setReplyTo(menuMessage);
                setMenuMessage(null);
                openChat();
              }}
            >
              <Reply size={18} />
              Reply
            </button>

            {menuMessage.user_uid === auth?.currentUser?.uid ? (
              <button
                className="danger"
                onClick={() => deleteMessage(menuMessage)}
              >
                <Trash2 size={18} />
                Delete
              </button>
            ) : (
              <button
                className="danger"
                onClick={() => reportMessage(menuMessage)}
              >
                <MoreHorizontal size={18} />
                Report
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
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    background: #f7f7fb;
  }

  :global(body) {
    margin: 0;
    background: #f7f7fb;
  }

  :global(button),
  :global(textarea) {
    font: inherit;
  }

  :global(.spin) {
    animation: sc-spin .8s linear infinite;
  }

  @keyframes sc-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sc-shell {
    min-height: 100vh;
    padding: 22px;
    color: #151523;
    background:
      radial-gradient(circle at 5% 0%, rgba(124, 58, 237, .08), transparent 26rem),
      radial-gradient(circle at 95% 20%, rgba(236, 72, 153, .06), transparent 28rem),
      #f7f7fb;
  }

  .sc-topbar {
    width: min(1180px, 100%);
    min-height: 72px;
    margin: 0 auto 18px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 10px;
    z-index: 30;
    border: 1px solid #ececf3;
    border-radius: 22px;
    background: rgba(255, 255, 255, .92);
    box-shadow: 0 14px 40px rgba(37, 25, 71, .08);
    backdrop-filter: blur(18px);
  }

  .icon-button,
  .member-pill,
  .share-code {
    border: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border-radius: 15px;
    color: #242333;
    background: #f4f3f8;
    cursor: pointer;
  }

  .brand-block {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }

  .brand-block strong {
    font-size: 19px;
    letter-spacing: -.025em;
  }

  .share-code {
    width: max-content;
    max-width: 100%;
    padding: 0;
    gap: 6px;
    overflow: hidden;
    color: #6f6c7f;
    background: transparent;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .member-pill {
    min-height: 42px;
    padding: 0 14px;
    gap: 7px;
    border: 1px solid #e8e6f0;
    border-radius: 999px;
    color: #262334;
    background: #fff;
    font-weight: 800;
  }

  .sc-layout {
    width: min(1180px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 430px;
    gap: 20px;
    align-items: start;
  }

  .sc-main {
    min-width: 0;
    display: grid;
    gap: 14px;
  }

  .product-card,
  .vote-card,
  .discussion-card,
  .summary-card,
  .chat-card {
    border: 1px solid #ececf3;
    background: rgba(255, 255, 255, .96);
    box-shadow: 0 16px 50px rgba(38, 28, 68, .07);
  }

  .product-card {
    overflow: hidden;
    border-radius: 24px;
  }

  .product-summary {
    padding: 18px;
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 18px;
    align-items: center;
  }

  .product-image {
    width: 150px;
    aspect-ratio: 1 / 1;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 18px;
    background: linear-gradient(135deg, #fde7ed, #f7dce8);
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .product-info {
    min-width: 0;
  }

  .product-info h1 {
    margin: 0;
    font-size: clamp(22px, 3vw, 34px);
    line-height: 1.12;
    letter-spacing: -.035em;
  }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .price-row.large {
    margin-top: 14px;
  }

  .price-row strong {
    color: #d71936;
    font-size: 30px;
    letter-spacing: -.03em;
  }

  .price-row del {
    color: #8c8998;
    font-size: 16px;
  }

  .price-row em {
    padding: 6px 10px;
    border-radius: 999px;
    color: #ce2340;
    background: #fff0f3;
    font-size: 12px;
    font-style: normal;
    font-weight: 900;
  }

  .store-row {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #454251;
    font-size: 14px;
  }

  .verified {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    background: #7c3aed;
  }

  .circle-meta {
    min-height: 50px;
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 9px;
    border-top: 1px solid #efedf4;
    color: #666273;
    font-size: 12px;
  }

  .circle-meta span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .circle-meta i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #18b66a;
    box-shadow: 0 0 0 5px rgba(24, 182, 106, .11);
  }

  .circle-meta .votes-open {
    margin-left: auto;
  }

  .vote-card {
    padding: 20px;
    border-radius: 24px;
  }

  .vote-heading {
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .vote-heading h2 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -.025em;
  }

  .vote-heading p {
    margin: 4px 0 0;
    color: #777386;
    font-size: 13px;
  }

  .vote-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .vote-tile {
    min-height: 122px;
    padding: 14px 9px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 9px;
    border: 1px solid #e8e5ed;
    border-radius: 18px;
    color: #24212e;
    background: #fff;
    cursor: pointer;
    transition:
      transform .18s ease,
      box-shadow .18s ease,
      border-color .18s ease;
  }

  .vote-tile:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 25px rgba(35, 27, 55, .08);
  }

  .vote-tile span {
    font-size: 12px;
    font-weight: 800;
    text-align: center;
  }

  .vote-tile strong {
    font-size: 18px;
  }

  .vote-tile.buy_it {
    color: #e52d4f;
    background: #fff8fa;
    border-color: #ffc9d3;
  }

  .vote-tile.looks_good {
    color: #0b9e57;
    background: #f4fff9;
    border-color: #bdebd2;
  }

  .vote-tile.not_sure {
    color: #d78a00;
    background: #fffaf0;
    border-color: #f5d79b;
  }

  .vote-tile.dont_buy {
    color: #e8781b;
    background: #fff9f4;
    border-color: #ffd1aa;
  }

  .vote-tile.none {
    color: #6f43d6;
    background: #faf7ff;
    border-color: #d9c6ff;
  }

  .vote-tile.selected {
    color: #fff;
    border-color: #7c3aed;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    box-shadow: 0 14px 28px rgba(109, 40, 217, .22);
  }

  .vote-total {
    margin-top: 14px;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    gap: 20px;
    border-radius: 16px;
    background: #f8f7fb;
  }

  .vote-total div {
    display: grid;
    gap: 3px;
  }

  .vote-total div:last-child {
    text-align: right;
  }

  .vote-total span {
    color: #777386;
    font-size: 12px;
  }

  .vote-total strong {
    font-size: 18px;
  }

  .summary-card {
    min-height: 112px;
    padding: 18px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    border-radius: 22px;
  }

  .summary-card.green {
    border-color: #c7efd9;
    background: linear-gradient(135deg, #f7fff9, #eafaf1);
  }

  .summary-card.red {
    border-color: #f4d0d5;
    background: linear-gradient(135deg, #fff9fa, #ffedf0);
  }

  .summary-card.gold {
    border-color: #eadbb9;
    background: linear-gradient(135deg, #fffdf7, #fbf2df);
  }

  .summary-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #7c3aed;
    background: rgba(255, 255, 255, .85);
  }

  .summary-card span {
    color: #777386;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .14em;
    text-transform: uppercase;
  }

  .summary-card h2 {
    margin: 6px 0 0;
    font-size: 18px;
    line-height: 1.35;
  }

  .discussion-card {
    padding: 0 18px 18px;
    border-radius: 24px;
  }

  .circle-tabs {
    height: 58px;
    margin: 0 -18px 16px;
    padding: 0 18px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-bottom: 1px solid #eceaf1;
  }

  .circle-tabs button {
    position: relative;
    border: 0;
    color: #5f5b6c;
    background: transparent;
    cursor: pointer;
    font-weight: 750;
  }

  .circle-tabs button.active {
    color: #7c3aed;
  }

  .circle-tabs button.active::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 3px;
    border-radius: 999px 999px 0 0;
    background: #7c3aed;
  }

  .chat-entry {
    width: 100%;
    min-height: 82px;
    padding: 13px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    border: 1px solid #dbc7ff;
    border-radius: 18px;
    color: #2e2344;
    background: linear-gradient(135deg, #fbf8ff, #f4ecff);
    cursor: pointer;
    text-align: left;
  }

  .chat-entry-icon {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #7c3aed;
    background: #ede3ff;
  }

  .chat-entry-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .chat-entry-copy strong {
    color: #7138dd;
    font-size: 16px;
  }

  .chat-entry-copy small {
    overflow: hidden;
    color: #676174;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-entry-count {
    min-width: 34px;
    height: 28px;
    padding: 0 8px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #7040ce;
    background: rgba(255, 255, 255, .82);
    font-size: 12px;
    font-weight: 900;
  }

  .entry-arrow {
    color: #9b78d8;
    transform: rotate(180deg);
  }

  .recent-head {
    margin: 20px 2px 9px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .recent-head h3 {
    margin: 0;
    color: #5b5767;
    font-size: 15px;
  }

  .recent-head button {
    border: 0;
    color: #7c3aed;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
  }

  .recent-list {
    display: grid;
  }

  .recent-item {
    width: 100%;
    min-width: 0;
    padding: 10px 2px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 11px;
    align-items: center;
    border: 0;
    border-bottom: 1px solid #f0eef4;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .recent-item:last-child {
    border-bottom: 0;
  }

  .recent-item img,
  .recent-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
  }

  .recent-item img {
    object-fit: cover;
  }

  .recent-avatar {
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #8b5cf6, #5b21b6);
    font-size: 12px;
    font-weight: 900;
  }

  .recent-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .recent-copy strong {
    font-size: 13px;
  }

  .recent-copy small {
    overflow: hidden;
    color: #686474;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-item time {
    color: #9995a4;
    font-size: 10px;
  }

  .empty-recent {
    width: 100%;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px dashed #d9d5e1;
    border-radius: 16px;
    color: #6e6878;
    background: #faf9fc;
    cursor: pointer;
    text-align: left;
  }

  .empty-recent span {
    display: grid;
    gap: 3px;
  }

  .empty-recent strong {
    color: #36313f;
  }

  .empty-recent small {
    color: #7b7584;
  }

  .comparison-card {
    padding: 22px;
  }

  .section-kicker {
    color: #7c3aed;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .14em;
  }

  .comparison-card > h1 {
    margin: 6px 0 18px;
    font-size: 30px;
    letter-spacing: -.035em;
  }

  .product-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(235px, 1fr);
    gap: 13px;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .compare-product {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #e9e6ef;
    border-radius: 18px;
    background: #fff;
  }

  .compare-image {
    height: 185px;
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #f0eef4;
  }

  .compare-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .choice-number {
    position: absolute;
    top: 10px;
    left: 10px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(25, 23, 33, .9);
    font-weight: 900;
  }

  .compare-copy {
    padding: 14px;
  }

  .compare-copy > span {
    color: #817c8b;
    font-size: 10px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .compare-copy h2 {
    min-height: 42px;
    margin: 5px 0 10px;
    font-size: 17px;
    line-height: 1.25;
  }

  .compare-copy .price-row strong {
    color: #d71936;
    font-size: 21px;
  }

  .compare-vote,
  .none-choice {
    border: 0;
    cursor: pointer;
    font-weight: 850;
  }

  .compare-vote {
    width: 100%;
    min-height: 42px;
    margin-top: 13px;
    padding: 0 11px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    border-radius: 13px;
    color: #4b4655;
    background: #f0eef4;
  }

  .compare-vote.selected,
  .none-choice.selected {
    color: #fff;
    background: #7c3aed;
  }

  .none-choice {
    width: 100%;
    min-height: 46px;
    margin-top: 13px;
    padding: 0 14px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    border-radius: 14px;
    color: #5b5665;
    background: #f3f1f6;
  }

  .sc-side {
    position: sticky;
    top: 104px;
  }

  .chat-card {
    height: calc(100vh - 126px);
    min-height: 610px;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
    border-radius: 26px;
  }

  .chat-head {
    padding: 19px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #eeecf2;
  }

  .chat-head .eyebrow {
    color: #7c3aed;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .13em;
  }

  .chat-head h2 {
    margin: 4px 0 0;
    font-size: 22px;
    letter-spacing: -.03em;
  }

  .circle-stats {
    display: flex;
    gap: 6px;
  }

  .circle-stats span {
    min-height: 32px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    color: #615b6d;
    background: #f4f2f7;
    font-size: 11px;
    font-weight: 850;
  }

  .chat-card::before {
    content: "You’re discussing this product";
    min-height: 52px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    color: #7c3aed;
    background: linear-gradient(90deg, #fff5fa, #f5edff);
    font-size: 13px;
    font-weight: 850;
  }

  .chat-body {
    min-height: 0;
    overflow-y: auto;
    padding: 17px;
    background: linear-gradient(180deg, #fff, #fbfafc);
  }

  .empty-chat {
    height: 100%;
    min-height: 290px;
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    color: #777184;
  }

  .empty-chat div {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 22px;
    color: #7c3aed;
    background: #f0e8ff;
  }

  .empty-chat h3 {
    margin: 14px 0 5px;
    color: #2b2732;
  }

  .empty-chat p {
    margin: 0;
  }

  .chat-message {
    margin-bottom: 14px;
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .chat-message.mine {
    justify-content: flex-end;
  }

  .avatar {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    object-fit: cover;
    border-radius: 50%;
  }

  .avatar.fallback {
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, #8b5cf6, #5b21b6);
    font-size: 11px;
    font-weight: 900;
  }

  .bubble {
    max-width: 82%;
    padding: 11px 13px 9px;
    border: 0;
    border-radius: 17px 17px 17px 6px;
    color: #292532;
    background: #f3f2f6;
    box-shadow: 0 7px 18px rgba(31, 24, 44, .04);
    cursor: pointer;
    text-align: left;
  }

  .mine .bubble {
    color: #2d203f;
    border-radius: 17px 17px 6px 17px;
    background: linear-gradient(135deg, #f5eaff, #ead9ff);
  }

  .bubble > strong {
    display: block;
    margin-bottom: 4px;
    color: #7c3aed;
    font-size: 11px;
  }

  .bubble p {
    margin: 0;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .bubble time {
    display: block;
    margin-top: 5px;
    color: inherit;
    opacity: .55;
    font-size: 10px;
    text-align: right;
  }

  .reply-preview {
    margin-bottom: 7px;
    padding: 8px;
    display: grid;
    gap: 2px;
    border-left: 3px solid #7c3aed;
    border-radius: 8px;
    background: rgba(124, 58, 237, .08);
  }

  .reply-preview b {
    font-size: 10px;
  }

  .reply-preview span {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    opacity: .75;
  }

  .vote-message,
  .voice-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 850;
  }

  .voice-row {
    color: #6d28d9;
  }

  .voice-row em {
    color: #5e5867;
    font-size: 11px;
    font-style: normal;
  }

  .voice-wave {
    letter-spacing: -2px;
    opacity: .65;
  }

  .chat-compose {
    padding: 11px;
    border-top: 1px solid #eceaf1;
    background: #fff;
  }

  .replying,
  .recording-line {
    margin-bottom: 8px;
    padding: 9px 10px;
    border-radius: 13px;
    background: #f4f1f8;
  }

  .replying {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
  }

  .replying div {
    min-width: 0;
    display: grid;
  }

  .replying strong {
    font-size: 11px;
  }

  .replying span {
    overflow: hidden;
    color: #777184;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .replying button {
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .recording-line {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #bc2445;
    font-size: 12px;
    font-weight: 850;
  }

  .record-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e53858;
    box-shadow: 0 0 0 5px rgba(229, 56, 88, .13);
    animation: pulse 1s infinite alternate;
  }

  @keyframes pulse {
    to {
      opacity: .35;
    }
  }

  .recording-line button {
    margin-left: auto;
    padding: 7px 10px;
    border: 0;
    border-radius: 999px;
    color: #fff;
    background: #b91c45;
    cursor: pointer;
    font-weight: 850;
  }

  .compose-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: end;
  }

  .compose-row textarea {
    width: 100%;
    min-height: 48px;
    max-height: 120px;
    padding: 13px 15px;
    border: 1px solid #e5e1ea;
    border-radius: 18px;
    outline: none;
    resize: none;
    color: #292532;
    background: #fbfafc;
  }

  .compose-row textarea:focus {
    border-color: #bda4ee;
    background: #fff;
    box-shadow: 0 0 0 4px rgba(124, 58, 237, .08);
  }

  .send-round {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #fff;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    box-shadow: 0 10px 22px rgba(109, 40, 217, .25);
    cursor: pointer;
  }

  .send-round.recording {
    background: #c7264f;
  }

  .mobile-chat-wrap,
  .floating-chat-button {
    display: none;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    padding: 20px;
    display: grid;
    place-items: end center;
    background: rgba(21, 17, 31, .46);
    backdrop-filter: blur(6px);
  }

  .message-menu {
    width: min(430px, 100%);
    padding: 12px;
    border-radius: 22px;
    background: #fff;
    box-shadow: 0 22px 70px rgba(0, 0, 0, .22);
  }

  .menu-head {
    padding: 7px 7px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .menu-head button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 12px;
    background: #f3f1f6;
    cursor: pointer;
  }

  .message-menu > button {
    width: 100%;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 14px;
    color: #292532;
    background: transparent;
    cursor: pointer;
    font-weight: 850;
  }

  .message-menu > button:hover {
    background: #f6f3fa;
  }

  .message-menu > button.danger {
    color: #bd2448;
  }

  .sc-state {
    min-height: 72vh;
    padding: 30px;
    display: grid;
    place-content: center;
    justify-items: center;
    color: #282532;
    background: #f7f7fb;
    text-align: center;
  }

  .sc-state h1 {
    margin: 16px 0 7px;
  }

  .sc-state p {
    margin: 0 0 18px;
    color: #777184;
  }

  .sc-state button {
    padding: 13px 18px;
    border: 0;
    border-radius: 14px;
    color: #fff;
    background: #7c3aed;
    cursor: pointer;
    font-weight: 850;
  }

  @media (max-width: 1050px) {
    .sc-layout {
      grid-template-columns: 1fr;
    }

    .sc-side {
      display: none;
    }

    .mobile-chat-wrap {
      display: block;
      scroll-margin-top: 84px;
    }

    .mobile-chat-wrap .chat-card {
      height: min(760px, 80vh);
      min-height: 610px;
    }

    .floating-chat-button {
      position: fixed;
      right: 16px;
      bottom: calc(86px + env(safe-area-inset-bottom));
      z-index: 45;
      min-height: 58px;
      padding: 8px 15px 8px 9px;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(255, 255, 255, .4);
      border-radius: 999px;
      color: #fff;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      box-shadow: 0 16px 34px rgba(92, 33, 190, .3);
      cursor: pointer;
    }

    .floating-chat-icon {
      width: 40px;
      height: 40px;
      position: relative;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #6d28d9;
      background: #fff;
    }

    .floating-chat-icon b {
      position: absolute;
      top: -5px;
      right: -5px;
      min-width: 19px;
      height: 19px;
      padding: 0 5px;
      display: grid;
      place-items: center;
      border: 2px solid #6d28d9;
      border-radius: 999px;
      color: #fff;
      background: #ef3f61;
      font-size: 9px;
    }

    .floating-chat-button > span:last-child {
      display: grid;
      text-align: left;
    }

    .floating-chat-button strong {
      font-size: 12px;
      line-height: 1.1;
    }

    .floating-chat-button small {
      margin-top: 3px;
      color: rgba(255, 255, 255, .78);
      font-size: 9px;
    }
  }

  @media (max-width: 760px) {
    :global(body:has(.sc-shell)) {
      overflow-x: hidden;
      background: #fff;
    }

    .sc-shell {
      padding: 0 0 calc(92px + env(safe-area-inset-bottom));
      background: #fff;
    }

    .sc-topbar {
      top: 0;
      min-height: 70px;
      margin: 0;
      padding: 9px 12px;
      border-width: 0 0 1px;
      border-radius: 0;
      box-shadow: none;
      background: rgba(255, 255, 255, .97);
    }

    .icon-button {
      width: 40px;
      height: 40px;
      border-radius: 13px;
    }

    .brand-block strong {
      font-size: 18px;
    }

    .share-code {
      max-width: 185px;
      font-size: 11px;
    }

    .member-pill {
      min-height: 38px;
      padding: 0 11px;
      font-size: 12px;
    }

    .sc-layout {
      display: block;
    }

    .sc-main {
      gap: 0;
    }

    .product-card,
    .vote-card,
    .discussion-card,
    .summary-card,
    .chat-card {
      border-right: 0;
      border-left: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .product-card {
      border-top: 0;
    }

    .product-summary {
      padding: 16px;
      grid-template-columns: 132px minmax(0, 1fr);
      gap: 16px;
    }

    .product-image {
      width: 132px;
      border-radius: 16px;
    }

    .product-info h1 {
      font-size: 21px;
      line-height: 1.2;
    }

    .price-row.large {
      margin-top: 11px;
    }

    .price-row strong {
      font-size: 25px;
    }

    .price-row del {
      font-size: 14px;
    }

    .price-row em {
      padding: 5px 8px;
      font-size: 10px;
    }

    .store-row {
      margin-top: 11px;
      font-size: 12px;
    }

    .circle-meta {
      min-height: 48px;
      padding: 9px 16px;
      overflow-x: auto;
      white-space: nowrap;
    }

    .vote-card {
      padding: 18px 16px;
    }

    .vote-heading h2 {
      font-size: 20px;
    }

    .vote-grid {
      grid-template-columns: repeat(5, minmax(74px, 1fr));
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }

    .vote-grid::-webkit-scrollbar {
      display: none;
    }

    .vote-tile {
      min-height: 116px;
      padding: 12px 7px;
      border-radius: 15px;
    }

    .vote-tile span {
      font-size: 11px;
    }

    .vote-total {
      margin-top: 12px;
    }

    .summary-card {
      margin: 0;
      padding: 16px;
      min-height: 98px;
    }

    .summary-card h2 {
      font-size: 16px;
    }

    .discussion-card {
      padding: 0 16px 18px;
    }

    .circle-tabs {
      margin: 0 -16px 16px;
      padding: 0 16px;
    }

    .chat-entry {
      min-height: 86px;
      padding: 13px;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
    }

    .chat-entry-copy strong {
      font-size: 15px;
    }

    .chat-entry-copy small {
      font-size: 11px;
    }

    .recent-item {
      grid-template-columns: 40px minmax(0, 1fr) auto;
    }

    .recent-item img,
    .recent-avatar {
      width: 40px;
      height: 40px;
    }

    .comparison-card {
      padding: 16px;
    }

    .comparison-card > h1 {
      font-size: 25px;
    }

    .product-strip {
      grid-auto-columns: 82%;
    }

    .mobile-chat-wrap {
      scroll-margin-top: 70px;
    }

    .mobile-chat-wrap .chat-card {
      height: 78vh;
      min-height: 600px;
      border-top: 10px solid #f6f4f9;
    }

    .chat-head {
      padding: 16px;
    }

    .chat-head h2 {
      font-size: 20px;
    }

    .circle-stats span {
      padding: 0 8px;
    }

    .bubble {
      max-width: 88%;
    }

    .floating-chat-button {
      right: 13px;
      bottom: calc(76px + env(safe-area-inset-bottom));
      min-height: 56px;
    }
  }
.circle-tabs button {
  cursor: pointer;
}

.circle-tab-panel {
  padding: 20px;
}

.circle-detail-row {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #eceaf1;
}

.circle-detail-row span {
  color: #777481;
  font-size: 13px;
}

.circle-detail-row strong {
  color: #171521;
  font-size: 14px;
  text-align: right;
  text-transform: capitalize;
}

.circle-question-box {
  margin-top: 18px;
  padding: 17px;
  display: grid;
  gap: 6px;
  border-radius: 16px;
  background: #f7f5fb;
}

.circle-question-box span {
  color: #817d8d;
  font-size: 12px;
}

.circle-question-box strong {
  color: #201d2a;
  font-size: 15px;
  line-height: 1.45;
}

.participants-heading {
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #5e25d9;
}

.participants-heading div {
  display: grid;
  gap: 3px;
}

.participants-heading strong {
  color: #1e1b28;
  font-size: 16px;
}

.participants-heading span {
  color: #85818e;
  font-size: 12px;
}

.participants-list {
  display: grid;
}

.participant-row {
  min-height: 66px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px solid #eeebf2;
}

.participant-row:first-child {
  border-top: 0;
}

.participant-row img,
.participant-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.participant-row img {
  display: block;
  object-fit: cover;
}

.participant-avatar {
  display: grid;
  place-items: center;
  color: white;
  background: #6e35db;
  font-size: 13px;
  font-weight: 800;
}

.participant-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.participant-copy strong {
  overflow: hidden;
  color: #211e29;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.participant-copy small {
  color: #8a8691;
  font-size: 11px;
}

.participant-status {
  padding: 6px 9px;
  border-radius: 999px;
  color: #078c52;
  background: #e9f9f1;
  font-size: 10px;
  font-weight: 800;
}

.participants-state {
  min-height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #817d89;
  font-size: 13px;
}
  @media (max-width: 420px) {
    .product-summary {
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 13px;
    }

    .product-image {
      width: 112px;
    }

    .product-info h1 {
      font-size: 18px;
    }

    .price-row strong {
      font-size: 22px;
    }

    .member-pill {
      padding: 0 9px;
    }

    .top-actions {
      gap: 5px;
    }

    .chat-entry-count {
      display: none;
    }

    .chat-entry {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
  }
`;