'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { fmt, fmtDate, num, plural, qu } from '@/lib/format';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

/** Log batches actually produced against a committed plan; deducts recipe quantities from in-hand. */
export function RunSheet() {
  const m = useModel();
  const runId = useUI((s) => s.runId);
  const runBatches = useUI((s) => s.runBatches);
  const setUI = useUI((s) => s.set);
  const logRun = useStore((s) => s.logRun);
  const [busy, setBusy] = useState(false);

  const f = m.forecastsSorted.find((x) => x.id === runId) ?? m.forecastsSorted[0];

  if (!f) {
    return (
      <>
        <SheetHeader kicker="Production" title="Log batches run" />
        <div className="empty" style={{ margin: '16px 20px 28px', background: 'var(--bg)' }}>
          <div className="empty-t">No committed plans</div>
          <div className="empty-s">Commit a plan before logging a run.</div>
        </div>
      </>
    );
  }

  const p = m.prodById[f.productId];
  const planned = num(f.batches);
  const rb = Math.min(Math.max(1, Math.floor(num(runBatches))), planned);
  const lines = m.recipeOf(f.productId).flatMap((r) => {
    const i = m.byId[r.ing];
    if (m.isUtil(i)) return [];
    const use = rb * num(r.qty);
    const after = num(i.inHand) - use;
    return [{ i, use, after, bad: after < -1e-9 }];
  });
  const blocked = lines.some((l) => l.bad);

  return (
    <>
      <SheetHeader kicker="Production" title="Log batches run" />
      <div className="sheet-body">
        <div>
          <div id="run-plan" className="eyebrow" style={{ marginBottom: 8 }}>
            Plan
          </div>
          <div className="col" style={{ gap: 8 }} role="radiogroup" aria-labelledby="run-plan">
            {m.forecastsSorted.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === f.id}
                className="radio-card"
                onClick={() => setUI({ runId: x.id, runBatches: 1 })}
              >
                <span className="radio-dot" />
                <span className="col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{m.prodById[x.productId]?.name}</span>
                  <span className="row-sub">
                    {plural(num(x.batches), 'batch', 'batches')} remaining · due {fmtDate(x.date)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="sec-head" style={{ marginBottom: 8 }}>
            <span className="eyebrow">Batches processed</span>
            <span className="sec-meta">of {planned} planned</span>
          </div>
          <div className="big-stepper" style={{ gridTemplateColumns: '52px minmax(0,1fr) 52px' }}>
            <button
              type="button"
              className="big-step"
              style={{ height: 52 }}
              aria-label="One batch fewer"
              onClick={() => setUI({ runId: f.id, runBatches: Math.max(1, rb - 1) })}
            >
              <Icon name="minus" size={20} stroke={2.2} />
            </button>
            <span className="serif tnum" style={{ textAlign: 'center', fontSize: 38, color: 'var(--navy)' }} aria-live="polite">
              {rb}
            </span>
            <button
              type="button"
              className="big-step"
              style={{ height: 52 }}
              aria-label="One batch more"
              onClick={() => setUI({ runId: f.id, runBatches: Math.min(planned, rb + 1) })}
            >
              <Icon name="plus" size={20} stroke={2.2} />
            </button>
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Deducted from in-hand
          </div>
          <div className="sheet-list list">
            {lines.map(({ i, use, after, bad }) => (
              <div key={i.id} className="run-line tnum">
                <span style={{ fontSize: 14, fontWeight: 700 }}>{i.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', textAlign: 'right' }}>−{qu(use, i.unit)}</span>
                {bad ? (
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
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={blocked || busy}
          onClick={async () => {
            setBusy(true);
            const done = await logRun(f.id, rb);
            setBusy(false);
            if (!done) return;
            setUI({ sheetOpen: false });
            toast(`Logged ${plural(rb, 'batch', 'batches')} of ${done.product}. In-hand stock deducted.`);
          }}
        >
          Log {plural(rb, 'batch', 'batches')} · {fmt(rb * num(p?.upb))} units
        </button>
      </div>
    </>
  );
}
