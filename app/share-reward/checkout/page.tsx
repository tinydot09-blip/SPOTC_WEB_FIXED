'use client';

import { CheckCircle2, Gift, Loader2, MapPin, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import {
  formatAddress,
  loadUserAddresses,
  selectedAddressFrom,
  type SavedAddress,
} from '@/lib/addresses';
import { requireGoogleLogin } from '@/lib/auth';
import { db, firebaseReady } from '@/lib/firebase';
import { distanceKm, SPOTC_DELIVERY_CENTER } from '@/lib/delivery-radius';

const GIFT_KEY = 'spotc-share5-selected-gift';
const CAMPAIGN_KEY = 'spotc-share5-campaign-v1';

type SelectedCampaignGift = {
  id: string;
  title: string;
  image: string;
  originalPrice: number;
  claimId: string;
};

const coordinate = (address: SavedAddress, keys: string[]) => {
  const raw = address as SavedAddress & Record<string, unknown>;
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return null;
};

const insideDeliveryArea = (address: SavedAddress | null) => {
  if (!address) return false;
  const latitude = coordinate(address, ['latitude', 'lat', 'delivery_lat']);
  const longitude = coordinate(address, ['longitude', 'lng', 'lon', 'delivery_lng']);
  if (latitude === null || longitude === null) return false;
  return (
    distanceKm(
      { latitude, longitude },
      {
        latitude: SPOTC_DELIVERY_CENTER.latitude,
        longitude: SPOTC_DELIVERY_CENTER.longitude,
      },
    ) <= SPOTC_DELIVERY_CENTER.radiusKm
  );
};

const readGift = (): SelectedCampaignGift | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GIFT_KEY) || 'null') as SelectedCampaignGift | null;
    return parsed?.id && parsed?.claimId ? parsed : null;
  } catch {
    return null;
  }
};

export default function ShareRewardCheckoutPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [gift, setGift] = useState<SelectedCampaignGift | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      const selectedGift = readGift();
      if (!selectedGift) {
        router.replace('/share-reward/gift');
        return;
      }

      if (!firebaseReady || !db) {
        setMessage('SPOTC is not connected right now. Please try again.');
        setLoading(false);
        return;
      }

      const currentUser = await requireGoogleLogin();
      if (!currentUser || !active) {
        setLoading(false);
        return;
      }

      const claimSnap = await getDoc(doc(db, 'ShareRewardClaims', selectedGift.claimId));
      if (!claimSnap.exists() || claimSnap.data().user_uid !== currentUser.uid) {
        router.replace('/share-reward/proof');
        return;
      }

      if (claimSnap.data().order_id) {
        router.replace(`/share-reward/success?id=${encodeURIComponent(String(claimSnap.data().order_id))}`);
        return;
      }

      const addresses = await loadUserAddresses(db, currentUser);
      const selectedAddress = selectedAddressFrom(addresses);

      if (!selectedAddress) {
        window.localStorage.setItem('spotc-address-return-path', '/share-reward/checkout');
        router.replace('/address?next=%2Fshare-reward%2Fcheckout');
        return;
      }

      if (active) {
        setUser(currentUser);
        setGift(selectedGift);
        setAddress(selectedAddress);
        setLoading(false);
      }
    })().catch((error) => {
      console.error('Campaign checkout preparation failed:', error);
      if (active) {
        setMessage('Unable to open FREE gift checkout. Please try again.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const deliverable = useMemo(() => insideDeliveryArea(address), [address]);

  const placeRequest = async () => {
    if (!db || !user || !address || !gift || placing) return;

    if (!deliverable) {
      setMessage('FREE gift delivery is available only in Karamadai, Teacher Colony, EB Colony and Gandhinagar. Please choose a local delivery address.');
      return;
    }

    setPlacing(true);
    setMessage('');

    try {
      const firestore = db;
      const claimRef = doc(firestore, 'ShareRewardClaims', gift.claimId);
      const productRef = doc(firestore, 'BusinessProducts', gift.id);
      const now = Date.now();
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const orderId = `share5_${user.uid}_${now}_${suffix}`;
      const orderNumber = `SPOTC-GIFT-${String(now).slice(-7)}-${suffix}`;
      const orderRef = doc(firestore, 'Orders', orderId);

      await runTransaction(firestore, async (transaction) => {
        const claimSnap = await transaction.get(claimRef);
        const productSnap = await transaction.get(productRef);

        if (!claimSnap.exists()) throw new Error('Reward claim was not found.');
        if (claimSnap.data().user_uid !== user.uid) throw new Error('This reward claim does not belong to this account.');

        const existingOrderId = String(claimSnap.data().order_id || '').trim();
        if (existingOrderId) {
          throw new Error(`Your FREE gift request is already submitted (${existingOrderId}).`);
        }

        if (!productSnap.exists()) throw new Error('Selected FREE gift is no longer available.');

        const product = productSnap.data();
        const stock = Math.max(0, Number(product.stock_qty ?? product.stock_quantity ?? 0) || 0);
        const reserved = Math.max(0, Number(product.reserved_qty ?? 0) || 0);
        const available = Math.max(0, stock - reserved);

        if (available < 1 || product.is_in_stock === false) {
          throw new Error('This FREE gift has just gone out of stock. Please choose another gift.');
        }

        const nextReserved = reserved + 1;

        transaction.update(productRef, {
          reserved_qty: nextReserved,
          available_qty: Math.max(0, stock - nextReserved),
          is_in_stock: stock - nextReserved > 0,
          updated_at: serverTimestamp(),
        });

        const giftLine = {
          id: gift.id,
          product_id: gift.id,
          title: gift.title,
          product_name: gift.title,
          image: gift.image,
          image_url: gift.image,
          price: 0,
          original_price: gift.originalPrice,
          quantity: 1,
          qty: 1,
          subtotal: 0,
          is_free_gift: true,
          type: 'free_gift',
          business_id: 'SPOTC',
          business_name: 'SPOTC Shop',
          seller_type: 'spotc',
        };

        const addressData = {
          id: address.id,
          name: address.fullName || user.displayName || 'Customer',
          full_name: address.fullName || user.displayName || 'Customer',
          phone: address.phone || '',
          house_no: address.houseNo || '',
          street: address.street || '',
          landmark: address.landmark || '',
          area: address.area || '',
          city: address.city || '',
          pincode: address.pincode || '',
          state: address.state || 'Tamil Nadu',
          country: address.country || 'India',
          latitude: coordinate(address, ['latitude', 'lat', 'delivery_lat']),
          longitude: coordinate(address, ['longitude', 'lng', 'lon', 'delivery_lng']),
          delivery_note: address.deliveryNote || '',
        };

        transaction.set(orderRef, {
          order_number: orderNumber,
          order_id: orderNumber,
          user_uid: user.uid,
          user_ref: doc(firestore, 'Users', user.uid),
          customer_name: address.fullName || user.displayName || 'Customer',
          customer_phone: address.phone || '',
          customer_email: user.email || '',
          business_id: 'SPOTC',
          business_name: 'SPOTC Shop',
          seller_type: 'spotc',
          address: addressData,
          delivery_address: addressData,
          address_text: formatAddress(address),
          items: [giftLine],
          free_gifts: [giftLine],
          selected_free_gifts: [giftLine],
          free_gift_count: 1,
          has_free_gift: true,
          subtotal: 0,
          delivery_charge: 0,
          platform_fee: 0,
          discount: 0,
          total: 0,
          payment_method: 'FREE',
          payment_type: 'FREE',
          payment_status: 'not_required',
          delivery_option_id: 'campaign_gift',
          delivery_option_title: 'FREE Gift Delivery',
          delivery_window: 'Within 5 hours after approval',
          estimated_delivery: 'Within 5 hours after approval',
          order_status: 'pending_verification',
          status: 'pending_verification',
          inventory_state: 'reserved',
          campaign_id: 'share5_get1free_2026',
          campaign_type: 'share5_get1free',
          campaign_verification_status: 'pending',
          share_reward_claim_id: gift.claimId,
          share_proof_urls: Array.isArray(claimSnap.data().proof_urls) ? claimSnap.data().proof_urls : [],
          shared_product_ids: Array.isArray(claimSnap.data().shared_product_ids) ? claimSnap.data().shared_product_ids : [],
          local_share_declared: claimSnap.data().local_share_declared === true,
          selected_campaign_gift_id: gift.id,
          selected_campaign_gift_title: gift.title,
          selected_campaign_gift_image: gift.image,
          selected_campaign_gift_original_price: gift.originalPrice,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.set(
          claimRef,
          {
            selected_gift_id: gift.id,
            selected_gift_title: gift.title,
            selected_gift_image: gift.image,
            selected_gift_original_price: gift.originalPrice,
            order_id: orderId,
            order_number: orderNumber,
            status: 'pending_verification',
            verification_status: 'pending',
            checkout_completed_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
      });

      try {
        const local = JSON.parse(window.localStorage.getItem(CAMPAIGN_KEY) || '{}') as Record<string, unknown>;
        window.localStorage.setItem(
          CAMPAIGN_KEY,
          JSON.stringify({ ...local, requestSubmitted: true, orderId }),
        );
      } catch {
        // Local campaign state is only a UI convenience.
      }

      window.localStorage.removeItem(GIFT_KEY);
      router.push(`/share-reward/success?id=${encodeURIComponent(orderId)}`);
    } catch (error) {
      console.error('FREE gift request failed:', error);
      setMessage(error instanceof Error ? error.message : 'Unable to submit your FREE gift request. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <main className="sr-checkout-page sr-state">
        <Loader2 className="sr-spin" />
        <p>Preparing your FREE gift request…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!gift || !user || !address) {
    return (
      <main className="sr-checkout-page sr-state">
        <Gift />
        <h1>FREE gift details are missing</h1>
        <button type="button" onClick={() => router.push('/share-reward/gift')}>Choose FREE Gift</button>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="sr-checkout-page">
      <section className="sr-shell">
        <header className="sr-head">
          <div><small>FREE GIFT CHECKOUT</small><h1>Confirm Your Gift Request</h1></div>
          <span><ShieldCheck /> Verification required</span>
        </header>

        <section className="sr-product">
          {gift.image ? <img src={gift.image} alt={gift.title} /> : <div className="sr-image-empty"><Gift /></div>}
          <div><small>YOUR SELECTED GIFT</small><strong>{gift.title}</strong><p><span>₹{Math.round(gift.originalPrice)}</span> <b>FREE</b></p></div>
        </section>

        <section className="sr-address">
          <div className="sr-section-head"><MapPin /><strong>Delivery Address</strong></div>
          <p>{formatAddress(address)}</p>
          <button type="button" onClick={() => {
            window.localStorage.setItem('spotc-address-return-path', '/share-reward/checkout');
            router.push('/address?next=%2Fshare-reward%2Fcheckout');
          }}>Change Address</button>
        </section>

        <section className="sr-delivery">
          <Truck />
          <div><strong>Delivery within 5 hours after approval</strong><span>We will manually verify your WhatsApp sharing proof first.</span></div>
          <b>FREE</b>
        </section>

        <section className="sr-summary">
          <div><span>FREE Gift</span><strong>₹0</strong></div>
          <div><span>Delivery</span><strong>FREE</strong></div>
          <div className="total"><span>Total Payable</span><strong>₹0</strong></div>
        </section>

        {!deliverable && (
          <div className="sr-warning">This address is outside the current SPOTC delivery area. Choose an address in Karamadai, Teacher Colony, EB Colony or Gandhinagar.</div>
        )}

        {message && <div className="sr-message">{message}</div>}

        <button className="sr-place" type="button" disabled={placing || !deliverable} onClick={placeRequest}>
          {placing ? <Loader2 className="sr-spin" /> : <CheckCircle2 />}
          {placing ? 'Submitting…' : 'Place FREE Gift Request'}
        </button>

        <p className="sr-foot">Your gift is reserved when you place this request. It will be confirmed only after SPOTC approves the sharing proof.</p>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .sr-checkout-page{min-height:100vh;background:#f7f5f1;padding:24px 14px 90px;color:#211d1a}.sr-state{display:grid;place-items:center;text-align:center}.sr-state button{border:0;border-radius:13px;background:#d81b60;color:#fff;padding:12px 16px;font-weight:900}.sr-shell{width:min(760px,100%);margin:0 auto}.sr-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.sr-head small{color:#d81b60;font-weight:900;letter-spacing:.09em}.sr-head h1{margin:6px 0 0;font-size:clamp(28px,5vw,40px)}.sr-head>span{display:flex;align-items:center;gap:6px;background:#fff4d7;color:#654d08;padding:9px 11px;border-radius:999px;font-size:12px;font-weight:800}.sr-head>span svg{width:17px}.sr-product,.sr-address,.sr-delivery,.sr-summary{margin-top:17px;background:#fff;border:1px solid #e7dfda;border-radius:18px;padding:16px;box-shadow:0 8px 22px rgba(38,24,14,.04)}.sr-product{display:grid;grid-template-columns:92px 1fr;gap:14px;align-items:center}.sr-product img,.sr-image-empty{width:92px;height:92px;border-radius:14px;object-fit:cover;background:#f3eee9}.sr-image-empty{display:grid;place-items:center}.sr-product small{color:#16803b;font-size:10px;font-weight:900}.sr-product strong{display:block;margin-top:5px;font-size:17px}.sr-product p{margin:7px 0 0}.sr-product p span{text-decoration:line-through;color:#8b7e76}.sr-product p b{margin-left:7px;color:#16803b}.sr-section-head{display:flex;align-items:center;gap:8px}.sr-section-head svg{width:20px;color:#d81b60}.sr-address p{margin:10px 0;color:#574f4a;line-height:1.55}.sr-address button{border:1px solid #d8cdc6;border-radius:10px;background:#fff;padding:8px 11px;font-weight:800}.sr-delivery{display:grid;grid-template-columns:35px 1fr auto;gap:11px;align-items:center}.sr-delivery>svg{color:#16803b}.sr-delivery div{display:grid;gap:3px}.sr-delivery span{font-size:12px;color:#756a63}.sr-delivery>b{color:#16803b}.sr-summary>div{display:flex;justify-content:space-between;padding:8px 0;color:#655b55}.sr-summary .total{border-top:1px solid #eee3dc;margin-top:5px;padding-top:13px;color:#1c1917;font-size:18px}.sr-warning,.sr-message{margin-top:14px;padding:12px 14px;border-radius:13px;font-weight:700;font-size:13px}.sr-warning{background:#feecec;color:#a11b1b}.sr-message{background:#fff1cf;color:#6b5200}.sr-place{width:100%;min-height:54px;margin-top:17px;border:0;border-radius:15px;background:#d81b60;color:#fff;font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px}.sr-place:disabled{opacity:.5}.sr-place svg{width:21px}.sr-foot{text-align:center;color:#766a63;font-size:12px;line-height:1.5}.sr-spin{animation:srspin .8s linear infinite}@keyframes srspin{to{transform:rotate(360deg)}}@media(max-width:560px){.sr-head{display:block}.sr-head>span{width:max-content;margin-top:10px}.sr-product{grid-template-columns:78px 1fr}.sr-product img,.sr-image-empty{width:78px;height:78px}.sr-delivery{grid-template-columns:28px 1fr auto}}
`;
