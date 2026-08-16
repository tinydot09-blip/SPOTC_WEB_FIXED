import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

import type { CartItem } from './cart';
import type { SavedAddress } from './addresses';
import { formatAddress } from './addresses';
import type { BusinessCartGroup } from './delivery';
import type { RewardEstimate } from './rewards';

export type CreatedOrder = {
  documentId: string;
  orderNumber: string;
  total: number;
  businessName: string;
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown): string =>
  value == null ? '' : String(value);

const orderItem = (item: CartItem) => ({
  id: text(item.id),
  product_id: text(item.id),
  title: text(item.title),
  image: text(item.image),
  price: num(item.price),
  quantity: Math.max(1, num(item.qty) || 1),
  qty: Math.max(1, num(item.qty) || 1),
  subtotal:
    num(item.price) *
    Math.max(1, num(item.qty) || 1),
  size: text(item.size),
  color: text(item.color),
  business_id: text(item.businessId),
  business_name:
    text(item.businessName) || 'SPOTC Shop',
});

async function businessData(
  db: Firestore,
  id: string,
): Promise<Record<string, unknown>> {
  if (!id) return {};

  try {
    const snapshot = await getDoc(
      doc(db, 'BusinessListings', id),
    );

    return snapshot.exists()
      ? snapshot.data()
      : {};
  } catch {
    return {};
  }
}

export async function createBusinessOrder({
  db,
  user,
  group,
  address,
  discount,
  rewards,
}: {
  db: Firestore;
  user: User;
  group: BusinessCartGroup;
  address: SavedAddress;
  discount: number;
  rewards: RewardEstimate;
}): Promise<CreatedOrder> {
  const now = Date.now();

  const suffix = Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase();

  const orderNumber =
    `SPOTC-${String(now).slice(-8)}-${suffix}`;

  const documentId =
    `${user.uid}_${now}_${suffix}`;

  const businessId =
    text(group.businessId) || 'SPOTC';

  const business = await businessData(
    db,
    businessId,
  );

  const businessRef =
    businessId === 'SPOTC'
      ? null
      : doc(
          db,
          'BusinessListings',
          businessId,
        );

  const subtotal = num(group.subtotal);
  const delivery = num(group.delivery);
  const safeDiscount = num(discount);

  const total =
    subtotal +
    delivery -
    safeDiscount;

  /*
   * IMPORTANT:
   * Firestore rejects any field whose value is undefined.
   * Every optional reward/address/business value below is converted
   * to a safe number, string, null, or boolean before setDoc().
   */
  const purchasePoints =
    num(rewards?.purchasePoints);

  const nearbyBonusPoints =
    num(rewards?.nearbyBonusPoints);

  const totalPoints =
    num(rewards?.totalPoints);

  const couponCount =
    num(rewards?.couponCount);

  const couponValueEach =
    num(
      (
        rewards as RewardEstimate & {
          couponValueEach?: unknown;
        }
      )?.couponValueEach,
    );

  const rewardsStatus =
    text(
      (
        rewards as RewardEstimate & {
          status?: unknown;
        }
      )?.status,
    );

  const fullName = text(address.fullName);
  const phone = text(address.phone);

  await setDoc(
    doc(db, 'Orders', documentId),
    {
      order_number: orderNumber,

      user_uid: user.uid,
      user_ref: doc(db, 'Users', user.uid),

      customer_uid: user.uid,
      customer_name: fullName,
      customer_phone: phone,
      customer_email: text(user.email),

      business_id: businessId,
      business_ref: businessRef,
      business_name:
        text(
          business.business_name ??
            business.shop_name ??
            group.businessName,
        ) || 'SPOTC Shop',

      business_logo: text(
        business.logo_url ??
          business.business_logo_url,
      ),

      business_address: text(
        business.address ??
          business.business_address,
      ),

      business_phone: text(
        business.phone ??
          business.business_phone,
      ),

      business_whatsapp: text(
        business.whatsapp ??
          business.business_whatsapp,
      ),

      business_category: text(
        business.category,
      ),

      business_location:
        business.business_location ??
        business.location ??
        null,

      business_verified:
        business.isVerified === true ||
        business.is_verified === true,

      address_ref:
        address.ref ?? null,

      address: {
        full_name: fullName,
        phone,
        address_type:
          text(address.addressType),
        house_no:
          text(address.houseNo),
        street:
          text(address.street),
        landmark:
          text(address.landmark),
        area:
          text(address.area),
        city:
          text(address.city),
        pincode:
          text(address.pincode),
        state:
          text(address.state),
        country:
          text(address.country),
        delivery_note:
          text(address.deliveryNote),
        latitude:
          address.latitude ?? null,
        longitude:
          address.longitude ?? null,
      },

      delivery_address:
        formatAddress(address),

      address_text:
        formatAddress(address),

      items:
        group.items.map(orderItem),

      subtotal,
      delivery_charge: delivery,
      platform_fee: 0,
      discount: safeDiscount,
      total,

      welcome_discount_applied:
        safeDiscount > 0,

      applied_coupon_type:
        safeDiscount > 0
          ? 'welcome_discount'
          : '',

      applied_coupon_title:
        safeDiscount > 0
          ? 'First order from this shop'
          : '',

      payment_method: 'COD',
      payment_status: 'pending',

      order_status: 'placed',
      status: 'placed',

      estimated_delivery: '15–45 mins',

      purchase_reward_points:
        purchasePoints,

      nearby_bonus_points:
        nearbyBonusPoints,

      reward_points_pending:
        totalPoints,

      coupon_count_pending:
        couponCount,

      /*
       * FIX:
       * Previously this could be undefined and Firestore rejected
       * the whole Orders document.
       */
      coupon_value_each:
        couponValueEach,

      rewards_status:
        rewardsStatus,

      rewards_unlocked: false,

      created_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    },
  );

  return {
    documentId,
    orderNumber,
    total,
    businessName:
      text(group.businessName) ||
      'SPOTC Shop',
  };
}

export async function readOrderById(
  db: Firestore,
  id: string,
) {
  const snapshot = await getDoc(
    doc(db, 'Orders', id),
  );

  return snapshot.exists()
    ? {
        id: snapshot.id,
        ...snapshot.data(),
      }
    : null;
}