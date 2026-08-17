'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

export function useDeliveryAvailability() {
  const [status, setStatus] =
    useState<DeliveryAvailabilityStatus>('checking');

  const [distance, setDistance] =
    useState<number | null>(null);

  const retryTimerRef =
    useRef<number | null>(null);

  const watchIdRef =
    useRef<number | null>(null);

  const updateFromPosition = useCallback(
    (position: GeolocationPosition) => {
      const customer = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      const calculatedDistance = distanceKm(
        customer,
        {
          latitude:
            SPOTC_DELIVERY_CENTER.latitude,
          longitude:
            SPOTC_DELIVERY_CENTER.longitude,
        },
      );

      setDistance(calculatedDistance);

      setStatus(
        calculatedDistance <=
          SPOTC_DELIVERY_CENTER.radiusKm
          ? 'available'
          : 'outside',
      );
    },
    [],
  );

  const handleLocationError = useCallback(
    (error: GeolocationPositionError) => {
      setDistance(null);

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        setStatus('permission_denied');
        return;
      }

      setStatus('unavailable');
    },
    [],
  );

  const requestLocation = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      setStatus('unavailable');
      setDistance(null);
      return;
    }

    setStatus('checking');

    navigator.geolocation.getCurrentPosition(
      updateFromPosition,
      handleLocationError,
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15_000,
      },
    );
  }, [
    updateFromPosition,
    handleLocationError,
  ]);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      setStatus('unavailable');
      return;
    }

    requestLocation();

    /*
     * Watch the device location.
     *
     * Important for Android:
     * if Location was OFF when SPOTC opened,
     * then the user turns it ON later,
     * watchPosition will receive a position
     * and immediately recalculate the 5 km rule.
     */
    watchIdRef.current =
      navigator.geolocation.watchPosition(
        updateFromPosition,
        handleLocationError,
        {
          enableHighAccuracy: true,
          maximumAge: 10_000,
          timeout: 20_000,
        },
      );

    return () => {
      if (
        watchIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current,
        );

        watchIdRef.current = null;
      }
    };
  }, [
    requestLocation,
    updateFromPosition,
    handleLocationError,
  ]);

  useEffect(() => {
    /*
     * When the browser/tab becomes active again,
     * retry the location check.
     *
     * This handles:
     * 1. user opens Android quick settings,
     * 2. turns Location ON,
     * 3. returns to Chrome / SPOTC.
     */
    const retryWhenVisible = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        requestLocation();
      }
    };

    const retryWhenFocused = () => {
      requestLocation();
    };

    document.addEventListener(
      'visibilitychange',
      retryWhenVisible,
    );

    window.addEventListener(
      'focus',
      retryWhenFocused,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        retryWhenVisible,
      );

      window.removeEventListener(
        'focus',
        retryWhenFocused,
      );
    };
  }, [requestLocation]);

  useEffect(() => {
    /*
     * Extra recovery for mobile browsers.
     *
     * If Android Location was unavailable,
     * silently retry every 8 seconds.
     * Do NOT repeatedly retry a denied
     * browser permission.
     */
    if (
      status !== 'unavailable'
    ) {
      if (
        retryTimerRef.current !== null
      ) {
        window.clearInterval(
          retryTimerRef.current,
        );

        retryTimerRef.current = null;
      }

      return;
    }

    retryTimerRef.current =
      window.setInterval(() => {
        requestLocation();
      }, 8000);

    return () => {
      if (
        retryTimerRef.current !== null
      ) {
        window.clearInterval(
          retryTimerRef.current,
        );

        retryTimerRef.current = null;
      }
    };
  }, [
    status,
    requestLocation,
  ]);

  const canPurchase =
    status === 'available';

  const message = useMemo(() => {
    if (status === 'outside') {
      return (
        'SPOTC is coming to your area shortly. ' +
        'You can browse all products now. ' +
        'Ordering will be available when SPOTC launches in your area.'
      );
    }

    if (
      status === 'permission_denied'
    ) {
      return (
        'Location access is blocked. ' +
        'You can continue browsing SPOTC.'
      );
    }

    if (
      status === 'unavailable'
    ) {
      return (
        'We could not check your current delivery area. ' +
        'You can continue browsing SPOTC.'
      );
    }

    return '';
  }, [status]);

  return {
    status,
    distanceKm: distance,
    canPurchase,
    message,
    requestLocation,
    radiusKm:
      SPOTC_DELIVERY_CENTER.radiusKm,
  };
}