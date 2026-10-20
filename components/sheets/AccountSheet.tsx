'use client';

import { useRouter } from 'next/navigation';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { ROLE_DESC, ROLES } from '@/lib/roles';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

export function AccountSheet() {
  const { user, role, baseRole, demo } = useCurrentUser();
  const switchRole = useStore((s) => s.switchRole);
  const signOut = useStore((s) => s.signOut);
  const resetDemo = useStore((s) => s.resetDemo);
  const setUI = useUI((s) => s.set);
  const go = useGo();
  const router = useRouter();
  const isAdmin = baseRole === 'Admin';

  return (
    <>
      <SheetHeader kicker="Account" title={user.name} />
      <div className="sheet-body">
        <div className="muted" style={{ fontSize: 13 }}>
          Signed in as {user.name} · @{user.username} · {baseRole}
        </div>
        {/* Only Admins can preview other roles: it never grants more access than the account has. */}
        {isAdmin && (
          <div>
            <div id="role-switch" className="eyebrow" style={{ marginBottom: 8 }}>
              Preview as role
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
                    setUI({ sheetOpen: false });
                    void switchRole(r);
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
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              setUI({ sheetOpen: false, query: '' });
              await signOut();
              router.replace('/signin');
            }}
          >
            Sign out
          </button>
          {demo && isAdmin && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={async () => {
                if (!(await resetDemo())) return;
                go('home', { poExcluded: {}, planBatches: 4, planProduct: 'fudge', planDate: null });
                toast('Demo data reset.');
              }}
            >
              Reset demo data
            </button>
          )}
        </div>
      </div>
    </>
  );
}
