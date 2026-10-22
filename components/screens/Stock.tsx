'use client';

import type { ChangeEvent } from 'react';
import { Icon } from '@/components/Icon';
import { useStockSummary } from '@/components/shell/AppShell';
import { useOpeners } from '@/components/sheets/openers';
import { cap1, fmt, inputVal, num, qu } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import type { Ingredient } from '@/lib/types';
import { useUI, type StockFilter } from '@/lib/ui';

type Field = 'inHand' | 'pipeline';

export function Stock() {
  const m = useModel();
  const { perms } = useCurrentUser();
  const filter = useUI((s) => s.stockFilter);
  const setUI = useUI((s) => s.set);
  const openSheet = useUI((s) => s.openSheet);
  const step = useStore((s) => s.stepIngredient);
  const update = useStore((s) => s.updateIngredient);
  const { openMat } = useOpeners();
  const summary = useStockSummary();

  const filters: [StockFilter, string, (i: Ingredient) => boolean][] = [
    ['all', 'All', () => true],
    ['low', `Below par · ${m.alerts.length}`, m.isLow],
    ['ingredient', 'Ingredients', (i) => i.kind === 'ingredient'],
    ['packaging', 'Packaging', (i) => i.kind === 'packaging'],
  ];
  const test = filters.find(([k]) => k === filter)?.[2] ?? (() => true);
  const rows = m.ings.filter(test).map((i) => {
    const t = m.total(i);
    const par = num(i.par);
    const max = Math.max(par * 1.5, t, 1e-9);
    return {
      i,
      t,
      par,
      low: m.isLow(i),
      pct: Math.min(100, (t / max) * 100).toFixed(1) + '%',
      parPos: `calc(${((par / max) * 100).toFixed(1)}% - 1px)`,
    };
  });

  const setField = (id: string, field: Field) => (e: ChangeEvent<HTMLInputElement>) =>
    update(id, { [field]: inputVal(e.target.value) });

  const openImport = () => {
    setUI({ imp: { stage: 'pick' } });
    openSheet('import');
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* Phones: the import button sits beside the heading, clear of the filters. */}
      <div className="n-only" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="min0" style={{ flex: 1 }}>
          <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
            Stock
          </h1>
          <div className="page-sub">{summary}</div>
        </div>
        {perms.stock && (
          <button type="button" className="btn btn-outline" style={{ flex: 'none', padding: '0 14px' }} onClick={openImport}>
            <Icon name="upload" size={16} />
            Import
          </button>
        )}
      </div>

      <div className="chips-row">
        <div className="chips-scroll" role="group" aria-label="Filter materials">
          {filters.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setUI({ stockFilter: k })}>
              {label}
            </button>
          ))}
        </div>
        {perms.stock && (
          <button type="button" className="btn btn-outline w-only" style={{ flex: 'none', padding: '0 14px' }} onClick={openImport}>
            <Icon name="upload" size={16} />
            Import Excel
          </button>
        )}
      </div>

      {perms.stock && (
        <div className="stock-hint">
          <strong>− / +</strong> buttons count in whole supplier packs (one bag, drum or box at a time). Tap the number to type an exact count.
        </div>
      )}

      {!perms.stock && (
        <div className="readonly-note">
          <Icon name="lock" size={14} />
          View only — stock is logged by the Warehouse team.
        </div>
      )}

      {/* Mobile: one card per material */}
      <div className="col n-only" style={{ gap: 10 }}>
        {rows.map(({ i, t, par, low, pct, parPos }) => (
          <div key={i.id} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <button type="button" className="stock-name" onClick={() => openMat(i.id)}>
                <span className="row-title">{i.name}</span>
                <span className="subtle" style={{ fontSize: 12 }}>
                  − / + adds or removes one {qu(num(i.pack), i.unit)} {i.packName}
                </span>
              </button>
              {low ? <span className="pill danger">−{qu(m.shortOf(i), i.unit)}</span> : <span className="pill ok">At par</span>}
            </div>
            {perms.stock ? (
              <div className="stepper-panel">
                {(['inHand', 'pipeline'] as const).map((field) => (
                  <div key={field} className="stepper-row">
                    <span className="row-main" style={{ gap: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{field === 'inHand' ? 'In-hand' : 'Pipeline'}</span>
                      <span className="subtle" style={{ fontSize: 11 }}>
                        {field === 'inHand' ? `${i.unit} on site` : 'ordered, not received'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="step-btn"
                      aria-label={`Remove one ${i.packName} from ${field === 'inHand' ? 'in-hand' : 'pipeline'}`}
                      onClick={() => step(i.id, field, -1)}
                    >
                      −{fmt(num(i.pack))}
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="step-input"
                      placeholder="0"
                      value={i[field]}
                      onChange={setField(i.id, field)}
                      aria-label={`${i.name} ${field === 'inHand' ? 'in-hand' : 'pipeline'} quantity`}
                    />
                    <button
                      type="button"
                      className="step-btn"
                      aria-label={`Add one ${i.packName} to ${field === 'inHand' ? 'in-hand' : 'pipeline'}`}
                      onClick={() => step(i.id, field, 1)}
                    >
                      +{fmt(num(i.pack))}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="cell">
                  <div className="cell-k">In-hand</div>
                  <div className="cell-v">{qu(num(i.inHand), i.unit)}</div>
                </div>
                <div className="cell">
                  <div className="cell-k">Pipeline</div>
                  <div className="cell-v">{qu(num(i.pipeline), i.unit)}</div>
                </div>
              </div>
            )}
            <div className="bar" style={{ marginTop: 14 }}>
              <div className="bar-fill" style={{ width: pct, background: low ? 'var(--danger)' : 'var(--strong)' }} />
              <div className="bar-par" style={{ left: parPos }} />
            </div>
            <div className="stock-foot tnum">
              <span style={{ fontWeight: 600 }}>Total {qu(t, i.unit)}</span>
              <span className="subtle">Par {qu(par, i.unit)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: one table */}
      {rows.length > 0 && (
        <div className="card w-only" style={{ position: 'relative', overflowX: 'auto' }}>
          <div style={{ minWidth: 860 }} role="table" aria-label="Stock levels">
            <div className="st-row st-head" role="row">
              <span role="columnheader">Material</span>
              <span role="columnheader">Pack size</span>
              <span role="columnheader">In-hand</span>
              <span role="columnheader">Pipeline</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Against par</span>
            </div>
            <div className="list">
              {rows.map(({ i, t, par, low, pct, parPos }) => (
                <div key={i.id} className="st-row" role="row">
                  <button type="button" className="stock-name" style={{ gap: 1, minHeight: 0 }} onClick={() => openMat(i.id)} role="cell">
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{i.name}</span>
                    <span className="subtle" style={{ fontSize: 12 }}>
                      {i.kind === 'packaging' ? 'Packaging' : 'Ingredient'}
                    </span>
                  </button>
                  <span className="muted" style={{ fontSize: 13 }} role="cell">
                    {cap1(i.packName)} · {qu(num(i.pack), i.unit)}
                  </span>
                  {(['inHand', 'pipeline'] as const).map((field) =>
                    perms.stock ? (
                      <div key={field} className="st-stepper" role="cell">
                        <button
                          type="button"
                          aria-label={`Remove one ${i.packName} from ${field === 'inHand' ? 'in-hand' : 'pipeline'}`}
                          onClick={() => step(i.id, field, -1)}
                        >
                          −{fmt(num(i.pack))}
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={i[field]}
                          onChange={setField(i.id, field)}
                          aria-label={`${i.name} ${field === 'inHand' ? 'in-hand' : 'pipeline'} quantity`}
                        />
                        <button
                          type="button"
                          aria-label={`Add one ${i.packName} to ${field === 'inHand' ? 'in-hand' : 'pipeline'}`}
                          onClick={() => step(i.id, field, 1)}
                        >
                          +{fmt(num(i.pack))}
                        </button>
                      </div>
                    ) : (
                      <span key={field} className="tnum" style={{ fontSize: 14, fontWeight: 600 }} role="cell">
                        {qu(num(i[field]), i.unit)}
                      </span>
                    ),
                  )}
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--strong)' }} role="cell">
                    {qu(t, i.unit)}
                  </span>
                  <div className="col" style={{ gap: 6 }} role="cell">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="subtle tnum" style={{ fontSize: 12 }}>
                        Par {qu(par, i.unit)}
                      </span>
                      {low ? <span className="pill sm danger">−{qu(m.shortOf(i), i.unit)}</span> : <span className="pill sm ok">At par</span>}
                    </div>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: pct, background: low ? 'var(--danger)' : 'var(--strong)' }} />
                      <div className="bar-par" style={{ left: parPos }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!rows.length && (
        <div className="empty" style={{ padding: '24px 20px' }}>
          <div className="empty-t">{m.ings.length ? 'Nothing here' : 'No materials yet'}</div>
          <div className="empty-s">
            {m.ings.length ? 'No materials match this filter.' : perms.setup ? 'Add materials in Setup, or import your stock sheet with Import Excel.' : 'An Admin needs to add materials first.'}
          </div>
        </div>
      )}
    </div>
  );
}
