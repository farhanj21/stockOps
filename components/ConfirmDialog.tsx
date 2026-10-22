'use client';

import { useEffect, useRef, useState } from 'react';
import { useConfirm, type ConfirmOptions } from '@/lib/ui';
import { Icon } from './Icon';

const LEAVE_MS = 160;

/** The app's confirm box (used instead of the browser's native confirm). */
export function ConfirmDialog() {
  const open = useConfirm((s) => s.open);
  // Keep the last content on screen while it animates out.
  const [shown, setShown] = useState<ConfirmOptions | null>(open);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const leaving = !open && !!shown;

  if (open && open !== shown) setShown(open);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(null), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const answer = (ok: boolean) => {
    const o = useConfirm.getState().open;
    if (!o) return;
    useConfirm.setState({ open: null });
    o.resolve(ok);
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        answer(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open]);

  if (!shown) return null;
  return (
    <div className="confirm-layer" data-leaving={leaving}>
      <div className="confirm-backdrop" onClick={() => answer(false)} aria-hidden="true" />
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={shown.body ? 'confirm-body' : undefined}>
        <div className={`confirm-ico${shown.danger ? ' danger' : ''}`}>
          <Icon name={shown.danger ? 'trash' : 'alert'} size={20} />
        </div>
        <h2 id="confirm-title" className="confirm-title">
          {shown.title}
        </h2>
        {shown.body && (
          <p id="confirm-body" className="confirm-body">
            {shown.body}
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={() => answer(false)}>
            {shown.cancelLabel ?? 'Cancel'}
          </button>
          <button type="button" className={`btn ${shown.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)}>
            {shown.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
