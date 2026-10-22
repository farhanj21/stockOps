'use client';

import { money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { Cells, SheetHeader } from './Sheet';
import { useOpeners } from './openers';

export function MaterialSheet({ id }: { id: string }) {
  const m = useModel();
  const { perms } = useCurrentUser();
  const go = useGo();
  const { openProd } = useOpeners();
  const i = m.byId[id];
  if (!i) return null;

  const t = m.total(i);
  const low = m.isLow(i);
  const usedIn = m.data.products.flatMap((p) => {
    const r = m.recipeOf(p.id).find((x) => x.ing === i.id);
    const q = num(r?.qty);
    return q > 0 ? [{ p, q }] : [];
  });

  return (
    <>
      <SheetHeader kicker={i.kind === 'packaging' ? 'Packaging' : 'Ingredient'} title={i.name} />
      <div className="sheet-body">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Total available
            </div>
            <div className="serif tnum" style={{ fontSize: 38, lineHeight: 1.1, color: 'var(--strong)' }}>
              {qu(t, i.unit)}
            </div>
          </div>
          {low ? <span className="pill danger">−{qu(m.shortOf(i), i.unit)} vs par</span> : <span className="pill ok">At par</span>}
        </div>
        <Cells
          cells={[
            ['In-hand', qu(num(i.inHand), i.unit)],
            ['Pipeline', qu(num(i.pipeline), i.unit)],
            ['Par level', qu(num(i.par), i.unit)],
            ['Pack size', `${qu(num(i.pack), i.unit)} ${i.packName}`],
            ['Allocated to plans', qu(m.allocOf(i), i.unit)],
            ['Free after plans', qu(m.free(i), i.unit)],
            ['Cost / ' + i.unit, money(num(i.cost))],
            ['Stock value', money(t * num(i.cost))],
          ]}
        />
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Used in
          </div>
          <div className="sheet-list list">
            {usedIn.map(({ p, q }) => (
              <button key={p.id} type="button" className="row" style={{ padding: '12px 14px' }} onClick={() => openProd(p.id)}>
                <span className="row-main">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                  <span className="row-sub">{qu(q, i.unit)} per batch</span>
                </span>
                <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-ink)' }}>
                  {plural(Math.floor(t / q), 'batch', 'batches')} ›
                </span>
              </button>
            ))}
            {!usedIn.length && (
              <div className="muted" style={{ padding: 14, fontSize: 13 }}>
                Not used in any recipe.
              </div>
            )}
          </div>
        </div>
        {perms.stock && (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go('stock', { stockFilter: 'all' })}>
            Adjust stock count
          </button>
        )}
      </div>
    </>
  );
}
