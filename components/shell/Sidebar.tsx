'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { initialsOf } from '@/lib/format';
import { TAB_PATH, useCurrentUser, type Tab } from '@/lib/hooks';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { onNavigate, useNavItems } from './nav';

export function Sidebar({ tab }: { tab: Tab }) {
  const items = useNavItems();
  const { user, role, baseRole } = useCurrentUser();
  const signOut = useStore((s) => s.signOut);
  const openSheet = useUI((s) => s.openSheet);
  const router = useRouter();

  return (
    <aside className="sidebar w-only">
      <div className="side-brand">
        <Logo size="md" />
        <div className="min0">
          <div className="side-name">StockOps</div>
          <div className="side-plant">Plant 1 · Chocolate lines</div>
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
      <button type="button" className="side-account" onClick={() => openSheet('account')}>
        <span className="avatar" style={{ width: 36, height: 36 }}>
          {initialsOf(user.name)}
        </span>
        <span className="row-main" style={{ gap: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{user.name}</span>
          <span style={{ fontSize: 11, color: 'var(--on-navy)' }}>{role} · {baseRole === 'Admin' ? 'switch role' : 'account'}</span>
        </span>
        <Icon name="chevronRight" size={16} color="var(--on-navy-2)" />
      </button>
      <button
        type="button"
        className="side-signout"
        onClick={async () => {
          await signOut();
          router.replace('/signin');
        }}
      >
        <Icon name="logout" size={16} />
        Sign out
      </button>
    </aside>
  );
}
