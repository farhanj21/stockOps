'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Assistant } from '@/components/assistant/Assistant';
import { InstallBanner } from '@/components/InstallApp';
import { Sheet } from '@/components/sheets/Sheet';
import { tabOf, useCurrentUser, type Tab } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import { plural } from '@/lib/format';
import { BottomNav, MobileHeader } from './MobileChrome';
import { SearchBox, SearchPopover } from './Search';
import { Sidebar } from './Sidebar';

export function useGreeting() {
  const { user, role } = useCurrentUser();
  const hr = new Date().getHours();
  const greeting = `${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${user.name.split(' ')[0]}`;
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ` · ${role} view`;
  return { greeting, dateLabel };
}

export function useStockSummary() {
  const m = useModel();
  return `${plural(m.ings.length, 'material')} · ${m.alerts.length} below par`;
}

function TopBar({ tab }: { tab: Tab }) {
  const { greeting, dateLabel } = useGreeting();
  const stockSummary = useStockSummary();
  const titles: Record<Tab, [string, string]> = {
    home: [greeting, dateLabel],
    stock: ['Stock', stockSummary],
    plan: ['Production', 'Plan batches, record each batch made, and see monthly and yearly totals.'],
    orders: ['Purchase orders', 'Quantities round up to full supplier packs.'],
    setup: ['Setup', 'Products, recipes and materials. Changes recalculate capacity and orders instantly.'],
    team: ['Team', 'Create accounts for your warehouse, production and admin people.'],
  };
  const [title, sub] = titles[tab];
  return (
    <div className="topbar w-only">
      <div className="min0" style={{ flex: 1 }}>
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-sub">{sub}</div>
      </div>
      <div className="search-wrap">
        <SearchBox size="top" />
        <SearchPopover />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tab = tabOf(pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app-root">
      <Sidebar tab={tab} />
      <div className="app-col">
        <MobileHeader />
        <TopBar tab={tab} />
        <main ref={mainRef} className="app-main">
          {/* Keyed by route so each page enters with the page transition. */}
          <div className="page-wrap" key={pathname}>
            {tab === 'home' && <InstallBanner />}
            {children}
          </div>
        </main>
        <BottomNav tab={tab} />
      </div>
      <Sheet />
      <Assistant />
    </div>
  );
}
