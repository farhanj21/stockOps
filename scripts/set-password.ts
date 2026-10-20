/**
 * Set a user's password from the command line (for when someone is locked out).
 *   npm run user:password -- <username or email> <new password>
 * Uses the same database settings as the app (DATABASE_URL or the local .data/pglite).
 */
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import * as t from '@/db/schema';
import { hashPassword } from '@/server/password';

async function main() {
  const [login, password] = process.argv.slice(2);
  if (!login || !password) throw new Error('Usage: npm run user:password -- <username or email> <new password>');
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const db = await getDb();
  const q = login.toLowerCase();
  const rows = await db
    .update(t.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(or(eq(sql`lower(${t.users.username})`, q), eq(sql`lower(${t.users.email})`, q)))
    .returning({ id: t.users.id, username: t.users.username });
  if (!rows.length) throw new Error(`No user "${login}".`);
  // Sign them out everywhere so the old password stops working immediately.
  await db.delete(t.sessions).where(eq(t.sessions.userId, rows[0].id));
  console.log(`Password updated for @${rows[0].username}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
