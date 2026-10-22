import { eq } from 'drizzle-orm';
import { connection } from 'next/server';
import { getDb } from '@/db';
import * as t from '@/db/schema';
import { getActor } from '@/server/session';

/**
 * The signed-in user's organization logo as an image. The snapshot links here with ?v=<upload time>,
 * so each upload gets a new URL and browsers can cache an image for good.
 */
export async function GET() {
  await connection();
  const db = await getDb();
  const actor = await getActor(db);
  if (!actor) return new Response(null, { status: 401 });
  const [org] = await db.select({ logo: t.organizations.logo }).from(t.organizations).where(eq(t.organizations.id, actor.organizationId));
  const m = org?.logo?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
