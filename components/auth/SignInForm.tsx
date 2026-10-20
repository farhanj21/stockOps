'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DEMO_PASS } from '@/lib/roles';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import type { User } from '@/lib/types';
import { Field } from './Field';

type Errors = { user?: string; pass?: string };

const emailOf = (u: User) => String(u.email || u.username + '@plant1.co').toLowerCase();

export function SignInForm() {
  const users = useStore((s) => s.data.users);
  const signIn = useStore((s) => s.signIn);
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<Errors>({});

  const demoAccounts = ['u1', 'u2', 'u3'].map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = user.trim().toLowerCase();
    const next: Errors = {};
    if (!q) next.user = 'This field is required.';
    if (!pass) next.pass = 'This field is required.';
    const found = q ? users.find((x) => x.username.toLowerCase() === q || emailOf(x) === q) : undefined;
    if (q && !found) next.user = 'No account found for that username or email.';
    else if (found && pass && pass.length < 6) next.pass = 'Incorrect password. Try again.';
    if (next.user || next.pass || !found) {
      setErr(next);
      return;
    }
    signIn(found);
    useUI.getState().set({ query: '', sheetOpen: false });
    toast(`Signed in as ${found.name} · ${found.role}`);
    router.replace('/');
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
        {err.pass && <div className="field-err">{err.pass}</div>}
      </div>
      <button type="submit" className="btn btn-primary btn-lg">
        Sign in
      </button>
      <div className="divider-label">
        <span />
        Demo accounts
        <span />
      </div>
      <div className="demo-pills">
        {demoAccounts.map((u) => (
          <button
            key={u.id}
            type="button"
            className="demo-pill"
            onClick={() => {
              setUser(u.username);
              setPass(DEMO_PASS);
              setShow(false);
              setErr({});
            }}
          >
            {u.role} · {u.name.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="auth-switch">
        New to StockOps?
        <Link href="/signup" className="btn-link">
          Request access
        </Link>
      </div>
    </form>
  );
}
