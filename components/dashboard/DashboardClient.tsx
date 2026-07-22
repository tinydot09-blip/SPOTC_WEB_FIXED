'use client';

import Link from 'next/link';
import {
  Bell, CheckCircle2, Copy, Crown, Gift, Home, LogIn, LogOut,
  Menu, Share2, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { requireGoogleLogin, logoutUser } from '@/lib/auth';
import { auth, firebaseReady } from '@/lib/firebase';
import DashboardOverview from './DashboardOverview';
import DashboardOrders from './DashboardOrders';
import DashboardPartner from './DashboardPartner';
import DashboardMysteryBoxes from './DashboardMysteryBoxes';
import DashboardUnlock from './DashboardUnlock';
import DashboardRewards from './DashboardRewards';
import DashboardSaved from './DashboardSaved';
import DashboardShoppingCircles from './DashboardShoppingCircles';
import DashboardSidebar, { type DashboardTab } from './DashboardSidebar';

const LEVELS = [
  ['Level 0', '0 pts', 'Explorer', 'Dashboard and bill scanning unlocked'],
  ['Level 1', '100 pts', 'Local Starter', '1 Mystery Box entry'],
  ['Level 2', '200 pts', 'Smart Shopper', '2 Mystery Box entries'],
  ['Level 3', '300 pts', 'Reward Hunter', '3 Mystery Box entries'],
  ['Level 4', '500 pts', 'SPOTC Insider', '5 Mystery Box entries'],
  ['Level 5', '1,000 pts', 'SPOTC Champion', '10 Mystery Box entries'],
] as const;

const BOX_PACKS = [
  { boxes: 3, points: '1,000', title: 'Starter Mystery Pack', text: 'Three chances to reveal local coupons, products or partner rewards.' },
  { boxes: 5, points: '2,000', title: 'Premium Mystery Pack', text: 'Five chances with better-value local and sponsored rewards.' },
  { boxes: 10, points: '3,000', title: 'Mega Mystery Pack', text: 'Ten chances, including eligibility for high-value partner rewards.' },
] as const;


function DashboardAuthStyles() {
  return (
    <style jsx global>{`
      *{box-sizing:border-box}
      html,body{margin:0;min-height:100%;background:#12151a}
      .site-shell:has(.dash-login-page)>.topbar,
      .site-shell:has(.dash-login-page)>.mobile-nav,
      .site-shell:has(.dash-login-page)>footer,
      .site-shell:has(.dash-login-page) .site-footer,
      .site-shell:has(.dash-auth-loading)>.topbar,
      .site-shell:has(.dash-auth-loading)>.mobile-nav,
      .site-shell:has(.dash-auth-loading)>footer,
      .site-shell:has(.dash-auth-loading) .site-footer{display:none!important}
      .site-shell:has(.dash-login-page)>main,
      .site-shell:has(.dash-auth-loading)>main{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      .dash-auth-loading{min-height:100vh;display:grid;place-items:center;align-content:center;gap:14px;color:#d9dde3;background:#12151a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .dash-auth-loading span{width:38px;height:38px;border:3px solid #343a43;border-top-color:#f0b56b;border-radius:50%;animation:dashAuthSpin .8s linear infinite}
      .dash-auth-loading p{margin:0;color:#bfc5cd;font-size:14px}
      .dash-login-page{min-height:100vh;padding:32px;display:grid;place-items:center;color:#fff;background:
        radial-gradient(circle at 18% 18%,rgba(217,120,0,.16),transparent 28%),
        radial-gradient(circle at 84% 82%,rgba(109,60,223,.16),transparent 30%),
        linear-gradient(135deg,#0e1116,#171b22);
        font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .dash-login-card{position:relative;width:min(560px,100%);padding:42px;overflow:hidden;text-align:center;border:1px solid rgba(255,255,255,.09);border-radius:30px;background:rgba(26,30,37,.92);box-shadow:0 34px 100px rgba(0,0,0,.38);backdrop-filter:blur(14px)}
      .dash-login-card:before{content:'';position:absolute;inset:auto -90px -120px auto;width:260px;height:260px;border-radius:50%;background:rgba(109,60,223,.14);filter:blur(6px)}
      .dash-login-badge{position:relative;z-index:1;width:max-content;margin:0 auto 20px;padding:8px 11px;display:flex;align-items:center;gap:6px;border:1px solid rgba(240,181,107,.18);border-radius:999px;color:#f0b56b;background:rgba(240,181,107,.09);font-size:10px;font-weight:700;letter-spacing:.08em}
      .dash-login-badge svg{width:15px;height:15px}
      .dash-login-logo{position:relative;z-index:1;width:78px;height:78px;margin:0 auto 22px;display:grid;place-items:center;border-radius:24px;color:#fff;background:linear-gradient(135deg,#e18816,#bd6500);font-size:36px;font-weight:800;box-shadow:0 18px 40px rgba(217,120,0,.28)}
      .dash-login-card h1{position:relative;z-index:1;margin:0;color:#fff;font-size:clamp(29px,4vw,42px);line-height:1.08;letter-spacing:-.035em}
      .dash-login-card>p{position:relative;z-index:1;max-width:470px;margin:15px auto 0;color:#b9c0c9;font-size:15px;line-height:1.65}
      .dash-login-benefits{position:relative;z-index:1;margin:25px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .dash-login-benefits span{min-height:72px;padding:12px 10px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(255,255,255,.07);border-radius:14px;color:#d8dde3;background:rgba(255,255,255,.035);font-size:11px;font-weight:600;text-align:left}
      .dash-login-benefits svg{width:18px;height:18px;flex:0 0 auto;color:#f0b56b}
      .dash-login-page button{position:relative;z-index:1;width:100%;min-height:54px;padding:0 18px;display:flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:15px;color:#241b10;background:linear-gradient(135deg,#f3c17f,#e9a34c);font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 14px 30px rgba(217,120,0,.20)}
      .dash-login-page button:disabled{opacity:.62;cursor:not-allowed}
      .dash-login-page button svg{width:19px}
      .dash-login-page a{position:relative;z-index:1;display:inline-block;margin-top:19px;color:#c2c8d0;font-size:13px;text-decoration:none}
      .dash-login-page a:hover{color:#fff}
      @keyframes dashAuthSpin{to{transform:rotate(360deg)}}
      @media(max-width:650px){
        .dash-login-page{padding:18px}
        .dash-login-card{padding:30px 20px;border-radius:24px}
        .dash-login-benefits{grid-template-columns:1fr}
        .dash-login-benefits span{min-height:52px;justify-content:flex-start}
      }
    `}</style>
  );
}

export default function DashboardClient() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [mysteryOpen, setMysteryOpen] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthChecked(true);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') as DashboardTab | null;
    if (tab) setActiveTab(tab);
  }, []);

  const displayName = useMemo(() => {
    const name = user?.displayName?.trim();
    if (name) return name;
    const email = user?.email?.trim();
    return email ? email.split('@')[0] : 'Explorer';
  }, [user]);

  const firstName = useMemo(
    () => displayName.split(/\s+/).filter(Boolean)[0] || 'Explorer',
    [displayName],
  );

  const login = async () => {
    if (loginBusy) return;
    setLoginBusy(true);
    try {
      const loggedIn = await requireGoogleLogin();
      if (loggedIn) setUser(loggedIn);
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setActiveTab('overview');
  };

  const changeTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileMenu(false);
    setNotificationsOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inviteFriends = async () => {
    const inviteUrl = `${window.location.origin}/?ref=${encodeURIComponent(user?.uid ?? '')}`;
    const message = 'Join me on SPOTC and discover local offers, rewards and Mystery Boxes.';

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join SPOTC', text: message, url: inviteUrl });
        return;
      }
      await navigator.clipboard.writeText(`${message} ${inviteUrl}`);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Invite sharing failed:', error);
      window.alert('Unable to share right now. Please try again.');
    }
  };

  if (!authChecked) {
    return (
      <>
        <DashboardAuthStyles />
        <main className="dash-auth-loading">
          <span />
          <p>Preparing your SPOTC dashboard…</p>
        </main>
      </>
    );
  }

  if (!firebaseReady || !auth) {
    return (
      <>
        <DashboardAuthStyles />
        <main className="dash-login-page">
          <section className="dash-login-card">
            <span className="dash-login-logo">S</span>
            <h1>Firebase authentication is not configured</h1>
            <p>Check the NEXT_PUBLIC_FIREBASE environment variables.</p>
            <Link href="/">Return Home</Link>
          </section>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <DashboardAuthStyles />
        <main className="dash-login-page">
          <section className="dash-login-card">
            <div className="dash-login-badge">
              <Sparkles /> SPOTC MEMBER EXPERIENCE
            </div>
            <span className="dash-login-logo">S</span>
            <h1>Your local shopping journey, beautifully organized.</h1>
            <p>
              Sign in to view rewards, scan bills, track Mystery Boxes,
              manage orders and revisit saved products.
            </p>
            <div className="dash-login-benefits">
              <span><ShieldCheck />Secure Google login</span>
              <span><Crown />Premium rewards journey</span>
              <span><Sparkles />Personalized local benefits</span>
            </div>
            <button type="button" onClick={login} disabled={loginBusy}>
              <LogIn />
              {loginBusy ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <Link href="/">Continue browsing without login</Link>
          </section>
        </main>
      </>
    );
  }

  const content = (() => {
    switch (activeTab) {
      case 'overview':
        return (
          <DashboardOverview
            user={user}
            onOpenLevels={() => setLevelsOpen(true)}
            onOpenMysteryBoxes={() => setMysteryOpen(true)}
          />
        );
      case 'orders':
        return <DashboardOrders />;

      case 'rewards':
        return <DashboardRewards />;

      case 'mystery':
        return <DashboardMysteryBoxes />;

      case 'partner':
        return <DashboardPartner />;

      case 'unlock':
        return <DashboardUnlock />;

      case 'saved':
        return <DashboardSaved />;
      case 'circles': return <DashboardShoppingCircles />;
      default:
        return (
          <DashboardOverview
            user={user}
            onOpenLevels={() => setLevelsOpen(true)}
            onOpenMysteryBoxes={() => setMysteryOpen(true)}
          />
        );
    }
  })();

  return (
    <main className="dash-page">
      <aside className="dash-sidebar-desktop">
        <DashboardSidebar activeTab={activeTab} onChange={changeTab} onLogout={logout} />
      </aside>

      {mobileMenu && (
        <div className="dash-mobile-overlay" onMouseDown={() => setMobileMenu(false)}>
          <div className="dash-mobile-panel" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="dash-mobile-close" onClick={() => setMobileMenu(false)}><X /></button>
            <DashboardSidebar activeTab={activeTab} onChange={changeTab} onLogout={logout} />
          </div>
        </div>
      )}

      <section className="dash-shell">
        <header className="dash-header-card">
          <div className="dash-header-left">
            <button type="button" className="dash-menu" onClick={() => setMobileMenu(true)}><Menu /></button>
            <div className="dash-user-avatar">
              {user.photoURL ? <img src={user.photoURL} alt="" /> : <span><UserRound /></span>}
              <i />
            </div>
            <div className="dash-user-copy">
              <div className="dash-eyebrow"><Crown />SPOTC EXPLORER</div>
              <h1>Welcome back, {firstName}.</h1>
              <p>Your rewards, local shopping activity and premium unlocks are ready.</p>
            </div>
          </div>

          <div className="dash-header-right">
            <div className="dash-member-chip">
              <ShieldCheck />
              <span><small>ACCOUNT STATUS</small><strong>Verified member</strong></span>
            </div>

            <div className="dash-notification-wrap">
              <button type="button" className="dash-icon-button" onClick={() => setNotificationsOpen((v) => !v)}>
                <Bell /><i />
              </button>

              {notificationsOpen && (
                <div className="dash-notification-panel">
                  <div className="dash-popover-head">
                    <div><strong>Notifications</strong><span>Important SPOTC updates appear here.</span></div>
                    <button type="button" onClick={() => setNotificationsOpen(false)}><X /></button>
                  </div>
                  <button type="button" onClick={() => changeTab('rewards')}><Gift /><span><strong>Reward updates</strong><small>Unlocked rewards and expiry alerts</small></span></button>
                  <button type="button" onClick={() => changeTab('orders')}><CheckCircle2 /><span><strong>Order updates</strong><small>Confirmed, ready and delivered alerts</small></span></button>
                  <button type="button" onClick={() => setMysteryOpen(true)}><Sparkles /><span><strong>Mystery Box alerts</strong><small>Milestones, winners and new boxes</small></span></button>
                  <button type="button" onClick={() => changeTab('circles')}><Share2 /><span><strong>Shopping Circle</strong><small>Votes, replies and friend activity</small></span></button>
                </div>
              )}
            </div>

            <Link href="/" className="dash-icon-button"><Home /></Link>
            <button type="button" className="dash-icon-button dash-logout-icon" onClick={logout}><LogOut /></button>
          </div>
        </header>

        <div className="dash-content">{content}</div>

        {activeTab === 'overview' && (
          <section className="dash-bottom-cta-row">
            <article className="dash-box-cta">
              <div className="dash-cta-copy">
                <span className="dash-cta-kicker"><Gift />MYSTERY BOXES</span>
                <h2>Unlock bigger rewards as your points grow.</h2>
                <p>Open the milestone guide to see exactly how 3, 5 and 10-box packs work.</p>
                <div className="dash-box-milestones">
                  {BOX_PACKS.map((item) => (
                    <button type="button" key={item.boxes} onClick={() => setMysteryOpen(true)}>
                      <span>{item.boxes} Boxes</span><strong>{item.points} PTS</strong>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="dash-cta-primary purple" onClick={() => setMysteryOpen(true)}>
                Explore Mystery Boxes <Gift />
              </button>
            </article>

            <article className="dash-invite-card-v2">
              <div className="dash-invite-people-v2" aria-hidden="true">
                👥
              </div>

              <div className="dash-invite-content-v2">
                <span className="dash-invite-kicker-v2">
                  <Share2 />
                  INVITE &amp; EARN
                </span>

                <h2>Bring friends into your SPOTC circle.</h2>

                <p>
                  Share SPOTC and earn bonus rewards when
                  referral rewards are enabled.
                </p>
              </div>

              <button
                type="button"
                className="dash-invite-button-v2"
                onClick={inviteFriends}
              >
                {inviteCopied ? (
                  <>
                    Link Copied
                    <CheckCircle2 />
                  </>
                ) : (
                  <>
                    Invite Friends
                    {'share' in navigator ? <Share2 /> : <Copy />}
                  </>
                )}
              </button>
            </article>
          </section>
        )}
      </section>

      {levelsOpen && (
        <div className="dash-modal-backdrop" onMouseDown={() => setLevelsOpen(false)}>
          <section className="dash-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dash-modal-head">
              <div><span className="dash-modal-kicker"><Crown />REWARD JOURNEY</span><h2>All SPOTC levels</h2><p>Points come from approved bills, business coins and eligible bonuses.</p></div>
              <button type="button" onClick={() => setLevelsOpen(false)}><X /></button>
            </div>
            <div className="dash-level-modal-grid">
              {LEVELS.map(([level, points, title, reward]) => (
                <article key={level}><span>{level}</span><strong>{title}</strong><b>{points}</b><p>{reward}</p></article>
              ))}
            </div>
            <button type="button" className="dash-modal-primary" onClick={() => { setLevelsOpen(false); setMysteryOpen(true); }}>
              View Mystery Box Milestones <Gift />
            </button>
          </section>
        </div>
      )}

      {mysteryOpen && (
        <div className="dash-modal-backdrop" onMouseDown={() => setMysteryOpen(false)}>
          <section className="dash-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dash-modal-head">
              <div><span className="dash-modal-kicker purple"><Gift />MYSTERY BOXES</span><h2>How Mystery Boxes work</h2><p>Each unlocked box gives one chance to reveal an active local coupon, product reward or sponsored prize.</p></div>
              <button type="button" onClick={() => setMysteryOpen(false)}><X /></button>
            </div>
            <div className="dash-box-modal-grid">
              {BOX_PACKS.map((item) => (
                <article key={item.boxes}>
                  <div><Gift /><strong>{item.boxes}</strong><span>BOXES</span></div>
                  <h3>{item.title}</h3><b>{item.points} points required</b><p>{item.text}</p>
                  <button type="button" onClick={() => { setMysteryOpen(false); changeTab('rewards'); }}>View Rewards</button>
                </article>
              ))}
            </div>
            <div className="dash-info-note"><ShieldCheck /><span><strong>Recommended rule</strong>Show sponsor, expiry, reward limits and odds before a box is opened.</span></div>
          </section>
        </div>
      )}

      <style jsx global>{`
        :root{--dash-ink:#1e2329;--dash-muted:#6f7781;--dash-orange:#d97800;--dash-border:#e5e8ec;--dash-bg:#f5f7fa;--dash-green:#169b50}
        *{box-sizing:border-box}body{margin:0;background:var(--dash-bg)}
        .site-shell:has(.dash-page)>.topbar,.site-shell:has(.dash-page)>.mobile-nav,.site-shell:has(.dash-page) footer,.site-shell:has(.dash-page) .site-footer{display:none!important}
        .site-shell:has(.dash-page)>main{width:100%;height:100vh;margin:0;padding:0;overflow:hidden}
        html:has(.dash-page),body:has(.dash-page){height:100%;overflow:hidden}
        .dash-page{width:100%;height:100vh;min-height:100vh;display:grid;grid-template-columns:232px minmax(0,1fr);overflow:hidden;color:var(--dash-ink);background:var(--dash-bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .dash-sidebar-desktop{width:232px;min-width:232px;height:100vh;min-height:100vh;overflow:hidden;background:#fff;border-right:1px solid var(--dash-border)}
        .dash-sidebar-desktop>.dash-side{position:sticky!important;top:0!important;width:232px!important;height:100vh!important;min-height:100vh!important;padding:24px 15px!important;display:flex!important;flex-direction:column!important;overflow-y:auto!important;color:#24272d!important;background:#fff!important;border:0!important;box-shadow:none!important}
        .dash-side:before{display:none!important}.dash-side-brand{padding:10px 10px 24px!important}.dash-side-brand span{color:var(--dash-orange)!important;font-size:25px!important;font-weight:800!important;letter-spacing:.08em!important;text-shadow:none!important}.dash-side-brand small{color:#9299a3!important;font-size:10px!important;font-weight:600!important}.dash-side nav{display:grid!important;gap:6px!important}.dash-side nav button,.dash-logout{width:100%!important;min-height:46px!important;padding:0 13px!important;display:flex!important;align-items:center!important;gap:11px!important;border:1px solid transparent!important;border-radius:13px!important;color:#626b76!important;background:transparent!important;font-size:14px!important;font-weight:600!important;text-align:left!important;cursor:pointer!important;transform:none!important;box-shadow:none!important}.dash-side nav button.active{color:#9b5600!important;background:#fff2e1!important;border-color:#f1cf9f!important;font-weight:700!important}.dash-logout{margin-top:auto!important;color:#c8434c!important;background:#fff4f5!important;border-color:#f3d4d7!important}
        .dash-shell{width:100%;height:100vh;max-width:none;min-width:0;padding:22px 28px 64px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.dash-header-card{width:100%;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid var(--dash-border);border-radius:22px;background:#fff;box-shadow:0 9px 28px rgba(30,37,48,.06)}.dash-header-left,.dash-header-right{display:flex;align-items:center;gap:13px;min-width:0}.dash-menu{display:none;width:42px;height:42px;border:1px solid var(--dash-border);border-radius:12px;background:#fff;cursor:pointer}.dash-user-avatar{position:relative;width:58px;height:58px;flex:0 0 auto}.dash-user-avatar img,.dash-user-avatar>span{width:58px;height:58px;display:grid;place-items:center;object-fit:cover;border-radius:18px;color:#fff;background:linear-gradient(135deg,#347b25,#215f1b)}.dash-user-avatar i{position:absolute;right:-2px;bottom:-2px;width:15px;height:15px;border:3px solid #fff;border-radius:50%;background:#33c86f}.dash-user-copy{min-width:0}.dash-eyebrow{display:flex;align-items:center;gap:5px;margin-bottom:4px;color:#9a651f;font-size:10px;font-weight:700;letter-spacing:.08em}.dash-user-copy h1{margin:0;color:#171b20;font-size:clamp(26px,2.5vw,34px);line-height:1.1;font-weight:700}.dash-user-copy p{margin:6px 0 0;color:var(--dash-muted);font-size:14px}.dash-member-chip{min-width:175px;padding:10px 13px;display:flex;align-items:center;gap:9px;border:1px solid #d8eee1;border-radius:14px;background:#f1fbf5}.dash-member-chip>svg{width:22px;color:var(--dash-green)}.dash-member-chip small,.dash-member-chip strong{display:block}.dash-member-chip small{color:#789083;font-size:9px}.dash-member-chip strong{margin-top:2px;color:#277044;font-size:12px}.dash-icon-button{position:relative;width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--dash-border);border-radius:12px;color:#22282e;background:#fff;cursor:pointer}.dash-icon-button svg{width:19px}.dash-icon-button i{position:absolute;right:8px;top:7px;width:7px;height:7px;border:2px solid #fff;border-radius:50%;background:#ef4650}.dash-logout-icon{color:#df4650}
        .dash-notification-wrap{position:relative}.dash-notification-panel{position:absolute;right:0;top:52px;z-index:80;width:340px;padding:10px;border:1px solid var(--dash-border);border-radius:18px;background:#fff;box-shadow:0 22px 60px rgba(25,32,42,.18)}.dash-popover-head{padding:9px 9px 12px;display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf0f3}.dash-popover-head strong,.dash-popover-head span{display:block}.dash-popover-head span{margin-top:3px;color:#7a828d;font-size:11px}.dash-popover-head>button{width:30px;height:30px;border:0;border-radius:9px;background:#f4f6f8;cursor:pointer}.dash-notification-panel>button{width:100%;padding:12px 9px;display:flex;align-items:center;gap:11px;border:0;border-radius:12px;background:#fff;text-align:left;cursor:pointer}.dash-notification-panel>button:hover{background:#f7f8fa}.dash-notification-panel>button>svg{width:20px;color:#d97800}.dash-notification-panel>button span,.dash-notification-panel>button strong,.dash-notification-panel>button small{display:block}.dash-notification-panel>button small{margin-top:3px;color:#7a828d}
        .dash-content{width:100%;max-width:none;min-width:0;margin:24px 0 0;padding:0;display:block}.dash-content>*{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}.dash-content>.dash-overview{gap:24px!important}.dash-bottom-cta-row{width:100%;margin-top:24px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:24px}.dash-bottom-cta-row article{min-width:0;min-height:220px;padding:24px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;overflow:hidden;border:1px solid var(--dash-border);border-radius:24px;box-shadow:0 13px 34px rgba(35,42,53,.06)}.dash-box-cta{position:relative;background:linear-gradient(135deg,#fbf9ff,#f1ecff)}.dash-box-cta:after{content:'🎁';position:absolute;right:36px;top:26px;font-size:68px}.dash-invite-cta{position:relative;background:linear-gradient(135deg,#fffaf4,#fff1df)}.dash-invite-cta:after{content:'👥';position:absolute;right:32px;top:28px;font-size:60px}.dash-cta-copy{position:relative;z-index:1;max-width:620px}.dash-cta-kicker{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;color:#6035c4;background:#ece5ff;font-size:10px;font-weight:700}.dash-cta-kicker.orange{color:#a85c08;background:#ffead2}.dash-cta-copy h2{margin:13px 0 7px;font-size:clamp(22px,2.3vw,30px)}.dash-cta-copy p{margin:0;color:#737b85;font-size:14px}.dash-box-milestones{margin-top:17px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dash-box-milestones button{padding:11px;border:1px solid rgba(101,61,199,.12);border-radius:13px;background:#fff;text-align:left;cursor:pointer}.dash-box-milestones span,.dash-box-milestones strong{display:block}.dash-box-milestones span{color:#5f38b9;font-size:12px}.dash-box-milestones strong{margin-top:3px;color:#2a2335;font-size:13px}.dash-cta-primary{position:relative;z-index:2;min-width:168px;min-height:48px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:8px;flex:0 0 auto;border:0;border-radius:14px;color:#fff;font-weight:700;cursor:pointer}.dash-cta-primary.purple{background:#6a39d5}.dash-cta-primary.orange{background:#f28a00}
        .dash-modal-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:22px;background:rgba(19,23,29,.68);backdrop-filter:blur(7px)}.dash-modal{width:min(900px,100%);max-height:90vh;overflow-y:auto;padding:26px;border:1px solid #e5e8ec;border-radius:26px;background:#fff;box-shadow:0 35px 100px rgba(0,0,0,.28)}.dash-modal-head{display:flex;justify-content:space-between;gap:20px}.dash-modal-head h2{margin:10px 0 6px;font-size:30px}.dash-modal-head p{margin:0;color:#6f7781}.dash-modal-head>button{width:40px;height:40px;border:1px solid #e5e8ec;border-radius:12px;background:#fff;cursor:pointer}.dash-modal-kicker{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;color:#9a5a00;background:#fff1dc;font-size:10px;font-weight:800}.dash-modal-kicker.purple{color:#6035c4;background:#eee7ff}.dash-level-modal-grid,.dash-box-modal-grid{margin-top:22px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.dash-level-modal-grid article,.dash-box-modal-grid article{padding:18px;border:1px solid #e5e8ec;border-radius:18px;background:#fafbfc}.dash-level-modal-grid span,.dash-level-modal-grid strong,.dash-level-modal-grid b{display:block}.dash-level-modal-grid span{color:#d97800;font-size:10px;font-weight:800}.dash-level-modal-grid strong{margin-top:8px;font-size:18px}.dash-level-modal-grid b{margin-top:5px;color:#5f38b9}.dash-level-modal-grid p,.dash-box-modal-grid p{color:#6f7781;font-size:13px}.dash-modal-primary{margin-top:20px;min-height:48px;padding:0 17px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;color:#fff;background:#6d3cdf;font-weight:700;cursor:pointer}.dash-box-modal-grid article>div{width:76px;height:76px;display:grid;place-items:center;align-content:center;border-radius:22px;color:#fff;background:#6d3cdf}.dash-box-modal-grid article>div strong{font-size:24px}.dash-box-modal-grid article>div span{font-size:9px}.dash-box-modal-grid button{width:100%;min-height:40px;border:1px solid #d8c9ff;border-radius:11px;color:#6035c4;background:#fff;cursor:pointer}.dash-info-note{margin-top:18px;padding:15px;display:flex;gap:11px;border:1px solid #d8eee1;border-radius:15px;background:#f3fbf6}.dash-info-note>svg{width:22px;color:#169b50}.dash-info-note span{color:#557062;font-size:13px}.dash-info-note strong{display:block}
        .dash-auth-loading{min-height:100vh;display:grid;place-items:center;align-content:center;gap:14px}.dash-auth-loading span{width:36px;height:36px;border:3px solid #e0e3e7;border-top-color:#d97800;border-radius:50%;animation:spin .8s linear infinite}.dash-login-page{min-height:100vh;display:grid;place-items:center;padding:24px;color:#fff;background:#12151a}.dash-login-card{width:min(520px,100%);padding:36px;text-align:center;border-radius:28px;background:#1b1f25}.dash-login-badge{width:max-content;margin:0 auto 20px;padding:7px 10px;display:flex;gap:6px;border-radius:999px;color:#f0b56b;background:rgba(240,181,107,.1);font-size:10px}.dash-login-logo{width:74px;height:74px;margin:0 auto 20px;display:grid;place-items:center;border-radius:22px;background:#d97800;font-size:34px}.dash-login-benefits{margin:21px 0;display:grid;gap:8px}.dash-login-benefits span{padding:10px 12px;display:flex;gap:8px;border-radius:12px;background:rgba(255,255,255,.04);text-align:left}.dash-login-page button{width:100%;min-height:52px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;background:#f0b56b;font-weight:700}.dash-login-page a{display:inline-block;margin-top:17px;color:#bbc1c9}.dash-mobile-overlay{display:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:1100px){.dash-member-chip{display:none}.dash-bottom-cta-row{grid-template-columns:1fr}}
        @media(max-width:980px){.dash-page{display:block;height:100vh;min-height:100vh;overflow:hidden}.dash-sidebar-desktop{display:none}.dash-shell{width:100%;height:100vh;padding:18px 15px 55px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}.dash-menu{display:grid;place-items:center}.dash-mobile-overlay{position:fixed;inset:0;z-index:120;display:block;background:rgba(20,24,30,.72)}.dash-mobile-panel{position:relative;width:min(300px,88vw);height:100vh}.dash-mobile-panel>.dash-side{position:relative!important;width:100%!important;height:100vh!important;padding:24px 15px!important;display:flex!important;flex-direction:column!important;background:#fff!important}.dash-mobile-close{position:absolute;right:10px;top:10px;z-index:130;width:38px;height:38px;border:1px solid var(--dash-border);border-radius:50%;background:#fff}.dash-level-modal-grid,.dash-box-modal-grid{grid-template-columns:1fr}}
        @media(max-width:650px){.dash-header-card{padding:16px}.dash-icon-button{width:38px;height:38px}.dash-user-avatar,.dash-user-avatar img,.dash-user-avatar>span{width:48px;height:48px}.dash-user-copy h1{font-size:21px}.dash-user-copy p{max-width:170px;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.dash-notification-panel{position:fixed;left:12px;right:12px;top:76px;width:auto}.dash-bottom-cta-row article{display:block}.dash-box-milestones{grid-template-columns:1fr}.dash-cta-primary{width:100%;margin-top:18px}}

        /* UNIQUE INVITE CARD V2 — DOES NOT USE OLD CTA FLEX RULES */
        .dash-bottom-cta-row .dash-invite-card-v2 {
          position: relative;
          min-width: 0;
          min-height: 220px;
          padding: 24px;

          display: grid;
          grid-template-columns: minmax(0, 1fr) 190px;
          grid-template-rows: 1fr auto;
          column-gap: 24px;
          row-gap: 18px;
          align-items: end;

          overflow: hidden;
          border: 1px solid var(--dash-border);
          border-radius: 24px;
          background: linear-gradient(135deg, #fffaf4, #fff1df);
          box-shadow: 0 13px 34px rgba(35, 42, 53, 0.06);
        }

        .dash-invite-people-v2 {
          position: absolute;
          top: 28px;
          right: 34px;
          z-index: 1;

          font-size: 58px;
          line-height: 1;
          pointer-events: none;
        }

     .dash-invite-content-v2 {
  grid-column: 1;
  grid-row: 1 / 3;

  display: flex;
  flex-direction: column;
  justify-content: space-between;

  min-width: 0;
  max-width: 620px;
  height: 100%;

  padding-right: 8px;

  position: relative;
  z-index: 2;
}

        .dash-invite-kicker-v2 {
  width: fit-content;

  display: inline-flex;
  align-items: center;
  gap: 6px;

  margin-bottom: 18px;

  padding: 7px 12px;

  border-radius: 999px;

  color: #a85c08;
  background: #ffead2;

  font-size: 10px;
  font-weight: 700;
}

        .dash-invite-kicker-v2 svg {
          width: 16px;
          height: 16px;
        }

        .dash-invite-content-v2 h2 {
          max-width: 620px;
           margin: 0 0 10px;

          color: var(--dash-ink);
          font-size: clamp(22px, 2.3vw, 30px);
          line-height: 1.18;
          font-weight: 700;
        }

        .dash-invite-content-v2 p {
          max-width: 620px;
          margin: 0;

          color: #737b85;
          font-size: 14px;
          line-height: 1.45;
        }

        .dash-invite-button-v2 {
          grid-column: 2;
          grid-row: 2;
          align-self: end;
          justify-self: end;

          width: 190px;
          min-height: 48px;
          margin: 0;
          padding: 0 16px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          border: 0;
          border-radius: 14px;

          color: #ffffff;
          background: #f28a00;

          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
          position: relative;
          z-index: 2;
        }

        .dash-invite-button-v2 svg {
          width: 18px;
          height: 18px;
        }

        @media (max-width: 1100px) {
          .dash-bottom-cta-row .dash-invite-card-v2 {
            grid-template-columns: minmax(0, 1fr) 180px;
          }

          .dash-invite-button-v2 {
            width: 180px;
          }
        }

        @media (max-width: 650px) {
          .dash-bottom-cta-row .dash-invite-card-v2 {
            min-height: auto;
            padding: 20px;
            display: block;
          }

          .dash-invite-people-v2 {
            top: 20px;
            right: 20px;
            font-size: 44px;
          }

          .dash-invite-content-v2 {
            padding-right: 58px;
          }

          .dash-invite-button-v2 {
            width: 100%;
            min-height: 48px;
            margin-top: 20px;
          }
        }
      `}</style>
    </main>
  );
}