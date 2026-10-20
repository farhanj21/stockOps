'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { EMAIL_RE } from '@/lib/format';
import { toast } from '@/lib/ui';
import { Field } from './Field';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    const problem = !v ? 'This field is required.' : !EMAIL_RE.test(v) ? 'Enter a valid email address.' : null;
    if (problem) {
      setErr(problem);
      return;
    }
    setSentTo(v);
    setEmail('');
  }

  if (sentTo) {
    return (
      <div className="auth-done">
        <div className="done-ico mail">
          <Icon name="mail" size={26} />
        </div>
        <h1 className="done-title">Check your email</h1>
        <div className="done-text">
          We sent a reset link to <strong>{sentTo}</strong>. It expires in 30 minutes.
        </div>
        <Link href="/signin" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>
          Back to sign in
        </Link>
        <div className="auth-switch">
          Didn&apos;t get it?
          <button type="button" className="btn-link" onClick={() => toast(`Reset link sent again to ${sentTo}.`)}>
            Resend
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <Link href="/signin" className="back-link">
        <Icon name="chevronLeft" size={16} />
        Back to sign in
      </Link>
      <div>
        <h1 className="auth-title">Reset password</h1>
        <div className="auth-sub">Enter your work email and we&apos;ll send you a reset link.</div>
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
