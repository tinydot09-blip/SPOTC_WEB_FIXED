import {
  DocumentData,
  DocumentReference,
  Firestore,
  addDoc,
  collection,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

export type CircleProduct = {
  id: string;
  title: string;
  image: string;
  price: number;
  old_price?: number;
  discount?: number;
  business_name?: string;
  product_ref?: DocumentReference<DocumentData> | null;
  business_ref?: DocumentReference<DocumentData> | null;
};

export type CreateSingleCircleInput = {
  product: CircleProduct;
  userUid: string;
  userRef?: DocumentReference<DocumentData> | null;
  userName?: string;
  userPhoto?: string;
  question?: string;
};

export type CreateComparisonCircleInput = {
  products: CircleProduct[];
  userUid: string;
  userRef?: DocumentReference<DocumentData> | null;
  userName?: string;
  userPhoto?: string;
  question?: string;
};

export type CreatedCircle = {
  id: string;
  shareCode: string;
};

export function createShareCode(length = 9): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(length);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < length; index += 1) {
      values[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

export async function createSingleShoppingCircle(
  db: Firestore,
  input: CreateSingleCircleInput,
): Promise<CreatedCircle> {
  const shareCode = createShareCode();

  const circleRef = await addDoc(collection(db, 'ShoppingCircles'), {
    comparison_mode: false,
    product_id: input.product.id,
    product_ref: input.product.product_ref ?? null,
    business_ref: input.product.business_ref ?? null,
    product_title: input.product.title,
    product_image: input.product.image,
    product_price: input.product.price,
    product_old_price: input.product.old_price ?? 0,
    product_discount: input.product.discount ?? 0,
    business_name: input.product.business_name ?? '',
    question: input.question?.trim() || 'Should I buy this?',
    share_code: shareCode,
    created_by_uid: input.userUid,
    created_by_ref: input.userRef ?? null,
    created_by_name: input.userName ?? 'SPOTC User',
    created_by_photo: input.userPhoto ?? '',
    participants: 1,
    comments_count: 0,
    vote_buy_it: 0,
    vote_looks_good: 0,
    vote_not_sure: 0,
    vote_dont_buy: 0,
    status: 'active',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return { id: circleRef.id, shareCode };
}

export async function createComparisonShoppingCircle(
  db: Firestore,
  input: CreateComparisonCircleInput,
): Promise<CreatedCircle> {
  if (input.products.length < 2) {
    throw new Error('Select at least two products.');
  }

  const products = input.products.slice(0, 4);
  const shareCode = createShareCode();

  const counters = Object.fromEntries(
    products.map((_, index) => [`product_${index}_votes`, 0]),
  );

  const circleRef = await addDoc(collection(db, 'ShoppingCircles'), {
    comparison_mode: true,
    products,
    question: input.question?.trim() || 'Which one should I buy?',
    share_code: shareCode,
    created_by_uid: input.userUid,
    created_by_ref: input.userRef ?? null,
    created_by_name: input.userName ?? 'SPOTC User',
    created_by_photo: input.userPhoto ?? '',
    participants: 1,
    comments_count: 0,
    none_votes: 0,
    ...counters,
    status: 'active',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return { id: circleRef.id, shareCode };
}

export function circleUrl(shareCode: string): string {
  if (typeof window === 'undefined') return `/circle/${encodeURIComponent(shareCode)}`;
  return `${window.location.origin}/circle/${encodeURIComponent(shareCode)}`;
}

export function participantDocId(circleId: string, uid: string): string {
  return `${circleId}_${uid}`;
}

export function participantRef(db: Firestore, circleId: string, uid: string) {
  return doc(db, 'ShoppingCircleParticipants', participantDocId(circleId, uid));
}