import { useCoach } from '../../features/coach/useCoach';

/**
 * Coach list (the inbox table IS the coach list). Each note shows what it
 * made ("Added N cards") with "Remove these cards" (rejects the batch) and
 * "Delete note" (discards the note, rejects its cards, drops it from watch).
 * Reads from the hook — never `db` directly.
 */
export default function CoachList() {
  const { items, retry, removeBatch, deleteNote } = useCoach();

  if (items.length === 0) {
    return (
      <section aria-label="Coach">
        <div className="sechd"><b>Coach</b></div>
        <p className="sub">Tell the coach a word, a mistake or a topic — it becomes cards.</p>
      </section>
    );
  }

  return (
    <section aria-label="Coach">
      <div className="sechd"><b>Coach</b></div>
      {items.slice(0, 30).map((n) => {
        const made = n.generatedCardIds?.length ?? 0;
        const failed = n.status === 'raw' && n.failReason;
        return (
          <div key={n.id} className="you-section">
            <p>{n.text}</p>
            <small>
              {n.kind ? `${n.kind}${n.subject ? ` · ${n.subject}` : ''} · ` : ''}
              {n.status === 'processed'
                ? made > 0
                  ? `Added ${made} card${made === 1 ? '' : 's'}`
                  : n.origin === 'recording'
                    ? 'Heard in a recording — now on watch'
                    : 'Checked — nothing to add'
                : n.status === 'discarded'
                  ? 'Deleted'
                  : failed
                    ? n.failReason
                    : 'Saved — turning into cards…'}
            </small>
            <div className="coach-list-actions">
              {failed && (
                <button type="button" className="tap" onClick={() => void retry(n.id)} aria-label="Try adding cards again">
                  Try again
                </button>
              )}
              {n.status === 'processed' && made > 0 && (
                <button
                  type="button"
                  className="tap"
                  onClick={() => void removeBatch(n.id)}
                  aria-label={`Remove cards from note ${n.text.slice(0, 30)}`}
                >
                  Remove these cards
                </button>
              )}
              {n.status !== 'discarded' && (
                <button
                  type="button"
                  className="tap"
                  onClick={() => void deleteNote(n.id)}
                  aria-label={`Delete note ${n.text.slice(0, 30)}`}
                >
                  Delete note
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
