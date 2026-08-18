'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';

type SlotKey = 'ai_main' | 'real_front' | 'real_back' | 'detail' | 'product_video';

type SelectedMedia = {
  id: string;
  file: File;
  previewUrl: string;
  slot: SlotKey;
  uploading: boolean;
  uploadedUrl: string;
  error: string;
};

type IdentifyResponse = {
  productDetails?: Record<string, unknown>;
  product_details?: Record<string, unknown>;
  [key: string]: unknown;
};


type ProductCategoryConfig = {
  id: string;
  name: string;
  subcategories: string[];
  isActive: boolean;
  sortOrder: number;
};

const FALLBACK_CATEGORIES: ProductCategoryConfig[] = [
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
    sortOrder: 3,
  },
];

const SLOT_OPTIONS: Array<{ value: SlotKey; label: string; type: 'image' | 'video' }> = [
  { value: 'ai_main', label: 'AI Main Image', type: 'image' },
  { value: 'real_front', label: 'Real Front', type: 'image' },
  { value: 'real_back', label: 'Real Back', type: 'image' },
  { value: 'detail', label: 'Detail Image', type: 'image' },
  { value: 'product_video', label: 'Product Video', type: 'video' },
];

function money(value: string) {
  return Number(value.replace(/[^0-9.]/g, '')) || 0;
}

function clean(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value).trim();
}

function extensionOf(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName) return fromName;
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  if (file.type.includes('mp4')) return 'mp4';
  return 'jpg';
}

export default function NewProductPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [categoryConfigs, setCategoryConfigs] =
    useState<ProductCategoryConfig[]>(FALLBACK_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] =
    useState(true);

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
    availableSizes: '',
    dressType: '',
    dressLength: '',
    chestSize: '',
    waistSize: '',
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

  function updateField(field: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
        const snapshot = await getDocs(
          query(
            collection(db, 'ProductCategories'),
            orderBy('sort_order', 'asc'),
          ),
        );

        if (!active) return;

        const loaded = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;

            const subcategories = Array.isArray(data.subcategories)
              ? data.subcategories
                  .map((value) => String(value).trim())
                  .filter(Boolean)
              : [];

            return {
              id: item.id,
              name: String(data.name || '').trim(),
              subcategories,
              isActive: data.is_active !== false,
              sortOrder: Number(data.sort_order) || 0,
            } satisfies ProductCategoryConfig;
          })
          .filter((item) => item.name && item.isActive);

        setCategoryConfigs(
          loaded.length ? loaded : FALLBACK_CATEGORIES,
        );
      } catch (error) {
        console.error('Unable to load product categories:', error);

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

  const selectedCategoryConfig = useMemo(
    () =>
      categoryConfigs.find(
        (item) =>
          item.name.toLowerCase() ===
          form.mainCategory.trim().toLowerCase(),
      ) || null,
    [categoryConfigs, form.mainCategory],
  );

  const mainCategoryOptions = useMemo(() => {
    const values = categoryConfigs
      .map((item) => item.name)
      .filter(Boolean);

    const current = form.mainCategory.trim();

    if (
      current &&
      !values.some(
        (value) =>
          value.toLowerCase() === current.toLowerCase(),
      )
    ) {
      values.unshift(current);
    }

    return Array.from(new Set(values));
  }, [categoryConfigs, form.mainCategory]);

  const subCategoryOptions = useMemo(() => {
    const values = selectedCategoryConfig
      ? [...selectedCategoryConfig.subcategories]
      : [];

    const current = form.subCategory.trim();

    if (
      current &&
      !values.some(
        (value) =>
          value.toLowerCase() === current.toLowerCase(),
      )
    ) {
      values.unshift(current);
    }

    return Array.from(new Set(values));
  }, [selectedCategoryConfig, form.subCategory]);

  function changeMainCategory(value: string) {
    setForm((prev) => ({
      ...prev,
      mainCategory: value,
      subCategory: '',
      childCategory: '',
    }));
  }

  const isGirlDress = useMemo(
    () =>
      form.mainCategory.trim().toLowerCase() ===
      'girl dress',
    [form.mainCategory],
  );

  const availableSizeList = useMemo(
    () =>
      form.availableSizes
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    [form.availableSizes],
  );

  const finalPrice = useMemo(() => {
    return money(form.sellingPrice);
  }, [form.sellingPrice]);

  const discount = useMemo(() => {
    const mrp = money(form.mrp);
    if (mrp <= 0 || finalPrice <= 0 || mrp <= finalPrice) return '';
    return `${Math.round(((mrp - finalPrice) / mrp) * 100)}% OFF`;
  }, [form.mrp, finalPrice]);

  function defaultSlotFor(file: File, index: number): SlotKey {
    if (file.type.startsWith('video/')) return 'product_video';
    const imageSlots: SlotKey[] = ['ai_main', 'real_front', 'real_back', 'detail'];
    return imageSlots[Math.min(index, imageSlots.length - 1)];
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    const incoming = Array.from(files).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );

    if (!incoming.length) {
      setMessage('Select image or video files only.');
      return;
    }

    const availableCount = Math.max(0, 5 - media.length);
    const accepted = incoming.slice(0, availableCount);

    if (!accepted.length) {
      setMessage('Maximum 5 media files are allowed for one product.');
      return;
    }

    const existingSlots = new Set(media.map((item) => item.slot));
    let imageIndex = 0;

    const created = accepted.map((file) => {
      let slot = defaultSlotFor(file, imageIndex);

      if (file.type.startsWith('image/')) {
        const preferred: SlotKey[] = ['ai_main', 'real_front', 'real_back', 'detail'];
        slot = preferred.find((candidate) => !existingSlots.has(candidate)) || 'detail';
        existingSlots.add(slot);
        imageIndex += 1;
      } else {
        slot = 'product_video';
        existingSlots.add(slot);
      }

      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        slot,
        uploading: false,
        uploadedUrl: '',
        error: '',
      } satisfies SelectedMedia;
    });

    setMedia((prev) => [...prev, ...created].slice(0, 5));
    setMessage(incoming.length > accepted.length ? 'Only the first available files were added. Maximum is 5.' : '');

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function changeSlot(id: string, slot: SlotKey) {
    setMedia((prev) => prev.map((item) => (item.id === id ? { ...item, slot, uploadedUrl: '', error: '' } : item)));
  }

  function removeMedia(id: string) {
    setMedia((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function validateSlots() {
    const seen = new Set<SlotKey>();
    for (const item of media) {
      const expectedType = SLOT_OPTIONS.find((slot) => slot.value === item.slot)?.type;
      const actualType = item.file.type.startsWith('video/') ? 'video' : 'image';
      if (expectedType !== actualType) return `${item.file.name} cannot be assigned to ${item.slot.replaceAll('_', ' ')}.`;
      if (seen.has(item.slot)) return `Only one file can use the ${item.slot.replaceAll('_', ' ')} slot.`;
      seen.add(item.slot);
    }
    return '';
  }

  async function uploadOne(item: SelectedMedia): Promise<string> {
    const user = auth?.currentUser;
    if (!user) throw new Error('Admin login is required before uploading media.');

    const functions = getFunctions(undefined, 'asia-south1');
    const getR2UploadUrl = httpsCallable<
      { fileName: string; contentType: string; folder: string },
      { uploadUrl: string; publicUrl: string }
    >(functions, 'getR2UploadUrl');

    const ext = extensionOf(item.file);
    const safeSlot = item.slot.replace(/[^a-z0-9_-]/gi, '_');
    const fileName = `${user.uid}_${Date.now()}_${safeSlot}.${ext}`;

    const signed = await getR2UploadUrl({
      fileName,
      contentType: item.file.type || (item.slot === 'product_video' ? 'video/mp4' : 'image/jpeg'),
      folder: 'business-products',
    });

    const response = await fetch(signed.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': item.file.type || (item.slot === 'product_video' ? 'video/mp4' : 'image/jpeg'),
      },
      body: item.file,
    });

    if (!response.ok) throw new Error(`R2 upload failed (${response.status}) for ${item.file.name}`);
    return signed.data.publicUrl;
  }

  async function uploadAllMedia() {
    const slotError = validateSlots();
    if (slotError) {
      setMessage(slotError);
      return null;
    }

    if (!media.length) {
      setMessage('Select product media first.');
      return null;
    }

    if (!media.some((item) => item.slot === 'ai_main')) {
      setMessage('Assign one image as AI Main Image.');
      return null;
    }

    setUploadingAll(true);
    setMessage('Uploading media to R2…');

    try {
      const uploaded: SelectedMedia[] = [];

      for (const item of media) {
        if (item.uploadedUrl) {
          uploaded.push(item);
          continue;
        }

        setMedia((prev) => prev.map((m) => (m.id === item.id ? { ...m, uploading: true, error: '' } : m)));

        try {
          const uploadedUrl = await uploadOne(item);
          const updated = { ...item, uploadedUrl, uploading: false, error: '' };
          uploaded.push(updated);
          setMedia((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
        } catch (error) {
          const errorText = error instanceof Error ? error.message : 'Upload failed';
          setMedia((prev) => prev.map((m) => (m.id === item.id ? { ...m, uploading: false, error: errorText } : m)));
          throw error;
        }
      }

      setMessage('All product media uploaded successfully.');
      return uploaded;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media upload failed.');
      return null;
    } finally {
      setUploadingAll(false);
    }
  }

  function applyAiDetails(data: IdentifyResponse) {
    const details = (data.productDetails || data.product_details || data) as Record<string, unknown>;

    const first = (...keys: string[]) => {
      for (const key of keys) {
        const value = clean(details[key]);
        if (value) return value;
      }
      return '';
    };

    const normalise = (value: string) =>
      value
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const rawMainCategory = first(
      'main_category',
      'category',
      'product_category',
      'product_type',
    );

    const rawSubCategory = first(
      'sub_category',
      'subcategory',
      'subCategory',
    );

    const rawTitle = first(
      'title',
      'product_title',
      'product_name',
    );

    const combinedProductText = normalise(
      [
        rawMainCategory,
        rawSubCategory,
        rawTitle,
        first('child_category'),
        first('style'),
        first('pattern'),
        first('description'),
      ]
        .filter(Boolean)
        .join(' '),
    );

    const findConfiguredCategory = (candidate: string) => {
      const target = normalise(candidate);
      if (!target) return '';

      const exact = categoryConfigs.find(
        (item) => normalise(item.name) === target,
      );

      if (exact) return exact.name;

      const contained = categoryConfigs.find((item) => {
        const configured = normalise(item.name);
        return (
          configured &&
          (target.includes(configured) || configured.includes(target))
        );
      });

      return contained?.name || '';
    };

    let matchedMainCategory = findConfiguredCategory(rawMainCategory);

    // Strong product-type fallbacks. This prevents jewellery/earring
    // photos from accidentally being treated as clothing.
    if (!matchedMainCategory) {
      if (
        /\b(earring|earrings|jhumka|jhumki|stud|hoop|drop earring|dangling earring|chandelier earring|jewellery|jewelry)\b/.test(
          combinedProductText,
        )
      ) {
        matchedMainCategory =
          findConfiguredCategory('Earrings') || 'Earrings';
      } else if (
        /\b(dress|frock|gown|lehenga|kurti|girl dress|girls dress)\b/.test(
          combinedProductText,
        )
      ) {
        matchedMainCategory =
          findConfiguredCategory('Girl Dress') || 'Girl Dress';
      } else if (
        /\b(toy|toys|doll|toy car|toy gun|fidget|ball|pretend play)\b/.test(
          combinedProductText,
        )
      ) {
        matchedMainCategory =
          findConfiguredCategory('Toys') || 'Toys';
      }
    }

    if (!matchedMainCategory) {
      matchedMainCategory = rawMainCategory;
    }

    const matchedCategoryConfig =
      categoryConfigs.find(
        (item) =>
          normalise(item.name) ===
          normalise(matchedMainCategory),
      ) || null;

    const findConfiguredSubCategory = (candidate: string) => {
      if (!matchedCategoryConfig) return candidate;

      const target = normalise(candidate);
      if (!target) return '';

      const exact = matchedCategoryConfig.subcategories.find(
        (item) => normalise(item) === target,
      );

      if (exact) return exact;

      const contained = matchedCategoryConfig.subcategories.find(
        (item) => {
          const configured = normalise(item);
          return (
            configured &&
            (target.includes(configured) ||
              configured.includes(target))
          );
        },
      );

      return contained || '';
    };

    let matchedSubCategory =
      findConfiguredSubCategory(rawSubCategory);

    const matchedMainNormalised =
      normalise(matchedMainCategory);

    if (matchedMainNormalised === 'earrings') {
      const earringText = normalise(
        [
          rawSubCategory,
          first('child_category'),
          rawTitle,
          first('style'),
          first('pattern'),
          first('description'),
          first('highlights'),
          first('features'),
        ]
          .filter(Boolean)
          .join(' '),
      );

      let detectedEarringSubCategory = '';

      if (/\b(jhumka|jhumki)\b/.test(earringText)) {
        detectedEarringSubCategory = 'Jhumka';
      } else if (/\bstud\b/.test(earringText)) {
        detectedEarringSubCategory = 'Stud';
      } else if (/\bhoop\b/.test(earringText)) {
        detectedEarringSubCategory = 'Hoop';
      } else if (
        /\b(drop|dangle|dangling|chandelier|hanging|hook drop)\b/.test(
          earringText,
        )
      ) {
        detectedEarringSubCategory = 'Drop';
      } else if (
        /\b(kid|kids|child|children)\b/.test(earringText)
      ) {
        detectedEarringSubCategory = 'Kids';
      }

      if (detectedEarringSubCategory) {
        matchedSubCategory =
          findConfiguredSubCategory(
            detectedEarringSubCategory,
          ) || detectedEarringSubCategory;
      } else if (
        !matchedSubCategory ||
        normalise(matchedSubCategory) === 'other earrings'
      ) {
        matchedSubCategory =
          findConfiguredSubCategory('Other Earrings') ||
          'Other Earrings';
      }
    }

    const aiAgeGroup = first('age_group', 'age');

    if (
      matchedMainNormalised === 'girl dress' &&
      !matchedSubCategory &&
      aiAgeGroup
    ) {
      matchedSubCategory =
        findConfiguredSubCategory(aiAgeGroup) ||
        rawSubCategory;
    }

    setForm((prev) => ({
      ...prev,
      title: rawTitle || prev.title,
      brand: first('brand') || prev.brand,
      mainCategory:
        matchedMainCategory || prev.mainCategory,
      subCategory:
        matchedSubCategory || prev.subCategory,
      childCategory:
        first('child_category') || prev.childCategory,
      color: first('color', 'colour') || prev.color,
      secondaryColor:
        first('secondary_color', 'second_color', 'secondary_colour') ||
        prev.secondaryColor,
      size: first('size') || prev.size,
      availableSizes:
        first('available_sizes', 'sizes') ||
        prev.availableSizes,
      dressType:
        first(
          'dress_type',
          'garment_type',
          'product_type',
        ) || prev.dressType,
      dressLength:
        first(
          'dress_length',
          'garment_length',
          'length',
        ) || prev.dressLength,
      chestSize:
        first(
          'chest_size',
          'chest',
          'bust_size',
          'bust',
        ) || prev.chestSize,
      waistSize:
        first(
          'waist_size',
          'waist',
        ) || prev.waistSize,
      material:
        first('material', 'fabric') || prev.material,
      pattern:
        first('pattern', 'style') || prev.pattern,
      gender:
        first('gender', 'audience') || prev.gender,
      ageGroup:
        aiAgeGroup || prev.ageGroup,
      description:
        first('description', 'ai_description') ||
        prev.description,
      highlights:
        first('highlights', 'features') ||
        prev.highlights,
      tags:
        first('tags', 'keywords', 'search_tags') ||
        prev.tags,
    }));
  }

  async function generateAiText() {
    const source =
      media.find((item) => item.slot === 'real_front') ||
      media.find((item) => item.slot === 'ai_main');

    if (!source) {
      setMessage('Select AI Main or Real Front image first.');
      return;
    }

    if (!source.file.type.startsWith('image/')) {
      setMessage('AI text generation requires an image.');
      return;
    }

    if (aiGenerating) return;

    setAiGenerating(true);
    setMessage('AI is identifying the product…');

    try {
      const body = new FormData();
      body.append('image', source.file);
      body.append('uid', auth?.currentUser?.uid || 'web_admin');
      const categoryGuide = categoryConfigs
        .map(
          (category) =>
            `${category.name}: ${category.subcategories.join(', ') || 'no fixed subcategories'}`,
        )
        .join('\n');

      body.append(
        'instruction',
        `Identify the MAIN RETAIL PRODUCT shown in this image.

This SPOTC admin can sell many different product types. Do NOT assume the image is clothing.

AVAILABLE CATEGORIES AND SUBCATEGORIES:
${categoryGuide}

IMPORTANT PRODUCT IDENTIFICATION RULES:
1. First determine the actual retail product being sold.
2. Ignore the model/person, display card, packaging, props, background cloth, furniture and decorative objects when deciding the product.
3. If a person/model is wearing the product, identify the worn product that is clearly being showcased.
4. If earrings are visible as the showcased product, identify the product as EARRINGS even if a girl/woman/model is wearing them.
5. If earrings are attached to a display card, the card is NOT the product.
6. For earrings, use main_category exactly "Earrings" when that category exists.
7. For earrings, choose the closest available sub_category such as Stud, Hoop, Drop, Jhumka, Kids or Other Earrings. IMPORTANT: Dangle, Dangling, Hanging and Chandelier earrings must map to sub_category "Drop". Do not return "Other Earrings" when a more specific type is visible.
8. For a girl's dress/frock/gown/lehenga/kurti, use main_category exactly "Girl Dress" when that category exists.
9. For toys, use main_category exactly "Toys" when that category exists.
10. Prefer category and sub_category values EXACTLY from AVAILABLE CATEGORIES above.
11. Do not invent brand, SKU, price, size, measurements, manufacturer, country of origin or weight when they cannot be visually determined.
12. For unknown/non-visible facts return an empty string.
13. Product title and description should describe the product itself, not the model or background.
14. Return JSON only. No markdown. No explanation.

Return STRICT JSON in exactly this structure:
{
  "productDetails": {
    "title": "",
    "brand": "",
    "main_category": "",
    "sub_category": "",
    "child_category": "",
    "color": "",
    "secondary_color": "",
    "size": "",
    "available_sizes": "",
    "dress_type": "",
    "garment_type": "",
    "dress_length": "",
    "garment_length": "",
    "chest_size": "",
    "chest": "",
    "waist_size": "",
    "waist": "",
    "material": "",
    "fabric": "",
    "pattern": "",
    "style": "",
    "fit": "",
    "gender": "",
    "audience": "",
    "age_group": "",
    "occasion": "",
    "season": "",
    "sku": "",
    "product_code": "",
    "manufacturer": "",
    "country_of_origin": "",
    "weight": "",
    "description": "",
    "highlights": "",
    "features": "",
    "tags": "",
    "keywords": "",
    "search_tags": "",
    "mrp": "",
    "selling_price": "",
    "offer_price": "",
    "discount_percent": ""
  }
}`,
      );

      const response = await fetch(
        'https://spotc-ai-product-studio.tinydot09.workers.dev/identify',
        {
          method: 'POST',
          body,
        },
      );

      const responseText = await response.text();

      let data: IdentifyResponse & { error?: string };

      try {
        data = responseText
          ? (JSON.parse(responseText) as IdentifyResponse & { error?: string })
          : {};
      } catch {
        throw new Error(
          `AI returned invalid response: ${responseText.slice(0, 300)}`,
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `AI product identification failed (${response.status}).`,
        );
      }

      applyAiDetails(data);
      setMessage(
        'AI product details generated. Review and edit before saving.',
      );
    } catch (error) {
      console.error('AI product identification failed:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'AI text generation failed.',
      );
    } finally {
      setAiGenerating(false);
    }
  }

  async function saveProduct() {
    if (!db) return setMessage('Firebase is not available.');
    const user = auth?.currentUser;
    if (!user) return setMessage('Admin login is required.');
    if (!form.title.trim()) return setMessage('Product name is required.');
    if (!form.mainCategory.trim()) return setMessage('Main category is required.');
    if (!form.subCategory.trim()) return setMessage('Sub category is required.');
    if (isGirlDress && !availableSizeList.length) {
      return setMessage('Enter at least one available dress size.');
    }
    if (finalPrice <= 0) return setMessage('Selling price is required.');

    const slotError = validateSlots();
    if (slotError) return setMessage(slotError);

    setSaving(true);
    setMessage('Preparing product…');

    try {
      let completedMedia = media;
      if (media.some((item) => !item.uploadedUrl)) {
        const uploaded = await uploadAllMedia();
        if (!uploaded) return;
        completedMedia = uploaded;
      }

      const bySlot = (slot: SlotKey) => completedMedia.find((item) => item.slot === slot)?.uploadedUrl.trim() || '';
      const aiMain = bySlot('ai_main');
      const realFront = bySlot('real_front');
      const realBack = bySlot('real_back');
      const detail = bySlot('detail');
      const video = bySlot('product_video');

      if (!aiMain) throw new Error('AI Main Image is required.');

      const images = [aiMain, realFront, realBack, detail].filter(Boolean);
      const mediaPayload = [
        aiMain ? { slot: 'ai_main', type: 'image', url: aiMain, order: 1 } : null,
        realFront ? { slot: 'real_front', type: 'image', url: realFront, order: 2 } : null,
        realBack ? { slot: 'real_back', type: 'image', url: realBack, order: 3 } : null,
        detail ? { slot: 'detail', type: 'image', url: detail, order: 4 } : null,
        video ? { slot: 'product_video', type: 'video', url: video, order: 5 } : null,
      ].filter(Boolean);

      const stock = Math.max(0, Number(form.stockQty) || 0);
      const mrp = money(form.mrp);
      const sellingPrice = money(form.sellingPrice);
      const purchaseCost = money(form.purchaseCost);
      const tagList = form.tags.split(/[,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);

      const savedAgeGroup = isGirlDress
        ? form.subCategory.trim()
        : form.ageGroup.trim();

      const savedSize = isGirlDress
        ? availableSizeList.join(', ')
        : form.size.trim();

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
        tags: tagList,
        keywords: tagList,
        search_tags: tagList,
        search_text: [
          form.title,
          form.brand,
          form.mainCategory,
          form.subCategory,
          form.childCategory,
          form.dressType,
          form.availableSizes,
          form.dressLength,
          form.chestSize,
          form.waistSize,
          form.color,
          form.material,
          form.gender,
          ...tagList,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        color: form.color.trim(),
        secondary_color: form.secondaryColor.trim(),
        size: savedSize,
        available_sizes: isGirlDress
          ? availableSizeList
          : form.size.trim()
            ? [form.size.trim()]
            : [],
        dress_type: isGirlDress
          ? form.dressType.trim()
          : '',
        dress_length: isGirlDress
          ? form.dressLength.trim()
          : '',
        chest_size: isGirlDress
          ? form.chestSize.trim()
          : '',
        waist_size: isGirlDress
          ? form.waistSize.trim()
          : '',
        material: form.material.trim(),
        fabric: form.material.trim(),
        pattern: form.pattern.trim(),
        style: form.pattern.trim(),
        gender: form.gender.trim(),
        audience: form.gender.trim(),
        age_group: savedAgeGroup,
        purchase_cost: purchaseCost,
        price: finalPrice,
        selling_price: sellingPrice || finalPrice,
        offer_price: 0,
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
        storage_location: [form.rack.trim(), form.box.trim(), form.slot.trim()].filter(Boolean).join(' / '),
        images,
        media: mediaPayload,
        image: aiMain,
        image_url: aiMain,
        product_image: aiMain,
        product_image_url: aiMain,
        thumbnail_url: aiMain,
        studio_image_url: aiMain,
        raw_image_url: realFront || aiMain,
        real_front_url: realFront,
        real_back_url: realBack,
        detail_image_url: detail,
        product_video_url: video,
        free_gift_eligible: form.freeGiftEligible,
        free_gift_value: money(form.freeGiftValue),
        isActive: form.isActive,
        isDeleted: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setMessage('Product saved successfully.');
      router.push('/admin/products');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={headerRow}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 30 }}>Add Product</h1>
          <p style={{ margin: 0, color: '#666' }}>Bulk media upload, AI product text, pricing and inventory.</p>
        </div>
        <button type="button" onClick={() => router.push('/admin/products')} style={secondaryButton}>Back to Products</button>
      </div>

      <Section title="Product Media">
        <p style={helpText}>Select up to 5 files together from your computer or mobile. Assign one file to each slot, then upload all to R2.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <button type="button" style={primaryButton} onClick={() => fileInputRef.current?.click()} disabled={media.length >= 5 || uploadingAll}>
            + Select Media ({media.length}/5)
          </button>
          <button type="button" style={secondaryButton} onClick={uploadAllMedia} disabled={!media.length || uploadingAll}>
            {uploadingAll ? 'Uploading…' : 'Upload All Media'}
          </button>
          <button type="button" onClick={generateAiText} disabled={!media.length || aiGenerating} style={aiButton}>
            {aiGenerating ? 'Generating…' : '✨ Generate Product Details with AI'}
          </button>
        </div>

        {media.length === 0 ? (
          <div style={emptyMedia}>No media selected. Click <b>+ Select Media</b> and choose up to 5 files together.</div>
        ) : (
          <div style={mediaGrid}>
            {media.map((item) => (
              <div key={item.id} style={mediaCard}>
                <div style={previewBox}>
                  {item.file.type.startsWith('video/') ? (
                    <video src={item.previewUrl} controls muted style={previewMedia} />
                  ) : (
                    <img src={item.previewUrl} alt={item.file.name} style={previewMedia} />
                  )}
                </div>

                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                  <select value={item.slot} onChange={(event) => changeSlot(item.id, event.target.value as SlotKey)} style={inputStyle}>
                    {SLOT_OPTIONS.filter((slot) => slot.type === (item.file.type.startsWith('video/') ? 'video' : 'image')).map((slot) => (
                      <option key={slot.value} value={slot.value}>{slot.label}</option>
                    ))}
                  </select>

                  <div style={{ minHeight: 20, marginTop: 8, fontSize: 12, fontWeight: 800, color: item.error ? '#b42318' : item.uploadedUrl ? '#18794e' : '#777' }}>
                    {item.uploading ? 'Uploading…' : item.error ? item.error : item.uploadedUrl ? '✓ Uploaded' : 'Ready to upload'}
                  </div>

                  <button type="button" onClick={() => removeMedia(item.id)} disabled={item.uploading || uploadingAll} style={removeButton}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Basic Details">
        <div style={grid3}>
          <Field label="Product Name" value={form.title} onChange={(v) => updateField('title', v)} />
          <Field label="Brand" value={form.brand} onChange={(v) => updateField('brand', v)} />
          <div>
            <label style={labelStyle}>Main Category</label>
            <select
              value={form.mainCategory}
              onChange={(event) =>
                changeMainCategory(event.target.value)
              }
              style={inputStyle}
            >
              <option value="">
                {categoriesLoading
                  ? 'Loading categories…'
                  : 'Select main category'}
              </option>

              {mainCategoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => router.push('/admin/categories')}
              style={{
                marginTop: 7,
                padding: 0,
                border: 0,
                background: 'transparent',
                color: '#b36a00',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              + Manage Categories
            </button>
          </div>

          <div>
            <label style={labelStyle}>Sub Category</label>
            <select
              value={form.subCategory}
              onChange={(event) =>
                updateField('subCategory', event.target.value)
              }
              style={inputStyle}
              disabled={!form.mainCategory}
            >
              <option value="">
                {form.mainCategory
                  ? 'Select sub category'
                  : 'Select main category first'}
              </option>

              {subCategoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Child Category"
            value={form.childCategory}
            onChange={(v) => updateField('childCategory', v)}
            placeholder="Optional"
          />
          <Field label="Colour" value={form.color} onChange={(v) => updateField('color', v)} />
          <Field label="Second Colour" value={form.secondaryColor} onChange={(v) => updateField('secondaryColor', v)} />

          {isGirlDress ? (
            <>
              <div>
                <label style={labelStyle}>Dress Type</label>
                <select
                  value={form.dressType}
                  onChange={(event) =>
                    updateField(
                      'dressType',
                      event.target.value,
                    )
                  }
                  style={inputStyle}
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
              </div>

              <Field
                label="Available Sizes"
                value={form.availableSizes}
                onChange={(v) =>
                  updateField('availableSizes', v)
                }
                placeholder="Example: 18, 20, 22"
              />

              <Field
                label="Dress Length"
                value={form.dressLength}
                onChange={(v) =>
                  updateField('dressLength', v)
                }
                placeholder="Example: 21 inch"
              />

              <Field
                label="Chest"
                value={form.chestSize}
                onChange={(v) =>
                  updateField('chestSize', v)
                }
                placeholder="Example: 24 inch"
              />

              <Field
                label="Waist"
                value={form.waistSize}
                onChange={(v) =>
                  updateField('waistSize', v)
                }
                placeholder="Example: 22 inch"
              />
            </>
          ) : (
            <Field
              label="Size"
              value={form.size}
              onChange={(v) =>
                updateField('size', v)
              }
            />
          )}

          <Field label="Material / Fabric" value={form.material} onChange={(v) => updateField('material', v)} />
          <Field label="Pattern / Style" value={form.pattern} onChange={(v) => updateField('pattern', v)} />
          <Field label="Gender / Audience" value={form.gender} onChange={(v) => updateField('gender', v)} />
        </div>

        {isGirlDress && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              border: '1px solid #d8eadf',
              borderRadius: 10,
              background: '#f3fbf6',
              color: '#27643f',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Age Group is taken automatically from Sub Category.
            Enter the actual available sizes and garment measurements for this design.
          </div>
        )}

        <div style={{ marginTop: 14 }}><label style={labelStyle}>Description</label><textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} /></div>
        <div style={{ marginTop: 14 }}><label style={labelStyle}>Highlights / Features</label><textarea value={form.highlights} onChange={(e) => updateField('highlights', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} /></div>
        <div style={{ marginTop: 14 }}><Field label="Search Tags" value={form.tags} onChange={(v) => updateField('tags', v)} placeholder="kids, sunglasses, pink, fancy" /></div>
      </Section>

      <Section title="Pricing">
        <div style={grid4}>
          <Field
            label="Purchase Cost"
            value={form.purchaseCost}
            onChange={(v) => updateField('purchaseCost', v)}
            type="number"
          />

          <Field
            label="MRP"
            value={form.mrp}
            onChange={(v) => updateField('mrp', v)}
            type="number"
          />

          <Field
            label="Selling Price"
            value={form.sellingPrice}
            onChange={(v) => updateField('sellingPrice', v)}
            type="number"
          />

          <div>
            <label style={labelStyle}>Offer</label>
            <input
              value={discount}
              readOnly
              placeholder="Auto calculated"
              style={{
                ...inputStyle,
                background: '#f7f7f7',
                color: '#9a5300',
                fontWeight: 800,
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 14, fontWeight: 800 }}>
          Selling Price: ₹{finalPrice || 0}
          {discount ? ` • ${discount}` : ''}
        </div>
      </Section>

      <Section title="Inventory">
        <div style={grid3}>
          <Field
            label="Stock Quantity"
            value={form.stockQty}
            onChange={(v) => updateField('stockQty', v)}
            type="number"
          />
          <Field
            label="Rack"
            value={form.rack}
            onChange={(v) => updateField('rack', v)}
            placeholder="Rack B"
          />
          <Field
            label="Box"
            value={form.box}
            onChange={(v) => updateField('box', v)}
            placeholder="Box 04"
          />
          <Field
            label="Slot"
            value={form.slot}
            onChange={(v) => updateField('slot', v)}
            placeholder="Slot 12"
          />
        </div>
      </Section>

      <Section title="Free Gift">
        <label style={checkRow}><input type="checkbox" checked={form.freeGiftEligible} onChange={(e) => updateField('freeGiftEligible', e.target.checked)} /> Product can be used as a free gift</label>
        {form.freeGiftEligible && <div style={{ maxWidth: 300, marginTop: 14 }}><Field label="Gift Cost / Value" value={form.freeGiftValue} onChange={(v) => updateField('freeGiftValue', v)} type="number" /></div>}
      </Section>

      <Section title="Status">
        <label style={checkRow}><input type="checkbox" checked={form.isActive} onChange={(e) => updateField('isActive', e.target.checked)} /> Active and visible in Shop</label>
      </Section>

      {message && <div style={messageBox}>{message}</div>}

      <button type="button" onClick={saveProduct} disabled={saving || uploadingAll} style={{ ...saveButton, opacity: saving || uploadingAll ? 0.6 : 1 }}>
        {saving ? 'Saving Product…' : 'Save Product'}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={sectionStyle}><h2 style={{ margin: '0 0 18px', fontSize: 19 }}>{title}</h2>{children}</section>;
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <div><label style={labelStyle}>{label}</label><input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} /></div>;
}

const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 };
const sectionStyle: React.CSSProperties = { background: 'white', border: '1px solid #e6e6e6', borderRadius: 18, padding: 22, marginBottom: 18 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 };
const mediaGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 };
const mediaCard: React.CSSProperties = { border: '1px solid #e4e4e4', borderRadius: 14, overflow: 'hidden', background: '#fff' };
const previewBox: React.CSSProperties = { height: 180, background: '#f1f2f4', display: 'grid', placeItems: 'center', overflow: 'hidden' };
const previewMedia: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };
const emptyMedia: React.CSSProperties = { border: '2px dashed #d8d8d8', borderRadius: 14, padding: 30, textAlign: 'center', color: '#777', background: '#fafafa' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 900, color: '#555' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', border: '1px solid #dcdcdc', borderRadius: 11, fontSize: 14, outline: 'none', background: '#fff' };
const helpText: React.CSSProperties = { marginTop: -6, marginBottom: 16, color: '#777', fontSize: 13 };
const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, cursor: 'pointer' };
const primaryButton: React.CSSProperties = { border: 0, background: '#111', color: '#fff', padding: '12px 16px', borderRadius: 11, fontWeight: 900, cursor: 'pointer' };
const aiButton: React.CSSProperties = { border: 0, background: '#f2b774', color: '#111', padding: '12px 16px', borderRadius: 11, fontWeight: 900, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { border: '1px solid #ddd', background: 'white', color: '#222', padding: '11px 16px', borderRadius: 11, fontWeight: 800, cursor: 'pointer' };
const removeButton: React.CSSProperties = { width: '100%', border: 0, background: '#f5f5f5', color: '#444', padding: '8px 10px', borderRadius: 9, fontWeight: 800, cursor: 'pointer' };
const saveButton: React.CSSProperties = { width: '100%', border: 0, background: '#111', color: 'white', padding: '16px 20px', borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: 'pointer', marginBottom: 40 };
const messageBox: React.CSSProperties = { marginBottom: 16, padding: 14, background: '#fff7e8', border: '1px solid #f2d8a5', borderRadius: 12, fontWeight: 700 };