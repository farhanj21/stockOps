'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { useOpeners } from '@/components/sheets/openers';
import { fmt, num, qu } from '@/lib/format';
import { useModel } from '@/lib/model';
import { useUI } from '@/lib/ui';

/** Materials whose name matches, and recipes whose name or any ingredient matches. */
export function useSearchResults() {
  const query = useUI((s) => s.query);
  const m = useModel();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { q, materials: [], products: [] };
    const materials = m.ings
      .filter((i) => i.name.toLowerCase().includes(q))
      .map((i) => ({
        id: i.id,
        name: i.name,
        meta: `${qu(m.total(i), i.unit)} available · Par ${qu(num(i.par), i.unit)}`,
        low: m.isLow(i),
        shortLabel: '−' + qu(m.shortOf(i), i.unit),
      }));
    const products = m.data.products.flatMap((p) => {
      const nameHit = p.name.toLowerCase().includes(q);
      const ingHit = m
        .recipeOf(p.id)
        .map((r) => m.byId[r.ing])
        .find((i) => i && i.name.toLowerCase().includes(q));
      if (!nameHit && !ingHit) return [];
      const c = m.capacity(p, m.total);
      return [{ id: p.id, name: p.name, meta: (!nameHit && ingHit ? `Uses ${ingHit.name} · ` : '') + `${fmt(c.cases)} cases possible` }];
    });
    return { q, materials, products };
  }, [query, m]);
}

export function SearchBox({ size }: { size: 'top' | 'page' }) {
  const query = useUI((s) => s.query);
  const set = useUI((s) => s.set);
  const page = size === 'page';
  return (
    <div className={`search-box ${size}`}>
      <Icon name="search" size={page ? 18 : 16} color="var(--subtle)" />
      <input
        type="search"
        enterKeyHint="search"
        value={query}
        onChange={(e) => set({ query: e.target.value })}
        onKeyDown={(e) => e.key === 'Escape' && set({ query: '' })}
        placeholder="Search materials or recipes"
        aria-label="Search materials or recipes"
      />
      {query && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => set({ query: '' })}>
          <Icon name="x" size={page ? 16 : 14} stroke={2.2} />
        </button>
      )}
    </div>
  );
}

/** Desktop: dropdown under the top-bar search field. */
export function SearchPopover() {
  const { q, materials, products } = useSearchResults();
  const { openMat, openProd } = useOpeners();
  if (!q) return null;
  return (
    <div className="search-pop">
      {materials.length > 0 && <div className="pop-label">Materials</div>}
      {materials.map((r) => (
        <button key={r.id} type="button" className="pop-row" onClick={() => openMat(r.id)}>
          <span className="row-main" style={{ gap: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
            <span className="row-sub">{r.meta}</span>
          </span>
          {r.low && <span className="pill sm danger">{r.shortLabel}</span>}
        </button>
      ))}
      {products.length > 0 && (
        <div className="pop-label" style={{ paddingTop: 10 }}>
          Recipes
        </div>
      )}
      {products.map((r) => (
        <button key={r.id} type="button" className="pop-row" onClick={() => openProd(r.id)}>
          <span className="row-main" style={{ gap: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
            <span className="row-sub">{r.meta}</span>
          </span>
        </button>
      ))}
      {!materials.length && !products.length && <div className="empty-inline" style={{ padding: '16px 10px' }}>Nothing matches “{q}”.</div>}
    </div>
  );
}

/** Mobile: results replace the dashboard while a query is typed. */
export function SearchResultsPage() {
  const { q, materials, products } = useSearchResults();
  const { openMat, openProd } = useOpeners();
  return (
    <div className="col" style={{ gap: 22 }}>
      {materials.length > 0 && (
        <div>
          <div className="sec-head">
            <span className="eyebrow">Materials</span>
            <span className="sec-meta">{materials.length}</span>
          </div>
          <div className="card clip list">
            {materials.map((r) => (
              <button key={r.id} type="button" className="row" onClick={() => openMat(r.id)}>
                <span className="row-main">
                  <span className="row-title">{r.name}</span>
                  <span className="row-sub">{r.meta}</span>
                </span>
                {r.low && <span className="pill danger">{r.shortLabel}</span>}
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div>
          <div className="sec-head">
            <span className="eyebrow">Recipes</span>
            <span className="sec-meta">{products.length}</span>
          </div>
          <div className="card clip list">
            {products.map((r) => (
              <button key={r.id} type="button" className="row" onClick={() => openProd(r.id)}>
                <span className="row-main">
                  <span className="row-title">{r.name}</span>
                  <span className="row-sub">{r.meta}</span>
                </span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!materials.length && !products.length && (
        <div className="empty" style={{ padding: '24px 20px' }}>
          <div className="empty-t">No results</div>
          <div className="empty-s">Nothing matches “{q}”.</div>
        </div>
      )}
    </div>
  );
}
