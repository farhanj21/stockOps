'use client';

import { useState, useSyncExternalStore } from 'react';
import { promptInstall, useInstallMode } from '@/lib/install';
import { toast } from '@/lib/ui';
import { Icon } from './Icon';
import { Logo } from './Logo';

const DISMISS_KEY = 'stockops-install-dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Banner offering to install StockOps on this phone or computer. Hidden once installed or dismissed. */
export function InstallBanner() {
  const mode = useInstallMode();
  const stored = useSyncExternalStore(
    () => () => {},
    readDismissed,
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);
  if (mode === 'none' || stored || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  return (
    <div className="install-banner" role="region" aria-label="Install the app">
      <Logo size="sm" />
      <div className="row-main">
        <span style={{ fontSize: 14, fontWeight: 700 }}>Install StockOps</span>
        <span className="row-sub">{mode === 'ios' ? 'Add it to your Home Screen to open it like an app.' : 'Open it from your home screen, full screen, like any app.'}</span>
      </div>
      <InstallButton compact />
      <button type="button" className="icon-btn" aria-label="Not now" onClick={dismiss}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** "Install" for Chrome/Edge/Android; "How to install" steps for iPhone/iPad Safari. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const mode = useInstallMode();
  const [steps, setSteps] = useState(false);
  if (mode === 'none') return null;

  if (mode === 'prompt') {
    return (
      <button
        type="button"
        className={`btn btn-primary${compact ? '' : ' btn-lg'}`}
        onClick={async () => {
          if (await promptInstall()) toast('StockOps installed. Open it from your home screen.');
        }}
      >
        <Icon name="download" size={16} />
        Install
      </button>
    );
  }

  return (
    <>
      <button type="button" className={`btn btn-outline${compact ? '' : ' btn-lg'}`} onClick={() => setSteps((v) => !v)} aria-expanded={steps}>
        How to install
      </button>
      {steps && (
        <ol className="ios-steps">
          <li>
            Tap the <strong>Share</strong> button <ShareGlyph /> in Safari&apos;s toolbar.
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>. StockOps appears on your Home Screen.
          </li>
        </ol>
      )}
    </>
  );
}

const ShareGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-2px' }}>
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
