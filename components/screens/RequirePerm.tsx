'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useCurrentUser } from '@/lib/hooks';
import type { Perms } from '@/lib/roles';

/** Sends roles without access back to the dashboard (e.g. after a role switch). */
export function RequirePerm({ perm, children }: { perm: keyof Perms; children: ReactNode }) {
  const { perms } = useCurrentUser();
  const allowed = perms[perm];
  const router = useRouter();

  useEffect(() => {
    if (!allowed) router.replace('/');
  }, [allowed, router]);

  return allowed ? children : null;
}
