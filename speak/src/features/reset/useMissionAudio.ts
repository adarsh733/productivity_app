/**
 * Recording an attempt, and playing it back.
 *
 * The product promise is "say it, hear one correction, say it again, hear the
 * improvement". Until now nothing was captured — only a live meter — so the
 * comparison screen showed two durations and asserted the second attempt was
 * better. This records the audio so the comparison is something he can hear.
 *
 * The recorder writes the meter's own stream (`AudioMeterController.mediaStream`)
 * rather than opening a second capture: two `getUserMedia` calls give two
 * independent streams of the same voice, and on iOS the second can take the
 * first one's track.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Container preference. Safari/iOS only produces `audio/mp4`; Chrome and
 * Firefox only `audio/webm`. An unsupported string passed to `MediaRecorder`
 * throws, so this probes rather than assumes, and an empty string tells the
 * browser to pick.
 */
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

export function pickMimeType(
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
): string {
  return MIME_CANDIDATES.find((type) => isSupported(type)) ?? '';
}

export interface CapturedAudio {
  blob: Blob;
  mimeType: string;
}

export interface MissionAudioApi {
  /** True once a recorder is actually writing chunks. */
  capturing: boolean;
  /** The recorder could not start — the timed rep still runs, silently. */
  unavailable: boolean;
  start(stream: MediaStream | null): boolean;
  stop(): Promise<CapturedAudio | null>;
  cancel(): void;
}

export function useMissionAudio(): MissionAudioApi {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    chunksRef.current = [];
    setCapturing(false);
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Already torn down with the stream. Nothing to release.
      }
    }
  }, []);

  const start = useCallback(
    (stream: MediaStream | null): boolean => {
      cancel();
      if (!stream || typeof MediaRecorder === 'undefined') {
        setUnavailable(true);
        return false;
      }
      try {
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        // A timeslice means a browser kill mid-attempt still leaves the chunks
        // collected so far, instead of one buffer that is never flushed.
        recorder.start(1000);
        recorderRef.current = recorder;
        setCapturing(true);
        setUnavailable(false);
        return true;
      } catch {
        setUnavailable(true);
        setCapturing(false);
        return false;
      }
    },
    [cancel],
  );

  const stop = useCallback(async (): Promise<CapturedAudio | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setCapturing(false);
    if (!recorder || recorder.state === 'inactive') {
      chunksRef.current = [];
      return null;
    }

    const mimeType = recorder.mimeType || pickMimeType() || 'audio/webm';
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) return null;
    return { blob: new Blob(chunks, { type: mimeType }), mimeType };
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { capturing, unavailable, start, stop, cancel };
}

/**
 * An object URL for a stored blob, revoked when it changes or unmounts.
 * Leaking these keeps every played recording's bytes alive for the life of the
 * page, which on a phone is the rest of the day.
 */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
