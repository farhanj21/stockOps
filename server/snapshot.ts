import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { demoMode, sampleDataEnabled } from '@/db/seed';
import type { Snapshot } from '@/lib/api';
import { BUILT_IN_ROLES } from '@/lib/roles';
import type { Data, RecipeLine } from '@/lib/types';
import { can, resolveRole, type Actor } from './actor';

/**
 * Everything one organization's app shows, in the shape the client works with.
 * The team list is only included in full for roles that manage people.
 */
export async function loadData(db: Db, organizationId: string, people: { all: boolean; selfId?: string } = { all: true }): Promise<Data> {
  const org = organizationId;
  const receiver = alias(t.users, 'receiver');
  const lineReceiver = alias(t.users, 'line_receiver');
  const [ingredients, products, forecasts, pos, users, batches, customRoles, [poSeq], [lastStock], [orgRow]] = await Promise.all([
    db.select().from(t.ingredients).where(eq(t.ingredients.organizationId, org)).orderBy(asc(t.ingredients.position), asc(t.ingredients.name)),
    db.select().from(t.products).where(eq(t.products.organizationId, org)).orderBy(asc(t.products.position), asc(t.products.name)),
    db
      .select({ f: t.forecasts, by: t.users.name })
      .from(t.forecasts)
      .leftJoin(t.users, eq(t.forecasts.createdBy, t.users.id))
      .where(and(eq(t.forecasts.organizationId, org), isNull(t.forecasts.deletedAt), gt(t.forecasts.batches, 0)))
      .orderBy(asc(t.forecasts.targetDate), asc(t.forecasts.createdAt)),
    db
      .select({ po: t.purchaseOrders, by: t.users.name, receivedBy: receiver.name })
      .from(t.purchaseOrders)
      .leftJoin(t.users, eq(t.purchaseOrders.createdBy, t.users.id))
      .leftJoin(receiver, eq(t.purchaseOrders.receivedBy, receiver.id))
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
    db.select().from(t.customRoles).where(eq(t.customRoles.organizationId, org)).orderBy(asc(t.customRoles.createdAt), asc(t.customRoles.name)),
    // Highest PO number ever raised, including deleted orders, so a number is never reused.
    db
      .select({ max: sql<number | null>`max(nullif(regexp_replace(${t.stockMovements.ref}, '[^0-9]', '', 'g'), '')::bigint)` })
      .from(t.stockMovements)
      .where(and(eq(t.stockMovements.organizationId, org), eq(t.stockMovements.reason, 'po_created'))),
    // Last time someone changed stock: a count, adjustment, import or delivery received.
    db
      .select({ at: t.stockMovements.createdAt, by: t.users.name })
      .from(t.stockMovements)
      .leftJoin(t.users, eq(t.stockMovements.userId, t.users.id))
      .where(and(eq(t.stockMovements.organizationId, org), inArray(t.stockMovements.reason, ['count', 'adjust', 'import', 'po_received'])))
      .orderBy(desc(t.stockMovements.createdAt))
      .limit(1),
    db.select({ lastRequestNo: t.organizations.lastRequestNo }).from(t.organizations).where(eq(t.organizations.id, org)),
  ]);
  const customById = new Map(customRoles.map((r) => [r.id, r]));

  const productIds = products.map((p) => p.id);
  const poIds = pos.map(({ po }) => po.id);
  const [lines, poLines] = await Promise.all([
    productIds.length
      ? db.select().from(t.recipeLines).where(inArray(t.recipeLines.productId, productIds)).orderBy(asc(t.recipeLines.productId), asc(t.recipeLines.position))
      : Promise.resolve([]),
    poIds.length
      ? db
          .select({ l: t.poLines, by: lineReceiver.name })
          .from(t.poLines)
          .leftJoin(lineReceiver, eq(t.poLines.receivedBy, lineReceiver.id))
          .where(inArray(t.poLines.poId, poIds))
          .orderBy(asc(t.poLines.poId), asc(t.poLines.position))
      : Promise.resolve([]),
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
    products: products.map((p) => ({ id: p.id, name: p.name, batchKg: p.batchKg, upb: p.unitsPerBatch, upc: p.unitsPerCase, unitG: p.unitWeightG ?? '' })),
    recipes,
    forecasts: forecasts.map(({ f, by }) => ({ id: f.id, productId: f.productId, batches: f.batches, date: f.targetDate, by: by ?? '—' })),
    // People see the PO code (PO-2041); it is unique within the organization, so it doubles as the id.
    pos: pos.map(({ po, by, receivedBy }) => ({
      id: po.code,
      date: po.placedOn,
      status: po.status,
      received: po.receivedOn ?? undefined,
      receivedBy: receivedBy ?? undefined,
      by: by ?? '—',
      lines: poLines
        .filter(({ l }) => l.poId === po.id)
        .map(({ l, by: lineBy }) => ({
          ing: l.ingredientId,
          packs: l.packs,
          qty: l.qty,
          ...(l.receivedQty != null ? { received: { qty: l.receivedQty, date: l.receivedOn ?? '', by: lineBy ?? '', note: l.receiveNote ?? '' } } : {}),
        })),
    })),
    lastPoNo: Math.max(Number(poSeq?.max) || 0, orgRow?.lastRequestNo ?? 0),
    lastStockUpdate: lastStock ? { at: new Date(lastStock.at).toISOString(), by: lastStock.by ?? '' } : null,
    batches: batches.map(({ b, by }) => ({
      id: b.id,
      batchNo: b.batchNo,
      date: b.producedOn,
      productId: b.productId,
      forecastId: b.forecastId,
      plannedKg: b.plannedKg,
      plannedUnits: b.plannedUnits ?? 0,
      upc: b.unitsPerCase ?? 0,
      unitG: b.unitWeightG ?? 0,
      actualKg: b.actualKg,
      units: b.units,
      cases: b.cases,
      materialCost: b.materialCost,
      notes: b.notes ?? '',
      by: by ?? '—',
    })),
    users: users.map((u) => {
      const r = resolveRole(u.role, (u.customRoleId && customById.get(u.customRoleId)) || null);
      return { id: u.id, name: u.name, username: u.username, email: u.email ?? '', roleId: r.roleId, role: r.role, isOwner: u.isOwner };
    }),
    roles: [
      ...BUILT_IN_ROLES,
      ...customRoles.map((r) => ({ id: r.id, name: r.name, builtIn: false, perms: resolveRole('Production', r).perms })),
    ],
  };
}

export async function loadSnapshot(db: Db, actor: Actor): Promise<Snapshot> {
  const [data, [org]] = await Promise.all([
    loadData(db, actor.organizationId, { all: can(actor, 'team'), selfId: actor.userId }),
    db
      .select({ id: t.organizations.id, name: t.organizations.name, logoUpdatedAt: t.organizations.logoUpdatedAt })
      .from(t.organizations)
      .where(eq(t.organizations.id, actor.organizationId)),
  ]);
  // The logo itself is fetched separately (it can be tens of KB); the version keeps caches fresh.
  const logoUrl = org.logoUpdatedAt ? `/api/org-logo?v=${org.logoUpdatedAt.getTime()}` : null;
  return {
    data,
    me: { userId: actor.userId, org: { id: org.id, name: org.name, logoUrl }, isOwner: actor.isOwner, role: actor.role, roleId: actor.roleId, perms: actor.perms, demo: demoMode(), sampleData: sampleDataEnabled() },
  };
}
