'use client';

import Link from 'next/link';
import { BriefcaseBusiness, CircleUserRound, LayoutDashboard, Search, ShoppingBag, Video, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readCart } from '@/lib/cart';

const links = [ 
  ['/shop', 'Shop'], 
  ['/offers', 'Offers'], 
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);

  const searchLabel = useMemo(() => {
    if (pathname.startsWith('/shop')) return 'Search shop';
    if (pathname.startsWith('/spots')) return 'Search spots';
    return 'Search offers';
  }, [pathname]);

  useEffect(() => {
    const sync = () => setCount(readCart().reduce((sum, item) => sum + item.qty, 0));
    sync();
    window.addEventListener('spotc-cart-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('spotc-cart-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    setSearch('');
    window.dispatchEvent(new CustomEvent('spotc-page-search', { detail: '' }));
  }, [pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const updateSearch = (value: string) => {
    setSearch(value);
    window.dispatchEvent(new CustomEvent('spotc-page-search', { detail: value }));
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/offers">
          <span>SPOTC</span>
          <small>Namma Area, Namma Kadai</small>
        </Link>

        <nav className="desktop-nav">
          {links.map(([href, label]) => (
            <Link className={pathname.startsWith(href) ? 'active' : ''} href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="header-page-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => updateSearch('')}>
              <X size={17} />
            </button>
          )}
        </div>

        <div className="header-actions compact-header-actions">
          <Link className="header-cart" href="/cart" aria-label={`Cart with ${count} items`}>
            <ShoppingBag size={21} />
            {count > 0 && <b>{count > 99 ? '99+' : count}</b>}
          </Link>

          <div className="profile-menu-wrap" ref={profileRef}>
            <button
              className="profile-trigger"
              type="button"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((value) => !value)}
            >
              <CircleUserRound size={23} />
            </button>

            {profileOpen && (
              <div className="profile-dropdown" role="menu">
                <Link href="/orders" onClick={() => setProfileOpen(false)}>
                  <LayoutDashboard size={18} />
                  <span><strong>Dashboard</strong><small>Orders, rewards and profile</small></span>
                </Link>
                <Link href="/business-partner" onClick={() => setProfileOpen(false)}>
                  <BriefcaseBusiness size={18} />
                  <span><strong>Become a Business Partner</strong><small>List offers and sell products</small></span>
                </Link>
                <Link href="/creator" onClick={() => setProfileOpen(false)}>
                  <Video size={18} />
                  <span><strong>Become a Creator</strong><small>Create and publish Spots</small></span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main>{children}</main>

      <nav className="mobile-nav">
        {links.map(([href, label]) => (
          <Link className={pathname.startsWith(href) ? 'active' : ''} href={href} key={href}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
