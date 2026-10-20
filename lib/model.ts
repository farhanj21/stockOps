'use client';

import { useMemo } from 'react';
import { fmt, num, round } from './format';
import { useData } from './store';
import type { Data, Ingredient, Product } from './types';

export interface Capacity {
  batches: number;
  cases: number;
  /** The ingredient that runs out first. */
  lim: Ingredient | null;
}

export interface Suggestion {
  i: Ingredient;
  /** Deficit vs whichever is larger: committed plans or par level. */
  deficit: number;
  packs: number;
  qty: number;
  cost: number;
  forPlan: boolean;
}

export interface PlanLine {
  i: Ingredient;
  need: number;
  free: number;
  short: number;
  packs: number;
  order: number;
}

/** "3 × 25 kg bags" */
export const packTxt = (i: Ingredient, n: number) => `${n} × ${fmt(num(i.pack))} ${i.unit} ${n === 1 ? i.packName : i.packName + 's'}`;

const EPS = 1e-9;

/**
 * All MRP math from the blueprint, derived from the stored data:
 * total = in-hand + pipeline, free = total − what committed plans use,
 * capacity = min over recipe lines of stock ÷ qty per batch,
 * order = deficit rounded up to whole supplier packs.
 */
export function buildModel(d: Data) {
  const ings = d.ingredients.filter((i) => i.kind !== 'utility');
  const byId: Record<string, Ingredient> = Object.fromEntries(d.ingredients.map((i) => [i.id, i]));
  const prodById: Record<string, Product> = Object.fromEntries(d.products.map((p) => [p.id, p]));
  const recipeOf = (productId: string) => d.recipes[productId] || [];
  const isUtil = (i: Ingredient | undefined): i is undefined => !i || i.kind === 'utility';

  const total = (i: Ingredient) => num(i.inHand) + num(i.pipeline);
  const alloc: Record<string, number> = {};
  ings.forEach((i) => (alloc[i.id] = 0));
  d.forecasts.forEach((f) =>
    recipeOf(f.productId).forEach((r) => {
      if (alloc[r.ing] != null) alloc[r.ing] += num(f.batches) * num(r.qty);
    }),
  );
  const allocOf = (i: Ingredient) => alloc[i.id] ?? 0;
  const free = (i: Ingredient) => total(i) - allocOf(i);
  const isLow = (i: Ingredient) => total(i) < num(i.par);
  const shortOf = (i: Ingredient) => Math.max(0, num(i.par) - total(i));
  const perCase = (p: Product) => num(p.upb) / Math.max(1, num(p.upc));

  function capacity(p: Product, basis: (i: Ingredient) => number): Capacity {
    let best = Infinity;
    let lim: Ingredient | null = null;
    recipeOf(p.id).forEach((r) => {
      const q = num(r.qty);
      const i = byId[r.ing];
      if (isUtil(i) || q <= 0) return;
      const b = Math.max(0, basis(i)) / q;
      if (b < best) {
        best = b;
        lim = i;
      }
    });
    const batches = Number.isFinite(best) ? Math.floor(best + EPS) : 0;
    return { batches, cases: Math.floor((batches * num(p.upb)) / Math.max(1, num(p.upc))), lim };
  }

  const alerts = ings
    .filter(isLow)
    .sort((a, b) => total(a) / Math.max(num(a.par), EPS) - total(b) / Math.max(num(b.par), EPS));

  const packsFor = (i: Ingredient, deficit: number) => Math.ceil(deficit / Math.max(num(i.pack), EPS) - EPS);

  const suggestions: Suggestion[] = ings
    .map((i) => {
      const t = total(i);
      const planS = allocOf(i) - t;
      const parS = num(i.par) - t;
      const deficit = Math.max(planS, parS, 0);
      if (deficit <= EPS) return null;
      const packs = packsFor(i, deficit);
      const qty = round(packs * num(i.pack));
      return { i, deficit, packs, qty, cost: qty * num(i.cost), forPlan: planS >= parS };
    })
    .filter((x): x is Suggestion => x !== null);

  /** Material impact of planning `batches` more of a product, against free stock. */
  function planImpact(p: Product, batches: number) {
    const lines: PlanLine[] = [];
    let shortCount = 0;
    let orderCost = 0;
    let materialCost = 0;
    recipeOf(p.id).forEach((r) => {
      const i = byId[r.ing];
      if (isUtil(i)) return;
      const need = batches * num(r.qty);
      const fr = Math.max(0, free(i));
      const short = Math.max(0, need - fr);
      const packs = short > 0 ? packsFor(i, short) : 0;
      const order = packs * num(i.pack);
      materialCost += need * num(i.cost);
      if (short > 0) {
        shortCount++;
        orderCost += order * num(i.cost);
      }
      lines.push({ i, need, free: fr, short, packs, order });
    });
    return { lines, shortCount, orderCost, materialCost };
  }

  const batchCost = (p: Product) =>
    recipeOf(p.id).reduce((a, r) => a + (byId[r.ing] ? num(r.qty) * num(byId[r.ing].cost) : 0), 0);

  const forecastsSorted = d.forecasts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const committedBatches = d.forecasts.reduce((a, f) => a + num(f.batches), 0);
  const committedCases = d.forecasts.reduce(
    (a, f) => a + Math.floor(num(f.batches) * perCase(prodById[f.productId] || { upb: 0, upc: 1 })),
    0,
  );

  const openPOs = d.pos.filter((p) => p.status === 'Open');
  const receivedPOs = d.pos.filter((p) => p.status === 'Received').slice(0, 4);
  const nextPoId = 'PO-' + (Math.max(2039, ...d.pos.map((p) => parseInt(String(p.id).replace(/\D/g, ''), 10) || 0)) + 1);

  return {
    data: d,
    ings,
    byId,
    prodById,
    recipeOf,
    isUtil,
    total,
    allocOf,
    free,
    isLow,
    shortOf,
    perCase,
    capacity,
    alerts,
    suggestions,
    planImpact,
    batchCost,
    forecastsSorted,
    committedBatches,
    committedCases,
    openPOs,
    receivedPOs,
    nextPoId,
  };
}

export type Model = ReturnType<typeof buildModel>;

export function useModel(): Model {
  const data = useData();
  return useMemo(() => buildModel(data), [data]);
}
