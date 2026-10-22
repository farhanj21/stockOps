import type { ReactNode } from 'react';

/** Label + control + inline error, for forms whose control isn't a plain text input. */
export function FormField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min0">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {error && (
        <div className="field-err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
