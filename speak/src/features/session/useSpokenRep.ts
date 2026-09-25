import { useCallback, useState } from 'react';
import { creditSpeakingAttempt } from './day';
import type { CapturedAudio } from '../reset/useMissionAudio';

/**
 * Honest spoken-rep crediting, called from a hook — never from a component.
 *
 * Credits only when the attempt lasted ≥ 2 s AND had ≥ 1.5 s of voiced audio.
 * Idempotent by recordingId: crediting the same attempt twice is impossible.
 */
export interface SpokenRepCreditInput {
  recordingId: string;
  audio: CapturedAudio | null | undefined;
  elapsedSec: number;
  voicedSec?: number;
  avgDb?: number;
  xpReward: number;
  drillTitle: string;
  isDescribe?: boolean;
  transcript?: string;
}

export function useSpokenRepCredit() {
  const [credited, setCredited] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const credit = useCallback(async (input: SpokenRepCreditInput): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await creditSpeakingAttempt({
        recordingId: input.recordingId,
        audio: input.audio,
        elapsedSec: input.elapsedSec,
        voicedSec: input.voicedSec,
        avgDb: input.avgDb,
        xpReward: input.xpReward,
        drillTitle: input.drillTitle,
        isDescribe: input.isDescribe,
        transcript: input.transcript,
      });
      setCredited(res.credited);
      return res.credited;
    } finally {
      setSaving(false);
    }
  }, []);

  return { credited, saving, credit };
}
