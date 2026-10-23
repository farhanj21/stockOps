/**
 * Production records maths, shared by the server and the screens.
 *
 * - Wastage = the recipe's batch weight − the kg actually produced.
 * - Cost per kg (after wastage) = the batch's material cost ÷ the kg actually produced,
 *   so losses push the real cost per kg up.
 * - Period averages are weighted by kg: total material cost ÷ total kg produced.
 */
import type { Batch, Product } from './types';

export function batchMetrics(b: Pick<Batch, 'plannedKg' | 'actualKg' | 'materialCost'>) {
  const wastageKg = b.plannedKg - b.actualKg;
  return {
    wastageKg,
    wastagePct: b.plannedKg > 0 ? (wastageKg / b.plannedKg) * 100 : 0,
    costPerKg: b.actualKg > 0 ? b.materialCost / b.actualKg : 0,
    /** What a kg would cost with no losses, for comparison. */
    standardCostPerKg: b.plannedKg > 0 ? b.materialCost / b.plannedKg : 0,
  };
}

/** `B-YYMMDD-NN`: the date the batch was made plus the next free number for that day. */
export function suggestBatchNo(batches: Pick<Batch, 'batchNo'>[], date: string): string {
  const prefix = `B-${date.slice(2, 10).replace(/-/g, '')}-`;
  let max = 0;
  for (const b of batches) {
    if (!b.batchNo.toUpperCase().startsWith(prefix)) continue;
    const n = parseInt(b.batchNo.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(2, '0');
}

export const normBatchNo = (s: string) => s.trim().toUpperCase();

export interface ProductionTotals {
  batches: number;
  plannedKg: number;
  actualKg: number;
  wastageKg: number;
  wastagePct: number;
  units: number;
  cases: number;
  materialCost: number;
  /** Weighted: total material cost ÷ total kg produced. */
  costPerKg: number;
}

export function totals(batches: Batch[]): ProductionTotals {
  const t = batches.reduce(
    (a, b) => ({
      batches: a.batches + 1,
      plannedKg: a.plannedKg + b.plannedKg,
      actualKg: a.actualKg + b.actualKg,
      units: a.units + b.units,
      cases: a.cases + b.cases,
      materialCost: a.materialCost + b.materialCost,
    }),
    { batches: 0, plannedKg: 0, actualKg: 0, units: 0, cases: 0, materialCost: 0 },
  );
  const wastageKg = t.plannedKg - t.actualKg;
  return {
    ...t,
    wastageKg,
    wastagePct: t.plannedKg > 0 ? (wastageKg / t.plannedKg) * 100 : 0,
    costPerKg: t.actualKg > 0 ? t.materialCost / t.actualKg : 0,
  };
}

/** Batches whose production date starts with `period` ("2026" for a year, "2026-10" for a month). */
export const inPeriod = (batches: Batch[], period: string) => batches.filter((b) => b.date.startsWith(period));

/** One row per product that produced anything in the batches given, in product order. */
export function byProduct(batches: Batch[], products: Pick<Product, 'id' | 'name'>[]) {
  return products
    .map((p) => ({ product: p, ...totals(batches.filter((b) => b.productId === p.id)) }))
    .filter((r) => r.batches > 0);
}

/** Twelve rows, January to December, for one year (optionally one product). */
export function byMonth(batches: Batch[], year: string, productId?: string) {
  const mine = batches.filter((b) => b.date.startsWith(year) && (!productId || b.productId === productId));
  return Array.from({ length: 12 }, (_, m) => {
    const month = `${year}-${String(m + 1).padStart(2, '0')}`;
    return { month, ...totals(mine.filter((b) => b.date.startsWith(month))) };
  });
}

/** Years and months that have batches, newest first (for the period pickers). */
export function periodsWithData(batches: Batch[]) {
  const months = [...new Set(batches.map((b) => b.date.slice(0, 7)))].sort().reverse();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  return { months, years };
}
