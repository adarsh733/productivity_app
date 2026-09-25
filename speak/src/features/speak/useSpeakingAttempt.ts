import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioMeterController,
  calculateWpm,
  computePauseCount,
  computeVoicedSec,
  findTargetVocabMatches,
  noiseFloorFromDbs,
  type VolumeMeasurement,
} from '../../lib/audioMeter';
import { LAB_RULES } from '../../types/contract';
import { pickMimeType, type CapturedAudio } from '../reset/useMissionAudio';

export type SpeakingAttemptState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'stopping'
  | 'ready_for_review'
  | 'saved'
  | 'error'
  | 'cancelled';

export interface SpeakingAttemptResult {
  id: string;
  audio: CapturedAudio | null;
  durationSec: number;
  transcript?: string;
  wpm?: number;
  pauseCount: number;
  avgDb?: number;
  voicedSec?: number;
  noiseFloorDb?: number;
  /** % of voiced frames above the live target band. Set by the recorder when a band exists. */
  pctAboveBand?: number;
  targetVocabMatches?: { matched: string[]; missing: string[] };
}

export interface UseSpeakingAttemptOptions {
  durationSec: number;
  targetVocab?: string[];
  drillTitle?: string;
  promptText?: string;
  cardLang?: 'en' | 'hi';
  onComplete?: (result: SpeakingAttemptResult) => void;
  onStateChange?: (state: SpeakingAttemptState) => void;
}

export interface SpeakingAttemptController {
  state: SpeakingAttemptState;
  elapsedSec: number;
  volumePercent: number;
  db: number;
  error: string | null;
  transcript: string;
  result: SpeakingAttemptResult | null;
  speechRecognitionActive: boolean;
  speechRecognitionSupported: boolean;
  start: () => Promise<boolean>;
  stop: () => Promise<SpeakingAttemptResult | null>;
  cancel: () => void;
  reset: () => void;
  markSaved: () => void;
}

/**
 * Pure SpeakingAttemptSession class.
 * Holds all state, timers, meter references, and MediaRecorder instances.
 * Isolated from React render cycles so volume updates at 60fps never tear down the recorder.
 */
export class SpeakingAttemptSession {
  public state: SpeakingAttemptState = 'idle';
  public elapsedSec = 0;
  public volumePercent = 0;
  public db = -60;
  public error: string | null = null;
  public liveTranscript = '';
  public result: SpeakingAttemptResult | null = null;
  public speechRecognitionActive = false;

  private meter: AudioMeterController | null = null;
  private recorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timer: number | null = null;
  private startTime = 0;
  private elapsed = 0;
  private samples: Array<{ db: number; atMs: number }> = [];
  private recognition: any = null;
  private transcript = '';
  private finalTranscriptParts: string[] = [];
  private stopPromise: Promise<SpeakingAttemptResult | null> | null = null;

  constructor(
    public options: UseSpeakingAttemptOptions,
    private onUpdate?: () => void,
  ) {}

  private notify() {
    if (this.onUpdate) this.onUpdate();
    if (this.options.onStateChange) this.options.onStateChange(this.state);
  }

  public get isRecognitionSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }

  public stopAllResources() {
    if (this.timer) {
      if (typeof window !== 'undefined') {
        window.clearInterval(this.timer);
      } else {
        clearInterval(this.timer);
      }
      this.timer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.speechRecognitionActive = false;

    if (this.recorder) {
      const rec = this.recorder;
      this.recorder = null;
      if (rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {}
      }
    }

    if (this.meter) {
      this.meter.stop();
      this.meter = null;
    }
  }

  public cancel() {
    this.stopAllResources();
    this.audioChunks = [];
    this.samples = [];
    this.transcript = '';
    this.finalTranscriptParts = [];
    this.stopPromise = null;

    this.volumePercent = 0;
    this.db = -60;
    this.liveTranscript = '';
    this.result = null;
    this.state = 'cancelled';
    this.notify();
  }

  public reset() {
    this.stopAllResources();
    this.audioChunks = [];
    this.samples = [];
    this.transcript = '';
    this.finalTranscriptParts = [];
    this.stopPromise = null;

    this.elapsedSec = 0;
    this.volumePercent = 0;
    this.db = -60;
    this.error = null;
    this.liveTranscript = '';
    this.result = null;
    this.state = 'idle';
    this.notify();
  }

  public markSaved() {
    this.state = 'saved';
    this.notify();
  }

  public async start(): Promise<boolean> {
    this.reset();
    this.error = null;
    this.state = 'requesting_permission';
    this.notify();

    try {
      const meter = new AudioMeterController();
      this.meter = meter;

      this.samples = [];
      const started = await meter.start((m: VolumeMeasurement) => {
        this.volumePercent = m.percent;
        this.db = m.db;
        this.samples.push({ db: m.db, atMs: performance.now() });
        this.notify();
      });

      if (!started || !meter.mediaStream) {
        this.error =
          'Microphone is blocked. In iOS Safari: Settings › Safari › Microphone › Allow — then tap Back and try again.';
        this.state = 'error';
        meter.stop();
        this.meter = null;
        this.notify();
        return false;
      }

      // Initialize MediaRecorder on the SAME single MediaStream
      const MediaRecorderClass =
        typeof MediaRecorder !== 'undefined'
          ? MediaRecorder
          : (window as any).MediaRecorder || (globalThis as any).MediaRecorder;

      if (!MediaRecorderClass) {
        this.error = 'Audio recorder could not initialize.';
        this.state = 'error';
        meter.stop();
        this.meter = null;
        this.notify();
        return false;
      }

      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorderClass(meter.mediaStream, mimeType ? { mimeType } : undefined);
      } catch {
        this.error = 'Audio recorder could not initialize.';
        this.state = 'error';
        meter.stop();
        this.meter = null;
        this.notify();
        return false;
      }

      this.audioChunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      recorder.start(1000);
      this.recorder = recorder;

      // Initialize SpeechRecognition if supported
      this.transcript = '';
      this.finalTranscriptParts = [];
      this.liveTranscript = '';
      const SpeechRecognition =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = this.options.cardLang === 'hi' ? 'hi-IN' : 'en-IN';

          recognition.onresult = (event: any) => {
            // Keep finalised text across restarts: accumulate finals, show interim live.
            let interim = '';
            for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
              const res = event.results[i];
              const text = res[0]?.transcript ?? '';
              if (res.isFinal) {
                const cleanFinal = text.trim();
                if (cleanFinal) this.finalTranscriptParts.push(cleanFinal);
              } else {
                interim += text + ' ';
              }
            }
            const finals = this.finalTranscriptParts.join(' ').trim();
            const cleanInterim = interim.trim();
            const full = [finals, cleanInterim].filter(Boolean).join(' ').trim();
            this.transcript = full;
            this.liveTranscript = full;
            this.notify();
          };

          recognition.onerror = () => {
            this.speechRecognitionActive = false;
            this.notify();
          };

          recognition.onend = () => {
            if (this.state === 'recording') {
              try {
                recognition.start();
              } catch {
                this.speechRecognitionActive = false;
                this.notify();
              }
            }
          };

          recognition.start();
          this.recognition = recognition;
          this.speechRecognitionActive = true;
        } catch {
          this.recognition = null;
          this.speechRecognitionActive = false;
        }
      }

      // Start elapsed timer
      this.startTime = performance.now();
      this.elapsed = 0;
      this.elapsedSec = 0;
      this.state = 'recording';
      this.notify();

      const maxDuration = this.options.durationSec;
      const setTimer = typeof window !== 'undefined' ? window.setInterval : setInterval;
      this.timer = setTimer(() => {
        this.elapsed += 1;
        this.elapsedSec = this.elapsed;
        this.notify();

        if (this.elapsed >= maxDuration) {
          void this.stop();
        }
      }, 1000) as unknown as number;

      return true;
    } catch (err: unknown) {
      this.error = (err as Error).message || 'Failed to start microphone.';
      this.state = 'error';
      this.stopAllResources();
      this.notify();
      return false;
    }
  }

  public async stop(): Promise<SpeakingAttemptResult | null> {
    if (this.state === 'ready_for_review' || this.state === 'saved') {
      return this.result;
    }
    if (this.stopPromise) {
      return await this.stopPromise;
    }
    if (this.state !== 'recording' && this.state !== 'requesting_permission') {
      return null;
    }

    this.state = 'stopping';
    this.notify();

    const promise = (async (): Promise<SpeakingAttemptResult | null> => {
      // 1. Stop timer
      if (this.timer) {
        if (typeof window !== 'undefined') {
          window.clearInterval(this.timer);
        } else {
          clearInterval(this.timer);
        }
        this.timer = null;
      }

      // 2. Measure actual duration
      const now = performance.now();
      const measuredFromTime =
        this.startTime > 0 ? Math.round((now - this.startTime) / 1000) : 0;
      const measuredDurationSec = Math.max(this.elapsed, measuredFromTime);
      this.elapsedSec = measuredDurationSec;

      // 3. Stop Speech Recognition
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch {}
        this.recognition = null;
      }
      this.speechRecognitionActive = false;

      // 4. Stop MediaRecorder and collect blob
      const recorder = this.recorder;
      let capturedAudio: CapturedAudio | null = null;

      if (recorder && recorder.state !== 'inactive') {
        const mimeType = recorder.mimeType || pickMimeType() || 'audio/webm';
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          try {
            recorder.stop();
          } catch {
            resolve();
          }
        });

        const chunks = this.audioChunks;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          capturedAudio = { id, blob, mimeType };
        }
      }
      this.recorder = null;

      // 5. Stop AudioMeterController (releases stream tracks, audioCtx, anim frame)
      if (this.meter) {
        this.meter.stop();
        this.meter = null;
      }
      this.volumePercent = 0;
      this.db = -60;

      // 6. Compute metrics
      // WPM is measured only when recognition produced words; never estimated.
      const hasRecognition = this.isRecognitionSupported;
      const transcript = this.transcript.trim() || undefined;
      const wordCount = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
      const wpm =
        hasRecognition && transcript && wordCount > 0
          ? calculateWpm(wordCount, measuredDurationSec)
          : undefined;

      const pauseCount = computePauseCount(this.samples, LAB_RULES.SILENCE_FLOOR_DB);

      // Average dB from voiced samples
      const voicedSamples = this.samples.filter((s) => s.db > LAB_RULES.SILENCE_FLOOR_DB);
      const avgDb =
        voicedSamples.length > 0
          ? Math.round(
              (voicedSamples.reduce((sum, s) => sum + s.db, 0) / voicedSamples.length) * 10,
            ) / 10
          : undefined;

      const noiseFloorDb =
        this.samples.length > 0
          ? Math.round(noiseFloorFromDbs(this.samples.map((s) => s.db)) * 10) / 10
          : undefined;
      const voicedSec = computeVoicedSec(this.samples, noiseFloorDb);

      const targetVocabMatches =
        transcript && this.options.targetVocab && this.options.targetVocab.length > 0
          ? findTargetVocabMatches(transcript, this.options.targetVocab)
          : undefined;

      const finalResult: SpeakingAttemptResult = {
        id: capturedAudio?.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        audio: capturedAudio,
        durationSec: measuredDurationSec,
        transcript,
        wpm,
        pauseCount,
        avgDb,
        voicedSec,
        noiseFloorDb,
        targetVocabMatches,
      };

      this.result = finalResult;
      this.state = 'ready_for_review';
      this.stopPromise = null;
      this.notify();

      if (this.options.onComplete) {
        this.options.onComplete(finalResult);
      }

      return finalResult;
    })();

    this.stopPromise = promise;
    return await promise;
  }
}

export function useSpeakingAttempt(options: UseSpeakingAttemptOptions): SpeakingAttemptController {
  const [, setTick] = useState(0);
  const sessionRef = useRef<SpeakingAttemptSession | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = new SpeakingAttemptSession(options, () => {
      setTick((t) => t + 1);
    });
  }
  sessionRef.current.options = options;

  const session = sessionRef.current;

  // Cleanup runs STRICTLY on unmount
  useEffect(() => {
    return () => {
      session.stopAllResources();
    };
  }, [session]);

  const start = useCallback(() => session.start(), [session]);
  const stop = useCallback(() => session.stop(), [session]);
  const cancel = useCallback(() => session.cancel(), [session]);
  const reset = useCallback(() => session.reset(), [session]);
  const markSaved = useCallback(() => session.markSaved(), [session]);

  return {
    state: session.state,
    elapsedSec: session.elapsedSec,
    volumePercent: session.volumePercent,
    db: session.db,
    error: session.error,
    transcript: session.liveTranscript,
    result: session.result,
    speechRecognitionActive: session.speechRecognitionActive,
    speechRecognitionSupported: session.isRecognitionSupported,
    start,
    stop,
    cancel,
    reset,
    markSaved,
  };
}
