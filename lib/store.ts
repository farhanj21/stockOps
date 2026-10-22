'use client';

/**
 * Client copy of the server data.
 *
 * Every change is applied locally first so taps feel instant, then sent to the server as a
 * Server Action. Each action returns a fresh snapshot; once no changes are in flight the
 * latest snapshot replaces local state. If the server rejects a change, the user sees why
 * and the store reloads from the server, undoing the optimistic edit.
 */
import { create } from 'zustand';
import * as api from '@/app/actions';
import type { ActionResult, ImportUndo, Me, Snapshot } from './api';
import { num, round } from './format';
import type { ImportRow } from './import-plan';
import type { Data, Ingredient, Num, Role } from './types';
import { toast } from './ui';

type Status = 'loading' | 'ready' | 'signed-out' | 'offline';
type Undo = () => void;
type StockField = 'inHand' | 'pipeline';
type MasterField = 'cost' | 'pack' | 'par';

interface StoreState {
  data: Data;
  me: Me | null;
  status: Status;

  load: () => Promise<void>;
  /** Forget everything (sign-in/out), so the next screen loads fresh. */
  clear: () => void;
  signOut: () => Promise<void>;
  /** Owner, demo mode: swap all materials, recipes, plans and POs for the sample plant. */
  replaceWithSample: () => Promise<boolean>;
  /** Run any action; on error show it in a toast and resync. Returns the action's value or null. */
  send: <T>(call: () => Promise<ActionResult<T>>) => Promise<T | null>;
  /** Run a form action; returns the whole result so the form can show field errors. */
  submit: <T>(call: () => Promise<ActionResult<T>>) => Promise<ActionResult<T>>;

  stepIngredient: (id: string, field: StockField, dir: 1 | -1) => void;
  /** Typed edits to stock counts or cost / pack / par; saved after a short pause. */
  updateIngredient: (id: string, patch: Partial<Record<StockField | MasterField, Num>>) => void;
  /** Typed edits to a material's name, type, unit or pack type; saved after a short pause. */
  updateMaterialText: (id: string, field: 'name' | 'kind' | 'unit' | 'packName', value: string) => void;
  importRows: (rows: ImportRow[], fileName: string) => Promise<{ updated: number; added: number; undo: Undo } | null>;

  setRecipeQty: (productId: string, ing: string, qty: Num) => void;
  setProductField: (productId: string, field: 'upb' | 'upc', v: Num) => void;
  setBatchKg: (productId: string, v: Num) => void;
  /** Typed product name; saved after a short pause. */
  renameProduct: (productId: string, name: string) => void;

  setMemberRole: (userId: string, role: Role) => void;

  addForecast: (f: { productId: string; batches: number; date: string }) => Promise<boolean>;
  removeForecast: (id: string) => Promise<Undo | null>;
  logRun: (forecastId: string, batches: number) => Promise<{ product: string; units: number } | null>;

  createPO: (lines: { ingredientId: string; packs: number }[]) => Promise<{ id: string; lines: number } | null>;
  receivePO: (id: string) => Promise<boolean>;
}

const EMPTY: Data = { ingredients: [], products: [], recipes: {}, forecasts: [], pos: [], users: [] };
const SAVE_DELAY_MS = 500;

export const useStore = create<StoreState>()((set, get) => {
  // ── Sync engine ───────────────────────────────────────────────────────────
  let inFlight = 0;
  let latest: Snapshot | null = null;
  let mustReload = false;
  const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; fire: () => void }>();

  const begin = () => void inFlight++;
  const end = () => {
    if (--inFlight > 0) return;
    if (mustReload) {
      mustReload = false;
      latest = null;
      void get().load();
    } else if (latest) {
      set({ data: latest.data, me: latest.me });
      latest = null;
    }
  };

  /** Send one change; returns its value, or null if it failed (after telling the user). */
  async function send<T>(call: () => Promise<ActionResult<T>>): Promise<T | null> {
    begin();
    try {
      const res = await call();
      if (res.ok) {
        if (res.snapshot) latest = res.snapshot;
        return res.value;
      }
      if (res.signedOut) set({ status: 'signed-out', me: null });
      else {
        toast(res.error);
        mustReload = true;
      }
      return null;
    } catch {
      toast("Couldn't reach the server. Your last change wasn't saved.");
      mustReload = true;
      return null;
    } finally {
      end();
    }
  }

  /** Save after typing pauses. Blank values aren't sent; the field keeps showing blank until edited. */
  function sendLater<T, V extends number | string>(key: string, value: V | '', call: (v: V) => Promise<ActionResult<T>>) {
    const pending = timers.get(key);
    if (pending) clearTimeout(pending.timer);
    else begin();
    const fire = () => {
      timers.delete(key);
      if (value === '' || (typeof value === 'string' && !value.trim())) end();
      else void send(() => call(value as V)).finally(end);
    };
    timers.set(key, { timer: setTimeout(fire, SAVE_DELAY_MS), fire });
  }

  // Leaving or backgrounding the app: save pending edits now instead of waiting.
  if (typeof window !== 'undefined') {
    const flush = () => {
      for (const { timer, fire } of [...timers.values()]) {
        clearTimeout(timer);
        fire();
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }

  const edit = (fn: (d: Data) => Partial<Data>) => set((s) => ({ data: { ...s.data, ...fn(s.data) } }));
  const mapIng = (id: string, fn: (i: Ingredient) => Ingredient) =>
    edit((d) => ({ ingredients: d.ingredients.map((i) => (i.id === id ? fn(i) : i)) }));

  return {
    data: EMPTY,
    me: null,
    status: 'loading',

    load: async () => {
      try {
        const res = await fetch('/api/snapshot', { cache: 'no-store' });
        if (res.status === 401) return set({ status: 'signed-out', me: null, data: EMPTY });
        if (!res.ok) throw new Error(String(res.status));
        const snap = (await res.json()) as Snapshot;
        // Don't clobber edits made while the request was out.
        if (inFlight === 0) set({ data: snap.data, me: snap.me, status: 'ready' });
        else latest = snap;
      } catch {
        if (get().status === 'loading') set({ status: 'offline' });
      }
    },
    clear: () => set({ data: EMPTY, me: null, status: 'loading' }),
    signOut: async () => {
      await send(() => api.signOut());
      set({ data: EMPTY, me: null, status: 'signed-out' });
    },
    replaceWithSample: async () => (await send(() => api.replaceWithSample())) !== null,
    send,
    submit: async (call) => {
      begin();
      try {
        const res = await call();
        if (res.ok && res.snapshot) latest = res.snapshot;
        if (!res.ok && res.signedOut) set({ status: 'signed-out', me: null });
        return res;
      } catch {
        return { ok: false, error: "Couldn't reach the server. Check your connection." };
      } finally {
        end();
      }
    },

    stepIngredient: (id, field, dir) => {
      mapIng(id, (i) => ({ ...i, [field]: round(Math.max(0, num(i[field]) + dir * num(i.pack))) }));
      void send(() => api.stepStock(id, field, dir));
    },
    updateIngredient: (id, patch) => {
      mapIng(id, (i) => ({ ...i, ...patch }));
      for (const [field, value] of Object.entries(patch) as [StockField | MasterField, Num][]) {
        sendLater(`ing|${id}|${field}`, value, (v) =>
          field === 'inHand' || field === 'pipeline' ? api.setStock(id, field, v) : api.updateMaterial(id, { [field]: v }),
        );
      }
    },
    updateMaterialText: (id, field, value) => {
      mapIng(id, (i) => ({ ...i, [field]: value }));
      sendLater(`ing|${id}|${field}`, value, (v: string) => api.updateMaterial(id, { [field]: v }));
    },
    importRows: async (rows, fileName) => {
      const res = await send(() => api.applyImport(rows, fileName));
      if (!res) return null;
      return { updated: res.updated, added: res.added, undo: () => void send(() => api.revertImport(res.undo as ImportUndo)) };
    },

    setRecipeQty: (productId, ing, qty) => {
      edit((d) => ({ recipes: { ...d.recipes, [productId]: (d.recipes[productId] || []).map((x) => (x.ing === ing ? { ...x, qty } : x)) } }));
      sendLater(`recipe|${productId}|${ing}`, qty, (v) => api.setRecipeQty(productId, ing, v));
    },
    setProductField: (productId, field, v) => {
      edit((d) => ({ products: d.products.map((p) => (p.id === productId ? { ...p, [field]: v } : p)) }));
      sendLater(`product|${productId}|${field}`, v, (n) => api.setProductCounts(productId, field, n));
    },
    renameProduct: (productId, name) => {
      edit((d) => ({ products: d.products.map((p) => (p.id === productId ? { ...p, name } : p)) }));
      sendLater(`product|${productId}|name`, name, (v: string) => api.renameProduct(productId, v));
    },
    setBatchKg: (productId, v) => {
      // Preview the scaled recipe locally; the server rescales from the saved weight, so typing
      // through intermediate values ("5", "50", "500") can't accumulate rounding error.
      edit((d) => {
        const old = num(d.products.find((p) => p.id === productId)?.batchKg);
        const k = old > 0 && num(v) > 0 ? num(v) / old : 1;
        const kindOf = (ing: string) => d.ingredients.find((i) => i.id === ing)?.kind;
        return {
          products: d.products.map((p) => (p.id === productId ? { ...p, batchKg: v } : p)),
          recipes:
            k === 1
              ? d.recipes
              : {
                  ...d.recipes,
                  [productId]: (d.recipes[productId] || []).map((x) => {
                    const kind = kindOf(x.ing);
                    return kind && kind !== 'packaging' ? { ...x, qty: round(num(x.qty) * k) } : x;
                  }),
                },
        };
      });
      sendLater(`batch|${productId}`, num(v) > 0 ? v : '', (n) => api.setBatchKg(productId, n));
    },

    setMemberRole: (userId, role) => {
      edit((d) => ({ users: d.users.map((u) => (u.id === userId ? { ...u, role } : u)) }));
      void send(() => api.setMemberRole(userId, role));
    },

    addForecast: async (f) => (await send(() => api.addForecast(f))) !== null,
    removeForecast: async (id) => {
      edit((d) => ({ forecasts: d.forecasts.filter((f) => f.id !== id) }));
      const ok = await send(() => api.removeForecast(id));
      return ok === null ? null : () => void send(() => api.restoreForecast(id));
    },
    logRun: (forecastId, batches) => send(() => api.logRun(forecastId, batches)),

    createPO: (lines) => send(() => api.createPO(lines)),
    receivePO: async (id) => (await send(() => api.receivePO(id))) !== null,
  };
});

export const useData = () => useStore((s) => s.data);
