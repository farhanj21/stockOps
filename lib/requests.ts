/**
 * Purchase request summaries by day, month or year.
 *
 * A period is a date prefix: "2026-11-15" (a day), "2026-11" (a month) or "2026" (a year).
 * - Raised: requests placed in the period, their items, and their value (requested qty × price).
 * - Received: items received in the period (whatever request they're on), their value at the
 *   quantity that actually arrived, and how many came short.
 * - Closed: requests whose last item was received in the period.
 * - Still open: requests raised in the period that are still waiting on something today.
 * Values use today's material prices, the same as the rest of the requests screen.
 */
import type { PurchaseOrder } from './types';

export interface RequestTotals {
  raised: number;
  itemsRaised: number;
  valueRaised: number;
  itemsReceived: number;
  valueReceived: number;
  /** Items received in the period with less than was requested. */
  shortItems: number;
  closed: number;
  /** Raised in the period and still open now. */
  open: number;
  /** Of those still open, how many have some items received already. */
  partly: number;
  /** Items on requests raised in the period that haven't arrived yet. */
  itemsPending: number;
}

export const EMPTY_TOTALS: RequestTotals = {
  raised: 0,
  itemsRaised: 0,
  valueRaised: 0,
  itemsReceived: 0,
  valueReceived: 0,
  shortItems: 0,
  closed: 0,
  open: 0,
  partly: 0,
  itemsPending: 0,
};

const EPS = 1e-9;

/** Totals for one period. `price` is a material's current price per unit (0 if unknown). */
export function requestTotals(pos: PurchaseOrder[], period: string, price: (ing: string) => number): RequestTotals {
  const t = { ...EMPTY_TOTALS };
  const inIt = (d?: string) => !!d && d.startsWith(period);
  for (const po of pos) {
    if (inIt(po.date)) {
      t.raised++;
      t.itemsRaised += po.lines.length;
      t.valueRaised += po.lines.reduce((a, l) => a + l.qty * price(l.ing), 0);
      if (po.status === 'Open') {
        t.open++;
        if (po.lines.some((l) => l.received)) t.partly++;
        t.itemsPending += po.lines.filter((l) => !l.received).length;
      }
    }
    if (po.status === 'Received' && inIt(po.received)) t.closed++;
    for (const l of po.lines) {
      if (!l.received || !inIt(l.received.date)) continue;
      t.itemsReceived++;
      t.valueReceived += l.received.qty * price(l.ing);
      if (l.received.qty < l.qty - EPS) t.shortItems++;
    }
  }
  return t;
}

/** One row per day of a month ("2026-11") that had any request activity, oldest first. */
export function requestsByDay(pos: PurchaseOrder[], month: string, price: (ing: string) => number) {
  const days = new Set<string>();
  for (const d of activityDates(pos)) if (d.startsWith(month)) days.add(d);
  return [...days].sort().map((day) => ({ day, ...requestTotals(pos, day, price) }));
}

/** Twelve rows, January to December, for one year. */
export function requestsByMonth(pos: PurchaseOrder[], year: string, price: (ing: string) => number) {
  return Array.from({ length: 12 }, (_, m) => {
    const month = `${year}-${String(m + 1).padStart(2, '0')}`;
    return { month, ...requestTotals(pos, month, price) };
  });
}

/** Requests that had anything happen in the period: raised, an item received, or closed. */
export function requestsIn(pos: PurchaseOrder[], period: string) {
  return pos.filter(
    (po) => po.date.startsWith(period) || po.received?.startsWith(period) || po.lines.some((l) => l.received?.date.startsWith(period)),
  );
}

function activityDates(pos: PurchaseOrder[]) {
  const out: string[] = [];
  for (const po of pos) {
    if (po.date) out.push(po.date);
    if (po.received) out.push(po.received);
    for (const l of po.lines) if (l.received?.date) out.push(l.received.date);
  }
  return out;
}

/** Days, months and years with any request activity, newest first (for the period pickers). */
export function requestPeriods(pos: PurchaseOrder[]) {
  const days = [...new Set(activityDates(pos))].sort().reverse();
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  return { days, months, years };
}
