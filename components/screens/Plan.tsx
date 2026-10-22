'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { SHOW_COST } from '@/lib/config';
import { daysFromToday, fmt, fmtDate, inputVal, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { packTxt, useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';

export function Plan() {
  const hasProducts = useModel().data.products.length > 0;
  return hasProducts ? <Planner /> : <NoProducts />;
}

function NoProducts() {
  const { perms } = useCurrentUser();
  const go = useGo();
  return (
    <div className="empty" style={{ padding: '28px 20px' }}>
      <div className="empty-t">No products yet</div>
      <div className="empty-s">Plans are made per product. {perms.setup ? 'Add your products and their recipes first.' : 'Ask an Admin to add products and recipes.'}</div>
      {perms.setup && (
        <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => go('setup', { setupTab: 'recipes' })}>
          Set up products
        </button>
      )}
    </div>
  );
}

function Planner() {
  const m = useModel();
  const go = useGo();
  const [busy, setBusy] = useState(false);
  const ui = useUI();
  const addForecast = useStore((s) => s.addForecast);
  const removeForecast = useStore((s) => s.removeForecast);

  const products = m.data.products;
  const pp = m.prodById[ui.planProduct] ?? products[0];
  const pb = Math.max(0, Math.floor(num(ui.planBatches)));
  const planDate = ui.planDate ?? daysFromToday(6);
  const coverBatches = m.capacity(pp, m.free).batches;
  const impact = m.planImpact(pp, pb);

  const summary =
    impact.shortCount > 0
      ? `${plural(impact.shortCount, 'material')} short` + (SHOW_COST ? ` · PO est. ${money(impact.orderCost)}` : '')
      : pb > 0
        ? 'All materials covered'
        : 'Set batches to preview';
  const commitLabel = pb > 0 ? `Commit plan · ${plural(pb, 'batch', 'batches')}` : 'Commit plan';

  async function commit() {
    if (pb < 1 || busy) return;
    setBusy(true);
    const saved = await addForecast({ productId: pp.id, batches: pb, date: planDate });
    setBusy(false);
    if (!saved) return;
    ui.set({ planBatches: 0 });
    const what = `${pp.name} · ${plural(pb, 'batch', 'batches')} committed.`;
    if (impact.shortCount > 0)
      toast(`${what} ${plural(impact.shortCount, 'material')} need ordering.`, { label: 'Review', fn: () => go('orders') });
    else toast(`${what} All materials covered.`);
  }

  const commitBlock = (
    <>
      <div className="commit-summary tnum">
        <span>{summary}</span>
        {SHOW_COST && <span className="subtle">Materials {money(impact.materialCost)}</span>}
      </div>
      <button type="button" className="btn btn-primary btn-lg" disabled={pb < 1 || busy} onClick={commit}>
        {commitLabel}
      </button>
    </>
  );

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Plan
        </h1>
        <div className="page-sub">Forecast batches and check material impact before you commit.</div>
      </div>

      <div className="plan-grid">
        <div className="plan-left">
          <section>
            <div className="sec-head">
              <h2 id="plan-product" className="eyebrow" style={{ margin: 0 }}>
                Product
              </h2>
            </div>
            <div className="col" style={{ gap: 8 }} role="radiogroup" aria-labelledby="plan-product">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={p.id === pp.id}
                  className="radio-card"
                  style={{ minHeight: 60, padding: '12px 14px' }}
                  onClick={() => ui.set({ planProduct: p.id })}
                >
                  <span className="radio-dot" />
                  <span className="row-main">
                    <span className="row-title">{p.name}</span>
                    <span className="row-sub">
                      {qu(num(p.batchKg), 'kg')} · {fmt(m.perCase(p))} cases / batch · free stock covers{' '}
                      {plural(m.capacity(p, m.free).batches, 'batch', 'batches')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card pad">
            <div className="sec-head" style={{ marginBottom: 12 }}>
              <label htmlFor="plan-batches" className="eyebrow">
                Batches
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-ink)' }}>Free stock covers {coverBatches}</span>
            </div>
            <div className="big-stepper">
              <button type="button" className="big-step" aria-label="One batch fewer" onClick={() => ui.set({ planBatches: Math.max(0, pb - 1) })}>
                <Icon name="minus" size={22} stroke={2.2} />
              </button>
              <input
                id="plan-batches"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="big-input"
                value={ui.planBatches}
                onChange={(e) => ui.set({ planBatches: inputVal(e.target.value, true) })}
              />
              <button type="button" className="big-step" aria-label="One batch more" onClick={() => ui.set({ planBatches: pb + 1 })}>
                <Icon name="plus" size={22} stroke={2.2} />
              </button>
            </div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="cell">
                <div className="cell-k">Batch weight</div>
                <div className="cell-v big">{qu(pb * num(pp.batchKg), 'kg')}</div>
              </div>
              <div className="cell">
                <div className="cell-k">Cases</div>
                <div className="cell-v big">{fmt(Math.floor(pb * m.perCase(pp)))}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="plan-date" className="field-label sm">
                Target date
              </label>
              <input id="plan-date" type="date" className="input" value={planDate} onChange={(e) => ui.set({ planDate: e.target.value })} />
            </div>
            <div className="commit-inline w-only">{commitBlock}</div>
          </section>
        </div>

        <section className="min0">
          <div className="sec-head" style={{ alignItems: 'center', marginBottom: 4 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>
              Material impact
            </h2>
            {impact.shortCount > 0 ? (
              <span className="pill danger">{impact.shortCount} short</span>
            ) : (
              <span className="pill ok">All covered</span>
            )}
          </div>
          <div className="subtle" style={{ marginBottom: 10, fontSize: 12 }}>
            Free stock = in-hand + pipeline, minus what committed plans already use.
          </div>
          <div className="card clip list">
            {impact.lines.map((l) => {
              const scale = Math.max(l.need, l.free, 1e-9);
              const covered = ((Math.min(l.need, l.free) / scale) * 100).toFixed(1) + '%';
              const shortW = ((l.short / scale) * 100).toFixed(1) + '%';
              return (
                <div key={l.i.id} style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{l.i.name}</span>
                    <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                      {qu(l.need, l.i.unit)}
                    </span>
                  </div>
                  <div className="impact-bar">
                    <div style={{ left: 0, width: covered, background: 'var(--navy)' }} />
                    <div style={{ left: covered, width: shortW, background: 'var(--danger)' }} />
                  </div>
                  {l.short > 0 ? (
                    <div className="tnum" style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>
                      Short {qu(l.short, l.i.unit)} → order {packTxt(l.i, l.packs)} = {qu(l.order, l.i.unit)}
                      {SHOW_COST && ` · ${money(l.order * num(l.i.cost))}`}
                    </div>
                  ) : (
                    <div className="muted tnum" style={{ fontSize: 12 }}>
                      {qu(l.free, l.i.unit)} free · {qu(l.free - l.need, l.i.unit)} left after this plan
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="commit-bar n-only">{commitBlock}</div>

      <section>
        <div className="sec-head">
          <h2 className="eyebrow" style={{ margin: 0 }}>
            Committed plans
          </h2>
          <span className="sec-meta">{plural(m.forecastsSorted.length, 'plan')}</span>
        </div>
        <div className="plans-grid">
          {m.forecastsSorted.map((f) => {
            const p = m.prodById[f.productId];
            const cases = fmt(Math.floor(num(f.batches) * (p ? m.perCase(p) : 0)));
            return (
              <div key={f.id} className="plan-card">
                <div className="min0" style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p?.name ?? '—'}</div>
                  <div className="muted tnum" style={{ marginTop: 2, fontSize: 12 }}>
                    {plural(num(f.batches), 'batch', 'batches')} · {cases} cases · due {fmtDate(f.date)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0 14px' }}
                  onClick={() => {
                    ui.set({ runId: f.id, runBatches: 1 });
                    ui.openSheet('run');
                  }}
                >
                  Log run
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove plan for ${p?.name ?? 'product'}`}
                  onClick={async () => {
                    const undo = await removeForecast(f.id);
                    if (undo) toast('Plan removed.', { label: 'Undo', fn: undo });
                  }}
                >
                  <Icon name="x" size={16} stroke={2.2} />
                </button>
              </div>
            );
          })}
        </div>
        {!m.forecastsSorted.length && (
          <div className="empty">
            <div className="empty-t">No committed plans</div>
            <div className="empty-s">Set batches above and commit to allocate stock.</div>
          </div>
        )}
      </section>
    </div>
  );
}
