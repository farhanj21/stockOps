'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { TAB_PATH, useCurrentUser, type Tab } from '@/lib/hooks';
import { AccountMenu } from './AccountMenu';
import { onNavigate, useNavItems } from './nav';

export function Sidebar({ tab }: { tab: Tab }) {
  const items = useNavItems();
  const { org } = useCurrentUser();

  return (
    <aside className="sidebar w-only">
      <div className="side-brand">
        <Logo size="md" />
        <div className="min0">
          <div className="side-name">StockOps</div>
          <div className="side-plant ellipsis">{org?.name}</div>
        </div>
      </div>
      <div className="side-label">Workspace</div>
      <nav className="col" style={{ gap: 2 }} aria-label="Main">
        {items.map((it) => (
          <Link
            key={it.tab}
            href={TAB_PATH[it.tab]}
            className="side-item"
            aria-current={tab === it.tab ? 'page' : undefined}
            onClick={() => onNavigate(it.tab)}
          >
            <span className="side-ico">
              <Icon name={it.icon} size={18} stroke={1.9} />
            </span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {!!it.badge?.count && <span className={`side-count ${it.badge.tone}`}>{it.badge.count}</span>}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <AccountMenu variant="sidebar" />
    </aside>
  );
}
