interface CoreDotsProps {
  position: number; // 1-based position in core run (1..3)
  coreThreeDone?: boolean;
}

/**
 * Three-dot indicator for Core 3 progress.
 *
 * Height and dot sizes set in CSS:
 * 8px diameter, 8px gap.
 * Done = --accent filled.
 * Current = --accent 2px ring, unfilled.
 * Future = --line filled.
 */
export default function CoreDots({ position, coreThreeDone }: CoreDotsProps) {
  const dots = [1, 2, 3];

  return (
    <div className="core-dots" aria-label={`Core 3 progress: ${coreThreeDone ? 3 : Math.min(position, 3)} of 3`}>
      {dots.map((dotNum) => {
        const isDone = coreThreeDone || position > dotNum;
        const isCurrent = !coreThreeDone && position === dotNum;

        let className = 'core-dot';
        if (isDone) {
          className += ' is-done';
        } else if (isCurrent) {
          className += ' is-current';
        }

        return <span key={dotNum} className={className} />;
      })}
    </div>
  );
}
