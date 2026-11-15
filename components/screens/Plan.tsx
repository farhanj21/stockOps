'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { LastUpdated } from '@/components/LastUpdated';
import { daysFromToday, fmt, fmtDate, inputVal, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useGo, useShowCost } from '@/lib/hooks';
import { packTxt, useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import { toast, useUI, type PlanTab } from '@/lib/ui';
import { BatchCalculator } from './BatchCalculator';
import { BatchRecords, ProductionReports } from './Batches';

const TABS: [PlanTab, string][] = [
  ['plan', 'Plan'],
  ['batches', 'Batches'],
  ['calc', 'Calculator'],
  ['reports', 'Reports'],
];

/** Production: plan batches, record each batch made, and see monthly / yearly totals. */
export function Plan() {
  const hasProducts = useModel().data.products.length > 0;
  const { perms } = useCurrentUser();
  const picked = useUI((s) => s.planTab);
  const setUI = useUI((s) => s.set);
  // The calculator shows recipe quantities, so it's only for roles with "Batch calculator".
  const tabs = TABS.filter(([k]) => k !== 'calc' || perms.calc);
  const tab = picked === 'calc' && !perms.calc ? 'plan' : picked;
  if (!hasProducts) return <NoProducts />;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Production
        </h1>
        <div className="page-sub">Plan batches, record each batch made, and see monthly and yearly totals.</div>
      </div>
      <LastUpdated />
      <div className="tabs" role="tablist" aria-label="Production sections">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className="tab"
            onClick={() => setUI({ planTab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'batches' ? <BatchRecords /> : tab === 'calc' ? <BatchCalculator /> : tab === 'reports' ? <ProductionReports /> : <Planner />}
      </div>
    </div>
  );
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
  const SHOW_COST = useShowCost();
  const m = useModel();
  const go = useGo();
  const [busy, setBusy] = useState(false);
  const ui = useUI();
  const addForecast = useStore((s) => s.addForecast);
  const removeForecast = useStore((s) => s.removeForecast);

  const products = m.data.products;
  const pp = m.prodById[ui.planProduct] ?? products[0];
  const upb = num(pp.upb);
  const upc = Math.max(1, num(pp.upc));
  // A custom quantity is scaled from the recipe by units, so it needs units per batch set in Setup.
  const canCustom = upb > 0;
  const custom = ui.planMode === 'custom' && canCustom;
  const customUnits = Math.floor(num(ui.planCases)) * upc + Math.floor(num(ui.planLoose));
  // Custom = one batch of `customUnits`; regular = whole recipe batches.
  const pb = custom ? (customUnits > 0 ? 1 : 0) : Math.max(0, Math.floor(num(ui.planBatches)));
  const planDate = ui.planDate ?? daysFromToday(6);
  // How much more in-hand stock can make, after what committed plans already need.
  const cover = m.capacity(pp, m.freeInHand);
  const coverBatches = cover.batches;
  const impact = m.planImpact(pp, pb, custom ? customUnits : null);
  const toRequest = impact.lines.filter((l) => l.packs > 0).length;
  const qtyTxt = (units: number) => {
    const c = Math.floor(units / upc);
    const loose = units - c * upc;
    return `${plural(c, 'case')}${loose > 0 ? ` + ${plural(loose, 'unit')}` : ''}`;
  };
  const sizeTxt = custom ? qtyTxt(customUnits) : plural(pb, 'batch', 'batches');

  const summary =
    impact.shortCount > 0
      ? `${plural(impact.shortCount, 'material')} short in hand` + (SHOW_COST && impact.orderCost > 0 ? ` · request est. ${money(impact.orderCost)}` : '')
      : pb > 0
        ? 'All materials covered'
        : custom
          ? 'Enter a quantity to preview'
          : 'Set batches to preview';
  const commitLabel = pb > 0 ? `Commit plan · ${sizeTxt}` : 'Commit plan';

  async function commit() {
    if (pb < 1 || busy) return;
    setBusy(true);
    const saved = await addForecast({ productId: pp.id, batches: pb, date: planDate, customUnits: custom ? customUnits : null });
    setBusy(false);
    if (!saved) return;
    ui.set(custom ? { planCases: '', planLoose: '' } : { planBatches: 0 });
    const what = `${pp.name} · ${sizeTxt} committed.`;
    if (toRequest > 0) toast(`${what} ${plural(toRequest, 'material')} need requesting.`, { label: 'Review', fn: () => go('orders') });
    else if (impact.shortCount > 0) toast(`${what} ${plural(impact.shortCount, 'material')} short in hand, but already on the way.`);
    else toast(`${what} All materials in hand.`);
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

  // Shown in the left column on desktop and at the bottom on phones.
  const plansSection = (
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
          const cases = fmt(Math.floor(num(f.batches) * m.planCases(f)));
          const fUpc = Math.max(1, num(p?.upc));
          const fLoose = f.customUnits ? f.customUnits % fUpc : 0;
          return (
            <div key={f.id} className="plan-card">
              <div className="min0" style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p?.name ?? '—'}</div>
                <div className="muted tnum" style={{ marginTop: 2, fontSize: 12 }}>
                  {f.customUnits ? (
                    <>
                      Custom{num(f.batches) > 1 ? ` × ${fmt(num(f.batches))}` : ''} · {cases} cases{fLoose > 0 ? ` + ${plural(fLoose, 'unit')}` : ''}
                    </>
                  ) : (
                    <>
                      {plural(num(f.batches), 'batch', 'batches')} · {cases} cases
                    </>
                  )}{' '}
                  · due {fmtDate(f.date)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0 14px' }}
                onClick={() => {
                  ui.set({ runId: f.id });
                  ui.openSheet('batch');
                }}
              >
                Log batch
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
          <div className="empty-s">Pick a product, set batches and commit to allocate stock.</div>
        </div>
      )}
    </section>
  );

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="plan-grid">
        <div className="plan-left">
          <section>
            <label htmlFor="plan-product" className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Product
            </label>
            <select id="plan-product" className="input" value={pp.id} onChange={(e) => ui.set({ planProduct: e.target.value })}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="row-sub tnum" style={{ marginTop: 6 }}>
              {qu(num(pp.batchKg), 'kg')} · {fmt(m.perCase(pp))} cases / batch · in-hand stock covers {plural(coverBatches, 'batch', 'batches')}
            </div>
          </section>

          <section className="card pad">
            <div className="seg plan-mode" role="radiogroup" aria-label="Production quantity">
              {(
                [
                  ['batch', 'Regular batches'],
                  ['custom', 'Custom quantity'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={(custom ? 'custom' : 'batch') === k}
                  disabled={k === 'custom' && !canCustom}
                  title={k === 'custom' && !canCustom ? 'Set units per batch for this product in Setup first' : undefined}
                  onClick={() => ui.set({ planMode: k })}
                >
                  {label}
                </button>
              ))}
            </div>
            {custom ? (
              <>
                <div className="sec-head" style={{ margin: '14px 0 8px' }}>
                  <span className="eyebrow">Quantity to make</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-ink)' }}>In-hand covers {qtyTxt(cover.units)}</span>
                </div>
                <div className="grid2" style={{ gap: 10 }}>
                  <div>
                    <label htmlFor="plan-cases" className="field-label sm">
                      Cases ({fmt(upc)} units each)
                    </label>
                    <input
                      id="plan-cases"
                      className="input tnum"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={ui.planCases}
                      onChange={(e) => ui.set({ planCases: inputVal(e.target.value, true) })}
                    />
                  </div>
                  <div>
                    <label htmlFor="plan-loose" className="field-label sm">
                      Loose units
                    </label>
                    <input
                      id="plan-loose"
                      className="input tnum"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={ui.planLoose}
                      onChange={(e) => ui.set({ planLoose: inputVal(e.target.value, true) })}
                    />
                  </div>
                </div>
                <div className="subtle tnum" style={{ marginTop: 8, fontSize: 12 }}>
                  = {fmt(customUnits)} units · ×{fmt(Math.round((customUnits / upb) * 1000) / 1000)} of the recipe ({fmt(upb)} units / batch). Ingredients scale with the recipe; packaging is rounded up to whole pieces.
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <div className="cell">
                    <div className="cell-k">Batch weight</div>
                    <div className="cell-v big">{qu((num(pp.batchKg) * customUnits) / upb, 'kg')}</div>
                  </div>
                  <div className="cell">
                    <div className="cell-k">Units</div>
                    <div className="cell-v big">{fmt(customUnits)}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="sec-head" style={{ margin: '14px 0 12px' }}>
              <label htmlFor="plan-batches" className="eyebrow">
                Batches
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-ink)' }}>In-hand covers {coverBatches}</span>
            </div>
            <div className="big-stepper">
              <button type="button" className="big-step" aria-label="One batch fewer" onClick={() => ui.set({ planBatches: Math.max(0, pb - 1) })}>
                <Icon name="minus" size={22} stroke={2.2} />
              </button>
              <input
                id="plan-batches" placeholder="0"
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
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <label htmlFor="plan-date" className="field-label sm">
                Target date
              </label>
              <input id="plan-date" type="date" className="input" value={planDate} onChange={(e) => ui.set({ planDate: e.target.value })} />
            </div>
            <div className="commit-inline w-only">{commitBlock}</div>
          </section>

          {/* Desktop: committed plans in the left column, under the batches card. */}
          <div className="w-only">{plansSection}</div>
        </div>

        <section className="min0">
          <div className="sec-head" style={{ alignItems: 'center', marginBottom: 4 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>
              Material impact
            </h2>
            {impact.shortCount > 0 ? (
              <span className="pill danger">{impact.shortCount} short</span>
            ) : (
              <span className="pill ok">All in hand</span>
            )}
          </div>
          <div className="subtle" style={{ marginBottom: 10, fontSize: 12 }}>
            Counts in-hand stock only, minus what committed plans already use. Pipeline (requested, not received) counts once it&apos;s received.
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
                    <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong)' }}>
                      {qu(l.need, l.i.unit)}
                    </span>
                  </div>
                  <div className="impact-bar">
                    <div style={{ left: 0, width: covered, background: 'var(--strong)' }} />
                    <div style={{ left: covered, width: shortW, background: 'var(--danger)' }} />
                  </div>
                  {l.short > 0 ? (
                    <div className="tnum" style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>
                      Short {qu(l.short, l.i.unit)} in hand
                      {l.coming > 0 && <span style={{ color: 'var(--warn)' }}> · {qu(l.coming, l.i.unit)} on the way</span>}
                      {l.packs > 0 ? (
                        <>
                          {' '}
                          → request {packTxt(l.i, l.packs)} = {qu(l.order, l.i.unit)}
                          {SHOW_COST && ` · ${money(l.order * num(l.i.cost))}`}
                        </>
                      ) : (
                        <span style={{ color: 'var(--warn)' }}> · nothing more to request</span>
                      )}
                    </div>
                  ) : (
                    <div className="muted tnum" style={{ fontSize: 12 }}>
                      {qu(l.free, l.i.unit)} in hand free · {qu(l.free - l.need, l.i.unit)} left after this plan
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="commit-bar n-only">{commitBlock}</div>

      {/* Phones: committed plans at the bottom, after the commit bar. */}
      <div className="n-only">{plansSection}</div>
    </div>
  );
}
