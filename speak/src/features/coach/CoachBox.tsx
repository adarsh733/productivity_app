import { useEffect, useRef, useState } from 'react';
import { processInboxItem, saveCoachRaw } from './pipeline';

export interface CoachBoxProps {
  onDone?: () => void;
  onSaved?: () => void;
}

const CHIPS = [
  'A word I liked: …',
  'I keep saying: …',
  "I'm curious about: …",
] as const;

/** True only when the browser can dictate. The box works without it. */
function canDictate(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
}

interface Dictaphone {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/**
 * "Tell the coach" entry. One field, optional dictation, three starter
 * chips. Saves raw and gets out of the way — classification happens in the
 * background. Mic never gates.
 */
export default function CoachBox({ onDone, onSaved }: CoachBoxProps) {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Dictaphone | null>(null);
  const dictate = canDictate();

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {}
    };
  }, []);

  const toggleDictation = () => {
    if (!dictate) return;
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {}
      setListening(false);
      return;
    }
    try {
      const w = window as unknown as Record<string, unknown>;
      const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as new () => Dictaphone;
      const rec = new Ctor();
      recRef.current = rec;
      rec.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        const text = last?.[0]?.transcript ?? '';
        if (text) setDraft((d) => (d ? `${d} ${text}` : text));
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const save = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const item = await saveCoachRaw(trimmed);
    setDraft('');
    setSaved(true);
    onSaved?.();
    // Background classify; row keeps `raw` + plain failReason on failure.
    void processInboxItem(item.id).catch(() => {});
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="coach-box" aria-label="Tell the coach">
      <label htmlFor="coach-box-field" className="coach-box-label">
        Tell the coach
      </label>
      <div className="coach-box-row">
        <input
          id="coach-box-field"
          className="coach-box-field"
          type="text"
          value={draft}
          placeholder="A word you liked, a mistake, a topic…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save(draft);
          }}
          aria-label="Tell the coach"
        />
        {dictate && (
          <button
            type="button"
            className="abtn tap"
            onClick={toggleDictation}
            aria-label={listening ? 'Stop dictation' : 'Dictate your note'}
            aria-pressed={listening}
          >
            {listening ? '⏹' : '🎤'}
          </button>
        )}
        <button
          type="button"
          className="prim tap"
          disabled={!draft.trim()}
          onClick={() => void save(draft)}
          aria-label="Save to coach"
        >
          Save
        </button>
      </div>
      <div className="coach-box-chips" role="group" aria-label="Starters">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="abtn tap"
            onClick={() => setDraft(chip.replace('…', ''))}
            aria-label={`Start with ${chip}`}
          >
            {chip}
          </button>
        ))}
      </div>
      {saved && (
        <p className="sub" role="status">
          Saved — I&apos;ll turn it into cards when you&apos;re online.
        </p>
      )}
      {onDone && (
        <button type="button" className="abtn tap" onClick={onDone} aria-label="Close coach box">
          Close
        </button>
      )}
    </div>
  );
}
