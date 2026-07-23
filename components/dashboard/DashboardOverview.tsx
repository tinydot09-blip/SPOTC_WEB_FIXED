"use client";

import {
  BadgeIndianRupee,
  BriefcaseBusiness,
  Camera,
  Check,
  CheckCircle2,
  Gift,
  PackageCheck,
  ReceiptText,
  Sparkles,
  Search,
  Users,
  Star,
  Store,
  WalletCards,
} from "lucide-react";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";

type Props = {
  user: User;
  onOpenLevels: () => void;
  onOpenMysteryBoxes: () => void;
};

type Wallet = {
  business_coin_points?: number;
  nearby_bonus_points?: number;
  total_bills_approved?: number;
  total_rewards_claimed?: number;
};

type MysteryBox = {
  id: string;
  title: string;
  required_points: number;
  priority: number;
};

type ShopChoice = {
  id: string;
  name: string;
  category: string;
  logo: string;
};

type BusinessCoin = {
  id: string;
  businessId: string;
  business_name: string;
  business_logo: string;
  coins: number;
  target: number;
  reward_text: string;
};

function numberOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function businessIdOf(data: DocumentData): string {
  const ref =
    data.business_ref ??
    data.businessRef ??
    data.shop_ref ??
    data.shopRef ??
    data.business_id ??
    data.businessId;

  if (typeof ref === "string") {
    const parts = ref.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }

  if (
    typeof ref === "object" &&
    ref !== null &&
    "id" in ref &&
    typeof (ref as { id?: unknown }).id === "string"
  ) {
    return (ref as { id: string }).id;
  }

  return "";
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (!words.length) return "S";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function mapBusinessCoin(docId: string, data: DocumentData): BusinessCoin {
  const coins = numberOf(
    data.current_points ??
      data.coins ??
      data.business_coins ??
      data.coin_balance ??
      data.points,
  );

  return {
    id: docId,
    businessId: businessIdOf(data),
    business_name:
      stringOf(data.business_name) ||
      stringOf(data.shop_name) ||
      "SPOTC Business",
    business_logo:
      stringOf(data.business_logo) ||
      stringOf(data.logo_url) ||
      stringOf(data.logo),
    coins,
    target: Math.max(
      1,
      numberOf(
        data.target_coins ?? data.required_coins ?? data.target_points,
      ) || 50,
    ),
    reward_text:
      stringOf(data.reward_text) ||
      stringOf(data.reward_description) ||
      "₹50 off on your next purchase",
  };
}

async function loadBusinessCoinDocs(
  userId: string,
): Promise<QuerySnapshot<DocumentData> | null> {
  const db = getFirestore();

  const collectionsToTry = ["RewardBusinessProgress", "BusinessCoinWallets"];

  for (const collectionName of collectionsToTry) {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, collectionName),
          where("user_uid", "==", userId),
          limit(50),
        ),
      );

      if (!snapshot.empty) {
        return snapshot;
      }
    } catch (error) {
      console.warn(`Could not read ${collectionName}:`, error);
    }
  }

  return null;
}

export default function DashboardOverview({
  user,
  onOpenLevels,
  onOpenMysteryBoxes,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [wallet, setWallet] = useState<Wallet>({});
  const [mysteryBoxes, setMysteryBoxes] = useState<MysteryBox[]>([]);
  const [businessCoins, setBusinessCoins] = useState<BusinessCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [shops, setShops] = useState<ShopChoice[]>([]);
  const [shopSearch, setShopSearch] = useState("");
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [partnerBusy, setPartnerBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const db = getFirestore();

        const [walletSnapshot, mysterySnapshot, businessSnapshot] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "UserWallet"),
                where("user_uid", "==", user.uid),
                limit(1),
              ),
            ),
            getDocs(
              query(
                collection(db, "MysteryBoxes"),
                where("is_active", "==", true),
                orderBy("priority", "asc"),
                limit(20),
              ),
            ).catch(() =>
              getDocs(
                query(
                  collection(db, "MysteryBoxes"),
                  where("is_active", "==", true),
                  limit(20),
                ),
              ),
            ),
            loadBusinessCoinDocs(user.uid),
          ]);

        if (!active) return;

        if (!walletSnapshot.empty) {
          setWallet(walletSnapshot.docs[0].data() as Wallet);
        } else {
          setWallet({});
        }

        setMysteryBoxes(
          mysterySnapshot.docs
            .map((mysteryDoc) => {
              const data = mysteryDoc.data();

              return {
                id: mysteryDoc.id,
                title:
                  stringOf(data.title) || stringOf(data.name) || "Mystery Box",
                required_points: Math.max(
                  1,
                  numberOf(data.required_points) || 500,
                ),
                priority: numberOf(data.priority) || 999,
              };
            })
            .sort((a, b) => a.priority - b.priority),
        );

        setBusinessCoins(
          businessSnapshot
            ? businessSnapshot.docs.map((businessDoc) =>
                mapBusinessCoin(businessDoc.id, businessDoc.data()),
              )
            : [],
        );
      } catch (error) {
        console.error("Dashboard overview load failed:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [user.uid]);

  useEffect(() => {
    let active = true;

    async function loadShops() {
      try {
        const db = getFirestore();
        const snapshot = await getDocs(
          query(collection(db, "BusinessListings"), limit(100)),
        );
        if (!active) return;

        setShops(
          snapshot.docs
            .map((shopDoc) => {
              const data = shopDoc.data();
              return {
                id: shopDoc.id,
                name:
                  stringOf(data.business_name) ||
                  stringOf(data.name) ||
                  "SPOTC Shop",
                category: stringOf(data.category) || "Local business",
                logo: stringOf(data.logo_url) || stringOf(data.business_logo),
                active: data.isActive !== false && data.is_active !== false,
              };
            })
            .filter((shop) => shop.active)
            .map(({ active: _active, ...shop }) => shop),
        );
      } catch (error) {
        console.error("Could not load partner shops:", error);
      }
    }

    void loadShops();
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    const walletBusinessCoins = numberOf(wallet.business_coin_points);

    const calculatedBusinessCoins = businessCoins.reduce(
      (sum, item) => sum + item.coins,
      0,
    );

    const business =
      walletBusinessCoins > 0 ? walletBusinessCoins : calculatedBusinessCoins;

    const nearby = numberOf(wallet.nearby_bonus_points);
    const levelBonus = Math.floor(business / 100) * 10;

    return {
      business,
      nearby,
      levelBonus,
      total: business + nearby + levelBonus,
      bonus: nearby + levelBonus,
      approved: numberOf(wallet.total_bills_approved),
      claimed: numberOf(wallet.total_rewards_claimed),
      businesses: businessCoins.length,
      mysteryBoxes: mysteryBoxes.length,
    };
  }, [wallet, businessCoins, mysteryBoxes]);

  const rewardMilestones = useMemo(
    () => Array.from({ length: 11 }, (_, index) => index * 50),
    [],
  );

  const scanBill = async (file: File) => {
    if (!file || scanBusy) return;

    setScanBusy(true);
    setScanMessage("Preparing bill upload…");

    try {
      const functions = getFunctions(undefined, "asia-south1");

      const getR2UploadUrl = httpsCallable<
        {
          fileName: string;
          contentType: string;
          folder: string;
        },
        {
          uploadUrl: string;
          publicUrl: string;
        }
      >(functions, "getR2UploadUrl");

      const extension = file.name.split(".").pop() || "jpg";

      const fileName = `bill_${user.uid}_${Date.now()}.${extension}`;

      const signed = await getR2UploadUrl({
        fileName,
        contentType: file.type || "image/jpeg",
        folder: "bill-scans",
      });

      setScanMessage("Uploading bill…");

      const uploadResponse = await fetch(signed.data.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "image/jpeg",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed: ${uploadResponse.status}`);
      }

      setScanMessage("Reading bill with AI…");

      const extractBillDetails = httpsCallable<
        {
          bill_image_url: string;
          billImageUrl: string;
          image_url: string;
          imageUrl: string;
        },
        Record<string, unknown>
      >(functions, "extractBillDetails");

      const result = await extractBillDetails({
        bill_image_url: signed.data.publicUrl,
        billImageUrl: signed.data.publicUrl,
        image_url: signed.data.publicUrl,
        imageUrl: signed.data.publicUrl,
      });

      const business =
        stringOf(result.data.business_name) ||
        stringOf(result.data.merchant_name) ||
        stringOf(result.data.shop_name) ||
        "Business";

      const amount =
        numberOf(result.data.bill_amount) ||
        numberOf(result.data.total_amount) ||
        numberOf(result.data.total);

      setScanMessage(
        `Bill read successfully: ${business}${
          amount > 0 ? ` · ₹${Math.round(amount)}` : ""
        }. Verification submission is the next step.`,
      );
    } catch (error) {
      console.error("Bill scan failed:", error);

      setScanMessage(
        error instanceof Error
          ? `Bill scan failed: ${error.message}`
          : "Bill scan failed. Please try again.",
      );
    } finally {
      setScanBusy(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const openBusiness = (businessId: string) => {
    window.location.href = businessId
      ? `/shop?business=${encodeURIComponent(businessId)}`
      : "/shop";
  };

  const useReward = (businessName: string, rewardText: string) => {
    window.alert(
      `${rewardText} is ready at ${businessName}. Open the shop and apply the reward during purchase.`,
    );
  };

  const filteredShops = useMemo(() => {
    const term = shopSearch.trim().toLowerCase();
    if (!term) return shops;
    return shops.filter((shop) =>
      `${shop.name} ${shop.category}`.toLowerCase().includes(term),
    );
  }, [shops, shopSearch]);

  const toggleShop = (shopId: string) => {
    setSelectedShopIds((current) =>
      current.includes(shopId)
        ? current.filter((id) => id !== shopId)
        : [...current, shopId],
    );
  };

  const submitPartnerRequest = async () => {
    if (!selectedShopIds.length || partnerBusy) return;
    setPartnerBusy(true);
    try {
      const selected = shops.filter((shop) =>
        selectedShopIds.includes(shop.id),
      );
      await addDoc(collection(getFirestore(), "ShopPartnerRequests"), {
        user_uid: user.uid,
        user_name: user.displayName ?? "",
        user_email: user.email ?? "",
        business_ids: selected.map((shop) => shop.id),
        business_names: selected.map((shop) => shop.name),
        status: "pending",
        created_at: serverTimestamp(),
      });
      window.alert("Your shop partner request was submitted for review.");
      setPartnerOpen(false);
      setSelectedShopIds([]);
    } catch (error) {
      console.error("Partner request failed:", error);
      window.alert("Unable to submit the request. Please try again.");
    } finally {
      setPartnerBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="dash-overview-loading">Loading your SPOTC dashboard…</div>
    );
  }

  return (
    <div className="dash-overview dash-overview-light">
      <section className="dash-summary-grid">
        <article className="dash-summary-card">
          <span className="dash-summary-icon gold">
            <Star />
          </span>
          <div>
            <small>Total Points</small>
            <strong>{Math.round(totals.total)}</strong>
            <p>+{Math.round(totals.bonus)} bonus earned</p>
          </div>
        </article>

        <article className="dash-summary-card">
          <span className="dash-summary-icon blue">
            <ReceiptText />
          </span>
          <div>
            <small>Bills Scanned</small>
            <strong>{Math.round(totals.approved)}</strong>
            <p>Approved bills</p>
          </div>
        </article>

        <article className="dash-summary-card">
          <span className="dash-summary-icon green">
            <Gift />
          </span>
          <div>
            <small>Rewards Claimed</small>
            <strong>{Math.round(totals.claimed)}</strong>
            <p>Keep earning</p>
          </div>
        </article>

        <article
          className="dash-summary-card clickable"
          onClick={onOpenMysteryBoxes}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onOpenMysteryBoxes();
            }
          }}
        >
          <span className="dash-summary-icon purple">
            <PackageCheck />
          </span>
          <div>
            <small>Mystery Boxes</small>
            <strong>{totals.mysteryBoxes}</strong>
            <p>See what is waiting</p>
          </div>
        </article>

        <article className="dash-summary-card">
          <span className="dash-summary-icon orange">
            <WalletCards />
          </span>
          <div>
            <small>Business Coins</small>
            <strong>{Math.round(totals.business)}</strong>
            <p>
              Across {totals.businesses}{" "}
              {totals.businesses === 1 ? "business" : "businesses"}
            </p>
          </div>
        </article>
      </section>

      <section className="dash-action-grid">
        <div className="dash-scan-banner">
          <span className="dash-scan-banner-icon">
            <ReceiptText />
          </span>
          <div className="dash-scan-banner-copy">
            <h2>Scan Bill &amp; Earn Coins</h2>
            <p>Upload your bill, get verified and earn business coins.</p>
            <span>+10 Coins Minimum</span>
          </div>
          <button
  type="button"
  disabled={scanBusy}
  onClick={() => inputRef.current?.click()}
>
  {scanBusy ? "Processing…" : "Upload Bill"}
  <Camera />
</button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void scanBill(file);
            }}
          />
        </div>

        <article className="dash-partner-card">
          <span className="dash-partner-icon">
            <Users />
          </span>
          <div>
            <small>SHOP PARTNER</small>
            <h2>Become a Shop Partner</h2>
            <p>
              Select one or more SPOTC shops you want to support and manage.
            </p>
          </div>
          <button type="button" onClick={() => setPartnerOpen(true)}>
            Join <BriefcaseBusiness />
          </button>
        </article>
      </section>

      {scanMessage && <p className="dash-scan-message">{scanMessage}</p>}

      <section className="dash-journey-panel">
        <div className="dash-section-heading">
          <div>
            <h2>Reward Journey</h2>
            <p>Reach higher levels and unlock bigger rewards.</p>
          </div>

          <button type="button" onClick={onOpenLevels}>
            View All Levels
          </button>
        </div>

        <div className="dash-journey-scroll">
          <div className="dash-journey-line">
          {rewardMilestones.map((required, index) => {
            const unlocked = totals.total >= required;

            const isCurrent =
              !unlocked &&
              (index === 0 || totals.total >= rewardMilestones[index - 1]);

            return (
              <article
                key={required}
                className={[
                  unlocked ? "unlocked" : "",
                  isCurrent ? "current" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="dash-journey-node">
                  {unlocked ? <Check /> : required}
                </div>

                <strong>{index === 0 ? "Start" : `Level ${index}`}</strong>
              </article>
            );
          })}
          </div>
        </div>
      </section>

      <section className="dash-business-progress dash-business-progress-light">
        <div className="dash-section-heading">
          <div>
            <h2>Business Coin Progress</h2>
            <p>
              Earn 50 coins in any business to unlock ₹50 off your next
              purchase.
            </p>
          </div>

          <span className="dash-help-badge">
            <Sparkles />
            Live progress
          </span>
        </div>

        {businessCoins.length ? (
          <div className="dash-business-grid dash-business-grid-light">
            {businessCoins.map((item) => {
              const progress = Math.min(100, (item.coins / item.target) * 100);

              const remaining = Math.max(0, item.target - item.coins);

              const ready = item.coins >= item.target;

              return (
                <article key={item.id} className={ready ? "reward-ready" : ""}>
                  <div className="dash-business-card-top">
                    {item.business_logo ? (
                      <img src={item.business_logo} alt="" />
                    ) : (
                      <span className="dash-business-fallback">
                        {initialsOf(item.business_name)}
                      </span>
                    )}

                    <div className="dash-business-copy">
                      <strong>{item.business_name}</strong>
                      <small>Earn coins when you shop here</small>
                    </div>

                    <span
                      className={`dash-business-status ${ready ? "ready" : ""}`}
                    >
                      {ready ? (
                        <>
                          <CheckCircle2 />
                          Reward Ready
                        </>
                      ) : (
                        `${Math.ceil(remaining)} coins left`
                      )}
                    </span>
                  </div>

                  <div className="dash-business-value-row">
                    <strong>
                      {Math.round(item.coins)}
                      <span> / {Math.round(item.target)} coins</span>
                    </strong>

                    <b>{Math.round(progress)}%</b>
                  </div>

                  <div className="dash-business-progress-bar">
                    <span
                      className={ready ? "complete" : ""}
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>

                  <div className="dash-business-actions">
                    <span>
                      {ready
                        ? `Reward Unlocked: ${item.reward_text}`
                        : `Reward: ${item.reward_text}`}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        ready
                          ? useReward(item.business_name, item.reward_text)
                          : openBusiness(item.businessId)
                      }
                    >
                      {ready ? "Use Reward" : "View Shop"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="dash-empty-progress dash-empty-progress-light">
            <Store />
            <div>
              <strong>No business coin progress yet</strong>
              <p>
                Upload bills from nearby SPOTC businesses to start earning
                coins.
              </p>
            </div>
          </div>
        )}
      </section>

      {partnerOpen && (
        <div
          className="dash-partner-modal-backdrop"
          onMouseDown={() => setPartnerOpen(false)}
        >
          <section
            className="dash-partner-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dash-partner-modal-head">
              <div>
                <small>SHOP PARTNER REQUEST</small>
                <h2>Select SPOTC shops</h2>
                <p>
                  You can select multiple shops. The request will be sent for
                  admin and business-owner approval.
                </p>
              </div>
              <button type="button" onClick={() => setPartnerOpen(false)}>
                ×
              </button>
            </div>
            <label className="dash-shop-search">
              <Search />
              <input
                value={shopSearch}
                onChange={(event) => setShopSearch(event.target.value)}
                placeholder="Search shop or category"
              />
            </label>
            <div className="dash-shop-list">
              {filteredShops.map((shop) => {
                const selected = selectedShopIds.includes(shop.id);
                return (
                  <button
                    type="button"
                    key={shop.id}
                    className={selected ? "selected" : ""}
                    onClick={() => toggleShop(shop.id)}
                  >
                    {shop.logo ? (
                      <img src={shop.logo} alt="" />
                    ) : (
                      <span>{initialsOf(shop.name)}</span>
                    )}
                    <div>
                      <strong>{shop.name}</strong>
                      <small>{shop.category}</small>
                    </div>
                    <i>{selected ? <Check /> : null}</i>
                  </button>
                );
              })}
              {!filteredShops.length && (
                <p className="dash-no-shops">No matching SPOTC shops found.</p>
              )}
            </div>
            <div className="dash-partner-modal-actions">
              <span>{selectedShopIds.length} selected</span>
              <button
                type="button"
                disabled={!selectedShopIds.length || partnerBusy}
                onClick={() => void submitPartnerRequest()}
              >
                {partnerBusy ? "Submitting…" : "Send Request"}
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .dash-overview-light {
          gap: 24px !important;
        }

        .dash-summary-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 18px;
        }

        .dash-summary-card {
          min-width: 0;
          min-height: 122px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          border: 1px solid #e6e9ef;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 14px 35px rgba(42, 48, 61, 0.07);
        }

        .dash-summary-card.clickable {
          cursor: pointer;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .dash-summary-card.clickable:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 40px rgba(42, 48, 61, 0.11);
        }

        .dash-summary-icon {
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 18px;
        }

        .dash-summary-icon svg {
          width: 26px;
          height: 26px;
        }

        .dash-summary-icon.gold {
          color: #e88b00;
          background: #fff2df;
        }

        .dash-summary-icon.blue {
          color: #1768e5;
          background: #eaf2ff;
        }

        .dash-summary-icon.green {
          color: #139b50;
          background: #e8f8ef;
        }

        .dash-summary-icon.purple {
          color: #6734da;
          background: #eee8ff;
        }

        .dash-summary-icon.orange {
          color: #ea8100;
          background: #fff0db;
        }

        .dash-summary-card small,
        .dash-summary-card strong,
        .dash-summary-card p {
          display: block;
        }

        .dash-summary-card small {
          color: #29231e;
          font-size: 12px;
          font-weight: 900;
        }

        .dash-summary-card strong {
          margin-top: 4px;
          color: #17120e;
          font-size: 27px;
          line-height: 1;
        }

        .dash-summary-card p {
          margin: 7px 0 0;
          color: #6f7a70;
          font-size: 11px;
          font-weight: 800;
        }

        .dash-scan-banner {
          position: relative;
          width: 100%;
          min-width: 0;
          padding: 22px 24px;
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) 190px auto;
          gap: 18px;
          align-items: center;
          overflow: hidden;
          border: 1px solid #cfe0ff;
          border-radius: 25px;
          color: #15233d;
          background:
            radial-gradient(
              circle at 72% 50%,
              rgba(53, 132, 255, 0.12),
              transparent 28%
            ),
            linear-gradient(135deg, #f5f9ff, #edf5ff);
          box-shadow: 0 16px 40px rgba(49, 100, 185, 0.08);
        }

        .dash-scan-banner-icon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          color: #1468e8;
          background: #e5efff;
        }

        .dash-scan-banner-icon svg {
          width: 30px;
        }

        .dash-scan-banner-copy h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .dash-scan-banner-copy p {
          margin: 5px 0 9px;
          color: #56657d;
          font-weight: 750;
        }

        .dash-scan-banner-copy span {
          display: inline-flex;
          padding: 7px 11px;
          border-radius: 999px;
          color: #155cce;
          background: #e7f0ff;
          font-size: 12px;
          font-weight: 950;
        }

        .dash-scan-visual {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #1f6fea;
        }

        .dash-scan-visual svg:first-child {
          width: 56px;
          height: 56px;
        }

        .dash-scan-visual svg:last-child {
          width: 42px;
          height: 42px;
          color: #f39a0b;
        }

        .dash-scan-banner button {
  min-height: 50px;
  padding: 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 10px;
  border: 0;
  border-radius: 15px;
  color: #fff;
  background: linear-gradient(135deg, #2779ef, #0f5dd1);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 25px rgba(28, 100, 215, 0.2);
}

.dash-scan-banner button svg {
  order: 2;
  width: 24x;
  height: 24px;
}

.dash-scan-banner button span {
  order: 1;
}

        .dash-scan-banner button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .dash-journey-panel,
        .dash-business-progress-light {
          width: 100%;
          min-width: 0;
          padding: 22px;
          border: 1px solid #e4e7ec;
          border-radius: 26px;
          background: #fff;
          box-shadow: 0 15px 40px rgba(42, 48, 61, 0.07);
        }

        .dash-section-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .dash-section-heading h2 {
          margin: 0;
          color: #1b1713;
          font-size: 23px;
          letter-spacing: -0.02em;
        }

        .dash-section-heading p {
          margin: 5px 0 0;
          color: #69717d;
          font-size: 13px;
          font-weight: 750;
        }

        .dash-section-heading > button {
          min-height: 39px;
          padding: 0 15px;
          border: 1px solid #f3c98e;
          border-radius: 12px;
          color: #d26c00;
          background: #fffaf3;
          font-weight: 900;
          cursor: pointer;
        }

        .dash-journey-line {
          position: relative;
          margin-top: 25px;
          display: grid;
          grid-template-columns: repeat(11, minmax(0, 1fr));
          gap: 0;
        }

        .dash-journey-line:before {
          content: "";
          position: absolute;
          left: 7%;
          right: 7%;
          top: 20px;
          height: 3px;
          border-radius: 999px;
          background: #e8ebef;
        }

        .dash-journey-line article {
          position: relative;
          z-index: 1;
          display: grid;
          justify-items: center;
          text-align: center;
        }

        .dash-journey-node {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 3px solid #e5e8ec;
          border-radius: 50%;
          color: #1d242c;
          background: #fff;
          font-size: 12px;
          font-weight: 1000;
        }

        .dash-journey-line article.unlocked .dash-journey-node {
          border-color: #14a957;
          color: #fff;
          background: #14a957;
        }

        .dash-journey-line article.current .dash-journey-node {
          border-color: #f59a16;
          color: #1e1710;
          background: #fff;
          box-shadow: 0 0 0 5px #fff4e4;
        }

        .dash-journey-node svg {
          width: 19px;
        }

        .dash-journey-line strong {
          margin-top: 9px;
          color: #222;
          font-size: 12px;
        }

        .dash-journey-line span {
          margin-top: 4px;
          color: #7a8089;
          font-size: 11px;
          font-weight: 800;
        }

        .dash-journey-line article.unlocked span {
          color: #12934c;
        }

        .dash-help-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 11px;
          border-radius: 999px;
          color: #345fae;
          background: #edf4ff;
          font-size: 11px;
          font-weight: 900;
        }

        .dash-help-badge svg {
          width: 14px;
        }

        .dash-business-grid-light {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .dash-business-grid-light article {
          min-width: 0;
          padding: 16px;
          border: 1px solid #e4e7ec;
          border-radius: 20px;
          color: #1c1814;
          background: #fff;
          box-shadow: 0 10px 24px rgba(42, 48, 61, 0.05);
        }

        .dash-business-grid-light article.reward-ready {
          border-color: #bde8ca;
          background: linear-gradient(135deg, #fff, #f7fff9);
        }

        .dash-business-card-top {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) auto;
          gap: 11px;
          align-items: center;
        }

        .dash-business-card-top img,
        .dash-business-fallback {
          width: 48px;
          height: 48px;
          object-fit: cover;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(135deg, #30343a, #121417);
          font-size: 11px;
          font-weight: 1000;
        }

        .dash-business-copy {
          min-width: 0;
        }

        .dash-business-copy strong {
          display: block;
          overflow: hidden;
          color: #1d1915;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dash-business-copy small {
          display: block;
          margin-top: 4px;
          color: #79808a;
          font-size: 10px;
        }

        .dash-business-status {
          padding: 6px 8px;
          border-radius: 8px;
          color: #d56700;
          background: #fff1e4;
          font-size: 9px;
          font-weight: 950;
          white-space: nowrap;
        }

        .dash-business-status.ready {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #168a45;
          background: #e8f8ee;
        }

        .dash-business-status svg {
          width: 12px;
        }

        .dash-business-value-row {
          margin-top: 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .dash-business-value-row strong {
          color: #14a153;
          font-size: 16px;
        }

        .dash-business-value-row strong span {
          color: #3e444d;
          font-size: 11px;
        }

        .dash-business-value-row b {
          color: #343a42;
          font-size: 11px;
        }

        .dash-business-progress-bar {
          height: 9px;
          margin-top: 10px;
          overflow: hidden;
          border-radius: 999px;
          background: #e9edf1;
        }

        .dash-business-progress-bar span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #16a85a, #0c944c);
        }

        .dash-business-progress-bar span.complete {
          background: linear-gradient(90deg, #1bb565, #0b994c);
        }

        .dash-business-actions {
          margin-top: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .dash-business-actions > span {
          min-width: 0;
          padding: 7px 9px;
          overflow: hidden;
          border-radius: 9px;
          color: #158747;
          background: #eefaf2;
          font-size: 10px;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dash-business-actions button {
          min-height: 35px;
          padding: 0 13px;
          flex: 0 0 auto;
          border: 1px solid #85d6a4;
          border-radius: 10px;
          color: #138343;
          background: #fff;
          font-size: 10px;
          font-weight: 950;
          cursor: pointer;
        }

        .reward-ready .dash-business-actions button {
          border-color: #149c4f;
          color: #fff;
          background: #149c4f;
        }

        .dash-empty-progress-light {
          margin-top: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          color: #5f6873;
          background: #fafbfd;
        }

        .dash-empty-progress-light > svg {
          width: 32px;
          color: #e48a10;
        }

        .dash-empty-progress-light strong {
          display: block;
          color: #302b26;
        }

        .dash-empty-progress-light p {
          margin: 4px 0 0;
        }

        @media (max-width: 1250px) {
          .dash-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .dash-business-grid-light {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .dash-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dash-scan-banner {
            grid-template-columns: 58px minmax(0, 1fr);
          }

          .dash-scan-visual {
            display: none;
          }

          .dash-scan-banner button {
            grid-column: 1/-1;
          }

          .dash-journey-line {
            overflow-x: auto;
            grid-template-columns: repeat(11, 110px);
            justify-content: start;
            padding-bottom: 8px;
          }

          .dash-journey-line:before {
            left: 55px;
            right: auto;
            width: 1100px;
          }

          .dash-business-grid-light {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .dash-summary-grid {
            grid-template-columns: 1fr;
          }

          .dash-summary-card {
            min-height: 100px;
          }

          .dash-scan-banner {
            padding: 18px;
          }

          .dash-section-heading {
            display: block;
          }

          .dash-section-heading > button,
          .dash-help-badge {
            margin-top: 12px;
          }

          .dash-business-card-top {
            grid-template-columns: 45px minmax(0, 1fr);
          }

          .dash-business-status {
            grid-column: 2;
            justify-self: start;
          }

          .dash-business-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .dash-business-actions > span {
            white-space: normal;
          }
        }
        /* ===== FINAL DASHBOARD CARD SPACING FIX ===== */

        .dash-content > .dash-overview.dash-overview-light {
          width: 100% !important;
          min-width: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 24px !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .dash-overview-light > .dash-summary-grid,
        .dash-overview-light > .dash-scan-banner,
        .dash-overview-light > .dash-scan-message,
        .dash-overview-light > .dash-journey-panel,
        .dash-overview-light > .dash-business-progress {
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          flex: none !important;
        }

        .dash-summary-grid {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          gap: 18px !important;
        }

        .dash-summary-card {
          margin: 0 !important;
        }

        .dash-scan-banner {
          margin: 0 !important;
        }

        .dash-journey-panel {
          margin: 0 !important;
        }

        .dash-business-progress-light {
          margin: 0 !important;
        }

        .dash-bottom-cta-row {
          margin-top: 24px !important;
          gap: 24px !important;
        }

        @media (max-width: 1250px) {
          .dash-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 900px) {
          .dash-content > .dash-overview.dash-overview-light {
            gap: 18px !important;
          }

          .dash-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 14px !important;
          }

          .dash-bottom-cta-row {
            margin-top: 18px !important;
            gap: 18px !important;
          }
        }

        @media (max-width: 600px) {
          .dash-content > .dash-overview.dash-overview-light {
            gap: 14px !important;
          }

          .dash-summary-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }

        /* ===== FINAL REWARD JOURNEY + EMPTY STATE FIX ===== */

        .dash-journey-panel {
          padding: 22px 22px 24px !important;
          overflow: hidden !important;
        }

        .dash-journey-line {
          position: relative !important;
          width: 100% !important;
          min-width: 0 !important;
          margin-top: 26px !important;
          display: grid !important;
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
          align-items: start !important;
          gap: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        .dash-journey-line:before {
          content: "" !important;
          position: absolute !important;
          left: 21px !important;
          right: 21px !important;
          top: 20px !important;
          width: auto !important;
          height: 3px !important;
          border-radius: 999px !important;
          background: #e8ebef !important;
        }

        .dash-journey-line article {
          position: relative !important;
          z-index: 1 !important;
          min-width: 0 !important;
          display: grid !important;
          justify-items: center !important;
          align-content: start !important;
          text-align: center !important;
        }

        .dash-journey-line article:first-child {
          justify-items: start !important;
          text-align: left !important;
        }

        .dash-journey-line article:last-child {
          justify-items: end !important;
          text-align: right !important;
        }

        .dash-journey-line article:first-child strong,
        .dash-journey-line article:first-child span {
          padding-left: 0 !important;
        }

        .dash-journey-line article:last-child strong,
        .dash-journey-line article:last-child span {
          padding-right: 0 !important;
        }

        .dash-empty-progress.dash-empty-progress-light {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 82px !important;
          margin-top: 18px !important;
          padding: 18px 20px !important;
          display: flex !important;
          align-items: center !important;
          gap: 16px !important;
          border: 1px solid #edf0f4 !important;
          border-radius: 16px !important;
          color: #5f6873 !important;
          background: #fafbfd !important;
          box-sizing: border-box !important;
        }

        .dash-empty-progress.dash-empty-progress-light > svg {
          width: 30px !important;
          height: 30px !important;
          flex: 0 0 auto !important;
          color: #e48a10 !important;
        }

        .dash-empty-progress.dash-empty-progress-light > div {
          min-width: 0 !important;
        }

        .dash-empty-progress.dash-empty-progress-light strong {
          display: block !important;
          margin: 0 !important;
          color: #302b26 !important;
          font-size: 15px !important;
          line-height: 1.3 !important;
        }

        .dash-empty-progress.dash-empty-progress-light p {
          margin: 5px 0 0 !important;
          color: #657080 !important;
          font-size: 14px !important;
          line-height: 1.45 !important;
        }

        @media (max-width: 900px) {
          .dash-journey-line {
            grid-template-columns: repeat(6, 130px) !important;
            justify-content: start !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 0 4px 8px !important;
          }

          .dash-journey-line:before {
            left: 25px !important;
            right: auto !important;
            width: 650px !important;
          }

          .dash-journey-line article:first-child,
          .dash-journey-line article:last-child {
            justify-items: center !important;
            text-align: center !important;
          }
        }

        @media (max-width: 600px) {
          .dash-empty-progress.dash-empty-progress-light {
            padding: 16px !important;
            align-items: flex-start !important;
          }
        }

        /* ===== FINAL COMPACT ACTIONS + PREMIUM 50-POINT JOURNEY ===== */
        .dash-action-grid {
          display: grid !important;
          grid-template-columns: minmax(0, 1.65fr) minmax(
              310px,
              0.75fr
            ) !important;
          gap: 20px !important;
        }
        .dash-action-grid .dash-scan-banner {
          grid-template-columns: 58px minmax(0, 1fr) auto !important;
          padding: 20px !important;
        }
        .dash-action-grid .dash-scan-visual {
          display: none !important;
        }
        .dash-partner-card {
          min-width: 0;
          padding: 20px;
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr);
          gap: 14px;
          border: 1px solid #e4d8ff;
          border-radius: 24px;
          background: linear-gradient(135deg, #fff, #f4efff);
          box-shadow: 0 15px 38px rgba(80, 50, 145, 0.08);
        }
        .dash-partner-icon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          border-radius: 17px;
          color: #6840d8;
          background: #ece5ff;
        }
        .dash-partner-icon svg {
          width: 25px;
        }
        .dash-partner-card small {
          color: #7148d6;
          font-size: 10px;
          font-weight: 800;
        }
        .dash-partner-card h2 {
          margin: 5px 0 5px;
          font-size: 21px;
        }
        .dash-partner-card p {
          margin: 0;
          color: #707784;
          font-size: 12px;
          line-height: 1.45;
        }
        .dash-partner-card > button {
          grid-column: 1/-1;
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 13px;
          color: #fff;
          background: #6a3bd5;
          font-weight: 700;
          cursor: pointer;
        }
        .dash-journey-panel {
          overflow: hidden !important;
          padding: 24px 22px 26px !important;
        }
        .dash-journey-line {
          width: 100% !important;
          min-width: 0 !important;
          display: grid !important;
          grid-template-columns: repeat(21, minmax(0, 1fr)) !important;
          gap: 0 !important;
          overflow: visible !important;
          padding: 8px 0 4px !important;
        }
        .dash-journey-line:before {
          left: 15px !important;
          right: 15px !important;
          top: 23px !important;
          height: 3px !important;
          width: auto !important;
        }
        .dash-journey-node {
          width: 31px !important;
          height: 31px !important;
          border-width: 3px !important;
          font-size: 10px !important;
          font-weight: 500 !important;
          box-shadow: 0 5px 13px rgba(34, 42, 52, 0.09) !important;
        }
        .dash-journey-node svg {
          width: 15px !important;
          height: 15px !important;
        }
        .dash-journey-line strong {
          margin-top: 8px !important;
          font-size: 9px !important;
          font-weight: 500 !important;
          white-space: nowrap !important;
        }
        .dash-journey-line span {
          display: none !important;
        }
        .dash-journey-line article:first-child,
        .dash-journey-line article:last-child {
          justify-items: center !important;
          text-align: center !important;
        }
        .dash-partner-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 300;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(18, 22, 29, 0.68);
          backdrop-filter: blur(7px);
        }
        .dash-partner-modal {
          width: min(760px, 100%);
          max-height: 88vh;
          overflow: auto;
          padding: 24px;
          border-radius: 25px;
          background: #fff;
          box-shadow: 0 35px 100px rgba(0, 0, 0, 0.28);
        }
        .dash-partner-modal-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
        }
        .dash-partner-modal-head small {
          color: #6840d8;
          font-weight: 800;
        }
        .dash-partner-modal-head h2 {
          margin: 6px 0;
          font-size: 28px;
        }
        .dash-partner-modal-head p {
          margin: 0;
          color: #707784;
        }
        .dash-partner-modal-head > button {
          width: 38px;
          height: 38px;
          border: 1px solid #e4e7ec;
          border-radius: 12px;
          background: #fff;
          font-size: 24px;
          cursor: pointer;
        }
        .dash-shop-search {
          margin-top: 20px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #e1e5eb;
          border-radius: 14px;
          background: #fafbfc;
        }
        .dash-shop-search svg {
          width: 19px;
          color: #747d89;
        }
        .dash-shop-search input {
          width: 100%;
          height: 48px;
          border: 0;
          outline: 0;
          background: transparent;
        }
        .dash-shop-list {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .dash-shop-list > button {
          padding: 12px;
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 28px;
          gap: 11px;
          align-items: center;
          border: 1px solid #e5e8ed;
          border-radius: 15px;
          background: #fff;
          text-align: left;
          cursor: pointer;
        }
        .dash-shop-list > button.selected {
          border-color: #8058df;
          background: #f7f3ff;
        }
        .dash-shop-list img,
        .dash-shop-list > button > span {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          object-fit: cover;
          border-radius: 13px;
          color: #fff;
          background: #6a3bd5;
        }
        .dash-shop-list strong,
        .dash-shop-list small {
          display: block;
        }
        .dash-shop-list small {
          margin-top: 4px;
          color: #7b838e;
        }
        .dash-shop-list i {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border: 1px solid #d9dde4;
          border-radius: 8px;
          color: #fff;
        }
        .dash-shop-list .selected i {
          border-color: #6a3bd5;
          background: #6a3bd5;
        }
        .dash-shop-list i svg {
          width: 15px;
        }
        .dash-no-shops {
          grid-column: 1/-1;
          padding: 25px;
          text-align: center;
          color: #737b86;
        }
        .dash-partner-modal-actions {
          position: sticky;
          bottom: -24px;
          margin: 20px -24px -24px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #e8ebef;
          background: #fff;
        }
        .dash-partner-modal-actions span {
          color: #68717d;
        }
        .dash-partner-modal-actions button {
          min-height: 44px;
          padding: 0 18px;
          border: 0;
          border-radius: 13px;
          color: #fff;
          background: #6a3bd5;
          font-weight: 700;
        }
        .dash-partner-modal-actions button:disabled {
          opacity: 0.45;
        }
        @media (max-width: 1100px) {
          .dash-action-grid {
            grid-template-columns: 1fr !important;
          }
          .dash-shop-list {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 760px) {
          .dash-journey-panel {
            overflow-x: auto !important;
            scrollbar-width: none !important;
          }
          .dash-journey-panel::-webkit-scrollbar {
            display: none !important;
          }
          .dash-journey-line {
            min-width: 760px !important;
          }
          .dash-journey-node {
            width: 29px !important;
            height: 29px !important;
          }
          .dash-journey-line strong {
            font-size: 8px !important;
          }
        }

        /* ===== FINAL EQUAL ACTION CARDS + FONT WEIGHT 500 ===== */

        .dash-action-grid{
          width:100%!important;
          display:grid!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
          align-items:stretch!important;
          gap:20px!important;
        }

        .dash-action-grid .dash-scan-banner,
        .dash-action-grid .dash-partner-card{
          width:100%!important;
          min-width:0!important;
          min-height:170px!important;
          height:100%!important;
          margin:0!important;
          box-sizing:border-box!important;
        }

        .dash-action-grid .dash-scan-banner{
          padding:20px!important;
          display:grid!important;
          grid-template-columns:58px minmax(0,1fr) auto!important;
          grid-template-rows:1fr!important;
          align-items:center!important;
          gap:16px!important;
        }

        .dash-action-grid .dash-scan-banner-copy{
          min-width:0!important;
          align-self:center!important;
        }

        .dash-action-grid .dash-scan-banner button{
          min-width:156px!important;
          min-height:46px!important;
          align-self:center!important;
        }

        .dash-partner-card{
          padding:20px!important;
          display:grid!important;
          grid-template-columns:52px minmax(0,1fr) auto!important;
          grid-template-rows:1fr!important;
          align-items:center!important;
          gap:16px!important;
        }

        .dash-partner-card>div{
          min-width:0!important;
        }

        .dash-partner-card>button{
          grid-column:auto!important;
          min-width:156px!important;
          min-height:46px!important;
          align-self:center!important;
          padding:0 18px!important;
        }

        .dash-summary-card small,
        .dash-summary-card strong,
        .dash-summary-card p,
        .dash-scan-banner-copy h2,
        .dash-scan-banner-copy p,
        .dash-scan-banner-copy span,
        .dash-scan-banner button,
        .dash-partner-card small,
        .dash-partner-card h2,
        .dash-partner-card p,
        .dash-partner-card>button,
        .dash-section-heading h2,
        .dash-section-heading p,
        .dash-section-heading>button,
        .dash-journey-node,
        .dash-journey-line strong,
        .dash-help-badge,
        .dash-business-copy strong,
        .dash-business-copy small,
        .dash-business-status,
        .dash-business-value-row strong,
        .dash-business-value-row b,
        .dash-business-actions>span,
        .dash-business-actions button,
        .dash-empty-progress-light strong,
        .dash-empty-progress-light p,
        .dash-partner-modal,
        .dash-partner-modal *{
          font-weight:500!important;
        }

        .dash-summary-card strong{
          font-size:27px!important;
        }

        .dash-scan-banner-copy h2,
        .dash-partner-card h2,
        .dash-section-heading h2{
          font-weight:500!important;
        }

        @media(max-width:1050px){
          .dash-action-grid{
            grid-template-columns:1fr!important;
          }

          .dash-action-grid .dash-scan-banner,
          .dash-action-grid .dash-partner-card{
            min-height:160px!important;
          }
        }

        @media(max-width:650px){
          .dash-action-grid .dash-scan-banner{
            grid-template-columns:52px minmax(0,1fr)!important;
            grid-template-rows:auto auto!important;
          }

          .dash-action-grid .dash-scan-banner button{
            grid-column:1/-1!important;
            width:100%!important;
          }

          .dash-partner-card{
            grid-template-columns:48px minmax(0,1fr)!important;
            grid-template-rows:auto auto!important;
          }

          .dash-partner-card>button{
            grid-column:1/-1!important;
            width:100%!important;
          }
        }


        /* ===== FINAL REWARD JOURNEY 0–500 FIT-TO-CARD FIX ===== */
        .dash-journey-panel{
          overflow:hidden!important;
          padding:24px 22px 26px!important;
        }

        .dash-journey-line{
          position:relative!important;
          width:100%!important;
          min-width:0!important;
          margin-top:26px!important;
          padding:4px 0 0!important;
          display:grid!important;
          grid-template-columns:repeat(11,minmax(0,1fr))!important;
          gap:0!important;
          overflow:visible!important;
        }

        .dash-journey-line:before{
          content:''!important;
          position:absolute!important;
          left:22px!important;
          right:22px!important;
          top:25px!important;
          width:auto!important;
          height:3px!important;
          border-radius:999px!important;
          background:#e5e9ef!important;
        }

        .dash-journey-line article{
          position:relative!important;
          z-index:2!important;
          min-width:0!important;
          display:grid!important;
          justify-items:center!important;
          align-content:start!important;
          text-align:center!important;
        }

        .dash-journey-line article:first-child{
          justify-items:start!important;
          text-align:left!important;
        }

        .dash-journey-line article:last-child{
          justify-items:end!important;
          text-align:right!important;
        }

        .dash-journey-node{
          width:44px!important;
          height:44px!important;
          display:grid!important;
          place-items:center!important;
          border:3px solid #e2e7ed!important;
          border-radius:50%!important;
          color:#2c333b!important;
          background:#fff!important;
          font-size:13px!important;
          font-weight:500!important;
          line-height:1!important;
          box-shadow:0 7px 18px rgba(40,46,57,.08)!important;
        }

        .dash-journey-line article.unlocked .dash-journey-node{
          border-color:#13a758!important;
          color:#fff!important;
          background:linear-gradient(145deg,#1cba67,#0f944c)!important;
          box-shadow:0 8px 20px rgba(19,167,88,.22)!important;
        }

        .dash-journey-line article.current .dash-journey-node{
          border-color:#f3a01a!important;
          color:#2b1a08!important;
          background:#fffaf2!important;
          box-shadow:0 0 0 5px rgba(243,160,26,.13)!important;
        }

        .dash-journey-node svg{
          width:19px!important;
          height:19px!important;
          stroke-width:2.5!important;
        }

        .dash-journey-line strong{
          margin-top:9px!important;
          color:#31363d!important;
          font-size:12px!important;
          font-weight:500!important;
          line-height:1.2!important;
          white-space:nowrap!important;
        }

        .dash-journey-line article:first-child strong{
          color:#138e4b!important;
        }

        .dash-journey-line span{
          display:none!important;
        }

        @media(max-width:1100px){
          .dash-journey-node{
            width:40px!important;
            height:40px!important;
            font-size:12px!important;
          }

          .dash-journey-line:before{
            left:20px!important;
            right:20px!important;
            top:23px!important;
          }

          .dash-journey-line strong{
            font-size:11px!important;
          }
        }

        @media(max-width:760px){
          .dash-journey-panel{
            overflow-x:auto!important;
            scrollbar-width:none!important;
          }

          .dash-journey-panel::-webkit-scrollbar{
            display:none!important;
          }

          .dash-journey-line{
            width:820px!important;
            min-width:820px!important;
            grid-template-columns:repeat(11,1fr)!important;
          }

          .dash-journey-line article:first-child,
          .dash-journey-line article:last-child{
            justify-items:center!important;
            text-align:center!important;
          }
        }


        /* ===== FINAL EQUAL-WIDTH REWARD JOURNEY ===== */
        .dash-journey-panel{
          overflow:hidden!important;
        }

        .dash-journey-line{
          position:relative!important;
          width:100%!important;
          min-width:0!important;
          margin-top:28px!important;
          display:grid!important;
          grid-template-columns:repeat(11,minmax(0,1fr))!important;
          align-items:start!important;
          gap:0!important;
          padding:0!important;
          overflow:visible!important;
        }

        .dash-journey-line:before{
          content:''!important;
          position:absolute!important;
          left:calc(100% / 22)!important;
          right:calc(100% / 22)!important;
          top:22px!important;
          width:auto!important;
          height:3px!important;
          border-radius:999px!important;
          background:#e5e9ef!important;
        }

        .dash-journey-line article,
        .dash-journey-line article:first-child,
        .dash-journey-line article:last-child{
          position:relative!important;
          z-index:1!important;
          min-width:0!important;
          width:100%!important;
          display:grid!important;
          justify-items:center!important;
          align-content:start!important;
          text-align:center!important;
        }

        .dash-journey-node{
          width:46px!important;
          height:46px!important;
          display:grid!important;
          place-items:center!important;
          border:3px solid #dfe4ea!important;
          border-radius:50%!important;
          color:#313842!important;
          background:#fff!important;
          font-size:13px!important;
          font-weight:500!important;
          box-shadow:0 6px 16px rgba(35,42,53,.08)!important;
        }

        .dash-journey-line article.unlocked .dash-journey-node{
          border-color:#13a758!important;
          color:#fff!important;
          background:#13a758!important;
          box-shadow:0 8px 18px rgba(19,167,88,.22)!important;
        }

        .dash-journey-line article.current .dash-journey-node{
          border-color:#f3a01a!important;
          color:#25201a!important;
          background:#fff!important;
          box-shadow:0 0 0 5px #fff3df,0 8px 18px rgba(243,160,26,.18)!important;
        }

        .dash-journey-line strong{
          margin-top:10px!important;
          padding:0!important;
          color:#30353c!important;
          font-size:12px!important;
          font-weight:500!important;
          line-height:1.25!important;
          white-space:nowrap!important;
        }

        .dash-journey-line span{
          display:none!important;
        }

        @media(max-width:900px){
          .dash-journey-panel{
            overflow-x:auto!important;
            overflow-y:hidden!important;
            scrollbar-width:none!important;
          }

          .dash-journey-panel::-webkit-scrollbar{
            display:none!important;
          }

          .dash-journey-line{
            min-width:880px!important;
            grid-template-columns:repeat(11,minmax(80px,1fr))!important;
            padding-bottom:4px!important;
          }

          .dash-journey-line:before{
            left:40px!important;
            right:40px!important;
          }
        }


        /* =========================================================
           FINAL MOBILE DASHBOARD LAYOUT FIX
           - two metric cards per row
           - only points strip scrolls
           - no whole-card horizontal movement
           - all cards stay inside viewport
        ========================================================= */

        .dash-overview,
        .dash-overview-light,
        .dash-summary-grid,
        .dash-action-grid,
        .dash-journey-panel,
        .dash-business-progress {
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        .dash-journey-panel {
          overflow: hidden !important;
        }

        .dash-journey-scroll {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin-top: 24px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          overscroll-behavior-x: contain !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
        }

        .dash-journey-scroll::-webkit-scrollbar {
          display: none !important;
        }

        .dash-journey-scroll .dash-journey-line {
          margin-top: 0 !important;
        }

        @media (max-width: 900px) {
          .dash-journey-panel {
            overflow: hidden !important;
          }

          .dash-journey-scroll {
            overflow-x: auto !important;
          }

          .dash-journey-line {
            width: max-content !important;
            min-width: 880px !important;
            grid-template-columns: repeat(11, 80px) !important;
            padding: 0 8px 8px !important;
          }

          .dash-journey-line:before {
            left: 48px !important;
            right: 48px !important;
          }
        }

        @media (max-width: 700px) {
          .dash-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px !important;
          }

          .dash-summary-card {
            min-width: 0 !important;
            min-height: 132px !important;
            padding: 14px 12px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: center !important;
            gap: 10px !important;
            border-radius: 18px !important;
          }

          .dash-summary-icon {
            width: 44px !important;
            height: 44px !important;
            border-radius: 14px !important;
          }

          .dash-summary-icon svg {
            width: 22px !important;
            height: 22px !important;
          }

          .dash-summary-card > div {
            width: 100% !important;
            min-width: 0 !important;
          }

          .dash-summary-card small {
            font-size: 11px !important;
            line-height: 1.2 !important;
          }

          .dash-summary-card strong {
            margin-top: 4px !important;
            font-size: 24px !important;
          }

          .dash-summary-card p {
            margin-top: 6px !important;
            font-size: 10px !important;
            line-height: 1.25 !important;
            white-space: normal !important;
          }

          .dash-action-grid {
            grid-template-columns: 1fr !important;
          }

          .dash-scan-banner,
          .dash-partner-card,
          .dash-journey-panel,
          .dash-business-progress-light {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          .dash-section-heading {
            width: 100% !important;
            min-width: 0 !important;
          }

          .dash-section-heading h2 {
            font-size: 22px !important;
          }

          .dash-section-heading p {
            max-width: 100% !important;
            white-space: normal !important;
          }
        }

        @media (max-width: 380px) {
          .dash-summary-grid {
            gap: 9px !important;
          }

          .dash-summary-card {
            min-height: 125px !important;
            padding: 12px 10px !important;
          }
        }


        /* =========================================================
           SPOTC OVERVIEW FINAL MOBILE FIX
           1. Two metric cards in every mobile row
           2. Only the Reward Journey points strip scrolls
           3. No clipped card bottoms
           4. Action buttons remain visible inside cards
        ========================================================= */

        .dash-overview.dash-overview-light{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow:visible!important;
        }

        .dash-summary-grid{
          width:100%!important;
          min-width:0!important;
        }

        .dash-journey-panel{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow:hidden!important;
        }

        .dash-journey-scroll{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          overscroll-behavior-x:contain!important;
          -webkit-overflow-scrolling:touch!important;
          scrollbar-width:none!important;
          touch-action:pan-x!important;
        }

        .dash-journey-scroll::-webkit-scrollbar{
          display:none!important;
        }

        .dash-journey-scroll .dash-journey-line{
          margin-top:0!important;
        }

        .dash-business-progress-light,
        .dash-business-grid-light,
        .dash-business-grid-light article{
          overflow:visible!important;
        }

        .dash-business-grid-light article{
          height:auto!important;
          min-height:0!important;
          display:flex!important;
          flex-direction:column!important;
        }

        .dash-business-actions{
          width:100%!important;
          margin-top:auto!important;
          padding-top:14px!important;
          overflow:visible!important;
        }

        .dash-business-actions button{
          position:relative!important;
          z-index:2!important;
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          visibility:visible!important;
          opacity:1!important;
        }

        @media(max-width:700px){
          .dash-summary-grid{
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:11px!important;
          }

          .dash-summary-card{
            width:100%!important;
            min-width:0!important;
            min-height:0!important;
            height:auto!important;
            padding:13px 11px!important;
            display:grid!important;
            grid-template-columns:40px minmax(0,1fr)!important;
            align-items:center!important;
            align-content:center!important;
            gap:10px!important;
            overflow:visible!important;
            border-radius:17px!important;
          }

          .dash-summary-icon{
            width:40px!important;
            height:40px!important;
            border-radius:13px!important;
          }

          .dash-summary-icon svg{
            width:20px!important;
            height:20px!important;
          }

          .dash-summary-card>div{
            width:100%!important;
            min-width:0!important;
          }

          .dash-summary-card small{
            overflow:hidden!important;
            font-size:10px!important;
            line-height:1.2!important;
            text-overflow:ellipsis!important;
            white-space:nowrap!important;
          }

          .dash-summary-card strong{
            margin-top:4px!important;
            font-size:22px!important;
            line-height:1!important;
          }

          .dash-summary-card p{
            margin:5px 0 0!important;
            overflow:visible!important;
            font-size:9px!important;
            line-height:1.25!important;
            white-space:normal!important;
          }

          .dash-action-grid{
            width:100%!important;
            grid-template-columns:1fr!important;
          }

          .dash-action-grid .dash-scan-banner,
          .dash-action-grid .dash-partner-card{
            width:100%!important;
            min-width:0!important;
            min-height:0!important;
            height:auto!important;
            overflow:visible!important;
          }

          .dash-action-grid .dash-scan-banner{
            grid-template-columns:48px minmax(0,1fr)!important;
            grid-template-rows:auto auto!important;
            padding:16px!important;
          }

          .dash-action-grid .dash-scan-banner button{
            grid-column:1/-1!important;
            width:100%!important;
            min-width:0!important;
            display:flex!important;
          }

          .dash-partner-card{
            grid-template-columns:46px minmax(0,1fr)!important;
            grid-template-rows:auto auto!important;
            padding:16px!important;
          }

          .dash-partner-card>button{
            grid-column:1/-1!important;
            width:100%!important;
            min-width:0!important;
            display:flex!important;
          }

          .dash-journey-panel{
            padding:18px 14px 20px!important;
          }

          .dash-journey-scroll{
            margin-top:20px!important;
          }

          .dash-journey-scroll .dash-journey-line{
            width:max-content!important;
            min-width:880px!important;
            grid-template-columns:repeat(11,80px)!important;
            padding:0 8px 8px!important;
            overflow:visible!important;
          }

          .dash-journey-scroll .dash-journey-line:before{
            left:48px!important;
            right:48px!important;
          }

          .dash-business-progress-light{
            padding:17px!important;
          }

          .dash-business-grid-light{
            grid-template-columns:1fr!important;
          }

          .dash-business-grid-light article{
            width:100%!important;
            min-width:0!important;
            height:auto!important;
            padding:15px!important;
            overflow:visible!important;
          }

          .dash-business-actions{
            display:grid!important;
            grid-template-columns:1fr!important;
            align-items:stretch!important;
            gap:10px!important;
          }

          .dash-business-actions>span{
            width:100%!important;
            white-space:normal!important;
          }

          .dash-business-actions button{
            width:100%!important;
            min-height:42px!important;
          }

          .dash-empty-progress.dash-empty-progress-light{
            height:auto!important;
            min-height:0!important;
            overflow:visible!important;
          }
        }

        @media(max-width:380px){
          .dash-summary-grid{
            gap:8px!important;
          }

          .dash-summary-card{
            padding:11px 9px!important;
            grid-template-columns:36px minmax(0,1fr)!important;
            gap:8px!important;
          }

          .dash-summary-icon{
            width:36px!important;
            height:36px!important;
          }

          .dash-summary-card strong{
            font-size:20px!important;
          }
        }

      `}</style>
    </div>
  );
}