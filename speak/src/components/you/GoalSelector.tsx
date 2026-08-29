import type { DailyGoal } from '../../types/contract';
import { GAMIFICATION } from '../../types/contract';
import { useProfile } from '../../features/profile/useProfile';

export interface GoalSelectorProps {
  currentGoal?: DailyGoal;
}

const GOALS: Array<{ id: DailyGoal; label: string; xp: number; desc: string }> = [
  { id: 'casual', label: 'Casual', xp: GAMIFICATION.GOAL_XP.casual, desc: '~2 mins / day' },
  { id: 'regular', label: 'Regular', xp: GAMIFICATION.GOAL_XP.regular, desc: '~5 mins / day' },
  { id: 'serious', label: 'Serious', xp: GAMIFICATION.GOAL_XP.serious, desc: '~10 mins / day' },
];

export default function GoalSelector({ currentGoal }: GoalSelectorProps) {
  const { dailyGoal, setDailyGoal } = useProfile();
  const activeGoal = currentGoal ?? dailyGoal;

  return (
    <div className="goal-selector-container">
      <div className="sechd">
        <b>Daily Goal</b>
      </div>
      <div className="goal-selector-grid">
        {GOALS.map((g) => {
          const isSelected = activeGoal === g.id;
          return (
            <div
              key={g.id}
              className={`goal-selector-pill tap${isSelected ? ' selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => void setDailyGoal(g.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void setDailyGoal(g.id);
                }
              }}
              aria-pressed={isSelected}
              aria-label={`${g.label} goal: ${g.xp} XP per day, ${g.desc}`}
            >
              <b>{g.label}</b>
              <small>{g.desc}</small>
              <span className="goal-xp-tag">{g.xp} XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
