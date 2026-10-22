'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { SHOW_COST } from '@/lib/config';
import { fmt, fmtDate, inputVal, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import type { Ingredient, Num, PoLine } from '@/lib/types';
import { toast, useUI } from '@/lib/ui';

export function Orders() {
  const m = useModel();
  const { perms } = useCurrentUser();
  const [busy, setBusy] = useState<string | null>(null);
  const excluded = useUI((s) => s.poExcluded);
  const packsOverride = useUI((s) => s.poPacks);
  const extra = useUI((s) => s.poExtra);
  const setUI = useUI((s) => s.set);
  const createPO = useStore((s) => s.createPO);
  const receivePO = useStore((s) => s.receivePO);

  // The draft order: every suggestion (tickable) plus anything added by hand, each with an editable pack count.
  const suggestedIds = new Set(m.suggestions.map((x) => x.i.id));
  const draft: DraftLine[] = [
    ...m.suggestions.map((x) => ({
      i: x.i,
      reason: x.forPlan ? ('plan' as const) : ('par' as const),
      deficit: x.deficit,
      packs: packsOverride[x.i.id] ?? x.packs,
      suggestedPacks: x.packs,
      included: !excluded[x.i.id],
    })),
    ...extra
      .filter((id) => m.byId[id] && !suggestedIds.has(id))
      .map((id) => ({ i: m.byId[id], reason: 'manual' as const, deficit: 0, packs: packsOverride[id] ?? 1, suggestedPacks: 0, included: true })),
  ];
  const toOrder = draft.filter((l) => l.included && num(l.packs) >= 1);
  const poCost = toOrder.reduce((a, l) => a + Math.floor(num(l.packs)) * num(l.i.pack) * num(l.i.cost), 0);
  const shown = draft.filter((l) => l.included);
  const removedSuggestions = draft.filter((l) => !l.included);
  const addable = m.ings.filter((i) => i.kind !== 'utility' && !shown.some((l) => l.i.id === i.id));
  const lineName = (l: PoLine) => m.byId[l.ing]?.name ?? l.ing;
  const lineQty = (l: PoLine) => (m.byId[l.ing] ? qu(l.qty, m.byId[l.ing].unit) : fmt(l.qty));

  const setPacks = (id: string, v: Num) => setUI({ poPacks: { ...packsOverride, [id]: v } });
  const removeExtra = (id: string) => {
    const { [id]: _drop, ...rest } = packsOverride;
    void _drop;
    setUI({ poExtra: extra.filter((x) => x !== id), poPacks: rest });
  };

  /** The server re-reads pack sizes and prices; we only send which materials and how many packs. */
  async function create() {
    if (!toOrder.length || busy) return;
    setBusy('create');
    const po = await createPO(toOrder.map((l) => ({ ingredientId: l.i.id, packs: Math.floor(num(l.packs)) })));
    setBusy(null);
    if (!po) return;
    setUI({ poExcluded: {}, poPacks: {}, poExtra: [] });
    toast(`${po.id} created · ${plural(po.lines, 'line')} added to pipeline.`);
  }

  async function receive(id: string) {
    if (busy) return;
    setBusy(id);
    const ok = await receivePO(id);
    setBusy(null);
    if (ok) toast(`${id} received. Pipeline moved to in-hand.`);
  }

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Orders
        </h1>
        <div className="page-sub">Quantities round up to full supplier packs.</div>
      </div>

      <div className="orders-grid">
        <section className="min0">
          <div className="sec-head">
            <h2 className="eyebrow" style={{ margin: 0 }}>
              New purchase order
            </h2>
            <span className="sec-meta">{m.suggestions.length ? `${m.suggestions.length} suggested` : 'Nothing suggested'}</span>
          </div>
          <div className="col" style={{ gap: 12 }}>
            <div className="card clip">
              <div className="po-intro">
                {m.suggestions.length
                  ? 'Suggested lines cover plans and par levels. Change the number of packs, remove what you don\'t need with ×, or add any other material.'
                  : 'Stock covers every plan and par level, so nothing is suggested. You can still order any material below.'}
              </div>
              <div className="list">
                {shown.map((l) => (
                  <PoDraftRow
                    key={l.i.id}
                    line={l}
                    onPacks={(v) => setPacks(l.i.id, v)}
                    onRemove={() => (l.reason === 'manual' ? removeExtra(l.i.id) : setUI({ poExcluded: { ...excluded, [l.i.id]: true } }))}
                  />
                ))}
                {!shown.length && <div className="empty-inline">No materials on this order yet. Add one below.</div>}
              </div>
              {removedSuggestions.length > 0 && (
                <div className="po-removed">
                  <span>
                    {plural(removedSuggestions.length, 'suggestion')} removed: {removedSuggestions.map((l) => l.i.name).join(', ')}
                  </span>
                  <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => setUI({ poExcluded: {} })}>
                    Restore
                  </button>
                </div>
              )}
              {addable.length > 0 && (
                <AddPoLine
                  materials={addable}
                  onAdd={(id) => {
                    // Re-adding a removed suggestion brings it back with its suggested quantity.
                    if (suggestedIds.has(id)) setUI({ poExcluded: { ...excluded, [id]: false } });
                    else setUI({ poExtra: [...extra, id], poPacks: { ...packsOverride, [id]: 1 } });
                  }}
                />
              )}
            </div>
            <div className="commit-summary tnum">
              <span>
                {plural(toOrder.length, 'line')} to order
              </span>
              {SHOW_COST && <span style={{ color: 'var(--strong)' }}>{money(poCost)}</span>}
            </div>
            <button type="button" className="btn btn-primary btn-lg" disabled={!toOrder.length || !!busy} onClick={create}>
              {busy === 'create' ? 'Creating…' : `Create ${m.nextPoId}`}
            </button>
          </div>
        </section>

        <div className="col min0" style={{ gap: 22 }}>
          <section>
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                In transit
              </h2>
              <span className="sec-meta">{plural(m.openPOs.length, 'order')}</span>
            </div>
            <div className="col" style={{ gap: 10 }}>
              {m.openPOs.map((po) => (
                <div key={po.id} className="card pad">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span className="serif" style={{ fontSize: 19, color: 'var(--strong)' }}>
                      {po.id}
                    </span>
                    <span className="pill xs info">In transit</span>
                  </div>
                  <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
                    Placed {fmtDate(po.date)} · {po.by}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {po.lines.map((l) => (
                      <div key={l.ing} className="po-line">
                        <span>{lineName(l)}</span>
                        <span className="tnum" style={{ fontWeight: 700 }}>
                          {lineQty(l)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {perms.receive && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: '100%', height: 46, marginTop: 10 }}
                      disabled={!!busy}
                      onClick={() => receive(po.id)}
                    >
                      <Icon name="check" size={14} stroke={2.5} color="var(--ok)" />
                      Receive delivery
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!m.openPOs.length && (
              <div className="empty">
                <div className="empty-t">No orders in transit</div>
                <div className="empty-s">Generated POs appear here until received.</div>
              </div>
            )}
          </section>

          <section>
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                Received
              </h2>
            </div>
            <div className="card flat clip list">
              {m.receivedPOs.map((po) => (
                <div key={po.id} className="row compact">
                  <span className="row-main">
                    <span className="row-title">{po.id}</span>
                    <span className="row-sub">
                      {plural(po.lines.length, 'line')} · received {fmtDate(po.received)}
                    </span>
                  </span>
                  <span className="pill xs ok">Received</span>
                </div>
              ))}
              {!m.receivedPOs.length && <div className="empty-inline">No deliveries received yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

interface DraftLine {
  i: Ingredient;
  reason: 'plan' | 'par' | 'manual';
  deficit: number;
  packs: Num;
  suggestedPacks: number;
  included: boolean;
}

const REASON: Record<DraftLine['reason'], [string, string]> = {
  plan: ['Short for plans', 'warn'],
  par: ['Below par', 'danger'],
  manual: ['Added by you', 'info'],
};

/** One line of the draft order: tick, pack count (− n +), and what that comes to. */
function PoDraftRow({ line, onPacks, onRemove }: { line: DraftLine; onPacks: (v: Num) => void; onRemove: () => void }) {
  const { i } = line;
  const packs = Math.max(0, Math.floor(num(line.packs)));
  const qty = packs * num(i.pack);
  const [label, tone] = REASON[line.reason];
  const changed = line.reason !== 'manual' && line.packs !== '' && packs !== line.suggestedPacks;

  return (
    <div className="po-row">
      <button type="button" className="row-remove po-remove" aria-label={`Remove ${i.name} from the order`} onClick={onRemove}>
        <Icon name="x" size={15} stroke={2.2} />
      </button>
      <div className="po-row-main min0">
        <div style={{ fontSize: 14, fontWeight: 700 }}>{i.name}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span className={`pill sm ${tone}`} style={{ fontWeight: 600 }}>
            {label}
          </span>
          {line.deficit > 0 && (
            <span className="subtle tnum" style={{ fontSize: 11 }}>
              Short {qu(line.deficit, i.unit)}
              {changed && ` · suggested ${line.suggestedPacks}`}
            </span>
          )}
        </div>
      </div>
      <div className="po-row-qty">
        <div className="po-stepper" aria-label={`${i.name} packs`}>
          <button type="button" aria-label={`One ${i.packName} fewer`} disabled={packs <= 1} onClick={() => onPacks(Math.max(1, packs - 1))}>
            <Icon name="minus" size={14} stroke={2.4} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="0"
            value={line.packs}
            onChange={(e) => onPacks(inputVal(e.target.value, true))}
            aria-label={`Number of ${i.packName}s of ${i.name}`}
          />
          <button type="button" aria-label={`One ${i.packName} more`} onClick={() => onPacks(packs + 1)}>
            <Icon name="plus" size={14} stroke={2.4} />
          </button>
        </div>
        <div className="po-row-total tnum">
          <span className="subtle">
            × {qu(num(i.pack), i.unit)} {i.packName}
          </span>
          <strong>{qu(qty, i.unit)}</strong>
          {SHOW_COST && <span className="muted">{money(qty * num(i.cost))}</span>}
        </div>
      </div>
    </div>
  );
}

function AddPoLine({ materials, onAdd }: { materials: Ingredient[]; onAdd: (id: string) => void }) {
  const [id, setId] = useState('');
  return (
    <form
      className="po-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!id) return;
        onAdd(id);
        setId('');
      }}
    >
      <select className="input h44" value={id} onChange={(e) => setId(e.target.value)} aria-label="Material to add to the order">
        <option value="">Add another material…</option>
        {materials.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-outline" disabled={!id}>
        <Icon name="plus" size={14} stroke={2.4} />
        Add
      </button>
    </form>
  );
}
