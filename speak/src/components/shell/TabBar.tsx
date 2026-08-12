import { FeedIcon, CaptureIcon, HindiIcon, YouIcon } from './Icons';

export type Tab = 'feed' | 'inbox' | 'hindi' | 'progress';

interface TabConfig {
  id: Tab;
  label: string;
  Icon: React.ComponentType;
}

const TABS: TabConfig[] = [
  { id: 'feed', label: 'Feed', Icon: FeedIcon },
  { id: 'inbox', label: 'Capture', Icon: CaptureIcon },
  { id: 'hindi', label: 'हिंदी', Icon: HindiIcon },
  { id: 'progress', label: 'You', Icon: YouIcon },
];

export default function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="tabbar">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            className={`tab tap no-select${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            type="button"
          >
            <span className="tab-icon">
              <Icon />
            </span>
            <span className="tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
