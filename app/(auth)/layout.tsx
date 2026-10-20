import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

/** Signed-in visitors are sent to the dashboard by proxy.ts before this renders. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="brand-row">
          <Logo size="lg" />
          <div>
            <div className="brand-name">StockOps</div>
            <div className="brand-tag">Production MRP &amp; inventory control</div>
          </div>
        </div>
        <div className="auth-hero w-only">
          <div className="auth-hero-k">Plant 1 · Chocolate lines</div>
          <div className="auth-hero-t">Every batch, every bag, accounted for.</div>
          <div className="auth-hero-s">
            Stock counts, recipes, forecasts and purchase orders in one place — built to replace the shared spreadsheet.
          </div>
        </div>
        <div className="auth-foot w-only">Accounts are approved by your plant admin.</div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
