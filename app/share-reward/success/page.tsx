'use client';

import { CheckCircle2, Gift, Loader2, ShieldCheck, Truck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { db, firebaseReady } from '@/lib/firebase';

type OrderData = Record<string, unknown> & { id: string };

export default function ShareRewardSuccessPage() {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!firebaseReady || !db) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const id = String(params.get('id') || '').trim();
      if (!id) {
        setLoading(false);
        return;
      }

      const snap = await getDoc(doc(db, 'Orders', id));
      if (active) {
        setOrder(snap.exists() ? ({ id: snap.id, ...snap.data() } as OrderData) : null);
        setLoading(false);
      }
    })().catch((error) => {
      console.error('Loading FREE gift request failed:', error);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <main className="sr-success sr-state"><Loader2 className="sr-spin" /><p>Loading your FREE gift request…</p><style jsx>{styles}</style></main>;
  }

  if (!order) {
    return <main className="sr-success sr-state"><Gift /><h1>Gift request not found</h1><Link href="/shop">Back to Shop</Link><style jsx>{styles}</style></main>;
  }

  const gift = Array.isArray(order.free_gifts) ? (order.free_gifts[0] as Record<string, unknown> | undefined) : undefined;
  const status = String(order.campaign_verification_status || 'pending').toLowerCase();
  const approved = status === 'approved';
  const rejected = status === 'rejected';

  return (
    <main className="sr-success">
      <section className="sr-card">
        <div className={approved ? 'sr-main-icon approved' : rejected ? 'sr-main-icon rejected' : 'sr-main-icon'}>
          {approved ? <CheckCircle2 /> : <ShieldCheck />}
        </div>
        <small>{approved ? 'FREE GIFT APPROVED' : rejected ? 'PROOF NOT APPROVED' : 'REQUEST RECEIVED'}</small>
        <h1>{approved ? 'Your FREE gift is confirmed!' : rejected ? 'Your proof needs attention' : 'Free Gift Request Received!'}</h1>
        <p>
          {approved
            ? 'Your gift is being prepared for delivery.'
            : rejected
              ? 'Please contact SPOTC support if you need help with your proof.'
              : 'Your WhatsApp sharing proof is being manually verified.'}
        </p>

        {gift && (
          <div className="sr-gift">
            {gift.image ? <img src={String(gift.image)} alt={String(gift.title || 'FREE Gift')} /> : <div className="sr-empty"><Gift /></div>}
            <div><small>SELECTED GIFT</small><strong>{String(gift.title || 'FREE Gift')}</strong><b>FREE</b></div>
          </div>
        )}

        <div className="sr-status">
          <span>Status</span>
          <strong>{approved ? 'Approved ✓' : rejected ? 'Rejected' : 'Verification Pending'}</strong>
        </div>

        {!rejected && (
          <div className="sr-delivery">
            <Truck />
            <div><strong>{approved ? 'Delivery within 5 hours' : 'Delivery within 5 hours after approval'}</strong><span>SPOTC local delivery</span></div>
          </div>
        )}

        <div className="sr-order"><span>Request No.</span><strong>{String(order.order_number || order.id)}</strong></div>

        <div className="sr-actions">
          <Link href="/dashboard?tab=orders">View My Orders</Link>
          <Link href="/shop">Continue Shopping</Link>
        </div>
      </section>
      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .sr-success{min-height:100vh;background:#fff8f5;padding:32px 14px 90px;color:#1f1b18}.sr-state{display:grid;place-items:center;text-align:center}.sr-state>a{color:#d81b60;font-weight:900}.sr-card{width:min(620px,100%);margin:0 auto;text-align:center;background:#fff;border:1px solid #eddfd8;border-radius:28px;padding:28px 22px;box-shadow:0 18px 50px rgba(40,22,12,.08)}.sr-main-icon{width:72px;height:72px;margin:0 auto;border-radius:22px;display:grid;place-items:center;background:#fff1cf;color:#a56a00}.sr-main-icon.approved{background:#e7f8ed;color:#16803b}.sr-main-icon.rejected{background:#feecec;color:#ad1e1e}.sr-main-icon svg{width:38px;height:38px}.sr-card>small{display:block;margin-top:16px;color:#d81b60;font-weight:900;letter-spacing:.1em}.sr-card h1{margin:7px 0;font-size:clamp(29px,6vw,43px);line-height:1.05}.sr-card>p{margin:0 auto;color:#70645f;line-height:1.55;max-width:480px}.sr-gift{margin-top:20px;padding:12px;border-radius:17px;background:#faf7f3;display:grid;grid-template-columns:82px 1fr;gap:13px;text-align:left;align-items:center}.sr-gift img,.sr-empty{width:82px;height:82px;border-radius:13px;object-fit:cover;background:#eee8e2}.sr-empty{display:grid;place-items:center}.sr-gift div{display:grid;gap:4px}.sr-gift div small{color:#16803b;font-weight:900}.sr-gift div b{color:#16803b}.sr-status,.sr-order{margin-top:13px;display:flex;justify-content:space-between;gap:12px;padding:13px 14px;border-radius:13px;background:#f7f3ef}.sr-status strong{color:#a56a00}.sr-delivery{margin-top:13px;display:flex;gap:11px;align-items:center;text-align:left;padding:14px;border-radius:14px;background:#eaf8ef;color:#126b31}.sr-delivery div{display:grid}.sr-delivery span{font-size:12px;color:#4f755d}.sr-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:18px}.sr-actions a{text-decoration:none;border-radius:13px;padding:12px;font-weight:900}.sr-actions a:first-child{background:#d81b60;color:#fff}.sr-actions a:last-child{border:1px solid #ddd2cb;color:#29221e}.sr-spin{animation:srspin .8s linear infinite}@keyframes srspin{to{transform:rotate(360deg)}}@media(max-width:480px){.sr-actions{grid-template-columns:1fr}}
`;