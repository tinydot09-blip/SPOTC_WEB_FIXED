'use client';

/* =========================================================
   SPOTC DELIVERY AREA — PIN CODE BASED
   ========================================================= */

/*
 * SPOTC delivery is now based on the customer's PIN code.
 *
 * No browser GPS is required.
 * No distance/radius calculation is required.
 *
 * Coverage:
 * - Karamadai
 * - Mettupalayam
 * - Surrounding Mettupalayam Taluk service areas
 */

export const SPOTC_DELIVERY_PINCODES = [
  '641104',
  '641301',
  '641302',
  '641305',
  '641113',
  '638459',
] as const;

/* =========================================================
   PIN CODE CHECK
   ========================================================= */

export function isDeliveryPincode(
  pincode: string | null | undefined,
): boolean {
  if (!pincode) {
    return false;
  }

  const cleanPincode = String(pincode)
    .replace(/\D/g, '')
    .trim();

  return SPOTC_DELIVERY_PINCODES.includes(
    cleanPincode as
      (typeof SPOTC_DELIVERY_PINCODES)[number],
  );
}

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
   LEGACY COMPATIBILITY
   ========================================================= */

/*
 * Keep this type so older components that import Coordinates
 * do not break.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/*
 * Keep the old delivery-center export temporarily so any
 * existing component importing it continues to compile.
 *
 * IMPORTANT:
 * This is NOT used to decide whether delivery is available.
 */

export const SPOTC_DELIVERY_CENTER = {
  latitude: 11.2625206,
  longitude: 76.9536029,
  radiusKm: 0,
} as const;

/*
 * Keep distanceKm temporarily for compatibility with any
 * existing page that still imports it.
 *
 * We will remove its usage from the Address page next.
 */

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
 * Browsing, Add to Cart and Buy Now remain available.
 *
 * Final delivery eligibility will be checked using the
 * customer's PIN code on the Delivery Address page.
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
  return {
    status: 'available',

    distanceKm: null,

    coordinates: null,

    canPurchase: true,

    message: '',

    /*
     * Kept only for compatibility.
     * It intentionally does NOT request GPS.
     */
    requestLocation: () => {},

    radiusKm: 0,
  };
}