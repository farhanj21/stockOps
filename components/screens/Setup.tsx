'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import * as api from '@/app/actions';
import { FormField } from '@/components/FormField';
import { Icon } from '@/components/Icon';
import { fmt, inputVal, money, num, qu, round } from '@/lib/format';
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

function Recipes() {
  const m = useModel();
  const setupProduct = useUI((s) => s.setupProduct);
  const setUI = useUI((s) => s.set);
  const [adding, setAdding] = useState(false);
  const products = m.data.products;
  const sp = m.prodById[setupProduct] ?? products[0];

  if (!products.length || adding) {
    return (
      <div className="recipe-grid">
        <div className="col min0" style={{ gap: 14 }}>
          {!products.length && (
            <div className="empty" style={{ textAlign: 'left' }}>
              <div className="empty-t">Add your first product</div>
              <div className="empty-s">
                A product is something you make in batches. Give it a batch size, then build its recipe from your materials.
                {!m.ings.length && ' Add materials first (Materials tab or Excel import) so the recipe has something to use.'}
              </div>
            </div>
          )}
          <NewProduct
            onCancel={products.length ? () => setAdding(false) : undefined}
            onCreated={(id) => {
              setUI({ setupProduct: id });
              setAdding(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="recipe-grid">
      <div className="col min0" style={{ gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Product">
          {products.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={p.id === sp.id} onClick={() => setUI({ setupProduct: p.id })}>
              {p.name}
            </button>
          ))}
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} stroke={2.4} /> New product
          </button>
        </div>
        <ProductCard key={sp.id} id={sp.id} />
      </div>
      <RecipeTable key={`bom-${sp.id}`} productId={sp.id} />
    </div>
  );
}

function ProductCard({ id }: { id: string }) {
  const m = useModel();
  const setProductField = useStore((s) => s.setProductField);
  const setBatchKg = useStore((s) => s.setBatchKg);
  const send = useStore((s) => s.send);
  const setUI = useUI((s) => s.set);
  const sp = m.prodById[id];
  const bkg = Math.max(num(sp.batchKg), 1e-9);
  const batchCost = m.batchCost(sp);
  const perCase = m.perCase(sp);

  return (
    <div className="card pad">
      <div className="grid2" style={{ gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="bkg" className="field-label sm">
            Batch size
          </label>
          <div className="input-shell" style={{ height: 46 }}>
            <input id="bkg" type="number" inputMode="decimal" style={{ fontWeight: 600 }} value={sp.batchKg} onChange={(e) => setBatchKg(sp.id, inputVal(e.target.value))} />
            <span className="subtle" style={{ paddingRight: 14, fontSize: 12 }}>
              kg · % lines scale with it
            </span>
          </div>
        </div>
        <div>
          <label htmlFor="upb" className="field-label sm">
            Units per batch
          </label>
          <input id="upb" type="number" inputMode="numeric" className="input h46" value={sp.upb} onChange={(e) => setProductField(sp.id, 'upb', inputVal(e.target.value, true))} />
        </div>
        <div>
          <label htmlFor="upc" className="field-label sm">
            Units per case
          </label>
          <input id="upc" type="number" inputMode="numeric" className="input h46" value={sp.upc} onChange={(e) => setProductField(sp.id, 'upc', inputVal(e.target.value, true))} />
        </div>
      </div>
      <div className="muted tnum" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
        {fmt(perCase)} cases per batch · {money(batchCost / bkg)} per kg · batch cost {money(batchCost)} · {money(batchCost / Math.max(perCase, 1e-9))} per case
      </div>
      <button
        type="button"
        className="btn-link danger"
        style={{ marginTop: 12, fontSize: 12 }}
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Delete ${sp.name}?`,
            body: 'Its recipe, committed plans and production history are deleted too. This can\'t be undone.',
            confirmLabel: 'Delete product',
            danger: true,
          });
          if (!ok) return;
          const res = await send(() => api.deleteProduct(sp.id));
          if (res) {
            setUI({ setupProduct: '' });
            toast(`${res.name} deleted.`);
          }
        }}
      >
        <Icon name="trash" size={13} /> Delete product
      </button>
    </div>
  );
}

function RecipeTable({ productId }: { productId: string }) {
  const m = useModel();
  const setRecipeQty = useStore((s) => s.setRecipeQty);
  const send = useStore((s) => s.send);
  const sp = m.prodById[productId];
  const bom = m.recipeOf(sp.id);
  const isMix = (ing: string) => !!m.byId[ing] && m.byId[ing].kind !== 'packaging';
  const bkg = Math.max(num(sp.batchKg), 1e-9);
  const mixTotal = bom.reduce((a, r) => a + (isMix(r.ing) ? num(r.qty) : 0), 0);
  const pctSum = (mixTotal / bkg) * 100;
  const off = bom.length > 0 && Math.abs(pctSum - 100) > 0.005;

  return (
    <div className="card clip min0">
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
        {!bom.length && <div className="empty-inline">No materials in this recipe yet. Add the first one below.</div>}
      </div>
      <AddRecipeLine productId={sp.id} />
      {bom.length > 0 && (
        <div className="bom-total tnum">
          <span>Formula total</span>
          <span style={{ color: off ? 'var(--warn)' : '#2E6B45' }}>
            {pctSum.toFixed(3)}% · {qu(mixTotal, 'kg')}
          </span>
        </div>
      )}
      {off && (
        <div className="bom-off">
          Formula is {pctSum > 100 ? 'over' : 'under'} 100% by {Math.abs(pctSum - 100).toFixed(3)}% — batch weight won&apos;t match {qu(num(sp.batchKg), 'kg')}.
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
    <form className="card pad col" style={{ gap: 12 }} onSubmit={save} noValidate>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>New product</div>
      <FormField id="np-name" label="Product name" error={err.name}>
        <input id="np-name" className="input" placeholder="Product name" value={f.name} aria-invalid={!!err.name} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <div className="grid3">
        <FormField id="np-kg" label="Batch size (kg)" error={err.batchKg}>
          <input id="np-kg" className="input" type="number" inputMode="decimal" value={f.batchKg} aria-invalid={!!err.batchKg} onChange={(e) => set('batchKg', e.target.value)} />
        </FormField>
        <FormField id="np-upb" label="Units / batch" error={err.upb}>
          <input id="np-upb" className="input" type="number" inputMode="numeric" value={f.upb} aria-invalid={!!err.upb} onChange={(e) => set('upb', e.target.value)} />
        </FormField>
        <FormField id="np-upc" label="Units / case" error={err.upc}>
          <input id="np-upc" className="input" type="number" inputMode="numeric" value={f.upc} aria-invalid={!!err.upc} onChange={(e) => set('upc', e.target.value)} />
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

  return (
    <>
      <div className="import-banner">
        <div className="min0" style={{ flex: '1 1 220px' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{materials.length ? 'Update from your spreadsheet' : 'Start from your spreadsheet'}</div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12, lineHeight: 1.5 }}>
            Costs, pack sizes, par levels and stock in one upload. New rows are added as materials. Or type them straight into the table.
          </div>
        </div>
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

      <div className="card clip mat-table-wrap">
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
                  <input className="cell-input name" value={i.name} onChange={(e) => updateText(i.id, 'name', e.target.value)} aria-label="Material name" />
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
                  <input className="cell-input" value={i.unit} onChange={(e) => updateText(i.id, 'unit', e.target.value)} aria-label={`${i.name} unit`} />
                </td>
                <td>
                  <input className="cell-input" value={i.packName} onChange={(e) => updateText(i.id, 'packName', e.target.value)} aria-label={`${i.name} pack type`} />
                </td>
                {(['pack', 'cost', 'par'] as const).map((key) => (
                  <td key={key} className="num">
                    <input
                      className="cell-input num"
                      type="number"
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
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Type your first material into the row above, then press Add or Enter.
        </div>
      )}
    </>
  );
}

const BLANK = { name: '', kind: 'ingredient' as MaterialKind, unit: 'kg', packName: 'bag', pack: '', cost: '', par: '' };

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
            placeholder={first ? 'Material name' : '+ New material'}
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
          <input className="cell-input" value={f.unit} onChange={(e) => set('unit', e.target.value)} aria-label="New material unit" />
        </td>
        <td>
          <input className="cell-input" value={f.packName} onChange={(e) => set('packName', e.target.value)} aria-label="New material pack type" />
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
