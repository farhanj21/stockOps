import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { demoMode } from '@/db/seed';
import type { Snapshot } from '@/lib/api';
import type { Data, RecipeLine } from '@/lib/types';
import { can, type Actor } from './actor';

/**
 * Everything the app shows, in the shape the client works with.
 * People data (all users, access requests) is only included for roles that manage users.
 */
export async function loadData(db: Db, people: { all: boolean; selfId?: string } = { all: true }): Promise<Data> {
  const [ingredients, products, lines, forecasts, pos, poLines, users, requests] = await Promise.all([
    db.select().from(t.ingredients).orderBy(asc(t.ingredients.position), asc(t.ingredients.name)),
    db.select().from(t.products).orderBy(asc(t.products.position), asc(t.products.name)),
    db.select().from(t.recipeLines).orderBy(asc(t.recipeLines.productId), asc(t.recipeLines.position)),
    db
      .select({ f: t.forecasts, by: t.users.name })
      .from(t.forecasts)
      .leftJoin(t.users, eq(t.forecasts.createdBy, t.users.id))
      .where(and(isNull(t.forecasts.deletedAt), gt(t.forecasts.batches, 0)))
      .orderBy(asc(t.forecasts.targetDate), asc(t.forecasts.createdAt)),
    db
      .select({ po: t.purchaseOrders, by: t.users.name })
      .from(t.purchaseOrders)
      .leftJoin(t.users, eq(t.purchaseOrders.createdBy, t.users.id))
      .orderBy(desc(t.purchaseOrders.placedOn), desc(t.purchaseOrders.createdAt)),
    db.select().from(t.poLines).orderBy(asc(t.poLines.poId), asc(t.poLines.position)),
    people.all
      ? db.select().from(t.users).where(eq(t.users.active, true)).orderBy(asc(t.users.createdAt), asc(t.users.id))
      : db.select().from(t.users).where(eq(t.users.id, people.selfId ?? '')),
    people.all
      ? db.select().from(t.accessRequests).where(eq(t.accessRequests.status, 'pending')).orderBy(asc(t.accessRequests.createdAt))
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
    products: products.map((p) => ({ id: p.id, name: p.name, batchKg: p.batchKg, upb: p.unitsPerBatch, upc: p.unitsPerCase })),
    recipes,
    forecasts: forecasts.map(({ f, by }) => ({ id: f.id, productId: f.productId, batches: f.batches, date: f.targetDate, by: by ?? '—' })),
    pos: pos.map(({ po, by }) => ({
      id: po.id,
      date: po.placedOn,
      status: po.status,
      received: po.receivedOn ?? undefined,
      by: by ?? '—',
      lines: poLines.filter((l) => l.poId === po.id).map((l) => ({ ing: l.ingredientId, packs: l.packs, qty: l.qty })),
    })),
    users: users.map((u) => ({ id: u.id, name: u.name, username: u.username, email: u.email, role: u.role })),
    requests: requests.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, date: r.createdAt.toISOString().slice(0, 10) })),
  };
}

export async function loadSnapshot(db: Db, actor: Actor): Promise<Snapshot> {
  const data = await loadData(db, { all: can(actor, 'setup'), selfId: actor.userId });
  return { data, me: { userId: actor.userId, role: actor.role, baseRole: actor.baseRole, demo: demoMode() } };
}
