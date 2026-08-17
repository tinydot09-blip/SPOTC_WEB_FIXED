'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  MapPin,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TicketPercent,
  Truck,
} from 'lucide-react';
import { collection, DocumentData, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { addProduct } from '@/lib/cart';
import { db, firebaseReady } from '@/lib/firebase';
import { getProductById } from '@/lib/data';
import type { BusinessProduct } from '@/lib/types';
import { imageOf, oldPriceOf, priceOf, titleOf } from '@/lib/utils';

type OnlineProduct = {
  id: string;
  title: string;
  image: string;
  platform: string;
  url: string;
  price: number;
  oldPrice: number;
  matchScore: number;
  productId: string;
};

const KNOWN_PLATFORMS = [
  'Amazon',
  'Amazon.in',
  'Flipkart',
  'Myntra',
  'AJIO',
  'FirstCry',
  'Meesho',
  'Tata CLiQ',
  'Nykaa',
];

const cleanText = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();

const numberOf = (value: unknown): number => {
  const parsed = Number(
    cleanText(value).replace(/[₹,%\s]/g, '').replace(/,/g, ''),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const idFromReference = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.split('/').filter(Boolean).pop() || '';
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return cleanText((value as { id?: unknown }).id);
  }
  if (typeof value === 'object' && value !== null && 'path' in value) {
    return (
      cleanText((value as { path?: unknown }).path)
        .split('/')
        .filter(Boolean)
        .pop() || ''
    );
  }
  return '';
};

const businessNameOf = (product: BusinessProduct): string => {
  const source = product as BusinessProduct & Record<string, unknown>;
  return (
    cleanText(source.business_name) ||
    cleanText(source.shop_name) ||
    cleanText(source.businessName) ||
    cleanText(source.brand) ||
    'SPOTC Shop'
  );
};

const normalizePlatform = (rawPlatform: unknown, rawUrl: unknown): string => {
  const source = cleanText(rawPlatform);
  const url = cleanText(rawUrl).toLowerCase();

  const knownFromSource = KNOWN_PLATFORMS.find((platform) =>
    source.toLowerCase().includes(platform.toLowerCase()),
  );
  if (knownFromSource) return knownFromSource;

  if (url.includes('amazon.')) return 'Amazon.in';
  if (url.includes('flipkart.')) return 'Flipkart';
  if (url.includes('myntra.')) return 'Myntra';
  if (url.includes('ajio.')) return 'AJIO';
  if (url.includes('firstcry.')) return 'FirstCry';
  if (url.includes('meesho.')) return 'Meesho';
  if (url.includes('tatacliq.')) return 'Tata CLiQ';
  if (url.includes('nykaa.')) return 'Nykaa';

  return 'Online Store';
};

const normalizeOnlineProduct = (
  id: string,
  data: DocumentData,
): OnlineProduct => {
  const url =
    cleanText(data.url) ||
    cleanText(data.link) ||
    cleanText(data.product_url);

  const rawPlatform =
    data.platform ??
    data.store_name ??
    data.store ??
    data.marketplace ??
    data.source;

  return {
    id,
    title:
      cleanText(data.title) ||
      cleanText(data.product_title) ||
      cleanText(data.product_name) ||
      cleanText(data.name) ||
      'Similar product',
    image:
      cleanText(data.image) ||
      cleanText(data.image_url) ||
      cleanText(data.thumbnail) ||
      cleanText(data.thumbnail_url),
    platform: normalizePlatform(rawPlatform, url),
    url,
    price: numberOf(data.price ?? data.selling_price ?? data.offer_price),
    oldPrice: numberOf(data.old_price ?? data.original_price ?? data.mrp),
    matchScore: Math.max(
      0,
      Math.min(
        100,
        Math.round(
          numberOf(
            data.match_score ??
              data.matchScore ??
              data.similarity_score ??
              data.similarity,
          ),
        ),
      ),
    ),
    productId:
      cleanText(data.product_id) ||
      cleanText(data.target_id) ||
      idFromReference(data.product_ref) ||
      idFromReference(data.business_product_ref),
  };
};

const wordsOf = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );

const similarityScore = (source: string, candidate: string): number => {
  const sourceWords = wordsOf(source);
  const candidateWords = wordsOf(candidate);
  if (!sourceWords.size || !candidateWords.size) return 0;

  let matches = 0;
  sourceWords.forEach((word) => {
    if (candidateWords.has(word)) matches += 1;
  });

  return Math.round((matches / sourceWords.size) * 100);
};

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString('en-IN')}`;

const platformClass = (platform: string): string => {
  const value = platform.toLowerCase();
  if (value.includes('amazon')) return 'amazon';
  if (value.includes('flipkart')) return 'flipkart';
  if (value.includes('myntra')) return 'myntra';
  if (value.includes('ajio')) return 'ajio';
  if (value.includes('firstcry')) return 'firstcry';
  return 'default';
};

function CompareOnlinePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('id')?.trim() || '';

  const [product, setProduct] = useState<BusinessProduct | null>(null);
  const [onlineProducts, setOnlineProducts] = useState<OnlineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  const selectedTitle = useMemo(
    () => (product ? titleOf(product) : ''),
    [product],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError('');

      try {
        if (!productId) throw new Error('Product id is missing.');

        const selected = await getProductById(productId);
        if (!selected) {
          throw new Error('The selected product could not be found.');
        }

        if (cancelled) return;
        setProduct(selected);

        if (!firebaseReady || !db) {
          setOnlineProducts([]);
          return;
        }

        // 1) First use cached comparison results already saved for this product.
        let nestedSnapshot = await getDocs(
          collection(db, 'BusinessProducts', productId, 'OnlineProducts'),
        );

        let items = nestedSnapshot.docs.map((document) =>
          normalizeOnlineProduct(document.id, document.data()),
        );

        // 2) No cached results: run the existing Firebase callable that uses
        //    SerpApi Google Lens, saves matching products to
        //    BusinessProducts/{productId}/OnlineProducts, then read them back.
        if (!items.length) {
          try {
            const functions = getFunctions(undefined, 'asia-south1');
            const generateProductComparison = httpsCallable<
              { productId: string },
              {
                ok?: boolean;
                status?: string;
                count?: number;
                source?: string;
              }
            >(functions, 'generateProductComparison');

            await generateProductComparison({ productId });

            if (cancelled) return;

            nestedSnapshot = await getDocs(
              collection(db, 'BusinessProducts', productId, 'OnlineProducts'),
            );

            items = nestedSnapshot.docs.map((document) =>
              normalizeOnlineProduct(document.id, document.data()),
            );
          } catch (comparisonError) {
            // Keep the page usable even when the live comparison service fails.
            // We still try the older root-level OnlineProducts cache below.
            console.error(
              'Generating live online comparison failed:',
              comparisonError,
            );
          }
        }

        // 3) Backward-compatible fallback for older root-level comparison data.
        if (!items.length) {
          const rootSnapshot = await getDocs(collection(db, 'OnlineProducts'));
          items = rootSnapshot.docs.map((document) =>
            normalizeOnlineProduct(document.id, document.data()),
          );
        }

        if (cancelled) return;

        const usable = items.filter((item) => item.title && item.url);

        const exactMatches = usable.filter(
          (item) => item.productId === productId,
        );

        const ranked = (exactMatches.length > 0 ? exactMatches : usable)
          .map((item) => ({
            ...item,
            matchScore:
              item.matchScore ||
              similarityScore(titleOf(selected), item.title),
          }))
          .filter((item) => {
            // Directly generated/nested results should always be kept.
            // Older root-level records need at least a small title match.
            if (exactMatches.length > 0) return true;
            return item.matchScore >= 20;
          })
          .sort((a, b) => {
            if (a.productId === productId && b.productId !== productId) return -1;
            if (b.productId === productId && a.productId !== productId) return 1;
            return b.matchScore - a.matchScore;
          })
          .slice(0, 8);

        setOnlineProducts(ranked);
      } catch (reason) {
        console.error('Compare Online load failed:', reason);
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load comparison.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <main className="page-state">
        <Loader2 className="spinner" size={38} />
        <h1>Checking SPOTC value</h1>
        <p>Comparing this product with similar online listings…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="page-state">
        <ShoppingBag size={44} />
        <h1>Comparison unavailable</h1>
        <p>{error || 'The selected product could not be loaded.'}</p>
        <button type="button" onClick={() => router.back()}>
          Go back
        </button>
        <style jsx>{styles}</style>
      </main>
    );
  }

  const selectedImage = imageOf(product);
  const selectedPrice = priceOf(product);
  const selectedOldPrice = oldPriceOf(product);

  const purchaseRewardPoints = Math.max(1, Math.round(selectedPrice / 50));
  const nearbyShopBonusPoints = 5;
  const couponCount = 3;
  const couponValueEach = 100;
  const couponTotalValue = couponCount * couponValueEach;
  const totalRewardPoints = purchaseRewardPoints + nearbyShopBonusPoints;

  const pricedOnlineProducts = onlineProducts.filter((item) => item.price > 0);
  const typicalOnlinePrice = pricedOnlineProducts.length
    ? Math.round(
        pricedOnlineProducts.reduce((sum, item) => sum + item.price, 0) /
          pricedOnlineProducts.length,
      )
    : 0;
  const estimatedSaving =
    typicalOnlinePrice > selectedPrice
      ? typicalOnlinePrice - selectedPrice
      : 0;

  const handleAddToCart = () => {
    addProduct(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2400);
  };

  return (
    <main className="compare-page">
      <div className="compare-shell">
        <header className="page-header">
          <button
            type="button"
            className="back-button"
            aria-label="Go back"
            onClick={() => router.back()}
          >
            <ArrowLeft size={21} />
          </button>

          <div>
            <span>SPOTC VALUE CHECK</span>
            <h1>Why Buy This on SPOTC?</h1>
            <p>
              We checked similar products online so you can see the real value
              of buying locally.
            </p>
          </div>

          <div className="header-spacer" />
        </header>

        <section className="decision-grid">
          <article className="selected-card">
            <div className="selected-label">
              <BadgeCheck size={16} />
              Selected SPOTC product
            </div>

            <div className="selected-content">
              <div className="selected-image">
                {selectedImage ? (
                  <img src={selectedImage} alt={selectedTitle} />
                ) : (
                  <ShoppingBag size={34} />
                )}
              </div>

              <div className="selected-info">
                <p className="business-name">{businessNameOf(product)}</p>
                <h2>{selectedTitle}</h2>

                <div className="selected-price">
                  <strong>{money(selectedPrice)}</strong>
                  {selectedOldPrice > selectedPrice && selectedOldPrice > 0 && (
                    <del>{money(selectedOldPrice)}</del>
                  )}
                </div>

                <div className="benefits">
                  <span><Truck size={14} />15 min delivery</span>
                  <span><ShieldCheck size={14} />COD</span>
                  <span><Gift size={14} />Rewards</span>
                </div>
              </div>
            </div>
          </article>

          <aside className="recommendation-card">
            <div className="recommendation-head">
              <CheckCircle2 size={23} />
              <div>
                <span>SPOTC RECOMMENDS</span>
                <h2>Buy locally with more value</h2>
              </div>
            </div>

            {estimatedSaving > 0 && (
              <div className="saving-highlight">
                <strong>Save about {money(estimatedSaving)}</strong>
                <span>compared with the average matching online price</span>
              </div>
            )}

            <button type="button" className="primary-cta" onClick={handleAddToCart}>
              <ShoppingBag size={18} />
              {added ? 'Added to cart' : `Add to Cart • ${money(selectedPrice)}`}
            </button>

            <Link className="secondary-cta" href={`/product/${product.id}`}>
              View full product details
            </Link>
          </aside>
        </section>

        <section className="reward-section">
          <div className="reward-heading">
            <div>
              <span>YOUR SPOTC PURCHASE BENEFITS</span>
              <h2>More value from one purchase</h2>
            </div>

            <div className="reward-total">
              <strong>{totalRewardPoints} points</strong>
              <span>+ coupons worth {money(couponTotalValue)}</span>
            </div>
          </div>

          <div className="reward-grid">
            <article className="reward-card">
              <div className="reward-icon"><Gift size={22} /></div>
              <div>
                <strong>{purchaseRewardPoints}</strong>
                <h3>Purchase reward points</h3>
                <p>Earned automatically when you buy this product.</p>
              </div>
            </article>

            <article className="reward-card">
              <div className="reward-icon"><MapPin size={22} /></div>
              <div>
                <strong>+{nearbyShopBonusPoints}</strong>
                <h3>Nearby-shop bonus points</h3>
                <p>Automatically included from 3 nearby SPOTC partner shops.</p>
              </div>
            </article>

            <article className="reward-card">
              <div className="reward-icon"><TicketPercent size={22} /></div>
              <div>
                <strong>{couponCount}</strong>
                <h3>Local shop coupons</h3>
                <p>Three coupons worth {money(couponValueEach)} each.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="comparison-summary">
          <div className="summary-title">
            <Sparkles size={20} />
            <div>
              <span>SPOTC VS TYPICAL ONLINE</span>
              <h2>The complete value comparison</h2>
            </div>
          </div>

          <div className="summary-table">
            <div className="summary-row summary-header">
              <span>Benefit</span><span>SPOTC</span><span>Typical online</span>
            </div>
            <div className="summary-row">
              <span>Price</span><strong>{money(selectedPrice)}</strong>
              <span>{typicalOnlinePrice > 0 ? money(typicalOnlinePrice) : 'Varies'}</span>
            </div>
            <div className="summary-row">
              <span>Delivery</span><strong>About 15 minutes</strong><span>Usually 2–5 days</span>
            </div>
            <div className="summary-row">
              <span>Cash on delivery</span><strong>Available</strong><span>Depends on seller</span>
            </div>
            <div className="summary-row">
              <span>Rewards</span><strong>{totalRewardPoints} points + {couponCount} coupons</strong><span>Usually none</span>
            </div>
            <div className="summary-row">
              <span>Local support</span><strong>Direct nearby-shop support</strong><span>Platform or courier process</span>
            </div>
          </div>
        </section>

        <section className="results-section">
          <div className="section-heading">
            <div>
              <span>ONLINE PRICE REFERENCE</span>
              <h2>What similar products cost online</h2>
              <p>These listings are shown only as product and price references.</p>
            </div>
            <div className="result-count">
              {onlineProducts.length}<span>references</span>
            </div>
          </div>

          {onlineProducts.length ? (
            <div className="online-grid">
              {onlineProducts.map((item) => {
                const hasPrice = item.price > 0;
                const difference = hasPrice ? item.price - selectedPrice : 0;

                return (
                  <article className="online-card" key={item.id}>
                    <div className="online-image">
                      {item.image ? (
                        <img src={item.image} alt={item.title} />
                      ) : (
                        <ShoppingBag size={28} />
                      )}
                      {item.matchScore > 0 && (
                        <span className="match-chip">{item.matchScore}% similar</span>
                      )}
                    </div>

                    <div className="online-info">
                      <span className={`platform-badge ${platformClass(item.platform)}`}>
                        {item.platform}
                      </span>
                      <h3>{item.title}</h3>

                      <div className="online-price">
                        {hasPrice ? <strong>{money(item.price)}</strong> : <span>Check latest price</span>}
                      </div>

                      {hasPrice && difference !== 0 && (
                        <p className={difference > 0 ? 'difference higher' : 'difference lower'}>
                          {difference > 0
                            ? `${money(difference)} more than SPOTC`
                            : `${money(Math.abs(difference))} cheaper online`}
                        </p>
                      )}

                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        View source <ExternalLink size={14} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div><PackageSearch size={38} /></div>
              <h3>No reliable online reference found</h3>
              <p>SPOTC purchase benefits are still available for this product.</p>
            </div>
          )}
        </section>

        <div className="mobile-buy-bar">
          <div>
            <strong>{money(selectedPrice)}</strong>
            <span>Earn {totalRewardPoints} points + 3 coupons</span>
          </div>
          <button type="button" onClick={handleAddToCart}>
            <ShoppingBag size={17} />{added ? 'Added' : 'Add to Cart'}
          </button>
        </div>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}


export default function CompareOnlinePage() {
  return (
    <Suspense
      fallback={
        <main className="page-state">
          <Loader2 className="spinner" size={38} />
          <h1>Checking SPOTC value</h1>
          <p>
            Comparing this product with similar online listings…
          </p>
          <style jsx>{styles}</style>
        </main>
      }
    >
      <CompareOnlinePageContent />
    </Suspense>
  );
}

const styles = `
  :global(*) { box-sizing: border-box; }
  :global(html), :global(body) { margin: 0; min-height: 100%; background: #f7f5f1; }
  :global(button), :global(a) { font: inherit; }

  .compare-page {
    min-height: 100vh;
    padding: 28px 24px 76px;
    color: #29241f;
    background: radial-gradient(circle at top left, rgba(229,122,31,.08), transparent 30rem), linear-gradient(180deg,#fbfaf8 0%,#f4f1ec 100%);
  }

  .compare-shell { width: min(1240px, 100%); margin: 0 auto; }

  .page-header {
    min-height: 86px; padding: 14px 18px; display: grid;
    grid-template-columns: 46px 1fr 46px; align-items: center; gap: 16px;
    border: 1px solid #e8dfd5; border-radius: 20px; background: rgba(255,255,255,.94);
    box-shadow: 0 10px 28px rgba(69,48,31,.06);
  }
  .page-header > div:nth-child(2) { text-align: center; }
  .page-header span,.selected-label,.reward-heading span,.summary-title span,.section-heading span,.recommendation-head span { color:#d96f12; font-size:10px; font-weight:600; letter-spacing:.11em; }
  .page-header h1 { margin:3px 0 2px; color:#211d19; font-size:25px; font-weight:600; letter-spacing:-.03em; }
  .page-header p { margin:0; color:#7b7168; font-size:13px; }
  .back-button { width:44px; height:44px; display:grid; place-items:center; border:1px solid #e2d8cd; border-radius:14px; color:#302a25; background:#fff; cursor:pointer; }
  .header-spacer { width:44px; }

  .decision-grid { margin-top:20px; display:grid; grid-template-columns:minmax(0,1.45fr) minmax(320px,.55fr); gap:20px; }
  .selected-card,.recommendation-card,.reward-section,.comparison-summary,.results-section { border:1px solid #eadfd3; border-radius:22px; background:rgba(255,255,255,.96); box-shadow:0 14px 38px rgba(75,50,28,.07); }
  .selected-card { padding:20px; }
  .selected-label { margin-bottom:14px; display:flex; align-items:center; gap:7px; }
  .selected-content { display:grid; grid-template-columns:138px minmax(0,1fr); gap:20px; align-items:center; }
  .selected-image { width:138px; height:138px; overflow:hidden; display:grid; place-items:center; border-radius:18px; color:#a69a90; background:#f4efe9; }
  .selected-image img,.online-image img { width:100%; height:100%; object-fit:contain; }
  .selected-info { min-width:0; }
  .business-name { margin:0 0 5px; color:#d96f12; font-size:13px; font-weight:600; text-transform:uppercase; }
  .selected-info h2 { margin:0 0 13px; color:#1f1b18; font-size:21px; line-height:1.3; font-weight:500; }
  .selected-price { display:flex; align-items:baseline; gap:10px; }
  .selected-price strong { color:#e66e00; font-size:30px; font-weight:600; }
  .selected-price del { color:#9a9189; font-size:15px; }
  .benefits { margin-top:13px; display:flex; flex-wrap:wrap; gap:9px; }
  .benefits span { padding:7px 10px; display:inline-flex; align-items:center; gap:5px; border-radius:999px; color:#197a42; background:#ecf8ef; font-size:12px; font-weight:500; }

  .recommendation-card { padding:22px; color:#fff; border-color:#dc7419; background:linear-gradient(145deg,#e8842d 0%,#cf600b 100%); }
  .recommendation-head { display:flex; align-items:flex-start; gap:11px; }
  .recommendation-head span { color:rgba(255,255,255,.72); }
  .recommendation-head h2 { margin:4px 0 0; font-size:21px; line-height:1.25; font-weight:500; }
  .saving-highlight { margin-top:18px; padding:13px; border-radius:15px; background:rgba(255,255,255,.12); }
  .saving-highlight strong,.saving-highlight span { display:block; }
  .saving-highlight strong { font-size:18px; font-weight:600; }
  .saving-highlight span { margin-top:3px; color:rgba(255,255,255,.76); font-size:11px; }
  .primary-cta { width:100%; margin-top:18px; padding:12px 14px; display:flex; align-items:center; justify-content:center; gap:8px; border:0; border-radius:13px; color:#b95105; background:#fff; cursor:pointer; font-weight:600; }
  .secondary-cta { margin-top:11px; display:block; color:rgba(255,255,255,.9); text-align:center; text-decoration:none; font-size:12px; }

  .reward-section,.comparison-summary,.results-section { margin-top:20px; padding:24px; }
  .reward-heading,.section-heading { margin-bottom:19px; display:flex; align-items:flex-end; justify-content:space-between; gap:18px; }
  .reward-heading h2,.summary-title h2,.section-heading h2 { margin:4px 0 0; color:#211d19; font-size:23px; font-weight:600; letter-spacing:-.03em; }
  .reward-total { padding:10px 13px; border-radius:15px; background:#fff1e3; text-align:right; }
  .reward-total strong,.reward-total span { display:block; }
  .reward-total strong { color:#d96f12; font-size:17px; font-weight:600; }
  .reward-total span { margin-top:2px; color:#8e6541; font-size:10px; }
  .reward-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .reward-card { padding:17px; display:grid; grid-template-columns:46px 1fr; gap:12px; border:1px solid #eee4db; border-radius:17px; background:#fcfaf7; }
  .reward-icon { width:46px; height:46px; display:grid; place-items:center; border-radius:14px; color:#d96f12; background:#fff0e1; }
  .reward-card strong { color:#e66e00; font-size:25px; font-weight:600; }
  .reward-card h3 { margin:2px 0 4px; font-size:14px; font-weight:500; }
  .reward-card p { margin:0; color:#80756b; font-size:11px; line-height:1.45; }

  .summary-title { display:flex; align-items:center; gap:10px; }
  .summary-title > :global(svg) { color:#d96f12; }
  .summary-table { margin-top:18px; overflow:hidden; border:1px solid #ebe1d7; border-radius:16px; }
  .summary-row { min-height:52px; padding:11px 15px; display:grid; grid-template-columns:1.1fr 1fr 1fr; align-items:center; gap:12px; border-top:1px solid #eee5dc; font-size:13px; }
  .summary-row:first-child { border-top:0; }
  .summary-row strong { color:#197a42; font-weight:600; }
  .summary-header { color:#6f655c; background:#f7f3ee; font-size:11px; font-weight:600; }

  .section-heading p { margin:4px 0 0; color:#7e746b; font-size:13px; }
  .result-count { min-width:78px; padding:10px 12px; border-radius:15px; color:#e66e00; background:#fff2e5; text-align:center; font-size:21px; font-weight:600; }
  .result-count span { display:block; margin-top:1px; color:#9c6b42; font-size:10px; }
  .online-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:15px; }
  .online-card { overflow:hidden; border:1px solid #ece3da; border-radius:18px; background:#fff; box-shadow:0 8px 22px rgba(75,50,28,.05); }
  .online-image { position:relative; width:100%; height:210px; overflow:hidden; display:grid; place-items:center; color:#a69a90; background:#f7f4ef; }
  .online-image img { padding:10px; }
  .match-chip { position:absolute; left:10px; bottom:10px; padding:6px 8px; border-radius:999px; color:#fff; background:rgba(28,26,24,.78); font-size:10px; font-weight:500; }
  .online-info { padding:14px; }
  .platform-badge { display:inline-flex; padding:5px 8px; border-radius:999px; font-size:10px; font-weight:500; text-transform:uppercase; }
  .platform-badge.amazon { color:#6f4300; background:#fff0cf; }
  .platform-badge.flipkart { color:#174f9d; background:#e7f0ff; }
  .platform-badge.myntra { color:#b21d5c; background:#ffe6f1; }
  .platform-badge.ajio { color:#5f4b00; background:#f5efce; }
  .platform-badge.firstcry { color:#176c6f; background:#dcf5f4; }
  .platform-badge.default { color:#5d5148; background:#eee9e4; }
  .online-info h3 { min-height:42px; margin:9px 0 8px; overflow:hidden; color:#24201d; font-size:13px; line-height:1.4; font-weight:500; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .online-price strong { color:#1e1a17; font-size:18px; font-weight:600; }
  .online-price span { color:#867b72; font-size:12px; }
  .difference { margin:6px 0 0; font-size:11px; font-weight:500; }
  .difference.higher { color:#b45a0c; }
  .difference.lower { color:#197a42; }
  .online-info a { margin-top:11px; display:inline-flex; align-items:center; gap:5px; color:#6f655c; text-decoration:none; font-size:11px; }
  .online-info a:hover { color:#d96f12; }

  .empty-state { min-height:210px; padding:28px; display:grid; place-items:center; align-content:center; border:1px dashed #dfd3c7; border-radius:18px; text-align:center; background:#fcfaf7; }
  .empty-state > div { width:66px; height:66px; display:grid; place-items:center; border-radius:18px; color:#d96f12; background:#fff0e1; }
  .empty-state h3 { margin:14px 0 5px; font-size:18px; font-weight:500; }
  .empty-state p { margin:0; color:#81766d; font-size:13px; }

  .mobile-buy-bar { display:none; }
  .page-state { min-height:100vh; padding:30px; display:grid; place-content:center; justify-items:center; color:#201c18; text-align:center; background:#f6f3ee; }
  .page-state h1 { margin:16px 0 5px; font-weight:600; }
  .page-state p { margin:0 0 18px; color:#80756c; }
  .page-state button { padding:11px 18px; border:0; border-radius:12px; color:#fff; background:#d96f12; cursor:pointer; font-weight:500; }
  .spinner { color:#d96f12; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  @media (max-width:1050px) {
    .decision-grid { grid-template-columns:1fr; }
    .reward-grid { grid-template-columns:1fr; }
    .online-grid { grid-template-columns:repeat(2,1fr); }
  }

  @media (max-width:680px) {
    .compare-page { padding:12px 12px 100px; }
    .page-header { min-height:70px; padding:10px; grid-template-columns:40px 1fr 40px; border-radius:16px; }
    .page-header h1 { font-size:20px; }
    .page-header p,.page-header span { display:none; }
    .back-button,.header-spacer { width:38px; height:38px; }
    .selected-card,.recommendation-card,.reward-section,.comparison-summary,.results-section { border-radius:18px; padding:16px; }
    .selected-content { grid-template-columns:94px 1fr; gap:13px; }
    .selected-image { width:94px; height:94px; }
    .selected-info h2 { font-size:15px; }
    .selected-price strong { font-size:23px; }
    .benefits span { padding:5px 7px; font-size:10px; }
    .reward-heading,.section-heading { align-items:center; }
    .reward-heading h2,.summary-title h2,.section-heading h2 { font-size:19px; }
    .reward-total { display:none; }
    .summary-table { overflow-x:auto; }
    .summary-row { min-width:560px; }
    .online-grid { grid-template-columns:1fr; }
    .online-card { display:grid; grid-template-columns:112px 1fr; }
    .online-image { height:100%; min-height:165px; }
    .mobile-buy-bar { position:fixed; right:0; bottom:0; left:0; z-index:100; padding:11px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid #e4d9ce; background:rgba(255,255,255,.96); backdrop-filter:blur(12px); box-shadow:0 -8px 28px rgba(55,37,23,.1); }
    .mobile-buy-bar > div { min-width:0; }
    .mobile-buy-bar strong,.mobile-buy-bar span { display:block; }
    .mobile-buy-bar strong { color:#e66e00; font-size:20px; font-weight:600; }
    .mobile-buy-bar span { overflow:hidden; color:#786e65; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .mobile-buy-bar button { padding:11px 15px; display:flex; align-items:center; gap:7px; border:0; border-radius:12px; color:#fff; background:#d96f12; white-space:nowrap; font-weight:600; }
  }

  @media (max-width:420px) {
    .selected-content { grid-template-columns:82px 1fr; }
    .selected-image { width:82px; height:82px; }
    .benefits span:nth-child(3) { display:none; }
    .online-card { grid-template-columns:102px 1fr; }
  }
`;