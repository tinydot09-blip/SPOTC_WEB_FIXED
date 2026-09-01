'use client';

import {
  Check,
  Gift,
  PlayCircle,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '@/lib/firebase';

const STORAGE_KEY = 'spotc-share5-campaign-v1';
const DISMISS_KEY = 'spotc-share5-banner-hidden';
const CAMPAIGN_LIMIT = 5;

type CampaignState = {
  sharedProductIds?: string[];
  proofSubmitted?: boolean;
};

function readCampaign(): CampaignState {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return {};

    const parsed = JSON.parse(raw) as CampaignState;

    return {
      sharedProductIds: Array.isArray(parsed.sharedProductIds)
        ? Array.from(
            new Set(
              parsed.sharedProductIds
                .map((id) => String(id || '').trim())
                .filter(Boolean),
            ),
          ).slice(0, CAMPAIGN_LIMIT)
        : [],
      proofSubmitted: parsed.proofSubmitted === true,
    };
  } catch {
    return {};
  }
}

export default function ShareCampaignBar() {
  const router = useRouter();

  const [progress, setProgress] = useState(0);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const refreshProgress = () => {
    const state = readCampaign();
    const ids = state.sharedProductIds || [];

    setProgress(Math.min(ids.length, CAMPAIGN_LIMIT));
    setProofSubmitted(state.proofSubmitted === true);
  };

  useEffect(() => {
    const hidden =
      window.sessionStorage.getItem(DISMISS_KEY) === '1';

    setDismissed(hidden);

    const onFocus = () => {
      if (auth?.currentUser) refreshProgress();
    };

    const onStorage = () => {
      if (auth?.currentUser) refreshProgress();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);

    // The campaign belongs to the signed-in customer.
    // Do not leave a previous customer's 5/5 / Proof Submitted state
    // visible after logout on a shared phone/browser.
    if (!auth) {
      setSignedIn(false);
      setProgress(0);
      setProofSubmitted(false);
      setReady(true);

      return () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('storage', onStorage);
      };
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setSignedIn(false);
        setHowOpen(false);
        setProgress(0);
        setProofSubmitted(false);

        try {
          window.localStorage.removeItem(STORAGE_KEY);
          window.sessionStorage.removeItem('spotc-share5-pending-product');
        } catch {
          // Ignore browser storage errors.
        }

        setReady(true);
        return;
      }

      setSignedIn(true);
      refreshProgress();
      setReady(true);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const completed = progress >= CAMPAIGN_LIMIT;

  const dismissCampaign = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore browser storage errors.
    }

    setHowOpen(false);
    setDismissed(true);
  };

  if (!ready || dismissed) {
    return null;
  }

  return (
    <>
      <section
        className="share5-campaign-card"
        aria-label="Share 5 get 1 free campaign"
      >
        {progress === 0 && !proofSubmitted && (
          <button
            type="button"
            className="share5-campaign-close"
            aria-label="Close Share 5 offer"
            title="Close"
            onClick={dismissCampaign}
          >
            <X size={17} strokeWidth={2.6} />
          </button>
        )}

        <div
          className={`share5-campaign-head ${
            progress > 0 || proofSubmitted
              ? 'share5-campaign-head-no-close'
              : ''
          }`}
        >
          <div className="share5-campaign-gift-icon">
            <Gift size={23} strokeWidth={2.2} />
          </div>

          <div className="share5-campaign-copy">
            <div className="share5-campaign-title-row">
              <strong className="share5-campaign-title">
                SHARE 5 → GET 1 FREE
              </strong>

              <span className="share5-campaign-limited">
                LIMITED TIME
              </span>
            </div>

            <p className="share5-campaign-description">
              Select 5 different products and share each with a
              different local friend or family member on WhatsApp.
            </p>
          </div>
        </div>

        <div
          className="share5-campaign-steps"
          aria-label={`${progress} of ${CAMPAIGN_LIMIT} products shared`}
        >
          {[1, 2, 3, 4, 5].map((step) => {
            const done = progress >= step;

            return (
              <div
                key={step}
                className={`share5-step-item ${
                  step === 5 ? 'share5-step-last' : ''
                }`}
              >
                <div
                  className={`share5-step-circle ${
                    done ? 'share5-step-done' : ''
                  }`}
                >
                  {done ? (
                    <Check size={15} strokeWidth={3} />
                  ) : (
                    step
                  )}
                </div>

                {step < 5 && (
                  <div
                    className={`share5-step-line ${
                      progress >= step
                        ? 'share5-step-line-done'
                        : ''
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="share5-campaign-bottom">
          <div className="share5-progress-track">
            <div
              className="share5-progress-fill"
              style={{
                width: `${
                  (progress / CAMPAIGN_LIMIT) * 100
                }%`,
              }}
            />
          </div>

          <div className="share5-campaign-actions-row">
            <strong
              className={
                completed
                  ? 'share5-progress-text share5-progress-complete'
                  : 'share5-progress-text'
              }
            >
              {progress} / 5 shared
            </strong>

            <div className="share5-campaign-actions">
              <button
                type="button"
                className="share5-how-button"
                onClick={() => setHowOpen(true)}
              >
                How It Works
              </button>

              {completed && !proofSubmitted && (
                <button
                  type="button"
                  className="share5-proof-button"
                  onClick={() =>
                    router.push('/share-reward/proof')
                  }
                >
                  <UploadCloud size={15} />
                  Upload Proof
                </button>
              )}

              {proofSubmitted && (
                <span className="share5-proof-submitted">
                  Proof Submitted ✓
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {howOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How the Share 5 campaign works"
          className="share5-modal-backdrop"
          onClick={() => setHowOpen(false)}
        >
          <div
            className="share5-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="share5-modal-head">
              <strong>🎁 How It Works</strong>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setHowOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="share5-video-placeholder">
              <div>
                <PlayCircle
                  size={46}
                  strokeWidth={1.7}
                />

                <div className="share5-video-title">
                  SHARE 5 → GET 1 FREE
                </div>

                <div className="share5-video-copy">
                  Real how-to video will play here after
                  recording
                </div>
              </div>
            </div>

            <div className="share5-modal-content">
              {[
                'Select 5 different products',
                'Share each with a different local person',
                'Upload your WhatsApp share proof',
                'Choose 1 FREE product',
                'Submit your FREE gift request',
              ].map((label, index) => (
                <div
                  key={label}
                  className="share5-how-row"
                >
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}

              <div className="share5-area-note">
                Share only with people in Karamadai, Teacher
                Colony, EB Colony &amp; Gandhinagar.
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .share5-campaign-card {
          position: relative;
          margin: 8px 12px 8px;
          border: 1px solid #f5bfd0;
          border-radius: 18px;
          background: linear-gradient(
            135deg,
            #fff7fa 0%,
            #fff 58%,
            #fff8e8 100%
          );
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }

        .share5-campaign-close {
          position: absolute;
          top: 7px;
          right: 7px;
          z-index: 5;
          width: 28px;
          height: 28px;
          padding: 0;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          color: #555;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 2px 7px rgba(0, 0, 0, 0.1);
          -webkit-tap-highlight-color: transparent;
        }

        .share5-campaign-close:active {
          transform: scale(0.94);
        }

        .share5-campaign-head {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding: 13px 44px 8px 14px;
        }

        .share5-campaign-head-no-close {
          padding-right: 14px;
        }

        .share5-campaign-gift-icon {
          width: 42px;
          height: 42px;
          min-width: 42px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          color: #fff;
          background: #e91e63;
        }

        .share5-campaign-copy {
          min-width: 0;
          flex: 1;
        }

        .share5-campaign-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-right: 2px;
        }

        .share5-campaign-title {
          min-width: 0;
          font-size: 16px;
          line-height: 1.2;
          color: #171717;
          font-weight: 900;
        }

        .share5-campaign-limited {
          white-space: nowrap;
          flex: 0 0 auto;
          border-radius: 999px;
          background: #ffd54f;
          color: #3d2a00;
          padding: 4px 8px;
          font-size: 10px;
          line-height: 1.1;
          font-weight: 900;
          margin-right: 2px;
        }

        .share5-campaign-description {
          margin: 5px 0 0;
          font-size: 12px;
          line-height: 1.45;
          color: #555;
          font-weight: 600;
        }

        .share5-campaign-steps {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 4px 14px 8px;
        }

        .share5-step-item {
          display: flex;
          align-items: center;
          flex: 1;
        }

        .share5-step-last {
          flex: 0 0 auto;
        }

        .share5-step-circle {
          width: 27px;
          height: 27px;
          min-width: 27px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 900;
          background: #fff;
          color: #666;
          border: 1px solid #d9d9d9;
        }

        .share5-step-done {
          background: #e91e63;
          color: #fff;
          border-color: #e91e63;
        }

        .share5-step-line {
          height: 3px;
          flex: 1;
          margin: 0 4px;
          border-radius: 999px;
          background: #e6e6e6;
        }

        .share5-step-line-done {
          background: #e91e63;
        }

        .share5-campaign-bottom {
          padding: 0 14px 11px;
        }

        .share5-progress-track {
          height: 7px;
          border-radius: 999px;
          overflow: hidden;
          background: #ececec;
        }

        .share5-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: #e91e63;
          transition: width 250ms ease;
        }

        .share5-campaign-actions-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 8px;
        }

        .share5-progress-text {
          font-size: 13px;
          color: #222;
          white-space: nowrap;
        }

        .share5-progress-complete {
          color: #15803d;
        }

        .share5-campaign-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          min-width: 0;
        }

        .share5-how-button {
          border: 1px solid #102d6b;
          border-radius: 10px;
          background: #fff;
          color: #102d6b;
          padding: 8px 10px;
          font-weight: 800;
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
          white-space: nowrap;
        }

        .share5-proof-button {
          border: 0;
          border-radius: 10px;
          background: #e91e63;
          color: #fff;
          padding: 8px 11px;
          font-weight: 900;
          font-size: 12px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          white-space: nowrap;
        }

        .share5-proof-submitted {
          border-radius: 10px;
          background: #e9f8ee;
          color: #137333;
          padding: 8px 10px;
          font-weight: 900;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
        }

        .share5-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.55);
          display: grid;
          place-items: center;
          padding: 20px;
        }

        .share5-modal {
          width: min(420px, 100%);
          max-height: calc(100vh - 40px);
          overflow: auto;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.28);
        }

        .share5-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 16px;
          border-bottom: 1px solid #eee;
        }

        .share5-modal-head strong {
          font-size: 18px;
          font-weight: 900;
          color: #111;
        }

        .share5-modal-head button {
          border: 0;
          background: transparent;
          padding: 4px;
          cursor: pointer;
          color: #222;
        }

        .share5-video-placeholder {
          margin: 14px;
          min-height: 150px;
          border-radius: 16px;
          background: linear-gradient(
            135deg,
            #102d6b,
            #e91e63
          );
          color: #fff;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 25px;
        }

        .share5-video-title {
          margin-top: 7px;
          font-weight: 900;
          font-size: 17px;
        }

        .share5-video-copy {
          margin-top: 4px;
          opacity: 0.9;
          font-size: 12px;
        }

        .share5-modal-content {
          padding: 2px 16px 18px;
        }

        .share5-how-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .share5-how-row:last-of-type {
          border-bottom: 0;
        }

        .share5-how-row > span {
          width: 27px;
          height: 27px;
          min-width: 27px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #fce7ef;
          color: #e91e63;
          font-size: 12px;
          font-weight: 900;
        }

        .share5-how-row strong {
          color: #222;
          font-size: 13px;
        }

        .share5-area-note {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: #fff7dc;
          color: #694d00;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 700;
        }

        @media (max-width: 620px) {
          /*
           * The normal shop page has generous page-top spacing.
           * Pull this campaign card upward only on mobile so the
           * card sits closer to the SPOTC header, without changing
           * the normal ProductGrid / desktop layout.
           */
          .share5-campaign-card {
            margin: 8px 12px 8px;
            border-radius: 17px;
          }

          .share5-campaign-head {
            gap: 10px;
            padding: 12px 42px 7px 12px;
          }

          .share5-campaign-head-no-close {
          padding-right: 14px;
        }

        .share5-campaign-gift-icon {
            width: 40px;
            height: 40px;
            min-width: 40px;
            border-radius: 12px;
          }

          .share5-campaign-title {
            font-size: 15px;
          }

          .share5-campaign-limited {
            font-size: 9px;
            padding: 4px 7px;
            margin-right: 0;
          }

          .share5-campaign-description {
            font-size: 11.5px;
            line-height: 1.4;
          }

          .share5-campaign-steps {
            padding: 3px 12px 7px;
            gap: 5px;
          }

          .share5-campaign-bottom {
            padding: 0 12px 10px;
          }

          .share5-campaign-actions-row {
            margin-top: 7px;
          }

          .share5-how-button,
          .share5-proof-button,
          .share5-proof-submitted {
            font-size: 11.5px;
          }
        }

        @media (max-width: 390px) {
          .share5-campaign-card {
            margin-left: 9px;
            margin-right: 9px;
          }

          .share5-campaign-title-row {
            align-items: flex-start;
          }

          .share5-campaign-title {
            font-size: 14px;
          }

          .share5-campaign-limited {
            font-size: 8.5px;
            padding: 4px 6px;
          }

          .share5-campaign-actions-row {
            gap: 7px;
          }

          .share5-progress-text {
            font-size: 12px;
          }

          .share5-how-button {
            padding: 8px 9px;
          }

          .share5-proof-button {
            padding: 8px 9px;
          }
        }
      `}</style>
    </>
  );
}
