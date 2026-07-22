import Link from "next/link";

export default function Footer() {
  return (
    <footer className="spotc-footer">
      <div className="spotc-footer-grid">

        <div>
          <h3>SPOTC</h3>
          <p>Namma Area. Namma Kadai.</p>
          <p>
            Discover near by shop,
            products and hidden spots.
          </p>
        </div>

        <div>
          <h4>Explore</h4>

          <Link href="/offers">Offers</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/spots">Spots</Link>
        </div>

        <div>
          <h4>Business</h4>

          <Link href="/business">Register Business</Link>
          <Link href="/creator">Become Creator</Link>
          <Link href="/shopping-circle">
            Shopping Circle
          </Link>
        </div>

        <div>
          <h4>Company</h4>

          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>

      </div>

      <div className="spotc-footer-bottom">
        © 2026 SPOTC Technologies Pvt Ltd
      </div>
    </footer>
  );
}