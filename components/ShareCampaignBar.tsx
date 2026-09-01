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

const STORAGE_KEY = 'spotc-share5-campaign-v1';
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

  const refreshProgress = () => {
    const state = readCampaign();
    const ids = state.sharedProductIds || [];

    setProgress(Math.min(ids.length, CAMPAIGN_LIMIT));
    setProofSubmitted(state.proofSubmitted === true);
  };

  useEffect(() => {
    refreshProgress();

    const onFocus = () => refreshProgress();
    const onStorage = () => refreshProgress();

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const completed = progress >= CAMPAIGN_LIMIT;

  return (
    <>
      <section
        style={{
          margin: '10px 12px 14px',
          border: '1px solid #f5bfd0',
          borderRadius: '18px',
          background:
            'linear-gradient(135deg, #fff7fa 0%, #fff 58%, #fff8e8 100%)',
          boxShadow: '0 8px 22px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '11px',
            padding: '13px 14px 8px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              minWidth: '42px',
              borderRadius: '13px',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              background: '#e91e63',
            }}
          >
            <Gift size={23} strokeWidth={2.2} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <strong
                style={{
                  fontSize: '16px',
                  lineHeight: 1.2,
                  color: '#171717',
                  fontWeight: 900,
                }}
              >
                SHARE 5 → GET 1 FREE
              </strong>

              <span
                style={{
                  whiteSpace: 'nowrap',
                  borderRadius: '999px',
                  background: '#ffd54f',
                  color: '#3d2a00',
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 900,
                }}
              >
                LIMITED TIME
              </span>
            </div>

            <p
              style={{
                margin: '5px 0 0',
                fontSize: '12px',
                lineHeight: 1.45,
                color: '#555',
                fontWeight: 600,
              }}
            >
              Select 5 different products and share each with a different local
              friend or family member on WhatsApp.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '4px 14px 8px',
          }}
        >
          {[1, 2, 3, 4, 5].map((step) => {
            const done = progress >= step;

            return (
              <div
                key={step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flex: step === 5 ? '0 0 auto' : 1,
                }}
              >
                <div
                  style={{
                    width: '27px',
                    height: '27px',
                    minWidth: '27px',
                    borderRadius: '999px',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                    background: done ? '#e91e63' : '#fff',
                    color: done ? '#fff' : '#666',
                    border: done
                      ? '1px solid #e91e63'
                      : '1px solid #d9d9d9',
                  }}
                >
                  {done ? <Check size={15} strokeWidth={3} /> : step}
                </div>

                {step < 5 && (
                  <div
                    style={{
                      height: '3px',
                      flex: 1,
                      margin: '0 4px',
                      borderRadius: '999px',
                      background: progress >= step ? '#e91e63' : '#e6e6e6',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '0 14px 13px' }}>
          <div
            style={{
              height: '7px',
              borderRadius: '999px',
              overflow: 'hidden',
              background: '#ececec',
            }}
          >
            <div
              style={{
                width: `${(progress / CAMPAIGN_LIMIT) * 100}%`,
                height: '100%',
                borderRadius: '999px',
                background: '#e91e63',
                transition: 'width 250ms ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginTop: '9px',
            }}
          >
            <strong
              style={{
                fontSize: '13px',
                color: completed ? '#15803d' : '#222',
              }}
            >
              {progress} / 5 shared
            </strong>

            <div style={{ display: 'flex', gap: '7px' }}>
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                style={{
                  border: '1px solid #102d6b',
                  borderRadius: '10px',
                  background: '#fff',
                  color: '#102d6b',
                  padding: '8px 10px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                How It Works
              </button>

              {completed && !proofSubmitted && (
                <button
                  type="button"
                  onClick={() => router.push('/share-reward/proof')}
                  style={{
                    border: 0,
                    borderRadius: '10px',
                    background: '#e91e63',
                    color: '#fff',
                    padding: '8px 11px',
                    fontWeight: 900,
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                  }}
                >
                  <UploadCloud size={15} />
                  Upload Proof
                </button>
              )}

              {proofSubmitted && (
                <span
                  style={{
                    borderRadius: '10px',
                    background: '#e9f8ee',
                    color: '#137333',
                    padding: '8px 10px',
                    fontWeight: 900,
                    fontSize: '12px',
                  }}
                >
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
          onClick={() => setHowOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              borderRadius: '22px',
              background: '#fff',
              overflow: 'hidden',
              boxShadow: '0 22px 70px rgba(0,0,0,0.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '15px 16px',
                borderBottom: '1px solid #eee',
              }}
            >
              <strong
                style={{
                  fontSize: '18px',
                  fontWeight: 900,
                  color: '#111',
                }}
              >
                🎁 How It Works
              </strong>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setHowOpen(false)}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 4,
                  cursor: 'pointer',
                }}
              >
                <X size={22} />
              </button>
            </div>

            <div
              style={{
                margin: '14px',
                minHeight: '150px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg,#102d6b,#e91e63)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                padding: '25px',
              }}
            >
              <div>
                <PlayCircle size={46} strokeWidth={1.7} />
                <div
                  style={{
                    marginTop: '7px',
                    fontWeight: 900,
                    fontSize: '17px',
                  }}
                >
                  SHARE 5 → GET 1 FREE
                </div>
                <div
                  style={{
                    marginTop: '4px',
                    opacity: 0.9,
                    fontSize: '12px',
                  }}
                >
                  Real how-to video will play here after recording
                </div>
              </div>
            </div>

            <div style={{ padding: '2px 16px 18px' }}>
              {[
                'Select 5 different products',
                'Share each with a different local person',
                'Upload your WhatsApp share proof',
                'Choose 1 FREE product',
                'Submit your FREE gift request',
              ].map((label, index) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 0',
                    borderBottom: index === 4 ? 'none' : '1px solid #f0f0f0',
                  }}
                >
                  <span
                    style={{
                      width: '27px',
                      height: '27px',
                      minWidth: '27px',
                      borderRadius: '999px',
                      display: 'grid',
                      placeItems: 'center',
                      background: '#fce7ef',
                      color: '#e91e63',
                      fontSize: '12px',
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </span>

                  <strong style={{ color: '#222', fontSize: '13px' }}>
                    {label}
                  </strong>
                </div>
              ))}

              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: '#fff7dc',
                  color: '#694d00',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  fontWeight: 700,
                }}
              >
                Share only with people in Karamadai, Teacher Colony, EB Colony
                &amp; Gandhinagar.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}