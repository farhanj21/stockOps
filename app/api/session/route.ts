import { connection } from 'next/server';
import { getDb } from '@/db';
import { DEFAULT_DEMO_PASSWORD, demoMode } from '@/db/seed';
import type { SessionInfo } from '@/lib/api';
import { seed } from '@/lib/seed';
import { getActor } from '@/server/session';

/** Is anyone signed in, and which sign-in shortcuts to offer. */
export async function GET() {
  await connection(); // per-request: never prerender
  const actor = await getActor(await getDb());
  const demo = demoMode();
  const starters = seed().users.filter((u) => ['u1', 'u2', 'u3'].includes(u.id));
  const body: SessionInfo = {
    signedIn: !!actor,
    demo,
    demoAccounts: demo ? starters.map((u) => ({ username: u.username, label: `${u.role} · ${u.name.split(' ')[0]}` })) : [],
    demoPassword: demo && !process.env.SEED_PASSWORD ? DEFAULT_DEMO_PASSWORD : null,
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
