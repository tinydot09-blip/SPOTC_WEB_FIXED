'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export const SPOTC_DELIVERY_CENTER = {
  latitude: 11.2625206,
  longitude: 76.9536029,
  radiusKm: 5,
} as const;

export type DeliveryAvailabilityStatus =
  | 'checking'
  | 'available'
  | 'outside'
  | 'permission_denied'
  | 'unavailable';

type Coordinates = {
  latitude: number;
  longitude: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

export function distanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const earthRadiusKm = 6371;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

export function useDeliveryAvailability() {
  const [status, setStatus] =
    useState<DeliveryAvailabilityStatus>('checking');
  const [distance, setDistance] = useState<number | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setDistance(null);
      return;
    }

    setStatus('checking');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const customer = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        const calculatedDistance = distanceKm(customer, {
          latitude: SPOTC_DELIVERY_CENTER.latitude,
          longitude: SPOTC_DELIVERY_CENTER.longitude,
        });

        setDistance(calculatedDistance);
        setStatus(
          calculatedDistance <= SPOTC_DELIVERY_CENTER.radiusKm
            ? 'available'
            : 'outside',
        );
      },
      (error) => {
        setDistance(null);

        if (error.code === error.PERMISSION_DENIED) {
          setStatus('permission_denied');
        } else {
          setStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60_000,
      },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const canPurchase = status === 'available';

  const message = useMemo(() => {
    if (status === 'outside') {
      return 'SPOTC is coming to your area shortly. You can browse all products now. Ordering will be available when SPOTC launches in your area.';
    }

    if (status === 'permission_denied') {
      return 'Enable location to check delivery availability. You can continue browsing SPOTC.';
    }

    if (status === 'unavailable') {
      return 'We could not check your delivery area. You can continue browsing SPOTC and try location again.';
    }

    return '';
  }, [status]);

  return {
    status,
    distanceKm: distance,
    canPurchase,
    message,
    requestLocation,
    radiusKm: SPOTC_DELIVERY_CENTER.radiusKm,
  };
}