'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Toast } from './Toast';

/** App-wide client bits: load saved data, register the service worker, show toasts. */
export function Providers() {
  useEffect(() => {
    void useStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  return <Toast />;
}
