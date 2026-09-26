import { useState } from 'react';
import CoachBox from '../../features/coach/CoachBox';

/** You-tab entry row for the coach box. One tap opens the field. Mic never gates. */
export default function CoachBoxRow() {
  const [open, setOpen] = useState(false);

  return (
    <div className="you-section">
      <div
        className="row tap"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-label="Tell the coach"
        aria-expanded={open}
      >
        <span className="g" aria-hidden="true">💬</span>
        <div className="t">
          <b>Tell the coach</b>
          <small>A word you liked, a mistake, a topic</small>
        </div>
        <span className="arw" aria-hidden="true">›</span>
      </div>
      {open && <CoachBox onDone={() => setOpen(false)} />}
    </div>
  );
}
