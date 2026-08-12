import { useRef, useState } from 'react';
import { useInbox } from '../../features/inbox/useInbox';

/**
 * The 3AM box.
 *
 * One field. No category picker, no tags, no confirmation. It gets used
 * half-asleep with one thumb, and every extra control is a reason not to
 * bother. The classifier that turns these into cards lands in Phase 2; until
 * then the value is that the thought stopped being lost.
 */
export default function InboxScreen() {
  const inbox = useInbox();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (!text.trim()) return;
    await inbox.add(text);
    setText('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
    field.current?.focus();
  };

  const live = inbox.items.filter((i) => i.status !== 'discarded');

  return (
    <div className="screen inbox">
      <textarea
        ref={field}
        className="inbox-field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
        }}
        placeholder="What don't you know?"
        rows={3}
      />

      <button className="btn primary big" onClick={() => void save()} disabled={!text.trim()}>
        {saved ? 'Saved' : 'Save'}
      </button>

      {live.length > 0 && (
        <p className="meta">
          {inbox.pending} waiting · they become cards when the classifier ships
        </p>
      )}

      <ul className="inbox-list">
        {live.map((i) => (
          <li key={i.id}>
            <span className="inbox-text">{i.text}</span>
            <button
              className="inbox-x tap"
              onClick={() => void inbox.discard(i.id)}
              aria-label="Discard"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
