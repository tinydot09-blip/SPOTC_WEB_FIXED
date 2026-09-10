'use client';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import {
  doc,
  getDoc,
} from 'firebase/firestore';

import {
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  deliveryAuth,
  deliveryDb,
} from '@/lib/delivery-firebase';

function cleanPhone(
  value: string,
): string {
  return value.replace(
    /\D+/g,
    '',
  );
}

function riderEmail(
  phone: string,
): string {
  return `delivery-${phone}@spotc.in`;
}

function firebasePasswordFromPin(
  pin: string,
): string {
  return `SP${pin}#`.padEnd(
    8,
    '0',
  );
}

async function validDeliveryBoy(
  uid: string,
) {
  const snap =
    await getDoc(
      doc(
        deliveryDb,
        'DeliveryBoys',
        uid,
      ),
    );

  if (!snap.exists()) {
    return null;
  }

  const data =
    snap.data();

  if (
    data.role !==
    'delivery_boy'
  ) {
    return null;
  }

  if (
    data.is_active ===
    false
  ) {
    return null;
  }

  return data;
}

export default function DeliveryLoginPage() {
  const router =
    useRouter();

  const [
    phone,
    setPhone,
  ] =
    useState('');

  const [
    pin,
    setPin,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    checking,
    setChecking,
  ] =
    useState(true);

  const [
    message,
    setMessage,
  ] =
    useState('');

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        deliveryAuth,
        async (
          currentUser,
        ) => {
          if (!currentUser) {
            setChecking(false);
            return;
          }

          try {
            const rider =
              await validDeliveryBoy(
                currentUser.uid,
              );

            if (!rider) {
              await signOut(
                deliveryAuth,
              );

              localStorage.removeItem(
                'spotc-delivery-uid',
              );

              localStorage.removeItem(
                'spotc-delivery-name',
              );

              localStorage.removeItem(
                'spotc-delivery-phone',
              );

              setChecking(
                false,
              );

              return;
            }

            router.replace(
              '/delivery',
            );
          } catch (error) {
            console.error(
              'Delivery session check failed:',
              error,
            );

            await signOut(
              deliveryAuth,
            );

            setChecking(
              false,
            );
          }
        },
      );

    return unsubscribe;
  }, [router]);

  async function handleLogin() {
    if (loading) {
      return;
    }

    const cleanMobile =
      cleanPhone(phone);

    const cleanPin =
      pin.trim();

    if (
      cleanMobile.length <
        10 ||
      cleanMobile.length >
        15
    ) {
      setMessage(
        'Enter a valid mobile number.',
      );

      return;
    }

    if (
      !/^\d{4,6}$/.test(
        cleanPin,
      )
    ) {
      setMessage(
        'Enter your 4 to 6 digit PIN.',
      );

      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const email =
        riderEmail(
          cleanMobile,
        );

      const password =
        firebasePasswordFromPin(
          cleanPin,
        );

      const credential =
        await signInWithEmailAndPassword(
          deliveryAuth,
          email,
          password,
        );

      const rider =
        await validDeliveryBoy(
          credential.user.uid,
        );

      if (!rider) {
        await signOut(
          deliveryAuth,
        );

        throw new Error(
          'This delivery account is inactive or not authorised.',
        );
      }

      const savedPhone =
        String(
          rider.phone || '',
        );

      if (
        cleanPhone(
          savedPhone,
        ) !== cleanMobile
      ) {
        await signOut(
          deliveryAuth,
        );

        throw new Error(
          'Mobile number does not match this delivery account.',
        );
      }

      localStorage.setItem(
        'spotc-delivery-uid',
        credential.user.uid,
      );

      localStorage.setItem(
        'spotc-delivery-name',
        String(
          rider.name ||
            credential.user
              .displayName ||
            'Delivery Boy',
        ),
      );

      localStorage.setItem(
        'spotc-delivery-phone',
        savedPhone,
      );

      window.location.replace(
        '/delivery',
      );
    } catch (error) {
      console.error(
        'Delivery login failed:',
        error,
      );

      const code =
        typeof error ===
          'object' &&
        error !== null &&
        'code' in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code,
            )
          : '';

      if (
        code ===
          'auth/invalid-credential' ||
        code ===
          'auth/wrong-password' ||
        code ===
          'auth/user-not-found' ||
        code ===
          'auth/invalid-login-credentials'
      ) {
        setMessage(
          'Mobile number or PIN is incorrect.',
        );
      } else {
        setMessage(
          error instanceof
            Error
            ? error.message
            : 'Login failed.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={page}>
        <div style={card}>
          Checking delivery
          login…
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={card}>
        <div style={brand}>
          SPOTC
        </div>

        <div style={roleText}>
          DELIVERY
        </div>

        <h1 style={title}>
          Delivery Login
        </h1>

        <p style={subtitle}>
          Enter the mobile number
          and PIN provided by SPOTC
          Admin.
        </p>

        {message && (
          <div style={messageBox}>
            {message}
          </div>
        )}

        <label style={field}>
          <span style={label}>
            Mobile Number
          </span>

          <input
            value={phone}
            onChange={(
              event,
            ) =>
              setPhone(
                event.target
                  .value,
              )
            }
            inputMode="tel"
            autoComplete="tel"
            placeholder="9876543210"
            style={input}
          />
        </label>

        <label style={field}>
          <span style={label}>
            Login PIN
          </span>

          <input
            value={pin}
            onChange={(
              event,
            ) =>
              setPin(
                event.target
                  .value
                  .replace(
                    /\D+/g,
                    '',
                  )
                  .slice(
                    0,
                    6,
                  ),
              )
            }
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="Enter PIN"
            style={input}
          />
        </label>

        <button
          type="button"
          disabled={loading}
          onClick={() =>
            void handleLogin()
          }
          style={{
            ...loginButton,
            opacity:
              loading
                ? 0.6
                : 1,
          }}
        >
          {loading
            ? 'Signing in…'
            : 'Login'}
        </button>

        <div style={helpText}>
          Contact SPOTC Admin if
          you cannot sign in.
        </div>
      </div>
    </main>
  );
}

const page:
  React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    'center',
  padding: 20,
  background: '#f5f6f7',
};

const card:
  React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: 28,
  borderRadius: 18,
  background: '#fff',
  border:
    '1px solid #e4e7ec',
  boxShadow:
    '0 12px 40px rgba(0,0,0,0.06)',
};

const brand:
  React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: -1,
  color: '#111',
};

const roleText:
  React.CSSProperties = {
  marginTop: 2,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.6,
  color: '#f59e0b',
};

const title:
  React.CSSProperties = {
  margin:
    '28px 0 6px',
  fontSize: 25,
  color: '#111',
};

const subtitle:
  React.CSSProperties = {
  margin:
    '0 0 22px',
  color: '#667085',
  lineHeight: 1.5,
  fontSize: 14,
};

const messageBox:
  React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  borderRadius: 9,
  background: '#fffaeb',
  border:
    '1px solid #fedf89',
  color: '#93370d',
  fontSize: 13,
};

const field:
  React.CSSProperties = {
  display: 'flex',
  flexDirection:
    'column',
  gap: 6,
  marginBottom: 15,
};

const label:
  React.CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: '#344054',
};

const input:
  React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  boxSizing:
    'border-box',
  padding: '0 13px',
  border:
    '1px solid #d0d5dd',
  borderRadius: 10,
  outline: 'none',
  fontSize: 15,
  background: '#fff',
};

const loginButton:
  React.CSSProperties = {
  width: '100%',
  minHeight: 50,
  marginTop: 6,
  border: 0,
  borderRadius: 10,
  background: '#111',
  color: '#fff',
  fontSize: 15,
  fontWeight: 750,
  cursor: 'pointer',
};

const helpText:
  React.CSSProperties = {
  marginTop: 18,
  textAlign: 'center',
  color: '#98a2b3',
  fontSize: 12,
};