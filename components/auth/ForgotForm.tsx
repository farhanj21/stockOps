'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { requestPasswordReset } from '@/app/actions';
import { Icon } from '@/components/Icon';
import { EMAIL_RE } from '@/lib/format';
import { Field } from './Field';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    const problem = !v ? 'This field is required.' : !EMAIL_RE.test(v) ? 'Enter a valid email address.' : null;
    if (problem) {
      setErr(problem);
      return;
    }
    await requestPasswordReset(v).catch(() => null);
    setSentTo(v);
    setEmail('');
  }

  if (sentTo) {
    return (
      <div className="auth-done">
        <div className="done-ico mail">
          <Icon name="mail" size={26} />
        </div>
        {/* Email delivery isn't configured yet, so resets go through the plant admin. */}
        <h1 className="done-title">Ask your admin</h1>
        <div className="done-text">
          Password resets by email aren&apos;t switched on yet. An Admin in your organization can set a new password for <strong>{sentTo}</strong> from the Team menu.
        </div>
        <Link href="/signin" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <Link href="/signin" className="back-link">
        <Icon name="chevronLeft" size={16} />
        Back to sign in
      </Link>
      <div className="auth-head">
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-sub">Enter the email on your account.</p>
      </div>
      <Field
        id="fp-email"
        label="Work email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="name@plant1.co"
        value={email}
        error={err}
        onChange={(e) => {
          setEmail(e.target.value);
          setErr(null);
        }}
      />
      <button type="submit" className="btn btn-primary btn-lg">
        Send reset link
      </button>
    </form>
  );
}
