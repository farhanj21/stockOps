import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | null;
}

/** Labelled 48px text input with an inline error line. */
export function Field({ id, label, error, ...input }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        {...input}
      />
      {error && (
        <div id={`${id}-err`} className="field-err">
          {error}
        </div>
      )}
    </div>
  );
}
