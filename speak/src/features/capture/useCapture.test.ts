import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../../db/db';

describe('useCapture Repository & State Suite', () => {
  beforeEach(async () => {
    await db.inbox.clear();
  });

  it('saves new thought draft locally and creates raw capture item', async () => {
    const text = 'I could not find the right phrasing for the architecture proposal.';
    const id = `cap-${Date.now()}`;
    const item = {
      id,
      text,
      createdAt: Date.now(),
      status: 'raw' as const,
    };

    await db.inbox.put(item);
    const saved = await db.inbox.get(id);
    expect(saved).toBeDefined();
    expect(saved?.text).toBe(text);
    expect(saved?.status).toBe('raw');
  });

  it('discards capture thought cleanly', async () => {
    const id = 'cap-to-delete';
    await db.inbox.put({
      id,
      text: 'Temporary thought',
      createdAt: Date.now(),
      status: 'raw',
    });

    expect(await db.inbox.get(id)).toBeDefined();
    await db.inbox.delete(id);
    expect(await db.inbox.get(id)).toBeUndefined();
  });
});
