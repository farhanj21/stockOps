'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { signIn } from '@/app/actions';
import type { SessionInfo } from '@/lib/api';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { Field } from './Field';

type Errors = { user?: string; pass?: string };

export function SignInForm() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => r.json() as Promise<SessionInfo>)
      .then(setSession)
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!user.trim()) next.user = 'This field is required.';
    if (!pass) next.pass = 'This field is required.';
    if (next.user || next.pass) return setErr(next);

    setBusy(true);
    try {
      const res = await signIn(user, pass);
      if (!res.ok) {
        setErr(res.fieldErrors ?? { pass: res.error });
        return;
      }
      useStore.getState().clear();
      useUI.getState().set({ query: '', sheetOpen: false });
      toast(`Signed in as ${res.value.name} · ${res.value.role}`);
      router.replace('/');
    } catch {
      setErr({ pass: "Couldn't reach the server. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <div>
        <h1 className="auth-title">Sign in</h1>
        <div className="auth-sub">Welcome back. Use your plant account.</div>
      </div>
      <Field
        id="si-user"
        label="Username or email"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        placeholder="e.g. areyes"
        value={user}
        error={err.user}
        onChange={(e) => {
          setUser(e.target.value);
          setErr((x) => ({ ...x, user: undefined }));
        }}
      />
      <div>
        <div className="label-row">
          <label htmlFor="si-pass" className="field-label" style={{ marginBottom: 0 }}>
            Password
          </label>
          <Link href="/forgot" className="btn-link" style={{ fontSize: 12, textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>
        <div className="input-shell" style={{ height: 48 }} aria-invalid={!!err.pass}>
          <input
            id="si-pass"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setErr((x) => ({ ...x, pass: undefined }));
            }}
          />
          <button type="button" className="pass-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {err.pass && (
          <div className="field-err" role="alert">
            {err.pass}
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {!!session?.demoAccounts.length && (
        <>
          <div className="divider-label">
            <span />
            Demo accounts
            <span />
          </div>
          <div className="demo-pills">
            {session.demoAccounts.map((a) => (
              <button
                key={a.username}
                type="button"
                className="demo-pill"
                onClick={() => {
                  setUser(a.username);
                  setPass(session.demoPassword ?? '');
                  setShow(false);
                  setErr({});
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="auth-switch">
        New to StockOps?
        <Link href="/signup" className="btn-link">
          Request access
        </Link>
      </div>
    </form>
  );
}
