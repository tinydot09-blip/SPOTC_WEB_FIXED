'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';

type ProductRow = { id: string; data: DocumentData };
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type StatusFilter = 'all' | 'active' | 'hidden';
type GiftFilter = 'all' | 'gift' | 'not_gift';
type LocationFilter = 'all' | 'set' | 'missing';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'name_az'
  | 'name_za'
  | 'price_low'
  | 'price_high'
  | 'stock_low'
  | 'stock_high';

type EditForm = {
  title: string;
  brand: string;
  mainCategory: string;
  subCategory: string;
  childCategory: string;
  color: string;
  size: string;
  description: string;
  purchaseCost: string;
  mrp: string;
  sellingPrice: string;
  offerPrice: string;
  sku: string;
  qrCode: string;
  stockQty: string;
  rack: string;
  box: string;
  slot: string;
  freeGiftEligible: boolean;
  freeGiftValue: string;
  isActive: boolean;
};

const PAGE_SIZE_OPTIONS = [10, 20, 100];

function productImage(data: DocumentData): string {
  const images = Array.isArray(data.images) ? data.images : [];
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

function titleOf(data: DocumentData): string {
  return String(data.title || data.product_name || 'Product').trim();
}

function categoryOf(data: DocumentData): string {
  return String(data.main_category || data.category || '').trim();
}

function mrpOf(data: DocumentData): number {
  return Number(data.mrp ?? data.old_price ?? 0) || 0;
}

function sellingPriceOf(data: DocumentData): number {
  return Number(
    data.selling_price ??
      data.price ??
      data.offer_price ??
      data.mrp ??
      0,
  ) || 0;
}

function offerPriceOf(data: DocumentData): number {
  const offer = Number(data.offer_price ?? 0) || 0;
  const selling = sellingPriceOf(data);
  return offer > 0 && (selling <= 0 || offer < selling) ? offer : 0;
}

function displayPriceOf(data: DocumentData): number {
  return offerPriceOf(data) || sellingPriceOf(data);
}

function stockOf(data: DocumentData): number {
  return Math.max(
    0,
    Number(data.stock_qty ?? data.stock_quantity ?? 0) || 0,
  );
}

function reservedOf(data: DocumentData): number {
  return Math.max(0, Number(data.reserved_qty ?? 0) || 0);
}

function soldOf(data: DocumentData): number {
  return Math.max(0, Number(data.sold_qty ?? 0) || 0);
}

function availableOf(data: DocumentData): number {
  const stock = stockOf(data);
  const reserved = reservedOf(data);
  const stored = Number(data.available_qty);

  if (Number.isFinite(stored) && stored >= 0) {
    return Math.max(0, stored);
  }

  return Math.max(0, stock - reserved);
}

function createdMillis(data: DocumentData): number {
  const value = data.created_at;
  if (value?.toMillis) return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function money(value: string): number {
  return Number(value.replace(/[^0-9.]/g, '')) || 0;
}

function locationParts(data: DocumentData) {
  return {
    rack: String(data.rack ?? data.rack_location ?? '').trim(),
    box: String(data.box ?? data.box_location ?? '').trim(),
    slot: String(data.slot ?? data.slot_location ?? '').trim(),
  };
}

function hasLocation(data: DocumentData): boolean {
  const { rack, box, slot } = locationParts(data);
  return Boolean(rack || box || slot);
}

function productStatus(data: DocumentData) {
  if (data.isActive === false) return 'Hidden' as const;
  if (stockOf(data) <= 0) return 'Out of stock' as const;
  return 'Active' as const;
}

function editFormFromProduct(data: DocumentData): EditForm {
  return {
    title: titleOf(data),
    brand: String(data.brand ?? ''),
    mainCategory: String(data.main_category ?? data.category ?? ''),
    subCategory: String(data.sub_category ?? ''),
    childCategory: String(data.child_category ?? ''),
    color: String(data.color ?? ''),
    size: String(data.size ?? ''),
    description: String(data.description ?? data.ai_description ?? ''),
    purchaseCost: String(data.purchase_cost ?? ''),
    mrp: String(data.mrp ?? data.old_price ?? ''),
    sellingPrice: String(
      data.selling_price ?? data.price ?? data.offer_price ?? '',
    ),
    offerPrice: String(offerPriceOf(data) || ''),
    sku: String(data.sku ?? ''),
    qrCode: String(data.qr_code ?? data.qr_sticker_id ?? ''),
    stockQty: String(data.stock_qty ?? data.stock_quantity ?? 0),
    rack: String(data.rack ?? data.rack_location ?? ''),
    box: String(data.box ?? data.box_location ?? ''),
    slot: String(data.slot ?? data.slot_location ?? ''),
    freeGiftEligible: data.free_gift_eligible === true,
    freeGiftValue: String(data.free_gift_value ?? ''),
    isActive: data.isActive !== false,
  };
}

export default function AdminProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [giftFilter, setGiftFilter] = useState<GiftFilter>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadProducts(showLoader = true) {
    if (!db) {
      setLoading(false);
      setMessage('Firebase is not available.');
      return;
    }

    if (showLoader) setLoading(true);

    try {
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, 'BusinessProducts'),
            orderBy('created_at', 'desc'),
          ),
        );
      } catch {
        snap = await getDocs(collection(db, 'BusinessProducts'));
      }

      setRows(
        snap.docs
          .map((item) => ({ id: item.id, data: item.data() }))
          .filter(({ data }) => data.isDeleted !== true),
      );
      setMessage('');
    } catch (error) {
      console.error('Load products failed:', error);
      setMessage(
        error instanceof Error
          ? `Load failed: ${error.message}`
          : 'Failed to load products.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(rows.map(({ data }) => categoryOf(data)).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const summary = useMemo(() => {
    const active = rows.filter(({ data }) => data.isActive !== false).length;
    const lowStock = rows.filter(({ data }) => {
      const stock = stockOf(data);
      return stock > 0 && stock <= 2;
    }).length;
    const outStock = rows.filter(({ data }) => stockOf(data) <= 0).length;
    const gifts = rows.filter(({ data }) => data.free_gift_eligible === true).length;
    const missingLocation = rows.filter(({ data }) => !hasLocation(data)).length;
    const unitsSold = rows.reduce((sum, { data }) => sum + soldOf(data), 0);
    const reservedUnits = rows.reduce((sum, { data }) => sum + reservedOf(data), 0);

    return {
      total: rows.length,
      active,
      lowStock,
      outStock,
      gifts,
      missingLocation,
      unitsSold,
      reservedUnits,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const next = rows.filter(({ id, data }) => {
      if (needle) {
        const searchable = [
          id,
          data.title,
          data.product_name,
          data.brand,
          data.sku,
          data.qr_code,
          data.qr_sticker_id,
          data.main_category,
          data.category,
          data.sub_category,
          data.child_category,
          data.color,
          data.size,
          data.rack,
          data.box,
          data.slot,
        ];

        if (
          !searchable.some((value) =>
            String(value ?? '').toLowerCase().includes(needle),
          )
        ) {
          return false;
        }
      }

      if (categoryFilter !== 'all' && categoryOf(data) !== categoryFilter) {
        return false;
      }

      const stock = stockOf(data);
      if (stockFilter === 'in_stock' && stock <= 2) return false;
      if (stockFilter === 'low_stock' && !(stock > 0 && stock <= 2)) return false;
      if (stockFilter === 'out_of_stock' && stock > 0) return false;

      if (statusFilter === 'active' && data.isActive === false) return false;
      if (statusFilter === 'hidden' && data.isActive !== false) return false;

      if (giftFilter === 'gift' && data.free_gift_eligible !== true) return false;
      if (giftFilter === 'not_gift' && data.free_gift_eligible === true) return false;

      if (locationFilter === 'set' && !hasLocation(data)) return false;
      if (locationFilter === 'missing' && hasLocation(data)) return false;

      return true;
    });

    next.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return createdMillis(a.data) - createdMillis(b.data);
        case 'name_az':
          return titleOf(a.data).localeCompare(titleOf(b.data));
        case 'name_za':
          return titleOf(b.data).localeCompare(titleOf(a.data));
        case 'price_low':
          return displayPriceOf(a.data) - displayPriceOf(b.data);
        case 'price_high':
          return displayPriceOf(b.data) - displayPriceOf(a.data);
        case 'stock_low':
          return stockOf(a.data) - stockOf(b.data);
        case 'stock_high':
          return stockOf(b.data) - stockOf(a.data);
        default:
          return createdMillis(b.data) - createdMillis(a.data);
      }
    });

    return next;
  }, [
    rows,
    search,
    categoryFilter,
    stockFilter,
    statusFilter,
    giftFilter,
    locationFilter,
    sortBy,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    categoryFilter,
    stockFilter,
    statusFilter,
    giftFilter,
    locationFilter,
    sortBy,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const pageStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filtered.length);

  function openEdit(row: ProductRow) {
    setEditing(row);
    setEditForm(editFormFromProduct(row.data));
    setMessage('');
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditing(null);
    setEditForm(null);
  }

  function updateEditField(field: keyof EditForm, value: string | boolean) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveEdit() {
    if (!db || !editing || !editForm) return;
    if (!editForm.title.trim()) {
      setMessage('Product name is required.');
      return;
    }

    const sellingPrice = money(editForm.sellingPrice);
    if (sellingPrice <= 0) {
      setMessage('Selling Price is required.');
      return;
    }

    setSavingEdit(true);

    try {
      const stock = Math.max(
        0,
        Number.parseInt(editForm.stockQty || '0', 10) || 0,
      );
      const reserved = reservedOf(editing.data);
      const available = Math.max(0, stock - reserved);

      const mrp = money(editForm.mrp);
      const purchaseCost = money(editForm.purchaseCost);
      const offerPrice = money(editForm.offerPrice);
      const finalCustomerPrice =
        offerPrice > 0 && offerPrice < sellingPrice
          ? offerPrice
          : sellingPrice;

      const discount =
        mrp > finalCustomerPrice && mrp > 0
          ? `${Math.round(
              ((mrp - finalCustomerPrice) / mrp) * 100,
            )}% OFF`
          : '';

      const payload = {
        title: editForm.title.trim(),
        product_name: editForm.title.trim(),
        brand: editForm.brand.trim(),
        category: editForm.mainCategory.trim(),
        main_category: editForm.mainCategory.trim(),
        sub_category: editForm.subCategory.trim(),
        child_category: editForm.childCategory.trim(),
        color: editForm.color.trim(),
        size: editForm.size.trim(),
        description: editForm.description.trim(),
        ai_description: editForm.description.trim(),
        purchase_cost: purchaseCost,
        price: finalCustomerPrice,
        selling_price: sellingPrice,
        offer_price:
          offerPrice > 0 && offerPrice < sellingPrice
            ? offerPrice
            : 0,
        mrp,
        old_price: mrp,
        discount,
        sku: editForm.sku.trim(),
        qr_code: editForm.qrCode.trim(),
        qr_sticker_id: editForm.qrCode.trim(),
        stock_qty: stock,
        stock_quantity: stock,
        reserved_qty: reserved,
        available_qty: available,
        sold_qty: soldOf(editing.data),
        is_in_stock: available > 0,
        rack: editForm.rack.trim(),
        rack_location: editForm.rack.trim(),
        box: editForm.box.trim(),
        box_location: editForm.box.trim(),
        slot: editForm.slot.trim(),
        slot_location: editForm.slot.trim(),
        storage_location: [
          editForm.rack.trim(),
          editForm.box.trim(),
          editForm.slot.trim(),
        ]
          .filter(Boolean)
          .join(' / '),
        free_gift_eligible: editForm.freeGiftEligible,
        free_gift_value: money(editForm.freeGiftValue),
        isActive: editForm.isActive,
        isDeleted: false,
        updated_at: serverTimestamp(),
      };

      await updateDoc(doc(db, 'BusinessProducts', editing.id), payload);

      setRows((prev) =>
        prev.map((row) =>
          row.id === editing.id
            ? { ...row, data: { ...row.data, ...payload } }
            : row,
        ),
      );

      setEditing(null);
      setEditForm(null);
      setMessage('Product updated successfully.');
    } catch (error) {
      console.error('Edit product failed:', error);
      setMessage(
        error instanceof Error
          ? `Update failed: ${error.message}`
          : 'Product update failed.',
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function adjustStock(row: ProductRow, delta: number) {
    if (!db || busyId) return;
    setBusyId(row.id);

    try {
      const ref = doc(db, 'BusinessProducts', row.id);
      const nextStock = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('Product no longer exists.');

        const currentData = snap.data();
        const current = stockOf(currentData);
        const reserved = reservedOf(currentData);
        const next = Math.max(0, current + delta);
        const available = Math.max(0, next - reserved);

        transaction.update(ref, {
          stock_qty: next,
          stock_quantity: next,
          reserved_qty: reserved,
          available_qty: available,
          is_in_stock: available > 0,
          updated_at: serverTimestamp(),
        });

        return { stock: next, reserved, available };
      });

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  stock_qty: nextStock.stock,
                  stock_quantity: nextStock.stock,
                  reserved_qty: nextStock.reserved,
                  available_qty: nextStock.available,
                  is_in_stock: nextStock.available > 0,
                },
              }
            : item,
        ),
      );
    } catch (error) {
      console.error('Stock update failed:', error);
      setMessage(
        error instanceof Error
          ? `Stock update failed: ${error.message}`
          : 'Stock update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function toggleActive(row: ProductRow) {
    if (!db || busyId) return;
    const nextActive = row.data.isActive === false;
    setBusyId(row.id);

    try {
      await updateDoc(doc(db, 'BusinessProducts', row.id), {
        isActive: nextActive,
        updated_at: serverTimestamp(),
      });

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, data: { ...item.data, isActive: nextActive } }
            : item,
        ),
      );

      setMessage(nextActive ? 'Product activated.' : 'Product hidden from Shop.');
    } catch (error) {
      console.error('Status update failed:', error);
      setMessage(
        error instanceof Error
          ? `Status update failed: ${error.message}`
          : 'Status update failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function deleteProduct(row: ProductRow) {
    if (!db || busyId) return;

    const confirmed = window.confirm(
      `Permanently delete "${titleOf(row.data)}"?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyId(row.id);

    try {
      await deleteDoc(doc(db, 'BusinessProducts', row.id));
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setMessage('Product deleted permanently.');
    } catch (error) {
      console.error('Delete product failed:', error);
      setMessage(
        error instanceof Error ? `Delete failed: ${error.message}` : 'Delete failed.',
      );
    } finally {
      setBusyId('');
    }
  }

  function clearFilters() {
    setSearch('');
    setCategoryFilter('all');
    setStockFilter('all');
    setStatusFilter('all');
    setGiftFilter('all');
    setLocationFilter('all');
    setSortBy('newest');
  }

  return (
    <div>
      <div style={pageHeader}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 400 }}>Products</h1>
          <p style={{ margin: 0, color: '#666' }}>
            Manage products, pricing, stock and inventory locations.
          </p>
        </div>

        <div style={headerActions}>
          <button type="button" onClick={() => void loadProducts(false)} style={secondaryButton}>
            ↻ Refresh
          </button>
          <a href="/admin/products/new" style={addButton}>+ Add Product</a>
        </div>
      </div>

      <div style={summaryGrid}>
        <SummaryCard label="Total Products" value={summary.total} />
        <SummaryCard label="Active" value={summary.active} />
        <SummaryCard label="Low Stock ≤ 2" value={summary.lowStock} danger={summary.lowStock > 0} />
        <SummaryCard label="Out of Stock" value={summary.outStock} danger={summary.outStock > 0} />
        <SummaryCard label="Units Sold" value={summary.unitsSold} />
        <SummaryCard label="Reserved" value={summary.reservedUnits} />
        <SummaryCard label="Free Gifts" value={summary.gifts} />
        <SummaryCard label="Location Missing" value={summary.missingLocation} warning={summary.missingLocation > 0} />
      </div>

      <div style={controlsCard}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search product, SKU, QR, category, colour, rack, box…"
          style={searchInput}
        />

        <div style={filterGrid}>
          <SelectControl label="Category" value={categoryFilter} onChange={setCategoryFilter}>
            <option value="all">All Categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SelectControl>

          <SelectControl label="Stock" value={stockFilter} onChange={(value) => setStockFilter(value as StockFilter)}>
            <option value="all">All Stock</option>
            <option value="in_stock">In Stock &gt; 2</option>
            <option value="low_stock">Low Stock 1–2</option>
            <option value="out_of_stock">Out of Stock</option>
          </SelectControl>

          <SelectControl label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </SelectControl>

          <SelectControl label="Free Gift" value={giftFilter} onChange={(value) => setGiftFilter(value as GiftFilter)}>
            <option value="all">All Products</option>
            <option value="gift">Free Gift Eligible</option>
            <option value="not_gift">Not Free Gift</option>
          </SelectControl>

          <SelectControl label="Location" value={locationFilter} onChange={(value) => setLocationFilter(value as LocationFilter)}>
            <option value="all">All Locations</option>
            <option value="set">Location Set</option>
            <option value="missing">Location Missing</option>
          </SelectControl>

          <SelectControl label="Sort" value={sortBy} onChange={(value) => setSortBy(value as SortOption)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_az">Name A–Z</option>
            <option value="name_za">Name Z–A</option>
            <option value="price_low">Price Low–High</option>
            <option value="price_high">Price High–Low</option>
            <option value="stock_low">Stock Low–High</option>
            <option value="stock_high">Stock High–Low</option>
          </SelectControl>
        </div>

        <div style={filterFooter}>
          <div style={resultCount}>{filtered.length} matching product{filtered.length === 1 ? '' : 's'}</div>
          <button type="button" onClick={clearFilters} style={clearButton}>Clear Filters</button>
        </div>
      </div>

      {message && (
        <div style={messageBox}>
          {message}
          <button type="button" onClick={() => setMessage('')} style={messageClose}>×</button>
        </div>
      )}

      <div style={tableCard}>
        {loading ? (
          <div style={{ padding: 26 }}>Loading products…</div>
        ) : filtered.length === 0 ? (
          <div style={emptyState}>
            <div style={{ fontWeight: 400 }}>No matching products</div>
            <div style={{ color: '#777' }}>Try clearing some filters or add a new product.</div>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRow}>
                {['Product', 'SKU / QR', 'MRP', 'Sell', 'Offer', 'Stock', 'Sold', 'Location', 'Gift', 'Status', ''].map((heading) => (
                  <th key={heading} style={tableHeadCell}>{heading}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {paginated.map((row) => {
                const { id, data } = row;
                const image = productImage(data);
                const stock = stockOf(data);
                const reserved = reservedOf(data);
                const available = availableOf(data);
                const sold = soldOf(data);
                const mrp = mrpOf(data);
                const sellingPrice = sellingPriceOf(data);
                const offerPrice = offerPriceOf(data);
                const { rack, box, slot } = locationParts(data);
                const status = productStatus(data);
                const busy = busyId === id;

                return (
                  <tr key={id} style={tableRow}>
                    <td style={productCell}>
                      <button type="button" onClick={() => openEdit(row)} style={productButton}>
                        {image ? (
                          <img src={image} alt="" style={productThumb} />
                        ) : (
                          <div style={productPlaceholder} />
                        )}
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                          <div style={productTitle}>{titleOf(data)}</div>
                          <div style={productMeta}>{categoryOf(data) || 'Uncategorised'}</div>
                          <div style={productId}>{id}</div>
                        </div>
                      </button>
                    </td>

                    <td style={normalCell}>
                      <div style={{ fontWeight: 400 }}>{data.sku || '—'}</div>
                      <div style={mutedText}>{data.qr_code || data.qr_sticker_id || '—'}</div>
                    </td>

                    <td style={priceCell}>{mrp > 0 ? `₹${mrp}` : '—'}</td>

                    <td style={priceCell}>
                      {sellingPrice > 0 ? `₹${sellingPrice}` : '—'}
                    </td>

                    <td style={priceCell}>
                      {offerPrice > 0 ? (
                        <span style={offerPriceBadge}>₹{offerPrice}</span>
                      ) : (
                        <span style={mutedText}>—</span>
                      )}
                    </td>

                    <td style={normalCell}>
                      <div style={stockControl}>
                        <button
                          type="button"
                          title="Reduce physical stock"
                          aria-label="Reduce physical stock"
                          disabled={busy || stock <= 0}
                          onClick={() => void adjustStock(row, -1)}
                          style={{ ...stockButton, opacity: busy || stock <= 0 ? 0.4 : 1 }}
                        >
                          −
                        </button>

                        <div>
                          <div
                            style={{
                              ...stockNumber,
                              color: available <= 2 ? '#b42318' : '#111',
                            }}
                            title={`Physical stock: ${stock}`}
                          >
                            {available}
                          </div>
                          <div style={stockSubText}>
                            {reserved > 0
                              ? `${reserved} reserved`
                              : `${stock} physical`}
                          </div>
                        </div>

                        <button
                          type="button"
                          title="Increase physical stock"
                          aria-label="Increase physical stock"
                          disabled={busy}
                          onClick={() => void adjustStock(row, 1)}
                          style={{ ...stockButton, opacity: busy ? 0.4 : 1 }}
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td style={normalCell}>
                      <span style={soldBadge}>{sold}</span>
                    </td>

                    <td style={normalCell}>
                      {rack || box || slot ? (
                        <div>
                          <div style={{ fontWeight: 400 }}>{rack || 'Rack —'}</div>
                          <div style={mutedText}>{[box, slot].filter(Boolean).join(' • ') || '—'}</div>
                        </div>
                      ) : (
                        <span style={missingLocation}>Location missing</span>
                      )}
                    </td>

                    <td style={normalCell}>
                      {data.free_gift_eligible === true ? <span style={giftBadge}>Gift</span> : <span style={mutedText}>—</span>}
                    </td>

                    <td style={normalCell}><StatusBadge status={status} /></td>

                    <td style={actionsCell}>
                      <div style={actionRow}>
                        <button
                          type="button"
                          title="Edit product"
                          aria-label="Edit product"
                          onClick={() => openEdit(row)}
                          style={iconEditButton}
                        >
                          ✎
                        </button>

                        <button
                          type="button"
                          title={data.isActive === false ? 'Activate product' : 'Hide product'}
                          aria-label={data.isActive === false ? 'Activate product' : 'Hide product'}
                          disabled={busy}
                          onClick={() => void toggleActive(row)}
                          style={{ ...iconActionButton, opacity: busy ? 0.45 : 1 }}
                        >
                          {data.isActive === false ? '◉' : '⊘'}
                        </button>

                        <button
                          type="button"
                          title="Delete product permanently"
                          aria-label="Delete product permanently"
                          disabled={busy}
                          onClick={() => void deleteProduct(row)}
                          style={{ ...iconDeleteButton, opacity: busy ? 0.45 : 1 }}
                        >
                          🗑
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
          <div style={paginationInfo}>Showing {pageStart}–{pageEnd} of {filtered.length}</div>
          <div style={paginationRight}>
            <label style={rowsLabel}>
              Rows
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number(event.target.value);
                  setPageSize(nextSize);
                  setPage(1);
                }}
                style={pageSizeSelect}
              >
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} style={{ ...pageButton, opacity: page <= 1 ? 0.4 : 1 }}>‹</button>
            <div style={pageNumber}>Page {page} of {totalPages}</div>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} style={{ ...pageButton, opacity: page >= totalPages ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      )}

      {editing && editForm && (
        <div style={modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
          <div style={modalCard}>
            <div style={modalHeader}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 400 }}>Edit Product</h2>
                <div style={mutedText}>{editing.id}</div>
              </div>
              <button type="button" onClick={closeEdit} disabled={savingEdit} style={modalClose}>×</button>
            </div>

            <div style={modalBody}>
              <div style={editMediaStrip}>
                {productImage(editing.data) ? (
                  <img src={productImage(editing.data)} alt="" style={editMainImage} />
                ) : (
                  <div style={editImagePlaceholder}>No image</div>
                )}
                <div>
                  <div style={{ fontWeight: 400 }}>Current Media</div>
                  <div style={mutedText}>Product details, pricing, stock and location can be edited here. Media replacement can be added next.</div>
                </div>
              </div>

              <EditSection title="Basic Details">
                <div style={editGrid3}>
                  <EditField label="Product Name" value={editForm.title} onChange={(value) => updateEditField('title', value)} />
                  <EditField label="Brand" value={editForm.brand} onChange={(value) => updateEditField('brand', value)} />
                  <EditField label="Main Category" value={editForm.mainCategory} onChange={(value) => updateEditField('mainCategory', value)} />
                  <EditField label="Sub Category" value={editForm.subCategory} onChange={(value) => updateEditField('subCategory', value)} />
                  <EditField label="Child Category" value={editForm.childCategory} onChange={(value) => updateEditField('childCategory', value)} />
                  <EditField label="Colour" value={editForm.color} onChange={(value) => updateEditField('color', value)} />
                  <EditField label="Size" value={editForm.size} onChange={(value) => updateEditField('size', value)} />
                </div>
                <label style={modalLabel}>Description</label>
                <textarea value={editForm.description} onChange={(event) => updateEditField('description', event.target.value)} rows={4} style={{ ...modalInput, resize: 'vertical' }} />
              </EditSection>

              <EditSection title="Pricing">
                <div style={editGrid3}>
                  <EditField label="Purchase Cost" value={editForm.purchaseCost} type="number" onChange={(value) => updateEditField('purchaseCost', value)} />
                  <EditField label="MRP" value={editForm.mrp} type="number" onChange={(value) => updateEditField('mrp', value)} />
                  <EditField label="Selling Price" value={editForm.sellingPrice} type="number" onChange={(value) => updateEditField('sellingPrice', value)} />
                  <EditField label="Offer Price (optional)" value={editForm.offerPrice} type="number" onChange={(value) => updateEditField('offerPrice', value)} />
                </div>
              </EditSection>

              <EditSection title="Inventory">
                <div style={editGrid3}>
                  <EditField label="SKU" value={editForm.sku} onChange={(value) => updateEditField('sku', value)} />
                  <EditField label="QR Code" value={editForm.qrCode} onChange={(value) => updateEditField('qrCode', value)} />
                  <EditField label="Stock Quantity" value={editForm.stockQty} type="number" onChange={(value) => updateEditField('stockQty', value)} />
                  <EditField label="Rack" value={editForm.rack} onChange={(value) => updateEditField('rack', value)} />
                  <EditField label="Box" value={editForm.box} onChange={(value) => updateEditField('box', value)} />
                  <EditField label="Slot" value={editForm.slot} onChange={(value) => updateEditField('slot', value)} />
                </div>

                <div style={inventoryInfoGrid}>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Reserved</span>
                    <span>{reservedOf(editing.data)}</span>
                  </div>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Available</span>
                    <span>
                      {Math.max(
                        0,
                        (Number.parseInt(editForm.stockQty || '0', 10) || 0) -
                          reservedOf(editing.data),
                      )}
                    </span>
                  </div>
                  <div style={inventoryInfoCard}>
                    <span style={modalLabel}>Sold</span>
                    <span>{soldOf(editing.data)}</span>
                  </div>
                </div>

                <div style={inventoryNote}>
                  Sold is updated from completed/delivered orders.
                  Manual stock + / − does not change Sold.
                </div>
              </EditSection>

              <EditSection title="Free Gift & Status">
                <div style={checkboxGrid}>
                  <label style={checkRow}><input type="checkbox" checked={editForm.freeGiftEligible} onChange={(event) => updateEditField('freeGiftEligible', event.target.checked)} /> Free Gift Eligible</label>
                  <label style={checkRow}><input type="checkbox" checked={editForm.isActive} onChange={(event) => updateEditField('isActive', event.target.checked)} /> Active and visible in Shop</label>
                </div>

                {editForm.freeGiftEligible && (
                  <div style={{ marginTop: 14, maxWidth: 300 }}>
                    <EditField label="Gift Cost / Value" value={editForm.freeGiftValue} type="number" onChange={(value) => updateEditField('freeGiftValue', value)} />
                  </div>
                )}
              </EditSection>
            </div>

            <div style={modalFooter}>
              <button type="button" onClick={closeEdit} disabled={savingEdit} style={secondaryButton}>Cancel</button>
              <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} style={{ ...modalSaveButton, opacity: savingEdit ? 0.55 : 1 }}>{savingEdit ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, danger = false, warning = false }: { label: string; value: number; danger?: boolean; warning?: boolean }) {
  return (
    <div style={summaryCard}>
      <div style={summaryLabel}>{label}</div>
      <div style={{ ...summaryValue, color: danger ? '#b42318' : warning ? '#b36b00' : '#111' }}>{value}</div>
    </div>
  );
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label style={selectWrap}>
      <span style={filterLabel}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={filterSelect}>{children}</select>
    </label>
  );
}

function StatusBadge({ status }: { status: 'Hidden' | 'Out of stock' | 'Active' }) {
  return <span style={status === 'Active' ? activeBadge : status === 'Hidden' ? hiddenBadge : outBadge}>{status}</span>;
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={editSection}><h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 400 }}>{title}</h3>{children}</section>;
}

function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span style={modalLabel}>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={modalInput} />
    </label>
  );
}

const pageHeader: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' };
const headerActions: React.CSSProperties = { display: 'flex', gap: 9, flexWrap: 'wrap' };
const addButton: React.CSSProperties = { background: '#111', color: 'white', textDecoration: 'none', fontWeight: 400, padding: '12px 18px', borderRadius: 12 };
const secondaryButton: React.CSSProperties = { border: '1px solid #dcdcdc', background: '#fff', color: '#222', fontWeight: 400, padding: '10px 14px', borderRadius: 10, cursor: 'pointer' };
const summaryGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '22px 0' };
const summaryCard: React.CSSProperties = { background: 'white', padding: 16, border: '1px solid #e8e8e8', borderRadius: 14 };
const summaryLabel: React.CSSProperties = { fontSize: 12, color: '#777', fontWeight: 400 };
const summaryValue: React.CSSProperties = { fontSize: 26, fontWeight: 400, marginTop: 4 };
const controlsCard: React.CSSProperties = { background: '#fff', border: '1px solid #e7e7e7', borderRadius: 16, padding: 14, marginBottom: 16 };
const searchInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '13px 15px', border: '1px solid #ddd', borderRadius: 12, fontSize: 15, marginBottom: 12, outline: 'none' };
const filterGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 };
const selectWrap: React.CSSProperties = { display: 'grid', gap: 5 };
const filterLabel: React.CSSProperties = { fontSize: 11, color: '#666', fontWeight: 400 };
const filterSelect: React.CSSProperties = { width: '100%', minWidth: 0, padding: '10px 11px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', fontWeight: 400 };
const filterFooter: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
const resultCount: React.CSSProperties = { fontSize: 12, color: '#666', fontWeight: 400 };
const clearButton: React.CSSProperties = { border: 0, background: 'transparent', color: '#555', fontWeight: 400, cursor: 'pointer' };
const messageBox: React.CSSProperties = { position: 'relative', marginBottom: 14, padding: '12px 44px 12px 14px', border: '1px solid #f0d69a', background: '#fff8e7', borderRadius: 12, fontWeight: 400 };
const messageClose: React.CSSProperties = { position: 'absolute', right: 10, top: 6, border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer' };
const tableCard: React.CSSProperties = { background: 'white', border: '1px solid #e7e7e7', borderRadius: 16, overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 1260 };
const tableHeadRow: React.CSSProperties = { textAlign: 'left', background: '#fafafa' };
const tableHeadCell: React.CSSProperties = { padding: 13, borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap' };
const tableRow: React.CSSProperties = { borderBottom: '1px solid #f0f0f0' };
const normalCell: React.CSSProperties = { padding: 12, fontSize: 13, verticalAlign: 'middle' };
const priceCell: React.CSSProperties = { padding: 10, fontSize: 13, verticalAlign: 'middle', whiteSpace: 'nowrap' };
const offerPriceBadge: React.CSSProperties = { display: 'inline-flex', padding: '4px 7px', background: '#fff2df', color: '#9a5300', borderRadius: 7, fontSize: 12, fontWeight: 400 };
const soldBadge: React.CSSProperties = { display: 'inline-flex', minWidth: 26, justifyContent: 'center', padding: '4px 7px', background: '#eef3ff', color: '#3157a4', borderRadius: 7, fontSize: 12, fontWeight: 400 };
const stockSubText: React.CSSProperties = { marginTop: 2, fontSize: 9, color: '#999', whiteSpace: 'nowrap', textAlign: 'center' };
const productCell: React.CSSProperties = { padding: 12, verticalAlign: 'middle', minWidth: 340 };
const productButton: React.CSSProperties = { border: 0, background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', width: '100%', color: 'inherit' };
const productThumb: React.CSSProperties = { width: 56, height: 56, minWidth: 56, objectFit: 'contain', borderRadius: 10, background: '#eee' };
const productPlaceholder: React.CSSProperties = { width: 56, height: 56, minWidth: 56, borderRadius: 10, background: '#eee' };
const productTitle: React.CSSProperties = { fontWeight: 400, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 };
const productMeta: React.CSSProperties = { fontSize: 12, color: '#777', marginTop: 2 };
const productId: React.CSSProperties = { fontSize: 10, color: '#aaa', marginTop: 2 };
const mutedText: React.CSSProperties = { color: '#777', fontSize: 12 };
const stockControl: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const stockButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #ddd', borderRadius: 8, background: '#fff', fontWeight: 400, fontSize: 18, cursor: 'pointer' };
const stockNumber: React.CSSProperties = { width: 32, textAlign: 'center', fontWeight: 400, fontSize: 15 };
const missingLocation: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#fff1e5', color: '#a34a00', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const giftBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#f0f8e8', color: '#397a0d', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const activeBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#ecf8ef', color: '#137333', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const hiddenBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#efefef', color: '#666', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const outBadge: React.CSSProperties = { display: 'inline-flex', padding: '5px 8px', background: '#fff0f0', color: '#b42318', borderRadius: 8, fontSize: 11, fontWeight: 400 };
const actionsCell: React.CSSProperties = { padding: 8, width: 112, minWidth: 112 };
const actionRow: React.CSSProperties = { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'nowrap' };
const iconEditButton: React.CSSProperties = { width: 30, height: 30, border: 0, background: '#111', color: '#fff', borderRadius: 8, fontSize: 17, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const iconActionButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #ddd', background: '#fff', color: '#222', borderRadius: 8, fontSize: 16, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const iconDeleteButton: React.CSSProperties = { width: 30, height: 30, border: '1px solid #f1c0bd', background: '#fff7f6', color: '#b42318', borderRadius: 8, fontSize: 14, fontWeight: 400, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 };
const emptyState: React.CSSProperties = { padding: 40, display: 'grid', placeItems: 'center', gap: 6 };
const paginationBar: React.CSSProperties = { marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
const paginationInfo: React.CSSProperties = { fontSize: 13, color: '#666', fontWeight: 400 };
const paginationRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const rowsLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 400, color: '#666' };
const pageSizeSelect: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 8, padding: '7px 8px', background: '#fff', fontWeight: 400 };
const pageButton: React.CSSProperties = { width: 34, height: 34, border: '1px solid #ddd', borderRadius: 9, background: '#fff', fontSize: 20, fontWeight: 400, cursor: 'pointer' };
const pageNumber: React.CSSProperties = { minWidth: 100, textAlign: 'center', fontSize: 12, fontWeight: 400 };
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 };
const modalCard: React.CSSProperties = { width: 'min(980px, 100%)', maxHeight: '92vh', background: '#f6f7f9', borderRadius: 20, boxShadow: '0 25px 80px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const modalHeader: React.CSSProperties = { background: '#fff', borderBottom: '1px solid #e7e7e7', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 };
const modalClose: React.CSSProperties = { border: 0, background: '#f2f2f2', width: 36, height: 36, borderRadius: 10, fontSize: 22, cursor: 'pointer' };
const modalBody: React.CSSProperties = { overflowY: 'auto', padding: 18 };
const modalFooter: React.CSSProperties = { background: '#fff', borderTop: '1px solid #e7e7e7', padding: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 };
const modalSaveButton: React.CSSProperties = { border: 0, background: '#111', color: '#fff', padding: '11px 18px', borderRadius: 10, fontWeight: 400, cursor: 'pointer' };
const editMediaStrip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #e7e7e7', marginBottom: 14 };
const editMainImage: React.CSSProperties = { width: 88, height: 88, minWidth: 88, objectFit: 'contain', borderRadius: 12, background: '#eee' };
const editImagePlaceholder: React.CSSProperties = { width: 88, height: 88, minWidth: 88, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#eee', color: '#777', fontSize: 12 };
const editSection: React.CSSProperties = { background: '#fff', border: '1px solid #e7e7e7', borderRadius: 14, padding: 16, marginBottom: 14 };
const editGrid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, marginBottom: 12 };
const modalLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: '#555', fontWeight: 400, marginBottom: 5 };
const modalInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #ddd', borderRadius: 9, fontSize: 14, outline: 'none', background: '#fff' };
const inventoryInfoGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(100px,1fr))', gap: 10, marginTop: 4 };
const inventoryInfoCard: React.CSSProperties = { display: 'grid', gap: 3, padding: 10, borderRadius: 9, background: '#f7f7f7', fontSize: 14, fontWeight: 400 };
const inventoryNote: React.CSSProperties = { marginTop: 10, fontSize: 11, color: '#777', lineHeight: 1.45 };
const checkboxGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 };
const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 };