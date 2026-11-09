export interface ReviewBarProps {
  onAnswer(a: 'knew' | 'not_yet'): void;
}

/** The "Sunday review" label with the two answers, shown on a ♡ card that is due. */
export default function ReviewBar({ onAnswer }: ReviewBarProps) {
  return (
    <div className="v7-review" role="group" aria-label="Sunday review">
      <span className="v7-review-label">Sunday review</span>
      <div className="v7-review-btns">
        <button
          type="button"
          className="v7-review-btn is-knew"
          onClick={(e) => {
            e.stopPropagation();
            onAnswer('knew');
          }}
        >
          Knew it
        </button>
        <button
          type="button"
          className="v7-review-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAnswer('not_yet');
          }}
        >
          Not yet
        </button>
      </div>
    </div>
  );
}
