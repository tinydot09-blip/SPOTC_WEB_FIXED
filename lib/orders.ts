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

/*
 * ============================================================
 * SPOTC OWN INVENTORY
 * ============================================================
 *
 * For now every order is treated as a SPOTC-owned inventory
 * order.
 *
 * We are NOT resolving BusinessListings.
 *
 * Later, if partner shops are enabled again, seller_type can
 * be expanded to support "business".
 */
export const SPOTC_SELLER_TYPE = 'spotc' as const;

export type CreatedOrder = {
  documentId: string;
  orderNumber: string;
  total: number;
  businessName: string;
};

const num = (value: unknown): number => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const text = (value: unknown): string =>
  value == null
    ? ''
    : String(value).trim();

/*
 * ============================================================
 * ORDER ITEM
 * ============================================================
 *
 * Every current product is SPOTC inventory.
 */
const orderItem = (
  item: CartItem,
) => {
  const quantity = Math.max(
    1,
    num(item.qty) || 1,
  );

  const price = num(item.price);

  return {
    id: text(item.id),

    product_id: text(item.id),

    title: text(item.title),

    image: text(item.image),

    price,

    quantity,

    qty: quantity,

    subtotal:
      price * quantity,

    size: text(item.size),

    color: text(item.color),

    /*
     * IMPORTANT:
     * Current inventory belongs to SPOTC.
     */
    seller_type:
      SPOTC_SELLER_TYPE,

    business_id: 'SPOTC',

    business_name:
      'SPOTC Shop',
  };
};

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

  /*
   * ==========================================================
   * CURRENT SELLER
   * ==========================================================
   *
   * Do NOT use group.businessId.
   * Do NOT look up BusinessListings.
   *
   * All present orders are SPOTC inventory.
   */
  const sellerType =
    SPOTC_SELLER_TYPE;

  const businessId =
    'SPOTC';

  const businessName =
    'SPOTC Shop';

  /*
   * There is no BusinessListings reference for SPOTC's
   * own inventory.
   */
  const businessRef = null;

  const subtotal =
    num(group.subtotal);

  const delivery =
    num(group.delivery);

  const safeDiscount =
    num(discount);

  const total =
    subtotal +
    delivery -
    safeDiscount;

  /*
   * ==========================================================
   * REWARDS
   * ==========================================================
   */

  const purchasePoints =
    num(
      rewards?.purchasePoints,
    );

  const nearbyBonusPoints =
    num(
      rewards?.nearbyBonusPoints,
    );

  const totalPoints =
    num(
      rewards?.totalPoints,
    );

  const couponCount =
    num(
      rewards?.couponCount,
    );

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

  /*
   * ==========================================================
   * CUSTOMER
   * ==========================================================
   */

  const fullName =
    text(address.fullName);

  const phone =
    text(address.phone);

  const formattedDeliveryAddress =
    formatAddress(address);

  await setDoc(
    doc(
      db,
      'Orders',
      documentId,
    ),
    {
      /*
       * ======================================================
       * ORDER
       * ======================================================
       */

      order_number:
        orderNumber,

      /*
       * ======================================================
       * CUSTOMER
       * ======================================================
       */

      user_uid:
        user.uid,

      user_ref:
        doc(
          db,
          'Users',
          user.uid,
        ),

      customer_uid:
        user.uid,

      customer_name:
        fullName,

      customer_phone:
        phone,

      customer_email:
        text(user.email),

      /*
       * ======================================================
       * SELLER
       * ======================================================
       *
       * CURRENT MODEL:
       *
       * seller_type = spotc
       *
       * No local-shop BusinessListings dependency.
       */

      seller_type:
        sellerType,

      business_id:
        businessId,

      business_ref:
        businessRef,

      business_name:
        businessName,

      /*
       * Keep these fields available in the order schema.
       *
       * We will insert SPOTC's own address / phone /
       * WhatsApp / location when those details are finalized.
       *
       * They are deliberately NOT copied from another shop.
       */

      business_logo: '',

      business_address: '',

      business_phone: '',

      business_whatsapp: '',

      business_category:
        'SPOTC Inventory',

      business_location:
        null,

      business_verified:
        true,

      /*
       * ======================================================
       * DELIVERY ADDRESS
       * ======================================================
       */

      address_ref:
        address.ref ?? null,

      address: {
        full_name:
          fullName,

        phone,

        address_type:
          text(
            address.addressType,
          ),

        house_no:
          text(
            address.houseNo,
          ),

        street:
          text(
            address.street,
          ),

        landmark:
          text(
            address.landmark,
          ),

        area:
          text(
            address.area,
          ),

        city:
          text(
            address.city,
          ),

        pincode:
          text(
            address.pincode,
          ),

        state:
          text(
            address.state,
          ),

        country:
          text(
            address.country,
          ),

        delivery_note:
          text(
            address.deliveryNote,
          ),

        latitude:
          address.latitude ??
          null,

        longitude:
          address.longitude ??
          null,
      },

      delivery_address:
        formattedDeliveryAddress,

      address_text:
        formattedDeliveryAddress,

      /*
       * ======================================================
       * ITEMS
       * ======================================================
       */

      items:
        group.items.map(
          orderItem,
        ),

      /*
       * ======================================================
       * BILL
       * ======================================================
       */

      subtotal,

      delivery_charge:
        delivery,

      platform_fee:
        0,

      discount:
        safeDiscount,

      total,

      /*
       * ======================================================
       * DISCOUNT
       * ======================================================
       */

      welcome_discount_applied:
        safeDiscount > 0,

      applied_coupon_type:
        safeDiscount > 0
          ? 'welcome_discount'
          : '',

      applied_coupon_title:
        safeDiscount > 0
          ? 'First order discount'
          : '',

      /*
       * ======================================================
       * PAYMENT
       * ======================================================
       */

      payment_method:
        'COD',

      payment_status:
        'pending',

      /*
       * ======================================================
       * ORDER STATUS
       * ======================================================
       */

      order_status:
        'placed',

      status:
        'placed',

      estimated_delivery:
        '15–45 mins',

      /*
       * ======================================================
       * REWARDS
       * ======================================================
       */

      purchase_reward_points:
        purchasePoints,

      nearby_bonus_points:
        nearbyBonusPoints,

      reward_points_pending:
        totalPoints,

      coupon_count_pending:
        couponCount,

      coupon_value_each:
        couponValueEach,

      rewards_status:
        rewardsStatus,

      rewards_unlocked:
        false,

      /*
       * ======================================================
       * TIMESTAMPS
       * ======================================================
       */

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
      businessName,
  };
}

export async function readOrderById(
  db: Firestore,
  id: string,
) {
  const snapshot =
    await getDoc(
      doc(
        db,
        'Orders',
        id,
      ),
    );

  return snapshot.exists()
    ? {
        id:
          snapshot.id,

        ...snapshot.data(),
      }
    : null;
}