'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  ArrowLeft,
  CheckCircle2,
  Home,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import type { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import {
  createAddress,
  formatAddress,
  loadUserAddresses,
  selectedAddressFrom,
  setDefaultAddress,
  type AddressInput,
  type SavedAddress,
} from '@/lib/addresses';

import { requireGoogleLogin } from '@/lib/auth';
import { db, firebaseReady } from '@/lib/firebase';
import PageLoader from '@/components/PageLoader';
import {
  distanceKm,
  SPOTC_DELIVERY_CENTER,
} from '@/lib/delivery-radius';

const EMPTY: AddressInput = {
  fullName: '',
  phone: '',
  addressType: 'Home',
  houseNo: '',
  street: '',
  landmark: '',
  area: '',
  city: '',
  pincode: '',
  state: 'Tamil Nadu',
  country: 'India',
  deliveryNote: '',
  latitude: null,
  longitude: null,
};

type AddressTypeOption = 'Home' | 'Office' | 'Other';

const ADDRESS_TYPES: AddressTypeOption[] = [
  'Home',
  'Office',
  'Other',
];

const cleanPhone = (value: string) => {
  const trimmed = value.trim();

  // Allow Indian numbers in either format:
  // 9876543210 or +919876543210
  if (trimmed.startsWith('+')) {
    return `+${trimmed
      .slice(1)
      .replace(/\D/g, '')
      .slice(0, 12)}`;
  }

  return trimmed
    .replace(/\D/g, '')
    .slice(0, 10);
};

const cleanPincode = (value: string) =>
  value.replace(/\D/g, '').slice(0, 6);


type ReverseGeocodeAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: ReverseGeocodeAddress;
};

const reverseGeocode = async (
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResponse> => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Reverse geocoding failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as ReverseGeocodeResponse;
};


type ForwardGeocodeResponse = Array<{
  lat?: string;
  lon?: string;
  display_name?: string;
}>;

const SERVICE_AREA_MESSAGE =
  'Coming Soon to Your Area!';

const BROWSE_MESSAGE =
  'We currently deliver in Karamadai, Teacher Colony, EB Colony & Gandhinagar.';

const forwardGeocode = async (
  address: AddressInput,
): Promise<{ latitude: number; longitude: number } | null> => {
  const parts = {
    houseNo: String(address.houseNo || '').trim(),
    street: String(address.street || '').trim(),
    landmark: String(address.landmark || '').trim(),
    area: String(address.area || '').trim(),
    city: String(address.city || '').trim(),
    pincode: String(address.pincode || '').trim(),
    state: String(address.state || 'Tamil Nadu').trim(),
    country: String(address.country || 'India').trim(),
  };

  const queries = [
    [
      parts.houseNo,
      parts.street,
      parts.landmark,
      parts.area,
      parts.city,
      parts.pincode,
      parts.state,
      parts.country,
    ],
    [
      parts.area,
      'Karamadai',
      parts.pincode,
      parts.state,
      parts.country,
    ],
    [
      parts.area,
      parts.pincode,
      'Coimbatore',
      parts.state,
      parts.country,
    ],
    [
      'Karamadai',
      parts.pincode,
      parts.state,
      parts.country,
    ],
  ]
    .map((items) =>
      items.filter(Boolean).join(', '),
    )
    .filter(
      (value, index, array) =>
        value && array.indexOf(value) === index,
    );

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: query,
        limit: '1',
        countrycodes: 'in',
        'accept-language': 'en',
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        continue;
      }

      const results =
        (await response.json()) as ForwardGeocodeResponse;

      const first = results[0];

      if (!first?.lat || !first?.lon) {
        continue;
      }

      const latitude = Number(first.lat);
      const longitude = Number(first.lon);

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {
        return { latitude, longitude };
      }
    } catch (error) {
      console.warn(
        'Address geocode attempt failed:',
        query,
        error,
      );
    }
  }

  return null;
};

const coordinatesFromAddress = (
  address: SavedAddress,
): { latitude: number; longitude: number } | null => {
  const raw =
    address as SavedAddress & Record<string, unknown>;

  const latitude = Number(
    raw.latitude ??
      raw.lat ??
      raw.delivery_lat,
  );

  const longitude = Number(
    raw.longitude ??
      raw.lng ??
      raw.lon ??
      raw.delivery_lng,
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude === 0 ||
    longitude === 0
  ) {
    return null;
  }

  return { latitude, longitude };
};

const isInsideDeliveryArea = (
  latitude: number,
  longitude: number,
): boolean =>
  distanceKm(
    { latitude, longitude },
    {
      latitude: SPOTC_DELIVERY_CENTER.latitude,
      longitude: SPOTC_DELIVERY_CENTER.longitude,
    },
  ) <= SPOTC_DELIVERY_CENTER.radiusKm;

export default function AddressPage() {
  const router = useRouter();

  const [user, setUser] =
    useState<User | null>(null);

  const [addresses, setAddresses] =
    useState<SavedAddress[]>([]);

  const [selectedId, setSelectedId] =
    useState('');

  const [formOpen, setFormOpen] =
    useState(false);

  const [form, setForm] =
    useState<AddressInput>(EMPTY);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [formError, setFormError] =
    useState('');

  const [locating, setLocating] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!firebaseReady || !db) {
        setLoading(false);
        return;
      }

      const currentUser =
        await requireGoogleLogin();

      if (!currentUser || !active) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const list =
        await loadUserAddresses(
          db,
          currentUser,
        );

      if (!active) {
        return;
      }

      setAddresses(list);

      setSelectedId(
        selectedAddressFrom(list)?.id ||
          '',
      );

      setForm((current) => ({
        ...current,
        fullName:
          current.fullName ||
          currentUser.displayName ||
          '',
      }));

      setFormOpen(!list.length);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const requiredComplete = useMemo(
    () =>
      Boolean(
        form.fullName.trim() &&
          form.phone.trim() &&
          form.houseNo.trim() &&
          form.area.trim() &&
          form.city.trim() &&
          form.pincode.trim(),
      ),
    [
      form.fullName,
      form.phone,
      form.houseNo,
      form.area,
      form.city,
      form.pincode,
    ],
  );

  const updateForm = <
    K extends keyof AddressInput,
  >(
    key: K,
    value: AddressInput[K],
  ) => {
    const locationFields: Array<keyof AddressInput> = [
      'houseNo',
      'street',
      'landmark',
      'area',
      'city',
      'pincode',
      'state',
      'country',
    ];

    setForm((current) => ({
      ...current,
      [key]: value,
      ...(locationFields.includes(key)
        ? {
            latitude: null,
            longitude: null,
          }
        : {}),
    }));

    if (formError) {
      setFormError('');
    }
  };

  const select = async (
    address: SavedAddress,
  ) => {
    if (!db || !user) {
      return;
    }

    const coordinates =
      coordinatesFromAddress(address);

    if (!coordinates) {
      setFormError(
        'Please edit this address and verify its location before using it for delivery.',
      );
      return;
    }

    if (
      !isInsideDeliveryArea(
        coordinates.latitude,
        coordinates.longitude,
      )
    ) {
      setFormError(
        `${SERVICE_AREA_MESSAGE} ${BROWSE_MESSAGE}`,
      );
      return;
    }

    setFormError('');
    setSelectedId(address.id);

    await setDefaultAddress(
      db,
      user,
      addresses,
      address,
    );

    setAddresses((current) =>
      current.map((item) => ({
        ...item,
        isDefault:
          item.id === address.id,
      })),
    );
  };

  const openNewAddress = () => {
    setEditingId(null);

    setForm((current) => ({
      ...EMPTY,
      fullName:
        current.fullName ||
        user?.displayName ||
        '',
    }));

    setFormError('');
    setFormOpen(true);
  };

  const editAddress = (
    address: SavedAddress,
  ) => {
    setEditingId(address.id);

    setForm({
      fullName: address.fullName || '',
      phone: cleanPhone(address.phone || ''),
      addressType:
        address.addressType || 'Home',
      houseNo: address.houseNo || '',
      street: address.street || '',
      landmark: address.landmark || '',
      area: address.area || '',
      city: address.city || '',
      pincode: cleanPincode(address.pincode || ''),
      state: address.state || 'Tamil Nadu',
      country: address.country || 'India',
      deliveryNote: address.deliveryNote || '',
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
    });

    setFormError('');
    setFormOpen(true);
  };

  const deleteAddress = async (
    address: SavedAddress,
  ) => {
    if (!db || !user || deletingId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete this ${address.addressType || 'saved'} address?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(address.id);
    setFormError('');

    try {
      await deleteDoc(
        doc(
          db,
          'UserAddresses',
          address.id,
        ),
      );

      const remaining = addresses.filter(
        (item) => item.id !== address.id,
      );

      setAddresses(remaining);

      if (selectedId === address.id) {
        const nextAddress =
          remaining[0] || null;

        if (nextAddress) {
          await setDefaultAddress(
            db,
            user,
            remaining,
            nextAddress,
          );

          setAddresses((current) =>
            current.map((item) => ({
              ...item,
              isDefault:
                item.id === nextAddress.id,
            })),
          );

          setSelectedId(nextAddress.id);
        } else {
          setSelectedId('');
          setFormOpen(true);
          setEditingId(null);
          setForm((current) => ({
            ...EMPTY,
            fullName:
              current.fullName ||
              user.displayName ||
              '',
          }));
        }
      }
    } catch (error) {
      console.error(
        'Delete address failed:',
        error,
      );

      setFormError(
        'Unable to delete this address. Please try again.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const cancelNewAddress = () => {
    setEditingId(null);
    setFormError('');
    setFormOpen(false);

    setForm((current) => ({
      ...EMPTY,
      fullName:
        current.fullName ||
        user?.displayName ||
        '',
    }));
  };

  const useCurrentLocation = async () => {
    if (locating) {
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      setFormError(
        'Location is not supported on this device. Please add the address manually.',
      );
      setFormOpen(true);
      return;
    }

    setLocating(true);
    setFormError('');

    try {
      const position =
        await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 30000,
              },
            );
          },
        );

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;

      const result =
        await reverseGeocode(
          latitude,
          longitude,
        );

      const address =
        result.address || {};

      const houseNo =
        String(
          address.house_number || '',
        ).trim();

      const street =
        String(
          address.road ||
            address.pedestrian ||
            address.footway ||
            '',
        ).trim();

      const area =
        String(
          address.neighbourhood ||
            address.suburb ||
            address.quarter ||
            address.village ||
            '',
        ).trim();

      const city =
        String(
          address.city ||
            address.town ||
            address.municipality ||
            address.village ||
            address.county ||
            '',
        ).trim();

      const pincode =
        cleanPincode(
          String(
            address.postcode || '',
          ),
        );

      const state =
        String(
          address.state ||
            'Tamil Nadu',
        ).trim();

      const country =
        String(
          address.country ||
            'India',
        ).trim();

      const selectedAddress =
        addresses.find(
          (item) =>
            item.id === selectedId,
        );

      setForm({
        ...EMPTY,

        fullName:
          user?.displayName ||
          selectedAddress?.fullName ||
          '',

        phone:
          selectedAddress?.phone ||
          '',

        addressType:
          selectedAddress?.addressType ||
          form.addressType ||
          'Home',

        houseNo,

        street,

        landmark: '',

        area,

        city,

        pincode,

        state,

        country,

        deliveryNote: '',

        latitude,

        longitude,
      });

      setFormOpen(true);

      if (
        !houseNo ||
        !area ||
        !city ||
        !pincode
      ) {
        setFormError(
          'Location found. Please check and complete any missing address fields before saving.',
        );
      }
    } catch (error) {
      console.error(
        'Current location lookup failed:',
        error,
      );

      let message =
        'Unable to find your current address. Please try again or add the address manually.';

      if (
        typeof GeolocationPositionError !==
          'undefined' &&
        error instanceof
          GeolocationPositionError
      ) {
        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {
          message =
            'Location permission is blocked. Allow location access in your browser, or add the address manually.';
        } else if (
          error.code ===
          error.POSITION_UNAVAILABLE
        ) {
          message =
            'Your current location is unavailable. Please try again or add the address manually.';
        } else if (
          error.code ===
          error.TIMEOUT
        ) {
          message =
            'Location request timed out. Please try again or add the address manually.';
        }
      }

      setForm((current) => ({
        ...EMPTY,
        fullName:
          current.fullName ||
          user?.displayName ||
          '',
        phone:
          current.phone || '',
      }));

      setFormError(message);
      setFormOpen(true);
    } finally {
      setLocating(false);
    }
  };

  const validateForm = (): string => {
    if (!form.fullName.trim()) {
      return 'Enter the full name.';
    }

    if (!form.phone.trim()) {
      return 'Enter the phone number.';
    }

    const phoneDigits =
      form.phone.replace(/\D/g, '');

    const validPhone =
      /^[6-9]\d{9}$/.test(phoneDigits) ||
      /^91[6-9]\d{9}$/.test(phoneDigits);

    if (!validPhone) {
      return 'Enter a valid mobile number.';
    }

    if (!form.houseNo.trim()) {
      return 'Enter the house / flat number.';
    }

    if (!form.area.trim()) {
      return 'Enter the area.';
    }

    if (!form.city.trim()) {
      return 'Enter the city.';
    }

    if (!/^\d{6}$/.test(form.pincode)) {
      return 'Enter a valid 6-digit pincode.';
    }

    return '';
  };

  const save = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!db || !user || saving) {
      return;
    }

    const validationError =
      validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      let nextAddress: AddressInput = {
        ...form,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        houseNo: form.houseNo.trim(),
        street: form.street.trim(),
        landmark: form.landmark.trim(),
        area: form.area.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        state:
          String(form.state || 'Tamil Nadu').trim(),
        country:
          String(form.country || 'India').trim(),
        deliveryNote:
          form.deliveryNote.trim(),
      };

      let latitude = Number(nextAddress.latitude);
      let longitude = Number(nextAddress.longitude);

      let hasCoordinates =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude !== 0 &&
        longitude !== 0;

      /*
       * Keep the flow simple for the customer:
       * when Save is tapped, try browser GPS automatically once.
       * No separate "Verify Current Location" button.
       */
      if (
        !hasCoordinates &&
        typeof navigator !== 'undefined' &&
        navigator.geolocation
      ) {
        try {
          const position =
            await new Promise<GeolocationPosition>(
              (resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                  resolve,
                  reject,
                  {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60_000,
                  },
                );
              },
            );

          latitude =
            position.coords.latitude;
          longitude =
            position.coords.longitude;

          hasCoordinates = true;

          nextAddress = {
            ...nextAddress,
            latitude,
            longitude,
          };
        } catch (error) {
          console.warn(
            'Automatic location check failed:',
            error,
          );
        }
      }

      /*
       * If GPS is not available/allowed, fall back to address lookup.
       * The lookup is only a backup; delivery approval is still based
       * on coordinates, never on the city name returned by the map.
       */
      if (!hasCoordinates) {
        const coordinates =
          await forwardGeocode(nextAddress);

        if (!coordinates) {
          setFormError(
            'We could not check this address location automatically. Please allow location access and tap Save & Use Address again.',
          );
          return;
        }

        latitude = coordinates.latitude;
        longitude = coordinates.longitude;

        nextAddress = {
          ...nextAddress,
          latitude,
          longitude,
        };
      }

      if (
        !isInsideDeliveryArea(
          latitude,
          longitude,
        )
      ) {
        setFormError(
          `${SERVICE_AREA_MESSAGE} ${BROWSE_MESSAGE}`,
        );
        return;
      }

      if (editingId) {
        await updateDoc(
          doc(
            db,
            'UserAddresses',
            editingId,
          ),
          {
            full_name: nextAddress.fullName,
            phone: nextAddress.phone,
            address_type: nextAddress.addressType,
            house_no: nextAddress.houseNo,
            street: nextAddress.street,
            landmark: nextAddress.landmark,
            area: nextAddress.area,
            city: nextAddress.city,
            pincode: nextAddress.pincode,
            state: nextAddress.state,
            country: nextAddress.country,
            delivery_note:
              nextAddress.deliveryNote,
            latitude,
            longitude,
            is_active: true,
            updated_at: serverTimestamp(),
          },
        );

        const previous =
          addresses.find(
            (item) =>
              item.id === editingId,
          );

        const updatedAddress: SavedAddress = {
          ...(previous || ({} as SavedAddress)),
          ...nextAddress,
          id: editingId,
          latitude,
          longitude,
          isDefault: true,
        };

        await setDefaultAddress(
          db,
          user,
          addresses,
          updatedAddress,
        );

        setAddresses((current) =>
          current.map((item) =>
            item.id === editingId
              ? {
                  ...item,
                  ...nextAddress,
                  latitude,
                  longitude,
                  isDefault: true,
                }
              : {
                  ...item,
                  isDefault: false,
                },
          ),
        );

        setSelectedId(editingId);
      } else {
        const savedAddress =
          await createAddress(
            db,
            user,
            {
              ...nextAddress,
              latitude,
              longitude,
            },
            addresses,
          );

        setAddresses((current) => [
          savedAddress,
          ...current.map((item) => ({
            ...item,
            isDefault: false,
          })),
        ]);

        setSelectedId(savedAddress.id);
      }

      setEditingId(null);
      setFormOpen(false);

      setForm({
        ...EMPTY,
        fullName:
          user.displayName || '',
      });
    } catch (error) {
      console.error(error);

      setFormError(
        'Unable to save address. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!user || !db) {
    return (
      <main className="address-state">
        <MapPin />
        <h1>Sign in required</h1>
      </main>
    );
  }

  const selectedSavedAddress =
    addresses.find(
      (item) =>
        item.id === selectedId,
    ) || null;

  const selectedCoordinates =
    selectedSavedAddress
      ? coordinatesFromAddress(
          selectedSavedAddress,
        )
      : null;

  const selectedAddressIsDeliverable =
    Boolean(
      selectedCoordinates &&
        isInsideDeliveryArea(
          selectedCoordinates.latitude,
          selectedCoordinates.longitude,
        ),
    );

  return (
    <main className="address-page">
      <div className="address-shell">
        <header className="address-head">
          <button
            type="button"
            className="icon-button"
            aria-label="Go back"
            onClick={() => router.back()}
          >
            <ArrowLeft />
          </button>

          <div>
            <small>DELIVERY</small>
            <h1>Delivery Address</h1>
          </div>
        </header>

        {!formOpen ? (
          <>
            {formError && (
              <div
                className="address-list-error"
                role="alert"
              >
                <strong>Check delivery address</strong>
                <span>{formError}</span>
              </div>
            )}

            <button
              type="button"
              className="location-card"
              disabled={locating}
              onClick={() =>
                void useCurrentLocation()
              }
            >
              {locating ? (
                <Loader2 className="spin" />
              ) : (
                <MapPin />
              )}

              <span>
                {locating
                  ? 'Finding your address…'
                  : 'Use Current Location'}
              </span>
            </button>

            <section className="saved-addresses">
              {addresses.map(
                (address) => {
                  const coordinates =
                    coordinatesFromAddress(
                      address,
                    );

                  const available =
                    Boolean(
                      coordinates &&
                        isInsideDeliveryArea(
                          coordinates.latitude,
                          coordinates.longitude,
                        ),
                    );

                  return (
                    <article
                      className={
                        selectedId ===
                        address.id &&
                        available
                          ? 'saved-address selected'
                          : available
                            ? 'saved-address'
                            : 'saved-address unavailable'
                      }
                      key={address.id}
                    >
                      <button
                        type="button"
                        className="saved-address-select"
                        onClick={() =>
                          void select(
                            address,
                          )
                        }
                      >
                        <Home />

                        <span className="saved-address-copy">
                          <strong>
                            {address.addressType}

                            {address.isDefault && (
                              <em>
                                Default
                              </em>
                            )}
                          </strong>

                          <small>
                            {formatAddress(
                              address,
                            )}
                          </small>

                          <small>
                            {address.phone}
                          </small>

                          {!available && (
                            <small className="address-unavailable-text">
                              Not available for delivery — edit this address.
                            </small>
                          )}
                        </span>

                        {selectedId ===
                          address.id &&
                        available ? (
                          <CheckCircle2 />
                        ) : (
                          <span className="radio" />
                        )}
                      </button>

                      <div className="saved-address-actions">
                        <button
                          type="button"
                          className="delete-address-button"
                          onClick={() =>
                            void deleteAddress(
                              address,
                            )
                          }
                          disabled={
                            deletingId === address.id
                          }
                          aria-label={`Delete ${address.addressType} address`}
                        >
                          <Trash2 size={16} />
                        </button>

                        <button
                          type="button"
                          className="edit-address-button"
                          onClick={() =>
                            editAddress(
                              address,
                            )
                          }
                          aria-label={`Edit ${address.addressType} address`}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>
                      </div>
                    </article>
                  );
                },
              )}
            </section>

            <button
              type="button"
              className="add-address-card"
              onClick={
                openNewAddress
              }
            >
              <Plus />
              <span>
                Add New Address
              </span>
            </button>

            <button
              type="button"
              className="continue-address"
              disabled={
                !selectedId ||
                !selectedAddressIsDeliverable
              }
              onClick={() => {
                if (
                  !selectedAddressIsDeliverable
                ) {
                  setFormError(
                    `${SERVICE_AREA_MESSAGE} ${BROWSE_MESSAGE}`,
                  );
                  return;
                }

                router.push(
                  '/checkout',
                );
              }}
            >
              Continue to Checkout
            </button>
          </>
        ) : (
          <form
            className="address-form"
            onSubmit={save}
            noValidate
          >
            <header className="address-form-head">
              <div>
                <small>
                  {editingId
                    ? 'EDIT ADDRESS'
                    : 'NEW ADDRESS'}
                </small>

                <h2>
                  {editingId
                    ? 'Edit delivery address'
                    : 'Add delivery address'}
                </h2>
              </div>

              {addresses.length >
                0 && (
                <button
                  type="button"
                  className="cancel-address"
                  onClick={
                    cancelNewAddress
                  }
                >
                  Cancel
                </button>
              )}
            </header>

            <div
              className="address-type-row"
              role="group"
              aria-label="Address type"
            >
              {ADDRESS_TYPES.map(
                (type) => (
                  <button
                    type="button"
                    key={type}
                    className={
                      form.addressType ===
                      type
                        ? 'active'
                        : ''
                    }
                    aria-pressed={
                      form.addressType ===
                      type
                    }
                    onClick={() =>
                      updateForm(
                        'addressType',
                        type as AddressInput['addressType'],
                      )
                    }
                  >
                    {type}
                  </button>
                ),
              )}
            </div>

            <div className="form-grid">
              <label>
                Full name
                <span className="required">
                  *
                </span>

                <input
                  autoComplete="name"
                  required
                  value={
                    form.fullName
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'fullName',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                Phone
                <span className="required">
                  *
                </span>

                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={13}
                  value={form.phone}
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'phone',
                      cleanPhone(
                        event.target
                          .value,
                      ),
                    )
                  }
                />
              </label>

              <label>
                House / Flat no
                <span className="required">
                  *
                </span>

                <input
                  autoComplete="address-line1"
                  required
                  value={
                    form.houseNo
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'houseNo',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                Street
                <span className="optional">
                  Optional
                </span>

                <input
                  autoComplete="address-line2"
                  value={form.street}
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'street',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                Landmark
                <span className="optional">
                  Optional
                </span>

                <input
                  value={
                    form.landmark
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'landmark',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                Area
                <span className="required">
                  *
                </span>

                <input
                  required
                  value={form.area}
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'area',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                City
                <span className="required">
                  *
                </span>

                <input
                  autoComplete="address-level2"
                  required
                  value={form.city}
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'city',
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                Pincode
                <span className="required">
                  *
                </span>

                <input
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                  maxLength={6}
                  value={
                    form.pincode
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'pincode',
                      cleanPincode(
                        event.target
                          .value,
                      ),
                    )
                  }
                />
              </label>

              <label className="wide">
                Delivery note
                <span className="optional">
                  Optional
                </span>

                <textarea
                  rows={3}
                  value={
                    form.deliveryNote
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'deliveryNote',
                      event.target
                        .value,
                    )
                  }
                />
              </label>
            </div>

            {formError ? (
              <div
                className="form-error bottom-error"
                role="alert"
              >
                <strong>
                  Check delivery area
                </strong>
                <span>{formError}</span>
              </div>
            ) : (
              <p className="delivery-check-note">
                Delivery area will be checked automatically when you save.
              </p>
            )}

            <button
              type="submit"
              className="save-address"
              disabled={
                saving ||
                !requiredComplete
              }
            >
              {saving ? (
                <>
                  <Loader2 className="spin" />
                  Saving…
                </>
              ) : (
                editingId
                  ? 'Update & Use Address'
                  : 'Save & Use Address'
              )}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .address-page {
          min-height: 100vh;
          padding: 28px 18px 80px;
          background: #f7f5f1;
          color: #17120d;
        }

        .address-shell {
          width: min(900px, 100%);
          margin: 0 auto;
        }

        button,
        .location-card,
        .saved-address,
        .add-address-card,
        .continue-address,
        .save-address,
        .cancel-address,
        .address-type-row button,
        .icon-button {
          cursor: pointer;
        }

        button:disabled,
        .continue-address:disabled,
        .save-address:disabled {
          cursor: not-allowed;
        }

        .address-head {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 24px;
        }

        .icon-button {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid #dfd8cf;
          border-radius: 14px;
          color: #17120d;
          background: #ffffff;
          transition:
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .icon-button:hover {
          border-color: #cfc3b7;
          background: #fbf8f4;
        }

        .icon-button svg {
          width: 21px;
          height: 21px;
        }

        .address-head small,
        .address-form small {
          color: #d66d0d;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
        }

        .address-head h1,
        .address-form h2 {
          margin: 4px 0 0;
        }

        .address-head h1 {
          font-size: 32px;
          line-height: 1.1;
        }

        .location-card,
        .add-address-card,
        .saved-address {
          width: 100%;
          margin-bottom: 14px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          border: 1px solid #e3dbd2;
          border-radius: 18px;
          color: #17120d;
          background: #ffffff;
          text-align: left;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .location-card:disabled {
          opacity: 0.72;
          cursor: wait;
        }

        .location-card:disabled:hover {
          border-color: #e3dbd2;
          background: #ffffff;
          box-shadow: none;
        }

        .location-card:hover,
        .add-address-card:hover,
        .saved-address:hover {
          border-color: #cabfb4;
          background: #fffdfb;
          box-shadow:
            0 7px 20px
            rgba(56, 39, 24, 0.05);
        }

        .saved-address {
          position: relative;
          padding: 0;
          overflow: hidden;
        }

        .saved-address-select {
          width: 100%;
          min-width: 0;
          padding: 18px 112px 18px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
        }

        .saved-address-copy {
          min-width: 0;
          flex: 1;
        }

        .saved-address strong,
        .saved-address small {
          display: block;
        }

        .saved-address strong {
          font-size: 17px;
        }

        .saved-address em {
          margin-left: 8px;
          padding: 4px 7px;
          border-radius: 999px;
          color: #168648;
          background: #e8f8ef;
          font-size: 10px;
          font-style: normal;
        }

        .saved-address small {
          margin-top: 5px;
          color: #756b62;
        }

        .saved-address.selected {
          border-color: #22a65a;
          box-shadow:
            0 0 0 1px
            rgba(34, 166, 90, 0.05);
        }

        .saved-address.unavailable {
          border-color: #efb0a7;
          background: #fff8f7;
        }

        .address-unavailable-text {
          color: #b33b2e !important;
          font-weight: 750;
        }

        .saved-address-actions {
          position: absolute;
          top: 50%;
          right: 16px;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 7px;
          z-index: 2;
        }

        .edit-address-button,
        .delete-address-button {
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d9d0c7;
          border-radius: 10px;
          background: #ffffff;
          font-size: 12px;
          font-weight: 800;
        }

        .edit-address-button {
          min-width: 74px;
          padding: 0 11px;
          gap: 6px;
          color: #17120d;
        }

        .delete-address-button {
          width: 38px;
          padding: 0;
          color: #b33b2e;
        }

        .edit-address-button:hover {
          border-color: #22a65a;
          color: #168648;
        }

        .delete-address-button:hover {
          border-color: #d86558;
          color: #982d23;
          background: #fff6f4;
        }

        .delete-address-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .address-list-error {
          margin: 0 0 14px;
          padding: 13px 15px;
          display: grid;
          gap: 4px;
          border: 1px solid #efb0a7;
          border-radius: 14px;
          color: #9b3025;
          background: #fff4f2;
          font-size: 13px;
          line-height: 1.4;
        }

        .address-list-error strong {
          font-size: 14px;
        }

        .radio {
          width: 22px;
          height: 22px;
          flex: 0 0 auto !important;
          border: 2px solid #bbb3aa;
          border-radius: 50%;
        }

        .add-address-card span {
          flex: 1;
        }

        .continue-address {
          width: 100%;
          min-height: 52px;
          margin: 0 0 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 15px;
          color: #ffffff;
          background: #22c55e;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.2;
          text-align: center;
          transition:
            background 0.18s ease,
            opacity 0.18s ease;
        }

        .delivery-check-note {
          margin: 0 0 10px;
          color: #6f675f;
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }


        .bottom-error strong,
        .bottom-error span {
          display: block;
        }

        .save-address {
          width: 100%;
          min-height: 52px;
          margin-top: 12px;
          border: 0;
          border-radius: 15px;
          color: #ffffff;
          background: #22c55e;
          font-size: 16px;
          font-weight: 800;
          transition:
            background 0.18s ease,
            opacity 0.18s ease;
        }

        .continue-address:hover:not(:disabled),
        .save-address:hover:not(:disabled) {
          background: #19b954;
        }

        .continue-address:disabled,
        .save-address:disabled {
          opacity: 0.5;
        }

        .address-form {
          padding: 22px;
          border: 1px solid #e3dbd2;
          border-radius: 22px;
          background: #ffffff;
        }

        .address-form-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .cancel-address {
          min-width: 0;
          height: 38px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d9d0c7;
          border-radius: 11px;
          color: #3d352e;
          background: #ffffff;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          transition:
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .cancel-address:hover {
          border-color: #bfb3a7;
          background: #f8f4ef;
        }

        .address-type-row {
          margin: 20px 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 9px;
          width: 100%;
        }

        .address-type-row button {
          min-width: 0;
          height: 40px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dfd8cf;
          border-radius: 999px;
          color: #17120d;
          background: #ffffff;
          font-size: 14px;
          font-weight: 650;
          transition:
            color 0.18s ease,
            background 0.18s ease,
            border-color 0.18s ease;
        }

        .address-type-row button:hover {
          border-color: #bfb4aa;
        }

        .address-type-row button.active {
          border-color: #171717;
          color: #ffffff;
          background: #171717;
        }

        .form-error {
          margin: -4px 0 16px;
          padding: 11px 13px;
          border: 1px solid #f1c9c5;
          border-radius: 11px;
          color: #a52a22;
          background: #fff3f2;
          font-size: 13px;
          font-weight: 650;
        }

        .form-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 15px;
        }

        .form-grid label {
          display: grid;
          grid-template-columns:
            auto 1fr;
          gap: 7px 5px;
          align-items: center;
          color: #17120d;
          font-size: 12px;
          font-weight: 700;
        }

        .form-grid label input,
        .form-grid label textarea {
          grid-column: 1 / -1;
        }

        .required {
          color: #c64932;
          font-weight: 900;
        }

        .optional {
          justify-self: start;
          color: #9b9085;
          font-size: 10px;
          font-weight: 600;
        }

        .form-grid input,
        .form-grid textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd6cd;
          border-radius: 12px;
          outline: none;
          color: #17120d;
          background: #ffffff;
          font: inherit;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .form-grid textarea {
          resize: vertical;
          min-height: 92px;
        }

        .form-grid input:focus,
        .form-grid textarea:focus {
          border-color: #22a65a;
          box-shadow:
            0 0 0 3px
            rgba(34, 166, 90, 0.1);
        }

        .wide {
          grid-column: 1 / -1;
        }

        .save-address {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .address-state {
          min-height: 100vh;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 12px;
          background: #f7f5f1;
        }

        .spin {
          animation:
            spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform:
              rotate(360deg);
          }
        }

        @media (max-width: 620px) {
          .address-page {
            padding:
              18px 12px 60px;
          }

          .address-head h1 {
            font-size: 28px;
          }

          .address-form {
            padding: 17px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .wide {
            grid-column: auto;
          }

          .address-type-row {
            justify-content:
              flex-start;
            overflow-x: auto;
            padding-bottom: 2px;
          }

          .address-type-row button {
            flex: 0 0 auto;
          }

          .cancel-address {
            height: 36px;
            padding: 0 12px;
            font-size: 12px;
          }

          .saved-address-select {
            padding:
              16px 92px 16px 14px;
          }

          .edit-address-button {
            right: 10px;
            min-width: 68px;
            height: 34px;
            padding: 0 9px;
          }
        }
      `}</style>
    </main>
  );
}