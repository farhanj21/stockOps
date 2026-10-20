'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { useHydrated, useStore } from '@/lib/store';

/** Everything behind sign-in. Data comes from localStorage, so nothing renders until it's loaded. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const signedIn = useStore((s) => !!s.session);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !signedIn) router.replace('/signin');
  }, [hydrated, signedIn, router]);

  if (!hydrated || !signedIn) return <div className="splash" />;
  return <AppShell>{children}</AppShell>;
}
