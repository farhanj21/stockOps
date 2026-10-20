'use client';

import { useRouter } from 'next/navigation';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { ROLE_DESC, ROLES } from '@/lib/roles';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

export function AccountSheet() {
  const { user, role } = useCurrentUser();
  const switchRole = useStore((s) => s.switchRole);
  const signOut = useStore((s) => s.signOut);
  const resetData = useStore((s) => s.resetData);
  const setUI = useUI((s) => s.set);
  const go = useGo();
  const router = useRouter();

  return (
    <>
      <SheetHeader kicker="Account" title={user.name} />
      <div className="sheet-body">
        <div className="muted" style={{ fontSize: 13 }}>
          Signed in as {user.name} · @{user.username}
        </div>
        <div>
          <div id="role-switch" className="eyebrow" style={{ marginBottom: 8 }}>
            Switch role (demo)
          </div>
          <div className="col" style={{ gap: 8 }} role="radiogroup" aria-labelledby="role-switch">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={r === role}
                className="radio-card"
                style={{ minHeight: 64, padding: '12px 14px' }}
                onClick={() => {
                  switchRole(r);
                  setUI({ sheetOpen: false });
                }}
              >
                <span className="radio-dot" />
                <span className="col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{r}</span>
                  <span className="row-sub">{ROLE_DESC[r]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setUI({ sheetOpen: false, query: '' });
              signOut();
              router.replace('/signin');
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              resetData();
              go('home', { poExcluded: {}, planBatches: 4, planProduct: 'fudge', planDate: null });
              toast('Demo data reset.');
            }}
          >
            Reset demo data
          </button>
        </div>
      </div>
    </>
  );
}
