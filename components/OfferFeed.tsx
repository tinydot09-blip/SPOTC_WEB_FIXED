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
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> WhatsApp
              </a>
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