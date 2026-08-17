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

const DELIVERY_CACHE_KEY = 'spotc_delivery_location_v1';

type CachedDeliveryLocation = {
  latitude: number;
  longitude: number;
  savedAt: number;
};

const readCachedLocation = (): CachedDeliveryLocation | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DELIVERY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDeliveryLocation;
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > 5 * 60 * 1000) return null;
    return { latitude, longitude, savedAt };
  } catch { return null; }
};

const writeCachedLocation = (coordinates: Coordinates) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DELIVERY_CACHE_KEY, JSON.stringify({ ...coordinates, savedAt: Date.now() }));
  } catch {}
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

  const [coordinates, setCoordinates] =
    useState<Coordinates | null>(null);

  const hasValidLocationRef = useRef(false);

  const watchIdRef =
    useRef<number | null>(null);

  const retryTimerRef =
    useRef<number | null>(null);

  const updateFromPosition = useCallback(
    (position: GeolocationPosition) => {
      const customer: Coordinates = {
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

      hasValidLocationRef.current = true;
      writeCachedLocation(customer);

      setCoordinates(customer);
      setDistance(calculatedDistance);

      const nextStatus: DeliveryAvailabilityStatus =
        calculatedDistance <=
        SPOTC_DELIVERY_CENTER.radiusKm
          ? 'available'
          : 'outside';

      setStatus(nextStatus);

      console.log('[SPOTC DELIVERY]', {
        latitude: customer.latitude,
        longitude: customer.longitude,
        accuracyMeters: position.coords.accuracy,
        distanceKm:
          Number(calculatedDistance.toFixed(2)),
        radiusKm:
          SPOTC_DELIVERY_CENTER.radiusKm,
        status: nextStatus,
      });
    },
    [],
  );

  const handleLocationError = useCallback(
    (error: GeolocationPositionError) => {
      console.warn('[SPOTC DELIVERY] error', error.code, error.message);

      if (hasValidLocationRef.current) {
        return;
      }

      setCoordinates(null);
      setDistance(null);

      if (error.code === error.PERMISSION_DENIED) {
        setStatus('permission_denied');
        return;
      }

      setStatus('unavailable');
    },
    [],
  );

  const requestLocation = useCallback(
    (showChecking = false) => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.geolocation
      ) {
        if (!hasValidLocationRef.current) {
          setStatus('unavailable');
          setDistance(null);
          setCoordinates(null);
        }

        return;
      }

      /*
       * Do not make an already-confirmed outside banner
       * disappear during every automatic retry.
       */
      if (!hasValidLocationRef.current && showChecking) {
        setStatus('checking');
      }

      navigator.geolocation.getCurrentPosition(
        updateFromPosition,
        handleLocationError,
        {
          enableHighAccuracy: true,

          /*
           * Always request a fresh location.
           */
          maximumAge: 0,

          timeout: 15000,
        },
      );
    },
    [
      updateFromPosition,
      handleLocationError,
    ],
  );

  useEffect(() => {
    const cached = readCachedLocation();
    if (!cached) return;

    const customer: Coordinates = {
      latitude: cached.latitude,
      longitude: cached.longitude,
    };

    const calculatedDistance = distanceKm(customer, {
      latitude: SPOTC_DELIVERY_CENTER.latitude,
      longitude: SPOTC_DELIVERY_CENTER.longitude,
    });

    hasValidLocationRef.current = true;
    setCoordinates(customer);
    setDistance(calculatedDistance);
    setStatus(
      calculatedDistance <= SPOTC_DELIVERY_CENTER.radiusKm
        ? 'available'
        : 'outside',
    );
  }, []);

  /*
   * Initial location check + continuous GPS watch.
   */
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      setStatus('unavailable');
      return;
    }

    requestLocation(true);

    watchIdRef.current =
      navigator.geolocation.watchPosition(
        updateFromPosition,
        handleLocationError,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 30000,
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

  /*
   * Detect Chrome site-permission changes.
   *
   * Example:
   * Blocked → user changes to Allow → SPOTC rechecks.
   */
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.permissions?.query
    ) {
      return;
    }

    let permissionStatus:
      | PermissionStatus
      | null = null;

    let cancelled = false;

    const setupPermissionWatcher =
      async () => {
        try {
          permissionStatus =
            await navigator.permissions.query({
              name: 'geolocation' as PermissionName,
            });

          if (cancelled) return;

          const applyPermissionState = () => {
            if (!permissionStatus) return;

            console.log(
              '[SPOTC DELIVERY] permission',
              permissionStatus.state,
            );

            if (
              permissionStatus.state ===
              'granted'
            ) {
              requestLocation(true);
              return;
            }

            if (
              permissionStatus.state ===
              'denied'
            ) {
              if (!hasValidLocationRef.current) {
                setCoordinates(null);
                setDistance(null);
                setStatus('permission_denied');
              }
              return;
            }

            /*
             * state === prompt
             */
            if (
              permissionStatus.state ===
              'prompt'
            ) {
              requestLocation(true);
            }
          };

          permissionStatus.addEventListener(
            'change',
            applyPermissionState,
          );

          applyPermissionState();
        } catch (error) {
          console.warn(
            '[SPOTC DELIVERY] Permissions API unavailable',
            error,
          );
        }
      };

    void setupPermissionWatcher();

    return () => {
      cancelled = true;

      /*
       * No harm if listener remains briefly during unmount;
       * PermissionStatus is discarded with component.
       */
      permissionStatus = null;
    };
  }, [requestLocation]);

  /*
   * Android:
   *
   * User turns Location OFF/ON from quick settings
   * and returns to Chrome.
   *
   * Immediately retry when page becomes visible/focused.
   */
  useEffect(() => {
    const retry = () => {
      requestLocation(false);
    };

    const onVisibilityChange = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        retry();
      }
    };

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    window.addEventListener(
      'focus',
      retry,
    );

    window.addEventListener(
      'pageshow',
      retry,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );

      window.removeEventListener(
        'focus',
        retry,
      );

      window.removeEventListener(
        'pageshow',
        retry,
      );
    };
  }, [requestLocation]);

  /*
   * If Android Location service was OFF,
   * retry every 5 seconds until GPS works.
   *
   * Do not repeatedly retry when browser permission
   * is explicitly denied.
   */
  useEffect(() => {
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
        requestLocation(false);
      }, 5000);

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
        'Allow location access to check delivery availability. ' +
        'You can continue browsing SPOTC.'
      );
    }

    if (
      status === 'unavailable'
    ) {
      return (
        'Turn on device location to check delivery availability. ' +
        'You can continue browsing SPOTC.'
      );
    }

    return '';
  }, [status]);

  return {
    status,

    distanceKm: distance,

    coordinates,

    canPurchase,

    message,

    requestLocation: () =>
      requestLocation(true),

    radiusKm:
      SPOTC_DELIVERY_CENTER.radiusKm,
  };
}