import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, enqueue, getProfile } from '../../db/db';
import type { DailyGoal, Profile } from '../../types/contract';
import type { InterestId } from '../../types/interests';

export interface UseProfileReturn {
  profile: Profile | undefined;
  dailyGoal: DailyGoal;
  interests: InterestId[];
  setDailyGoal: (goal: DailyGoal) => Promise<void>;
  setInterests: (interests: InterestId[]) => Promise<void>;
  saveOnboardingProfile: (interests: InterestId[], dailyGoal: DailyGoal) => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const profile = useLiveQuery(() => db.profile.get('me'), []);

  const dailyGoal: DailyGoal = profile?.dailyGoal ?? 'regular';
  const interests: InterestId[] = (profile?.interests as InterestId[]) ?? [];

  const setDailyGoal = useCallback(async (newGoal: DailyGoal) => {
    const current = await getProfile();
    const updated: Profile = {
      ...current,
      dailyGoal: newGoal,
    };
    await db.profile.put(updated);
    await enqueue('profile', 'me');
  }, []);

  const setInterests = useCallback(async (newInterests: InterestId[]) => {
    const current = await getProfile();
    const updated: Profile = {
      ...current,
      interests: newInterests,
    };
    await db.profile.put(updated);
    await enqueue('profile', 'me');
  }, []);

  const saveOnboardingProfile = useCallback(async (userInterests: InterestId[], userGoal: DailyGoal) => {
    const current = await getProfile();
    const updated: Profile = {
      ...current,
      interests: userInterests,
      dailyGoal: userGoal,
    };
    await db.profile.put(updated);
    await enqueue('profile', 'me');
  }, []);

  return {
    profile,
    dailyGoal,
    interests,
    setDailyGoal,
    setInterests,
    saveOnboardingProfile,
  };
}
