'use client';

import { useEffect, useState } from 'react';
import { useUI, type Toast as ToastData } from '@/lib/ui';
import { Icon } from './Icon';

const LEAVE_MS = 180;

export function Toast() {
  const toast = useUI((s) => s.toast);
  const dismiss = useUI((s) => s.dismissToast);
  // Keep showing the last toast briefly after it's cleared so it can fade out.
  const [shown, setShown] = useState<ToastData | null>(toast);
  const leaving = !toast && !!shown;

  if (toast && toast !== shown) setShown(toast);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(null), LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <div aria-live="polite" className="toast-region">
      {shown && (
        <div key={shown.id} className="toast" role="status" data-leaving={leaving}>
          <Icon name="check" size={16} stroke={2.5} color="var(--gold)" className="toast-check" />
          <span className="toast-text">{shown.text}</span>
          {shown.action && !leaving && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const fn = shown.action?.fn;
                dismiss();
                fn?.();
              }}
            >
              {shown.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
