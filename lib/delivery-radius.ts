'use client';

/* =========================================================
   SPOTC DELIVERY AREA
   ========================================================= */

export const SPOTC_DELIVERY_CENTER = {
  latitude: 11.2625206,
  longitude: 76.9536029,
  radiusKm: 5,
} as const;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/* =========================================================
   DELIVERY STATUS
   ========================================================= */

export type DeliveryAvailabilityStatus =
  | 'checking'
  | 'available'
  | 'outside'
  | 'permission_denied'
  | 'denied'
  | 'unavailable';

/* =========================================================
   DISTANCE CALCULATION
   ========================================================= */

const toRadians = (value: number): number =>
  (value * Math.PI) / 180;

export function distanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const earthRadiusKm = 6371;

  const dLat = toRadians(
    to.latitude - from.latitude,
  );

  const dLng = toRadians(
    to.longitude - from.longitude,
  );

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    );

  return earthRadiusKm * c;
}

/* =========================================================
   SHOP DELIVERY AVAILABILITY
   ========================================================= */

/*
 * IMPORTANT:
 *
 * We DO NOT request browser GPS/location here.
 *
 * Customers are allowed to:
 * - browse products
 * - add products to cart
 * - use Buy Now
 *
 * The actual 5 km delivery-area check is performed later
 * using the customer's selected delivery address at checkout.
 *
 * The old API shape is kept so existing components such as
 * ProductGrid and AppShell continue to compile.
 */

export function useDeliveryAvailability(): {
  status: DeliveryAvailabilityStatus;
  distanceKm: number | null;
  coordinates: Coordinates | null;
  canPurchase: boolean;
  message: string;
  requestLocation: () => void;
  radiusKm: number;
} {
  const status: DeliveryAvailabilityStatus =
    'available';

  return {
    status,

    distanceKm: null,

    coordinates: null,

    /*
     * Do not block Add to Cart / Buy Now based on GPS.
     */
    canPurchase: true,

    message: '',

    /*
     * Compatibility function.
     *
     * Existing components may still call requestLocation().
     * It intentionally does nothing, so the browser will
     * NOT show a location permission popup.
     */
    requestLocation: () => {},

    radiusKm: SPOTC_DELIVERY_CENTER.radiusKm,
  };
}