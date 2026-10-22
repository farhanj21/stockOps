'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { changePassword } from '@/app/actions';
import { InstallButton } from '@/components/InstallApp';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { useInstallMode } from '@/lib/install';
import { ROLE_DESC, ROLES } from '@/lib/roles';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { SheetHeader } from './Sheet';

export function AccountSheet() {
  const { user, role, baseRole, isOwner, org, demo } = useCurrentUser();
  const switchRole = useStore((s) => s.switchRole);
  const signOut = useStore((s) => s.signOut);
  const replaceWithSample = useStore((s) => s.replaceWithSample);
  const setUI = useUI((s) => s.set);
  const go = useGo();
  const router = useRouter();
  const isAdmin = baseRole === 'Admin';
  const installMode = useInstallMode();

  return (
    <>
      <SheetHeader kicker="Account" title={user.name} />
      <div className="sheet-body">
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          @{user.username} · {isOwner ? 'Owner' : baseRole}
          {org && (
            <>
              <br />
              {org.name}
            </>
          )}
        </div>

        {/* Admins can preview other roles; it never grants more access than the account has. */}
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

        {installMode !== 'none' && (
          <div className="col" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div className="eyebrow">Install the app</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Put StockOps on this device&apos;s home screen so it opens full screen, like any app.
            </div>
            <InstallButton />
          </div>
        )}

        <ChangePassword />

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
          {demo && isOwner && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={async () => {
                if (!confirm('Replace every material, recipe, plan and purchase order with the sample chocolate plant? Team accounts stay.')) return;
                if (!(await replaceWithSample())) return;
                go('home', { poExcluded: {}, planBatches: 4, planProduct: '', setupProduct: '', planDate: null });
                toast('Sample data loaded.');
              }}
            >
              Load sample data
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function ChangePassword() {
  const submit = useStore((s) => s.submit);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Change my password
      </button>
    );

  async function save(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setErr({ next: 'Use at least 8 characters.' });
    setBusy(true);
    const res = await submit(() => changePassword(current, next));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { current: res.error });
    toast('Password changed. Other devices were signed out.');
    setOpen(false);
    setCurrent('');
    setNext('');
  }

  return (
    <form className="col" style={{ gap: 10 }} onSubmit={save} noValidate>
      <div className="eyebrow">Change my password</div>
      <div>
        <label htmlFor="cp-cur" className="field-label">
          Current password
        </label>
        <input id="cp-cur" className="input" type="password" autoComplete="current-password" value={current} aria-invalid={!!err.current} onChange={(e) => setCurrent(e.target.value)} />
        {err.current && <div className="field-err">{err.current}</div>}
      </div>
      <div>
        <label htmlFor="cp-new" className="field-label">
          New password
        </label>
        <input id="cp-new" className="input" type="password" autoComplete="new-password" value={next} aria-invalid={!!err.next} onChange={(e) => setNext(e.target.value)} />
        {err.next && <div className="field-err">{err.next}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
