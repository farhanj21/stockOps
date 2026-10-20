'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';
import { PERMS } from './roles';
import { useStore } from './store';
import { useUI, type UIState } from './ui';

export type Tab = 'home' | 'stock' | 'plan' | 'orders' | 'setup';

export const TAB_PATH: Record<Tab, string> = {
  home: '/',
  stock: '/stock',
  plan: '/plan',
  orders: '/orders',
  setup: '/setup',
};

export function tabOf(pathname: string): Tab {
  const seg = pathname.split('/')[1];
  return (Object.keys(TAB_PATH) as Tab[]).find((t) => t === seg) ?? 'home';
}

/** Signed-in user, their active role and what that role may do. */
export function useCurrentUser() {
  const session = useStore((s) => s.session);
  const users = useStore((s) => s.data.users);
  const role = session?.role ?? 'Admin';
  const user = users.find((u) => u.id === session?.userId) ?? users.find((u) => u.role === role) ?? users[0];
  return { user, role, perms: PERMS[role] };
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
