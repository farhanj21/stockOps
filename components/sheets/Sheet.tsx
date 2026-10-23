'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { useUI } from '@/lib/ui';
import { ImportSheet } from './ImportSheet';
import { MaterialSheet } from './MaterialSheet';
import { ProductSheet } from './ProductSheet';
import { BatchSheet } from './BatchSheet';

/** Bottom sheet on mobile, right-hand drawer on desktop. Content stays mounted while it slides out. */
export function Sheet() {
  const sheet = useUI((s) => s.sheet);
  const open = useUI((s) => s.sheetOpen);
  const close = useUI((s) => s.closeSheet);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, sheet, close]);

  let body: ReactNode = null;
  if (sheet?.type === 'material' && sheet.id) body = <MaterialSheet id={sheet.id} />;
  else if (sheet?.type === 'product' && sheet.id) body = <ProductSheet id={sheet.id} />;
  else if (sheet?.type === 'batch') body = <BatchSheet batchId={sheet.id} />;
  else if (sheet?.type === 'import') body = <ImportSheet />;

  return (
    <>
      <div className="sheet-backdrop" data-open={open} onClick={close} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sheet-title" className="sheet" data-open={open} inert={!open}>
        {body}
      </div>
    </>
  );
}

export function SheetHeader({ kicker, title }: { kicker: string; title: string }) {
  const close = useUI((s) => s.closeSheet);
  return (
    <div className="sheet-head">
      <div className="sheet-grip n-only" />
      <div className="sheet-head-row">
        <div className="min0" style={{ flex: 1 }}>
          <div className="sheet-kicker">{kicker}</div>
          <h2 id="sheet-title" className="sheet-title">
            {title}
          </h2>
        </div>
        <button type="button" className="sheet-close" aria-label="Close" onClick={close} data-autofocus>
          <Icon name="x" size={16} stroke={2.2} />
        </button>
      </div>
    </div>
  );
}

export function Cells({ cells }: { cells: [string, string][] }) {
  return (
    <div className="grid2">
      {cells.map(([label, value]) => (
        <div key={label} className="cell">
          <div className="cell-k plain">{label}</div>
          <div className="cell-v sm">{value}</div>
        </div>
      ))}
    </div>
  );
}
