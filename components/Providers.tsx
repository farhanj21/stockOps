'use client';

import { useEffect } from 'react';
import { Toast } from './Toast';

/** App-wide client bits: register the service worker, show toasts. */
export function Providers() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  return <Toast />;
}
