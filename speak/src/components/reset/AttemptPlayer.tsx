import type { Recording } from '../../types/contract';
import { useBlobUrl } from '../../features/reset/useMissionAudio';

/**
 * Playback for one saved attempt.
 *
 * Uses the native `<audio controls>` rather than a custom transport: on iOS it
 * is the control that reliably plays from a home-screen PWA, and a hand-rolled
 * scrubber here would be work spent on the part of the screen that already
 * works.
 */
export default function AttemptPlayer({
  recording,
  label,
  compact = false,
}: {
  recording: Recording | undefined;
  label: string;
  compact?: boolean;
}) {
  const url = useBlobUrl(recording?.blob);

  if (!recording || !url) {
    return (
      <div className={`reset-attempt-player is-empty${compact ? ' is-compact' : ''}`}>
        <small>No audio saved for {label.toLowerCase()} — the microphone was unavailable.</small>
      </div>
    );
  }

  return (
    <div className={`reset-attempt-player${compact ? ' is-compact' : ''}`}>
      {!compact && <span className="reset-kicker">{label}</span>}
      <audio controls preload="metadata" src={url} aria-label={`Play ${label}`} />
    </div>
  );
}
