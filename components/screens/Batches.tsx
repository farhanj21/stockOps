'use client';

import { useState } from 'react';
import { deleteBatch } from '@/app/actions';
import { Icon } from '@/components/Icon';
import { useCurrentUser, useShowCost } from '@/lib/hooks';
import { batchRows, downloadWorkbook, totalsRows } from '@/lib/export';
import { fmt, fmtDate, money, plural, qu } from '@/lib/format';
import { useModel } from '@/lib/model';
import { batchMetrics, byMonth, byProduct, inPeriod, periodsWithData, totals, type ProductionTotals } from '@/lib/production';
import { useStore } from '@/lib/store';
import type { Batch } from '@/lib/types';
import { confirmDialog, toast, useUI } from '@/lib/ui';

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
  const SHOW_COST = useShowCost();
  const canDelete = useCurrentUser().perms.plan;
  const send = useStore((s) => s.send);

  // Same rule as the batch sheet: only the record goes; stock and plans stay as they are.
  async function remove(b: Batch) {
    const ok = await confirmDialog({
      title: `Delete batch ${b.batchNo}?`,
      body: "The batch record is removed from batches and reports. In-hand stock doesn't change. This can't be undone.",
      confirmLabel: 'Delete batch',
      danger: true,
    });
    if (!ok) return;
    const res = await send(() => deleteBatch(b.id));
    if (res) toast(`Batch ${res.batchNo} deleted.`);
  }
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
        <button
          type="button"
          className="btn btn-outline"
          disabled={!rows.length}
          onClick={() =>
            downloadWorkbook(month ? `batches-${month}` : 'batches', [{ name: 'Batches', rows: batchRows(m, rows) }]).catch(() =>
              toast("Couldn't build the export."),
            )
          }
        >
          <Icon name="download" size={16} /> Export
        </button>
        <button type="button" className="btn btn-primary" style={{ marginLeft: 0 }} onClick={() => openBatch()}>
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
                  {SHOW_COST && <th className="num">Cost / batch</th>}
                  {SHOW_COST && <th className="num">Cost / kg</th>}
                  <th>Logged by</th>
                  <th aria-label="Actions" />
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
                        {b.plannedUnits ? `${fmt(x.wastageUnits)} units · ` : ''}
                        {qu(x.wastageKg, 'kg')} <span className="subtle">({pct(x.wastagePct)})</span>
                      </td>
                      <td className="num">{fmt(b.units)}</td>
                      <td className="num">{fmt(b.cases)}</td>
                      {SHOW_COST && <td className="num">{money(b.materialCost)}</td>}
                      {SHOW_COST && <td className="num">{money(x.costPerKg)}</td>}
                      <td className="muted">{b.by}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button type="button" className="icon-btn" aria-label={`Edit batch ${b.batchNo}`} title="Edit" onClick={() => openBatch(b.id)}>
                            <Icon name="edit" size={16} stroke={2} />
                          </button>
                          {canDelete && (
                            <button type="button" className="icon-btn" aria-label={`Delete batch ${b.batchNo}`} title="Delete" style={{ color: 'var(--danger)' }} onClick={() => void remove(b)}>
                              <Icon name="trash" size={16} stroke={2} />
                            </button>
                          )}
                        </div>
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
  const SHOW_COST = useShowCost();
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
          Wastage {b.plannedUnits ? `${fmt(x.wastageUnits)} units · ` : ''}
          {qu(x.wastageKg, 'kg')} ({pct(x.wastagePct)})
        </span>
        {SHOW_COST && (
          <span className="subtle">
            {' '}
            · {money(b.materialCost)}/batch · {money(x.costPerKg)}/kg
          </span>
        )}
      </div>
    </button>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────────

/**
 * Monthly and yearly production, always for one product at a time (products are never added together):
 * kg, units, cases, wastage and average cost per kg, plus a side-by-side table of every product.
 */
export function ProductionReports() {
  const SHOW_COST = useShowCost();
  const m = useModel();
  const all = m.data.batches;
  const { months, years } = periodsWithData(all);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [pick, setPick] = useState<{ month?: string; year?: string }>({});
  const [productPick, setProductPick] = useState('');

  if (!all.length) return <NoBatches />;

  const period = mode === 'month' ? (pick.month && months.includes(pick.month) ? pick.month : months[0]) : pick.year && years.includes(pick.year) ? pick.year : years[0];
  const year = period.slice(0, 4);
  const inIt = inPeriod(all, period);
  const rows = byProduct(inIt, m.data.products);
  // Default: the product with the most kg made in this period (or the first product if none).
  const busiest = [...rows].sort((a, b) => b.actualKg - a.actualKg)[0]?.product.id;
  const productId = m.prodById[productPick] ? productPick : (busiest ?? m.data.products[0]?.id ?? '');
  const productName = m.prodById[productId]?.name ?? '—';
  const mine = inIt.filter((b) => b.productId === productId);
  const t = totals(mine);
  const trend = byMonth(all, year, productId);
  const trendTotal = totals(all.filter((b) => b.date.startsWith(year) && b.productId === productId));
  const label = mode === 'month' ? monthName(period) : period;
  const fileSlug = productName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

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
        <select className="input" aria-label="Product" value={productId} onChange={(e) => setProductPick(e.target.value)}>
          {m.data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            downloadWorkbook(`production-report-${fileSlug}-${period}`, [
              { name: `Summary ${label}`, rows: totalsRows('Product', [{ label: productName, t }]) },
              {
                name: `Month by month ${year}`,
                rows: totalsRows(
                  'Month',
                  trend.map((r) => ({ label: monthName(r.month), t: r })),
                  { label: `Year ${year}`, t: trendTotal },
                ),
              },
              { name: `Batches ${label}`, rows: batchRows(m, mine) },
              { name: `All products ${label}`, rows: totalsRows('Product', rows.map((r) => ({ label: r.product.name, t: r }))) },
            ]).catch(() => toast("Couldn't build the export."))
          }
        >
          <Icon name="download" size={16} /> Export
        </button>
      </div>

      <h2 className="eyebrow" style={{ margin: 0 }}>
        {productName} · {label}
      </h2>
      {!t.batches && (
        <div className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          No batches of {productName} in {label}.
        </div>
      )}
      <div className="kpi-grid tnum">
        <Kpi k="Batches" v={fmt(t.batches)} />
        <Kpi k="Kg produced" v={qu(t.actualKg, 'kg')} />
        <Kpi k="Units" v={fmt(t.units)} />
        <Kpi k="Cases" v={fmt(t.cases)} />
        <Kpi k="Wastage" v={`${qu(t.wastageKg, 'kg')} · ${pct(t.wastagePct)}`} />
        {SHOW_COST && <Kpi k="Avg cost / kg" v={money(t.costPerKg)} />}
      </div>

      {SHOW_COST && t.batches > 0 && <WastageSummary label={`${productName} · ${label}`} t={t} batches={mine} />}

      <section>
        <div className="sec-head">
          <h2 className="eyebrow" style={{ margin: 0 }}>
            Month by month · {productName} · {year}
          </h2>
        </div>
        <TotalsTable first="Month" rows={trend.map((r) => ({ key: r.month, label: monthName(r.month).slice(0, 3), t: r }))} total={trendTotal} totalLabel={`Year ${year}`} />
      </section>

      <section>
        <div className="sec-head">
          <h2 className="eyebrow" style={{ margin: 0 }}>
            Each product side by side · {label}
          </h2>
        </div>
        <TotalsTable first="Product" rows={rows.map((r) => ({ key: r.product.id, label: r.product.name, t: r }))} />
        {SHOW_COST && (
          <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
            Cost / kg is material cost ÷ kg actually produced, so wastage raises it. Averages are weighted by kg.
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Where the money went: material spent, how much of it was lost as wastage, and the batches
 * that lost the most. Only shown to roles with "See costs".
 */
function WastageSummary({ label, t, batches }: { label: string; t: ProductionTotals; batches: Batch[] }) {
  const m = useModel();
  const idealPerKg = t.plannedKg > 0 ? t.materialCost / t.plannedKg : 0;
  const worstBatches = batches
    .map((b) => ({ b, x: batchMetrics(b) }))
    .filter(({ x }) => x.wastageKg > 0)
    .sort((a, b) => b.x.wastageCost - a.x.wastageCost)
    .slice(0, 5);

  return (
    <section className="card pad col" style={{ gap: 14 }}>
      <div>
        <h2 className="eyebrow" style={{ margin: 0 }}>
          Wastage &amp; cost · {label}
        </h2>
        <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
          Wastage is the recipe&apos;s batch weight minus the kg actually made. Its cost is the share of each batch&apos;s material cost that was lost.
        </div>
      </div>

      <div className="kpi-grid tnum">
        <Kpi k="Material used" v={money(t.materialCost)} />
        <Kpi k="Lost to wastage" v={money(t.wastageCost)} />
        <Kpi k="Kg wasted" v={`${qu(t.wastageKg, 'kg')} · ${pct(t.wastagePct)}`} />
        <Kpi k="Cost / kg, no wastage" v={money(idealPerKg)} />
        <Kpi k="Cost / kg, actual" v={money(t.costPerKg)} />
        <Kpi k="Extra cost / kg" v={money(Math.max(0, t.costPerKg - idealPerKg))} />
      </div>

      {worstBatches.length > 0 && (
        <div>
          <div className="field-label sm">Batches that lost the most</div>
          <div className="list">
            {worstBatches.map(({ b, x }) => (
              <button key={b.id} type="button" className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', width: '100%' }} onClick={() => openBatch(b.id)}>
                <span className="row-main" style={{ textAlign: 'left' }}>
                  <span className="row-title">{b.batchNo}</span>
                  <span className="row-sub">
                    {m.prodById[b.productId]?.name ?? '—'} · {fmtDate(b.date)}
                  </span>
                </span>
                <span className="tnum muted" style={{ fontSize: 13 }}>
                  {qu(x.wastageKg, 'kg')} · {pct(x.wastagePct)} · <strong style={{ color: 'var(--danger)' }}>{money(x.wastageCost)}</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {t.wastageKg <= 0 && <div className="muted" style={{ fontSize: 13 }}>No wastage recorded in this period.</div>}
    </section>
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
  /** Footer row; left out where it would add different products together. */
  total?: ProductionTotals;
  totalLabel?: string;
}) {
  const SHOW_COST = useShowCost();
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
        {total && (
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
        )}
      </table>
    </div>
  );
}
