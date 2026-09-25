import type { InboxItem } from '../../types/contract';
import { db, enqueue } from '../../db/db';

/** Captured notes (db.inbox) — read and delete. */
export default function NotesList({ items }: { items: InboxItem[] }) {
  const remove = async (id: string) => {
    await db.inbox.delete(id);
    await enqueue('inbox', id, 'delete').catch(() => {});
  };

  if (items.length === 0) {
    return (
      <section aria-label="Notes">
        <div className="sechd"><b>Notes</b></div>
        <p className="sub">— nothing captured yet</p>
      </section>
    );
  }

  return (
    <section aria-label="Notes">
      <div className="sechd"><b>Notes</b></div>
      {items.slice(0, 20).map((n) => (
        <div key={n.id} className="you-section">
          <p>{n.text}</p>
          <small>{new Date(n.createdAt).toLocaleDateString()} · {n.status}</small>
          <div>
            <button type="button" className="tap" onClick={() => void remove(n.id)} aria-label={`Delete note ${n.text.slice(0, 30)}`}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
