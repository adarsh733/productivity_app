import { useState } from 'react';
import type { DailyGoal } from '../../types/contract';
import type { InterestId } from '../../types/interests';
import {
  DEFAULT_SELECTED_INTERESTS,
  INTEREST_OPTIONS,
} from '../../types/interests';
import { useProfile } from '../../features/profile/useProfile';

export { INTEREST_OPTIONS };

const FIRST_RUN_KEY = 'speak.firstRun.v3';

export function isFirstRunCompleted(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setFirstRunCompleted(): void {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
  } catch {
    // ignore quota/privacy errors
  }
}

const GOAL_OPTIONS: { id: DailyGoal; label: string; time: string }[] = [
  { id: 'casual', label: 'Casual · 10 XP', time: '~3 min/day' },
  { id: 'regular', label: 'Regular · 30 XP', time: '~7 min/day' },
  { id: 'serious', label: 'Serious · 60 XP', time: '~15 min/day' },
];

export interface FirstRunProps {
  onComplete: () => void;
}

export default function FirstRun({ onComplete }: FirstRunProps) {
  const [selectedInterests, setSelectedInterests] = useState<InterestId[]>([
    ...DEFAULT_SELECTED_INTERESTS,
  ]);
  const [dailyGoal, setDailyGoal] = useState<DailyGoal>('regular');
  const [isSaving, setIsSaving] = useState(false);
  const { saveOnboardingProfile } = useProfile();

  const toggleInterest = (id: InterestId) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleStart = async () => {
    setIsSaving(true);
    try {
      await saveOnboardingProfile(selectedInterests, dailyGoal);
      setFirstRunCompleted();
    } catch (e) {
      console.error('Failed to save profile during onboarding:', e);
    }
    onComplete();
  };

  return (
    <main className="ob-screen" id="main-content">
      <div className="ob-container">
        <header className="ob-header">
          <span className="kicker">Step 1 of 1</span>
          <h1 className="ob-title">What do you want<br />more of?</h1>
          <p className="ob-lead">
            Pick any. You can change this later, and the feed will drift towards whatever you actually keep.
          </p>
        </header>

        <section className="ob-chips-section" aria-label="Topics of Interest">
          <div className="chips">
            {INTEREST_OPTIONS.map((opt) => {
              const isSelected = selectedInterests.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`chip tap ${isSelected ? 'on' : ''}`}
                  onClick={() => toggleInterest(opt.id)}
                  aria-pressed={isSelected}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="ob-goal-section" aria-label="Daily Commitment Options">
          <div className="ob-goal-label">Daily commitment</div>
          <div className="ob-goal-pills">
            {GOAL_OPTIONS.map((g) => {
              const isSelected = dailyGoal === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`ob-goal-pill tap ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setDailyGoal(g.id)}
                  aria-pressed={isSelected}
                >
                  <strong>{g.label}</strong>
                  <small>{g.time}</small>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="ob-footer">
          <button
            type="button"
            className="prim tap"
            onClick={handleStart}
            disabled={isSaving}
          >
            {isSaving ? 'Starting…' : 'Start scrolling →'}
          </button>
          <p className="ob-disclaimer">
            No microphone needed. Ever, if you don't want it.
          </p>
        </footer>
      </div>
    </main>
  );
}
