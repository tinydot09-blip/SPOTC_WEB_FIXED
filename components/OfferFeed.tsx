"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  BadgeCheck,
  Eye,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
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
import { num, slugify, text } from "@/lib/utils";

type OfferProduct = {
  image: string;
  title: string;
  price: number;
  oldPrice: number;
  discount: string;
  productId: string;
};


const QUICK_ENQUIRY_QUESTIONS = [
  "Is this offer available?",
  "What is the final price?",
  "Do you have other colours or sizes?",
  "Can I visit your shop today?",
  "Please share more photos.",
  "I want to buy this product.",
] as const;

function QuickEnquirySheet({
  open,
  businessName,
  businessLogo,
  offerTitle,
  whatsappNumber,
  onClose,
}: {
  open: boolean;
  businessName: string;
  businessLogo: string;
  offerTitle: string;
  whatsappNumber: string;
  onClose: () => void;
}) {
  const [selectedQuestion, setSelectedQuestion] = useState<
    (typeof QUICK_ENQUIRY_QUESTIONS)[number]
  >(QUICK_ENQUIRY_QUESTIONS[0]);
  const [customMessage, setCustomMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setSelectedQuestion(QUICK_ENQUIRY_QUESTIONS[0]);
      setCustomMessage("");
    }
  }, [open]);

  if (!open || !mounted) return null;

  const continueToWhatsApp = () => {
    const cleanNumber = whatsappNumber.replace(/\D/g, "");

    if (!cleanNumber) {
      window.alert("WhatsApp number is not available.");
      return;
    }

    const enquiry = customMessage.trim() || selectedQuestion;

    const message = [
      `Hi ${businessName},`,
      "",
      "I saw this offer on SPOTC.",
      "",
      "Offer:",
      offerTitle,
      "",
      "My enquiry:",
      enquiry,
      "",
      "Thank you.",
    ].join("\n");

    window.open(
      `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );

    onClose();
  };

  return createPortal(
    <div
      className="spotc-enquiry-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="spotc-enquiry-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spotc-enquiry-title"
      >
        <div className="spotc-enquiry-handle" />

        <header className="spotc-enquiry-header">
          <div>
            <small>QUICK ENQUIRY</small>
            <h2 id="spotc-enquiry-title">Ask the business</h2>
          </div>

          <button
            type="button"
            className="spotc-enquiry-close"
            aria-label="Close enquiry"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>

        <div className="spotc-enquiry-business">
          <div className="spotc-enquiry-logo">
            {businessLogo ? (
              <img src={businessLogo} alt={`${businessName} logo`} />
            ) : (
              <span>{businessName.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div>
            <strong>{businessName}</strong>
            <small>{offerTitle}</small>
          </div>
        </div>

        <p className="spotc-enquiry-label">Choose a question</p>

        <div className="spotc-enquiry-options">
          {QUICK_ENQUIRY_QUESTIONS.map((question) => {
            const active = selectedQuestion === question;

            return (
              <button
                key={question}
                type="button"
                className={
                  active
                    ? "spotc-enquiry-option spotc-enquiry-option-active"
                    : "spotc-enquiry-option"
                }
                onClick={() => {
                  setSelectedQuestion(question);
                  setCustomMessage("");
                }}
              >
                <span>{question}</span>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <label className="spotc-enquiry-custom">
          <span>Or type your own message</span>
          <textarea
            value={customMessage}
            maxLength={300}
            rows={3}
            placeholder="Write your question here..."
            onChange={(event) => setCustomMessage(event.target.value)}
          />
          <small>{customMessage.length}/300</small>
        </label>

        <button
          type="button"
          className="spotc-enquiry-continue"
          onClick={continueToWhatsApp}
        >
          <MessageCircle size={21} />
          Continue to WhatsApp
        </button>

        <p className="spotc-enquiry-note">
          The business will reply directly on WhatsApp.
        </p>
      </section>

      <style jsx global>{`
        .spotc-enquiry-backdrop {
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          z-index: 2147483646 !important;
          width: 100vw !important;
          height: 100dvh !important;
          margin: 0 !important;
          padding: 18px !important;
          display: flex !important;
          align-items: flex-end !important;
          justify-content: center !important;
          overflow: hidden !important;
          background: rgba(0, 0, 0, 0.68) !important;
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          box-sizing: border-box !important;
          isolation: isolate !important;
        }

        .spotc-enquiry-sheet {
          position: relative !important;
          z-index: 1 !important;
          width: min(100%, 520px) !important;
          max-height: calc(100dvh - 24px) !important;
          margin: 0 !important;
          padding: 10px 18px calc(18px + env(safe-area-inset-bottom)) !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          -webkit-overflow-scrolling: touch;
          box-sizing: border-box !important;
          border: 1px solid #e8e1d7;
          border-radius: 25px 25px 18px 18px;
          color: #1d1a17;
          background: #fffdf9;
          box-shadow: 0 -20px 70px rgba(0, 0, 0, 0.28);
          animation: spotcEnquiryUp 220ms ease-out;
        }

        @keyframes spotcEnquiryUp {
          from {
            opacity: 0;
            transform: translateY(28px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .spotc-enquiry-handle {
          width: 46px;
          height: 5px;
          margin: 1px auto 12px;
          border-radius: 999px;
          background: #d8d0c5;
        }

        .spotc-enquiry-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .spotc-enquiry-header small {
          color: #8a7d6c;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .spotc-enquiry-header h2 {
          margin: 4px 0 0;
          font-size: 28px;
          line-height: 1.15;
          font-weight: 700;
        }

        .spotc-enquiry-close {
          width: 38px;
          height: 38px;
          padding: 0;
          display: grid;
          place-items: center;
          flex: 0 0 38px;
          border: 1px solid #e1d9ce;
          border-radius: 50%;
          color: #29241f;
          background: #fff;
          cursor: pointer;
        }

        .spotc-enquiry-business {
          margin-top: 15px;
          padding: 11px;
          display: flex;
          align-items: center;
          gap: 11px;
          border: 1px solid #ebe4da;
          border-radius: 16px;
          background: #f7f2ea;
        }

        .spotc-enquiry-logo {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          flex: 0 0 48px;
          overflow: hidden;
          border-radius: 13px;
          color: #fff;
          background: #211d19;
          font-size: 18px;
          font-weight: 900;
        }

        .spotc-enquiry-logo img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .spotc-enquiry-business > div:last-child {
          min-width: 0;
        }

        .spotc-enquiry-business strong,
        .spotc-enquiry-business small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .spotc-enquiry-business strong {
          font-size: 19px;
          font-weight: 700;
        }

        .spotc-enquiry-business small {
          margin-top: 4px;
          color: #746b61;
          font-size: 15px;
          font-weight: 500;
        }

        .spotc-enquiry-label {
          margin: 17px 0 9px;
          font-size: 18px;
          font-weight: 600;
        }

        .spotc-enquiry-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .spotc-enquiry-option {
          min-height: 58px;
          padding: 12px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border: 1px solid #ddd5ca;
          border-radius: 13px;
          color: #312b25;
          background: #fff;
          font-family: inherit;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.4;
          text-align: left;
          cursor: pointer;
        }

        .spotc-enquiry-option i {
          width: 15px;
          height: 15px;
          flex: 0 0 15px;
          border: 2px solid #c5baab;
          border-radius: 50%;
        }

        .spotc-enquiry-option-active {
          border-color: #159447;
          background: #f0fbf4;
          box-shadow: inset 0 0 0 1px #159447;
        }

        .spotc-enquiry-option-active i {
          border: 4px solid #159447;
          background: #fff;
        }

        .spotc-enquiry-custom {
          position: relative;
          margin-top: 14px;
          display: block;
        }

        .spotc-enquiry-custom > span {
          display: block;
          margin-bottom: 7px;
          font-size: 17px;
          font-weight: 600;
        }

        .spotc-enquiry-custom textarea {
          width: 100%;
          min-height: 82px;
          padding: 11px 12px 25px;
          resize: none;
          border: 1px solid #ddd5ca;
          border-radius: 13px;
          outline: none;
          color: #29241f;
          background: #fff;
          font-family: inherit;
          font-size: 17px;
          font-weight: 400;
          line-height: 1.5;
          box-sizing: border-box;
        }

        .spotc-enquiry-custom textarea:focus {
          border-color: #159447;
          box-shadow: 0 0 0 3px rgba(21, 148, 71, 0.12);
        }

        .spotc-enquiry-custom > small {
          position: absolute;
          right: 10px;
          bottom: 8px;
          color: #8b8176;
          font-size: 12px;
          font-weight: 500;
        }

        .spotc-enquiry-continue {
          width: 100%;
          height: 50px;
          margin-top: 14px;
          padding: 0 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 999px;
          color: #fff;
          background: #159447;
          font-family: inherit;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 9px 24px rgba(21, 148, 71, 0.24);
        }

        .spotc-enquiry-note {
          margin: 9px 0 0;
          color: #766d63;
          font-size: 13px;
          font-weight: 500;
          text-align: center;
        }

        @media (max-width: 560px) {
          .spotc-enquiry-backdrop {
            padding: 0 !important;
          }

          .spotc-enquiry-sheet {
            width: 100% !important;
            max-height: 100dvh !important;
            padding: 9px 14px calc(15px + env(safe-area-inset-bottom)) !important;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 24px 24px 0 0;
          }

          .spotc-enquiry-header h2 {
            font-size: 25px;
            font-weight:700;
          }

          .spotc-enquiry-options {
            grid-template-columns: 1fr;
            gap: 7px;
          }

          .spotc-enquiry-option {
            min-height: 56px;
            font-size:17px;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
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
    const direct = text(item.offer_end_text);
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

function referenceId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string")
    return value.split("/").filter(Boolean).pop() ?? "";
  if (typeof value === "object" && value !== null) {
    const candidate = value as { id?: string; path?: string };
    if (candidate.id) return candidate.id;
    if (candidate.path)
      return candidate.path.split("/").filter(Boolean).pop() ?? "";
  }
  return "";
}

function embeddedProductSlots(item: BusinessListing): OfferProduct[] {
  const products: OfferProduct[] = [];

  for (let index = 1; index <= 5; index += 1) {
    const image = text(item[`image${index}`]).trim();
    if (!image.startsWith("http")) continue;

    const stockValue =
      item[`image${index}_stock_qty`] ?? item[`image${index}_stock_quantity`];

    const hasStockQuantity =
      item[`image${index}_stock_qty`] != null ||
      item[`image${index}_stock_quantity`] != null;

    if (item[`image${index}_is_in_stock`] === false) continue;
    if (hasStockQuantity && num(stockValue) <= 0) continue;

    const price = num(item[`image${index}_price`]);
    const oldPrice = num(item[`image${index}_old_price`]);
    const rawDiscount = text(item[`image${index}_discount`]).trim();

    const calculatedDiscount =
      oldPrice > price && price > 0
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : 0;

    products.push({
      image,
      title:
        text(
          item[`image${index}_title`] ||
            item[`product${index}_title`] ||
            item.product_name,
        ).trim() || "Product",
      price,
      oldPrice,
      discount: rawDiscount
        ? rawDiscount.includes("%")
          ? rawDiscount
          : `${rawDiscount}% OFF`
        : calculatedDiscount
          ? `${calculatedDiscount}% OFF`
          : "",
      productId:
        referenceId(item[`image${index}_product_ref`]) ||
        referenceId(item[`image${index}_product_id`]) ||
        referenceId(item[`product${index}_ref`]) ||
        referenceId(item[`product${index}_id`]),
    });
  }

  return products;
}

function linkedVideoProducts(
  item: BusinessListing,
  allProducts: BusinessProduct[],
): OfferProduct[] {
  const offerId = text(item.id).trim();
  if (!offerId) return [];

  return allProducts
    .filter((product) => {
      // This is the exact Flutter BusinessOfferFeed relationship:
      // BusinessProducts.linked_video_ref == current BusinessListings offer ref.
      return referenceId(product.linked_video_ref) === offerId;
    })
    .filter((product) => {
      if (product.isHidden === true) return false;
      if (product.isActive === false) return false;
      if (product.is_in_stock === false) return false;

      const hasStock =
        product.stock_qty != null || product.stock_quantity != null;

      if (hasStock && num(product.stock_qty ?? product.stock_quantity) <= 0) {
        return false;
      }

      return true;
    })
    .map((product): OfferProduct | null => {
      const image = text(
        product.product_thumbnail ||
          product.image ||
          product.image_url ||
          product.image1 ||
          product.thumbnail_url ||
          product.generated_image_url ||
          (Array.isArray(product.images) ? product.images[0] : ""),
      ).trim();

      if (!image.startsWith("http")) return null;

      const price = num(product.offer_price ?? product.price);
      const oldPrice = num(
        product.old_price ?? product.mrp ?? product.original_price,
      );

      const explicitDiscount = num(
        product.discount_percent ??
          product.discount ??
          product.suggested_discount,
      );

      const calculatedDiscount =
        oldPrice > price && price > 0
          ? Math.round(((oldPrice - price) / oldPrice) * 100)
          : 0;

      return {
        image,
        title: text(product.title || product.product_name).trim() || "Product",
        price,
        oldPrice,
        discount: explicitDiscount
          ? `${explicitDiscount}% OFF`
          : calculatedDiscount
            ? `${calculatedDiscount}% OFF`
            : "",
        productId: product.id,
      };
    })
    .filter((product): product is OfferProduct => product !== null)
    .slice(0, 5);
}

function mapsUrl(item: BusinessListing): string {
  const latitude = num(item.latitude ?? item.business_latitude ?? item.lat);
  const longitude = num(item.longitude ?? item.business_longitude ?? item.lng);
  const address = text(
    item.address || item.businessAddress || item.business_address,
  );

  if (latitude && longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function OfferCard({
  item,
  index,
  allProducts,
}: {
  item: BusinessListing;
  index: number;
  allProducts: BusinessProduct[];
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
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  const video = text(
    item.playback_720_url ||
      item.playback_480_url ||
      item.playback_url ||
      item.business_video_url,
  );
  const name =
    text(item.business_name || item.shop_name || item.creator_name) ||
    "Local business";
  const logo = text(
    item.logo_url || item.business_logo_url || item.business_logo,
  );
  const distance =
    text(item.road_distance_text || item.distance_text) || "Near you";
  const status =
    text(item.open_status || item.business_status) ||
    (item.is_open === false ? "Closed now" : "Open now");
  const verified =
    item.isVerified === true ||
    item.is_business_verified === true ||
    text(item.verification_status).toLowerCase() === "verified";
  const phone = text(item.phone || item.business_phone || item.contact_number);
  const whatsapp = text(item.whatsapp || item.whatsapp_number || item.phone);
  const businessHref = `/${slugify(name)}`;
  const offerId = text(item.id).trim();
  const offerTitle =
    text(item.offer_title || item.offer_text || item.caption).trim() ||
    `${name} Offer`;

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
      const thumbnail = text(
        item.thumbnail_url ||
          item.logo_url ||
          item.business_logo_url ||
          item.business_logo,
      );

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

        business_id:
          text(item.business_id).trim() ||
          referenceId(item.business_ref) ||
          offerId,
        business_ref: item.business_ref || null,
        business_name: name,
        shop_name: name,

        title:
          text(item.offer_title || item.offer_text || item.caption).trim() ||
          `${name} Offer`,
        offer_title:
          text(item.offer_title || item.offer_text || item.caption).trim() ||
          `${name} Offer`,
        description: text(
          item.offer_description || item.offer_text || item.caption,
        ),

        image: thumbnail,
        image_url: thumbnail,
        thumbnail_url: thumbnail,
        logo_url: logo,

        area_name: text(
          item.area_name || item.area || item.city || item.address,
        ),
        address: text(
          item.address || item.businessAddress || item.business_address,
        ),

        offer_end_at: item.offer_end_at || null,
        expires_at: item.offer_end_at || null,
        isActive: item.isActive !== false,
        is_active: item.isActive !== false,

        business_slug: slugify(name),
        web_url: businessHref,
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

  const products = useMemo(() => {
    const embedded = embeddedProductSlots(item);

    // Older offer records may contain direct image1-image5 slots.
    if (embedded.length > 0) return embedded;

    // Current app records use BusinessProducts.linked_video_ref.
    return linkedVideoProducts(item, allProducts);
  }, [allProducts, item]);

  const resolveProductId = (product: OfferProduct): string => product.productId;

  const renderProducts = (location: "desktop" | "mobile") => (
    <div
      className={
        location === "desktop"
          ? "offer-products-panel-list"
          : "offer-products thumb-products offer-products-mobile"
      }
      aria-label={`${name} products`}
    >
      {products.map((product, productIndex) => {
        const resolvedProductId = resolveProductId(product);
        const href = resolvedProductId
          ? `/product/${resolvedProductId}`
          : businessHref;

        return (
          <Link
            className={
              location === "desktop"
                ? "offer-side-product-card"
                : "offer-product-card"
            }
            href={href}
            key={`${location}-${product.image}-${productIndex}`}
          >
            <div className="offer-side-product-image-wrap">
              <img src={product.image} alt={product.title} />
              {product.discount && (
                <b className="offer-discount">{product.discount}</b>
              )}
            </div>
            <span
              className={
                location === "desktop"
                  ? "offer-side-product-copy"
                  : "product-overlay"
              }
            >
              <strong>{product.title}</strong>
              <small>
                {product.price ? `₹${product.price}` : "View product"}{" "}
                {product.oldPrice > product.price && (
                  <del>₹{product.oldPrice}</del>
                )}
              </small>
            </span>
          </Link>
        );
      })}
    </div>
  );

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
      title: name,
      text: `View ${name} on SPOTC`,
      url: `${location.origin}${businessHref}`,
    };

    if (navigator.share)
      await navigator.share(shareData).catch(() => undefined);
    else await navigator.clipboard?.writeText(shareData.url);
  };

  return (
    <div
      className="offer-desktop-layout"
      aria-label={`${name} offer ${index + 1}`}
    >
      <article className="offer-slide">
        <div className="offer-media" onClick={togglePlayback}>
          {video ? (
            <video
              ref={videoRef}
              src={video}
              poster={text(item.thumbnail_url)}
              playsInline
              loop
              muted={muted}
            />
          ) : (
            <div
              className="offer-poster"
              style={{
                backgroundImage: `url(${text(item.thumbnail_url) || logo})`,
              }}
            />
          )}
          <div className="offer-shade" />
          {!playing && video && (
            <div className="offer-play">
              <Play fill="currentColor" />
            </div>
          )}
        </div>

        <div className="offer-top-overlay">
          <span />
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
          <button className="rail-item" type="button" onClick={share}>
            <Share2 />
            <span>Share</span>
          </button>
          <button
            className="rail-item"
            type="button"
            onClick={() => alert("Report submitted for review")}
          >
            <Flag />
            <span>Report</span>
          </button>
        </div>

        <div className="offer-content">
          <div className="business-row">
            <Link
              className="business-logo"
              href={businessHref}
              aria-label={`Open ${name}`}
            >
              {logo ? <img src={logo} alt={`${name} logo`} /> : name[0]}
            </Link>
            <div className="business-meta">
              <div className="business-title-row">
                <Link href={businessHref}>
                  <h2>{name}</h2>
                </Link>
                {verified && (
                  <BadgeCheck className="verified-icon" fill="currentColor" />
                )}
              </div>
              <div className="business-status-row">
                <span>
                  <MapPin size={12} /> {distance}
                </span>
                <span>•</span>
                <span
                  className={
                    status.toLowerCase().includes("open")
                      ? "open-now"
                      : "closed-now"
                  }
                >
                  {status}
                </span>
                <span>•</span>
                <span className="expiry">{expiryText(item)}</span>
              </div>
            </div>
          </div>

          {products.length > 0 && renderProducts("mobile")}

          <div className="offer-contact-row offer-contact-row-four">
            {phone && (
              <a href={`tel:${phone}`}>
                <Phone /> Call
              </a>
            )}
            {whatsapp && (
              <button
                type="button"
                className="offer-whatsapp-enquiry-button"
                onClick={() => setEnquiryOpen(true)}
              >
                <MessageCircle /> WhatsApp
              </button>
            )}
            <a href={mapsUrl(item)} target="_blank" rel="noreferrer">
              <Navigation /> Direction
            </a>
            <Link href={businessHref}>
              <ShoppingBag /> View shop
            </Link>
          </div>
        </div>
      </article>

      {products.length > 0 && (
        <aside
          className="offer-products-panel"
          aria-label={`${name} offer products panel`}
        >
          <div className="offer-products-panel-head">
            <div>
              <small>SHOP THIS OFFER</small>
              <h3>Offer Products</h3>
            </div>
            <span>{products.length}</span>
          </div>
          {renderProducts("desktop")}
        </aside>
      )}

      <QuickEnquirySheet
        open={enquiryOpen}
        businessName={name}
        businessLogo={logo}
        offerTitle={offerTitle}
        whatsappNumber={whatsapp}
        onClose={() => setEnquiryOpen(false)}
      />

      <style jsx global>{`
        /*
         * FINAL RESPONSIVE CONTACT BUTTON FIX
         *
         * Desktop:
         * - Four buttons stay inside the video width.
         * - Call is slightly smaller.
         * - WhatsApp, Direction and View shop get more space.
         *
         * Mobile:
         * - Direction is hidden, matching the mobile app.
         * - Call, WhatsApp and View shop use three equal columns.
         */
        .offers-page .offer-contact-row-four {
          width: 100% !important;
          max-width: 100% !important;
          display: grid !important;
          grid-template-columns:
            minmax(86px, 0.82fr)
            minmax(108px, 1.08fr)
            minmax(108px, 1.08fr)
            minmax(116px, 1.16fr) !important;
          gap: 8px !important;
          align-items: stretch !important;
          overflow: visible !important;
          box-sizing: border-box !important;
        }

        .offers-page .offer-contact-row-four > a,
        .offers-page .offer-contact-row-four > button {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          height: 46px !important;
          min-height: 46px !important;
          margin: 0 !important;
          padding: 0 9px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          overflow: hidden !important;
          border: 1px solid rgba(255, 255, 255, 0.34) !important;
          border-radius: 999px !important;
          color: #ffffff !important;
          background: rgba(0, 0, 0, 0.26) !important;
          font-family: inherit !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          font-style: normal !important;
          line-height: 1 !important;
          text-align: center !important;
          text-decoration: none !important;
          white-space: nowrap !important;
          cursor: pointer !important;
          appearance: none !important;
          -webkit-appearance: none !important;
          box-sizing: border-box !important;
        }

        .offers-page .offer-contact-row-four > a svg,
        .offers-page .offer-contact-row-four > button svg {
          width: 19px !important;
          height: 19px !important;
          min-width: 19px !important;
          min-height: 19px !important;
          flex: 0 0 19px !important;
          display: block !important;
          margin: 0 !important;
          position: static !important;
          transform: none !important;
        }

        .offers-page .offer-contact-row-four > a:active,
        .offers-page .offer-contact-row-four > button:active {
          transform: scale(0.98);
        }

        @media (max-width: 760px) {
          .offers-page .offer-contact-row-four {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          /* Direction is desktop-only. */
          .offers-page .offer-contact-row-four > a[target="_blank"] {
            display: none !important;
          }

          .offers-page .offer-contact-row-four > a,
          .offers-page .offer-contact-row-four > button {
            height: 48px !important;
            min-height: 48px !important;
            padding: 0 10px !important;
            gap: 7px !important;
            font-size: 15px !important;
          }

          .offers-page .offer-contact-row-four > a svg,
          .offers-page .offer-contact-row-four > button svg {
            width: 21px !important;
            height: 21px !important;
            min-width: 21px !important;
            min-height: 21px !important;
            flex-basis: 21px !important;
          }
        }

        @media (max-width: 390px) {
          .offers-page .offer-contact-row-four {
            gap: 6px !important;
          }

          .offers-page .offer-contact-row-four > a,
          .offers-page .offer-contact-row-four > button {
            height: 46px !important;
            min-height: 46px !important;
            padding: 0 7px !important;
            gap: 5px !important;
            font-size: 14px !important;
          }

          .offers-page .offer-contact-row-four > a svg,
          .offers-page .offer-contact-row-four > button svg {
            width: 19px !important;
            height: 19px !important;
            min-width: 19px !important;
            min-height: 19px !important;
            flex-basis: 19px !important;
          }
        }
      `}</style>
    </div>
  );
}

export function OfferFeed() {
  const [items, setItems] = useState<BusinessListing[] | null>(null);
  const feedRef = useRef<HTMLElement>(null);
  const [allProducts, setAllProducts] = useState<BusinessProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

    // Render the offer feed as soon as offers arrive.
    // Do not wait for the larger product query.
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

    // Load linked products separately in the background.
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

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    const seenVideos = new Set<string>();
    const now = new Date();

    return (items || []).filter((item) => {
      const videoUrl = text(
        item.playback_720_url ||
          item.playback_480_url ||
          item.playback_url ||
          item.business_video_url,
      );

      if (!videoUrl) return false;

      const normalizedVideo = decodeURIComponent(videoUrl.split("?")[0])
        .trim()
        .toLowerCase();

      if (!normalizedVideo || seenVideos.has(normalizedVideo)) return false;
      if (item.isActive === false) return false;

      const processingStatus = text(item.processing_status).toLowerCase();
      if (processingStatus && processingStatus !== "ready") return false;

      const endDate = dateValue(item.offer_end_at);
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
        if (endDate.getTime() < now.getTime()) return false;
      }

      if (query) {
        const searchable = [
          item.business_name,
          item.shop_name,
          item.category,
          item.offer_text,
          item.caption,
          item.address,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(query)) return false;
      }

      seenVideos.add(normalizedVideo);
      return true;
    });
  }, [items, search]);

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
      <section ref={feedRef} className="offer-feed" tabIndex={0}>
        {filtered.map((item, index) => (
          <OfferCard
            item={item}
            index={index}
            allProducts={allProducts}
            key={item.id}
          />
        ))}
      </section>

      {!filtered.length && (
        <EmptyState
          title="No offers found"
          body="Try another business, category or area."
        />
      )}
    </>
  );
}