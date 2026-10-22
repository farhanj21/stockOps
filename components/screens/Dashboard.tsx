'use client';

import { Icon, type IconName } from '@/components/Icon';
import { useGreeting } from '@/components/shell/AppShell';
import { SearchBox, SearchResultsPage } from '@/components/shell/Search';
import { useOpeners } from '@/components/sheets/openers';
import { ALERT_STYLE, SHOW_COST } from '@/lib/config';
import { fmt, fmtDate, money, num, plural, qu } from '@/lib/format';
import { useCurrentUser, useGo } from '@/lib/hooks';
import { useModel } from '@/lib/model';
import type { Role } from '@/lib/types';
import { useUI } from '@/lib/ui';

type ActionKey = 'plan' | 'stock' | 'stockLow' | 'orders' | 'setup' | 'run';

interface QuickAction {
  title: string;
  sub: string;
  icon: IconName;
  iconStroke?: number;
  to: ActionKey;
}

/** First action in each list is the role's primary job and renders dark. */
const QUICK_ACTIONS: Record<Role, QuickAction[]> = {
  Admin: [
    { title: 'Plan production', sub: 'Forecast batches', icon: 'calendar', to: 'plan' },
    { title: 'Log stock', sub: 'In-hand & pipeline', icon: 'clipboard', to: 'stock' },
    { title: 'Purchase orders', sub: 'Review & generate', icon: 'receipt', to: 'orders' },
    { title: 'Recipes & par', sub: 'Admin setup', icon: 'sliders', to: 'setup' },
  ],
  Warehouse: [
    { title: 'Log stock count', sub: 'In-hand & pipeline', icon: 'clipboard', to: 'stock' },
    { title: 'Receive delivery', sub: 'Orders in transit', icon: 'truck', to: 'orders' },
    { title: 'Below-par items', sub: 'Filtered stock list', icon: 'alert', to: 'stockLow' },
    { title: 'Generate PO', sub: 'Rounded to packs', icon: 'receipt', to: 'orders' },
  ],
  Production: [
    { title: 'Plan batches', sub: 'Forecast & preview', icon: 'calendar', to: 'plan' },
    { title: 'Log batches run', sub: 'Deducts in-hand', icon: 'check', iconStroke: 2.2, to: 'run' },
    { title: 'Check stock', sub: 'View only', icon: 'box', to: 'stock' },
    { title: 'Generate PO', sub: 'Rounded to packs', icon: 'receipt', to: 'orders' },
  ],
};

export function Dashboard() {
  const m = useModel();
  const { role, perms } = useCurrentUser();
  const go = useGo();
  const { openMat, openProd } = useOpeners();
  const { greeting, dateLabel } = useGreeting();
  const hasQuery = useUI((s) => !!s.query.trim());

  const run = (to: ActionKey) => {
    if (to === 'run') {
      const ui = useUI.getState();
      ui.set({ runId: null, runBatches: 1 });
      ui.openSheet('run');
    } else if (to === 'stockLow') go('stock', { stockFilter: 'low' });
    else if (to === 'stock') go('stock', { stockFilter: 'all' });
    else go(to);
  };

  const suggestCost = m.suggestions.reduce((a, x) => a + x.cost, 0);
  const openLines = m.openPOs.reduce((a, p) => a + p.lines.length, 0);
  const alertLine = (i: (typeof m.alerts)[number]) =>
    `In-hand ${fmt(num(i.inHand))} + Pipeline ${fmt(num(i.pipeline))} = ${qu(m.total(i), i.unit)} · Par ${qu(num(i.par), i.unit)}`;

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="col n-only" style={{ gap: 22 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontWeight: 400 }}>
            {greeting}
          </h1>
          <div className="page-sub">{dateLabel}</div>
        </div>
        <SearchBox size="page" />
      </div>

      {hasQuery && (
        <div className="n-only">
          <SearchResultsPage />
        </div>
      )}

      <div className={`col${hasQuery ? ' w-only' : ''}`} style={{ gap: 24 }}>
        <div className="kpis w-only">
          <button type="button" className="kpi" onClick={() => go('stock', { stockFilter: 'low' })}>
            <span className="kpi-k">Below par</span>
            <span className="kpi-v" style={{ color: 'var(--danger)' }}>
              {m.alerts.length}
            </span>
            <span className="kpi-m">materials under par level</span>
          </button>
          <button type="button" className="kpi" onClick={() => go('orders')}>
            <span className="kpi-k">Suggested orders</span>
            <span className="kpi-v" style={{ color: 'var(--warn)' }}>
              {m.suggestions.length}
            </span>
            <span className="kpi-m">{SHOW_COST ? `${money(suggestCost)} est. at pack sizes` : 'lines ready to order'}</span>
          </button>
          <button type="button" className="kpi" onClick={() => go('orders')}>
            <span className="kpi-k">In transit</span>
            <span className="kpi-v" style={{ color: 'var(--info)' }}>
              {m.openPOs.length}
            </span>
            <span className="kpi-m">{m.openPOs.length ? `${openLines} lines on order` : 'nothing on order'}</span>
          </button>
          <button type="button" className="kpi dark" onClick={() => perms.plan && go('plan')}>
            <span className="kpi-k">Committed batches</span>
            <span className="kpi-v">{m.committedBatches}</span>
            <span className="kpi-m">
              {plural(m.data.forecasts.length, 'plan')} · {fmt(m.committedCases)} cases
            </span>
          </button>
        </div>

        <GetStarted />
        <div className="home-grid">
          <section style={{ gridArea: 'alerts' }} className="min0">
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                Below par
              </h2>
              <span className="sec-meta">{plural(m.alerts.length, 'item')}</span>
            </div>
            {m.alerts.length > 0 && ALERT_STYLE === 'grouped' && (
              <div className="card clip list">
                {m.alerts.map((i) => (
                  <button key={i.id} type="button" className="row" onClick={() => openMat(i.id)}>
                    <span className="alert-ico">
                      <Icon name="alert" size={18} />
                    </span>
                    <span className="row-main">
                      <span className="row-title">{i.name}</span>
                      <span className="row-sub tnum" style={{ lineHeight: 1.45 }}>
                        {alertLine(i)}
                      </span>
                    </span>
                    <span className="pill danger">−{qu(m.shortOf(i), i.unit)}</span>
                  </button>
                ))}
              </div>
            )}
            {m.alerts.length > 0 && ALERT_STYLE === 'tinted' && (
              <div className="col" style={{ gap: 8 }}>
                {m.alerts.map((i) => (
                  <button key={i.id} type="button" className="alert-tinted" onClick={() => openMat(i.id)}>
                    <span className="row-main">
                      <span className="row-title" style={{ color: 'var(--danger)' }}>
                        {i.name}
                      </span>
                      <span className="tnum" style={{ fontSize: 12, lineHeight: 1.45 }}>
                        {alertLine(i)}
                      </span>
                    </span>
                    <span className="serif tnum" style={{ fontSize: 20, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                      −{qu(m.shortOf(i), i.unit)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {m.alerts.length === 0 && (
              <div className="ok-banner">
                <Icon name="check" size={14} stroke={2.5} />
                Every material is at or above par.
              </div>
            )}
          </section>

          <section style={{ gridArea: 'actions' }} className="min0">
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                Quick actions
              </h2>
            </div>
            <div className="actions">
              {QUICK_ACTIONS[role].map((a, ix) => (
                <button key={a.title} type="button" className={`action${ix === 0 ? ' dark' : ''}`} onClick={() => run(a.to)}>
                  <span className="action-ico">
                    <Icon name={a.icon} size={18} stroke={a.iconStroke ?? 2} />
                  </span>
                  <span className="col" style={{ gap: 2 }}>
                    <span className="action-t">{a.title}</span>
                    <span className="action-s">{a.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section style={{ gridArea: 'capacity' }} className="min0">
            <div className="sec-head">
              <h2 className="eyebrow" style={{ margin: 0 }}>
                Can produce now
              </h2>
              <span className="sec-meta">In-hand + pipeline</span>
            </div>
            <div className="card clip list">
              {!m.data.products.length && <div className="empty-inline">No products yet.</div>}
              {m.data.products.map((p) => {
                const c = m.capacity(p, m.total);
                return (
                  <button key={p.id} type="button" className="row" onClick={() => openProd(p.id)}>
                    <span className="row-main">
                      <span className="row-title">{p.name}</span>
                      <span className="row-sub">
                        {plural(c.batches, 'batch', 'batches')} · limited by {c.lim ? c.lim.name : '—'}
                      </span>
                    </span>
                    <span className="col" style={{ alignItems: 'flex-end' }}>
                      <span className="serif tnum" style={{ fontSize: 24, lineHeight: 1.1, color: 'var(--navy)' }}>
                        {fmt(c.cases)}
                      </span>
                      <span className="subtle" style={{ fontSize: 11 }}>
                        cases
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ gridArea: 'side', gap: 24 }} className="col min0 w-only">
            <div>
              <div className="sec-head">
                <h2 className="eyebrow" style={{ margin: 0 }}>
                  Committed plans
                </h2>
                <span className="sec-meta">{plural(m.forecastsSorted.length, 'plan')}</span>
              </div>
              <div className="card flat clip list">
                {m.forecastsSorted.map((f) => {
                  const p = m.prodById[f.productId];
                  return (
                    <div key={f.id} className="row compact">
                      <span className="num-badge">{num(f.batches)}</span>
                      <span className="row-main" style={{ gap: 1 }}>
                        <span className="row-title">{p?.name ?? '—'}</span>
                        <span className="row-sub">
                          {fmt(Math.floor(num(f.batches) * (p ? m.perCase(p) : 0)))} cases · due {fmtDate(f.date)}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {!m.forecastsSorted.length && <div className="empty-inline">No committed plans.</div>}
              </div>
            </div>
            <div>
              <div className="sec-head">
                <h2 className="eyebrow" style={{ margin: 0 }}>
                  In transit
                </h2>
                <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => go('orders')}>
                  View ›
                </button>
              </div>
              <div className="card flat clip list">
                {m.openPOs.map((po) => (
                  <div key={po.id} className="row compact">
                    <span className="row-main" style={{ gap: 1 }}>
                      <span className="row-title">{po.id}</span>
                      <span className="row-sub">
                        Placed {fmtDate(po.date)} · {po.by}
                      </span>
                    </span>
                    <span className="pill xs info">{plural(po.lines.length, 'line')}</span>
                  </div>
                ))}
                {!m.openPOs.length && <div className="empty-inline">No orders in transit.</div>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Checklist for a new organization until it has materials, recipes and a team. */
function GetStarted() {
  const m = useModel();
  const { perms } = useCurrentUser();
  const go = useGo();
  const hasRecipe = m.data.products.some((p) => m.recipeOf(p.id).length > 0);
  const steps = [
    { done: m.ings.length > 0, title: 'Add your materials', sub: 'Type them in, or import your stock spreadsheet.', to: () => go('setup', { setupTab: 'materials' }) },
    { done: hasRecipe, title: 'Create products and recipes', sub: 'Batch size, units per case and what goes into each batch.', to: () => go('setup', { setupTab: 'recipes' }) },
    { done: m.data.users.length > 1, title: 'Add your team', sub: 'Accounts for warehouse, production and other admins.', to: () => go('team') },
  ];
  if (steps.every((s) => s.done) || !perms.setup) {
    if (m.ings.length || perms.setup) return null;
    return (
      <div className="empty">
        <div className="empty-t">Nothing set up yet</div>
        <div className="empty-s">Your Admin is still adding materials and recipes. Check back soon.</div>
      </div>
    );
  }
  return (
    <section className="card pad onboarding">
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>Set up your plant</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
        Three steps and StockOps can work out capacity, alerts and orders for you.
      </div>
      <div className="col" style={{ gap: 8, marginTop: 14 }}>
        {steps.map((s, ix) => (
          <button key={s.title} type="button" className="step-row" data-done={s.done} onClick={s.to}>
            <span className="step-num">{s.done ? <Icon name="check" size={14} stroke={3} /> : ix + 1}</span>
            <span className="row-main">
              <span style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</span>
              <span className="row-sub">{s.sub}</span>
            </span>
            {!s.done && <span className="chev">›</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
