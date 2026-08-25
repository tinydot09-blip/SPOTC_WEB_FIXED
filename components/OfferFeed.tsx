"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Bike,
  Eye,
  Flag,
  Gift,
  Heart,
  Play,
  Share2,
  ShoppingBag,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { getOffers, getProducts } from "@/lib/data";
import { auth, db, firebaseProjectId, firebaseReady } from "@/lib/firebase";
import { requireGoogleLogin } from "@/lib/auth";
import type { BusinessListing, BusinessProduct } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { num, text } from "@/lib/utils";
import { useDeliveryAvailability } from "@/lib/delivery-radius";

type OfferProduct = {
  title: string;
  price: number;
  oldPrice: number;
  discount: string;
  productId: string;
};

function getOrCreateVisitorSessionSeed(): string {
  if (typeof window === "undefined") return "server";

  const key = "spotc-visitor-session-seed";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;

  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, seed);
  return seed;
}

function seededHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shuffleOffersForVisitor(
  offers: BusinessListing[],
  visitorSeed: string,
): BusinessListing[] {
  return [...offers].sort((a, b) => {
    const aKey = `${visitorSeed}|offer|${text(a.id)}|${offerProductId(a)}`;
    const bKey = `${visitorSeed}|offer|${text(b.id)}|${offerProductId(b)}`;
    return seededHash(aKey) - seededHash(bKey);
  });
}

function dateValue(value: unknown): Date | null {
  if (!value) return null;

  if (typeof value === "object" && value !== null && "toDate" in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (fn) return fn.call(value);
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function expiryText(item: BusinessListing): string {
  const end = dateValue(item.offer_end_at);

  if (!end) {
    const direct = text(item.offer_end_text).trim();
    return direct ? direct.toUpperCase() : "LIMITED TIME OFFER";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);

  if (days < 0) return "OFFER ENDED";
  if (days === 0) return "OFFER ENDS TODAY";
  if (days === 1) return "OFFER ENDS IN 1 DAY";
  return `OFFER ENDS IN ${days} DAYS`;
}

function freeGiftCount(price: number): number {
  if (price < 80) return 0;
  if (price < 200) return 1;
  return Math.floor(price / 100);
}

function referenceId(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    return value.split("/").filter(Boolean).pop() ?? "";
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as { id?: string; path?: string };

    if (candidate.id) return candidate.id;
    if (candidate.path) {
      return candidate.path.split("/").filter(Boolean).pop() ?? "";
    }
  }

  return "";
}

function offerProductId(item: BusinessListing): string {
  const raw = item as BusinessListing & Record<string, unknown>;

  const directCandidates = [
    raw.product_id,
    raw.linked_product_id,
    raw.primary_product_id,
    raw.target_product_id,
    raw.business_product_id,
    raw.product_ref,
    raw.linked_product_ref,
    raw.primary_product_ref,
    raw.business_product_ref,
    raw.image1_product_id,
    raw.product1_id,
    raw.image1_product_ref,
    raw.product1_ref,
  ];

  for (const candidate of directCandidates) {
    const id = referenceId(candidate);
    if (id) return id;
  }

  const linkedIds = Array.isArray(raw.linked_product_ids)
    ? raw.linked_product_ids
    : Array.isArray(raw.product_ids)
      ? raw.product_ids
      : [];

  for (const candidate of linkedIds) {
    const id = referenceId(candidate);
    if (id) return id;
  }

  const offerProducts = Array.isArray(raw.offer_products)
    ? raw.offer_products
    : [];

  for (const entry of offerProducts) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;

    const id =
      referenceId(record.product_id) ||
      referenceId(record.productId) ||
      referenceId(record.id) ||
      referenceId(record.product_ref) ||
      referenceId(record.ref);

    if (id) return id;
  }

  return "";
}

function embeddedMainProduct(item: BusinessListing): OfferProduct | null {
  const raw = item as BusinessListing & Record<string, unknown>;

  for (let index = 1; index <= 5; index += 1) {
    const stockValue =
      raw[`image${index}_stock_qty`] ?? raw[`image${index}_stock_quantity`];

    const hasStockQuantity =
      raw[`image${index}_stock_qty`] != null ||
      raw[`image${index}_stock_quantity`] != null;

    if (raw[`image${index}_is_in_stock`] === false) continue;
    if (hasStockQuantity && num(stockValue) <= 0) continue;

    const productId =
      referenceId(raw[`image${index}_product_ref`]) ||
      referenceId(raw[`image${index}_product_id`]) ||
      referenceId(raw[`product${index}_ref`]) ||
      referenceId(raw[`product${index}_id`]);

    const title = text(
      raw[`image${index}_title`] ||
        raw[`product${index}_title`] ||
        raw.product_name ||
        raw.product_title ||
        raw.title,
    ).trim();

    const price = num(
      raw[`image${index}_price`] ??
        raw[`product${index}_price`] ??
        raw.offer_price ??
        raw.product_price ??
        raw.price,
    );

    const oldPrice = num(
      raw[`image${index}_old_price`] ??
        raw[`product${index}_old_price`] ??
        raw.old_price ??
        raw.original_price ??
        raw.mrp,
    );

    const rawDiscount = text(
      raw[`image${index}_discount`] ??
        raw[`product${index}_discount`] ??
        raw.discount ??
        raw.discount_percent,
    ).trim();

    const calculatedDiscount =
      oldPrice > price && price > 0
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

    // An embedded slot can still provide the display information even if
    // an old record does not contain a product reference.
    if (!title && price <= 0 && !productId) continue;

    return {
      title:
        title ||
        text(raw.offer_title || raw.offer_text || raw.caption).trim() ||
        "Product",
      price,
      oldPrice,
      discount: rawDiscount
        ? rawDiscount.includes("%")
          ? rawDiscount.toUpperCase().includes("OFF")
            ? rawDiscount
            : `${rawDiscount} OFF`
          : `${rawDiscount}% OFF`
        : calculatedDiscount
          ? `${calculatedDiscount}% OFF`
          : "",
      productId,
    };
  }

  return null;
}


function embeddedOfferProduct(
  item: BusinessListing,
): OfferProduct | null {
  const raw = item as BusinessListing & Record<string, unknown>;
  const offerProducts = Array.isArray(raw.offer_products)
    ? (raw.offer_products as Array<Record<string, unknown>>)
    : [];

  if (offerProducts.length === 0) return null;

  for (const candidate of offerProducts) {
    const productId =
      text(candidate.id || candidate.product_id || candidate.productId).trim() ||
      referenceId(candidate.product_ref || candidate.ref);

    const title = text(
      candidate.title ||
        candidate.product_name ||
        candidate.name ||
        raw.primary_product_title,
    ).trim();

    const price = num(
      candidate.offer_price ??
        candidate.price ??
        candidate.selling_price ??
        candidate.sale_price,
    );

    const oldPrice = num(
      candidate.old_price ??
        candidate.mrp ??
        candidate.original_price ??
        candidate.list_price,
    );

    const explicitDiscount = num(
      candidate.discount_percent ?? candidate.discount,
    );

    const calculatedDiscount =
      oldPrice > price && price > 0
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

    if (!title && price <= 0 && !productId) continue;

    return {
      title: title || 'Product',
      price,
      oldPrice,
      discount: explicitDiscount
        ? `${explicitDiscount}% OFF`
        : calculatedDiscount
          ? `${calculatedDiscount}% OFF`
          : '',
      productId,
    };
  }

  return null;
}

function linkedMainProduct(
  item: BusinessListing,
  allProducts: BusinessProduct[],
): OfferProduct | null {
  const offerId = text(item.id).trim();
  if (!offerId) return null;

  const product = allProducts.find((candidate) => {
    const raw = candidate as BusinessProduct & Record<string, unknown>;

    const linkedOfferIds = [
      raw.linked_video_ref,
      raw.linked_video_id,
      raw.linked_offer_ref,
      raw.linked_offer_id,
      raw.business_offer_ref,
      raw.offer_ref,
      raw.offer_id,
    ]
      .map(referenceId)
      .filter(Boolean);

    if (!linkedOfferIds.includes(offerId)) return false;
    if (candidate.isHidden === true) return false;
    if (candidate.isActive === false) return false;
    if (candidate.is_in_stock === false) return false;

    const hasStock =
      candidate.stock_qty != null || candidate.stock_quantity != null;

    if (
      hasStock &&
      num(candidate.stock_qty ?? candidate.stock_quantity) <= 0
    ) {
      return false;
    }

    return true;
  });

  if (!product) return null;

  const raw = product as BusinessProduct & Record<string, unknown>;

  const price = productSellingPrice(product);

  const oldPrice = num(
    raw.old_price ??
      raw.mrp ??
      raw.original_price ??
      raw.regular_price ??
      raw.list_price,
  );

  const explicitDiscount = num(
    raw.discount_percent ?? raw.discount ?? raw.suggested_discount,
  );

  const calculatedDiscount =
    oldPrice > price && price > 0
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : 0;

  return {
    title:
      text(raw.title || raw.product_name || raw.product_title).trim() ||
      text(item.offer_title || item.offer_text || item.caption).trim() ||
      "Product",
    price,
    oldPrice,
    discount: explicitDiscount
      ? `${explicitDiscount}% OFF`
      : calculatedDiscount
        ? `${calculatedDiscount}% OFF`
        : "",
    productId: text(raw.id || product.id).trim(),
  };
}

function listingFallbackProduct(item: BusinessListing): OfferProduct | null {
  const raw = item as BusinessListing & Record<string, unknown>;

  const title = text(
    raw.product_title ||
      raw.product_name ||
      raw.title ||
      raw.offer_title ||
      raw.offer_text ||
      raw.caption,
  ).trim();

  const price = num(
    raw.offer_price ?? raw.product_price ?? raw.sale_price ?? raw.price,
  );

  const oldPrice = num(
    raw.old_price ?? raw.original_price ?? raw.mrp ?? raw.list_price,
  );

  const explicitDiscount = num(raw.discount_percent ?? raw.discount);

  const calculatedDiscount =
    oldPrice > price && price > 0
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : 0;

  const productId =
    referenceId(raw.product_ref) ||
    referenceId(raw.product_id) ||
    referenceId(raw.linked_product_ref) ||
    referenceId(raw.linked_product_id);

  if (!title && price <= 0 && !productId) return null;

  return {
    title: title || "Product",
    price,
    oldPrice,
    discount: explicitDiscount
      ? `${explicitDiscount}% OFF`
      : calculatedDiscount
        ? `${calculatedDiscount}% OFF`
        : "",
    productId,
  };
}


function productVideoUrl(product: BusinessProduct): string {
  const raw = product as BusinessProduct & Record<string, unknown>;

  const direct = text(
    raw.product_video_url ||
      raw.video_url ||
      raw.playback_480_url ||
      raw.playback_720_url ||
      raw.playback_url ||
      raw.business_video_url,
  ).trim();

  if (direct) return direct;

  if (Array.isArray(raw.media)) {
    const media = raw.media as Array<Record<string, unknown>>;
    const videoItem = media.find((item) => {
      const type = text(item.type).trim().toLowerCase();
      const role = text(item.role).trim().toLowerCase();
      const slot = text(item.slot).trim().toLowerCase();

      return (
        type === "video" ||
        role === "video" ||
        slot === "product_video"
      );
    });

    const mediaUrl = text(
      videoItem?.url ||
        videoItem?.video_url ||
        videoItem?.playback_url,
    ).trim();

    if (mediaUrl) return mediaUrl;
  }

  if (Array.isArray(raw.product_media)) {
    const media = raw.product_media as Array<Record<string, unknown>>;
    const videoItem = media.find((item) => {
      const type = text(item.type).trim().toLowerCase();
      const role = text(item.role).trim().toLowerCase();
      const slot = text(item.slot).trim().toLowerCase();

      return (
        type === "video" ||
        role === "video" ||
        slot === "product_video"
      );
    });

    return text(
      videoItem?.url ||
        videoItem?.video_url ||
        videoItem?.playback_url,
    ).trim();
  }

  return "";
}

function productSellingPrice(product: BusinessProduct): number {
  const raw = product as BusinessProduct & Record<string, unknown>;

  const offerPrice = num(raw.offer_price);
  const sellingPrice = num(raw.selling_price);
  const salePrice = num(raw.sale_price);
  const price = num(raw.price);
  const mrp = num(raw.mrp ?? raw.old_price);

  if (offerPrice > 0) return offerPrice;
  if (sellingPrice > 0) return sellingPrice;
  if (salePrice > 0) return salePrice;
  if (price > 0) return price;
  return mrp;
}

function productOldPrice(product: BusinessProduct): number {
  const raw = product as BusinessProduct & Record<string, unknown>;
  return num(
    raw.mrp ??
      raw.old_price ??
      raw.original_price ??
      raw.regular_price ??
      raw.list_price,
  );
}

function productOfferListing(
  product: BusinessProduct,
): BusinessListing | null {
  const raw = product as BusinessProduct & Record<string, unknown>;
  const videoUrl = productVideoUrl(product);

  if (!videoUrl) return null;
  if (product.isHidden === true) return null;
  if (product.isActive === false) return null;
  if (product.is_in_stock === false) return null;

  const hasStock =
    product.stock_qty != null || product.stock_quantity != null;

  if (
    hasStock &&
    num(product.stock_qty ?? product.stock_quantity) <= 0
  ) {
    return null;
  }

  const productId = text(raw.id || product.id).trim();
  if (!productId) return null;

  const price = productSellingPrice(product);
  const oldPrice = productOldPrice(product);
  const explicitDiscount = num(
    raw.discount_percent ?? raw.discount ?? raw.suggested_discount,
  );
  const calculatedDiscount =
    oldPrice > price && price > 0
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : 0;

  const title =
    text(raw.title || raw.product_name || raw.product_title).trim() ||
    "Product";

  /*
   * Convert a BusinessProduct with an uploaded product video into the same
   * shape already consumed by OfferCard. No duplicate Firestore offer record
   * is required.
   */
  return {
    ...(raw as unknown as BusinessListing),
    id: `product-video-${productId}`,
    business_video_url: videoUrl,
    playback_url: videoUrl,
    offer_title: title,
    product_title: title,
    product_name: title,
    product_id: productId,
    linked_product_id: productId,
    offer_price: price,
    price,
    old_price: oldPrice,
    mrp: oldPrice,
    discount_percent: explicitDiscount || calculatedDiscount,
    isActive: true,
    approved: true,
    isApproved: true,
    approval_status: "approved",
    processing_status: "ready",
    created_at: raw.updated_at || raw.created_at || null,
  } as BusinessListing;
}

function OfferCard({
  item,
  index,
  allProducts,
  delivery,
}: {
  item: BusinessListing;
  index: number;
  allProducts: BusinessProduct[];
  delivery: ReturnType<typeof useDeliveryAvailability>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [user, setUser] = useState<User | null>(
    auth?.currentUser && !auth.currentUser.isAnonymous
      ? auth.currentUser
      : null,
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  const video = text(
    item.playback_480_url ||
      item.playback_720_url ||
      item.playback_url ||
      item.business_video_url,
  );

  const offerId = text(item.id).trim();

  const directProductId = useMemo(
    () => offerProductId(item),
    [item],
  );

  const product = useMemo(() => {
    const resolved =
      linkedMainProduct(item, allProducts) ??
      embeddedOfferProduct(item) ??
      embeddedMainProduct(item) ??
      listingFallbackProduct(item);

    if (resolved?.productId) {
      return resolved;
    }

    if (resolved && directProductId) {
      return {
        ...resolved,
        productId: directProductId,
      };
    }

    if (directProductId) {
      const exactProduct = allProducts.find(
        (candidate) => text(candidate.id).trim() === directProductId,
      );

      if (exactProduct) {
        const raw = exactProduct as BusinessProduct & Record<string, unknown>;
        const price = productSellingPrice(exactProduct);
        const oldPrice = productOldPrice(exactProduct);
        const calculatedDiscount =
          oldPrice > price && price > 0
            ? Math.round(((oldPrice - price) / oldPrice) * 100)
            : 0;

        return {
          title:
            text(raw.title || raw.product_name || raw.product_title).trim() ||
            text(item.offer_title || item.offer_text || item.caption).trim() ||
            "Product",
          price,
          oldPrice,
          discount: calculatedDiscount
            ? `${calculatedDiscount}% OFF`
            : "",
          productId: directProductId,
        };
      }
    }

    return resolved;
  }, [allProducts, directProductId, item]);

  const resolvedProductId = product?.productId || directProductId;

  const productHref = resolvedProductId
    ? `/product/${resolvedProductId}`
    : "/shop";

  const buyHref = resolvedProductId
    ? `/product/${resolvedProductId}`
    : "/shop";

  const productTitle =
    product?.title ||
    text(item.offer_title || item.offer_text || item.caption).trim() ||
    "SPOTC Offer";

  const productPrice = product?.price ?? 0;
  const oldPrice = product?.oldPrice ?? 0;
  const discount = product?.discount ?? "";
  const expiry = expiryText(item);
  const giftCount = freeGiftCount(productPrice);

  useEffect(() => {
    if (!auth) return;

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser && !currentUser.isAnonymous ? currentUser : null);
    });
  }, []);

  useEffect(() => {
    let active = true;

    if (!db || !user || !offerId) {
      setSaved(false);
      return () => {
        active = false;
      };
    }

    getDoc(doc(db, "SavedOffers", `${user.uid}_${offerId}`))
      .then((snapshot) => {
        if (active) setSaved(snapshot.exists());
      })
      .catch((error) => {
        console.error("Loading saved offer failed:", error);
        if (active) setSaved(false);
      });

    return () => {
      active = false;
    };
  }, [offerId, user]);

  const toggleSavedOffer = async () => {
    if (!db || saving) return;

    const currentUser = user ?? (await requireGoogleLogin());
    if (!currentUser) return;

    if (!offerId) {
      window.alert("This offer does not have a valid ID.");
      return;
    }

    setUser(currentUser);
    setSaving(true);

    const savedRef = doc(db, "SavedOffers", `${currentUser.uid}_${offerId}`);

    try {
      if (saved) {
        await deleteDoc(savedRef);
        setSaved(false);
        return;
      }

      const offerRef = doc(db, "BusinessListings", offerId);

      await setDoc(savedRef, {
        user_uid: currentUser.uid,
        uid: currentUser.uid,
        user_ref: doc(db, "users", currentUser.uid),

        item_type: "offer",
        saved_type: "offer",

        offer_id: offerId,
        target_id: offerId,
        offer_ref: offerRef,
        business_offer_ref: offerRef,
        item_ref: offerRef,

        product_id: resolvedProductId || "",
        product_title: productTitle,
        title: productTitle,
        offer_title: productTitle,

        price: productPrice,
        old_price: oldPrice,
        discount,

        offer_end_at: item.offer_end_at || null,
        expires_at: item.offer_end_at || null,
        isActive: item.isActive !== false,
        is_active: item.isActive !== false,

        web_url: productHref,
        saved_at: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setSaved(true);
    } catch (error) {
      console.error("Saving offer failed:", error);
      window.alert(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : "Save failed. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
          videoElement
            .play()
            .then(() => setPlaying(true))
            .catch(() => undefined);
        } else {
          videoElement.pause();
          setPlaying(false);
        }
      },
      { threshold: [0.3, 0.72] },
    );

    observer.observe(videoElement);
    return () => observer.disconnect();
  }, []);

  const togglePlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.paused) {
      videoElement
        .play()
        .then(() => setPlaying(true))
        .catch(() => undefined);
    } else {
      videoElement.pause();
      setPlaying(false);
    }
  };

  const share = async () => {
    const shareData = {
      title: productTitle,
      text: `View ${productTitle} on SPOTC`,
      url: `${location.origin}${productHref}`,
    };

    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(shareData.url);
    }
  };

  return (
    <div
      className="offer-desktop-layout spotc-product-offer-layout"
      aria-label={`${productTitle} offer ${index + 1}`}
    >
      <article className="offer-slide spotc-product-offer-slide">
        <div className="offer-media" onClick={togglePlayback}>
          {video ? (
            <video
              ref={videoRef}
              src={video}
              playsInline
              loop
              muted={muted}
              preload="metadata"
            />
          ) : (
            <div className="offer-video-missing">Video unavailable</div>
          )}

          <div className="offer-shade" />

          {!playing && video && (
            <div className="offer-play">
              <Play fill="currentColor" />
            </div>
          )}
        </div>

        <div className="offer-top-overlay">
          <div className="offer-delivery-chip">
            <Bike size={14} />
            <span>15 MINS DELIVERY</span>
          </div>

          <button
            className="glass-icon"
            type="button"
            aria-label={muted ? "Unmute video" : "Mute video"}
            onClick={(event) => {
              event.stopPropagation();
              setMuted((value) => !value);
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
        </div>

        <div className="offer-action-rail">
          <div className="rail-item">
            <Eye />
            <span>{num(item.views ?? item.views_count)}</span>
          </div>

          <button
            className={`rail-item ${saved ? "liked" : ""}`}
            type="button"
            aria-label={saved ? "Remove saved offer" : "Save offer"}
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation();
              void toggleSavedOffer();
            }}
          >
            <Heart fill={saved ? "currentColor" : "none"} />
            <span>{saving ? "Saving…" : saved ? "Saved" : "Save"}</span>
          </button>

          <button
            className="rail-item"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void share();
            }}
          >
            <Share2 />
            <span>Share</span>
          </button>

          <button
            className="rail-item"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              window.alert("Report submitted for review");
            }}
          >
            <Flag />
            <span>Report</span>
          </button>
        </div>

        <div className="offer-content spotc-product-offer-content">
          <div className="spotc-product-offer-card">
            <h2>{productTitle}</h2>

            <div className="spotc-product-price-row">
              {productPrice > 0 ? (
                <strong className="spotc-product-price">₹{productPrice}</strong>
              ) : (
                <strong className="spotc-product-price">View price</strong>
              )}

              {oldPrice > productPrice && productPrice > 0 && (
                <del className="spotc-product-old-price">₹{oldPrice}</del>
              )}

              {discount && (
                <span className="spotc-product-discount">{discount}</span>
              )}
            </div>

            <div className="spotc-product-offer-meta">
              {giftCount > 0 && (
                <>
                  <span className="spotc-free-gift">
                    <Gift size={15} />
                    {giftCount} FREE {giftCount === 1 ? "gift" : "gifts"} included
                  </span>

                  <span className="spotc-offer-dot" aria-hidden="true">
                    •
                  </span>
                </>
              )}

              <span className="spotc-offer-expiry">{expiry}</span>
            </div>

            <div className="spotc-product-cta-row">
              <Link className="spotc-view-product" href={productHref}>
                <ShoppingBag size={18} />
                View Product
              </Link>

              {delivery.canPurchase ? (
                <Link className="spotc-buy-now" href={buyHref}>
                  Buy Now
                </Link>
              ) : delivery.status === "outside" ? (
                <button
                  type="button"
                  className="spotc-buy-now spotc-buy-now-disabled"
                  title="Ordering will be available in your area shortly"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  Buy Now
                </button>
              ) : (
                <button
                  type="button"
                  className="spotc-buy-now"
                  title="Allow location to check delivery availability"
                  onClick={(event) => {
                    event.stopPropagation();
                    delivery.requestLocation();
                  }}
                >
                  Buy Now
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      <style jsx global>{`
        .offers-page .spotc-product-offer-layout {
          width: min(100%, 560px) !important;
          max-width: 560px !important;
          margin: 0 auto !important;
          grid-template-columns: 1fr !important;
        }

        .offers-page .spotc-product-offer-slide {
          width: 100% !important;
          max-width: 560px !important;
        }

        .offers-page .spotc-product-offer-content {
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          padding: 0 14px 16px !important;
          z-index: 16 !important;
          pointer-events: none;
        }

        .offers-page .spotc-product-offer-card {
          width: 100%;
          padding: 14px 15px 15px;
          border: 1px solid rgba(255, 255, 255, 0.20);
          border-radius: 18px;
          background: linear-gradient(
            180deg,
            rgba(8, 8, 8, 0.20) 0%,
            rgba(8, 8, 8, 0.38) 100%
          );
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          box-sizing: border-box;
          pointer-events: auto;
        }

        .offers-page .spotc-product-offer-card h2 {
          margin: 0;
          color: #ffffff;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.01em;
          text-shadow: none;
        }

        .offers-page .spotc-product-price-row {
          margin-top: 8px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
        }

        .offers-page .spotc-product-price {
          color: #ffffff;
          font-size: 30px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
        }

        .offers-page .spotc-product-old-price {
          color: rgba(255, 255, 255, 0.58);
          font-size: 16px;
          font-weight: 500;
          line-height: 1;
        }

        .offers-page .spotc-product-discount {
          min-height: 27px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-radius: 999px;
          color: #1d1406;
          background: linear-gradient(180deg, #f7c45f 0%, #f4a91d 100%);
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0.02em;
          box-shadow: 0 6px 18px rgba(245, 158, 11, 0.16);
        }

        .offers-page .spotc-product-offer-meta {
          margin-top: 10px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
          color: rgba(255, 255, 255, 0.83);
          font-size: 13px;
          font-weight: 500;
          line-height: 1.25;
        }

        .offers-page .spotc-free-gift {
          min-height: 28px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(247, 183, 51, 0.42);
          border-radius: 9px;
          color: #3a2505;
          background: rgba(255, 250, 240, 0.96);
          font-weight: 600;
          line-height: 1;
          box-sizing: border-box;
          white-space: nowrap;
          text-shadow: none;
        }

        .offers-page .spotc-free-gift svg {
          color: #e59b11;
          flex: 0 0 auto;
        }

        .offers-page .spotc-offer-dot {
          color: rgba(255, 255, 255, 0.38);
        }

        .offers-page .spotc-offer-expiry {
          color: #f6c25c;
          font-weight: 600;
          text-transform: uppercase;
        }

        .offers-page .spotc-product-cta-row {
          margin-top: 13px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .offers-page .spotc-product-cta-row > a,
        .offers-page .spotc-product-cta-row > button {
          min-width: 0;
          height: 46px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 13px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          line-height: 1;
          text-decoration: none;
          text-shadow: none;
          box-sizing: border-box;
          transition:
            transform 140ms ease,
            opacity 140ms ease,
            box-shadow 140ms ease;
        }

        .offers-page .spotc-product-cta-row > a:active,
        .offers-page .spotc-product-cta-row > button:active {
          transform: scale(0.985);
        }

        .offers-page .spotc-view-product {
          border: 1px solid rgba(255, 255, 255, 0.34);
          color: #ffffff;
          background: rgba(255, 255, 255, 0.07);
        }

        .offers-page .spotc-buy-now {
          border: 1px solid #f4ad28;
          color: #241705;
          background: linear-gradient(180deg, #f7c45f 0%, #f4a91d 100%);
          box-shadow: none;
        }

        .offers-page .spotc-buy-now-disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        .offers-page .offer-top-overlay {
          position: absolute;
          top: 16px;
          left: 16px;
          right: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 20;
        }

        .offers-page .offer-delivery-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 14px;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.2px;
          box-shadow: 0 8px 22px rgba(22, 163, 74, 0.3);
        }

        .offers-page .offer-delivery-chip svg {
          width: 15px;
          height: 15px;
          flex: 0 0 15px;
        }

        .offers-page .offer-shade {
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.00) 48%,
            rgba(0, 0, 0, 0.18) 66%,
            rgba(0, 0, 0, 0.62) 100%
          ) !important;
        }

        .offers-page .spotc-product-offer-card h2,
        .offers-page .spotc-product-price,
        .offers-page .spotc-product-old-price,
        .offers-page .spotc-product-offer-meta,
        .offers-page .spotc-product-cta-row > a,
        .offers-page .spotc-product-cta-row > button {
          text-shadow: none;
        }

        .offers-page .offer-video-missing {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.78);
          background: #050505;
          font-size: 14px;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .offers-page .spotc-product-offer-layout,
          .offers-page .spotc-product-offer-slide {
            width: 100% !important;
            max-width: 100% !important;
          }

          .offers-page .offer-top-overlay {
            top: 12px;
            left: 12px;
            right: 12px;
          }

          .offers-page .offer-delivery-chip {
            height: 30px;
            padding: 0 12px;
            font-size: 11px;
          }

          .offers-page .offer-delivery-chip svg {
            width: 13px;
            height: 13px;
          }

          .offers-page .spotc-product-offer-content {
            padding: 0 11px calc(11px + env(safe-area-inset-bottom)) !important;
          }

          .offers-page .spotc-product-offer-card {
            padding: 13px;
            border-radius: 17px;
          }

          .offers-page .spotc-product-offer-card h2 {
            max-width: calc(100% - 56px);
            font-size: 17px;
          }

          .offers-page .spotc-product-price {
            font-size: 27px;
          }

          .offers-page .spotc-product-old-price {
            font-size: 15px;
          }

          .offers-page .spotc-product-offer-meta {
            font-size: 12px;
          }

          .offers-page .spotc-product-cta-row {
            margin-top: 11px;
            gap: 8px;
          }

          .offers-page .spotc-product-cta-row > a,
        .offers-page .spotc-product-cta-row > button {
            height: 44px;
            padding: 0 10px;
            border-radius: 12px;
            font-size: 13px;
          }
        }

        @media (max-width: 380px) {
          .offers-page .spotc-product-offer-card {
            padding: 12px;
          }

          .offers-page .spotc-product-price {
            font-size: 25px;
          }

          .offers-page .spotc-product-offer-meta {
            gap: 5px;
            font-size: 11px;
          }

          .offers-page .spotc-product-cta-row > a,
        .offers-page .spotc-product-cta-row > button {
            height: 42px;
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export function OfferFeed() {
  const delivery = useDeliveryAvailability();
  const [outsideNoticeClosed, setOutsideNoticeClosed] = useState(false);
  const [items, setItems] = useState<BusinessListing[] | null>(null);
  const feedRef = useRef<HTMLElement>(null);
  const [allProducts, setAllProducts] = useState<BusinessProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visitorSeed, setVisitorSeed] = useState("server");

  useEffect(() => {
    setVisitorSeed(getOrCreateVisitorSessionSeed());
  }, []);

  useEffect(() => {
    const onSearch = (event: Event) =>
      setSearch(String((event as CustomEvent<string>).detail || ""));

    window.addEventListener("spotc-page-search", onSearch);

    return () => {
      window.removeEventListener("spotc-page-search", onSearch);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getOffers()
      .then((offers) => {
        if (!cancelled) {
          setItems(offers);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;

        setError(reason instanceof Error ? reason.message : String(reason));
        setItems([]);
      });

    getProducts()
      .then((products) => {
        if (!cancelled) {
          setAllProducts(products);
        }
      })
      .catch((reason: unknown) => {
        console.error("Could not load offer products:", reason);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const combinedItems = useMemo(() => {
    const regularOffers = items || [];

    const productVideoOffers = allProducts
      .map(productOfferListing)
      .filter(
        (item): item is BusinessListing => item !== null,
      );

    /*
     * If the exact same video already exists as a normal BusinessListing
     * offer, keep the normal offer and do not add a duplicate product card.
     */
    const existingVideos = new Set(
      regularOffers
        .map((item) =>
          text(
            item.playback_480_url ||
              item.playback_720_url ||
              item.playback_url ||
              item.business_video_url,
          ).trim(),
        )
        .filter(Boolean)
        .map((url) =>
          decodeURIComponent(url.split("?")[0])
            .trim()
            .toLowerCase(),
        ),
    );

    const uniqueProductVideos = productVideoOffers.filter((item) => {
      const url = text(
        item.playback_url || item.business_video_url,
      ).trim();

      if (!url) return false;

      const normalized = decodeURIComponent(url.split("?")[0])
        .trim()
        .toLowerCase();

      return !existingVideos.has(normalized);
    });

    return [...regularOffers, ...uniqueProductVideos];
  }, [allProducts, items]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    const seenVideos = new Set<string>();
    const now = new Date();

    const result = combinedItems.filter((item) => {
      const videoUrl = text(
        item.playback_480_url ||
          item.playback_720_url ||
          item.playback_url ||
          item.business_video_url,
      );

      if (!videoUrl) return false;

      const normalizedVideo = decodeURIComponent(videoUrl.split("?")[0])
        .trim()
        .toLowerCase();

      if (!normalizedVideo || seenVideos.has(normalizedVideo)) return false;
      if (item.isActive === false) return false;

      const approvalStatus = text(
        item.approval_status || item.status,
      )
        .trim()
        .toLowerCase();

      const isApproved =
        item.approved === true ||
        item.isApproved === true ||
        approvalStatus === "approved";

      if (!isApproved) return false;

      const processingStatus = text(item.processing_status).toLowerCase();
      if (processingStatus && processingStatus !== "ready") return false;

      const endDate = dateValue(item.offer_end_at);
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
        if (endDate.getTime() < now.getTime()) return false;
      }

      if (query) {
        const mainProduct =
          linkedMainProduct(item, allProducts) ??
          embeddedOfferProduct(item) ??
          embeddedMainProduct(item) ??
          listingFallbackProduct(item);

        const searchable = [
          mainProduct?.title,
          item.category,
          item.offer_title,
          item.offer_text,
          item.caption,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(query)) return false;
      }

      seenVideos.add(normalizedVideo);
      return true;
    });

    // Keep search results predictable. Normal offer browsing is mixed per visitor session.
    if (query) return result;

    return shuffleOffersForVisitor(result, visitorSeed);
  }, [allProducts, combinedItems, search, visitorSeed]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const getSlides = (): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(".offer-desktop-layout"),
      );

    const scrollSlide = (direction: number) => {
      const slides = getSlides();
      if (!slides.length) return;

      const containerTop = container.getBoundingClientRect().top;

      let currentIndex = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      slides.forEach((slide, slideIndex) => {
        const distance = Math.abs(
          slide.getBoundingClientRect().top - containerTop,
        );

        if (distance < smallestDistance) {
          smallestDistance = distance;
          currentIndex = slideIndex;
        }
      });

      const nextIndex = Math.max(
        0,
        Math.min(slides.length - 1, currentIndex + direction),
      );

      slides[nextIndex].scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        scrollSlide(1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        scrollSlide(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        const firstSlide = getSlides()[0];

        firstSlide?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const slides = getSlides();
        const lastSlide = slides[slides.length - 1];

        lastSlide?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filtered.length]);

  if (items === null) {
    return (
      <section
        className="offer-feed"
        aria-busy="true"
        aria-label="Loading offers"
      >
        <div
          style={{
            width: "min(100%, 560px)",
            height: "100%",
            minHeight: "100%",
            margin: "0 auto",
            background:
              "linear-gradient(110deg, #090909 25%, #181818 42%, #090909 58%)",
            backgroundSize: "220% 100%",
            animation: "offerLoadingShimmer 1.2s linear infinite",
          }}
        />

        <style jsx>{`
          @keyframes offerLoadingShimmer {
            0% {
              background-position: 100% 0;
            }
            100% {
              background-position: -100% 0;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            div {
              animation: none !important;
            }
          }
        `}</style>
      </section>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Firebase could not load offers"
        body={`${error} Project: ${firebaseProjectId}`}
      />
    );
  }

  if (!firebaseReady) {
    return (
      <EmptyState
        title="Firebase configuration is missing"
        body="Check .env.local"
      />
    );
  }

  return (
    <>
      {delivery.status === "outside" && !outsideNoticeClosed && (
        <div
          className="spotc-area-top-overlay"
          role="status"
          aria-live="polite"
        >
          <div className="spotc-area-top-overlay__copy">
            <strong>SPOTC is coming to your area shortly</strong>
            <span>
              Browse all products now. Ordering will be available when SPOTC launches in your area.
            </span>
          </div>

          <button
            type="button"
            className="spotc-area-top-overlay__close"
            aria-label="Close area availability message"
            onClick={() => setOutsideNoticeClosed(true)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <section ref={feedRef} className="offer-feed" tabIndex={0}>
        {filtered.map((item, index) => (
          <OfferCard
            item={item}
            index={index}
            allProducts={allProducts}
            delivery={delivery}
            key={item.id}
          />
        ))}
      </section>

      {!filtered.length && (
        <EmptyState
          title="No offers found"
          body="Try another product or category."
        />
      )}

      <style jsx global>{`
        .offers-page .spotc-area-top-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100000;
          min-height: 58px;
          padding: 10px 54px 10px 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          color: #ffffff;
          background: #4b1715;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
        }

        .offers-page .spotc-area-top-overlay__copy {
          width: min(100%, 980px);
          display: flex;
          align-items: baseline;
          justify-content: center;
          flex-wrap: wrap;
          gap: 4px 9px;
          text-align: center;
        }

        .offers-page .spotc-area-top-overlay__copy strong {
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.35;
        }

        .offers-page .spotc-area-top-overlay__copy span {
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          font-weight: 500;
          line-height: 1.4;
        }

        .offers-page .spotc-area-top-overlay__close {
          position: absolute;
          top: 50%;
          right: 14px;
          width: 34px;
          height: 34px;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }

        @media (max-width: 760px) {
          .offers-page .spotc-area-top-overlay {
            min-height: 64px;
            padding: 9px 48px 9px 12px;
          }

          .offers-page .spotc-area-top-overlay__copy {
            display: grid;
            gap: 2px;
            justify-items: start;
            text-align: left;
          }

          .offers-page .spotc-area-top-overlay__copy strong {
            font-size: 12px;
          }

          .offers-page .spotc-area-top-overlay__copy span {
            font-size: 10.5px;
          }

          .offers-page .spotc-area-top-overlay__close {
            right: 10px;
            width: 32px;
            height: 32px;
          }
        }
      `}</style>
    </>
  );
}