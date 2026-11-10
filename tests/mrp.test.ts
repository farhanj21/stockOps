import { describe, expect, it } from 'vitest';
import { planImport } from '@/lib/import-plan';
import { buildModel } from '@/lib/mrp';
import { seed } from '@/lib/seed';

describe('MRP math (blueprint §1)', () => {
  const m = buildModel(seed());
  const sug = (id: string) => m.suggestions.find((s) => s.i.id === id);

  it('total available = in-hand + pipeline', () => {
    expect(m.total(m.byId.sugar)).toBe(2243 + 456);
    expect(m.total(m.byId.pgpr)).toBeCloseTo(9.2);
  });

  it('allocates committed plans against stock', () => {
    // 4 fudge batches × 140 kg sugar + 3 coating batches × 281.01 kg
    expect(m.allocOf(m.byId.sugar)).toBeCloseTo(4 * 140 + 3 * 281.01);
    expect(m.free(m.byId.sugar)).toBeCloseTo(2699 - (560 + 843.03));
  });

  it('capacity is set by the most limiting ingredient, floored to whole batches and cases', () => {
    const fudge = m.capacity(m.prodById.fudge, m.total);
    expect(fudge.lim?.id).toBe('dsp'); // 9 kg ÷ 1.665 kg per batch = 5.4
    expect(fudge.batches).toBe(5);
    expect(fudge.cases).toBe(250); // 5 × 500 units ÷ 10 per case
    expect(m.capacity(m.prodById.coating, m.total)).toMatchObject({ batches: 1, cases: 50 });
  });

  it('ignores utilities such as process water when finding the limit', () => {
    expect(m.capacity(m.prodById.fudge, m.total).lim?.kind).not.toBe('utility');
  });

  it('flags materials whose in-hand + pipeline is below par', () => {
    expect(m.alerts.map((i) => i.id).sort()).toEqual(['dsp', 'pgpr', 'saltvan']);
  });

  it('rounds order quantities up to whole supplier packs (blueprint §1D)', () => {
    expect(sug('pgpr')).toMatchObject({ packs: 1, qty: 5, forPlan: false }); // short 0.8 kg vs par → one 5 kg jug
    expect(sug('dsp')).toMatchObject({ packs: 1, qty: 25 }); // short 6 kg → one 25 kg bag
    // Plans need 11.61 kg, only 6 available: 5.61 short (more than the 4 kg par gap) → two 5 kg packs
    expect(sug('saltvan')).toMatchObject({ packs: 2, qty: 10, forPlan: true });
    expect(sug('saltvan')!.deficit).toBeCloseTo(5.61);
    expect(sug('pgpr')!.cost).toBe(5 * 5200);
  });

  it('never orders a partial pack, even for tiny deficits', () => {
    const d = seed();
    d.ingredients.find((i) => i.id === 'sugar')!.inHand = 0;
    d.ingredients.find((i) => i.id === 'sugar')!.pipeline = 0;
    d.forecasts = [];
    d.pos = []; // nothing already requested either
    const s = buildModel(d).suggestions.find((x) => x.i.id === 'sugar')!;
    expect(s.deficit).toBe(200);
    expect(s.packs).toBe(8);
    expect(s.qty).toBe(200);
  });

  it('previews the material impact of a plan before committing', () => {
    const impact = m.planImpact(m.prodById.fudge, 4);
    const dsp = impact.lines.find((l) => l.i.id === 'dsp')!;
    expect(dsp.need).toBeCloseTo(6.66);
    expect(dsp.short).toBeGreaterThan(0);
    expect(impact.shortCount).toBeGreaterThan(0);
    expect(impact.lines.some((l) => l.i.kind === 'utility')).toBe(false);
  });

  it('numbers the next purchase request after the highest existing number', () => {
    expect(m.nextPoId).toBe('PR-2041');
  });

  it('material impact counts in-hand only, and only asks to request what is not already on its way', () => {
    const d = seed();
    d.forecasts = [];
    const sugar = d.ingredients.find((i) => i.id === 'sugar')!;
    sugar.inHand = 0; // 456 kg in pipeline (PO-2040's 200 kg included) is on the way
    const m2 = buildModel(d);
    const pid = Object.keys(d.recipes).find((k) => d.recipes[k].some((r) => r.ing === 'sugar' && Number(r.qty) > 0))!;
    const perBatch = Number(d.recipes[pid].find((r) => r.ing === 'sugar')!.qty);
    const batches = Math.ceil(500 / perBatch); // needs a bit more than is on the way
    const line = m2.planImpact(m2.prodById[pid], batches).lines.find((l) => l.i.id === 'sugar')!;
    expect(line.free).toBe(0);
    expect(line.short).toBeCloseTo(line.need);
    expect(line.coming).toBeCloseTo(456);
    expect(line.order).toBeGreaterThanOrEqual(line.need - 456 - 1e-9); // only the uncovered part, in whole packs
    expect(line.order).toBeLessThan(line.need - 456 + 25 + 1e-9);
  });

  it('"can produce" counts in-hand stock only, not requests or pipeline', () => {
    const d = seed();
    const sugar = d.ingredients.find((i) => i.id === 'sugar')!;
    sugar.inHand = 0; // pipeline stays at 456 kg
    const m2 = buildModel(d);
    const uses = Object.keys(d.recipes).filter((pid) => d.recipes[pid].some((r) => r.ing === 'sugar' && Number(r.qty) > 0));
    expect(uses.length).toBeGreaterThan(0);
    for (const pid of uses) expect(m2.capacity(m2.prodById[pid], m2.inHand).batches).toBe(0);
    expect(m2.capacity(m2.prodById[uses[0]], m2.total).batches).toBeGreaterThan(0); // planning still sees what's coming
  });

  it('buying decisions count in-hand + pipeline; using stock counts in-hand only', () => {
    expect(m.total(m.byId.sugar)).toBe(2243 + 456);
    expect(m.inHand(m.byId.sugar)).toBe(2243);
  });
});

describe('spreadsheet import plan', () => {
  const ings = seed().ingredients;

  it('matches rows by name, ignoring case and punctuation', () => {
    const plan = planImport([{ name: 'sugar powdered', inHand: 3000 }], ings, true);
    expect(plan.count.update).toBe(1);
    expect(plan.patches.get('sugar')).toEqual({ inHand: 3000 });
  });

  it('warehouse imports only touch stock counts and skip unknown materials', () => {
    const plan = planImport(
      [
        { name: 'Sugar (Powdered)', inHand: 1, cost: 999, par: 1 },
        { name: 'Hazelnut Paste', inHand: 40 },
      ],
      ings,
      false,
    );
    expect(plan.patches.get('sugar')).toEqual({ inHand: 1 });
    expect(plan.count).toMatchObject({ update: 1, add: 0, skip: 1 });
  });

  it('admins can add new materials; duplicates in the sheet are skipped', () => {
    const plan = planImport(
      [
        { name: 'Hazelnut Paste', inHand: 40, pack: 10 },
        { name: 'hazelnut paste', inHand: 50 },
      ],
      ings,
      true,
    );
    expect(plan.adds).toHaveLength(1);
    expect(plan.adds[0]).toMatchObject({ name: 'Hazelnut Paste', inHand: 40, pack: 10 });
    expect(plan.count.skip).toBe(1);
  });

  it('ignores a zero pack size rather than breaking pack rounding', () => {
    const plan = planImport([{ name: 'Sugar (Powdered)', pack: 0 }], ings, true);
    expect(plan.changes).toBe(0);
  });
});
