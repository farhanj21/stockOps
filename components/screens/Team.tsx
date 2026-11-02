'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import * as api from '@/app/actions';
import { FormField } from '@/components/FormField';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { initialsOf } from '@/lib/format';
import { useCurrentUser } from '@/lib/hooks';
import { generatePassword } from '@/lib/password-gen';
import { NO_PERMS, PERM_INFO, PERM_KEYS, roleSummary, type Perms } from '@/lib/roles';
import { useStore } from '@/lib/store';
import type { RoleDef, User } from '@/lib/types';
import { confirmDialog, toast } from '@/lib/ui';

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
          <Roles />
        </div>
      </div>
    </div>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

/** Built-in roles plus the organization's own, with what each may change. Custom roles can be edited and deleted. */
function Roles() {
  const roles = useStore((s) => s.data.roles);
  const users = useStore((s) => s.data.users);
  const send = useStore((s) => s.send);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const people = (id: string) => users.filter((u) => u.roleId === id).length;
  const custom = roles.filter((r) => !r.builtIn);

  async function remove(r: RoleDef) {
    const ok = await confirmDialog({
      title: `Delete the ${r.name} role?`,
      body: 'This cannot be undone. Nobody has this role, so no one loses access.',
      confirmLabel: 'Delete role',
      danger: true,
    });
    if (!ok) return;
    const res = await send(() => api.deleteRole(r.id));
    if (res) toast(`${res.name} role deleted.`);
  }

  return (
    <section>
      <div className="sec-head">
        <h2 className="eyebrow" style={{ margin: 0 }}>
          Roles
        </h2>
        {editing !== 'new' && (
          <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} stroke={2.2} />
            New role
          </button>
        )}
      </div>
      {editing === 'new' && (
        <div style={{ marginBottom: 12 }}>
          <RoleForm onDone={() => setEditing(null)} />
        </div>
      )}
      <RoleMatrix roles={roles} />
      <div className="role-note">Everyone can also view every screen, export to Excel and raise purchase orders.</div>

      {custom.length > 0 && (
        <div className="card flat clip list" style={{ marginTop: 12 }}>
          {custom.map((r) =>
            editing === r.id ? (
              <div key={r.id} style={{ padding: 12 }}>
                <RoleForm role={r} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <div key={r.id} className="role-item">
                <span className="min0" style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                  <span className="subtle" style={{ fontSize: 12 }}>
                    {' · '}
                    {people(r.id) === 1 ? '1 person' : `${people(r.id)} people`}
                  </span>
                </span>
                <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={() => setEditing(r.id)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button
                  type="button"
                  className="btn-link danger"
                  style={{ fontSize: 13 }}
                  onClick={() =>
                    people(r.id)
                      ? toast(`Give the ${people(r.id) === 1 ? 'person' : `${people(r.id)} people`} with this role another role first.`)
                      : remove(r)
                  }
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** Short column headings for the built-in roles, as before; custom roles show their own name. */
const SHORT: Record<string, string> = { Warehouse: 'Whse', Production: 'Prod' };

/** Ticks per permission (rows) and role (columns). Scrolls sideways when there are many roles. */
function RoleMatrix({ roles }: { roles: RoleDef[] }) {
  const cols = { gridTemplateColumns: `minmax(150px, 1fr) repeat(${roles.length}, 60px)` };
  return (
    <div className="card flat role-matrix" style={{ fontSize: 13 }}>
      <div role="table" aria-label="What each role can change" style={{ minWidth: 150 + roles.length * 66 }}>
        <div className="matrix-row matrix-head" role="row" style={cols}>
          <span role="columnheader">Can change</span>
          {roles.map((r) => (
            <span key={r.id} role="columnheader" className="matrix-col" title={r.name}>
              {SHORT[r.id] ?? r.name}
            </span>
          ))}
        </div>
        <div className="list">
          {PERM_KEYS.map((k) => (
            <div key={k} className="matrix-row" role="row" style={cols}>
              <span role="cell" title={PERM_INFO[k].desc}>
                {PERM_INFO[k].label}
              </span>
              {roles.map((r) => (
                <span key={r.id} role="cell" className={`matrix-col ${r.perms[k] ? 'matrix-yes' : 'matrix-no'}`} aria-label={r.perms[k] ? 'Yes' : 'No'}>
                  {r.perms[k] ? '✓' : '—'}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Create a role, or edit a custom one: a name and a tick per permission. */
function RoleForm({ role, onDone }: { role?: RoleDef; onDone: () => void }) {
  const submit = useStore((s) => s.submit);
  const [name, setName] = useState(role?.name ?? '');
  const [perms, setPerms] = useState<Perms>(role?.perms ?? NO_PERMS);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Give the role a name.');
    setBusy(true);
    const res = await submit(() => (role ? api.updateRole(role.id, { name, perms }) : api.createRole({ name, perms })));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors?.name ?? res.error);
    toast(role ? `${res.value.name} role saved.` : `${res.value.name} role created. Pick it when adding a person or from anyone's role menu.`);
    onDone();
  }

  return (
    <form className="card pad col" style={{ gap: 12 }} onSubmit={save} noValidate>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--strong)' }}>{role ? `Edit ${role.name}` : 'New role'}</div>
      <FormField id={`role-name-${role?.id ?? 'new'}`} label="Role name" error={err ?? undefined}>
        <input
          id={`role-name-${role?.id ?? 'new'}`}
          className="input"
          placeholder="e.g. Store keeper, Supervisor"
          autoComplete="off"
          autoFocus
          maxLength={40}
          value={name}
          aria-invalid={!!err}
          onChange={(e) => {
            setName(e.target.value);
            setErr(null);
          }}
        />
      </FormField>
      <div>
        <div className="field-label">What this role can change</div>
        <div className="col" style={{ gap: 6 }}>
          {PERM_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="checkbox"
              aria-checked={perms[k]}
              className="perm-toggle"
              onClick={() => setPerms((p) => ({ ...p, [k]: !p[k] }))}
            >
              <span className={`check-box${perms[k] ? ' on' : ''}`}>{perms[k] && <Icon name="check" size={13} stroke={3} />}</span>
              <span className="col" style={{ gap: 1 }}>
                <span style={{ fontWeight: 700 }}>{PERM_INFO[k].label}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {PERM_INFO[k].desc}
                </span>
              </span>
            </button>
          ))}
        </div>
        {perms.team && (
          <div className="role-warn">
            <Icon name="alert" size={14} />
            Team &amp; roles lets people create roles and change anyone&apos;s role, so it is as powerful as Admin.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, height: 48, fontSize: 14 }} disabled={busy}>
          {busy ? 'Saving…' : role ? 'Save role' : 'Create role'}
        </button>
        <button type="button" className="btn btn-outline" style={{ height: 48 }} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type Errors = Partial<Record<'name' | 'username' | 'email' | 'password', string>>;

function AddMember({ onCancel, onCreated }: { onCancel?: () => void; onCreated: (c: { name: string; username: string; password: string }) => void }) {
  const submit = useStore((s) => s.submit);
  const roles = useStore((s) => s.data.roles);
  const [form, setForm] = useState({ name: '', username: '', email: '', roleId: 'Warehouse', password: generatePassword() });
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
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--strong)' }}>Add a person</div>
        <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
          They sign in with the username and password you set here, and can change the password later.
        </div>
      </div>
      <FormField id="tm-name" label="Full name" error={err.name}>
        <input
          id="tm-name" placeholder="Enter full name"
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
            id="tm-user" placeholder="Enter a username, e.g. alikhan"
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
            id="tm-email" placeholder="Enter email (optional)"
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
          {roles.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={form.roleId === r.id} className="radio-card" style={{ borderRadius: 12 }} onClick={() => set('roleId', r.id)}>
              <span className="radio-dot sm" />
              <span className="col" style={{ gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                <span className="row-sub">{roleSummary(r)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <FormField id="tm-pass" label="Temporary password" error={err.password}>
        <div className="input-shell" style={{ height: 48 }} aria-invalid={!!err.password}>
          <input id="tm-pass" placeholder="Enter a temporary password" autoComplete="off" autoCapitalize="none" value={form.password} onChange={(e) => set('password', e.target.value)} />
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
  const roles = useStore((s) => s.data.roles);
  const send = useStore((s) => s.send);
  const submit = useStore((s) => s.submit);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
          value={u.roleId}
          disabled={locked}
          title={u.isOwner ? 'The owner is always an Admin' : u.id === me.id ? "You can't change your own role" : undefined}
          onChange={(e) => setMemberRole(u.id, e.target.value)}
          aria-label={`Role for ${u.name}`}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {editing ? (
        <EditMember u={u} onDone={() => setEditing(false)} />
      ) : resetting === null ? (
        <div className="member-actions">
          {(!u.isOwner || me.isOwner) && (
            <button type="button" className="btn-link" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> Edit
            </button>
          )}
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
            <input aria-label={`New password for ${u.name}`} placeholder="Enter a new password" value={resetting} autoCapitalize="none" onChange={(e) => setResetting(e.target.value)} />
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

/** Inline form to change someone's name and email. */
function EditMember({ u, onDone }: { u: User; onDone: () => void }) {
  const submit = useStore((s) => s.submit);
  const [f, setF] = useState({ name: u.name, email: u.email });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErr((e) => ({ ...e, [k]: '' }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await submit(() => api.updateMember(u.id, f));
    setBusy(false);
    if (!res.ok) return setErr(res.fieldErrors ?? { name: res.error });
    toast(`${f.name.trim()}'s details saved.`);
    onDone();
  }

  return (
    <form className="member-edit" onSubmit={save} noValidate>
      <FormField id={`me-name-${u.id}`} label="Full name" error={err.name}>
        <input id={`me-name-${u.id}`} className="input h44" placeholder="Enter full name" value={f.name} autoFocus aria-invalid={!!err.name} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <FormField id={`me-email-${u.id}`} label="Email (optional)" error={err.email}>
        <input
          id={`me-email-${u.id}`}
          className="input h44" placeholder="Enter email (optional)"
          type="email"
          autoCapitalize="none"
          value={f.email}
          aria-invalid={!!err.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </FormField>
      <div className="member-edit-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !f.name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
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
          <input id="org-name" className="input" placeholder="Enter organization name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary" style={{ height: 48 }} disabled={!dirty}>
            Save
          </button>
        </div>
        <OrgLogo />
      </form>
    </section>
  );
}

/** Longest side of a stored logo, in pixels: plenty for the 36 px badge on high-density screens. */
const LOGO_PX = 256;

/** Shrink an image file to a small PNG (or WebP if the PNG is large) data: URL. */
async function resizeLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // SVGs without a set size report 0×0: draw them at full size.
    const w0 = img.naturalWidth || LOGO_PX;
    const h0 = img.naturalHeight || LOGO_PX;
    const scale = Math.min(1, LOGO_PX / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    return png.length > 250_000 ? canvas.toDataURL('image/webp', 0.9) : png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload or remove the logo shown in the sidebar and phone header instead of the StockOps mark. */
function OrgLogo() {
  const { org } = useCurrentUser();
  const send = useStore((s) => s.send);
  const [busy, setBusy] = useState(false);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Pick an image file (PNG, JPG, WebP or SVG).');
    setBusy(true);
    try {
      const logo = await resizeLogo(file);
      if ((await send(() => api.setOrganizationLogo(logo))) !== null) toast('Logo updated.');
    } catch {
      toast("Couldn't read that image. Try a PNG or JPG.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: 'Remove the logo?', body: 'The StockOps logo will show instead.', confirmLabel: 'Remove logo' });
    if (ok && (await send(() => api.setOrganizationLogo(null))) !== null) toast('Logo removed.');
  }

  return (
    <div className="org-logo">
      <Logo size="lg" src={org?.logoUrl} />
      <div className="min0" style={{ flex: 1 }}>
        <div className="field-label" style={{ marginBottom: 2 }}>
          Logo
        </div>
        <div className="row-sub">Replaces the StockOps logo in the sidebar and on phones. Square images look best.</div>
        <div className="org-logo-actions">
          <label className={`btn btn-outline${busy ? ' is-busy' : ''}`}>
            <Icon name="upload" size={15} />
            {busy ? 'Uploading…' : org?.logoUrl ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={busy} onChange={upload} />
          </label>
          {org?.logoUrl && (
            <button type="button" className="btn-link danger" onClick={remove} disabled={busy}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
