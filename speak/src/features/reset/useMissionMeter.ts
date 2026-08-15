import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioMeterController,
  DbAccumulator,
  runMicSelfTest,
  type BandStatus,
} from '../../lib/audioMeter';
import { db, enqueue, getProfile } from '../../db/db';
import { effectiveBand } from '../lab/calibration';
import type { MicProfile, Profile } from '../../types/contract';

export type ResetMicState = 'off' | 'requesting' | 'live' | 'denied';

export interface MissionMeterApi {
  micState: ResetMicState;
  db: number | null;
  bandStatus: BandStatus;
  start(): Promise<boolean>;
  stop(): number | undefined;
  /** The live capture stream, for the recorder to write. Null when mic is off. */
  stream(): MediaStream | null;
}

export function useMissionMeter(): MissionMeterApi {
  const [micState, setMicState] = useState<ResetMicState>('off');
  const [dbValue, setDbValue] = useState<number | null>(null);
  const [bandStatus, setBandStatus] = useState<BandStatus>('low');
  const meterRef = useRef<AudioMeterController | null>(null);
  const accumulatorRef = useRef(new DbAccumulator());

  const stop = useCallback((): number | undefined => {
    const mean = accumulatorRef.current.mean;
    meterRef.current?.stop();
    meterRef.current = null;
    setMicState('off');
    setDbValue(null);
    return mean;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (meterRef.current?.running) return true;
    setMicState('requesting');
    accumulatorRef.current.reset();
    const profile = await getProfile();
    let effectiveProfile: Profile = profile;
    if (!profile.micProfile) {
      const micProfile = await runMicSelfTest();
      effectiveProfile = { ...profile, micProfile };
      await db.profile.put(effectiveProfile);
      await enqueue('profile', 'me');
      if (!micProfile.ok) {
        setMicState('denied');
        return false;
      }
    }
    const meter = new AudioMeterController();
    meterRef.current = meter;
    const ok = await meter.start(
      (measurement) => {
        accumulatorRef.current.push(measurement.db);
        setDbValue(measurement.db);
        setBandStatus(measurement.bandStatus);
      },
      { band: effectiveBand(effectiveProfile) },
    );
    setMicState(ok ? 'live' : 'denied');
    return ok;
  }, []);

  const stream = useCallback(() => meterRef.current?.mediaStream ?? null, []);

  useEffect(() => () => meterRef.current?.stop(), []);

  return { micState, db: dbValue, bandStatus, start, stop, stream };
}

export async function runAndStoreMicSetup(): Promise<MicProfile> {
  const profile = await getProfile();
  const micProfile = await runMicSelfTest();
  await db.profile.put({ ...profile, micProfile });
  await enqueue('profile', 'me');
  return micProfile;
}

