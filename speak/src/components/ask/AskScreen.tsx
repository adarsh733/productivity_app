import { useMemo, useRef, useState } from 'react';
import { ArrowRightIcon } from '../shell/Icons';
import { RING_ART } from '../../features/cards/art';
import type { AnswerAskPayload, Track } from '../../types/contract';
import SkillPage from '../lessons/SkillPage';
import AskAnswer from './AskAnswer';
import { useLessons } from '../../features/lessons/useLessons';
import { useAsk } from '../../features/ask/useAsk';
import { MIN_QUERY_CHARS } from '../../features/ask/librarySearch';

const CHIPS = [
  { id: 'word', label: 'A word I heard', starter: 'What does this word mean: ' },
  { id: 'fix', label: 'Fix my sentence', starter: 'Fix my sentence: ' },
  { id: 'reply', label: 'What do I reply to…', starter: 'What do I reply to ' },
  { id: 'slip', label: 'A slip I make', starter: 'A slip I make: ' },
] as const;

/** Show the "950 / 1000" counter once this few characters are left. */
const COUNTER_FROM_LEFT = 100;

const SKILLS: Array<{ track: Track; name: string; sub: string }> = [
  { track: 'smalltalk', name: 'Small talk', sub: 'Level 1' },
  { track: 'stories', name: 'Stories', sub: 'Level 1' },
  { track: 'clearly', name: 'Speak clearly', sub: 'Level 1' },
  { track: 'words', name: 'Words', sub: 'Level 1' },
];

/**
 * Ask tab. Typing searches the cards he already has, instantly and offline.
 * Send asks the AI, checks the new cards on a second provider, and shows the
 * answer. If anything fails he gets one plain line and the library results.
 */
export default function AskScreen() {
  const [skill, setSkill] = useState<Track | null>(null);
  const { ready, lessons, doneIds, ladderOf } = useLessons();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const levels = useMemo<AnswerAskPayload['levels'] | undefined>(() => {
    if (!ready) return undefined;
    const out: NonNullable<AnswerAskPayload['levels']> = {};
    for (const s of SKILLS) {
      const open = ladderOf(s.track).find((l) => l.status === 'open');
      if (open) out[s.track] = open.level;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }, [ready, ladderOf]);

  const ask = useAsk({ levels });
  const { text, setText, library, phase, view, added, adding, checking, canSend, recent, hint, maxChars } = ask;
  const typing = text.trim().length >= MIN_QUERY_CHARS;
  // The counter shows only near the limit, so it never nags.
  const nearLimit = text.length >= maxChars - COUNTER_FROM_LEFT;

  const pickChip = (starter: string) => {
    setText(starter);
    inputRef.current?.focus();
  };

  if (skill) return <SkillPage track={skill} onBack={() => setSkill(null)} />;

  return (
    <section className="ask-screen" aria-label="Ask">
      <h1 className="ask-title">Ask anything</h1>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask.send();
        }}
      >
        <label className="ask-box">
          <textarea
            ref={inputRef}
            className="ask-input"
            rows={1}
            value={text}
            maxLength={maxChars}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends (as the old one-line box did); Shift+Enter adds a line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask.send();
              }
            }}
            placeholder="How do I say this better?"
            aria-label="Ask anything"
            aria-describedby={hint ? 'ask-hint' : undefined}
            enterKeyHint="send"
          />
        </label>
        <button
          type="submit"
          className="ask-send tap"
          disabled={!canSend}
          aria-label={phase === 'asking' ? 'Asking…' : 'Ask'}
        >
          <ArrowRightIcon aria-hidden="true" />
        </button>
      </form>

      {(hint || nearLimit) && (
        <div className="ask-input-meta">
          {hint && (
            <p id="ask-hint" className="ask-hint" role="status">
              {hint}
            </p>
          )}
          {nearLimit && (
            <span className="ask-counter" data-testid="ask-counter" aria-live="polite">
              {text.length} / {maxChars}
            </span>
          )}
        </div>
      )}

      <div className="ask-chips">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ask-chip tap"
            onClick={() => pickChip(c.starter)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {phase === 'asking' && (
        <p className="ask-line" role="status">
          Looking that up…
        </p>
      )}

      {view && phase === 'done' && (
        <AskAnswer
          view={view}
          added={added}
          adding={adding}
          onAdd={() => void ask.addToFeed()}
          checking={checking}
          onRetryCheck={() => void ask.retryCheck()}
        />
      )}

      {!view && phase !== 'asking' && typing && library.length > 0 && (
        <section className="ask-section" aria-label="In your library">
          <h2 className="ask-h2">In your library</h2>
          <ul className="ask-hits">
            {library.map((h) => (
              <li key={h.card.id} className="ask-hit" data-source="library">
                <span className="ask-hit-title">{h.title}</span>
                <span className="ask-hit-line">{h.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="ask-h2">Your 4 skills</h2>
      <div className="ask-tiles">
        {SKILLS.map((s) => {
          const own = lessons.filter((l) => l.track === s.track);
          const done = own.filter((l) => doneIds.has(l.id)).length;
          const level = ready ? (ladderOf(s.track).find((l) => l.status === 'open')?.level ?? null) : null;
          const sub = level ? `Level ${level}` : s.sub;
          return (
            <button
              key={s.track}
              type="button"
              className={`ask-tile ask-tile-${s.track} tap`}
              data-track={s.track}
              onClick={() => setSkill(s.track)}
              aria-label={`${s.name}, ${sub}. Open`}
            >
              <span className="ask-tile-name">{s.name}</span>
              <img className="ask-tile-art" src={RING_ART[s.track]} alt="" draggable={false} />
              <span className="ask-tile-bar" aria-hidden="true">
                <span
                  className="ask-tile-fill"
                  style={own.length ? { width: `${Math.round((done / own.length) * 100)}%` } : undefined}
                />
              </span>
            </button>
          );
        })}
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
