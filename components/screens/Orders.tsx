'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { SHOW_COST } from '@/lib/config';
import { fmt, fmtDate, money, plural, qu } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { packTxt, useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import type { PoLine } from '@/lib/types';
import { toast, useUI } from '@/lib/ui';

export function Orders() {
  const m = useModel();
  const { perms } = useCurrentUser();
  const [busy, setBusy] = useState<string | null>(null);
  const excluded = useUI((s) => s.poExcluded);
  const setUI = useUI((s) => s.set);
  const generatePO = useStore((s) => s.generatePO);
  const receivePO = useStore((s) => s.receivePO);

  const included = m.suggestions.filter((x) => !excluded[x.i.id]);
  const poCost = included.reduce((a, x) => a + x.cost, 0);
  const lineName = (l: PoLine) => m.byId[l.ing]?.name ?? l.ing;
  const lineQty = (l: PoLine) => (m.byId[l.ing] ? qu(l.qty, m.byId[l.ing].unit) : fmt(l.qty));

  /** The server recomputes the order from live stock; unticked materials are left out. */
  async function generate() {
    if (!included.length || busy) return;
    setBusy('generate');
    const po = await generatePO(Object.keys(excluded).filter((id) => excluded[id]));
    setBusy(null);
    if (!po) return;
    setUI({ poExcluded: {} });
    toast(`${po.id} generated · ${plural(po.lines, 'line')} added to pipeline.`);
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
              Suggested
            </h2>
            <span className="sec-meta">{plural(m.suggestions.length, 'line')}</span>
          </div>
          {m.suggestions.length > 0 ? (
            <div className="col" style={{ gap: 12 }}>
              <div className="card clip list">
                {m.suggestions.map((x) => {
                  const inc = !excluded[x.i.id];
                  return (
                    <div key={x.i.id} className="sg-row">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={inc}
                        aria-label={`Include ${x.i.name} in purchase order`}
                        className="sg-check"
                        onClick={() => setUI({ poExcluded: { ...excluded, [x.i.id]: inc } })}
                      >
                        <span className={`check-box${inc ? ' on' : ''}`}>{inc && <Icon name="check" size={13} stroke={3} />}</span>
                      </button>
                      <div className="min0" style={{ flex: 1, opacity: inc ? 1 : 0.45 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{x.i.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span className={`pill sm ${x.forPlan ? 'warn' : 'danger'}`} style={{ fontWeight: 600 }}>
                            {x.forPlan ? 'Short for plans' : 'Below par'}
                          </span>
                          <span className="subtle tnum" style={{ fontSize: 11 }}>
                            Short {qu(x.deficit, x.i.unit)}
                          </span>
                        </div>
                      </div>
                      <div className="col tnum" style={{ alignItems: 'flex-end', gap: 1, opacity: inc ? 1 : 0.45 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{qu(x.qty, x.i.unit)}</span>
                        <span className="subtle" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                          {packTxt(x.i, x.packs)}
                        </span>
                        {SHOW_COST && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {money(x.cost)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="commit-summary tnum">
                <span>
                  {included.length} of {plural(m.suggestions.length, 'line')} selected
                </span>
                {SHOW_COST && <span style={{ color: 'var(--navy)' }}>{money(poCost)}</span>}
              </div>
              <button type="button" className="btn btn-primary btn-lg" disabled={!included.length || !!busy} onClick={generate}>
                Generate {m.nextPoId}
              </button>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-t">Nothing to order</div>
              <div className="empty-s">Stock covers every plan and par level.</div>
            </div>
          )}
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
                    <span className="serif" style={{ fontSize: 19, color: 'var(--navy)' }}>
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
