/**
 * Business rules for every change the app can make. Each function takes the database,
 * the acting user and validated input, enforces role permissions, keeps every read and
 * write inside the actor's organization, and throws AppError with a user-facing message
 * when a change isn't allowed.
 */
import { and, count, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { newId } from '@/db/ids';
import * as t from '@/db/schema';
import { clearContent, insertSampleContent, sampleDataEnabled } from '@/db/seed';
import type { ImportUndo } from '@/lib/api';
import { num, qu, round } from '@/lib/format';
import { planImport, type ImportRow } from '@/lib/import-plan';
import { buildModel } from '@/lib/mrp';
import { normBatchNo } from '@/lib/production';
import type { MaterialKind, Role } from '@/lib/types';
import { can, plantToday, requirePerm, type Actor } from './actor';
import { AppError, isUniqueViolation } from './errors';
import { hashPassword, verifyPassword } from './password';
import { loadData } from './snapshot';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Ingredient = typeof t.ingredients.$inferSelect;
export type StockField = 'inHand' | 'pipeline';
type Reason = (typeof t.movementReasonEnum.enumValues)[number];

const EPS = 1e-9;

async function lockIngredient(tx: Tx, actor: Actor, id: string): Promise<Ingredient> {
  const [row] = await tx
    .select()
    .from(t.ingredients)
    .where(and(eq(t.ingredients.id, id), eq(t.ingredients.organizationId, actor.organizationId)))
    .for('update');
  if (!row) throw new AppError('That material no longer exists.', 'not_found');
  return row;
}

async function ownProduct(db: Db | Tx, actor: Actor, id: string, lock = false) {
  const q = db
    .select()
    .from(t.products)
    .where(and(eq(t.products.id, id), eq(t.products.organizationId, actor.organizationId)));
  const [p] = lock ? await q.for('update') : await q;
  if (!p) throw new AppError('That product no longer exists.', 'not_found');
  return p;
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
    organizationId: actor.organizationId,
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

// ── Organization & accounts ─────────────────────────────────────────────────

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

async function assertLoginFree(db: Db | Tx, username: string, email: string | null) {
  const [u] = await db
    .select({ username: t.users.username, email: t.users.email })
    .from(t.users)
    .where(or(eq(t.users.username, username), ...(email ? [eq(sql`lower(${t.users.email})`, email)] : [])));
  if (!u) return;
  if (u.username === username) throw new AppError('That username is taken.', 'conflict', { username: 'That username is taken. Try another.' });
  throw new AppError('An account with that email already exists.', 'conflict', { email: 'An account with that email already exists.' });
}

/**
 * Anyone can start a new organization; they become its owner (an Admin who can't be removed)
 * and create everyone else's accounts from Team. Optionally starts with the sample plant data.
 */
export async function createOrganization(
  db: Db,
  input: { orgName: string; name: string; email: string; username: string; password: string; sample: boolean },
) {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  await assertLoginFree(db, username, email);
  const organizationId = newId('org');
  const userId = newId('usr');
  const passwordHash = await hashPassword(input.password);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(t.organizations).values({ id: organizationId, name: input.orgName.trim() });
      await tx.insert(t.users).values({ id: userId, organizationId, name: input.name.trim(), username, email, passwordHash, role: 'Admin', isOwner: true });
      if (input.sample) await insertSampleContent(tx, organizationId, () => userId);
    });
  } catch (e) {
    if (isUniqueViolation(e)) await assertLoginFree(db, username, email);
    throw e;
  }
  return { userId, name: input.name.trim() };
}

export async function renameOrganization(db: Db, actor: Actor, name: string) {
  requirePerm(actor, 'setup');
  await db.update(t.organizations).set({ name: name.trim() }).where(eq(t.organizations.id, actor.organizationId));
}

/** Largest logo accepted, as a data: URL. The browser resizes to 256 px first, so real logos are far smaller. */
export const MAX_LOGO_CHARS = 400_000;
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Set the organization's logo (a data: URL), or remove it with null. */
export async function setOrganizationLogo(db: Db, actor: Actor, logo: string | null) {
  requirePerm(actor, 'setup');
  if (logo !== null && (logo.length > MAX_LOGO_CHARS || !LOGO_RE.test(logo))) {
    throw new AppError('Use a PNG, JPG or WebP image under 300 KB.', 'invalid');
  }
  await db
    .update(t.organizations)
    .set({ logo, logoUpdatedAt: logo ? new Date() : null })
    .where(eq(t.organizations.id, actor.organizationId));
}

/** Development (or demo mode): swap the organization's materials, recipes, plans and POs for the sample plant. */
export async function replaceWithSample(db: Db, actor: Actor) {
  if (!sampleDataEnabled()) throw new AppError('Sample data is turned off on this server.', 'forbidden');
  if (!actor.isOwner) throw new AppError('Only the organization owner can replace all data.', 'forbidden');
  await db.transaction(async (tx) => {
    await clearContent(tx, actor.organizationId);
    await insertSampleContent(tx, actor.organizationId, () => actor.userId);
  });
}

const GENERIC_LOGIN_ERROR = 'Incorrect username or password.';
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

/** Check credentials. Same message for unknown user and wrong password. */
export async function authenticate(db: Db, login: string, password: string) {
  const q = login.trim().toLowerCase();
  const [u] = await db
    .select()
    .from(t.users)
    .where(and(eq(t.users.active, true), or(eq(t.users.username, q), eq(sql`lower(${t.users.email})`, q))));
  if (u && (await verifyPassword(password, u.passwordHash))) return u;
  // Spend comparable time so response timing doesn't reveal which usernames exist.
  if (!u) await verifyPassword(password, DUMMY_HASH);
  throw new AppError(GENERIC_LOGIN_ERROR, 'invalid', { pass: GENERIC_LOGIN_ERROR });
}

export async function changeOwnPassword(db: Db, actor: Actor, current: string, next: string) {
  const [u] = await db.select().from(t.users).where(eq(t.users.id, actor.userId));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new AppError('Your current password is not right.', 'invalid', { current: 'That is not your current password.' });
  await db.update(t.users).set({ passwordHash: await hashPassword(next) }).where(eq(t.users.id, actor.userId));
  // Sign out the account's other devices.
  await db.delete(t.sessions).where(and(eq(t.sessions.userId, actor.userId), ne(t.sessions.id, actor.sessionId)));
}

// ── Team (Admins manage accounts) ───────────────────────────────────────────

async function ownMember(tx: Db | Tx, actor: Actor, userId: string) {
  const [u] = await tx
    .select()
    .from(t.users)
    .where(and(eq(t.users.id, userId), eq(t.users.organizationId, actor.organizationId), eq(t.users.active, true)));
  if (!u) throw new AppError('That person is no longer on the team.', 'not_found');
  return u;
}

export async function createMember(db: Db, actor: Actor, input: { name: string; username: string; email: string | null; role: Role; password: string }) {
  requirePerm(actor, 'setup');
  const username = input.username.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase() || null;
  await assertLoginFree(db, username, email);
  try {
    await db.insert(t.users).values({
      id: newId('usr'),
      organizationId: actor.organizationId,
      name: input.name.trim(),
      username,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdBy: actor.userId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) await assertLoginFree(db, username, email);
    throw e;
  }
  return { name: input.name.trim(), username, role: input.role };
}

export async function setMemberRole(db: Db, actor: Actor, userId: string, role: Role) {
  requirePerm(actor, 'setup');
  await db.transaction(async (tx) => {
    const u = await ownMember(tx, actor, userId);
    if (u.isOwner && role !== 'Admin') throw new AppError('The organization owner is always an Admin.', 'conflict');
    if (u.id === actor.userId && role !== 'Admin') throw new AppError("You can't take Admin away from yourself. Ask another Admin.", 'conflict');
    // Their open sessions pick the new role up on their next request.
    await tx.update(t.users).set({ role }).where(eq(t.users.id, userId));
  });
}

/** Change someone's display name or email. Only the owner edits the owner's details. */
export async function updateMember(db: Db, actor: Actor, userId: string, input: { name: string; email: string | null }) {
  requirePerm(actor, 'setup');
  const u = await ownMember(db, actor, userId);
  if (u.isOwner && !actor.isOwner) throw new AppError("Only the owner can change the owner's details.", 'forbidden');
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const [taken] = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(eq(sql`lower(${t.users.email})`, email), ne(t.users.id, userId)));
    if (taken) throw new AppError('An account with that email already exists.', 'conflict', { email: 'An account with that email already exists.' });
  }
  try {
    await db.update(t.users).set({ name, email }).where(eq(t.users.id, userId));
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('An account with that email already exists.', 'conflict', { email: 'An account with that email already exists.' });
    throw e;
  }
  return { name };
}

export async function resetMemberPassword(db: Db, actor: Actor, userId: string, password: string) {
  requirePerm(actor, 'setup');
  const u = await ownMember(db, actor, userId);
  if (u.isOwner && !actor.isOwner) throw new AppError("Only the owner can reset the owner's password.", 'forbidden');
  await db.update(t.users).set({ passwordHash: await hashPassword(password) }).where(eq(t.users.id, userId));
  if (u.id !== actor.userId) await db.delete(t.sessions).where(eq(t.sessions.userId, userId));
  return { name: u.name };
}

/** Take someone off the team: they can't sign in any more; their history stays. */
export async function removeMember(db: Db, actor: Actor, userId: string) {
  requirePerm(actor, 'setup');
  const u = await ownMember(db, actor, userId);
  if (u.isOwner) throw new AppError("The organization owner can't be removed.", 'conflict');
  if (u.id === actor.userId) throw new AppError("You can't remove yourself.", 'conflict');
  // Free the username and email so they can be used again.
  const tomb = `removed.${u.id}`;
  await db.update(t.users).set({ active: false, username: tomb, email: null }).where(eq(t.users.id, userId));
  await db.delete(t.sessions).where(eq(t.sessions.userId, userId));
  return { name: u.name };
}

// ── Stock (Admin, Warehouse) ────────────────────────────────────────────────

/** ± one supplier pack. */
export async function stepStock(db: Db, actor: Actor, id: string, field: StockField, dir: 1 | -1) {
  requirePerm(actor, 'stock');
  await db.transaction(async (tx) => {
    const ing = await lockIngredient(tx, actor, id);
    await writeStock(tx, actor, ing, field, ing[field] + dir * ing.pack, 'adjust');
  });
}

/** Physical count: set the exact quantity. */
export async function setStock(db: Db, actor: Actor, id: string, field: StockField, value: number) {
  requirePerm(actor, 'stock');
  await db.transaction(async (tx) => {
    const ing = await lockIngredient(tx, actor, id);
    await writeStock(tx, actor, ing, field, value, 'count');
  });
}

// ── Materials (Admin) ───────────────────────────────────────────────────────

export interface MaterialInput {
  name: string;
  kind: MaterialKind;
  unit: string;
  packName: string;
  pack: number;
  cost: number;
  par: number;
}

export async function addMaterial(db: Db, actor: Actor, input: MaterialInput) {
  requirePerm(actor, 'setup');
  if (input.pack <= 0) throw new AppError('Pack size must be more than 0.', 'invalid', { pack: 'Must be more than 0.' });
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${t.ingredients.position}), -1)` })
    .from(t.ingredients)
    .where(eq(t.ingredients.organizationId, actor.organizationId));
  const id = newId('ing');
  try {
    await db.insert(t.ingredients).values({ id, organizationId: actor.organizationId, ...input, name: input.name.trim(), position: Number(max) + 1 });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('A material with that name already exists.', 'conflict', { name: 'Already exists.' });
    throw e;
  }
  return { id };
}

export type MaterialPatch = Partial<MaterialInput>;

export async function updateMaterial(db: Db, actor: Actor, id: string, patch: MaterialPatch) {
  requirePerm(actor, 'setup');
  if (patch.pack != null && patch.pack <= 0) throw new AppError('Pack size must be more than 0.');
  const clean = { ...patch, ...(patch.name != null ? { name: patch.name.trim() } : {}) };
  try {
    const res = await db
      .update(t.ingredients)
      .set({ ...clean, updatedAt: new Date() })
      .where(and(eq(t.ingredients.id, id), eq(t.ingredients.organizationId, actor.organizationId)))
      .returning({ id: t.ingredients.id });
    if (!res.length) throw new AppError('That material no longer exists.', 'not_found');
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(`A material called "${clean.name}" already exists.`, 'conflict');
    throw e;
  }
}

/** Only materials that no recipe or purchase order uses can be deleted. */
export async function deleteMaterial(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'setup');
  await db.transaction(async (tx) => {
    const ing = await lockIngredient(tx, actor, id);
    const [{ value: inRecipes }] = await tx.select({ value: count() }).from(t.recipeLines).where(eq(t.recipeLines.ingredientId, id));
    if (inRecipes) throw new AppError(`${ing.name} is used in ${inRecipes} recipe${inRecipes === 1 ? '' : 's'}. Remove it there first.`, 'conflict');
    const [{ value: onPos }] = await tx.select({ value: count() }).from(t.poLines).where(eq(t.poLines.ingredientId, id));
    if (onPos) throw new AppError(`${ing.name} appears on purchase orders, so it is kept for the record.`, 'conflict');
    await tx.delete(t.ingredients).where(eq(t.ingredients.id, id));
  });
}

// ── Spreadsheet import (Admin: everything; Warehouse: stock counts only) ────

/** Apply sheet rows; returns what's needed to undo it. Unknown materials are added for Admins only. */
export async function applyImport(db: Db, actor: Actor, rows: ImportRow[], fileName: string): Promise<{ undo: ImportUndo; updated: number; added: number }> {
  requirePerm(actor, 'stock');
  const canSetup = can(actor, 'setup');
  return db.transaction(async (tx) => {
    const current = await tx.select().from(t.ingredients).where(eq(t.ingredients.organizationId, actor.organizationId)).for('update');
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

    let position = current.reduce((a, i) => Math.max(a, i.position), -1);
    for (const a of plan.adds) {
      const id = newId('ing');
      await tx.insert(t.ingredients).values({
        id,
        organizationId: actor.organizationId,
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
      const row = await lockIngredient(tx, actor, id);
      await writeStock(tx, actor, row, 'inHand', num(a.inHand), 'import', fileName);
      await writeStock(tx, actor, row, 'pipeline', num(a.pipeline), 'import', fileName);
      undo.remove.push(id);
    }
    return { undo, updated: plan.count.update, added: plan.count.add };
  });
}

/** Undo an import: put changed values back and remove materials it added (if nothing uses them yet). */
export async function revertImport(db: Db, actor: Actor, undo: ImportUndo) {
  requirePerm(actor, 'stock');
  const canSetup = can(actor, 'setup');
  await db.transaction(async (tx) => {
    for (const r of undo.restore) {
      const ing = await lockIngredient(tx, actor, r.id);
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
      const owned = await tx
        .select({ id: t.ingredients.id })
        .from(t.ingredients)
        .where(and(inArray(t.ingredients.id, undo.remove), eq(t.ingredients.organizationId, actor.organizationId)));
      const ids = owned.map((r) => r.id);
      if (!ids.length) return;
      const [inRecipe] = await tx.select({ id: t.recipeLines.ingredientId }).from(t.recipeLines).where(inArray(t.recipeLines.ingredientId, ids)).limit(1);
      const [onPo] = await tx.select({ id: t.poLines.ingredientId }).from(t.poLines).where(inArray(t.poLines.ingredientId, ids)).limit(1);
      if (inRecipe || onPo) throw new AppError("A material from that import is already used in a recipe or order, so the import can't be undone.", 'conflict');
      await tx.delete(t.ingredients).where(inArray(t.ingredients.id, ids));
    }
  });
}

// ── Products & recipes (Admin) ──────────────────────────────────────────────

export async function addProduct(db: Db, actor: Actor, input: { name: string; batchKg: number; upb: number; upc: number }) {
  requirePerm(actor, 'setup');
  if (input.batchKg <= 0) throw new AppError('Batch size must be more than 0 kg.', 'invalid', { batchKg: 'Must be more than 0.' });
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${t.products.position}), -1)` })
    .from(t.products)
    .where(eq(t.products.organizationId, actor.organizationId));
  const id = newId('prd');
  try {
    await db.insert(t.products).values({
      id,
      organizationId: actor.organizationId,
      name: input.name.trim(),
      batchKg: round(input.batchKg),
      unitsPerBatch: input.upb,
      unitsPerCase: Math.max(1, input.upc),
      position: Number(max) + 1,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('A product with that name already exists.', 'conflict', { name: 'Already exists.' });
    throw e;
  }
  return { id };
}

export async function renameProduct(db: Db, actor: Actor, id: string, name: string) {
  requirePerm(actor, 'setup');
  await ownProduct(db, actor, id);
  try {
    await db.update(t.products).set({ name: name.trim() }).where(eq(t.products.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(`A product called "${name.trim()}" already exists.`, 'conflict');
    throw e;
  }
}

/** Deletes the product with its recipe, plans and run history. */
export async function deleteProduct(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'setup');
  const p = await ownProduct(db, actor, id);
  await db.delete(t.products).where(eq(t.products.id, p.id));
  return { name: p.name };
}

export async function addRecipeLine(db: Db, actor: Actor, productId: string, ingredientId: string, qty: number) {
  requirePerm(actor, 'setup');
  await db.transaction(async (tx) => {
    await ownProduct(tx, actor, productId);
    await lockIngredient(tx, actor, ingredientId);
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${t.recipeLines.position}), -1)` })
      .from(t.recipeLines)
      .where(eq(t.recipeLines.productId, productId));
    try {
      await tx.insert(t.recipeLines).values({ productId, ingredientId, qtyPerBatch: round(qty), position: Number(max) + 1 });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('That material is already in this recipe.', 'conflict');
      throw e;
    }
  });
}

export async function removeRecipeLine(db: Db, actor: Actor, productId: string, ingredientId: string) {
  requirePerm(actor, 'setup');
  await ownProduct(db, actor, productId);
  await db.delete(t.recipeLines).where(and(eq(t.recipeLines.productId, productId), eq(t.recipeLines.ingredientId, ingredientId)));
}

export async function setRecipeQty(db: Db, actor: Actor, productId: string, ingredientId: string, qty: number) {
  requirePerm(actor, 'setup');
  await ownProduct(db, actor, productId);
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
    .where(and(eq(t.products.id, productId), eq(t.products.organizationId, actor.organizationId)))
    .returning({ id: t.products.id });
  if (!res.length) throw new AppError('That product no longer exists.', 'not_found');
}

/** New batch weight; every mix line (not packaging) scales so the recipe percentages stay the same. */
export async function setBatchKg(db: Db, actor: Actor, productId: string, kg: number) {
  requirePerm(actor, 'setup');
  if (kg <= 0) throw new AppError('Batch size must be more than 0 kg.');
  await db.transaction(async (tx) => {
    const p = await ownProduct(tx, actor, productId, true);
    const k = p.batchKg > 0 ? kg / p.batchKg : 1;
    await tx.update(t.products).set({ batchKg: round(kg) }).where(eq(t.products.id, productId));
    if (Math.abs(k - 1) < EPS) return;
    const mixIds = tx
      .select({ id: t.ingredients.id })
      .from(t.ingredients)
      .where(and(eq(t.ingredients.organizationId, actor.organizationId), sql`${t.ingredients.kind} <> 'packaging'`));
    await tx
      .update(t.recipeLines)
      .set({ qtyPerBatch: sql`round(${t.recipeLines.qtyPerBatch} * ${k}::numeric, 3)` })
      .where(and(eq(t.recipeLines.productId, productId), inArray(t.recipeLines.ingredientId, mixIds)));
  });
}

// ── Production (Admin, Production) ──────────────────────────────────────────

async function ownForecast(tx: Db | Tx, actor: Actor, id: string, lock = false) {
  const q = tx
    .select()
    .from(t.forecasts)
    .where(and(eq(t.forecasts.id, id), eq(t.forecasts.organizationId, actor.organizationId)));
  const [f] = lock ? await q.for('update') : await q;
  return f;
}

export async function addForecast(db: Db, actor: Actor, input: { productId: string; batches: number; date: string }) {
  requirePerm(actor, 'plan');
  await ownProduct(db, actor, input.productId);
  const id = newId('fc');
  await db.insert(t.forecasts).values({
    id,
    organizationId: actor.organizationId,
    productId: input.productId,
    batches: input.batches,
    targetDate: input.date,
    createdBy: actor.userId,
  });
  return { id };
}

export async function removeForecast(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'plan');
  const res = await db
    .update(t.forecasts)
    .set({ deletedAt: new Date() })
    .where(and(eq(t.forecasts.id, id), eq(t.forecasts.organizationId, actor.organizationId), isNull(t.forecasts.deletedAt)))
    .returning({ id: t.forecasts.id });
  if (!res.length) throw new AppError('That plan was already removed.', 'conflict');
}

export async function restoreForecast(db: Db, actor: Actor, id: string) {
  requirePerm(actor, 'plan');
  await db
    .update(t.forecasts)
    .set({ deletedAt: null })
    .where(and(eq(t.forecasts.id, id), eq(t.forecasts.organizationId, actor.organizationId)));
}

export interface BatchInput {
  batchNo: string;
  /** YYYY-MM-DD the batch was made. */
  date: string;
  actualKg: number;
  units: number;
  cases: number;
  notes?: string;
}

function checkBatchFigures(input: BatchInput) {
  if (input.date > plantToday()) throw new AppError("The production date can't be in the future.", 'invalid', { date: "Can't be in the future." });
  if (!(input.actualKg > 0)) throw new AppError('Enter the kg actually produced.', 'invalid', { actualKg: 'Must be more than 0.' });
}

async function assertBatchNoFree(tx: Db | Tx, actor: Actor, batchNo: string, exceptId?: string) {
  const [dupe] = await tx
    .select({ id: t.productionBatches.id })
    .from(t.productionBatches)
    .where(
      and(
        eq(t.productionBatches.organizationId, actor.organizationId),
        eq(t.productionBatches.batchNo, batchNo),
        ...(exceptId ? [ne(t.productionBatches.id, exceptId)] : []),
      ),
    );
  if (dupe) throw new AppError(`Batch number ${batchNo} is already used.`, 'conflict', { batchNo: 'Already used — each batch needs its own number.' });
}

/**
 * Record one batch made (Production / Admin): its own batch number and date, what came out
 * (kg, units, cases), deduct one batch of the recipe from in-hand stock, fix its material cost,
 * and count the linked plan down by one.
 */
export async function logBatch(db: Db, actor: Actor, input: BatchInput & { productId: string; forecastId?: string | null }) {
  requirePerm(actor, 'plan');
  checkBatchFigures(input);
  const batchNo = normBatchNo(input.batchNo);
  try {
    return await db.transaction(async (tx) => {
      const p = await ownProduct(tx, actor, input.productId);
      await assertBatchNoFree(tx, actor, batchNo);
      if (input.forecastId) {
        const f = await ownForecast(tx, actor, input.forecastId, true);
        if (!f || f.deletedAt || f.batches <= 0) throw new AppError('That plan has no batches left to run.', 'conflict');
        if (f.productId !== p.id) throw new AppError("That plan is for a different product.");
        await tx.update(t.forecasts).set({ batches: f.batches - 1 }).where(eq(t.forecasts.id, f.id));
      }
      const lines = await tx.select().from(t.recipeLines).where(eq(t.recipeLines.productId, p.id));
      if (!lines.length) throw new AppError(`${p.name} has no recipe yet, so there's nothing to deduct. Add its recipe in Setup first.`, 'conflict');
      let materialCost = 0;
      for (const l of lines) {
        const ing = await lockIngredient(tx, actor, l.ingredientId);
        materialCost += l.qtyPerBatch * ing.cost;
        if (ing.kind === 'utility') continue;
        if (ing.inHand + EPS < l.qtyPerBatch)
          throw new AppError(`Only ${qu(ing.inHand, ing.unit)} of ${ing.name} in hand — receive stock first.`, 'conflict');
        await writeStock(tx, actor, ing, 'inHand', ing.inHand - l.qtyPerBatch, 'production_run', batchNo);
      }
      await tx.insert(t.productionBatches).values({
        id: newId('bat'),
        organizationId: actor.organizationId,
        batchNo,
        producedOn: input.date,
        productId: p.id,
        forecastId: input.forecastId ?? null,
        plannedKg: p.batchKg,
        actualKg: round(input.actualKg),
        units: input.units,
        cases: input.cases,
        materialCost: Math.round(materialCost * 100) / 100,
        notes: input.notes?.trim() || null,
        createdBy: actor.userId,
      });
      return { batchNo, product: p.name };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(`Batch number ${batchNo} is already used.`, 'conflict', { batchNo: 'Already used — each batch needs its own number.' });
    throw e;
  }
}

/** Correct a batch record (number, date, kg, units, cases, notes). Stock isn't touched. */
export async function updateBatch(db: Db, actor: Actor, id: string, input: BatchInput) {
  requirePerm(actor, 'plan');
  checkBatchFigures(input);
  const batchNo = normBatchNo(input.batchNo);
  try {
    return await db.transaction(async (tx) => {
      const [b] = await tx
        .select()
        .from(t.productionBatches)
        .where(and(eq(t.productionBatches.id, id), eq(t.productionBatches.organizationId, actor.organizationId)))
        .for('update');
      if (!b) throw new AppError('That batch no longer exists.', 'not_found');
      await assertBatchNoFree(tx, actor, batchNo, id);
      await tx
        .update(t.productionBatches)
        .set({ batchNo, producedOn: input.date, actualKg: round(input.actualKg), units: input.units, cases: input.cases, notes: input.notes?.trim() || null, updatedAt: new Date() })
        .where(eq(t.productionBatches.id, id));
      return { batchNo };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError(`Batch number ${batchNo} is already used.`, 'conflict', { batchNo: 'Already used — each batch needs its own number.' });
    throw e;
  }
}

// ── Purchasing (everyone raises POs; Admin/Warehouse receive) ───────────────

export interface PoLineInput {
  ingredientId: string;
  /** Whole supplier packs; the quantity is always packs × the material's pack size. */
  packs: number;
}

/**
 * Raise a purchase order with any materials and pack counts the user chose, suggested or not.
 * Quantities and costs come from each material's saved pack size, never from the client.
 */
export async function createPO(db: Db, actor: Actor, input: PoLineInput[]) {
  const packsById = new Map<string, number>();
  for (const l of input) {
    if (!Number.isInteger(l.packs) || l.packs < 1) throw new AppError('Order at least one whole pack per line.');
    packsById.set(l.ingredientId, (packsById.get(l.ingredientId) ?? 0) + l.packs);
  }
  if (!packsById.size) throw new AppError('Add at least one material to the order.');

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'po:' + actor.organizationId}))`);
        const m = buildModel(await loadData(tx as unknown as Db, actor.organizationId, { all: false }));
        const code = m.nextPoId;
        const id = newId('po');
        const rows: { ing: Ingredient; packs: number; qty: number }[] = [];
        for (const [ingredientId, packs] of packsById) {
          const ing = await lockIngredient(tx, actor, ingredientId);
          if (ing.kind === 'utility') throw new AppError(`${ing.name} is a utility and isn't ordered.`);
          rows.push({ ing, packs, qty: round(packs * ing.pack) });
        }
        await tx.insert(t.purchaseOrders).values({ id, organizationId: actor.organizationId, code, status: 'Open', placedOn: plantToday(), createdBy: actor.userId });
        await tx.insert(t.poLines).values(rows.map((r, position) => ({ poId: id, ingredientId: r.ing.id, packs: r.packs, qty: r.qty, position })));
        for (const r of rows) await writeStock(tx, actor, r.ing, 'pipeline', r.ing.pipeline + r.qty, 'po_created', code);
        return { id: code, lines: rows.length };
      });
    } catch (e) {
      if (attempt < 2 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

/**
 * Raise a PO straight from the current suggestions (deficit vs plans or par, rounded up to
 * whole packs), leaving out the given materials.
 */
export async function generatePO(db: Db, actor: Actor, excluded: string[]) {
  const m = buildModel(await loadData(db, actor.organizationId, { all: false }));
  const lines = m.suggestions.filter((s) => !excluded.includes(s.i.id));
  if (!lines.length) throw new AppError('Nothing to order — stock covers every plan and par level.', 'conflict');
  return createPO(
    db,
    actor,
    lines.map((s) => ({ ingredientId: s.i.id, packs: s.packs })),
  );
}

/** Delivery arrived: move each line from pipeline into in-hand. `code` is the PO number, e.g. PO-2041. */
export async function receivePO(db: Db, actor: Actor, code: string) {
  requirePerm(actor, 'receive');
  await db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(and(eq(t.purchaseOrders.code, code), eq(t.purchaseOrders.organizationId, actor.organizationId)))
      .for('update');
    if (!po) throw new AppError('That order no longer exists.', 'not_found');
    if (po.status !== 'Open') throw new AppError(`${code} was already received.`, 'conflict');
    const lines = await tx.select().from(t.poLines).where(eq(t.poLines.poId, po.id));
    for (const l of lines) {
      const ing = await lockIngredient(tx, actor, l.ingredientId);
      await writeStock(tx, actor, ing, 'inHand', ing.inHand + l.qty, 'po_received', code);
      await writeStock(tx, actor, ing, 'pipeline', ing.pipeline - l.qty, 'po_received', code);
    }
    await tx.update(t.purchaseOrders).set({ status: 'Received', receivedOn: plantToday(), receivedBy: actor.userId }).where(eq(t.purchaseOrders.id, po.id));
  });
}
