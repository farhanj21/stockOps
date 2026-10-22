'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { createOrganization } from '@/app/actions';
import { Icon } from '@/components/Icon';
import { EMAIL_RE } from '@/lib/format';
import { useStore } from '@/lib/store';
import { toast, useUI } from '@/lib/ui';
import { Field } from './Field';

type Key = 'orgName' | 'name' | 'email' | 'username' | 'password' | 'password2';
type Errors = Partial<Record<Key, string>>;

const EMPTY = { orgName: '', name: '', email: '', username: '', password: '', password2: '', sample: false };

/** Start a new organization. The person who creates it is its owner and adds everyone else from Team. */
export function CreateOrgForm() {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);

  function set<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setF((x) => ({ ...x, [k]: v }));
    setErr((e) => ({ ...e, [k]: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!f.orgName.trim()) next.orgName = 'This field is required.';
    if (!f.name.trim()) next.name = 'This field is required.';
    if (!EMAIL_RE.test(f.email.trim())) next.email = 'Enter a valid email address.';
    if (!f.username.trim()) next.username = 'This field is required.';
    if (f.password.length < 8) next.password = 'Use at least 8 characters.';
    else if (f.password2 !== f.password) next.password2 = 'Passwords must match.';
    if (Object.keys(next).length) return setErr(next);

    setBusy(true);
    try {
      const res = await createOrganization({ orgName: f.orgName, name: f.name, email: f.email, username: f.username, password: f.password, sample: f.sample });
      if (!res.ok) {
        setErr(res.fieldErrors ?? { orgName: res.error });
        return;
      }
      useStore.getState().clear();
      useUI.getState().set({ query: '', sheetOpen: false, setupTab: f.sample ? 'recipes' : 'materials' });
      toast(`Welcome, ${res.value.name.split(' ')[0]}. ${f.orgName.trim()} is ready.`);
      router.replace(f.sample ? '/' : '/setup');
    } catch {
      setErr({ orgName: "Couldn't reach the server. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <div className="auth-head">
        <h1 className="auth-title">Create your organization</h1>
        <p className="auth-sub">You&apos;ll be its owner. Once you&apos;re in, add your warehouse and production team from the Team menu.</p>
      </div>
      <Field id="co-org" label="Organization or plant name" placeholder="e.g. Karachi Foods — Plant 1" value={f.orgName} error={err.orgName} onChange={(e) => set('orgName', e.target.value)} />

      <div className="form-section">Your account</div>
      <Field
        id="co-name"
        label="Your full name"
        autoComplete="name"
        value={f.name}
        error={err.name}
        onChange={(e) => {
          set('name', e.target.value);
          if (!usernameTouched) set('username', e.target.value.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9._-]/g, '') ?? '');
        }}
      />
      <Field id="co-email" label="Work email" type="email" autoComplete="email" autoCapitalize="none" value={f.email} error={err.email} onChange={(e) => set('email', e.target.value)} />
      <Field
        id="co-user"
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        value={f.username}
        error={err.username}
        onChange={(e) => {
          setUsernameTouched(true);
          set('username', e.target.value.toLowerCase());
        }}
      />
      <div className="grid2" style={{ gap: 10 }}>
        <Field id="co-pass" label="Password" type="password" autoComplete="new-password" value={f.password} error={err.password} onChange={(e) => set('password', e.target.value)} />
        <Field id="co-pass2" label="Confirm" type="password" autoComplete="new-password" value={f.password2} error={err.password2} onChange={(e) => set('password2', e.target.value)} />
      </div>

      <button type="button" role="checkbox" aria-checked={f.sample} className="check-row sample-row" onClick={() => set('sample', !f.sample)}>
        <span className={`check-box${f.sample ? ' on' : ''}`}>{f.sample && <Icon name="check" size={13} stroke={3} />}</span>
        <span className="col" style={{ gap: 2 }}>
          <span style={{ fontWeight: 700 }}>Start with sample data</span>
          <span className="muted" style={{ fontSize: 12 }}>
            A chocolate plant with 20 materials, 3 recipes, plans and orders, to try things out. Leave unticked to start empty.
          </span>
        </span>
      </button>

      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Creating…' : 'Create organization'}
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
