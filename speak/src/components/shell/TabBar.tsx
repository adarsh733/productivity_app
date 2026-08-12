export type Tab = 'feed' | 'inbox' | 'hindi' | 'progress';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'feed', label: 'Feed', glyph: '◈' },
  { id: 'inbox', label: 'Inbox', glyph: '＋' },
  { id: 'hindi', label: 'हिंदी', glyph: 'अ' },
  { id: 'progress', label: 'You', glyph: '◉' },
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
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tabbar-btn tap${active === t.id ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="tabbar-glyph" aria-hidden="true">
            {t.glyph}
          </span>
          <span className="tabbar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
