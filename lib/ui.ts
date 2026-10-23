'use client';

import { create } from 'zustand';
import type { ImportRow } from './import-plan';
import type { Num } from './types';

export type { ImportRow } from './import-plan';

export type SheetType = 'material' | 'product' | 'batch' | 'import';
export type PlanTab = 'plan' | 'batches' | 'reports';
export type StockFilter = 'all' | 'low' | 'ingredient' | 'packaging';
export type SetupTab = 'recipes' | 'materials';

export interface ToastAction {
  label: string;
  fn: () => void;
}

export interface Toast {
  id: number;
  text: string;
  action: ToastAction | null;
}

export type ImportState =
  | { stage: 'pick' }
  | { stage: 'loading'; file: string }
  | { stage: 'error'; file: string; err: string }
  | { stage: 'preview'; file: string; sheet: string; rows: ImportRow[] };

export interface UIState {
  query: string;
  stockFilter: StockFilter;
  planProduct: string;
  planBatches: Num;
  /** null until the planner picks its default (a week out). */
  planDate: string | null;
  setupTab: SetupTab;
  setupProduct: string;
  poExcluded: Record<string, boolean>;
  /** Pack counts the user typed over the suggestion (or for materials they added). */
  poPacks: Record<string, Num>;
  /** Materials added to the order by hand, in the order they were added. */
  poExtra: string[];
  /** Production screen section. */
  planTab: PlanTab;
  /** Plan (forecast) to log the next batch against, or null for none. */
  runId: string | null;
  /** Product to log the next batch for when it isn't from a plan. */
  batchProduct: string | null;
  runBatches: number;
  imp: ImportState;
  sheet: { type: SheetType; id?: string } | null;
  sheetOpen: boolean;
  toast: Toast | null;

  set: (patch: Partial<UIState>) => void;
  openSheet: (type: SheetType, id?: string) => void;
  closeSheet: () => void;
  showToast: (text: string, action?: ToastAction | null) => void;
  dismissToast: () => void;
}

const TOAST_MS = 4500;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export const useUI = create<UIState>()((set) => ({
  query: '',
  stockFilter: 'all',
  planProduct: 'fudge',
  planBatches: 4,
  planDate: null,
  setupTab: 'recipes',
  setupProduct: 'fudge',
  poExcluded: {},
  poPacks: {},
  poExtra: [],
  planTab: 'plan',
  runId: null,
  batchProduct: null,
  runBatches: 1,
  imp: { stage: 'pick' },
  sheet: null,
  sheetOpen: false,
  toast: null,

  set: (patch) => set(patch),
  openSheet: (type, id) => set({ sheet: { type, id }, sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  showToast: (text, action = null) => {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastSeq, text, action } });
    toastTimer = setTimeout(() => set({ toast: null }), TOAST_MS);
  },
  dismissToast: () => {
    clearTimeout(toastTimer);
    set({ toast: null });
  },
}));

export const toast = (text: string, action?: ToastAction | null) => useUI.getState().showToast(text, action);

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

interface ConfirmState {
  open: ConfirmOptions & { resolve: (ok: boolean) => void } | null;
}

export const useConfirm = create<ConfirmState>()(() => ({ open: null }));

/** In-app replacement for window.confirm(): resolves true when the person confirms. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  useConfirm.getState().open?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ open: { ...opts, resolve } }));
}
