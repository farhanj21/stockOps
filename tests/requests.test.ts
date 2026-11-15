import { describe, expect, it } from 'vitest';
import { requestPeriods, requestsByDay, requestsByMonth, requestsIn, requestTotals } from '@/lib/requests';
import type { PurchaseOrder } from '@/lib/types';

const price = (ing: string) => ({ sugar: 2, bags: 6 })[ing] ?? 0;
const got = (qty: number, date: string) => ({ qty, date, by: 'W', note: '' });

const POS: PurchaseOrder[] = [
  // Raised 1 Nov, both items received in full on 3 Nov → closed 3 Nov.
  {
    id: 'PR-1',
    date: '2026-11-01',
    status: 'Received',
    received: '2026-11-03',
    by: 'A',
    lines: [
      { ing: 'sugar', packs: 4, qty: 100, received: got(100, '2026-11-03') },
      { ing: 'bags', packs: 1, qty: 1000, received: got(1000, '2026-11-03') },
    ],
  },
  // Raised 3 Nov, sugar arrived short the same day, bags still to come.
  {
    id: 'PR-2',
    date: '2026-11-03',
    status: 'Open',
    by: 'A',
    lines: [
      { ing: 'sugar', packs: 2, qty: 50, received: got(40, '2026-11-03') },
      { ing: 'bags', packs: 1, qty: 1000 },
    ],
  },
  // Raised in October, received in November: counts as raised in Oct, received/closed in Nov.
  { id: 'PR-0', date: '2026-10-30', status: 'Received', received: '2026-11-01', by: 'A', lines: [{ ing: 'sugar', packs: 1, qty: 25, received: got(25, '2026-11-01') }] },
];

describe('purchase request summaries', () => {
  it('a day counts what was raised, received and closed on it', () => {
    const t = requestTotals(POS, '2026-11-03', price);
    expect(t).toMatchObject({ raised: 1, itemsRaised: 2, valueRaised: 50 * 2 + 1000 * 6, itemsReceived: 3, shortItems: 1, closed: 1, open: 1, partly: 1, itemsPending: 1 });
    expect(t.valueReceived).toBe(100 * 2 + 1000 * 6 + 40 * 2);
  });

  it('a month includes requests raised earlier but received in it', () => {
    const nov = requestTotals(POS, '2026-11', price);
    expect(nov).toMatchObject({ raised: 2, itemsReceived: 4, closed: 2, open: 1 });
    expect(requestTotals(POS, '2026-10', price)).toMatchObject({ raised: 1, itemsReceived: 0, closed: 0, open: 0 });
  });

  it('day-by-day rows only cover days with activity; month-by-month always has twelve', () => {
    expect(requestsByDay(POS, '2026-11', price).map((r) => r.day)).toEqual(['2026-11-01', '2026-11-03']);
    const year = requestsByMonth(POS, '2026', price);
    expect(year).toHaveLength(12);
    expect(year[10]).toMatchObject({ month: '2026-11', raised: 2 });
  });

  it('lists the requests involved in a period and the periods with activity', () => {
    expect(requestsIn(POS, '2026-11-01').map((p) => p.id)).toEqual(['PR-1', 'PR-0']);
    expect(requestPeriods(POS)).toEqual({ days: ['2026-11-03', '2026-11-01', '2026-10-30'], months: ['2026-11', '2026-10'], years: ['2026'] });
  });
});
