'use server';

/**
 * Every write the app makes. Each action validates its input, resolves the signed-in user
 * from the session cookie, runs the business rule in server/services.ts (which checks the
 * role), and returns a fresh snapshot so the client can reconcile its optimistic state.
 */
import { z } from 'zod';
import { getDb, type Db } from '@/db';
import { demoMode, resetContent } from '@/db/seed';
import type { ActionResult, ImportUndo, Snapshot } from '@/lib/api';
import { EMAIL_RE } from '@/lib/format';
import { ROLES } from '@/lib/roles';
import type { Actor } from '@/server/actor';
import { AppError } from '@/server/errors';
import * as svc from '@/server/services';
import { createSession, destroySession, getActor, setViewRole } from '@/server/session';
import { loadSnapshot } from '@/server/snapshot';

// ── Input schemas ───────────────────────────────────────────────────────────

const Id = z.string().min(1).max(120);
const Qty = z.number().finite().min(0).max(1e9);
const Count = z.number().int().min(0).max(1e6);
const Field = z.enum(['inHand', 'pipeline']);
const RoleZ = z.enum(ROLES as [string, ...string[]]).transform((r) => r as (typeof ROLES)[number]);
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

export async function requestAccess(form: { name: string; email: string; role: string; password: string }): Promise<ActionResult<{ email: string }>> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, 'This field is required.').max(100),
      email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid email address.').max(200),
      role: RoleZ,
      password: z.string().min(8, 'Use at least 8 characters.').max(200),
    })
    .safeParse(form);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors };
  }
  try {
    const value = await svc.requestAccess(await getDb(), parsed.data);
    return { ok: true, value, snapshot: null };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Password reset by email needs a mail provider, which isn't configured yet.
 * The response never reveals whether an account exists; an Admin can reset a password with `npm run user:password`.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!EMAIL_RE.test(String(email ?? '').trim())) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, value: null, snapshot: null };
}

export async function switchRole(role: string) {
  return act((db, actor) => setViewRole(db, actor, RoleZ.parse(role)));
}

export async function resetDemoData() {
  return act(async (db, actor) => {
    if (!demoMode()) throw new AppError('Demo reset is turned off on this server.', 'forbidden');
    if (actor.baseRole !== 'Admin') throw new AppError('Only Admins can reset the demo data.', 'forbidden');
    await resetContent(db);
    return null;
  });
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

export async function updateMaterial(id: string, patch: { cost?: number; pack?: number; par?: number }) {
  return act((db, actor) =>
    svc.updateMaterial(db, actor, Id.parse(id), z.object({ cost: Qty.optional(), pack: Qty.optional(), par: Qty.optional() }).strict().parse(patch)),
  );
}

export async function applyImport(rows: unknown, fileName: string) {
  return act((db, actor) => svc.applyImport(db, actor, ImportRows.parse(rows), z.string().max(200).parse(fileName)));
}

export async function revertImport(undo: ImportUndo) {
  return act((db, actor) => svc.revertImport(db, actor, Undo.parse(undo)));
}

// ── Recipes ─────────────────────────────────────────────────────────────────

export async function setRecipeQty(productId: string, ingredientId: string, qty: number) {
  return act((db, actor) => svc.setRecipeQty(db, actor, Id.parse(productId), Id.parse(ingredientId), Qty.parse(qty)));
}

export async function setProductCounts(productId: string, field: string, value: number) {
  return act((db, actor) => svc.setProductCounts(db, actor, Id.parse(productId), z.enum(['upb', 'upc']).parse(field), Count.parse(value)));
}

export async function setBatchKg(productId: string, kg: number) {
  return act((db, actor) => svc.setBatchKg(db, actor, Id.parse(productId), Qty.parse(kg)));
}

// ── Users ───────────────────────────────────────────────────────────────────

export async function approveRequest(id: string) {
  return act((db, actor) => svc.approveRequest(db, actor, Id.parse(id)));
}

export async function declineRequest(id: string) {
  return act((db, actor) => svc.declineRequest(db, actor, Id.parse(id)));
}

export async function reopenRequest(id: string) {
  return act((db, actor) => svc.reopenRequest(db, actor, Id.parse(id)));
}

export async function setUserRole(userId: string, role: string) {
  return act((db, actor) => svc.setUserRole(db, actor, Id.parse(userId), RoleZ.parse(role)));
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

export async function generatePO(excluded: string[]) {
  return act((db, actor) => svc.generatePO(db, actor, z.array(Id).max(5000).parse(excluded)));
}

export async function receivePO(id: string) {
  return act((db, actor) => svc.receivePO(db, actor, Id.parse(id)));
}
