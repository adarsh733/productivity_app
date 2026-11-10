import { useEffect, useRef, useState } from 'react';
import '../../styles/ask.css';
import { SendIcon } from '../shell/Icons';
import { ASK_TEXT_MAX, useAskBox } from '../../features/learn/useAskBox';

/**
 * Ask tab (v8): one text box to tell the app anything ("too easy", "more about
 * money", a topic he wants). The reply is a line or two; what the app learned
 * shows as small "Learned: ..." chips and sits under Me with Remove.
 */
export default function AskScreen() {
  const { turns, sending, error, send } = useAskBox();
  const [text, setText] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef(false);

  // The newest message stays in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  // Clear the box only when the send worked; on any error line his words stay.
  useEffect(() => {
    if (sending || !sentRef.current) return;
    sentRef.current = false;
    if (!error) setText('');
  }, [sending, error]);

  const canSend = !sending && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    sentRef.current = true;
    void send(text);
  };

  return (
    <section className="ask-screen" data-testid="ask-screen" aria-label="Ask">
      <header className="ask-head">
        <h1 className="ask-title">Ask</h1>
        <p className="ask-sub">Tell the app anything: too easy, more about money, a topic you want.</p>
      </header>

      <div className="ask-thread" data-testid="ask-thread" ref={threadRef}>
        {turns.map((turn) => {
          const learned = turn.learned.filter((l) => !l.removed);
          return (
            <div className="ask-turn" key={turn.id} data-testid="ask-turn">
              <p className="ask-said">{turn.said}</p>
              <div className="ask-reply">
                <p className="ask-reply-text">{turn.reply}</p>
                {learned.length > 0 && (
                  <ul className="ask-chips">
                    {learned.map((l) => (
                      <li className="ask-chip" key={l.id} data-testid="ask-chip">
                        Learned: {l.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <p className="ask-line" role="status">
            Thinking…
          </p>
        )}
      </div>

      {error && (
        <p className="ask-line ask-error" role="alert" data-testid="ask-error">
          {error}
        </p>
      )}

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="ask-input"
          rows={2}
          value={text}
          maxLength={ASK_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Say it in your own words"
          aria-label="Tell the app"
          enterKeyHint="send"
        />
        <button type="submit" className="ask-send tap" disabled={!canSend} aria-label="Send">
          <SendIcon aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
