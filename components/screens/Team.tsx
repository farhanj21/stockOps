'use client';

import { useState, type FormEvent } from 'react';
import * as api from '@/app/actions';
import { FormField } from '@/components/FormField';
import { Icon } from '@/components/Icon';
import { initialsOf } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { generatePassword } from '@/lib/password-gen';
import { ROLE_DESC, ROLES } from '@/lib/roles';
import { useStore } from '@/lib/store';
import type { Role, User } from '@/lib/types';
import { confirmDialog, toast } from '@/lib/ui';

const MATRIX: [string, boolean, boolean, boolean][] = [
  ['Team accounts & organization', true, false, false],
  ['Products, recipes, costs, mix %', true, false, false],
  ['Materials, par levels & pack sizes', true, false, false],
  ['Log physical stock & receive deliveries', true, true, false],
  ['Forecasts & batches run', true, false, true],
  ['Alerts & purchase orders', true, true, true],
];

/** Admins create and manage every account in the organization. */
export function Team() {
  const users = useStore((s) => s.data.users);
  const [adding, setAdding] = useState(users.length <= 1);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Team
        </h1>
        <div className="page-sub">Create accounts for your warehouse, production and admin people.</div>
      </div>

      <div className="two-cols">
        <div className="col min0" style={{ gap: 22 }}>
          {created && <Credentials {...created} onDone={() => setCreated(null)} />}
          {adding ? (
            <AddMember
              onCancel={users.length > 1 ? () => setAdding(false) : undefined}
              onCreated={(c) => {
                setCreated(c);
                setAdding(false);
              }}
            />
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} stroke={2.2} />
              Add a person
            </button>
          )}
          <section>
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                People
              </h2>
              <span className="sec-meta">{users.length}</span>
            </div>
            <div className="card flat clip list">
              {users.map((u) => (
                <Member key={u.id} u={u} />
              ))}
            </div>
          </section>
        </div>

        <div className="col min0" style={{ gap: 22 }}>
          <Organization />
          <section>
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                What each role can do
              </h2>
            </div>
            <div className="card flat clip" style={{ fontSize: 13 }} role="table" aria-label="Access by role">
              <div className="matrix-row matrix-head" role="row">
                <span role="columnheader">Action</span>
                <span role="columnheader">Admin</span>
                <span role="columnheader" title="Warehouse">
                  Whse
                </span>
                <span role="columnheader" title="Production">
                  Prod
                </span>
              </div>
              <div className="list">
                {MATRIX.map(([action, ...allowed]) => (
                  <div key={action} className="matrix-row" role="row">
                    <span role="cell">{action}</span>
                    {allowed.map((yes, ix) => (
                      <span key={ix} role="cell" className={yes ? 'matrix-yes' : 'matrix-no'} aria-label={yes ? 'Yes' : 'No'}>
                        {yes ? '✓' : '—'}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

type Errors = Partial<Record<'name' | 'username' | 'email' | 'password', string>>;

function AddMember({ onCancel, onCreated }: { onCancel?: () => void; onCreated: (c: { name: string; username: string; password: string }) => void }) {
  const submit = useStore((s) => s.submit);
  const [form, setForm] = useState({ name: '', username: '', email: '', role: 'Warehouse' as Role, password: generatePassword() });
  const [err, setErr] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [touchedUsername, setTouchedUsername] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErr((e) => ({ ...e, [k]: undefined }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await submit(() => api.createMember(form));
    setBusy(false);
    if (!res.ok) {
      setErr({ ...(res.fieldErrors ?? {}), ...(res.fieldErrors ? {} : { name: res.error }) });
      return;
    }
    toast(`Account created for ${res.value.name}.`);
    onCreated({ name: res.value.name, username: res.value.username, password: form.password });
  }

  return (
    <form className="card pad col" style={{ gap: 14 }} onSubmit={save} noValidate>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Add a person</div>
        <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
          They sign in with the username and password you set here, and can change the password later.
        </div>
      </div>
      <FormField id="tm-name" label="Full name" error={err.name}>
        <input
          id="tm-name"
          className="input"
          autoComplete="off"
          value={form.name}
          aria-invalid={!!err.name}
          onChange={(e) => {
            set('name', e.target.value);
            if (!touchedUsername) set('username', suggestUsername(e.target.value));
          }}
        />
      </FormField>
      <div className="grid2" style={{ gap: 10 }}>
        <FormField id="tm-user" label="Username" error={err.username}>
          <input
            id="tm-user"
            className="input"
            autoComplete="off"
            autoCapitalize="none"
            value={form.username}
            aria-invalid={!!err.username}
            onChange={(e) => {
              setTouchedUsername(true);
              set('username', e.target.value.toLowerCase());
            }}
          />
        </FormField>
        <FormField id="tm-email" label="Email (optional)" error={err.email}>
          <input
            id="tm-email"
            className="input"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            value={form.email}
            aria-invalid={!!err.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </FormField>
      </div>
      <div>
        <div id="tm-role" className="field-label">
          Role
        </div>
        <div className="col" style={{ gap: 8 }} role="radiogroup" aria-labelledby="tm-role">
          {(['Warehouse', 'Production', 'Admin'] as Role[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={form.role === r} className="radio-card" style={{ borderRadius: 12 }} onClick={() => set('role', r)}>
              <span className="radio-dot sm" />
              <span className="col" style={{ gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r}</span>
                <span className="row-sub">{ROLE_DESC[r]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <FormField id="tm-pass" label="Temporary password" error={err.password}>
        <div className="input-shell" style={{ height: 48 }} aria-invalid={!!err.password}>
          <input id="tm-pass" autoComplete="off" autoCapitalize="none" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <button type="button" className="pass-toggle" onClick={() => set('password', generatePassword())}>
            New
          </button>
        </div>
      </FormField>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, height: 48, fontSize: 14 }} disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline" style={{ height: 48 }} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const suggestUsername = (name: string) => {
  const parts = name.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : parts[0][0] + parts[parts.length - 1];
};

/** Shown once after creating an account: what to hand over. */
function Credentials({ name, username, password, onDone }: { name: string; username: string; password: string; onDone: () => void }) {
  const text = `StockOps sign-in for ${name}\nUsername: ${username}\nPassword: ${password}`;
  return (
    <div className="credentials">
      <div style={{ fontSize: 14, fontWeight: 700 }}>Give {name.split(' ')[0]} these details</div>
      <div className="cred-grid tnum">
        <span>Username</span>
        <strong>{username}</strong>
        <span>Password</span>
        <strong>{password}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => toast('Copied.'))
              .catch(() => toast("Couldn't copy — select the text instead."))
          }
        >
          <Icon name="copy" size={15} />
          Copy
        </button>
        <button type="button" className="btn-link" style={{ fontSize: 13, padding: '0 8px' }} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function Member({ u }: { u: User }) {
  const { user: me } = useCurrentUser();
  const setMemberRole = useStore((s) => s.setMemberRole);
  const send = useStore((s) => s.send);
  const submit = useStore((s) => s.submit);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const locked = u.isOwner || u.id === me.id;

  return (
    <div className="member">
      <div className="member-row">
        <span className="initials">{initialsOf(u.name)}</span>
        <div className="min0" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</span>
            {u.isOwner && <span className="pill sm warn">Owner</span>}
            {u.id === me.id && <span className="pill sm neutral">You</span>}
          </div>
          <div className="row-sub ellipsis">
            @{u.username}
            {u.email && ` · ${u.email}`}
          </div>
        </div>
        <select
          className="role-select"
          value={u.role}
          disabled={locked}
          title={u.isOwner ? 'The owner is always an Admin' : u.id === me.id ? "You can't change your own role" : undefined}
          onChange={(e) => setMemberRole(u.id, e.target.value as Role)}
          aria-label={`Role for ${u.name}`}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {resetting === null ? (
        <div className="member-actions">
          {(!u.isOwner || me.isOwner) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setResetting(generatePassword());
                setResetErr(null);
              }}
            >
              <Icon name="key" size={14} /> Reset password
            </button>
          )}
          {!locked && (
            <button
              type="button"
              className="btn-link danger"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Remove ${u.name}?`,
                  body: "They won't be able to sign in any more. Their past work stays on record, and you can add them again later.",
                  confirmLabel: 'Remove from team',
                  danger: true,
                });
                if (!ok) return;
                const res = await send(() => api.removeMember(u.id));
                if (res) toast(`${res.name} removed from the team.`);
              }}
            >
              <Icon name="trash" size={14} /> Remove
            </button>
          )}
        </div>
      ) : (
        <form
          className="member-reset"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await submit(() => api.resetMemberPassword(u.id, resetting));
            if (!res.ok) return setResetErr(res.error);
            setResetting(null);
            toast(`New password for ${u.name}: ${resetting}`);
          }}
        >
          <div className="input-shell" style={{ height: 44, flex: 1, minWidth: 180 }} aria-invalid={!!resetErr}>
            <input aria-label={`New password for ${u.name}`} value={resetting} autoCapitalize="none" onChange={(e) => setResetting(e.target.value)} />
            <button type="button" className="pass-toggle" onClick={() => setResetting(generatePassword())}>
              New
            </button>
          </div>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setResetting(null)}>
            Cancel
          </button>
          {resetErr && <div className="field-err" style={{ width: '100%' }}>{resetErr}</div>}
        </form>
      )}
    </div>
  );
}

function Organization() {
  const { org } = useCurrentUser();
  const send = useStore((s) => s.send);
  const [name, setName] = useState(org?.name ?? '');
  const dirty = name.trim() && name.trim() !== org?.name;
  return (
    <section>
      <div className="sec-head">
        <h2 className="eyebrow" style={{ margin: 0 }}>
          Organization
        </h2>
      </div>
      <form
        className="card flat pad col"
        style={{ gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty) return;
          if ((await send(() => api.renameOrganization(name))) !== null) toast('Organization renamed.');
        }}
      >
        <label htmlFor="org-name" className="field-label" style={{ marginBottom: 0 }}>
          Name shown across the app
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary" style={{ height: 48 }} disabled={!dirty}>
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
