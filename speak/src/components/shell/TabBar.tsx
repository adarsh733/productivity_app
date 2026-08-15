import type { ResetTab } from '../../features/reset/sessionState';
import { CoachIcon, PracticeIcon, ProgressIcon, TodayIcon } from './Icons';

const TABS = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'coach', label: 'Coach', Icon: CoachIcon },
  { id: 'practice', label: 'Practice', Icon: PracticeIcon },
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
] as const;

export default function TabBar({
  active,
  onChange,
}: {
  active: ResetTab;
  onChange: (tab: ResetTab) => void;
}) {
  return (
    <nav className="reset-tabbar" aria-label="Primary navigation">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            className={`reset-tab tap${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

