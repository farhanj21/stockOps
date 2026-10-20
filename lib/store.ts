'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { num, round, today } from './format';
import { ROLE_USER } from './roles';
import { seed } from './seed';
import type { AccessRequest, Data, Forecast, Ingredient, Num, Product, PurchaseOrder, Role, User } from './types';

export interface Session {
  userId: string;
  role: Role;
}

type Undo = () => void;

const uid = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

interface StoreState {
  data: Data;
  session: Session | null;

  signIn: (user: User) => void;
  signOut: () => void;
  /** Demo role switch: jumps to that role's demo user. */
  switchRole: (role: Role) => void;

  updateIngredient: (id: string, patch: Partial<Ingredient>) => void;
  /** Add or remove one supplier pack from in-hand or pipeline. */
  stepIngredient: (id: string, field: 'inHand' | 'pipeline', dir: 1 | -1) => void;
  setIngredients: (next: Ingredient[]) => void;

  addRequest: (r: Omit<AccessRequest, 'id'>) => void;
  approveRequest: (id: string) => AccessRequest | null;
  declineRequest: (id: string) => { request: AccessRequest; undo: Undo } | null;
  setUserRole: (userId: string, role: Role) => void;

  addForecast: (f: Omit<Forecast, 'id'>) => void;
  removeForecast: (id: string) => Undo | null;
  /** Deduct a production run from in-hand and from the plan it came from. */
  logRun: (forecastId: string, batches: number) => void;

  /** New PO goes on top and its quantities move into pipeline. */
  createPO: (po: PurchaseOrder) => void;
  /** Pipeline quantities move into in-hand. */
  receivePO: (id: string) => void;

  setRecipeQty: (productId: string, ing: string, qty: Num) => void;
  setProductField: (productId: string, field: 'upb' | 'upc', v: Num) => void;
  /** Changing batch weight scales every mix line so the % stay the same. */
  setBatchKg: (productId: string, v: Num) => void;

  resetData: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      const edit = (fn: (d: Data) => Partial<Data>) => set((s) => ({ data: { ...s.data, ...fn(s.data) } }));
      const mapIngs = (fn: (i: Ingredient) => Ingredient) => edit((d) => ({ ingredients: d.ingredients.map(fn) }));
      const mapProduct = (id: string, fn: (p: Product) => Product) =>
        edit((d) => ({ products: d.products.map((p) => (p.id === id ? fn(p) : p)) }));

      return {
        data: seed(),
        session: null,

        signIn: (user) => set({ session: { userId: user.id, role: user.role } }),
        signOut: () => set({ session: null }),
        switchRole: (role) =>
          set((s) => ({ session: s.session && { userId: ROLE_USER[role] ?? s.session.userId, role } })),

        updateIngredient: (id, patch) => mapIngs((i) => (i.id === id ? { ...i, ...patch } : i)),
        stepIngredient: (id, field, dir) =>
          mapIngs((i) => (i.id === id ? { ...i, [field]: round(Math.max(0, num(i[field]) + dir * num(i.pack))) } : i)),
        setIngredients: (next) => edit(() => ({ ingredients: next })),

        addRequest: (r) => edit((d) => ({ requests: [...d.requests, { ...r, id: uid('r') }] })),
        approveRequest: (id) => {
          const d = get().data;
          const r = d.requests.find((x) => x.id === id);
          if (!r) return null;
          const base = r.email.split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '') || 'user';
          let username = base;
          for (let n = 2; d.users.some((u) => u.username === username); n++) username = base + n;
          edit((dd) => ({
            requests: dd.requests.filter((x) => x.id !== id),
            users: [...dd.users, { id: uid('u'), name: r.name, username, email: r.email, role: r.role }],
          }));
          return r;
        },
        declineRequest: (id) => {
          const d = get().data;
          const ix = d.requests.findIndex((x) => x.id === id);
          if (ix < 0) return null;
          const request = d.requests[ix];
          edit((dd) => ({ requests: dd.requests.filter((x) => x.id !== id) }));
          return {
            request,
            undo: () =>
              edit((dd) => {
                const requests = dd.requests.slice();
                requests.splice(ix, 0, request);
                return { requests };
              }),
          };
        },
        setUserRole: (userId, role) => edit((d) => ({ users: d.users.map((u) => (u.id === userId ? { ...u, role } : u)) })),

        addForecast: (f) => edit((d) => ({ forecasts: [...d.forecasts, { ...f, id: uid('f') }] })),
        removeForecast: (id) => {
          const d = get().data;
          const ix = d.forecasts.findIndex((f) => f.id === id);
          if (ix < 0) return null;
          const f = d.forecasts[ix];
          edit((dd) => ({ forecasts: dd.forecasts.filter((x) => x.id !== id) }));
          return () =>
            edit((dd) => {
              const forecasts = dd.forecasts.slice();
              forecasts.splice(ix, 0, f);
              return { forecasts };
            });
        },
        logRun: (forecastId, batches) =>
          edit((d) => {
            const f = d.forecasts.find((x) => x.id === forecastId);
            if (!f) return {};
            const recipe = d.recipes[f.productId] || [];
            return {
              ingredients: d.ingredients.map((i) => {
                const l = recipe.find((x) => x.ing === i.id);
                return l ? { ...i, inHand: round(Math.max(0, num(i.inHand) - num(l.qty) * batches)) } : i;
              }),
              forecasts: d.forecasts
                .map((x) => (x.id === forecastId ? { ...x, batches: num(x.batches) - batches } : x))
                .filter((x) => num(x.batches) > 0),
            };
          }),

        createPO: (po) =>
          edit((d) => ({
            pos: [po, ...d.pos],
            ingredients: d.ingredients.map((i) => {
              const l = po.lines.find((x) => x.ing === i.id);
              return l ? { ...i, pipeline: round(num(i.pipeline) + l.qty) } : i;
            }),
          })),
        receivePO: (id) =>
          edit((d) => {
            const po = d.pos.find((p) => p.id === id);
            if (!po) return {};
            return {
              pos: d.pos.map((p) => (p.id === id ? { ...p, status: 'Received' as const, received: today() } : p)),
              ingredients: d.ingredients.map((i) => {
                const l = po.lines.find((x) => x.ing === i.id);
                return l
                  ? { ...i, inHand: round(num(i.inHand) + l.qty), pipeline: round(Math.max(0, num(i.pipeline) - l.qty)) }
                  : i;
              }),
            };
          }),

        setRecipeQty: (productId, ing, qty) =>
          edit((d) => ({
            recipes: { ...d.recipes, [productId]: (d.recipes[productId] || []).map((x) => (x.ing === ing ? { ...x, qty } : x)) },
          })),
        setProductField: (productId, field, v) => mapProduct(productId, (p) => ({ ...p, [field]: v })),
        setBatchKg: (productId, v) =>
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
          }),

        resetData: () => set({ data: seed() }),
      };
    },
    {
      name: 'stockops-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ data: s.data, session: s.session }),
      // Rehydrated from <StoreHydrator /> after mount so server and first client render match.
      skipHydration: true,
    },
  ),
);

const subscribeHydration = (cb: () => void) => useStore.persist.onFinishHydration(cb);

/** False on the server and during hydration; true once localStorage has been read. */
export function useHydrated() {
  return useSyncExternalStore(subscribeHydration, () => useStore.persist.hasHydrated(), () => false);
}

export const useData = () => useStore((s) => s.data);
