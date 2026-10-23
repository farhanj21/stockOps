'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { SHOW_COST } from '@/lib/config';
import { fmt, fmtDate, money, plural, qu } from '@/lib/format';
import { useModel } from '@/lib/model';
import { batchMetrics, byMonth, byProduct, inPeriod, periodsWithData, totals, type ProductionTotals } from '@/lib/production';
import type { Batch } from '@/lib/types';
import { useUI } from '@/lib/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const pct = (n: number) => `${fmt(Math.round(n * 10) / 10)}%`;

function openBatch(id?: string) {
  const ui = useUI.getState();
  if (!id) ui.set({ runId: null });
  ui.openSheet('batch', id);
}

function NoBatches({ filtered }: { filtered?: boolean }) {
  return (
    <div className="empty">
      <div className="empty-t">{filtered ? 'No batches match' : 'No batches logged yet'}</div>
      <div className="empty-s">
        {filtered ? 'Try another product or month.' : 'Each batch made gets a number, a production date and its kg, units and cases.'}
      </div>
      {!filtered && (
        <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => openBatch()}>
          Log a batch
        </button>
      )}
    </div>
  );
}

// ── Batch records ───────────────────────────────────────────────────────────

/** Every batch made, newest first, filterable by product and month. */
export function BatchRecords() {
  const m = useModel();
  const [product, setProduct] = useState('');
  const [month, setMonth] = useState('');
  const all = m.data.batches;
  const { months } = periodsWithData(all);
  const rows = all.filter((b) => (!product || b.productId === product) && (!month || b.date.startsWith(month)));
  const t = totals(rows);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="report-bar">
        <select className="input" aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>
          {m.data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All months</option>
          {months.map((x) => (
            <option key={x} value={x}>
              {monthName(x)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => openBatch()}>
          <Icon name="plus" size={16} stroke={2.2} /> Log a batch
        </button>
      </div>

      {!all.length ? (
        <NoBatches />
      ) : !rows.length ? (
        <NoBatches filtered />
      ) : (
        <>
          <div className="subtle tnum" style={{ fontSize: 12 }}>
            {plural(t.batches, 'batch', 'batches')} · {qu(t.actualKg, 'kg')} · {fmt(t.units)} units · {fmt(t.cases)} cases
            {SHOW_COST && ` · avg ${money(t.costPerKg)}/kg`}
          </div>

          {/* Phones: one card per batch */}
          <div className="col n-only" style={{ gap: 8 }}>
            {rows.map((b) => (
              <BatchCard key={b.id} b={b} />
            ))}
          </div>

          {/* Desktop: one table */}
          <div className="card clip w-only report-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Batch no.</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th className="num">Kg made</th>
                  <th className="num">Wastage</th>
                  <th className="num">Units</th>
                  <th className="num">Cases</th>
                  {SHOW_COST && <th className="num">Cost / kg</th>}
                  <th>Logged by</th>
                  <th aria-label="Edit" />
                </tr>
              </thead>
              <tbody className="tnum">
                {rows.map((b) => {
                  const x = batchMetrics(b);
                  return (
                    <tr key={b.id}>
                      <th scope="row" className="strong">
                        {b.batchNo}
                      </th>
                      <td>{fmtDate(b.date)}</td>
                      <td>{m.prodById[b.productId]?.name ?? '—'}</td>
                      <td className="num">{qu(b.actualKg, 'kg')}</td>
                      <td className={`num${x.wastageKg > 0 ? ' warn-text' : ''}`}>
                        {qu(x.wastageKg, 'kg')} <span className="subtle">({pct(x.wastagePct)})</span>
                      </td>
                      <td className="num">{fmt(b.units)}</td>
                      <td className="num">{fmt(b.cases)}</td>
                      {SHOW_COST && <td className="num">{money(x.costPerKg)}</td>}
                      <td className="muted">{b.by}</td>
                      <td>
                        <button type="button" className="icon-btn" aria-label={`Edit batch ${b.batchNo}`} onClick={() => openBatch(b.id)}>
                          <Icon name="edit" size={16} stroke={2} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BatchCard({ b }: { b: Batch }) {
  const m = useModel();
  const x = batchMetrics(b);
  return (
    <button type="button" className="card pad batch-card" onClick={() => openBatch(b.id)} aria-label={`Batch ${b.batchNo}, edit`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--strong)' }}>
          {b.batchNo}
        </span>
        <span className="subtle" style={{ fontSize: 12 }}>
          {fmtDate(b.date)}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{m.prodById[b.productId]?.name ?? '—'}</div>
      <div className="muted tnum" style={{ fontSize: 12, marginTop: 6 }}>
        {qu(b.actualKg, 'kg')} · {fmt(b.units)} units · {fmt(b.cases)} cases
      </div>
      <div className="tnum" style={{ fontSize: 12, marginTop: 2 }}>
        <span className={x.wastageKg > 0 ? 'warn-text' : 'subtle'}>
          Wastage {qu(x.wastageKg, 'kg')} ({pct(x.wastagePct)})
        </span>
        {SHOW_COST && <span className="subtle"> · {money(x.costPerKg)}/kg</span>}
      </div>
    </button>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────

/** Monthly and yearly production per product: kg, units, cases, wastage and average cost per kg. */
export function ProductionReports() {
  const m = useModel();
  const all = m.data.batches;
  const { months, years } = periodsWithData(all);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [pick, setPick] = useState<{ month?: string; year?: string }>({});
  const [trendProduct, setTrendProduct] = useState('');

  if (!all.length) return <NoBatches />;

  const period = mode === 'month' ? (pick.month && months.includes(pick.month) ? pick.month : months[0]) : pick.year && years.includes(pick.year) ? pick.year : years[0];
  const year = period.slice(0, 4);
  const inIt = inPeriod(all, period);
  const t = totals(inIt);
  const rows = byProduct(inIt, m.data.products);
  const trend = byMonth(all, year, trendProduct || undefined);
  const trendTotal = totals(all.filter((b) => b.date.startsWith(year) && (!trendProduct || b.productId === trendProduct)));
  const label = mode === 'month' ? monthName(period) : period;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="report-bar">
        <div className="seg" role="radiogroup" aria-label="Report period">
          {(['month', 'year'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>
              {k === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        <select
          className="input"
          aria-label={mode === 'month' ? 'Month' : 'Year'}
          value={period}
          onChange={(e) => setPick((p) => ({ ...p, [mode]: e.target.value }))}
        >
          {(mode === 'month' ? months : years).map((x) => (
            <option key={x} value={x}>
              {mode === 'month' ? monthName(x) : x}
            </option>
          ))}
        </select>
      </div>

      <div className="kpi-grid tnum">
        <Kpi k="Batches" v={fmt(t.batches)} />
        <Kpi k="Kg produced" v={qu(t.actualKg, 'kg')} />
        <Kpi k="Units" v={fmt(t.units)} />
        <Kpi k="Cases" v={fmt(t.cases)} />
        <Kpi k="Wastage" v={`${qu(t.wastageKg, 'kg')} · ${pct(t.wastagePct)}`} />
        {SHOW_COST && <Kpi k="Avg cost / kg" v={money(t.costPerKg)} />}
      </div>

      <section>
        <div className="sec-head">
          <h2 className="eyebrow" style={{ margin: 0 }}>
            By product · {label}
          </h2>
        </div>
        <TotalsTable
          first="Product"
          rows={rows.map((r) => ({ key: r.product.id, label: r.product.name, t: r }))}
          total={t}
        />
        {SHOW_COST && (
          <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
            Cost / kg is material cost ÷ kg actually produced, so wastage raises it. Averages are weighted by kg.
          </div>
        )}
      </section>

      <section>
        <div className="sec-head" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 className="eyebrow" style={{ margin: 0 }}>
            Month by month · {year}
          </h2>
          <select className="input report-inline-select" aria-label="Product for month by month" value={trendProduct} onChange={(e) => setTrendProduct(e.target.value)}>
            <option value="">All products</option>
            {m.data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <TotalsTable first="Month" rows={trend.map((r) => ({ key: r.month, label: monthName(r.month).slice(0, 3), t: r }))} total={trendTotal} totalLabel={`Year ${year}`} />
      </section>
    </div>
  );
}

function Kpi({ k, v }: { k: string; v: string }) {
  return (
    <div className="cell">
      <div className="cell-k">{k}</div>
      <div className="cell-v sm">{v}</div>
    </div>
  );
}

function TotalsTable({
  first,
  rows,
  total,
  totalLabel = 'Total',
}: {
  first: string;
  rows: { key: string; label: string; t: ProductionTotals }[];
  total: ProductionTotals;
  totalLabel?: string;
}) {
  const dash = (n: number, s: string) => (n ? s : '—');
  return (
    <div className="card clip report-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>{first}</th>
            <th className="num">Batches</th>
            <th className="num">Kg</th>
            <th className="num">Units</th>
            <th className="num">Cases</th>
            <th className="num">Wastage</th>
            {SHOW_COST && <th className="num">Avg cost / kg</th>}
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map(({ key, label, t }) => (
            <tr key={key} className={t.batches ? undefined : 'quiet'}>
              <th scope="row">{label}</th>
              <td className="num">{dash(t.batches, fmt(t.batches))}</td>
              <td className="num">{dash(t.batches, qu(t.actualKg, 'kg'))}</td>
              <td className="num">{dash(t.batches, fmt(t.units))}</td>
              <td className="num">{dash(t.batches, fmt(t.cases))}</td>
              <td className="num">{dash(t.batches, pct(t.wastagePct))}</td>
              {SHOW_COST && <td className="num">{dash(t.batches, money(t.costPerKg))}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot className="tnum">
          <tr>
            <th scope="row">{totalLabel}</th>
            <td className="num">{fmt(total.batches)}</td>
            <td className="num">{qu(total.actualKg, 'kg')}</td>
            <td className="num">{fmt(total.units)}</td>
            <td className="num">{fmt(total.cases)}</td>
            <td className="num">{pct(total.wastagePct)}</td>
            {SHOW_COST && <td className="num">{money(total.costPerKg)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
