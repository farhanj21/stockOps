import { and, eq, inArray } from 'drizzle-orm';
import { seed as sampleData } from '@/lib/seed';
import { hashPassword } from '@/server/password';
import { newId } from './ids';
import type { Db } from './index';
import * as t from './schema';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ORG_NAME = 'Demo Chocolate Plant';

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Demo conveniences (sign-in shortcuts for the demo org, "Replace with sample data") are on in development, opt-in in production. */
export const demoMode = () => (process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !isProduction());

/** "Load sample data" for the owner: always available in development, and in production when demo mode is on. */
export const sampleDataEnabled = () => !isProduction() || demoMode();

const n = (v: number | '') => (v === '' ? 0 : v);

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Fill an organization with the sample chocolate plant: materials, products, recipes,
 * two plans and two POs. `authorFor` maps the sample's people to real users of the org.
 */
export async function insertSampleContent(db: Db | Tx, organizationId: string, authorFor: (sampleName: string) => string | null) {
  const d = sampleData();
  const ingId = new Map(d.ingredients.map((i) => [i.id, newId('ing')]));
  const prodId = new Map(d.products.map((p) => [p.id, newId('prd')]));

  await db.insert(t.ingredients).values(
    d.ingredients.map((i, position) => ({
      ...i,
      id: ingId.get(i.id)!,
      organizationId,
      cost: n(i.cost),
      pack: n(i.pack),
      par: n(i.par),
      inHand: n(i.inHand),
      pipeline: n(i.pipeline),
      position,
    })),
  );
  await db.insert(t.products).values(
    d.products.map((p, position) => ({
      id: prodId.get(p.id)!,
      organizationId,
      name: p.name,
      batchKg: n(p.batchKg),
      unitsPerBatch: n(p.upb),
      unitsPerCase: n(p.upc),
      position,
    })),
  );
  await db.insert(t.recipeLines).values(
    Object.entries(d.recipes).flatMap(([productId, lines]) =>
      lines.map((l, position) => ({ productId: prodId.get(productId)!, ingredientId: ingId.get(l.ing)!, qtyPerBatch: n(l.qty), position })),
    ),
  );
  await db.insert(t.forecasts).values(
    d.forecasts.map((f) => ({
      id: newId('fc'),
      organizationId,
      productId: prodId.get(f.productId)!,
      batches: f.batches,
      targetDate: f.date,
      createdBy: authorFor(f.by),
    })),
  );
  for (const po of d.pos) {
    const id = newId('po');
    const by = authorFor(po.by);
    await db.insert(t.purchaseOrders).values({
      id,
      organizationId,
      code: po.id,
      status: po.status,
      placedOn: po.date,
      receivedOn: po.received ?? null,
      createdBy: by,
      receivedBy: po.status === 'Received' ? by : null,
    });
    await db.insert(t.poLines).values(po.lines.map((l, position) => ({ poId: id, ingredientId: ingId.get(l.ing)!, packs: l.packs, qty: l.qty, position })));
  }
  // Past batches: material cost = recipe quantities × sample prices.
  const costOf = new Map(d.ingredients.map((i) => [i.id, n(i.cost)]));
  const batchCost = (productId: string) => (d.recipes[productId] ?? []).reduce((acc, l) => acc + n(l.qty) * (costOf.get(l.ing) ?? 0), 0);
  if (d.batches.length) {
    await db.insert(t.productionBatches).values(
      d.batches.map((b) => ({
        id: newId('bat'),
        organizationId,
        batchNo: b.batchNo,
        producedOn: b.date,
        productId: prodId.get(b.productId)!,
        plannedKg: b.plannedKg,
        actualKg: b.actualKg,
        units: b.units,
        cases: b.cases,
        materialCost: Math.round(batchCost(b.productId) * 100) / 100,
        createdBy: authorFor(b.by),
      })),
    );
  }
}

/** Remove every material, product, plan, PO and stock movement of an organization. People stay. */
export async function clearContent(db: Db | Tx, organizationId: string) {
  const pos = db.select({ id: t.purchaseOrders.id }).from(t.purchaseOrders).where(eq(t.purchaseOrders.organizationId, organizationId));
  const prods = db.select({ id: t.products.id }).from(t.products).where(eq(t.products.organizationId, organizationId));
  await db.delete(t.stockMovements).where(eq(t.stockMovements.organizationId, organizationId));
  await db.delete(t.poLines).where(inArray(t.poLines.poId, pos));
  await db.delete(t.purchaseOrders).where(eq(t.purchaseOrders.organizationId, organizationId));
  await db.delete(t.productionBatches).where(eq(t.productionBatches.organizationId, organizationId));
  await db.delete(t.productionRuns).where(eq(t.productionRuns.organizationId, organizationId));
  await db.delete(t.forecasts).where(eq(t.forecasts.organizationId, organizationId));
  await db.delete(t.recipeLines).where(inArray(t.recipeLines.productId, prods));
  await db.delete(t.products).where(eq(t.products.organizationId, organizationId));
  await db.delete(t.ingredients).where(eq(t.ingredients.organizationId, organizationId));
}

/**
 * The demo organization with its four sample people (all password `demo1234` unless given),
 * for trying the app out. Run with `npm run db:seed-demo`. Does nothing if it already exists.
 */
export async function createDemoOrganization(db: Db, password = DEMO_PASSWORD) {
  const d = sampleData();
  const [taken] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(inArray(t.users.username, d.users.map((u) => u.username)));
  if (taken) return null;

  const organizationId = newId('org');
  const passwordHash = await hashPassword(password);
  const userIdByName = new Map(d.users.map((u) => [u.name, newId('usr')]));
  await db.transaction(async (tx) => {
    await tx.insert(t.organizations).values({ id: organizationId, name: DEMO_ORG_NAME });
    await tx.insert(t.users).values(
      d.users.map((u) => ({
        id: userIdByName.get(u.name)!,
        organizationId,
        name: u.name,
        username: u.username,
        email: u.email,
        passwordHash,
        role: u.role,
        isOwner: u.isOwner,
      })),
    );
    await insertSampleContent(tx, organizationId, (name) => userIdByName.get(name) ?? null);
  });
  return organizationId;
}

/** Starter usernames of the demo org that exist on this server (for the sign-in shortcuts). */
export async function demoAccounts(db: Db) {
  const d = sampleData().users.filter((u) => u.id !== 'u4');
  const rows = await db
    .select({ username: t.users.username, name: t.users.name, role: t.users.role })
    .from(t.users)
    .innerJoin(t.organizations, eq(t.users.organizationId, t.organizations.id))
    .where(and(eq(t.organizations.name, DEMO_ORG_NAME), eq(t.users.active, true), inArray(t.users.username, d.map((u) => u.username))));
  return d.flatMap((u) => {
    const r = rows.find((x) => x.username === u.username);
    return r ? [{ username: r.username, label: `${r.role} · ${r.name.split(' ')[0]}` }] : [];
  });
}
