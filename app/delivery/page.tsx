'use client';

import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  deliveryAuth,
  deliveryDb,
} from '@/lib/delivery-firebase';

type DeliveryBoy = {
  uid: string;
  name: string;
  phone: string;
  vehicle_number?: string;
  role: string;
  is_active: boolean;
};

type DeliveryItem = {
  title: string;
  quantity: number;
  image?: string;
  size?: string;
  color?: string;
};

type DeliveryGift = {
  title: string;
  image?: string;
};

type DeliveryServiceRequest = {
  index: number;
  rawIndex: number;
  productId: string;
  productTitle: string;
  quantity: number;
  type: 'return' | 'exchange';
  reason: string;
  status: string;
  pickupStatus: string;
  pickupFailureReason: string;
  pickupDeliveryBoyId: string;
  pickupDeliveryBoyName: string;
};

type DeliveryOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
  deliveryNote: string;
  deliveryTitle: string;
  deliveryWindow: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  deliveryStatus: string;
  deliveryFailureReason: string;
  assignedDeliveryBoyId: string;
  assignedDeliveryBoyName: string;
  items: DeliveryItem[];
  gifts: DeliveryGift[];
  serviceRequests: DeliveryServiceRequest[];
  returnStatus: string;
  exchangeStatus: string;
};

const UPI_ID =
  process.env.NEXT_PUBLIC_SPOTC_UPI_ID?.trim() || '';
const UPI_NAME =
  process.env.NEXT_PUBLIC_SPOTC_UPI_NAME?.trim() || 'SPOTC';

const FAILURE_REASONS = [
  'Customer unavailable',
  'Customer refused order',
  'Unable to locate address',
  'Payment issue',
  'Customer asked to reschedule',
  'Other',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readItems(value: unknown): DeliveryItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const data =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};
    return {
      title:
        text(data.title) ||
        text(data.product_name) ||
        text(data.name) ||
        'Product',
      quantity: Math.max(
        1,
        numberValue(data.quantity ?? data.qty) || 1,
      ),
      image:
        text(data.image) ||
        text(data.image_url) ||
        text(data.product_image),
      size: text(data.size),
      color: text(data.color),
    };
  });
}

function readGifts(raw: Record<string, unknown>): DeliveryGift[] {
  const sources = [
    raw.free_gifts,
    raw.selected_free_gifts,
    raw.gifts,
  ];
  const all: DeliveryGift[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const gift of source) {
      if (!gift || typeof gift !== 'object') continue;
      const data = gift as Record<string, unknown>;
      const title =
        text(data.title) ||
        text(data.product_name) ||
        text(data.name) ||
        'FREE Gift';
      const image =
        text(data.image) ||
        text(data.image_url) ||
        text(data.product_image);
      const key = `${text(data.id) || text(data.product_id)}::${title}::${image}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ title, image });
    }
  }
  return all;
}

function readServiceRequests(
  raw: Record<string, unknown>,
): DeliveryServiceRequest[] {
  if (!Array.isArray(raw.return_requests)) return [];

  return raw.return_requests
    .map((value, index) => {
      const request =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};

      const type = text(request.type).toLowerCase();

      if (type !== 'return' && type !== 'exchange') {
        return null;
      }

      return {
        index,
        rawIndex: Math.max(
          0,
          numberValue(request.raw_index ?? request.rawIndex),
        ),
        productId:
          text(request.product_id) ||
          text(request.productId),
        productTitle:
          text(request.product_title) ||
          text(request.productTitle) ||
          'Product',
        quantity: Math.max(
          1,
          numberValue(request.quantity ?? request.qty) || 1,
        ),
        type: type as 'return' | 'exchange',
        reason: text(request.reason),
        status: normalized(text(request.status) || 'requested'),
        pickupStatus: normalized(text(request.pickup_status)),
        pickupFailureReason: text(request.pickup_failure_reason),
        pickupDeliveryBoyId:
          text(request.pickup_delivery_boy_id) ||
          text(request.delivery_boy_id),
        pickupDeliveryBoyName:
          text(request.pickup_delivery_boy_name) ||
          text(request.delivery_boy_name),
      };
    })
    .filter(
      (value): value is DeliveryServiceRequest =>
        Boolean(value),
    );
}

function mapOrder(
  id: string,
  raw: Record<string, unknown>,
): DeliveryOrder {
  const addressObject =
    raw.address && typeof raw.address === 'object'
      ? (raw.address as Record<string, unknown>)
      : {};

  const directAddress =
    text(raw.delivery_address) ||
    text(raw.address_text) ||
    text(raw.formatted_address);

  const address =
    directAddress ||
    [
      text(addressObject.house_no),
      text(addressObject.street),
      text(addressObject.area),
      text(addressObject.city),
      text(addressObject.pincode),
    ]
      .filter(Boolean)
      .join(', ') ||
    'Delivery address not available';

  const latitude = nullableNumber(
    addressObject.latitude ?? raw.latitude ?? raw.delivery_latitude,
  );
  const longitude = nullableNumber(
    addressObject.longitude ?? raw.longitude ?? raw.delivery_longitude,
  );

  return {
    id,
    orderNumber:
      text(raw.order_number) ||
      text(raw.orderNumber) ||
      id,
    customerName:
      text(raw.customer_name) ||
      text(raw.customerName) ||
      text(raw.user_name) ||
      'Customer',
    customerPhone:
      text(raw.customer_phone) ||
      text(raw.customerPhone) ||
      text(raw.phone) ||
      text(addressObject.phone),
    address,
    latitude,
    longitude,
    landmark: text(addressObject.landmark),
    deliveryNote:
      text(addressObject.delivery_note) ||
      text(raw.delivery_note),
    deliveryTitle:
      text(raw.delivery_option_title) ||
      text(raw.delivery_title) ||
      'Delivery',
    deliveryWindow:
      text(raw.delivery_window) ||
      text(raw.delivery_time_window) ||
      text(raw.estimated_delivery),
    total: numberValue(
      raw.total ??
        raw.total_amount ??
        raw.grand_total,
    ),
    paymentMethod:
      text(raw.payment_method) ||
      text(raw.paymentMethod) ||
      'COD',
    paymentStatus:
      text(raw.payment_status) || 'pending',
    status:
      text(raw.order_status) ||
      text(raw.status),
    deliveryStatus: text(raw.delivery_status),
    deliveryFailureReason: text(raw.delivery_failure_reason),
    assignedDeliveryBoyId:
      text(raw.delivery_boy_id) ||
      text(raw.assigned_delivery_boy_id) ||
      text(raw.deliveryBoyId),
    assignedDeliveryBoyName:
      text(raw.delivery_boy_name) ||
      text(raw.assigned_delivery_boy_name),
    items: readItems(raw.items),
    gifts: readGifts(raw),
    serviceRequests: readServiceRequests(raw),
    returnStatus:
      text(raw.return_status) ||
      text(raw.return_request_status),
    exchangeStatus:
      text(raw.exchange_status) ||
      text(raw.exchange_request_status),
  };
}

function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function effectiveStatus(order: DeliveryOrder): string {
  return normalized(order.deliveryStatus || order.status || '');
}

function mapsHref(order: DeliveryOrder): string {
  const destination =
    order.latitude !== null && order.longitude !== null
      ? `${order.latitude},${order.longitude}`
      : order.address;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}`;
}

function upiHref(order: DeliveryOrder): string {
  if (!UPI_ID) return '';
  const note = `SPOTC ${order.orderNumber}`;
  return `upi://pay?pa=${encodeURIComponent(
    UPI_ID,
  )}&pn=${encodeURIComponent(
    UPI_NAME,
  )}&am=${order.total.toFixed(
    2,
  )}&cu=INR&tn=${encodeURIComponent(note)}`;
}

function qrHref(order: DeliveryOrder): string {
  const uri = upiHref(order);
  if (!uri) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    uri,
  )}`;
}

export default function DeliveryDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [rider, setRider] = useState<DeliveryBoy | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [failureOrder, setFailureOrder] = useState<DeliveryOrder | null>(null);
  const [failureReason, setFailureReason] = useState(FAILURE_REASONS[0]);
  const [showQrOrder, setShowQrOrder] = useState<DeliveryOrder | null>(null);

  useEffect(() => {
    let stopOrders: (() => void) | null = null;

    async function logoutAndRedirect() {
      localStorage.removeItem('spotc-delivery-uid');
      localStorage.removeItem('spotc-delivery-name');
      localStorage.removeItem('spotc-delivery-phone');
      try {
        await signOut(deliveryAuth);
      } catch (error) {
        console.error('Delivery sign out failed:', error);
      }
      setRider(null);
      setChecking(false);
      window.location.replace('/delivery/login');
    }

    const stopAuth = onAuthStateChanged(
      deliveryAuth,
      async (user: User | null) => {
        if (stopOrders) {
          stopOrders();
          stopOrders = null;
        }

        if (!user) {
          setRider(null);
          setChecking(false);
          router.replace('/delivery/login');
          return;
        }

        try {
          const riderSnap = await getDoc(
            doc(deliveryDb, 'DeliveryBoys', user.uid),
          );

          if (!riderSnap.exists()) {
            await logoutAndRedirect();
            return;
          }

          const data = riderSnap.data();

          if (
            data.role !== 'delivery_boy' ||
            data.is_active === false
          ) {
            await logoutAndRedirect();
            return;
          }

          setRider({
            uid: user.uid,
            name: text(data.name) || 'Delivery Boy',
            phone: text(data.phone),
            vehicle_number: text(data.vehicle_number),
            role: text(data.role),
            is_active: data.is_active !== false,
          });
          setChecking(false);
          setLoadingOrders(true);

          const ordersQuery = query(
            collection(deliveryDb, 'Orders'),
            where('delivery_boy_id', '==', user.uid),
          );

          stopOrders = onSnapshot(
            ordersQuery,
            (snapshot) => {
              const next = snapshot.docs
                .map((orderDoc) =>
                  mapOrder(
                    orderDoc.id,
                    orderDoc.data() as Record<string, unknown>,
                  ),
                )
                .sort((a, b) => {
                  const rank = (order: DeliveryOrder) => {
                    const hasServiceWork =
                      order.serviceRequests.some(
                        (request) =>
                          request.status === 'approved' &&
                          request.pickupStatus !== 'picked_up',
                      );
                    if (hasServiceWork) return -1;
                    const s = effectiveStatus(order);
                    if (s === 'out_for_delivery') return 0;
                    if (s === 'packed' || s === 'assigned') return 1;
                    if (s === 'delivered_waiting_approval') return 2;
                    if (s === 'not_delivered') return 3;
                    if (s === 'cancelled') return 4;
                    if (s === 'delivered') return 5;
                    return 2;
                  };
                  return rank(a) - rank(b);
                });

              setOrders(next);
              setLoadingOrders(false);
            },
            (error) => {
              console.error('Delivery orders listener failed:', error);
              setMessage('Could not load assigned orders.');
              setLoadingOrders(false);
            },
          );
        } catch (error) {
          console.error('Delivery dashboard access check failed:', error);
          await logoutAndRedirect();
        }
      },
    );

    return () => {
      stopAuth();
      if (stopOrders) stopOrders();
    };
  }, [router]);

  const counts = useMemo(() => {
    let active = 0;
    let waiting = 0;
    let notDelivered = 0;

    orders.forEach((order) => {
      const status = effectiveStatus(order);
      const hasServiceWork =
        order.serviceRequests.some(
          (request) =>
            request.status === 'approved' &&
            request.pickupStatus !== 'picked_up',
        );

      if (hasServiceWork) {
        active += 1;
      } else if (status === 'delivered_waiting_approval') {
        waiting += 1;
      } else if (
        status === 'not_delivered' ||
        status === 'delivery_failed' ||
        status === 'cancelled'
      ) {
        notDelivered += 1;
      } else if (status !== 'delivered') {
        active += 1;
      }
    });

    return { active, waiting, notDelivered };
  }, [orders]);

  async function handleLogout() {
    setMessage('');
    localStorage.removeItem('spotc-delivery-uid');
    localStorage.removeItem('spotc-delivery-name');
    localStorage.removeItem('spotc-delivery-phone');
    try {
      await signOut(deliveryAuth);
    } catch (error) {
      console.error('Delivery logout failed:', error);
    }
    window.location.replace('/delivery/login');
  }

  async function markOutForDelivery(order: DeliveryOrder) {
    if (!rider || busyId) return;

    const current = effectiveStatus(order);
    if (current === 'cancelled') {
      setMessage('Cancelled order cannot be taken for delivery.');
      return;
    }
    if (
      current === 'delivered' ||
      current === 'delivered_waiting_approval'
    ) {
      return;
    }

    setBusyId(order.id);
    setMessage('');

    try {
      await updateDoc(doc(deliveryDb, 'Orders', order.id), {
        order_status: 'out_for_delivery',
        status: 'out_for_delivery',
        delivery_status: 'out_for_delivery',
        delivery_assignment_status: 'out_for_delivery',
        out_for_delivery_at: serverTimestamp(),
        delivery_started_at: serverTimestamp(),
        delivery_started_by: rider.uid,
        updated_at: serverTimestamp(),
      });
      setMessage(`${order.orderNumber} is now Out for Delivery.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not start delivery.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function confirmPayment(order: DeliveryOrder) {
    if (!rider || busyId) return;

    const confirmed = window.confirm(
      `Confirm payment received for ${order.orderNumber}?\n\nAmount: ₹${Math.round(
        order.total,
      )}`,
    );

    if (!confirmed) return;

    setBusyId(order.id);
    setMessage('');

    try {
      await updateDoc(doc(deliveryDb, 'Orders', order.id), {
        payment_status: 'paid',
        payment_received_at: serverTimestamp(),
        payment_received_by: rider.uid,
        payment_received_by_name: rider.name,
        updated_at: serverTimestamp(),
      });

      setShowQrOrder(null);

      setMessage(
        `${order.orderNumber}: payment marked as received.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not confirm payment.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function markDelivered(order: DeliveryOrder) {
    if (!rider || busyId) return;

    const current = effectiveStatus(order);

    if (current === 'cancelled') {
      setMessage('CANCELLED — DO NOT DELIVER.');
      return;
    }

    if (
      current !== 'out_for_delivery' &&
      current !== 'delivered_waiting_approval'
    ) {
      setMessage('Mark the order Out for Delivery first.');
      return;
    }

    if (normalized(order.paymentStatus) !== 'paid') {
      setMessage(
        'Confirm payment received before marking this order Delivered.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Mark ${order.orderNumber} as DELIVERED?\n\nThis will update Admin Orders and stock.`,
    );

    if (!confirmed) return;

    setBusyId(order.id);
    setMessage('');

    try {
      const user = deliveryAuth.currentUser;

      if (!user) {
        throw new Error(
          'Delivery login expired. Please sign in again.',
        );
      }

      const idToken = await user.getIdToken();

      const response = await fetch('/api/delivery/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          orderId: order.id,
        }),
      });

      const rawResponse = await response.text();

      let result: {
        ok?: boolean;
        message?: string;
        error?: string;
      } = {};

      try {
        result = rawResponse
          ? JSON.parse(rawResponse)
          : {};
      } catch {
        // Keep raw response for diagnostics.
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
            rawResponse ||
            `Delivery completion failed (${response.status}).`,
        );
      }

      setMessage(
        `${order.orderNumber}: Delivered. Admin and stock updated.`,
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not complete delivery.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function updateServiceRequest(
    order: DeliveryOrder,
    requestIndex: number,
    outcome: 'picked_up' | 'failed',
  ) {
    if (!rider || busyId) return;

    const serviceRequest = order.serviceRequests.find(
      (request) => request.index === requestIndex,
    );

    if (!serviceRequest) {
      setMessage('Return / exchange request was not found.');
      return;
    }

    let failureReason = '';

    if (outcome === 'failed') {
      const entered = window.prompt(
        serviceRequest.type === 'return'
          ? 'Why could the return pickup not be completed?'
          : 'Why could the exchange not be completed?',
        'Customer unavailable',
      );

      if (entered === null) return;

      failureReason = entered.trim();

      if (!failureReason) {
        setMessage('Enter a failure reason.');
        return;
      }
    } else {
      const confirmed = window.confirm(
        serviceRequest.type === 'return'
          ? `Confirm RETURN PICKUP completed?\n\n${serviceRequest.productTitle}\nQty ${serviceRequest.quantity}`
          : `Confirm EXCHANGE completed?\n\nReplacement handed over and old item collected:\n${serviceRequest.productTitle}\nQty ${serviceRequest.quantity}`,
      );

      if (!confirmed) return;
    }

    setBusyId(order.id);
    setMessage('');

    try {
      const orderRef = doc(
        deliveryDb,
        'Orders',
        order.id,
      );

      await runTransaction(
        deliveryDb,
        async (transaction) => {
          const snapshot =
            await transaction.get(orderRef);

          if (!snapshot.exists()) {
            throw new Error(
              'Order no longer exists.',
            );
          }

          const data =
            snapshot.data() as DocumentData;

          const requests =
            Array.isArray(data.return_requests)
              ? [...data.return_requests]
              : [];

          if (
            requestIndex < 0 ||
            requestIndex >= requests.length
          ) {
            throw new Error(
              'Return / exchange request no longer exists.',
            );
          }

          const currentRaw =
            requests[requestIndex] &&
            typeof requests[requestIndex] === 'object'
              ? {
                  ...(requests[
                    requestIndex
                  ] as Record<string, unknown>),
                }
              : {};

          const currentStatus =
            normalized(text(currentRaw.status));

          if (currentStatus !== 'approved') {
            throw new Error(
              'This service request is not approved.',
            );
          }

          const assignedRiderId =
            text(currentRaw.pickup_delivery_boy_id) ||
            text(data.delivery_boy_id);

          if (
            assignedRiderId &&
            assignedRiderId !== rider.uid
          ) {
            throw new Error(
              'This pickup / exchange is assigned to another delivery boy.',
            );
          }

          const requestType =
            normalized(text(currentRaw.type));

          if (outcome === 'failed') {
            currentRaw.pickup_status = 'failed';
            currentRaw.pickup_failure_reason =
              failureReason;
            currentRaw.pickup_failed_at = Date.now();
            currentRaw.pickup_failed_by = rider.uid;
            currentRaw.pickup_failed_by_name =
              rider.name;
          } else {
            currentRaw.pickup_status = 'picked_up';
            currentRaw.picked_up_at = Date.now();
            currentRaw.picked_up_by = rider.uid;
            currentRaw.picked_up_by_name =
              rider.name;
            currentRaw.pickup_failure_reason = '';

            if (requestType === 'exchange') {
              currentRaw.exchange_handed_over = true;
              currentRaw.exchange_handed_over_at =
                Date.now();
            } else {
              currentRaw.return_picked_up = true;
              currentRaw.return_picked_up_at =
                Date.now();
            }
          }

          requests[requestIndex] = currentRaw;

          transaction.update(orderRef, {
            return_requests: requests,
            updated_at: serverTimestamp(),
          });
        },
      );

      setMessage(
        outcome === 'failed'
          ? `${order.orderNumber}: ${
              serviceRequest.type === 'return'
                ? 'Return pickup'
                : 'Exchange'
            } failed — ${failureReason}.`
          : serviceRequest.type === 'return'
            ? `${order.orderNumber}: Return item picked up. Admin must receive it before stock is restored.`
            : `${order.orderNumber}: Exchange swap completed. Admin must finalize the exchange.`,
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not update return / exchange.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function markNotDelivered() {
    if (!rider || !failureOrder || busyId) return;

    setBusyId(failureOrder.id);
    setMessage('');

    try {
      await updateDoc(
        doc(deliveryDb, 'Orders', failureOrder.id),
        {
          delivery_status: 'not_delivered',
          delivery_assignment_status: 'not_delivered',
          delivery_failure_reason: failureReason,
          delivery_failed_at: serverTimestamp(),
          delivery_failed_by: rider.uid,
          delivery_failed_by_name: rider.name,
          updated_at: serverTimestamp(),
        },
      );

      setMessage(
        `${failureOrder.orderNumber}: Not Delivered — ${failureReason}.`,
      );
      setFailureOrder(null);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not update delivery result.',
      );
    } finally {
      setBusyId('');
    }
  }

  if (checking) {
    return <main style={loadingPage}>Checking delivery account…</main>;
  }

  if (!rider) {
    return <main style={loadingPage}>Redirecting to delivery login…</main>;
  }

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={brand}>SPOTC</div>
          <div style={brandRole}>DELIVERY</div>
        </div>

        <div style={headerRight}>
          <div>
            <strong>{rider.name}</strong>
            {rider.vehicle_number && (
              <div style={headerVehicle}>{rider.vehicle_number}</div>
            )}
          </div>
          <button
            type="button"
            style={logoutButton}
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={content}>
        <section style={intro}>
          <h1 style={title}>My Deliveries</h1>
          <p style={subtitle}>
            Navigation, payment collection and delivery confirmation.
          </p>
        </section>

        {message && <div style={messageBox}>{message}</div>}

        <section style={stats}>
          <StatCard label="Active" value={counts.active} />
          <StatCard label="Waiting Approval" value={counts.waiting} />
          <StatCard label="Not Delivered" value={counts.notDelivered} />
        </section>

        {loadingOrders ? (
          <section style={emptyCard}>Loading assigned orders…</section>
        ) : orders.length === 0 ? (
          <section style={emptyCard}>
            <div style={emptyIcon}>📦</div>
            <h2 style={emptyTitle}>No deliveries assigned</h2>
            <p style={emptyText}>
              New assigned orders will appear here automatically.
            </p>
          </section>
        ) : (
          <section style={orderList}>
            {orders.map((order) => {
              const status = effectiveStatus(order);
              const cancelled = status === 'cancelled';
              const waiting =
                status === 'delivered_waiting_approval';
              const delivered = status === 'delivered';
              const failed = status === 'not_delivered';
              const out = status === 'out_for_delivery';
              const busy = busyId === order.id;

              const serviceRequests =
                order.serviceRequests.filter(
                  (request) =>
                    request.status === 'approved' &&
                    (!request.pickupDeliveryBoyId ||
                      request.pickupDeliveryBoyId === rider.uid),
                );

              return (
                <article
                  key={order.id}
                  style={{
                    ...orderCard,
                    ...(cancelled ? cancelledCard : {}),
                  }}
                >
                  {cancelled && (
                    <div style={dangerBanner}>
                      CANCELLED — DO NOT DELIVER / DO NOT COLLECT PAYMENT
                    </div>
                  )}

                  {waiting && (
                    <div style={waitingBanner}>
                      DELIVERY REPORTED — WAITING FOR ADMIN APPROVAL
                    </div>
                  )}

                  {failed && (
                    <div style={failedBanner}>
                      NOT DELIVERED
                      {order.deliveryFailureReason
                        ? ` — ${order.deliveryFailureReason}`
                        : ''}
                    </div>
                  )}

                  <div style={orderTop}>
                    <div>
                      <div style={orderNumber}>{order.orderNumber}</div>
                      <div style={smallMuted}>
                        {order.items.reduce(
                          (sum, item) => sum + item.quantity,
                          0,
                        )}{' '}
                        unit(s)
                        {order.gifts.length
                          ? ` + ${order.gifts.length} FREE gift(s)`
                          : ''}
                      </div>
                    </div>
                    <div style={amount}>
                      ₹{Math.round(order.total).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={collectBox}>
                    <div>
                      <span style={collectLabel}>AMOUNT TO COLLECT</span>
                      <strong style={collectAmount}>
                        ₹{Math.round(order.total).toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div style={paymentPill}>
                      {order.paymentMethod.toUpperCase()}
                      {order.paymentStatus &&
                        ` · ${order.paymentStatus.toUpperCase()}`}
                    </div>
                  </div>

                  <div style={deliverySlotBox}>
                    <strong>{order.deliveryTitle}</strong>
                    {order.deliveryWindow && (
                      <span>{order.deliveryWindow}</span>
                    )}
                  </div>

                  <div style={orderGrid}>
                    <div>
                      <div style={fieldLabel}>Customer</div>
                      <div style={fieldValue}>{order.customerName}</div>
                      {order.customerPhone && (
                        <a
                          href={`tel:${order.customerPhone}`}
                          style={phoneLink}
                        >
                          {order.customerPhone}
                        </a>
                      )}
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={fieldLabel}>Delivery Address</div>
                      <div style={fieldValue}>{order.address}</div>
                      {order.landmark && (
                        <div style={detailMuted}>
                          Landmark: {order.landmark}
                        </div>
                      )}
                      {order.deliveryNote && (
                        <div style={detailMuted}>
                          Note: {order.deliveryNote}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={quickActions}>
                    <a
                      href={mapsHref(order)}
                      target="_blank"
                      rel="noreferrer"
                      style={mapButton}
                    >
                      📍 Open Maps
                    </a>

                    {order.customerPhone && (
                      <a
                        href={`tel:${order.customerPhone}`}
                        style={secondaryButton}
                      >
                        ☎ Call Customer
                      </a>
                    )}

                    {!cancelled &&
                      !delivered &&
                      normalized(order.paymentStatus) !== 'paid' && (
                        <button
                          type="button"
                          disabled={busy}
                          style={paymentReceivedButton}
                          onClick={() =>
                            void confirmPayment(order)
                          }
                        >
                          {busy
                            ? 'Updating…'
                            : '✓ Payment Received'}
                        </button>
                      )}

                    {!cancelled &&
                      !delivered &&
                      normalized(order.paymentStatus) !== 'paid' &&
                      UPI_ID && (
                        <button
                          type="button"
                          style={upiButton}
                          onClick={() => setShowQrOrder(order)}
                        >
                          ▦ Show UPI QR
                        </button>
                      )}
                  </div>

                  {serviceRequests.length > 0 && (
                    <div style={serviceWorkBox}>
                      <div style={serviceWorkHeading}>
                        RETURN / EXCHANGE WORK
                      </div>

                      {serviceRequests.map((request) => (
                        <div
                          key={`${order.id}-service-${request.index}`}
                          style={serviceWorkCard}
                        >
                          <div style={serviceWorkTop}>
                            <strong>
                              {request.type === 'return'
                                ? '↩ RETURN PICKUP'
                                : '⇄ EXCHANGE'}
                            </strong>

                            <span style={serviceWorkPill}>
                              {(request.pickupStatus || 'assigned')
                                .replace(/_/g, ' ')
                                .toUpperCase()}
                            </span>
                          </div>

                          <div style={serviceProductTitle}>
                            {request.productTitle}
                          </div>

                          <div style={serviceMeta}>
                            Qty {request.quantity} · Reason:{' '}
                            {request.reason || 'No reason provided'}
                          </div>

                          {request.pickupFailureReason && (
                            <div style={serviceFailure}>
                              Previous failure:{' '}
                              {request.pickupFailureReason}
                            </div>
                          )}

                          <div style={serviceInstructions}>
                            {request.type === 'return'
                              ? 'Collect the returned product from the customer. Do not change stock here. Admin will inspect and restore stock after receiving it.'
                              : 'Hand over the same-product replacement and collect the original item from the customer. Then mark the exchange completed.'}
                          </div>

                          <div style={serviceActions}>
                            <a
                              href={mapsHref(order)}
                              target="_blank"
                              rel="noreferrer"
                              style={mapButton}
                            >
                              📍 Open Maps
                            </a>

                            {order.customerPhone && (
                              <a
                                href={`tel:${order.customerPhone}`}
                                style={secondaryButton}
                              >
                                ☎ Call Customer
                              </a>
                            )}

                            {request.pickupStatus !== 'picked_up' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  style={serviceDoneButton}
                                  onClick={() =>
                                    void updateServiceRequest(
                                      order,
                                      request.index,
                                      'picked_up',
                                    )
                                  }
                                >
                                  {busy
                                    ? 'Updating…'
                                    : request.type === 'return'
                                      ? '✓ Picked Up'
                                      : '✓ Exchange Completed'}
                                </button>

                                <button
                                  type="button"
                                  disabled={busy}
                                  style={serviceFailedButton}
                                  onClick={() =>
                                    void updateServiceRequest(
                                      order,
                                      request.index,
                                      'failed',
                                    )
                                  }
                                >
                                  {request.type === 'return'
                                    ? 'Pickup Failed'
                                    : 'Exchange Failed'}
                                </button>
                              </>
                            )}

                            {request.pickupStatus === 'picked_up' && (
                              <span style={serviceWaitingAdmin}>
                                ✓ Rider step complete — waiting for Admin finalization.
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {order.items.length > 0 && (
                    <div style={itemsBox}>
                      <div style={sectionLabel}>PRODUCTS</div>
                      {order.items.map((item, index) => (
                        <div
                          key={`${order.id}-${index}`}
                          style={itemRow}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              style={itemImage}
                            />
                          ) : (
                            <div style={itemImagePlaceholder}>📦</div>
                          )}
                          <div>
                            <div style={itemTitle}>{item.title}</div>
                            <div style={smallMuted}>
                              Qty {item.quantity}
                              {item.size ? ` · Size ${item.size}` : ''}
                              {item.color ? ` · ${item.color}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {order.gifts.length > 0 && (
                    <div style={giftBox}>
                      <div style={sectionLabel}>FREE GIFTS — HAND OVER WITH ORDER</div>
                      {order.gifts.map((gift, index) => (
                        <div
                          key={`${order.id}-gift-${index}`}
                          style={giftRow}
                        >
                          {gift.image ? (
                            <img
                              src={gift.image}
                              alt=""
                              style={giftImage}
                            />
                          ) : (
                            <div style={giftPlaceholder}>🎁</div>
                          )}
                          <strong>{gift.title}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {(order.returnStatus || order.exchangeStatus) && (
                    <div style={serviceBox}>
                      {order.returnStatus && (
                        <div>
                          <strong>Return</strong>
                          <span>{order.returnStatus}</span>
                        </div>
                      )}
                      {order.exchangeStatus && (
                        <div>
                          <strong>Exchange</strong>
                          <span>{order.exchangeStatus}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={orderFooter}>
                    <span style={statusBadge}>
                      {(status || 'assigned')
                        .replace(/_/g, ' ')
                        .toUpperCase()}
                    </span>

                    <div style={footerActions}>
                      {!cancelled &&
                        !delivered &&
                        !waiting &&
                        !out &&
                        !failed && (
                          <button
                            type="button"
                            disabled={busy}
                            style={primaryButton}
                            onClick={() =>
                              void markOutForDelivery(order)
                            }
                          >
                            {busy
                              ? 'Updating…'
                              : 'Start Delivery'}
                          </button>
                        )}

                      {out && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            style={deliveredButton}
                            onClick={() =>
                              void markDelivered(order)
                            }
                          >
                            {busy ? 'Updating…' : '✓ Delivered'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            style={notDeliveredButton}
                            onClick={() => {
                              setFailureReason(FAILURE_REASONS[0]);
                              setFailureOrder(order);
                            }}
                          >
                            Not Delivered
                          </button>
                        </>
                      )}

                      {waiting && (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            normalized(order.paymentStatus) !== 'paid'
                          }
                          style={{
                            ...deliveredButton,
                            opacity:
                              busy ||
                              normalized(order.paymentStatus) !== 'paid'
                                ? 0.5
                                : 1,
                          }}
                          onClick={() =>
                            void markDelivered(order)
                          }
                        >
                          {busy
                            ? 'Updating…'
                            : 'Complete Delivery'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {showQrOrder && (
        <div
          style={modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowQrOrder(null);
            }
          }}
        >
          <div style={modalCard}>
            <button
              type="button"
              style={modalClose}
              onClick={() => setShowQrOrder(null)}
            >
              ×
            </button>
            <div style={qrTitle}>Customer UPI Payment</div>
            <div style={qrAmount}>
              ₹{Math.round(showQrOrder.total).toLocaleString('en-IN')}
            </div>
            <div style={qrOrder}>{showQrOrder.orderNumber}</div>
            <img
              src={qrHref(showQrOrder)}
              alt="UPI payment QR"
              style={qrImage}
            />
            <div style={qrUpi}>{UPI_ID}</div>
            <a href={upiHref(showQrOrder)} style={primaryButton}>
              Open UPI App
            </a>

            <button
              type="button"
              disabled={busyId === showQrOrder.id}
              style={paymentReceivedLargeButton}
              onClick={() =>
                void confirmPayment(showQrOrder)
              }
            >
              {busyId === showQrOrder.id
                ? 'Updating…'
                : '✓ Payment Received'}
            </button>

            <p style={qrNote}>
              After confirming the payment in the UPI/bank app, tap
              Payment Received. The QR will then close and the order
              will show PAID.
            </p>
          </div>
        </div>
      )}

      {failureOrder && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <button
              type="button"
              style={modalClose}
              onClick={() => setFailureOrder(null)}
            >
              ×
            </button>
            <div style={qrTitle}>Why was it not delivered?</div>
            <div style={qrOrder}>{failureOrder.orderNumber}</div>
            <select
              value={failureReason}
              onChange={(event) =>
                setFailureReason(event.target.value)
              }
              style={reasonSelect}
            >
              {FAILURE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyId === failureOrder.id}
              style={notDeliveredButtonLarge}
              onClick={() => void markNotDelivered()}
            >
              {busyId === failureOrder.id
                ? 'Updating…'
                : 'Confirm Not Delivered'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

const loadingPage: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#f5f6f7',
  color: '#475467',
};
const page: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f5f6f7',
};
const header: React.CSSProperties = {
  minHeight: 66,
  padding: '0 22px',
  background: '#111',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const brand: React.CSSProperties = {
  fontSize: 21,
  fontWeight: 900,
  lineHeight: 1,
};
const brandRole: React.CSSProperties = {
  marginTop: 4,
  color: '#f5a623',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1.3,
};
const headerRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 13,
};
const headerVehicle: React.CSSProperties = {
  marginTop: 2,
  color: '#aaa',
  fontSize: 10,
};
const logoutButton: React.CSSProperties = {
  border: '1px solid #444',
  background: '#222',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 13px',
  cursor: 'pointer',
};
const content: React.CSSProperties = {
  width: '100%',
  maxWidth: 820,
  margin: '0 auto',
  padding: '22px 16px 60px',
  boxSizing: 'border-box',
};
const intro: React.CSSProperties = { marginBottom: 14 };
const title: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  color: '#111',
};
const subtitle: React.CSSProperties = {
  margin: '5px 0 0',
  color: '#667085',
  fontSize: 13,
};
const messageBox: React.CSSProperties = {
  padding: 12,
  marginBottom: 14,
  border: '1px solid #fedf89',
  background: '#fffaeb',
  color: '#93370d',
  borderRadius: 10,
  fontSize: 13,
};
const stats: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
  marginBottom: 18,
};
const statCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7ec',
  borderRadius: 10,
  padding: 12,
};
const statLabel: React.CSSProperties = {
  color: '#667085',
  fontSize: 11,
};
const statValue: React.CSSProperties = {
  marginTop: 3,
  fontSize: 21,
  fontWeight: 800,
  color: '#111',
};
const emptyCard: React.CSSProperties = {
  minHeight: 180,
  border: '1px solid #e4e7ec',
  borderRadius: 14,
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 24,
  color: '#667085',
};
const emptyIcon: React.CSSProperties = {
  fontSize: 32,
  marginBottom: 10,
};
const emptyTitle: React.CSSProperties = {
  margin: 0,
  color: '#111',
  fontSize: 17,
};
const emptyText: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 13,
};
const orderList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const orderCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7ec',
  borderRadius: 14,
  overflow: 'hidden',
};
const cancelledCard: React.CSSProperties = {
  border: '2px solid #f04438',
};
const dangerBanner: React.CSSProperties = {
  padding: '10px 14px',
  background: '#fee4e2',
  color: '#b42318',
  fontSize: 12,
  fontWeight: 900,
  textAlign: 'center',
};
const waitingBanner: React.CSSProperties = {
  padding: '10px 14px',
  background: '#fff4e5',
  color: '#9a6100',
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'center',
};
const failedBanner: React.CSSProperties = {
  padding: '10px 14px',
  background: '#fef3f2',
  color: '#b42318',
  fontSize: 12,
  fontWeight: 800,
  textAlign: 'center',
};
const orderTop: React.CSSProperties = {
  padding: 15,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 15,
  borderBottom: '1px solid #eaecf0',
};
const orderNumber: React.CSSProperties = {
  fontWeight: 800,
  color: '#111',
};
const amount: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};
const collectBox: React.CSSProperties = {
  margin: 14,
  padding: 14,
  borderRadius: 12,
  background: '#101828',
  color: '#fff',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};
const collectLabel: React.CSSProperties = {
  display: 'block',
  color: '#d0d5dd',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1,
};
const collectAmount: React.CSSProperties = {
  display: 'block',
  marginTop: 3,
  fontSize: 25,
};
const paymentPill: React.CSSProperties = {
  padding: '6px 9px',
  borderRadius: 999,
  background: '#344054',
  fontSize: 10,
  fontWeight: 700,
};
const deliverySlotBox: React.CSSProperties = {
  margin: '0 14px 14px',
  padding: 12,
  border: '1px solid #d1ead8',
  borderRadius: 10,
  background: '#f3fbf5',
  display: 'grid',
  gap: 3,
  color: '#175c34',
  fontSize: 12,
};
const orderGrid: React.CSSProperties = {
  padding: '0 15px 15px',
  display: 'grid',
  gridTemplateColumns: '1fr 2fr',
  gap: 16,
};
const fieldLabel: React.CSSProperties = {
  color: '#98a2b3',
  fontSize: 10,
  marginBottom: 4,
};
const fieldValue: React.CSSProperties = {
  color: '#101828',
  fontSize: 13,
  lineHeight: 1.4,
};
const detailMuted: React.CSSProperties = {
  marginTop: 4,
  color: '#667085',
  fontSize: 11,
};
const phoneLink: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 3,
  color: '#175cd3',
  fontSize: 12,
  textDecoration: 'none',
};
const quickActions: React.CSSProperties = {
  padding: '0 15px 15px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};
const mapButton: React.CSSProperties = {
  display: 'inline-flex',
  minHeight: 40,
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 9,
  background: '#175cd3',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
};
const secondaryButton: React.CSSProperties = {
  ...mapButton,
  background: '#fff',
  color: '#101828',
  border: '1px solid #d0d5dd',
};
const upiButton: React.CSSProperties = {
  ...mapButton,
  border: 0,
  background: '#7f56d9',
  cursor: 'pointer',
};
const paymentReceivedButton: React.CSSProperties = {
  ...mapButton,
  border: 0,
  background: '#178746',
  cursor: 'pointer',
};
const itemsBox: React.CSSProperties = {
  padding: '0 15px 15px',
  display: 'grid',
  gap: 8,
};
const sectionLabel: React.CSSProperties = {
  color: '#667085',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0.7,
};
const itemRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 10,
  borderRadius: 9,
  background: '#f9fafb',
};
const itemImage: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 7,
  objectFit: 'cover',
};
const itemImagePlaceholder: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 7,
  background: '#eee',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const itemTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: '#101828',
};
const smallMuted: React.CSSProperties = {
  marginTop: 2,
  color: '#98a2b3',
  fontSize: 10,
};
const giftBox: React.CSSProperties = {
  margin: '0 15px 15px',
  padding: 12,
  border: '1px solid #cce7d4',
  borderRadius: 10,
  background: '#f6fcf8',
  display: 'grid',
  gap: 8,
};
const giftRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
};
const giftImage: React.CSSProperties = {
  width: 42,
  height: 42,
  objectFit: 'cover',
  borderRadius: 7,
};
const giftPlaceholder: React.CSSProperties = {
  width: 42,
  height: 42,
  display: 'grid',
  placeItems: 'center',
  background: '#eaf7ee',
  borderRadius: 7,
};
const serviceWorkBox: React.CSSProperties = {
  margin: '0 15px 15px',
  padding: 12,
  border: '2px solid #f2c46d',
  borderRadius: 12,
  background: '#fff9ed',
  display: 'grid',
  gap: 10,
};

const serviceWorkHeading: React.CSSProperties = {
  color: '#8a4b00',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0.8,
};

const serviceWorkCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: '1px solid #efd9ae',
  background: '#fff',
  display: 'grid',
  gap: 8,
};

const serviceWorkTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  color: '#8a4b00',
  fontSize: 12,
};

const serviceWorkPill: React.CSSProperties = {
  padding: '4px 7px',
  borderRadius: 999,
  background: '#fff0cf',
  color: '#8a4b00',
  fontSize: 9,
  fontWeight: 900,
};

const serviceProductTitle: React.CSSProperties = {
  color: '#101828',
  fontSize: 13,
  fontWeight: 800,
};

const serviceMeta: React.CSSProperties = {
  color: '#667085',
  fontSize: 11,
};

const serviceInstructions: React.CSSProperties = {
  padding: 9,
  borderRadius: 8,
  background: '#f8fafc',
  color: '#475467',
  fontSize: 10,
  lineHeight: 1.45,
};

const serviceFailure: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: '#fff1f0',
  color: '#b42318',
  fontSize: 10,
  fontWeight: 700,
};

const serviceActions: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
};

const serviceDoneButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 15px',
  border: 0,
  borderRadius: 9,
  background: '#178746',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const serviceFailedButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 15px',
  borderRadius: 9,
  background: '#fff',
  color: '#b42318',
  border: '1px solid #f3b7b2',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const serviceWaitingAdmin: React.CSSProperties = {
  color: '#166534',
  fontSize: 11,
  fontWeight: 800,
};

const serviceBox: React.CSSProperties = {
  margin: '0 15px 15px',
  padding: 12,
  border: '1px solid #f0d5a8',
  borderRadius: 10,
  background: '#fffaf0',
  display: 'grid',
  gap: 8,
};
const orderFooter: React.CSSProperties = {
  padding: 12,
  borderTop: '1px solid #eaecf0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
};
const statusBadge: React.CSSProperties = {
  background: '#eff8ff',
  color: '#175cd3',
  borderRadius: 20,
  padding: '6px 9px',
  fontSize: 10,
  fontWeight: 750,
};
const footerActions: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};
const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 15px',
  border: 0,
  borderRadius: 9,
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};
const paymentReceivedLargeButton: React.CSSProperties = {
  ...primaryButton,
  width: '100%',
  marginTop: 10,
  background: '#178746',
};
const deliveredButton: React.CSSProperties = {
  ...primaryButton,
  background: '#178746',
};
const notDeliveredButton: React.CSSProperties = {
  ...primaryButton,
  background: '#fff',
  color: '#b42318',
  border: '1px solid #f3b7b2',
};
const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  padding: 20,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(16,24,40,.6)',
};
const modalCard: React.CSSProperties = {
  width: 'min(390px, 100%)',
  position: 'relative',
  padding: 22,
  borderRadius: 18,
  background: '#fff',
  boxShadow: '0 24px 70px rgba(0,0,0,.25)',
  textAlign: 'center',
};
const modalClose: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  top: 10,
  width: 34,
  height: 34,
  border: '1px solid #ddd',
  borderRadius: 9,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 20,
};
const qrTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: '#101828',
};
const qrAmount: React.CSSProperties = {
  marginTop: 8,
  fontSize: 32,
  fontWeight: 900,
  color: '#101828',
};
const qrOrder: React.CSSProperties = {
  marginTop: 3,
  color: '#667085',
  fontSize: 11,
};
const qrImage: React.CSSProperties = {
  width: 260,
  maxWidth: '100%',
  margin: '18px auto 10px',
  display: 'block',
};
const qrUpi: React.CSSProperties = {
  marginBottom: 14,
  color: '#475467',
  fontSize: 12,
};
const qrNote: React.CSSProperties = {
  margin: '14px 0 0',
  color: '#667085',
  fontSize: 10,
  lineHeight: 1.5,
};
const reasonSelect: React.CSSProperties = {
  width: '100%',
  margin: '20px 0 12px',
  padding: 12,
  border: '1px solid #d0d5dd',
  borderRadius: 10,
  background: '#fff',
};
const notDeliveredButtonLarge: React.CSSProperties = {
  ...primaryButton,
  width: '100%',
  background: '#b42318',
};
