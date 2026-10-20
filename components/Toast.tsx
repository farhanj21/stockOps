'use client';

import { useUI } from '@/lib/ui';
import { Icon } from './Icon';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const dismiss = useUI((s) => s.dismissToast);

  return (
    <div aria-live="polite" className="toast-region">
      {toast && (
        <div key={toast.id} className="toast" role="status">
          <Icon name="check" size={16} stroke={2.5} color="var(--gold)" />
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const fn = toast.action?.fn;
                dismiss();
                fn?.();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
