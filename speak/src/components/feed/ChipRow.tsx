import type { FeedFilter } from '../../types/contract';
import { MODULE_LABEL, MODULES } from '../../types/contract';

export interface ChipRowProps {
  value: FeedFilter;
  onChange(f: FeedFilter): void;
}

interface ChipItem {
  id: FeedFilter;
  label: string;
}

const CHIPS: readonly ChipItem[] = [
  { id: 'mix', label: 'Mix' },
  ...MODULES.map((id) => ({ id, label: MODULE_LABEL[id] })),
];

export default function ChipRow({ value, onChange }: ChipRowProps) {
  return (
    <nav className="v7-chiprow" role="tablist" aria-label="Module filters">
      {CHIPS.map((chip) => {
        const isActive = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`v7-chip ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(chip.id)}
          >
            <span className="v7-chip-pill">{chip.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
