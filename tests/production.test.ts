import { describe, expect, it } from 'vitest';
import { batchMetrics, byMonth, byProduct, inPeriod, periodsWithData, suggestBatchNo, totals } from '@/lib/production';
import type { Batch } from '@/lib/types';

const b = (over: Partial<Batch>): Batch => ({
  id: Math.random().toString(36),
  batchNo: 'B',
  date: '2026-10-01',
  productId: 'p1',
  forecastId: null,
  plannedKg: 500,
  actualKg: 500,
  units: 500,
  cases: 50,
  materialCost: 100000,
  notes: '',
  by: 'X',
  ...over,
});

describe('production records maths', () => {
  it('cost per kg is the material cost spread over the kg actually produced', () => {
    const m = batchMetrics({ plannedKg: 500, actualKg: 480, materialCost: 96000 });
    expect(m.wastageKg).toBe(20);
    expect(m.wastagePct).toBeCloseTo(4);
    expect(m.costPerKg).toBeCloseTo(200); // 96,000 ÷ 480
    expect(m.standardCostPerKg).toBeCloseTo(192); // 96,000 ÷ 500 with no losses
  });

  it('suggests the next free number for the production day', () => {
    expect(suggestBatchNo([], '2026-10-23')).toBe('B-261023-01');
    expect(suggestBatchNo([{ batchNo: 'B-261023-01' }, { batchNo: 'b-261023-07' }, { batchNo: 'B-261022-09' }], '2026-10-23')).toBe('B-261023-08');
  });

  it('period averages are weighted by kg produced', () => {
    const t = totals([b({ actualKg: 400, materialCost: 100000 }), b({ actualKg: 500, materialCost: 100000 })]);
    expect(t).toMatchObject({ batches: 2, plannedKg: 1000, actualKg: 900, wastageKg: 100, units: 1000, cases: 100 });
    expect(t.costPerKg).toBeCloseTo(200000 / 900);
    expect(t.wastagePct).toBeCloseTo(10);
  });

  it('groups by product, month and year', () => {
    const batches = [
      b({ productId: 'p1', date: '2026-09-30' }),
      b({ productId: 'p1', date: '2026-10-02' }),
      b({ productId: 'p2', date: '2026-10-03', actualKg: 990, plannedKg: 1000 }),
      b({ productId: 'p1', date: '2025-12-31' }),
    ];
    const products = [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
      { id: 'p3', name: 'None' },
    ];
    const oct = byProduct(inPeriod(batches, '2026-10'), products);
    expect(oct.map((r) => [r.product.name, r.batches])).toEqual([
      ['One', 1],
      ['Two', 1],
    ]);
    expect(byProduct(inPeriod(batches, '2026'), products).find((r) => r.product.id === 'p1')?.batches).toBe(2);
    const months = byMonth(batches, '2026', 'p1');
    expect(months).toHaveLength(12);
    expect(months[8]).toMatchObject({ month: '2026-09', batches: 1 });
    expect(months[9]).toMatchObject({ month: '2026-10', batches: 1 });
    expect(months[0].batches).toBe(0);
    expect(periodsWithData(batches)).toEqual({ months: ['2026-10', '2026-09', '2025-12'], years: ['2026', '2025'] });
  });
});
