'use client';

import { useState, type FormEvent } from 'react';
import { logBatch, updateBatch } from '@/app/actions';
import { FormField } from '@/components/FormField';
import { useShowCost } from '@/lib/hooks';
import { fmt, fmtDate, money, num, plural, qu, today } from '@/lib/format';
import { useModel } from '@/lib/model';
import { batchMetrics, looseUnitsOf, producedKg, suggestBatchNo, totalUnits, unitWeightG } from '@/lib/production';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

/**
 * Record one batch made (or correct an existing record): batch number, production date,
 * and what came out. New batches deduct one batch of the recipe from in-hand stock.
 */
export function BatchSheet({ batchId }: { batchId?: string }) {
  const m = useModel();
  const editing = batchId ? m.data.batches.find((b) => b.id === batchId) : undefined;
  // Remount the form when switching between batches / new, so its fields start fresh.
  return <BatchForm key={editing?.id ?? 'new'} editingId={editing?.id} />;
}

function BatchForm({ editingId }: { editingId?: string }) {
  const SHOW_COST = useShowCost();
  const m = useModel();
  const submit = useStore((s) => s.submit);
  const ui = useUI();
  const editing = editingId ? m.data.batches.find((b) => b.id === editingId) : undefined;
  const products = m.data.products;

  // Which product and plan: from the record being edited, the plan the person tapped, or their last choice.
  const startForecast = !editing && ui.runId ? m.forecastsSorted.find((f) => f.id === ui.runId) : undefined;
  const [productId, setProductId] = useState(editing?.productId ?? startForecast?.productId ?? ui.batchProduct ?? products[0]?.id ?? '');
  const [forecastId, setForecastId] = useState<string>(editing?.forecastId ?? startForecast?.id ?? '');
  const p = m.prodById[productId];
  const startDate = editing?.date ?? today();
  // A full batch as the recipe says, split into full cases + loose units.
  const fullBatch = (x: typeof p | undefined) => {
    const upc = Math.max(1, num(x?.upc));
    const cases = Math.floor(num(x?.upb) / upc);
    return { cases: String(cases), loose: String(num(x?.upb) - cases * upc) };
  };
  const [f, setF] = useState({
    batchNo: editing?.batchNo ?? suggestBatchNo(m.data.batches, startDate),
    date: startDate,
    ...(editing ? { cases: String(editing.cases), loose: String(looseUnitsOf({ ...editing, upc: editing.upc || num(p?.upc) })) } : fullBatch(p)),
    notes: editing?.notes ?? '',
  });
  const [numberTouched, setNumberTouched] = useState(!!editing);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErr((e) => ({ ...e, [k]: '' }));
  };

  if (!products.length) {
    return (
      <>
        <SheetHeader kicker="Production" title="Log a batch" />
        <div className="empty" style={{ margin: '16px 20px 28px', background: 'var(--bg)' }}>
          <div className="empty-t">No products yet</div>
          <div className="empty-s">An Admin needs to add products and recipes in Setup first.</div>
        </div>
      </>
    );
  }

  const pickProduct = (id: string) => {
    const np = m.prodById[id];
    setProductId(id);
    setForecastId('');
    ui.set({ batchProduct: id });
    // Fresh defaults for the new product (the person can still change them).
    setF((x) => ({ ...x, ...fullBatch(np) }));
  };

  const plans = m.forecastsSorted.filter((x) => x.productId === productId);
  // The recipe figures this batch is measured against: as logged, or the product's current ones for a new batch.
  const plannedKg = editing?.plannedKg ?? num(p?.batchKg);
  const plannedUnits = editing?.plannedUnits || num(p?.upb);
  const upc = Math.max(1, editing?.upc || num(p?.upc));
  const units = totalUnits(Math.floor(num(f.cases)), Math.floor(num(f.loose)), upc);
  const unitG = editing?.unitG || unitWeightG(num(p?.batchKg), num(p?.upb), num(p?.unitG));
  const actualKg = producedKg(units, unitG);
  const materialCost = editing?.materialCost ?? (p ? m.batchCost(p) : 0);
  const metrics = batchMetrics({ plannedKg, actualKg, materialCost, plannedUnits, units });

  const deductions = editing
    ? []
    : m.recipeOf(productId).flatMap((r) => {
        const i = m.byId[r.ing];
        if (m.isUtil(i)) return [];
        const use = num(r.qty);
        return [{ i, use, after: num(i.inHand) - use }];
      });
  const short = deductions.filter((d) => d.after < -1e-9);
  const noRecipe = !editing && !m.recipeOf(productId).length;

  async function save(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!f.batchNo.trim()) next.batchNo = 'Enter a batch number.';
    if (num(f.cases) < 0) next.cases = "Can't be negative.";
    if (num(f.loose) < 0) next.loose = "Can't be negative.";
    if (!next.cases && !next.loose && !(units > 0)) next.cases = 'Enter what was produced.';
    if (!(unitG > 0)) next.cases = 'Set the unit weight for this product in Setup first.';
    if (!f.date) next.date = 'Pick the production date.';
    if (Object.keys(next).length) return setErr(next);
    const fields = {
      batchNo: f.batchNo,
      date: f.date,
      cases: Math.max(0, Math.floor(num(f.cases))),
      looseUnits: Math.max(0, Math.floor(num(f.loose))),
      notes: f.notes,
    };
    setBusy(true);
    const res = editing ? await submit(() => updateBatch(editing.id, fields)) : await submit(() => logBatch({ ...fields, productId, forecastId: forecastId || null }));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { batchNo: res.error });
    ui.set({ sheetOpen: false });
    if (editing) toast(`Batch ${res.value.batchNo} updated.`);
    else
      toast(`Batch ${res.value.batchNo} of ${p.name} logged. In-hand stock deducted.`, {
        label: 'Log another',
        fn: () => {
          useUI.getState().set({ runId: forecastId || null, batchProduct: productId });
          useUI.getState().openSheet('batch');
        },
      });
  }

  return (
    <>
      <SheetHeader kicker={editing ? `Batch ${editing.batchNo}` : 'Production'} title={editing ? 'Edit batch record' : 'Log a batch'} />
      <form className="sheet-body" onSubmit={save} noValidate>
        <FormField id="bt-product" label="Product">
          <select id="bt-product" className="input" value={productId} disabled={!!editing} onChange={(e) => pickProduct(e.target.value)}>
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </FormField>

        {!editing && (
          <FormField id="bt-plan" label="From plan">
            <select id="bt-plan" className="input" value={forecastId} onChange={(e) => setForecastId(e.target.value)}>
              <option value="">Not from a plan</option>
              {plans.map((x) => (
                <option key={x.id} value={x.id}>
                  {plural(num(x.batches), 'batch', 'batches')} left · due {fmtDate(x.date)}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <div className="grid2" style={{ gap: 10 }}>
          <FormField id="bt-no" label="Batch number" error={err.batchNo}>
            <input
              id="bt-no"
              className="input tnum"
              autoCapitalize="characters"
              value={f.batchNo}
              aria-invalid={!!err.batchNo}
              onChange={(e) => {
                setNumberTouched(true);
                set('batchNo', e.target.value);
              }}
            />
          </FormField>
          <FormField id="bt-date" label="Production date" error={err.date}>
            <input
              id="bt-date"
              className="input"
              type="date"
              max={today()}
              value={f.date}
              aria-invalid={!!err.date}
              onChange={(e) => {
                set('date', e.target.value);
                // Keep the suggested number in step with the date until the person types their own.
                if (!numberTouched && e.target.value) setF((x) => ({ ...x, date: e.target.value, batchNo: suggestBatchNo(m.data.batches, e.target.value) }));
              }}
            />
          </FormField>
        </div>
        {!editing && !numberTouched && <div className="subtle" style={{ marginTop: -8, fontSize: 12 }}>Suggested number. Change it to match your batch sheet if needed.</div>}

        <div className="grid2" style={{ gap: 10 }}>
          <FormField id="bt-cases" label={`Full cases (${fmt(upc)} units each)`} error={err.cases}>
            <input id="bt-cases" className="input tnum" type="number" inputMode="numeric" min={0} value={f.cases} aria-invalid={!!err.cases} onChange={(e) => set('cases', e.target.value)} />
          </FormField>
          <FormField id="bt-loose" label="Loose units" error={err.loose}>
            <input id="bt-loose" className="input tnum" type="number" inputMode="numeric" min={0} value={f.loose} aria-invalid={!!err.loose} onChange={(e) => set('loose', e.target.value)} />
          </FormField>
        </div>
        <div className="subtle tnum" style={{ marginTop: -8, fontSize: 12 }}>
          = {fmt(units)} units · {qu(actualKg, 'kg')} produced ({unitG > 0 ? `${fmt(Math.round(unitG * 10) / 10)} g` : '—'} per unit)
        </div>

        <div className="batch-preview tnum">
          <div className="cell">
            <div className="cell-k">Recipe output</div>
            <div className="cell-v sm">
              {fmt(plannedUnits)} units · {qu(plannedKg, 'kg')}
            </div>
          </div>
          <div className="cell">
            <div className="cell-k">Wastage</div>
            <div className={`cell-v sm${metrics.wastageKg > 0 ? ' warn-text' : ''}`}>
              {fmt(Math.abs(metrics.wastageUnits))} units · {qu(Math.abs(metrics.wastageKg), 'kg')} {metrics.wastageKg < 0 ? 'over' : ''} ({fmt(Math.round(Math.abs(metrics.wastagePct) * 10) / 10)}%)
            </div>
          </div>
          {SHOW_COST && (
            <>
              <div className="cell">
                <div className="cell-k">Cost / batch</div>
                <div className="cell-v sm">{money(materialCost)}</div>
              </div>
              <div className="cell">
                <div className="cell-k">Cost / kg after wastage</div>
                <div className="cell-v sm">{actualKg > 0 ? money(metrics.costPerKg) : '—'}</div>
              </div>
            </>
          )}
        </div>

        <FormField id="bt-notes" label="Notes (optional)">
          <input id="bt-notes" className="input" placeholder="e.g. reason for losses" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>

        {!editing && deductions.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Deducted from in-hand (one batch)
            </div>
            <div className="sheet-list list">
              {deductions.map(({ i, use, after }) => (
                <div key={i.id} className="run-line tnum">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{i.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong)', textAlign: 'right' }}>−{qu(use, i.unit)}</span>
                  {after < -1e-9 ? (
                    <span style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>
                      Only {qu(num(i.inHand), i.unit)} in hand — receive stock first
                    </span>
                  ) : (
                    <span className="muted" style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                      {qu(after, i.unit)} left in hand
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {noRecipe && <div className="stock-hint">{p?.name} has no recipe yet. An Admin needs to add it in Setup before batches can be logged.</div>}
        {editing && <div className="subtle" style={{ fontSize: 12 }}>Editing a record doesn&apos;t change stock. The material cost stays as it was when the batch was logged.</div>}

        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || short.length > 0 || noRecipe}>
          {busy ? 'Saving…' : editing ? 'Save changes' : `Log batch ${f.batchNo.trim().toUpperCase()}`}
        </button>
      </form>
    </>
  );
}
