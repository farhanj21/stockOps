'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { changePassword } from '@/app/actions';
import { Icon, type IconName } from '@/components/Icon';
import { initialsOf } from '@/lib/format';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { promptInstall, useInstallMode } from '@/lib/install';
import { useStore } from '@/lib/store';
import { confirmDialog, toast, useUI } from '@/lib/ui';

type Dialog = 'password' | 'install' | null;

/**
 * The signed-in person's menu: opens up from the name at the bottom of the sidebar (desktop)
 * or down from the avatar in the header (phone).
 */
export function AccountMenu({ variant }: { variant: 'sidebar' | 'header' }) {
  const { user, role, isOwner, org, demo } = useCurrentUser();
  const signOut = useStore((s) => s.signOut);
  const replaceWithSample = useStore((s) => s.replaceWithSample);
  const setUI = useUI((s) => s.set);
  const installMode = useInstallMode();
  const go = useGo();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const roleLabel = isOwner ? 'Owner' : role;

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const items: { icon: IconName; label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[] = [
    { icon: 'key', label: 'Change password', onClick: run(() => setDialog('password')) },
    {
      icon: 'download',
      label: 'Install app',
      hidden: installMode === 'none',
      onClick: run(async () => {
        if (installMode === 'ios') return setDialog('install');
        if (await promptInstall()) toast('StockOps installed. Open it from your home screen.');
      }),
    },
    {
      icon: 'box',
      label: 'Load sample data',
      hidden: !(demo && isOwner),
      onClick: run(async () => {
        const ok = await confirmDialog({
          title: 'Load the sample plant?',
          body: 'Every material, recipe, plan and purchase order is replaced with the sample chocolate plant. Team accounts stay.',
          confirmLabel: 'Replace my data',
          danger: true,
        });
        if (!ok || !(await replaceWithSample())) return;
        go('home', { poExcluded: {}, poPacks: {}, poExtra: [], planBatches: 4, planProduct: '', setupProduct: '', planDate: null });
        toast('Sample data loaded.');
      }),
    },
    {
      icon: 'logout',
      label: 'Sign out',
      danger: true,
      onClick: run(async () => {
        setUI({ sheetOpen: false, query: '' });
        await signOut();
        router.replace('/signin');
      }),
    },
  ];

  return (
    <div ref={wrapRef} className={`acct acct-${variant}`}>
      {variant === 'sidebar' ? (
        <button type="button" className="side-account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="avatar" style={{ width: 36, height: 36 }}>
            {initialsOf(user.name)}
          </span>
          <span className="row-main" style={{ gap: 0 }}>
            <span className="ellipsis" style={{ fontSize: 13, fontWeight: 700 }}>
              {user.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--on-navy)' }}>{roleLabel}</span>
          </span>
          <Icon name="chevronRight" size={16} color="var(--on-navy-2)" className="acct-chev" />
        </button>
      ) : (
        <button type="button" className="m-account" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{roleLabel}</span>
          <span className="avatar">{initialsOf(user.name)}</span>
        </button>
      )}

      {open && (
        <div className="acct-menu" role="menu" aria-label="Account">
          <div className="acct-head">
            <span className="avatar" style={{ width: 40, height: 40 }}>
              {initialsOf(user.name)}
            </span>
            <div className="min0">
              <div className="ellipsis" style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                {user.name}
              </div>
              <div className="row-sub ellipsis">
                @{user.username} · {roleLabel}
              </div>
              {org && <div className="row-sub ellipsis">{org.name}</div>}
            </div>
          </div>
          {items
            .filter((it) => !it.hidden)
            .map((it) => (
              <button key={it.label} type="button" role="menuitem" className={`acct-item${it.danger ? ' danger' : ''}`} onClick={it.onClick}>
                <Icon name={it.icon} size={16} />
                {it.label}
              </button>
            ))}
        </div>
      )}

      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'install' && (
        <Modal title="Install StockOps" onClose={() => setDialog(null)}>
          <ol className="ios-steps" style={{ textAlign: 'left' }}>
            <li>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
            </li>
            <li>
              Scroll and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>. StockOps appears on your Home Screen.
            </li>
          </ol>
          <button type="button" className="btn btn-primary btn-lg" style={{ marginTop: 16 }} onClick={() => setDialog(null)}>
            Got it
          </button>
        </Modal>
      )}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const submit = useStore((s) => s.submit);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setErr({ next: 'Use at least 8 characters.' });
    setBusy(true);
    const res = await submit(() => changePassword(current, next));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { current: res.error });
    toast('Password changed. Your other devices were signed out.');
    onClose();
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="col" style={{ gap: 12, textAlign: 'left', marginTop: 4 }} onSubmit={save} noValidate>
        <div>
          <label htmlFor="cp-cur" className="field-label">
            Current password
          </label>
          <input id="cp-cur" className="input" type="password" autoComplete="current-password" autoFocus value={current} aria-invalid={!!err.current} onChange={(e) => setCurrent(e.target.value)} />
          {err.current && <div className="field-err">{err.current}</div>}
        </div>
        <div>
          <label htmlFor="cp-new" className="field-label">
            New password
          </label>
          <input id="cp-new" className="input" type="password" autoComplete="new-password" value={next} aria-invalid={!!err.next} onChange={(e) => setNext(e.target.value)} />
          {err.next ? <div className="field-err">{err.next}</div> : <div className="subtle" style={{ marginTop: 4, fontSize: 12 }}>At least 8 characters.</div>}
        </div>
        <div className="confirm-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Centred dialog (bottom sheet on phones) sharing the confirm dialog's look. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="confirm-layer">
      <div className="confirm-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" className="confirm-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
