'use client';

import { useSyncExternalStore } from 'react';
import { SIDEBAR_KEY as KEY } from './boot';

/** Desktop sidebar: full width, or collapsed to icons. Kept per device as data-sidebar on <html>. */
const EVENT = 'stockops-sidebar';

const isCollapsed = () => document.documentElement.dataset.sidebar === 'collapsed';

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(KEY, collapsed ? 'collapsed' : 'open');
  } catch {
    // Private mode: applies until the page is closed.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export const useSidebarCollapsed = () => useSyncExternalStore(subscribe, isCollapsed, () => false);
