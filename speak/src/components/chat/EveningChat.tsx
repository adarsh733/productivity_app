import '../../styles/chat.css';
import type { ChatTurn, Track } from '../../types/contract';
import {
  useEveningChat,
  type UseEveningChatOptions,
} from '../../features/chat/useEveningChat';
import { wordCount } from '../../features/chat/storyBank';

export interface EveningChatProps extends UseEveningChatOptions {
  /** Called from the last screen. */
  onClose?: () => void;
}

const TRACK_LABEL: Record<Track, { icon: string; name: string }> = {
  smalltalk: { icon: '💬', name: 'Small talk' },
  stories: { icon: '📖', name: 'Stories' },
  clearly: { icon: '🎯', name: 'Speak clearly' },
  words: { icon: '🔤', name: 'Words' },
};

/** "ls-stories-1-1-3" becomes "📖 Stories L1"; anything else is shown as given. */
export function lessonLabel(lesson: string): string {
  const m = /^ls-(smalltalk|stories|clearly|words)-(\d)/.exec(lesson);
  if (!m) return lesson;
  const t = TRACK_LABEL[m[1] as Track];
  return `${t.icon} ${t.name} L${m[2]}`;
}

/** Display words only, from a measured number. */
function paceWord(wpm: number): string {
  if (wpm > 170) return 'fast';
  if (wpm < 110) return 'slow';
  return 'steady';
}

const LOUD_WORD: Record<NonNullable<ChatTurn['loudness']>, string> = {
  below: 'Below',
  normal: 'Normal',
  above: 'Above',
};

function Tiles({ turn }: { turn: ChatTurn }) {
  return (
    <div className="chat-tiles" aria-label="How it sounded">
      <div className="chat-tile" data-testid="tile-length">
        <span className="chat-tile-num">{wordCount(turn.transcript)}</span>
        <span className="chat-tile-label">words</span>
      </div>
      <div className="chat-tile" data-testid="tile-wpm">
        <span className="chat-tile-num">{turn.wpm !== undefined ? `${turn.wpm} wpm` : '—'}</span>
        <span className="chat-tile-label">
          {turn.wpm !== undefined ? `speed · ${paceWord(turn.wpm)}` : 'speed'}
        </span>
      </div>
      <div className="chat-tile" data-testid="tile-loudness">
        <span className="chat-tile-num">
          {turn.loudness ? LOUD_WORD[turn.loudness] : '—'}
        </span>
        <span className="chat-tile-label">{turn.loudness ? 'loudness · vs yours' : 'loudness'}</span>
      </div>
    </div>
  );
}

/**
 * The evening chat. Three questions; he talks (or types), sees what he did well,
 * one or two fixes and a better version, and can say it again. Every failure is
 * one plain line with "type instead" and "skip" — never a dead end.
 */
export default function EveningChat({ onClose, ...options }: EveningChatProps) {
  const chat = useEveningChat(options);
  const { phase, turn, line, failure } = chat;
  const isLast = chat.index >= chat.total - 1;
  const canRecordAgain = failure !== 'mic' && failure !== 'offline' && failure !== 'budget';
  const feedback = turn?.feedback;

  return (
    <section className="chat-screen v5-chat" aria-label="Evening chat">
      <header className="chat-head">
        <h1 className="chat-title">Evening chat</h1>
        {phase !== 'done' && (
          <span className="chat-count" aria-label={`Question ${chat.index + 1} of ${chat.total}`}>
            {chat.index + 1} of {chat.total}
          </span>
        )}
        {onClose && phase !== 'done' && (
          <button type="button" className="chat-close tap" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        )}
      </header>

      {phase !== 'done' && (
        <div className="chat-row">
          <span className="chat-avatar" aria-hidden="true">S</span>
          <p className="chat-bubble chat-bubble-partner" data-testid="chat-question">
            {chat.question}
          </p>
        </div>
      )}

      {(phase === 'review' || (phase === 'working' && turn)) && turn && (
        <p className="chat-bubble chat-bubble-me" data-testid="chat-answer">
          “{turn.transcript}”
        </p>
      )}

      {phase === 'ask' && (
        <div className="chat-actions chat-actions-col">
          <button type="button" className="chat-btn chat-btn-main tap" onClick={() => void chat.start()}>
            🎙️ Tap and answer
          </button>
          <div className="chat-actions">
            <button type="button" className="chat-btn tap" onClick={chat.typeInstead}>
              ⌨️ Type instead
            </button>
            <button type="button" className="chat-btn tap" onClick={chat.skip}>
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div className="chat-recording" role="status">
          <div className="chat-meter" aria-hidden="true">
            <div className="chat-meter-fill" style={{ width: `${Math.max(4, chat.level)}%` }} />
          </div>
          <p className="chat-rec-text">Listening… {chat.elapsedSec}s</p>
          <button type="button" className="chat-btn chat-btn-main tap" onClick={() => void chat.stop()}>
            ⏹ I'm done
          </button>
        </div>
      )}

      {phase === 'working' && (
        <p className="chat-working" role="status">
          {chat.stage === 'coaching' ? 'Reading your answer…' : 'Turning your voice into words…'}
        </p>
      )}

      {phase === 'typing' && (
        <form
          className="chat-type"
          onSubmit={(e) => {
            e.preventDefault();
            void chat.submitTyped();
          }}
        >
          {line && (
            <p className="chat-line" role="status" data-testid="chat-line">
              {line}
            </p>
          )}
          <label className="chat-type-label">
            <span className="chat-sr">Your answer</span>
            <textarea
              className="chat-textarea"
              rows={4}
              value={chat.typed}
              onChange={(e) => chat.setTyped(e.target.value)}
              placeholder="Type your answer here…"
            />
          </label>
          <div className="chat-actions">
            <button
              type="submit"
              className="chat-btn chat-btn-main tap"
              disabled={chat.typed.trim().length < 2}
            >
              Send
            </button>
            {canRecordAgain && (
              <button type="button" className="chat-btn tap" onClick={() => void chat.start()}>
                🎙️ Record
              </button>
            )}
            <button type="button" className="chat-btn tap" onClick={chat.skip}>
              Skip
            </button>
          </div>
        </form>
      )}

      {phase === 'review' && turn && (
        <>
          <Tiles turn={turn} />

          {line && (
            <p className="chat-line" role="status" data-testid="chat-line">
              {line}
            </p>
          )}

          {feedback && (
            <>
              <p className="chat-card chat-good" data-testid="chat-good">
                <strong>✓ Good:</strong> {feedback.good}
              </p>
              {feedback.fixes.map((f, i) => (
                <p className="chat-card chat-fix" key={i} data-testid="chat-fix">
                  <span>→ {f.text}</span>
                  {f.lesson && <span className="chat-lesson"> ({lessonLabel(f.lesson)})</span>}
                </p>
              ))}
              <p className="chat-card chat-better" data-testid="chat-better">
                <strong>Try it like this:</strong> “{feedback.better}”
              </p>
              {feedback.slip && (
                <p className="chat-card chat-slip" data-testid="chat-slip">
                  Watch: “{feedback.slip.wrong}” → “{feedback.slip.right}”. Added to your weak spots.
                </p>
              )}
            </>
          )}

          <div className="chat-actions">
            {!feedback && (failure === 'coach' || failure === 'bad_coach') && (
              <button type="button" className="chat-btn tap" onClick={() => void chat.retryCoach()}>
                Try again
              </button>
            )}
            <button type="button" className="chat-btn tap" onClick={() => void chat.sayAgain()}>
              🎙️ Say it again
            </button>
            <button type="button" className="chat-btn chat-btn-main tap" onClick={chat.next}>
              {isLast ? 'Finish' : 'Next question'}
            </button>
          </div>
        </>
      )}

      {phase === 'done' && (
        <div className="chat-done" data-testid="chat-done">
          <h2 className="chat-done-title">Nice work tonight</h2>
          <p className="chat-done-sub">
            {chat.turns.length === 0
              ? 'No answers tonight. Tomorrow is a new chat.'
              : `${chat.turns.length} ${chat.turns.length === 1 ? 'answer' : 'answers'} kept in Evening chats.`}
          </p>
          {chat.saved ? (
            <p className="chat-card chat-saved" data-testid="chat-saved">
              <strong>📓 Saved to your story bank:</strong> “{chat.saved.text}”
            </p>
          ) : (
            <p className="chat-done-sub">Nothing long enough to keep for the story bank tonight.</p>
          )}
          <div className="chat-actions">
            <button type="button" className="chat-btn chat-btn-main tap" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
