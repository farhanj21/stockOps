import { eq } from 'drizzle-orm';
import { openPglite, type Db } from '@/db';
import * as t from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import type { Role } from '@/lib/types';
import type { Actor } from '@/server/actor';

export const PASSWORD = 'test-pass-123';

/** A fresh, migrated, seeded in-memory Postgres. */
export async function freshDb() {
  const { db, close } = await openPglite();
  await seedDatabase(db, PASSWORD);
  return { db, close };
}

const STARTERS: Record<Role, string> = { Admin: 'u1', Warehouse: 'u2', Production: 'u3' };

export const actor = (role: Role, userId = STARTERS[role]): Actor => ({ userId, name: role, role, baseRole: role, sessionId: 'test' });

export async function ingredient(db: Db, id: string) {
  const [row] = await db.select().from(t.ingredients).where(eq(t.ingredients.id, id));
  return row;
}
