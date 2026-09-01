'use client';

import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { requireGoogleLogin } from '@/lib/auth';
import { db, firebaseReady } from '@/lib/firebase';

const CAMPAIGN_KEY = 'spotc-share5-campaign-v1';
const CAMPAIGN_ID = 'share5_get1free_2026';
const MAX_PARTICIPANTS = 25;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type CampaignLocalState = {
  sharedProductIds?: string[];
  proofSubmitted?: boolean;
  claimId?: string;
  proofUrls?: string[];
};

const readCampaignState = (): CampaignLocalState => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(CAMPAIGN_KEY) || '{}') as CampaignLocalState;
  } catch {
    return {};
  }
};

const writeCampaignState = (next: CampaignLocalState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(next));
};

const cleanFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);

export default function ShareRewardProofPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [closed, setClosed] = useState(false);
  const [declaredLocal, setDeclaredLocal] = useState(false);
  const [sharedIds, setSharedIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const local = readCampaignState();
      const ids = Array.from(
        new Set(
          (local.sharedProductIds || [])
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 5);

      if (!active) return;
      setSharedIds(ids);

      if (ids.length < 5) {
        setMessage('Complete all 5 different product shares before uploading proof.');
        setLoading(false);
        return;
      }

      if (!firebaseReady || !db) {
        setMessage('SPOTC is not connected right now. Please try again.');
        setLoading(false);
        return;
      }

      const user = await requireGoogleLogin();
      if (!user || !active) {
        setLoading(false);
        return;
      }

      const claimId = `${CAMPAIGN_ID}_${user.uid}`;
      const existing = await getDoc(doc(db, 'ShareRewardClaims', claimId));

      if (!existing.exists()) {
        const firstClaims = await getDocs(
          query(
            collection(db, 'ShareRewardClaims'),
            orderBy('created_at', 'asc'),
            limit(MAX_PARTICIPANTS),
          ),
        );

        if (firstClaims.size >= MAX_PARTICIPANTS) {
          if (active) {
            setClosed(true);
            setMessage('This limited offer has reached the first 25 users.');
          }
        }
      }

      if (active) setLoading(false);
    })().catch((error) => {
      console.error('Share reward proof preparation failed:', error);
      if (active) {
        setMessage('Unable to open the proof page. Please try again.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(
    () => () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [previews],
  );

  const pickFiles = (list: FileList | null) => {
    if (!list) return;

    const selected = Array.from(list)
      .filter((file) => file.type.startsWith('image/'))
      .filter((file) => file.size <= MAX_FILE_BYTES)
      .slice(0, MAX_FILES);

    setFiles(selected);
    setMessage(
      selected.length !== list.length
        ? 'Use up to 5 image screenshots, maximum 8 MB each.'
        : '',
    );
  };

  const submit = async () => {
    if (uploading || closed) return;

    if (sharedIds.length < 5) {
      setMessage('Please complete 5 / 5 different product shares first.');
      return;
    }

    if (!declaredLocal) {
      setMessage('Please confirm that you shared only with people in the listed local areas.');
      return;
    }

    if (files.length < 1) {
      setMessage('Upload at least one WhatsApp screenshot showing your shares.');
      return;
    }

    if (!firebaseReady || !db) {
      setMessage('SPOTC is not connected right now. Please try again.');
      return;
    }

    const user = await requireGoogleLogin();
    if (!user) return;

    setUploading(true);
    setMessage('Preparing your proof upload…');

    try {
      const claimId = `${CAMPAIGN_ID}_${user.uid}`;
      const claimRef = doc(db, 'ShareRewardClaims', claimId);
      const existing = await getDoc(claimRef);

      if (!existing.exists()) {
        const firstClaims = await getDocs(
          query(
            collection(db, 'ShareRewardClaims'),
            orderBy('created_at', 'asc'),
            limit(MAX_PARTICIPANTS),
          ),
        );

        if (firstClaims.size >= MAX_PARTICIPANTS) {
          setClosed(true);
          throw new Error('This limited offer has reached the first 25 users.');
        }
      }

      const functions = getFunctions(undefined, 'asia-south1');
      const getR2UploadUrl = httpsCallable<
        { fileName: string; contentType: string; folder: string },
        { uploadUrl: string; publicUrl: string }
      >(functions, 'getR2UploadUrl');

      const proofUrls: string[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const extension = cleanFileName(file.name.split('.').pop() || 'jpg');
        const fileName = `share5_${user.uid}_${Date.now()}_${index + 1}.${extension}`;

        setMessage(`Uploading screenshot ${index + 1} of ${files.length}…`);

        const signed = await getR2UploadUrl({
          fileName,
          contentType: file.type || 'image/jpeg',
          folder: 'share5-proofs',
        });

        const response = await fetch(signed.data.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'image/jpeg',
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error(`Screenshot upload failed (${response.status}).`);
        }

        proofUrls.push(signed.data.publicUrl);
      }

      await setDoc(
        claimRef,
        {
          campaign_id: CAMPAIGN_ID,
          campaign_type: 'share5_get1free',
          user_uid: user.uid,
          user_email: user.email || '',
          user_name: user.displayName || '',
          shared_product_ids: sharedIds,
          shared_product_count: sharedIds.length,
          proof_urls: proofUrls,
          proof_count: proofUrls.length,
          local_share_declared: true,
          allowed_share_areas: [
            'Karamadai',
            'Teacher Colony',
            'EB Colony',
            'Gandhinagar',
          ],
          status: 'proof_submitted',
          verification_status: 'pending',
          proof_submitted_at: serverTimestamp(),
          created_at: existing.exists()
            ? existing.data().created_at || serverTimestamp()
            : serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );

      const local = readCampaignState();
      writeCampaignState({
        ...local,
        sharedProductIds: sharedIds,
        proofSubmitted: true,
        claimId,
        proofUrls,
      });

      router.push('/share-reward/gift');
    } catch (error) {
      console.error('Share reward proof upload failed:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to upload proof. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <main className="sr-proof-page sr-proof-state">
        <Loader2 className="sr-spin" />
        <p>Opening your Share 5 reward…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="sr-proof-page">
      <section className="sr-card">
        <div className="sr-icon"><ShieldCheck /></div>
        <small>SHARE 5 → GET 1 FREE</small>
        <h1>Upload WhatsApp Proof</h1>
        <p className="sr-lead">
          Your 5 different product shares are complete. Upload screenshot proof to unlock your FREE gift selection.
        </p>

        <div className="sr-progress">
          <CheckCircle2 />
          <strong>{sharedIds.length} / 5 products shared</strong>
        </div>

        {!closed && (
          <>
            <label className="sr-upload">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => pickFiles(event.target.files)}
                disabled={uploading}
              />
              <ImagePlus />
              <strong>{files.length ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected` : 'Choose WhatsApp Screenshot(s)'}</strong>
              <span>1–5 images • JPG / PNG / WEBP • Max 8 MB each</span>
            </label>

            {previews.length > 0 && (
              <div className="sr-previews">
                {previews.map((item, index) => (
                  <img key={`${item.file.name}-${index}`} src={item.url} alt={`WhatsApp proof ${index + 1}`} />
                ))}
              </div>
            )}

            <label className="sr-confirm">
              <input
                type="checkbox"
                checked={declaredLocal}
                onChange={(event) => setDeclaredLocal(event.target.checked)}
                disabled={uploading}
              />
              <span>
                I shared only with friends/family in Karamadai, Teacher Colony, EB Colony or Gandhinagar.
              </span>
            </label>

            <button className="sr-submit" type="button" onClick={submit} disabled={uploading}>
              {uploading ? <Loader2 className="sr-spin" /> : <UploadCloud />}
              {uploading ? 'Uploading…' : 'Upload Proof & Choose Gift'}
            </button>
          </>
        )}

        {message && <div className={closed ? 'sr-message sr-closed' : 'sr-message'}>{message}</div>}

        <p className="sr-note">
          SPOTC will manually verify the WhatsApp proof. You can choose your FREE gift immediately; the gift request is confirmed only after approval.
        </p>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .sr-proof-page{min-height:100vh;background:#fff8f5;padding:26px 14px 90px;color:#171717}.sr-proof-state{display:grid;place-items:center;text-align:center}.sr-card{width:min(620px,100%);margin:0 auto;background:#fff;border:1px solid #f1ded7;border-radius:26px;padding:24px;box-shadow:0 18px 48px rgba(46,23,12,.08)}.sr-icon{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:#ffe7ef;color:#d81b60}.sr-icon svg{width:30px;height:30px}.sr-card>small{display:block;margin-top:16px;color:#d81b60;font-weight:900;letter-spacing:.1em}.sr-card h1{margin:7px 0 8px;font-size:clamp(28px,6vw,42px);line-height:1.05}.sr-lead{margin:0;color:#655b57;line-height:1.6}.sr-progress{margin:18px 0;padding:13px 14px;border-radius:14px;background:#ecf9f0;color:#147a38;display:flex;align-items:center;gap:9px}.sr-progress svg{width:20px}.sr-upload{min-height:138px;border:2px dashed #e5b3c3;border-radius:18px;background:#fff9fb;display:grid;place-items:center;text-align:center;padding:20px;cursor:pointer}.sr-upload input{display:none}.sr-upload svg{color:#d81b60;width:31px;height:31px}.sr-upload strong{display:block;margin-top:8px}.sr-upload span{display:block;margin-top:4px;color:#7c706c;font-size:12px}.sr-previews{margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sr-previews img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;border:1px solid #eee}.sr-confirm{margin-top:14px;display:flex;gap:10px;align-items:flex-start;padding:13px;border-radius:14px;background:#fff5d9;color:#604b0c;font-size:13px;line-height:1.45;font-weight:700}.sr-confirm input{margin-top:2px;width:18px;height:18px;accent-color:#d81b60}.sr-submit{width:100%;margin-top:16px;min-height:52px;border:0;border-radius:15px;background:#d81b60;color:#fff;font-weight:900;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.sr-submit:disabled{opacity:.6;cursor:not-allowed}.sr-submit svg{width:20px}.sr-message{margin-top:14px;padding:12px 14px;border-radius:13px;background:#fff3cd;color:#6b5200;font-weight:700;font-size:13px}.sr-message.sr-closed{background:#feecec;color:#a11b1b}.sr-note{margin:16px 0 0;font-size:12px;line-height:1.55;color:#7c706c}.sr-spin{animation:srspin .8s linear infinite}@keyframes srspin{to{transform:rotate(360deg)}}@media(max-width:520px){.sr-card{padding:20px 16px;border-radius:22px}.sr-previews{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;