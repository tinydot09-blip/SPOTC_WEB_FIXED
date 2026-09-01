'use client';

import { Check, Gift, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { requireGoogleLogin } from '@/lib/auth';
import { getProducts } from '@/lib/data';
import { db, firebaseReady } from '@/lib/firebase';
import type { BusinessProduct } from '@/lib/types';
import { imageOf, text, titleOf } from '@/lib/utils';

const CAMPAIGN_KEY = 'spotc-share5-campaign-v1';
const GIFT_KEY = 'spotc-share5-selected-gift';
const CAMPAIGN_ID = 'share5_get1free_2026';

type ProductRecord = BusinessProduct & Record<string, unknown>;

type SelectedCampaignGift = {
  id: string;
  title: string;
  image: string;
  originalPrice: number;
  claimId: string;
};

const numberValue = (value: unknown): number | null => {
  const parsed = Number(String(value ?? '').replace(/[₹,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const boolValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  return null;
};

const priceOfGift = (product: BusinessProduct) => {
  const record = product as ProductRecord;
  return (
    numberValue(record.offer_price) ??
    numberValue(record.selling_price) ??
    numberValue(record.price) ??
    numberValue(record.mrp ?? record.old_price) ??
    0
  );
};

export default function ShareRewardGiftPage() {
  const router = useRouter();
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [claimId, setClaimId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!firebaseReady || !db) {
        setMessage('SPOTC is not connected right now. Please try again.');
        setLoading(false);
        return;
      }

      const user = await requireGoogleLogin();
      if (!user || !active) {
        setLoading(false);
        return;
      }

      const local = (() => {
        try {
          return JSON.parse(window.localStorage.getItem(CAMPAIGN_KEY) || '{}') as {
            sharedProductIds?: string[];
            proofSubmitted?: boolean;
            claimId?: string;
          };
        } catch {
          return {};
        }
      })();

      const resolvedClaimId = local.claimId || `${CAMPAIGN_ID}_${user.uid}`;
      const claimSnap = await getDoc(doc(db, 'ShareRewardClaims', resolvedClaimId));

      if (!claimSnap.exists() || claimSnap.data().user_uid !== user.uid) {
        setMessage('Upload your WhatsApp proof first.');
        setLoading(false);
        return;
      }

      const claimStatus = String(claimSnap.data().status || '').toLowerCase();
      if (!['proof_submitted', 'gift_selected', 'pending_verification'].includes(claimStatus)) {
        setMessage('This reward claim is not ready for gift selection.');
        setLoading(false);
        return;
      }

      const allProducts = await getProducts();
      if (!active) return;

      const gifts = allProducts
        .filter((item) => {
          const record = item as ProductRecord;
          const price = priceOfGift(item);
          const stock = numberValue(record.stock_qty ?? record.stock_quantity);
          const reserved = numberValue(record.reserved_qty) ?? 0;
          const availableStored = numberValue(record.available_qty);
          const available =
            availableStored !== null
              ? availableStored
              : stock !== null
                ? Math.max(0, stock - reserved)
                : null;

          const activeProduct = boolValue(record.isActive ?? record.is_active) !== false;
          const inStock =
            boolValue(record.is_in_stock) !== false &&
            !(available !== null && available <= 0) &&
            !(stock !== null && stock <= 0);

          return activeProduct && inStock && price > 0 && price < 50;
        })
        .sort((a, b) => priceOfGift(b) - priceOfGift(a));

      setClaimId(resolvedClaimId);
      setProducts(gifts);
      setSelectedId(String(claimSnap.data().selected_gift_id || ''));
      setLoading(false);
    })().catch((error) => {
      console.error('Loading campaign gifts failed:', error);
      if (active) {
        setMessage('Unable to load FREE gifts. Please try again.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const values = products
      .map((item) => {
        const record = item as ProductRecord;
        return text(record.main_category || record.category || record.sub_category).trim();
      })
      .filter(Boolean);
    return ['All', ...Array.from(new Set(values))];
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((item) => {
      const record = item as ProductRecord;
      const itemCategory = text(record.main_category || record.category || record.sub_category).trim();
      const categoryOk = category === 'All' || itemCategory === category;
      const searchText = [titleOf(item), record.brand, itemCategory, record.sub_category]
        .map((value) => text(value).toLowerCase())
        .join(' ');
      return categoryOk && (!q || searchText.includes(q));
    });
  }, [products, category, search]);

  const selected = products.find((item) => String(item.id) === selectedId) || null;

  const continueWithGift = async () => {
    if (!selected || !claimId || !db || saving) return;

    const user = await requireGoogleLogin();
    if (!user) return;

    const gift: SelectedCampaignGift = {
      id: String(selected.id),
      title: titleOf(selected),
      image: imageOf(selected),
      originalPrice: priceOfGift(selected),
      claimId,
    };

    setSaving(true);
    setMessage('');

    try {
      await setDoc(
        doc(db, 'ShareRewardClaims', claimId),
        {
          selected_gift_id: gift.id,
          selected_gift_title: gift.title,
          selected_gift_image: gift.image,
          selected_gift_original_price: gift.originalPrice,
          status: 'gift_selected',
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );

      window.localStorage.setItem(GIFT_KEY, JSON.stringify(gift));
      router.push('/share-reward/checkout');
    } catch (error) {
      console.error('Saving selected campaign gift failed:', error);
      setMessage('Unable to save this gift. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="sr-gift-page sr-gift-state">
        <Loader2 className="sr-spin" />
        <p>Loading your FREE gifts…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="sr-gift-page">
      <header className="sr-gift-head">
        <div className="sr-gift-title-icon"><Gift /></div>
        <div>
          <small>PROOF RECEIVED ✓</small>
          <h1>Choose Your 1 FREE Gift</h1>
          <p>Browse all available FREE products and select the one you like.</p>
        </div>
      </header>

      {message && <div className="sr-message">{message}</div>}

      {products.length > 0 && (
        <>
          <div className="sr-tools">
            <label className="sr-search">
              <Search />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search FREE gifts" />
            </label>
            <div className="sr-categories">
              {categories.map((item) => (
                <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <section className="sr-grid">
            {visible.map((item) => {
              const id = String(item.id);
              const isSelected = id === selectedId;
              const image = imageOf(item);
              const value = priceOfGift(item);

              return (
                <button key={id} type="button" className={`sr-gift-card${isSelected ? ' selected' : ''}`} onClick={() => setSelectedId(id)}>
                  <div className="sr-image-wrap">
                    {image ? <img src={image} alt={titleOf(item)} loading="lazy" /> : <div className="sr-image-empty"><Gift /></div>}
                    {isSelected && <span className="sr-selected"><Check /></span>}
                  </div>
                  <strong>{titleOf(item)}</strong>
                  <div className="sr-price"><span>₹{Math.round(value)}</span><b>FREE</b></div>
                </button>
              );
            })}
          </section>

          <div className="sr-bottom">
            <div>
              {selected ? (
                <><small>SELECTED</small><strong>{titleOf(selected)}</strong></>
              ) : (
                <strong>Select any 1 FREE gift</strong>
              )}
            </div>
            <button type="button" disabled={!selected || saving} onClick={continueWithGift}>
              {saving ? <Loader2 className="sr-spin" /> : <Gift />}
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .sr-gift-page{min-height:100vh;background:#fbfaf7;padding:22px 14px 110px;color:#171717}.sr-gift-state{display:grid;place-items:center;text-align:center}.sr-gift-head,.sr-tools,.sr-grid,.sr-message{width:min(980px,100%);margin-left:auto;margin-right:auto}.sr-gift-head{display:flex;gap:14px;align-items:flex-start}.sr-gift-title-icon{width:54px;height:54px;min-width:54px;border-radius:17px;display:grid;place-items:center;background:#ffe7ef;color:#d81b60}.sr-gift-title-icon svg{width:28px}.sr-gift-head small{color:#16803b;font-weight:900;letter-spacing:.08em}.sr-gift-head h1{margin:5px 0 5px;font-size:clamp(28px,5vw,42px)}.sr-gift-head p{margin:0;color:#70645f}.sr-message{margin-top:14px;padding:12px 14px;border-radius:13px;background:#fff1cf;color:#6b5200;font-weight:700}.sr-tools{margin-top:20px}.sr-search{height:46px;border:1px solid #ddd4ce;border-radius:14px;background:#fff;display:flex;align-items:center;gap:9px;padding:0 13px}.sr-search svg{width:19px;color:#716660}.sr-search input{border:0;outline:0;flex:1;font:inherit;background:transparent}.sr-categories{display:flex;gap:8px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:none}.sr-categories::-webkit-scrollbar{display:none}.sr-categories button{white-space:nowrap;border:1px solid #e0d7d1;border-radius:999px;background:#fff;padding:8px 12px;font-weight:800;color:#514943}.sr-categories button.active{border-color:#d81b60;background:#d81b60;color:#fff}.sr-grid{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.sr-gift-card{border:1px solid #e8dfd9;border-radius:17px;background:#fff;padding:8px;text-align:left;cursor:pointer;box-shadow:0 6px 18px rgba(32,18,10,.04)}.sr-gift-card.selected{border:2px solid #d81b60;box-shadow:0 9px 24px rgba(216,27,96,.13)}.sr-image-wrap{position:relative;aspect-ratio:1/1;border-radius:13px;overflow:hidden;background:#f6f2ed}.sr-image-wrap img{width:100%;height:100%;object-fit:cover}.sr-image-empty{height:100%;display:grid;place-items:center;color:#b9aaa1}.sr-selected{position:absolute;right:8px;top:8px;width:28px;height:28px;border-radius:999px;background:#d81b60;color:#fff;display:grid;place-items:center}.sr-selected svg{width:16px}.sr-gift-card>strong{display:block;margin:9px 3px 5px;font-size:13px;line-height:1.35;min-height:35px}.sr-price{display:flex;align-items:center;gap:7px;margin:0 3px 4px}.sr-price span{text-decoration:line-through;color:#8a7d75;font-size:12px}.sr-price b{color:#16803b}.sr-bottom{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid #e9e1dc;padding:11px max(14px,calc((100vw - 980px)/2));display:flex;align-items:center;justify-content:space-between;gap:12px}.sr-bottom>div{min-width:0;display:grid}.sr-bottom small{color:#16803b;font-size:10px;font-weight:900}.sr-bottom strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sr-bottom button{min-height:48px;border:0;border-radius:14px;background:#d81b60;color:#fff;padding:0 18px;font-weight:900;display:flex;align-items:center;gap:7px}.sr-bottom button:disabled{opacity:.5}.sr-bottom button svg{width:19px}.sr-spin{animation:srspin .8s linear infinite}@keyframes srspin{to{transform:rotate(360deg)}}@media(max-width:760px){.sr-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sr-gift-head{align-items:center}.sr-gift-card>strong{font-size:12px}}
`;