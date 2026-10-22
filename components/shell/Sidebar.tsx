'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { TAB_PATH, useCurrentUser, type Tab } from '@/lib/hooks';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar';
import { AccountMenu } from './AccountMenu';
import { onNavigate, useNavItems } from './nav';

export function Sidebar({ tab }: { tab: Tab }) {
  const items = useNavItems();
  const { org } = useCurrentUser();
  const collapsed = useSidebarCollapsed();

  return (
    <aside className="sidebar w-only">
      <div className="side-brand">
        <Logo size="md" src={org?.logoUrl} />
        <div className="min0 side-text" style={{ flex: 1 }}>
          <div className="side-name">StockOps</div>
          <div className="side-plant ellipsis">{org?.name}</div>
        </div>
        <button
          type="button"
          className="side-toggle"
          onClick={() => setSidebarCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={15} stroke={2} />
        </button>
      </div>
      <div className="side-label">Workspace</div>
      <nav className="col" style={{ gap: 2 }} aria-label="Main">
        {items.map((it) => (
          <Link
            key={it.tab}
            href={TAB_PATH[it.tab]}
            className="side-item"
            aria-current={tab === it.tab ? 'page' : undefined}
            title={collapsed ? it.label : undefined}
            onClick={() => onNavigate(it.tab)}
          >
            <span className="side-ico">
              <Icon name={it.icon} size={18} stroke={1.9} />
            </span>
            <span className="side-text" style={{ flex: 1 }}>
              {it.label}
            </span>
            {!!it.badge?.count && <span className={`side-count ${it.badge.tone}`}>{it.badge.count}</span>}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <AccountMenu variant="sidebar" />
    </aside>
  );
}
