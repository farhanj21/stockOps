'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import * as api from '@/app/actions';
import { FormField } from '@/components/FormField';
import { Icon } from '@/components/Icon';
import { cap1, fmt, inputVal, money, num, plural, qu, round } from '@/lib/format';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import type { MaterialKind } from '@/lib/types';
import { confirmDialog, toast, useUI, type SetupTab } from '@/lib/ui';

const TABS: [SetupTab, string][] = [
  ['recipes', 'Products & recipes'],
  ['materials', 'Materials'],
];

export function Setup() {
  const tab = useUI((s) => s.setupTab);
  const setUI = useUI((s) => s.set);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Setup
        </h1>
        <div className="page-sub">Admin only. Changes recalculate capacity and orders instantly.</div>
      </div>
      <div className="tabs" role="tablist" aria-label="Setup sections">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className="tab"
            onClick={() => setUI({ setupTab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'materials' ? <Materials /> : <Recipes />}
      </div>
    </div>
  );
}

// ── Products & recipes ──────────────────────────────────────────────────────

/** How complete a product's recipe is: mix lines should add up to 100% of the batch weight. */
function useRecipeStatus() {
  const m = useModel();
  return (productId: string) => {
    const p = m.prodById[productId];
    const bom = m.recipeOf(productId);
    const isMix = (ing: string) => !!m.byId[ing] && m.byId[ing].kind !== 'packaging';
    const mixTotal = bom.reduce((acc, r) => acc + (isMix(r.ing) ? num(r.qty) : 0), 0);
    const pct = (mixTotal / Math.max(num(p.batchKg), 1e-9)) * 100;
    if (!bom.length) return { pct, mixTotal, lines: 0, label: 'No recipe', tone: 'neutral' as const, ok: false };
    const ok = Math.abs(pct - 100) <= 0.005;
    return { pct, mixTotal, lines: bom.length, label: ok ? '100%' : `${pct.toFixed(1)}%`, tone: ok ? ('ok' as const) : ('warn' as const), ok };
  };
}

/**
 * Products on the left, the selected product's settings and recipe on the right.
 * On phones the list and the detail are separate steps, with a back link.
 */
function Recipes() {
  const m = useModel();
  const setupProduct = useUI((s) => s.setupProduct);
  const setUI = useUI((s) => s.set);
  const status = useRecipeStatus();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const products = m.data.products;
  const selected = m.prodById[setupProduct] ?? products[0];
  const creating = adding || !products.length;

  const select = (id: string) => {
    setUI({ setupProduct: id });
    setAdding(false);
    setView('detail');
  };

  return (
    <div className="prod-layout" data-view={creating ? 'detail' : view}>
      <aside className="prod-list card clip" aria-label="Products">
        <div className="prod-list-head">
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong)' }}>Products</div>
            <div className="row-sub">{products.length ? `${products.length} in this plant` : 'None yet'}</div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 38, padding: '0 12px' }}
            onClick={() => {
              setAdding(true);
              setView('detail');
            }}
          >
            <Icon name="plus" size={15} stroke={2.4} />
            New
          </button>
        </div>
        <div className="prod-items">
          {products.map((p) => {
            const st = status(p.id);
            const active = !creating && p.id === selected?.id;
            return (
              <button key={p.id} type="button" className="prod-item" aria-current={active ? 'true' : undefined} onClick={() => select(p.id)}>
                <span className="row-main">
                  <span className="prod-item-name">{p.name}</span>
                  <span className="row-sub">
                    {qu(num(p.batchKg), 'kg')} batch · {st.lines} {st.lines === 1 ? 'material' : 'materials'}
                  </span>
                </span>
                <span className={`pill sm ${st.tone}`}>{st.label}</span>
                <Icon name="chevronRight" size={16} color="var(--subtle)" className="n-only" />
              </button>
            );
          })}
          {!products.length && (
            <div className="empty-inline">
              A product is something you make in batches. Add one, then build its recipe from your materials.
            </div>
          )}
        </div>
      </aside>

      <section className="prod-detail min0">
        {creating ? (
          <>
            {products.length > 0 && (
              <button type="button" className="back-link n-only" onClick={() => setView('list')}>
                <Icon name="chevronLeft" size={16} /> All products
              </button>
            )}
            {!m.ings.length && (
              <div className="stock-hint" style={{ marginBottom: 12 }}>
                Tip: add your materials first (Materials tab or Excel import) so the recipe has something to use.
              </div>
            )}
            <NewProduct
              onCancel={products.length ? () => setAdding(false) : undefined}
              onCreated={(id) => {
                setUI({ setupProduct: id });
                setAdding(false);
              }}
            />
          </>
        ) : (
          selected && <ProductDetail key={selected.id} id={selected.id} onBack={() => setView('list')} />
        )}
      </section>
    </div>
  );
}

function ProductDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const m = useModel();
  const renameProduct = useStore((s) => s.renameProduct);
  const setProductField = useStore((s) => s.setProductField);
  const setBatchKg = useStore((s) => s.setBatchKg);
  const send = useStore((s) => s.send);
  const setUI = useUI((s) => s.set);
  const sp = m.prodById[id];
  const bkg = Math.max(num(sp.batchKg), 1e-9);
  const batchCost = m.batchCost(sp);
  const perCase = m.perCase(sp);
  const capacity = m.capacity(sp, m.total);

  const stats: [string, string][] = [
    ['Cases / batch', fmt(perCase)],
    ['Batch cost', money(batchCost)],
    ['Cost / kg', money(batchCost / bkg)],
    ['Cost / case', money(batchCost / Math.max(perCase, 1e-9))],
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      <button type="button" className="back-link n-only" onClick={onBack}>
        <Icon name="chevronLeft" size={16} /> All products
      </button>

      <div className="card pad prod-head">
        <label htmlFor="prod-name" className="sr-only">
          Product name
        </label>
        <TitleInput id="prod-name" value={sp.name} onChange={(v) => renameProduct(sp.id, v)} />
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Stock on hand makes {plural(capacity.batches, 'batch', 'batches')} ({fmt(capacity.cases)} cases)
          {capacity.lim ? ` · limited by ${capacity.lim.name}` : ''}
        </div>

        <div className="prod-stats">
          {stats.map(([label, value]) => (
            <div key={label} className="cell">
              <div className="cell-k">{label}</div>
              <div className="cell-v tnum">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid3 keep3" style={{ marginTop: 16 }}>
          <div>
            <label htmlFor="bkg" className="field-label sm">
              Batch size
            </label>
            <div className="input-shell" style={{ height: 46 }}>
              <input id="bkg" placeholder="Enter kg" type="number" inputMode="decimal" style={{ fontWeight: 600 }} value={sp.batchKg} onChange={(e) => setBatchKg(sp.id, inputVal(e.target.value))} />
              <span className="subtle" style={{ paddingRight: 14, fontSize: 12 }}>
                kg
              </span>
            </div>
          </div>
          <div>
            <label htmlFor="upb" className="field-label sm">
              Units per batch
            </label>
            <input id="upb" placeholder="Enter units" type="number" inputMode="numeric" className="input h46" value={sp.upb} onChange={(e) => setProductField(sp.id, 'upb', inputVal(e.target.value, true))} />
          </div>
          <div>
            <label htmlFor="upc" className="field-label sm">
              Units per case
            </label>
            <input id="upc" placeholder="Enter units" type="number" inputMode="numeric" className="input h46" value={sp.upc} onChange={(e) => setProductField(sp.id, 'upc', inputVal(e.target.value, true))} />
          </div>
        </div>
        <div className="subtle" style={{ marginTop: 8, fontSize: 12 }}>
          Changing the batch size scales every ingredient so the recipe percentages stay the same. Packaging stays per batch.
        </div>
      </div>

      <RecipeTable productId={sp.id} />

      <div className="danger-zone">
        <div className="min0">
          <div style={{ fontSize: 14, fontWeight: 700 }}>Delete this product</div>
          <div className="row-sub">Its recipe, committed plans and production history go with it.</div>
        </div>
        <button
          type="button"
          className="btn btn-outline danger-btn"
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Delete ${sp.name}?`,
              body: "Its recipe, committed plans and production history are deleted too. This can't be undone.",
              confirmLabel: 'Delete product',
              danger: true,
            });
            if (!ok) return;
            const res = await send(() => api.deleteProduct(sp.id));
            if (res) {
              setUI({ setupProduct: '' });
              onBack();
              toast(`${res.name} deleted.`);
            }
          }}
        >
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>
    </div>
  );
}

/** Product name as an editable heading that wraps onto more lines instead of cutting off. */
function TitleInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Fit the height to the text; while hidden (phone list view) there's nothing to measure, so re-fit on resize.
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      className="title-input" placeholder="Enter product name"
      value={value}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function RecipeTable({ productId }: { productId: string }) {
  const m = useModel();
  const setRecipeQty = useStore((s) => s.setRecipeQty);
  const send = useStore((s) => s.send);
  const st = useRecipeStatus()(productId);
  const sp = m.prodById[productId];
  const bom = m.recipeOf(sp.id);
  const isMix = (ing: string) => !!m.byId[ing] && m.byId[ing].kind !== 'packaging';
  const bkg = Math.max(num(sp.batchKg), 1e-9);
  const off = bom.length > 0 && !st.ok;

  return (
    <div className="card clip min0">
      <div className="recipe-head">
        <div className="min0">
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong)' }}>Recipe</div>
          <div className="row-sub">Ingredients as % of the batch weight; packaging as a count per batch.</div>
        </div>
        <span className={`pill ${st.tone}`}>{st.label}</span>
      </div>
      <div className="bom-row bom-head">
        <span>Material</span>
        <span>% or qty</span>
        <span style={{ textAlign: 'right' }}>Per batch</span>
        <span />
      </div>
      <div className="list">
        {bom.map((r) => {
          const i = m.byId[r.ing] ?? { name: r.ing, unit: '' };
          const mix = isMix(r.ing);
          return (
            <div key={r.ing} className="bom-row">
              <span style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</span>
              <div className="unit-input">
                <input
                  type="number"
                  inputMode="decimal"
                  value={mix && r.qty !== '' ? round((num(r.qty) / bkg) * 100) : r.qty}
                  placeholder={mix ? '%' : 'Qty'}
                  onChange={(e) => {
                    const v = inputVal(e.target.value);
                    setRecipeQty(sp.id, r.ing, v === '' ? '' : mix ? round((v * bkg) / 100) : v);
                  }}
                  aria-label={`${i.name} ${mix ? 'percent of batch' : 'quantity per batch'}`}
                />
                <span>{mix ? '%' : i.unit}</span>
              </div>
              <span className="muted tnum" style={{ textAlign: 'right', fontSize: 13 }}>
                {qu(num(r.qty), i.unit)}
              </span>
              <button type="button" className="row-remove" aria-label={`Remove ${i.name} from recipe`} onClick={() => void send(() => api.removeRecipeLine(sp.id, r.ing))}>
                <Icon name="x" size={14} stroke={2.2} />
              </button>
            </div>
          );
        })}
        {!bom.length && <div className="empty-inline">No materials in this recipe yet. Pick the first one below.</div>}
      </div>
      <AddRecipeLine productId={sp.id} />
      {bom.length > 0 && (
        <div className="bom-total tnum">
          <span>Formula total</span>
          <span style={{ color: off ? 'var(--warn)' : 'var(--ok)' }}>
            {st.pct.toFixed(3)}% · {qu(st.mixTotal, 'kg')}
          </span>
        </div>
      )}
      {off && (
        <div className="bom-off">
          Formula is {st.pct > 100 ? 'over' : 'under'} 100% by {Math.abs(st.pct - 100).toFixed(3)}% — batch weight won&apos;t match {qu(num(sp.batchKg), 'kg')}.
        </div>
      )}
    </div>
  );
}

function AddRecipeLine({ productId }: { productId: string }) {
  const m = useModel();
  const send = useStore((s) => s.send);
  const used = new Set(m.recipeOf(productId).map((r) => r.ing));
  const options = m.data.ingredients.filter((i) => !used.has(i.id));
  const [ing, setIng] = useState('');
  const [qty, setQty] = useState('');
  const picked = m.byId[ing];
  const mix = picked ? picked.kind !== 'packaging' : true;
  const bkg = Math.max(num(m.prodById[productId].batchKg), 1e-9);

  if (!options.length) return null;
  return (
    <form
      className="bom-add"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = num(qty);
        if (!picked || v <= 0) return;
        const res = await send(() => api.addRecipeLine(productId, picked.id, mix ? round((v * bkg) / 100) : v));
        if (res !== null) {
          setIng('');
          setQty('');
        }
      }}
    >
      <select className="input h44" value={ing} onChange={(e) => setIng(e.target.value)} aria-label="Material to add">
        <option value="">Add a material…</option>
        {options.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <div className="unit-input">
        <input type="number" inputMode="decimal" placeholder={mix ? '%' : 'qty'} value={qty} onChange={(e) => setQty(e.target.value)} aria-label={mix ? 'Percent of batch' : 'Quantity per batch'} />
        <span>{picked ? (mix ? '%' : picked.unit) : ''}</span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!picked || num(qty) <= 0}>
        Add
      </button>
    </form>
  );
}

function NewProduct({ onCancel, onCreated }: { onCancel?: () => void; onCreated: (id: string) => void }) {
  const submit = useStore((s) => s.submit);
  const [f, setF] = useState({ name: '', batchKg: '', upb: '', upc: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErr((e) => ({ ...e, [k]: '' }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const missing = Object.fromEntries(Object.entries(f).filter(([, v]) => !String(v).trim()).map(([k]) => [k, 'Required.']));
    if (Object.keys(missing).length) return setErr(missing);
    setBusy(true);
    const res = await submit(() => api.addProduct({ name: f.name, batchKg: num(f.batchKg), upb: Math.floor(num(f.upb)), upc: Math.max(1, Math.floor(num(f.upc))) }));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { name: res.error });
    toast(`${f.name.trim()} added. Now build its recipe.`);
    onCreated(res.value.id);
  }

  return (
    <form className="card pad col" style={{ gap: 14 }} onSubmit={save} noValidate>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--strong)' }}>New product</div>
        <div className="row-sub" style={{ marginTop: 2 }}>
          Set the batch size and how it&apos;s packed. You&apos;ll add the recipe next.
        </div>
      </div>
      <FormField id="np-name" label="Product name" error={err.name}>
        <input id="np-name" className="input" placeholder="Enter product name" autoFocus value={f.name} aria-invalid={!!err.name} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <div className="grid3">
        <FormField id="np-kg" label="Batch size (kg)" error={err.batchKg}>
          <input id="np-kg" placeholder="Enter batch size" className="input" type="number" inputMode="decimal" value={f.batchKg} aria-invalid={!!err.batchKg} onChange={(e) => set('batchKg', e.target.value)} />
        </FormField>
        <FormField id="np-upb" label="Units / batch" error={err.upb}>
          <input id="np-upb" placeholder="Enter units per batch" className="input" type="number" inputMode="numeric" value={f.upb} aria-invalid={!!err.upb} onChange={(e) => set('upb', e.target.value)} />
        </FormField>
        <FormField id="np-upc" label="Units / case" error={err.upc}>
          <input id="np-upc" placeholder="Enter units per case" className="input" type="number" inputMode="numeric" value={f.upc} aria-invalid={!!err.upc} onChange={(e) => set('upc', e.target.value)} />
        </FormField>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, height: 48, fontSize: 14 }} disabled={busy}>
          {busy ? 'Adding…' : 'Add product'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline" style={{ height: 48 }} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ── Materials ───────────────────────────────────────────────────────────────

const KINDS: [MaterialKind, string, string, string][] = [
  ['ingredient', 'Ingredient', 'kg', 'bag'],
  ['packaging', 'Packaging', 'pcs', 'bundle'],
  ['utility', 'Utility', 'kg', 'unit'],
];

const NUM_LABEL = { pack: 'pack size', cost: 'cost per unit', par: 'par level' } as const;

/** Every material in one editable table; the last row adds a new one. */
function Materials() {
  const m = useModel();
  const update = useStore((s) => s.updateIngredient);
  const updateText = useStore((s) => s.updateMaterialText);
  const send = useStore((s) => s.send);
  const setUI = useUI((s) => s.set);
  const openSheet = useUI((s) => s.openSheet);
  const materials = m.data.ingredients;
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="import-banner">
        <div className="min0" style={{ flex: '1 1 220px' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{materials.length ? 'Update from your spreadsheet' : 'Start from your spreadsheet'}</div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12, lineHeight: 1.5 }}>
            Costs, pack sizes, par levels and stock in one upload. New rows are added as materials. Or type them straight into the table.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline n-only" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} stroke={2.2} />
            Add material
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setUI({ imp: { stage: 'pick' } });
              openSheet('import');
            }}
          >
            <Icon name="upload" size={16} />
            Import Excel
          </button>
        </div>
      </div>

      {/* Phones: one card per material, since the wide table doesn't fit. */}
      <div className="n-only">
        {(adding || !materials.length) && <NewMaterial onDone={() => setAdding(false)} canCancel={materials.length > 0} />}
        <div className="mat-grid" style={{ marginTop: adding || !materials.length ? 12 : 0 }}>
          {materials.map((i) => (
            <MaterialCard key={i.id} id={i.id} />
          ))}
        </div>
      </div>

      <div className="card clip mat-table-wrap w-only">
        <table className="mat-table">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Type</th>
              <th scope="col">Unit</th>
              <th scope="col">Pack type</th>
              <th scope="col" className="num">
                Pack size
              </th>
              <th scope="col" className="num">
                Cost (Rs / unit)
              </th>
              <th scope="col" className="num">
                Par level
              </th>
              <th scope="col" className="num">
                In stock
              </th>
              <th scope="col">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {materials.map((i) => (
              <tr key={i.id}>
                <th scope="row">
                  <input className="cell-input name" value={i.name} placeholder="Enter material name" onChange={(e) => updateText(i.id, 'name', e.target.value)} aria-label="Material name" />
                </th>
                <td>
                  <select className="cell-input" value={i.kind} onChange={(e) => updateText(i.id, 'kind', e.target.value)} aria-label={`${i.name} type`}>
                    {KINDS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="cell-input" value={i.unit} placeholder="Enter unit" onChange={(e) => updateText(i.id, 'unit', e.target.value)} aria-label={`${i.name} unit`} />
                </td>
                <td>
                  <input className="cell-input" value={i.packName} placeholder="Enter pack type" onChange={(e) => updateText(i.id, 'packName', e.target.value)} aria-label={`${i.name} pack type`} />
                </td>
                {(['pack', 'cost', 'par'] as const).map((key) => (
                  <td key={key} className="num">
                    <input
                      className="cell-input num"
                      type="number"
                      placeholder="0"
                      inputMode="decimal"
                      value={i[key]}
                      onChange={(e) => update(i.id, { [key]: inputVal(e.target.value) })}
                      aria-label={`${i.name} ${NUM_LABEL[key]}`}
                    />
                  </td>
                ))}
                <td className="num tnum muted">{i.kind === 'utility' ? '—' : qu(m.total(i), i.unit)}</td>
                <td>
                  <button
                    type="button"
                    className="row-remove"
                    aria-label={`Delete ${i.name}`}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Delete ${i.name}?`,
                        body: 'This removes the material for good. Materials used in a recipe or on a purchase order are kept.',
                        confirmLabel: 'Delete material',
                        danger: true,
                      });
                      if (ok && (await send(() => api.deleteMaterial(i.id))) !== null) toast(`${i.name} deleted.`);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <NewMaterialRow first={!materials.length} />
          </tfoot>
        </table>
      </div>
      {!materials.length && (
        <div className="muted w-only" style={{ marginTop: 10, fontSize: 12 }}>
          Type your first material into the row above, then press Add or Enter.
        </div>
      )}
    </>
  );
}

const BLANK = { name: '', kind: 'ingredient' as MaterialKind, unit: 'kg', packName: 'bag', pack: '', cost: '', par: '' };

/** Phone layout: a material's name and type, with cost, pack size and par to edit. */
function MaterialCard({ id }: { id: string }) {
  const i = useModel().byId[id];
  const update = useStore((s) => s.updateIngredient);
  const send = useStore((s) => s.send);
  if (!i) return null;
  const fields = [
    ['cost', `Rs / ${i.unit}`, 'Cost per unit'],
    ['pack', `${cap1(i.packName)} (${i.unit})`, 'Pack size'],
    ['par', `Par (${i.unit})`, 'Par level'],
  ] as const;
  return (
    <div className="card flat" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="row-title min0 ellipsis">{i.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="subtle" style={{ fontSize: 11 }}>
            {KINDS.find(([v]) => v === i.kind)?.[1] ?? 'Ingredient'}
          </span>
          <button
            type="button"
            className="row-remove"
            aria-label={`Delete ${i.name}`}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Delete ${i.name}?`,
                body: 'This removes the material for good. Materials used in a recipe or on a purchase order are kept.',
                confirmLabel: 'Delete material',
                danger: true,
              });
              if (ok && (await send(() => api.deleteMaterial(i.id))) !== null) toast(`${i.name} deleted.`);
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>
      <div className="mat-fields">
        {fields.map(([key, label, aria]) => (
          <label key={key}>
            <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600 }}>{label}</div>
            <input
              type="number"
              inputMode="decimal"
              className="input h44"
              value={i[key]}
              placeholder="0"
              onChange={(e) => update(i.id, { [key]: inputVal(e.target.value) })}
              aria-label={`${i.name} ${aria}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Phone layout: the add-a-material form. */
function NewMaterial({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const submit = useStore((s) => s.submit);
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof BLANK, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErr((e) => ({ ...e, [k]: '' }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr({ name: 'Required.' });
    if (num(f.pack) <= 0) return setErr({ pack: 'Must be more than 0.' });
    setBusy(true);
    const res = await submit(() => api.addMaterial({ ...f, pack: num(f.pack), cost: num(f.cost), par: num(f.par) }));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { name: res.error });
    toast(`${f.name.trim()} added.`);
    setF({ ...BLANK, kind: f.kind, unit: f.unit, packName: f.packName });
    if (canCancel) onDone();
  }

  return (
    <form className="card pad col" style={{ gap: 12 }} onSubmit={save} noValidate>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--strong)' }}>New material</div>
      <div className="grid2" style={{ gap: 10 }}>
        <FormField id="nm-name" label="Name" error={err.name}>
          <input id="nm-name" className="input" placeholder="e.g. Sugar (Powdered)" value={f.name} aria-invalid={!!err.name} onChange={(e) => set('name', e.target.value)} />
        </FormField>
        <FormField id="nm-kind" label="Type">
          <select
            id="nm-kind"
            className="input"
            value={f.kind}
            onChange={(e) => {
              const k = KINDS.find(([v]) => v === e.target.value)!;
              setF((x) => ({ ...x, kind: k[0], unit: k[2], packName: k[3] }));
            }}
          >
            {KINDS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid3">
        <FormField id="nm-unit" label="Unit" error={err.unit}>
          <input id="nm-unit" className="input" placeholder="kg" value={f.unit} onChange={(e) => set('unit', e.target.value)} />
        </FormField>
        <FormField id="nm-packname" label="Pack type" error={err.packName}>
          <input id="nm-packname" className="input" placeholder="bag, drum…" value={f.packName} onChange={(e) => set('packName', e.target.value)} />
        </FormField>
        <FormField id="nm-pack" label={`Pack size (${f.unit || 'unit'})`} error={err.pack}>
          <input id="nm-pack" className="input" type="number" inputMode="decimal" placeholder="25" value={f.pack} aria-invalid={!!err.pack} onChange={(e) => set('pack', e.target.value)} />
        </FormField>
        <FormField id="nm-cost" label={`Cost (Rs / ${f.unit || 'unit'})`} error={err.cost}>
          <input id="nm-cost" placeholder="Enter cost" className="input" type="number" inputMode="decimal" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
        </FormField>
        <FormField id="nm-par" label={`Par level (${f.unit || 'unit'})`} error={err.par}>
          <input id="nm-par" placeholder="Enter par level" className="input" type="number" inputMode="decimal" value={f.par} onChange={(e) => set('par', e.target.value)} />
        </FormField>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, height: 48, fontSize: 14 }} disabled={busy}>
          {busy ? 'Adding…' : 'Add material'}
        </button>
        {canCancel && (
          <button type="button" className="btn btn-outline" style={{ height: 48 }} onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** The table's last row: fill it in and press Add (or Enter) to create a material. */
function NewMaterialRow({ first }: { first: boolean }) {
  const submit = useStore((s) => s.submit);
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof BLANK, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErr(null);
  };

  async function save() {
    if (!f.name.trim()) return setErr('Give the material a name.');
    if (num(f.pack) <= 0) return setErr('Pack size must be more than 0.');
    setBusy(true);
    const res = await submit(() => api.addMaterial({ ...f, pack: num(f.pack), cost: num(f.cost), par: num(f.par) }));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
    toast(`${f.name.trim()} added.`);
    setF({ ...BLANK, kind: f.kind, unit: f.unit, packName: f.packName });
    document.getElementById('new-mat-name')?.focus();
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void save();
  };

  return (
    <>
      <tr className="new-row" onKeyDown={onEnter}>
        <th scope="row">
          <input
            id="new-mat-name"
            className="cell-input name"
            placeholder={first ? 'Enter material name' : '+ New material'}
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
            aria-label="New material name"
          />
        </th>
        <td>
          <select
            className="cell-input"
            value={f.kind}
            aria-label="New material type"
            onChange={(e) => {
              const k = KINDS.find(([v]) => v === e.target.value)!;
              setF((x) => ({ ...x, kind: k[0], unit: k[2], packName: k[3] }));
            }}
          >
            {KINDS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input className="cell-input" value={f.unit} placeholder="kg" onChange={(e) => set('unit', e.target.value)} aria-label="New material unit" />
        </td>
        <td>
          <input className="cell-input" value={f.packName} placeholder="bag" onChange={(e) => set('packName', e.target.value)} aria-label="New material pack type" />
        </td>
        {(['pack', 'cost', 'par'] as const).map((key) => (
          <td key={key} className="num">
            <input
              className="cell-input num"
              type="number"
              inputMode="decimal"
              placeholder={key === 'pack' ? 'Size' : '0'}
              value={f[key]}
              onChange={(e) => set(key, e.target.value)}
              aria-label={`New material ${NUM_LABEL[key]}`}
            />
          </td>
        ))}
        <td colSpan={2} className="num">
          <button type="button" className="btn btn-primary add-btn" disabled={busy || !f.name.trim()} onClick={() => void save()}>
            <Icon name="plus" size={14} stroke={2.4} />
            Add
          </button>
        </td>
      </tr>
      {err && (
        <tr className="new-row-err">
          <td colSpan={9} role="alert">
            {err}
          </td>
        </tr>
      )}
    </>
  );
}
