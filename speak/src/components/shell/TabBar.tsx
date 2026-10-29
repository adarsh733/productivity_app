import { CaptureIcon, HomeIcon, YouIcon } from './Icons';

export type AppTab = 'feed' | 'ask' | 'me';

const TABS = [
  { id: 'feed' as const, label: 'Feed' },
  { id: 'ask' as const, label: 'Ask' },
  { id: 'me' as const, label: 'Me' },
] as const;


export default function TabBar({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="reset-tabbar tabs v5-tabs" aria-label="Primary navigation">
      {TABS.map(({ id, label }) => {
        const isActive = id === active;
        const isAsk = id === 'ask';
        return (
          <button
            key={id}
            type="button"
            className={`reset-tab tab tap${isAsk ? ' tab-ask' : ''}${isActive ? ' is-active on' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(id)}
            aria-label={`${label} tab`}
          >
            {isAsk ? (
              <span className="tab-ask-btn">
                <CaptureIcon className="tab-icon" />
              </span>
            ) : id === 'feed' ? (
              <HomeIcon className="tab-icon" />
            ) : (
              <YouIcon className="tab-icon" />
            )}
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
