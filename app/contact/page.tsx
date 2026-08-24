import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact SPOTC | Local Customer Support in Karamadai',
  description:
    'Contact SPOTC local customer support in Karamadai, Coimbatore for orders, delivery, products and payment assistance.',
};

const PHONE_DISPLAY = '8072098066';
const PHONE_LINK = 'tel:+918072098066';
const WHATSAPP_NUMBER = '918072098066';
const SUPPORT_EMAIL = 'support@spotc.in';

function whatsappUrl(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    message,
  )}`;
}

const whatsappQuestions = [
  {
    label: 'Where is my order?',
    message:
      'Hi SPOTC, I would like to check the status of my order. My order number is: ',
  },
  {
    label: 'When will my order be delivered?',
    message:
      'Hi SPOTC, I would like to know when my order will be delivered. My order number is: ',
  },
  {
    label: 'I need help with a product',
    message:
      'Hi SPOTC, I need help with a product I saw on your website.',
  },
  {
    label: 'I have a payment question',
    message:
      'Hi SPOTC, I need help regarding a payment for my order.',
  },
  {
    label: 'I need help with size / exchange',
    message:
      'Hi SPOTC, I need help regarding size or exchange for my order. My order number is: ',
  },
  {
    label: 'Other question',
    message:
      'Hi SPOTC, I need some help with my order or shopping.',
  },
];

export default function ContactPage() {
  return (
    <main className="contact-page">
      <div className="contact-container">
        <section className="contact-hero">
          <span className="contact-local-badge">
            Local Customer Support
          </span>

          <h1>Contact SPOTC</h1>

          <p>
            Have a question about your order, delivery,
            product or payment? Our local support team in
            Karamadai is here to help.
          </p>
        </section>

        <section className="contact-trust-card">
          <div className="contact-trust-icon">
            âœ“
          </div>

          <div>
            <strong>
              Local business. Local support.
            </strong>

            <p>
              You can reach SPOTC directly by phone,
              email or WhatsApp whenever you need
              assistance.
            </p>
          </div>
        </section>

        <section className="contact-section">
          <h2>Customer Support</h2>

          <p className="contact-section-copy">
            For order status, delivery questions,
            product issues or payment support, contact
            us using any of the options below.
          </p>

          <div className="contact-method-grid">
            <a
              className="contact-method-card"
              href={PHONE_LINK}
            >
              <span className="contact-method-icon">
                â˜Ž
              </span>

              <div>
                <small>Call us</small>
                <strong>{PHONE_DISPLAY}</strong>
              </div>
            </a>

            <a
              className="contact-method-card"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              <span className="contact-method-icon">
                âœ‰
              </span>

              <div>
                <small>Email support</small>
                <strong>{SUPPORT_EMAIL}</strong>
              </div>
            </a>
          </div>

          <details className="whatsapp-support">
            <summary>
              <span className="whatsapp-icon">
                WhatsApp
              </span>

              <span className="whatsapp-summary-copy">
                <strong>Chat with SPOTC</strong>
                <small>
                  Select what you need help with
                </small>
              </span>

              <span className="whatsapp-arrow">
                â–¾
              </span>
            </summary>

            <div className="whatsapp-popup">
              <div className="whatsapp-popup-heading">
                <strong>
                  How can we help?
                </strong>

                <span>
                  Choose a question to continue on
                  WhatsApp.
                </span>
              </div>

              <div className="whatsapp-question-list">
                {whatsappQuestions.map(
                  (question) => (
                    <a
                      key={question.label}
                      href={whatsappUrl(
                        question.message,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>
                        {question.label}
                      </span>

                      <span aria-hidden="true">
                        â€º
                      </span>
                    </a>
                  ),
                )}
              </div>
            </div>
          </details>
        </section>

        <section className="contact-section">
          <h2>Local Support Address</h2>

          <div className="contact-address-card">
            <strong>
              SPOTC TECHNOLOGIES
            </strong>

            <address>
              #41-1, Kembe Gowder Colony 1st Street,
              <br />
              Near EB Colony Bus Stop,
              <br />
              Karamadai, Coimbatore â€“ 641104,
              <br />
              Tamil Nadu, India
            </address>

            <a
              className="contact-map-link"
              href="https://www.google.com/maps/search/?api=1&query=41-1+Kembe+Gowder+Colony+1st+Street+Near+EB+Colony+Bus+Stop+Karamadai+Coimbatore+641104"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Google Maps â†’
            </a>
          </div>
        </section>

        <section className="contact-section">
          <h2>Service Area</h2>

          <p className="contact-section-copy">
            SPOTC currently provides local shopping
            and delivery services in Karamadai,
            Coimbatore and supported nearby areas.
          </p>
        </section>

        <section className="contact-order-section">
          <h2>Need help with an order?</h2>

          <p>
            Keep your order number ready when contacting
            us so our support team can assist you
            quickly.
          </p>

          <div className="contact-action-row">
            <Link
              href="/orders"
              className="contact-action contact-action-primary"
            >
              View My Orders
            </Link>

            <Link
              href="/shop"
              className="contact-action contact-action-secondary"
            >
              Continue Shopping
            </Link>
          </div>
        </section>
      </div>

      <style>{`
        .contact-page {
          width: 100%;
          min-height: 70vh;
          padding: 54px 20px 80px;
          color: #1d1b18;
          background: #f8f6f1;
          box-sizing: border-box;
        }

        .contact-container {
          width: min(820px, 100%);
          margin: 0 auto;
        }

        .contact-hero {
          margin-bottom: 28px;
        }

        .contact-local-badge {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 12px;
          border: 1px solid #d9c7a5;
          border-radius: 999px;
          color: #765212;
          background: #fff7e6;
          font-size: 12px;
          font-weight: 800;
        }

        .contact-hero h1 {
          margin: 15px 0 10px;
          font-size: clamp(30px, 4vw, 40px);
          font-weight: 900;
          line-height: 1.15;
          letter-spacing: -0.025em;
        }

        .contact-hero p {
          max-width: 680px;
          margin: 0;
          color: #615b54;
          font-size: 16px;
          line-height: 1.65;
        }

        .contact-trust-card {
          margin-bottom: 34px;
          padding: 18px 20px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          border: 1px solid #dce8dc;
          border-radius: 16px;
          background: #f5fbf5;
        }

        .contact-trust-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: #227a3a;
          font-size: 18px;
          font-weight: 900;
        }

        .contact-trust-card strong {
          display: block;
          margin-bottom: 3px;
          font-size: 16px;
        }

        .contact-trust-card p {
          margin: 0;
          color: #596259;
          font-size: 13px;
          line-height: 1.5;
        }

        .contact-section,
        .contact-order-section {
          margin-top: 32px;
        }

        .contact-section h2,
        .contact-order-section h2 {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 850;
          line-height: 1.25;
        }

        .contact-section-copy {
          margin: 0 0 18px;
          color: #625c55;
          font-size: 15px;
          line-height: 1.65;
        }

        .contact-method-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .contact-method-card {
          min-width: 0;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid #ded8cf;
          border-radius: 14px;
          color: #1d1b18;
          background: #ffffff;
          text-decoration: none;
          transition:
            border-color 0.15s ease,
            transform 0.15s ease,
            box-shadow 0.15s ease;
        }

        .contact-method-card:hover {
          border-color: #c6bdaF;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(20, 16, 10, 0.06);
        }

        .contact-method-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: #4b1715;
          font-size: 17px;
        }

        .contact-method-card div {
          min-width: 0;
        }

        .contact-method-card small,
        .contact-method-card strong {
          display: block;
        }

        .contact-method-card small {
          margin-bottom: 2px;
          color: #81786e;
          font-size: 11px;
          font-weight: 600;
        }

        .contact-method-card strong {
          overflow-wrap: anywhere;
          font-size: 14px;
          font-weight: 800;
        }

        .whatsapp-support {
          position: relative;
          margin-top: 12px;
        }

        .whatsapp-support > summary {
          min-height: 64px;
          padding: 10px 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid #cfe1d2;
          border-radius: 14px;
          color: #183d22;
          background: #f4fbf5;
          cursor: pointer;
          list-style: none;
          box-sizing: border-box;
        }

        .whatsapp-support > summary::-webkit-details-marker {
          display: none;
        }

        .whatsapp-icon {
          min-width: 82px;
          height: 36px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: #ffffff;
          background: #168b3c;
          font-size: 11px;
          font-weight: 900;
        }

        .whatsapp-summary-copy {
          min-width: 0;
          flex: 1;
        }

        .whatsapp-summary-copy strong,
        .whatsapp-summary-copy small {
          display: block;
        }

        .whatsapp-summary-copy strong {
          font-size: 15px;
        }

        .whatsapp-summary-copy small {
          margin-top: 2px;
          color: #647268;
          font-size: 11px;
        }

        .whatsapp-arrow {
          font-size: 18px;
          transition: transform 0.15s ease;
        }

        .whatsapp-support[open] .whatsapp-arrow {
          transform: rotate(180deg);
        }

        .whatsapp-popup {
          margin-top: 8px;
          overflow: hidden;
          border: 1px solid #dcd6cd;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 16px 42px rgba(20, 16, 10, 0.12);
        }

        .whatsapp-popup-heading {
          padding: 15px 16px 12px;
          border-bottom: 1px solid #eee9e2;
        }

        .whatsapp-popup-heading strong,
        .whatsapp-popup-heading span {
          display: block;
        }

        .whatsapp-popup-heading strong {
          margin-bottom: 2px;
          font-size: 15px;
        }

        .whatsapp-popup-heading span {
          color: #756e66;
          font-size: 11px;
        }

        .whatsapp-question-list {
          padding: 5px;
        }

        .whatsapp-question-list a {
          min-height: 45px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 9px;
          color: #24211d;
          font-size: 13px;
          font-weight: 650;
          text-decoration: none;
        }

        .whatsapp-question-list a:hover {
          background: #f6f3ee;
        }

        .whatsapp-question-list a span:last-child {
          color: #168b3c;
          font-size: 22px;
          font-weight: 400;
        }

        .contact-address-card {
          padding: 20px;
          border: 1px solid #ded8cf;
          border-radius: 16px;
          background: #ffffff;
        }

        .contact-address-card > strong {
          display: block;
          margin-bottom: 8px;
          font-size: 15px;
          font-weight: 850;
        }

        .contact-address-card address {
          margin: 0;
          color: #5d5750;
          font-size: 14px;
          font-style: normal;
          line-height: 1.65;
        }

        .contact-map-link {
          display: inline-block;
          margin-top: 13px;
          color: #7c5819;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .contact-order-section {
          padding: 22px;
          border: 1px solid #ded8cf;
          border-radius: 18px;
          background: #ffffff;
        }

        .contact-order-section p {
          margin: 0;
          color: #625c55;
          font-size: 14px;
          line-height: 1.6;
        }

        .contact-action-row {
          margin-top: 20px;
          display: flex;
          gap: 12px;
        }

        .contact-action {
          min-height: 46px;
          padding: 0 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 850;
          text-decoration: none;
          box-sizing: border-box;
          transition:
            transform 0.15s ease,
            background 0.15s ease;
        }

        .contact-action:hover {
          transform: translateY(-1px);
        }

        .contact-action-primary {
          color: #ffffff;
          background: #4b1715;
        }

        .contact-action-primary:hover {
          background: #5d1d1a;
        }

        .contact-action-secondary {
          border: 1px solid #cfc7bc;
          color: #27231f;
          background: #ffffff;
        }

        .contact-action-secondary:hover {
          background: #f6f2ec;
        }

        @media (max-width: 700px) {
          .contact-page {
            padding: 34px 16px 70px;
          }

          .contact-hero h1 {
            font-size: 30px;
          }

          .contact-hero p {
            font-size: 14px;
          }

          .contact-method-grid {
            grid-template-columns: 1fr;
          }

          .contact-action-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 9px;
          }

          .contact-action {
            width: 100%;
            padding: 0 12px;
            font-size: 12px;
          }
        }

        @media (max-width: 420px) {
          .contact-page {
            padding-left: 14px;
            padding-right: 14px;
          }

          .contact-trust-card,
          .contact-address-card,
          .contact-order-section {
            padding: 16px;
          }

          .contact-action-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
