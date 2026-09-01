'use client';

import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
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

type ClaimData = {
  campaign_id?: unknown;
  campaign_type?: unknown;
  user_uid?: unknown;
  mobile_number?: unknown;
  mobile_normalized?: unknown;
  status?: unknown;
  verification_status?: unknown;
  gift_product_id?: unknown;
  selected_gift_id?: unknown;
  created_at?: unknown;
};

const readCampaignState = (): CampaignLocalState => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(
      window.localStorage.getItem(CAMPAIGN_KEY) || '{}',
    ) as CampaignLocalState;
  } catch {
    return {};
  }
};

const writeCampaignState = (
  next: CampaignLocalState,
) => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    CAMPAIGN_KEY,
    JSON.stringify(next),
  );
};

const cleanFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);

const cleanText = (value: unknown): string =>
  String(value ?? '').trim();

const normalizeIndianMobile = (
  value: unknown,
): string => {
  const digits = cleanText(value).replace(/\D/g, '');

  if (!digits) return '';

  const last10 =
    digits.length >= 10
      ? digits.slice(-10)
      : digits;

  return /^[6-9]\d{9}$/.test(last10)
    ? last10
    : '';
};

const claimStatus = (
  data: ClaimData | null,
): string =>
  cleanText(
    data?.verification_status ||
      data?.status,
  )
    .toLowerCase()
    .replace(/\s+/g, '_');

const canRetryProof = (
  status: string,
): boolean =>
  status === 'rejected' ||
  status === 'proof_rejected';

const alreadyClaimedMessage = (
  status: string,
): string => {
  if (
    status === 'pending' ||
    status === 'proof_submitted' ||
    status === 'pending_verification' ||
    status === 'gift_selected' ||
    status === 'request_submitted' ||
    status === 'proof_uploading'
  ) {
    return 'This mobile number is already registered for the Share 5 → Get 1 FREE offer. Your existing FREE gift request is already in progress.';
  }

  if (
    status === 'approved' ||
    status === 'confirmed' ||
    status === 'picking' ||
    status === 'packed' ||
    status === 'out_for_delivery' ||
    status === 'delivered'
  ) {
    return 'This mobile number has already claimed the Share 5 → Get 1 FREE offer. This offer can be used only once per mobile number.';
  }

  return 'This mobile number is already registered for the Share 5 → Get 1 FREE offer. This offer can be used only once per mobile number.';
};

export default function ShareRewardProofPage() {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [closed, setClosed] = useState(false);
  const [alreadyUsed, setAlreadyUsed] =
    useState(false);
  const [declaredLocal, setDeclaredLocal] =
    useState(false);
  const [sharedIds, setSharedIds] = useState<
    string[]
  >([]);
  const [mobile, setMobile] = useState('');
  const [existingStatus, setExistingStatus] =
    useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      const local = readCampaignState();

      const ids = Array.from(
        new Set(
          (local.sharedProductIds || [])
            .map((value) =>
              String(value || '').trim(),
            )
            .filter(Boolean),
        ),
      ).slice(0, 5);

      if (!active) return;

      setSharedIds(ids);

      if (ids.length < 5) {
        setMessage(
          'Complete all 5 different product shares before uploading proof.',
        );
        setLoading(false);
        return;
      }

      if (!firebaseReady || !db) {
        setMessage(
          'SPOTC is not connected right now. Please try again.',
        );
        setLoading(false);
        return;
      }

      const user = await requireGoogleLogin();

      if (!user || !active) {
        setLoading(false);
        return;
      }

      const userSnapshot = await getDoc(
        doc(db, 'Users', user.uid),
      );

      const userData = userSnapshot.exists()
        ? userSnapshot.data()
        : {};

      const normalizedMobile =
        normalizeIndianMobile(
          userData.phone_number ??
            userData.whatsapp_number ??
            userData.mobile_number ??
            userData.mobile ??
            userData.phone,
        );

      if (!normalizedMobile) {
        if (active) {
          setClosed(true);
          setMessage(
            'A valid 10-digit mobile number is required in your SPOTC profile before using this offer.',
          );
          setLoading(false);
        }
        return;
      }

      setMobile(normalizedMobile);

      /*
       * ONE OFFER PER MOBILE NUMBER
       *
       * New claims use the mobile number as part of the Firestore
       * document ID. This prevents the same mobile number from
       * creating another claim from another Google account/device.
       */
      const mobileClaimId =
        `${CAMPAIGN_ID}_mobile_${normalizedMobile}`;

      const mobileClaimRef = doc(
        db,
        'ShareRewardClaims',
        mobileClaimId,
      );

      const mobileClaimSnapshot =
        await getDoc(mobileClaimRef);

      /*
       * Backward compatibility:
       * Earlier development code used one claim document per UID.
       * Check that document too so an already-tested user cannot
       * accidentally claim again after this update.
       */
      const legacyClaimRef = doc(
        db,
        'ShareRewardClaims',
        `${CAMPAIGN_ID}_${user.uid}`,
      );

      const legacyClaimSnapshot =
        await getDoc(legacyClaimRef);

      const existingSnapshot =
        mobileClaimSnapshot.exists()
          ? mobileClaimSnapshot
          : legacyClaimSnapshot.exists()
            ? legacyClaimSnapshot
            : null;

      if (existingSnapshot) {
        const data =
          existingSnapshot.data() as ClaimData;

        const status = claimStatus(data);
        const ownerUid = cleanText(data.user_uid);

        setExistingStatus(status);

        /*
         * Rejected proof may be corrected and uploaded again by
         * the SAME account. Every other existing claim blocks a
         * new reward attempt.
         */
        if (
          ownerUid === user.uid &&
          canRetryProof(status)
        ) {
          if (active) {
            setMessage(
              'Your previous proof was rejected. You can upload corrected WhatsApp proof for the same offer.',
            );
          }
        } else {
          if (active) {
            setAlreadyUsed(true);
            setClosed(true);
            setMessage(
              alreadyClaimedMessage(status),
            );
            setLoading(false);
          }
          return;
        }
      }

      /*
       * First-25-user campaign limit.
       * Count only documents belonging to this campaign.
       */
      const firstClaims = await getDocs(
        query(
          collection(db, 'ShareRewardClaims'),
          where(
            'campaign_id',
            '==',
            CAMPAIGN_ID,
          ),
          limit(MAX_PARTICIPANTS),
        ),
      );

      if (
        !existingSnapshot &&
        firstClaims.size >= MAX_PARTICIPANTS
      ) {
        if (active) {
          setClosed(true);
          setMessage(
            'This limited offer has reached the first 25 users.',
          );
        }
      }

      if (active) {
        setLoading(false);
      }
    })().catch((error) => {
      console.error(
        'Share reward proof preparation failed:',
        error,
      );

      if (active) {
        setMessage(
          'Unable to open the proof page. Please try again.',
        );
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(
    () => () => {
      previews.forEach((item) =>
        URL.revokeObjectURL(item.url),
      );
    },
    [previews],
  );

  const pickFiles = (
    list: FileList | null,
  ) => {
    if (!list) return;

    const selected = Array.from(list)
      .filter((file) =>
        file.type.startsWith('image/'),
      )
      .filter(
        (file) =>
          file.size <= MAX_FILE_BYTES,
      )
      .slice(0, MAX_FILES);

    setFiles(selected);

    setMessage(
      selected.length !== list.length
        ? 'Use up to 5 image screenshots, maximum 8 MB each.'
        : '',
    );
  };

  const submit = async () => {
    if (
      uploading ||
      closed ||
      alreadyUsed
    ) {
      return;
    }

    if (sharedIds.length < 5) {
      setMessage(
        'Please complete 5 / 5 different product shares first.',
      );
      return;
    }

    if (!mobile) {
      setMessage(
        'A valid mobile number is required before using this offer.',
      );
      return;
    }

    if (!declaredLocal) {
      setMessage(
        'Please confirm that you shared only with people in the listed local areas.',
      );
      return;
    }

    if (files.length < 1) {
      setMessage(
        'Upload at least one WhatsApp screenshot showing your shares.',
      );
      return;
    }

    if (!firebaseReady || !db) {
      setMessage(
        'SPOTC is not connected right now. Please try again.',
      );
      return;
    }

    const user = await requireGoogleLogin();

    if (!user) return;

    setUploading(true);
    setMessage(
      'Checking your mobile number…',
    );

    try {
      const claimId =
        `${CAMPAIGN_ID}_mobile_${mobile}`;

      const claimRef = doc(
        db,
        'ShareRewardClaims',
        claimId,
      );

      /*
       * Reserve this mobile number BEFORE uploading screenshots.
       * If another account/device tries the same mobile number,
       * it will find this claim and be blocked.
       */
      await runTransaction(
        db,
        async (transaction) => {
          const snapshot =
            await transaction.get(claimRef);

          if (snapshot.exists()) {
            const data =
              snapshot.data() as ClaimData;

            const status =
              claimStatus(data);

            const ownerUid =
              cleanText(data.user_uid);

            if (
              ownerUid !== user.uid ||
              !canRetryProof(status)
            ) {
              throw new Error(
                alreadyClaimedMessage(status),
              );
            }

            transaction.set(
              claimRef,
              {
                status: 'proof_uploading',
                verification_status:
                  'proof_uploading',
                shared_product_ids:
                  sharedIds,
                shared_product_count:
                  sharedIds.length,
                updated_at:
                  serverTimestamp(),
              },
              { merge: true },
            );

            return;
          }

          transaction.set(claimRef, {
            campaign_id: CAMPAIGN_ID,
            campaign_type:
              'share5_get1free',
            user_uid: user.uid,
            user_email:
              user.email || '',
            user_name:
              user.displayName || '',
            mobile_number: mobile,
            mobile_normalized: mobile,
            claim_key:
              `${CAMPAIGN_ID}:${mobile}`,
            shared_product_ids:
              sharedIds,
            shared_product_count:
              sharedIds.length,
            status: 'proof_uploading',
            verification_status:
              'proof_uploading',
            local_share_declared: true,
            allowed_share_areas: [
              'Karamadai',
              'Teacher Colony',
              'EB Colony',
              'Gandhinagar',
            ],
            created_at:
              serverTimestamp(),
            updated_at:
              serverTimestamp(),
          });
        },
      );

      const functions = getFunctions(
        undefined,
        'asia-south1',
      );

      const getR2UploadUrl =
        httpsCallable<
          {
            fileName: string;
            contentType: string;
            folder: string;
          },
          {
            uploadUrl: string;
            publicUrl: string;
          }
        >(
          functions,
          'getR2UploadUrl',
        );

      const proofUrls: string[] = [];

      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file = files[index];

        const extension = cleanFileName(
          file.name.split('.').pop() ||
            'jpg',
        );

        const fileName =
          `share5_${mobile}_${user.uid}_${Date.now()}_${index + 1}.${extension}`;

        setMessage(
          `Uploading screenshot ${
            index + 1
          } of ${files.length}…`,
        );

        const signed =
          await getR2UploadUrl({
            fileName,
            contentType:
              file.type ||
              'image/jpeg',
            folder: 'share5-proofs',
          });

        const response = await fetch(
          signed.data.uploadUrl,
          {
            method: 'PUT',
            headers: {
              'Content-Type':
                file.type ||
                'image/jpeg',
            },
            body: file,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Screenshot upload failed (${response.status}).`,
          );
        }

        proofUrls.push(
          signed.data.publicUrl,
        );
      }

      await setDoc(
        claimRef,
        {
          campaign_id: CAMPAIGN_ID,
          campaign_type:
            'share5_get1free',
          user_uid: user.uid,
          user_email:
            user.email || '',
          user_name:
            user.displayName || '',
          mobile_number: mobile,
          mobile_normalized: mobile,
          claim_key:
            `${CAMPAIGN_ID}:${mobile}`,
          shared_product_ids:
            sharedIds,
          shared_product_count:
            sharedIds.length,
          proof_urls: proofUrls,
          proof_count:
            proofUrls.length,
          local_share_declared: true,
          allowed_share_areas: [
            'Karamadai',
            'Teacher Colony',
            'EB Colony',
            'Gandhinagar',
          ],
          status: 'proof_submitted',
          verification_status:
            'pending',
          proof_submitted_at:
            serverTimestamp(),
          updated_at:
            serverTimestamp(),
        },
        { merge: true },
      );

      const local =
        readCampaignState();

      writeCampaignState({
        ...local,
        sharedProductIds: sharedIds,
        proofSubmitted: true,
        claimId,
        proofUrls,
      });

      router.push(
        '/share-reward/gift',
      );
    } catch (error) {
      console.error(
        'Share reward proof upload failed:',
        error,
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to upload proof. Please try again.';

      if (
        errorMessage
          .toLowerCase()
          .includes('already')
      ) {
        setAlreadyUsed(true);
        setClosed(true);
      }

      setMessage(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <main className="sr-proof-page sr-proof-state">
        <Loader2 className="sr-spin" />
        <p>
          Opening your Share 5 reward…
        </p>

        <style jsx>
          {styles}
        </style>
      </main>
    );
  }

  return (
    <main className="sr-proof-page">
      <section className="sr-card">
        <div
          className={
            alreadyUsed
              ? 'sr-icon sr-icon-warning'
              : 'sr-icon'
          }
        >
          {alreadyUsed ? (
            <AlertCircle />
          ) : (
            <ShieldCheck />
          )}
        </div>

        <small>
          SHARE 5 → GET 1 FREE
        </small>

        <h1>
          {alreadyUsed
            ? 'Offer Already Registered'
            : 'Upload WhatsApp Proof'}
        </h1>

        {!alreadyUsed && (
          <p className="sr-lead">
            Your 5 different product
            shares are complete. Upload
            screenshot proof to unlock
            your FREE gift selection.
          </p>
        )}

        {mobile && (
          <div className="sr-mobile">
            Mobile number
            <strong>
              +91 {mobile}
            </strong>
          </div>
        )}

        {!alreadyUsed && (
          <div className="sr-progress">
            <CheckCircle2 />
            <strong>
              {sharedIds.length} / 5
              products shared
            </strong>
          </div>
        )}

        {!closed && (
          <>
            <label className="sr-upload">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  pickFiles(
                    event.target.files,
                  )
                }
                disabled={uploading}
              />

              <ImagePlus />

              <strong>
                {files.length
                  ? `${files.length} screenshot${
                      files.length === 1
                        ? ''
                        : 's'
                    } selected`
                  : 'Choose WhatsApp Screenshot(s)'}
              </strong>

              <span>
                1–5 images • JPG / PNG /
                WEBP • Max 8 MB each
              </span>
            </label>

            {previews.length > 0 && (
              <div className="sr-previews">
                {previews.map(
                  (item, index) => (
                    <img
                      key={`${item.file.name}-${index}`}
                      src={item.url}
                      alt={`WhatsApp proof ${
                        index + 1
                      }`}
                    />
                  ),
                )}
              </div>
            )}

            <label className="sr-confirm">
              <input
                type="checkbox"
                checked={declaredLocal}
                onChange={(event) =>
                  setDeclaredLocal(
                    event.target.checked,
                  )
                }
                disabled={uploading}
              />

              <span>
                I shared only with
                friends/family in
                Karamadai, Teacher
                Colony, EB Colony or
                Gandhinagar.
              </span>
            </label>

            <button
              className="sr-submit"
              type="button"
              onClick={submit}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="sr-spin" />
              ) : (
                <UploadCloud />
              )}

              {uploading
                ? 'Uploading…'
                : 'Upload Proof & Choose Gift'}
            </button>
          </>
        )}

        {message && (
          <div
            className={
              closed
                ? 'sr-message sr-closed'
                : 'sr-message'
            }
          >
            {message}
          </div>
        )}

        {alreadyUsed && (
          <button
            type="button"
            className="sr-shopping"
            onClick={() =>
              router.push('/shop')
            }
          >
            <ShoppingBag />
            Continue Shopping
          </button>
        )}

        {!alreadyUsed && (
          <p className="sr-note">
            SPOTC will manually verify
            the WhatsApp proof. You can
            choose your FREE gift
            immediately; the gift request
            is confirmed only after
            approval.
          </p>
        )}

        {existingStatus &&
          canRetryProof(existingStatus) &&
          !alreadyUsed && (
            <p className="sr-retry-note">
              You are correcting the same
              claim. This does not create
              another FREE gift claim.
            </p>
          )}
      </section>

      <style jsx>
        {styles}
      </style>
    </main>
  );
}

const styles = `
  .sr-proof-page{
    min-height:100vh;
    background:#fff8f5;
    padding:26px 14px 90px;
    color:#171717
  }

  .sr-proof-state{
    display:grid;
    place-items:center;
    text-align:center
  }

  .sr-card{
    width:min(620px,100%);
    margin:0 auto;
    background:#fff;
    border:1px solid #f1ded7;
    border-radius:26px;
    padding:24px;
    box-shadow:0 18px 48px rgba(46,23,12,.08)
  }

  .sr-icon{
    width:58px;
    height:58px;
    border-radius:18px;
    display:grid;
    place-items:center;
    background:#ffe7ef;
    color:#d81b60
  }

  .sr-icon-warning{
    background:#fff0e8;
    color:#d95819
  }

  .sr-icon svg{
    width:30px;
    height:30px
  }

  .sr-card>small{
    display:block;
    margin-top:16px;
    color:#d81b60;
    font-weight:900;
    letter-spacing:.1em
  }

  .sr-card h1{
    margin:7px 0 8px;
    font-size:clamp(28px,6vw,42px);
    line-height:1.05
  }

  .sr-lead{
    margin:0;
    color:#655b57;
    line-height:1.6
  }

  .sr-mobile{
    margin:16px 0 0;
    padding:11px 13px;
    border-radius:13px;
    background:#f7f5f2;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    color:#6d625d;
    font-size:13px
  }

  .sr-mobile strong{
    color:#171717;
    white-space:nowrap
  }

  .sr-progress{
    margin:14px 0 18px;
    padding:13px 14px;
    border-radius:14px;
    background:#ecf9f0;
    color:#147a38;
    display:flex;
    align-items:center;
    gap:9px
  }

  .sr-progress svg{
    width:20px
  }

  .sr-upload{
    min-height:138px;
    border:2px dashed #e5b3c3;
    border-radius:18px;
    background:#fff9fb;
    display:grid;
    place-items:center;
    text-align:center;
    padding:20px;
    cursor:pointer
  }

  .sr-upload input{
    display:none
  }

  .sr-upload svg{
    color:#d81b60;
    width:31px;
    height:31px
  }

  .sr-upload strong{
    display:block;
    margin-top:8px
  }

  .sr-upload span{
    display:block;
    margin-top:4px;
    color:#7c706c;
    font-size:12px
  }

  .sr-previews{
    margin-top:12px;
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:8px
  }

  .sr-previews img{
    width:100%;
    aspect-ratio:1/1;
    object-fit:cover;
    border-radius:12px;
    border:1px solid #eee
  }

  .sr-confirm{
    margin-top:14px;
    display:flex;
    gap:10px;
    align-items:flex-start;
    padding:13px;
    border-radius:14px;
    background:#fff5d9;
    color:#604b0c;
    font-size:13px;
    line-height:1.45;
    font-weight:700
  }

  .sr-confirm input{
    margin-top:2px;
    width:18px;
    height:18px;
    accent-color:#d81b60
  }

  .sr-submit,
  .sr-shopping{
    width:100%;
    margin-top:16px;
    min-height:52px;
    border:0;
    border-radius:15px;
    font-weight:900;
    font-size:15px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    cursor:pointer
  }

  .sr-submit{
    background:#d81b60;
    color:#fff
  }

  .sr-shopping{
    background:#111827;
    color:#fff
  }

  .sr-submit:disabled{
    opacity:.6;
    cursor:not-allowed
  }

  .sr-submit svg,
  .sr-shopping svg{
    width:20px
  }

  .sr-message{
    margin-top:14px;
    padding:13px 14px;
    border-radius:13px;
    background:#fff3cd;
    color:#6b5200;
    font-weight:700;
    font-size:13px;
    line-height:1.5
  }

  .sr-message.sr-closed{
    background:#feecec;
    color:#a11b1b
  }

  .sr-note,
  .sr-retry-note{
    margin:16px 0 0;
    font-size:12px;
    line-height:1.55;
    color:#7c706c
  }

  .sr-retry-note{
    color:#9a5d16;
    font-weight:700
  }

  .sr-spin{
    animation:srspin .8s linear infinite
  }

  @keyframes srspin{
    to{transform:rotate(360deg)}
  }

  @media(max-width:520px){
    .sr-card{
      padding:20px 16px;
      border-radius:22px
    }

    .sr-previews{
      grid-template-columns:repeat(2,minmax(0,1fr))
    }
  }
`;
