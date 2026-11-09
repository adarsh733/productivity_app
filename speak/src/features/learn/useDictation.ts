import { useCallback, useEffect, useRef, useState } from 'react';

interface Dictaphone {
  start: () => void;
  stop: () => void;
  continuous?: boolean;
  interimResults?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => Dictaphone) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Dictaphone) | undefined;
  return typeof Ctor === 'function' ? Ctor : null;
}

export function useDictation(): {
  supported: boolean;
  listening: boolean;
  start(onText: (t: string) => void): void;
  stop(): void;
} {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Dictaphone | null>(null);
  const Ctor = getSpeechRecognitionCtor();
  const supported = Boolean(Ctor);

  const stop = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(
    (onText: (t: string) => void) => {
      if (!Ctor) return;
      if (recRef.current) {
        stop();
      }
      try {
        const rec = new Ctor();
        recRef.current = rec;
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          const last = e.results[e.results.length - 1];
          const text = last?.[0]?.transcript ?? '';
          if (text) onText(text);
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [Ctor, stop],
  );

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {}
    };
  }, []);

  return { supported, listening, start, stop };
}
