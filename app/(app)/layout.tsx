'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { useStore } from '@/lib/store';

const REFRESH_MS = 60_000;

/** Everything behind sign-in. Loads the user's data from the server and keeps it fresh. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const status = useStore((s) => s.status);
  const load = useStore((s) => s.load);
  const router = useRouter();

  useEffect(() => {
    void load();
    // Other people change stock too: refresh when the app comes back into view, and every minute while open.
    const refresh = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (status === 'signed-out') router.replace('/signin');
  }, [status, router]);

  if (status === 'offline') {
    return (
      <div className="splash offline">
        <div className="empty" style={{ maxWidth: 360 }}>
          <div className="empty-t">Can&apos;t reach StockOps</div>
          <div className="empty-s">Check your connection, then try again.</div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (status !== 'ready') return <div className="splash" />;
  return <AppShell>{children}</AppShell>;
}
