'use client';

import { create } from 'zustand';
import type { ImportRow } from './import-plan';
import type { Num } from './types';

export type { ImportRow } from './import-plan';

export type SheetType = 'material' | 'product' | 'run' | 'import' | 'account';
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
  runId: string | null;
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
  runId: null,
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
