import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { demoMode, sampleDataEnabled } from '@/db/seed';
import type { Snapshot } from '@/lib/api';
import type { Data, RecipeLine } from '@/lib/types';
import { can, type Actor } from './actor';

/**
 * Everything one organization's app shows, in the shape the client works with.
 * The team list is only included in full for roles that manage people.
 */
export async function loadData(db: Db, organizationId: string, people: { all: boolean; selfId?: string } = { all: true }): Promise<Data> {
  const org = organizationId;
  const [ingredients, products, forecasts, pos, users, batches] = await Promise.all([
    db.select().from(t.ingredients).where(eq(t.ingredients.organizationId, org)).orderBy(asc(t.ingredients.position), asc(t.ingredients.name)),
    db.select().from(t.products).where(eq(t.products.organizationId, org)).orderBy(asc(t.products.position), asc(t.products.name)),
    db
      .select({ f: t.forecasts, by: t.users.name })
      .from(t.forecasts)
      .leftJoin(t.users, eq(t.forecasts.createdBy, t.users.id))
      .where(and(eq(t.forecasts.organizationId, org), isNull(t.forecasts.deletedAt), gt(t.forecasts.batches, 0)))
      .orderBy(asc(t.forecasts.targetDate), asc(t.forecasts.createdAt)),
    db
      .select({ po: t.purchaseOrders, by: t.users.name })
      .from(t.purchaseOrders)
      .leftJoin(t.users, eq(t.purchaseOrders.createdBy, t.users.id))
      .where(eq(t.purchaseOrders.organizationId, org))
      .orderBy(desc(t.purchaseOrders.placedOn), desc(t.purchaseOrders.createdAt)),
    db
      .select()
      .from(t.users)
      .where(and(eq(t.users.organizationId, org), eq(t.users.active, true), ...(people.all ? [] : [eq(t.users.id, people.selfId ?? '')])))
      .orderBy(desc(t.users.isOwner), asc(t.users.createdAt), asc(t.users.name)),
    db
      .select({ b: t.productionBatches, by: t.users.name })
      .from(t.productionBatches)
      .leftJoin(t.users, eq(t.productionBatches.createdBy, t.users.id))
      .where(eq(t.productionBatches.organizationId, org))
      .orderBy(desc(t.productionBatches.producedOn), desc(t.productionBatches.createdAt)),
  ]);

  const productIds = products.map((p) => p.id);
  const poIds = pos.map(({ po }) => po.id);
  const [lines, poLines] = await Promise.all([
    productIds.length
      ? db.select().from(t.recipeLines).where(inArray(t.recipeLines.productId, productIds)).orderBy(asc(t.recipeLines.productId), asc(t.recipeLines.position))
      : Promise.resolve([]),
    poIds.length ? db.select().from(t.poLines).where(inArray(t.poLines.poId, poIds)).orderBy(asc(t.poLines.poId), asc(t.poLines.position)) : Promise.resolve([]),
  ]);

  const recipes: Record<string, RecipeLine[]> = {};
  for (const p of products) recipes[p.id] = [];
  for (const l of lines) (recipes[l.productId] ??= []).push({ ing: l.ingredientId, qty: l.qtyPerBatch });

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      kind: i.kind,
      cost: i.cost,
      pack: i.pack,
      packName: i.packName,
      par: i.par,
      inHand: i.inHand,
      pipeline: i.pipeline,
    })),
    products: products.map((p) => ({ id: p.id, name: p.name, batchKg: p.batchKg, upb: p.unitsPerBatch, upc: p.unitsPerCase })),
    recipes,
    forecasts: forecasts.map(({ f, by }) => ({ id: f.id, productId: f.productId, batches: f.batches, date: f.targetDate, by: by ?? '—' })),
    // People see the PO code (PO-2041); it is unique within the organization, so it doubles as the id.
    pos: pos.map(({ po, by }) => ({
      id: po.code,
      date: po.placedOn,
      status: po.status,
      received: po.receivedOn ?? undefined,
      by: by ?? '—',
      lines: poLines.filter((l) => l.poId === po.id).map((l) => ({ ing: l.ingredientId, packs: l.packs, qty: l.qty })),
    })),
    batches: batches.map(({ b, by }) => ({
      id: b.id,
      batchNo: b.batchNo,
      date: b.producedOn,
      productId: b.productId,
      forecastId: b.forecastId,
      plannedKg: b.plannedKg,
      actualKg: b.actualKg,
      units: b.units,
      cases: b.cases,
      materialCost: b.materialCost,
      notes: b.notes ?? '',
      by: by ?? '—',
    })),
    users: users.map((u) => ({ id: u.id, name: u.name, username: u.username, email: u.email ?? '', role: u.role, isOwner: u.isOwner })),
  };
}

export async function loadSnapshot(db: Db, actor: Actor): Promise<Snapshot> {
  const [data, [org]] = await Promise.all([
    loadData(db, actor.organizationId, { all: can(actor, 'setup'), selfId: actor.userId }),
    db
      .select({ id: t.organizations.id, name: t.organizations.name, logoUpdatedAt: t.organizations.logoUpdatedAt })
      .from(t.organizations)
      .where(eq(t.organizations.id, actor.organizationId)),
  ]);
  // The logo itself is fetched separately (it can be tens of KB); the version keeps caches fresh.
  const logoUrl = org.logoUpdatedAt ? `/api/org-logo?v=${org.logoUpdatedAt.getTime()}` : null;
  return {
    data,
    me: { userId: actor.userId, org: { id: org.id, name: org.name, logoUrl }, isOwner: actor.isOwner, role: actor.role, baseRole: actor.baseRole, demo: demoMode(), sampleData: sampleDataEnabled(), assistant: !!process.env.GEMINI_API_KEY },
  };
}
