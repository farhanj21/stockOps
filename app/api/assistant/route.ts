import { z } from 'zod';
import { getDb } from '@/db';
import type { AssistantReply, ChatContent } from '@/lib/assistant';
import { askAssistant } from '@/server/assistant';
import { AppError } from '@/server/errors';
import { getActor } from '@/server/session';
import { loadSnapshot } from '@/server/snapshot';

const MAX_BODY = 400_000;

const Contents = z
  .array(z.object({ role: z.enum(['user', 'model']), parts: z.array(z.record(z.string(), z.unknown())).min(1).max(50) }))
  .min(1)
  .max(200);

const reply = (body: AssistantReply, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** One assistant turn: the conversation so far in, the model's next message out. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ ok: false, error: 'This chat is too long. Start a new one.' }, 413);
  const db = await getDb();
  const actor = await getActor(db);
  if (!actor) return reply({ ok: false, error: 'Your session has ended. Sign in again.' }, 401);
  let contents: ChatContent[];
  try {
    contents = Contents.parse(JSON.parse(raw).contents) as ChatContent[];
  } catch {
    return reply({ ok: false, error: "That message couldn't be sent." }, 400);
  }
  try {
    const { data, me } = await loadSnapshot(db, actor);
    return reply({ ok: true, content: await askAssistant(actor, me.org.name, data, contents) });
  } catch (e) {
    if (e instanceof AppError) return reply({ ok: false, error: e.message }, 502);
    console.error('[stockops] assistant failed', e);
    return reply({ ok: false, error: "The assistant couldn't answer just now. Try again." }, 502);
  }
}
