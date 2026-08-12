'use client';

import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/lib/firebase';

type OrderRow = {
  id: string;
  data: DocumentData;
};

type ProductRow = {
  id: string;
  data: DocumentData;
};

type RangeKey =
  | 'today'
  | '7d'
  | '30d'
  | '90d'
  | 'all'
  | 'custom';

type ProductAggregate = {
  productId: string;
  title: string;
  category: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
};

type CategoryAggregate = {
  category: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
  return Number(value) || 0;
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (
      (value as { toMillis: () => number }).toMillis() || 0
    );
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (
      (value as { toDate: () => Date })
        .toDate()
        .getTime() || 0
    );
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderStatus(data: DocumentData): string {
  return text(
    data.order_status ??
      data.status ??
      'pending',
  )
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isDelivered(data: DocumentData): boolean {
  const status = orderStatus(data);

  return (
    status === 'delivered' ||
    status === 'completed' ||
    status === 'complete'
  );
}

function isCancelled(data: DocumentData): boolean {
  const status = orderStatus(data);

  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'rejected'
  );
}

function orderDateMillis(data: DocumentData): number {
  return timestampMillis(
    data.delivered_at ??
      data.updated_at ??
      data.created_at,
  );
}

function orderCreatedMillis(data: DocumentData): number {
  return timestampMillis(data.created_at);
}

function orderTotal(data: DocumentData): number {
  return numberValue(
    data.total ??
      data.grand_total ??
      data.total_amount ??
      data.amount ??
      0,
  );
}

function orderItems(data: DocumentData): DocumentData[] {
  return Array.isArray(data.items) ? data.items : [];
}

function quantityOf(item: DocumentData): number {
  return Math.max(
    1,
    Number.parseInt(
      text(item.quantity ?? item.qty ?? 1),
      10,
    ) || 1,
  );
}

function productIdFromItem(item: DocumentData): string {
  const candidate =
    item.product_ref ??
    item.product_id ??
    item.productId ??
    item.business_product_id ??
    item.id;

  if (!candidate) return '';

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();

    if (trimmed.includes('/')) {
      return (
        trimmed.split('/').filter(Boolean).pop() || ''
      );
    }

    return trimmed;
  }

  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'id' in candidate
  ) {
    return text(
      (candidate as { id?: unknown }).id,
    );
  }

  return '';
}

function itemTitle(item: DocumentData): string {
  return text(
    item.title ??
      item.product_name ??
      item.name ??
      'Product',
  );
}

function itemUnitPrice(item: DocumentData): number {
  const direct = numberValue(
    item.price ??
      item.unit_price ??
      item.selling_price ??
      item.offer_price ??
      0,
  );

  if (direct > 0) return direct;

  const subtotal = numberValue(
    item.subtotal ??
      item.total ??
      item.line_total ??
      0,
  );

  const qty = quantityOf(item);

  return qty > 0 ? subtotal / qty : subtotal;
}

function productTitle(data: DocumentData): string {
  return text(
    data.title ??
      data.product_name ??
      'Product',
  );
}

function productCategory(data: DocumentData): string {
  return text(
    data.main_category ??
      data.category ??
      'Uncategorised',
  );
}

function purchaseCost(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(data.purchase_cost ?? 0),
  );
}

function stockQty(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(
      data.stock_qty ??
        data.stock_quantity ??
        0,
    ),
  );
}

function availableQty(data: DocumentData): number {
  const stored = Number(data.available_qty);

  if (
    Number.isFinite(stored) &&
    stored >= 0
  ) {
    return stored;
  }

  return Math.max(
    0,
    stockQty(data) -
      Math.max(
        0,
        numberValue(
          data.reserved_qty ?? 0,
        ),
      ),
  );
}

function soldQty(data: DocumentData): number {
  return Math.max(
    0,
    numberValue(data.sold_qty ?? 0),
  );
}

function currentSellingPrice(data: DocumentData): number {
  const offer = numberValue(
    data.offer_price ?? 0,
  );

  const selling = numberValue(
    data.selling_price ??
      data.price ??
      data.mrp ??
      0,
  );

  if (
    offer > 0 &&
    (selling <= 0 || offer < selling)
  ) {
    return offer;
  }

  return selling;
}

function formatMoney(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function startOfTodayMillis(): number {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
}

function rangeStartMillis(
  range: RangeKey,
): number {
  const today = startOfTodayMillis();

  switch (range) {
    case 'today':
      return today;
    case '7d':
      return today - 6 * 24 * 60 * 60 * 1000;
    case '30d':
      return today - 29 * 24 * 60 * 60 * 1000;
    case '90d':
      return today - 89 * 24 * 60 * 60 * 1000;
    case 'all':
    case 'custom':
    default:
      return 0;
  }
}

function parseDateStart(value: string): number {
  if (!value) return 0;

  const [year, month, day] = value
    .split('-')
    .map(Number);

  if (!year || !month || !day) {
    return 0;
  }

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0,
  ).getTime();
}

function parseDateEnd(value: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;

  const [year, month, day] = value
    .split('-')
    .map(Number);

  if (!year || !month || !day) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(
    year,
    month - 1,
    day,
    23,
    59,
    59,
    999,
  ).getTime();
}

export default function AdminReportsPage() {
  const [orders, setOrders] =
    useState<OrderRow[]>([]);
  const [products, setProducts] =
    useState<ProductRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [range, setRange] =
    useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] =
    useState('');
  const [customTo, setCustomTo] =
    useState('');

  async function loadData(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    if (showLoader) setLoading(true);

    try {
      let orderSnap;

      try {
        orderSnap = await getDocs(
          query(
            collection(db, 'Orders'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        orderSnap = await getDocs(
          collection(db, 'Orders'),
        );
      }

      const productSnap = await getDocs(
        collection(db, 'BusinessProducts'),
      );

      setOrders(
        orderSnap.docs.map((item) => ({
          id: item.id,
          data: item.data(),
        })),
      );

      setProducts(
        productSnap.docs
          .map((item) => ({
            id: item.id,
            data: item.data(),
          }))
          .filter(
            ({ data }) =>
              data.isDeleted !== true,
          ),
      );

      setMessage('');
    } catch (error) {
      console.error(
        'Reports load failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load reports.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const productMap = useMemo(() => {
    const map: Record<
      string,
      DocumentData
    > = {};

    for (const row of products) {
      map[row.id] = row.data;
    }

    return map;
  }, [products]);

  const dateBounds = useMemo(() => {
    if (range === 'custom') {
      return {
        start: parseDateStart(customFrom),
        end: parseDateEnd(customTo),
      };
    }

    return {
      start: rangeStartMillis(range),
      end: Number.MAX_SAFE_INTEGER,
    };
  }, [range, customFrom, customTo]);

  const periodOrders = useMemo(() => {
    return orders.filter(({ data }) => {
      const millis =
        orderCreatedMillis(data);

      if (!millis) {
        return range === 'all';
      }

      return (
        millis >= dateBounds.start &&
        millis <= dateBounds.end
      );
    });
  }, [orders, dateBounds, range]);

  const deliveredOrders = useMemo(
    () =>
      periodOrders.filter(({ data }) =>
        isDelivered(data),
      ),
    [periodOrders],
  );

  const cancelledOrders = useMemo(
    () =>
      periodOrders.filter(({ data }) =>
        isCancelled(data),
      ),
    [periodOrders],
  );

  const report = useMemo(() => {
    let revenue = 0;
    let unitsSold = 0;
    let productCost = 0;
    let freeGiftCost = 0;

    const productAgg =
      new Map<string, ProductAggregate>();

    const categoryAgg =
      new Map<string, CategoryAggregate>();

    for (const row of deliveredOrders) {
      const items = orderItems(row.data);

      const orderRevenue = orderTotal(row.data);

      revenue += orderRevenue;

      for (const item of items) {
        const qty = quantityOf(item);
        const productId =
          productIdFromItem(item);

        const productData =
          productId
            ? productMap[productId]
            : undefined;

        const title =
          productData
            ? productTitle(productData)
            : itemTitle(item);

        const category =
          productData
            ? productCategory(productData)
            : text(
                item.main_category ??
                  item.category ??
                  'Uncategorised',
              ) || 'Uncategorised';

        const unitCost =
          productData
            ? purchaseCost(productData)
            : numberValue(
                item.purchase_cost ?? 0,
              );

        const unitPrice = itemUnitPrice(item);

        const lineRevenue =
          numberValue(
            item.subtotal ??
              item.line_total ??
              item.total ??
              0,
          ) ||
          unitPrice * qty;

        const lineCost = unitCost * qty;

        unitsSold += qty;
        productCost += lineCost;

        const giftEligible =
          productData?.free_gift_eligible ===
          true;

        if (
          item.is_free_gift === true ||
          item.free_gift === true
        ) {
          freeGiftCost +=
            productData
              ? numberValue(
                  productData.free_gift_value ??
                    unitCost,
                )
              : numberValue(
                  item.free_gift_value ??
                    unitCost,
                );
        } else if (
          giftEligible &&
          item.price === 0
        ) {
          freeGiftCost +=
            numberValue(
              productData?.free_gift_value ??
                unitCost,
            );
        }

        const productKey =
          productId ||
          `title:${title.toLowerCase()}`;

        const existingProduct =
          productAgg.get(productKey) ?? {
            productId,
            title,
            category,
            units: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };

        existingProduct.units += qty;
        existingProduct.revenue += lineRevenue;
        existingProduct.cost += lineCost;
        existingProduct.profit =
          existingProduct.revenue -
          existingProduct.cost;

        productAgg.set(
          productKey,
          existingProduct,
        );

        const existingCategory =
          categoryAgg.get(category) ?? {
            category,
            units: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };

        existingCategory.units += qty;
        existingCategory.revenue +=
          lineRevenue;
        existingCategory.cost += lineCost;
        existingCategory.profit =
          existingCategory.revenue -
          existingCategory.cost;

        categoryAgg.set(
          category,
          existingCategory,
        );
      }
    }

    const grossProfit =
      revenue - productCost - freeGiftCost;

    const aov =
      deliveredOrders.length > 0
        ? revenue / deliveredOrders.length
        : 0;

    const cancellationRate =
      periodOrders.length > 0
        ? (cancelledOrders.length /
            periodOrders.length) *
          100
        : 0;

    const topProducts = Array.from(
      productAgg.values(),
    ).sort(
      (a, b) =>
        b.units - a.units ||
        b.revenue - a.revenue,
    );

    const topRevenueProducts = Array.from(
      productAgg.values(),
    ).sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.units - a.units,
    );

    const categories = Array.from(
      categoryAgg.values(),
    ).sort(
      (a, b) =>
        b.revenue - a.revenue,
    );

    return {
      revenue,
      unitsSold,
      productCost,
      freeGiftCost,
      grossProfit,
      aov,
      cancellationRate,
      topProducts,
      topRevenueProducts,
      categories,
    };
  }, [
    deliveredOrders,
    cancelledOrders,
    periodOrders,
    productMap,
  ]);

  const inventory = useMemo(() => {
    let stockUnits = 0;
    let availableUnits = 0;
    let reservedUnits = 0;
    let unitsSoldLifetime = 0;

    let stockCostValue = 0;
    let stockRetailValue = 0;

    const lowStock: Array<{
      id: string;
      title: string;
      category: string;
      available: number;
      stock: number;
    }> = [];

    const outOfStock: Array<{
      id: string;
      title: string;
      category: string;
    }> = [];

    for (const row of products) {
      const stock = stockQty(row.data);
      const available =
        availableQty(row.data);
      const reserved = Math.max(
        0,
        numberValue(
          row.data.reserved_qty ?? 0,
        ),
      );

      const sold = soldQty(row.data);

      stockUnits += stock;
      availableUnits += available;
      reservedUnits += reserved;
      unitsSoldLifetime += sold;

      stockCostValue +=
        stock * purchaseCost(row.data);

      stockRetailValue +=
        stock *
        currentSellingPrice(row.data);

      if (available <= 0) {
        outOfStock.push({
          id: row.id,
          title: productTitle(row.data),
          category:
            productCategory(row.data),
        });
      } else if (available <= 2) {
        lowStock.push({
          id: row.id,
          title: productTitle(row.data),
          category:
            productCategory(row.data),
          available,
          stock,
        });
      }
    }

    lowStock.sort(
      (a, b) =>
        a.available - b.available,
    );

    return {
      stockUnits,
      availableUnits,
      reservedUnits,
      unitsSoldLifetime,
      stockCostValue,
      stockRetailValue,
      lowStock,
      outOfStock,
    };
  }, [products]);

  const dailyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        orders: number;
        units: number;
        revenue: number;
      }
    >();

    for (const row of deliveredOrders) {
      const millis =
        orderDateMillis(row.data) ||
        orderCreatedMillis(row.data);

      if (!millis) continue;

      const date = new Date(millis);

      const key = [
        date.getFullYear(),
        String(
          date.getMonth() + 1,
        ).padStart(2, '0'),
        String(date.getDate()).padStart(
          2,
          '0',
        ),
      ].join('-');

      const existing = map.get(key) ?? {
        date: key,
        orders: 0,
        units: 0,
        revenue: 0,
      };

      existing.orders += 1;
      existing.revenue += orderTotal(
        row.data,
      );

      existing.units += orderItems(
        row.data,
      ).reduce(
        (sum, item) =>
          sum + quantityOf(item),
        0,
      );

      map.set(key, existing);
    }

    return Array.from(map.values())
      .sort((a, b) =>
        b.date.localeCompare(a.date),
      )
      .slice(0, 31);
  }, [deliveredOrders]);

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>
            Reports
          </h1>

          <p style={pageSubtitle}>
            Sales, profit and inventory
            performance from Orders and
            BusinessProducts.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadData(false)
          }
          style={refreshButton}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={rangeCard}>
        <div style={rangeButtons}>
          {[
            ['today', 'Today'],
            ['7d', '7 Days'],
            ['30d', '30 Days'],
            ['90d', '90 Days'],
            ['all', 'All Time'],
            ['custom', 'Custom'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setRange(
                  key as RangeKey,
                )
              }
              style={{
                ...rangeButton,
                ...(range === key
                  ? activeRangeButton
                  : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div style={customDates}>
            <label style={dateLabel}>
              From
              <input
                type="date"
                value={customFrom}
                onChange={(event) =>
                  setCustomFrom(
                    event.target.value,
                  )
                }
                style={dateInput}
              />
            </label>

            <label style={dateLabel}>
              To
              <input
                type="date"
                value={customTo}
                onChange={(event) =>
                  setCustomTo(
                    event.target.value,
                  )
                }
                style={dateInput}
              />
            </label>
          </div>
        )}
      </div>

      {message && (
        <div style={messageBox}>
          <span>{message}</span>
          <button
            type="button"
            onClick={() =>
              setMessage('')
            }
            style={messageClose}
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div style={loadingBox}>
          Loading reports…
        </div>
      ) : (
        <>
          <div style={metricGrid}>
            <MetricCard
              label="Delivered Revenue"
              value={formatMoney(
                report.revenue,
              )}
            />

            <MetricCard
              label="Delivered Orders"
              value={deliveredOrders.length}
            />

            <MetricCard
              label="Units Sold"
              value={report.unitsSold}
            />

            <MetricCard
              label="Product Cost"
              value={formatMoney(
                report.productCost,
              )}
            />

            <MetricCard
              label="Free Gift Cost"
              value={formatMoney(
                report.freeGiftCost,
              )}
            />

            <MetricCard
              label="Gross Profit"
              value={formatMoney(
                report.grossProfit,
              )}
              positive={
                report.grossProfit >= 0
              }
            />

            <MetricCard
              label="Average Order"
              value={formatMoney(
                report.aov,
              )}
            />

            <MetricCard
              label="Cancelled"
              value={cancelledOrders.length}
              danger={
                cancelledOrders.length > 0
              }
            />

            <MetricCard
              label="Cancellation Rate"
              value={`${report.cancellationRate.toFixed(
                1,
              )}%`}
              danger={
                report.cancellationRate >
                10
              }
            />
          </div>

          <div style={inventoryGrid}>
            <MetricCard
              label="Physical Stock Units"
              value={inventory.stockUnits}
            />

            <MetricCard
              label="Available Units"
              value={
                inventory.availableUnits
              }
            />

            <MetricCard
              label="Reserved Units"
              value={
                inventory.reservedUnits
              }
            />

            <MetricCard
              label="Lifetime Sold Qty"
              value={
                inventory.unitsSoldLifetime
              }
            />

            <MetricCard
              label="Stock Cost Value"
              value={formatMoney(
                inventory.stockCostValue,
              )}
            />

            <MetricCard
              label="Stock Retail Value"
              value={formatMoney(
                inventory.stockRetailValue,
              )}
            />

            <MetricCard
              label="Low Stock Products"
              value={
                inventory.lowStock.length
              }
              danger={
                inventory.lowStock.length >
                0
              }
            />

            <MetricCard
              label="Out of Stock"
              value={
                inventory.outOfStock.length
              }
              danger={
                inventory.outOfStock.length >
                0
              }
            />
          </div>

          <div style={twoColumn}>
            <ReportSection
              title="Top Selling Products"
              subtitle="By delivered units in selected period"
            >
              <SimpleTable
                headers={[
                  'Product',
                  'Units',
                  'Revenue',
                  'Profit',
                ]}
                rows={report.topProducts
                  .slice(0, 10)
                  .map((item) => [
                    item.title,
                    item.units,
                    formatMoney(
                      item.revenue,
                    ),
                    formatMoney(
                      item.profit,
                    ),
                  ])}
                empty="No delivered product sales in this period."
              />
            </ReportSection>

            <ReportSection
              title="Top Revenue Products"
              subtitle="By delivered product revenue"
            >
              <SimpleTable
                headers={[
                  'Product',
                  'Units',
                  'Revenue',
                  'Cost',
                ]}
                rows={report.topRevenueProducts
                  .slice(0, 10)
                  .map((item) => [
                    item.title,
                    item.units,
                    formatMoney(
                      item.revenue,
                    ),
                    formatMoney(
                      item.cost,
                    ),
                  ])}
                empty="No delivered product sales in this period."
              />
            </ReportSection>
          </div>

          <ReportSection
            title="Category Performance"
            subtitle="Delivered sales grouped by product category"
          >
            <SimpleTable
              headers={[
                'Category',
                'Units',
                'Revenue',
                'Cost',
                'Gross Profit',
              ]}
              rows={report.categories.map(
                (item) => [
                  item.category,
                  item.units,
                  formatMoney(
                    item.revenue,
                  ),
                  formatMoney(item.cost),
                  formatMoney(
                    item.profit,
                  ),
                ],
              )}
              empty="No category sales in this period."
            />
          </ReportSection>

          <div style={twoColumn}>
            <ReportSection
              title="Low Stock"
              subtitle="Available quantity 1–2"
            >
              <SimpleTable
                headers={[
                  'Product',
                  'Category',
                  'Available',
                ]}
                rows={inventory.lowStock
                  .slice(0, 20)
                  .map((item) => [
                    item.title,
                    item.category,
                    item.available,
                  ])}
                empty="No low-stock products."
              />
            </ReportSection>

            <ReportSection
              title="Out of Stock"
              subtitle="Available quantity is zero"
            >
              <SimpleTable
                headers={[
                  'Product',
                  'Category',
                ]}
                rows={inventory.outOfStock
                  .slice(0, 20)
                  .map((item) => [
                    item.title,
                    item.category,
                  ])}
                empty="No out-of-stock products."
              />
            </ReportSection>
          </div>

          <ReportSection
            title="Daily Delivered Sales"
            subtitle="Most recent 31 sales days in the selected period"
          >
            <SimpleTable
              headers={[
                'Date',
                'Orders',
                'Units',
                'Revenue',
              ]}
              rows={dailyRows.map(
                (item) => [
                  item.date,
                  item.orders,
                  item.units,
                  formatMoney(
                    item.revenue,
                  ),
                ],
              )}
              empty="No delivered orders in this period."
            />
          </ReportSection>

          <div style={calculationNote}>
            <div style={noteTitle}>
              How profit is calculated
            </div>

            <div>
              Gross Profit = Delivered Revenue
              − Product Purchase Cost − detected
              Free Gift Cost.
            </div>

            <div style={noteSub}>
              Delivery expense, payment gateway
              fees, packaging, tax, returns and
              other operating expenses are not
              deducted yet because those costs
              are not consistently stored on
              your current order/product records.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  danger = false,
  positive,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
  positive?: boolean;
}) {
  let valueColor = '#111';

  if (danger) {
    valueColor = '#b42318';
  } else if (positive === true) {
    valueColor = '#137333';
  } else if (positive === false) {
    valueColor = '#b42318';
  }

  return (
    <div style={metricCard}>
      <div style={metricLabel}>
        {label}
      </div>

      <div
        style={{
          ...metricValue,
          color: valueColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ReportSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionCard}>
      <div style={sectionHead}>
        <h2 style={sectionTitle}>
          {title}
        </h2>

        {subtitle && (
          <div style={sectionSubtitle}>
            {subtitle}
          </div>
        )}
      </div>

      {children}
    </section>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<
    Array<string | number>
  >;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div style={emptyTable}>
        {empty}
      </div>
    );
  }

  return (
    <div style={tableScroller}>
      <table style={tableStyle}>
        <thead>
          <tr style={tableHeadRow}>
            {headers.map((header) => (
              <th
                key={header}
                style={tableHeadCell}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${String(
                row[0],
              )}`}
              style={tableRow}
            >
              {row.map(
                (cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    style={
                      cellIndex === 0
                        ? firstCell
                        : normalCell
                    }
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const pageTitle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 30,
  fontWeight: 400,
};

const pageSubtitle: React.CSSProperties = {
  margin: 0,
  color: '#666',
};

const refreshButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fff',
  color: '#222',
  borderRadius: 10,
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 400,
};

const rangeCard: React.CSSProperties = {
  margin: '22px 0 14px',
  padding: 12,
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
};

const rangeButtons: React.CSSProperties = {
  display: 'flex',
  gap: 7,
  flexWrap: 'wrap',
};

const rangeButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fff',
  color: '#333',
  borderRadius: 8,
  padding: '8px 11px',
  cursor: 'pointer',
  fontWeight: 400,
};

const activeRangeButton: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  borderColor: '#111',
};

const customDates: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 12,
};

const dateLabel: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  color: '#666',
  fontSize: 11,
};

const dateInput: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '8px 9px',
  background: '#fff',
};

const messageBox: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
  padding: '11px 13px',
  marginBottom: 14,
  background: '#fff8e8',
  border: '1px solid #f0d598',
  borderRadius: 10,
  fontSize: 13,
};

const messageClose: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 20,
  cursor: 'pointer',
};

const loadingBox: React.CSSProperties = {
  padding: 30,
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
};

const metricGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 11,
  marginBottom: 13,
};

const inventoryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 11,
  marginBottom: 16,
};

const metricCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 13,
  padding: 14,
};

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#777',
};

const metricValue: React.CSSProperties = {
  marginTop: 5,
  fontSize: 23,
  fontWeight: 400,
};

const twoColumn: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(420px,1fr))',
  gap: 14,
};

const sectionCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
  marginBottom: 14,
  overflow: 'hidden',
};

const sectionHead: React.CSSProperties = {
  padding: '14px 15px',
  borderBottom: '1px solid #eee',
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 400,
};

const sectionSubtitle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 10,
  color: '#888',
};

const tableScroller: React.CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 500,
};

const tableHeadRow: React.CSSProperties = {
  background: '#fafafa',
  textAlign: 'left',
};

const tableHeadCell: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #eee',
  fontSize: 10,
  color: '#666',
  fontWeight: 400,
  whiteSpace: 'nowrap',
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0',
};

const firstCell: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  minWidth: 170,
};

const normalCell: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const emptyTable: React.CSSProperties = {
  padding: 22,
  color: '#888',
  fontSize: 12,
};

const calculationNote: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: '#fff8e8',
  border: '1px solid #f0d598',
  fontSize: 12,
  lineHeight: 1.5,
};

const noteTitle: React.CSSProperties = {
  marginBottom: 4,
  fontSize: 13,
};

const noteSub: React.CSSProperties = {
  marginTop: 4,
  color: '#777',
  fontSize: 11,
};