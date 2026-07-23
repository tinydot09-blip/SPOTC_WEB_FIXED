import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="spotc-footer">
      <div className="spotc-footer-grid">
        <div className="spotc-footer-brand">
          <h3>SPOTC</h3>

          <p>Namma Area. Namma Kadai.</p>

          <p>Discover nearby shops, products and hidden spots.</p>
        </div>

        <div className="spotc-footer-column spotc-footer-explore">
          <h4>Explore</h4>

          <Link href="/offers">Offers</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/spots">Spots</Link>
        </div>

        <div className="spotc-footer-column spotc-footer-business">
          <h4>Business</h4>

          <Link href="/business-partner">Register Business</Link>
          <Link href="/creator">Become Creator</Link>
          <Link href="/dashboard?tab=circles">Shopping Circle</Link>
        </div>

        <div className="spotc-footer-column spotc-footer-contact">
          <h4>Contact Us</h4>

          <Link href="/contact">Contact</Link>
          <Link href="/contact?type=support">Help &amp; Support</Link>
          <Link href="/contact?type=business">Business Enquiry</Link>
        </div>

        <div className="spotc-footer-column spotc-footer-company">
          <h4>Company</h4>

          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>

      <div className="spotc-footer-bottom">
        © 2026 SPOTC Technologies Pvt Ltd
      </div>

      <style jsx global>{`
        .spotc-footer {
          width: 100%;
          margin-top: 50px !important;
          padding: 60px 24px 24px;
          color: #ffffff;
          background: #111111;
        }

        .spotc-footer-grid {
          width: min(1280px, 100%);
          margin: 0 auto;
          display: grid;
          grid-template-columns:
            minmax(250px, 1.6fr)
            repeat(4, minmax(140px, 1fr));
          gap: 42px;
          align-items: start;
        }

        .spotc-footer h3,
        .spotc-footer h4,
        .spotc-footer p {
          margin-top: 0;
        }

        .spotc-footer h3 {
          margin-bottom: 18px;
          color: #ffffff;
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.02em;
        }

        .spotc-footer h4 {
          margin-bottom: 16px;
          color: #ffffff;
          font-size: 17px;
          font-weight: 900;
          line-height: 1.25;
        }

        .spotc-footer-brand p {
          max-width: 330px;
          margin-bottom: 14px;
          color: #bdbdbd;
          font-size: 16px;
          line-height: 1.7;
        }

        .spotc-footer-column {
          min-width: 0;
        }

        .spotc-footer-column a {
          display: block;
          width: fit-content;
          margin: 0 0 16px;
          color: #d9d9d9;
          font-size: 16px;
          line-height: 1.45;
          text-decoration: none;
        }

        .spotc-footer-column a:hover {
          color: #ffffff;
        }

        .spotc-footer-bottom {
          width: min(1280px, 100%);
          margin: 30px auto 0;
          padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          color: #9c9c9c;
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
        }

        @media (max-width: 980px) {
          .spotc-footer-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 34px 40px;
          }

          .spotc-footer-brand {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 700px) {
          .spotc-footer {
            margin-top: 40px !important;
            padding:
              42px
              20px
              calc(100px + env(safe-area-inset-bottom));
          }

          .spotc-footer-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 22px 20px;
          }

          .spotc-footer-brand {
            grid-column: 1 / -1;
          }

          .spotc-footer-explore {
            grid-column: 1;
            grid-row: 2;
          }

          .spotc-footer-business {
            grid-column: 2;
            grid-row: 2;
          }

          .spotc-footer-contact {
            grid-column: 1;
            grid-row: 3;
          }

          .spotc-footer-company {
            grid-column: 2;
            grid-row: 3;
          }

          .spotc-footer h3 {
            margin-bottom: 10px;
            font-size: 30px;
            line-height: 1;
          }

          .spotc-footer h4 {
            margin-bottom: 8px;
            font-size: 17px;
            line-height: 1.1;
          }

          .spotc-footer-brand p {
            max-width: 100%;
            margin-bottom: 6px;
            font-size: 14px;
            line-height: 1.35;
          }

          .spotc-footer-column a {
            margin-bottom: 6px;
            font-size: 14px;
            line-height: 1.25;
          }

          .spotc-footer-bottom {
            margin-top: 14px;
            padding-top: 14px;
            font-size: 11px;
            line-height: 1.2;
          }
        }

        @media (max-width: 420px) {
          .spotc-footer {
            padding-left: 18px;
            padding-right: 18px;
          }

          .spotc-footer-grid {
            gap: 18px 16px;
          }

          .spotc-footer h3 {
            margin-bottom: 8px;
            font-size: 26px;
          }

          .spotc-footer h4 {
            margin-bottom: 6px;
            font-size: 15px;
            line-height: 1.1;
          }

          .spotc-footer-brand p {
            margin-bottom: 5px;
            font-size: 13px;
            line-height: 1.3;
          }

          .spotc-footer-column a {
            margin-bottom: 5px;
            font-size: 13px;
            line-height: 1.2;
          }

          .spotc-footer-bottom {
            margin-top: 12px;
            padding-top: 12px;
            font-size: 10px;
            line-height: 1.2;
          }
        }
      `}</style>
    </footer>
  );
}