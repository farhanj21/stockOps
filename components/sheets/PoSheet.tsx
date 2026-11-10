'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { poValue } from '@/lib/export';
import { fmt, fmtDate, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useShowCost } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import type { Ingredient, PoLine, PurchaseOrder } from '@/lib/types';
import { confirmDialog, toast, useUI } from '@/lib/ui';
import { Cells, SheetHeader } from './Sheet';
import { useOpeners } from './openers';

/** "Open · 1 of 3 received", "Closed", … for a purchase request. */
export function requestStatus(po: PurchaseOrder): { label: string; tone: 'ok' | 'info' | 'warn' } {
  if (po.status === 'Received') return { label: 'Closed', tone: 'ok' };
  const got = po.lines.filter((l) => l.received).length;
  return got ? { label: `${got} of ${po.lines.length} received`, tone: 'warn' } : { label: 'Awaiting delivery', tone: 'info' };
}

/** "Received 200 kg of 250 kg · 50 kg short" for an item that has been received. */
export function receivedText(l: PoLine, unit: string) {
  if (!l.received) return '';
  const diff = l.received.qty - l.qty;
  const gap = Math.abs(diff) < 1e-9 ? 'in full' : diff < 0 ? `${qu(-diff, unit)} short` : `${qu(diff, unit)} extra`;
  return `Received ${qu(l.received.qty, unit)} of ${qu(l.qty, unit)} · ${gap}`;
}

/** Full detail of one purchase request: each item is received on its own with what actually arrived. */
export function PoSheet({ id }: { id: string }) {
  const SHOW_COST = useShowCost();
  const m = useModel();
  const { perms } = useCurrentUser();
  const deletePO = useStore((s) => s.deletePO);
  const receivePO = useStore((s) => s.receivePO);
  const close = useUI((s) => s.closeSheet);
  const [busy, setBusy] = useState(false);
  const po = m.data.pos.find((p) => p.id === id);
  if (!po) return null;

  const closed = po.status === 'Received';
  const status = requestStatus(po);
  const pending = po.lines.filter((l) => !l.received);
  // Cancelling an open request needs "Receive deliveries"; removing closed history needs "Setup".
  const canDelete = closed ? perms.setup : perms.receive;
  const canReceive = !closed && perms.receive;

  async function remove() {
    if (busy) return;
    const ok = await confirmDialog({
      title: `Delete ${id}?`,
      body: closed
        ? "The request is removed from the history. In-hand stock doesn't change. This can't be undone."
        : "The request is cancelled. Items already received stay in in-hand stock. This can't be undone.",
      confirmLabel: 'Delete request',
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

  async function receiveAll() {
    if (busy) return;
    const ok = await confirmDialog({
      title: `Receive everything on ${id}?`,
      body: `The ${plural(pending.length, 'item')} still to arrive ${pending.length === 1 ? 'is' : 'are'} added to in-hand exactly as requested, and the request closes.`,
      confirmLabel: 'Receive all',
    });
    if (!ok) return;
    setBusy(true);
    const done = await receivePO(id);
    setBusy(false);
    if (done) toast(`${id} received in full and closed.`);
  }

  const cells: [string, string][] = [
    ['Requested', fmtDate(po.date)],
    ['Requested by', po.by],
    ['Closed', closed ? fmtDate(po.received) : 'Not yet'],
    ['Closed by', closed ? (po.receivedBy ?? '—') : '—'],
  ];

  return (
    <>
      <SheetHeader kicker="Purchase Request" title={po.id} />
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
          <span className={`pill ${status.tone}`}>{status.label}</span>
        </div>
        <Cells cells={cells} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Items
          </div>
          <div className="sheet-list list">
            {po.lines.map((l) => (
              <RequestItem key={l.ing} code={po.id} line={l} i={m.byId[l.ing]} canReceive={canReceive} />
            ))}
          </div>
          {SHOW_COST && (
            <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
              Values use today&apos;s material prices, not the price paid at the time.
            </div>
          )}
        </div>
        {canReceive && pending.length > 1 && (
          <button type="button" className="btn btn-outline" style={{ width: '100%' }} disabled={busy} onClick={receiveAll}>
            <Icon name="check" size={14} stroke={2.5} color="var(--ok)" />
            Receive all remaining as requested
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn btn-outline danger-btn" style={{ width: '100%' }} disabled={busy} onClick={remove}>
            <Icon name="trash" size={14} />
            {busy ? 'Working…' : 'Delete request'}
          </button>
        )}
      </div>
    </>
  );
}

/** One item: what was requested, and either what was received or a form to receive it. */
function RequestItem({ code, line: l, i, canReceive }: { code: string; line: PoLine; i: Ingredient | undefined; canReceive: boolean }) {
  const SHOW_COST = useShowCost();
  const { openMat } = useOpeners();
  const receivePOLine = useStore((s) => s.receivePOLine);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(l.qty));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = i?.unit ?? '';
  const short = l.received ? l.received.qty < l.qty - 1e-9 : false;
  const over = l.received ? l.received.qty > l.qty + 1e-9 : false;

  async function receive() {
    const n = num(qty);
    if (qty.trim() === '' || n < 0 || busy) return;
    setBusy(true);
    const res = await receivePOLine(code, l.ing, n, note);
    setBusy(false);
    if (!res) return;
    setOpen(false);
    toast(res.closed ? `${i?.name ?? 'Item'} received. Every item is in, so ${code} is closed.` : `${i?.name ?? 'Item'} received · ${qu(n, unit)} added to in-hand.`);
  }

  return (
    <div className="req-item">
      <div className="req-item-head">
        <span className="row-main min0">
          {i ? (
            <button type="button" className="btn-link" style={{ fontSize: 14, fontWeight: 700, textAlign: 'left', color: 'var(--strong)' }} onClick={() => openMat(i.id)}>
              {i.name}
            </button>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700 }}>Deleted material</span>
          )}
          <span className="row-sub">
            {i ? `${fmt(l.packs)} × ${qu(num(i.pack), unit)} ${l.packs === 1 ? i.packName : i.packName + 's'}` : `${fmt(l.packs)} packs`} requested
          </span>
        </span>
        <span className="tnum" style={{ textAlign: 'right', fontSize: 13 }}>
          <span style={{ fontWeight: 700, display: 'block' }}>{i ? qu(l.qty, unit) : fmt(l.qty)}</span>
          {SHOW_COST && i && <span className="subtle">{money(l.qty * num(i.cost))}</span>}
        </span>
      </div>

      {l.received ? (
        <div className="req-received">
          <span className={short ? 'warn-text' : over ? undefined : 'ok-text'} style={{ fontWeight: 600 }}>
            <Icon name="check" size={12} stroke={2.6} /> {receivedText(l, unit)}
          </span>
          <span className="subtle">
            {fmtDate(l.received.date)}
            {l.received.by ? ` · ${l.received.by}` : ''}
          </span>
          {l.received.note && <span className="req-note">“{l.received.note}”</span>}
        </div>
      ) : canReceive ? (
        open ? (
          <div className="req-form">
            <div className="grid2" style={{ gap: 8 }}>
              <label className="col" style={{ gap: 4 }}>
                <span className="field-label sm">Quantity received</span>
                <span className="input-shell" style={{ height: 44 }}>
                  <input type="number" inputMode="decimal" min={0} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus aria-label={`${i?.name ?? 'Item'} quantity received`} />
                  <span className="subtle" style={{ paddingRight: 12, fontSize: 12 }}>
                    {unit}
                  </span>
                </span>
              </label>
              <label className="col" style={{ gap: 4 }}>
                <span className="field-label sm">Note (optional)</span>
                <input className="input" style={{ height: 44 }} placeholder="e.g. 2 bags damaged" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            {qty.trim() !== '' && Math.abs(num(qty) - l.qty) > 1e-9 && (
              <div className="subtle tnum" style={{ fontSize: 12 }}>
                {num(qty) < l.qty ? `${qu(l.qty - num(qty), unit)} short of what was requested.` : `${qu(num(qty) - l.qty, unit)} more than requested.`} The item is still closed with this amount.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || qty.trim() === '' || num(qty) < 0} onClick={receive}>
                {busy ? 'Saving…' : `Receive ${qty.trim() === '' ? '' : qu(num(qty), unit)}`}
              </button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-outline req-receive" onClick={() => setOpen(true)}>
            <Icon name="check" size={14} stroke={2.5} color="var(--ok)" />
            Receive this item
          </button>
        )
      ) : (
        <div className="subtle" style={{ fontSize: 12 }}>
          Awaiting delivery
        </div>
      )}
    </div>
  );
}
