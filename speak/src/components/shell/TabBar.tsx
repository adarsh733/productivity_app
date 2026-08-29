import { BrowseIcon, FeedIcon, SpeakIcon, YouIcon } from './Icons';

export type AppTab = 'feed' | 'browse' | 'speak' | 'you';

const TABS = [
  { id: 'feed' as const, label: 'Feed', Icon: FeedIcon },
  { id: 'browse' as const, label: 'Browse', Icon: BrowseIcon },
  { id: 'speak' as const, label: 'Speak', Icon: SpeakIcon },
  { id: 'you' as const, label: 'You', Icon: YouIcon },
] as const;

export default function TabBar({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="reset-tabbar tabs" aria-label="Primary navigation">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            className={`reset-tab tab tap${isActive ? ' is-active on' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(id)}
            aria-label={`${label} tab`}
          >
            <Icon className="tab-icon" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
