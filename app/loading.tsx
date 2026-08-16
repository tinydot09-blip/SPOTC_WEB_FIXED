export default function Loading() {
  return (
    <main className="spotc-global-loading">
      <div className="spotc-loading-content">
        <div className="spotc-loading-spinner" />

        <strong>SPOTC</strong>

        <span>Loading...</span>
      </div>

      <style>{`
        .spotc-global-loading {
          position: fixed;
          inset: 0;
          z-index: 99999;

          min-height: 100dvh;

          display: flex;
          align-items: center;
          justify-content: center;

          background: #f7f5f1;
        }

        .spotc-loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          gap: 8px;

          color: #17120d;
          text-align: center;
        }

        .spotc-loading-spinner {
          width: 38px;
          height: 38px;

          margin-bottom: 6px;

          border: 3px solid #e5ddd4;
          border-top-color: #e89d3b;
          border-radius: 50%;

          animation: spotc-spin 0.75s linear infinite;
        }

        .spotc-loading-content strong {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .spotc-loading-content span {
          color: #81766d;
          font-size: 13px;
          font-weight: 600;
        }

        @keyframes spotc-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}