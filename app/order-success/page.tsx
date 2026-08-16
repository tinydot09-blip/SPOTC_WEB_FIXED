'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  ReceiptText,
  Store,
  Truck,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

import {
  db,
  firebaseReady,
} from '@/lib/firebase';
import { readOrderById } from '@/lib/orders';

type GeoLike =
  | {
      latitude?: number;
      longitude?: number;
      _lat?: number;
      _long?: number;
    }
  | null
  | undefined;

type OrderItem = {
  id?: string;
  title?: string;
  image?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  subtotal?: number;
};

type SavedFreeGift = {
  id: string;
  title: string;
  image: string;
  original_price: number;
  price: number;
  is_free_gift: boolean;
};

type SavedGiftBundle = {
  product_id: string;
  quantity: number;
  entitlement: number;
  gifts: SavedFreeGift[];
};

const readSavedGifts = (
  productId: string,
): SavedGiftBundle | null => {
  if (
    typeof window === 'undefined' ||
    !productId
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        `spotc-free-gifts:${productId}`,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as Partial<SavedGiftBundle>;

    if (
      !parsed ||
      !Array.isArray(parsed.gifts)
    ) {
      return null;
    }

    return {
      product_id:
        String(
          parsed.product_id ||
            productId,
        ),

      quantity:
        Number(parsed.quantity) || 1,

      entitlement:
        Number(parsed.entitlement) ||
        parsed.gifts.length,

      gifts: parsed.gifts
        .filter(
          (
            gift,
          ): gift is SavedFreeGift =>
            Boolean(
              gift &&
                typeof gift ===
                  'object' &&
                'id' in gift,
            ),
        )
        .map((gift) => ({
          id: String(gift.id),
          title:
            String(
              gift.title ||
                'FREE Gift',
            ),
          image:
            String(gift.image || ''),
          original_price:
            Number(
              gift.original_price,
            ) || 0,
          price: 0,
          is_free_gift: true,
        })),
    };
  } catch {
    return null;
  }
};

type AddressSnapshot = {
  full_name?: string;
  phone?: string;
  address_type?: string;
  house_no?: string;
  street?: string;
  landmark?: string;
  area?: string;
  city?: string;
  pincode?: string;
  state?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type OrderData = {
  id: string;
  order_number?: string;

  business_id?: string;
  business_ref?: unknown;
  business_name?: string;
  business_logo?: string;
  business_logo_url?: string;
  business_address?: string;
  business_phone?: string;
  business_whatsapp?: string;
  business_location?: GeoLike;

  address?: AddressSnapshot;
  delivery_address?: string;

  order_status?: string;
  payment_method?: string;
  total?: number;
  estimated_delivery?: string;

  items?: OrderItem[];

};

type BusinessData = {
  id: string;
  name: string;
  logo: string;
  address: string;
  phone: string;
  whatsapp: string;
  location: GeoLike;
};

type HydratedOrder = OrderData & {
  resolvedBusiness: BusinessData;
};

const text = (
  value: unknown,
): string =>
  typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();

const numberValue = (
  value: unknown,
): number | null => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
};

const money = (value: number): string =>
  `₹${Math.round(value).toLocaleString(
    'en-IN',
  )}`;

const normalize = (
  value: unknown,
): string =>
  text(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const refId = (
  value: unknown,
): string => {
  if (!value) return '';

  if (typeof value === 'string') {
    return (
      value
        .split('/')
        .filter(Boolean)
        .pop() || ''
    );
  }

  if (
    typeof value === 'object' &&
    value !== null
  ) {
    if ('id' in value) {
      return text(
        (value as {
          id?: unknown;
        }).id,
      );
    }

    if ('path' in value) {
      return (
        text(
          (value as {
            path?: unknown;
          }).path,
        )
          .split('/')
          .filter(Boolean)
          .pop() || ''
      );
    }
  }

  return '';
};

const businessFromData = (
  id: string,
  data: DocumentData,
): BusinessData => ({
  id,

  name:
    text(data.business_name) ||
    text(data.shop_name) ||
    text(data.name) ||
    'SPOTC Business',

  logo:
    text(data.logo_url) ||
    text(data.business_logo_url) ||
    text(data.business_logo) ||
    text(data.logo) ||
    text(data.photo_url) ||
    text(data.profile_photo_url) ||
    text(data.image_url) ||
    text(data.thumbnail_url),

  address:
    text(data.address) ||
    text(data.business_address) ||
    text(data.businessAddress) ||
    text(data.full_address) ||
    text(data.address_text) ||
    [
      text(data.house_no),
      text(data.street),
      text(data.landmark),
      text(data.area),
      text(data.city),
      text(data.district),
      text(data.pincode),
    ]
      .filter(Boolean)
      .join(', '),

  phone:
    text(data.business_phone) ||
    text(data.phone) ||
    text(data.contact_number) ||
    text(data.mobile) ||
    text(data.mobile_number) ||
    text(data.phone_number) ||
    text(data.contact_phone),

  whatsapp:
    text(data.business_whatsapp) ||
    text(data.whatsapp) ||
    text(data.whatsapp_number) ||
    text(data.phone) ||
    text(data.business_phone),

  location:
    (data.business_location ??
      data.location ??
      data.capturedLocation ??
      data.captured_location ??
      null) as GeoLike,
});

const fallbackBusinessFromOrder = (
  order: OrderData,
): BusinessData => ({
  id:
    text(order.business_id) ||
    refId(order.business_ref),

  name:
    text(order.business_name) ||
    'SPOTC Business',

  logo:
    text(order.business_logo) ||
    text(order.business_logo_url),

  address:
    text(order.business_address),

  phone:
    text(order.business_phone),

  whatsapp:
    text(order.business_whatsapp) ||
    text(order.business_phone),

  location:
    order.business_location ?? null,
});

async function readBusinessById(
  businessId: string,
): Promise<BusinessData | null> {
  if (!db || !businessId) return null;

  try {
    const snapshot = await getDoc(
      doc(
        db,
        'BusinessListings',
        businessId,
      ),
    );

    if (!snapshot.exists()) {
      return null;
    }

    return businessFromData(
      snapshot.id,
      snapshot.data(),
    );
  } catch (error) {
    console.error(
      'Business lookup by id failed:',
      error,
    );

    return null;
  }
}

async function productBusinessHints(
  order: OrderData,
): Promise<{
  businessIds: string[];
  ownerUids: string[];
  businessNames: string[];
}> {
  const businessIds = new Set<string>();
  const ownerUids = new Set<string>();
  const businessNames = new Set<string>();

  if (!db) {
    return {
      businessIds: [],
      ownerUids: [],
      businessNames: [],
    };
  }

  for (const item of order.items || []) {
    const productId = text(item.id);

    if (!productId) continue;

    try {
      const snapshot = await getDoc(
        doc(
          db,
          'BusinessProducts',
          productId,
        ),
      );

      if (!snapshot.exists()) continue;

      const data = snapshot.data();

      const linkedBusinessId =
        text(data.business_id) ||
        text(data.parent_business_id) ||
        refId(data.business_ref);

      if (linkedBusinessId) {
        businessIds.add(linkedBusinessId);
      }

      const ownerUid = text(data.owner_uid);

      if (ownerUid) {
        ownerUids.add(ownerUid);
      }

      const productBusinessName =
        text(data.business_name) ||
        text(data.shop_name);

      if (productBusinessName) {
        businessNames.add(
          productBusinessName,
        );
      }
    } catch (error) {
      console.error(
        `Product business lookup failed for ${productId}:`,
        error,
      );
    }
  }

  return {
    businessIds: [...businessIds],
    ownerUids: [...ownerUids],
    businessNames: [
      ...businessNames,
    ],
  };
}

async function scanBusinessListings(
  order: OrderData,
  hints: {
    businessIds: string[];
    ownerUids: string[];
    businessNames: string[];
  },
): Promise<BusinessData | null> {
  if (!db) return null;

  try {
    const snapshot = await getDocs(
      query(
        collection(
          db,
          'BusinessListings',
        ),
        limit(500),
      ),
    );

    const idTargets = new Set(
      [
        text(order.business_id),
        refId(order.business_ref),
        ...hints.businessIds,
      ].filter(Boolean),
    );

    const ownerTargets = new Set(
      hints.ownerUids.filter(Boolean),
    );

    const nameTargets = new Set(
      [
        text(order.business_name),
        ...hints.businessNames,
      ]
        .map(normalize)
        .filter(Boolean),
    );

    const matched =
      snapshot.docs.find(
        (businessDoc) => {
          const data =
            businessDoc.data();

          if (
            idTargets.has(
              businessDoc.id,
            )
          ) {
            return true;
          }

          const ownerUid =
            text(data.owner_uid);

          if (
            ownerUid &&
            ownerTargets.has(ownerUid)
          ) {
            return true;
          }

          return [
            businessDoc.id,
            data.business_name,
            data.shop_name,
            data.name,
            data.businessName,
          ].some((candidate) =>
            nameTargets.has(
              normalize(candidate),
            ),
          );
        },
      );

    return matched
      ? businessFromData(
          matched.id,
          matched.data(),
        )
      : null;
  } catch (error) {
    console.error(
      'BusinessListings scan failed:',
      error,
    );

    return null;
  }
}

async function resolveBusiness(
  order: OrderData,
): Promise<BusinessData> {
  const fallback =
    fallbackBusinessFromOrder(order);

  if (!db) return fallback;

  /*
   * 1. Use the business directly saved on the order.
   */
  const directIds = [
    text(order.business_id),
    refId(order.business_ref),
  ].filter(Boolean);

  for (const id of directIds) {
    const direct =
      await readBusinessById(id);

    if (direct) {
      return {
        ...fallback,
        ...direct,
      };
    }
  }

  /*
   * 2. Resolve the business through each ordered product.
   * BusinessProducts commonly contains the reliable business_ref.
   */
  const hints =
    await productBusinessHints(order);

  for (const id of hints.businessIds) {
    const linked =
      await readBusinessById(id);

    if (linked) {
      return {
        ...fallback,
        ...linked,
      };
    }
  }

  /*
   * 3. Try exact Firestore queries using every available name.
   */
  const names = [
    text(order.business_name),
    ...hints.businessNames,
  ].filter(Boolean);

  for (const businessName of names) {
    const exactQueries = [
      query(
        collection(
          db,
          'BusinessListings',
        ),
        where(
          'business_name',
          '==',
          businessName,
        ),
        limit(1),
      ),
      query(
        collection(
          db,
          'BusinessListings',
        ),
        where(
          'shop_name',
          '==',
          businessName,
        ),
        limit(1),
      ),
    ];

    for (const businessQuery of exactQueries) {
      try {
        const snapshot =
          await getDocs(
            businessQuery,
          );

        const first =
          snapshot.docs[0];

        if (first) {
          return {
            ...fallback,
            ...businessFromData(
              first.id,
              first.data(),
            ),
          };
        }
      } catch (error) {
        console.error(
          'Exact business query failed:',
          error,
        );
      }
    }
  }

  /*
   * 4. Final fallback: scan BusinessListings and match by:
   * document id, product-linked owner_uid, or normalized name.
   */
  const scanned =
    await scanBusinessListings(
      order,
      hints,
    );

  return scanned
    ? {
        ...fallback,
        ...scanned,
      }
    : fallback;
}

const phoneHref = (
  value: string,
): string => {
  const normalized = value.replace(
    /[^\d+]/g,
    '',
  );

  return normalized
    ? `tel:${normalized}`
    : '';
};

const whatsappHref = (
  value: string,
  businessName: string,
  orderNumber: string,
): string => {
  const digits = value.replace(
    /\D/g,
    '',
  );

  if (!digits) return '';

  const withCountryCode =
    digits.length === 10
      ? `91${digits}`
      : digits;

  const message = encodeURIComponent(
    `Hello ${businessName}, I placed SPOTC order ${orderNumber}.`,
  );

  return `https://wa.me/${withCountryCode}?text=${message}`;
};

const coordinatesOf = (
  value: GeoLike,
): {
  lat: number;
  lng: number;
} | null => {
  if (!value) return null;

  const lat = numberValue(
    value.latitude ?? value._lat,
  );

  const lng = numberValue(
    value.longitude ?? value._long,
  );

  if (lat == null || lng == null) {
    return null;
  }

  return {
    lat,
    lng,
  };
};

const addressCoordinatesOf = (
  address: AddressSnapshot | undefined,
): {
  lat: number;
  lng: number;
} | null => {
  if (!address) return null;

  const lat = numberValue(
    address.latitude,
  );

  const lng = numberValue(
    address.longitude,
  );

  if (lat == null || lng == null) {
    return null;
  }

  return {
    lat,
    lng,
  };
};

const distanceKm = (
  from: {
    lat: number;
    lng: number;
  },
  to: {
    lat: number;
    lng: number;
  },
): number => {
  const radius = 6371;

  const toRadians = (
    degrees: number,
  ) => (degrees * Math.PI) / 180;

  const latitudeDelta = toRadians(
    to.lat - from.lat,
  );

  const longitudeDelta = toRadians(
    to.lng - from.lng,
  );

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(
      toRadians(from.lat),
    ) *
      Math.cos(
        toRadians(to.lat),
      ) *
      Math.sin(
        longitudeDelta / 2,
      ) **
        2;

  return (
    radius *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
};

const distanceLabel = (
  order: HydratedOrder,
): string => {
  const customer =
    addressCoordinatesOf(
      order.address,
    );

  const business =
    coordinatesOf(
      order.resolvedBusiness
        .location,
    );

  if (!customer || !business) {
    return '';
  }

  const distance = distanceKm(
    customer,
    business,
  );

  if (distance < 1) {
    return `${Math.round(
      distance * 1000,
    )} m away`;
  }

  return `${distance.toFixed(
    1,
  )} km away`;
};

const mapsHref = (
  order: HydratedOrder,
): string => {
  const business =
    coordinatesOf(
      order.resolvedBusiness
        .location,
    );

  if (business) {
    return `https://www.google.com/maps/dir/?api=1&destination=${business.lat},${business.lng}`;
  }

  const address =
    order.resolvedBusiness.address;

  if (!address) return '';

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address,
  )}`;
};

export default function OrderSuccessPage() {
  const [orders, setOrders] =
    useState<HydratedOrder[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      if (!firebaseReady || !db) {
        setLoading(false);
        return;
      }

      const params =
        new URLSearchParams(
          window.location.search,
        );

      const rawIds =
        params.get('ids') ||
        params.get('id') ||
        '';

      const ids = rawIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      const firestore = db;

      const loadedOrders =
        await Promise.all(
          ids.map((id) =>
            readOrderById(
              firestore,
              id,
            ),
          ),
        );

      const validOrders =
        loadedOrders.filter(
          Boolean,
        ) as OrderData[];

      const hydrated =
        await Promise.all(
          validOrders.map(
            async (order) => ({
              ...order,
              resolvedBusiness:
                await resolveBusiness(
                  order,
                ),
            }),
          ),
        );

      if (!active) return;

      setOrders(hydrated);
      setLoading(false);
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(
    () => ({
      amount: orders.reduce(
        (sum, order) =>
          sum +
          Number(order.total || 0),
        0,
      ),
    }),
    [orders],
  );

  const selectedFreeGifts =
    useMemo(() => {
      const giftMap =
        new Map<string, SavedFreeGift>();

      for (const order of orders) {
        for (const item of order.items || []) {
          const productId =
            text(item.id);

          const bundle =
            readSavedGifts(productId);

          for (const gift of
            bundle?.gifts || []) {
            giftMap.set(
              gift.id,
              gift,
            );
          }
        }
      }

      return [...giftMap.values()];
    }, [orders]);

  if (loading) {
    return (
      <main className="spotc-success-v6-state">
        <Loader2
          className="spotc-success-v6-spin"
          size={36}
        />

        <p>
          Loading your order confirmation…
        </p>

        <style jsx global>
          {styles}
        </style>
      </main>
    );
  }

  if (!orders.length) {
    return (
      <main className="spotc-success-v6-state">
        <Package size={44} />

        <h1>Order details not found</h1>

        <p>
          Open My Orders to view your latest
          purchases.
        </p>

        <Link
          href="/dashboard?tab=orders"
          className="spotc-success-v6-state-link"
        >
          View My Orders
        </Link>

        <style jsx global>
          {styles}
        </style>
      </main>
    );
  }

  return (
    <main className="spotc-order-success-v6">
      <div className="spotc-order-success-v6__shell">
        <section className="spotc-order-success-v6__hero">
          <div className="spotc-order-success-v6__check">
            <CheckCircle2 size={60} />
          </div>

          <small>
            ORDER CONFIRMED
          </small>

          <h1>
            Thank you for shopping nearby.
          </h1>

          <p>
            Your COD order
            {orders.length > 1
              ? 's have'
              : ' has'}{' '}
            been sent to the selected shop
            {orders.length > 1
              ? 's'
              : ''}
            .
          </p>

          <div className="spotc-order-success-v6__grand-total">
            <span>Total Amount</span>

            <strong>
              {money(totals.amount)}
            </strong>
          </div>
        </section>

        <section className="spotc-order-success-v6__orders">
          {orders.map((order) => {
            const business =
              order.resolvedBusiness;

            const orderNumber =
              text(order.order_number) ||
              order.id;

            const callLink =
              phoneHref(business.phone);

            const whatsappLink =
              whatsappHref(
                business.whatsapp,
                business.name,
                orderNumber,
              );

            const directionLink =
              mapsHref(order);

            const distance =
              distanceLabel(order);

            return (
              <article
                className="spotc-order-success-v6__order-card"
                key={order.id}
              >
                <header className="spotc-order-success-v6__order-head">
                  <div className="spotc-order-success-v6__business">
                    {business.logo ? (
                      <img
                        src={business.logo}
                        alt={
                          business.name
                        }
                      />
                    ) : (
                      <span className="spotc-order-success-v6__business-fallback">
                        <Store size={24} />
                      </span>
                    )}

                    <div>
                      <small>
                        Order sent to
                      </small>

                      <h2>
                        {business.name}
                      </h2>

                      {distance && (
                        <span className="spotc-order-success-v6__distance">
                          <MapPin size={13} />
                          {distance}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="spotc-order-success-v6__order-number">
                    <small>
                      ORDER NUMBER
                    </small>

                    <strong>
                      {orderNumber}
                    </strong>
                  </div>
                </header>

                {business.address ? (
                  <div className="spotc-order-success-v6__business-address">
                    <MapPin size={18} />

                    <span>
                      {business.address}
                    </span>
                  </div>
                ) : (
                  <div className="spotc-order-success-v6__business-address spotc-order-success-v6__business-address--missing">
                    <MapPin size={18} />

                    <span>
                      Business address has not
                      been added yet.
                    </span>
                  </div>
                )}

                <div className="spotc-order-success-v6__business-actions">
                  {callLink ? (
                    <a href={callLink}>
                      <Phone size={17} />
                      Call
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                    >
                      <Phone size={17} />
                      Call unavailable
                    </button>
                  )}

                  {whatsappLink ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle
                        size={17}
                      />
                      WhatsApp
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                    >
                      <MessageCircle
                        size={17}
                      />
                      WhatsApp unavailable
                    </button>
                  )}

                  {directionLink ? (
                    <a
                      href={directionLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation size={17} />
                      Directions
                      <ExternalLink size={13} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                    >
                      <Navigation size={17} />
                      Directions unavailable
                    </button>
                  )}
                </div>

                <div className="spotc-order-success-v6__meta">
                  <span>
                    Status:{' '}
                    <strong>
                      {order.order_status ||
                        'placed'}
                    </strong>
                  </span>

                  <span>
                    Payment:{' '}
                    <strong>
                      {order.payment_method ||
                        'COD'}
                    </strong>
                  </span>

                  <b>
                    {money(
                      Number(
                        order.total || 0,
                      ),
                    )}
                  </b>
                </div>

                <div className="spotc-order-success-v6__delivery">
                  <Truck size={19} />

                  <span>
                    Estimated delivery:{' '}
                    {order.estimated_delivery ||
                      '15–45 mins'}
                  </span>
                </div>

                <div className="spotc-order-success-v6__products">
                  {(order.items || []).map(
                    (item, index) => {
                      const quantity =
                        Number(
                          item.quantity ||
                            item.qty ||
                            1,
                        );

                      const itemTotal =
                        Number(
                          item.subtotal ||
                            Number(
                              item.price ||
                                0,
                            ) *
                              quantity,
                        );

                      return (
                        <div
                          className="spotc-order-success-v6__product"
                          key={`${item.id || 'item'}-${index}`}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={
                                item.title ||
                                'Product'
                              }
                            />
                          ) : (
                            <span className="spotc-order-success-v6__product-fallback">
                              <Package
                                size={23}
                              />
                            </span>
                          )}

                          <div>
                            <strong>
                              {item.title ||
                                'Product'}
                            </strong>

                            <small>
                              Qty {quantity}
                            </small>
                          </div>

                          <b>
                            {money(
                              itemTotal,
                            )}
                          </b>
                        </div>
                      );
                    },
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {selectedFreeGifts.length > 0 && (
          <section className="spotc-order-success-v6__free-gifts">
            <div className="spotc-order-success-v6__free-gifts-head">
              <Gift size={22} />

              <div>
                <strong>
                  {selectedFreeGifts.length} FREE Gift
                  {selectedFreeGifts.length === 1 ? '' : 's'} Included
                </strong>

                <p>
                  Your selected gifts are included at no extra cost.
                </p>
              </div>
            </div>

            <div className="spotc-order-success-v6__free-gifts-list">
              {selectedFreeGifts.map((gift) => (
                <article
                  className="spotc-order-success-v6__free-gift"
                  key={gift.id}
                >
                  <div className="spotc-order-success-v6__free-gift-image">
                    {gift.image ? (
                      <img
                        src={gift.image}
                        alt={gift.title}
                      />
                    ) : (
                      <Gift size={22} />
                    )}
                  </div>

                  <div>
                    <strong>{gift.title}</strong>
                    <span>FREE</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <nav className="spotc-order-success-v6__actions">
          <Link
            href="/dashboard?tab=orders"
            className="spotc-order-success-v6__orders-button"
          >
            <ReceiptText size={19} />
            View My Orders
          </Link>

          <Link
            href="/shop"
            className="spotc-order-success-v6__shopping-button"
          >
            Continue Shopping
          </Link>
        </nav>
      </div>

      <style jsx global>
        {styles}
      </style>
    </main>
  );
}

const styles = `
  .spotc-order-success-v6,
  .spotc-order-success-v6 *,
  .spotc-order-success-v6 *::before,
  .spotc-order-success-v6 *::after {
    box-sizing: border-box !important;
  }

  .spotc-order-success-v6 {
    width: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding:
      46px 20px
      max(
        24px,
        env(safe-area-inset-bottom)
      ) !important;

    display: block !important;

    color: #24201c !important;

    background:
      radial-gradient(
        circle at top center,
        rgba(34, 197, 94, 0.07),
        transparent 28rem
      ),
      #f7f5f1 !important;
  }

  .spotc-order-success-v6__shell {
    width: min(980px, 100%) !important;
    margin: 0 auto !important;
    padding: 0 !important;

    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
  }

  .spotc-order-success-v6__hero {
    width: 100% !important;

    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;

    text-align: center !important;
  }

  .spotc-order-success-v6__check {
    width: 94px !important;
    height: 94px !important;

    display: grid !important;
    place-items: center !important;

    border: 2px solid
      rgba(
        25,
        157,
        79,
        0.28
      ) !important;

    border-radius: 50% !important;

    color: #199d4f !important;
    background: #edf9f1 !important;
  }

  .spotc-order-success-v6__hero
    > small {
    margin-top: 20px !important;

    color: #ad620d !important;

    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.15em !important;
  }

  .spotc-order-success-v6__hero h1 {
    max-width: 720px !important;
    margin: 18px auto 10px !important;

    color: #211d19 !important;

    font-size: clamp(
      38px,
      6vw,
      64px
    ) !important;

    line-height: 1.02 !important;
    font-weight: 650 !important;
    letter-spacing: -0.045em !important;
  }

  .spotc-order-success-v6__hero p {
    max-width: 680px !important;
    margin: 0 auto !important;

    color: #6f665e !important;

    font-size: 16px !important;
    line-height: 1.5 !important;
  }

  .spotc-order-success-v6__grand-total {
    width: min(
      370px,
      100%
    ) !important;

    min-height: 56px !important;

    margin: 24px auto 0 !important;
    padding: 14px 16px !important;

    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 16px !important;

    border: 1px solid
      #d9eee0 !important;

    border-radius: 16px !important;

    background: #eaf8ef !important;
  }

  .spotc-order-success-v6__grand-total
    span {
    color: #4d5f54 !important;
    font-size: 14px !important;
  }

  .spotc-order-success-v6__grand-total
    strong {
    color: #167b42 !important;
    font-size: 19px !important;
    font-weight: 700 !important;
  }

  .spotc-order-success-v6__orders {
    width: 100% !important;
    margin-top: 30px !important;

    display: grid !important;
    grid-template-columns:
      1fr !important;
    gap: 18px !important;
  }

  .spotc-order-success-v6__order-card {
    width: 100% !important;
    padding: 22px !important;

    display: block !important;

    border: 1px solid
      #e3dbd2 !important;

    border-radius: 22px !important;

    background: #ffffff !important;

    box-shadow:
      0 14px 36px
      rgba(
        48,
        34,
        22,
        0.06
      ) !important;
  }

  .spotc-order-success-v6__order-head {
    width: 100% !important;

    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 22px !important;
  }

  .spotc-order-success-v6__business {
    min-width: 0 !important;

    display: flex !important;
    align-items: flex-start !important;
    gap: 13px !important;
  }

  .spotc-order-success-v6__business
    img,
  .spotc-order-success-v6__business-fallback {
    width: 72px !important;
    height: 72px !important;
    flex: 0 0 72px !important;

    display: grid !important;
    place-items: center !important;

    object-fit: cover !important;

    border-radius: 18px !important;

    color: #6f655c !important;
    background: #f1eee9 !important;
  }

  .spotc-order-success-v6__business
    small,
  .spotc-order-success-v6__order-number
    small {
    display: block !important;

    color: #776d64 !important;

    font-size: 10px !important;
    font-weight: 600 !important;
    letter-spacing: 0.07em !important;
  }

  .spotc-order-success-v6__business
    h2 {
    margin: 4px 0 0 !important;

    color: #211d19 !important;

    font-size: 23px !important;
    font-weight: 650 !important;
  }

  .spotc-order-success-v6__distance {
    margin-top: 7px !important;

    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;

    color: #157c41 !important;

    font-size: 11px !important;
    font-weight: 600 !important;
  }

  .spotc-order-success-v6__order-number {
    min-width: 0 !important;
    text-align: right !important;
  }

  .spotc-order-success-v6__order-number
    strong {
    display: block !important;

    max-width: 300px !important;

    margin-top: 4px !important;

    overflow-wrap: anywhere !important;

    color: #29241f !important;

    font-size: 15px !important;
    font-weight: 650 !important;
  }

  .spotc-order-success-v6__business-address {
    margin-top: 16px !important;
    padding: 13px 14px !important;

    display: flex !important;
    align-items: flex-start !important;
    gap: 9px !important;

    border-radius: 14px !important;

    color: #675e56 !important;
    background: #faf8f5 !important;

    font-size: 13px !important;
    line-height: 1.45 !important;
  }

  .spotc-order-success-v6__business-address
    svg {
    flex: 0 0 auto !important;
    color: #d06c12 !important;
  }

  .spotc-order-success-v6__business-address--missing {
    color: #8d837a !important;
    background: #fbfaf8 !important;
  }

  .spotc-order-success-v6__business-actions {
    margin-top: 12px !important;

    display: grid !important;
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      ) !important;

    gap: 9px !important;
  }

  .spotc-order-success-v6__business-actions
    a,
  .spotc-order-success-v6__business-actions
    button {
    min-height: 44px !important;
    padding: 9px 12px !important;

    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;

    border: 1px solid
      #ded6ce !important;

    border-radius: 13px !important;

    color: #29241f !important;
    background: #ffffff !important;

    text-decoration: none !important;

    font-size: 12px !important;
    font-weight: 650 !important;

    white-space: nowrap !important;
  }

  .spotc-order-success-v6__business-actions
    a:nth-child(2) {
    color: #137a40 !important;
    border-color: #c8e8d3 !important;
    background: #eff9f2 !important;
  }

  .spotc-order-success-v6__business-actions
    button:disabled {
    opacity: 0.45 !important;
    cursor: not-allowed !important;
  }

  .spotc-order-success-v6__meta {
    width: 100% !important;

    margin-top: 14px !important;
    padding: 14px 15px !important;

    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;

    gap: 12px 22px !important;

    border-radius: 14px !important;

    background: #faf8f5 !important;
  }

  .spotc-order-success-v6__meta
    span {
    color: #625951 !important;
    font-size: 13px !important;
  }

  .spotc-order-success-v6__meta
    span strong {
    color: #28231f !important;
    text-transform: capitalize !important;
  }

  .spotc-order-success-v6__meta
    > b {
    margin-left: auto !important;

    color: #211d19 !important;

    font-size: 17px !important;
  }

  .spotc-order-success-v6__delivery {
    width: 100% !important;

    margin-top: 14px !important;
    padding: 13px 14px !important;

    display: flex !important;
    align-items: center !important;
    gap: 9px !important;

    border-radius: 14px !important;

    color: #137b40 !important;
    background: #edf9f1 !important;

    font-size: 13px !important;
    font-weight: 550 !important;
  }

  .spotc-order-success-v6__products {
    width: 100% !important;
    margin-top: 14px !important;

    display: grid !important;
    grid-template-columns:
      1fr !important;

    gap: 10px !important;
  }

  .spotc-order-success-v6__product {
    width: 100% !important;
    padding: 10px !important;

    display: grid !important;
    grid-template-columns:
      56px minmax(
        0,
        1fr
      ) auto !important;

    align-items: center !important;
    gap: 12px !important;

    border: 1px solid
      #ebe5de !important;

    border-radius: 15px !important;

    background: #ffffff !important;
  }

  .spotc-order-success-v6__product
    img,
  .spotc-order-success-v6__product-fallback {
    width: 56px !important;
    height: 56px !important;

    display: grid !important;
    place-items: center !important;

    object-fit: cover !important;

    border-radius: 12px !important;

    color: #9d9288 !important;
    background: #f1eee9 !important;
  }

  .spotc-order-success-v6__product
    > div {
    min-width: 0 !important;
  }

  .spotc-order-success-v6__product
    > div strong {
    display: block !important;

    overflow: hidden !important;

    color: #24201c !important;

    font-size: 14px !important;
    font-weight: 600 !important;

    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .spotc-order-success-v6__product
    small {
    display: block !important;
    margin-top: 4px !important;

    color: #756b62 !important;

    font-size: 11px !important;
  }

  .spotc-order-success-v6__product
    > b {
    color: #24201c !important;

    font-size: 14px !important;
    font-weight: 650 !important;
  }

  .spotc-order-success-v6__free-gifts {
    width: 100% !important;
    margin-top: 20px !important;
    padding: 18px 20px !important;

    border: 1px solid
      #cfe8d7 !important;

    border-radius: 18px !important;

    background: #f7fcf8 !important;
  }

  .spotc-order-success-v6__free-gifts-head {
    display: flex !important;
    align-items: flex-start !important;
    gap: 12px !important;

    color: #176d3d !important;
  }

  .spotc-order-success-v6__free-gifts-head
    strong {
    display: block !important;
    font-size: 15px !important;
    font-weight: 600 !important;
  }

  .spotc-order-success-v6__free-gifts-head
    p {
    margin: 4px 0 0 !important;
    color: #5e7465 !important;
    font-size: 13px !important;
  }

  .spotc-order-success-v6__free-gifts-list {
    margin-top: 14px !important;

    display: grid !important;
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      ) !important;
    gap: 10px !important;
  }

  .spotc-order-success-v6__free-gift {
    min-width: 0 !important;
    padding: 10px !important;

    display: grid !important;
    grid-template-columns:
      54px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 11px !important;

    border: 1px solid
      #dcecdf !important;
    border-radius: 13px !important;

    background: #ffffff !important;
  }

  .spotc-order-success-v6__free-gift-image {
    width: 54px !important;
    height: 54px !important;

    overflow: hidden !important;

    display: grid !important;
    place-items: center !important;

    border-radius: 10px !important;

    color: #6f9178 !important;
    background: #f7fcf8 !important;
  }

  .spotc-order-success-v6__free-gift-image
    img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
  }

  .spotc-order-success-v6__free-gift
    strong {
    display: block !important;

    overflow: hidden !important;

    color: #24201c !important;

    font-size: 13px !important;
    font-weight: 500 !important;

    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .spotc-order-success-v6__free-gift
    span {
    display: inline-block !important;
    margin-top: 5px !important;

    color: #168648 !important;

    font-size: 12px !important;
    font-weight: 600 !important;
  }

  .spotc-order-success-v6__actions {
    width: 100% !important;
    margin-top: 22px !important;

    display: grid !important;
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      ) !important;

    gap: 12px !important;
  }

  .spotc-order-success-v6__actions
    a {
    width: 100% !important;
    min-height: 54px !important;
    padding: 12px 18px !important;

    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 9px !important;

    border-radius: 15px !important;

    text-decoration: none !important;

    writing-mode: horizontal-tb !important;
    white-space: nowrap !important;

    font-size: 14px !important;
    font-weight: 700 !important;
  }

  .spotc-order-success-v6__orders-button {
    color: #ffffff !important;
    border: 1px solid
      #171717 !important;
    background: #171717 !important;
  }

  .spotc-order-success-v6__shopping-button {
    color: #29241f !important;
    border: 1px solid
      #d9d1c9 !important;
    background: #ffffff !important;
  }

  .spotc-success-v6-state {
    min-height: 100vh !important;
    padding: 30px !important;

    display: grid !important;
    place-content: center !important;
    justify-items: center !important;

    gap: 12px !important;

    color: #24201c !important;
    text-align: center !important;

    background: #f7f5f1 !important;
  }

  .spotc-success-v6-state-link {
    margin-top: 8px !important;
    padding: 12px 18px !important;

    border-radius: 13px !important;

    color: #ffffff !important;
    background: #171717 !important;

    text-decoration: none !important;
    font-weight: 650 !important;
  }

  .spotc-success-v6-spin {
    color: #199d4f !important;

    animation:
      spotcSuccessV6Spin
      0.8s linear infinite !important;
  }

  @keyframes spotcSuccessV6Spin {
    to {
      transform: rotate(
        360deg
      );
    }
  }

  body:has(.spotc-order-success-v6)
    .spotc-footer {
    margin-top: 0 !important;
  }

  @media (max-width: 680px) {
    .spotc-order-success-v6 {
      padding:
        28px 12px
        max(
          18px,
          env(
            safe-area-inset-bottom
          )
        ) !important;
    }

    .spotc-order-success-v6__free-gifts-list {
      grid-template-columns:
        1fr !important;
    }

    .spotc-order-success-v6__hero
      h1 {
      font-size: 40px !important;
    }

    .spotc-order-success-v6__order-card {
      padding: 16px !important;
    }

    .spotc-order-success-v6__order-head {
      display: block !important;
    }

    .spotc-order-success-v6__order-number {
      margin-top: 15px !important;
      text-align: left !important;
    }

    .spotc-order-success-v6__business-actions {
      grid-template-columns:
        1fr !important;
    }

    .spotc-order-success-v6__meta
      > b {
      width: 100% !important;
      margin-left: 0 !important;
    }

    .spotc-order-success-v6__product {
      grid-template-columns:
        52px minmax(
          0,
          1fr
        ) !important;
    }

    .spotc-order-success-v6__product
      img,
    .spotc-order-success-v6__product-fallback {
      width: 52px !important;
      height: 52px !important;
    }

    .spotc-order-success-v6__product
      > b {
      grid-column: 2 !important;
    }

    .spotc-order-success-v6__actions {
      grid-template-columns:
        1fr !important;
    }
  }
`;