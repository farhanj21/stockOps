import { connection } from 'next/server';
import { getDb } from '@/db';
import { DEMO_PASSWORD, demoAccounts, demoMode } from '@/db/seed';
import type { SessionInfo } from '@/lib/api';
import { getActor } from '@/server/session';

/** Is anyone signed in, and which demo sign-in shortcuts to offer (demo mode with the demo org only). */
export async function GET() {
  await connection(); // per-request: never prerender
  const db = await getDb();
  const actor = await getActor(db);
  const demo = demoMode();
  const accounts = demo ? await demoAccounts(db) : [];
  const body: SessionInfo = { signedIn: !!actor, demo, demoAccounts: accounts, demoPassword: accounts.length ? DEMO_PASSWORD : null };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
