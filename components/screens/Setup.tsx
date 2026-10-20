'use client';

import { Icon } from '@/components/Icon';
import { cap1, fmt, fmtDate, initialsOf, inputVal, money, num, qu, round } from '@/lib/format';
import { useModel } from '@/lib/model';
import { ROLES } from '@/lib/roles';
import { useStore } from '@/lib/store';
import type { Role } from '@/lib/types';
import { toast, useUI, type SetupTab } from '@/lib/ui';

const TABS: [SetupTab, string][] = [
  ['recipes', 'Recipes'],
  ['materials', 'Materials'],
  ['users', 'Users & access'],
];

export function Setup() {
  const tab = useUI((s) => s.setupTab);
  const setUI = useUI((s) => s.set);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="n-only">
        <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
          Setup
        </h1>
        <div className="page-sub">Admin only. Changes recalculate capacity and orders instantly.</div>
      </div>
      <div className="tabs" role="tablist" aria-label="Setup sections">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className="tab"
            onClick={() => setUI({ setupTab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'recipes' && <Recipes />}
        {tab === 'materials' && <Materials />}
        {tab === 'users' && <Users />}
      </div>
    </div>
  );
}

function Recipes() {
  const m = useModel();
  const setupProduct = useUI((s) => s.setupProduct);
  const setUI = useUI((s) => s.set);
  const setRecipeQty = useStore((s) => s.setRecipeQty);
  const setProductField = useStore((s) => s.setProductField);
  const setBatchKg = useStore((s) => s.setBatchKg);

  const sp = m.prodById[setupProduct] ?? m.data.products[0];
  const bom = m.recipeOf(sp.id);
  const isMix = (ing: string) => !!m.byId[ing] && m.byId[ing].kind !== 'packaging';
  const bkg = Math.max(num(sp.batchKg), 1e-9);
  const mixTotal = bom.reduce((a, r) => a + (isMix(r.ing) ? num(r.qty) : 0), 0);
  const pctSum = (mixTotal / bkg) * 100;
  const off = Math.abs(pctSum - 100) > 0.005;
  const batchCost = m.batchCost(sp);
  const perCase = m.perCase(sp);

  return (
    <div className="recipe-grid">
      <div className="col min0" style={{ gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Product">
          {m.data.products.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={p.id === sp.id} onClick={() => setUI({ setupProduct: p.id })}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="card pad">
          <div className="grid2" style={{ gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="bkg" className="field-label sm">
                Batch size
              </label>
              <div className="input-shell" style={{ height: 46 }}>
                <input
                  id="bkg"
                  type="number"
                  inputMode="decimal"
                  style={{ fontWeight: 600 }}
                  value={sp.batchKg}
                  onChange={(e) => setBatchKg(sp.id, inputVal(e.target.value))}
                />
                <span className="subtle" style={{ paddingRight: 14, fontSize: 12 }}>
                  kg · % lines scale with it
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="upb" className="field-label sm">
                Units per batch
              </label>
              <input
                id="upb"
                type="number"
                inputMode="numeric"
                className="input h46"
                value={sp.upb}
                onChange={(e) => setProductField(sp.id, 'upb', inputVal(e.target.value, true))}
              />
            </div>
            <div>
              <label htmlFor="upc" className="field-label sm">
                Units per case
              </label>
              <input
                id="upc"
                type="number"
                inputMode="numeric"
                className="input h46"
                value={sp.upc}
                onChange={(e) => setProductField(sp.id, 'upc', inputVal(e.target.value, true))}
              />
            </div>
          </div>
          <div className="muted tnum" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
            {fmt(perCase)} cases per batch · {money(batchCost / bkg)} per kg · batch cost {money(batchCost)} ·{' '}
            {money(batchCost / Math.max(perCase, 1e-9))} per case
          </div>
        </div>
      </div>

      <div className="card clip min0">
        <div className="bom-row bom-head">
          <span>Material</span>
          <span>% or qty</span>
          <span style={{ textAlign: 'right' }}>Per batch</span>
        </div>
        <div className="list">
          {bom.map((r) => {
            const i = m.byId[r.ing] ?? { name: r.ing, unit: '' };
            const mix = isMix(r.ing);
            return (
              <div key={r.ing} className="bom-row">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</span>
                <div className="unit-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={mix && r.qty !== '' ? round((num(r.qty) / bkg) * 100) : r.qty}
                    onChange={(e) => {
                      const v = inputVal(e.target.value);
                      setRecipeQty(sp.id, r.ing, v === '' ? '' : mix ? round((v * bkg) / 100) : v);
                    }}
                    aria-label={`${i.name} ${mix ? 'percent of batch' : 'quantity per batch'}`}
                  />
                  <span>{mix ? '%' : i.unit}</span>
                </div>
                <span className="muted tnum" style={{ textAlign: 'right', fontSize: 13 }}>
                  {qu(num(r.qty), i.unit)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="bom-total tnum">
          <span>Formula total</span>
          <span style={{ color: off ? 'var(--warn)' : '#2E6B45' }}>
            {pctSum.toFixed(3)}% · {qu(mixTotal, 'kg')}
          </span>
        </div>
        {off && (
          <div className="bom-off">
            Formula is {pctSum > 100 ? 'over' : 'under'} 100% by {Math.abs(pctSum - 100).toFixed(3)}% — batch weight won&apos;t match{' '}
            {qu(num(sp.batchKg), 'kg')}.
          </div>
        )}
      </div>
    </div>
  );
}

function Materials() {
  const m = useModel();
  const update = useStore((s) => s.updateIngredient);
  const setUI = useUI((s) => s.set);
  const openSheet = useUI((s) => s.openSheet);

  return (
    <>
      <div className="import-banner">
        <div className="min0" style={{ flex: '1 1 220px' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Update from your spreadsheet</div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12, lineHeight: 1.5 }}>
            Costs, pack sizes, par levels and stock in one upload. New rows are added as materials.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setUI({ imp: { stage: 'pick' } });
            openSheet('import');
          }}
        >
          <Icon name="upload" size={16} />
          Import Excel
        </button>
      </div>
      <div className="mat-grid">
        {m.ings.map((i) => {
          const fields = [
            ['cost', `Rs / ${i.unit}`, 'Cost per unit'],
            ['pack', `${cap1(i.packName)} (${i.unit})`, 'Pack size'],
            ['par', `Par (${i.unit})`, 'Par level'],
          ] as const;
          return (
            <div key={i.id} className="card flat" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span className="row-title">{i.name}</span>
                <span className="subtle" style={{ fontSize: 11 }}>
                  {i.kind === 'packaging' ? 'Packaging' : 'Ingredient'}
                </span>
              </div>
              <div className="mat-fields">
                {fields.map(([key, label, aria]) => (
                  <label key={key}>
                    <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600 }}>{label}</div>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input h44"
                      value={i[key]}
                      onChange={(e) => update(i.id, { [key]: inputVal(e.target.value) })}
                      aria-label={`${i.name} ${aria}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const MATRIX: [string, boolean, boolean, boolean][] = [
  ['Users & system rules', true, false, false],
  ['Recipes, costs, mix %', true, false, false],
  ['Par levels & pack sizes', true, false, false],
  ['Log physical stock', true, true, false],
  ['Forecasts & batches run', true, false, true],
  ['Alerts & purchase orders', true, true, true],
];

function Users() {
  const users = useStore((s) => s.data.users);
  const requests = useStore((s) => s.data.requests);
  const approveRequest = useStore((s) => s.approveRequest);
  const declineRequest = useStore((s) => s.declineRequest);
  const setUserRole = useStore((s) => s.setUserRole);

  return (
    <div className="two-cols">
      <div className="col min0" style={{ gap: 22 }}>
        {requests.length > 0 && (
          <section>
            <div className="sec-head" style={{ alignItems: 'center' }}>
              <h2 className="eyebrow" style={{ margin: 0 }}>
                Access requests
              </h2>
              <span className="pill warn" style={{ fontSize: 11 }}>
                {requests.length} pending
              </span>
            </div>
            <div className="card clip list">
              {requests.map((r) => (
                <div key={r.id} className="request-row">
                  <span className="initials warn">{initialsOf(r.name)}</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                      <span className="pill sm info" style={{ fontWeight: 600 }}>
                        {r.role}
                      </span>
                    </div>
                    <div className="row-sub" style={{ marginTop: 2 }}>
                      {r.email} · Requested {fmtDate(r.date)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ height: 40, padding: '0 14px' }}
                      onClick={() => {
                        const res = declineRequest(r.id);
                        if (res) toast(`Request from ${res.request.name} declined.`, { label: 'Undo', fn: res.undo });
                      }}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ height: 40 }}
                      onClick={() => {
                        const done = approveRequest(r.id);
                        if (done) toast(`${done.name} approved as ${done.role}.`);
                      }}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="sec-head">
            <h2 className="eyebrow" style={{ margin: 0 }}>
              Users
            </h2>
          </div>
          <div className="card flat clip list">
            {users.map((u) => (
              <div key={u.id} className="row compact">
                <span className="initials">{initialsOf(u.name)}</span>
                <div className="min0" style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</div>
                  <div className="row-sub ellipsis">
                    @{u.username} · {u.email.toLowerCase()}
                  </div>
                </div>
                <select
                  className="role-select"
                  value={u.role}
                  onChange={(e) => setUserRole(u.id, e.target.value as Role)}
                  aria-label={`Role for ${u.name}`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="min0">
        <div className="sec-head">
          <h2 className="eyebrow" style={{ margin: 0 }}>
            Access by role
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
  );
}
