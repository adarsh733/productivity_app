import type { InterestId } from '../../types/interests';
import { INTEREST_OPTIONS } from '../../types/interests';
import { useProfile } from '../../features/profile/useProfile';

export interface InterestsManagerProps {
  interests?: string[];
}

export default function InterestsManager({ interests: initialInterests }: InterestsManagerProps) {
  const { interests, setInterests } = useProfile();
  const activeInterests = (initialInterests as InterestId[] | undefined) ?? interests;
  const currentSet = new Set(activeInterests);

  const handleToggle = async (id: InterestId) => {
    const next = new Set(currentSet);
    if (next.has(id)) {
      if (next.size > 1) {
        next.delete(id);
      }
    } else {
      next.add(id);
    }
    await setInterests(Array.from(next) as InterestId[]);
  };

  return (
    <div className="interests-manager-container">
      <div className="sechd">
        <b>Feed Focus</b>
      </div>
      <p className="sub" style={{ margin: '4px 0 10px', fontSize: '12px', color: 'var(--ink-2)' }}>
        Cards matching your selected focus areas appear more frequently in the endless feed.
      </p>
      <div className="chips interests-chips-grid">
        {INTEREST_OPTIONS.map((item) => {
          const isSelected = currentSet.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`chip tap${isSelected ? ' on' : ''}`}
              onClick={() => void handleToggle(item.id)}
              aria-pressed={isSelected}
              aria-label={`${item.label} interest: ${item.desc}`}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
