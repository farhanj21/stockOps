'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';
import { PERMS } from './roles';
import { useStore } from './store';
import type { Role, User } from './types';
import { useUI, type UIState } from './ui';

export type Tab = 'home' | 'stock' | 'plan' | 'orders' | 'setup' | 'team';

export const TAB_PATH: Record<Tab, string> = {
  home: '/',
  stock: '/stock',
  plan: '/plan',
  orders: '/orders',
  setup: '/setup',
  team: '/team',
};

export function tabOf(pathname: string): Tab {
  const seg = pathname.split('/')[1];
  return (Object.keys(TAB_PATH) as Tab[]).find((t) => t === seg) ?? 'home';
}

/** Signed-in user, their active role and what that role may do (the server enforces the same rules). */
export function useCurrentUser() {
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.data.users);
  const role: Role = me?.role ?? 'Production';
  const user: User = users.find((u) => u.id === me?.userId) ?? { id: me?.userId ?? '', name: '—', username: '', email: '', role, isOwner: false };
  return { user, role, baseRole: me?.baseRole ?? role, isOwner: me?.isOwner ?? false, org: me?.org ?? null, demo: me?.demo ?? false, perms: PERMS[role] };
}

/** Matches the desktop breakpoint in the stylesheets. */
const WIDE_QUERY = '(min-width: 960px)';

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function useIsWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}

/** Switch tab, clearing search and closing any open sheet, optionally presetting screen state. */
export function useGo() {
  const router = useRouter();
  return useCallback(
    (tab: Tab, extra?: Partial<UIState>) => {
      useUI.getState().set({ query: '', sheetOpen: false, ...extra });
      router.push(TAB_PATH[tab]);
    },
    [router],
  );
}
