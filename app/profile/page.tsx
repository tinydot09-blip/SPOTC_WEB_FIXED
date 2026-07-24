'use client';

import {
  ArrowLeft,
  Camera,
  Check,
  LoaderCircle,
  Pencil,
  Save,
} from 'lucide-react';
import {
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { useRouter } from 'next/navigation';
import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  getSpotcUserProfile,
  type SpotcUserProfile,
} from '@/lib/auth';
import {
  auth,
  db,
  firebaseReady,
  storage,
} from '@/lib/firebase';

type ProfileForm = {
  display_name: string;
  email: string;
  photo_url: string;
  gender: string;
  date_of_birth: string;
  phone_number: string;
  whatsapp_number: string;
};

const emptyForm: ProfileForm = {
  display_name: '',
  email: '',
  photo_url: '',
  gender: '',
  date_of_birth: '',
  phone_number: '',
  whatsapp_number: '',
};

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setError('Firebase is not configured.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser || nextUser.isAnonymous) {
        router.replace('/offers');
        return;
      }

      setUser(nextUser);

      try {
        const profile = await getSpotcUserProfile(nextUser);

        setForm({
          display_name:
            profile?.display_name || nextUser.displayName || '',
          email: profile?.email || nextUser.email || '',
          photo_url: profile?.photo_url || nextUser.photoURL || '',
          gender: profile?.gender || '',
          date_of_birth: profile?.date_of_birth || '',
          phone_number: profile?.phone_number || '',
          whatsapp_number: profile?.whatsapp_number || '',
        });
      } catch (loadError) {
        console.error('Profile load failed:', loadError);
        setError('Unable to load your profile. Please try again.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const updateField = (
    field: keyof ProfileForm,
    value: string,
  ) => {
    setSaved(false);
    setError('');
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePhotoSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file || !user) {
      return;
    }

    event.target.value = '';

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be smaller than 5 MB.');
      return;
    }

    if (!storage) {
      setError('Firebase Storage is not configured.');
      return;
    }

    setUploadingPhoto(true);
    setSaved(false);
    setError('');

    try {
      const extension =
        file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const photoRef = ref(
        storage,
        `users/${user.uid}/profile/profile-${Date.now()}.${extension}`,
      );

      await uploadBytes(photoRef, file, {
        contentType: file.type,
      });

      const downloadUrl = await getDownloadURL(photoRef);

      setForm((current) => ({
        ...current,
        photo_url: downloadUrl,
      }));
    } catch (uploadError) {
      console.error('Profile photo upload failed:', uploadError);
      setError(
        'Photo upload failed. Check Firebase Storage rules and try again.',
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!user || !db) {
      return;
    }

    const cleanName = form.display_name.trim();
    const cleanPhone = form.phone_number.trim();
    const cleanWhatsapp = form.whatsapp_number.trim();

    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setError('');

    try {
      await updateProfile(user, {
        displayName: cleanName,
        photoURL: form.photo_url || null,
      });

      const profileUpdate: Partial<SpotcUserProfile> & {
        updated_at: ReturnType<typeof serverTimestamp>;
      } = {
        uid: user.uid,
        display_name: cleanName,
        email: form.email || user.email || '',
        photo_url: form.photo_url,
        phone_number: cleanPhone,
        whatsapp_number: cleanWhatsapp,
        updated_at: serverTimestamp(),
      };

      await setDoc(
        doc(db, 'Users', user.uid),
        profileUpdate,
        { merge: true },
      );

      setForm((current) => ({
        ...current,
        display_name: cleanName,
        phone_number: cleanPhone,
        whatsapp_number: cleanWhatsapp,
      }));

      window.dispatchEvent(
        new CustomEvent('spotc-profile-updated'),
      );

      setSaved(true);
    } catch (saveError) {
      console.error('Profile save failed:', saveError);
      setError('Unable to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="profile-loading-page">
        <LoaderCircle className="profile-spinner" size={32} />
        <p>Loading your profile...</p>

        <style jsx>{`
          .profile-loading-page {
            min-height: 100vh;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 12px;
            color: #625c54;
            background: #f8f6f1;
            font-family: inherit;
          }

          .profile-spinner {
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <header className="profile-topbar">
        <button
          type="button"
          className="profile-back-button"
          aria-label="Go back"
          onClick={() => router.back()}
        >
          <ArrowLeft size={21} />
        </button>

        <div>
          <strong>Profile</strong>
          <small>Manage your SPOTC account</small>
        </div>
      </header>

      <section className="profile-card">
        <div className="profile-avatar-section">
          <div className="profile-avatar">
            {form.photo_url ? (
              <img
                src={form.photo_url}
                alt={form.display_name || 'Profile'}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{initialsOf(form.display_name)}</span>
            )}

            {uploadingPhoto && (
              <div className="profile-avatar-loading">
                <LoaderCircle size={24} />
              </div>
            )}
          </div>

          <button
            type="button"
            className="profile-photo-button"
            disabled={uploadingPhoto}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={17} />
            {uploadingPhoto ? 'Uploading...' : 'Change photo'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => void handlePhotoSelected(event)}
          />
        </div>

        <div className="profile-fields">
          <label className="profile-field">
            <span>Name</span>
            <div className="profile-input-wrap">
              <input
                type="text"
                value={form.display_name}
                maxLength={80}
                autoComplete="name"
                onChange={(event) =>
                  updateField('display_name', event.target.value)
                }
              />
              <Pencil size={15} />
            </div>
          </label>

          <label className="profile-field profile-field-readonly">
            <span>Email</span>
            <input type="email" value={form.email} readOnly />
          </label>

          <label className="profile-field profile-field-readonly">
            <span>Gender</span>
            <input
              type="text"
              value={form.gender || 'Not added'}
              readOnly
            />
          </label>

          <label className="profile-field profile-field-readonly">
            <span>Date of birth</span>
            <input
              type="text"
              value={form.date_of_birth || 'Not added'}
              readOnly
            />
          </label>

          <label className="profile-field">
            <span>Phone</span>
            <div className="profile-input-wrap">
              <input
                type="tel"
                value={form.phone_number}
                maxLength={20}
                autoComplete="tel"
                inputMode="tel"
                onChange={(event) =>
                  updateField('phone_number', event.target.value)
                }
              />
              <Pencil size={15} />
            </div>
          </label>

          <label className="profile-field">
            <span>WhatsApp</span>
            <div className="profile-input-wrap">
              <input
                type="tel"
                value={form.whatsapp_number}
                maxLength={20}
                autoComplete="tel"
                inputMode="tel"
                onChange={(event) =>
                  updateField('whatsapp_number', event.target.value)
                }
              />
              <Pencil size={15} />
            </div>
          </label>
        </div>

        {error && <p className="profile-error">{error}</p>}

        {saved && (
          <p className="profile-success">
            <Check size={17} />
            Profile updated successfully
          </p>
        )}

        <button
          type="button"
          className="profile-save-button"
          disabled={saving || uploadingPhoto}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <LoaderCircle className="profile-button-spinner" size={19} />
          ) : (
            <Save size={18} />
          )}

          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </section>

      <style jsx>{`
        .profile-page {
          min-height: 100vh;
          padding: 28px 18px 60px;
          color: #211e1a;
          background:
            radial-gradient(circle at top, rgba(245, 189, 77, 0.14), transparent 36%),
            #f8f6f1;
        }

        .profile-topbar {
          width: min(680px, 100%);
          margin: 0 auto 18px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .profile-back-button {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 1px solid #ded7cd;
          border-radius: 50%;
          color: #211e1a;
          background: #fff;
          cursor: pointer;
        }

        .profile-topbar strong,
        .profile-topbar small {
          display: block;
        }

        .profile-topbar strong {
          font-size: 22px;
          font-weight: 850;
        }

        .profile-topbar small {
          margin-top: 3px;
          color: #756e65;
          font-size: 12px;
        }

        .profile-card {
          width: min(680px, 100%);
          margin: 0 auto;
          padding: 26px;
          border: 1px solid #e3ddd3;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 22px 60px rgba(34, 27, 19, 0.08);
        }

        .profile-avatar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding-bottom: 24px;
          border-bottom: 1px solid #eee9e2;
        }

        .profile-avatar {
          position: relative;
          width: 104px;
          height: 104px;
          overflow: hidden;
          border: 4px solid #fff;
          border-radius: 50%;
          background: #211e1a;
          box-shadow: 0 0 0 1px #d9d1c5, 0 12px 30px rgba(28, 22, 15, 0.16);
        }

        .profile-avatar img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .profile-avatar > span {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #fff;
          font-size: 30px;
          font-weight: 900;
        }

        .profile-avatar-loading {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.54);
        }

        .profile-avatar-loading :global(svg),
        .profile-button-spinner {
          animation: spin 0.8s linear infinite;
        }

        .profile-photo-button {
          min-height: 38px;
          padding: 0 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid #d8d0c5;
          border-radius: 999px;
          color: #2d2822;
          background: #fff;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
        }

        .profile-photo-button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .profile-fields {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .profile-field {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .profile-field > span {
          color: #554f47;
          font-size: 12px;
          font-weight: 800;
        }

        .profile-input-wrap {
          position: relative;
        }

        .profile-field input {
          width: 100%;
          height: 46px;
          padding: 0 14px;
          border: 1px solid #dcd5ca;
          border-radius: 12px;
          outline: none;
          color: #211e1a;
          background: #fff;
          font: inherit;
          font-size: 14px;
          box-sizing: border-box;
        }

        .profile-input-wrap input {
          padding-right: 42px;
        }

        .profile-input-wrap :global(svg) {
          position: absolute;
          top: 50%;
          right: 14px;
          color: #81786e;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .profile-field input:focus {
          border-color: #8f7b59;
          box-shadow: 0 0 0 3px rgba(143, 123, 89, 0.12);
        }

        .profile-field-readonly input {
          color: #756e65;
          background: #f5f2ed;
          cursor: default;
        }

        .profile-error,
        .profile-success {
          margin: 18px 0 0;
          padding: 11px 13px;
          border-radius: 11px;
          font-size: 13px;
          font-weight: 700;
        }

        .profile-error {
          color: #a32218;
          background: #fff0ee;
        }

        .profile-success {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #176b3a;
          background: #edf9f1;
        }

        .profile-save-button {
          width: 100%;
          min-height: 48px;
          margin-top: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 13px;
          color: #fff;
          background: #211e1a;
          font: inherit;
          font-size: 14px;
          font-weight: 850;
          cursor: pointer;
        }

        .profile-save-button:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 620px) {
          .profile-page {
            padding: 18px 12px 34px;
          }

          .profile-card {
            padding: 20px 15px;
            border-radius: 20px;
          }

          .profile-fields {
            grid-template-columns: 1fr;
            gap: 15px;
          }
        }
      `}</style>
    </main>
  );
}
