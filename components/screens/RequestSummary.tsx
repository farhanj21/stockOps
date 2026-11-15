'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { requestStatus } from '@/components/sheets/PoSheet';
import { downloadWorkbook } from '@/lib/export';
import { fmt, fmtDate, money, num, plural, today } from '@/lib/format';
import { useShowCost } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { requestPeriods, requestsByDay, requestsByMonth, requestsIn, requestTotals, type RequestTotals } from '@/lib/requests';
import { toast, useUI } from '@/lib/ui';

type Mode = 'day' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dayName = (d: string) => `${fmtDate(d)} ${d.slice(0, 4)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Purchase requests summarised for a day, a month or a year: raised, received, closed and still open. */
export function RequestSummary() {
  const SHOW_COST = useShowCost();
  const m = useModel();
  const pos = m.data.pos;
  const price = (ing: string) => num(m.byId[ing]?.cost);
  const { days, months, years } = requestPeriods(pos);
  const now = today();
  const [mode, setMode] = useState<Mode>('day');
  const [pick, setPick] = useState({ day: now, month: now.slice(0, 7), year: now.slice(0, 4) });
  // Always offer the current month and year, even before anything happened in them.
  const monthOpts = [...new Set([now.slice(0, 7), ...months])].sort().reverse();
  const yearOpts = [...new Set([now.slice(0, 4), ...years])].sort().reverse();

  const period = pick[mode];
  const label = mode === 'day' ? dayName(period) : mode === 'month' ? monthName(period) : period;
  const t = requestTotals(pos, period, price);
  const involved = requestsIn(pos, period).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const rows =
    mode === 'month'
      ? requestsByDay(pos, period, price).map((r) => ({ key: r.day, label: fmtDate(r.day), t: r }))
      : mode === 'year'
        ? requestsByMonth(pos, period, price).map((r) => ({ key: r.month, label: monthName(r.month).slice(0, 3), t: r }))
        : [];

  const exportIt = () => {
    const sumRow = (first: string, l: string, x: RequestTotals) => ({
      [first]: l,
      'Requests raised': x.raised,
      'Items raised': x.itemsRaised,
      ...(SHOW_COST ? { 'Value raised (Rs)': r2(x.valueRaised) } : {}),
      'Items received': x.itemsReceived,
      'Short deliveries': x.shortItems,
      ...(SHOW_COST ? { 'Value received (Rs)': r2(x.valueReceived) } : {}),
      'Requests closed': x.closed,
      'Still open': x.open,
      'Items pending': x.itemsPending,
    });
    const reqRows = involved.map((po) => ({
      Request: po.id,
      Placed: po.date,
      'Raised by': po.by,
      Status: requestStatus(po).label,
      Items: po.lines.length,
      'Items received': po.lines.filter((l) => l.received).length,
      ...(SHOW_COST ? { 'Value (Rs)': r2(po.lines.reduce((a, l) => a + l.qty * price(l.ing), 0)) } : {}),
      Closed: po.received ?? '',
    }));
    const first = mode === 'year' ? 'Month' : 'Day';
    downloadWorkbook(`purchase-requests-${period}`, [
      { name: `Summary ${period}`, rows: [sumRow('Period', label, t)] },
      ...(rows.length ? [{ name: mode === 'year' ? 'Month by month' : 'Day by day', rows: rows.map((r) => sumRow(first, r.key, r.t)) }] : []),
      { name: 'Requests', rows: reqRows },
    ]).catch(() => toast("Couldn't build the export."));
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="report-bar">
        <div className="seg" role="radiogroup" aria-label="Summary period">
          {(
            [
              ['day', 'Daily'],
              ['month', 'Monthly'],
              ['year', 'Yearly'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
        {mode === 'day' ? (
          <input
            type="date"
            className="input"
            aria-label="Day"
            max={now}
            value={pick.day}
            onChange={(e) => e.target.value && setPick((p) => ({ ...p, day: e.target.value }))}
          />
        ) : (
          <select className="input" aria-label={mode === 'month' ? 'Month' : 'Year'} value={period} onChange={(e) => setPick((p) => ({ ...p, [mode]: e.target.value }))}>
            {(mode === 'month' ? monthOpts : yearOpts).map((x) => (
              <option key={x} value={x}>
                {mode === 'month' ? monthName(x) : x}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-outline" onClick={exportIt}>
          <Icon name="download" size={16} /> Export
        </button>
      </div>
      {mode === 'day' && days.length > 0 && !involved.length && (
        <div className="subtle" style={{ fontSize: 12, marginTop: -8 }}>
          Last activity: {dayName(days[0])}.{' '}
          <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => setPick((p) => ({ ...p, day: days[0] }))}>
            Show that day
          </button>
        </div>
      )}

      <h2 className="eyebrow" style={{ margin: 0 }}>
        Purchase requests · {label}
      </h2>
      <div className="kpi-grid tnum">
        <Kpi k="Requests raised" v={fmt(t.raised)} s={t.raised ? plural(t.itemsRaised, 'item') : undefined} />
        {SHOW_COST && <Kpi k="Value raised" v={money(t.valueRaised)} />}
        <Kpi k="Items received" v={fmt(t.itemsReceived)} s={t.shortItems ? `${fmt(t.shortItems)} short` : undefined} warn={t.shortItems > 0} />
        {SHOW_COST && <Kpi k="Value received" v={money(t.valueReceived)} />}
        <Kpi k="Requests closed" v={fmt(t.closed)} />
        <Kpi
          k="Still open"
          v={fmt(t.open)}
          s={t.open ? `${plural(t.itemsPending, 'item')} pending${t.partly ? ` · ${fmt(t.partly)} partly received` : ''}` : undefined}
          warn={t.open > 0}
        />
      </div>
      <div className="subtle" style={{ fontSize: 12, marginTop: -6 }}>
        Raised and still open count requests placed in this period. Received and closed count what arrived in this period, whenever it was requested.
        {SHOW_COST && ' Values use today’s material prices.'}
      </div>

      {rows.length > 0 && (
        <section>
          <div className="sec-head">
            <h2 className="eyebrow" style={{ margin: 0 }}>
              {mode === 'year' ? `Month by month · ${period}` : `Day by day · ${label}`}
            </h2>
          </div>
          <SummaryTable first={mode === 'year' ? 'Month' : 'Day'} rows={rows} total={t} totalLabel={label} />
        </section>
      )}
      {mode === 'month' && !rows.length && <div className="empty-inline">No request activity in {label}.</div>}

      {mode !== 'year' && (
        <section>
          <div className="sec-head">
            <h2 className="eyebrow" style={{ margin: 0 }}>
              Requests with activity
            </h2>
            <span className="sec-meta">{plural(involved.length, 'request')}</span>
          </div>
          {involved.length ? (
            <div className="card flat clip list">
              {involved.map((po) => {
                const st = requestStatus(po);
                return (
                  <button key={po.id} type="button" className="row compact" onClick={() => useUI.getState().openSheet('po', po.id)} aria-label={`${po.id}, view details`}>
                    <span className="row-main">
                      <span className="row-title">{po.id}</span>
                      <span className="row-sub tnum">
                        Placed {fmtDate(po.date)} · {po.by} · {plural(po.lines.length, 'item')}
                        {SHOW_COST && ` · ${money(po.lines.reduce((a, l) => a + l.qty * price(l.ing), 0))}`}
                      </span>
                    </span>
                    <span className={`pill xs ${st.tone}`}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-inline">No requests raised or received {mode === 'day' ? 'on this day' : `in ${label}`}.</div>
          )}
        </section>
      )}
    </div>
  );
}

function Kpi({ k, v, s, warn }: { k: string; v: string; s?: string; warn?: boolean }) {
  return (
    <div className="cell">
      <div className="cell-k">{k}</div>
      <div className="cell-v sm">{v}</div>
      {s && (
        <div className={warn ? 'warn-text' : 'subtle'} style={{ fontSize: 11, marginTop: 2 }}>
          {s}
        </div>
      )}
    </div>
  );
}

function SummaryTable({ first, rows, total, totalLabel }: { first: string; rows: { key: string; label: string; t: RequestTotals }[]; total: RequestTotals; totalLabel: string }) {
  const SHOW_COST = useShowCost();
  const active = (t: RequestTotals) => t.raised + t.itemsReceived + t.closed > 0;
  const dash = (t: RequestTotals, s: string) => (active(t) ? s : '—');
  return (
    <div className="card clip report-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>{first}</th>
            <th className="num">Raised</th>
            <th className="num">Items</th>
            {SHOW_COST && <th className="num">Value</th>}
            <th className="num">Received</th>
            <th className="num">Short</th>
            <th className="num">Closed</th>
            <th className="num">Still open</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map(({ key, label, t }) => (
            <tr key={key} className={active(t) ? undefined : 'quiet'}>
              <th scope="row">{label}</th>
              <td className="num">{dash(t, fmt(t.raised))}</td>
              <td className="num">{dash(t, fmt(t.itemsRaised))}</td>
              {SHOW_COST && <td className="num">{dash(t, money(t.valueRaised))}</td>}
              <td className="num">{dash(t, fmt(t.itemsReceived))}</td>
              <td className={`num${t.shortItems ? ' warn-text' : ''}`}>{dash(t, fmt(t.shortItems))}</td>
              <td className="num">{dash(t, fmt(t.closed))}</td>
              <td className={`num${t.open ? ' warn-text' : ''}`}>{dash(t, fmt(t.open))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="tnum">
          <tr>
            <th scope="row">{totalLabel}</th>
            <td className="num">{fmt(total.raised)}</td>
            <td className="num">{fmt(total.itemsRaised)}</td>
            {SHOW_COST && <td className="num">{money(total.valueRaised)}</td>}
            <td className="num">{fmt(total.itemsReceived)}</td>
            <td className="num">{fmt(total.shortItems)}</td>
            <td className="num">{fmt(total.closed)}</td>
            <td className="num">{fmt(total.open)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
