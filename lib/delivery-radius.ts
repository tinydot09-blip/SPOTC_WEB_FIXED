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
   DISTANCE CALCULATION
   ========================================================= */

const toRadians = (value: number) =>
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
 * The Shop no longer asks for GPS/location permission.
 *
 * Customers can:
 *   - browse
 *   - add to cart
 *   - buy now
 *
 * Delivery eligibility is checked using the selected
 * delivery address at checkout.
 */

export function useDeliveryAvailability() {
  return {
    status: 'available' as const,

    distanceKm: null,

    coordinates: null,

    /*
     * Do not block Shop purchasing based on browser GPS.
     * Checkout performs the real 5-km address check.
     */
    canPurchase: true,

    message: '',

    /*
     * Kept for compatibility with existing components.
     * It intentionally does nothing.
     */
    requestLocation: () => {},

    radiusKm: SPOTC_DELIVERY_CENTER.radiusKm,
  };
}