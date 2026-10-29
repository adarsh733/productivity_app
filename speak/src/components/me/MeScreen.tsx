import { useMe } from '../../features/me/useMe';
import { ArrowRightIcon, GearIcon } from '../shell/Icons';

export type MeRowId = 'saved' | 'weak' | 'stories' | 'chats' | 'asked';

export interface MeScreenProps {
  /** Opens the gear sheet with the old Browse / Speak / You screens. */
  onOpenOldTools?: () => void;
  /** Later steps wire each row to its own screen. */
  onOpenRow?: (row: MeRowId) => void;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function MeScreen({ onOpenOldTools, onOpenRow }: MeScreenProps) {
  const me = useMe();

  const weakPreview = me.openWeakSpots
    .slice(0, 3)
    .map((w) => `"${w.wrong}"`)
    .join(', ');

  const rows: Array<{ id: MeRowId; icon: string; title: string; sub: string; empty: boolean }> = [
    {
      id: 'saved',
      icon: '⭐',
      title: 'Saved',
      sub: me.savedCount > 0 ? `${plural(me.savedCount, 'card', 'cards')} · by skill` : 'Nothing saved yet',
      empty: me.savedCount === 0,
    },
    {
      id: 'weak',
      icon: '⚠️',
      title: 'My weak spots',
      sub: me.openWeakSpots.length > 0 ? weakPreview : 'None yet. They show up as you ask and chat.',
      empty: me.openWeakSpots.length === 0,
    },
    {
      id: 'stories',
      icon: '📓',
      title: 'Story bank',
      sub: me.storyCount > 0 ? `${plural(me.storyCount, 'moment', 'moments')} from your days` : 'Empty for now',
      empty: me.storyCount === 0,
    },
    {
      id: 'chats',
      icon: '🎙️',
      title: 'Evening chats',
      sub: me.chatCount > 0 ? plural(me.chatCount, 'chat', 'chats') : 'No chats yet',
      empty: me.chatCount === 0,
    },
    {
      id: 'asked',
      icon: '💬',
      title: 'Things I asked',
      sub:
        me.askCount > 0
          ? `${plural(me.askCount, 'question', 'questions')} → ${plural(me.askCardCount, 'card', 'cards')}`
          : 'Nothing asked yet',
      empty: me.askCount === 0,
    },
  ];

  return (
    <section className="me-screen" aria-label="Me">
      <header className="me-head">
        <h1 className="me-title">Me</h1>
        <button
          type="button"
          className="me-gear tap"
          onClick={onOpenOldTools}
          aria-label="Old tools"
        >
          <GearIcon />
        </button>
      </header>

      <div className="me-stats">
        <div className="me-stat" data-testid="stat-streak">
          <span className="me-stat-num">{me.streak}</span>
          <span className="me-stat-label">day streak</span>
        </div>
        <div className="me-stat" data-testid="stat-words">
          <span className="me-stat-num">{me.wordsAndPhrases}</span>
          <span className="me-stat-label">words and phrases</span>
        </div>
        <div className="me-stat" data-testid="stat-lessons">
          <span className="me-stat-num">{me.lessonsDone}</span>
          <span className="me-stat-label">lessons done</span>
        </div>
      </div>

      <ul className="me-rows">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`me-row tap${r.empty ? ' is-empty' : ''}`}
              onClick={() => onOpenRow?.(r.id)}
              data-row={r.id}
            >
              <span className={`me-row-icon me-row-icon-${r.id}`} aria-hidden="true">
                {r.icon}
              </span>
              <span className="me-row-text">
                <span className="me-row-title">{r.title}</span>
                <span className="me-row-sub">{r.sub}</span>
              </span>
              <ArrowRightIcon className="me-row-chev" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
