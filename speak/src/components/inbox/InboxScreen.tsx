import { useRef, useState } from 'react';
import { useInbox } from '../../features/inbox/useInbox';

/**
 * Capture screen (formerly Inbox).
 *
 * One field. No category picker, no tags, no confirmation. It gets used
 * half-asleep with one thumb.
 */
export default function InboxScreen() {
  const inbox = useInbox();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (!text.trim()) return;
    await inbox.add(text);
    setText('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
    fieldRef.current?.focus();
  };

  const liveItems = inbox.items.filter((i) => i.status !== 'discarded');

  return (
    <div className="screen capture">
      <header className="screen-head">
        <h1 className="screen-title">Capture</h1>
      </header>

      <div className="capture-container">
        <textarea
          ref={fieldRef}
          className="capture-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
          }}
          placeholder="What don't you know?"
          rows={3}
        />

        <button
          className="btn btn-primary big tap"
          onClick={() => void save()}
          disabled={!text.trim()}
          type="button"
        >
          {saved ? 'Saved' : 'Save'}
        </button>

        {liveItems.length > 0 && (
          <p className="hint">
            {inbox.pending} waiting · they become cards when the classifier ships
          </p>
        )}

        <ul className="capture-list">
          {liveItems.map((item) => (
            <li key={item.id} className="capture-item">
              <span className="capture-text">{item.text}</span>
              <button
                className="capture-x tap"
                onClick={() => void inbox.discard(item.id)}
                aria-label="Discard"
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
