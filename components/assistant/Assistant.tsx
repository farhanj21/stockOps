'use client';

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as api from '@/app/actions';
import { Icon } from '@/components/Icon';
import type { ActionResult } from '@/lib/api';
import { PAGES, WRITE_TOOLS, type AssistantReply, type ChatContent, type ChatPart, type FunctionCall } from '@/lib/assistant';
import { fmt, num, round } from '@/lib/format';
import { useCurrentUser, useGo, type Tab } from '@/lib/hooks';
import { generatePassword } from '@/lib/password-gen';
import { useStore } from '@/lib/store';
import type { Data, Role } from '@/lib/types';
import { toast } from '@/lib/ui';

/**
 * Floating chat with the StockOps assistant (Gemini, via /api/assistant).
 * Changes the assistant proposes appear as cards; nothing is saved until the person taps Confirm,
 * and then it goes through the same server actions as the rest of the app.
 */

type CallState =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'done'; summary: string; credentials?: { username: string; password: string } }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

type Resolved = Exclude<CallState, { status: 'pending' } | { status: 'running' }> & { response: Record<string, unknown> };

const keyOf = (ci: number, pi: number) => `${ci}:${pi}`;
const isWrite = (name: string) => (WRITE_TOOLS as readonly string[]).includes(name);

export function Assistant() {
  const me = useStore((s) => s.me);
  const { role, perms, user } = useCurrentUser();
  const go = useGo();
  const [open, setOpen] = useState(false);
  const [contents, setContents] = useState<ChatContent[]>([]);
  const [calls, setCalls] = useState<Record<string, CallState | Resolved>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const state = useRef({ contents, calls });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const commit = (c: ChatContent[], k: Record<string, CallState | Resolved>) => {
    state.current = { contents: c, calls: k };
    setContents(c);
    setCalls(k);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [contents, calls, busy, error]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!me?.assistant) return null;

  /** Send the conversation, append the reply, and run anything that needs no confirmation. */
  async function ask(next: ChatContent[]) {
    commit(next, state.current.calls);
    setBusy(true);
    setError(null);
    let reply: AssistantReply;
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: next }) });
      reply = (await res.json()) as AssistantReply;
    } catch {
      reply = { ok: false, error: "Couldn't reach the assistant. Check your connection." };
    }
    setBusy(false);
    if (!reply.ok) return setError(reply.error);

    const all = [...next, reply.content];
    const ci = all.length - 1;
    const k = { ...state.current.calls };
    reply.content.parts.forEach((p, pi) => {
      if (!p.functionCall) return;
      if (p.functionCall.name === 'navigate') {
        const page = String(p.functionCall.args?.page ?? '') as Tab;
        if (page in PAGES) {
          go(page);
          k[keyOf(ci, pi)] = { status: 'done', summary: `Opened ${PAGES[page]}`, response: { ok: true } };
        } else k[keyOf(ci, pi)] = { status: 'failed', error: 'Unknown screen', response: { ok: false, error: 'Unknown page' } };
      } else if (isWrite(p.functionCall.name) && perms.setup) k[keyOf(ci, pi)] = { status: 'pending' };
      else k[keyOf(ci, pi)] = { status: 'failed', error: "Your role can't do that.", response: { ok: false, error: `The ${role} role can't do this.` } };
    });
    commit(all, k);
    continueIfReady(all, k);
  }

  /** Once every call in the latest reply is settled, hand the results back to the assistant. */
  function continueIfReady(c: ChatContent[], k: Record<string, CallState | Resolved>, text?: string) {
    const ci = c.length - 1;
    const last = c[ci];
    if (last?.role !== 'model') return text ? void ask([...c, { role: 'user', parts: [{ text }] }]) : undefined;
    const fcs = last.parts.map((p, pi) => [p.functionCall, k[keyOf(ci, pi)]] as const).filter(([fc]) => fc);
    if (!fcs.length) return text ? void ask([...c, { role: 'user', parts: [{ text }] }]) : undefined;
    if (fcs.some(([, s]) => !s || !('response' in s))) return;
    const parts: ChatPart[] = fcs.map(([fc, s]) => ({
      functionResponse: { ...(fc!.id ? { id: fc!.id } : {}), name: fc!.name, response: (s as Resolved).response },
    }));
    if (text) parts.push({ text });
    void ask([...c, { role: 'user', parts }]);
  }

  function settle(key: string, s: Resolved) {
    const k = { ...state.current.calls, [key]: s };
    commit(state.current.contents, k);
    continueIfReady(state.current.contents, k);
  }

  async function confirm(key: string, fc: FunctionCall) {
    commit(state.current.contents, { ...state.current.calls, [key]: { status: 'running' } });
    try {
      const r = await runTool(fc, useStore.getState().data);
      settle(key, { status: 'done', summary: r.summary, credentials: r.credentials, response: r.response });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'That failed.';
      settle(key, { status: 'failed', error: msg, response: { ok: false, error: msg } });
    }
  }

  const cancel = (key: string) => settle(key, { status: 'cancelled', response: { ok: false, cancelled: true, note: 'The person tapped Cancel. Nothing was saved and the card is closed.' } });

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    // Typing instead of answering a card counts as cancelling it.
    const { contents: c, calls: k0 } = state.current;
    const k = { ...k0 };
    for (const [key, s] of Object.entries(k))
      if (s.status === 'pending') k[key] = { status: 'cancelled', response: { ok: false, cancelled: true, note: 'The person typed a reply instead of confirming. Nothing was saved and the card is closed.' } };
    commit(c, k);
    continueIfReady(c, k, text);
  }

  function retry() {
    const c = state.current.contents;
    if (c.length) void ask(c);
  }

  const reset = () => {
    commit([], {});
    setError(null);
    setInput('');
  };

  const suggestions = perms.setup
    ? ['How do I get started?', 'Help me add a recipe', 'Add an ingredient', 'Add a team member']
    : ['What should I do today?', 'Which materials are below par?', perms.stock ? 'How do I count stock?' : 'How do I log a production run?'];

  return (
    <>
      {!open && (
        <button type="button" className="ai-fab" onClick={() => setOpen(true)} aria-label="Open assistant">
          <Icon name="sparkle" size={22} stroke={1.9} />
          <span className="w-only">Ask StockOps</span>
        </button>
      )}
      {open && (
        <section className="ai-panel" role="dialog" aria-label="StockOps assistant">
          <header className="ai-head">
            <span className="ai-badge">
              <Icon name="sparkle" size={16} stroke={2} />
            </span>
            <div className="min0" style={{ flex: 1 }}>
              <div className="ai-title">Assistant</div>
              <div className="row-sub">Asks before changing anything</div>
            </div>
            {contents.length > 0 && (
              <button type="button" className="ai-icon-btn" onClick={reset} aria-label="New chat" title="New chat">
                <Icon name="refresh" size={17} />
              </button>
            )}
            <button type="button" className="ai-icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant">
              <Icon name="x" size={18} />
            </button>
          </header>

          <div className="ai-list" ref={listRef}>
            {contents.length === 0 && (
              <div className="ai-empty">
                <p>
                  Hi {user.name.split(' ')[0]}! I can explain how StockOps works{perms.setup ? ' and set things up for you: materials, recipes and team accounts' : ''}. What do you need?
                </p>
                <div className="ai-chips">
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="ai-chip" onClick={() => continueIfReady([], {}, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {contents.map((c, ci) =>
              c.parts.map((p, pi) => {
                const key = keyOf(ci, pi);
                if (p.text && !p.thought) {
                  // Gemini can split one answer over several text parts: show a run of them as one bubble.
                  const prev = c.parts[pi - 1];
                  if (prev?.text && !prev.thought) return null;
                  let text = '';
                  for (let j = pi; c.parts[j]?.text && !c.parts[j].thought; j++) text += c.parts[j].text;
                  return (
                    <div key={key} className={`ai-msg ${c.role === 'user' ? 'me' : 'bot'}`}>
                      {c.role === 'user' ? text : <Markdown text={text} />}
                    </div>
                  );
                }
                if (p.functionCall) {
                  const s = calls[key];
                  if (p.functionCall.name === 'navigate')
                    return (
                      <div key={key} className="ai-note">
                        <Icon name="chevronRight" size={14} /> {s?.status === 'done' ? s.summary : 'Opening…'}
                      </div>
                    );
                  return <ActionCard key={key} fc={p.functionCall} state={s} onConfirm={() => void confirm(key, p.functionCall!)} onCancel={() => cancel(key)} />;
                }
                return null;
              }),
            )}
            {busy && (
              <div className="ai-msg bot ai-typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && (
              <div className="ai-error">
                {error}{' '}
                <button type="button" className="btn-link" onClick={retry}>
                  Try again
                </button>
              </div>
            )}
          </div>

          <form className="ai-input" onSubmit={send}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="Ask anything about StockOps…"
              aria-label="Message"
              maxLength={4000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
              }}
            />
            <button type="submit" className="ai-send" disabled={busy || !input.trim()} aria-label="Send">
              <Icon name="send" size={18} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

// ── Proposed changes ────────────────────────────────────────────────────────

interface Line {
  materialId?: unknown;
  percent?: unknown;
  qty?: unknown;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : v == null ? fallback : String(v));
const lines = (v: unknown): Line[] => (Array.isArray(v) ? (v as Line[]) : []);

/** Recipe quantity in the material's unit: ingredients may be given as % of the batch weight. */
function lineQty(l: Line, batchKg: number, data: Data) {
  const ing = data.ingredients.find((i) => i.id === str(l.materialId));
  const pct = l.percent == null ? NaN : num(l.percent);
  const qty = Number.isFinite(pct) && ing?.kind !== 'packaging' ? round((pct * batchKg) / 100) : num(l.qty ?? l.percent);
  return { ing, qty, pct: Number.isFinite(pct) && ing?.kind !== 'packaging' ? pct : null };
}

function describe(fc: FunctionCall, data: Data): { title: string; rows: string[] } {
  const a = fc.args ?? {};
  const lineRows = (batchKg: number) =>
    lines(a.lines).map((l) => {
      const { ing, qty, pct } = lineQty(l, batchKg, data);
      if (!ing) return `Unknown material (${str(l.materialId)})`;
      return `${ing.name}: ${pct != null ? `${fmt(pct)}% · ` : ''}${fmt(qty)} ${ing.unit}`;
    });
  switch (fc.name) {
    case 'add_material': {
      const unit = str(a.unit, 'kg');
      return {
        title: `Add material: ${str(a.name)}`,
        rows: [
          `${str(a.kind, 'ingredient')} · counted in ${unit}`,
          `Supplier pack: ${fmt(num(a.pack))} ${unit} ${str(a.packName, 'pack')}`,
          `Cost: Rs ${fmt(num(a.cost))} / ${unit}`,
          `Par level: ${fmt(num(a.par))} ${unit}`,
        ],
      };
    }
    case 'create_product':
      return {
        title: `New product: ${str(a.name)}`,
        rows: [`Batch ${fmt(num(a.batchKg))} kg · ${fmt(num(a.unitsPerBatch))} units · ${fmt(num(a.unitsPerCase))} per case`, ...lineRows(num(a.batchKg))],
      };
    case 'add_recipe_lines': {
      const p = data.products.find((x) => x.id === str(a.productId));
      return { title: `Add to recipe: ${p?.name ?? 'unknown product'}`, rows: lineRows(num(p?.batchKg)) };
    }
    case 'add_team_member':
      return {
        title: `New account: ${str(a.name)}`,
        rows: [`Username: ${str(a.username).toLowerCase()}`, `Role: ${str(a.role)}`, ...(str(a.email) ? [`Email: ${str(a.email)}`] : []), 'A temporary password will be created'],
      };
    default:
      return { title: fc.name, rows: [] };
  }
}

function errorOf(res: ActionResult<unknown>) {
  if (res.ok) return '';
  const fields = Object.entries(res.fieldErrors ?? {}).map(([f, m]) => `${f}: ${m}`);
  return fields.length ? `${res.error} (${fields.join('; ')})` : res.error;
}

async function runTool(fc: FunctionCall, data: Data): Promise<{ summary: string; response: Record<string, unknown>; credentials?: { username: string; password: string } }> {
  const { submit } = useStore.getState();
  const a = fc.args ?? {};
  const must = async <T,>(call: () => Promise<ActionResult<T>>) => {
    const res = await submit(call);
    if (!res.ok) throw new Error(errorOf(res));
    return res.value;
  };
  const addLines = async (productId: string, batchKg: number) => {
    const failed: string[] = [];
    let added = 0;
    for (const l of lines(a.lines)) {
      const { ing, qty } = lineQty(l, batchKg, data);
      if (!ing) failed.push(`${str(l.materialId)}: no such material`);
      else {
        const res = await submit(() => api.addRecipeLine(productId, ing.id, qty));
        if (res.ok) added++;
        else failed.push(`${ing.name}: ${res.error}`);
      }
    }
    return { added, failed };
  };

  switch (fc.name) {
    case 'add_material': {
      const v = await must(() =>
        api.addMaterial({
          name: str(a.name),
          kind: str(a.kind, 'ingredient'),
          unit: str(a.unit, 'kg'),
          packName: str(a.packName, 'pack'),
          pack: num(a.pack),
          cost: num(a.cost),
          par: num(a.par),
        }),
      );
      return { summary: `Added ${str(a.name)}`, response: { ok: true, materialId: v.id } };
    }
    case 'create_product': {
      const batchKg = num(a.batchKg);
      const v = await must(() => api.addProduct({ name: str(a.name), batchKg, upb: Math.round(num(a.unitsPerBatch)), upc: Math.round(num(a.unitsPerCase)) }));
      const r = await addLines(v.id, batchKg);
      return {
        summary: `Created ${str(a.name)}${r.added ? ` with ${r.added} recipe line${r.added === 1 ? '' : 's'}` : ''}${r.failed.length ? ` (${r.failed.length} line${r.failed.length === 1 ? '' : 's'} failed)` : ''}`,
        response: { ok: true, productId: v.id, linesAdded: r.added, lineErrors: r.failed },
      };
    }
    case 'add_recipe_lines': {
      const p = data.products.find((x) => x.id === str(a.productId));
      if (!p) throw new Error('That product no longer exists.');
      const r = await addLines(p.id, num(p.batchKg));
      if (!r.added) throw new Error(r.failed.join('; ') || 'Nothing to add.');
      return { summary: `Added ${r.added} line${r.added === 1 ? '' : 's'} to ${p.name}`, response: { ok: true, linesAdded: r.added, lineErrors: r.failed } };
    }
    case 'add_team_member': {
      const password = generatePassword();
      const username = str(a.username).toLowerCase();
      await must(() => api.createMember({ name: str(a.name), username, email: str(a.email), role: str(a.role) as Role, password }));
      return {
        summary: `Created ${str(a.name)}'s account`,
        credentials: { username, password },
        response: { ok: true, username, note: 'Account created. The temporary password is shown to the admin on screen.' },
      };
    }
    default:
      throw new Error('Unknown action.');
  }
}

function ActionCard({ fc, state, onConfirm, onCancel }: { fc: FunctionCall; state?: CallState | Resolved; onConfirm: () => void; onCancel: () => void }) {
  const data = useStore((s) => s.data);
  const { title, rows } = describe(fc, data);
  const status = state?.status ?? 'pending';
  return (
    <div className={`ai-card ${status}`}>
      <div className="ai-card-title">{title}</div>
      {rows.length > 0 && (
        <ul className="ai-card-rows">
          {rows.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {(status === 'pending' || status === 'running') && (
        <div className="ai-card-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={status === 'running'}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={status === 'running'}>
            {status === 'running' ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      )}
      {state?.status === 'done' && (
        <div className="ai-card-status ok">
          <Icon name="check" size={14} stroke={2.4} /> {state.summary}
        </div>
      )}
      {state?.status === 'done' && state.credentials && <Credentials {...state.credentials} />}
      {state?.status === 'failed' && <div className="ai-card-status bad">{state.error}</div>}
      {state?.status === 'cancelled' && <div className="ai-card-status">Cancelled</div>}
    </div>
  );
}

function Credentials({ username, password }: { username: string; password: string }) {
  const text = `Username: ${username}\nTemporary password: ${password}`;
  return (
    <div className="ai-creds">
      <div>
        Username <b>{username}</b>
      </div>
      <div>
        Temporary password <b className="tnum">{password}</b>
      </div>
      <button
        type="button"
        className="btn-link"
        onClick={() =>
          navigator.clipboard?.writeText(text).then(
            () => toast('Sign-in details copied.'),
            () => toast("Couldn't copy. Write them down instead."),
          )
        }
      >
        Copy sign-in details
      </button>
      <div className="row-sub">Hand these over. They&apos;ll change the password from the account menu.</div>
    </div>
  );
}

// ── Light Markdown: paragraphs, bullet/numbered lists, **bold** ─────────────

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith('**') && s.endsWith('**') && s.length > 4 ? <b key={i}>{s.slice(2, -2)}</b> : <Fragment key={i}>{s}</Fragment>));
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}
