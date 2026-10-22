'use client';

import { fmt, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { Cells, SheetHeader } from './Sheet';
import { useOpeners } from './openers';

export function ProductSheet({ id }: { id: string }) {
  const m = useModel();
  const { perms } = useCurrentUser();
  const go = useGo();
  const { openMat } = useOpeners();
  const p = m.prodById[id];
  if (!p) return null;

  const c = m.capacity(p, m.total);
  const lines = m.recipeOf(p.id).flatMap((r) => {
    const i = m.byId[r.ing];
    if (m.isUtil(i)) return [];
    const q = num(r.qty);
    return [{ i, q, possible: q > 0 ? Math.floor(m.total(i) / q) : 0, limiting: c.lim?.id === i.id }];
  });

  return (
    <>
      <SheetHeader kicker="Recipe" title={p.name} />
      <div className="sheet-body">
        <div className="capacity-hero">
          <div className="eyebrow">
            Can produce now
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span className="serif tnum" style={{ fontSize: 38, lineHeight: 1.1 }}>
              {fmt(c.cases)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--on-navy)' }}>cases</span>
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: 'var(--on-navy)' }}>
            {plural(c.batches, 'batch', 'batches')} · limited by {c.lim ? c.lim.name : '—'}
          </div>
        </div>
        <Cells
          cells={[
            ['Batch size', qu(num(p.batchKg), 'kg')],
            ['Units / batch', fmt(num(p.upb))],
            ['Units / case', fmt(num(p.upc))],
            ['Cases / batch', fmt(m.perCase(p))],
            ['Material cost / batch', money(m.batchCost(p))],
          ]}
        />
        <div>
          <div className="sec-head" style={{ marginBottom: 8 }}>
            <span className="eyebrow">Recipe per batch</span>
            <span className="subtle" style={{ fontSize: 11 }}>
              Batches in stock
            </span>
          </div>
          <div className="sheet-list list">
            {lines.map(({ i, q, possible, limiting }) => (
              <button key={i.id} type="button" className="row" style={{ padding: '10px 14px' }} onClick={() => openMat(i.id)}>
                <span className="row-main">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{i.name}</span>
                  <span className="row-sub tnum">{qu(q, i.unit)} per batch</span>
                </span>
                {limiting ? (
                  <span className="pill danger">{fmt(possible)} · limit</span>
                ) : (
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fmt(possible)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        {perms.plan && (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => go('plan', { planProduct: p.id, planBatches: Math.max(1, Math.min(8, m.capacity(p, m.free).batches)) })}
          >
            Plan this product
          </button>
        )}
      </div>
    </>
  );
}
