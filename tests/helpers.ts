import { and, eq } from 'drizzle-orm';
import { openPglite, type Db } from '@/db';
import * as t from '@/db/schema';
import { createDemoOrganization } from '@/db/seed';
import type { Role } from '@/lib/types';
import type { Actor } from '@/server/actor';

export const PASSWORD = 'test-pass-123';

/** A fresh in-memory Postgres holding the demo organization (sample data + four people). */
export async function freshDb() {
  const { db, close } = await openPglite();
  const orgId = (await createDemoOrganization(db, PASSWORD))!;
  return { db, close, orgId };
}

/** Acting user for a demo account username (areyes = owner/Admin, msilva = Warehouse, pnair = Production). */
export async function actorFor(db: Db, username: string): Promise<Actor> {
  const [u] = await db.select().from(t.users).where(eq(t.users.username, username));
  return { userId: u.id, organizationId: u.organizationId, name: u.name, isOwner: u.isOwner, role: u.role, baseRole: u.role, sessionId: 'test' };
}

export const as = (a: Actor, role: Role): Actor => ({ ...a, role });

/** A material of the actor's organization, by name. */
export async function material(db: Db, orgId: string, name: string) {
  const [row] = await db
    .select()
    .from(t.ingredients)
    .where(and(eq(t.ingredients.organizationId, orgId), eq(t.ingredients.name, name)));
  return row;
}

export async function product(db: Db, orgId: string, name: string) {
  const [row] = await db
    .select()
    .from(t.products)
    .where(and(eq(t.products.organizationId, orgId), eq(t.products.name, name)));
  return row;
}

export const SUGAR = 'Sugar (Powdered)';
export const FUDGE = 'Chocolate Hot Fudge (McD)';
