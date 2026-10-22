'use client';

import { useSyncExternalStore } from 'react';

/** Chrome / Edge / Android's install prompt event (not in the DOM typings yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  // Browsers fire this once, early; keep it so an Install button can use it later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export type InstallMode = 'prompt' | 'ios' | 'none';

function current(): InstallMode {
  if (installed) return 'none';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'none';
  if (deferred) return 'prompt';
  // iPhone / iPad Safari has no install event; people use Share → Add to Home Screen.
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'none';
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** How this device can install the app right now: browser prompt, iOS instructions, or not at all (already installed / unsupported). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, current, () => 'none');
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}
