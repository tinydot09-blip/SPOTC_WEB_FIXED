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

const orderItem = (item: CartItem) => ({
  id: item.id,
  product_id: item.id,
  title: item.title,
  image: item.image,
  price: num(item.price),
  quantity: item.qty,
  qty: item.qty,
  subtotal: num(item.price) * item.qty,
  size: item.size || '',
  color: item.color || '',
  business_id: item.businessId || '',
  business_name: item.businessName || 'SPOTC Shop',
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

  const orderNumber = `SPOTC-${String(now).slice(-8)}-${suffix}`;

  const documentId = `${user.uid}_${now}_${suffix}`;

  const business = await businessData(
    db,
    group.businessId,
  );

  const businessRef = group.businessId
    ? doc(
        db,
        'BusinessListings',
        group.businessId,
      )
    : null;

  const total =
    group.subtotal +
    group.delivery -
    discount;

  await setDoc(
    doc(db, 'Orders', documentId),
    {
      order_number: orderNumber,

      user_uid: user.uid,
      user_ref: doc(db, 'Users', user.uid),

      customer_uid: user.uid,
      customer_name: address.fullName,
      customer_phone: address.phone,
      customer_email: user.email || '',

      business_id: group.businessId,
      business_ref: businessRef,
      business_name: String(
        business.business_name ??
          business.shop_name ??
          group.businessName,
      ),
      business_logo: String(
        business.logo_url ??
          business.business_logo_url ??
          '',
      ),
      business_address: String(
        business.address ??
          business.business_address ??
          '',
      ),
      business_phone: String(
        business.phone ??
          business.business_phone ??
          '',
      ),
      business_whatsapp: String(
        business.whatsapp ??
          business.business_whatsapp ??
          '',
      ),
      business_category: String(
        business.category ?? '',
      ),
      business_location:
        business.business_location ??
        business.location ??
        null,
      business_verified:
        business.isVerified === true ||
        business.is_verified === true,

      address_ref: address.ref,

      address: {
        full_name: address.fullName,
        phone: address.phone,
        address_type: address.addressType,
        house_no: address.houseNo,
        street: address.street,
        landmark: address.landmark,
        area: address.area,
        city: address.city,
        pincode: address.pincode,
        state: address.state,
        country: address.country,
        delivery_note: address.deliveryNote,
        latitude: address.latitude,
        longitude: address.longitude,
      },

      delivery_address: formatAddress(address),
      address_text: formatAddress(address),

      items: group.items.map(orderItem),

      subtotal: group.subtotal,
      delivery_charge: group.delivery,
      platform_fee: 0,
      discount,
      total,

      welcome_discount_applied: discount > 0,
      applied_coupon_type:
        discount > 0
          ? 'welcome_discount'
          : '',
      applied_coupon_title:
        discount > 0
          ? 'First order from this shop'
          : '',

      payment_method: 'COD',
      payment_status: 'pending',

      order_status: 'placed',
      status: 'placed',

      estimated_delivery: '15–45 mins',

      purchase_reward_points:
        rewards.purchasePoints,

      nearby_bonus_points:
        rewards.nearbyBonusPoints,

      reward_points_pending:
        rewards.totalPoints,

      coupon_count_pending:
        rewards.couponCount,

      coupon_value_each:
        rewards.couponValueEach,

      rewards_status:
        rewards.status,

      rewards_unlocked: false,

      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
  );

  return {
    documentId,
    orderNumber,
    total,
    businessName: group.businessName,
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