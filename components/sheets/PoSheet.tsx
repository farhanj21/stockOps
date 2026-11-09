'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { poValue } from '@/lib/export';
import { fmt, fmtDate, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useShowCost } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import { confirmDialog, toast, useUI } from '@/lib/ui';
import { Cells, SheetHeader } from './Sheet';
import { useOpeners } from './openers';

/** Full detail of one purchase order, open or already received. */
export function PoSheet({ id }: { id: string }) {
  const SHOW_COST = useShowCost();
  const m = useModel();
  const { openMat } = useOpeners();
  const { perms } = useCurrentUser();
  const deletePO = useStore((s) => s.deletePO);
  const close = useUI((s) => s.closeSheet);
  const [busy, setBusy] = useState(false);
  const po = m.data.pos.find((p) => p.id === id);
  if (!po) return null;

  const received = po.status === 'Received';
  // Cancelling an order in transit needs "Receive deliveries"; removing received history needs "Setup".
  const canDelete = received ? perms.setup : perms.receive;

  async function remove() {
    if (busy) return;
    const ok = await confirmDialog({
      title: `Delete ${id}?`,
      body: received
        ? "The order is removed from the received history. In-hand stock doesn't change. This can't be undone."
        : "The order is cancelled and its quantities are taken out of pipeline. This can't be undone.",
      confirmLabel: 'Delete order',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const done = await deletePO(id);
    setBusy(false);
    if (!done) return;
    close();
    toast(`${id} deleted.`);
  }
  const cells: [string, string][] = [
    ['Placed', fmtDate(po.date)],
    ['Placed by', po.by],
    ['Received', received ? fmtDate(po.received) : 'Not yet'],
    ['Received by', received ? (po.receivedBy ?? '—') : '—'],
  ];

  return (
    <>
      <SheetHeader kicker="Purchase Order" title={po.id} />
      <div className="sheet-body">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              {plural(po.lines.length, 'item')}
              {SHOW_COST && ' · value at current prices'}
            </div>
            {SHOW_COST && (
              <div className="serif tnum" style={{ fontSize: 34, lineHeight: 1.1, color: 'var(--strong)' }}>
                {money(poValue(m, po))}
              </div>
            )}
          </div>
          {received ? <span className="pill ok">Received</span> : <span className="pill info">In transit</span>}
        </div>
        <Cells cells={cells} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Ordered
          </div>
          <div className="sheet-list list">
            {po.lines.map((l) => {
              const i = m.byId[l.ing];
              const body = (
                <>
                  <span className="row-main">
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{i?.name ?? 'Deleted material'}</span>
                    <span className="row-sub">
                      {i ? `${fmt(l.packs)} × ${qu(num(i.pack), i.unit)} ${l.packs === 1 ? i.packName : i.packName + 's'}` : `${fmt(l.packs)} packs`}
                    </span>
                  </span>
                  <span className="tnum" style={{ textAlign: 'right', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, display: 'block' }}>{i ? qu(l.qty, i.unit) : fmt(l.qty)}</span>
                    {SHOW_COST && i && <span className="subtle">{money(l.qty * num(i.cost))}</span>}
                  </span>
                </>
              );
              return i ? (
                <button key={l.ing} type="button" className="row" style={{ padding: '12px 14px' }} onClick={() => openMat(i.id)}>
                  {body}
                </button>
              ) : (
                <div key={l.ing} className="row" style={{ padding: '12px 14px' }}>
                  {body}
                </div>
              );
            })}
          </div>
          {SHOW_COST && (
            <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
              Values use today&apos;s material prices, not the price paid at the time.
            </div>
          )}
        </div>
        {canDelete && (
          <button type="button" className="btn btn-outline danger-btn" style={{ width: '100%' }} disabled={busy} onClick={remove}>
            <Icon name="trash" size={14} />
            {busy ? 'Deleting…' : 'Delete order'}
          </button>
        )}
      </div>
    </>
  );
}
