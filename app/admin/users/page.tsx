'use client';

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/lib/firebase';

type UserRow = {
  id: string;
  data: DocumentData;
  source: 'users' | 'orders';
  hasUserDoc: boolean;
  userCollection?: 'Users' | 'users';
};

type OrderRow = {
  id: string;
  data: DocumentData;
};

type UserStats = {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalSpend: number;
  lastOrderAt: number;
  lastOrderNumber: string;
};

type StatusFilter = 'all' | 'active' | 'blocked';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'name_az'
  | 'name_za'
  | 'orders_high'
  | 'spend_high'
  | 'recent_order';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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

function userCreatedMillis(data: DocumentData): number {
  return timestampMillis(
    data.created_at ??
      data.createdAt ??
      data.joined_at ??
      data.first_login_at ??
      data.last_login_at,
  );
}

function formatDate(value: unknown): string {
  const millis = timestampMillis(value);

  if (!millis) return '—';

  try {
    return new Date(millis).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function userName(data: DocumentData): string {
  return text(
    data.display_name ??
      data.displayName ??
      data.name ??
      data.full_name ??
      'Customer',
  );
}

function userEmail(data: DocumentData): string {
  return text(data.email);
}

function userPhone(data: DocumentData): string {
  return text(
    data.phone_number ??
      data.phone ??
      data.whatsapp_number ??
      data.whatsapp ??
      '',
  );
}

function userPhoto(data: DocumentData): string {
  return text(
    data.photo_url ??
      data.photoURL ??
      data.avatar_url ??
      '',
  );
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

function orderTotal(data: DocumentData): number {
  return numberValue(
    data.total ??
      data.grand_total ??
      data.total_amount ??
      data.amount ??
      0,
  );
}

function orderNumber(
  id: string,
  data: DocumentData,
): string {
  return (
    text(data.order_number) ||
    text(data.order_id) ||
    id
  );
}

function orderUserId(data: DocumentData): string {
  const candidate =
    data.user_ref ??
    data.user_id ??
    data.userId ??
    data.customer_ref ??
    data.customer_id ??
    data.uid;

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

function orderCustomerName(data: DocumentData): string {
  return text(
    data.customer_name ??
      data.user_name ??
      data.display_name ??
      data.delivery_name ??
      data.name ??
      data.address?.full_name ??
      data.address?.name ??
      'Customer',
  );
}

function orderCustomerPhone(data: DocumentData): string {
  return text(
    data.customer_phone ??
      data.phone ??
      data.phone_number ??
      data.delivery_phone ??
      data.address?.phone ??
      data.address?.phone_number ??
      '',
  );
}

function orderCustomerEmail(data: DocumentData): string {
  return text(
    data.customer_email ??
      data.user_email ??
      data.email ??
      data.address?.email ??
      '',
  );
}

function customerIdentityKey(data: DocumentData): string {
  const uid = orderUserId(data);
  if (uid) return `uid:${uid}`;

  const phone = orderCustomerPhone(data)
    .replace(/\D+/g, '');
  if (phone) return `phone:${phone}`;

  const email = orderCustomerEmail(data)
    .toLowerCase();
  if (email) return `email:${email}`;

  const name = orderCustomerName(data)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return `name:${name || 'customer'}`;
}

function syntheticUserIdFromOrder(data: DocumentData): string {
  const uid = orderUserId(data);
  if (uid) return uid;

  const phone = orderCustomerPhone(data)
    .replace(/\D+/g, '');
  if (phone) return `order-phone-${phone}`;

  const email = orderCustomerEmail(data)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (email) return `order-email-${email}`;

  const name = orderCustomerName(data)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `order-customer-${name || 'unknown'}`;
}

function userIdentityKeys(row: UserRow): string[] {
  const keys: string[] = [`uid:${row.id}`];

  const phone = userPhone(row.data)
    .replace(/\D+/g, '');
  if (phone) keys.push(`phone:${phone}`);

  const email = userEmail(row.data)
    .toLowerCase();
  if (email) keys.push(`email:${email}`);

  return keys;
}

function isDelivered(status: string): boolean {
  return (
    status === 'delivered' ||
    status === 'completed' ||
    status === 'complete'
  );
}

function isCancelled(status: string): boolean {
  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'rejected'
  );
}

function isBlocked(data: DocumentData): boolean {
  return (
    data.is_blocked === true ||
    data.isBlocked === true ||
    data.account_status === 'blocked'
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [sourceCounts, setSourceCounts] = useState({
    ordersUpper: 0,
    ordersLower: 0,
    usersUpper: 0,
    usersLower: 0,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');
  const [sortBy, setSortBy] =
    useState<SortOption>('newest');

  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [selectedUser, setSelectedUser] =
    useState<UserRow | null>(null);

  async function loadData(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    const firestore = db;

    if (showLoader) setLoading(true);
    setMessage('');

    try {
      const orderRows: OrderRow[] = [];
      const seenOrderIds = new Set<string>();

      let ordersUpper = 0;
      let ordersLower = 0;

      for (const collectionName of ['Orders', 'orders'] as const) {
        try {
          let snap;

          try {
            snap = await getDocs(
              query(
                collection(firestore, collectionName),
                orderBy('created_at', 'desc'),
              ),
            );
          } catch {
            snap = await getDocs(
              collection(firestore, collectionName),
            );
          }

          if (collectionName === 'Orders') {
            ordersUpper = snap.size;
          } else {
            ordersLower = snap.size;
          }

          for (const item of snap.docs) {
            const key = `${collectionName}:${item.id}`;

            if (seenOrderIds.has(key)) continue;
            seenOrderIds.add(key);

            orderRows.push({
              id: item.id,
              data: item.data(),
            });
          }
        } catch (error) {
          console.warn(
            `Unable to read ${collectionName}:`,
            error,
          );
        }
      }

      const registeredUsers: UserRow[] = [];
      const seenRealUserIds = new Set<string>();

      let usersUpper = 0;
      let usersLower = 0;

      for (const collectionName of ['Users', 'users'] as const) {
        try {
          let snap;

          try {
            snap = await getDocs(
              query(
                collection(firestore, collectionName),
                orderBy('created_at', 'desc'),
              ),
            );
          } catch {
            snap = await getDocs(
              collection(firestore, collectionName),
            );
          }

          if (collectionName === 'Users') {
            usersUpper = snap.size;
          } else {
            usersLower = snap.size;
          }

          for (const item of snap.docs) {
            if (seenRealUserIds.has(item.id)) continue;
            seenRealUserIds.add(item.id);

            registeredUsers.push({
              id: item.id,
              data: item.data(),
              source: 'users',
              hasUserDoc: true,
              userCollection: collectionName,
            });
          }
        } catch (error) {
          console.warn(
            `Unable to read ${collectionName}:`,
            error,
          );
        }
      }

      setSourceCounts({
        ordersUpper,
        ordersLower,
        usersUpper,
        usersLower,
      });

      const registeredByIdentity =
        new Map<string, UserRow>();

      for (const row of registeredUsers) {
        for (const key of userIdentityKeys(row)) {
          registeredByIdentity.set(key, row);
        }
      }

      const mergedUsers = new Map<string, UserRow>();

      for (const row of registeredUsers) {
        mergedUsers.set(row.id, row);
      }

      for (const order of orderRows) {
        const uid = orderUserId(order.data);

        const phone = orderCustomerPhone(order.data)
          .replace(/\D+/g, '');

        const email = orderCustomerEmail(order.data)
          .toLowerCase();

        const identityKey =
          customerIdentityKey(order.data);

        const matchingRegistered =
          (uid
            ? registeredByIdentity.get(`uid:${uid}`)
            : undefined) ||
          (phone
            ? registeredByIdentity.get(`phone:${phone}`)
            : undefined) ||
          (email
            ? registeredByIdentity.get(`email:${email}`)
            : undefined) ||
          registeredByIdentity.get(identityKey);

        if (matchingRegistered) {
          mergedUsers.set(
            matchingRegistered.id,
            {
              ...matchingRegistered,
              data: {
                ...matchingRegistered.data,
                display_name:
                  userName(matchingRegistered.data) !== 'Customer'
                    ? userName(matchingRegistered.data)
                    : orderCustomerName(order.data),
                phone_number:
                  userPhone(matchingRegistered.data) ||
                  orderCustomerPhone(order.data),
                email:
                  userEmail(matchingRegistered.data) ||
                  orderCustomerEmail(order.data),
              },
            },
          );

          continue;
        }

        const syntheticId =
          syntheticUserIdFromOrder(order.data);

        const existing =
          mergedUsers.get(syntheticId);

        if (!existing) {
          mergedUsers.set(syntheticId, {
            id: syntheticId,
            source: 'orders',
            hasUserDoc: false,
            data: {
              display_name:
                orderCustomerName(order.data),
              phone_number:
                orderCustomerPhone(order.data),
              email:
                orderCustomerEmail(order.data),
              created_at:
                order.data.created_at ?? null,
              last_login_at: null,
              auth_provider: 'order',
              order_only_customer: true,
              derived_user_uid: uid || '',
              is_blocked: false,
              account_status: 'active',
            },
          });
        }
      }

      setOrders(orderRows);
      setUsers([...mergedUsers.values()]);

      if (orderRows.length === 0 && registeredUsers.length === 0) {
        setMessage(
          'No customer data was returned from Orders/orders or Users/users. The source counts below show exactly what this page can read.',
        );
      } else if (registeredUsers.length === 0) {
        setMessage(
          `Showing ${mergedUsers.size} customer${
            mergedUsers.size === 1 ? '' : 's'
          } from order records.`,
        );
      } else {
        setMessage('');
      }
    } catch (error) {
      console.error('Users load failed:', error);

      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load users.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const statsByUser = useMemo(() => {
    const map: Record<string, UserStats> = {};

    for (const row of users) {
      map[row.id] = {
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        totalSpend: 0,
        lastOrderAt: 0,
        lastOrderNumber: '',
      };
    }

    const userIdByIdentity = new Map<string, string>();

    for (const row of users) {
      for (const key of userIdentityKeys(row)) {
        userIdByIdentity.set(key, row.id);
      }

      if (row.source === 'orders') {
        const derivedUid = text(
          row.data.derived_user_uid,
        );

        if (derivedUid) {
          userIdByIdentity.set(
            `uid:${derivedUid}`,
            row.id,
          );
        }
      }
    }

    for (const order of orders) {
      const uid = orderUserId(order.data);
      const identityKey =
        customerIdentityKey(order.data);

      const resolvedUserId =
        (uid
          ? userIdByIdentity.get(`uid:${uid}`)
          : undefined) ||
        userIdByIdentity.get(identityKey) ||
        syntheticUserIdFromOrder(order.data);

      if (!map[resolvedUserId]) {
        map[resolvedUserId] = {
          totalOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          totalSpend: 0,
          lastOrderAt: 0,
          lastOrderNumber: '',
        };
      }

      const stats = map[resolvedUserId];
      const status = orderStatus(order.data);
      const created = timestampMillis(
        order.data.created_at,
      );

      stats.totalOrders += 1;

      if (isDelivered(status)) {
        stats.deliveredOrders += 1;
        stats.totalSpend += orderTotal(order.data);
      }

      if (isCancelled(status)) {
        stats.cancelledOrders += 1;
      }

      if (created > stats.lastOrderAt) {
        stats.lastOrderAt = created;
        stats.lastOrderNumber = orderNumber(
          order.id,
          order.data,
        );
      }
    }

    return map;
  }, [users, orders]);

  const summary = useMemo(() => {
    const active = users.filter(
      ({ data }) => !isBlocked(data),
    ).length;

    const blocked = users.filter(({ data }) =>
      isBlocked(data),
    ).length;

    const customersWithOrders = users.filter(
      ({ id }) =>
        (statsByUser[id]?.totalOrders ?? 0) > 0,
    ).length;

    const totalDeliveredSpend = users.reduce(
      (sum, { id }) =>
        sum + (statsByUser[id]?.totalSpend ?? 0),
      0,
    );

    return {
      total: users.length,
      active,
      blocked,
      customersWithOrders,
      totalDeliveredSpend,
    };
  }, [users, statsByUser]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const next = users.filter((row) => {
      const blocked = isBlocked(row.data);

      if (
        statusFilter === 'active' &&
        blocked
      ) {
        return false;
      }

      if (
        statusFilter === 'blocked' &&
        !blocked
      ) {
        return false;
      }

      if (!needle) return true;

      const stats = statsByUser[row.id];

      return [
        row.id,
        userName(row.data),
        userEmail(row.data),
        userPhone(row.data),
        row.data.gender,
        row.data.auth_provider,
        stats?.lastOrderNumber,
      ].some((value) =>
        text(value)
          .toLowerCase()
          .includes(needle),
      );
    });

    next.sort((a, b) => {
      const aStats =
        statsByUser[a.id] ??
        ({
          totalOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          totalSpend: 0,
          lastOrderAt: 0,
          lastOrderNumber: '',
        } satisfies UserStats);

      const bStats =
        statsByUser[b.id] ??
        ({
          totalOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          totalSpend: 0,
          lastOrderAt: 0,
          lastOrderNumber: '',
        } satisfies UserStats);

      switch (sortBy) {
        case 'oldest':
          return (
            userCreatedMillis(a.data) -
            userCreatedMillis(b.data)
          );

        case 'name_az':
          return userName(a.data).localeCompare(
            userName(b.data),
          );

        case 'name_za':
          return userName(b.data).localeCompare(
            userName(a.data),
          );

        case 'orders_high':
          return (
            bStats.totalOrders -
            aStats.totalOrders
          );

        case 'spend_high':
          return (
            bStats.totalSpend -
            aStats.totalSpend
          );

        case 'recent_order':
          return (
            bStats.lastOrderAt -
            aStats.lastOrderAt
          );

        case 'newest':
        default:
          return (
            userCreatedMillis(b.data) -
            userCreatedMillis(a.data)
          );
      }
    });

    return next;
  }, [
    users,
    statsByUser,
    search,
    statusFilter,
    sortBy,
  ]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortBy, pageSize]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filtered.slice(
      start,
      start + pageSize,
    );
  }, [filtered, page, pageSize]);

  const pageStart =
    filtered.length === 0
      ? 0
      : (page - 1) * pageSize + 1;

  const pageEnd = Math.min(
    page * pageSize,
    filtered.length,
  );

  async function toggleBlocked(row: UserRow) {
    if (!db || busyId) return;

    if (!row.hasUserDoc) {
      setMessage(
        'This customer is shown from an order but does not have a Users profile document yet, so account blocking is not available for this row.',
      );
      return;
    }

    const currentlyBlocked = isBlocked(row.data);
    const nextBlocked = !currentlyBlocked;

    if (
      nextBlocked &&
      !window.confirm(
        `Block ${userName(
          row.data,
        )}?\n\nThis marks the customer as blocked in Firestore. Your customer-facing auth/gate can enforce this field later.`,
      )
    ) {
      return;
    }

    setBusyId(row.id);
    setMessage('');

    try {
      await updateDoc(
        doc(
          db,
          row.userCollection ?? 'Users',
          row.id,
        ),
        {
        is_blocked: nextBlocked,
        account_status: nextBlocked
          ? 'blocked'
          : 'active',
        blocked_at: nextBlocked
          ? serverTimestamp()
          : null,
          updated_at: serverTimestamp(),
        },
      );

      setUsers((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  is_blocked: nextBlocked,
                  account_status: nextBlocked
                    ? 'blocked'
                    : 'active',
                },
              }
            : item,
        ),
      );

      if (selectedUser?.id === row.id) {
        setSelectedUser((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  is_blocked: nextBlocked,
                  account_status: nextBlocked
                    ? 'blocked'
                    : 'active',
                },
              }
            : prev,
        );
      }

      setMessage(
        nextBlocked
          ? 'Customer blocked.'
          : 'Customer unblocked.',
      );
    } catch (error) {
      console.error(
        'User status update failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Customer update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setSortBy('newest');
  }

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Users</h1>

          <p style={pageSubtitle}>
            Find customers, review order activity
            and manage customer access.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData(false)}
          style={refreshButton}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={sourceInfoBar}>
        <span>
          Data source:
        </span>
        <strong>
          Orders {sourceCounts.ordersUpper}
        </strong>
        <span>•</span>
        <strong>
          orders {sourceCounts.ordersLower}
        </strong>
        <span>•</span>
        <strong>
          Users {sourceCounts.usersUpper}
        </strong>
        <span>•</span>
        <strong>
          users {sourceCounts.usersLower}
        </strong>
      </div>

      <div style={summaryGrid}>
        <SummaryCard
          label="Total Users"
          value={summary.total}
        />
        <SummaryCard
          label="Active"
          value={summary.active}
        />
        <SummaryCard
          label="Blocked"
          value={summary.blocked}
          danger={summary.blocked > 0}
        />
        <SummaryCard
          label="Customers with Orders"
          value={summary.customersWithOrders}
        />
        <SummaryCard
          label="Delivered Spend"
          value={`₹${summary.totalDeliveredSpend.toFixed(
            0,
          )}`}
        />
      </div>

      <div style={controlsCard}>
        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search name, email, phone, UID, last order…"
          style={searchInput}
        />

        <div style={filterRow}>
          <label style={filterLabelWrap}>
            <span style={filterLabel}>
              Status
            </span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as StatusFilter,
                )
              }
              style={filterSelect}
            >
              <option value="all">
                All Users
              </option>
              <option value="active">
                Active
              </option>
              <option value="blocked">
                Blocked
              </option>
            </select>
          </label>

          <label style={filterLabelWrap}>
            <span style={filterLabel}>
              Sort
            </span>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target
                    .value as SortOption,
                )
              }
              style={filterSelect}
            >
              <option value="newest">
                Newest First
              </option>
              <option value="oldest">
                Oldest First
              </option>
              <option value="name_az">
                Name A–Z
              </option>
              <option value="name_za">
                Name Z–A
              </option>
              <option value="orders_high">
                Most Orders
              </option>
              <option value="spend_high">
                Highest Spend
              </option>
              <option value="recent_order">
                Recent Order
              </option>
            </select>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            style={clearButton}
          >
            Clear Filters
          </button>

          <div style={matchCount}>
            {filtered.length} matching user
            {filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {message && (
        <div style={messageBox}>
          <span>{message}</span>

          <button
            type="button"
            onClick={() => setMessage('')}
            style={messageClose}
          >
            ×
          </button>
        </div>
      )}

      <div style={tableCard}>
        {loading ? (
          <div style={loadingBox}>
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>
            No matching users.
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRow}>
                {[
                  'Customer',
                  'Phone',
                  'Orders',
                  'Delivered',
                  'Spend',
                  'Last Order',
                  'Status',
                  '',
                ].map((heading) => (
                  <th
                    key={heading}
                    style={tableHeadCell}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginated.map((row) => {
                const stats =
                  statsByUser[row.id] ?? {
                    totalOrders: 0,
                    deliveredOrders: 0,
                    cancelledOrders: 0,
                    totalSpend: 0,
                    lastOrderAt: 0,
                    lastOrderNumber: '',
                  };

                const blocked = isBlocked(
                  row.data,
                );

                const photo = userPhoto(
                  row.data,
                );

                const busy = busyId === row.id;

                return (
                  <tr
                    key={row.id}
                    style={tableRow}
                  >
                    <td style={customerCell}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedUser(row)
                        }
                        style={customerButton}
                      >
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            style={avatar}
                          />
                        ) : (
                          <div
                            style={avatarPlaceholder}
                          >
                            {userName(row.data)
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}

                        <div
                          style={{
                            minWidth: 0,
                            textAlign: 'left',
                          }}
                        >
                          <div style={customerNameStyle}>
                            {userName(row.data)}
                          </div>

                          <div style={subText}>
                            {userEmail(row.data) ||
                              'No email'}
                          </div>

                          {row.source === 'orders' && (
                            <div style={orderCustomerTag}>
                              Customer from Orders
                            </div>
                          )}

                          <div style={uidText}>
                            {row.id}
                          </div>
                        </div>
                      </button>
                    </td>

                    <td style={normalCell}>
                      {userPhone(row.data) || '—'}
                    </td>

                    <td style={numberCell}>
                      {stats.totalOrders}
                    </td>

                    <td style={numberCell}>
                      {stats.deliveredOrders}
                    </td>

                    <td style={moneyCell}>
                      ₹{stats.totalSpend.toFixed(0)}
                    </td>

                    <td style={normalCell}>
                      {stats.lastOrderAt > 0 ? (
                        <>
                          <div>
                            {stats.lastOrderNumber ||
                              'Order'}
                          </div>

                          <div style={subText}>
                            {formatDate(
                              stats.lastOrderAt,
                            )}
                          </div>
                        </>
                      ) : (
                        <span style={subText}>
                          No orders
                        </span>
                      )}
                    </td>

                    <td style={normalCell}>
                      <span
                        style={
                          blocked
                            ? blockedBadge
                            : activeBadge
                        }
                      >
                        {blocked
                          ? 'Blocked'
                          : 'Active'}
                      </span>
                    </td>

                    <td style={actionsCell}>
                      <div style={actionRow}>
                        <button
                          type="button"
                          title="View customer"
                          aria-label="View customer"
                          onClick={() =>
                            setSelectedUser(row)
                          }
                          style={iconViewButton}
                        >
                          ◉
                        </button>

                        <button
                          type="button"
                          title={
                            !row.hasUserDoc
                              ? 'No Users profile document'
                              : blocked
                                ? 'Unblock customer'
                                : 'Block customer'
                          }
                          aria-label={
                            !row.hasUserDoc
                              ? 'No Users profile document'
                              : blocked
                                ? 'Unblock customer'
                                : 'Block customer'
                          }
                          disabled={
                            busy ||
                            !row.hasUserDoc
                          }
                          onClick={() =>
                            void toggleBlocked(row)
                          }
                          style={{
                            ...(blocked
                              ? iconUnblockButton
                              : iconBlockButton),
                            opacity:
                              busy || !row.hasUserDoc
                                ? 0.35
                                : 1,
                          }}
                        >
                          {blocked ? '✓' : '⊘'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div style={paginationBar}>
          <div style={paginationInfo}>
            Showing {pageStart}–{pageEnd} of{' '}
            {filtered.length}
          </div>

          <div style={paginationRight}>
            <label style={rowsLabel}>
              Rows

              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value),
                  );
                  setPage(1);
                }}
                style={pageSizeSelect}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option
                    key={size}
                    value={size}
                  >
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((prev) =>
                  Math.max(1, prev - 1),
                )
              }
              style={{
                ...pageButton,
                opacity: page <= 1 ? 0.4 : 1,
              }}
            >
              ‹
            </button>

            <div style={pageNumber}>
              Page {page} of {totalPages}
            </div>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((prev) =>
                  Math.min(
                    totalPages,
                    prev + 1,
                  ),
                )
              }
              style={{
                ...pageButton,
                opacity:
                  page >= totalPages ? 0.4 : 1,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {selectedUser && (
        <UserModal
          row={selectedUser}
          stats={
            statsByUser[selectedUser.id] ?? {
              totalOrders: 0,
              deliveredOrders: 0,
              cancelledOrders: 0,
              totalSpend: 0,
              lastOrderAt: 0,
              lastOrderNumber: '',
            }
          }
          busy={busyId === selectedUser.id}
          hasUserDoc={selectedUser.hasUserDoc}
          onClose={() => setSelectedUser(null)}
          onToggleBlock={() =>
            void toggleBlocked(selectedUser)
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>
        {label}
      </div>

      <div
        style={{
          ...summaryValue,
          color: danger ? '#b42318' : '#111',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function UserModal({
  row,
  stats,
  busy,
  hasUserDoc,
  onClose,
  onToggleBlock,
}: {
  row: UserRow;
  stats: UserStats;
  busy: boolean;
  hasUserDoc: boolean;
  onClose: () => void;
  onToggleBlock: () => void;
}) {
  const data = row.data;
  const blocked = isBlocked(data);
  const photo = userPhoto(data);

  return (
    <div
      style={modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={modalCard}>
        <div style={modalHeader}>
          <div style={profileHead}>
            {photo ? (
              <img
                src={photo}
                alt=""
                style={modalAvatar}
              />
            ) : (
              <div style={modalAvatarPlaceholder}>
                {userName(data)
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
            )}

            <div>
              <h2 style={modalTitle}>
                {userName(data)}
              </h2>

              <div style={subText}>
                {userEmail(data) || 'No email'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={modalClose}
          >
            ×
          </button>
        </div>

        <div style={modalBody}>
          <div style={detailGrid}>
            <DetailItem
              label="Phone"
              value={userPhone(data) || '—'}
            />

            <DetailItem
              label="Gender"
              value={text(data.gender) || '—'}
            />

            <DetailItem
              label="Date of Birth"
              value={
                text(data.date_of_birth) || '—'
              }
            />

            <DetailItem
              label="Auth Provider"
              value={
                text(data.auth_provider) ||
                (row.source === 'orders'
                  ? 'Order customer'
                  : '—')
              }
            />

            <DetailItem
              label="Joined"
              value={formatDate(
                data.created_at ??
                  data.createdAt ??
                  data.last_login_at,
              )}
            />

            <DetailItem
              label="Last Login"
              value={formatDate(
                data.last_login_at,
              )}
            />
          </div>

          <div style={statsGrid}>
            <SmallStat
              label="Orders"
              value={stats.totalOrders}
            />
            <SmallStat
              label="Delivered"
              value={stats.deliveredOrders}
            />
            <SmallStat
              label="Cancelled"
              value={stats.cancelledOrders}
            />
            <SmallStat
              label="Spend"
              value={`₹${stats.totalSpend.toFixed(
                0,
              )}`}
            />
          </div>

          <div style={uidBox}>
            <div style={detailLabel}>
              User UID
            </div>
            <div style={uidValue}>
              {row.id}
            </div>
          </div>

          {stats.lastOrderAt > 0 && (
            <div style={lastOrderBox}>
              <div style={detailLabel}>
                Last Order
              </div>
              <div>
                {stats.lastOrderNumber}
              </div>
              <div style={subText}>
                {formatDate(stats.lastOrderAt)}
              </div>
            </div>
          )}
        </div>

        <div style={modalFooter}>
          <button
            type="button"
            onClick={onClose}
            style={secondaryButton}
          >
            Close
          </button>

          <button
            type="button"
            disabled={busy || !hasUserDoc}
            onClick={onToggleBlock}
            style={{
              ...(blocked
                ? unblockButton
                : blockButton),
              opacity:
                busy || !hasUserDoc
                  ? 0.45
                  : 1,
              cursor:
                busy || !hasUserDoc
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {!hasUserDoc
              ? 'No Account Profile'
              : blocked
                ? 'Unblock Customer'
                : 'Block Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={detailItem}>
      <div style={detailLabel}>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div style={smallStat}>
      <div style={detailLabel}>
        {label}
      </div>
      <div style={smallStatValue}>
        {value}
      </div>
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

const sourceInfoBar: React.CSSProperties = {
  marginTop: 14,
  padding: '9px 11px',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  flexWrap: 'wrap',
  border: '1px solid #e4e6e9',
  borderRadius: 10,
  background: '#fff',
  color: '#6d7177',
  fontSize: 10,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(150px,1fr))',
  gap: 12,
  margin: '22px 0',
};

const summaryCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 14,
  padding: 15,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
  fontWeight: 400,
};

const summaryValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 25,
  fontWeight: 400,
};

const controlsCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 15,
  padding: 14,
  marginBottom: 15,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: '12px 13px',
  fontSize: 14,
  outline: 'none',
  marginBottom: 10,
};

const filterRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'end',
  flexWrap: 'wrap',
};

const filterLabelWrap: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  minWidth: 170,
};

const filterLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#666',
  fontWeight: 400,
};

const filterSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 9,
  padding: '9px 10px',
  background: '#fff',
  fontWeight: 400,
};

const clearButton: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 9,
  background: '#fff',
  padding: '9px 11px',
  cursor: 'pointer',
  fontWeight: 400,
};

const matchCount: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  color: '#777',
};

const messageBox: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
  padding: '11px 13px',
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

const tableCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e7e7',
  borderRadius: 16,
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 1050,
};

const tableHeadRow: React.CSSProperties = {
  textAlign: 'left',
  background: '#fafafa',
};

const tableHeadCell: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #eee',
  fontSize: 12,
  fontWeight: 400,
  whiteSpace: 'nowrap',
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0',
};

const customerCell: React.CSSProperties = {
  padding: 11,
  minWidth: 290,
};

const customerButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  border: 0,
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  width: '100%',
  color: 'inherit',
};

const avatar: React.CSSProperties = {
  width: 48,
  height: 48,
  minWidth: 48,
  borderRadius: '50%',
  objectFit: 'cover',
  background: '#eee',
};

const avatarPlaceholder: React.CSSProperties = {
  width: 48,
  height: 48,
  minWidth: 48,
  borderRadius: '50%',
  background: '#f0f0f0',
  display: 'grid',
  placeItems: 'center',
  fontSize: 17,
};

const customerNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 400,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 250,
};

const subText: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
  marginTop: 2,
};

const orderCustomerTag: React.CSSProperties = {
  display: 'inline-flex',
  marginTop: 4,
  padding: '3px 6px',
  borderRadius: 999,
  background: '#fff6e8',
  color: '#9b5d00',
  fontSize: 9,
  fontWeight: 600,
};

const uidText: React.CSSProperties = {
  fontSize: 9,
  color: '#aaa',
  marginTop: 2,
};

const normalCell: React.CSSProperties = {
  padding: 11,
  fontSize: 12,
  verticalAlign: 'middle',
};

const numberCell: React.CSSProperties = {
  ...normalCell,
  textAlign: 'center',
};

const moneyCell: React.CSSProperties = {
  ...normalCell,
  whiteSpace: 'nowrap',
};

const activeBadge: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 8,
  background: '#ebf8ee',
  color: '#137333',
  fontSize: 10,
};

const blockedBadge: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 8px',
  borderRadius: 8,
  background: '#fff0f0',
  color: '#b42318',
  fontSize: 10,
};

const actionsCell: React.CSSProperties = {
  padding: 8,
  width: 78,
};

const actionRow: React.CSSProperties = {
  display: 'flex',
  gap: 5,
  alignItems: 'center',
};

const iconViewButton: React.CSSProperties = {
  width: 30,
  height: 30,
  border: 0,
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const iconBlockButton: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid #efb7b3',
  background: '#fff7f6',
  color: '#b42318',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const iconUnblockButton: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid #bfe0c7',
  background: '#f3fbf5',
  color: '#137333',
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const loadingBox: React.CSSProperties = {
  padding: 26,
};

const emptyBox: React.CSSProperties = {
  padding: 34,
  textAlign: 'center',
  color: '#777',
};

const paginationBar: React.CSSProperties = {
  marginTop: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const paginationInfo: React.CSSProperties = {
  fontSize: 12,
  color: '#777',
};

const paginationRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const rowsLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: '#777',
};

const pageSizeSelect: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '6px 7px',
  background: '#fff',
};

const pageButton: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  fontSize: 18,
  cursor: 'pointer',
};

const pageNumber: React.CSSProperties = {
  minWidth: 95,
  textAlign: 'center',
  fontSize: 11,
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(0,0,0,.45)',
};

const modalCard: React.CSSProperties = {
  width: 'min(760px,100%)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 18,
  background: '#f6f7f9',
  boxShadow: '0 25px 80px rgba(0,0,0,.25)',
};

const modalHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: 18,
  background: '#fff',
  borderBottom: '1px solid #e7e7e7',
};

const profileHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const modalAvatar: React.CSSProperties = {
  width: 62,
  height: 62,
  borderRadius: '50%',
  objectFit: 'cover',
  background: '#eee',
};

const modalAvatarPlaceholder: React.CSSProperties = {
  width: 62,
  height: 62,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#eee',
  fontSize: 22,
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 21,
  fontWeight: 400,
};

const modalClose: React.CSSProperties = {
  width: 34,
  height: 34,
  border: 0,
  borderRadius: 9,
  background: '#f2f2f2',
  fontSize: 20,
  cursor: 'pointer',
};

const modalBody: React.CSSProperties = {
  overflowY: 'auto',
  padding: 16,
};

const detailGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(auto-fit,minmax(180px,1fr))',
  gap: 10,
};

const detailItem: React.CSSProperties = {
  padding: 11,
  borderRadius: 10,
  background: '#fff',
  border: '1px solid #e7e7e7',
};

const detailLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
  marginBottom: 4,
};

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(4,minmax(90px,1fr))',
  gap: 10,
  marginTop: 12,
};

const smallStat: React.CSSProperties = {
  padding: 11,
  borderRadius: 10,
  background: '#fff',
  border: '1px solid #e7e7e7',
};

const smallStatValue: React.CSSProperties = {
  fontSize: 18,
};

const uidBox: React.CSSProperties = {
  marginTop: 12,
  padding: 11,
  borderRadius: 10,
  background: '#fff',
  border: '1px solid #e7e7e7',
};

const uidValue: React.CSSProperties = {
  fontSize: 11,
  wordBreak: 'break-all',
};

const lastOrderBox: React.CSSProperties = {
  marginTop: 12,
  padding: 11,
  borderRadius: 10,
  background: '#fff',
  border: '1px solid #e7e7e7',
};

const modalFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: 13,
  background: '#fff',
  borderTop: '1px solid #e7e7e7',
};

const secondaryButton: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fff',
  color: '#222',
  borderRadius: 9,
  padding: '9px 12px',
  cursor: 'pointer',
};

const blockButton: React.CSSProperties = {
  border: 0,
  background: '#b42318',
  color: '#fff',
  borderRadius: 9,
  padding: '9px 12px',
  cursor: 'pointer',
};

const unblockButton: React.CSSProperties = {
  border: 0,
  background: '#137333',
  color: '#fff',
  borderRadius: 9,
  padding: '9px 12px',
  cursor: 'pointer',
};