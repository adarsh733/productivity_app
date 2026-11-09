import { useState, type FormEvent } from 'react';
import { useAccount } from '../../sync/useAccount';

function timeLabel(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

/**
 * Backup under the stats on Me. Not set up = one plain line. Signed out =
 * email + "Send code", then the 6-digit code + "Sign in". Signed in =
 * "Backed up · <time>" + "Sign out".
 */
export default function BackupRow() {
  const acc = useAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Something went wrong. Try again.');
  };

  if (acc.status === 'code_sent') {
    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      void run(() => acc.verifyCode(code));
    };
    return (
      <form className="me-backup" data-testid="me-backup" onSubmit={onSubmit}>
        <p className="me-backup-line">Type the 6-digit code we emailed{acc.email ? ` to ${acc.email}` : ''}</p>
        <div className="me-backup-field">
          <input
            className="me-backup-input"
            aria-label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button type="submit" className="me-backup-btn tap" disabled={busy || code.length !== 6}>
            Sign in
          </button>
        </div>
        {error && <p className="me-backup-error" role="alert">{error}</p>}
      </form>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => acc.sendCode(email));
  };
  return (
    <form className="me-backup" data-testid="me-backup" onSubmit={onSubmit}>
      <p className="me-backup-line">Back up your cards and progress</p>
      <div className="me-backup-field">
        <input
          className="me-backup-input"
          type="email"
          aria-label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="me-backup-btn tap" disabled={busy || !email.trim()}>
          Send code
        </button>
      </div>
      {error && <p className="me-backup-error" role="alert">{error}</p>}
    </form>
  );
}
