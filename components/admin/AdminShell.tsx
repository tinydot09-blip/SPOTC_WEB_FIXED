'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import { requireGoogleLogin } from '@/lib/auth';

import styles from './AdminShell.module.css';

type AccessState =
  | 'loading'
  | 'signed-out'
  | 'allowed'
  | 'denied';

const navItems = [
  ['/admin', 'Dashboard'],
  ['/admin/products', 'Products'],
  ['/admin/offers', 'Offers'],
  ['/admin/orders', 'Orders'],
  ['/admin/delivery', 'Delivery'],
  ['/admin/users', 'Users'],
  ['/admin/reports', 'Reports'],
] as const;

const PRIMARY_ADMIN_EMAILS = [
  'tinydot09@gmail.com',
  'shashanth.in09@gmail.com',

  // Add another permanent admin email here:
  // 'secondadmin@gmail.com',
];

function emailAllowed(user: User): boolean {
  const email =
    user.email?.trim().toLowerCase() || '';

  const permanentAdmins =
    PRIMARY_ADMIN_EMAILS.map((value) =>
      value.trim().toLowerCase(),
    );

  if (permanentAdmins.includes(email)) {
    return true;
  }

  const configuredAdmins = (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS || ''
  )
    .split(',')
    .map((value) =>
      value.trim().toLowerCase(),
    )
    .filter(Boolean);

  return configuredAdmins.includes(email);
}

async function hasAdminAccess(
  user: User,
): Promise<boolean> {
  if (emailAllowed(user)) {
    return true;
  }

  if (!db) {
    return false;
  }

  try {
    const snap = await getDoc(
      doc(db, 'Users', user.uid),
    );

    if (!snap.exists()) {
      return false;
    }

    const data = snap.data();

    return (
      data.is_admin === true ||
      data.isAdmin === true ||
      data.role === 'admin' ||
      data.role === 'super_admin'
    );
  } catch (error) {
    console.error(
      'Admin access check failed',
      error,
    );

    return false;
  }
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [access, setAccess] =
    useState<AccessState>('loading');

  const [user, setUser] =
    useState<User | null>(null);

  useEffect(() => {
    if (!auth) {
      setAccess('denied');
      return;
    }

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (nextUser) => {
          setUser(nextUser);

          if (
            !nextUser ||
            nextUser.isAnonymous
          ) {
            setAccess('signed-out');
            return;
          }

          setAccess('loading');

          const allowed =
            await hasAdminAccess(nextUser);

          setAccess(
            allowed ? 'allowed' : 'denied',
          );
        },
      );

    return unsubscribe;
  }, []);

  const sectionTitle = useMemo(() => {
    const exact = navItems.find(
      ([href]) => href === pathname,
    );

    if (exact) {
      return exact[1];
    }

    const parent = navItems.find(
      ([href]) =>
        href !== '/admin' &&
        pathname.startsWith(href),
    );

    return parent?.[1] || 'SPOTC Admin';
  }, [pathname]);

  if (access === 'loading') {
    return (
      <div className={styles.loading}>
        Checking admin access…
      </div>
    );
  }

  if (access === 'signed-out') {
    return (
      <div className={styles.denied}>
        <div
          className={styles.deniedCard}
        >
          <h1>SPOTC Admin</h1>

          <p>
            Sign in with your authorised
            Google account to continue.
          </p>

          <button
            type="button"
            className={styles.signIn}
            onClick={() =>
              void requireGoogleLogin()
            }
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (access !== 'allowed') {
    return (
      <div className={styles.denied}>
        <div
          className={styles.deniedCard}
        >
          <h1>
            Admin access required
          </h1>

          <p>
            This Google account is signed
            in, but it is not marked as a
            SPOTC admin.
          </p>

          <p>
            Add this account to the admin
            list, or set one of these
            fields in{' '}
            <code>
              Users/{user?.uid}
            </code>
            :
          </p>

          <p>
            <code>
              role: &quot;admin&quot;
            </code>
            <br />

            <code>
              role: &quot;super_admin&quot;
            </code>
            <br />

            <code>
              is_admin: true
            </code>
          </p>

          <p>
            <strong>
              Signed in:
            </strong>{' '}
            {user?.email || user?.uid}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside
        className={styles.sidebar}
      >
        <div className={styles.brand}>
          SPOTC
        </div>

        <div
          className={styles.brandSub}
        >
          ADMIN CONTROL CENTER
        </div>

        <nav className={styles.nav}>
          {navItems.map(
            ([href, label]) => {
              const active =
                href === '/admin'
                  ? pathname === href
                  : pathname.startsWith(
                      href,
                    );

              return (
                <Link
                  key={href}
                  href={href}
                  className={
                    active
                      ? styles.active
                      : ''
                  }
                >
                  {label}
                </Link>
              );
            },
          )}
        </nav>
      </aside>

      <main className={styles.main}>
        <header
          className={styles.topbar}
        >
          <div
            className={styles.title}
          >
            {sectionTitle}
          </div>

          <div
            className={styles.user}
          >
            {user?.email}
          </div>
        </header>

        <div
          className={styles.content}
        >
          {children}
        </div>
      </main>
    </div>
  );
}