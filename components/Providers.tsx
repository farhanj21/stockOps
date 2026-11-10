'use client';

import { useEffect } from 'react';
import '@/lib/install'; // start listening for the browser's install prompt as early as possible
import { ConfirmDialog } from './ConfirmDialog';
import { Toast } from './Toast';

/** App-wide client bits: register the service worker, show toasts. */
export function Providers() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // Dev: a worker left over from a production run (same localhost:3000) would serve stale code
      // from its cache and make the page reload over and over. Remove it and its cache.
      void navigator.serviceWorker.getRegistrations().then(async (regs) => {
        if (!regs.length) return;
        await Promise.all(regs.map((r) => r.unregister()));
        if ('caches' in window) await Promise.all((await caches.keys()).filter((k) => k.startsWith('stockops-')).map((k) => caches.delete(k)));
        // Load once more without the worker so the page gets fresh code.
        if (navigator.serviceWorker.controller) window.location.reload();
      });
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  return (
    <>
      <Toast />
      <ConfirmDialog />
    </>
  );
}
