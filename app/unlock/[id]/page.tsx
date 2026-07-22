'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CloudRain,
  Eye,
  LockKeyhole,
  MapPin,
  Navigation,
  Star,
  Store,
  ThumbsUp,
  Wind,
} from 'lucide-react';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth, db, firebaseReady } from '@/lib/firebase';
import type { BusinessListing, SpotItem } from '@/lib/types';

type PageProps = {
  params: {
    id: string;
  };
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NearbyBusiness = BusinessListing & {
  distanceKm?: number;
};

type WeatherPayload = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: number[];
    temperature_2m?: number[];
    rain?: number[];
  };
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as {
    latitude?: unknown;
    longitude?: unknown;
    _lat?: unknown;
    _long?: unknown;
  };

  const latitude = num(source.latitude ?? source._lat);
  const longitude = num(source.longitude ?? source._long);

  if (!latitude || !longitude) return null;

  return { latitude, longitude };
}

function spotCoordinates(spot: SpotItem | null): Coordinates | null {
  if (!spot) return null;

  return getCoordinates(
    spot.location ??
      spot.capturedLocation ??
      spot.captured_location ??
      spot.spot_location,
  );
}

function businessCoordinates(
  business: BusinessListing,
): Coordinates | null {
  return getCoordinates(
    business.location ??
      business.business_location ??
      business.capturedLocation,
  );
}

function distanceKm(
  start: Coordinates,
  end: Coordinates,
): number {
  const radians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const earthRadius = 6371;
  const latitudeDifference = radians(
    end.latitude - start.latitude,
  );
  const longitudeDifference = radians(
    end.longitude - start.longitude,
  );

  const calculation =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(start.latitude)) *
      Math.cos(radians(end.latitude)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation),
    )
  );
}

function distanceText(distance?: number): string {
  if (distance == null) return 'Nearby business';
  if (distance < 0.5) return 'Near you';
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m away`;
  }

  return `${distance.toFixed(1)} km away`;
}

function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([61, 63, 65].includes(code)) return 'Rainy';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';

  return 'Weather changing';
}

function bestTime(weather: WeatherPayload | null): string {
  const times = weather?.hourly?.time ?? [];
  const temperatures =
    weather?.hourly?.temperature_2m ?? [];
  const rainChance =
    weather?.hourly?.precipitation_probability ?? [];

  let morning = '';
  let evening = '';
  let any = '';

  for (
    let index = 0;
    index <
    Math.min(
      times.length,
      temperatures.length,
      rainChance.length,
    );
    index += 1
  ) {
    const time = times[index]?.split('T')[1] ?? '';
    const hour = Number(time.split(':')[0]);
    const temperature = temperatures[index];
    const rain = rainChance[index];

    const good =
      rain <= 30 &&
      temperature >= 18 &&
      temperature <= 32;

    if (!good) continue;

    if (!morning && hour >= 6 && hour <= 10) {
      morning = time;
    }

    if (!evening && hour >= 16 && hour <= 18) {
      evening = time;
    }

    if (!any) any = time;
  }

  if (morning) return `Morning ${morning}`;
  if (evening) return `Evening ${evening}`;
  if (any) return any;

  return 'Check before travel';
}

function hasUnlocked(
  spot: SpotItem,
  user: User | null,
): boolean {
  if (!user) return false;

  const uidList = Array.isArray(spot.unlocked_user_uids)
    ? spot.unlocked_user_uids
    : [];

  if (uidList.includes(user.uid)) return true;

  const unlockedBy = Array.isArray(spot.unlocked_by)
    ? spot.unlocked_by
    : [];

  return unlockedBy.some((entry) => {
    if (typeof entry === 'string') {
      return entry === user.uid;
    }

    if (
      entry &&
      typeof entry === 'object' &&
      'id' in entry
    ) {
      return String(
        (entry as { id?: unknown }).id ?? '',
      ) === user.uid;
    }

    return false;
  });
}


function NearbyBusinessVideo({
  videoUrl,
  posterUrl,
  name,
}: {
  videoUrl: string;
  posterUrl: string;
  name: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    video.muted = true;
    video.volume = 0;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [videoUrl]);

  if (videoUrl) {
    return (
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl || undefined}
        aria-label={`${name} business video`}
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  if (posterUrl) return <img src={posterUrl} alt={name} />;
  return <Store size={40} />;
}

export default function UnlockSpotPage({
  params,
}: PageProps) {
  const [spot, setSpot] = useState<SpotItem | null>(null);
  const [businesses, setBusinesses] = useState<
    NearbyBusiness[]
  >([]);
  const [weather, setWeather] =
    useState<WeatherPayload | null>(null);
  const [weatherLoading, setWeatherLoading] =
    useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!auth) return;

    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!db) {
        setLoading(false);
        return;
      }

      try {
        const spotSnapshot = await getDoc(
          doc(db, 'Spot', params.id),
        );

        if (!spotSnapshot.exists()) {
          setLoading(false);
          return;
        }

        const currentSpot = {
          id: spotSnapshot.id,
          ...spotSnapshot.data(),
        } as SpotItem;

        setSpot(currentSpot);

        const currentCoordinates =
          spotCoordinates(currentSpot);

        if (currentCoordinates) {
          const businessSnapshot = await getDocs(
            query(
              collection(db, 'BusinessListings'),
              where('isActive', '==', true),
              limit(30),
            ),
          );

          const nearby = businessSnapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            })) as BusinessListing[];

          const withDistance = nearby
            .map((business): NearbyBusiness => {
              const coordinates =
                businessCoordinates(business);

              return {
                ...business,
                distanceKm: coordinates
                  ? distanceKm(
                      currentCoordinates,
                      coordinates,
                    )
                  : undefined,
              };
            })
            .sort((first, second) => {
              const firstPremium =
                first.isPremium === true ||
                first.is_premium === true ||
                first.premium === true;
              const secondPremium =
                second.isPremium === true ||
                second.is_premium === true ||
                second.premium === true;

              if (firstPremium !== secondPremium) {
                return firstPremium ? -1 : 1;
              }

              return (
                (first.distanceKm ?? 999999) -
                (second.distanceKm ?? 999999)
              );
            })
            .slice(0, 3);

          setBusinesses(withDistance);

          try {
            const response = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${currentCoordinates.latitude}&longitude=${currentCoordinates.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m&hourly=precipitation_probability,temperature_2m,rain&forecast_days=1&timezone=auto`,
            );

            if (!response.ok) {
              throw new Error('Weather unavailable');
            }

            setWeather(
              (await response.json()) as WeatherPayload,
            );
          } catch {
            setWeather(null);
          } finally {
            setWeatherLoading(false);
          }
        } else {
          setWeatherLoading(false);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params.id]);

  const unlocked = useMemo(
    () => (spot ? hasUnlocked(spot, user) : false),
    [spot, user],
  );

  const exactCoordinates = useMemo(
    () => spotCoordinates(spot),
    [spot],
  );

  const unlock = async () => {
    if (!db || !spot) return;

    if (!user) {
      setMessage('Please log in before unlocking.');
      return;
    }

    setUnlocking(true);
    setMessage('');

    try {
      const userReference = doc(db, 'users', user.uid);

      await updateDoc(doc(db, 'Spot', spot.id), {
        unlocked_by: arrayUnion(userReference),
        unlocked_user_uids: arrayUnion(user.uid),
        unlock_count: increment(1),
      });

      setSpot((current) =>
        current
          ? {
              ...current,
              unlocked_user_uids: [
                ...(
                  Array.isArray(
                    current.unlocked_user_uids,
                  )
                    ? current.unlocked_user_uids
                    : []
                ),
                user.uid,
              ],
              unlock_count:
                num(current.unlock_count) + 1,
            }
          : current,
      );

      setMessage('Unlocked successfully.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to unlock this spot.',
      );
    } finally {
      setUnlocking(false);
    }
  };

  const openMap = () => {
    if (!exactCoordinates) {
      setMessage('Exact GPS location is unavailable.');
      return;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${exactCoordinates.latitude},${exactCoordinates.longitude}&travelmode=driving&dir_action=navigate`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  if (!firebaseReady) {
    return (
      <main className="spot-unlock-app-page">
        <p>Firebase configuration is missing.</p>
      </main>
    );
  }

  if (loading) {
  return (
    <main
      className="spot-unlock-app-page spot-unlock-loading-page"
      aria-label="Loading hidden spot"
      aria-busy="true"
    >
      <div className="spot-unlock-loading-shell">
        <div className="spot-unlock-loading-header">
          <span className="spot-unlock-loading-circle" />
          <span className="spot-unlock-loading-line spot-unlock-loading-title" />
        </div>

        <div className="spot-unlock-loading-grid">
          <div className="spot-unlock-loading-left">
            <div className="spot-unlock-loading-creator">
              <span className="spot-unlock-loading-avatar" />

              <div>
                <span className="spot-unlock-loading-line spot-unlock-loading-name" />
                <span className="spot-unlock-loading-line spot-unlock-loading-small" />
              </div>
            </div>

            <span className="spot-unlock-loading-line spot-unlock-loading-caption" />
            <span className="spot-unlock-loading-line spot-unlock-loading-caption-short" />

            <div className="spot-unlock-loading-stats">
              <span />
              <span />
              <span />
            </div>

            <div className="spot-unlock-loading-card">
              <span className="spot-unlock-loading-line" />
              <span className="spot-unlock-loading-line" />
              <span className="spot-unlock-loading-line" />
              <span className="spot-unlock-loading-line" />
            </div>

            <div className="spot-unlock-loading-weather">
              <span className="spot-unlock-loading-line spot-unlock-loading-weather-title" />
              <span className="spot-unlock-loading-line spot-unlock-loading-temperature" />
              <span className="spot-unlock-loading-line spot-unlock-loading-caption-short" />
            </div>
          </div>

          <div className="spot-unlock-loading-right">
            <span className="spot-unlock-loading-line spot-unlock-loading-side-title" />

            <div className="spot-unlock-loading-business" />
            <div className="spot-unlock-loading-business" />
          </div>
        </div>

        <div className="spot-unlock-loading-bottom">
          <span />
        </div>
      </div>
    </main>
  );
}

  if (!spot) {
    return (
      <main className="spot-unlock-app-page">
        <h1>Spot not found</h1>
      </main>
    );
  }

  const caption = String(
    spot.caption ||
      spot.description ||
      'Hidden place',
  );

  const creator = String(
    spot.creator_name ||
      spot.display_name ||
      spot.username ||
      'Creator',
  );

  const category = String(
    spot.category || 'Hidden Place',
  );

  const district = String(
    spot.district_name ||
      spot.location_name ||
      'Nearby location',
  );

  const creatorPhoto = String(
    spot.creator_photo_url ||
      spot.profile_photo_url ||
      spot.creator_photo ||
      spot.photoUrl ||
      '',
  );

  const current = weather?.current;
  const rainChance =
    weather?.hourly?.precipitation_probability?.[0] ??
    0;


  return (
    <main className="spot-unlock-app-page spot-unlock-old-desktop">
      <div className="spot-unlock-desktop-grid">
        <div className="spot-unlock-left-column">
          <header className="spot-unlock-app-header">
            <Link href="/spots" className="spot-home-button">
              <ArrowLeft size={24} />
            </Link>
            <h1>Unlock Hidden Spot</h1>
          </header>

          <section className="spot-unlock-creator-card">
            <div className="spot-unlock-avatar">
              {creatorPhoto ? (
                <img src={creatorPhoto} alt="" />
              ) : (
                creator.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <strong>{creator.toUpperCase()}</strong>
              <span>{category} • {district}</span>
            </div>
          </section>

          <h2 className="spot-unlock-caption">{caption}</h2>

          <section className="spot-unlock-stats">
            <article>
              <ThumbsUp />
              <strong>{num(spot.likes_count ?? spot.likes)}</strong>
              <span>Likes</span>
            </article>
            <article>
              <Eye />
              <strong>{num(spot.views_count ?? spot.views)}</strong>
              <span>Views</span>
            </article>
            <article>
              <LockKeyhole />
              <strong>
                {num(
                  spot.unlock_count ??
                    (Array.isArray(spot.unlocked_by)
                      ? spot.unlocked_by.length
                      : 0),
                )}
              </strong>
              <span>Unlocked</span>
            </article>
          </section>

          <section className="spot-unlock-trust-card">
            {[
              'GPS verified by creator’s phone location',
              'Admin reviewed before showing in feed',
              'Pay once and keep access forever',
              'Exact route opens in Google Maps',
            ].map((item) => (
              <div key={item}>
                <BadgeCheck size={20} />
                <span>{item}</span>
              </div>
            ))}
          </section>

          <section className="spot-weather-card">
            <div className="spot-weather-head">
              <div className="spot-weather-icon">
                <CloudRain />
              </div>
              <strong>Today near this spot</strong>
              <span>LIVE</span>
            </div>

            {weatherLoading ? (
  <div
    className="spot-weather-loading"
    aria-label="Loading live climate"
    aria-busy="true"
  >
    <span className="spot-weather-loading-temperature" />
    <span className="spot-weather-loading-line" />

    <div className="spot-weather-loading-chips">
      <span />
      <span />
      <span />
      <span />
    </div>
  </div>
) : weather && current ? (
              <>
                <h3>{current.temperature_2m ?? '--'}°C</h3>
                <p>
                  {weatherLabel(num(current.weather_code))} • Best time:{' '}
                  {bestTime(weather)}
                </p>
                <div className="spot-weather-chips">
                  <span>Rain chance: {rainChance}%</span>
                  <span>
                    Current rain: {current.rain ?? current.precipitation ?? 0} mm
                  </span>
                  <span>
                    Humidity: {current.relative_humidity_2m ?? '--'}%
                  </span>
                  <span>
                    <Wind size={14} />
                    Wind: {current.wind_speed_10m ?? '--'} km/h
                  </span>
                </div>
              </>
            ) : (
              <p>Live climate is unavailable. Check weather before visiting.</p>
            )}
          </section>

          {message && <p className="spot-unlock-message">{message}</p>}
        </div>

        <aside className="spot-unlock-right-column">
          <section className="spot-nearby-card">
            <div className="spot-nearby-title">
              <Star />
              <strong>Premium Nearby Picks</strong>
            </div>

            {businesses.length ? (
              <div className="spot-nearby-video-list">
                {businesses.map((business) => {
                  const name = String(
                    business.business_name ||
                      business.shop_name ||
                      'Nearby business',
                  );

                  const poster = String(
                    business.business_video_thumbnail_url ||
                      business.business_thumbnail_url ||
                      business.thumbnail_url ||
                      business.logo_url ||
                      business.business_logo_url ||
                      business.business_logo ||
                      '',
                  );

                  const videoUrl = String(
                    business.playback_480_url ||
                      business.playback_720_url ||
                      business.playback_url ||
                      business.business_video_url ||
                      business.video_url ||
                      '',
                  );

                  const offerText = String(
                    business.offer_text ||
                      business.offer ||
                      'Business offer',
                  );

                  const slug = String(
                    business.business_name || business.id,
                  )
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');

                  return (
                    <Link
                      className="spot-nearby-video-card"
                      href={`/${slug}`}
                      key={business.id}
                    >
                      <div className="spot-nearby-video-media">
                        <NearbyBusinessVideo
                          videoUrl={videoUrl}
                          posterUrl={poster}
                          name={name}
                        />
                        <div className="spot-nearby-video-shade" />
                        <span className="spot-nearby-premium">
                          <Star size={12} />
                          Premium
                        </span>
                        <div className="spot-nearby-video-copy">
                          <strong>{name}</strong>
                          <span>{String(business.category || 'Business')}</span>
                          <b>{offerText}</b>
                          <small>
                            <MapPin size={13} />
                            {distanceText(business.distanceKm)}
                          </small>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p>No registered businesses nearby yet.</p>
            )}
          </section>
        </aside>
      </div>

      <div className="spot-unlock-bottom-bar">
        <button
          type="button"
          disabled={unlocking}
          onClick={unlocked ? openMap : unlock}
        >
          {unlocked ? <Navigation size={20} /> : <LockKeyhole size={20} />}
          {unlocking
            ? 'Please wait...'
            : unlocked
              ? 'Go to Map'
              : 'Unlock'}
        </button>
      </div>
    </main>
  );

}