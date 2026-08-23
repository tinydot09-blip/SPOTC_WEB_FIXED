'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { auth, db } from '@/lib/firebase';

type OfferRow = {
  id: string;
  data: DocumentData;
  source: 'listing' | 'product';
  productId?: string;
};

type ProductRow = {
  id: string;
  data: DocumentData;
};

type UploadResult = {
  uploadUrl: string;
  publicUrl: string;
};

type StatusFilter =
  | 'all'
  | 'active'
  | 'scheduled'
  | 'expired'
  | 'hidden';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis() || 0;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime() || 0;
  }

  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateTimeToDate(value: string): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function productImage(data: DocumentData): string {
  const images = Array.isArray(data.images) ? data.images : [];

  return text(
    images[0] ??
      data.image_url ??
      data.image ??
      data.product_image_url ??
      data.thumbnail_url ??
      data.studio_image_url,
  );
}

function productTitle(data: DocumentData): string {
  return text(data.title ?? data.product_name ?? 'Product');
}

function positiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function productSellingPrice(data: DocumentData): number {
  const offer = positiveNumber(data.offer_price);
  const selling =
    positiveNumber(data.selling_price) ||
    positiveNumber(data.price) ||
    positiveNumber(data.sale_price);

  // Use Offer Price only when it is a real positive offer.
  return offer || selling || positiveNumber(data.mrp);
}

function productOldPrice(data: DocumentData): number {
  const mrp =
    positiveNumber(data.mrp) ||
    positiveNumber(data.old_price) ||
    positiveNumber(data.original_price);

  const current = productSellingPrice(data);

  return mrp > current ? mrp : 0;
}

function productDiscount(data: DocumentData): string {
  const explicit =
    positiveNumber(data.discount_percent) ||
    positiveNumber(data.discount);

  if (explicit > 0) {
    return `${Math.round(explicit)}% OFF`;
  }

  const price = productSellingPrice(data);
  const oldPrice = productOldPrice(data);

  if (oldPrice > price && price > 0) {
    return `${Math.round(((oldPrice - price) / oldPrice) * 100)}% OFF`;
  }

  return '';
}

function safeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase().trim();

  if (fromName && /^[a-z0-9]{2,6}$/.test(fromName)) {
    return fromName;
  }

  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'video/quicktime') return 'mov';

  return 'mp4';
}

function offerStatus(data: DocumentData): {
  label: string;
  key: Exclude<StatusFilter, 'all'>;
} {
  if (data.isActive === false) {
    return { label: 'Hidden', key: 'hidden' };
  }

  const now = Date.now();

  const start =
    timestampMillis(data.offer_start_at) ||
    timestampMillis(data.start_at);

  const end =
    timestampMillis(data.offer_end_at) ||
    timestampMillis(data.end_at);

  if (start > now) {
    return { label: 'Scheduled', key: 'scheduled' };
  }

  if (end > 0 && end < now) {
    return { label: 'Expired', key: 'expired' };
  }

  return { label: 'Active', key: 'active' };
}

function videoUrl(data: DocumentData): string {
  const direct = text(
    data.product_video_url ??
      data.playback_720_url ??
      data.playback_480_url ??
      data.playback_url ??
      data.business_video_url ??
      data.video_url ??
      data.hls_master_url,
  );

  if (direct) return direct;

  if (Array.isArray(data.media)) {
    const media = data.media as Array<Record<string, unknown>>;

    const videoItem = media.find((item) => {
      const type = text(item.type).toLowerCase();
      const role = text(item.role).toLowerCase();
      const slot = text(item.slot).toLowerCase();

      return (
        type === 'video' ||
        role === 'video' ||
        slot === 'product_video'
      );
    });

    if (videoItem) {
      return text(
        videoItem.url ??
          videoItem.publicUrl ??
          videoItem.public_url ??
          videoItem.src,
      );
    }
  }

  return '';
}

function normalizeVideoUrl(value: string): string {
  const raw = text(value);
  if (!raw) return '';

  try {
    return decodeURIComponent(raw.split('?')[0])
      .trim()
      .toLowerCase();
  } catch {
    return raw.split('?')[0].trim().toLowerCase();
  }
}

function productOfferRow(row: ProductRow): OfferRow | null {
  const url = videoUrl(row.data);
  if (!url) return null;

  const data = row.data;
  const title = productTitle(data);

  return {
    id: `product-video-${row.id}`,
    source: 'product',
    productId: row.id,
    data: {
      ...data,

      // Shape this product video exactly like an offer row for the admin UI.
      title,
      offer_title:
        text(data.offer_title) ||
        title,
      offer_text:
        text(data.offer_text) ||
        title,

      business_video_url: url,
      playback_url: url,

      linked_product_ids: [row.id],
      product_ids: [row.id],
      product_id: row.id,
      linked_product_id: row.id,

      isActive:
        data.isActive !== false,
      approval_status: 'approved',
      isApproved: true,
      processing_status: 'ready',

      // Keep any existing limited-time fields already stored on the product.
      offer_start_at:
        data.offer_start_at ??
        data.start_at ??
        data.created_at ??
        null,
      offer_end_at:
        data.offer_end_at ??
        data.end_at ??
        data.valid_until ??
        null,
    },
  };
}

export default function AdminOffersPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');

  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    selectedProductIds: [] as string[],
    isActive: true,
  });

  async function loadData(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    if (showLoader) setLoading(true);

    try {
      let offerSnap;

      try {
        offerSnap = await getDocs(
          query(
            collection(db, 'BusinessListings'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        offerSnap = await getDocs(collection(db, 'BusinessListings'));
      }

      let productSnap;

      try {
        productSnap = await getDocs(
          query(
            collection(db, 'BusinessProducts'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        productSnap = await getDocs(collection(db, 'BusinessProducts'));
      }

      const productRows: ProductRow[] =
        productSnap.docs
          .map((item) => ({
            id: item.id,
            data: item.data(),
          }))
          .filter(
            ({ data }) =>
              data.isDeleted !== true,
          );

      setProducts(
        productRows.filter(
          ({ data }) =>
            data.isActive !== false,
        ),
      );

      const listingRows: OfferRow[] =
        offerSnap.docs
          .map((item) => ({
            id: item.id,
            data: item.data(),
            source: 'listing' as const,
          }))
          .filter(({ data }) => {
            // Admin must show every BusinessListings video that can represent
            // an offer, including old/legacy limited-time offers.
            return Boolean(videoUrl(data));
          });

      const listingVideos = new Set(
        listingRows
          .map((row) =>
            normalizeVideoUrl(
              videoUrl(row.data),
            ),
          )
          .filter(Boolean),
      );

      // The live customer Offers feed also converts BusinessProducts that have
      // product_video_url/media video into offer cards. Mirror that here.
      const productVideoRows =
        productRows
          .map(productOfferRow)
          .filter(
            (
              row,
            ): row is OfferRow =>
              row !== null,
          )
          .filter((row) => {
            const normalized =
              normalizeVideoUrl(
                videoUrl(row.data),
              );

            return (
              Boolean(normalized) &&
              !listingVideos.has(
                normalized,
              )
            );
          });

      setOffers([
        ...listingRows,
        ...productVideoRows,
      ]);

      setMessage('');
    } catch (error) {
      console.error('Offers load failed:', error);

      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load offers.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const productMap = useMemo(() => {
    const map: Record<string, ProductRow> = {};

    products.forEach((row) => {
      map[row.id] = row;
    });

    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return offers.filter((row) => {
      const status = offerStatus(row.data);

      if (
        statusFilter !== 'all' &&
        status.key !== statusFilter
      ) {
        return false;
      }

      if (!needle) return true;

      const linkedIds = Array.isArray(row.data.linked_product_ids)
        ? row.data.linked_product_ids
        : Array.isArray(row.data.product_ids)
          ? row.data.product_ids
          : [];

      const linkedProductNames = linkedIds.map((id: unknown) => {
        const rowProduct = productMap[text(id)];
        return rowProduct ? productTitle(rowProduct.data) : '';
      });

      return [
        row.id,
        row.data.title,
        row.data.business_name,
        row.data.description,
        status.label,
        ...linkedProductNames,
      ].some((value) =>
        text(value).toLowerCase().includes(needle),
      );
    });
  }, [offers, search, statusFilter, productMap]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const summary = useMemo(() => {
    let active = 0;
    let scheduled = 0;
    let expired = 0;
    let hidden = 0;

    offers.forEach(({ data }) => {
      const status = offerStatus(data);

      if (status.key === 'active') active += 1;
      if (status.key === 'scheduled') scheduled += 1;
      if (status.key === 'expired') expired += 1;
      if (status.key === 'hidden') hidden += 1;
    });

    return {
      total: offers.length,
      active,
      scheduled,
      expired,
      hidden,
    };
  }, [offers]);

  const pageStart =
    filtered.length === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const pageEnd = Math.min(
    page * pageSize,
    filtered.length,
  );

  function resetCreate() {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }

    setVideoFile(null);
    setVideoPreview('');

    setForm({
      title: '',
      description: '',
      startAt: '',
      endAt: '',
      selectedProductIds: [],
      isActive: true,
    });
  }

  function closeCreate() {
    if (saving) return;

    resetCreate();
    setShowCreate(false);
  }

  function chooseVideo() {
    fileInputRef.current?.click();
  }

  function handleVideo(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;

    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setMessage('Please select a video file.');
      return;
    }

    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setMessage('');
  }

  function toggleProduct(productId: string) {
    setForm((prev) => {
      const exists = prev.selectedProductIds.includes(productId);

      return {
        ...prev,
        selectedProductIds: exists
          ? prev.selectedProductIds.filter((id) => id !== productId)
          : [...prev.selectedProductIds, productId],
      };
    });
  }

  async function uploadVideoToR2(file: File): Promise<string> {
    const user = auth?.currentUser;

    if (!user) {
      throw new Error('Admin login is required.');
    }

    const functions = getFunctions(getApp(), 'asia-south1');

    const getUploadUrl = httpsCallable<
      {
        fileName: string;
        contentType: string;
      },
      UploadResult
    >(functions, 'getR2UploadUrl');

    const contentType = file.type || 'video/mp4';

    const fileName =
      `offers/web_admin/${user.uid}/` +
      `${Date.now()}_${safeFilePart(form.title) || 'offer'}.${extensionFor(
        file,
      )}`;

    const result = await getUploadUrl({
      fileName,
      contentType,
    });

    const uploadUrl = text(result.data?.uploadUrl);
    const publicUrl = text(result.data?.publicUrl);

    if (!uploadUrl || !publicUrl) {
      throw new Error('R2 upload URL was not returned.');
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '');

      throw new Error(
        `Video upload failed (${uploadResponse.status})${
          detail ? `: ${detail}` : ''
        }`,
      );
    }

    return publicUrl;
  }

  async function saveOffer() {
    if (!db) {
      setMessage('Firebase is not available.');
      return;
    }

    // Narrow Firebase Firestore once for the entire async function.
    // This prevents TypeScript from treating db as Firestore | null
    // inside Promise.map callbacks.
    const firestore = db;

    const user = auth?.currentUser;

    if (!user) {
      setMessage('Please sign in with the SPOTC admin account.');
      return;
    }

    if (!form.title.trim()) {
      setMessage('Offer title is required.');
      return;
    }

    if (!videoFile) {
      setMessage('Offer video is required.');
      return;
    }

    if (form.selectedProductIds.length === 0) {
      setMessage('Select at least one product for this offer.');
      return;
    }

    const startDate = localDateTimeToDate(form.startAt);
    const endDate = localDateTimeToDate(form.endAt);

    if (form.startAt && !startDate) {
      setMessage('Offer start date is invalid.');
      return;
    }

    if (form.endAt && !endDate) {
      setMessage('Offer end date is invalid.');
      return;
    }

    if (
      startDate &&
      endDate &&
      endDate.getTime() <= startDate.getTime()
    ) {
      setMessage('Offer end time must be after start time.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const publicVideoUrl = await uploadVideoToR2(videoFile);

      const linkedProducts = form.selectedProductIds
        .map((id) => productMap[id])
        .filter(Boolean)
        .map((row) => ({
          id: row.id,
          product_id: row.id,
          title: productTitle(row.data),
          product_name: productTitle(row.data),
          image: productImage(row.data),
          price: productSellingPrice(row.data),
          product_price: productSellingPrice(row.data),
          selling_price: productSellingPrice(row.data),
          old_price: productOldPrice(row.data),
          mrp: positiveNumber(row.data.mrp),
          discount: productDiscount(row.data),
          sku: text(row.data.sku),
        }));

      const primaryProduct = linkedProducts[0];

      const effectiveStart = startDate ?? new Date();
      const effectiveEnd =
        endDate ??
        new Date(
          effectiveStart.getTime() +
            30 * 24 * 60 * 60 * 1000,
        );

      const offerRef = await addDoc(
        collection(firestore, 'BusinessListings'),
        {
          // Exact live OfferFeed / legacy BusinessListings offer schema.
          record_type: 'business_offer',
          listing_type: 'offer',

          business_name: 'SPOTC',
          shop_name: 'SPOTC',
          business_slug: 'spotc',
          business_ref: null,
          parent_business_ref: null,
          parent_business_id: '',
          owner_uid: user.uid,

          seller_type: 'spotc',
          source: 'web_admin',

          title: form.title.trim(),
          offer_title: form.title.trim(),
          offer_text: form.title.trim(),
          caption: form.description.trim() || form.title.trim(),
          description: form.description.trim(),
          offer_description: form.description.trim(),
          offer_type: 'SPOTC Offer',

          linked_product_ids: form.selectedProductIds,
          product_ids: form.selectedProductIds,
          offer_products: linkedProducts,

          primary_product_id: primaryProduct?.id ?? '',
          primary_product_title: primaryProduct?.title ?? '',
          primary_product_image: primaryProduct?.image ?? '',

          // Direct main-product fields read by the current live OfferFeed.
          product_id: primaryProduct?.id ?? '',
          linked_product_id: primaryProduct?.id ?? '',
          product_title: primaryProduct?.title ?? '',
          product_name: primaryProduct?.title ?? '',
          product_price: primaryProduct?.price ?? 0,
          selling_price: primaryProduct?.price ?? 0,
          offer_price: primaryProduct?.price ?? 0,
          old_price: primaryProduct?.old_price ?? 0,
          mrp: primaryProduct?.mrp ?? primaryProduct?.old_price ?? 0,
          discount: primaryProduct?.discount ?? '',

          // Legacy embedded slot supported by the current OfferFeed.
          image1: primaryProduct?.image ?? '',
          image1_title: primaryProduct?.title ?? '',
          product1_title: primaryProduct?.title ?? '',
          image1_price: primaryProduct?.price ?? 0,
          product1_price: primaryProduct?.price ?? 0,
          image1_old_price: primaryProduct?.old_price ?? 0,
          product1_old_price: primaryProduct?.old_price ?? 0,
          image1_discount: primaryProduct?.discount ?? '',
          product1_discount: primaryProduct?.discount ?? '',
          image1_product_id: primaryProduct?.id ?? '',
          product1_id: primaryProduct?.id ?? '',
          image1_is_in_stock: true,

          business_video_url: publicVideoUrl,
          video_url: publicVideoUrl,
          playback_url: publicVideoUrl,
          playback_720_url: publicVideoUrl,
          playback_480_url: publicVideoUrl,

          processing_status: 'ready',

          isActive: form.isActive,
          offer_is_active: form.isActive,
          isApproved: true,
          isRejected: false,
          isHidden: false,
          isDeleted: false,
          isVerified: true,

          status: 'approved',
          approval_status: 'approved',
          approved_at: serverTimestamp(),
          approved_by: user.uid,

          offer_start_at: effectiveStart,
          offer_end_at: effectiveEnd,

          offer_start_text: effectiveStart.toLocaleDateString('en-IN'),
          offer_end_text: effectiveEnd.toLocaleDateString('en-IN'),

          views: 0,
          views_count: 0,
          likes_count: 0,
          total_calls: 0,
          total_whatsapp_clicks: 0,

          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
      );

      // IMPORTANT:
      // Current web OfferFeed resolves offer products using:
      // BusinessProducts.linked_video_ref == BusinessListings/{offerId}
      // Keep linked_offer_id too for future/admin compatibility.
      await Promise.all(
        form.selectedProductIds.map((productId) =>
          updateDoc(
            doc(
              firestore,
              'BusinessProducts',
              productId,
            ),
            {
              linked_video_ref: offerRef,
              linked_offer_id: offerRef.id,
              linked_offer_ref: offerRef,
              updated_at: serverTimestamp(),
            },
          ),
        ),
      );

      resetCreate();
      setShowCreate(false);

      await loadData(false);

      setMessage('Offer created successfully.');
    } catch (error) {
      console.error('Offer save failed:', error);

      setMessage(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : 'Offer save failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(row: OfferRow) {
    if (!db || busyId) return;

    if (row.source === 'product') {
      setMessage(
        'This offer comes directly from a product video. Edit the product to change or remove its video.',
      );
      return;
    }

    const nextActive = row.data.isActive === false;

    setBusyId(row.id);

    try {
      await updateDoc(doc(db, 'BusinessListings', row.id), {
        isActive: nextActive,
        offer_is_active: nextActive,
        updated_at: serverTimestamp(),
      });

      setOffers((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  isActive: nextActive,
                },
              }
            : item,
        ),
      );

      setMessage(
        nextActive
          ? 'Offer activated.'
          : 'Offer hidden from feed.',
      );
    } catch (error) {
      console.error('Offer status update failed:', error);

      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Offer status update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function deleteOffer(row: OfferRow) {
    if (!db || busyId) return;

    if (row.source === 'product') {
      setMessage(
        'This offer is generated from the product video. Open the product editor to replace/remove that video.',
      );
      return;
    }

    if (
      !window.confirm(
        `Permanently delete "${text(
          row.data.title ?? row.data.offer_title ?? 'Offer',
        )}"?\n\nThis removes the Firestore offer record. The uploaded R2 video is not automatically deleted.`,
      )
    ) {
      return;
    }

    setBusyId(row.id);

    try {
      await deleteDoc(doc(db, 'BusinessListings', row.id));

      setOffers((prev) =>
        prev.filter((item) => item.id !== row.id),
      );

      setMessage('Offer deleted.');
    } catch (error) {
      console.error('Offer delete failed:', error);

      setMessage(
        error instanceof Error
          ? `Delete failed: ${error.message}`
          : 'Offer delete failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Offers</h1>

          <p style={pageSubtitle}>
            Upload SPOTC offer videos and link products shown in the
            customer offer feed.
          </p>
        </div>

        <div style={headerActions}>
          <button
            type="button"
            onClick={() => void loadData(false)}
            style={secondaryButton}
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={createButton}
          >
            + Add Offer
          </button>
        </div>
      </div>

      <div style={summaryGrid}>
        <SummaryCard
          label="Total Offers"
          value={summary.total}
          active={statusFilter === 'all'}
          onClick={() =>
            setStatusFilter('all')
          }
        />

        <SummaryCard
          label="Active"
          value={summary.active}
          active={statusFilter === 'active'}
          onClick={() =>
            setStatusFilter('active')
          }
        />

        <SummaryCard
          label="Scheduled"
          value={summary.scheduled}
          active={statusFilter === 'scheduled'}
          onClick={() =>
            setStatusFilter('scheduled')
          }
        />

        <SummaryCard
          label="Expired"
          value={summary.expired}
          active={statusFilter === 'expired'}
          onClick={() =>
            setStatusFilter('expired')
          }
        />

        <SummaryCard
          label="Hidden"
          value={summary.hidden}
          active={statusFilter === 'hidden'}
          onClick={() =>
            setStatusFilter('hidden')
          }
        />
      </div>

      <div style={controlsCard}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search offer or linked product…"
          style={searchInput}
        />

        <div style={filterRow}>
          <label style={filterWrap}>
            <span style={filterLabel}>Status</span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              style={filterSelect}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>

          <div style={matchCount}>
            {filtered.length} matching offer
            {filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {message && (
        <div style={messageBox}>
          <span>{message}</span>

          <button
            type="button"
            onClick={() => setMessage('')}
            style={messageClose}
          >
            ×
          </button>
        </div>
      )}

      <div style={tableCard}>
        {loading ? (
          <div style={emptyBox}>Loading offers…</div>
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>No matching offers.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRow}>
                {[
                  'Offer',
                  'Products',
                  'Start',
                  'End',
                  'Status',
                  '',
                ].map((heading) => (
                  <th key={heading} style={tableHeadCell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginated.map((row) => {
                const status = offerStatus(row.data);

                const linkedIds = Array.isArray(
                  row.data.linked_product_ids,
                )
                  ? row.data.linked_product_ids.map(text)
                  : Array.isArray(row.data.product_ids)
                    ? row.data.product_ids.map(text)
                    : [];

                const firstProduct = linkedIds
                  .map((id) => productMap[id])
                  .find(Boolean);

                const busy = busyId === row.id;

                return (
                  <tr key={row.id} style={tableRow}>
                    <td style={offerCell}>
                      <div style={offerMediaRow}>
                        {videoUrl(row.data) ? (
                          <video
                            src={videoUrl(row.data)}
                            muted
                            playsInline
                            preload="metadata"
                            style={videoThumb}
                          />
                        ) : (
                          <div style={videoPlaceholder}>Video</div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <div style={offerTitle}>
                            {text(
                              row.data.title ??
                                row.data.offer_title ??
                                'Offer',
                            )}
                          </div>

                          <div style={smallText}>
                            {row.source === 'product'
                              ? `Product video • ${row.productId}`
                              : row.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={normalCell}>
                      <div style={linkedProductsCell}>
                        {firstProduct && (
                          <img
                            src={productImage(firstProduct.data)}
                            alt=""
                            style={productThumb}
                          />
                        )}

                        <div>
                          <div>
                            {linkedIds.length > 0
                              ? `${linkedIds.length} product${
                                  linkedIds.length === 1 ? '' : 's'
                                }`
                              : 'No products'}
                          </div>

                          {firstProduct && (
                            <div style={smallText}>
                              {productTitle(firstProduct.data)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={normalCell}>
                      {timestampMillis(row.data.offer_start_at)
                        ? new Date(
                            timestampMillis(row.data.offer_start_at),
                          ).toLocaleString('en-IN')
                        : 'Now'}
                    </td>

                    <td style={normalCell}>
                      {timestampMillis(row.data.offer_end_at)
                        ? new Date(
                            timestampMillis(row.data.offer_end_at),
                          ).toLocaleString('en-IN')
                        : 'No end'}
                    </td>

                    <td style={normalCell}>
                      <StatusBadge status={status.key} label={status.label} />
                    </td>

                    <td style={actionsCell}>
                      {row.source === 'product' ? (
                        <a
                          href={`/admin/products?edit=${encodeURIComponent(
                            row.productId ?? '',
                          )}`}
                          title="Edit product video"
                          aria-label="Edit product video"
                          style={productEditAction}
                        >
                          ✎
                        </a>
                      ) : (
                        <div style={actionRow}>
                          <button
                            type="button"
                            title={
                              row.data.isActive === false
                                ? 'Activate offer'
                                : 'Hide offer'
                            }
                            aria-label={
                              row.data.isActive === false
                                ? 'Activate offer'
                                : 'Hide offer'
                            }
                            disabled={busy}
                            onClick={() => void toggleOffer(row)}
                            style={{
                              ...iconActionButton,
                              opacity: busy ? 0.45 : 1,
                            }}
                          >
                            {row.data.isActive === false ? '◉' : '⊘'}
                          </button>

                          <button
                            type="button"
                            title="Delete offer"
                            aria-label="Delete offer"
                            disabled={busy}
                            onClick={() => void deleteOffer(row)}
                            style={{
                              ...iconDeleteButton,
                              opacity: busy ? 0.45 : 1,
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={paginationBar}>
          <div style={paginationInfo}>
            Showing {pageStart}–{pageEnd} of {filtered.length}
          </div>

          <div style={paginationRight}>
            <label style={rowsLabel}>
              Rows

              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                style={pageSizeSelect}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((prev) => Math.max(1, prev - 1))
              }
              style={{
                ...pageButton,
                opacity: page <= 1 ? 0.4 : 1,
              }}
            >
              ‹
            </button>

            <div style={pageNumber}>
              Page {page} of {totalPages}
            </div>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((prev) => Math.min(totalPages, prev + 1))
              }
              style={{
                ...pageButton,
                opacity: page >= totalPages ? 0.4 : 1,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          style={modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreate();
            }
          }}
        >
          <div style={modalCard}>
            <div style={modalHeader}>
              <div>
                <h2 style={modalTitle}>Add Offer</h2>
                <div style={smallText}>
                  SPOTC-owned offer. No business profile is required.
                </div>
              </div>

              <button
                type="button"
                onClick={closeCreate}
                disabled={saving}
                style={modalClose}
              >
                ×
              </button>
            </div>

            <div style={modalBody}>
              <section style={sectionCard}>
                <h3 style={sectionTitle}>Offer Video</h3>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideo}
                  style={{ display: 'none' }}
                />

                {videoPreview ? (
                  <div style={videoPreviewWrap}>
                    <video
                      src={videoPreview}
                      controls
                      playsInline
                      style={videoPreviewStyle}
                    />

                    <button
                      type="button"
                      onClick={chooseVideo}
                      style={secondaryButton}
                    >
                      Change Video
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={chooseVideo}
                    style={videoPicker}
                  >
                    <span style={{ fontSize: 30 }}>＋</span>
                    <span>Select Offer Video From Device</span>
                  </button>
                )}
              </section>

              <section style={sectionCard}>
                <h3 style={sectionTitle}>Offer Details</h3>

                <div style={formGrid}>
                  <Field
                    label="Offer Title"
                    value={form.title}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        title: value,
                      }))
                    }
                  />

                  <label>
                    <span style={fieldLabel}>Start</span>
                    <input
                      type="datetime-local"
                      value={form.startAt}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          startAt: event.target.value,
                        }))
                      }
                      style={fieldInput}
                    />
                  </label>

                  <label>
                    <span style={fieldLabel}>End</span>
                    <input
                      type="datetime-local"
                      value={form.endAt}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          endAt: event.target.value,
                        }))
                      }
                      style={fieldInput}
                    />
                  </label>
                </div>

                <label style={{ display: 'block', marginTop: 12 }}>
                  <span style={fieldLabel}>Description</span>

                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    style={{
                      ...fieldInput,
                      resize: 'vertical',
                    }}
                  />
                </label>

                <label style={checkRow}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        isActive: event.target.checked,
                      }))
                    }
                  />

                  Active and visible in Offers feed
                </label>
              </section>

              <section style={sectionCard}>
                <div style={productSectionHead}>
                  <div>
                    <h3 style={sectionTitle}>Offer Products</h3>
                    <div style={smallText}>
                      Select one or more products to show beside this
                      offer video.
                    </div>
                  </div>

                  <div style={selectedCount}>
                    {form.selectedProductIds.length} selected
                  </div>
                </div>

                <div style={productPickerGrid}>
                  {products.map((row) => {
                    const selected =
                      form.selectedProductIds.includes(row.id);

                    return (
                      <button
                        type="button"
                        key={row.id}
                        onClick={() => toggleProduct(row.id)}
                        style={{
                          ...productPickerCard,
                          ...(selected
                            ? productPickerSelected
                            : {}),
                        }}
                      >
                        {productImage(row.data) ? (
                          <img
                            src={productImage(row.data)}
                            alt=""
                            style={pickerImage}
                          />
                        ) : (
                          <div style={pickerImagePlaceholder} />
                        )}

                        <div style={pickerInfo}>
                          <div style={pickerTitle}>
                            {productTitle(row.data)}
                          </div>
                          <div style={smallText}>
                            ₹{productSellingPrice(row.data)}
                            {row.data.sku
                              ? ` • ${text(row.data.sku)}`
                              : ''}
                          </div>
                        </div>

                        <div
                          style={{
                            ...selectMark,
                            ...(selected ? selectedMark : {}),
                          }}
                        >
                          {selected ? '✓' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div style={modalFooter}>
              <button
                type="button"
                onClick={closeCreate}
                disabled={saving}
                style={secondaryButton}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void saveOffer()}
                disabled={saving}
                style={{
                  ...saveButton,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? 'Uploading & Saving…' : 'Upload & Create Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCard,
        ...(active
          ? summaryCardActive
          : {}),
      }}
    >
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </button>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: Exclude<StatusFilter, 'all'>;
  label: string;
}) {
  const styles: Record<
    Exclude<StatusFilter, 'all'>,
    React.CSSProperties
  > = {
    active: {
      background: '#ebf8ee',
      color: '#137333',
    },
    scheduled: {
      background: '#eaf2ff',
      color: '#3157a4',
    },
    expired: {
      background: '#f2f2f2',
      color: '#666',
    },
    hidden: {
      background: '#fff0f0',
      color: '#b42318',
    },
  };

  return (
    <span
      style={{
        ...statusBadge,
        ...styles[status],
      }}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span style={fieldLabel}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={fieldInput}
      />
    </label>
  );
}

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const pageTitle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 30,
  fontWeight: 400,
};

const pageSubtitle: React.CSSProperties = {
  margin: 0,
  color: '#666',
};

const headerActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const secondaryButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fff',
  color: '#222',
  borderRadius: 9,
  padding: '9px 12px',
  cursor: 'pointer',
  fontWeight: 400,
};

const createButton: React.CSSProperties = {
  border: 0,
  background: '#111',
  color: '#fff',
  borderRadius: 9,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 400,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
  gap: 12,
  margin: '22px 0',
};

const summaryCard: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
  padding: 15,
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
};

const summaryCardActive: React.CSSProperties = {
  borderColor: '#d68a2c',
  boxShadow:
    '0 0 0 2px rgba(214,138,44,.12)',
};

const summaryLabel: React.CSSProperties = {
  color: '#777',
  fontSize: 12,
};

const summaryValue: React.CSSProperties = {
  fontSize: 25,
  marginTop: 4,
  fontWeight: 400,
};

const controlsCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
  padding: 13,
  marginBottom: 14,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ddd',
  borderRadius: 9,
  padding: '11px 12px',
  fontSize: 14,
  outline: 'none',
  marginBottom: 10,
};

const filterRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 10,
  flexWrap: 'wrap',
};

const filterWrap: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 170,
};

const filterLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#777',
};

const filterSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '8px 9px',
  background: '#fff',
};

const matchCount: React.CSSProperties = {
  marginLeft: 'auto',
  color: '#777',
  fontSize: 11,
};

const messageBox: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  padding: '11px 13px',
  marginBottom: 14,
  background: '#fff8e8',
  border: '1px solid #f0d598',
  borderRadius: 10,
  fontSize: 12,
};

const messageClose: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 20,
  cursor: 'pointer',
};

const tableCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 15,
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 950,
};

const tableHeadRow: React.CSSProperties = {
  background: '#fafafa',
  textAlign: 'left',
};

const tableHeadCell: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #eee',
  fontSize: 11,
  fontWeight: 400,
  whiteSpace: 'nowrap',
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0',
};

const offerCell: React.CSSProperties = {
  padding: 10,
  minWidth: 310,
};

const offerMediaRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const videoThumb: React.CSSProperties = {
  width: 58,
  height: 72,
  objectFit: 'cover',
  background: '#111',
  borderRadius: 9,
};

const videoPlaceholder: React.CSSProperties = {
  width: 58,
  height: 72,
  borderRadius: 9,
  background: '#eee',
  display: 'grid',
  placeItems: 'center',
  color: '#888',
  fontSize: 9,
};

const offerTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 400,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 300,
};

const smallText: React.CSSProperties = {
  marginTop: 3,
  fontSize: 10,
  color: '#888',
};

const normalCell: React.CSSProperties = {
  padding: 10,
  fontSize: 11,
  verticalAlign: 'middle',
};

const linkedProductsCell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const productThumb: React.CSSProperties = {
  width: 42,
  height: 42,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#f7f7f7',
  border: '1px solid #eee',
  borderRadius: 8,
};

const statusBadge: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 8,
  fontSize: 10,
};

const actionsCell: React.CSSProperties = {
  padding: 8,
  width: 78,
};

const actionRow: React.CSSProperties = {
  display: 'flex',
  gap: 5,
  alignItems: 'center',
};

const productEditAction: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid #ddd',
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  textDecoration: 'none',
  fontSize: 14,
};

const iconActionButton: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid #ddd',
  background: '#fff',
  color: '#222',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const iconDeleteButton: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid #efb7b3',
  background: '#fff7f6',
  color: '#b42318',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const emptyBox: React.CSSProperties = {
  padding: 30,
  textAlign: 'center',
  color: '#777',
};

const paginationBar: React.CSSProperties = {
  marginTop: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const paginationInfo: React.CSSProperties = {
  fontSize: 11,
  color: '#777',
};

const paginationRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

const rowsLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: '#777',
  fontSize: 10,
};

const pageSizeSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 7,
  padding: '6px 7px',
  background: '#fff',
};

const pageButton: React.CSSProperties = {
  width: 31,
  height: 31,
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  fontSize: 17,
  cursor: 'pointer',
};

const pageNumber: React.CSSProperties = {
  minWidth: 90,
  textAlign: 'center',
  fontSize: 10,
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(0,0,0,.45)',
};

const modalCard: React.CSSProperties = {
  width: 'min(1000px,100%)',
  maxHeight: '92vh',
  background: '#f6f7f9',
  borderRadius: 18,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 25px 80px rgba(0,0,0,.25)',
};

const modalHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  padding: 17,
  background: '#fff',
  borderBottom: '1px solid #e7e7e7',
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 400,
};

const modalClose: React.CSSProperties = {
  width: 34,
  height: 34,
  border: 0,
  borderRadius: 9,
  background: '#f2f2f2',
  fontSize: 20,
  cursor: 'pointer',
};

const modalBody: React.CSSProperties = {
  overflowY: 'auto',
  padding: 15,
};

const modalFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: 13,
  background: '#fff',
  borderTop: '1px solid #e7e7e7',
};

const saveButton: React.CSSProperties = {
  border: 0,
  background: '#111',
  color: '#fff',
  borderRadius: 9,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 400,
};

const sectionCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 13,
  padding: 14,
  marginBottom: 13,
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 400,
};

const videoPreviewWrap: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  justifyItems: 'start',
};

const videoPreviewStyle: React.CSSProperties = {
  width: 220,
  maxHeight: 390,
  borderRadius: 12,
  background: '#111',
};

const videoPicker: React.CSSProperties = {
  width: '100%',
  minHeight: 140,
  border: '2px dashed #d5d5d5',
  borderRadius: 12,
  background: '#fafafa',
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 5,
  cursor: 'pointer',
  color: '#333',
};

const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
  gap: 11,
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontSize: 10,
  color: '#666',
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '9px 10px',
  fontSize: 13,
  outline: 'none',
};

const checkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginTop: 12,
  fontSize: 12,
};

const productSectionHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'flex-start',
  marginBottom: 10,
};

const selectedCount: React.CSSProperties = {
  fontSize: 11,
  color: '#666',
};

const productPickerGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
  gap: 9,
  maxHeight: 390,
  overflowY: 'auto',
};

const productPickerCard: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  border: '1px solid #ddd',
  background: '#fff',
  borderRadius: 10,
  padding: 8,
  cursor: 'pointer',
  color: '#222',
  textAlign: 'left',
};

const productPickerSelected: React.CSSProperties = {
  borderColor: '#111',
  boxShadow: '0 0 0 1px #111 inset',
};

const pickerImage: React.CSSProperties = {
  width: 48,
  height: 48,
  minWidth: 48,
  objectFit: 'contain',
  objectPosition: 'center',
  background: '#f7f7f7',
  borderRadius: 8,
};

const pickerImagePlaceholder: React.CSSProperties = {
  width: 48,
  height: 48,
  minWidth: 48,
  borderRadius: 8,
  background: '#eee',
};

const pickerInfo: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
};

const pickerTitle: React.CSSProperties = {
  fontSize: 12,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const selectMark: React.CSSProperties = {
  width: 20,
  height: 20,
  minWidth: 20,
  borderRadius: '50%',
  border: '1px solid #ccc',
  display: 'grid',
  placeItems: 'center',
  fontSize: 11,
};

const selectedMark: React.CSSProperties = {
  background: '#111',
  borderColor: '#111',
  color: '#fff',
};