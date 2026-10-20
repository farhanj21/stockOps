import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { resetContent } from '@/db/seed';
import { buildModel } from '@/lib/mrp';
import { AppError } from '@/server/errors';
import * as svc from '@/server/services';
import { loadData, loadSnapshot } from '@/server/snapshot';
import { actor, freshDb, ingredient, PASSWORD } from './helpers';

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await freshDb());
});
afterEach(async () => {
  await close();
});

const admin = actor('Admin');
const warehouse = actor('Warehouse');
const production = actor('Production');

const forbidden = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'forbidden' });
const movements = (id: string) => db.select().from(t.stockMovements).where(eq(t.stockMovements.ingredientId, id));

describe('seed + snapshot', () => {
  it('loads the starter plant data in the client shape', async () => {
    const d = await loadData(db);
    expect(d.ingredients).toHaveLength(20);
    expect(d.products.map((p) => p.id)).toEqual(['fudge', 'coating', 'compound']);
    expect(d.recipes.coating.find((l) => l.ing === 'pgpr')?.qty).toBeCloseTo(2.91);
    expect(d.forecasts.map((f) => f.by)).toEqual(['Priya Nair', 'Priya Nair']);
    expect(d.pos.find((p) => p.id === 'PO-2040')?.lines).toHaveLength(3);
    expect(d.requests).toHaveLength(1);
  });

  it('hides other users and access requests from roles that do not manage users', async () => {
    const s = await loadSnapshot(db, warehouse);
    expect(s.data.users.map((u) => u.id)).toEqual(['u2']);
    expect(s.data.requests).toEqual([]);
    expect((await loadSnapshot(db, admin)).data.users).toHaveLength(4);
  });
});

describe('role permissions (blueprint §3)', () => {
  it('only Admin and Warehouse log stock', async () => {
    await forbidden(svc.stepStock(db, production, 'sugar', 'inHand', 1));
    await forbidden(svc.setStock(db, production, 'sugar', 'inHand', 1));
    await svc.stepStock(db, warehouse, 'sugar', 'inHand', 1);
    await svc.stepStock(db, admin, 'sugar', 'inHand', 1);
  });

  it('only Admin edits recipes, costs, pack sizes, par levels and users', async () => {
    for (const who of [warehouse, production]) {
      await forbidden(svc.setRecipeQty(db, who, 'fudge', 'sugar', 1));
      await forbidden(svc.updateMaterial(db, who, 'sugar', { par: 1 }));
      await forbidden(svc.setBatchKg(db, who, 'fudge', 600));
      await forbidden(svc.approveRequest(db, who, 'r1'));
      await forbidden(svc.setUserRole(db, who, 'u4', 'Admin'));
    }
  });

  it('only Admin and Production forecast and log runs', async () => {
    await forbidden(svc.addForecast(db, warehouse, { productId: 'fudge', batches: 1, date: '2026-11-01' }));
    await forbidden(svc.logRun(db, warehouse, 'f1', 1));
    await svc.addForecast(db, production, { productId: 'fudge', batches: 1, date: '2026-11-01' });
  });

  it('every role can raise a purchase order; Production cannot receive one', async () => {
    const po = await svc.generatePO(db, production, []);
    expect(po.id).toBe('PO-2041');
    await forbidden(svc.receivePO(db, production, po.id));
    await svc.receivePO(db, warehouse, po.id);
  });
});

describe('stock', () => {
  it('± steps by one supplier pack and records who did it', async () => {
    await svc.stepStock(db, warehouse, 'sugar', 'inHand', 1);
    expect((await ingredient(db, 'sugar')).inHand).toBe(2268);
    const [mv] = await movements('sugar');
    expect(mv).toMatchObject({ field: 'in_hand', delta: 25, balanceAfter: 2268, reason: 'adjust', userId: 'u2' });
  });

  it('never goes below zero', async () => {
    await svc.setStock(db, warehouse, 'pgpr', 'pipeline', 0.5);
    await svc.stepStock(db, warehouse, 'pgpr', 'pipeline', -1);
    expect((await ingredient(db, 'pgpr')).pipeline).toBe(0);
  });

  it('a physical count sets the exact value', async () => {
    await svc.setStock(db, admin, 'smp', 'inHand', 401.5);
    expect((await ingredient(db, 'smp')).inHand).toBe(401.5);
    expect((await movements('smp'))[0]).toMatchObject({ delta: -34.5, reason: 'count' });
  });

  it('rejects a zero pack size', async () => {
    await expect(svc.updateMaterial(db, admin, 'sugar', { pack: 0 })).rejects.toBeInstanceOf(AppError);
  });
});

describe('purchase orders', () => {
  it('orders whole packs for every suggestion and moves them into pipeline', async () => {
    const po = await svc.generatePO(db, admin, []);
    expect(po).toEqual({ id: 'PO-2041', lines: 3 });
    const lines = await db.select().from(t.poLines).where(eq(t.poLines.poId, 'PO-2041'));
    expect(Object.fromEntries(lines.map((l) => [l.ingredientId, [l.packs, l.qty]]))).toEqual({ pgpr: [1, 5], dsp: [1, 25], saltvan: [2, 10] });
    expect((await ingredient(db, 'dsp')).pipeline).toBe(25);
    expect(buildModel(await loadData(db)).suggestions).toHaveLength(0);
  });

  it('leaves out unticked lines and refuses an empty order', async () => {
    await svc.generatePO(db, admin, ['pgpr', 'dsp']);
    const lines = await db.select().from(t.poLines).where(eq(t.poLines.poId, 'PO-2041'));
    expect(lines.map((l) => l.ingredientId)).toEqual(['saltvan']);
    await svc.generatePO(db, admin, []); // remaining two
    await expect(svc.generatePO(db, admin, [])).rejects.toMatchObject({ code: 'conflict' });
  });

  it('receiving moves pipeline into in-hand, once', async () => {
    const before = await ingredient(db, 'sugar');
    await svc.receivePO(db, warehouse, 'PO-2040');
    const after = await ingredient(db, 'sugar');
    expect(after.inHand).toBe(before.inHand + 200);
    expect(after.pipeline).toBe(before.pipeline - 200);
    const [po] = await db.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, 'PO-2040'));
    expect(po).toMatchObject({ status: 'Received', receivedBy: 'u2' });
    await expect(svc.receivePO(db, warehouse, 'PO-2040')).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('production', () => {
  it('logging a run deducts the recipe from in-hand and counts the plan down', async () => {
    const res = await svc.logRun(db, production, 'f1', 1);
    expect(res).toEqual({ product: 'Chocolate Hot Fudge (McD)', units: 500 });
    expect((await ingredient(db, 'sugar')).inHand).toBe(2243 - 140);
    expect((await ingredient(db, 'water')).inHand).toBe(0); // utilities are not stocked
    const [f] = await db.select().from(t.forecasts).where(eq(t.forecasts.id, 'f1'));
    expect(f.batches).toBe(3);
    expect(await db.select().from(t.productionRuns)).toHaveLength(1);
  });

  it('refuses a run when in-hand stock is short', async () => {
    // Coating needs 3.87 kg salt + vanilla per batch; only 6 kg in hand.
    await expect(svc.logRun(db, production, 'f2', 2)).rejects.toThrow(/Salt \+ Vanilla Powder/);
    expect((await ingredient(db, 'sugar')).inHand).toBe(2243); // nothing deducted
  });

  it('cannot run more batches than planned', async () => {
    await expect(svc.logRun(db, production, 'f1', 5)).rejects.toThrow(/Only 4 batches/);
  });

  it('removing a plan can be undone', async () => {
    await svc.removeForecast(db, production, 'f1');
    expect((await loadData(db)).forecasts.map((f) => f.id)).toEqual(['f2']);
    await svc.restoreForecast(db, production, 'f1');
    expect((await loadData(db)).forecasts.map((f) => f.id)).toEqual(['f1', 'f2']);
  });
});

describe('recipes', () => {
  it('changing batch weight scales mix lines but not packaging', async () => {
    await svc.setBatchKg(db, admin, 'fudge', 1000);
    const lines = await db.select().from(t.recipeLines).where(eq(t.recipeLines.productId, 'fudge'));
    const q = Object.fromEntries(lines.map((l) => [l.ingredientId, l.qtyPerBatch]));
    expect(q.sugar).toBe(280);
    expect(q.dsp).toBeCloseTo(3.33);
    expect(q.bags).toBe(500);
  });

  it('rejects a zero batch weight', async () => {
    await expect(svc.setBatchKg(db, admin, 'fudge', 0)).rejects.toBeInstanceOf(AppError);
  });
});

describe('accounts', () => {
  it('signs in by username or email with the right password only', async () => {
    expect((await svc.authenticate(db, 'AReyes', PASSWORD)).id).toBe('u1');
    expect((await svc.authenticate(db, 'msilva@plant1.co', PASSWORD)).id).toBe('u2');
    await expect(svc.authenticate(db, 'areyes', 'wrong')).rejects.toThrow('Incorrect username or password.');
    await expect(svc.authenticate(db, 'nobody', PASSWORD)).rejects.toThrow('Incorrect username or password.');
  });

  it('a requested account can sign in only after approval, with the password it chose', async () => {
    await svc.requestAccess(db, { name: 'Sam Lee', email: 'Sam@Plant1.co', role: 'Warehouse', password: 'sam-secret-1' });
    await expect(svc.authenticate(db, 'sam@plant1.co', 'sam-secret-1')).rejects.toThrow(/waiting for an Admin/);
    const [req] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.email, 'sam@plant1.co'));
    expect(await svc.approveRequest(db, admin, req.id)).toMatchObject({ name: 'Sam Lee', role: 'Warehouse', username: 'sam' });
    expect((await svc.authenticate(db, 'sam', 'sam-secret-1')).role).toBe('Warehouse');
    await expect(svc.approveRequest(db, admin, req.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects duplicate requests', async () => {
    await expect(svc.requestAccess(db, { name: 'X', email: 'areyes@plant1.co', role: 'Admin', password: '12345678' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('declining can be undone', async () => {
    await svc.declineRequest(db, admin, 'r1');
    expect((await loadData(db)).requests).toHaveLength(0);
    await svc.reopenRequest(db, admin, 'r1');
    expect((await loadData(db)).requests).toHaveLength(1);
  });

  it('keeps at least one Admin', async () => {
    await expect(svc.setUserRole(db, admin, 'u1', 'Warehouse')).rejects.toMatchObject({ code: 'conflict' });
    await svc.setUserRole(db, admin, 'u4', 'Admin');
    await svc.setUserRole(db, admin, 'u1', 'Warehouse');
    const [u] = await db.select().from(t.users).where(eq(t.users.id, 'u1'));
    expect(u.role).toBe('Warehouse');
  });
});

describe('spreadsheet import', () => {
  const rows = [
    { name: 'Sugar (Powdered)', inHand: 3000, cost: 200 },
    { name: 'Hazelnut Paste', inHand: 40, pack: 10, par: 20, cost: 4100 },
  ];

  it('admins update everything and add new materials; undo puts it all back', async () => {
    const res = await svc.applyImport(db, admin, rows, 'october.xlsx');
    expect(res).toMatchObject({ updated: 1, added: 1 });
    expect(await ingredient(db, 'sugar')).toMatchObject({ inHand: 3000, cost: 200 });
    const [added] = await db.select().from(t.ingredients).where(eq(t.ingredients.name, 'Hazelnut Paste'));
    expect(added).toMatchObject({ inHand: 40, pack: 10, par: 20 });
    expect((await movements('sugar'))[0]).toMatchObject({ reason: 'import', ref: 'october.xlsx' });

    await svc.revertImport(db, admin, res.undo);
    expect(await ingredient(db, 'sugar')).toMatchObject({ inHand: 2243, cost: 180 });
    expect(await db.select().from(t.ingredients).where(eq(t.ingredients.name, 'Hazelnut Paste'))).toHaveLength(0);
  });

  it('warehouse imports change stock counts only', async () => {
    const res = await svc.applyImport(db, warehouse, rows, 'count.csv');
    expect(res).toMatchObject({ updated: 1, added: 0 });
    expect(await ingredient(db, 'sugar')).toMatchObject({ inHand: 3000, cost: 180 });
    await forbidden(svc.revertImport(db, warehouse, { restore: [{ id: 'sugar', fields: { cost: 1 } }], remove: [] }));
  });

  it('production cannot import', async () => {
    await forbidden(svc.applyImport(db, production, rows, 'x.xlsx'));
  });
});

describe('demo reset', () => {
  it('restores starter content and keeps accounts', async () => {
    await svc.generatePO(db, admin, []);
    await svc.requestAccess(db, { name: 'Sam', email: 'sam@plant1.co', role: 'Warehouse', password: '12345678' });
    const [req] = await db.select().from(t.accessRequests).where(and(eq(t.accessRequests.email, 'sam@plant1.co')));
    await svc.approveRequest(db, admin, req.id);
    await resetContent(db);
    const d = await loadData(db);
    expect(d.pos.map((p) => p.id)).toEqual(['PO-2040', 'PO-2039']);
    expect(d.users.map((u) => u.username)).toContain('sam');
  });
});
