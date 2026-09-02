'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '@/lib/firebase';

type ProductRow = { id: string; data: DocumentData };

type GeneratedPoster = {
  dataUrl: string;
  fileName: string;
};

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;
const SPOTC_WEBSITE = 'www.spotc.in';
const SPOTC_PHONE = '+91 80720 98066';
const SPOTC_EMAIL = 'support@spotc.in';
const SPOTC_AREAS = 'Karamadai • Teacher Colony • EB Colony • Gandhinagar';
const SPOTC_FULL_ADDRESS =
  'SPOTC TECHNOLOGIES, #41-1, Kembe Gowder Colony 1st Street, Near EB Colony Bus Stop, Karamadai, Coimbatore - 641104, Tamil Nadu, India';

type ProductCategoryConfig = {
  id: string;
  name: string;
  subcategories: string[];
  isActive: boolean;
  sortOrder: number;
};
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'attention';
type StatusFilter = 'all' | 'active' | 'hidden';
type GiftFilter = 'all' | 'gift' | 'not_gift';
type LocationFilter = 'all' | 'set' | 'missing';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'name_az'
  | 'name_za'
  | 'price_low'
  | 'price_high'
  | 'stock_low'
  | 'stock_high'
  | 'sold_high';

type EditForm = {
  title: string;
  brand: string;
  mainCategory: string;
  subCategory: string;
  childCategory: string;
  color: string;
  secondaryColor: string;
  size: string;
  availableSizes: string;
  dressType: string;
  setType: string;

  // 1-piece measurements
  dressLength: string;
  chestSize: string;
  waistSize: string;
  shoulderSize: string;
  sleeveLength: string;

  // 2/3-piece top measurements
  topType: string;
  topChest: string;
  topLength: string;
  topShoulder: string;
  topSleeve: string;

  // 2/3-piece bottom measurements
  bottomType: string;
  bottomWaist: string;
  bottomMaxWaist: string;
  bottomHip: string;
  bottomLength: string;
  bottomInseam: string;

  // 3rd piece measurements
  thirdPieceType: string;
  thirdPieceChest: string;
  thirdPieceWaist: string;
  thirdPieceLength: string;

  material: string;
  pattern: string;
  gender: string;
  description: string;
  purchaseCost: string;
  mrp: string;
  sellingPrice: string;
  offerPrice: string;
  sku: string;
  qrCode: string;
  stockQty: string;
  rack: string;
  box: string;
  slot: string;
  freeGiftEligible: boolean;
  freeGiftValue: string;
  isActive: boolean;
};

type SlotKey =
  | 'ai_main'
  | 'real_front'
  | 'real_back'
  | 'detail'
  | 'product_video';

type MediaKind = 'image' | 'video';

type EditMediaAsset = {
  file: File;
  previewUrl: string;
  kind: MediaKind;
  slot: SlotKey;
};

type UploadResult = {
  uploadUrl: string;
  publicUrl: string;
};

const MEDIA_SLOTS: Array<{
  slot: SlotKey;
  label: string;
  kind: MediaKind;
}> = [
  { slot: 'ai_main', label: 'Main Image', kind: 'image' },
  { slot: 'real_front', label: 'Real Front', kind: 'image' },
  { slot: 'real_back', label: 'Real Back', kind: 'image' },
  { slot: 'detail', label: 'Detail Image', kind: 'image' },
  { slot: 'product_video', label: 'Product Video', kind: 'video' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 100];

const FALLBACK_CATEGORIES: ProductCategoryConfig[] = [
  {
    id: 'girl-dress',
    name: 'Girl Dress',
    subcategories: [
      '0-1 Years',
      '1-2 Years',
      '2-3 Years',
      '3-5 Years',
      '6-8 Years',
      '9-12 Years',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'earrings',
    name: 'Earrings',
    subcategories: [
      'Stud',
      'Hoop',
      'Drop',
      'Jhumka',
      'Kids',
      'Other Earrings',
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'toys',
    name: 'Toys',
    subcategories: [
      'Dolls & Pretend Play',
      'Vehicles & Guns',
      'Learning & Creative',
      'Balls & Outdoor',
      'Fun & Fidget',
      'Other Toys',
    ],
    isActive: true,
    sortOrder: 3,
  },
];

function mergeCategoryConfigs(
  firestoreCategories: ProductCategoryConfig[],
): ProductCategoryConfig[] {
  const merged = new Map<string, ProductCategoryConfig>();

  for (const item of FALLBACK_CATEGORIES) {
    merged.set(item.name.toLowerCase(), item);
  }

  for (const item of firestoreCategories) {
    if (!item.name || !item.isActive) continue;
    merged.set(item.name.toLowerCase(), item);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const orderDiff = a.sortOrder - b.sortOrder;
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });
}

function productImage(data: DocumentData): string {
  const images = Array.isArray(data.images) ? data.images : [];
  return String(
    images[0] ||
      data.image_url ||
      data.image ||
      data.product_image_url ||
      data.thumbnail_url ||
      data.studio_image_url ||
      '',
  ).trim();
}

function titleOf(data: DocumentData): string {
  return String(data.title || data.product_name || 'Product').trim();
}

function categoryOf(data: DocumentData): string {
  return String(data.main_category || data.category || '').trim();
}

function mrpOf(data: DocumentData): number {
  return Number(data.mrp ?? data.old_price ?? 0) || 0;
}

function sellingPriceOf(data: DocumentData): number {
  return Number(
    data.selling_price ??
      data.price ??
      data.offer_price ??
      data.mrp ??
      0,
  ) || 0;
}

function offerPriceOf(data: DocumentData): number {
  const offer = Number(data.offer_price ?? 0) || 0;
  const selling = sellingPriceOf(data);
  return offer > 0 && (selling <= 0 || offer < selling) ? offer : 0;
}

function displayPriceOf(data: DocumentData): number {
  return offerPriceOf(data) || sellingPriceOf(data);
}

function automaticOfferOf(data: DocumentData): string {
  const mrp = mrpOf(data);
  const finalPrice = displayPriceOf(data);

  if (mrp <= 0 || finalPrice <= 0 || finalPrice >= mrp) {
    return '';
  }

  const percent = Math.round(((mrp - finalPrice) / mrp) * 100);
  return `${percent}% OFF`;
}

function stockOf(data: DocumentData): number {
  return Math.max(
    0,
    Number(data.stock_qty ?? data.stock_quantity ?? 0) || 0,
  );
}

function reservedOf(data: DocumentData): number {
  return Math.max(0, Number(data.reserved_qty ?? 0) || 0);
}

function soldOf(data: DocumentData): number {
  return Math.max(0, Number(data.sold_qty ?? 0) || 0);
}

function availableOf(data: DocumentData): number {
  const stock = stockOf(data);
  const reserved = reservedOf(data);
  const stored = Number(data.available_qty);

  if (Number.isFinite(stored) && stored >= 0) {
    return Math.max(0, stored);
  }

  return Math.max(0, stock - reserved);
}

function createdMillis(data: DocumentData): number {
  const value = data.created_at;
  if (value?.toMillis) return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function money(value: string): number {
  return Number(value.replace(/[^0-9.]/g, '')) || 0;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function commaList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase().trim();

  if (fromName && /^[a-z0-9]{2,6}$/.test(fromName)) {
    return fromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'video/mp4') return 'mp4';
  if (file.type === 'video/webm') return 'webm';

  return file.type.startsWith('video/') ? 'mp4' : 'jpg';
}

function safeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}


const OLD_IMAGE_BATCH_SIZE = 30;
const OPTIMIZED_IMAGE_MAX_DIMENSION = 1400;
const OPTIMIZED_IMAGE_TARGET_BYTES = 650_000;

type OldImageCandidate = {
  rowId: string;
  slot: Exclude<SlotKey, 'product_video'>;
  sourceUrl: string;
};

type FailedOldImage = {
  key: string;
  rowId: string;
  slot: Exclude<SlotKey, 'product_video'>;
  sourceUrl: string;
  reason: string;
};

function oldImageCandidateKey(candidate: OldImageCandidate): string {
  return `${candidate.rowId}::${candidate.slot}::${candidate.sourceUrl}`;
}

async function fetchImageAsFile(
  url: string,
  name: string,
): Promise<File> {
  let response: Response | null = null;
  let directError = '';

  try {
    response = await fetch(url, {
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (error) {
    directError =
      error instanceof Error ? error.message : 'Direct browser fetch failed.';
  }

  if (!response?.ok) {
    const proxyResponse = await fetch(
      `/api/admin/image-proxy?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

    if (!proxyResponse.ok) {
      const detail = await proxyResponse.text().catch(() => '');

      throw new Error(
        `Image download failed. Direct: ${
          response ? response.status : directError || 'blocked'
        }. Proxy: ${proxyResponse.status}${
          detail ? ` - ${detail.slice(0, 180)}` : ''
        }`,
      );
    }

    response = proxyResponse;
  }

  const blob = await response.blob();

  if (!blob.type.startsWith('image/')) {
    throw new Error(
      `Downloaded file is not an image (${blob.type || 'unknown type'}).`,
    );
  }

  return new File([blob], name, {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function prepareExistingImageForUpload(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error('Could not decode an old product image.'));
      img.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Old product image has invalid dimensions.');
    }

    const scale = Math.min(
      1,
      OPTIMIZED_IMAGE_MAX_DIMENSION /
        Math.max(sourceWidth, sourceHeight),
    );

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Browser could not prepare the old product image.');
    }

    context.drawImage(image, 0, 0, width, height);

    const qualities = [0.84, 0.78, 0.72, 0.66, 0.6];
    let lastBlob: Blob | null = null;

    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality);
      });

      if (!blob) continue;
      lastBlob = blob;

      if (blob.size <= OPTIMIZED_IMAGE_TARGET_BYTES) {
        return new File(
          [blob],
          `${file.name.replace(/\.[^.]+$/, '') || 'product'}.webp`,
          {
            type: 'image/webp',
            lastModified: Date.now(),
          },
        );
      }
    }

    if (!lastBlob) {
      throw new Error('Could not compress old product image.');
    }

    return new File(
      [lastBlob],
      `${file.name.replace(/\.[^.]+$/, '') || 'product'}.webp`,
      {
        type: 'image/webp',
        lastModified: Date.now(),
      },
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isAlreadyOptimizedImage(url: string): boolean {
  const value = url.toLowerCase();
  return (
    value.includes('/optimized-products/') ||
    value.includes('_optimized.webp')
  );
}

function existingMediaUrl(data: DocumentData, slot: SlotKey): string {
  const media = Array.isArray(data.media) ? data.media : [];

  const fromMedia = media.find(
    (item: unknown) =>
      item &&
      typeof item === 'object' &&
      cleanText((item as Record<string, unknown>).slot) === slot,
  ) as Record<string, unknown> | undefined;

  if (fromMedia) {
    const mediaUrl = cleanText(fromMedia.url);
    if (mediaUrl) return mediaUrl;
  }

  if (slot === 'ai_main') {
    return cleanText(
      data.image_url ||
        data.image ||
        data.product_image_url ||
        data.thumbnail_url ||
        data.studio_image_url ||
        (Array.isArray(data.images) ? data.images[0] : ''),
    );
  }

  if (slot === 'real_front') {
    return cleanText(
      data.real_front_url ||
        data.raw_image_url ||
        (Array.isArray(data.images) ? data.images[1] : ''),
    );
  }

  if (slot === 'real_back') {
    return cleanText(
      data.real_back_url ||
        (Array.isArray(data.images) ? data.images[2] : ''),
    );
  }

  if (slot === 'detail') {
    return cleanText(
      data.detail_image_url ||
        (Array.isArray(data.images) ? data.images[3] : ''),
    );
  }

  return cleanText(data.product_video_url);
}

function locationParts(data: DocumentData) {
  return {
    rack: String(data.rack ?? data.rack_location ?? '').trim(),
    box: String(data.box ?? data.box_location ?? '').trim(),
    slot: String(data.slot ?? data.slot_location ?? '').trim(),
  };
}

function hasLocation(data: DocumentData): boolean {
  const { rack, box, slot } = locationParts(data);
  return Boolean(rack || box || slot);
}

function productStatus(data: DocumentData) {
  if (data.isActive === false) return 'Hidden' as const;
  if (stockOf(data) <= 0) return 'Out of stock' as const;
  return 'Active' as const;
}

function editFormFromProduct(data: DocumentData): EditForm {
  const garmentMeasurements =
    data.garment_measurements && typeof data.garment_measurements === 'object'
      ? (data.garment_measurements as Record<string, unknown>)
      : {};

  const onePiece =
    garmentMeasurements.one_piece && typeof garmentMeasurements.one_piece === 'object'
      ? (garmentMeasurements.one_piece as Record<string, unknown>)
      : {};

  const topFromGarment =
    garmentMeasurements.top && typeof garmentMeasurements.top === 'object'
      ? (garmentMeasurements.top as Record<string, unknown>)
      : {};

  const bottomFromGarment =
    garmentMeasurements.bottom && typeof garmentMeasurements.bottom === 'object'
      ? (garmentMeasurements.bottom as Record<string, unknown>)
      : {};

  const thirdFromGarment =
    garmentMeasurements.third_piece && typeof garmentMeasurements.third_piece === 'object'
      ? (garmentMeasurements.third_piece as Record<string, unknown>)
      : {};

  const topMeasurements =
    data.top_measurements && typeof data.top_measurements === 'object'
      ? (data.top_measurements as Record<string, unknown>)
      : topFromGarment;

  const bottomMeasurements =
    data.bottom_measurements && typeof data.bottom_measurements === 'object'
      ? (data.bottom_measurements as Record<string, unknown>)
      : bottomFromGarment;

  const thirdMeasurements =
    data.third_piece_measurements && typeof data.third_piece_measurements === 'object'
      ? (data.third_piece_measurements as Record<string, unknown>)
      : thirdFromGarment;

  const savedSetType = String(
    data.set_type ??
      garmentMeasurements.set_type ??
      (Number(data.piece_count) === 3
        ? '3 Piece'
        : Number(data.piece_count) === 2
          ? '2 Piece'
          : '1 Piece'),
  );

  return {
    title: titleOf(data),
    brand: String(data.brand ?? ''),
    mainCategory: String(data.main_category ?? data.category ?? ''),
    subCategory: String(data.sub_category ?? ''),
    childCategory: String(data.child_category ?? ''),
    color: String(data.color ?? ''),
    secondaryColor: String(data.secondary_color ?? ''),
    size: String(data.size ?? ''),
    availableSizes: Array.isArray(data.available_sizes)
      ? data.available_sizes.map((value: unknown) => String(value).trim()).filter(Boolean).join(', ')
      : String(data.available_sizes ?? data.size ?? ''),
    dressType: String(data.dress_type ?? onePiece.type ?? ''),
    setType: savedSetType,

    dressLength: String(
      onePiece.length ?? data.dress_length ?? data.garment_length ?? '',
    ),
    chestSize: String(
      onePiece.chest ?? data.chest_size ?? data.chest ?? data.bust_size ?? '',
    ),
    waistSize: String(
      onePiece.waist ?? data.waist_size ?? data.waist ?? '',
    ),
    shoulderSize: String(
      onePiece.shoulder ?? data.shoulder_size ?? '',
    ),
    sleeveLength: String(
      onePiece.sleeve ?? data.sleeve_length ?? '',
    ),

    topType: String(topMeasurements.type ?? 'T-Shirt'),
    topChest: String(topMeasurements.chest ?? ''),
    topLength: String(topMeasurements.length ?? ''),
    topShoulder: String(topMeasurements.shoulder ?? ''),
    topSleeve: String(topMeasurements.sleeve ?? ''),

    bottomType: String(bottomMeasurements.type ?? 'Pant / Shorts'),
    bottomWaist: String(bottomMeasurements.waist ?? ''),
    bottomMaxWaist: String(bottomMeasurements.max_waist ?? ''),
    bottomHip: String(bottomMeasurements.hip ?? ''),
    bottomLength: String(bottomMeasurements.length ?? ''),
    bottomInseam: String(bottomMeasurements.inseam ?? ''),

    thirdPieceType: String(thirdMeasurements.type ?? ''),
    thirdPieceChest: String(thirdMeasurements.chest ?? ''),
    thirdPieceWaist: String(thirdMeasurements.waist ?? ''),
    thirdPieceLength: String(thirdMeasurements.length ?? ''),

    material: String(data.material ?? data.fabric ?? ''),
    pattern: String(data.pattern ?? data.style ?? ''),
    gender: String(data.gender ?? data.audience ?? ''),
    description: String(data.description ?? data.ai_description ?? ''),
    purchaseCost: String(data.purchase_cost ?? ''),
    mrp: String(data.mrp ?? data.old_price ?? ''),
    sellingPrice: String(
      data.selling_price ?? data.price ?? data.offer_price ?? '',
    ),
    offerPrice: String(offerPriceOf(data) || ''),
    sku: String(data.sku ?? ''),
    qrCode: String(data.qr_code ?? data.qr_sticker_id ?? ''),
    stockQty: String(data.stock_qty ?? data.stock_quantity ?? 0),
    rack: String(data.rack ?? data.rack_location ?? ''),
    box: String(data.box ?? data.box_location ?? ''),
    slot: String(data.slot ?? data.slot_location ?? ''),
    freeGiftEligible: data.free_gift_eligible === true,
    freeGiftValue: String(data.free_gift_value ?? ''),
    isActive: data.isActive !== false,
  };
}


function freeGiftCountOf(data: DocumentData): number {
  // Only show a gift on the poster when an explicit gift quantity exists.
  // Do not calculate/invent a gift count from price or free_gift_eligible.
  const explicit = Number(
    data.free_gift_count ?? data.gift_count ?? data.free_gift_qty ?? 0,
  );

  if (!Number.isFinite(explicit) || explicit <= 0) return 0;
  return Math.floor(explicit);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawRoundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke = '',
  lineWidth = 1,
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}


function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return y;

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }

    if (line) lines.push(line);
    line = word;

    if (lines.length >= maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  const consumedWords = lines.join(' ').split(/\s+/).length;
  if (consumedWords < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last.trim()}…`;
  }

  lines.forEach((value, index) => {
    ctx.fillText(value, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = x + (width - drawWidth) / 2;
  const dy = y + (height - drawHeight) / 2;

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, 26);
  ctx.clip();
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load product image for poster.'));
      image.src = objectUrl;
    });
  } finally {
    // Revoking is delayed one tick so the decoded image remains available for canvas draw.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export default function AdminProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [giftFilter, setGiftFilter] = useState<GiftFilter>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [soldOnly, setSoldOnly] = useState(false);
  const [reservedOnly, setReservedOnly] = useState(false);
  const deepLinkOpenedRef = useRef('');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [categoryConfigs, setCategoryConfigs] =
    useState<ProductCategoryConfig[]>(FALLBACK_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const isEditingGirlDress =
    editForm?.mainCategory.trim().toLowerCase() === 'girl dress';

  const editMediaInputRef = useRef<HTMLInputElement | null>(null);
  const [editMediaTarget, setEditMediaTarget] = useState<SlotKey>('ai_main');
  const [editMediaChanges, setEditMediaChanges] = useState<
    Partial<Record<SlotKey, EditMediaAsset>>
  >({});
  const [editUploadStatus, setEditUploadStatus] = useState('');
  const [optimizingOldImages, setOptimizingOldImages] = useState(false);
  const [optimizeStatus, setOptimizeStatus] = useState('');
  const [optimizedImageCount, setOptimizedImageCount] = useState(0);
  const [failedOldImages, setFailedOldImages] = useState<FailedOldImage[]>([]);
  const [showOptimizeFailures, setShowOptimizeFailures] = useState(false);

  const [generatedPosters, setGeneratedPosters] = useState<Record<string, GeneratedPoster>>({});
  const [generatingPosterId, setGeneratingPosterId] = useState('');
  const [previewPosterId, setPreviewPosterId] = useState('');

  async function loadProducts(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    if (showLoader) setLoading(true);

    try {
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, 'BusinessProducts'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        snap = await getDocs(collection(db, 'BusinessProducts'));
      }

      setRows(
        snap.docs
          .map((item) => ({ id: item.id, data: item.data() }))
          .filter(({ data }) => data.isDeleted !== true),
      );
      setMessage('');
    } catch (error) {
      console.error('Load products failed:', error);
      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load products.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshProducts() {
    if (refreshing) return;

    setRefreshing(true);
    setMessage('');

    try {
      await loadProducts(false);
      setMessage('Products refreshed.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!db) {
        if (active) {
          setCategoryConfigs(FALLBACK_CATEGORIES);
          setCategoriesLoading(false);
        }
        return;
      }

      try {
        let snapshot;

        try {
          snapshot = await getDocs(
            query(
              collection(db, 'ProductCategories'),
              orderBy('sort_order', 'asc'),
            ),
          );
        } catch {
          snapshot = await getDocs(collection(db, 'ProductCategories'));
        }

        if (!active) return;

        const loaded = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;

            return {
              id: item.id,
              name: String(data.name || '').trim(),
              subcategories: Array.isArray(data.subcategories)
                ? data.subcategories
                    .map((value) => String(value).trim())
                    .filter(Boolean)
                : [],
              isActive: data.is_active !== false,
              sortOrder: Number(data.sort_order) || 0,
            } satisfies ProductCategoryConfig;
          })
          .filter((item) => item.name && item.isActive);

        setCategoryConfigs(mergeCategoryConfigs(loaded));
      } catch (error) {
        console.error('Unable to load ProductCategories:', error);

        if (active) {
          setCategoryConfigs(FALLBACK_CATEGORIES);
        }
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(
        window.location.search,
      );

      const stock = params.get('stock');
      if (
        stock === 'in_stock' ||
        stock === 'low_stock' ||
        stock === 'out_of_stock' ||
        stock === 'attention'
      ) {
        setStockFilter(stock);
      }

      if (params.get('sold') === '1') {
        setSoldOnly(true);
      }

      const sort = params.get('sort');
      if (
        sort === 'newest' ||
        sort === 'oldest' ||
        sort === 'name_az' ||
        sort === 'name_za' ||
        sort === 'price_low' ||
        sort === 'price_high' ||
        sort === 'stock_low' ||
        sort === 'stock_high' ||
        sort === 'sold_high'
      ) {
        setSortBy(sort);
      }
    }

    void loadProducts();
  }, []);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      rows.length === 0
    ) {
      return;
    }

    const editId = new URLSearchParams(
      window.location.search,
    ).get('edit');

    if (
      !editId ||
      deepLinkOpenedRef.current === editId
    ) {
      return;
    }

    const target = rows.find(
      (row) => row.id === editId,
    );

    if (target) {
      deepLinkOpenedRef.current = editId;
      openEdit(target);
    }
  }, [rows]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(rows.map(({ data }) => categoryOf(data)).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const summary = useMemo(() => {
    const active = rows.filter(({ data }) => data.isActive !== false).length;
    const lowStock = rows.filter(({ data }) => {
      const stock = stockOf(data);
      return stock > 0 && stock <= 2;
    }).length;
    const outStock = rows.filter(({ data }) => stockOf(data) <= 0).length;
    const gifts = rows.filter(({ data }) => data.free_gift_eligible === true).length;
    const missingLocation = rows.filter(({ data }) => !hasLocation(data)).length;
    const unitsSold = rows.reduce((sum, { data }) => sum + soldOf(data), 0);
    const reservedUnits = rows.reduce((sum, { data }) => sum + reservedOf(data), 0);

    return {
      total: rows.length,
      active,
      lowStock,
      outStock,
      gifts,
      missingLocation,
      unitsSold,
      reservedUnits,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const next = rows.filter(({ id, data }) => {
      if (needle) {
        const searchable = [
          id,
          data.title,
          data.product_name,
          data.brand,
          data.sku,
          data.qr_code,
          data.qr_sticker_id,
          data.main_category,
          data.category,
          data.sub_category,
          data.child_category,
          data.color,
          data.secondary_color,
          data.size,
          data.available_sizes,
          data.dress_type,
          data.dress_length,
          data.chest_size,
          data.waist_size,
          data.material,
          data.pattern,
          data.gender,
          data.rack,
          data.box,
          data.slot,
        ];

        if (
          !searchable.some((value) =>
            String(value ?? '').toLowerCase().includes(needle),
          )
        ) {
          return false;
        }
      }

      if (categoryFilter !== 'all' && categoryOf(data) !== categoryFilter) {
        return false;
      }

      const stock = stockOf(data);
      if (stockFilter === 'in_stock' && stock <= 2) return false;
      if (stockFilter === 'low_stock' && !(stock > 0 && stock <= 2)) return false;
      if (stockFilter === 'out_of_stock' && stock > 0) return false;
      if (stockFilter === 'attention' && stock > 2) return false;

      if (soldOnly && soldOf(data) <= 0) return false;
      if (reservedOnly && reservedOf(data) <= 0) return false;

      if (statusFilter === 'active' && data.isActive === false) return false;
      if (statusFilter === 'hidden' && data.isActive !== false) return false;

      if (giftFilter === 'gift' && data.free_gift_eligible !== true) return false;
      if (giftFilter === 'not_gift' && data.free_gift_eligible === true) return false;

      if (locationFilter === 'set' && !hasLocation(data)) return false;
      if (locationFilter === 'missing' && hasLocation(data)) return false;

      return true;
    });

    next.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return createdMillis(a.data) - createdMillis(b.data);
        case 'name_az':
          return titleOf(a.data).localeCompare(titleOf(b.data));
        case 'name_za':
          return titleOf(b.data).localeCompare(titleOf(a.data));
        case 'price_low':
          return displayPriceOf(a.data) - displayPriceOf(b.data);
        case 'price_high':
          return displayPriceOf(b.data) - displayPriceOf(a.data);
        case 'stock_low':
          return stockOf(a.data) - stockOf(b.data);
        case 'stock_high':
          return stockOf(b.data) - stockOf(a.data);
        case 'sold_high':
          return soldOf(b.data) - soldOf(a.data);
        default:
          return createdMillis(b.data) - createdMillis(a.data);
      }
    });

    return next;
  }, [
    rows,
    search,
    categoryFilter,
    stockFilter,
    soldOnly,
    reservedOnly,
    statusFilter,
    giftFilter,
    locationFilter,
    sortBy,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    categoryFilter,
    stockFilter,
    soldOnly,
    reservedOnly,
    statusFilter,
    giftFilter,
    locationFilter,
    sortBy,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const pageStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filtered.length);

  const editMainCategoryOptions = useMemo(() => {
    const values = categoryConfigs
      .map((item) => item.name)
      .filter(Boolean);

    const current = editForm?.mainCategory.trim() || '';

    if (
      current &&
      !values.some(
        (value) => value.toLowerCase() === current.toLowerCase(),
      )
    ) {
      values.unshift(current);
    }

    return Array.from(new Set(values));
  }, [categoryConfigs, editForm?.mainCategory]);

  const selectedEditCategoryConfig = useMemo(() => {
    const current = editForm?.mainCategory.trim().toLowerCase() || '';

    if (!current) return null;

    return (
      categoryConfigs.find(
        (item) => item.name.toLowerCase() === current,
      ) || null
    );
  }, [categoryConfigs, editForm?.mainCategory]);

  const editSubCategoryOptions = useMemo(() => {
    const values = selectedEditCategoryConfig
      ? [...selectedEditCategoryConfig.subcategories]
      : [];

    const current = editForm?.subCategory.trim() || '';

    if (
      current &&
      !values.some(
        (value) => value.toLowerCase() === current.toLowerCase(),
      )
    ) {
      values.unshift(current);
    }

    return Array.from(new Set(values));
  }, [selectedEditCategoryConfig, editForm?.subCategory]);

  function changeEditMainCategory(value: string) {
    setEditForm((prev) => {
      if (!prev) return prev;

      const sameCategory =
        prev.mainCategory.trim().toLowerCase() ===
        value.trim().toLowerCase();

      return {
        ...prev,
        mainCategory: value,
        subCategory: sameCategory ? prev.subCategory : '',
        childCategory: sameCategory ? prev.childCategory : '',
      };
    });
  }

  function clearEditMediaChanges() {
    Object.values(editMediaChanges).forEach((asset) => {
      if (asset?.previewUrl) {
        URL.revokeObjectURL(asset.previewUrl);
      }
    });

    setEditMediaChanges({});
    setEditUploadStatus('');
  }

  function openEdit(row: ProductRow) {
    clearEditMediaChanges();
    setEditing(row);
    setEditForm(editFormFromProduct(row.data));
    setMessage('');
  }

  function closeEdit() {
    if (savingEdit) return;
    clearEditMediaChanges();
    setEditing(null);
    setEditForm(null);
  }

  function chooseEditMedia(slot: SlotKey) {
    if (savingEdit) return;

    setEditMediaTarget(slot);

    if (editMediaInputRef.current) {
      editMediaInputRef.current.accept =
        slot === 'product_video' ? 'video/*' : 'image/*';
      editMediaInputRef.current.value = '';
      editMediaInputRef.current.click();
    }
  }

  function handleEditMediaSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    const expectedKind: MediaKind =
      editMediaTarget === 'product_video' ? 'video' : 'image';

    const actualKind: MediaKind = file.type.startsWith('video/')
      ? 'video'
      : 'image';

    if (actualKind !== expectedKind) {
      setMessage(
        expectedKind === 'video'
          ? 'Please select a video file for Product Video.'
          : 'Please select an image file for this media slot.',
      );
      return;
    }

    setEditMediaChanges((prev) => {
      const previous = prev[editMediaTarget];

      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      return {
        ...prev,
        [editMediaTarget]: {
          file,
          previewUrl: URL.createObjectURL(file),
          kind: actualKind,
          slot: editMediaTarget,
        },
      };
    });

    setMessage('');
  }

  function removeEditMediaSelection(slot: SlotKey) {
    setEditMediaChanges((prev) => {
      const previous = prev[slot];

      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  async function uploadReplacementMedia(
    asset: EditMediaAsset,
    index: number,
    total: number,
  ): Promise<string> {
    const user = auth?.currentUser;

    if (!user) {
      throw new Error('Admin login is required before uploading media.');
    }

    if (!editForm) {
      throw new Error('Product edit form is not available.');
    }

    const contentType =
      asset.file.type ||
      (asset.kind === 'video' ? 'video/mp4' : 'image/jpeg');

    const ext = extensionFor(asset.file);

    const skuPart =
      safeFilePart(editForm.sku) ||
      safeFilePart(editForm.title) ||
      'product';

    const fileName =
      `business_products/web_admin/${user.uid}/` +
      `${Date.now()}_${skuPart}_${asset.slot}.${ext}`;

    setEditUploadStatus(
      `Uploading ${index + 1} of ${total}: ${
        MEDIA_SLOTS.find((item) => item.slot === asset.slot)?.label ??
        asset.slot
      }`,
    );

    const functions = getFunctions(getApp(), 'asia-south1');

    const getUploadUrl = httpsCallable<
      {
        fileName: string;
        contentType: string;
      },
      UploadResult
    >(functions, 'getR2UploadUrl');

    const result = await getUploadUrl({
      fileName,
      contentType,
    });

    const uploadUrl = cleanText(result.data?.uploadUrl);
    const publicUrl = cleanText(result.data?.publicUrl);

    if (!uploadUrl || !publicUrl) {
      throw new Error(
        'R2 upload URL was not returned by getR2UploadUrl.',
      );
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: asset.file,
    });

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '');

      throw new Error(
        `R2 upload failed (${uploadResponse.status})${
          detail ? `: ${detail}` : ''
        }`,
      );
    }

    return publicUrl;
  }

  function updateEditField(field: keyof EditForm, value: string | boolean) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveEdit() {
    if (!db || !editing || !editForm) return;
    if (!editForm.title.trim()) {
      setMessage('Product name is required.');
      return;
    }

    const sellingPrice = money(editForm.sellingPrice);
    if (sellingPrice <= 0) {
      setMessage('Selling Price is required.');
      return;
    }

    if (
      editForm.mainCategory.trim().toLowerCase() === 'girl dress' &&
      commaList(editForm.availableSizes).length === 0
    ) {
      setMessage('Enter at least one available dress size.');
      return;
    }

    setSavingEdit(true);
    setEditUploadStatus('');

    try {
      const changedAssets = Object.values(editMediaChanges).filter(
        (asset): asset is EditMediaAsset => Boolean(asset),
      );

      const uploadedChanges: Partial<Record<SlotKey, string>> = {};

      for (let index = 0; index < changedAssets.length; index += 1) {
        const asset = changedAssets[index];

        uploadedChanges[asset.slot] = await uploadReplacementMedia(
          asset,
          index,
          changedAssets.length,
        );
      }

      const finalMediaUrls: Record<SlotKey, string> = {
        ai_main:
          cleanText(uploadedChanges.ai_main) ||
          existingMediaUrl(editing.data, 'ai_main'),
        real_front:
          cleanText(uploadedChanges.real_front) ||
          existingMediaUrl(editing.data, 'real_front'),
        real_back:
          cleanText(uploadedChanges.real_back) ||
          existingMediaUrl(editing.data, 'real_back'),
        detail:
          cleanText(uploadedChanges.detail) ||
          existingMediaUrl(editing.data, 'detail'),
        product_video:
          cleanText(uploadedChanges.product_video) ||
          existingMediaUrl(editing.data, 'product_video'),
      };

      if (!finalMediaUrls.ai_main) {
        throw new Error('Main product image is required.');
      }

      const images = [
        finalMediaUrls.ai_main,
        finalMediaUrls.real_front,
        finalMediaUrls.real_back,
        finalMediaUrls.detail,
      ].filter(Boolean);

      const media = [
        finalMediaUrls.ai_main
          ? {
              slot: 'ai_main',
              role: 'ai',
              type: 'image',
              label: 'AI Main Image',
              url: finalMediaUrls.ai_main,
              order: 1,
            }
          : null,
        finalMediaUrls.real_front
          ? {
              slot: 'real_front',
              role: 'front',
              type: 'image',
              label: 'Real Front',
              url: finalMediaUrls.real_front,
              order: 2,
            }
          : null,
        finalMediaUrls.real_back
          ? {
              slot: 'real_back',
              role: 'back',
              type: 'image',
              label: 'Real Back',
              url: finalMediaUrls.real_back,
              order: 3,
            }
          : null,
        finalMediaUrls.detail
          ? {
              slot: 'detail',
              role: 'additional',
              type: 'image',
              label: 'Detail Image',
              url: finalMediaUrls.detail,
              order: 4,
            }
          : null,
        finalMediaUrls.product_video
          ? {
              slot: 'product_video',
              role: 'video',
              type: 'video',
              label: 'Product Video',
              url: finalMediaUrls.product_video,
              order: 5,
            }
          : null,
      ].filter(Boolean);

      const stock = Math.max(
        0,
        Number.parseInt(editForm.stockQty || '0', 10) || 0,
      );
      const reserved = reservedOf(editing.data);
      const available = Math.max(0, stock - reserved);

      const mrp = money(editForm.mrp);
      const purchaseCost = money(editForm.purchaseCost);
      const offerPrice = 0;
      const finalCustomerPrice = sellingPrice;

      const discount =
        mrp > finalCustomerPrice && mrp > 0
          ? `${Math.round(
              ((mrp - finalCustomerPrice) / mrp) * 100,
            )}% OFF`
          : '';

      const editingGirlDress =
        editForm.mainCategory.trim().toLowerCase() === 'girl dress';

      const availableSizes = editingGirlDress
        ? commaList(editForm.availableSizes)
        : editForm.size.trim()
          ? [editForm.size.trim()]
          : [];

      const savedSize = editingGirlDress
        ? availableSizes.join(', ')
        : editForm.size.trim();

      const payload = {
        title: editForm.title.trim(),
        product_name: editForm.title.trim(),
        brand: editForm.brand.trim(),
        category: editForm.mainCategory.trim(),
        main_category: editForm.mainCategory.trim(),
        sub_category: editForm.subCategory.trim(),
        child_category: editForm.childCategory.trim(),
        color: editForm.color.trim(),
        secondary_color: editForm.secondaryColor.trim(),
        size: savedSize,
        available_sizes: availableSizes,
        dress_type: editingGirlDress ? editForm.dressType.trim() : '',
        set_type: editingGirlDress ? editForm.setType : '',
        piece_count: editingGirlDress
          ? editForm.setType === '3 Piece'
            ? 3
            : editForm.setType === '2 Piece'
              ? 2
              : 1
          : 0,

        // Legacy fields kept populated so existing product-detail code still works.
        dress_length: editingGirlDress
          ? editForm.setType === '1 Piece'
            ? editForm.dressLength.trim()
            : editForm.topLength.trim()
          : '',
        chest_size: editingGirlDress
          ? editForm.setType === '1 Piece'
            ? editForm.chestSize.trim()
            : editForm.topChest.trim()
          : '',
        waist_size: editingGirlDress
          ? editForm.setType === '1 Piece'
            ? editForm.waistSize.trim()
            : editForm.bottomWaist.trim()
          : '',
        shoulder_size: editingGirlDress
          ? editForm.setType === '1 Piece'
            ? editForm.shoulderSize.trim()
            : editForm.topShoulder.trim()
          : '',
        sleeve_length: editingGirlDress
          ? editForm.setType === '1 Piece'
            ? editForm.sleeveLength.trim()
            : editForm.topSleeve.trim()
          : '',

        garment_measurements: editingGirlDress
          ? {
              set_type: editForm.setType,
              one_piece:
                editForm.setType === '1 Piece'
                  ? {
                      type: editForm.dressType.trim(),
                      chest: editForm.chestSize.trim(),
                      waist: editForm.waistSize.trim(),
                      length: editForm.dressLength.trim(),
                      shoulder: editForm.shoulderSize.trim(),
                      sleeve: editForm.sleeveLength.trim(),
                    }
                  : null,
              top:
                editForm.setType !== '1 Piece'
                  ? {
                      type: editForm.topType.trim(),
                      chest: editForm.topChest.trim(),
                      length: editForm.topLength.trim(),
                      shoulder: editForm.topShoulder.trim(),
                      sleeve: editForm.topSleeve.trim(),
                    }
                  : null,
              bottom:
                editForm.setType !== '1 Piece'
                  ? {
                      type: editForm.bottomType.trim(),
                      waist: editForm.bottomWaist.trim(),
                      max_waist: editForm.bottomMaxWaist.trim(),
                      hip: editForm.bottomHip.trim(),
                      length: editForm.bottomLength.trim(),
                      inseam: editForm.bottomInseam.trim(),
                    }
                  : null,
              third_piece:
                editForm.setType === '3 Piece'
                  ? {
                      type: editForm.thirdPieceType.trim(),
                      chest: editForm.thirdPieceChest.trim(),
                      waist: editForm.thirdPieceWaist.trim(),
                      length: editForm.thirdPieceLength.trim(),
                    }
                  : null,
            }
          : null,

        top_measurements:
          editingGirlDress && editForm.setType !== '1 Piece'
            ? {
                type: editForm.topType.trim(),
                chest: editForm.topChest.trim(),
                length: editForm.topLength.trim(),
                shoulder: editForm.topShoulder.trim(),
                sleeve: editForm.topSleeve.trim(),
              }
            : null,

        bottom_measurements:
          editingGirlDress && editForm.setType !== '1 Piece'
            ? {
                type: editForm.bottomType.trim(),
                waist: editForm.bottomWaist.trim(),
                max_waist: editForm.bottomMaxWaist.trim(),
                hip: editForm.bottomHip.trim(),
                length: editForm.bottomLength.trim(),
                inseam: editForm.bottomInseam.trim(),
              }
            : null,

        third_piece_measurements:
          editingGirlDress && editForm.setType === '3 Piece'
            ? {
                type: editForm.thirdPieceType.trim(),
                chest: editForm.thirdPieceChest.trim(),
                waist: editForm.thirdPieceWaist.trim(),
                length: editForm.thirdPieceLength.trim(),
              }
            : null,

        material: editForm.material.trim(),
        fabric: editForm.material.trim(),
        pattern: editForm.pattern.trim(),
        style: editForm.pattern.trim(),
        gender: editForm.gender.trim(),
        audience: editForm.gender.trim(),
        age_group: editingGirlDress
          ? editForm.subCategory.trim()
          : cleanText(editing.data.age_group),
        description: editForm.description.trim(),
        ai_description: editForm.description.trim(),
        purchase_cost: purchaseCost,
        price: finalCustomerPrice,
        selling_price: sellingPrice,
        offer_price:
          offerPrice > 0 && offerPrice < sellingPrice
            ? offerPrice
            : 0,
        mrp,
        old_price: mrp,
        discount,
        sku: editForm.sku.trim(),
        qr_code: editForm.qrCode.trim(),
        qr_sticker_id: editForm.qrCode.trim(),
        stock_qty: stock,
        stock_quantity: stock,
        reserved_qty: reserved,
        available_qty: available,
        sold_qty: soldOf(editing.data),
        is_in_stock: available > 0,
        rack: editForm.rack.trim(),
        rack_location: editForm.rack.trim(),
        box: editForm.box.trim(),
        box_location: editForm.box.trim(),
        slot: editForm.slot.trim(),
        slot_location: editForm.slot.trim(),
        storage_location: [
          editForm.rack.trim(),
          editForm.box.trim(),
          editForm.slot.trim(),
        ]
          .filter(Boolean)
          .join(' / '),

        images,
        media,

        image: finalMediaUrls.ai_main,
        image_url: finalMediaUrls.ai_main,
        product_image: finalMediaUrls.ai_main,
        product_image_url: finalMediaUrls.ai_main,
        thumbnail_url: finalMediaUrls.ai_main,
        studio_image_url: finalMediaUrls.ai_main,

        raw_image_url:
          finalMediaUrls.real_front || finalMediaUrls.ai_main,
        real_front_url: finalMediaUrls.real_front,
        real_back_url: finalMediaUrls.real_back,
        detail_image_url: finalMediaUrls.detail,
        product_video_url: finalMediaUrls.product_video,

        free_gift_eligible: editForm.freeGiftEligible,
        free_gift_value: money(editForm.freeGiftValue),
        isActive: editForm.isActive,
        isDeleted: false,
        updated_at: serverTimestamp(),
      };

      await updateDoc(doc(db, 'BusinessProducts', editing.id), payload);

      setRows((prev) =>
        prev.map((row) =>
          row.id === editing.id
            ? { ...row, data: { ...row.data, ...payload } }
            : row,
        ),
      );

      clearEditMediaChanges();
      setEditing(null);
      setEditForm(null);
      setEditUploadStatus('');
      setMessage(
        changedAssets.length > 0
          ? 'Product and media updated successfully.'
          : 'Product updated successfully.',
      );
    } catch (error) {
      console.error('Edit product failed:', error);
      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Product update failed.',
      );
    } finally {
      setSavingEdit(false);
      setEditUploadStatus('');
    }
  }


  function collectOldImageCandidates(): OldImageCandidate[] {
    const candidates: OldImageCandidate[] = [];

    for (const row of rows) {
      const slots: Array<Exclude<SlotKey, 'product_video'>> = [
        'ai_main',
        'real_front',
        'real_back',
        'detail',
      ];

      for (const slot of slots) {
        const sourceUrl = existingMediaUrl(row.data, slot);

        if (!sourceUrl) continue;
        if (!sourceUrl.startsWith('http')) continue;
        if (isAlreadyOptimizedImage(sourceUrl)) continue;

        const candidate: OldImageCandidate = {
          rowId: row.id,
          slot,
          sourceUrl,
        };

        const key = oldImageCandidateKey(candidate);

        if (failedOldImages.some((item) => item.key === key)) {
          continue;
        }

        candidates.push(candidate);
      }
    }

    return candidates;
  }

  async function uploadOptimizedOldImage(
    sourceUrl: string,
    rowId: string,
    slot: Exclude<SlotKey, 'product_video'>,
  ): Promise<string> {
    const user = auth?.currentUser;

    if (!user) {
      throw new Error('Admin login is required.');
    }

    const downloaded = await fetchImageAsFile(
      sourceUrl,
      `${rowId}_${slot}.jpg`,
    );

    const optimized = await prepareExistingImageForUpload(downloaded);

    const functions = getFunctions(getApp(), 'asia-south1');

    const getUploadUrl = httpsCallable<
      {
        fileName: string;
        contentType: string;
      },
      UploadResult
    >(functions, 'getR2UploadUrl');

    const fileName =
      `optimized-products/${user.uid}/` +
      `${Date.now()}_${safeFilePart(rowId)}_${slot}_optimized.webp`;

    const result = await getUploadUrl({
      fileName,
      contentType: 'image/webp',
    });

    const uploadUrl = cleanText(result.data?.uploadUrl);
    const publicUrl = cleanText(result.data?.publicUrl);

    if (!uploadUrl || !publicUrl) {
      throw new Error('R2 upload URL was not returned.');
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/webp',
      },
      body: optimized,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `R2 upload failed (${uploadResponse.status})`,
      );
    }

    return publicUrl;
  }

  async function optimizeNextOldImageBatch() {
    if (!db || optimizingOldImages) return;

    const allCandidates = collectOldImageCandidates();
    const batch = allCandidates.slice(0, OLD_IMAGE_BATCH_SIZE);

    if (!batch.length) {
      setOptimizeStatus('All old product images are already optimized.');
      return;
    }

    const confirmed = window.confirm(
      `Optimize the next ${batch.length} old images?\n\n` +
        'This creates new WebP copies and updates Firestore. ' +
        'Old R2 files are NOT deleted.',
    );

    if (!confirmed) return;

    setOptimizingOldImages(true);
    setOptimizeStatus(
      `Starting batch of ${batch.length} images…`,
    );

    let successCount = 0;
    let failedCount = 0;
    const batchFailures: FailedOldImage[] = [];
    const updatedRows = new Map<string, DocumentData>();

    try {
      for (let index = 0; index < batch.length; index += 1) {
        const candidate = batch[index];

        setOptimizeStatus(
          `Optimizing ${index + 1} / ${batch.length}…`,
        );

        try {
          const row =
            updatedRows.has(candidate.rowId)
              ? {
                  id: candidate.rowId,
                  data: updatedRows.get(candidate.rowId)!,
                }
              : rows.find((item) => item.id === candidate.rowId);

          if (!row) {
            failedCount += 1;
            batchFailures.push({
              key: oldImageCandidateKey(candidate),
              rowId: candidate.rowId,
              slot: candidate.slot,
              sourceUrl: candidate.sourceUrl,
              reason: 'Product row no longer exists.',
            });
            continue;
          }

          const optimizedUrl = await uploadOptimizedOldImage(
            candidate.sourceUrl,
            candidate.rowId,
            candidate.slot,
          );

          const currentData = { ...row.data };

          const aiMain =
            candidate.slot === 'ai_main'
              ? optimizedUrl
              : existingMediaUrl(currentData, 'ai_main');
          const realFront =
            candidate.slot === 'real_front'
              ? optimizedUrl
              : existingMediaUrl(currentData, 'real_front');
          const realBack =
            candidate.slot === 'real_back'
              ? optimizedUrl
              : existingMediaUrl(currentData, 'real_back');
          const detail =
            candidate.slot === 'detail'
              ? optimizedUrl
              : existingMediaUrl(currentData, 'detail');
          const video = existingMediaUrl(
            currentData,
            'product_video',
          );

          const images = [
            aiMain,
            realFront,
            realBack,
            detail,
          ].filter(Boolean);

          const media = [
            aiMain
              ? {
                  slot: 'ai_main',
                  role: 'ai',
                  type: 'image',
                  label: 'AI Main Image',
                  url: aiMain,
                  order: 1,
                }
              : null,
            realFront
              ? {
                  slot: 'real_front',
                  role: 'front',
                  type: 'image',
                  label: 'Real Front',
                  url: realFront,
                  order: 2,
                }
              : null,
            realBack
              ? {
                  slot: 'real_back',
                  role: 'back',
                  type: 'image',
                  label: 'Real Back',
                  url: realBack,
                  order: 3,
                }
              : null,
            detail
              ? {
                  slot: 'detail',
                  role: 'additional',
                  type: 'image',
                  label: 'Detail Image',
                  url: detail,
                  order: 4,
                }
              : null,
            video
              ? {
                  slot: 'product_video',
                  role: 'video',
                  type: 'video',
                  label: 'Product Video',
                  url: video,
                  order: 5,
                }
              : null,
          ].filter(Boolean);

          const patch: Record<string, unknown> = {
            images,
            media,
            image: aiMain,
            image_url: aiMain,
            product_image: aiMain,
            product_image_url: aiMain,
            product_thumbnail: aiMain,
            thumbnail_url: aiMain,
            studio_image_url: aiMain,
            raw_image_url: realFront || aiMain,
            real_front_url: realFront,
            real_back_url: realBack,
            detail_image_url: detail,
            product_video_url: video,
            image_optimization_version: 1,
            image_optimized_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          };

          await updateDoc(
            doc(db, 'BusinessProducts', candidate.rowId),
            patch,
          );

          const merged = {
            ...currentData,
            ...patch,
            image_optimized_at: new Date(),
          };

          updatedRows.set(candidate.rowId, merged);
          successCount += 1;
          setOptimizedImageCount((count) => count + 1);
        } catch (error) {
          console.error(
            'Old image optimization failed:',
            candidate,
            error,
          );

          const reason =
            error instanceof Error
              ? error.message
              : 'Unknown optimization error.';

          failedCount += 1;
          batchFailures.push({
            key: oldImageCandidateKey(candidate),
            rowId: candidate.rowId,
            slot: candidate.slot,
            sourceUrl: candidate.sourceUrl,
            reason,
          });
        }
      }

      if (updatedRows.size) {
        setRows((current) =>
          current.map((row) =>
            updatedRows.has(row.id)
              ? {
                  ...row,
                  data: updatedRows.get(row.id)!,
                }
              : row,
          ),
        );
      }

      if (batchFailures.length) {
        setFailedOldImages((current) => {
          const map = new Map(
            current.map((item) => [item.key, item] as const),
          );

          for (const item of batchFailures) {
            map.set(item.key, item);
          }

          return Array.from(map.values());
        });
      }

      const processedKeys = new Set(
        batch.map((item) => oldImageCandidateKey(item)),
      );

      const remaining = collectOldImageCandidates().filter(
        (item) => !processedKeys.has(oldImageCandidateKey(item)),
      ).length;

      setOptimizeStatus(
        `Batch finished: ${successCount} optimized` +
          (failedCount
            ? `, ${failedCount} skipped after error`
            : '') +
          `. Approx. ${remaining} eligible old images remain.` +
          (failedCount
            ? ' Failed images will not be retried in this browser session.'
            : ''),
      );
    } finally {
      setOptimizingOldImages(false);
    }
  }

  async function adjustStock(row: ProductRow, delta: number) {
    if (!db || busyId) return;
    setBusyId(row.id);

    try {
      const ref = doc(db, 'BusinessProducts', row.id);
      const nextStock = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('Product no longer exists.');

        const currentData = snap.data();
        const current = stockOf(currentData);
        const reserved = reservedOf(currentData);
        const next = Math.max(0, current + delta);
        const available = Math.max(0, next - reserved);

        transaction.update(ref, {
          stock_qty: next,
          stock_quantity: next,
          reserved_qty: reserved,
          available_qty: available,
          is_in_stock: available > 0,
          updated_at: serverTimestamp(),
        });

        return { stock: next, reserved, available };
      });

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  stock_qty: nextStock.stock,
                  stock_quantity: nextStock.stock,
                  reserved_qty: nextStock.reserved,
                  available_qty: nextStock.available,
                  is_in_stock: nextStock.available > 0,
                },
              }
            : item,
        ),
      );
    } catch (error) {
      console.error('Stock update failed:', error);
      setMessage(
        error instanceof Error
          ? `Stock update failed: ${error.message}`
          : 'Stock update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function toggleActive(row: ProductRow) {
    if (!db || busyId) return;
    const nextActive = row.data.isActive === false;
    setBusyId(row.id);

    try {
      await updateDoc(doc(db, 'BusinessProducts', row.id), {
        isActive: nextActive,
        updated_at: serverTimestamp(),
      });

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, data: { ...item.data, isActive: nextActive } }
            : item,
        ),
      );

      setMessage(nextActive ? 'Product activated.' : 'Product hidden from Shop.');
    } catch (error) {
      console.error('Status update failed:', error);
      setMessage(
        error instanceof Error
          ? `Status update failed: ${error.message}`
          : 'Status update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function deleteProduct(row: ProductRow) {
    if (!db || busyId) return;

    const confirmed = window.confirm(
      `Permanently delete "${titleOf(row.data)}"?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyId(row.id);

    try {
      await deleteDoc(doc(db, 'BusinessProducts', row.id));

      setRows((prev) =>
        prev.filter((item) => item.id !== row.id),
      );

      if (editing?.id === row.id) {
        clearEditMediaChanges();
        setEditing(null);
        setEditForm(null);
      }

      setMessage('Product deleted permanently.');
    } catch (error) {
      console.error('Delete product failed:', error);
      setMessage(
        error instanceof Error ? `Delete failed: ${error.message}` : 'Delete failed.',
      );
    } finally {
      setBusyId('');
    }
  }


  async function generatePoster(row: ProductRow) {
    if (generatingPosterId) return;

    const sourceUrl = productImage(row.data);
    if (!sourceUrl) {
      setMessage(
        'This product has no image. Add a product image before generating the poster.',
      );
      return;
    }

    setGeneratingPosterId(row.id);
    setMessage('Generating 1080 × 1350 product poster…');

    try {
      const imageFile = await fetchImageAsFile(
        sourceUrl,
        `${safeFilePart(titleOf(row.data)) || 'product'}-poster-source.jpg`,
      );
      const image = await loadImageFromFile(imageFile);

      const canvas = document.createElement('canvas');
      canvas.width = POSTER_WIDTH;
      canvas.height = POSTER_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser could not create poster canvas.');

      const title = titleOf(row.data);
      const price = displayPriceOf(row.data);
      const mrp = mrpOf(row.data);
      const discount = automaticOfferOf(row.data);
      const giftCount = freeGiftCountOf(row.data);

      // ==========================================================
      // SPOTC SHARE POSTER — 1080 × 1350
      // Big product-first layout with vector brand/icons.
      // ==========================================================
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

      // ---------- BRAND LOGO ----------
      // Drawn as vectors/text so the poster never depends on a missing logo asset.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#071e5b';
      ctx.font = '800 76px Arial, sans-serif';
      ctx.fillText('Spotc', 48, 88);
      const spotcWidth = ctx.measureText('Spotc').width;
      const dotX = 48 + spotcWidth;
      ctx.fillStyle = '#ed0b55';
      ctx.fillText('.in', dotX, 88);

      // SPOTC spark mark above the "in".
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      const sparkX = dotX + 72;
      const sparkY = 27;
      const rays = [
        { dx1: -24, dy1: 8, dx2: -36, dy2: -2, color: '#ffb000' },
        { dx1: 0, dy1: 0, dx2: 0, dy2: -18, color: '#ed0b55' },
        { dx1: 22, dy1: 8, dx2: 35, dy2: -1, color: '#f47b20' },
        { dx1: 11, dy1: 2, dx2: 19, dy2: -14, color: '#2ca44f' },
      ];
      for (const ray of rays) {
        ctx.strokeStyle = ray.color;
        ctx.beginPath();
        ctx.moveTo(sparkX + ray.dx1, sparkY + ray.dy1);
        ctx.lineTo(sparkX + ray.dx2, sparkY + ray.dy2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.font = '700 21px Arial, sans-serif';
      ctx.fillStyle = '#071e5b';
      ctx.fillText('Namma Area.', 52, 122);
      const tagWidth = ctx.measureText('Namma Area.').width;
      ctx.fillStyle = '#ed0b55';
      ctx.fillText(' Namma Kadai.', 52 + tagWidth, 122);

      // ---------- 15 MIN DELIVERY BADGE + CLOCK ICON ----------
      const deliveryX = 760;
      const deliveryY = 29;
      const deliveryW = 270;
      const deliveryH = 100;
      drawRoundedBox(ctx, deliveryX, deliveryY, deliveryW, deliveryH, 27, '#ed0b55');

      // Clock icon.
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(deliveryX + 50, deliveryY + 50, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(deliveryX + 50, deliveryY + 50);
      ctx.lineTo(deliveryX + 50, deliveryY + 34);
      ctx.moveTo(deliveryX + 50, deliveryY + 50);
      ctx.lineTo(deliveryX + 63, deliveryY + 56);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(deliveryX + 12, deliveryY + 39);
      ctx.lineTo(deliveryX + 26, deliveryY + 39);
      ctx.moveTo(deliveryX + 8, deliveryY + 52);
      ctx.lineTo(deliveryX + 24, deliveryY + 52);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 29px Arial, sans-serif';
      ctx.fillText('15 MIN', deliveryX + 178, deliveryY + 43);
      ctx.font = '800 20px Arial, sans-serif';
      ctx.fillText('DELIVERY*', deliveryX + 178, deliveryY + 74);
      ctx.textAlign = 'left';

      // ---------- HERO PRODUCT IMAGE ----------
      // Fill the full hero region with the same photo as a soft background,
      // then place the COMPLETE product photo on top. This removes empty side bars
      // while keeping tall dress/keychain images fully visible.
      const imageX = 30;
      const imageY = 150;
      const imageW = 1020;
      const imageH = 700;

      ctx.save();
      roundedRectPath(ctx, imageX, imageY, imageW, imageH, 30);
      ctx.clip();

      // Background fill from product photo.
      ctx.filter = 'blur(22px) brightness(0.72) saturate(1.08)';
      drawImageCover(ctx, image, imageX - 28, imageY - 28, imageW + 56, imageH + 56);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      ctx.fillRect(imageX, imageY, imageW, imageH);

      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const sourceAspect = sourceWidth / Math.max(1, sourceHeight);

      if (sourceAspect < 1.05) {
        // Portrait products: show the entire source as large as possible.
        const innerX = imageX + 24;
        const innerY = imageY + 18;
        const innerW = imageW - 48;
        const innerH = imageH - 36;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.30)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 7;
        drawImageContain(ctx, image, innerX, innerY, innerW, innerH);
        ctx.restore();
      } else {
        // Landscape/square product photos can fill the whole hero frame.
        drawImageCover(ctx, image, imageX, imageY, imageW, imageH);
      }

      // Soft bottom gradient for a premium finish.
      const heroGradient = ctx.createLinearGradient(0, imageY + imageH - 150, 0, imageY + imageH);
      heroGradient.addColorStop(0, 'rgba(0,0,0,0)');
      heroGradient.addColorStop(1, 'rgba(0,0,0,.16)');
      ctx.fillStyle = heroGradient;
      ctx.fillRect(imageX, imageY + imageH - 150, imageW, 150);
      ctx.restore();

      // Thin brand outline.
      roundedRectPath(ctx, imageX, imageY, imageW, imageH, 30);
      ctx.strokeStyle = '#f3b2c8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ---------- PRODUCT NAME ----------
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = '700 25px Arial, sans-serif';
      const titleEndY = drawWrappedText(ctx, title, 48, 894, 980, 31, 2);

      // ---------- PRICE / MRP / OFF / OPTIONAL GIFT ----------
      const priceBaseY = Math.max(978, titleEndY + 35);
      ctx.fillStyle = '#ed0b55';
      ctx.font = '800 58px Arial, sans-serif';
      const priceText = price > 0 ? `₹${price}` : 'Price on request';
      ctx.fillText(priceText, 48, priceBaseY);

      let infoX = 245;
      const infoY = priceBaseY - 9;

      if (mrp > 0 && price > 0 && mrp > price) {
        ctx.fillStyle = '#667085';
        ctx.font = '700 22px Arial, sans-serif';
        ctx.fillText('MRP', infoX, infoY);
        infoX += ctx.measureText('MRP').width + 12;

        const mrpText = `₹${mrp}`;
        ctx.fillText(mrpText, infoX, infoY);
        const mrpW = ctx.measureText(mrpText).width;
        ctx.strokeStyle = '#667085';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(infoX - 2, infoY - 9);
        ctx.lineTo(infoX + mrpW + 2, infoY - 9);
        ctx.stroke();
        infoX += mrpW + 34;
      }

      if (discount) {
        drawRoundedBox(ctx, infoX, priceBaseY - 40, 118, 40, 10, '#fff0f5');
        ctx.fillStyle = '#ed0b55';
        ctx.font = '800 20px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(discount, infoX + 59, priceBaseY - 13);
        ctx.textAlign = 'left';
        infoX += 138;
      }

      // Gift is shown ONLY if an explicit gift count exists.
      if (giftCount > 0) {
        const giftText = `${giftCount} GIFT${giftCount === 1 ? '' : 'S'} INCLUDED`;
        const giftX = Math.max(720, infoX + 8);
        const giftY = priceBaseY - 47;
        const giftW = 305;
        const giftH = 54;
        drawRoundedBox(ctx, giftX, giftY, giftW, giftH, 14, '#eaf8ef', '#bce7cb', 1.3);

        // Gift icon.
        ctx.save();
        ctx.strokeStyle = '#179447';
        ctx.lineWidth = 4;
        ctx.strokeRect(giftX + 18, giftY + 21, 31, 22);
        ctx.beginPath();
        ctx.moveTo(giftX + 33.5, giftY + 19);
        ctx.lineTo(giftX + 33.5, giftY + 44);
        ctx.moveTo(giftX + 15, giftY + 20);
        ctx.lineTo(giftX + 52, giftY + 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(giftX + 27, giftY + 14, 8, 5, -0.6, 0, Math.PI * 2);
        ctx.ellipse(giftX + 40, giftY + 14, 8, 5, 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#127d3b';
        ctx.font = '800 19px Arial, sans-serif';
        ctx.fillText(giftText, giftX + 63, giftY + 34);
      }

      // ---------- DELIVERY AREAS ----------
      const dividerY = priceBaseY + 28;
      ctx.strokeStyle = '#ededed';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(48, dividerY);
      ctx.lineTo(1032, dividerY);
      ctx.stroke();

      const areaY = dividerY + 45;

      // Location pin icon.
      ctx.save();
      ctx.fillStyle = '#ed0b55';
      ctx.beginPath();
      ctx.arc(69, areaY - 8, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(57, areaY + 4);
      ctx.lineTo(69, areaY + 25);
      ctx.lineTo(81, areaY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(69, areaY - 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ed0b55';
      ctx.font = '800 20px Arial, sans-serif';
      ctx.fillText('DELIVERY AREAS', 100, areaY - 3);

      ctx.fillStyle = '#1f2937';
      ctx.font = '500 18px Arial, sans-serif';
      drawWrappedText(ctx, SPOTC_AREAS, 100, areaY + 25, 920, 24, 2);

      // ---------- ADDRESS ----------
      const addressY = areaY + 63;
      const addressH = 126;
      drawRoundedBox(ctx, 44, addressY, 992, addressH, 18, '#fafafa', '#e5e7eb', 1.2);

      // Address pin icon.
      ctx.save();
      ctx.fillStyle = '#ed0b55';
      ctx.beginPath();
      ctx.arc(73, addressY + 34, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(63, addressY + 44);
      ctx.lineTo(73, addressY + 62);
      ctx.lineTo(83, addressY + 44);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(73, addressY + 34, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ed0b55';
      ctx.font = '800 16px Arial, sans-serif';
      ctx.fillText('ADDRESS', 103, addressY + 28);

      ctx.fillStyle = '#2b2f36';
      ctx.font = '500 15px Arial, sans-serif';
      drawWrappedText(ctx, SPOTC_FULL_ADDRESS, 103, addressY + 54, 895, 21, 3);

      // ---------- SMALL WHATSAPP + WEBSITE ROW ----------
      const contactY = addressY + addressH + 18;

      // WhatsApp-style icon.
      ctx.save();
      ctx.fillStyle = '#18a74b';
      ctx.beginPath();
      ctx.arc(64, contactY + 20, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 19px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☎', 64, contactY + 27);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#159447';
      ctx.font = '800 14px Arial, sans-serif';
      ctx.fillText('WHATSAPP', 91, contactY + 12);
      ctx.fillStyle = '#252a31';
      ctx.font = '700 14px Arial, sans-serif';
      ctx.fillText(SPOTC_PHONE, 91, contactY + 32);

      // Website globe icon.
      ctx.save();
      ctx.strokeStyle = '#ed0b55';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(600, contactY + 20, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(600, contactY + 20, 8, 17, 0, 0, Math.PI * 2);
      ctx.moveTo(584, contactY + 20);
      ctx.lineTo(616, contactY + 20);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ed0b55';
      ctx.font = '800 14px Arial, sans-serif';
      ctx.fillText('WEBSITE', 627, contactY + 12);
      ctx.fillStyle = '#252a31';
      ctx.font = '700 14px Arial, sans-serif';
      ctx.fillText(SPOTC_WEBSITE, 627, contactY + 32);

      const dataUrl = canvas.toDataURL('image/png');
      const fileName = `${safeFilePart(title) || row.id}-spotc-poster.png`;

      setGeneratedPosters((current) => ({
        ...current,
        [row.id]: { dataUrl, fileName },
      }));
      setMessage('Poster generated. Preview and Download are now enabled.');
    } catch (error) {
      console.error('Poster generation failed:', error);
      setMessage(
        error instanceof Error
          ? `Poster generation failed: ${error.message}`
          : 'Poster generation failed.',
      );
    } finally {
      setGeneratingPosterId('');
    }
  }

  function downloadPoster(rowId: string) {
    const poster = generatedPosters[rowId];
    if (!poster) return;

    const link = document.createElement('a');
    link.href = poster.dataUrl;
    link.download = poster.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function clearFilters() {
    setSearch('');
    setCategoryFilter('all');
    setStockFilter('all');
    setStatusFilter('all');
    setGiftFilter('all');
    setLocationFilter('all');
    setSoldOnly(false);
    setReservedOnly(false);
    setSortBy('newest');
  }

  function resetSummaryFilters() {
    setSearch('');
    setCategoryFilter('all');
    setStockFilter('all');
    setStatusFilter('all');
    setGiftFilter('all');
    setLocationFilter('all');
    setSoldOnly(false);
    setReservedOnly(false);
    setSortBy('newest');
    setPage(1);
  }

  function showTotalProducts() {
    resetSummaryFilters();
  }

  function showActiveProducts() {
    resetSummaryFilters();
    setStatusFilter('active');
  }

  function showLowStockProducts() {
    resetSummaryFilters();
    setStockFilter('low_stock');
    setSortBy('stock_low');
  }

  function showOutOfStockProducts() {
    resetSummaryFilters();
    setStockFilter('out_of_stock');
    setSortBy('stock_low');
  }

  function showSoldProducts() {
    resetSummaryFilters();
    setSoldOnly(true);
    setSortBy('sold_high');
  }

  function showReservedProducts() {
    resetSummaryFilters();
    setReservedOnly(true);
  }

  function showFreeGiftProducts() {
    resetSummaryFilters();
    setGiftFilter('gift');
  }

  function showMissingLocationProducts() {
    resetSummaryFilters();
    setLocationFilter('missing');
  }

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 400 }}>Products</h1>
          <p style={{ margin: 0, color: '#666' }}>
            Manage products, pricing, stock and inventory locations.
          </p>
        </div>

        <div style={headerActions}>
          <button
            type="button"
            onClick={() => void refreshProducts()}
            disabled={refreshing}
            style={{
              ...secondaryButton,
              opacity: refreshing ? 0.55 : 1,
              cursor: refreshing ? 'wait' : 'pointer',
            }}
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>

          <button
            type="button"
            onClick={() => void optimizeNextOldImageBatch()}
            disabled={optimizingOldImages}
            style={{
              ...secondaryButton,
              opacity: optimizingOldImages ? 0.55 : 1,
              cursor: optimizingOldImages ? 'wait' : 'pointer',
            }}
          >
            {optimizingOldImages
              ? 'Optimizing 30…'
              : 'Optimize Next 30 Images'}
          </button>

          {failedOldImages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFailedOldImages([]);
                setShowOptimizeFailures(false);
                setOptimizeStatus(
                  'Failed-image skip list cleared. They can be retried now.',
                );
              }}
              disabled={optimizingOldImages}
              style={{
                ...secondaryButton,
                opacity: optimizingOldImages ? 0.55 : 1,
              }}
            >
              Retry Failed ({failedOldImages.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              window.location.href = '/admin/products/new';
            }}
            style={addButton}
          >
            + Add Product
          </button>
        </div>
      </div>

      {(optimizeStatus || optimizedImageCount > 0) && (
        <div
          style={{
            margin: '0 0 16px',
            padding: '12px 14px',
            border: '1px solid #e7dfd2',
            borderRadius: 12,
            background: '#fffaf2',
            color: '#5f4a2e',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <div>{optimizeStatus || `${optimizedImageCount} images optimized`}</div>

          {failedOldImages.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setShowOptimizeFailures((current) => !current)
              }
              style={{
                marginTop: 8,
                border: 0,
                padding: 0,
                background: 'transparent',
                color: '#9a4f00',
                fontWeight: 800,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showOptimizeFailures ? 'Hide' : 'Show'} failed image reasons
              {' '}({failedOldImages.length})
            </button>
          )}
        </div>
      )}

      {showOptimizeFailures && failedOldImages.length > 0 && (
        <div
          style={{
            margin: '0 0 16px',
            padding: 14,
            border: '1px solid #f2c7c7',
            borderRadius: 12,
            background: '#fff7f7',
            maxHeight: 260,
            overflow: 'auto',
          }}
        >
          {failedOldImages.map((item) => (
            <div
              key={item.key}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid #f2dddd',
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              <strong>{item.rowId}</strong> · {item.slot}
              <div style={{ color: '#b42318', fontWeight: 700 }}>
                {item.reason}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={summaryGrid}>
        <SummaryCard
          label="Total Products"
          value={summary.total}
          onClick={showTotalProducts}
          active={
            stockFilter === 'all' &&
            statusFilter === 'all' &&
            giftFilter === 'all' &&
            locationFilter === 'all' &&
            !soldOnly &&
            !reservedOnly
          }
        />

        <SummaryCard
          label="Active"
          value={summary.active}
          onClick={showActiveProducts}
          active={statusFilter === 'active'}
        />

        <SummaryCard
          label="Low Stock ≤ 2"
          value={summary.lowStock}
          danger={summary.lowStock > 0}
          onClick={showLowStockProducts}
          active={stockFilter === 'low_stock'}
        />

        <SummaryCard
          label="Out of Stock"
          value={summary.outStock}
          danger={summary.outStock > 0}
          onClick={showOutOfStockProducts}
          active={stockFilter === 'out_of_stock'}
        />

        <SummaryCard
          label="Units Sold"
          value={summary.unitsSold}
          onClick={showSoldProducts}
          active={soldOnly}
        />

        <SummaryCard
          label="Reserved"
          value={summary.reservedUnits}
          onClick={showReservedProducts}
          active={reservedOnly}
        />

        <SummaryCard
          label="Free Gifts"
          value={summary.gifts}
          onClick={showFreeGiftProducts}
          active={giftFilter === 'gift'}
        />

        <SummaryCard
          label="Location Missing"
          value={summary.missingLocation}
          warning={summary.missingLocation > 0}
          onClick={showMissingLocationProducts}
          active={locationFilter === 'missing'}
        />
      </div>

      <div style={controlsCard}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search product, SKU, QR, category, colour, rack, box…"
          style={searchInput}
        />

        {soldOnly && (
          <div style={activeFilterBanner}>
            Showing products with Sold Qty &gt; 0
            <button
              type="button"
              onClick={() => setSoldOnly(false)}
              style={activeFilterClear}
            >
              Clear
            </button>
          </div>
        )}

        {reservedOnly && (
          <div style={activeFilterBanner}>
            Showing products with Reserved Qty &gt; 0
            <button
              type="button"
              onClick={() => setReservedOnly(false)}
              style={activeFilterClear}
            >
              Clear
            </button>
          </div>
        )}

        <div style={filterGrid}>
          <SelectControl label="Category" value={categoryFilter} onChange={setCategoryFilter}>
            <option value="all">All Categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SelectControl>

          <SelectControl label="Stock" value={stockFilter} onChange={(value) => setStockFilter(value as StockFilter)}>
            <option value="all">All Stock</option>
            <option value="in_stock">In Stock &gt; 2</option>
            <option value="low_stock">Low Stock 1–2</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="attention">Low + Out of Stock</option>
          </SelectControl>

          <SelectControl label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </SelectControl>

          <SelectControl label="Free Gift" value={giftFilter} onChange={(value) => setGiftFilter(value as GiftFilter)}>
            <option value="all">All Products</option>
            <option value="gift">Free Gift Eligible</option>
            <option value="not_gift">Not Free Gift</option>
          </SelectControl>

          <SelectControl label="Location" value={locationFilter} onChange={(value) => setLocationFilter(value as LocationFilter)}>
            <option value="all">All Locations</option>
            <option value="set">Location Set</option>
            <option value="missing">Location Missing</option>
          </SelectControl>

          <SelectControl label="Sort" value={sortBy} onChange={(value) => setSortBy(value as SortOption)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_az">Name A–Z</option>
            <option value="name_za">Name Z–A</option>
            <option value="price_low">Price Low–High</option>
            <option value="price_high">Price High–Low</option>
            <option value="stock_low">Stock Low–High</option>
            <option value="stock_high">Stock High–Low</option>
            <option value="sold_high">Sold High–Low</option>
          </SelectControl>
        </div>

        <div style={filterFooter}>
          <div style={resultCount}>{filtered.length} matching product{filtered.length === 1 ? '' : 's'}</div>
          <button type="button" onClick={clearFilters} style={clearButton}>Clear Filters</button>
        </div>
      </div>

      {message && (
        <div style={messageBox}>
          {message}
          <button type="button" onClick={() => setMessage('')} style={messageClose}>×</button>
        </div>
      )}

      <div style={tableCard}>
        {loading ? (
          <div style={{ padding: 26 }}>Loading products…</div>
        ) : filtered.length === 0 ? (
          <div style={emptyState}>
            <div style={{ fontWeight: 400 }}>No matching products</div>
            <div style={{ color: '#777' }}>Try clearing some filters or add a new product.</div>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRow}>
                {['Product', 'Purchase', 'MRP', 'Sell', 'Offer', 'Stock', 'Sold', 'Location', 'Gift', 'Status', 'Poster', ''].map((heading) => (
                  <th key={heading} style={tableHeadCell}>{heading}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginated.map((row) => {
                const { id, data } = row;
                const image = productImage(data);
                const stock = stockOf(data);
                const reserved = reservedOf(data);
                const available = availableOf(data);
                const sold = soldOf(data);
                const mrp = mrpOf(data);
                const sellingPrice = sellingPriceOf(data);
                const offerPrice = offerPriceOf(data);
                const { rack, box, slot } = locationParts(data);
                const status = productStatus(data);
                const busy = busyId === id;
                const poster = generatedPosters[id];
                const generatingPoster = generatingPosterId === id;

                return (
                  <tr key={id} style={tableRow}>
                    <td style={productCell}>
                      <button type="button" onClick={() => openEdit(row)} style={productButton}>
                        {image ? (
                          <img src={image} alt="" style={productThumb} />
                        ) : (
                          <div style={productPlaceholder} />
                        )}
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                          <div style={productTitle}>{titleOf(data)}</div>
                          <div style={productMeta}>{categoryOf(data) || 'Uncategorised'}</div>
                          <div style={productId}>{id}</div>
                        </div>
                      </button>
                    </td>

                    <td style={priceCell}>
                      {Number(data.purchase_cost ?? 0) > 0
                        ? `₹${Number(data.purchase_cost)}`
                        : '—'}
                    </td>

                    <td style={priceCell}>{mrp > 0 ? `₹${mrp}` : '—'}</td>

                    <td style={priceCell}>
                      {sellingPrice > 0 ? `₹${sellingPrice}` : '—'}
                    </td>

                    <td style={priceCell}>
                      {automaticOfferOf(data) ? (
                        <span style={offerPriceBadge}>
                          {automaticOfferOf(data)}
                        </span>
                      ) : (
                        <span style={mutedText}>—</span>
                      )}
                    </td>

                    <td style={normalCell}>
                      <div style={stockControl}>
                        <button
                          type="button"
                          title="Reduce stock"
                          aria-label="Reduce stock"
                          disabled={busy || stock <= 0}
                          onClick={() => void adjustStock(row, -1)}
                          style={{ ...stockButton, opacity: busy || stock <= 0 ? 0.4 : 1 }}
                        >
                          −
                        </button>

                        <div>
                          <div
                            style={{
                              ...stockNumber,
                              color: available <= 2 ? '#b42318' : '#111',
                            }}
                            title={`Stock: ${stock}`}
                          >
                            {available}
                          </div>

                        </div>

                        <button
                          type="button"
                          title="Increase stock"
                          aria-label="Increase stock"
                          disabled={busy}
                          onClick={() => void adjustStock(row, 1)}
                          style={{ ...stockButton, opacity: busy ? 0.4 : 1 }}
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td style={normalCell}>
                      <span style={soldBadge}>{sold}</span>
                    </td>

                    <td style={normalCell}>
                      {rack || box || slot ? (
                        <div>
                          <div style={{ fontWeight: 400 }}>{rack || 'Rack —'}</div>
                          <div style={mutedText}>{[box, slot].filter(Boolean).join(' • ') || '—'}</div>
                        </div>
                      ) : (
                        <span style={missingLocation}>Location missing</span>
                      )}
                    </td>

                    <td style={normalCell}>
                      {data.free_gift_eligible === true ? <span style={giftBadge}>Gift</span> : <span style={mutedText}>—</span>}
                    </td>

                    <td style={normalCell}><StatusBadge status={status} /></td>

                    <td style={posterCell}>
                      <div style={posterActionRow}>
                        <button
                          type="button"
                          disabled={generatingPoster}
                          onClick={() => void generatePoster(row)}
                          style={{
                            ...posterGenerateButton,
                            opacity: generatingPoster ? 0.5 : 1,
                            cursor: generatingPoster ? 'wait' : 'pointer',
                          }}
                        >
                          {generatingPoster
                            ? 'Generating…'
                            : poster
                              ? 'Regenerate'
                              : 'Generate'}
                        </button>

                        <button
                          type="button"
                          disabled={!poster}
                          onClick={() => setPreviewPosterId(id)}
                          style={{
                            ...posterSecondaryButton,
                            opacity: poster ? 1 : 0.4,
                            cursor: poster ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Preview
                        </button>

                        <button
                          type="button"
                          disabled={!poster}
                          onClick={() => downloadPoster(id)}
                          style={{
                            ...posterDownloadButton,
                            opacity: poster ? 1 : 0.4,
                            cursor: poster ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Download
                        </button>
                      </div>
                    </td>

                    <td style={actionsCell}>
                      <div style={actionRow}>
                        <button
                          type="button"
                          title="Edit product"
                          aria-label="Edit product"
                          onClick={() => openEdit(row)}
                          style={iconEditButton}
                        >
                          ✎
                        </button>

                        <button
                          type="button"
                          title={data.isActive === false ? 'Activate product' : 'Hide product'}
                          aria-label={data.isActive === false ? 'Activate product' : 'Hide product'}
                          disabled={busy}
                          onClick={() => void toggleActive(row)}
                          style={{ ...iconActionButton, opacity: busy ? 0.45 : 1 }}
                        >
                          {data.isActive === false ? '◉' : '⊘'}
                        </button>

                        <button
                          type="button"
                          title="Delete product permanently"
                          aria-label="Delete product permanently"
                          disabled={busy}
                          onClick={() => void deleteProduct(row)}
                          style={{ ...iconDeleteButton, opacity: busy ? 0.45 : 1 }}
                        >
                          🗑
                        </button>
                      </div>
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
          <div style={paginationInfo}>Showing {pageStart}–{pageEnd} of {filtered.length}</div>
          <div style={paginationRight}>
            <label style={rowsLabel}>
              Rows
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number(event.target.value);
                  setPageSize(nextSize);
                  setPage(1);
                }}
                style={pageSizeSelect}
              >
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} style={{ ...pageButton, opacity: page <= 1 ? 0.4 : 1 }}>‹</button>
            <div style={pageNumber}>Page {page} of {totalPages}</div>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} style={{ ...pageButton, opacity: page >= totalPages ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      )}

      {previewPosterId && generatedPosters[previewPosterId] && (
        <div
          style={posterPreviewBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewPosterId('');
          }}
        >
          <div style={posterPreviewCard}>
            <div style={posterPreviewHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Product Poster Preview</div>
                <div style={{ color: '#777', fontSize: 12, marginTop: 3 }}>1080 × 1350 PNG</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPosterId('')}
                style={modalClose}
              >
                ×
              </button>
            </div>

            <div style={posterPreviewBody}>
              <img
                src={generatedPosters[previewPosterId].dataUrl}
                alt="Generated product poster preview"
                style={posterPreviewImage}
              />
            </div>

            <div style={posterPreviewFooter}>
              <button
                type="button"
                onClick={() => setPreviewPosterId('')}
                style={secondaryButton}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => downloadPoster(previewPosterId)}
                style={posterDownloadButton}
              >
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div style={modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
          <div style={modalCard}>
            <div style={modalHeader}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 400 }}>Edit Product</h2>
                <div style={mutedText}>{editing.id}</div>
              </div>
              <button type="button" onClick={closeEdit} disabled={savingEdit} style={modalClose}>×</button>
            </div>

            <div style={modalBody}>
              <input
                ref={editMediaInputRef}
                type="file"
                accept="image/*"
                onChange={handleEditMediaSelection}
                style={{ display: 'none' }}
              />

              <EditSection title="Product Media">
                <div style={editMediaHelp}>
                  Change only the media you want to replace. Existing media is
                  kept automatically when no new file is selected.
                </div>

                <div style={editMediaGrid}>
                  {MEDIA_SLOTS.map((item) => {
                    const replacement = editMediaChanges[item.slot];
                    const currentUrl = existingMediaUrl(
                      editing.data,
                      item.slot,
                    );

                    const previewUrl =
                      replacement?.previewUrl || currentUrl;

                    return (
                      <div key={item.slot} style={editMediaCard}>
                        <div style={editMediaCardTitle}>
                          {item.label}
                        </div>

                        <div style={editMediaPreviewWrap}>
                          {previewUrl ? (
                            item.kind === 'video' ? (
                              <video
                                src={previewUrl}
                                controls
                                muted
                                playsInline
                                style={editMediaPreview}
                              />
                            ) : (
                              <img
                                src={previewUrl}
                                alt={item.label}
                                style={editMediaPreview}
                              />
                            )
                          ) : (
                            <div style={editImagePlaceholder}>
                              No {item.kind}
                            </div>
                          )}
                        </div>

                        <div style={editMediaStatus}>
                          {replacement
                            ? 'New file selected'
                            : currentUrl
                              ? 'Current media'
                              : 'Not added'}
                        </div>

                        <div style={editMediaActions}>
                          <button
                            type="button"
                            onClick={() => chooseEditMedia(item.slot)}
                            disabled={savingEdit}
                            style={editMediaChangeButton}
                          >
                            {currentUrl || replacement
                              ? 'Change'
                              : 'Add'}
                          </button>

                          {replacement && (
                            <button
                              type="button"
                              onClick={() =>
                                removeEditMediaSelection(item.slot)
                              }
                              disabled={savingEdit}
                              style={editMediaCancelButton}
                            >
                              Cancel Change
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {editUploadStatus && (
                  <div style={editUploadNotice}>
                    {editUploadStatus}
                  </div>
                )}
              </EditSection>

              <EditSection title="Basic Details">
                <div style={editGrid3}>
                  <EditField
                    label="Product Name"
                    value={editForm.title}
                    onChange={(value) => updateEditField('title', value)}
                  />

                  <EditField
                    label="Brand"
                    value={editForm.brand}
                    onChange={(value) => updateEditField('brand', value)}
                  />

                  <label>
                    <span style={modalLabel}>Main Category</span>
                    <select
                      value={editForm.mainCategory}
                      onChange={(event) =>
                        changeEditMainCategory(event.target.value)
                      }
                      style={modalInput}
                    >
                      <option value="">
                        {categoriesLoading
                          ? 'Loading categories…'
                          : 'Select main category'}
                      </option>

                      {editMainCategoryOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span style={modalLabel}>Sub Category / Age Group</span>
                    <select
                      value={editForm.subCategory}
                      onChange={(event) =>
                        updateEditField('subCategory', event.target.value)
                      }
                      style={modalInput}
                      disabled={!editForm.mainCategory}
                    >
                      <option value="">
                        {editForm.mainCategory
                          ? 'Select sub category'
                          : 'Select main category first'}
                      </option>

                      {editSubCategoryOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <EditField
                    label="Child Category"
                    value={editForm.childCategory}
                    onChange={(value) => updateEditField('childCategory', value)}
                  />

                  <EditField
                    label="Colour"
                    value={editForm.color}
                    onChange={(value) => updateEditField('color', value)}
                  />

                  <EditField
                    label="Second Colour"
                    value={editForm.secondaryColor}
                    onChange={(value) => updateEditField('secondaryColor', value)}
                  />

                  {isEditingGirlDress ? (
                    <>
                      <label>
                        <span style={modalLabel}>Dress Type</span>
                        <select
                          value={editForm.dressType}
                          onChange={(event) =>
                            updateEditField('dressType', event.target.value)
                          }
                          style={modalInput}
                        >
                          <option value="">Select dress type</option>
                          <option value="Frock">Frock</option>
                          <option value="Party Dress">Party Dress</option>
                          <option value="Gown">Gown</option>
                          <option value="Top & Skirt Set">Top & Skirt Set</option>
                          <option value="Lehenga">Lehenga</option>
                          <option value="Kurti Set">Kurti Set</option>
                          <option value="Casual Dress">Casual Dress</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>

                      <EditField
                        label="Available Sizes"
                        value={editForm.availableSizes}
                        onChange={(value) =>
                          updateEditField('availableSizes', value)
                        }
                        placeholder="Example: 18, 20, 22"
                      />

                      <label>
                        <span style={modalLabel}>Set Type</span>
                        <select
                          value={editForm.setType}
                          onChange={(event) =>
                            updateEditField('setType', event.target.value)
                          }
                          style={modalInput}
                        >
                          <option value="1 Piece">1 Piece</option>
                          <option value="2 Piece">2 Piece</option>
                          <option value="3 Piece">3 Piece</option>
                        </select>
                      </label>

                      {editForm.setType === '1 Piece' ? (
                        <>
                          <EditField
                            label="Dress / Garment Length"
                            value={editForm.dressLength}
                            onChange={(value) =>
                              updateEditField('dressLength', value)
                            }
                            placeholder="Example: 21 inch"
                          />
                          <EditField
                            label="Chest"
                            value={editForm.chestSize}
                            onChange={(value) =>
                              updateEditField('chestSize', value)
                            }
                            placeholder="Example: 24 inch"
                          />
                          <EditField
                            label="Waist"
                            value={editForm.waistSize}
                            onChange={(value) =>
                              updateEditField('waistSize', value)
                            }
                            placeholder="Example: 22 inch"
                          />
                          <EditField
                            label="Shoulder"
                            value={editForm.shoulderSize}
                            onChange={(value) =>
                              updateEditField('shoulderSize', value)
                            }
                            placeholder="Example: 9 inch"
                          />
                          <EditField
                            label="Sleeve Length"
                            value={editForm.sleeveLength}
                            onChange={(value) =>
                              updateEditField('sleeveLength', value)
                            }
                            placeholder="Example: 5 inch or Sleeveless"
                          />
                        </>
                      ) : (
                        <>
                          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                            <div style={editMeasurementTitle}>
                              TOP / T-SHIRT MEASUREMENTS
                            </div>
                          </div>

                          <label>
                            <span style={modalLabel}>Top Type</span>
                            <select
                              value={editForm.topType}
                              onChange={(event) =>
                                updateEditField('topType', event.target.value)
                              }
                              style={modalInput}
                            >
                              <option value="T-Shirt">T-Shirt</option>
                              <option value="Shirt">Shirt</option>
                              <option value="Top">Top</option>
                              <option value="Kurti">Kurti</option>
                              <option value="Blouse">Blouse</option>
                              <option value="Other">Other</option>
                            </select>
                          </label>

                          <EditField
                            label="Top Chest"
                            value={editForm.topChest}
                            onChange={(value) =>
                              updateEditField('topChest', value)
                            }
                            placeholder="Example: 24 inch"
                          />
                          <EditField
                            label="Top Length"
                            value={editForm.topLength}
                            onChange={(value) =>
                              updateEditField('topLength', value)
                            }
                            placeholder="Example: 16 inch"
                          />
                          <EditField
                            label="Top Shoulder"
                            value={editForm.topShoulder}
                            onChange={(value) =>
                              updateEditField('topShoulder', value)
                            }
                            placeholder="Example: 9 inch"
                          />
                          <EditField
                            label="Top Sleeve Length"
                            value={editForm.topSleeve}
                            onChange={(value) =>
                              updateEditField('topSleeve', value)
                            }
                            placeholder="Example: 5 inch or Sleeveless"
                          />

                          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                            <div style={editMeasurementTitle}>
                              BOTTOM / PANT MEASUREMENTS
                            </div>
                          </div>

                          <label>
                            <span style={modalLabel}>Bottom Type</span>
                            <select
                              value={editForm.bottomType}
                              onChange={(event) =>
                                updateEditField('bottomType', event.target.value)
                              }
                              style={modalInput}
                            >
                              <option value="Pant / Shorts">Pant / Shorts</option>
                              <option value="Pant">Pant</option>
                              <option value="Shorts">Shorts</option>
                              <option value="Skirt">Skirt</option>
                              <option value="Leggings">Leggings</option>
                              <option value="Dhoti">Dhoti</option>
                              <option value="Other">Other</option>
                            </select>
                          </label>

                          <EditField
                            label="Bottom Waist"
                            value={editForm.bottomWaist}
                            onChange={(value) =>
                              updateEditField('bottomWaist', value)
                            }
                            placeholder="Example: 18 inch"
                          />
                          <EditField
                            label="Max Stretch Waist"
                            value={editForm.bottomMaxWaist}
                            onChange={(value) =>
                              updateEditField('bottomMaxWaist', value)
                            }
                            placeholder="Example: 22 inch"
                          />
                          <EditField
                            label="Hip"
                            value={editForm.bottomHip}
                            onChange={(value) =>
                              updateEditField('bottomHip', value)
                            }
                            placeholder="Example: 24 inch"
                          />
                          <EditField
                            label="Bottom Length"
                            value={editForm.bottomLength}
                            onChange={(value) =>
                              updateEditField('bottomLength', value)
                            }
                            placeholder="Example: 12 inch"
                          />
                          <EditField
                            label="Inseam"
                            value={editForm.bottomInseam}
                            onChange={(value) =>
                              updateEditField('bottomInseam', value)
                            }
                            placeholder="Example: 4 inch"
                          />

                          {editForm.setType === '3 Piece' && (
                            <>
                              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                                <div style={editMeasurementTitle}>
                                  THIRD PIECE MEASUREMENTS
                                </div>
                              </div>

                              <label>
                                <span style={modalLabel}>Third Piece Type</span>
                                <select
                                  value={editForm.thirdPieceType}
                                  onChange={(event) =>
                                    updateEditField(
                                      'thirdPieceType',
                                      event.target.value,
                                    )
                                  }
                                  style={modalInput}
                                >
                                  <option value="">Select third piece</option>
                                  <option value="Jacket">Jacket</option>
                                  <option value="Shrug">Shrug</option>
                                  <option value="Vest">Vest</option>
                                  <option value="Dupatta">Dupatta</option>
                                  <option value="Other">Other</option>
                                </select>
                              </label>

                              <EditField
                                label="Third Piece Chest"
                                value={editForm.thirdPieceChest}
                                onChange={(value) =>
                                  updateEditField('thirdPieceChest', value)
                                }
                                placeholder="Optional"
                              />
                              <EditField
                                label="Third Piece Waist"
                                value={editForm.thirdPieceWaist}
                                onChange={(value) =>
                                  updateEditField('thirdPieceWaist', value)
                                }
                                placeholder="Optional"
                              />
                              <EditField
                                label="Third Piece Length"
                                value={editForm.thirdPieceLength}
                                onChange={(value) =>
                                  updateEditField('thirdPieceLength', value)
                                }
                                placeholder="Example: 14 inch"
                              />
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <EditField
                      label="Size"
                      value={editForm.size}
                      onChange={(value) => updateEditField('size', value)}
                    />
                  )}

                  <EditField
                    label="Material / Fabric"
                    value={editForm.material}
                    onChange={(value) => updateEditField('material', value)}
                  />

                  <EditField
                    label="Pattern / Style"
                    value={editForm.pattern}
                    onChange={(value) => updateEditField('pattern', value)}
                  />

                  <EditField
                    label="Gender / Audience"
                    value={editForm.gender}
                    onChange={(value) => updateEditField('gender', value)}
                  />
                </div>

                {isEditingGirlDress && (
                  <div
                    style={{
                      marginTop: 12,
                      marginBottom: 14,
                      padding: '10px 12px',
                      border: '1px solid #d8eadf',
                      borderRadius: 10,
                      background: '#f3fbf6',
                      color: '#27643f',
                      fontSize: 12,
                    }}
                  >
                    Age Group is taken from Sub Category. Select 1 Piece, 2 Piece or
                    3 Piece and enter the actual garment measurements in inches. For
                    2/3 piece sets, enter Top and Bottom separately.
                  </div>
                )}

                <label style={modalLabel}>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    updateEditField('description', event.target.value)
                  }
                  rows={4}
                  style={{ ...modalInput, resize: 'vertical' }}
                />
              </EditSection>

              <EditSection title="Pricing">
                <div style={editGrid3}>
                  <EditField
                    label="Purchase Cost"
                    value={editForm.purchaseCost}
                    type="number"
                    onChange={(value) =>
                      updateEditField('purchaseCost', value)
                    }
                  />

                  <EditField
                    label="MRP"
                    value={editForm.mrp}
                    type="number"
                    onChange={(value) =>
                      updateEditField('mrp', value)
                    }
                  />

                  <EditField
                    label="Selling Price"
                    value={editForm.sellingPrice}
                    type="number"
                    onChange={(value) =>
                      updateEditField('sellingPrice', value)
                    }
                  />

                  <label>
                    <span style={modalLabel}>Offer</span>
                    <input
                      value={(() => {
                        const mrp = money(editForm.mrp);
                        const price = money(editForm.sellingPrice);

                        if (mrp <= 0 || price <= 0 || price >= mrp) {
                          return '';
                        }

                        return `${Math.round(
                          ((mrp - price) / mrp) * 100,
                        )}% OFF`;
                      })()}
                      readOnly
                      placeholder="Auto calculated"
                      style={{
                        ...modalInput,
                        background: '#f7f7f7',
                        color: '#9a5300',
                        fontWeight: 600,
                      }}
                    />
                  </label>
                </div>
              </EditSection>

              <EditSection title="Inventory">
                <div style={editGrid3}>
                  <EditField label="Stock Quantity" value={editForm.stockQty} type="number" onChange={(value) => updateEditField('stockQty', value)} />
                  <EditField label="Rack" value={editForm.rack} onChange={(value) => updateEditField('rack', value)} />
                  <EditField label="Box" value={editForm.box} onChange={(value) => updateEditField('box', value)} />
                  <EditField label="Slot" value={editForm.slot} onChange={(value) => updateEditField('slot', value)} />
                </div>

                <div style={inventoryInfoGrid}>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Reserved</span>
                    <span>{reservedOf(editing.data)}</span>
                  </div>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Available</span>
                    <span>
                      {Math.max(
                        0,
                        (Number.parseInt(editForm.stockQty || '0', 10) || 0) -
                          reservedOf(editing.data),
                      )}
                    </span>
                  </div>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Sold</span>
                    <span>{soldOf(editing.data)}</span>
                  </div>
                </div>

                <div style={inventoryNote}>
                  Sold is updated from completed/delivered orders.
                  Manual stock + / − does not change Sold.
                </div>
              </EditSection>

              <EditSection title="Free Gift & Status">
                <div style={checkboxGrid}>
                  <label style={checkRow}><input type="checkbox" checked={editForm.freeGiftEligible} onChange={(event) => updateEditField('freeGiftEligible', event.target.checked)} /> Free Gift Eligible</label>
                  <label style={checkRow}><input type="checkbox" checked={editForm.isActive} onChange={(event) => updateEditField('isActive', event.target.checked)} /> Active and visible in Shop</label>
                </div>

                {editForm.freeGiftEligible && (
                  <div style={{ marginTop: 14, maxWidth: 300 }}>
                    <EditField label="Gift Cost / Value" value={editForm.freeGiftValue} type="number" onChange={(value) => updateEditField('freeGiftValue', value)} />
                  </div>
                )}
              </EditSection>
            </div>

            <div style={modalFooter}>
              <button
                type="button"
                onClick={() => void deleteProduct(editing)}
                disabled={savingEdit || busyId === editing.id}
                style={{
                  ...modalDeleteButton,
                  opacity:
                    savingEdit || busyId === editing.id
                      ? 0.5
                      : 1,
                }}
              >
                {busyId === editing.id
                  ? 'Deleting…'
                  : 'Delete Product'}
              </button>

              <div style={modalFooterRight}>
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={savingEdit || busyId === editing.id}
                  style={secondaryButton}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={savingEdit || busyId === editing.id}
                  style={{
                    ...modalSaveButton,
                    opacity:
                      savingEdit || busyId === editing.id
                        ? 0.55
                        : 1,
                  }}
                >
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
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
  danger = false,
  warning = false,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  danger?: boolean;
  warning?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCard,
        ...(active ? summaryCardActive : {}),
      }}
      aria-label={`Filter products by ${label}`}
    >
      <div style={summaryLabel}>{label}</div>
      <div
        style={{
          ...summaryValue,
          color: danger
            ? '#b42318'
            : warning
              ? '#b36b00'
              : '#111',
        }}
      >
        {value}
      </div>
    </button>
  );
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label style={selectWrap}>
      <span style={filterLabel}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={filterSelect}>{children}</select>
    </label>
  );
}

function StatusBadge({ status }: { status: 'Hidden' | 'Out of stock' | 'Active' }) {
  return <span style={status === 'Active' ? activeBadge : status === 'Hidden' ? hiddenBadge : outBadge}>{status}</span>;
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={editSection}><h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 400 }}>{title}</h3>{children}</section>;
}

function EditField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <span style={modalLabel}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={modalInput}
      />
    </label>
  );
}

const pageHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' };
const headerActions: React.CSSProperties = { display: 'flex', gap: 9, flexWrap: 'wrap' };
const addButton: React.CSSProperties = { border: 0, background: '#111', color: 'white', textDecoration: 'none', fontWeight: 400, padding: '12px 18px', borderRadius: 12, cursor: 'pointer', fontSize: 14 };
const secondaryButton: React.CSSProperties = { border: '1px solid #dcdcdc', background: '#fff', color: '#222', fontWeight: 400, padding: '10px 14px', borderRadius: 10, cursor: 'pointer' };
const summaryGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '22px 0' };
const summaryCard: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'white',
  padding: 16,
  border: '1px solid #e8e8e8',
  borderRadius: 14,
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
  transition: 'border-color .15s ease, box-shadow .15s ease, transform .15s ease',
};

const summaryCardActive: React.CSSProperties = {
  borderColor: '#d68a2c',
  boxShadow: '0 0 0 2px rgba(214,138,44,.12)',
};
const summaryLabel: React.CSSProperties = { fontSize: 12, color: '#777', fontWeight: 400 };
const summaryValue: React.CSSProperties = { fontSize: 26, fontWeight: 400, marginTop: 4 };
const controlsCard: React.CSSProperties = { background: '#fff', border: '1px solid #e7e7e7', borderRadius: 16, padding: 14, marginBottom: 16 };
const searchInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '13px 15px', border: '1px solid #ddd', borderRadius: 12, fontSize: 15, marginBottom: 12, outline: 'none' };
const activeFilterBanner: React.CSSProperties = {
  marginBottom: 10,
  padding: '8px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  border: '1px solid #d9e8dc',
  borderRadius: 9,
  background: '#f4faf5',
  color: '#347048',
  fontSize: 11,
};

const activeFilterClear: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#9b5d00',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const filterGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 };
const selectWrap: React.CSSProperties = { display: 'grid', gap: 5 };
const filterLabel: React.CSSProperties = { fontSize: 11, color: '#666', fontWeight: 400 };
const filterSelect: React.CSSProperties = { width: '100%', minWidth: 0, padding: '10px 11px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', fontWeight: 400 };
const filterFooter: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
const resultCount: React.CSSProperties = { fontSize: 12, color: '#666', fontWeight: 400 };
const clearButton: React.CSSProperties = { border: 0, background: 'transparent', color: '#555', fontWeight: 400, cursor: 'pointer' };
const messageBox: React.CSSProperties = { position: 'relative', marginBottom: 14, padding: '12px 44px 12px 14px', border: '1px solid #f0d69a', background: '#fff8e7', borderRadius: 12, fontWeight: 400 };
const messageClose: React.CSSProperties = { position: 'absolute', right: 10, top: 6, border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer' };
const tableCard: React.CSSProperties = { background: 'white', border: '1px solid #e7e7e7', borderRadius: 16, overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 1610 };
const tableHeadRow: React.CSSProperties = { textAlign: 'left', background: '#fafafa' };
const tableHeadCell: React.CSSProperties = { padding: 13, borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap' };
const tableRow: React.CSSProperties = { borderBottom: '1px solid #f0f0f0' };
const normalCell: React.CSSProperties = { padding: 12, fontSize: 13, verticalAlign: 'middle' };
const priceCell: React.CSSProperties = { padding: 10, fontSize: 13, verticalAlign: 'middle', whiteSpace: 'nowrap' };
const offerPriceBadge: React.CSSProperties = { display: 'inline-flex', padding: '4px 7px', background: '#fff2df', color: '#9a5300', borderRadius: 7, fontSize: 12, fontWeight: 400 };
const soldBadge: React.CSSProperties = { display: 'inline-flex', minWidth: 26, justifyContent: 'center', padding: '4px 7px', background: '#eef3ff', color: '#3157a4', borderRadius: 7, fontSize: 12, fontWeight: 400 };
const stockSubText: React.CSSProperties = { marginTop: 2, fontSize: 9, color: '#999', whiteSpace: 'nowrap', textAlign: 'center' };
const productCell: React.CSSProperties = { padding: 12, verticalAlign: 'middle', minWidth: 340 };
const productButton: React.CSSProperties = { border: 0, background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', width: '100%', color: 'inherit' };
const productThumb: React.CSSProperties = { width: 56, height: 56, minWidth: 56, objectFit: 'contain', borderRadius: 10, background: '#eee' };
const productPlaceholder: React.CSSProperties = { width: 56, height: 56, minWidth: 56, borderRadius: 10, background: '#eee' };
const productTitle: React.CSSProperties = { fontWeight: 400, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 };
const productMeta: React.CSSProperties = { fontSize: 12, color: '#777', marginTop: 2 };
const productId: React.CSSProperties = { fontSize: 10, color: '#aaa', marginTop: 2 };
const mutedText: React.CSSProperties = { color: '#777', fontSize: 12 };
const stockControl: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const stockButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #ddd', borderRadius: 8, background: '#fff', fontWeight: 400, fontSize: 18, cursor: 'pointer' };
const stockNumber: React.CSSProperties = { width: 32, textAlign: 'center', fontWeight: 400, fontSize: 15 };
const missingLocation: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#fff1e5', color: '#a34a00', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const giftBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#f0f8e8', color: '#397a0d', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const activeBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#ecf8ef', color: '#137333', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const hiddenBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#efefef', color: '#666', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const outBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#fff0f0', color: '#b42318', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const posterCell: React.CSSProperties = { padding: 8, width: 250, minWidth: 250 };
const posterActionRow: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };
const posterGenerateButton: React.CSSProperties = { border: 0, background: '#111', color: '#fff', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const posterSecondaryButton: React.CSSProperties = { border: '1px solid #d7d7d7', background: '#fff', color: '#222', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const posterDownloadButton: React.CSSProperties = { border: 0, background: '#0f9d58', color: '#fff', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' };
const actionsCell: React.CSSProperties = { padding: 8, width: 112, minWidth: 112 };
const actionRow: React.CSSProperties = { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'nowrap' };
const iconEditButton: React.CSSProperties = { width: 30, height: 30, border: 0, background: '#111', color: '#fff', borderRadius: 8, fontSize: 17, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const iconActionButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #ddd', background: '#fff', color: '#222', borderRadius: 8, fontSize: 16, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const iconDeleteButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #f1c0bd', background: '#fff7f6', color: '#b42318', borderRadius: 8, fontSize: 14, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const emptyState: React.CSSProperties = { padding: 40, display: 'grid', placeItems: 'center', gap: 6 };
const paginationBar: React.CSSProperties = { marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
const paginationInfo: React.CSSProperties = { fontSize: 13, color: '#666', fontWeight: 400 };
const paginationRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const rowsLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 400, color: '#666' };
const pageSizeSelect: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 8, padding: '7px 8px', background: '#fff', fontWeight: 400 };
const pageButton: React.CSSProperties = { width: 34, height: 34, border: '1px solid #ddd', borderRadius: 9, background: '#fff', fontSize: 20, fontWeight: 400, cursor: 'pointer' };
const pageNumber: React.CSSProperties = { minWidth: 100, textAlign: 'center', fontSize: 12, fontWeight: 400 };
const posterPreviewBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.62)', zIndex: 1200, display: 'grid', placeItems: 'center', padding: 18 };
const posterPreviewCard: React.CSSProperties = { width: 'min(620px, 100%)', maxHeight: '94vh', background: '#fff', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.28)' };
const posterPreviewHeader: React.CSSProperties = { padding: '14px 16px', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
const posterPreviewBody: React.CSSProperties = { padding: 14, background: '#f3f4f6', overflowY: 'auto', display: 'grid', placeItems: 'center' };
const posterPreviewImage: React.CSSProperties = { display: 'block', width: '100%', maxWidth: 540, height: 'auto', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.14)' };
const posterPreviewFooter: React.CSSProperties = { padding: 14, borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'flex-end', gap: 10 };
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 };
const modalCard: React.CSSProperties = { width: 'min(980px, 100%)', maxHeight: '92vh', background: '#f6f7f9', borderRadius: 20, boxShadow: '0 25px 80px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const modalHeader: React.CSSProperties = { background: '#fff', borderBottom: '1px solid #e7e7e7', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 };
const modalClose: React.CSSProperties = { border: 0, background: '#f2f2f2', width: 36, height: 36, borderRadius: 10, fontSize: 22, cursor: 'pointer' };
const modalBody: React.CSSProperties = { overflowY: 'auto', padding: 18 };
const modalFooter: React.CSSProperties = { background: '#fff', borderTop: '1px solid #e7e7e7', padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const modalFooterRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' };
const modalDeleteButton: React.CSSProperties = { border: '1px solid #efb7b3', background: '#fff1f0', color: '#b42318', padding: '11px 16px', borderRadius: 10, fontWeight: 500, cursor: 'pointer' };
const modalSaveButton: React.CSSProperties = { border: 0, background: '#111', color: '#fff', padding: '11px 18px', borderRadius: 10, fontWeight: 400, cursor: 'pointer' };
const editMediaHelp: React.CSSProperties = { marginBottom: 14, color: '#666', fontSize: 12, lineHeight: 1.45 };
const editMediaGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 };
const editMediaCard: React.CSSProperties = { minWidth: 0, padding: 10, border: '1px solid #e5e5e5', borderRadius: 12, background: '#fafafa' };
const editMediaCardTitle: React.CSSProperties = { marginBottom: 8, fontSize: 12, fontWeight: 500, color: '#222' };
const editMediaPreviewWrap: React.CSSProperties = { width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 10, background: '#eee' };
const editMediaPreview: React.CSSProperties = { width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: '#eee' };
const editImagePlaceholder: React.CSSProperties = { width: '100%', height: '100%', minHeight: 110, display: 'grid', placeItems: 'center', borderRadius: 10, background: '#eee', color: '#777', fontSize: 12 };
const editMediaStatus: React.CSSProperties = { marginTop: 7, color: '#777', fontSize: 10 };
const editMediaActions: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 };
const editMediaChangeButton: React.CSSProperties = { border: 0, background: '#111', color: '#fff', padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: 'pointer' };
const editMediaCancelButton: React.CSSProperties = { border: '1px solid #ddd', background: '#fff', color: '#555', padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 400, cursor: 'pointer' };
const editUploadNotice: React.CSSProperties = { marginTop: 12, padding: 10, borderRadius: 9, background: '#fff7e8', border: '1px solid #f2d8a5', fontSize: 12, fontWeight: 500 };
const editSection: React.CSSProperties = { background: '#fff', border: '1px solid #e7e7e7', borderRadius: 14, padding: 16, marginBottom: 14 };
const editGrid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, marginBottom: 12 };
const editMeasurementTitle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #e4e4e4', borderRadius: 9, background: '#f7f7f7', fontSize: 11, fontWeight: 700, color: '#333' };
const modalLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: '#555', fontWeight: 400, marginBottom: 5 };
const modalInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #ddd', borderRadius: 9, fontSize: 14, outline: 'none', background: '#fff' };
const inventoryInfoGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(100px,1fr))', gap: 10, marginTop: 4 };
const inventoryInfoCard: React.CSSProperties = { display: 'grid', gap: 3, padding: 10, borderRadius: 9, background: '#f7f7f7', fontSize: 14, fontWeight: 400 };
const inventoryNote: React.CSSProperties = { marginTop: 10, fontSize: 11, color: '#777', lineHeight: 1.45 };
const checkboxGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 };
const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 };