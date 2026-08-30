'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/* =========================================================
   SPOTC DELIVERY AREA
   ========================================================= */

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

type DeliveryLocationSource =
  | 'gps'
  | 'cache'
  | 'permission'
  | 'browser_unavailable'
  | 'location_error';

const DELIVERY_CACHE_KEY =
  'spotc_delivery_location_v1';

const DELIVERY_TRACKING_KEY =
  'spotc_delivery_tracking_v1';

type CachedDeliveryLocation = {
  latitude: number;
  longitude: number;
  savedAt: number;
};

/* =========================================================
   GA4
   ========================================================= */

type GtagWindow = Window & {
  gtag?: (
    command: string,
    eventName: string,
    params?: Record<string, unknown>,
  ) => void;
};

function getDistanceBand(
  distance: number | null,
): string {
  if (
    distance === null ||
    !Number.isFinite(distance)
  ) {
    return 'unknown';
  }

  if (distance <= 1) return '0_1km';
  if (distance <= 2) return '1_2km';
  if (distance <= 3) return '2_3km';
  if (distance <= 4) return '3_4km';
  if (distance <= 5) return '4_5km';
  if (distance <= 7) return '5_7km';
  if (distance <= 10) return '7_10km';

  return 'over_10km';
}

function sendGaEvent(
  eventName: string,
  params: Record<string, unknown> = {},
) {
  if (typeof window === 'undefined') {
    return;
  }

  const gtag = (window as GtagWindow).gtag;

  if (typeof gtag !== 'function') {
    return;
  }

  gtag('event', eventName, {
    ...params,

    page_path:
      window.location.pathname,

    page_location:
      window.location.href,
  });
}

/*
 * Prevent watchPosition / focus / pageshow from sending
 * the same GA event repeatedly in the same browser session.
 */
function alreadyTracked(
  trackingKey: string,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const raw =
      window.sessionStorage.getItem(
        DELIVERY_TRACKING_KEY,
      );

    const tracked: string[] =
      raw ? JSON.parse(raw) : [];

    if (tracked.includes(trackingKey)) {
      return true;
    }

    tracked.push(trackingKey);

    window.sessionStorage.setItem(
      DELIVERY_TRACKING_KEY,
      JSON.stringify(tracked),
    );

    return false;
  } catch {
    return false;
  }
}

function trackDeliveryStatus(
  status: DeliveryAvailabilityStatus,
  distance: number | null,
  source: DeliveryLocationSource,
  accuracyMeters?: number | null,
) {
  if (
    typeof window === 'undefined' ||
    status === 'checking'
  ) {
    return;
  }

  const distanceBand =
    getDistanceBand(distance);

  /*
   * We deliberately DO NOT send exact GPS coordinates
   * to Google Analytics.
   */
  const commonParams = {
    delivery_status: status,

    delivery_available:
      status === 'available',

    delivery_radius_km:
      SPOTC_DELIVERY_CENTER.radiusKm,

    distance_band:
      distanceBand,

    location_source:
      source,

    gps_accuracy_band:
      accuracyMeters == null
        ? 'unknown'
        : accuracyMeters <= 20
          ? '0_20m'
          : accuracyMeters <= 50
            ? '20_50m'
            : accuracyMeters <= 100
              ? '50_100m'
              : 'over_100m',
  };

  /*
   * One general event.
   *
   * This lets us analyse all location checks together.
   */
  const generalKey =
    `delivery_location_checked:${status}:${distanceBand}`;

  if (!alreadyTracked(generalKey)) {
    sendGaEvent(
      'delivery_location_checked',
      commonParams,
    );
  }

  /*
   * Separate easy-to-read GA4 events.
   *
   * These will appear directly in:
   * GA4 → Reports → Engagement → Events
   */
  let eventName = '';

  if (status === 'available') {
    eventName = 'delivery_available';
  }

  if (status === 'outside') {
    eventName = 'delivery_outside_area';
  }

  if (status === 'permission_denied') {
    eventName = 'delivery_location_denied';
  }

  if (status === 'unavailable') {
    eventName =
      'delivery_location_unavailable';
  }

  if (!eventName) {
    return;
  }

  const statusKey =
    `${eventName}:${distanceBand}`;

  if (alreadyTracked(statusKey)) {
    return;
  }

  sendGaEvent(
    eventName,
    commonParams,
  );
}

/* =========================================================
   LOCATION CACHE
   ========================================================= */

const readCachedLocation =
  (): CachedDeliveryLocation | null => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const raw =
        window.sessionStorage.getItem(
          DELIVERY_CACHE_KEY,
        );

      if (!raw) {
        return null;
      }

      const parsed =
        JSON.parse(
          raw,
        ) as CachedDeliveryLocation;

      const latitude =
        Number(parsed.latitude);

      const longitude =
        Number(parsed.longitude);

      const savedAt =
        Number(parsed.savedAt);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(savedAt)
      ) {
        return null;
      }

      /*
       * Location cache valid for 5 minutes.
       */
      if (
        Date.now() - savedAt >
        5 * 60 * 1000
      ) {
        return null;
      }

      return {
        latitude,
        longitude,
        savedAt,
      };
    } catch {
      return null;
    }
  };

const writeCachedLocation = (
  coordinates: Coordinates,
) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      DELIVERY_CACHE_KEY,
      JSON.stringify({
        ...coordinates,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failure.
  }
};

/* =========================================================
   DISTANCE CALCULATION
   ========================================================= */

const toRadians = (
  value: number,
) =>
  (value * Math.PI) / 180;

export function distanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const earthRadiusKm = 6371;

  const dLat = toRadians(
    to.latitude -
      from.latitude,
  );

  const dLng = toRadians(
    to.longitude -
      from.longitude,
  );

  const lat1 =
    toRadians(from.latitude);

  const lat2 =
    toRadians(to.latitude);

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
   DELIVERY AVAILABILITY HOOK
   ========================================================= */

export function useDeliveryAvailability() {
  const [status, setStatus] =
    useState<DeliveryAvailabilityStatus>(
      'checking',
    );

  const [distance, setDistance] =
    useState<number | null>(null);

  const [coordinates, setCoordinates] =
    useState<Coordinates | null>(null);

  const hasValidLocationRef =
    useRef(false);

  const watchIdRef =
    useRef<number | null>(null);

  const retryTimerRef =
    useRef<number | null>(null);

  /*
   * Keeps the last good location result.
   * Prevents temporary Android GPS errors from
   * replacing a confirmed valid location.
   */
  const lastValidStatusRef =
    useRef<DeliveryAvailabilityStatus | null>(
      null,
    );

  /* =======================================================
     VALID GPS POSITION
     ======================================================= */

  const updateFromPosition =
    useCallback(
      (
        position:
          GeolocationPosition,
      ) => {
        const customer: Coordinates = {
          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude,
        };

        const calculatedDistance =
          distanceKm(
            customer,
            {
              latitude:
                SPOTC_DELIVERY_CENTER.latitude,

              longitude:
                SPOTC_DELIVERY_CENTER.longitude,
            },
          );

        const nextStatus:
          DeliveryAvailabilityStatus =
          calculatedDistance <=
          SPOTC_DELIVERY_CENTER.radiusKm
            ? 'available'
            : 'outside';

        hasValidLocationRef.current =
          true;

        lastValidStatusRef.current =
          nextStatus;

        writeCachedLocation(
          customer,
        );

        setCoordinates(customer);

        setDistance(
          calculatedDistance,
        );

        setStatus(
          nextStatus,
        );

        console.log(
          '[SPOTC DELIVERY]',
          {
            latitude:
              customer.latitude,

            longitude:
              customer.longitude,

            accuracyMeters:
              position.coords.accuracy,

            distanceKm:
              Number(
                calculatedDistance.toFixed(
                  2,
                ),
              ),

            radiusKm:
              SPOTC_DELIVERY_CENTER.radiusKm,

            status:
              nextStatus,
          },
        );

        /*
         * GA4 TRACKING
         */
        trackDeliveryStatus(
          nextStatus,
          calculatedDistance,
          'gps',
          position.coords.accuracy,
        );
      },
      [],
    );

  /* =======================================================
     LOCATION ERROR
     ======================================================= */

  const handleLocationError =
    useCallback(
      (
        error:
          GeolocationPositionError,
      ) => {
        console.warn(
          '[SPOTC DELIVERY] error',
          error.code,
          error.message,
        );

        /*
         * If we already have a valid GPS location,
         * do NOT replace it because of a temporary
         * Android GPS error.
         */
        if (
          hasValidLocationRef.current
        ) {
          return;
        }

        setCoordinates(null);
        setDistance(null);

        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {
          setStatus(
            'permission_denied',
          );

          trackDeliveryStatus(
            'permission_denied',
            null,
            'location_error',
          );

          return;
        }

        setStatus(
          'unavailable',
        );

        trackDeliveryStatus(
          'unavailable',
          null,
          'location_error',
        );
      },
      [],
    );

  /* =======================================================
     REQUEST LOCATION
     ======================================================= */

  const requestLocation =
    useCallback(
      (
        showChecking = false,
      ) => {
        if (
          typeof navigator ===
            'undefined' ||
          !navigator.geolocation
        ) {
          if (
            !hasValidLocationRef.current
          ) {
            setStatus(
              'unavailable',
            );

            setDistance(null);
            setCoordinates(null);

            trackDeliveryStatus(
              'unavailable',
              null,
              'browser_unavailable',
            );
          }

          return;
        }

        /*
         * Do not make a confirmed outside banner
         * disappear every time location retries.
         */
        if (
          !hasValidLocationRef.current &&
          showChecking
        ) {
          setStatus(
            'checking',
          );
        }

        navigator.geolocation
          .getCurrentPosition(
            updateFromPosition,

            handleLocationError,

            {
              /*
               * Important for the 5-km
               * delivery boundary.
               */
              enableHighAccuracy:
                true,

              /*
               * Always ask for fresh GPS.
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

  /* =======================================================
     USE CACHED LOCATION IMMEDIATELY
     ======================================================= */

  useEffect(() => {
    const cached =
      readCachedLocation();

    if (!cached) {
      return;
    }

    const customer: Coordinates = {
      latitude:
        cached.latitude,

      longitude:
        cached.longitude,
    };

    const calculatedDistance =
      distanceKm(
        customer,
        {
          latitude:
            SPOTC_DELIVERY_CENTER.latitude,

          longitude:
            SPOTC_DELIVERY_CENTER.longitude,
        },
      );

    const cachedStatus:
      DeliveryAvailabilityStatus =
      calculatedDistance <=
      SPOTC_DELIVERY_CENTER.radiusKm
        ? 'available'
        : 'outside';

    hasValidLocationRef.current =
      true;

    lastValidStatusRef.current =
      cachedStatus;

    setCoordinates(
      customer,
    );

    setDistance(
      calculatedDistance,
    );

    setStatus(
      cachedStatus,
    );

    /*
     * Track cached result separately.
     * Exact coordinates are NOT sent.
     */
    trackDeliveryStatus(
      cachedStatus,
      calculatedDistance,
      'cache',
    );
  }, []);

  /* =======================================================
     INITIAL LOCATION + CONTINUOUS GPS WATCH
     ======================================================= */

  useEffect(() => {
    if (
      typeof navigator ===
        'undefined' ||
      !navigator.geolocation
    ) {
      setStatus(
        'unavailable',
      );

      trackDeliveryStatus(
        'unavailable',
        null,
        'browser_unavailable',
      );

      return;
    }

    /*
     * Initial fresh location.
     */
    requestLocation(true);

    /*
     * Keep watching because the user
     * may be travelling/moving.
     */
    watchIdRef.current =
      navigator.geolocation
        .watchPosition(
          updateFromPosition,

          handleLocationError,

          {
            enableHighAccuracy:
              true,

            maximumAge: 0,

            timeout: 30000,
          },
        );

    return () => {
      if (
        watchIdRef.current !==
        null
      ) {
        navigator.geolocation
          .clearWatch(
            watchIdRef.current,
          );

        watchIdRef.current =
          null;
      }
    };
  }, [
    requestLocation,
    updateFromPosition,
    handleLocationError,
  ]);

  /* =======================================================
     BROWSER LOCATION PERMISSION WATCH
     ======================================================= */

  useEffect(() => {
    if (
      typeof navigator ===
        'undefined' ||
      !navigator.permissions?.query
    ) {
      return;
    }

    let permissionStatus:
      | PermissionStatus
      | null = null;

    let cancelled = false;

    let permissionChangeHandler:
      (() => void) | null =
      null;

    const setupPermissionWatcher =
      async () => {
        try {
          permissionStatus =
            await navigator.permissions.query(
              {
                name:
                  'geolocation' as PermissionName,
              },
            );

          if (cancelled) {
            return;
          }

          permissionChangeHandler =
            () => {
              if (
                !permissionStatus
              ) {
                return;
              }

              console.log(
                '[SPOTC DELIVERY] permission',
                permissionStatus.state,
              );

              if (
                permissionStatus.state ===
                'granted'
              ) {
                requestLocation(
                  true,
                );

                return;
              }

              if (
                permissionStatus.state ===
                'denied'
              ) {
                if (
                  !hasValidLocationRef.current
                ) {
                  setCoordinates(
                    null,
                  );

                  setDistance(
                    null,
                  );

                  setStatus(
                    'permission_denied',
                  );

                  trackDeliveryStatus(
                    'permission_denied',
                    null,
                    'permission',
                  );
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
                requestLocation(
                  true,
                );
              }
            };

          permissionStatus
            .addEventListener(
              'change',
              permissionChangeHandler,
            );

          permissionChangeHandler();
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

      if (
        permissionStatus &&
        permissionChangeHandler
      ) {
        try {
          permissionStatus
            .removeEventListener(
              'change',
              permissionChangeHandler,
            );
        } catch {
          // Ignore browser compatibility issue.
        }
      }

      permissionStatus =
        null;

      permissionChangeHandler =
        null;
    };
  }, [
    requestLocation,
  ]);

  /* =======================================================
     ANDROID LOCATION ON/OFF HANDLING
     ======================================================= */

  useEffect(() => {
    const retry = () => {
      requestLocation(
        false,
      );
    };

    const onVisibilityChange =
      () => {
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
  }, [
    requestLocation,
  ]);

  /* =======================================================
     RETRY WHEN DEVICE LOCATION IS OFF
     ======================================================= */

  useEffect(() => {
    if (
      status !==
      'unavailable'
    ) {
      if (
        retryTimerRef.current !==
        null
      ) {
        window.clearInterval(
          retryTimerRef.current,
        );

        retryTimerRef.current =
          null;
      }

      return;
    }

    /*
     * Retry every 5 seconds.
     *
     * This helps Android users who turn
     * device Location back ON.
     */
    retryTimerRef.current =
      window.setInterval(
        () => {
          requestLocation(
            false,
          );
        },
        5000,
      );

    return () => {
      if (
        retryTimerRef.current !==
        null
      ) {
        window.clearInterval(
          retryTimerRef.current,
        );

        retryTimerRef.current =
          null;
      }
    };
  }, [
    status,
    requestLocation,
  ]);

  /* =======================================================
     PURCHASE PERMISSION
     ======================================================= */

  /*
   * IMPORTANT:
   *
   * This keeps your existing SPOTC rule.
   *
   * INSIDE 5 KM  = BUY ALLOWED
   * OUTSIDE 5 KM = BROWSE ONLY
   */
  const canPurchase =
    status === 'available';

  /* =======================================================
     CUSTOMER MESSAGE
     ======================================================= */

  const message =
    useMemo(() => {
      if (
        status === 'outside'
      ) {
        return (
          'SPOTC is coming to your area shortly. ' +
          'You can browse all products now. ' +
          'Ordering will be available when SPOTC launches in your area.'
        );
      }

      if (
        status ===
        'permission_denied'
      ) {
        return (
          'Allow location access to check delivery availability. ' +
          'You can continue browsing SPOTC.'
        );
      }

      if (
        status ===
        'unavailable'
      ) {
        return (
          'Turn on device location to check delivery availability. ' +
          'You can continue browsing SPOTC.'
        );
      }

      return '';
    }, [
      status,
    ]);

  /* =======================================================
     RETURN
     ======================================================= */

  return {
    status,

    distanceKm:
      distance,

    coordinates,

    canPurchase,

    message,

    requestLocation:
      () =>
        requestLocation(
          true,
        ),

    radiusKm:
      SPOTC_DELIVERY_CENTER.radiusKm,
  };
}