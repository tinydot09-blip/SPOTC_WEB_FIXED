'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Eye,
  Flag,
  Heart,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Play,
  Share2,
  ShieldCheck,
} from 'lucide-react';

import { getSpots } from '@/lib/data';
import {
  firebaseProjectId,
  firebaseReady,
} from '@/lib/firebase';
import type { SpotItem } from '@/lib/types';
import { EmptyState } from './EmptyState';

/*
 * Module-level cache:
 *
 * When the user leaves the Spots page and returns during the same browser
 * session, the previously loaded Spots are displayed immediately.
 *
 * The pending promise also prevents duplicate Firebase requests when the
 * component mounts more than once while the first request is still running.
 */
let cachedSpots: SpotItem[] | null = null;
let spotsRequest: Promise<SpotItem[]> | null = null;

function loadSpots(): Promise<SpotItem[]> {
  if (cachedSpots !== null) {
    return Promise.resolve(cachedSpots);
  }

  if (!spotsRequest) {
    spotsRequest = getSpots()
      .then((spots) => {
        cachedSpots = spots;
        return spots;
      })
      .finally(() => {
        spotsRequest = null;
      });
  }

  return spotsRequest;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compact = (value: number): string =>
  value > 999
    ? `${(value / 1000).toFixed(value > 9999 ? 0 : 1)}K`
    : String(value);

type Coordinates = {
  latitude: number;
  longitude: number;
};

function locationCoordinates(
  item: SpotItem,
): Coordinates | null {
  const source =
    item.location ??
    item.capturedLocation ??
    item.captured_location ??
    item.spot_location;

  if (!source || typeof source !== 'object') {
    return null;
  }

  const location = source as {
    latitude?: unknown;
    longitude?: unknown;
    _lat?: unknown;
    _long?: unknown;
  };

  const latitude = num(
    location.latitude ?? location._lat,
  );

  const longitude = num(
    location.longitude ?? location._long,
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude === 0 ||
    longitude === 0
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function distanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const earthRadiusKm = 6371;

  const latitudeDifference = toRadians(
    to.latitude - from.latitude,
  );

  const longitudeDifference = toRadians(
    to.longitude - from.longitude,
  );

  const calculation =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation),
    )
  );
}

function distanceText(
  distance: number | null,
): string {
  if (distance == null) {
    return 'Distance unavailable';
  }

  if (distance < 0.5) {
    return 'Near you';
  }

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m away`;
  }

  return `${distance.toFixed(1)} km away`;
}

function SpotFeedLoader() {
  return (
    <section
      className="spot-feed spot-feed-loading"
      aria-label="Loading Spots"
      aria-busy="true"
    >
      <article className="spot-slide spot-loading-slide">
        <div className="spot-loading-background" />

        <div className="spot-loading-shade" />

        <div className="spot-loading-top">
          <span className="spot-loading-pill" />
        </div>

        <div className="spot-loading-rail">
          <span className="spot-loading-circle" />
          <span className="spot-loading-circle" />
          <span className="spot-loading-circle" />
          <span className="spot-loading-circle" />
          <span className="spot-loading-circle" />
        </div>

        <div className="spot-loading-content">
          <div className="spot-loading-creator">
            <span className="spot-loading-avatar" />

            <div className="spot-loading-creator-lines">
              <span className="spot-loading-line spot-loading-name" />
              <span className="spot-loading-line spot-loading-small" />
            </div>
          </div>

          <span className="spot-loading-line spot-loading-caption" />
          <span className="spot-loading-line spot-loading-caption-short" />

          <div className="spot-loading-status">
            <span className="spot-loading-chip" />
            <span className="spot-loading-chip spot-loading-chip-small" />
          </div>

          <span className="spot-loading-button" />
        </div>
      </article>

      <style jsx>{`
        .spot-feed-loading {
          width: 100%;
          min-height: 100%;
          background: #050505;
          overflow: hidden;
        }

        .spot-loading-slide {
          position: relative;
          width: 100%;
          min-height: 100%;
          height: 100%;
          overflow: hidden;
          background: #080808;
        }

        .spot-loading-background {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 50% 20%,
              rgba(255, 255, 255, 0.08),
              transparent 38%
            ),
            linear-gradient(
              145deg,
              #111111 0%,
              #181818 42%,
              #090909 100%
            );
        }

        .spot-loading-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              to bottom,
              rgba(0, 0, 0, 0.12) 0%,
              rgba(0, 0, 0, 0.04) 35%,
              rgba(0, 0, 0, 0.84) 100%
            );
        }

        .spot-loading-top {
          position: absolute;
          top: 20px;
          left: 20px;
        }

        .spot-loading-pill {
          display: block;
          width: 62px;
          height: 24px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          animation: spotShimmer 1.25s ease-in-out infinite;
        }

        .spot-loading-rail {
          position: absolute;
          right: 16px;
          bottom: 148px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 19px;
        }

        .spot-loading-circle {
          display: block;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.16);
          animation: spotShimmer 1.25s ease-in-out infinite;
        }

        .spot-loading-content {
          position: absolute;
          right: 82px;
          bottom: 28px;
          left: 18px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .spot-loading-creator {
          display: flex;
          align-items: center;
          gap: 11px;
          width: 100%;
          margin-bottom: 17px;
        }

        .spot-loading-avatar {
          display: block;
          width: 43px;
          height: 43px;
          flex: 0 0 43px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          animation: spotShimmer 1.25s ease-in-out infinite;
        }

        .spot-loading-creator-lines {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .spot-loading-line,
        .spot-loading-chip,
        .spot-loading-button {
          display: block;
          background: rgba(255, 255, 255, 0.16);
          animation: spotShimmer 1.25s ease-in-out infinite;
        }

        .spot-loading-line {
          height: 11px;
          border-radius: 999px;
        }

        .spot-loading-name {
          width: 132px;
          height: 13px;
        }

        .spot-loading-small {
          width: 86px;
          height: 9px;
        }

        .spot-loading-caption {
          width: min(100%, 360px);
          margin-bottom: 9px;
        }

        .spot-loading-caption-short {
          width: min(72%, 255px);
          margin-bottom: 15px;
        }

        .spot-loading-status {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-bottom: 14px;
        }

        .spot-loading-chip {
          width: 112px;
          height: 25px;
          border-radius: 999px;
        }

        .spot-loading-chip-small {
          width: 98px;
        }

        .spot-loading-button {
          width: 174px;
          height: 38px;
          border-radius: 10px;
        }

        @keyframes spotShimmer {
          0%,
          100% {
            opacity: 0.42;
          }

          50% {
            opacity: 0.9;
          }
        }

        @media (min-width: 768px) {
          .spot-loading-slide {
            max-width: 520px;
            margin: 0 auto;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .spot-loading-pill,
          .spot-loading-circle,
          .spot-loading-avatar,
          .spot-loading-line,
          .spot-loading-chip,
          .spot-loading-button {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

function SpotSlide({
  item,
  userCoordinates,
}: {
  item: SpotItem;
  userCoordinates: Coordinates | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);

  const video = String(
    item.playback_720_url ||
      item.playback_480_url ||
      item.playback_url ||
      item.hls_master_url ||
      item.video_url ||
      '',
  );

  const poster = String(
    item.thumbnail_url ||
      item.thumbnail ||
      item.photoUrl ||
      '',
  );

  const creator = String(
    item.creator_name ||
      item.display_name ||
      item.username ||
      'SPOTC creator',
  );

  const avatar = String(
    item.creator_photo_url ||
      item.profile_photo_url ||
      item.photoUrl ||
      '',
  );

  const spotCoordinates = useMemo(
    () => locationCoordinates(item),
    [item],
  );

  const calculatedDistance = useMemo(() => {
    if (!userCoordinates || !spotCoordinates) {
      return null;
    }

    return distanceKm(
      userCoordinates,
      spotCoordinates,
    );
  }, [spotCoordinates, userCoordinates]);

  const requiresUnlock =
    item.unlock_required === true ||
    num(
      item.unlock_distance_km ??
        item.required_km,
    ) > 0 ||
    spotCoordinates !== null;

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    /*
     * Spots are always muted.
     * There is intentionally no audio control.
     */
    videoElement.muted = true;
    videoElement.volume = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio > 0.72 &&
            !paused
          ) {
            videoElement
              .play()
              .catch(() => undefined);
          } else {
            videoElement.pause();
          }
        });
      },
      {
        threshold: [0.25, 0.72],
      },
    );

    observer.observe(videoElement);

    return () => {
      observer.disconnect();
    };
  }, [paused]);

  const togglePlayback = () => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    videoElement.muted = true;
    videoElement.volume = 0;

    if (videoElement.paused) {
      videoElement
        .play()
        .then(() => {
          setPaused(false);
        })
        .catch(() => undefined);
    } else {
      videoElement.pause();
      setPaused(true);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/unlock/${item.id}`;

    const title = String(
      item.caption || 'SPOTC Spot',
    );

    if (navigator.share) {
      await navigator
        .share({
          title,
          url,
        })
        .catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url);
    }
  };

  return (
    <article className="spot-slide">
      <div
        className="spot-media"
        onClick={togglePlayback}
      >
        {video ? (
          <video
            ref={videoRef}
            src={video}
            poster={poster}
            playsInline
            loop
            muted
            preload="metadata"
          />
        ) : (
          <div
            className="spot-poster"
            style={{
              backgroundImage: `url(${poster})`,
            }}
          />
        )}
      </div>

      <div className="spot-shade" />

      {paused && (
        <div className="spot-play">
          <Play size={30} fill="white" />
        </div>
      )}

      <div className="spot-top">
        <span>SPOTS</span>
      </div>

      <div className="spot-rail">
        <span className="spot-view">
          <Eye size={26} />

          <small>
            {compact(
              num(
                item.views_count ??
                  item.views,
              ),
            )}
          </small>
        </span>

        <button
          className={liked ? 'liked' : ''}
          type="button"
          onClick={() => {
            setLiked((value) => !value);
          }}
        >
          <Heart
            size={29}
            fill={
              liked
                ? 'currentColor'
                : 'none'
            }
          />

          <small>
            {compact(
              num(
                item.likes_count ??
                  item.likes,
              ) + (liked ? 1 : 0),
            )}
          </small>
        </button>

        <button type="button">
          <MessageCircle size={28} />

          <small>
            {compact(
              num(item.comments_count),
            )}
          </small>
        </button>

        <button
          type="button"
          onClick={share}
        >
          <Share2 size={27} />
          <small>Share</small>
        </button>

        <button
          type="button"
          onClick={() => {
            alert(
              'Report submitted for review',
            );
          }}
        >
          <Flag size={26} />
          <small>Report</small>
        </button>
      </div>

      <div className="spot-content">
        <div className="spot-creator">
          <div className="spot-avatar">
            {avatar ? (
              <img src={avatar} alt="" />
            ) : (
              creator.charAt(0)
            )}
          </div>

          <div>
            <div className="creator-title">
              <strong>
                @
                {creator
                  .replace(/\s+/g, '')
                  .toLowerCase()}
              </strong>

              {(item.isVerified ||
                item.is_verified) && (
                <span>✓</span>
              )}
            </div>

            <p>{creator}</p>
          </div>
        </div>

        <p className="spot-caption">
          {String(
            item.caption ||
              item.description ||
              'Discover something worth sharing nearby.',
          )}
        </p>

        <div className="spot-location-status">
          <span>
            <MapPin size={14} />

            {distanceText(
              calculatedDistance,
            )}
          </span>

          {spotCoordinates && (
            <span className="spot-gps-verified">
              <ShieldCheck size={14} />
              GPS Verified
            </span>
          )}
        </div>

        {item.location_name && (
          <p className="spot-meta spot-area-name">
            <MapPin size={14} />
            {String(item.location_name)}
          </p>
        )}

        {requiresUnlock && (
          <Link
            className="kms-unlock spot-unlock-button"
            href={`/unlock/${item.id}`}
          >
            <LockKeyhole size={16} />
            Unlock Hidden Spot
          </Link>
        )}
      </div>
    </article>
  );
}

export function SpotFeed() {
  /*
   * Use cached data as the first state when available.
   * This prevents the loader from appearing again when returning to Spots.
   */
  const [items, setItems] = useState<
    SpotItem[] | null
  >(() => cachedSpots);

  const [error, setError] = useState<
    string | null
  >(null);

  const [search, setSearch] = useState('');

  const [
    userCoordinates,
    setUserCoordinates,
  ] = useState<Coordinates | null>(null);

  useEffect(() => {
    let active = true;

    /*
     * If cached data was available during the initial render, show it
     * immediately. Firebase can still be refreshed separately later if
     * required, without blocking the visible feed.
     */
    if (cachedSpots !== null) {
      setItems(cachedSpots);
      return () => {
        active = false;
      };
    }

    loadSpots()
      .then((spots) => {
        if (!active) {
          return;
        }

        setItems(spots);
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );

        setItems([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onSearch = (event: Event) => {
      setSearch(
        String(
          (event as CustomEvent<string>)
            .detail || '',
        ),
      );
    };

    window.addEventListener(
      'spotc-page-search',
      onSearch,
    );

    return () => {
      window.removeEventListener(
        'spotc-page-search',
        onSearch,
      );
    };
  }, []);

  /*
   * GPS starts independently.
   * It never blocks the Firebase Spots feed from rendering.
   */
  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoordinates({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
        });
      },
      () => {
        setUserCoordinates(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  if (items === null) {
    return <SpotFeedLoader />;
  }

  if (error) {
    return (
      <EmptyState
        title="Firebase could not load Spots"
        body={`${error} Project: ${
          firebaseProjectId ||
          'not configured'
        }`}
      />
    );
  }

  if (!firebaseReady) {
    return (
      <EmptyState
        title="Firebase configuration is missing"
        body="Create .env.local beside package.json, then restart npm.cmd run dev."
      />
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        title="Firebase connected — no ready Spots found"
        body="The singular Firestore collection Spot was read successfully, but no ready documents matched."
      />
    );
  }

  const query = search
    .trim()
    .toLowerCase();

  const filtered = items.filter(
    (item) =>
      !query ||
      [
        item.caption,
        item.description,
        item.creator_name,
        item.display_name,
        item.username,
        item.location_name,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );

  return (
    <section className="spot-feed">
      {filtered.map((item) => (
        <SpotSlide
          key={item.id}
          item={item}
          userCoordinates={
            userCoordinates
          }
        />
      ))}
    </section>
  );
}