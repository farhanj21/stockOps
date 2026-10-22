'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { TAB_PATH, useCurrentUser, type Tab } from '@/lib/hooks';
import { AccountMenu } from './AccountMenu';
import { onNavigate, useNavItems } from './nav';

export function MobileHeader() {
  const { org } = useCurrentUser();
  return (
    <header className="m-header n-only">
      <div className="m-header-row">
        <Logo size="sm" src={org?.logoUrl} />
        <div className="row-main" style={{ gap: 0 }}>
          <span className="m-header-name">StockOps</span>
          <span className="side-plant ellipsis">{org?.name}</span>
        </div>
        <AccountMenu variant="header" />
      </div>
    </header>
  );
}

export function BottomNav({ tab }: { tab: Tab }) {
  const items = useNavItems();
  return (
    <nav className="bottom-nav n-only" aria-label="Main">
      {items.map((it) => (
        <Link
          key={it.tab}
          href={TAB_PATH[it.tab]}
          className="bn-item"
          aria-current={tab === it.tab ? 'page' : undefined}
          onClick={() => onNavigate(it.tab)}
        >
          <span className="bn-pill">
            <Icon name={it.icon} size={20} stroke={1.9} />
          </span>
          <span>{it.short}</span>
          {/* Stock's below-par count lives on the dashboard; the tab bar flags orders and requests. */}
          {it.tab !== 'stock' && !!it.badge?.count && (
            <span className={`bn-badge ${it.tab === 'orders' ? 'danger' : 'gold'}`}>{it.badge.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
