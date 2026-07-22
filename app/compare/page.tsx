'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import { doc, getFirestore } from 'firebase/firestore';

import { getProducts } from '@/lib/data';
import type { BusinessProduct } from '@/lib/types';
import {
  discountOf,
  imageOf,
  oldPriceOf,
  priceOf,
  titleOf,
} from '@/lib/utils';
import { auth, firebaseReady } from '@/lib/firebase';
import { requireGoogleLogin } from '@/lib/auth';
import {
  createComparisonShoppingCircle,
  type CircleProduct,
} from '@/lib/shoppingCircle';

function businessNameOf(product: BusinessProduct): string {
  const value =
    product.business_name ||
    product.shop_name ||
    product.brand ||
    product.business_title ||
    '';

  return String(value || 'SPOTC Shop').trim();
}

function businessIdOf(product: BusinessProduct): string {
  const raw =
    product.business_id ||
    product.businessId ||
    product.business_ref ||
    product.businessRef ||
    '';

  if (typeof raw === 'string') {
    return raw.split('/').filter(Boolean).pop() || '';
  }

  if (
    raw &&
    typeof raw === 'object' &&
    'id' in raw &&
    typeof raw.id === 'string'
  ) {
    return raw.id;
  }

  return '';
}

function formatMoney(value: number): string {
  return `₹${value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

function ComparePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<BusinessProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingCircle, setCreatingCircle] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('Which one should I buy?');

  const ids = useMemo(() => {
    return (searchParams.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 3);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError('');

      try {
        const products = await getProducts();

        if (cancelled) return;

        const orderedItems = ids
          .map((id) => products.find((product) => product.id === id))
          .filter((product): product is BusinessProduct => Boolean(product));

        setItems(orderedItems);

        if (orderedItems.length < 2) {
          setError('Select at least two products to compare.');
        }
      } catch (loadError) {
        console.error('Compare products load failed:', loadError);

        if (!cancelled) {
          setError('Could not load the selected products.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [ids]);

  async function handleCreateShoppingCircle() {
    if (creatingCircle) return;

    if (!firebaseReady) {
      setError('Firebase is not ready. Check your Firebase configuration.');
      return;
    }

    if (items.length < 2) {
      setError('Select at least two products before creating a circle.');
      return;
    }

    setCreatingCircle(true);
    setError('');

    try {
      if (!auth) {
  throw new Error('Firebase authentication is not available.');
}

const user = auth.currentUser || (await requireGoogleLogin());

      if (!user) {
        throw new Error('Please sign in to create a Shopping Circle.');
      }

      const db = getFirestore(auth.app);

      const products: CircleProduct[] = items.map((product) => {
        const businessId = businessIdOf(product);

        return {
          id: product.id,
          title: titleOf(product),
          image: imageOf(product),
          price: priceOf(product),
          old_price: oldPriceOf(product),
          discount: discountOf(product),
          business_name: businessNameOf(product),

          product_ref: product.id
            ? doc(db, 'BusinessProducts', product.id)
            : null,

          business_ref: businessId
            ? doc(db, 'BusinessListings', businessId)
            : null,
        };
      });

      const result = await createComparisonShoppingCircle(db, {
        products,
        userUid: user.uid,
        userRef: doc(db, 'Users', user.uid),
        userName: user.displayName || 'SPOTC User',
        userPhoto: user.photoURL || '',
        question: question.trim() || 'Which one should I buy?',
      });

      router.push(
        `/circle/${encodeURIComponent(result.shareCode)}`,
      );
    } catch (createError) {
      console.error('Shopping Circle creation failed:', createError);

      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create the Shopping Circle.',
      );
    } finally {
      setCreatingCircle(false);
    }
  }

  if (loading) {
    return (
      <main className="compare-state">
        <Loader2 className="spin" size={38} />

        <h1>Loading comparison</h1>

        <p>Preparing your selected products…</p>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="compare-page">
      <section className="compare-shell">
        <header className="compare-header">
          <button
            type="button"
            className="back-button"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft size={21} />
          </button>

          <div className="header-copy">
            <span className="eyebrow">SPOTC SHOPPING CIRCLE</span>

            <h1>Compare products</h1>

            <p>
              Review your selected products, then ask friends and family
              to help you decide.
            </p>
          </div>

          <div className="selected-count">
            <GitCompareArrows size={19} />

            <strong>{items.length}</strong>

            <span>selected</span>
          </div>
        </header>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {items.length > 0 ? (
          <>
            <section className="comparison-grid">
              {items.map((product, index) => {
                const price = priceOf(product);
                const oldPrice = oldPriceOf(product);
                const discount = discountOf(product);
                const image = imageOf(product);
                const title = titleOf(product);

                return (
                  <article className="product-card" key={product.id}>
                    <div className="product-image">
                      {image ? (
                        <img
                          src={image}
                          alt={title}
                        />
                      ) : (
                        <div className="image-placeholder">
                          <ShoppingBag size={44} />
                        </div>
                      )}

                      <span className="product-number">
                        {index + 1}
                      </span>

                      {discount > 0 && (
                        <span className="discount-badge">
                          {discount}% OFF
                        </span>
                      )}
                    </div>

                    <div className="product-content">
                      <span className="business-name">
                        {businessNameOf(product)}
                      </span>

                      <h2>{title}</h2>

                      <div className="price-row">
                        <strong>{formatMoney(price)}</strong>

                        {oldPrice > price && oldPrice > 0 && (
                          <del>{formatMoney(oldPrice)}</del>
                        )}
                      </div>

                      {oldPrice > price && (
                        <div className="saving">
                          You save {formatMoney(oldPrice - price)}
                        </div>
                      )}

                      <a
                        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
                          title,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="compare-online"
                      >
                        <GitCompareArrows size={17} />

                        Compare Online
                      </a>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="circle-panel">
              <div className="circle-panel-icon">
                <Users size={28} />
              </div>

              <div className="circle-panel-copy">
                <span className="eyebrow">
                  ASK FRIENDS & FAMILY
                </span>

                <h2>Create a Shopping Circle</h2>

                <p>
                  Your friends can vote, comment, reply and help you choose
                  the best product.
                </p>

                <div className="features">
                  <span>
                    <CheckCircle2 size={16} />
                    Live voting
                  </span>

                  <span>
                    <MessageCircle size={16} />
                    Shopping chat
                  </span>

                  <span>
                    <Sparkles size={16} />
                    Circle summary
                  </span>
                </div>
              </div>

              <div className="circle-action">
                <label htmlFor="circle-question">
                  Your question
                </label>

                <input
                  id="circle-question"
                  value={question}
                  onChange={(event) =>
                    setQuestion(event.target.value)
                  }
                  maxLength={120}
                  placeholder="Which one should I buy?"
                />

                <button
                  type="button"
                  onClick={handleCreateShoppingCircle}
                  disabled={
                    creatingCircle ||
                    items.length < 2
                  }
                >
                  {creatingCircle ? (
                    <>
                      <Loader2
                        className="spin"
                        size={19}
                      />

                      Creating circle…
                    </>
                  ) : (
                    <>
                      <Users size={19} />

                      Ask Friends & Family
                    </>
                  )}
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <ShoppingBag size={48} />

            <h2>No products selected</h2>

            <p>
              Go back to the Shop page and select two or three products.
            </p>

            <button
              type="button"
              onClick={() => router.push('/shop')}
            >
              Open Shop
            </button>
          </section>
        )}
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}


export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="compare-state">
          <Loader2 className="spin" size={38} />
          <h1>Loading comparison</h1>
          <p>Preparing your selected products…</p>
          <style jsx>{styles}</style>
        </main>
      }
    >
      <ComparePageContent />
    </Suspense>
  );
}

const styles = `
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: #f5f3ed;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  :global(.spin) {
    animation: compare-spin 0.8s linear infinite;
  }

  @keyframes compare-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .compare-page {
    min-height: 100vh;
    padding: 52px 24px 80px;
    color: #171814;
    background:
      radial-gradient(
        circle at 4% 0%,
        rgba(242, 183, 116, 0.18),
        transparent 30rem
      ),
      radial-gradient(
        circle at 96% 24%,
        rgba(34, 197, 94, 0.1),
        transparent 32rem
      ),
      #f5f3ed;
  }

  .compare-shell {
    width: min(1320px, 100%);
    margin: 0 auto;
  }

  .compare-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 18px;
    margin-bottom: 30px;
  }

  .back-button {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(20, 20, 15, 0.08);
    border-radius: 16px;
    color: #20211d;
    background: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    box-shadow: 0 10px 34px rgba(30, 27, 20, 0.07);
  }

  .header-copy {
    min-width: 0;
  }

  .eyebrow {
    color: #696a62;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.15em;
  }

  .header-copy h1 {
    margin: 7px 0 8px;
    font-size: clamp(34px, 5vw, 58px);
    line-height: 1;
    letter-spacing: -0.05em;
  }

  .header-copy p {
    max-width: 700px;
    margin: 0;
    color: #6d6e66;
    font-size: 16px;
    line-height: 1.55;
  }

  .selected-count {
    min-width: 118px;
    min-height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 16px;
    color: white;
    background: #171814;
  }

  .selected-count strong {
    font-size: 19px;
  }

  .selected-count span {
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
  }

  .error-message {
    margin-bottom: 20px;
    padding: 14px 17px;
    border: 1px solid #efcbc7;
    border-radius: 15px;
    color: #a52b25;
    background: #fff1ef;
    font-weight: 750;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .product-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(20, 20, 15, 0.09);
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 20px 60px rgba(40, 36, 25, 0.08);
  }

  .product-image {
    position: relative;
    height: 370px;
    overflow: hidden;
    background: #ebe9e2;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .image-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: #898a82;
  }

  .product-number {
    position: absolute;
    top: 15px;
    left: 15px;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    background: rgba(18, 19, 16, 0.9);
    font-weight: 900;
  }

  .discount-badge {
    position: absolute;
    top: 16px;
    right: 15px;
    padding: 8px 11px;
    border-radius: 999px;
    color: white;
    background: #171814;
    font-size: 12px;
    font-weight: 900;
  }

  .product-content {
    padding: 20px;
  }

  .business-name {
    color: #74756d;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .product-content h2 {
    min-height: 56px;
    margin: 7px 0 14px;
    font-size: 21px;
    line-height: 1.25;
    letter-spacing: -0.025em;
  }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .price-row strong {
    font-size: 27px;
  }

  .price-row del {
    color: #909188;
  }

  .saving {
    margin-top: 6px;
    color: #16803c;
    font-size: 13px;
    font-weight: 850;
  }

  .compare-online {
    min-height: 48px;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border-radius: 14px;
    color: white;
    background: #171814;
    text-decoration: none;
    font-weight: 850;
  }

  .circle-panel {
    margin-top: 24px;
    padding: 26px;
    display: grid;
    grid-template-columns: auto 1fr minmax(320px, 440px);
    gap: 20px;
    align-items: center;
    border: 1px solid #cce8d3;
    border-radius: 28px;
    background:
      linear-gradient(
        135deg,
        rgba(246, 255, 248, 0.97),
        rgba(226, 246, 232, 0.97)
      );
    box-shadow: 0 20px 60px rgba(31, 99, 52, 0.08);
  }

  .circle-panel-icon {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    color: white;
    background: #1b9147;
  }

  .circle-panel-copy h2 {
    margin: 6px 0 7px;
    font-size: 25px;
    letter-spacing: -0.03em;
  }

  .circle-panel-copy p {
    max-width: 570px;
    margin: 0;
    color: #626a62;
    line-height: 1.5;
  }

  .features {
    margin-top: 13px;
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .features span {
    padding: 7px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    color: #247044;
    background: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    font-weight: 850;
  }

  .circle-action {
    display: grid;
    gap: 8px;
  }

  .circle-action label {
    color: #4f574f;
    font-size: 12px;
    font-weight: 850;
  }

  .circle-action input {
    width: 100%;
    height: 48px;
    padding: 0 15px;
    border: 1px solid #c9d8cc;
    border-radius: 14px;
    outline: none;
    color: #242520;
    background: rgba(255, 255, 255, 0.94);
  }

  .circle-action input:focus {
    border-color: #449d60;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
  }

  .circle-action button {
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 0;
    border-radius: 14px;
    color: white;
    background: #171814;
    cursor: pointer;
    font-weight: 900;
  }

  .circle-action button:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .empty-state,
  .compare-state {
    min-height: 66vh;
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
  }

  .empty-state {
    padding: 50px 24px;
    border-radius: 28px;
    background: white;
  }

  .empty-state h2,
  .compare-state h1 {
    margin: 16px 0 7px;
  }

  .empty-state p,
  .compare-state p {
    margin: 0 0 18px;
    color: #72736b;
  }

  .empty-state button {
    padding: 13px 19px;
    border: 0;
    border-radius: 14px;
    color: white;
    background: #171814;
    cursor: pointer;
    font-weight: 850;
  }

  @media (max-width: 1050px) {
    .comparison-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .circle-panel {
      grid-template-columns: auto 1fr;
    }

    .circle-action {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 700px) {
    .compare-page {
      padding: 24px 12px 50px;
    }

    .compare-header {
      grid-template-columns: auto 1fr;
    }

    .selected-count {
      grid-column: 1 / -1;
      justify-self: stretch;
    }

    .header-copy h1 {
      font-size: 38px;
    }

    .comparison-grid {
      grid-template-columns: 1fr;
    }

    .product-image {
      height: 360px;
    }

    .circle-panel {
      padding: 19px;
      grid-template-columns: 1fr;
    }

    .circle-panel-icon {
      width: 54px;
      height: 54px;
    }
  }
`;