'use server';

/**
 * Every write the app makes. Each action validates its input, resolves the signed-in user
 * from the session cookie, runs the business rule in server/services.ts (which checks the
 * role), and returns a fresh snapshot so the client can reconcile its optimistic state.
 */
import { z } from 'zod';
import { getDb, type Db } from '@/db';
import type { ActionResult, ImportUndo, Snapshot } from '@/lib/api';
import { EMAIL_RE } from '@/lib/format';
import { MATERIAL_KINDS } from '@/lib/types';
import { ROLES } from '@/lib/roles';
import type { Actor } from '@/server/actor';
import { AppError } from '@/server/errors';
import * as svc from '@/server/services';
import { USERNAME_RE } from '@/server/services';
import { createSession, destroySession, getActor } from '@/server/session';
import { loadSnapshot } from '@/server/snapshot';

// ── Input schemas ───────────────────────────────────────────────────────────

const Id = z.string().min(1).max(120);
const Qty = z.number().finite().min(0).max(1e9);
const Count = z.number().int().min(0).max(1e6);
const Field = z.enum(['inHand', 'pipeline']);
const RoleZ = z.enum(ROLES as [string, ...string[]]).transform((r) => r as (typeof ROLES)[number]);
const Name = z.string().trim().min(1, 'This field is required.').max(120);
const Email = z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.').max(200);
const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, '3–32 characters: letters, numbers, dot, dash or underscore.');
const Password = z.string().min(8, 'Use at least 8 characters.').max(200);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.');
const ImportRows = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(150),
      cost: Qty.optional(),
      pack: Qty.optional(),
      inHand: Qty.optional(),
      pipeline: Qty.optional(),
      par: Qty.optional(),
    }),
  )
  .min(1)
  .max(5000);
const Undo = z.object({
  restore: z
    .array(
      z.object({
        id: Id,
        fields: z.object({ cost: Qty.optional(), pack: Qty.optional(), par: Qty.optional(), inHand: Qty.optional(), pipeline: Qty.optional() }),
      }),
    )
    .max(5000),
  remove: z.array(Id).max(5000),
});

// ── Plumbing ────────────────────────────────────────────────────────────────

const SIGNED_OUT: ActionResult<never> = { ok: false, error: 'Your session has ended. Sign in again.', signedOut: true };

function fail(e: unknown): ActionResult<never> {
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "That input wasn't valid." };
  console.error('[stockops] action failed', e);
  return { ok: false, error: 'Something went wrong saving that. Try again.' };
}

/** Authenticated action: run, then return the caller's fresh snapshot. */
async function act<T>(fn: (db: Db, actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const db = await getDb();
    const actor = await getActor(db);
    if (!actor) return SIGNED_OUT;
    const value = await fn(db, actor);
    // Re-read the actor: the action may have changed the caller's own role.
    const after = (await getActor(db)) ?? actor;
    return { ok: true, value, snapshot: await loadSnapshot(db, after) };
  } catch (e) {
    return fail(e);
  }
}

// ── Accounts ────────────────────────────────────────────────────────────────

export async function signIn(login: string, password: string): Promise<ActionResult<{ name: string; role: string }>> {
  try {
    const input = z.object({ login: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) }).safeParse({ login, password });
    if (!input.success) return { ok: false, error: 'Enter your username and password.' };
    const db = await getDb();
    const user = await svc.authenticate(db, input.data.login, input.data.password);
    await createSession(db, user.id);
    return { ok: true, value: { name: user.name, role: user.role }, snapshot: null };
  } catch (e) {
    return fail(e);
  }
}

export async function signOut(): Promise<ActionResult> {
  try {
    await destroySession(await getDb());
    return { ok: true, value: null, snapshot: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Password reset by email needs a mail provider, which isn't configured yet.
 * The response never reveals whether an account exists; an Admin resets passwords from the Team screen.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!EMAIL_RE.test(String(email ?? '').trim())) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, value: null, snapshot: null };
}

/** Validation errors keyed by field, for forms. */
function fieldFail(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: 'Check the highlighted fields.', fieldErrors: Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message])) };
}

/** Start a new organization; the creator becomes its owner and is signed in. */
export async function createOrganization(form: {
  orgName: string;
  name: string;
  email: string;
  username: string;
  password: string;
  sample: boolean;
}): Promise<ActionResult<{ name: string }>> {
  const parsed = z.object({ orgName: Name, name: Name, email: Email, username: Username, password: Password, sample: z.boolean() }).safeParse(form);
  if (!parsed.success) return fieldFail(parsed.error);
  try {
    const db = await getDb();
    const owner = await svc.createOrganization(db, parsed.data);
    await createSession(db, owner.userId);
    return { ok: true, value: { name: owner.name }, snapshot: null };
  } catch (e) {
    return fail(e);
  }
}

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const parsed = z.object({ current: z.string().min(1, 'Enter your current password.').max(200), next: Password }).safeParse({ current, next });
  if (!parsed.success) return fieldFail(parsed.error);
  return act(async (db, actor) => {
    await svc.changeOwnPassword(db, actor, parsed.data.current, parsed.data.next);
    return null;
  });
}

export async function replaceWithSample() {
  return act(async (db, actor) => {
    await svc.replaceWithSample(db, actor);
    return null;
  });
}

export async function renameOrganization(name: string) {
  return act((db, actor) => svc.renameOrganization(db, actor, Name.parse(name)));
}

/** Upload (a resized data: URL) or remove (null) the organization's logo. */
export async function setOrganizationLogo(logo: string | null) {
  return act((db, actor) => svc.setOrganizationLogo(db, actor, z.string().max(svc.MAX_LOGO_CHARS).nullable().parse(logo)));
}

/** Current state for the signed-in user (used after errors to resync). */
export async function getSnapshot(): Promise<ActionResult<Snapshot>> {
  return act(async (db, actor) => loadSnapshot(db, actor));
}

// ── Stock ───────────────────────────────────────────────────────────────────

export async function stepStock(id: string, field: string, dir: number) {
  return act((db, actor) => svc.stepStock(db, actor, Id.parse(id), Field.parse(field), z.union([z.literal(1), z.literal(-1)]).parse(dir)));
}

export async function setStock(id: string, field: string, value: number) {
  return act((db, actor) => svc.setStock(db, actor, Id.parse(id), Field.parse(field), Qty.parse(value)));
}

export async function updateMaterial(id: string, patch: svc.MaterialPatch) {
  const Patch = z
    .object({
      name: Name.optional(),
      kind: z.enum(MATERIAL_KINDS).optional(),
      unit: z.string().trim().min(1).max(12).optional(),
      packName: z.string().trim().min(1).max(24).optional(),
      cost: Qty.optional(),
      pack: Qty.optional(),
      par: Qty.optional(),
    })
    .strict();
  return act((db, actor) => svc.updateMaterial(db, actor, Id.parse(id), Patch.parse(patch)));
}

export async function addMaterial(form: { name: string; kind: string; unit: string; packName: string; pack: number; cost: number; par: number }) {
  const parsed = z
    .object({
      name: Name,
      kind: z.enum(MATERIAL_KINDS),
      unit: z.string().trim().min(1, 'Required.').max(12),
      packName: z.string().trim().min(1, 'Required.').max(24),
      pack: Qty,
      cost: Qty,
      par: Qty,
    })
    .safeParse(form);
  if (!parsed.success) return fieldFail(parsed.error);
  return act((db, actor) => svc.addMaterial(db, actor, parsed.data));
}

export async function deleteMaterial(id: string) {
  return act((db, actor) => svc.deleteMaterial(db, actor, Id.parse(id)));
}

export async function applyImport(rows: unknown, fileName: string) {
  return act((db, actor) => svc.applyImport(db, actor, ImportRows.parse(rows), z.string().max(200).parse(fileName)));
}

export async function revertImport(undo: ImportUndo) {
  return act((db, actor) => svc.revertImport(db, actor, Undo.parse(undo)));
}

// ── Recipes ─────────────────────────────────────────────────────────────────

export async function addProduct(form: { name: string; batchKg: number; upb: number; upc: number }) {
  const parsed = z.object({ name: Name, batchKg: Qty, upb: Count, upc: Count }).safeParse(form);
  if (!parsed.success) return fieldFail(parsed.error);
  return act((db, actor) => svc.addProduct(db, actor, parsed.data));
}

export async function renameProduct(id: string, name: string) {
  return act((db, actor) => svc.renameProduct(db, actor, Id.parse(id), Name.parse(name)));
}

export async function deleteProduct(id: string) {
  return act((db, actor) => svc.deleteProduct(db, actor, Id.parse(id)));
}

export async function addRecipeLine(productId: string, ingredientId: string, qty: number) {
  return act((db, actor) => svc.addRecipeLine(db, actor, Id.parse(productId), Id.parse(ingredientId), Qty.parse(qty)));
}

export async function removeRecipeLine(productId: string, ingredientId: string) {
  return act((db, actor) => svc.removeRecipeLine(db, actor, Id.parse(productId), Id.parse(ingredientId)));
}

export async function setRecipeQty(productId: string, ingredientId: string, qty: number) {
  return act((db, actor) => svc.setRecipeQty(db, actor, Id.parse(productId), Id.parse(ingredientId), Qty.parse(qty)));
}

export async function setProductCounts(productId: string, field: string, value: number) {
  return act((db, actor) => svc.setProductCounts(db, actor, Id.parse(productId), z.enum(['upb', 'upc']).parse(field), Count.parse(value)));
}

export async function setBatchKg(productId: string, kg: number) {
  return act((db, actor) => svc.setBatchKg(db, actor, Id.parse(productId), Qty.parse(kg)));
}

// ── Team ────────────────────────────────────────────────────────────────────

export async function createMember(form: { name: string; username: string; email: string; role: string; password: string }) {
  const parsed = z
    .object({ name: Name, username: Username, email: z.union([z.literal(''), Email]), role: RoleZ, password: Password })
    .safeParse(form);
  if (!parsed.success) return fieldFail(parsed.error);
  return act((db, actor) => svc.createMember(db, actor, { ...parsed.data, email: parsed.data.email || null }));
}

export async function setMemberRole(userId: string, role: string) {
  return act((db, actor) => svc.setMemberRole(db, actor, Id.parse(userId), RoleZ.parse(role)));
}

export async function updateMember(userId: string, form: { name: string; email: string }) {
  const parsed = z.object({ name: Name, email: z.union([z.literal(''), Email]) }).safeParse(form);
  if (!parsed.success) return fieldFail(parsed.error);
  return act((db, actor) => svc.updateMember(db, actor, Id.parse(userId), { name: parsed.data.name, email: parsed.data.email || null }));
}

export async function resetMemberPassword(userId: string, password: string) {
  const parsed = Password.safeParse(password);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message, fieldErrors: { password: parsed.error.issues[0].message } };
  return act((db, actor) => svc.resetMemberPassword(db, actor, Id.parse(userId), parsed.data));
}

export async function removeMember(userId: string) {
  return act((db, actor) => svc.removeMember(db, actor, Id.parse(userId)));
}

// ── Production ──────────────────────────────────────────────────────────────

export async function addForecast(input: { productId: string; batches: number; date: string }) {
  return act((db, actor) =>
    svc.addForecast(db, actor, z.object({ productId: Id, batches: z.number().int().min(1, 'Set at least one batch.').max(100000), date: IsoDate }).parse(input)),
  );
}

export async function removeForecast(id: string) {
  return act((db, actor) => svc.removeForecast(db, actor, Id.parse(id)));
}

export async function restoreForecast(id: string) {
  return act((db, actor) => svc.restoreForecast(db, actor, Id.parse(id)));
}

export async function logRun(forecastId: string, batches: number) {
  return act((db, actor) => svc.logRun(db, actor, Id.parse(forecastId), z.number().int().min(1).max(100000).parse(batches)));
}

// ── Purchasing ──────────────────────────────────────────────────────────────

/** Raise a PO with the materials and pack counts the user chose. */
export async function createPO(lines: { ingredientId: string; packs: number }[]) {
  const Lines = z
    .array(z.object({ ingredientId: Id, packs: z.number().int('Order whole packs.').min(1, 'Order at least one pack.').max(100000) }))
    .min(1, 'Add at least one material to the order.')
    .max(1000);
  return act((db, actor) => svc.createPO(db, actor, Lines.parse(lines)));
}

export async function receivePO(id: string) {
  return act((db, actor) => svc.receivePO(db, actor, Id.parse(id)));
}
