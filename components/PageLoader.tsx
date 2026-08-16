'use client';

import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div
      className="spotc-page-loader"
      role="status"
      aria-label="Loading"
    >
      <div className="spotc-page-loader-content">
        <Loader2 className="spotc-page-loader-spinner" />

        <strong>SPOTC</strong>

        <span>Loading...</span>
      </div>

      <style jsx>{`
        .spotc-page-loader {
          position: fixed;
          top: 72px;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 3000;

          display: flex;
          align-items: center;
          justify-content: center;

          background: #f7f5f1;
        }

        .spotc-page-loader-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          gap: 8px;

          text-align: center;
        }

        .spotc-page-loader-spinner {
          width: 36px;
          height: 36px;

          color: #d99c2b;

          animation:
            spotcPageLoaderSpin
            0.75s
            linear
            infinite;
        }

        .spotc-page-loader-content strong {
          margin-top: 4px;

          color: #171513;

          font-size: 17px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .spotc-page-loader-content span {
          color: #81786f;

          font-size: 12px;
          font-weight: 600;
        }

        @keyframes spotcPageLoaderSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 700px) {
          .spotc-page-loader {
            top: 62px;
          }
        }
      `}</style>
    </div>
  );
}