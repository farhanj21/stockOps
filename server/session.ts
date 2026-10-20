import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { isProduction } from '@/db/seed';
import type { Role } from '@/lib/types';
import type { Actor } from './actor';
import { AppError } from './errors';

export const SESSION_COOKIE = 'stockops_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

/** Start a session for a user and set the httpOnly cookie. */
export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await db.delete(t.sessions).where(lt(t.sessions.expiresAt, now));
  await db.insert(t.sessions).values({ id: hashToken(token), userId, expiresAt: new Date(now.getTime() + MAX_AGE_S * 1000) });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge: MAX_AGE_S });
}

/** The signed-in user for this request, or null. Reads the role fresh from the database every time. */
export async function getActor(db: Db): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ userId: t.users.id, name: t.users.name, role: t.users.role, viewRole: t.sessions.viewRole })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.sessions.userId, t.users.id))
    .where(and(eq(t.sessions.id, sessionId), gt(t.sessions.expiresAt, new Date()), eq(t.users.active, true)));
  if (!row) return null;
  const role = row.role === 'Admin' && row.viewRole ? row.viewRole : row.role;
  return { userId: row.userId, name: row.name, role, baseRole: row.role, sessionId };
}

export async function destroySession(db: Db) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(t.sessions).where(eq(t.sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Admins can preview the app as another role. Nobody can gain a role they don't have. */
export async function setViewRole(db: Db, actor: Actor, role: Role) {
  if (actor.baseRole !== 'Admin') throw new AppError('Only Admins can preview other roles.', 'forbidden');
  await db
    .update(t.sessions)
    .set({ viewRole: role === 'Admin' ? null : role })
    .where(eq(t.sessions.id, actor.sessionId));
}
