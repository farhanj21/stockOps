'use client';

import { Icon, type IconName } from '@/components/Icon';
import { setTheme, THEMES, useTheme, type Theme } from '@/lib/theme';

const ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', mono: 'contrast' };

/** Light / Dark / Mono segmented switch. The choice is remembered on this device. */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const theme = useTheme();
  return (
    <div className={`theme-switch ${className}`} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => setTheme(t.value)}>
          <Icon name={ICON[t.value]} size={14} stroke={2} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
