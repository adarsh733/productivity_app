import type { ComponentType, SVGProps } from 'react';
import { CardIcon, ChatIcon, HeartIcon, YouIcon } from './Icons';

export type AppTab = 'feed' | 'favorites' | 'ask' | 'me';

interface TabEntry {
  id: AppTab;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
}

/** One entry per tab. Feed · Favorites · Ask · Me; a new tab = one union member above + one entry here. */
const TABS: readonly TabEntry[] = [
  { id: 'feed', label: 'Feed', Icon: CardIcon },
  { id: 'favorites', label: 'Favorites', Icon: HeartIcon },
  { id: 'ask', label: 'Ask', Icon: ChatIcon },
  { id: 'me', label: 'Me', Icon: YouIcon },
];

export default function TabBar({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="reset-tabbar tabs v5-tabs" aria-label="Primary navigation">
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
