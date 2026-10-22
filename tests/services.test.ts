import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { buildModel } from '@/lib/mrp';
import type { Actor } from '@/server/actor';
import { AppError } from '@/server/errors';
import * as svc from '@/server/services';
import { loadData, loadSnapshot } from '@/server/snapshot';
import { actorFor, freshDb, FUDGE, material, PASSWORD, product, SUGAR } from './helpers';

let db: Db;
let close: () => Promise<void>;
let orgId: string;
let admin: Actor;
let warehouse: Actor;
let production: Actor;

beforeEach(async () => {
  ({ db, close, orgId } = await freshDb());
  admin = await actorFor(db, 'areyes');
  warehouse = await actorFor(db, 'msilva');
  production = await actorFor(db, 'pnair');
});
afterEach(async () => {
  await close();
});

const forbidden = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'forbidden' });
const movements = (id: string) => db.select().from(t.stockMovements).where(eq(t.stockMovements.ingredientId, id));
const firstForecast = async (productName: string) => {
  const p = await product(db, orgId, productName);
  const [f] = await db.select().from(t.forecasts).where(eq(t.forecasts.productId, p.id));
  return f;
};

describe('organizations', () => {
  it('creating an organization makes its creator the owner, an Admin, with an empty plant', async () => {
    const { userId } = await svc.createOrganization(db, { orgName: 'Lahore Sweets', name: 'Sara Khan', email: 'Sara@Example.com', username: 'SKhan', password: 'pw-12345678', sample: false });
    const owner = await svc.authenticate(db, 'skhan', 'pw-12345678');
    expect(owner).toMatchObject({ id: userId, role: 'Admin', isOwner: true, email: 'sara@example.com' });
    const d = await loadData(db, owner.organizationId);
    expect(d.ingredients).toHaveLength(0);
    expect(d.users.map((u) => u.username)).toEqual(['skhan']);
  });

  it('can start with the sample plant', async () => {
    await svc.createOrganization(db, { orgName: 'Trial', name: 'T', email: 't@x.co', username: 'trial', password: 'pw-12345678', sample: true });
    const u = await svc.authenticate(db, 'trial', 'pw-12345678');
    const d = await loadData(db, u.organizationId);
    expect(d.ingredients).toHaveLength(20);
    expect(d.products).toHaveLength(3);
    expect(d.forecasts.every((f) => f.by === 'T')).toBe(true);
  });

  it('usernames and emails are unique across the service', async () => {
    await expect(
      svc.createOrganization(db, { orgName: 'X', name: 'X', email: 'new@x.co', username: 'areyes', password: 'pw-12345678', sample: false }),
    ).rejects.toMatchObject({ code: 'conflict', fieldErrors: { username: expect.any(String) } });
    await expect(
      svc.createOrganization(db, { orgName: 'X', name: 'X', email: 'AREYES@plant1.co', username: 'other', password: 'pw-12345678', sample: false }),
    ).rejects.toMatchObject({ fieldErrors: { email: expect.any(String) } });
  });

  it("keeps each organization's data separate", async () => {
    await svc.createOrganization(db, { orgName: 'Other', name: 'O', email: 'o@x.co', username: 'other', password: 'pw-12345678', sample: true });
    const other = await actorFor(db, 'other');
    const theirSugar = await material(db, other.organizationId, SUGAR);
    // Our admin can't touch their material, plan or order, even with the right id.
    await expect(svc.stepStock(db, admin, theirSugar.id, 'inHand', 1)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.updateMaterial(db, admin, theirSugar.id, { par: 1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.removeMember(db, admin, other.userId)).rejects.toMatchObject({ code: 'not_found' });
    // Both have their own PO-2040; receiving ours leaves theirs open.
    await svc.receivePO(db, warehouse, 'PO-2040');
    const theirs = await loadData(db, other.organizationId);
    expect(theirs.pos.find((p) => p.id === 'PO-2040')?.status).toBe('Open');
    expect((await loadSnapshot(db, admin)).data.users.map((u) => u.username)).not.toContain('other');
  });

  it('admins rename the organization', async () => {
    await svc.renameOrganization(db, admin, 'Plant 2');
    expect((await loadSnapshot(db, warehouse)).me.org.name).toBe('Plant 2');
    await forbidden(svc.renameOrganization(db, warehouse, 'Nope'));
  });
});

describe('team accounts', () => {
  it('admins create accounts that can sign in straight away', async () => {
    const res = await svc.createMember(db, admin, { name: 'Lena Fischer', username: 'LFischer', email: null, role: 'Production', password: 'temp-pass-1' });
    expect(res).toEqual({ name: 'Lena Fischer', username: 'lfischer', role: 'Production' });
    const u = await svc.authenticate(db, 'lfischer', 'temp-pass-1');
    expect(u).toMatchObject({ organizationId: orgId, role: 'Production', isOwner: false, createdBy: admin.userId });
  });

  it('only admins manage the team', async () => {
    const input = { name: 'X', username: 'xxx', email: null, role: 'Admin' as const, password: '12345678' };
    await forbidden(svc.createMember(db, warehouse, input));
    await forbidden(svc.createMember(db, production, input));
    await forbidden(svc.setMemberRole(db, warehouse, warehouse.userId, 'Admin'));
    await forbidden(svc.resetMemberPassword(db, production, warehouse.userId, '12345678'));
    await forbidden(svc.removeMember(db, warehouse, production.userId));
  });

  it('protects the owner and stops admins locking themselves out', async () => {
    const other = await svc.createMember(db, admin, { name: 'Second Admin', username: 'admin2', email: null, role: 'Admin', password: '12345678' });
    const admin2 = await actorFor(db, other.username);
    await expect(svc.setMemberRole(db, admin2, admin.userId, 'Warehouse')).rejects.toMatchObject({ code: 'conflict' });
    await expect(svc.removeMember(db, admin2, admin.userId)).rejects.toMatchObject({ code: 'conflict' });
    await forbidden(svc.resetMemberPassword(db, admin2, admin.userId, '12345678'));
    await expect(svc.setMemberRole(db, admin2, admin2.userId, 'Warehouse')).rejects.toMatchObject({ code: 'conflict' });
    await expect(svc.removeMember(db, admin2, admin2.userId)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('changing roles, resetting passwords and removing people', async () => {
    await svc.setMemberRole(db, admin, warehouse.userId, 'Production');
    expect((await actorFor(db, 'msilva')).role).toBe('Production');

    await db.insert(t.sessions).values({ id: 'sess-x', userId: warehouse.userId, expiresAt: new Date(Date.now() + 1e6) });
    await svc.resetMemberPassword(db, admin, warehouse.userId, 'brand-new-1');
    expect((await svc.authenticate(db, 'msilva', 'brand-new-1')).id).toBe(warehouse.userId);
    expect(await db.select().from(t.sessions).where(eq(t.sessions.userId, warehouse.userId))).toHaveLength(0);

    await svc.removeMember(db, admin, production.userId);
    await expect(svc.authenticate(db, 'pnair', PASSWORD)).rejects.toThrow('Incorrect username or password.');
    // The username is free again and their plans keep their name.
    await svc.createMember(db, admin, { name: 'Priya N', username: 'pnair', email: null, role: 'Production', password: '12345678' });
    expect((await loadData(db, orgId)).forecasts[0].by).toBe('Priya Nair');
  });

  it('admins edit names and emails; emails stay unique and the owner is protected', async () => {
    await svc.updateMember(db, admin, warehouse.userId, { name: 'Mateo Silva', email: 'Mateo@Plant.example' });
    const [u] = await db.select().from(t.users).where(eq(t.users.id, warehouse.userId));
    expect(u).toMatchObject({ name: 'Mateo Silva', email: 'mateo@plant.example' });
    // Signing in by the new email works.
    expect((await svc.authenticate(db, 'mateo@plant.example', PASSWORD)).id).toBe(warehouse.userId);

    await expect(svc.updateMember(db, admin, production.userId, { name: 'Priya Nair', email: 'mateo@plant.example' })).rejects.toMatchObject({
      code: 'conflict',
      fieldErrors: { email: expect.any(String) },
    });
    await svc.updateMember(db, admin, warehouse.userId, { name: 'Mateo Silva', email: null });

    await forbidden(svc.updateMember(db, warehouse, production.userId, { name: 'X', email: null }));
    const other = await svc.createMember(db, admin, { name: 'Second Admin', username: 'admin2', email: null, role: 'Admin', password: '12345678' });
    await forbidden(svc.updateMember(db, await actorFor(db, other.username), admin.userId, { name: 'Not the owner', email: null }));
  });

  it('people change their own password with the current one', async () => {
    await expect(svc.changeOwnPassword(db, warehouse, 'wrong', 'new-pass-99')).rejects.toBeInstanceOf(AppError);
    await svc.changeOwnPassword(db, warehouse, PASSWORD, 'new-pass-99');
    expect((await svc.authenticate(db, 'msilva', 'new-pass-99')).id).toBe(warehouse.userId);
  });

  it('signs in by username or email with the right password only', async () => {
    expect((await svc.authenticate(db, 'AReyes', PASSWORD)).id).toBe(admin.userId);
    expect((await svc.authenticate(db, 'msilva@plant1.co', PASSWORD)).id).toBe(warehouse.userId);
    await expect(svc.authenticate(db, 'areyes', 'wrong')).rejects.toThrow('Incorrect username or password.');
    await expect(svc.authenticate(db, 'nobody', PASSWORD)).rejects.toThrow('Incorrect username or password.');
  });
});

describe('setting up a plant from scratch', () => {
  it('materials, products and recipe lines can be created and removed', async () => {
    await svc.createOrganization(db, { orgName: 'New', name: 'N', email: 'n@x.co', username: 'newbie', password: 'pw-12345678', sample: false });
    const owner = await actorFor(db, 'newbie');
    const { id: cocoa } = await svc.addMaterial(db, owner, { name: 'Cocoa', kind: 'ingredient', unit: 'kg', packName: 'bag', pack: 25, cost: 4000, par: 50 });
    const { id: box } = await svc.addMaterial(db, owner, { name: 'Box', kind: 'packaging', unit: 'pcs', packName: 'bundle', pack: 100, cost: 20, par: 200 });
    await expect(svc.addMaterial(db, owner, { name: 'Cocoa', kind: 'ingredient', unit: 'kg', packName: 'bag', pack: 25, cost: 1, par: 1 })).rejects.toMatchObject({ code: 'conflict' });
    const { id: bar } = await svc.addProduct(db, owner, { name: 'Bar', batchKg: 100, upb: 400, upc: 20 });
    await svc.addRecipeLine(db, owner, bar, cocoa, 30);
    await svc.addRecipeLine(db, owner, bar, box, 20);
    await expect(svc.addRecipeLine(db, owner, bar, cocoa, 1)).rejects.toMatchObject({ code: 'conflict' });

    let d = await loadData(db, owner.organizationId);
    expect(d.recipes[bar]).toEqual([
      { ing: cocoa, qty: 30 },
      { ing: box, qty: 20 },
    ]);
    // Out of stock: capacity 0, and an order is suggested to reach par.
    const m = buildModel(d);
    expect(m.capacity(m.prodById[bar], m.total).batches).toBe(0);
    expect(m.suggestions.find((s) => s.i.id === cocoa)).toMatchObject({ packs: 2, qty: 50 });

    await expect(svc.deleteMaterial(db, owner, cocoa)).rejects.toMatchObject({ code: 'conflict' });
    await svc.removeRecipeLine(db, owner, bar, cocoa);
    await svc.deleteMaterial(db, owner, cocoa);
    await svc.deleteProduct(db, owner, bar);
    d = await loadData(db, owner.organizationId);
    expect(d.products).toHaveLength(0);
    expect(d.ingredients.map((i) => i.name)).toEqual(['Box']);
  });

  it('recipe lines must use the same organization’s materials', async () => {
    await svc.createOrganization(db, { orgName: 'Other', name: 'O', email: 'o@x.co', username: 'other', password: 'pw-12345678', sample: false });
    const other = await actorFor(db, 'other');
    const { id: theirBar } = await svc.addProduct(db, other, { name: 'Bar', batchKg: 10, upb: 1, upc: 1 });
    const sugar = await material(db, orgId, SUGAR);
    await expect(svc.addRecipeLine(db, other, theirBar, sugar.id, 1)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('role permissions (blueprint §3)', () => {
  it('only Admin and Warehouse log stock', async () => {
    const sugar = await material(db, orgId, SUGAR);
    await forbidden(svc.stepStock(db, production, sugar.id, 'inHand', 1));
    await forbidden(svc.setStock(db, production, sugar.id, 'inHand', 1));
    await svc.stepStock(db, warehouse, sugar.id, 'inHand', 1);
  });

  it('only Admin edits products, recipes, materials', async () => {
    const sugar = await material(db, orgId, SUGAR);
    const fudge = await product(db, orgId, FUDGE);
    for (const who of [warehouse, production]) {
      await forbidden(svc.setRecipeQty(db, who, fudge.id, sugar.id, 1));
      await forbidden(svc.updateMaterial(db, who, sugar.id, { par: 1 }));
      await forbidden(svc.setBatchKg(db, who, fudge.id, 600));
      await forbidden(svc.addProduct(db, who, { name: 'X', batchKg: 1, upb: 1, upc: 1 }));
      await forbidden(svc.deleteMaterial(db, who, sugar.id));
    }
  });

  it('only Admin and Production forecast and log runs', async () => {
    const fudge = await product(db, orgId, FUDGE);
    await forbidden(svc.addForecast(db, warehouse, { productId: fudge.id, batches: 1, date: '2026-11-01' }));
    await svc.addForecast(db, production, { productId: fudge.id, batches: 1, date: '2026-11-01' });
  });

  it('every role can raise a purchase order; Production cannot receive one', async () => {
    const po = await svc.generatePO(db, production, []);
    expect(po.id).toBe('PO-2041');
    await forbidden(svc.receivePO(db, production, po.id));
    await svc.receivePO(db, warehouse, po.id);
  });
});

describe('stock, orders and production', () => {
  it('± steps by one supplier pack and records who did it', async () => {
    const sugar = await material(db, orgId, SUGAR);
    await svc.stepStock(db, warehouse, sugar.id, 'inHand', 1);
    expect((await material(db, orgId, SUGAR)).inHand).toBe(2268);
    expect((await movements(sugar.id))[0]).toMatchObject({ delta: 25, balanceAfter: 2268, reason: 'adjust', userId: warehouse.userId, organizationId: orgId });
  });

  it('orders whole packs for every suggestion and moves them into pipeline', async () => {
    const po = await svc.generatePO(db, admin, []);
    expect(po).toEqual({ id: 'PO-2041', lines: 3 });
    expect((await material(db, orgId, 'Di Sodium Phosphate')).pipeline).toBe(25);
    expect(buildModel(await loadData(db, orgId)).suggestions).toHaveLength(0);
    await expect(svc.generatePO(db, admin, [])).rejects.toMatchObject({ code: 'conflict' });
  });

  it('receiving moves pipeline into in-hand, once', async () => {
    await svc.receivePO(db, warehouse, 'PO-2040');
    expect(await material(db, orgId, SUGAR)).toMatchObject({ inHand: 2443, pipeline: 256 });
    await expect(svc.receivePO(db, warehouse, 'PO-2040')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('logging a run deducts the recipe from in-hand and counts the plan down', async () => {
    const f = await firstForecast(FUDGE);
    expect(await svc.logRun(db, production, f.id, 1)).toEqual({ product: FUDGE, units: 500 });
    expect((await material(db, orgId, SUGAR)).inHand).toBe(2243 - 140);
    const [after] = await db.select().from(t.forecasts).where(eq(t.forecasts.id, f.id));
    expect(after.batches).toBe(3);
  });

  it('refuses a run when in-hand stock is short', async () => {
    const f = await firstForecast('Chocolate Coating');
    await expect(svc.logRun(db, production, f.id, 2)).rejects.toThrow(/Salt \+ Vanilla Powder/);
  });

  it('changing batch weight scales mix lines but not packaging', async () => {
    const fudge = await product(db, orgId, FUDGE);
    await svc.setBatchKg(db, admin, fudge.id, 1000);
    const sugar = await material(db, orgId, SUGAR);
    const bags = await material(db, orgId, 'Poly Bags');
    const lines = await db.select().from(t.recipeLines).where(eq(t.recipeLines.productId, fudge.id));
    expect(lines.find((l) => l.ingredientId === sugar.id)?.qtyPerBatch).toBe(280);
    expect(lines.find((l) => l.ingredientId === bags.id)?.qtyPerBatch).toBe(500);
  });
});

describe('custom purchase orders', () => {
  it('orders any materials in any whole number of packs; quantity comes from the pack size', async () => {
    const sugar = await material(db, orgId, SUGAR);
    const cartons = await material(db, orgId, 'Cartons');
    const po = await svc.createPO(db, warehouse, [
      { ingredientId: sugar.id, packs: 3 },
      { ingredientId: cartons.id, packs: 2 },
    ]);
    expect(po).toEqual({ id: 'PO-2041', lines: 2 });
    const [row] = await db.select().from(t.purchaseOrders).where(and(eq(t.purchaseOrders.organizationId, orgId), eq(t.purchaseOrders.code, 'PO-2041')));
    const lines = await db.select().from(t.poLines).where(eq(t.poLines.poId, row.id));
    expect(Object.fromEntries(lines.map((l) => [l.ingredientId, [l.packs, l.qty]]))).toEqual({ [sugar.id]: [3, 75], [cartons.id]: [2, 100] });
    expect((await material(db, orgId, SUGAR)).pipeline).toBe(456 + 75);
  });

  it('merges repeated materials into one line', async () => {
    const sugar = await material(db, orgId, SUGAR);
    await svc.createPO(db, admin, [
      { ingredientId: sugar.id, packs: 1 },
      { ingredientId: sugar.id, packs: 2 },
    ]);
    expect((await material(db, orgId, SUGAR)).pipeline).toBe(456 + 75);
  });

  it('rejects empty orders, part packs, utilities and other organizations’ materials', async () => {
    const sugar = await material(db, orgId, SUGAR);
    const water = await material(db, orgId, 'Water (process)');
    await expect(svc.createPO(db, admin, [])).rejects.toBeInstanceOf(AppError);
    await expect(svc.createPO(db, admin, [{ ingredientId: sugar.id, packs: 0 }])).rejects.toBeInstanceOf(AppError);
    await expect(svc.createPO(db, admin, [{ ingredientId: sugar.id, packs: 1.5 }])).rejects.toBeInstanceOf(AppError);
    await expect(svc.createPO(db, admin, [{ ingredientId: water.id, packs: 1 }])).rejects.toThrow(/utility/);
    await svc.createOrganization(db, { orgName: 'Other', name: 'O', email: 'o@x.co', username: 'other', password: 'pw-12345678', sample: false });
    await expect(svc.createPO(db, await actorFor(db, 'other'), [{ ingredientId: sugar.id, packs: 1 }])).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('spreadsheet import', () => {
  const rows = [
    { name: SUGAR, inHand: 3000, cost: 200 },
    { name: 'Hazelnut Paste', inHand: 40, pack: 10, par: 20, cost: 4100 },
  ];

  it('admins update everything and add new materials; undo puts it all back', async () => {
    const res = await svc.applyImport(db, admin, rows, 'october.xlsx');
    expect(res).toMatchObject({ updated: 1, added: 1 });
    expect(await material(db, orgId, SUGAR)).toMatchObject({ inHand: 3000, cost: 200 });
    expect(await material(db, orgId, 'Hazelnut Paste')).toMatchObject({ inHand: 40, pack: 10, organizationId: orgId });
    await svc.revertImport(db, admin, res.undo);
    expect(await material(db, orgId, SUGAR)).toMatchObject({ inHand: 2243, cost: 180 });
    expect(await material(db, orgId, 'Hazelnut Paste')).toBeUndefined();
  });

  it('warehouse imports change stock counts only', async () => {
    const res = await svc.applyImport(db, warehouse, rows, 'count.csv');
    expect(res).toMatchObject({ updated: 1, added: 0 });
    expect(await material(db, orgId, SUGAR)).toMatchObject({ inHand: 3000, cost: 180 });
    await forbidden(svc.applyImport(db, production, rows, 'x.xlsx'));
  });
});

describe('sample data', () => {
  it('the owner can swap everything for the sample plant; the team stays', async () => {
    await svc.generatePO(db, admin, []);
    await svc.createMember(db, admin, { name: 'Sam', username: 'sam', email: null, role: 'Warehouse', password: '12345678' });
    await forbidden(svc.replaceWithSample(db, warehouse));
    await svc.replaceWithSample(db, admin);
    const d = await loadData(db, orgId);
    expect(d.pos.map((p) => p.id)).toEqual(['PO-2040', 'PO-2039']);
    expect(d.users.map((u) => u.username)).toContain('sam');
    const [{ value }] = await db.select({ value: t.ingredients.id }).from(t.ingredients).where(and(eq(t.ingredients.organizationId, orgId), eq(t.ingredients.name, SUGAR)));
    expect(value).toBeTruthy();
  });
});
