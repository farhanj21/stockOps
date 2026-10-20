import { connection } from 'next/server';
import { getDb } from '@/db';
import { getActor, SESSION_COOKIE } from '@/server/session';
import { loadSnapshot } from '@/server/snapshot';

/** Everything the signed-in user can see. 401 (and the stale cookie cleared) when signed out. */
export async function GET() {
  await connection(); // per-request: never prerender
  const db = await getDb();
  const actor = await getActor(db);
  if (!actor) {
    const res = Response.json({ error: 'signed_out' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return res;
  }
  return Response.json(await loadSnapshot(db, actor), { headers: { 'Cache-Control': 'no-store' } });
}
