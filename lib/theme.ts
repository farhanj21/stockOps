'use client';

import { useSyncExternalStore } from 'react';
import { THEME_KEY as KEY } from './boot';

/** Colour theme, kept per device. Light is the default and has no data-theme attribute. */
export type Theme = 'light' | 'dark' | 'mono';

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'mono', label: 'Mono' },
];

const EVENT = 'stockops-theme';

function current(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || t === 'mono' ? t : 'light';
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the theme still applies until the page is closed.
  }
  // Phone status bar / browser chrome follows the theme's navy.
  const navy = getComputedStyle(root).getPropertyValue('--navy').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', navy));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export const useTheme = () => useSyncExternalStore(subscribe, current, () => 'light' as Theme);
