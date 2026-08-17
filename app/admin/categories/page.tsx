'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { useRouter } from 'next/navigation';

import { db } from '@/lib/firebase';

type CategoryRecord = {
  id: string;
  name: string;
  subcategories: string[];
  isActive: boolean;
  sortOrder: number;
};

const STARTER_CATEGORIES = [
  {
    id: 'toys',
    name: 'Toys',
    sortOrder: 1,
    subcategories: [
      'Dolls & Pretend Play',
      'Vehicles & Guns',
      'Learning & Creative',
      'Balls & Outdoor',
      'Fun & Fidget',
      'Other Toys',
    ],
  },
  {
    id: 'earrings',
    name: 'Earrings',
    sortOrder: 2,
    subcategories: [
      'Stud',
      'Hoop',
      'Drop',
      'Jhumka',
      'Kids',
      'Other Earrings',
    ],
  },
  {
    id: 'girl-dress',
    name: 'Girl Dress',
    sortOrder: 3,
    subcategories: [
      '0-1 Years',
      '1-2 Years',
      '2-3 Years',
      '3-5 Years',
      '6-8 Years',
      '9-12 Years',
    ],
  },
];

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const slugify = (value: string) =>
  normalize(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  `category-${Date.now()}`;

export default function AdminCategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] =
    useState<CategoryRecord[]>([]);
  const [selectedId, setSelectedId] =
    useState('');
  const [mainCategoryName, setMainCategoryName] =
    useState('');
  const [subCategoryName, setSubCategoryName] =
    useState('');
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [message, setMessage] =
    useState('');

  const selected = useMemo(
    () =>
      categories.find(
        (item) => item.id === selectedId,
      ) || null,
    [categories, selectedId],
  );

  async function loadCategories() {
    if (!db) {
      setMessage('Firebase is not available.');
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'ProductCategories'),
          orderBy('sort_order', 'asc'),
        ),
      );

      const loaded = snapshot.docs.map((item) => {
        const data = item.data();

        return {
          id: item.id,
          name: String(data.name || '').trim(),
          subcategories: Array.isArray(data.subcategories)
            ? data.subcategories
                .map((value) => String(value).trim())
                .filter(Boolean)
            : [],
          isActive: data.is_active !== false,
          sortOrder: Number(data.sort_order) || 0,
        } satisfies CategoryRecord;
      });

      setCategories(loaded);

      if (
        loaded.length &&
        !loaded.some((item) => item.id === selectedId)
      ) {
        setSelectedId(loaded[0].id);
      }
    } catch (error) {
      console.error(error);
      setMessage('Unable to load categories.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  async function seedStarterCategories() {
    if (!db || saving) return;

    setSaving(true);
    setMessage('Creating starter categories…');

    try {
      for (const category of STARTER_CATEGORIES) {
        await setDoc(
          doc(db, 'ProductCategories', category.id),
          {
            name: category.name,
            normalized_name:
              category.name.toLowerCase(),
            subcategories: category.subcategories,
            is_active: true,
            sort_order: category.sortOrder,
            updated_at: serverTimestamp(),
            created_at: serverTimestamp(),
          },
          { merge: true },
        );
      }

      setMessage(
        'Starter categories created. Existing products were not changed.',
      );

      await loadCategories();
    } catch (error) {
      console.error(error);
      setMessage('Unable to create starter categories.');
    } finally {
      setSaving(false);
    }
  }

  async function addMainCategory(event: FormEvent) {
    event.preventDefault();

    if (!db || saving) return;

    const name = normalize(mainCategoryName);

    if (!name) {
      setMessage('Enter a main category name.');
      return;
    }

    if (
      categories.some(
        (item) =>
          item.name.toLowerCase() ===
          name.toLowerCase(),
      )
    ) {
      setMessage('That main category already exists.');
      return;
    }

    setSaving(true);

    try {
      const id = slugify(name);

      await setDoc(
        doc(db, 'ProductCategories', id),
        {
          name,
          normalized_name: name.toLowerCase(),
          subcategories: [],
          is_active: true,
          sort_order: categories.length + 1,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );

      setMainCategoryName('');
      setSelectedId(id);
      setMessage(
        `${name} created. Existing product data was not changed.`,
      );

      await loadCategories();
    } catch (error) {
      console.error(error);
      setMessage('Unable to create main category.');
    } finally {
      setSaving(false);
    }
  }

  async function addSubCategory(event: FormEvent) {
    event.preventDefault();

    if (!db || !selected || saving) return;

    const name = normalize(subCategoryName);

    if (!name) {
      setMessage('Enter a subcategory name.');
      return;
    }

    if (
      selected.subcategories.some(
        (item) =>
          item.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setMessage('That subcategory already exists.');
      return;
    }

    setSaving(true);

    try {
      await updateDoc(
        doc(db, 'ProductCategories', selected.id),
        {
          subcategories: arrayUnion(name),
          updated_at: serverTimestamp(),
        },
      );

      setSubCategoryName('');
      setMessage(
        `${name} added under ${selected.name}.`,
      );

      await loadCategories();
    } catch (error) {
      console.error(error);
      setMessage('Unable to add subcategory.');
    } finally {
      setSaving(false);
    }
  }

  async function removeSubCategory(name: string) {
    if (!db || !selected || saving) return;

    const confirmed = window.confirm(
      `Remove "${name}" from ${selected.name}?\n\nThis only removes the category option. Existing BusinessProducts will NOT be deleted or modified.`,
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      await updateDoc(
        doc(db, 'ProductCategories', selected.id),
        {
          subcategories: arrayRemove(name),
          updated_at: serverTimestamp(),
        },
      );

      setMessage(
        `${name} removed from the category list. Existing product data is unchanged.`,
      );

      await loadCategories();
    } catch (error) {
      console.error(error);
      setMessage('Unable to remove subcategory.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(category: CategoryRecord) {
    if (!db || saving) return;

    setSaving(true);

    try {
      await updateDoc(
        doc(db, 'ProductCategories', category.id),
        {
          is_active: !category.isActive,
          updated_at: serverTimestamp(),
        },
      );

      setMessage(
        `${category.name} ${
          category.isActive ? 'hidden' : 'enabled'
        }. Existing products are unchanged.`,
      );

      await loadCategories();
    } catch (error) {
      console.error(error);
      setMessage('Unable to update category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={topRowStyle}>
        <div>
          <h1 style={titleStyle}>Product Categories</h1>
          <p style={subtitleStyle}>
            Create Main Categories and Sub Categories used by
            new products. Existing BusinessProducts are never
            rewritten by this page.
          </p>
        </div>

        <button
          type="button"
          style={secondaryButton}
          onClick={() =>
            router.push('/admin/products/new')
          }
        >
          Back to Add Product
        </button>
      </div>

      {message && (
        <div style={messageStyle}>{message}</div>
      )}

      <section style={safeNoticeStyle}>
        <strong>Existing inventory is safe.</strong>
        <span>
          Changes here control dropdown options only. Current
          products, stock, prices, media and orders are not
          modified.
        </span>
      </section>

      {loading ? (
        <section style={cardStyle}>
          Loading categories…
        </section>
      ) : categories.length === 0 ? (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>
            Start your category list
          </h2>
          <p style={bodyTextStyle}>
            Create the three current SPOTC categories in one
            click.
          </p>
          <button
            type="button"
            onClick={() => void seedStarterCategories()}
            style={primaryButton}
            disabled={saving}
          >
            Create Toys, Earrings & Girl Dress
          </button>
        </section>
      ) : null}

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>
            Main Categories
          </h2>

          <div style={categoryListStyle}>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() =>
                  setSelectedId(category.id)
                }
                style={{
                  ...categoryButtonStyle,
                  ...(selectedId === category.id
                    ? selectedCategoryStyle
                    : {}),
                  opacity: category.isActive ? 1 : 0.55,
                }}
              >
                <span>{category.name}</span>
                <small>
                  {category.subcategories.length} subcategories
                </small>
              </button>
            ))}
          </div>

          <form
            onSubmit={addMainCategory}
            style={{ marginTop: 18 }}
          >
            <label style={labelStyle}>
              New Main Category
            </label>
            <div style={inputRowStyle}>
              <input
                value={mainCategoryName}
                onChange={(event) =>
                  setMainCategoryName(event.target.value)
                }
                placeholder="Example: Hair Accessories"
                style={inputStyle}
              />
              <button
                type="submit"
                style={primaryButton}
                disabled={saving}
              >
                Add
              </button>
            </div>
          </form>
        </section>

        <section style={cardStyle}>
          {!selected ? (
            <p style={bodyTextStyle}>
              Select a main category.
            </p>
          ) : (
            <>
              <div style={selectedHeadStyle}>
                <div>
                  <small style={eyebrowStyle}>
                    SELECTED CATEGORY
                  </small>
                  <h2 style={sectionTitleStyle}>
                    {selected.name}
                  </h2>
                </div>

                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() =>
                    void toggleCategory(selected)
                  }
                  disabled={saving}
                >
                  {selected.isActive ? 'Hide' : 'Enable'}
                </button>
              </div>

              <form onSubmit={addSubCategory}>
                <label style={labelStyle}>
                  Add Sub Category
                </label>
                <div style={inputRowStyle}>
                  <input
                    value={subCategoryName}
                    onChange={(event) =>
                      setSubCategoryName(event.target.value)
                    }
                    placeholder={
                      selected.name === 'Girl Dress'
                        ? 'Example: 3-5 Years'
                        : 'Example: Dolls & Pretend Play'
                    }
                    style={inputStyle}
                  />
                  <button
                    type="submit"
                    style={primaryButton}
                    disabled={saving}
                  >
                    Add
                  </button>
                </div>
              </form>

              <div style={subListStyle}>
                {selected.subcategories.length === 0 ? (
                  <div style={emptyStyle}>
                    No subcategories yet.
                  </div>
                ) : (
                  selected.subcategories.map((name) => (
                    <div key={name} style={subItemStyle}>
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void removeSubCategory(name)
                        }
                        style={removeButton}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { maxWidth: 1180 };
const topRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 };
const titleStyle: React.CSSProperties = { margin: '0 0 6px', fontSize: 30 };
const subtitleStyle: React.CSSProperties = { maxWidth: 720, margin: 0, color: '#666', lineHeight: 1.55 };
const safeNoticeStyle: React.CSSProperties = { display: 'grid', gap: 4, marginBottom: 18, padding: 15, border: '1px solid #bde5ca', borderRadius: 14, color: '#165a31', background: '#effaf3', fontSize: 13 };
const layoutStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 };
const cardStyle: React.CSSProperties = { padding: 22, border: '1px solid #e5e5e5', borderRadius: 18, background: '#fff' };
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 16px', fontSize: 20 };
const bodyTextStyle: React.CSSProperties = { color: '#666', lineHeight: 1.5 };
const categoryListStyle: React.CSSProperties = { display: 'grid', gap: 9 };
const categoryButtonStyle: React.CSSProperties = { width: '100%', padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #e1e1e1', borderRadius: 12, color: '#222', background: '#fff', cursor: 'pointer', textAlign: 'left', fontWeight: 850 };
const selectedCategoryStyle: React.CSSProperties = { borderColor: '#111', color: '#fff', background: '#111' };
const selectedHeadStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 };
const eyebrowStyle: React.CSSProperties = { color: '#b06a00', fontWeight: 900, letterSpacing: '0.09em' };
const inputRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', border: '1px solid #dcdcdc', borderRadius: 11, fontSize: 14, outline: 'none', background: '#fff' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 900, color: '#555' };
const primaryButton: React.CSSProperties = { border: 0, borderRadius: 11, padding: '12px 16px', color: '#fff', background: '#111', fontWeight: 900, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 11, padding: '11px 16px', color: '#222', background: '#fff', fontWeight: 850, cursor: 'pointer' };
const subListStyle: React.CSSProperties = { display: 'grid', gap: 8, marginTop: 20 };
const subItemStyle: React.CSSProperties = { minHeight: 46, padding: '9px 11px 9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #e6e6e6', borderRadius: 12, background: '#fafafa', fontWeight: 800 };
const removeButton: React.CSSProperties = { border: '1px solid #f0c9c9', borderRadius: 9, padding: '7px 10px', color: '#b42318', background: '#fff', fontWeight: 850, cursor: 'pointer' };
const emptyStyle: React.CSSProperties = { padding: 18, border: '1px dashed #ddd', borderRadius: 12, color: '#777', textAlign: 'center' };
const messageStyle: React.CSSProperties = { marginBottom: 16, padding: 14, border: '1px solid #f2d8a5', borderRadius: 12, background: '#fff7e8', fontWeight: 750 };