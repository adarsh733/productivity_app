import { useEffect, useState } from 'react';
import type { FeedbackReason, ModuleCard } from '../../types/contract';
import { useCardFeedback } from '../../features/learn/useCardFeedback';
import { useDictation } from '../../features/learn/useDictation';
import { gotItLine } from '../../features/learn/cardFeedback';
import {
  CheckCircleIcon,
  MicrophoneIcon,
  SendIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '../shell/Icons';

export interface FeedbackSheetProps {
  card: ModuleCard;
  startThumb?: 'up' | 'down';
  onClose(): void;
}

interface ReasonOption {
  id: FeedbackReason;
  label: string;
}

const REASON_OPTIONS: readonly ReasonOption[] = [
  { id: 'too_easy', label: 'Too easy' },
  { id: 'too_hard', label: 'Too hard' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'wrong_english', label: 'Wrong English' },
  { id: 'loved', label: 'Loved this' },
];

export default function FeedbackSheet({
  card,
  startThumb,
  onClose,
}: FeedbackSheetProps) {
  const { thumb, setThumb, send } = useCardFeedback(card);
  const {
    supported: dictationSupported,
    listening,
    start: startDictation,
    stop: stopDictation,
  } = useDictation();

  const [selectedReasons, setSelectedReasons] = useState<FeedbackReason[]>([]);
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState<string>(() => {
    if (startThumb) {
      return gotItLine(card.module, { thumb: startThumb, reasons: [] });
    }
    if (thumb) {
      return gotItLine(card.module, { thumb, reasons: [] });
    }
    return '';
  });

  // Apply startThumb on mount if provided
  useEffect(() => {
    if (startThumb) {
      void setThumb(startThumb);
      setReply(gotItLine(card.module, { thumb: startThumb, reasons: selectedReasons, comment }));
    }
  }, [startThumb, card.module]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelectThumb = async (t: 'up' | 'down') => {
    await setThumb(t);
    const newReply = await send({
      reasons: selectedReasons,
      comment: comment.trim() || undefined,
    });
    setReply(newReply);
  };

  const handleToggleReason = async (reasonId: FeedbackReason) => {
    const next = selectedReasons.includes(reasonId)
      ? selectedReasons.filter((r) => r !== reasonId)
      : [...selectedReasons, reasonId];
    setSelectedReasons(next);
    const newReply = await send({
      reasons: next,
      comment: comment.trim() || undefined,
    });
    setReply(newReply);
  };

  const handleToggleDictation = () => {
    if (!dictationSupported) return;
    if (listening) {
      stopDictation();
    } else {
      startDictation((text) => {
        setComment((prev) => (prev ? `${prev} ${text}` : text));
      });
    }
  };

  const handleSend = async () => {
    const newReply = await send({
      reasons: selectedReasons,
      comment: comment.trim() || undefined,
    });
    setReply(newReply);
  };

  const activeThumb = startThumb && !thumb ? startThumb : thumb;

  return (
    <>
      <div
        className="v7-sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
        data-testid="feedback-sheet-backdrop"
      />
      <div
        className="v7-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v7-sheet-title"
      >
        <button
          type="button"
          className="v7-sheet-handle"
          onClick={onClose}
          aria-label="Close"
          data-testid="feedback-sheet-handle"
        />

        <h2 id="v7-sheet-title" className="v7-sheet-title">
          What did you think?
        </h2>

        <div className="v7-sheet-thumbs" role="group" aria-label="Thumb feedback">
          <button
            type="button"
            className={`v7-sheet-thumb-btn ${activeThumb === 'up' ? 'is-active' : ''}`}
            aria-label="Thumbs up"
            aria-pressed={activeThumb === 'up'}
            onClick={() => void handleSelectThumb('up')}
          >
            <ThumbsUpIcon className="v7-icon-sm" />
          </button>
          <button
            type="button"
            className={`v7-sheet-thumb-btn ${activeThumb === 'down' ? 'is-active' : ''}`}
            aria-label="Thumbs down"
            aria-pressed={activeThumb === 'down'}
            onClick={() => void handleSelectThumb('down')}
          >
            <ThumbsDownIcon className="v7-icon-sm" />
          </button>
        </div>

        <div className="v7-sheet-chips" role="group" aria-label="Feedback reasons">
          {REASON_OPTIONS.map((opt) => {
            const isSelected = selectedReasons.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`v7-sheet-chip ${isSelected ? 'is-active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => void handleToggleReason(opt.id)}
              >
                <span className="v7-chip-pill">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="v7-sheet-input-row">
          <input
            type="text"
            className="v7-sheet-input"
            placeholder="Too basic. I already use this word daily."
            aria-label="Comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSend();
              }
            }}
          />

          {dictationSupported && (
            <button
              type="button"
              className={`v7-sheet-action-btn ${listening ? 'is-listening' : ''}`}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              onClick={handleToggleDictation}
            >
              <MicrophoneIcon className="v7-icon-sm" />
            </button>
          )}

          <div className="v7-sheet-divider" aria-hidden="true" />

          <button
            type="button"
            className="v7-sheet-action-btn"
            aria-label="Send feedback"
            onClick={() => void handleSend()}
          >
            <SendIcon className="v7-icon-sm" />
          </button>
        </div>

        {reply ? (
          <div className="v7-sheet-gotit" role="status">
            <CheckCircleIcon className="v7-sheet-gotit-icon" />
            <span>{reply}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
