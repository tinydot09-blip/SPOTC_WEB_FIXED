'use client';

import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const NAV_EVENT = 'spotc-navigation-start';

export function startPageNavigation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NAV_EVENT));
}

export default function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setVisible(false);
  };

  useEffect(() => {
    // The new route has committed.
    hide();
  }, [pathname]);

  useEffect(() => {
    const show = () => {
      setVisible(true);

      // Safety fallback so a failed/aborted navigation never leaves
      // the website permanently covered.
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        setVisible(false);
        timerRef.current = null;
      }, 12000);
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);

      if (url.origin !== window.location.origin) return;

      const current =
        `${window.location.pathname}${window.location.search}${window.location.hash}`;

      const next =
        `${url.pathname}${url.search}${url.hash}`;

      if (next === current) return;

      show();
    };

    window.addEventListener(NAV_EVENT, show);
    document.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener(NAV_EVENT, show);
      document.removeEventListener('click', handleClick, true);

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="spotc-navigation-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="spotc-navigation-loader-content">
        <Loader2 className="spotc-navigation-loader-spinner" />
        <strong>SPOTC</strong>
        <span>Loading...</span>
      </div>

      <style jsx>{`
        .spotc-navigation-loader {
          position: fixed;
          inset: 0;
          z-index: 2147483647;

          display: flex;
          align-items: center;
          justify-content: center;

          width: 100vw;
          height: 100dvh;

          background: #f7f5f1;
        }

        .spotc-navigation-loader-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-align: center;
        }

        .spotc-navigation-loader-spinner {
          width: 38px;
          height: 38px;
          color: #d99c2b;
          animation: spotcNavigationSpin 0.75s linear infinite;
        }

        .spotc-navigation-loader-content strong {
          margin-top: 4px;
          color: #171513;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .spotc-navigation-loader-content span {
          color: #81786f;
          font-size: 13px;
          font-weight: 600;
        }

        @keyframes spotcNavigationSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}