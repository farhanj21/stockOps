'use client';

import type { IconName } from '@/components/Icon';
import { useCurrentUser, type Tab } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';

export interface NavItem {
  tab: Tab;
  label: string;
  short: string;
  icon: IconName;
  badge?: { count: number; tone: 'danger' | 'gold' };
}

/** Tabs the current role can see, with live counts. */
export function useNavItems(): NavItem[] {
  const { perms } = useCurrentUser();
  const m = useModel();
  const pending = useStore((s) => s.data.requests.length);
  const items: (NavItem | false)[] = [
    { tab: 'home', label: 'Dashboard', short: 'Home', icon: 'home' },
    { tab: 'stock', label: 'Stock', short: 'Stock', icon: 'box', badge: { count: m.alerts.length, tone: 'danger' } },
    perms.plan && { tab: 'plan', label: 'Production plan', short: 'Plan', icon: 'calendar' },
    { tab: 'orders', label: 'Purchase orders', short: 'Orders', icon: 'truck', badge: { count: m.suggestions.length, tone: 'gold' } },
    perms.setup && { tab: 'setup', label: 'Setup', short: 'Setup', icon: 'sliders', badge: { count: pending, tone: 'gold' } },
  ];
  return items.filter((x): x is NavItem => !!x);
}

/** Tab links reset search and close sheets, like any other tab switch. */
export function onNavigate(tab: Tab) {
  useUI.getState().set({ query: '', sheetOpen: false, ...(tab === 'stock' ? { stockFilter: 'all' as const } : {}) });
}
