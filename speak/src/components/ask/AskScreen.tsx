import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { SearchIcon } from '../shell/Icons';
import type { Track } from '../../types/contract';

const CHIPS = [
  { id: 'word', icon: '📖', label: 'A word I heard', starter: 'What does this word mean: ' },
  { id: 'fix', icon: '✍️', label: 'Fix my sentence', starter: 'Fix my sentence: ' },
  { id: 'reply', icon: '💬', label: 'What do I reply to…', starter: 'What do I reply to ' },
  { id: 'slip', icon: '⚠️', label: 'A slip I make', starter: 'A slip I make: ' },
] as const;

const SKILLS: Array<{ track: Track; icon: string; name: string; sub: string }> = [
  { track: 'smalltalk', icon: '💬', name: 'Small talk', sub: 'Level 1' },
  { track: 'stories', icon: '📖', name: 'Stories', sub: 'Level 1' },
  { track: 'clearly', icon: '🎯', name: 'Speak clearly', sub: 'Level 1' },
  { track: 'words', icon: '🔤', name: 'Words', sub: 'Level 1' },
];

/**
 * Ask tab layout. The box and chips only fill in text for now; the box is
 * wired to the AI in step 3.
 */
export default function AskScreen() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useLiveQuery(
    () => db.asks.orderBy('createdAt').reverse().limit(5).toArray(),
    [],
  );

  const pickChip = (starter: string) => {
    setText(starter);
    inputRef.current?.focus();
  };

  return (
    <section className="ask-screen" aria-label="Ask">
      <h1 className="ask-title">Ask</h1>

      <label className="ask-box">
        <SearchIcon className="ask-box-icon" />
        <input
          ref={inputRef}
          type="text"
          className="ask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or speak anything…"
          aria-label="Ask anything"
          enterKeyHint="send"
        />
      </label>

      <div className="ask-chips">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ask-chip tap"
            onClick={() => pickChip(c.starter)}
          >
            <span aria-hidden="true">{c.icon}</span> {c.label}
          </button>
        ))}
      </div>

      <h2 className="ask-h2">Your 4 skills</h2>
      <div className="ask-tiles">
        {SKILLS.map((s) => (
          <div key={s.track} className={`ask-tile ask-tile-${s.track}`} data-track={s.track}>
            <span className="ask-tile-name">
              <span aria-hidden="true">{s.icon}</span> {s.name}
            </span>
            <span className="ask-tile-sub">{s.sub}</span>
            <span className="ask-tile-bar" aria-hidden="true">
              <span className="ask-tile-fill" />
            </span>
          </div>
        ))}
      </div>

      <h2 className="ask-h2">Recent asks</h2>
      {recent && recent.length > 0 ? (
        <ul className="ask-recent">
          {recent.map((a) => (
            <li key={a.id} className="ask-recent-item">
              <span aria-hidden="true">🕘</span> {a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ask-empty">Nothing asked yet. Your questions will show up here.</p>
      )}
    </section>
  );
}
