'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { auth, db } from '@/lib/firebase';

type DeliveryBoyRow = {
  id: string;
  data: DocumentData;
};

type FormState = {
  name: string;
  phone: string;
  pin: string;
  vehicleNumber: string;
};

const emptyForm: FormState = {
  name: '',
  phone: '',
  pin: '',
  vehicleNumber: '',
};

function text(
  value: unknown,
): string {
  return String(value ?? '').trim();
}

function cleanPhone(
  value: string,
): string {
  return value.replace(/\D+/g, '');
}

function formatDate(
  value: unknown,
): string {
  if (!value) return '—';

  try {
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (
        value as {
          toDate?: unknown;
        }
      ).toDate === 'function'
    ) {
      return (
        value as {
          toDate: () => Date;
        }
      )
        .toDate()
        .toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    }

    const parsed = Date.parse(
      String(value),
    );

    if (!Number.isFinite(parsed)) {
      return '—';
    }

    return new Date(
      parsed,
    ).toLocaleString('en-IN', {
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

export default function AdminDeliveryPage() {
  const [deliveryBoys, setDeliveryBoys] =
    useState<DeliveryBoyRow[]>([]);

  const [form, setForm] =
    useState<FormState>(emptyForm);

  const [editingId, setEditingId] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [busyId, setBusyId] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [search, setSearch] =
    useState('');

  async function loadDeliveryBoys(
    showLoader = true,
  ) {
    if (!db) {
      setLoading(false);
      setMessage(
        'Firebase is not available.',
      );
      return;
    }

    if (showLoader) {
      setLoading(true);
    }

    try {
      let snapshot;

      try {
        snapshot = await getDocs(
          query(
            collection(
              db,
              'DeliveryBoys',
            ),
            orderBy(
              'created_at',
              'desc',
            ),
          ),
        );
      } catch {
        snapshot = await getDocs(
          collection(
            db,
            'DeliveryBoys',
          ),
        );
      }

      setDeliveryBoys(
        snapshot.docs.map(
          (item) => ({
            id: item.id,
            data: item.data(),
          }),
        ),
      );
    } catch (error) {
      console.error(
        'Delivery boys load failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load delivery boys.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeliveryBoys();
  }, []);

  const filtered = useMemo(() => {
    const needle =
      search.trim().toLowerCase();

    if (!needle) {
      return deliveryBoys;
    }

    return deliveryBoys.filter(
      ({ id, data }) => {
        return [
          id,
          data.name,
          data.phone,
          data.vehicle_number,
        ].some((value) =>
          text(value)
            .toLowerCase()
            .includes(needle),
        );
      },
    );
  }, [deliveryBoys, search]);

  const activeCount =
    deliveryBoys.filter(
      ({ data }) =>
        data.is_active !== false,
    ).length;

  const inactiveCount =
    deliveryBoys.length -
    activeCount;

  function updateField(
    field: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId('');
  }

  function startEdit(
    row: DeliveryBoyRow,
  ) {
    setEditingId(row.id);

    setForm({
      name: text(row.data.name),
      phone: text(row.data.phone),
      pin: '',
      vehicleNumber: text(
        row.data.vehicle_number,
      ),
    });

    setMessage('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function saveDeliveryBoy() {
    if (!db || saving) return;

    const name = form.name.trim();
    const phone = cleanPhone(form.phone);
    const pin = form.pin.trim();
    const vehicleNumber = form.vehicleNumber
      .trim()
      .toUpperCase();

    if (!name) {
      setMessage('Enter delivery boy name.');
      return;
    }

    if (phone.length < 10 || phone.length > 15) {
      setMessage('Enter a valid mobile number.');
      return;
    }

    if (!editingId && !/^\d{4,6}$/.test(pin)) {
      setMessage('Create a 4 to 6 digit login PIN.');
      return;
    }

    if (editingId && pin && !/^\d{4,6}$/.test(pin)) {
      setMessage('PIN must be 4 to 6 digits.');
      return;
    }

    const duplicate = deliveryBoys.find(
      ({ id, data }) =>
        id !== editingId &&
        cleanPhone(text(data.phone)) === phone,
    );

    if (duplicate) {
      setMessage(
        'A delivery boy with this mobile number already exists.',
      );
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      if (editingId) {
        /*
         * Profile edits remain Firestore updates for now.
         * We intentionally do NOT write login_pin to Firestore.
         *
         * PIN reset will be connected to the secure Admin API
         * separately, so an entered PIN is not silently stored
         * as plain text.
         */
        await updateDoc(
          doc(db, 'DeliveryBoys', editingId),
          {
            name,
            phone,
            vehicle_number: vehicleNumber,
            updated_at: serverTimestamp(),
          },
        );

        if (pin) {
          setMessage(
            'Delivery boy details updated. PIN was not changed yet; secure PIN reset will be connected separately.',
          );
        } else {
          setMessage(
            'Delivery boy updated successfully.',
          );
        }
      } else {
        if (!auth?.currentUser) {
          throw new Error(
            'Admin login is required. Please refresh and sign in again.',
          );
        }

        const idToken =
          await auth.currentUser.getIdToken();

        const response = await fetch(
          '/api/admin/delivery-boys',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              name,
              phone,
              pin,
              vehicleNumber,
            }),
          },
        );

        const result = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };

        if (!response.ok || result.ok !== true) {
          throw new Error(
            result.error ||
              'Failed to create delivery boy.',
          );
        }

        setMessage(
          'Delivery boy created successfully. Login account is ready.',
        );
      }

      resetForm();
      await loadDeliveryBoys(false);
    } catch (error) {
      console.error(
        'Save delivery boy failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Save failed: ${error.message}`
          : 'Failed to save delivery boy.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(
    row: DeliveryBoyRow,
  ) {
    if (!db || busyId) return;

    const currentlyActive =
      row.data.is_active !== false;

    const nextActive =
      !currentlyActive;

    if (
      !nextActive &&
      !window.confirm(
        `Disable ${text(
          row.data.name,
        )}?\n\nThey will no longer be available for new delivery assignments.`,
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
          'DeliveryBoys',
          row.id,
        ),
        {
          is_active: nextActive,
          updated_at:
            serverTimestamp(),
        },
      );

      setMessage(
        nextActive
          ? `${text(
              row.data.name,
            )} activated.`
          : `${text(
              row.data.name,
            )} disabled.`,
      );

      await loadDeliveryBoys(
        false,
      );
    } catch (error) {
      console.error(
        'Delivery boy status update failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Failed to update status.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function removeDeliveryBoy(
    row: DeliveryBoyRow,
  ) {
    if (!db || busyId) return;

    const name =
      text(row.data.name) ||
      'this delivery boy';

    const confirmed =
      window.confirm(
        `Delete ${name}?\n\nFor delivery history, disabling is normally better than deleting.`,
      );

    if (!confirmed) return;

    setBusyId(row.id);
    setMessage('');

    try {
      await deleteDoc(
        doc(
          db,
          'DeliveryBoys',
          row.id,
        ),
      );

      if (
        editingId === row.id
      ) {
        resetForm();
      }

      setMessage(
        `${name} deleted.`,
      );

      await loadDeliveryBoys(
        false,
      );
    } catch (error) {
      console.error(
        'Delete delivery boy failed:',
        error,
      );

      setMessage(
        error instanceof Error
          ? `Delete failed: ${error.message}`
          : 'Failed to delete delivery boy.',
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <div style={page}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>
            Delivery
          </h1>

          <p style={pageSubtitle}>
            Create delivery boys,
            control access and manage
            delivery staff.
          </p>
        </div>

        <button
          type="button"
          style={refreshButton}
          onClick={() =>
            void loadDeliveryBoys(
              false,
            )
          }
        >
          ↻ Refresh
        </button>
      </div>

      <div style={summaryGrid}>
        <SummaryCard
          label="Delivery Boys"
          value={
            deliveryBoys.length
          }
        />

        <SummaryCard
          label="Active"
          value={activeCount}
        />

        <SummaryCard
          label="Inactive"
          value={inactiveCount}
        />
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

      <div style={formCard}>
        <div style={formHeader}>
          <div>
            <h2 style={formTitle}>
              {editingId
                ? 'Edit Delivery Boy'
                : 'Add Delivery Boy'}
            </h2>

            <p style={formSubtitle}>
              {editingId
                ? 'Update delivery boy information.'
                : 'Create a delivery boy who can later receive assigned orders.'}
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              style={cancelEditButton}
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div style={formGrid}>
          <label style={fieldWrap}>
            <span style={fieldLabel}>
              Name *
            </span>

            <input
              value={form.name}
              onChange={(event) =>
                updateField(
                  'name',
                  event.target.value,
                )
              }
              placeholder="Delivery boy name"
              style={input}
            />
          </label>

          <label style={fieldWrap}>
            <span style={fieldLabel}>
              Mobile Number *
            </span>

            <input
              value={form.phone}
              onChange={(event) =>
                updateField(
                  'phone',
                  event.target.value,
                )
              }
              inputMode="tel"
              placeholder="9876543210"
              style={input}
            />
          </label>

          <label style={fieldWrap}>
            <span style={fieldLabel}>
              {editingId
                ? 'New Login PIN'
                : 'Login PIN *'}
            </span>

            <input
              value={form.pin}
              onChange={(event) =>
                updateField(
                  'pin',
                  event.target.value
                    .replace(
                      /\D+/g,
                      '',
                    )
                    .slice(0, 6),
                )
              }
              inputMode="numeric"
              type="password"
              placeholder={
                editingId
                  ? 'Leave blank to keep current PIN'
                  : '4–6 digits'
              }
              style={input}
            />
          </label>

          <label style={fieldWrap}>
            <span style={fieldLabel}>
              Vehicle Number
            </span>

            <input
              value={
                form.vehicleNumber
              }
              onChange={(event) =>
                updateField(
                  'vehicleNumber',
                  event.target.value,
                )
              }
              placeholder="TN 40 AB 1234"
              style={input}
            />
          </label>
        </div>

        <div style={formActions}>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void saveDeliveryBoy()
            }
            style={{
              ...primaryButton,
              opacity:
                saving ? 0.55 : 1,
            }}
          >
            {saving
              ? 'Saving…'
              : editingId
                ? 'Save Changes'
                : 'Create Delivery Boy'}
          </button>

          {(form.name ||
            form.phone ||
            form.pin ||
            form.vehicleNumber) && (
            <button
              type="button"
              disabled={saving}
              onClick={resetForm}
              style={secondaryButton}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={listCard}>
        <div style={listHeader}>
          <div>
            <h2 style={listTitle}>
              Delivery Boys
            </h2>

            <p style={listSubtitle}>
              Only active delivery
              boys will be available
              when assigning orders.
            </p>
          </div>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search name, phone, vehicle..."
            style={searchInput}
          />
        </div>

        {loading ? (
          <div style={emptyState}>
            Loading delivery boys…
          </div>
        ) : filtered.length === 0 ? (
          <div style={emptyState}>
            {deliveryBoys.length ===
            0
              ? 'No delivery boys created yet.'
              : 'No matching delivery boys.'}
          </div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th
                    style={tableHeader}
                  >
                    Delivery Boy
                  </th>

                  <th
                    style={tableHeader}
                  >
                    Phone
                  </th>

                  <th
                    style={tableHeader}
                  >
                    Vehicle
                  </th>

                  <th
                    style={tableHeader}
                  >
                    Status
                  </th>

                  <th
                    style={tableHeader}
                  >
                    Created
                  </th>

                  <th
                    style={{
                      ...tableHeader,
                      textAlign:
                        'right',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(
                  (row) => {
                    const active =
                      row.data
                        .is_active !==
                      false;

                    const busy =
                      busyId ===
                      row.id;

                    return (
                      <tr key={row.id}>
                        <td
                          style={
                            tableCell
                          }
                        >
                          <div
                            style={
                              personWrap
                            }
                          >
                            <div
                              style={
                                avatar
                              }
                            >
                              {text(
                                row.data
                                  .name,
                              )
                                .slice(
                                  0,
                                  1,
                                )
                                .toUpperCase() ||
                                'D'}
                            </div>

                            <div>
                              <div
                                style={
                                  personName
                                }
                              >
                                {text(
                                  row.data
                                    .name,
                                ) ||
                                  'Delivery Boy'}
                              </div>

                              <div
                                style={
                                  smallText
                                }
                              >
                                ID:{' '}
                                {row.id.slice(
                                  0,
                                  8,
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          style={
                            tableCell
                          }
                        >
                          {text(
                            row.data
                              .phone,
                          ) || '—'}
                        </td>

                        <td
                          style={
                            tableCell
                          }
                        >
                          {text(
                            row.data
                              .vehicle_number,
                          ) || '—'}
                        </td>

                        <td
                          style={
                            tableCell
                          }
                        >
                          <span
                            style={{
                              ...statusBadge,
                              ...(active
                                ? activeBadge
                                : inactiveBadge),
                            }}
                          >
                            {active
                              ? 'Active'
                              : 'Inactive'}
                          </span>
                        </td>

                        <td
                          style={
                            tableCell
                          }
                        >
                          {formatDate(
                            row.data
                              .created_at,
                          )}
                        </td>

                        <td
                          style={{
                            ...tableCell,
                            textAlign:
                              'right',
                          }}
                        >
                          <div
                            style={
                              actionRow
                            }
                          >
                            <button
                              type="button"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                startEdit(
                                  row,
                                )
                              }
                              style={
                                editButton
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void toggleActive(
                                  row,
                                )
                              }
                              style={
                                active
                                  ? disableButton
                                  : enableButton
                              }
                            >
                              {active
                                ? 'Disable'
                                : 'Enable'}
                            </button>

                            <button
                              type="button"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void removeDeliveryBoy(
                                  row,
                                )
                              }
                              style={
                                deleteButton
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>
        {label}
      </div>

      <div style={summaryValue}>
        {value}
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  width: '100%',
};

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 20,
  marginBottom: 22,
};

const pageTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
};

const pageSubtitle: React.CSSProperties = {
  margin: '6px 0 0',
  color: '#667085',
  fontSize: 14,
};

const refreshButton: React.CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 9,
  border: '1px solid #d0d5dd',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(3, minmax(0, 1fr))',
  gap: 12,
  marginBottom: 20,
};

const summaryCard: React.CSSProperties = {
  padding: 16,
  border: '1px solid #e4e7ec',
  borderRadius: 12,
  background: '#fff',
};

const summaryLabel: React.CSSProperties = {
  color: '#667085',
  fontSize: 12,
};

const summaryValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 24,
  fontWeight: 700,
  color: '#101828',
};

const messageBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '12px 14px',
  marginBottom: 16,
  border: '1px solid #f6d28b',
  borderRadius: 10,
  background: '#fffaeb',
  fontSize: 13,
};

const messageClose: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 20,
};

const formCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7ec',
  borderRadius: 14,
  padding: 20,
  marginBottom: 20,
};

const formHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 18,
};

const formTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
};

const formSubtitle: React.CSSProperties = {
  margin: '5px 0 0',
  color: '#667085',
  fontSize: 13,
};

const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(2, minmax(0, 1fr))',
  gap: 14,
};

const fieldWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#344054',
};

const input: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  boxSizing: 'border-box',
  padding: '0 12px',
  border: '1px solid #d0d5dd',
  borderRadius: 9,
  background: '#fff',
  outline: 'none',
  fontSize: 14,
};

const formActions: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 18,
};

const primaryButton: React.CSSProperties = {
  minHeight: 42,
  padding: '0 18px',
  border: 0,
  borderRadius: 9,
  background: '#101010',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButton: React.CSSProperties = {
  minHeight: 42,
  padding: '0 18px',
  border: '1px solid #d0d5dd',
  borderRadius: 9,
  background: '#fff',
  cursor: 'pointer',
};

const cancelEditButton: React.CSSProperties = {
  minHeight: 38,
  padding: '0 14px',
  border: '1px solid #d0d5dd',
  borderRadius: 8,
  background: '#fff',
  cursor: 'pointer',
};

const listCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e7ec',
  borderRadius: 14,
  overflow: 'hidden',
};

const listHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  padding: 20,
  borderBottom: '1px solid #e4e7ec',
};

const listTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 19,
};

const listSubtitle: React.CSSProperties = {
  margin: '5px 0 0',
  color: '#667085',
  fontSize: 13,
};

const searchInput: React.CSSProperties = {
  width: 300,
  maxWidth: '100%',
  minHeight: 40,
  padding: '0 12px',
  border: '1px solid #d0d5dd',
  borderRadius: 8,
  outline: 'none',
};

const emptyState: React.CSSProperties = {
  padding: 40,
  textAlign: 'center',
  color: '#667085',
};

const tableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const tableHeader: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#667085',
  background: '#f9fafb',
  borderBottom: '1px solid #e4e7ec',
};

const tableCell: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid #eaecf0',
  fontSize: 13,
  verticalAlign: 'middle',
};

const personWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const avatar: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f2f4f7',
  fontWeight: 800,
};

const personName: React.CSSProperties = {
  fontWeight: 650,
};

const smallText: React.CSSProperties = {
  marginTop: 3,
  color: '#98a2b3',
  fontSize: 11,
};

const statusBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  padding: '0 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

const activeBadge: React.CSSProperties = {
  background: '#ecfdf3',
  color: '#027a48',
};

const inactiveBadge: React.CSSProperties = {
  background: '#f2f4f7',
  color: '#667085',
};

const actionRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 7,
  flexWrap: 'wrap',
};

const editButton: React.CSSProperties = {
  minHeight: 34,
  padding: '0 11px',
  border: '1px solid #d0d5dd',
  borderRadius: 7,
  background: '#fff',
  cursor: 'pointer',
};

const disableButton: React.CSSProperties = {
  minHeight: 34,
  padding: '0 11px',
  border: '1px solid #f79009',
  borderRadius: 7,
  background: '#fffaeb',
  color: '#b54708',
  cursor: 'pointer',
};

const enableButton: React.CSSProperties = {
  minHeight: 34,
  padding: '0 11px',
  border: '1px solid #12b76a',
  borderRadius: 7,
  background: '#ecfdf3',
  color: '#027a48',
  cursor: 'pointer',
};

const deleteButton: React.CSSProperties = {
  minHeight: 34,
  padding: '0 11px',
  border: '1px solid #fda29b',
  borderRadius: 7,
  background: '#fff',
  color: '#d92d20',
  cursor: 'pointer',
};