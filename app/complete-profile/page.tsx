'use client';

import {
  CalendarDays,
  Check,
  LoaderCircle,
  LogOut,
  Phone,
  UserRound,
} from 'lucide-react';

import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';

import {
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { useRouter } from 'next/navigation';

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getSpotcUserProfile,
} from '@/lib/auth';

import {
  auth,
  db,
  firebaseReady,
} from '@/lib/firebase';

type GenderValue =
  | ''
  | 'male'
  | 'female'
  | 'other'
  | 'prefer_not_to_say';

const PROFILE_SKIP_KEY =
  'spotc-profile-skipped';

function cleanPhoneNumber(
  value: string,
): string {
  return value.replace(/[^\d+]/g, '');
}

function phoneDigits(
  value: string,
): string {
  return value.replace(/\D/g, '');
}

function isValidPhone(
  value: string,
): boolean {
  const digits = phoneDigits(value);

  return (
    digits.length >= 10 &&
    digits.length <= 15
  );
}

export default function CompleteProfilePage() {
  const router = useRouter();

  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [error, setError] =
    useState('');

  const [
    displayName,
    setDisplayName,
  ] = useState('');

  const [
    gender,
    setGender,
  ] = useState<GenderValue>('');

  const [
    dateOfBirth,
    setDateOfBirth,
  ] = useState('');

  const [
    phoneNumber,
    setPhoneNumber,
  ] = useState('');

  const [
    whatsappNumber,
    setWhatsappNumber,
  ] = useState('');

  const [
    sameAsPhone,
    setSameAsPhone,
  ] = useState(true);

  const maximumDate = useMemo(() => {
    return new Date()
      .toISOString()
      .split('T')[0];
  }, []);

  useEffect(() => {
    if (
      !firebaseReady ||
      !auth
    ) {
      setError(
        'Firebase authentication is not configured.',
      );

      setLoading(false);
      return;
    }

    let active = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (nextUser) => {
          if (!active) {
            return;
          }

          if (
            !nextUser ||
            nextUser.isAnonymous
          ) {
            router.replace('/offers');
            return;
          }

          setUser(nextUser);

          try {
            const existingProfile =
              await getSpotcUserProfile(
                nextUser,
              );

            if (!active) {
              return;
            }

            if (
              existingProfile
                ?.profile_complete === true
            ) {
              sessionStorage.removeItem(
                PROFILE_SKIP_KEY,
              );

              router.replace('/offers');
              return;
            }

            setDisplayName(
              existingProfile
                ?.display_name
                ?.trim() ||
                nextUser.displayName
                  ?.trim() ||
                '',
            );

            setGender(
              (
                existingProfile?.gender ||
                ''
              ) as GenderValue,
            );

            setDateOfBirth(
              existingProfile
                ?.date_of_birth ||
                '',
            );

            const savedPhone =
              existingProfile
                ?.phone_number ||
              '';

            const savedWhatsapp =
              existingProfile
                ?.whatsapp_number ||
              '';

            setPhoneNumber(
              savedPhone,
            );

            setWhatsappNumber(
              savedWhatsapp ||
                savedPhone,
            );

            setSameAsPhone(
              !savedWhatsapp ||
                savedWhatsapp ===
                  savedPhone,
            );
          } catch (
            profileError
          ) {
            console.error(
              'Unable to load profile:',
              profileError,
            );

            setError(
              'Unable to load your profile. Please refresh and try again.',
            );
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        },
      );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const handlePhoneChange = (
    value: string,
  ) => {
    const cleaned =
      cleanPhoneNumber(value);

    setPhoneNumber(cleaned);

    if (sameAsPhone) {
      setWhatsappNumber(
        cleaned,
      );
    }
  };

  const handleSameAsPhoneChange = (
    checked: boolean,
  ) => {
    setSameAsPhone(checked);

    if (checked) {
      setWhatsappNumber(
        phoneNumber,
      );
    }
  };

  const handleSkipForNow = () => {
    if (!user) {
      router.replace('/offers');
      return;
    }

    sessionStorage.setItem(
      PROFILE_SKIP_KEY,
      user.uid,
    );

    router.replace('/offers');
    router.refresh();
  };

  const handleSignOut = async () => {
    if (!auth) {
      router.replace('/offers');
      return;
    }

    setLoggingOut(true);
    setError('');

    try {
      sessionStorage.removeItem(
        PROFILE_SKIP_KEY,
      );

      await signOut(auth);

      router.replace('/offers');
      router.refresh();
    } catch (
      logoutError
    ) {
      console.error(
        'Profile logout failed:',
        logoutError,
      );

      setError(
        'Unable to sign out. Please try again.',
      );

      setLoggingOut(false);
    }
  };

  const handleSubmit = async (
    event:
      FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !user ||
      !db
    ) {
      setError(
        'You must be signed in to save your profile.',
      );

      return;
    }

    const finalName =
      displayName.trim();

    const finalPhone =
      cleanPhoneNumber(
        phoneNumber,
      );

    const finalWhatsapp =
      sameAsPhone
        ? finalPhone
        : cleanPhoneNumber(
            whatsappNumber,
          );

    if (!finalName) {
      setError(
        'Please enter your full name.',
      );

      return;
    }

    if (!gender) {
      setError(
        'Please select your gender.',
      );

      return;
    }

    if (!dateOfBirth) {
      setError(
        'Please enter your date of birth.',
      );

      return;
    }

    if (
      dateOfBirth >
      maximumDate
    ) {
      setError(
        'Date of birth cannot be in the future.',
      );

      return;
    }

    if (
      !isValidPhone(
        finalPhone,
      )
    ) {
      setError(
        'Please enter a valid phone number.',
      );

      return;
    }

    if (
      !isValidPhone(
        finalWhatsapp,
      )
    ) {
      setError(
        'Please enter a valid WhatsApp number.',
      );

      return;
    }

    setSaving(true);
    setError('');

    try {
      await setDoc(
        doc(
          db,
          'Users',
          user.uid,
        ),
        {
          uid: user.uid,

          display_name:
            finalName,

          email:
            user.email ||
            '',

          photo_url:
            user.photoURL ||
            '',

          gender,

          date_of_birth:
            dateOfBirth,

          phone_number:
            finalPhone,

          whatsapp_number:
            finalWhatsapp,

          whatsapp_same_as_phone:
            sameAsPhone,

          profile_complete:
            true,

          profile_completed_at:
            serverTimestamp(),

          updated_at:
            serverTimestamp(),
        },
        {
          merge: true,
        },
      );

      sessionStorage.removeItem(
        PROFILE_SKIP_KEY,
      );

      router.replace('/offers');
      router.refresh();
    } catch (
      saveError
    ) {
      console.error(
        'Profile save failed:',
        saveError,
      );

      const firebaseError =
        saveError as {
          code?: string;
        };

      if (
        firebaseError.code ===
        'permission-denied'
      ) {
        setError(
          'Firestore permission denied. Allow signed-in users to update their own Users document.',
        );
      } else {
        setError(
          'Unable to save your profile. Please try again.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="complete-profile-loading">
        <LoaderCircle
          size={34}
          className="complete-profile-spinner"
        />

        <p>
          Loading your profile…
        </p>

        <style jsx>{`
          .complete-profile-loading {
            width: 100%;
            min-height: 100dvh;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 12px;
            color: #2a2723;
            background: #f8f6f1;
          }

          .complete-profile-loading p {
            margin: 0;
            color: #746e65;
            font-size: 14px;
            font-weight: 600;
          }

          .complete-profile-spinner {
            animation:
              profile-spin
              0.8s
              linear
              infinite;
          }

          @keyframes profile-spin {
            to {
              transform:
                rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const actionsDisabled =
    saving ||
    loggingOut;

  return (
    <main className="complete-profile-page">
      <section className="complete-profile-card">
        <div className="complete-profile-top">
          <button
            type="button"
            className="profile-close-button"
            onClick={
              handleSkipForNow
            }
            disabled={
              actionsDisabled
            }
            aria-label="Close profile setup"
          >
            Skip
          </button>
        </div>

        <div className="complete-profile-brand">
          SPOTC
        </div>

        <div className="complete-profile-avatar">
          {user.photoURL ? (
            <img
              src={
                user.photoURL
              }
              alt={
                displayName ||
                'Profile'
              }
              referrerPolicy="no-referrer"
            />
          ) : (
            <UserRound
              size={42}
            />
          )}

          <span>
            <Check
              size={15}
            />
          </span>
        </div>

        <header className="complete-profile-header">
          <h1>
            Complete your profile
          </h1>

          <p>
            Add a few details to
            personalize your SPOTC
            experience.
          </p>
        </header>

        <form
          className="complete-profile-form"
          onSubmit={
            handleSubmit
          }
        >
          <label className="profile-field">
            <span>
              Full name
            </span>

            <div className="profile-input-wrap">
              <UserRound
                size={18}
              />

              <input
                type="text"
                value={
                  displayName
                }
                onChange={(
                  event,
                ) =>
                  setDisplayName(
                    event.target
                      .value,
                  )
                }
                placeholder="Enter your full name"
                autoComplete="name"
                maxLength={80}
              />
            </div>
          </label>

          <label className="profile-field">
            <span>
              Gender
            </span>

            <select
              value={gender}
              onChange={(
                event,
              ) =>
                setGender(
                  event.target
                    .value as GenderValue,
                )
              }
            >
              <option value="">
                Select gender
              </option>

              <option value="male">
                Male
              </option>

              <option value="female">
                Female
              </option>

              <option value="other">
                Other
              </option>

              <option value="prefer_not_to_say">
                Prefer not to say
              </option>
            </select>
          </label>

          <label className="profile-field">
            <span>
              Date of birth
            </span>

            <div className="profile-input-wrap">
              <CalendarDays
                size={18}
              />

              <input
                type="date"
                value={
                  dateOfBirth
                }
                max={
                  maximumDate
                }
                onChange={(
                  event,
                ) =>
                  setDateOfBirth(
                    event.target
                      .value,
                  )
                }
              />
            </div>
          </label>

          <label className="profile-field">
            <span>
              Phone number
            </span>

            <div className="profile-input-wrap">
              <Phone
                size={18}
              />

              <input
                type="tel"
                inputMode="tel"
                value={
                  phoneNumber
                }
                onChange={(
                  event,
                ) =>
                  handlePhoneChange(
                    event.target
                      .value,
                  )
                }
                placeholder="+91 98765 43210"
                autoComplete="tel"
                maxLength={18}
              />
            </div>
          </label>

          <label className="profile-checkbox">
            <input
              type="checkbox"
              checked={
                sameAsPhone
              }
              onChange={(
                event,
              ) =>
                handleSameAsPhoneChange(
                  event.target
                    .checked,
                )
              }
            />

            <span>
              WhatsApp number is
              the same as my phone
              number
            </span>
          </label>

          {!sameAsPhone && (
            <label className="profile-field">
              <span>
                WhatsApp number
              </span>

              <div className="profile-input-wrap">
                <Phone
                  size={18}
                />

                <input
                  type="tel"
                  inputMode="tel"
                  value={
                    whatsappNumber
                  }
                  onChange={(
                    event,
                  ) =>
                    setWhatsappNumber(
                      cleanPhoneNumber(
                        event
                          .target
                          .value,
                      ),
                    )
                  }
                  placeholder="+91 98765 43210"
                  maxLength={18}
                />
              </div>
            </label>
          )}

          <div className="profile-email">
            <span>
              Google account
            </span>

            <strong>
              {user.email ||
                'Signed in'}
            </strong>
          </div>

          {error && (
            <div
              className="profile-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="profile-submit"
            disabled={
              actionsDisabled
            }
          >
            {saving ? (
              <>
                <LoaderCircle
                  size={19}
                  className="profile-button-spinner"
                />

                Saving profile…
              </>
            ) : (
              'Continue to SPOTC'
            )}
          </button>

          <button
            type="button"
            className="profile-later-button"
            disabled={
              actionsDisabled
            }
            onClick={
              handleSkipForNow
            }
          >
            Do this later
          </button>

          <button
            type="button"
            className="profile-logout-button"
            disabled={
              actionsDisabled
            }
            onClick={() =>
              void handleSignOut()
            }
          >
            {loggingOut ? (
              <>
                <LoaderCircle
                  size={18}
                  className="profile-button-spinner"
                />

                Signing out…
              </>
            ) : (
              <>
                <LogOut
                  size={18}
                />

                Sign out
              </>
            )}
          </button>
        </form>
      </section>

      <style jsx>{`
        .complete-profile-page {
          width: 100%;
          min-height: 100dvh;
          padding:
            40px
            16px;
          display: grid;
          place-items: center;
          overflow-x: hidden;
          background:
            radial-gradient(
              circle at top,
              rgba(
                230,
                185,
                91,
                0.16
              ),
              transparent 34%
            ),
            #f8f6f1;
        }

        .complete-profile-card {
          position: relative;
          width: min(
            100%,
            520px
          );
          padding: 34px;
          border: 1px solid
            #e5ded3;
          border-radius: 28px;
          background:
            rgba(
              255,
              255,
              255,
              0.96
            );
          box-shadow:
            0 28px 80px
            rgba(
              43,
              32,
              19,
              0.12
            );
        }

        .complete-profile-top {
          position: absolute;
          top: 16px;
          right: 18px;
        }

        .profile-close-button {
          min-height: 34px;
          padding:
            0
            12px;
          border: 1px solid
            #ddd5ca;
          border-radius: 999px;
          color: #554e46;
          background: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .complete-profile-brand {
          margin-bottom: 22px;
          color: #1d1a17;
          font-size: 16px;
          font-weight: 950;
          letter-spacing: 2px;
          text-align: center;
        }

        .complete-profile-avatar {
          position: relative;
          width: 86px;
          height: 86px;
          margin:
            0
            auto
            18px;
          display: grid;
          place-items: center;
          overflow: visible;
          border-radius: 50%;
          color: #fff;
          background: #211d18;
          box-shadow:
            0 0 0 5px #fff,
            0 0 0 6px
              #dfd6c9;
        }

        .complete-profile-avatar img {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 50%;
          object-fit: cover;
        }

        .complete-profile-avatar > span {
          position: absolute;
          right: -2px;
          bottom: 1px;
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          border: 3px solid
            #fff;
          border-radius: 50%;
          color: #fff;
          background: #257a46;
        }

        .complete-profile-header {
          margin-bottom: 26px;
          text-align: center;
        }

        .complete-profile-header h1 {
          margin: 0;
          color: #1e1b18;
          font-size:
            clamp(
              25px,
              5vw,
              32px
            );
          font-weight: 900;
          letter-spacing:
            -0.8px;
        }

        .complete-profile-header p {
          max-width: 390px;
          margin:
            9px
            auto
            0;
          color: #777067;
          font-size: 14px;
          line-height: 1.55;
        }

        .complete-profile-form {
          display: grid;
          gap: 17px;
        }

        .profile-field {
          display: grid;
          gap: 7px;
        }

        .profile-field > span,
        .profile-email > span {
          color: #4f4942;
          font-size: 12px;
          font-weight: 800;
        }

        .profile-input-wrap {
          height: 50px;
          padding:
            0
            14px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid
            #ddd5ca;
          border-radius: 13px;
          color: #746c62;
          background: #fff;
        }

        .profile-input-wrap:focus-within {
          border-color: #5c5349;
          box-shadow:
            0 0 0 3px
            rgba(
              91,
              81,
              69,
              0.1
            );
        }

        .profile-input-wrap input {
          width: 100%;
          min-width: 0;
          height: 100%;
          border: 0;
          outline: 0;
          color: #201d19;
          background:
            transparent;
          font: inherit;
          font-size: 14px;
        }

        .profile-field select {
          width: 100%;
          height: 50px;
          padding:
            0
            14px;
          border: 1px solid
            #ddd5ca;
          border-radius: 13px;
          outline: 0;
          color: #201d19;
          background: #fff;
          font: inherit;
          font-size: 14px;
        }

        .profile-field select:focus {
          border-color: #5c5349;
          box-shadow:
            0 0 0 3px
            rgba(
              91,
              81,
              69,
              0.1
            );
        }

        .profile-checkbox {
          display: flex;
          align-items:
            flex-start;
          gap: 10px;
          color: #514b44;
          font-size: 13px;
          line-height: 1.45;
          cursor: pointer;
        }

        .profile-checkbox input {
          width: 17px;
          height: 17px;
          margin-top: 1px;
          accent-color:
            #211d18;
        }

        .profile-email {
          padding:
            13px
            15px;
          display: grid;
          gap: 4px;
          border-radius: 13px;
          background: #f4f1ec;
        }

        .profile-email strong {
          overflow: hidden;
          color: #29251f;
          font-size: 13px;
          font-weight: 700;
          text-overflow:
            ellipsis;
          white-space: nowrap;
        }

        .profile-error {
          padding:
            12px
            14px;
          border: 1px solid
            #f0bbb5;
          border-radius: 12px;
          color: #a52b20;
          background: #fff3f1;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.45;
        }

        .profile-submit,
        .profile-later-button,
        .profile-logout-button {
          width: 100%;
          min-height: 50px;
          padding:
            0
            20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border-radius: 14px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .profile-submit {
          border: 0;
          color: #fff;
          background:
            linear-gradient(
              135deg,
              #2b2722,
              #171411
            );
          box-shadow:
            0 13px 28px
            rgba(
              27,
              23,
              18,
              0.2
            );
        }

        .profile-later-button {
          border: 1px solid
            #d8d0c5;
          color: #312d28;
          background: #fff;
        }

        .profile-logout-button {
          border: 1px solid
            #f0c5bf;
          color: #a52b20;
          background: #fff4f2;
        }

        .profile-submit:disabled,
        .profile-later-button:disabled,
        .profile-logout-button:disabled,
        .profile-close-button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .profile-button-spinner {
          animation:
            profile-button-spin
            0.8s
            linear
            infinite;
        }

        @keyframes profile-button-spin {
          to {
            transform:
              rotate(360deg);
          }
        }

        @media (
          max-width: 600px
        ) {
          .complete-profile-page {
            padding:
              16px
              10px
              calc(
                24px +
                env(
                  safe-area-inset-bottom,
                  0px
                )
              );
            place-items:
              start center;
          }

          .complete-profile-card {
            padding:
              26px
              18px;
            border-radius: 22px;
          }

          .complete-profile-top {
            top: 12px;
            right: 12px;
          }

          .complete-profile-brand {
            margin-top: 6px;
          }
        }
      `}</style>
    </main>
  );
}