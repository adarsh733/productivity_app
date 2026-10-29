import { useState } from 'react';
import '../../styles/chat.css';
import { useMe } from '../../features/me/useMe';
import { ArrowRightIcon, GearIcon } from '../shell/Icons';
import EveningChat, { type EveningChatProps } from '../chat/EveningChat';

export type MeRowId = 'saved' | 'weak' | 'stories' | 'chats' | 'asked';

export interface MeScreenProps {
  /** Opens the gear sheet with the old Browse / Speak / You screens. */
  onOpenOldTools?: () => void;
  /** Later steps wire each row to its own screen. */
  onOpenRow?: (row: MeRowId) => void;
  /** Test hook: network and microphone for the evening chat. */
  chatProps?: Omit<EveningChatProps, 'onClose'>;
}

type MeView = 'home' | 'chats' | 'chat' | 'stories';

const CHAT_BACK = 'Back to Me';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MeScreen({ onOpenOldTools, onOpenRow, chatProps }: MeScreenProps) {
  const me = useMe();
  const [view, setView] = useState<MeView>('home');

  const openRow = (id: MeRowId) => {
    if (id === 'chats') setView('chats');
    else if (id === 'stories') setView('stories');
    else onOpenRow?.(id);
  };

  if (view === 'chat') {
    return <EveningChat {...chatProps} onClose={() => setView('chats')} />;
  }

  if (view === 'chats' || view === 'stories') {
    const isChats = view === 'chats';
    return (
      <section className="me-screen" aria-label={isChats ? 'Evening chats' : 'Story bank'}>
        <button type="button" className="chat-back tap" onClick={() => setView('home')}>
          ← {CHAT_BACK}
        </button>
        <h1 className="me-title">{isChats ? 'Evening chats' : 'Story bank'}</h1>
        {isChats && (
          <button type="button" className="chat-btn chat-btn-main tap" onClick={() => setView('chat')}>
            🎙️ Start tonight's chat
          </button>
        )}
        {isChats && me.chats.length === 0 && <p className="chat-done-sub">No chats yet. Three questions, about five minutes.</p>}
        {!isChats && me.stories.length === 0 && (
          <p className="chat-done-sub">Empty for now. The best moment of each evening chat lands here.</p>
        )}
        <ul className="chat-list">
          {isChats
            ? me.chats.map((c) => (
                <li className="chat-list-item" key={c.id} data-testid="chat-item">
                  <span className="chat-list-day">{dayLabel(c.day)}</span>
                  {plural(c.turns.length, 'answer', 'answers')}
                  {c.turns[0] ? ` · “${c.turns[0].transcript.slice(0, 80)}${c.turns[0].transcript.length > 80 ? '…' : ''}”` : ''}
                </li>
              ))
            : me.stories.map((s) => (
                <li className="chat-list-item" key={s.id} data-testid="story-item">
                  <span className="chat-list-day">{dayLabel(s.day)}</span>
                  {s.text}
                </li>
              ))}
        </ul>
      </section>
    );
  }

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
      sub:
        me.storyCount > 0
          ? `${plural(me.storyCount, 'moment', 'moments')} from your days`
          : 'Empty for now',
      empty: me.storyCount === 0,
    },
    {
      id: 'chats',
      icon: '🎙️',
      title: 'Evening chats',
      sub:
        me.chatCount > 0
          ? `${plural(me.chatCount, 'chat', 'chats')} · last ${dayLabel(me.chats[0]!.day)}`
          : 'No chats yet',
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
              onClick={() => openRow(r.id)}
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
