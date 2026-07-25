'use client';

import Link from 'next/link';
import {
  BriefcaseBusiness,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Search,
  ShoppingBag,
  Tag,
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
import {
  getProfileCompletionPercentage,
  getSpotcUserProfile,
  requireGoogleLogin,
  type SpotcUserProfile,
} from '@/lib/auth';

const navigation = [
  {
    href: '/offers',
    label: 'Offers',
    icon: Tag,
  },
  {
    href: '/shop',
    label: 'Shop',
    icon: ShoppingBag,
  },
  {
    href: '/spots',
    label: 'Spots',
    icon: MapPin,
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

  const [spotcProfile, setSpotcProfile] =
    useState<Partial<SpotcUserProfile> | null>(null);

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
  pathname.startsWith('/order-success') ||
  pathname.startsWith('/complete-profile') ||
  pathname.startsWith('/profile') ||
  pathname.startsWith('/circle/');

  const mobileNavAtTop =
    pathname.startsWith('/offers') ||
    pathname.startsWith('/spots');

  const profileCompletion = useMemo(
    () => getProfileCompletionPercentage(spotcProfile),
    [spotcProfile],
  );

  const profileIsComplete = profileCompletion === 100;

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

          void getSpotcUserProfile(nextUser)
            .then((profile) => {
              setSpotcProfile(profile);
            })
            .catch((error) => {
              console.error(
                'SPOTC profile load failed:',
                error,
              );
              setSpotcProfile(null);
            });
        } else {
          setFirebaseUser(null);
          setSpotcProfile(null);
        }

        setAuthLoading(false);
        setMenuOpen(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    const refreshProfile = () => {
      void getSpotcUserProfile(firebaseUser)
        .then((profile) => {
          setSpotcProfile(profile);
        })
        .catch((error) => {
          console.error(
            'SPOTC profile refresh failed:',
            error,
          );
        });
    };

    window.addEventListener(
      'spotc-profile-updated',
      refreshProfile,
    );

    return () => {
      window.removeEventListener(
        'spotc-profile-updated',
        refreshProfile,
      );
    };
  }, [firebaseUser]);

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

  const handleGoogleSignIn = async () => {
    try {
      const signedInUser = await requireGoogleLogin();

/*
 * On mobile, signInWithRedirect() navigates away from this page.
 * Returning null here is expected.
 */
if (!signedInUser) {
  return;
}

      setFirebaseUser(signedInUser);

      const profile = await getSpotcUserProfile(
        signedInUser,
      );
      setSpotcProfile(profile);
      setMenuOpen(false);
    } catch (error) {
      console.error('SPOTC Google sign-in failed:', error);
      window.alert(
        error instanceof Error
          ? `Sign in failed: ${error.message}`
          : 'Google sign in failed. Please try again.',
      );
    }
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
    setSpotcProfile(null);
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
    <div
      className={
        pathname.startsWith('/shop') || pathname.startsWith('/product/')
          ? 'spotc-app-shell spotc-app-shell-shop'
          : 'spotc-app-shell'
      }
    >
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
    const Icon = item.icon;

    const active =
      pathname.startsWith(item.href) ||
      (item.href === '/shop' && pathname.startsWith('/product/'));

    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          active
            ? 'spotc-navigation-link spotc-navigation-link-active'
            : 'spotc-navigation-link'
        }
        aria-current={active ? 'page' : undefined}
      >
        <Icon
          className="spotc-desktop-nav-icon"
          aria-hidden="true"
        />

        <span>{item.label}</span>
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
            {!authLoading &&
              !firebaseUser && (
                <button
                  type="button"
                  className="spotc-login-register-chip"
                  onClick={() => void handleGoogleSignIn()}
                >
                  Sign in
                </button>
              )}

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
                    setMenuOpen((current) => !current)
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

                    {firebaseUser && (
                      <>
                        <Link
                          href="/profile"
                          className="spotc-dropdown-item"
                          onClick={() =>
                            setMenuOpen(false)
                          }
                        >
                          <CircleUserRound size={18} />
                          <span>Profile</span>
                        </Link>

                        {!profileIsComplete && (
                          <>
                            <div className="spotc-dropdown-divider" />

                            <Link
                              href="/complete-profile"
                              className="spotc-profile-completion-link"
                              onClick={() =>
                                setMenuOpen(false)
                              }
                            >
                              <div className="spotc-profile-completion-title">
                                <span>Complete Profile</span>
                                <strong>{profileCompletion}%</strong>
                              </div>

                              <div
                                className="spotc-profile-progress-track"
                                aria-label={`Profile ${profileCompletion}% complete`}
                              >
                                <span
                                  style={{
                                    width: `${profileCompletion}%`,
                                  }}
                                />
                              </div>
                            </Link>
                          </>
                        )}

                        <div className="spotc-dropdown-divider" />
                      </>
                    )}

                    <Link
                      href={
                        firebaseUser
                          ? '/dashboard'
                          : '/dashboard?guest=1'
                      }
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
                      href={
                        firebaseUser
                          ? '/dashboard?tab=circles'
                          : '/dashboard?guest=1&tab=circles'
                      }
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

      <nav
        className={
          mobileNavAtTop
            ? 'spotc-mobile-navigation spotc-mobile-navigation-top'
            : 'spotc-mobile-navigation spotc-mobile-navigation-bottom'
        }
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const active =
            pathname.startsWith(item.href) ||
            (item.href === '/shop' && pathname.startsWith('/product/'));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'spotc-mobile-nav-link spotc-mobile-nav-link-active'
                  : 'spotc-mobile-nav-link'
              }
              aria-current={
                active ? 'page' : undefined
              }
            >
              <Icon
                className="spotc-mobile-nav-icon"
                aria-hidden="true"
              />

              <span>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <style jsx global>{`
        .spotc-app-shell {
          position: relative;
          width: 100%;
          max-width: 100vw;
          min-height: 100vh;
          height: auto;
          overflow: visible;
          background: #f8f6f1;
        }

        /* Shop uses a normal content-height shell so the footer starts
           immediately after the final product row. */
        .spotc-app-shell-shop {
          min-height: 0 !important;
          height: auto !important;
        }

        .spotc-app-shell-shop .spotc-site-content {
          min-height: 0 !important;
          height: auto !important;
          padding-bottom: 0 !important;
        }

        @media (max-width: 700px) {
          .spotc-app-shell:has(.pd-page) .spotc-site-content {
            min-height: 0 !important;
            height: auto !important;
            padding-bottom: 0 !important;
          }
        }

        html,
        body {
          overflow-x: hidden;
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
  width: min(1200px, calc(100% - 40px));
  max-width: 1200px;
  height: 100%;
  margin: 0 auto;

  display: grid;
  grid-template-columns:
    190px
    360px
    minmax(280px, 1fr)
    auto;

  align-items: center;
  gap: 20px;

  padding: 0;
  box-sizing: border-box;
  overflow: visible;
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

        .spotc-desktop-navigation{
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
}

.spotc-navigation-link{
  position:relative;

  width:120px;
  height:72px;

  display:flex;
  flex-direction:row;
  align-items:center;
  justify-content:center;
  gap:8px;

  color:#6e6962;
  text-decoration:none;

  font-size:15px;
  font-weight:700;

  transition:.2s;
}

.spotc-navigation-link:not(:last-child)::before{
  content:'';

  position:absolute;
  top:16px;
  right:0;
  bottom:16px;

  width:1px;

  background:rgba(0,0,0,.12);
}

.spotc-desktop-nav-icon{
  width:20px;
  height:20px;
  flex:0 0 20px;
  stroke-width:2;
  color:inherit;
}

.spotc-navigation-link span{
  line-height:1;
}

.spotc-navigation-link-active{
  color:#d99c2b;
  font-weight:800;
}

.spotc-navigation-link-active .spotc-desktop-nav-icon{
  stroke-width:2.35;
  filter:drop-shadow(0 2px 5px rgba(245,189,77,.30));
}

.spotc-navigation-link-active::after{
  content:'';

  position:absolute;
  left:22px;
  right:22px;
  bottom:0;

  height:4px;

  border-radius:999px;

  background:linear-gradient(
    90deg,
    #d99c2b,
    #ffd978
  );

  box-shadow:0 0 10px rgba(245,189,77,.45);
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
          position: relative;
          z-index: 5001;
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
          font-size: 16px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
          font-family: inherit;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          box-shadow: 0 2px 8px
            rgba(20, 16, 8, 0.04);
        }

        .spotc-login-register-chip:hover {
          border-color: #bdb4a7;
          background: #f5f1ea;
        }

        .spotc-account-menu-container {
          position: relative;
          z-index: 5002;
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

        .spotc-profile-completion-link {
          width: 100%;
          padding: 10px;
          display: block;
          border-radius: 11px;
          color: #24211d;
          background: #f7f2e9;
          text-decoration: none;
          box-sizing: border-box;
        }

        .spotc-profile-completion-link:hover {
          background: #f1eadf;
        }

        .spotc-profile-completion-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
          font-weight: 750;
        }

        .spotc-profile-completion-title strong {
          color: #8a651f;
          font-size: 13px;
          font-weight: 900;
        }

        .spotc-profile-progress-track {
          width: 100%;
          height: 6px;
          margin-top: 9px;
          overflow: hidden;
          border-radius: 999px;
          background: #ded7cc;
        }

        .spotc-profile-progress-track span {
          height: 100%;
          display: block;
          border-radius: inherit;
          background: linear-gradient(90deg, #b87a12, #f5bd4d);
          transition: width 220ms ease;
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
          position: relative;
          z-index: 1;
          min-height: 0;
          height: auto;
        }

        /*
         * DESKTOP HEADER FIX
         * The header is fixed to the browser viewport instead of relying on
         * sticky positioning inside page-specific scrolling containers.
         * This keeps it fixed on Shop, Business, Cart and Product pages.
         */
        @media (min-width: 701px) {
          .spotc-site-header {
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            left: 0 !important;
            z-index: 10000 !important;
            width: 100% !important;
            transform: none !important;
          }

          .spotc-site-content {
            padding-top: 72px;
          }
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
            width: calc(
              100% - 16px
            );
            max-width: 100%;
            grid-template-columns:
              auto
              minmax(0, 1fr)
              auto;
            gap: 6px;
          }

          .spotc-header-brand small {
            display: none;
          }

          .spotc-header-search {
            min-width: 0;
            height: 36px;
            padding: 0 9px;
            gap: 7px;
          }

          .spotc-login-register-chip {
            width: 62px;
            min-width: 62px;
            max-width: 62px;
            height: 29px;
            padding: 0 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 62px;
            overflow: hidden;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            white-space: nowrap;
            word-break: keep-all;
            text-align: center;
          }

          .spotc-header-account-actions {
            min-width: 0;
            gap: 4px;
          }

          .spotc-header-cart-button {
            width: 31px;
            height: 31px;
            flex: 0 0 31px;
          }

          .spotc-account-menu-container,
          .spotc-account-trigger {
            width: 31px !important;
            height: 31px !important;
            min-width: 31px !important;
            max-width: 31px !important;
            min-height: 31px !important;
            max-height: 31px !important;
            flex-basis: 31px !important;
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
            min-height: 0;
            height: auto;
            padding-bottom: 0;
          }

          /* Shop mobile: reserve space above the fixed bottom navigation. */
.spotc-app-shell:has(.shop-page)
.spotc-site-content {
  min-height: 0 !important;
  height: auto !important;
  padding-bottom: 0 !important;
}

.spotc-app-shell:has(.shop-page)
.shop-page {
  min-height: 0 !important;
  height: auto !important;
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}

          /* =====================================================
   PREMIUM MOBILE BOTTOM NAVIGATION
===================================================== */

.spotc-mobile-navigation {
  position: fixed;
  right: 0;
  left: 0;
  z-index: 3500;

  width: 100%;
  height: 84px;
  margin: 0;
  padding: 8px 0 9px;

  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 0;

  overflow: hidden;

  border: 0;
  border-radius: 0;

  color: #ffffff;

  background:
    linear-gradient(
      180deg,
      rgba(24, 17, 12, 0.86) 0%,
      rgba(17, 12, 9, 0.78) 100%
    );

  box-shadow:
    0 10px 24px
      rgba(0, 0, 0, 0.16);

  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.spotc-mobile-navigation-top {
  top: 62px;
  right: 0;
  bottom: auto;
  left: 0;
}

.spotc-mobile-navigation-bottom {
  top: auto;
  bottom: 0;

  height: calc(
    84px + env(safe-area-inset-bottom, 0px)
  );

  padding-bottom: calc(
    9px + env(safe-area-inset-bottom, 0px)
  );

  background:
    linear-gradient(
      180deg,
      rgba(24, 17, 12, 0.96) 0%,
      rgba(17, 12, 9, 1) 100%
    );
}

.spotc-mobile-nav-link {
  position: relative;

  min-width: 0;
  height: 67px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;

  padding: 5px 8px 9px;

  border-radius: 0;

  color: rgba(255, 255, 255, 0.94);
  background: transparent;

  font-size: 15px;
  font-weight: 750;
  line-height: 1;
  letter-spacing: 0;

  text-decoration: none;

  transition:
    color 180ms ease,
    opacity 180ms ease,
    transform 180ms ease;
}

.spotc-mobile-nav-link:not(:last-child)::before {
  content: '';

  position: absolute;
  top: 15px;
  right: 0;
  bottom: 15px;

  width: 1px;

  background:
    rgba(255, 255, 255, 0.22);
}

.spotc-mobile-nav-icon {
  width: 24px;
  height: 24px;

  stroke-width: 2;
}

.spotc-mobile-nav-link > span {
  display: block;

  overflow: hidden;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotc-mobile-nav-link-active {
  color: #f5bd4d;

  font-size: 16px;
  font-weight: 850;

  transform: translateY(-1px);
}

.spotc-mobile-nav-link-active
  .spotc-mobile-nav-icon {
  stroke-width: 2.35;

  filter:
    drop-shadow(
      0 2px 5px rgba(245, 189, 77, 0.26)
    );
}

.spotc-mobile-nav-link-active::after {
  content: '';

  position: absolute;
  right: 24%;
  bottom: 2px;
  left: 24%;

  height: 4px;

  border-radius: 999px;

  background:
    linear-gradient(
      90deg,
      #d99c2b,
      #ffd978
    );

  box-shadow:
    0 0 10px
      rgba(245, 189, 77, 0.52);
}

.spotc-mobile-nav-link:active {
  opacity: 0.76;
  transform: scale(0.97);
}
        }

        @media (
          max-width: 380px
        ) {
          .spotc-mobile-navigation {
            height: 78px;
            padding-right: 10px;
            padding-left: 10px;
          }

          .spotc-mobile-navigation-bottom {
            height: calc(
              78px + env(safe-area-inset-bottom, 0px)
            );

            padding-bottom: calc(
              9px + env(safe-area-inset-bottom, 0px)
            );
          }

          .spotc-mobile-nav-link {
            height: 62px;
            gap: 4px;
            font-size: 14px;
          }

          .spotc-mobile-nav-link-active {
            font-size: 15px;
          }

          .spotc-mobile-nav-icon {
            width: 22px;
            height: 22px;
          }
        }

        @media (
          max-width: 510px
        ) {
          .spotc-header-inner {
            width: calc(
              100% - 16px
            );
            max-width: 100%;
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