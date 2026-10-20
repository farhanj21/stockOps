/**
 * Business rules for every change the app can make. Each function takes the database,
 * the acting user and validated input, enforces role permissions, and throws AppError
 * with a user-facing message when a change isn't allowed.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import type { ImportUndo } from '@/lib/api';
import { normH, num, qu, round } from '@/lib/format';
import { planImport, type ImportRow } from '@/lib/import-plan';
import { buildModel } from '@/lib/mrp';
import type { Role } from '@/lib/types';
import { can, plantToday, requirePerm, type Actor } from './actor';
import { AppError, isUniqueViolation } from './errors';
import { hashPassword, verifyPassword } from './password';
import { loadData } from './snapshot';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Ingredient = typeof t.ingredients.$inferSelect;
export type StockField = 'inHand' | 'pipeline';
type Reason = (typeof t.movementReasonEnum.enumValues)[number];

const EPS = 1e-9;
const newId = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function lockIngredient(tx: Tx, id: string): Promise<Ingredient> {
  const [row] = await tx.select().from(t.ingredients).where(eq(t.ingredients.id, id)).for('update');
  if (!row) throw new AppError('That material no longer exists.', 'not_found');
  return row;
}

/** Set in-hand or pipeline to an absolute value and record the movement. */
async function writeStock(tx: Tx, actor: Actor, ing: Ingredient, field: StockField, value: number, reason: Reason, ref: string | null = null) {
  const next = round(Math.max(0, value));
  const delta = round(next - ing[field]);
  if (Math.abs(delta) < EPS) return;
  await tx
    .update(t.ingredients)
    .set({ [field]: next, updatedAt: new Date() })
    .where(eq(t.ingredients.id, ing.id));
  await tx.insert(t.stockMovements).values({
    ingredientId: ing.id,
    field: field === 'inHand' ? 'in_hand' : 'pipeline',
    delta,
    balanceAfter: next,
    reason,
    ref,
    userId: actor.userId,
  });
  ing[field] = next;
}

// ── Stock (Admin, Warehouse) ────────────────────────────────────────────────

/** ± one supplier pack. */
export async function stepStock(db: Db, actor: Actor, id: string, field: StockField, dir: 1 | -1) {
  requirePerm(actor, 'stock');
  await db.transaction(async (tx) => {
    const ing = await lockIngredient(tx, id);
    await writeStock(tx, actor, ing, field, ing[field] + dir * ing.pack, 'adjust');
  });
}

/** Physical count: set the exact quantity. */
export async function setStock(db: Db, actor: Actor, id: string, field: StockField, value: number) {
  requirePerm(actor, 'stock');
  await db.transaction(async (tx) => {
    const ing = await lockIngredient(tx, id);
    await writeStock(tx, actor, ing, field, value, 'count');
  });
}

// ── Material master data (Admin) ────────────────────────────────────────────

export async function updateMaterial(db: Db, actor: Actor, id: string, patch: { cost?: number; pack?: number; par?: number }) {
  requirePerm(actor, 'setup');
  if (patch.pack != null && patch.pack <= 0) throw new AppError('Pack size must be more than 0.');
  const res = await db
    .update(t.ingredients)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(t.ingredients.id, id))
    .returning({ id: t.ingredients.id });
  if (!res.length) throw new AppError('That material no longer exists.', 'not_found');
}

// ── Spreadsheet import (Admin: everything; Warehouse: stock counts only) ────

/** Apply sheet rows; returns what's needed to undo it. Unknown materials are added for Admins only. */
export async function applyImport(db: Db, actor: Actor, rows: ImportRow[], fileName: string): Promise<{ undo: ImportUndo; updated: number; added: number }> {
  requirePerm(actor, 'stock');
  const canSetup = can(actor, 'setup');
  return db.transaction(async (tx) => {
    const current = await tx.select().from(t.ingredients).for('update');
    const plan = planImport(
      rows,
      current.map((i) => ({ ...i })),
      canSetup,
    );
    if (!plan.changes) throw new AppError('Nothing in that sheet differs from what is already saved.');
    const undo: ImportUndo = { restore: [], remove: [] };

    for (const [id, patch] of plan.patches) {
      const ing = current.find((i) => i.id === id)!;
      const before: ImportUndo['restore'][number]['fields'] = {};
      const master: Partial<Pick<Ingredient, 'cost' | 'pack' | 'par'>> = {};
      for (const k of ['cost', 'pack', 'par'] as const) {
        if (patch[k] == null) continue;
        before[k] = ing[k];
        master[k] = num(patch[k]);
      }
      if (Object.keys(master).length) await tx.update(t.ingredients).set({ ...master, updatedAt: new Date() }).where(eq(t.ingredients.id, id));
      for (const k of ['inHand', 'pipeline'] as const) {
        if (patch[k] == null) continue;
        before[k] = ing[k];
        await writeStock(tx, actor, ing, k, num(patch[k]), 'import', fileName);
      }
      undo.restore.push({ id, fields: before });
    }

    let position = current.reduce((a, i) => Math.max(a, i.position), 0);
    for (const a of plan.adds) {
      const id = await uniqueMaterialId(tx, a.name);
      await tx.insert(t.ingredients).values({
        id,
        name: a.name,
        unit: a.unit,
        kind: a.kind,
        cost: num(a.cost),
        pack: num(a.pack) || 25,
        packName: a.packName,
        par: num(a.par),
        inHand: 0,
        pipeline: 0,
        position: ++position,
      });
      const row = await lockIngredient(tx, id);
      await writeStock(tx, actor, row, 'inHand', num(a.inHand), 'import', fileName);
      await writeStock(tx, actor, row, 'pipeline', num(a.pipeline), 'import', fileName);
      undo.remove.push(id);
    }
    return { undo, updated: plan.count.update, added: plan.count.add };
  });
}

async function uniqueMaterialId(tx: Tx, name: string) {
  const base = 'm-' + (normH(name).replace(/ /g, '-').slice(0, 40) || 'material');
  const taken = new Set((await tx.select({ id: t.ingredients.id }).from(t.ingredients)).map((r) => r.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Undo an import: put changed values back and remove materials it added (if nothing uses them yet). */
export async function revertImport(db: Db, actor: Actor, undo: ImportUndo) {
  requirePerm(actor, 'stock');
  const canSetup = can(actor, 'setup');
  await db.transaction(async (tx) => {
    for (const r of undo.restore) {
      const ing = await lockIngredient(tx, r.id);
      const master: Partial<Pick<Ingredient, 'cost' | 'pack' | 'par'>> = {};
      for (const k of ['cost', 'pack', 'par'] as const) {
        if (r.fields[k] == null) continue;
        if (!canSetup) throw new AppError(`The ${actor.role} role can't change costs, pack sizes or par levels.`, 'forbidden');
        master[k] = r.fields[k];
      }
      if (master.pack != null && master.pack <= 0) throw new AppError('Pack size must be more than 0.');
      if (Object.keys(master).length) await tx.update(t.ingredients).set(master).where(eq(t.ingredients.id, r.id));
      for (const k of ['inHand', 'pipeline'] as const) {
        if (r.fields[k] != null) await writeStock(tx, actor, ing, k, r.fields[k]!, 'import', 'undo');
      }
    }
    if (undo.remove.length) {
      if (!canSetup) throw new AppError(`The ${actor.role} role can't remove materials.`, 'forbidden');
      const [inRecipe] = await tx.select({ id: t.recipeLines.ingredientId }).from(t.recipeLines).where(inArray(t.recipeLines.ingredientId, undo.remove)).limit(1);
      const [onPo] = await tx.select({ id: t.poLines.ingredientId }).from(t.poLines).where(inArray(t.poLines.ingredientId, undo.remove)).limit(1);
      if (inRecipe || onPo) throw new AppError("A material from that import is already used in a recipe or order, so the import can't be undone.", 'conflict');
      await tx.delete(t.ingredients).where(inArray(t.ingredients.id, undo.remove));
    }
  });
}

// ── Recipes (Admin) ─────────────────────────────────────────────────────────

export async function setRecipeQty(db: Db, actor: Actor, productId: string, ingredientId: string, qty: number) {
  requirePerm(actor, 'setup');
  const res = await db
    .update(t.recipeLines)
    .set({ qtyPerBatch: round(qty) })
    .where(and(eq(t.recipeLines.productId, productId), eq(t.recipeLines.ingredientId, ingredientId)))
    .returning({ id: t.recipeLines.productId });
  if (!res.length) throw new AppError('That recipe line no longer exists.', 'not_found');
}

export async function setProductCounts(db: Db, actor: Actor, productId: string, field: 'upb' | 'upc', value: number) {
  requirePerm(actor, 'setup');
  const res = await db
    .update(t.products)
    .set(field === 'upb' ? { unitsPerBatch: value } : { unitsPerCase: value })
    .where(eq(t.products.id, productId))
    .returning({ id: t.products.id });
  if (!res.length) throw new AppError('That product no longer exists.', 'not_found');
}

/** New batch weight; every mix line (not packaging) scales so the recipe percentages stay the same. */
export async function setBatchKg(db: Db, actor: Actor, productId: string, kg: number) {
  requirePerm(actor, 'setup');
  if (kg <= 0) throw new AppError('Batch size must be more than 0 kg.');
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(t.products).where(eq(t.products.id, productId)).for('update');
    if (!p) throw new AppError('That product no longer exists.', 'not_found');
    const k = p.batchKg > 0 ? kg / p.batchKg : 1;
    await tx.update(t.products).set({ batchKg: round(kg) }).where(eq(t.products.id, productId));
    if (Math.abs(k - 1) < EPS) return;
    const mixIds = tx.select({ id: t.ingredients.id }).from(t.ingredients).where(sql`${t.ingredients.kind} <> 'packaging'`);
    await tx
      .update(t.recipeLines)
      .set({ qtyPerBatch: sql`round(${t.recipeLines.qtyPerBatch} * ${k}::numeric, 3)` })
      .where(and(eq(t.recipeLines.productId, productId), inArray(t.recipeLines.ingredientId, mixIds)));
  });
}

// ── Users & access (Admin) ──────────────────────────────────────────────────

export async function approveRequest(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'setup');
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(t.accessRequests)
      .where(and(eq(t.accessRequests.id, id), eq(t.accessRequests.status, 'pending')))
      .for('update');
    if (!r) throw new AppError('That request has already been handled.', 'conflict');
    const [existing] = await tx.select({ id: t.users.id }).from(t.users).where(eq(sql`lower(${t.users.email})`, r.email.toLowerCase()));
    if (existing) throw new AppError(`An account for ${r.email} already exists.`, 'conflict');
    const base = r.email.split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '') || 'user';
    const taken = new Set((await tx.select({ u: t.users.username }).from(t.users)).map((x) => x.u));
    let username = base;
    for (let n = 2; taken.has(username); n++) username = base + n;
    await tx.insert(t.users).values({ id: newId('u'), name: r.name, username, email: r.email, passwordHash: r.passwordHash, role: r.role });
    await tx.update(t.accessRequests).set({ status: 'approved', decidedBy: actor.userId, decidedAt: new Date() }).where(eq(t.accessRequests.id, id));
    return { name: r.name, role: r.role, username };
  });
}

export async function declineRequest(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'setup');
  const [r] = await db
    .update(t.accessRequests)
    .set({ status: 'declined', decidedBy: actor.userId, decidedAt: new Date() })
    .where(and(eq(t.accessRequests.id, id), eq(t.accessRequests.status, 'pending')))
    .returning({ name: t.accessRequests.name });
  if (!r) throw new AppError('That request has already been handled.', 'conflict');
  return r;
}

/** Undo a decline. */
export async function reopenRequest(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'setup');
  await db
    .update(t.accessRequests)
    .set({ status: 'pending', decidedBy: null, decidedAt: null })
    .where(and(eq(t.accessRequests.id, id), eq(t.accessRequests.status, 'declined')));
}

export async function setUserRole(db: Db, actor: Actor, userId: string, role: Role) {
  requirePerm(actor, 'setup');
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(t.users).where(eq(t.users.id, userId)).for('update');
    if (!u || !u.active) throw new AppError('That user no longer exists.', 'not_found');
    if (u.role === 'Admin' && role !== 'Admin') {
      const admins = await tx.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.role, 'Admin'), eq(t.users.active, true)));
      if (admins.length <= 1) throw new AppError('Keep at least one Admin, or nobody can manage users.', 'conflict');
    }
    await tx.update(t.users).set({ role }).where(eq(t.users.id, userId));
    // Their open sessions pick the new role up on the next request; drop any role preview.
    await tx.update(t.sessions).set({ viewRole: null }).where(eq(t.sessions.userId, userId));
  });
}

// ── Production (Admin, Production) ──────────────────────────────────────────

export async function addForecast(db: Db, actor: Actor, input: { productId: string; batches: number; date: string }) {
  requirePerm(actor, 'plan');
  const [p] = await db.select({ id: t.products.id }).from(t.products).where(eq(t.products.id, input.productId));
  if (!p) throw new AppError('That product no longer exists.', 'not_found');
  const id = newId('f');
  await db.insert(t.forecasts).values({ id, productId: input.productId, batches: input.batches, targetDate: input.date, createdBy: actor.userId });
  return { id };
}

export async function removeForecast(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'plan');
  const res = await db
    .update(t.forecasts)
    .set({ deletedAt: new Date() })
    .where(and(eq(t.forecasts.id, id), isNull(t.forecasts.deletedAt)))
    .returning({ id: t.forecasts.id });
  if (!res.length) throw new AppError('That plan was already removed.', 'conflict');
}

export async function restoreForecast(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'plan');
  await db.update(t.forecasts).set({ deletedAt: null }).where(eq(t.forecasts.id, id));
}

/** Record batches actually produced: deduct the recipe from in-hand stock and count the plan down. */
export async function logRun(db: Db, actor: Actor, forecastId: string, batches: number) {
  requirePerm(actor, 'plan');
  return db.transaction(async (tx) => {
    const [f] = await tx
      .select()
      .from(t.forecasts)
      .where(and(eq(t.forecasts.id, forecastId), isNull(t.forecasts.deletedAt)))
      .for('update');
    if (!f || f.batches <= 0) throw new AppError('That plan has no batches left to run.', 'conflict');
    if (batches > f.batches) throw new AppError(`Only ${f.batches} batches are left on that plan.`);
    const lines = await tx.select().from(t.recipeLines).where(eq(t.recipeLines.productId, f.productId));
    for (const l of lines) {
      const ing = await lockIngredient(tx, l.ingredientId);
      if (ing.kind === 'utility') continue;
      const use = l.qtyPerBatch * batches;
      if (ing.inHand + EPS < use) throw new AppError(`Only ${qu(ing.inHand, ing.unit)} of ${ing.name} in hand — receive stock first.`, 'conflict');
      await writeStock(tx, actor, ing, 'inHand', ing.inHand - use, 'production_run', forecastId);
    }
    await tx.update(t.forecasts).set({ batches: f.batches - batches }).where(eq(t.forecasts.id, forecastId));
    await tx.insert(t.productionRuns).values({ forecastId, productId: f.productId, batches, runBy: actor.userId });
    const [p] = await tx.select({ name: t.products.name, upb: t.products.unitsPerBatch }).from(t.products).where(eq(t.products.id, f.productId));
    return { product: p?.name ?? '', units: (p?.upb ?? 0) * batches };
  });
}

// ── Purchasing (everyone raises POs; Admin/Warehouse receive) ───────────────

/**
 * Raise a PO from the current suggestions (deficit vs plans or par, rounded up to whole packs),
 * leaving out materials the user unticked. Quantities are recomputed here, never taken from the client.
 */
export async function generatePO(db: Db, actor: Actor, excluded: string[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(4207001)`);
        const m = buildModel(await loadData(tx as unknown as Db, { all: false }));
        const lines = m.suggestions.filter((s) => !excluded.includes(s.i.id));
        if (!lines.length) throw new AppError('Nothing to order — stock covers every plan and par level.', 'conflict');
        const id = m.nextPoId;
        await tx.insert(t.purchaseOrders).values({ id, status: 'Open', placedOn: plantToday(), createdBy: actor.userId });
        await tx.insert(t.poLines).values(lines.map((s, position) => ({ poId: id, ingredientId: s.i.id, packs: s.packs, qty: s.qty, position })));
        for (const s of lines) {
          const ing = await lockIngredient(tx, s.i.id);
          await writeStock(tx, actor, ing, 'pipeline', ing.pipeline + s.qty, 'po_created', id);
        }
        return { id, lines: lines.length };
      });
    } catch (e) {
      if (attempt < 2 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

/** Delivery arrived: move each line from pipeline into in-hand. */
export async function receivePO(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'receive');
  await db.transaction(async (tx) => {
    const [po] = await tx.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, id)).for('update');
    if (!po) throw new AppError('That order no longer exists.', 'not_found');
    if (po.status !== 'Open') throw new AppError(`${id} was already received.`, 'conflict');
    const lines = await tx.select().from(t.poLines).where(eq(t.poLines.poId, id));
    for (const l of lines) {
      const ing = await lockIngredient(tx, l.ingredientId);
      await writeStock(tx, actor, ing, 'inHand', ing.inHand + l.qty, 'po_received', id);
      await writeStock(tx, actor, ing, 'pipeline', ing.pipeline - l.qty, 'po_received', id);
    }
    await tx.update(t.purchaseOrders).set({ status: 'Received', receivedOn: plantToday(), receivedBy: actor.userId }).where(eq(t.purchaseOrders.id, id));
  });
}

// ── Accounts ────────────────────────────────────────────────────────────────

const GENERIC_LOGIN_ERROR = 'Incorrect username or password.';

/** Check credentials. Same message for unknown user and wrong password. */
export async function authenticate(db: Db, login: string, password: string) {
  const q = login.trim().toLowerCase();
  const [u] = await db
    .select()
    .from(t.users)
    .where(and(eq(t.users.active, true), or(eq(sql`lower(${t.users.username})`, q), eq(sql`lower(${t.users.email})`, q))));
  if (u && (await verifyPassword(password, u.passwordHash))) return u;
  if (!u) {
    // Spend comparable time so response timing doesn't reveal which usernames exist.
    await verifyPassword(password, DUMMY_HASH);
    const [pending] = await db
      .select({ id: t.accessRequests.id })
      .from(t.accessRequests)
      .where(and(eq(t.accessRequests.status, 'pending'), eq(sql`lower(${t.accessRequests.email})`, q)));
    if (pending) throw new AppError('Your access request is still waiting for an Admin to approve it.', 'forbidden', { user: 'Waiting for approval.' });
  }
  throw new AppError(GENERIC_LOGIN_ERROR, 'invalid', { pass: GENERIC_LOGIN_ERROR });
}

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

export async function requestAccess(db: Db, input: { name: string; email: string; role: Role; password: string }) {
  const email = input.email.trim().toLowerCase();
  const [user] = await db.select({ id: t.users.id }).from(t.users).where(eq(sql`lower(${t.users.email})`, email));
  const [req] = await db
    .select({ id: t.accessRequests.id })
    .from(t.accessRequests)
    .where(and(eq(t.accessRequests.status, 'pending'), eq(sql`lower(${t.accessRequests.email})`, email)));
  if (user || req) throw new AppError('An account or request already exists for this email.', 'conflict', { email: 'An account or request already exists for this email.' });
  await db.insert(t.accessRequests).values({ id: newId('r'), name: input.name.trim(), email, role: input.role, passwordHash: await hashPassword(input.password) });
  return { email };
}

