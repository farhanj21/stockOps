'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { downloadWorkbook } from '@/lib/export';
import { fmt, money, num, qu, round } from '@/lib/format';
import { useShowCost } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { toast, useUI } from '@/lib/ui';

/**
 * Batch calculator: pick a product and a batch size, and see how much of each material that batch needs.
 * Ingredients scale with the batch weight (their recipe % stays the same); packaging scales with the
 * units made and is rounded up to whole pieces. Only roles with "Batch calculator" see it.
 */
export function BatchCalculator() {
  const m = useModel();
  const showCost = useShowCost();
  const setUI = useUI((s) => s.set);
  const products = m.data.products;
  const [productId, setProductId] = useState(() => useUI.getState().batchProduct || products[0]?.id || '');
  const p = m.prodById[productId] ?? products[0];
  const [kg, setKg] = useState(() => String(num(p?.batchKg) || ''));

  if (!p) return null;
  const recipeKg = Math.max(num(p.batchKg), 1e-9);
  const batchKg = Math.max(0, num(kg));
  const factor = batchKg / recipeKg;
  const units = Math.floor(num(p.upb) * factor);
  const cases = Math.floor(units / Math.max(1, num(p.upc)));

  const lines = m.recipeOf(p.id).map((r) => {
    const i = m.byId[r.ing];
    const mix = !!i && i.kind !== 'packaging';
    const exact = num(r.qty) * factor;
    const qty = mix ? round(exact) : Math.ceil(exact - 1e-9);
    const inHand = num(i?.inHand);
    const counts = !!i && i.kind !== 'utility';
    return {
      id: r.ing,
      name: i?.name ?? r.ing,
      kind: i?.kind ?? 'ingredient',
      unit: i?.unit ?? '',
      pct: mix ? (num(r.qty) / recipeKg) * 100 : null,
      qty,
      inHand,
      short: counts ? Math.max(0, qty - inHand) : 0,
      cost: qty * num(i?.cost),
    };
  });
  const mixKg = lines.reduce((a, l) => a + (l.pct !== null ? l.qty : 0), 0);
  const totalCost = lines.reduce((a, l) => a + l.cost, 0);
  const anyShort = lines.some((l) => l.short > 0);

  const pick = (id: string) => {
    const np = m.prodById[id];
    setProductId(id);
    setUI({ batchProduct: id });
    setKg(String(num(np?.batchKg) || ''));
  };

  const exportIt = () => {
    const rows = lines.map((l) => ({
      Material: l.name,
      Type: l.kind,
      '% of batch': l.pct !== null ? Math.round(l.pct * 1000) / 1000 : '',
      Quantity: l.qty,
      Unit: l.unit,
      'In hand': round(l.inHand),
      Short: l.kind === 'utility' ? '' : round(l.short),
      'Cost (Rs)': Math.round(l.cost * 100) / 100,
    }));
    const summary = [
      { Item: 'Product', Value: p.name },
      { Item: 'Batch size (kg)', Value: round(batchKg) },
      { Item: 'Recipe batch size (kg)', Value: round(recipeKg) },
      { Item: 'Units (approx.)', Value: units },
      { Item: 'Cases (approx.)', Value: cases },
      { Item: 'Batch cost (Rs)', Value: Math.round(totalCost * 100) / 100 },
      { Item: 'Cost per kg (Rs)', Value: batchKg > 0 ? Math.round((totalCost / batchKg) * 100) / 100 : '' },
    ];
    const name = `batch-calculator-${p.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${round(batchKg)}kg`;
    downloadWorkbook(name, [
      { name: 'Materials', rows },
      // "(Rs" in the key is how the exporter spots money; summary rows carry it in the Item text instead.
      { name: 'Summary', rows: showCost ? summary : summary.filter((r) => !r.Item.includes('(Rs')) },
    ]).catch(() => toast("Couldn't build the export."));
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card pad col" style={{ gap: 12 }}>
        <div className="grid2" style={{ gap: 10 }}>
          <div>
            <label htmlFor="calc-product" className="field-label sm">
              Product recipe
            </label>
            <select id="calc-product" className="input" value={p.id} onChange={(e) => pick(e.target.value)}>
              {products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="calc-kg" className="field-label sm">
              Batch size
            </label>
            <div className="input-shell" style={{ height: 46 }}>
              <input id="calc-kg" type="number" inputMode="decimal" min={0} placeholder="Enter kg" style={{ fontWeight: 600 }} value={kg} onChange={(e) => setKg(e.target.value)} />
              <span className="subtle" style={{ paddingRight: 14, fontSize: 12 }}>
                kg
              </span>
            </div>
          </div>
        </div>
        <div className="subtle tnum" style={{ fontSize: 12 }}>
          Recipe is {qu(recipeKg, 'kg')} per batch · this is ×{fmt(Math.round(factor * 1000) / 1000)} · about {fmt(units)} units / {fmt(cases)} cases
        </div>
      </div>

      {!lines.length ? (
        <div className="empty">
          <div className="empty-t">No recipe yet</div>
          <div className="empty-s">{p.name} has no materials in its recipe. An Admin adds them in Setup.</div>
        </div>
      ) : (
        <div className="card clip report-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">% of batch</th>
                <th className="num">Quantity</th>
                <th className="num">In hand</th>
                {showCost && <th className="num">Cost</th>}
              </tr>
            </thead>
            <tbody className="tnum">
              {lines.map((l) => (
                <tr key={l.id}>
                  <th scope="row">
                    {l.name}
                    {l.kind !== 'ingredient' && <span className="subtle"> · {l.kind}</span>}
                  </th>
                  <td className="num">{l.pct !== null ? `${fmt(Math.round(l.pct * 1000) / 1000)}%` : '—'}</td>
                  <td className="num strong">{qu(l.qty, l.unit)}</td>
                  <td className={`num${l.short > 0 ? ' warn-text' : ''}`}>
                    {l.kind === 'utility' ? '—' : qu(l.inHand, l.unit)}
                    {l.short > 0 && <div style={{ fontSize: 11 }}>short {qu(l.short, l.unit)}</div>}
                  </td>
                  {showCost && <td className="num">{money(l.cost)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="tnum">
              <tr>
                <th scope="row">Mix total</th>
                <td className="num">{fmt(Math.round((mixKg / Math.max(batchKg, 1e-9)) * 1000) / 10)}%</td>
                <td className="num">{qu(mixKg, 'kg')}</td>
                <td />
                {showCost && <td className="num">{money(totalCost)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showCost && lines.length > 0 && batchKg > 0 && (
        <div className="subtle tnum" style={{ fontSize: 12 }}>
          Batch cost {money(totalCost)} · {money(totalCost / batchKg)} per kg at current material prices.
        </div>
      )}
      {anyShort && <div className="stock-hint">Some materials are short for this batch size. Receive stock before making it.</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline" disabled={!lines.length || !(batchKg > 0)} onClick={exportIt}>
          <Icon name="download" size={16} /> Export to Excel
        </button>
      </div>
      <div className="subtle" style={{ fontSize: 12 }}>
        Ingredients keep their recipe percentages. Packaging scales with the units made and is rounded up to whole pieces. Nothing is deducted from stock.
      </div>
    </div>
  );
}
