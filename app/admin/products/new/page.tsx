'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import {
  ChangeEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import { auth, db } from '@/lib/firebase';

type SlotKey =
  | 'ai_main'
  | 'real_front'
  | 'real_back'
  | 'detail'
  | 'product_video';

type MediaKind = 'image' | 'video';

type MediaAsset = {
  id: string;
  file: File;
  previewUrl: string;
  kind: MediaKind;
  slot: SlotKey;
};

type UploadResult = {
  uploadUrl: string;
  publicUrl: string;
};

const SLOT_OPTIONS: Array<{
  value: SlotKey;
  label: string;
  kind: MediaKind;
}> = [
  { value: 'ai_main', label: 'AI Main Image', kind: 'image' },
  { value: 'real_front', label: 'Real Front', kind: 'image' },
  { value: 'real_back', label: 'Real Back', kind: 'image' },
  { value: 'detail', label: 'Detail Image', kind: 'image' },
  { value: 'product_video', label: 'Product Video', kind: 'video' },
];

const IMAGE_SLOTS: SlotKey[] = [
  'ai_main',
  'real_front',
  'real_back',
  'detail',
];

const IDENTIFY_WORKER_URL =
  'https://spotc-ai-product-studio.tinydot09.workers.dev/identify';

function money(value: string) {
  return Number(value.replace(/[^0-9.]/g, '')) || 0;
}

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

function extensionFor(file: File) {
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

function safeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export default function NewProductPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  const [form, setForm] = useState({
    title: '',
    brand: '',

    mainCategory: '',
    subCategory: '',
    childCategory: '',

    description: '',
    highlights: '',
    tags: '',

    color: '',
    secondaryColor: '',
    size: '',
    material: '',
    pattern: '',
    gender: '',
    ageGroup: '',

    purchaseCost: '',
    mrp: '',
    sellingPrice: '',
    offerPrice: '',

    sku: '',
    qrCode: '',

    stockQty: '',
    rack: '',
    box: '',
    slot: '',

    freeGiftEligible: false,
    freeGiftValue: '',

    isActive: true,
  });

  function updateField(
    field: keyof typeof form,
    value: string | boolean,
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  const finalPrice = useMemo(() => {
    const offer = money(form.offerPrice);
    const selling = money(form.sellingPrice);

    return offer > 0 ? offer : selling;
  }, [form.offerPrice, form.sellingPrice]);

  const discount = useMemo(() => {
    const mrp = money(form.mrp);

    if (mrp <= 0 || finalPrice <= 0 || mrp <= finalPrice) {
      return '';
    }

    return `${Math.round(((mrp - finalPrice) / mrp) * 100)}% OFF`;
  }, [form.mrp, finalPrice]);

  const slotMap = useMemo(() => {
    const result = new Map<SlotKey, MediaAsset>();

    mediaAssets.forEach((asset) => {
      result.set(asset.slot, asset);
    });

    return result;
  }, [mediaAssets]);

  function chooseFiles() {
    fileInputRef.current?.click();
  }

  function handleBulkMediaSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const picked = Array.from(event.target.files ?? []);

    // Allow selecting the same files again after removing them.
    event.target.value = '';

    if (picked.length === 0) {
      return;
    }

    const supported = picked.filter(
      (file) =>
        file.type.startsWith('image/') ||
        file.type.startsWith('video/'),
    );

    if (supported.length === 0) {
      setMessage('Please select image or video files.');
      return;
    }

    const occupiedSlots = new Set(
      mediaAssets.map((asset) => asset.slot),
    );

    const nextAssets: MediaAsset[] = [];
    let skippedImages = 0;
    let skippedVideos = 0;
    let skippedUnsupported = picked.length - supported.length;

    for (const file of supported) {
      const kind: MediaKind = file.type.startsWith('video/')
        ? 'video'
        : 'image';

      let targetSlot: SlotKey | undefined;

      if (kind === 'video') {
        if (!occupiedSlots.has('product_video')) {
          targetSlot = 'product_video';
        } else {
          skippedVideos += 1;
          continue;
        }
      } else {
        targetSlot = IMAGE_SLOTS.find(
          (slot) => !occupiedSlots.has(slot),
        );

        if (!targetSlot) {
          skippedImages += 1;
          continue;
        }
      }

      occupiedSlots.add(targetSlot);

      nextAssets.push({
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind,
        slot: targetSlot,
      });
    }

    if (nextAssets.length === 0) {
      setMessage(
        'No media was added. Maximum is 4 images + 1 optional video.',
      );
      return;
    }

    setMediaAssets((prev) => [...prev, ...nextAssets]);

    const skippedParts: string[] = [];

    if (skippedImages > 0) {
      skippedParts.push(`${skippedImages} extra image(s) skipped`);
    }

    if (skippedVideos > 0) {
      skippedParts.push(`${skippedVideos} extra video(s) skipped`);
    }

    if (skippedUnsupported > 0) {
      skippedParts.push(
        `${skippedUnsupported} unsupported file(s) skipped`,
      );
    }

    if (skippedParts.length > 0) {
      setMessage(
        `${nextAssets.length} media file(s) added. ${skippedParts.join(
          ', ',
        )}.`,
      );
    } else {
      setMessage(`${nextAssets.length} media file(s) added.`);
    }
  }

  function removeMedia(id: string) {
    setMediaAssets((prev) => {
      const removed = prev.find((asset) => asset.id === id);

      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return prev.filter((asset) => asset.id !== id);
    });
  }

  function changeMediaSlot(id: string, nextSlot: SlotKey) {
    setMediaAssets((prev) => {
      const current = prev.find((asset) => asset.id === id);
      if (!current || current.slot === nextSlot) return prev;

      const targetSlotConfig = SLOT_OPTIONS.find(
        (option) => option.value === nextSlot,
      );

      if (!targetSlotConfig || targetSlotConfig.kind !== current.kind) {
        return prev;
      }

      const other = prev.find(
        (asset) => asset.id !== id && asset.slot === nextSlot,
      );

      return prev.map((asset) => {
        if (asset.id === id) {
          return {
            ...asset,
            slot: nextSlot,
          };
        }

        if (other && asset.id === other.id) {
          return {
            ...asset,
            slot: current.slot,
          };
        }

        return asset;
      });
    });
  }

  function applyAiProductDetails(response: Record<string, unknown>) {
    const rawDetails =
      response.productDetails ??
      response.product_details ??
      response;

    if (!rawDetails || typeof rawDetails !== 'object') {
      throw new Error('AI response did not contain product details.');
    }

    const details = rawDetails as Record<string, unknown>;

    const firstValue = (...keys: string[]) => {
      for (const key of keys) {
        const value = cleanText(details[key]);
        if (value) return value;
      }
      return '';
    };

    const tagsValue =
      details.tags ??
      details.keywords ??
      details.search_tags ??
      details.searchTags;

    let tags = '';

    if (Array.isArray(tagsValue)) {
      tags = tagsValue
        .map((value) => cleanText(value))
        .filter(Boolean)
        .join(', ');
    } else {
      tags = cleanText(tagsValue);
    }

    setForm((prev) => ({
      ...prev,
      title:
        prev.title ||
        firstValue('title', 'product_title', 'product_name'),
      brand: prev.brand || firstValue('brand'),
      mainCategory:
        prev.mainCategory ||
        firstValue('main_category', 'category'),
      subCategory:
        prev.subCategory || firstValue('sub_category'),
      childCategory:
        prev.childCategory || firstValue('child_category'),
      color: prev.color || firstValue('color'),
      secondaryColor:
        prev.secondaryColor || firstValue('secondary_color'),
      size: prev.size || firstValue('size'),
      material:
        prev.material || firstValue('material', 'fabric'),
      pattern:
        prev.pattern || firstValue('pattern', 'style'),
      gender:
        prev.gender || firstValue('gender', 'audience'),
      ageGroup:
        prev.ageGroup || firstValue('age_group', 'age'),
      description:
        prev.description ||
        firstValue('description', 'ai_description'),
      highlights:
        prev.highlights ||
        firstValue('highlights', 'features'),
      tags: prev.tags || tags,
    }));
  }

  async function generateAiText() {
    const sourceAsset =
      slotMap.get('real_front') ?? slotMap.get('ai_main');

    if (!sourceAsset) {
      setMessage(
        'Select an AI Main or Real Front image before generating product details.',
      );
      return;
    }

    if (sourceAsset.kind !== 'image') {
      setMessage('AI product details require an image.');
      return;
    }

    setAiGenerating(true);
    setMessage('');

    try {
      const body = new FormData();

      body.append('uid', auth?.currentUser?.uid ?? 'web-admin');
      body.append(
        'instruction',
        'Identify this retail product and return strict JSON with productDetails containing title, brand, main_category, sub_category, child_category, color, secondary_color, size, material, fabric, pattern, style, gender, audience, age_group, description, highlights, features, tags, keywords and search_tags. Do not invent selling price, MRP, purchase cost, stock, SKU, QR code or inventory location.',
      );
      body.append('image', sourceAsset.file);

      const response = await fetch(IDENTIFY_WORKER_URL, {
        method: 'POST',
        body,
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          text || `AI identify failed (${response.status})`,
        );
      }

      const decoded = JSON.parse(text) as Record<string, unknown>;

      applyAiProductDetails(decoded);

      setMessage(
        'AI product details generated. Review and edit them before saving.',
      );
    } catch (error) {
      console.error('AI product details error:', error);
      setMessage(
        error instanceof Error
          ? `AI text generation failed: ${error.message}`
          : 'AI text generation failed.',
      );
    } finally {
      setAiGenerating(false);
    }
  }

  async function uploadFileToR2(
    asset: MediaAsset,
    index: number,
    total: number,
  ) {
    const user = auth?.currentUser;

    if (!user) {
      throw new Error('Admin login is required before uploading media.');
    }

    const contentType =
      asset.file.type ||
      (asset.kind === 'video' ? 'video/mp4' : 'image/jpeg');

    const ext = extensionFor(asset.file);
    const skuPart =
      safeFilePart(form.sku) ||
      safeFilePart(form.title) ||
      'product';

    const fileName =
      `business_products/web_admin/${user.uid}/` +
      `${Date.now()}_${skuPart}_${asset.slot}.${ext}`;

    setUploadStatus(
      `Uploading ${index + 1} of ${total}: ${
        SLOT_OPTIONS.find((item) => item.value === asset.slot)
          ?.label ?? asset.slot
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

  async function uploadAllMedia() {
    const uploaded: Partial<Record<SlotKey, string>> = {};

    for (let index = 0; index < mediaAssets.length; index += 1) {
      const asset = mediaAssets[index];

      uploaded[asset.slot] = await uploadFileToR2(
        asset,
        index,
        mediaAssets.length,
      );
    }

    return uploaded;
  }

  async function saveProduct() {
    if (!db) {
      setMessage('Firebase is not available.');
      return;
    }

    const user = auth?.currentUser;

    if (!user) {
      setMessage('Please sign in with the SPOTC admin account.');
      return;
    }

    if (!form.title.trim()) {
      setMessage('Product name is required.');
      return;
    }

    if (!slotMap.has('ai_main')) {
      setMessage('AI Main Image is required.');
      return;
    }

    if (finalPrice <= 0) {
      setMessage('Selling price is required.');
      return;
    }

    setSaving(true);
    setMessage('');
    setUploadStatus('Preparing media upload…');

    try {
      const urls = await uploadAllMedia();

      const aiMainUrl = cleanText(urls.ai_main);
      const realFrontUrl = cleanText(urls.real_front);
      const realBackUrl = cleanText(urls.real_back);
      const detailImageUrl = cleanText(urls.detail);
      const productVideoUrl = cleanText(urls.product_video);

      if (!aiMainUrl) {
        throw new Error('AI Main Image upload did not complete.');
      }

      const stock = Math.max(
        0,
        Number.parseInt(form.stockQty || '0', 10) || 0,
      );

      const images = [
        aiMainUrl,
        realFrontUrl,
        realBackUrl,
        detailImageUrl,
      ].filter(Boolean);

      const media = [
        aiMainUrl
          ? {
              slot: 'ai_main',
              role: 'ai',
              type: 'image',
              label: 'AI Main Image',
              url: aiMainUrl,
              order: 1,
            }
          : null,
        realFrontUrl
          ? {
              slot: 'real_front',
              role: 'front',
              type: 'image',
              label: 'Real Front',
              url: realFrontUrl,
              order: 2,
            }
          : null,
        realBackUrl
          ? {
              slot: 'real_back',
              role: 'back',
              type: 'image',
              label: 'Real Back',
              url: realBackUrl,
              order: 3,
            }
          : null,
        detailImageUrl
          ? {
              slot: 'detail',
              role: 'additional',
              type: 'image',
              label: 'Detail Image',
              url: detailImageUrl,
              order: 4,
            }
          : null,
        productVideoUrl
          ? {
              slot: 'product_video',
              role: 'video',
              type: 'video',
              label: 'Product Video',
              url: productVideoUrl,
              order: 5,
            }
          : null,
      ].filter(Boolean);

      const price = finalPrice;
      const mrp = money(form.mrp);
      const sellingPrice = money(form.sellingPrice);
      const offerPrice = money(form.offerPrice);
      const purchaseCost = money(form.purchaseCost);

      const tags = form.tags
        .split(/[,|\n]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      setUploadStatus('Saving product to Firestore…');

      await addDoc(collection(db, 'BusinessProducts'), {
        owner_uid: user.uid,
        seller_type: 'spotc',
        source: 'web_admin',

        title: form.title.trim(),
        product_name: form.title.trim(),
        brand: form.brand.trim(),

        category: form.mainCategory.trim(),
        main_category: form.mainCategory.trim(),
        sub_category: form.subCategory.trim(),
        child_category: form.childCategory.trim(),

        description: form.description.trim(),
        ai_description: form.description.trim(),

        highlights: form.highlights.trim(),
        features: form.highlights.trim(),

        tags,
        keywords: tags,
        search_tags: tags,

        search_text: [
          form.title,
          form.brand,
          form.mainCategory,
          form.subCategory,
          form.childCategory,
          form.color,
          form.secondaryColor,
          form.material,
          form.pattern,
          form.gender,
          form.ageGroup,
          ...tags,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),

        color: form.color.trim(),
        secondary_color: form.secondaryColor.trim(),

        size: form.size.trim(),
        material: form.material.trim(),
        fabric: form.material.trim(),
        pattern: form.pattern.trim(),
        style: form.pattern.trim(),

        gender: form.gender.trim(),
        audience: form.gender.trim(),
        age_group: form.ageGroup.trim(),

        purchase_cost: purchaseCost,

        price,
        selling_price: sellingPrice || price,
        offer_price: offerPrice || price,

        old_price: mrp,
        mrp,
        discount,

        sku: form.sku.trim(),

        qr_code: form.qrCode.trim(),
        qr_sticker_id: form.qrCode.trim(),

        stock_qty: stock,
        stock_quantity: stock,

        reserved_qty: 0,
        available_qty: stock,

        is_in_stock: stock > 0,

        rack: form.rack.trim(),
        rack_location: form.rack.trim(),

        box: form.box.trim(),
        box_location: form.box.trim(),

        slot: form.slot.trim(),
        slot_location: form.slot.trim(),

        storage_location: [
          form.rack.trim(),
          form.box.trim(),
          form.slot.trim(),
        ]
          .filter(Boolean)
          .join(' / '),

        images,
        media,

        image: aiMainUrl,
        image_url: aiMainUrl,
        product_image: aiMainUrl,
        product_image_url: aiMainUrl,
        thumbnail_url: aiMainUrl,
        studio_image_url: aiMainUrl,

        raw_image_url: realFrontUrl || aiMainUrl,
        real_front_url: realFrontUrl,
        real_back_url: realBackUrl,
        detail_image_url: detailImageUrl,
        product_video_url: productVideoUrl,

        free_gift_eligible: form.freeGiftEligible,
        free_gift_value: money(form.freeGiftValue),

        isActive: form.isActive,
        isDeleted: false,

        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setUploadStatus('');
      setMessage('Product saved successfully.');

      router.push('/admin/products');
      router.refresh();
    } catch (error) {
      console.error('Save product error:', error);
      setUploadStatus('');
      setMessage(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : 'Product save failed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={pageHeader}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 30 }}>
            Add Product
          </h1>

          <p style={{ margin: 0, color: '#666' }}>
            Bulk upload product media, generate product text,
            then add pricing and inventory.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/products')}
          style={secondaryButton}
        >
          Back to Products
        </button>
      </div>

      <Section title="Product Media">
        <p style={helpText}>
          Select up to 5 files together from your computer or phone.
          Maximum 4 images + 1 optional video. After selection, each
          file can be reassigned to the correct slot.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleBulkMediaSelection}
          style={{ display: 'none' }}
        />

        <div style={uploadToolbar}>
          <button
            type="button"
            onClick={chooseFiles}
            disabled={saving || mediaAssets.length >= 5}
            style={{
              ...primaryMediaButton,
              opacity:
                saving || mediaAssets.length >= 5 ? 0.55 : 1,
            }}
          >
            + Select Media From Device
          </button>

          <div style={mediaCount}>
            {mediaAssets.length}/5 selected
          </div>
        </div>

        {mediaAssets.length === 0 ? (
          <button
            type="button"
            onClick={chooseFiles}
            style={emptyMediaBox}
          >
            <div style={{ fontSize: 34 }}>＋</div>
            <div style={{ fontWeight: 900 }}>
              Select product images / video
            </div>
            <div style={{ color: '#777', fontSize: 13 }}>
              Choose multiple files in one selection
            </div>
          </button>
        ) : (
          <div style={mediaGrid}>
            {mediaAssets.map((asset) => {
              const options = SLOT_OPTIONS.filter(
                (option) => option.kind === asset.kind,
              );

              return (
                <div key={asset.id} style={mediaCard}>
                  <div style={mediaPreviewWrap}>
                    {asset.kind === 'video' ? (
                      <video
                        src={asset.previewUrl}
                        controls
                        muted
                        playsInline
                        style={mediaPreview}
                      />
                    ) : (
                      <img
                        src={asset.previewUrl}
                        alt={asset.file.name}
                        style={mediaPreview}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeMedia(asset.id)}
                      style={removeButton}
                      aria-label="Remove media"
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ padding: 12 }}>
                    <div style={fileName}>
                      {asset.file.name}
                    </div>

                    <div style={fileMeta}>
                      {(asset.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>

                    <label style={labelStyle}>Media Slot</label>

                    <select
                      value={asset.slot}
                      onChange={(event) =>
                        changeMediaSlot(
                          asset.id,
                          event.target.value as SlotKey,
                        )
                      }
                      style={inputStyle}
                    >
                      {options.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={slotSummary}>
          {SLOT_OPTIONS.map((option) => {
            const selected = slotMap.get(option.value);

            return (
              <div key={option.value} style={slotSummaryItem}>
                <span
                  style={{
                    ...slotDot,
                    background: selected ? '#11823b' : '#d7d7d7',
                  }}
                />
                <strong>{option.label}</strong>
                <span style={{ color: '#777' }}>
                  {selected ? 'Ready' : 'Not selected'}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={generateAiText}
          disabled={aiGenerating || saving}
          style={{
            ...aiButton,
            opacity: aiGenerating || saving ? 0.55 : 1,
          }}
        >
          {aiGenerating
            ? 'Generating Product Details…'
            : '✨ Generate Product Details with AI'}
        </button>
      </Section>

      <Section title="Basic Details">
        <div style={grid3}>
          <Field
            label="Product Name"
            value={form.title}
            onChange={(value) => updateField('title', value)}
          />

          <Field
            label="Brand"
            value={form.brand}
            onChange={(value) => updateField('brand', value)}
          />

          <Field
            label="Main Category"
            value={form.mainCategory}
            onChange={(value) =>
              updateField('mainCategory', value)
            }
          />

          <Field
            label="Sub Category"
            value={form.subCategory}
            onChange={(value) =>
              updateField('subCategory', value)
            }
          />

          <Field
            label="Child Category"
            value={form.childCategory}
            onChange={(value) =>
              updateField('childCategory', value)
            }
          />

          <Field
            label="Colour"
            value={form.color}
            onChange={(value) => updateField('color', value)}
          />

          <Field
            label="Second Colour"
            value={form.secondaryColor}
            onChange={(value) =>
              updateField('secondaryColor', value)
            }
          />

          <Field
            label="Size"
            value={form.size}
            onChange={(value) => updateField('size', value)}
          />

          <Field
            label="Material / Fabric"
            value={form.material}
            onChange={(value) =>
              updateField('material', value)
            }
          />

          <Field
            label="Pattern / Style"
            value={form.pattern}
            onChange={(value) =>
              updateField('pattern', value)
            }
          />

          <Field
            label="Gender / Audience"
            value={form.gender}
            onChange={(value) =>
              updateField('gender', value)
            }
          />

          <Field
            label="Age Group"
            value={form.ageGroup}
            onChange={(value) =>
              updateField('ageGroup', value)
            }
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Description</label>

          <textarea
            value={form.description}
            onChange={(event) =>
              updateField('description', event.target.value)
            }
            rows={5}
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>
            Highlights / Features
          </label>

          <textarea
            value={form.highlights}
            onChange={(event) =>
              updateField('highlights', event.target.value)
            }
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <Field
            label="Search Tags"
            value={form.tags}
            onChange={(value) => updateField('tags', value)}
            placeholder="kids, sunglasses, pink, fancy"
          />
        </div>
      </Section>

      <Section title="Pricing">
        <div style={grid4}>
          <Field
            label="Purchase Cost"
            value={form.purchaseCost}
            onChange={(value) =>
              updateField('purchaseCost', value)
            }
            type="number"
          />

          <Field
            label="MRP"
            value={form.mrp}
            onChange={(value) => updateField('mrp', value)}
            type="number"
          />

          <Field
            label="Selling Price"
            value={form.sellingPrice}
            onChange={(value) =>
              updateField('sellingPrice', value)
            }
            type="number"
          />

          <Field
            label="Offer Price"
            value={form.offerPrice}
            onChange={(value) =>
              updateField('offerPrice', value)
            }
            type="number"
          />
        </div>

        <div style={priceSummary}>
          <strong>Final Price: ₹{finalPrice || 0}</strong>
          {discount && <span>{discount}</span>}
          {money(form.purchaseCost) > 0 && finalPrice > 0 && (
            <span>
              Gross Product Margin: ₹
              {Math.max(
                0,
                finalPrice - money(form.purchaseCost),
              ).toFixed(0)}
            </span>
          )}
        </div>
      </Section>

      <Section title="Inventory">
        <p style={helpText}>
          Rack / Box / Slot helps you immediately find the exact item
          when a customer orders or asks about the product.
        </p>

        <div style={grid3}>
          <Field
            label="SKU"
            value={form.sku}
            onChange={(value) => updateField('sku', value)}
            placeholder="SPT-KID-0001"
          />

          <Field
            label="QR Code"
            value={form.qrCode}
            onChange={(value) =>
              updateField('qrCode', value)
            }
          />

          <Field
            label="Stock Quantity"
            value={form.stockQty}
            onChange={(value) =>
              updateField('stockQty', value)
            }
            type="number"
          />

          <Field
            label="Rack"
            value={form.rack}
            onChange={(value) => updateField('rack', value)}
            placeholder="Rack B"
          />

          <Field
            label="Box"
            value={form.box}
            onChange={(value) => updateField('box', value)}
            placeholder="Box 04"
          />

          <Field
            label="Slot"
            value={form.slot}
            onChange={(value) => updateField('slot', value)}
            placeholder="Slot 12"
          />
        </div>
      </Section>

      <Section title="Free Gift">
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={form.freeGiftEligible}
            onChange={(event) =>
              updateField(
                'freeGiftEligible',
                event.target.checked,
              )
            }
          />

          Product can be used as a free gift
        </label>

        {form.freeGiftEligible && (
          <div style={{ maxWidth: 300, marginTop: 14 }}>
            <Field
              label="Gift Cost / Value"
              value={form.freeGiftValue}
              onChange={(value) =>
                updateField('freeGiftValue', value)
              }
              type="number"
            />
          </div>
        )}
      </Section>

      <Section title="Status">
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              updateField('isActive', event.target.checked)
            }
          />

          Active and visible in Shop
        </label>
      </Section>

      {(message || uploadStatus) && (
        <div style={noticeBox}>
          {uploadStatus && (
            <div style={{ fontWeight: 900 }}>{uploadStatus}</div>
          )}

          {message && (
            <div style={{ marginTop: uploadStatus ? 5 : 0 }}>
              {message}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={saveProduct}
        disabled={saving}
        style={{
          ...saveButton,
          opacity: saving ? 0.55 : 1,
        }}
      >
        {saving
          ? 'Uploading Media & Saving Product…'
          : 'Upload Media & Save Product'}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h2
        style={{
          margin: '0 0 18px',
          fontSize: 19,
        }}
      >
        {title}
      </h2>

      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={inputStyle}
      />
    </div>
  );
}

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 24,
};

const sectionStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e6e6e6',
  borderRadius: 18,
  padding: 22,
  marginBottom: 18,
};

const grid3: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 14,
};

const grid4: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 900,
  color: '#555',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 13px',
  border: '1px solid #dcdcdc',
  borderRadius: 11,
  fontSize: 14,
  outline: 'none',
  background: '#fff',
};

const helpText: React.CSSProperties = {
  marginTop: -6,
  marginBottom: 16,
  color: '#777',
  fontSize: 13,
  lineHeight: 1.5,
};

const uploadToolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 16,
};

const primaryMediaButton: React.CSSProperties = {
  border: 0,
  background: '#111',
  color: '#fff',
  padding: '12px 17px',
  borderRadius: 12,
  fontWeight: 900,
  cursor: 'pointer',
};

const mediaCount: React.CSSProperties = {
  fontSize: 13,
  color: '#666',
  fontWeight: 800,
};

const emptyMediaBox: React.CSSProperties = {
  width: '100%',
  minHeight: 180,
  border: '2px dashed #d4d4d4',
  background: '#fafafa',
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 5,
  cursor: 'pointer',
  color: '#222',
};

const mediaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 14,
};

const mediaCard: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 15,
  overflow: 'hidden',
  background: '#fafafa',
};

const mediaPreviewWrap: React.CSSProperties = {
  height: 190,
  background: '#f0f0f0',
  position: 'relative',
};

const mediaPreview: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const removeButton: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 8,
  width: 30,
  height: 30,
  borderRadius: 999,
  border: 0,
  background: 'rgba(0,0,0,.72)',
  color: '#fff',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
};

const fileName: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const fileMeta: React.CSSProperties = {
  fontSize: 11,
  color: '#777',
  marginTop: 3,
  marginBottom: 12,
};

const slotSummary: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 8,
  marginTop: 16,
  marginBottom: 16,
};

const slotSummaryItem: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '12px 1fr',
  columnGap: 8,
  rowGap: 2,
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: 11,
  background: '#f7f7f7',
  fontSize: 12,
};

const slotDot: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  gridRow: '1 / span 2',
};

const aiButton: React.CSSProperties = {
  border: 0,
  background: '#f2b774',
  color: '#111',
  padding: '12px 16px',
  borderRadius: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const priceSummary: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginTop: 13,
  padding: '11px 13px',
  background: '#f8f8f8',
  borderRadius: 11,
  fontSize: 13,
};

const checkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontWeight: 800,
  cursor: 'pointer',
};

const noticeBox: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  background: '#fff7e8',
  border: '1px solid #f2d8a5',
  borderRadius: 12,
  fontWeight: 700,
};

const saveButton: React.CSSProperties = {
  width: '100%',
  border: 0,
  background: '#111',
  color: 'white',
  padding: '16px 20px',
  borderRadius: 14,
  fontSize: 16,
  fontWeight: 900,
  cursor: 'pointer',
  marginBottom: 40,
};

const secondaryButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: 'white',
  color: '#222',
  padding: '11px 16px',
  borderRadius: 11,
  fontWeight: 800,
  cursor: 'pointer',
};