import { useState, type FormEvent } from 'react';
import { useAccount } from '../../sync/useAccount';
import { MIN_PASSWORD } from '../../sync/supabase';

function timeLabel(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

/**
 * Backup under the stats on Me. Not set up = one plain line. Signed out =
 * email + password + one "Sign in" (the first time, that creates the backup).
 * Signed in = "Backed up · <time>" + "Sign out".
 */
export default function BackupRow() {
  const acc = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (acc.status === 'not_set_up') {
    return (
      <div className="me-backup" data-testid="me-backup">
        <p className="me-backup-line">Backup is not switched on yet</p>
      </div>
    );
  }

  if (acc.status === 'signed_in') {
    return (
      <div className="me-backup me-backup-on" data-testid="me-backup">
        <p className="me-backup-line" data-testid="me-backup-status">
          {acc.lastBackupAt ? `Backed up · ${timeLabel(acc.lastBackupAt)}` : 'Backed up · just now'}
        </p>
        {acc.email && <p className="me-backup-sub">{acc.email}</p>}
        <button type="button" className="me-backup-btn tap" onClick={() => void acc.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await acc.signIn(email, password);
    setBusy(false);
    if (res.ok) setPassword('');
    else setError(res.error ?? 'Something went wrong. Try again.');
  };

  const ready = email.trim().length > 0 && password.length >= MIN_PASSWORD;
  return (
    <form className="me-backup" data-testid="me-backup" onSubmit={(e) => void onSubmit(e)}>
      <p className="me-backup-line">Back up your cards and progress</p>
      <input
        className="me-backup-input"
        type="email"
        name="email"
        aria-label="Email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="me-backup-input"
        type="password"
        name="password"
        aria-label="Password"
        autoComplete="current-password"
        minLength={MIN_PASSWORD}
        placeholder={`Password (${MIN_PASSWORD}+ characters)`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="me-backup-sub">First time? This creates your backup with this password.</p>
      <button type="submit" className="me-backup-btn tap" disabled={busy || !ready}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {error && (
        <p className="me-backup-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
