'use client';

import Link from 'next/link';
import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/lib/firebase';

type ProductRow = {
  id: string;
  data: DocumentData;
};

type OrderRow = {
  id: string;
  data: DocumentData;
};

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stockOf(data: DocumentData): number {
  return Math.max(
    0,
    numberOf(
      data.available_qty ??
        data.stock_qty ??
        data.stock_quantity ??
        0,
    ),
  );
}

function soldOf(data: DocumentData): number {
  return Math.max(0, numberOf(data.sold_qty ?? 0));
}

function productTitle(data: DocumentData): string {
  return String(
    data.title ||
      data.product_name ||
      'Product',
  ).trim();
}

function productImage(data: DocumentData): string {
  const images = Array.isArray(data.images)
    ? data.images
    : [];

  return String(
    images[0] ||
      data.image_url ||
      data.image ||
      data.product_image_url ||
      data.thumbnail_url ||
      data.studio_image_url ||
      '',
  ).trim();
}

function sellingPrice(data: DocumentData): number {
  const offer = numberOf(data.offer_price);

  const normal = numberOf(
    data.selling_price ??
      data.price ??
      data.mrp ??
      0,
  );

  if (
    offer > 0 &&
    (normal <= 0 || offer < normal)
  ) {
    return offer;
  }

  return normal;
}

function orderTotal(data: DocumentData): number {
  return numberOf(
    data.total ??
      data.grand_total ??
      data.order_total ??
      0,
  );
}

function timestampMillis(value: unknown): number {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown })
      .toMillis === 'function'
  ) {
    return (
      value as { toMillis: () => number }
    ).toMillis();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function orderCreatedMillis(
  data: DocumentData,
): number {
  return timestampMillis(
    data.created_at ??
      data.createdAt ??
      data.order_date ??
      data.timestamp,
  );
}

function isToday(milliseconds: number): boolean {
  if (!milliseconds) return false;

  const date = new Date(milliseconds);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function orderNumber(
  id: string,
  data: DocumentData,
): string {
  return String(
    data.order_number ||
      data.orderNumber ||
      id,
  );
}

function customerName(data: DocumentData): string {
  return String(
    data.customer_name ||
      data.user_name ||
      data.display_name ||
      data.customerName ||
      'Customer',
  );
}

function orderStatus(data: DocumentData): string {
  return String(
    data.order_status ||
      data.status ||
      'Placed',
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(milliseconds: number): string {
  if (!milliseconds) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(milliseconds));
}

export default function AdminHomePage() {
  const [products, setProducts] = useState<
    ProductRow[]
  >([]);

  const [orders, setOrders] = useState<
    OrderRow[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  async function loadDashboard() {
    if (!db) {
      setError('Firebase is not available.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let productSnapshot;

      try {
        productSnapshot = await getDocs(
          query(
            collection(
              db,
              'BusinessProducts',
            ),
            orderBy(
              'created_at',
              'desc',
            ),
          ),
        );
      } catch {
        productSnapshot =
          await getDocs(
            collection(
              db,
              'BusinessProducts',
            ),
          );
      }

      const productRows =
        productSnapshot.docs
          .map((item) => ({
            id: item.id,
            data: item.data(),
          }))
          .filter(
            ({ data }) =>
              data.isDeleted !== true,
          );

      setProducts(productRows);

      try {
        let orderSnapshot;

        try {
          orderSnapshot = await getDocs(
            query(
              collection(db, 'Orders'),
              orderBy(
                'created_at',
                'desc',
              ),
            ),
          );
        } catch {
          orderSnapshot =
            await getDocs(
              collection(db, 'Orders'),
            );
        }

        setOrders(
          orderSnapshot.docs.map(
            (item) => ({
              id: item.id,
              data: item.data(),
            }),
          ),
        );
      } catch (orderError) {
        console.error(
          'Orders dashboard load failed:',
          orderError,
        );

        setOrders([]);
      }
    } catch (loadError) {
      console.error(
        'Admin dashboard load failed:',
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const dashboard = useMemo(() => {
    const totalProducts =
      products.length;

    const inStock =
      products.filter(
        ({ data }) =>
          stockOf(data) > 2,
      ).length;

    const lowStock =
      products.filter(
        ({ data }) => {
          const stock =
            stockOf(data);

          return (
            stock > 0 &&
            stock <= 2
          );
        },
      ).length;

    const outOfStock =
      products.filter(
        ({ data }) =>
          stockOf(data) <= 0,
      ).length;

    const totalUnitsSold =
      products.reduce(
        (sum, { data }) =>
          sum + soldOf(data),
        0,
      );

    const soldProducts =
      products
        .filter(
          ({ data }) =>
            soldOf(data) > 0,
        )
        .sort(
          (a, b) =>
            soldOf(b.data) -
            soldOf(a.data),
        );

    const totalSales =
      orders.reduce(
        (sum, { data }) =>
          sum + orderTotal(data),
        0,
      );

    const todayOrders =
      orders.filter(
        ({ data }) =>
          isToday(
            orderCreatedMillis(data),
          ),
      );

    const todaySales =
      todayOrders.reduce(
        (sum, { data }) =>
          sum + orderTotal(data),
        0,
      );

    return {
      totalProducts,
      inStock,
      lowStock,
      outOfStock,
      totalUnitsSold,
      soldProducts,
      totalOrders: orders.length,
      todayOrders:
        todayOrders.length,
      totalSales,
      todaySales,
    };
  }, [products, orders]);

  const recentOrders =
    useMemo(() => {
      return [...orders]
        .sort(
          (a, b) =>
            orderCreatedMillis(
              b.data,
            ) -
            orderCreatedMillis(
              a.data,
            ),
        )
        .slice(0, 6);
    }, [orders]);

  const stockAlerts =
    useMemo(() => {
      return products
        .filter(
          ({ data }) =>
            stockOf(data) <= 2,
        )
        .sort(
          (a, b) =>
            stockOf(a.data) -
            stockOf(b.data),
        )
        .slice(0, 5);
    }, [products]);

  if (loading) {
    return (
      <div style={loadingBox}>
        <div style={spinner} />
        <div>
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <h1 style={heading}>
            Dashboard
          </h1>

          <p style={subheading}>
            SPOTC catalogue,
            inventory, sales and
            operations.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadDashboard()
          }
          style={refreshButton}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={errorBox}>
          {error}
        </div>
      )}

      <section
        style={summaryGrid}
      >
        <StatCard
          title="Total Products"
          value={
            dashboard.totalProducts
          }
          subtitle="Catalogue"
          href="/admin/products"
        />

        <StatCard
          title="In Stock"
          value={dashboard.inStock}
          subtitle="More than 2 units"
          href="/admin/products"
        />

        <StatCard
          title="Low Stock"
          value={dashboard.lowStock}
          subtitle="Only 1–2 left"
          href="/admin/products"
          warning={
            dashboard.lowStock > 0
          }
        />

        <StatCard
          title="Out of Stock"
          value={
            dashboard.outOfStock
          }
          subtitle="Needs restocking"
          href="/admin/products"
          danger={
            dashboard.outOfStock > 0
          }
        />

        <StatCard
          title="Units Sold"
          value={
            dashboard.totalUnitsSold
          }
          subtitle="All products"
          href="/admin/products"
        />

        <StatCard
          title="Total Orders"
          value={
            dashboard.totalOrders
          }
          subtitle="All orders"
          href="/admin/orders"
        />

        <StatCard
          title="Today's Orders"
          value={
            dashboard.todayOrders
          }
          subtitle="Orders today"
          href="/admin/orders"
        />

        <StatCard
          title="Today's Sales"
          value={formatMoney(
            dashboard.todaySales,
          )}
          subtitle="Revenue today"
          href="/admin/orders"
        />

        <StatCard
          title="Total Sales"
          value={formatMoney(
            dashboard.totalSales,
          )}
          subtitle="Order revenue"
          href="/admin/reports"
        />
      </section>

      <div style={twoColumn}>
        <section style={panel}>
          <div style={panelHeader}>
            <div>
              <h2 style={panelTitle}>
                Sold Products
              </h2>

              <p style={panelSubtitle}>
                Products with recorded
                sold quantity.
              </p>
            </div>

            <Link
              href="/admin/products"
              style={viewLink}
            >
              View Products →
            </Link>
          </div>

          {dashboard.soldProducts
            .length === 0 ? (
            <div style={emptyState}>
              No sold products yet.
            </div>
          ) : (
            <div
              style={soldProductGrid}
            >
              {dashboard.soldProducts
                .slice(0, 8)
                .map(
                  ({
                    id,
                    data,
                  }) => {
                    const image =
                      productImage(data);

                    const sold =
                      soldOf(data);

                    const stock =
                      stockOf(data);

                    const price =
                      sellingPrice(data);

                    return (
                      <Link
                        key={id}
                        href="/admin/products"
                        style={
                          soldProductCard
                        }
                      >
                        <div
                          style={
                            productImageWrap
                          }
                        >
                          {image ? (
                            <img
                              src={
                                image
                              }
                              alt=""
                              style={
                                productImg
                              }
                            />
                          ) : (
                            <div
                              style={
                                noImage
                              }
                            >
                              No image
                            </div>
                          )}

                          <span
                            style={
                              soldPill
                            }
                          >
                            {sold} sold
                          </span>
                        </div>

                        <div
                          style={
                            soldProductInfo
                          }
                        >
                          <div
                            style={
                              productName
                            }
                          >
                            {productTitle(
                              data,
                            )}
                          </div>

                          <div
                            style={
                              productDetails
                            }
                          >
                            <span>
                              Stock{' '}
                              <strong>
                                {
                                  stock
                                }
                              </strong>
                            </span>

                            <span>
                              {formatMoney(
                                price,
                              )}
                            </span>
                          </div>

                          <div
                            style={
                              salesValue
                            }
                          >
                            Sold value:{' '}
                            <strong>
                              {formatMoney(
                                sold *
                                  price,
                              )}
                            </strong>
                          </div>
                        </div>
                      </Link>
                    );
                  },
                )}
            </div>
          )}
        </section>

        <section style={panel}>
          <div style={panelHeader}>
            <div>
              <h2 style={panelTitle}>
                Stock Alerts
              </h2>

              <p style={panelSubtitle}>
                Products requiring
                attention.
              </p>
            </div>

            <Link
              href="/admin/products"
              style={viewLink}
            >
              Manage →
            </Link>
          </div>

          {stockAlerts.length ===
          0 ? (
            <div style={emptyState}>
              Stock levels look good.
            </div>
          ) : (
            <div
              style={alertList}
            >
              {stockAlerts.map(
                ({
                  id,
                  data,
                }) => {
                  const image =
                    productImage(data);

                  const stock =
                    stockOf(data);

                  return (
                    <Link
                      key={id}
                      href="/admin/products"
                      style={alertRow}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          style={
                            alertImage
                          }
                        />
                      ) : (
                        <div
                          style={
                            alertPlaceholder
                          }
                        />
                      )}

                      <div
                        style={
                          alertContent
                        }
                      >
                        <div
                          style={
                            alertTitle
                          }
                        >
                          {productTitle(
                            data,
                          )}
                        </div>

                        <div
                          style={
                            alertText
                          }
                        >
                          {stock <= 0
                            ? 'Out of stock'
                            : `Only ${stock} left`}
                        </div>
                      </div>

                      <span
                        style={{
                          ...stockBadge,
                          background:
                            stock <= 0
                              ? '#fee4e2'
                              : '#fff4cc',
                          color:
                            stock <= 0
                              ? '#b42318'
                              : '#8a6100',
                        }}
                      >
                        {stock}
                      </span>
                    </Link>
                  );
                },
              )}
            </div>
          )}
        </section>
      </div>

      <section style={panel}>
        <div style={panelHeader}>
          <div>
            <h2 style={panelTitle}>
              Recent Orders
            </h2>

            <p style={panelSubtitle}>
              Latest customer orders.
            </p>
          </div>

          <Link
            href="/admin/orders"
            style={viewLink}
          >
            View Orders →
          </Link>
        </div>

        {recentOrders.length ===
        0 ? (
          <div style={emptyState}>
            No orders yet.
          </div>
        ) : (
          <div
            style={orderTableWrap}
          >
            <table
              style={orderTable}
            >
              <thead>
                <tr>
                  <th
                    style={
                      tableHead
                    }
                  >
                    Order
                  </th>

                  <th
                    style={
                      tableHead
                    }
                  >
                    Customer
                  </th>

                  <th
                    style={
                      tableHead
                    }
                  >
                    Date
                  </th>

                  <th
                    style={
                      tableHead
                    }
                  >
                    Status
                  </th>

                  <th
                    style={{
                      ...tableHead,
                      textAlign:
                        'right',
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {recentOrders.map(
                  ({
                    id,
                    data,
                  }) => (
                    <tr key={id}>
                      <td
                        style={
                          tableCell
                        }
                      >
                        <Link
                          href="/admin/orders"
                          style={
                            orderLink
                          }
                        >
                          #
                          {orderNumber(
                            id,
                            data,
                          )}
                        </Link>
                      </td>

                      <td
                        style={
                          tableCell
                        }
                      >
                        {customerName(
                          data,
                        )}
                      </td>

                      <td
                        style={
                          tableCell
                        }
                      >
                        {formatDate(
                          orderCreatedMillis(
                            data,
                          ),
                        )}
                      </td>

                      <td
                        style={
                          tableCell
                        }
                      >
                        <span
                          style={
                            statusBadge
                          }
                        >
                          {orderStatus(
                            data,
                          )}
                        </span>
                      </td>

                      <td
                        style={{
                          ...tableCell,
                          textAlign:
                            'right',
                          fontWeight: 700,
                        }}
                      >
                        {formatMoney(
                          orderTotal(
                            data,
                          ),
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div style={quickTitle}>
          Quick Access
        </div>

        <div style={quickGrid}>
          <QuickCard
            title="Products"
            text="Catalogue, stock, media and inventory."
            href="/admin/products"
          />

          <QuickCard
            title="Offers"
            text="Upload offers and link products."
            href="/admin/offers"
          />

          <QuickCard
            title="Orders"
            text="Pick, pack and manage orders."
            href="/admin/orders"
          />

          <QuickCard
            title="Users"
            text="Customers and account information."
            href="/admin/users"
          />

          <QuickCard
            title="Reports"
            text="Sales, stock and operating reports."
            href="/admin/reports"
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  href,
  warning = false,
  danger = false,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  href: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        ...statCard,
        borderColor: danger
          ? '#f3b6b2'
          : warning
            ? '#f1d68b'
            : '#e7e9ed',
      }}
    >
      <div style={statLabel}>
        {title}
      </div>

      <div
        style={{
          ...statValue,
          color: danger
            ? '#b42318'
            : warning
              ? '#946200'
              : '#15171a',
        }}
      >
        {value}
      </div>

      <div style={statSubtitle}>
        {subtitle}
      </div>
    </Link>
  );
}

function QuickCard({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={quickCard}
    >
      <div style={quickCardTitle}>
        {title}
      </div>

      <div style={quickCardText}>
        {text}
      </div>

      <div style={quickArrow}>
        →
      </div>
    </Link>
  );
}

const page: React.CSSProperties = {
  paddingBottom: 40,
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 20,
  marginBottom: 24,
};

const heading: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 30,
  fontWeight: 500,
  color: '#17191c',
};

const subheading: React.CSSProperties = {
  margin: 0,
  color: '#70757d',
  fontSize: 14,
};

const refreshButton: React.CSSProperties = {
  minHeight: 42,
  padding: '0 16px',
  border: '1px solid #dedfe2',
  borderRadius: 11,
  background: '#fff',
  color: '#292b2f',
  fontWeight: 600,
  cursor: 'pointer',
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(170px,1fr))',
  gap: 12,
  marginBottom: 20,
};

const statCard: React.CSSProperties = {
  display: 'block',
  padding: 18,
  minHeight: 126,
  border: '1px solid #e7e9ed',
  borderRadius: 16,
  background: '#fff',
  textDecoration: 'none',
  color: 'inherit',
};

const statLabel: React.CSSProperties = {
  color: '#71767d',
  fontSize: 12,
  fontWeight: 600,
};

const statValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '-0.03em',
};

const statSubtitle: React.CSSProperties = {
  marginTop: 6,
  color: '#92969c',
  fontSize: 11,
};

const twoColumn: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'minmax(0,1.6fr) minmax(300px,.8fr)',
  alignItems: 'start',
  gap: 16,
  marginBottom: 16,
};

const panel: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  marginBottom: 16,
  padding: 20,
  border: '1px solid #e7e9ed',
  borderRadius: 18,
  background: '#fff',
  alignSelf: 'start',
};

const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 14,
  marginBottom: 18,
};

const panelTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: '#1b1d20',
};

const panelSubtitle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#858990',
  fontSize: 12,
};

const viewLink: React.CSSProperties = {
  color: '#b76500',
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const soldProductGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(155px,1fr))',
  gap: 12,
};

const soldProductCard: React.CSSProperties = {
  overflow: 'hidden',
  border: '1px solid #ececef',
  borderRadius: 14,
  background: '#fff',
  textDecoration: 'none',
  color: '#17191c',
};

const productImageWrap: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1 / 1',
  background: '#f4f5f6',
  overflow: 'hidden',
};

const productImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const noImage: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  color: '#aaa',
  fontSize: 11,
};

const soldPill: React.CSSProperties = {
  position: 'absolute',
  left: 8,
  bottom: 8,
  padding: '5px 8px',
  borderRadius: 999,
  background: 'rgba(20,22,25,.88)',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
};

const soldProductInfo: React.CSSProperties = {
  padding: 11,
};

const productName: React.CSSProperties = {
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontSize: 13,
  fontWeight: 700,
};

const productDetails: React.CSSProperties = {
  marginTop: 7,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  color: '#6f747b',
  fontSize: 11,
};

const salesValue: React.CSSProperties = {
  marginTop: 6,
  color: '#8a5b17',
  fontSize: 10,
};

const alertList: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  width: '100%',
  minWidth: 0,
};

const alertRow: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  minHeight: 64,
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: 9,
  border: '1px solid #eeeeef',
  borderRadius: 12,
  color: 'inherit',
  textDecoration: 'none',
  overflow: 'hidden',
};

const alertImage: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 9,
  objectFit: 'cover',
  flex: '0 0 auto',
};

const alertPlaceholder: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 9,
  background: '#f0f1f2',
  flex: '0 0 auto',
};

const alertContent: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const alertTitle: React.CSSProperties = {
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontSize: 12,
  fontWeight: 700,
};

const alertText: React.CSSProperties = {
  marginTop: 3,
  color: '#8a8e94',
  fontSize: 10,
};

const stockBadge: React.CSSProperties = {
  minWidth: 30,
  padding: '5px 7px',
  borderRadius: 8,
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 800,
};

const orderTableWrap: React.CSSProperties = {
  width: '100%',
  overflowX: 'auto',
};

const orderTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 650,
};

const tableHead: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #ececef',
  color: '#8a8e94',
  fontSize: 10,
  fontWeight: 700,
  textAlign: 'left',
  textTransform: 'uppercase',
};

const tableCell: React.CSSProperties = {
  padding: '13px 12px',
  borderBottom: '1px solid #f0f0f1',
  color: '#4c5055',
  fontSize: 12,
};

const orderLink: React.CSSProperties = {
  color: '#17191c',
  fontWeight: 700,
  textDecoration: 'none',
};

const statusBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '5px 8px',
  borderRadius: 999,
  background: '#eef5ef',
  color: '#377347',
  fontSize: 10,
  fontWeight: 700,
};

const quickTitle: React.CSSProperties = {
  margin: '8px 0 12px',
  fontSize: 14,
  fontWeight: 700,
  color: '#34373b',
};

const quickGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(180px,1fr))',
  gap: 12,
};

const quickCard: React.CSSProperties = {
  position: 'relative',
  minHeight: 115,
  padding: 17,
  border: '1px solid #e7e9ed',
  borderRadius: 15,
  background: '#fff',
  color: 'inherit',
  textDecoration: 'none',
};

const quickCardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

const quickCardText: React.CSSProperties = {
  maxWidth: '85%',
  marginTop: 7,
  color: '#858990',
  fontSize: 11,
  lineHeight: 1.5,
};

const quickArrow: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  bottom: 14,
  color: '#b76500',
  fontSize: 18,
};

const emptyState: React.CSSProperties = {
  minHeight: 92,
  padding: '28px 10px',
  display: 'grid',
  placeItems: 'center',
  color: '#8b8f95',
  fontSize: 12,
  textAlign: 'center',
};

const errorBox: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  border: '1px solid #f0c7c4',
  borderRadius: 10,
  background: '#fff3f2',
  color: '#a12620',
  fontSize: 12,
};

const loadingBox: React.CSSProperties = {
  minHeight: 300,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 12,
  color: '#777',
};

const spinner: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '3px solid #e4e4e4',
  borderTopColor: '#c66d00',
  borderRadius: '50%',
};