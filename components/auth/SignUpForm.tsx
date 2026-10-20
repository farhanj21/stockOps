'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { EMAIL_RE, today } from '@/lib/format';
import { ROLE_DESC } from '@/lib/roles';
import { useStore } from '@/lib/store';
import type { Role } from '@/lib/types';
import { Field } from './Field';

type Errors = Partial<Record<'name' | 'email' | 'pass' | 'pass2' | 'agree', string>>;

const TEAMS: Role[] = ['Warehouse', 'Production', 'Admin'];
const EMPTY = { name: '', email: '', role: 'Warehouse' as Role, pass: '', pass2: '', agree: false };

export function SignUpForm() {
  const users = useStore((s) => s.data.users);
  const requests = useStore((s) => s.data.requests);
  const addRequest = useStore((s) => s.addRequest);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K], clear: (keyof Errors)[] = []) {
    setForm((f) => ({ ...f, [key]: value }));
    setErr((e) => {
      const next = { ...e };
      [key as keyof Errors, ...clear].forEach((k) => delete next[k]);
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    const next: Errors = {};
    if (!form.name.trim()) next.name = 'This field is required.';
    if (!email) next.email = 'This field is required.';
    else if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    else if (users.some((u) => u.email.toLowerCase() === email) || requests.some((r) => r.email === email))
      next.email = 'An account or request already exists for this email.';
    if (!form.pass) next.pass = 'This field is required.';
    else if (form.pass.length < 8) next.pass = 'Use at least 8 characters.';
    else if (form.pass2 !== form.pass) next.pass2 = 'Passwords must match.';
    if (!form.agree) next.agree = 'Accept the policy to continue.';
    if (Object.keys(next).length) {
      setErr(next);
      return;
    }
    addRequest({ name: form.name.trim(), email, role: form.role, date: today() });
    setSentTo(email);
    setForm(EMPTY);
  }

  if (sentTo) {
    return (
      <div className="auth-done">
        <div className="done-ico ok">
          <Icon name="check" size={26} stroke={2.5} />
        </div>
        <h1 className="done-title">Request sent</h1>
        <div className="done-text">
          Your plant admin will review it. We&apos;ll email <strong>{sentTo}</strong> once your account is approved.
        </div>
        <div className="status-row">
          <span>Status</span>
          <span className="pill warn">Pending approval</span>
        </div>
        <Link href="/signin" className="btn btn-outline" style={{ width: '100%', height: 48, fontSize: 14, textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </div>
    );
  }

  const passErr = err.pass || err.pass2;

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <div>
        <h1 className="auth-title">Request access</h1>
        <div className="auth-sub">Your plant admin approves new accounts and confirms your role.</div>
      </div>
      <Field
        id="su-name"
        label="Full name"
        type="text"
        autoComplete="name"
        value={form.name}
        error={err.name}
        onChange={(e) => update('name', e.target.value)}
      />
      <Field
        id="su-email"
        label="Work email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="name@plant1.co"
        value={form.email}
        error={err.email}
        onChange={(e) => update('email', e.target.value)}
      />
      <div>
        <div id="su-team" className="field-label" style={{ marginBottom: 6 }}>
          Team
        </div>
        <div className="col" style={{ gap: 8 }} role="radiogroup" aria-labelledby="su-team">
          {TEAMS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={form.role === r}
              className="radio-card"
              style={{ borderRadius: 12 }}
              onClick={() => update('role', r)}
            >
              <span className="radio-dot sm" />
              <span className="col" style={{ gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r}</span>
                <span className="row-sub">{ROLE_DESC[r]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid2" style={{ gap: 10 }}>
        <div>
          <label htmlFor="su-pass" className="field-label">
            Password
          </label>
          <input
            id="su-pass"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.pass}
            aria-invalid={!!err.pass}
            aria-describedby="su-pass-note"
            onChange={(e) => update('pass', e.target.value, ['pass2'])}
          />
        </div>
        <div>
          <label htmlFor="su-pass2" className="field-label">
            Confirm
          </label>
          <input
            id="su-pass2"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.pass2}
            aria-invalid={!!err.pass2}
            aria-describedby="su-pass-note"
            onChange={(e) => update('pass2', e.target.value)}
          />
        </div>
      </div>
      <div id="su-pass-note" className={passErr ? 'field-err' : 'subtle'} style={{ margin: '-10px 0 0', fontSize: 12 }}>
        {passErr || 'At least 8 characters.'}
      </div>
      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={form.agree}
          className="check-row"
          onClick={() => update('agree', !form.agree)}
        >
          <span className={`check-box${form.agree ? ' on' : ''}${err.agree ? ' err' : ''}`}>
            {form.agree && <Icon name="check" size={13} stroke={3} />}
          </span>
          <span>I&apos;ll follow the plant&apos;s stock-handling and data policy.</span>
        </button>
        {err.agree && <div className="field-err" style={{ marginTop: 0 }}>{err.agree}</div>}
      </div>
      <button type="submit" className="btn btn-primary btn-lg">
        Send request
      </button>
      <div className="auth-switch">
        Already have an account?
        <Link href="/signin" className="btn-link">
          Sign in
        </Link>
      </div>
    </form>
  );
}
