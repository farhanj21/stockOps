'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { initialsOf } from '@/lib/format';
import { TAB_PATH, useCurrentUser, type Tab } from '@/lib/hooks';
import { useUI } from '@/lib/ui';
import { onNavigate, useNavItems } from './nav';

export function MobileHeader() {
  const { user, role } = useCurrentUser();
  const openSheet = useUI((s) => s.openSheet);
  return (
    <header className="m-header n-only">
      <div className="m-header-row">
        <Logo size="sm" />
        <div className="row-main" style={{ gap: 0 }}>
          <span className="m-header-name">StockOps</span>
          <span className="side-plant">Plant 1 · Chocolate lines</span>
        </div>
        <button type="button" className="m-account" aria-label="Account and role" onClick={() => openSheet('account')}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{role}</span>
          <span className="avatar">{initialsOf(user.name)}</span>
        </button>
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
