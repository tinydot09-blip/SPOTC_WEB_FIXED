'use client';

import Link from 'next/link';
import {
  BriefcaseBusiness,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Search,
  ShoppingBag,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  usePathname,
  useRouter,
} from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { readCart } from '@/lib/cart';
import {
  auth,
  firebaseReady,
} from '@/lib/firebase';

const navigation = [
  {
    href: '/offers',
    label: 'Offers',
  },
  {
    href: '/shop',
    label: 'Shop',
  },
  {
    href: '/spots',
    label: 'Spots',
  },
] as const;

function getUserName(user: User): string {
  return (
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'SPOTC Member'
  );
}

function getUserInitials(user: User): string {
  const initials = getUserName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'S';
}

export function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [firebaseUser, setFirebaseUser] =
    useState<User | null>(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [cartCount, setCartCount] =
    useState(0);

  const [searchValue, setSearchValue] =
    useState('');

  const accountMenuRef =
    useRef<HTMLDivElement>(null);

  const standalonePage =
  pathname.startsWith('/dashboard') ||
  pathname.startsWith('/compare-online') ||
  pathname.startsWith('/order-success');

  const searchPlaceholder = useMemo(() => {
    if (pathname.startsWith('/shop')) {
      return 'Search products';
    }

    if (pathname.startsWith('/spots')) {
      return 'Search spots';
    }

    return 'Search offers';
  }, [pathname]);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setFirebaseUser(null);
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        if (
          nextUser &&
          !nextUser.isAnonymous
        ) {
          setFirebaseUser(nextUser);
        } else {
          setFirebaseUser(null);
        }

        setAuthLoading(false);
        setMenuOpen(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const updateCartCount = () => {
      try {
        const cart = readCart();

        const count = cart.reduce(
          (total, item) =>
            total +
            Number(item.qty || 0),
          0,
        );

        setCartCount(count);
      } catch {
        setCartCount(0);
      }
    };

    updateCartCount();

    window.addEventListener(
      'spotc-cart-change',
      updateCartCount,
    );

    window.addEventListener(
      'storage',
      updateCartCount,
    );

    return () => {
      window.removeEventListener(
        'spotc-cart-change',
        updateCartCount,
      );

      window.removeEventListener(
        'storage',
        updateCartCount,
      );
    };
  }, []);

  useEffect(() => {
    setSearchValue('');
    setMenuOpen(false);

    window.dispatchEvent(
      new CustomEvent(
        'spotc-page-search',
        {
          detail: '',
        },
      ),
    );
  }, [pathname]);

  useEffect(() => {
    const closeAccountMenu = (
      event: MouseEvent,
    ) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      closeAccountMenu,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        closeAccountMenu,
      );
    };
  }, []);

  const handleSearch = (
    value: string,
  ) => {
    setSearchValue(value);

    window.dispatchEvent(
      new CustomEvent(
        'spotc-page-search',
        {
          detail: value,
        },
      ),
    );
  };

  const handleLogout = async () => {
    setMenuOpen(false);

    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error(
        'SPOTC logout failed:',
        error,
      );
    }

    setFirebaseUser(null);
    router.replace('/offers');
    router.refresh();
  };

  if (standalonePage) {
    return (
      <div className="spotc-standalone-shell">
        {children}

        <style jsx>{`
          .spotc-standalone-shell {
            width: 100%;
            min-height: 100vh;
            overflow-x: hidden;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="spotc-app-shell">
      <header className="spotc-site-header">
        <div className="spotc-header-inner">
          <Link
            href="/offers"
            className="spotc-header-brand"
          >
            <strong>SPOTC</strong>

            <small>
              Namma Area, Namma Kadai
            </small>
          </Link>

          <nav className="spotc-desktop-navigation">
            {navigation.map((item) => {
              const active =
                pathname.startsWith(
                  item.href,
                );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'spotc-navigation-link spotc-navigation-link-active'
                      : 'spotc-navigation-link'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="spotc-header-search">
            <Search
              size={17}
              strokeWidth={2}
            />

            <input
              type="search"
              value={searchValue}
              placeholder={
                searchPlaceholder
              }
              aria-label={
                searchPlaceholder
              }
              onChange={(event) =>
                handleSearch(
                  event.target.value,
                )
              }
            />

            {searchValue.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() =>
                  handleSearch('')
                }
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="spotc-header-account-actions">
            <Link
              href="/cart"
              className="spotc-header-cart-button"
              aria-label={`Shopping cart with ${cartCount} items`}
            >
              <ShoppingBag
                size={21}
                strokeWidth={1.9}
              />

              {cartCount > 0 && (
                <span className="spotc-header-cart-badge">
                  {cartCount > 99
                    ? '99+'
                    : cartCount}
                </span>
              )}
            </Link>

            {!authLoading &&
              !firebaseUser && (
                <Link
                  href="/dashboard"
                  className="spotc-login-register-chip"
                >
                  Login / Register
                </Link>
              )}

            {!authLoading && (
              <div
                className="spotc-account-menu-container"
                ref={accountMenuRef}
              >
                <button
                  type="button"
                  className={
                    firebaseUser
                      ? 'spotc-account-trigger spotc-account-trigger-logged-in'
                      : 'spotc-account-trigger'
                  }
                  aria-label="Open profile menu"
                  aria-expanded={menuOpen}
                  onClick={() =>
                    setMenuOpen(
                      (current) =>
                        !current,
                    )
                  }
                >
                  {firebaseUser?.photoURL ? (
                    <img
                      src={
                        firebaseUser.photoURL
                      }
                      alt={getUserName(
                        firebaseUser,
                      )}
                      referrerPolicy="no-referrer"
                    />
                  ) : firebaseUser ? (
                    <span className="spotc-account-initials">
                      {getUserInitials(
                        firebaseUser,
                      )}
                    </span>
                  ) : (
                    <CircleUserRound
                      size={23}
                      strokeWidth={1.8}
                    />
                  )}
                </button>

                {menuOpen && (
                  <div className="spotc-account-dropdown">
                    {firebaseUser && (
                      <>
                        <div className="spotc-dropdown-user">
                          <div className="spotc-dropdown-avatar">
                            {firebaseUser.photoURL ? (
                              <img
                                src={
                                  firebaseUser.photoURL
                                }
                                alt=""
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span>
                                {getUserInitials(
                                  firebaseUser,
                                )}
                              </span>
                            )}
                          </div>

                          <div className="spotc-dropdown-user-text">
                            <strong>
                              {getUserName(
                                firebaseUser,
                              )}
                            </strong>

                            <small>
                              {firebaseUser.email ||
                                ''}
                            </small>
                          </div>
                        </div>

                        <div className="spotc-dropdown-divider" />
                      </>
                    )}

                    <Link
                      href="/dashboard"
                      className="spotc-dropdown-item"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >
                      <LayoutDashboard
                        size={18}
                      />

                      <span>
                        Dashboard
                      </span>
                    </Link>

                    <Link
                      href="/dashboard?tab=circles"
                      className="spotc-dropdown-item"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >
                      <UsersRound
                        size={18}
                      />

                      <span>
                        Shopping Circle
                      </span>
                    </Link>

                    <div className="spotc-dropdown-divider" />

                    <Link
                      href="/business-partner"
                      className="spotc-dropdown-item"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >
                      <BriefcaseBusiness
                        size={18}
                      />

                      <span>
                        Become a Business
                        Partner
                      </span>
                    </Link>

                    <Link
                      href="/creator"
                      className="spotc-dropdown-item"
                      onClick={() =>
                        setMenuOpen(false)
                      }
                    >
                      <Video size={18} />

                      <span>
                        Become a Creator
                      </span>
                    </Link>

                    {firebaseUser && (
                      <>
                        <div className="spotc-dropdown-divider" />

                        <button
                          type="button"
                          className="spotc-dropdown-item spotc-dropdown-logout"
                          onClick={
                            handleLogout
                          }
                        >
                          <LogOut
                            size={18}
                          />

                          <span>
                            Logout
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="spotc-site-content">
        {children}
      </main>

      <nav className="spotc-mobile-navigation">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              pathname.startsWith(
                item.href,
              )
                ? 'spotc-mobile-nav-link spotc-mobile-nav-link-active'
                : 'spotc-mobile-nav-link'
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <style jsx global>{`
        .spotc-app-shell {
          width: 100%;
          min-height: 100vh;
          background: #f8f6f1;
        }

        .spotc-site-header {
          position: sticky;
          top: 0;
          z-index: 4000;
          width: 100%;
          height: 72px;
          border-bottom: 1px solid
            #e5dfd5;
          background: rgba(
            250,
            248,
            244,
            0.98
          );
          backdrop-filter: blur(16px);
        }

        .spotc-header-inner {
          width: min(
            1280px,
            calc(100% - 40px)
          );
          height: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns:
            230px
            auto
            minmax(240px, 340px)
            auto;
          align-items: center;
          gap: 24px;
        }

        .spotc-header-brand {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          color: #181715;
          text-decoration: none;
          line-height: 1;
        }

        .spotc-header-brand strong {
          font-size: 17px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .spotc-header-brand small {
          margin-top: 5px;
          color: #706c65;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }

        .spotc-desktop-navigation {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 34px;
        }

        .spotc-navigation-link {
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
          color: #6e6962;
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
        }

        .spotc-navigation-link-active {
          color: #171513;
        }

        .spotc-navigation-link-active::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2px;
          border-radius: 3px;
          background: #171513;
        }

        .spotc-header-search {
          height: 40px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid
            #ded8cf;
          border-radius: 999px;
          background: #fff;
        }

        .spotc-header-search input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: 0;
          color: #222;
          background: transparent;
          font-size: 13px;
        }

        .spotc-header-search button {
          width: 24px;
          height: 24px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: transparent;
          cursor: pointer;
        }

        .spotc-header-account-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
        }

        .spotc-header-cart-button {
          position: relative;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          color: #171513;
          border-radius: 50%;
          text-decoration: none;
        }

        .spotc-header-cart-button:hover {
          background: #eee9e1;
        }

        .spotc-header-cart-badge {
          position: absolute;
          top: -3px;
          right: -2px;
          min-width: 17px;
          height: 17px;
          padding: 0 4px;
          display: grid;
          place-items: center;
          border: 2px solid
            #faf8f4;
          border-radius: 999px;
          color: #fff;
          background: #171513;
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
        }

        .spotc-login-register-chip {
          height: 30px;
          padding: 0 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid
            #d7d0c6;
          border-radius: 999px;
          color: #2c2925;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
          box-shadow: 0 2px 8px
            rgba(20, 16, 8, 0.04);
        }

        .spotc-login-register-chip:hover {
          border-color: #bdb4a7;
          background: #f5f1ea;
        }

        .spotc-account-menu-container {
          position: relative;
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
        }

        .spotc-account-trigger {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          max-width: 36px !important;
          min-height: 36px !important;
          max-height: 36px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: grid !important;
          place-items: center !important;
          overflow: hidden !important;
          border: 1px solid
            #d7d0c6 !important;
          border-radius: 50% !important;
          color: #171513 !important;
          background: #fff !important;
          box-shadow: none !important;
          cursor: pointer !important;
        }

        .spotc-account-trigger-logged-in {
          border: 2px solid
            #fff !important;
          background: #222 !important;
          box-shadow: 0 0 0 1px
            #cfc7bb !important;
        }

        .spotc-account-trigger img {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          min-height: 0 !important;
          max-height: none !important;
          display: block !important;
          border-radius: 50% !important;
          object-fit: cover !important;
        }

        .spotc-account-initials {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #fff;
          font-size: 13px;
          font-weight: 900;
        }

        .spotc-account-dropdown {
          position: absolute !important;
          top: 46px !important;
          right: 0 !important;
          left: auto !important;
          z-index: 99999 !important;
          width: 286px !important;
          min-width: 286px !important;
          max-width: calc(
            100vw - 24px
          ) !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: calc(
            100vh - 100px
          ) !important;
          margin: 0 !important;
          padding: 8px !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          border: 1px solid
            #e3ddd3 !important;
          border-radius: 16px !important;
          background: #fff !important;
          box-shadow: 0 24px 60px
            rgba(22, 18, 12, 0.2) !important;
          transform: none !important;
        }

        .spotc-dropdown-user {
          padding: 9px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .spotc-dropdown-avatar {
          width: 40px !important;
          height: 40px !important;
          min-width: 40px !important;
          max-width: 40px !important;
          flex: 0 0 40px !important;
          overflow: hidden;
          border-radius: 50%;
          background: #1d1b18;
        }

        .spotc-dropdown-avatar img {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          min-height: 0 !important;
          max-height: none !important;
          display: block !important;
          border-radius: 50% !important;
          object-fit: cover !important;
        }

        .spotc-dropdown-avatar span {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #fff;
          font-size: 13px;
          font-weight: 900;
        }

        .spotc-dropdown-user-text {
          min-width: 0;
          flex: 1;
        }

        .spotc-dropdown-user-text strong,
        .spotc-dropdown-user-text small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

       .spotc-dropdown-user-text strong {
  color:#1d1b18;
  font-size:16px;
  font-weight:500;
}

       .spotc-dropdown-user-text small {
  margin-top:4px;
  color:#77716a;
  font-size:13px;
  font-weight:400;
}

        .spotc-dropdown-divider {
          width: auto;
          height: 1px;
          margin: 4px 7px;
          background: #eee9e2;
        }

        .spotc-dropdown-item {
          width: 100% !important;
          min-height: 42px !important;
          height: auto !important;
          margin: 0 !important;
          padding: 9px 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 10px !important;
          border: 0 !important;
          border-radius: 10px !important;
          color: #24211d !important;
          background: transparent !important;
          font-family: inherit !important;
            font-size:15px !important;
  font-weight:400 !important;
          line-height: 1.25 !important;
          text-align: left !important;
          text-decoration: none !important;
          cursor: pointer !important;
          box-shadow: none !important;
        }

        .spotc-dropdown-item:hover {
          background: #f5f1ea !important;
        }

        .spotc-dropdown-item svg {
          width: 17px;
          height: 17px;
          flex: 0 0 17px;
        }

        .spotc-dropdown-item span {
          min-width: 0;
          display: block;
        }

        .spotc-dropdown-logout {
          color: #b42318 !important;
        }

        .spotc-site-content {
          min-height: calc(
            100vh - 72px
          );
        }

        .spotc-mobile-navigation {
          display: none;
        }

        @media (
          max-width: 980px
        ) {
          .spotc-header-inner {
            width: calc(
              100% - 24px
            );
            grid-template-columns:
              auto
              minmax(180px, 1fr)
              auto;
            gap: 12px;
          }

          .spotc-desktop-navigation {
            display: none;
          }
        }

        @media (
          max-width: 700px
        ) {
          .spotc-site-header {
            height: 62px;
          }

          .spotc-header-inner {
            grid-template-columns:
              auto
              1fr
              auto;
            gap: 8px;
          }

          .spotc-header-brand small {
            display: none;
          }

          .spotc-header-search {
            height: 36px;
          }

          .spotc-login-register-chip {
            max-width: 72px;
            height: 28px;
            padding: 0 7px;
            font-size: 9px;
            white-space: normal;
            text-align: center;
          }

          .spotc-header-cart-button {
            width: 32px;
            height: 32px;
          }

          .spotc-account-menu-container,
          .spotc-account-trigger {
            width: 33px !important;
            height: 33px !important;
            min-width: 33px !important;
            max-width: 33px !important;
            min-height: 33px !important;
            max-height: 33px !important;
            flex-basis: 33px !important;
          }

          .spotc-account-dropdown {
            position: fixed !important;
            top: 58px !important;
            right: 8px !important;
            width: min(
              286px,
              calc(100vw - 16px)
            ) !important;
            min-width: 0 !important;
          }

          .spotc-site-content {
            min-height: calc(
              100vh - 112px
            );
            padding-bottom: 54px;
          }

          .spotc-mobile-navigation {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 3500;
            height: 54px;
            padding-bottom: env(
              safe-area-inset-bottom
            );
            display: grid;
            grid-template-columns:
              repeat(3, 1fr);
            border-top: 1px solid
              #e1dbd2;
            background: rgba(
              255,
              255,
              255,
              0.98
            );
          }

          .spotc-mobile-nav-link {
            display: grid;
            place-items: center;
            color: #77716a;
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
          }

          .spotc-mobile-nav-link-active {
            color: #171513;
          }
        }

        @media (
          max-width: 510px
        ) {
          .spotc-header-inner {
            width: calc(
              100% - 16px
            );
          }

          .spotc-header-brand strong {
            font-size: 15px;
          }

          .spotc-header-search {
            padding: 0 10px;
          }

          .spotc-header-search input {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}