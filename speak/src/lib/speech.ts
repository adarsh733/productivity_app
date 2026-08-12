/**
 * Text-to-speech via the browser. Free, offline, and iOS ships usable en-IN,
 * en-GB and hi-IN voices — no API and no audio files to host.
 *
 * Phase 1 adds the microphone side. This file stays output-only.
 */

let cached: SpeechSynthesisVoice[] | null = null;

export function voices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  cached ??= speechSynthesis.getVoices();
  if (cached.length === 0) cached = speechSynthesis.getVoices();
  return cached ?? [];
}

/** iOS populates the voice list asynchronously, and late. */
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', () => {
    cached = speechSynthesis.getVoices();
  });
}

function pick(lang: 'en' | 'hi'): SpeechSynthesisVoice | undefined {
  const all = voices();
  const want = lang === 'hi' ? ['hi-IN'] : ['en-IN', 'en-GB', 'en-US'];
  for (const tag of want) {
    const hit = all.find((v) => v.lang.replace('_', '-') === tag);
    if (hit) return hit;
  }
  return all.find((v) => v.lang.startsWith(lang));
}

export function supported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export interface SpeakOptions {
  lang?: 'en' | 'hi';
  /** 1 is the browser default. Model cards are read slightly slow on purpose. */
  rate?: number;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!supported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pick(opts.lang ?? 'en');
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? (opts.lang === 'hi' ? 'hi-IN' : 'en-IN');
  u.rate = opts.rate ?? 0.9;
  speechSynthesis.speak(u);
}

export function stop(): void {
  if (supported()) speechSynthesis.cancel();
}
