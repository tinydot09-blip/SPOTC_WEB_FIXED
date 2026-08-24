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
  where,
} from 'firebase/firestore';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

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

type DeliveryOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  total: number;
  paymentMethod: string;
  status: string;
  deliveryStatus: string;
  assignedDeliveryBoyId: string;
  assignedDeliveryBoyName: string;
  items: Array<{
    title: string;
    quantity: number;
    image?: string;
  }>;
};

function text(
  value: unknown,
): string {
  return typeof value === 'string'
    ? value
    : '';
}

function numberValue(
  value: unknown,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function readItems(
  value: unknown,
): DeliveryOrder['items'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    (item) => {
      const data =
        item &&
        typeof item === 'object'
          ? (item as Record<
              string,
              unknown
            >)
          : {};

      return {
        title:
          text(data.title) ||
          text(data.name) ||
          'Product',

        quantity:
          Math.max(
            1,
            numberValue(
              data.quantity ??
                data.qty,
            ),
          ),

        image:
          text(data.image) ||
          text(data.image_url) ||
          text(
            data.product_image,
          ),
      };
    },
  );
}

function mapOrder(
  id: string,
  raw: Record<
    string,
    unknown
  >,
): DeliveryOrder {
  const addressValue =
    raw.delivery_address ??
    raw.address ??
    raw.formatted_address;

  let address = '';

  if (
    typeof addressValue ===
    'string'
  ) {
    address =
      addressValue;
  } else if (
    addressValue &&
    typeof addressValue ===
      'object'
  ) {
    const addressObject =
      addressValue as Record<
        string,
        unknown
      >;

    address = [
      text(
        addressObject.house_no,
      ),
      text(
        addressObject.street,
      ),
      text(
        addressObject.area,
      ),
      text(
        addressObject.city,
      ),
      text(
        addressObject.pincode,
      ),
    ]
      .filter(Boolean)
      .join(', ');
  }

  return {
    id,

    orderNumber:
      text(
        raw.order_number,
      ) ||
      text(
        raw.orderNumber,
      ) ||
      id,

    customerName:
      text(
        raw.customer_name,
      ) ||
      text(
        raw.customerName,
      ) ||
      text(
        raw.user_name,
      ) ||
      'Customer',

    customerPhone:
      text(
        raw.customer_phone,
      ) ||
      text(
        raw.customerPhone,
      ) ||
      text(
        raw.phone,
      ),

    address:
      address ||
      'Delivery address not available',

    total:
      numberValue(
        raw.total ??
          raw.total_amount ??
          raw.grand_total,
      ),

    paymentMethod:
      text(
        raw.payment_method,
      ) ||
      text(
        raw.paymentMethod,
      ) ||
      'COD',

    status:
      text(
        raw.order_status,
      ) ||
      text(
        raw.status,
      ),

    deliveryStatus:
      text(
        raw.delivery_status,
      ),

    assignedDeliveryBoyId:
      text(
        raw.delivery_boy_id,
      ) ||
      text(
        raw.assigned_delivery_boy_id,
      ) ||
      text(
        raw.deliveryBoyId,
      ),

    assignedDeliveryBoyName:
      text(
        raw.delivery_boy_name,
      ) ||
      text(
        raw.assigned_delivery_boy_name,
      ),

    items:
      readItems(
        raw.items,
      ),
  };
}

function normalizedStatus(
  order: DeliveryOrder,
): string {
  return (
    order.deliveryStatus ||
    order.status ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /[\s-]+/g,
      '_',
    );
}

export default function DeliveryDashboardPage() {
  const router =
    useRouter();

  const [
    checking,
    setChecking,
  ] =
    useState(true);

  const [
    rider,
    setRider,
  ] =
    useState<DeliveryBoy | null>(
      null,
    );

  const [
    orders,
    setOrders,
  ] =
    useState<
      DeliveryOrder[]
    >([]);

  const [
    loadingOrders,
    setLoadingOrders,
  ] =
    useState(true);

  const [
    message,
    setMessage,
  ] =
    useState('');

  useEffect(() => {
    let stopOrders:
      | (() => void)
      | null = null;

    const stopAuth =
      onAuthStateChanged(
        deliveryAuth,
        async (
          user: User | null,
        ) => {
          if (stopOrders) {
            stopOrders();
            stopOrders =
              null;
          }

          if (!user) {
            setRider(null);
            setChecking(false);

            router.replace(
              '/delivery/login',
            );

            return;
          }

          try {
            const riderSnap =
              await getDoc(
                doc(
                  deliveryDb,
                  'DeliveryBoys',
                  user.uid,
                ),
              );

            if (
              !riderSnap.exists()
            ) {
              await logoutAndRedirect();
              return;
            }

            const data =
              riderSnap.data();

            if (
              data.role !==
                'delivery_boy' ||
              data.is_active ===
                false
            ) {
              await logoutAndRedirect();
              return;
            }

            const riderData: DeliveryBoy =
              {
                uid:
                  user.uid,

                name:
                  text(
                    data.name,
                  ) ||
                  'Delivery Boy',

                phone:
                  text(
                    data.phone,
                  ),

                vehicle_number:
                  text(
                    data.vehicle_number,
                  ),

                role:
                  text(
                    data.role,
                  ),

                is_active:
                  data.is_active !==
                  false,
              };

            setRider(
              riderData,
            );

            setChecking(
              false,
            );

            setLoadingOrders(
              true,
            );

            /*
             * Orders assigned by Admin should contain:
             *
             * delivery_boy_id: rider UID
             *
             * We listen only to orders assigned
             * to this logged-in delivery boy.
             */
            const ordersQuery =
              query(
                collection(
                  deliveryDb,
                  'Orders',
                ),
                where(
                  'delivery_boy_id',
                  '==',
                  user.uid,
                ),
              );

            stopOrders =
              onSnapshot(
                ordersQuery,

                (
                  snapshot,
                ) => {
                  const next =
                    snapshot.docs.map(
                      (
                        orderDoc,
                      ) =>
                        mapOrder(
                          orderDoc.id,
                          orderDoc.data(),
                        ),
                    );

                  setOrders(
                    next,
                  );

                  setLoadingOrders(
                    false,
                  );
                },

                (
                  error,
                ) => {
                  console.error(
                    'Delivery orders listener failed:',
                    error,
                  );

                  setMessage(
                    'Could not load assigned orders.',
                  );

                  setLoadingOrders(
                    false,
                  );
                },
              );
          } catch (error) {
            console.error(
              'Delivery dashboard access check failed:',
              error,
            );

            await logoutAndRedirect();
          }
        },
      );

    async function logoutAndRedirect() {
      localStorage.removeItem(
        'spotc-delivery-uid',
      );

      localStorage.removeItem(
        'spotc-delivery-name',
      );

      localStorage.removeItem(
        'spotc-delivery-phone',
      );

      try {
        await signOut(
          deliveryAuth,
        );
      } catch (
        error
      ) {
        console.error(
          'Delivery sign out failed:',
          error,
        );
      }

      setRider(null);
      setChecking(false);

      window.location.replace(
        '/delivery/login',
      );
    }

    return () => {
      stopAuth();

      if (stopOrders) {
        stopOrders();
      }
    };
  }, [router]);

  const counts =
    useMemo(() => {
      let active = 0;
      let waiting = 0;
      let notDelivered =
        0;

      orders.forEach(
        (order) => {
          const status =
            normalizedStatus(
              order,
            );

          if (
            status ===
              'delivered_waiting_approval' ||
            status ===
              'waiting_approval' ||
            status ===
              'delivery_completed'
          ) {
            waiting += 1;
            return;
          }

          if (
            status ===
              'not_delivered' ||
            status ===
              'delivery_failed' ||
            status ===
              'cancelled' ||
            status ===
              'canceled'
          ) {
            notDelivered +=
              1;

            return;
          }

          if (
            status !==
              'delivered' &&
            status !==
              'completed'
          ) {
            active += 1;
          }
        },
      );

      return {
        active,
        waiting,
        notDelivered,
      };
    }, [orders]);

  async function handleLogout() {
    setMessage('');

    localStorage.removeItem(
      'spotc-delivery-uid',
    );

    localStorage.removeItem(
      'spotc-delivery-name',
    );

    localStorage.removeItem(
      'spotc-delivery-phone',
    );

    try {
      await signOut(
        deliveryAuth,
      );
    } catch (error) {
      console.error(
        'Delivery logout failed:',
        error,
      );
    }

    window.location.replace(
      '/delivery/login',
    );
  }

  if (checking) {
    return (
      <main style={loadingPage}>
        Checking delivery
        account…
      </main>
    );
  }

  if (!rider) {
    return (
      <main style={loadingPage}>
        Redirecting to
        delivery login…
      </main>
    );
  }

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={brand}>
            SPOTC
          </div>

          <div style={brandRole}>
            DELIVERY
          </div>
        </div>

        <div style={headerRight}>
          <strong>
            {rider.name}
          </strong>

          <button
            type="button"
            style={logoutButton}
            onClick={() =>
              void handleLogout()
            }
          >
            Logout
          </button>
        </div>
      </header>

      <div style={content}>
        <section style={intro}>
          <h1 style={title}>
            My Deliveries
          </h1>

          <p style={subtitle}>
            Orders assigned to
            you by SPOTC Admin.
          </p>
        </section>

        {message && (
          <div style={messageBox}>
            {message}
          </div>
        )}

        <section style={stats}>
          <StatCard
            label="Active"
            value={
              counts.active
            }
          />

          <StatCard
            label="Waiting Approval"
            value={
              counts.waiting
            }
          />

          <StatCard
            label="Not Delivered"
            value={
              counts.notDelivered
            }
          />
        </section>

        {loadingOrders ? (
          <section style={emptyCard}>
            Loading assigned
            orders…
          </section>
        ) : orders.length ===
          0 ? (
          <section style={emptyCard}>
            <div style={emptyIcon}>
              📦
            </div>

            <h2 style={emptyTitle}>
              No deliveries
              assigned
            </h2>

            <p style={emptyText}>
              New assigned
              orders will appear
              here automatically.
            </p>
          </section>
        ) : (
          <section style={orderList}>
            {orders.map(
              (order) => (
                <OrderCard
                  key={
                    order.id
                  }
                  order={
                    order
                  }
                />
              ),
            )}
          </section>
        )}
      </div>
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
      <div style={statLabel}>
        {label}
      </div>

      <div style={statValue}>
        {value}
      </div>
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: DeliveryOrder;
}) {
  const status =
    normalizedStatus(
      order,
    );

  return (
    <article style={orderCard}>
      <div style={orderTop}>
        <div>
          <div style={orderNumber}>
            {order.orderNumber}
          </div>

          <div style={smallMuted}>
            {order.items.length}{' '}
            item(s)
          </div>
        </div>

        <div style={amount}>
          ₹
          {Math.round(
            order.total,
          )}
        </div>
      </div>

      <div style={orderGrid}>
        <div>
          <div style={fieldLabel}>
            Customer
          </div>

          <div style={fieldValue}>
            {order.customerName}
          </div>

          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              style={phoneLink}
            >
              {
                order.customerPhone
              }
            </a>
          )}
        </div>

        <div>
          <div style={fieldLabel}>
            Payment
          </div>

          <div style={fieldValue}>
            {
              order.paymentMethod
            }
          </div>
        </div>

        <div>
          <div style={fieldLabel}>
            Delivery Address
          </div>

          <div style={fieldValue}>
            {order.address}
          </div>
        </div>
      </div>

      {order.items.length >
        0 && (
        <div style={itemsBox}>
          {order.items.map(
            (
              item,
              index,
            ) => (
              <div
                key={`${order.id}-${index}`}
                style={itemRow}
              >
                {item.image ? (
                  <img
                    src={
                      item.image
                    }
                    alt=""
                    style={
                      itemImage
                    }
                  />
                ) : (
                  <div
                    style={
                      itemImagePlaceholder
                    }
                  >
                    📦
                  </div>
                )}

                <div>
                  <div
                    style={
                      itemTitle
                    }
                  >
                    {
                      item.title
                    }
                  </div>

                  <div
                    style={
                      smallMuted
                    }
                  >
                    Qty{' '}
                    {
                      item.quantity
                    }
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div style={orderFooter}>
        <span style={statusBadge}>
          {status
            .replace(
              /_/g,
              ' ',
            )
            .toUpperCase() ||
            'ASSIGNED'}
        </span>

        {order.customerPhone && (
          <a
            href={`tel:${order.customerPhone}`}
            style={callButton}
          >
            Call Customer
          </a>
        )}
      </div>
    </article>
  );
}

const loadingPage:
  React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent:
    'center',
  alignItems: 'center',
  background: '#f5f6f7',
  color: '#475467',
};

const page:
  React.CSSProperties = {
  minHeight: '100vh',
  background: '#f5f6f7',
};

const header:
  React.CSSProperties = {
  minHeight: 66,
  padding: '0 22px',
  background: '#111',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    'space-between',
};

const brand:
  React.CSSProperties = {
  fontSize: 21,
  fontWeight: 900,
  lineHeight: 1,
};

const brandRole:
  React.CSSProperties = {
  marginTop: 4,
  color: '#f5a623',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1.3,
};

const headerRight:
  React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 13,
};

const logoutButton:
  React.CSSProperties = {
  border:
    '1px solid #444',
  background: '#222',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 13px',
  cursor: 'pointer',
};

const content:
  React.CSSProperties = {
  width: '100%',
  maxWidth: 760,
  margin: '0 auto',
  padding: '22px 16px 60px',
  boxSizing:
    'border-box',
};

const intro:
  React.CSSProperties = {
  marginBottom: 14,
};

const title:
  React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  color: '#111',
};

const subtitle:
  React.CSSProperties = {
  margin: '5px 0 0',
  color: '#667085',
  fontSize: 13,
};

const messageBox:
  React.CSSProperties = {
  padding: 12,
  marginBottom: 14,
  border:
    '1px solid #fedf89',
  background: '#fffaeb',
  color: '#93370d',
  borderRadius: 10,
  fontSize: 13,
};

const stats:
  React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(3, minmax(0, 1fr))',
  gap: 10,
  marginBottom: 18,
};

const statCard:
  React.CSSProperties = {
  background: '#fff',
  border:
    '1px solid #e4e7ec',
  borderRadius: 10,
  padding: 12,
};

const statLabel:
  React.CSSProperties = {
  color: '#667085',
  fontSize: 11,
};

const statValue:
  React.CSSProperties = {
  marginTop: 3,
  fontSize: 21,
  fontWeight: 800,
  color: '#111',
};

const emptyCard:
  React.CSSProperties = {
  minHeight: 180,
  border:
    '1px solid #e4e7ec',
  borderRadius: 14,
  background: '#fff',
  display: 'flex',
  flexDirection:
    'column',
  alignItems: 'center',
  justifyContent:
    'center',
  textAlign: 'center',
  padding: 24,
  color: '#667085',
};

const emptyIcon:
  React.CSSProperties = {
  fontSize: 32,
  marginBottom: 10,
};

const emptyTitle:
  React.CSSProperties = {
  margin: 0,
  color: '#111',
  fontSize: 17,
};

const emptyText:
  React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 13,
};

const orderList:
  React.CSSProperties = {
  display: 'flex',
  flexDirection:
    'column',
  gap: 14,
};

const orderCard:
  React.CSSProperties = {
  background: '#fff',
  border:
    '1px solid #e4e7ec',
  borderRadius: 14,
  overflow: 'hidden',
};

const orderTop:
  React.CSSProperties = {
  padding: 15,
  display: 'flex',
  justifyContent:
    'space-between',
  gap: 15,
  borderBottom:
    '1px solid #eaecf0',
};

const orderNumber:
  React.CSSProperties = {
  fontWeight: 800,
  color: '#111',
};

const amount:
  React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
};

const orderGrid:
  React.CSSProperties = {
  padding: 15,
  display: 'grid',
  gridTemplateColumns:
    '1fr 0.7fr 1.5fr',
  gap: 16,
};

const fieldLabel:
  React.CSSProperties = {
  color: '#98a2b3',
  fontSize: 10,
  marginBottom: 4,
};

const fieldValue:
  React.CSSProperties = {
  color: '#101828',
  fontSize: 13,
  lineHeight: 1.4,
};

const phoneLink:
  React.CSSProperties = {
  display: 'inline-block',
  marginTop: 3,
  color: '#175cd3',
  fontSize: 12,
  textDecoration: 'none',
};

const itemsBox:
  React.CSSProperties = {
  padding: '0 15px 15px',
};

const itemRow:
  React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 10,
  borderRadius: 9,
  background: '#f9fafb',
};

const itemImage:
  React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 7,
  objectFit: 'cover',
};

const itemImagePlaceholder:
  React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 7,
  background: '#eee',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    'center',
};

const itemTitle:
  React.CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: '#101828',
};

const smallMuted:
  React.CSSProperties = {
  marginTop: 2,
  color: '#98a2b3',
  fontSize: 10,
};

const orderFooter:
  React.CSSProperties = {
  padding: 12,
  borderTop:
    '1px solid #eaecf0',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    'space-between',
  gap: 10,
};

const statusBadge:
  React.CSSProperties = {
  background: '#eff8ff',
  color: '#175cd3',
  borderRadius: 20,
  padding: '6px 9px',
  fontSize: 10,
  fontWeight: 750,
};

const callButton:
  React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent:
    'center',
  minHeight: 38,
  padding: '0 14px',
  borderRadius: 8,
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
};