import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="spotc-footer">
      <div className="spotc-footer-grid">
        {/* BRAND */}
        <div className="spotc-footer-brand">
          <h3>SpotC.in</h3>

          <p>Namma Area. Namma Kadai.</p>

          <p>
            Shop local products, discover offers and get fast
            nearby delivery.
          </p>
        </div>

        {/* SHOP */}
        <div className="spotc-footer-column">
          <h4>Shop</h4>

          <Link href="/offers">Offers</Link>
          <Link href="/shop">Shop Products</Link>
        </div>

        {/* ACCOUNT */}
        <div className="spotc-footer-column">
          <h4>Account</h4>

          <Link href="/dashboard?tab=orders">
            My Orders
          </Link>

          <Link href="/dashboard?tab=saved">
            Saved
          </Link>

          <Link href="/dashboard?tab=circles">
            Shopping Circles
          </Link>
        </div>

        {/* HELP */}
        <div className="spotc-footer-column">
          <h4>Help</h4>

          <Link href="/contact">Contact</Link>

          <Link href="/contact?type=support">
            Help &amp; Support
          </Link>
        </div>

        {/* COMPANY */}
        <div className="spotc-footer-column">
          <h4>Company</h4>

          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>

      <div className="spotc-footer-bottom">
        © 2026 SpotC.in Technologies
      </div>

      <style jsx global>{`
        .spotc-footer {
          width: 100%;
          margin-top: 50px !important;
          padding: 52px 24px 22px;
          color: #ffffff;
          background: #111111;
        }

        .spotc-footer-grid {
          width: min(1280px, 100%);
          margin: 0 auto;

          display: grid;

          grid-template-columns:
            minmax(260px, 1.7fr)
            repeat(4, minmax(120px, 1fr));

          gap: 42px;
          align-items: start;
        }

        .spotc-footer h3,
        .spotc-footer h4,
        .spotc-footer p {
          margin-top: 0;
        }

        .spotc-footer h3 {
          margin-bottom: 14px;

          color: #ffffff;

          font-size: 32px;
          font-weight: 900;
          line-height: 1;

          letter-spacing: -0.02em;
        }

        .spotc-footer h4 {
          margin-bottom: 14px;

          color: #ffffff;

          font-size: 16px;
          font-weight: 700;
          line-height: 1.25;
        }

        .spotc-footer-brand p {
          max-width: 330px;

          margin-bottom: 10px;

          color: #bdbdbd;

          font-size: 15px;
          line-height: 1.55;
        }

        .spotc-footer-column {
          min-width: 0;
        }

        .spotc-footer-column a {
          display: block;

          width: fit-content;

          margin: 0 0 12px;

          color: #d9d9d9;

          font-size: 15px;
          line-height: 1.4;

          text-decoration: none;

          transition: color 0.15s ease;
        }

        .spotc-footer-column a:hover {
          color: #ffffff;
        }

        .spotc-footer-bottom {
          width: min(1280px, 100%);

          margin: 28px auto 0;
          padding-top: 20px;

          border-top:
            1px solid rgba(255, 255, 255, 0.12);

          color: #9c9c9c;

          font-size: 13px;
          line-height: 1.5;

          text-align: center;
        }

        /* TABLET */

        @media (max-width: 980px) {
          .spotc-footer-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));

            gap: 30px 40px;
          }

          .spotc-footer-brand {
            grid-column: 1 / -1;
          }
        }

        /* MOBILE */

        @media (max-width: 700px) {
          .spotc-footer {
            margin-top: 36px !important;

            padding:
              38px
              20px
              calc(90px + env(safe-area-inset-bottom));
          }

          .spotc-footer-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));

            gap: 24px 20px;
          }

          .spotc-footer-brand {
            grid-column: 1 / -1;
          }

          .spotc-footer h3 {
            margin-bottom: 9px;
            font-size: 28px;
          }

          .spotc-footer h4 {
            margin-bottom: 9px;
            font-size: 15px;
          }

          .spotc-footer-brand p {
            max-width: 100%;

            margin-bottom: 5px;

            font-size: 13px;
            line-height: 1.4;
          }

          .spotc-footer-column a {
            margin-bottom: 7px;

            font-size: 13px;
            line-height: 1.3;
          }

          .spotc-footer-bottom {
            margin-top: 18px;
            padding-top: 14px;

            font-size: 11px;
          }
        }

        /* SMALL MOBILE */

        @media (max-width: 420px) {
          .spotc-footer {
            padding-left: 18px;
            padding-right: 18px;
          }

          .spotc-footer-grid {
            gap: 20px 16px;
          }

          .spotc-footer h3 {
            font-size: 26px;
          }

          .spotc-footer h4 {
            font-size: 14px;
          }

          .spotc-footer-brand p,
          .spotc-footer-column a {
            font-size: 12px;
          }

          .spotc-footer-bottom {
            margin-top: 14px;
            padding-top: 12px;

            font-size: 10px;
          }
        }
      `}</style>
    </footer>
  );
}