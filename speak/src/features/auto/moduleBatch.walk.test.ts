import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { ensureSeeded } from '../../db/seedLoader';
import { headOf } from '../../db/libraryCheck';
import { todayKey } from '../../lib/date';
import { buildModuleQueue, seenHeadKey, RUN_LENGTH } from '../../srs/moduleQueue';
import { levelOf, themeOf } from '../cards/cardTags';
import { THEMES } from '../../types/contract';
import type { CardFeedback, ModuleCard, SeenTerm } from '../../types/contract';
import { aiCallsUsed } from './budget';
import { KNOW_IT_TRIGGER, MODULE_BATCH_CALLS, maybeModuleBatch, recheckBatch, seenKey, unseenByModule, hiddenFrom, loadSeen } from './moduleBatch';
import type { FetchFn } from '../coach/pipeline';

// v7 steps 4-6, pass 21 (final review): one fake batch walked end to end.
// Real pieces: the seed library on the phone, the seen list, his feedback,
// the batch picker and runner, the REAL Netlify function (writer prompt,
// validateModuleDraft, verify_batch on the other provider), the store, the
// backup queue and the feed queue. Fake pieces: the two model replies only
// (no key, no network). The server is loaded by a plain path so the app's
// type check does not pull server code in.

const NOW = new Date(2026, 10, 8, 10, 0, 0).getTime();
const TODAY = todayKey(new Date(NOW));
const SERVER = '../../../netlify/functions/ai';

type Raw = Record<string, unknown>;
type Handler = (req: Request) => Promise<Response>;

/** A stories card the way a writer would send it; n keeps every head new. */
function storyDraft(n: number): Raw {
  return {
    type: 'module',
    module: 'stories',
    topic: 'A work win',
    report: `I fixed the printer before the big meeting, try ${n}.`,
    story: `Ten minutes before the client call, the printer jammed. I found a folded receipt inside and pulled it out. **The pages came out warm** as the client walked in.`,
    trick: 'Put the clock in the first line so the stakes are clear.',
  };
}

describe('a fake AI batch, end to end', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let handler: Handler;
  let writerCalls: { user: string; system: string }[];
  let checkerCalls: string[];
  let failKeys: Set<string>;
  let n: number;
  let ip: number;

  beforeEach(async () => {
    await Promise.all([db.cards, db.feedback, db.seen, db.events, db.batches, db.outbox, db.meta, db.profile].map((t) => t.clear()));
    process.env = { ...originalEnv, GEMINI_API_KEY: 'fake-gemini', GROQ_API_KEY: 'fake-groq' };
    delete process.env.ANTHROPIC_API_KEY;
    handler = ((await import(/* @vite-ignore */ SERVER)) as { default: Handler }).default;
    writerCalls = [];
    checkerCalls = [];
    failKeys = new Set();
    n = 0;
    ip = 0;

    // The only fakes: Gemini writes, Groq checks.
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (u.includes('generativelanguage.googleapis.com')) {
        writerCalls.push({ system: body.systemInstruction.parts[0].text, user: body.contents[0].parts[0].text });
        const cards = Array.from({ length: 10 }, () => storyDraft(++n));
        const text = JSON.stringify({ cards });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
      }
      if (u.includes('api.groq.com')) {
        const user = body.messages[1].content as string;
        checkerCalls.push(user);
        const keys = [...user.matchAll(/"key":"([^"]+)"/g)].map((m) => m[1]!);
        const results = [...new Set(keys)].map((key) =>
          failKeys.has(key) ? { key, ok: false, reason: 'R4 MISSING: the story never says what changed' } : { key, ok: true, reason: 'pass' },
        );
        const content = JSON.stringify({ results });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }
      throw new Error(`unexpected network call: ${u}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /** The phone's fetch, pointed at the real Netlify function. */
  const phoneFetch: FetchFn = async (input, init) => {
    ip += 1;
    const headers = new Headers(init?.headers);
    headers.set('x-forwarded-for', `10.21.0.${ip}`);
    // The phone's time-out signal belongs to the test page, not to the server's Request: leave it out.
    const req = new Request(new URL(String(input), 'http://localhost'), { method: init?.method, body: init?.body, headers });
    return handler(req);
  };

  it('a thin module gets 30 new cards from his feedback, checked, stored, backed up and served unseen', async () => {
    // 1. The real library on the phone: 1,500 v7 cards (plus the old ones).
    await ensureSeeded();
    const library = (await db.cards.toArray()).filter((c) => (c as { type?: string }).type === 'module') as unknown as ModuleCard[];
    expect(library).toHaveLength(1500);
    // Every seed card carries a topic from the fixed list and a level 1-3.
    for (const c of library) {
      expect(THEMES as readonly string[]).toContain(c.theme);
      expect([1, 2, 3]).toContain(c.level);
    }

    // 2. He has read 50 of the 100 Stories, so Stories drops under the trigger of 60.
    const stories = library.filter((c) => c.module === 'stories');
    const read = stories.slice(0, 50);
    await db.seen.bulkPut(
      read.map((c, i): SeenTerm => ({ id: seenKey('stories', headOf(c)), module: 'stories', head: headOf(c), cardId: c.id, at: NOW - 1000 + i })),
    );
    // His feedback: a 👍, a 👎 Too easy, and a comment in his words.
    const fb = (c: ModuleCard, over: Partial<CardFeedback>): CardFeedback => ({
      id: `fb-${c.id}`, cardId: c.id, module: 'stories', reasons: [], reply: '', at: NOW - 500, ...over,
    });
    await db.feedback.bulkPut([
      fb(read[0]!, { thumb: 'up' }),
      fb(read[1]!, { thumb: 'down', reasons: ['too_easy'], comment: 'More office stories with a twist, please.' }),
    ]);
    const before = await loadSeen();
    const unseen = unseenByModule(await db.cards.toArray(), before.ids, before.keys, hiddenFrom(await db.feedback.toArray()));
    expect(unseen.stories).toBe(50);
    expect(Math.min(unseen.words, unseen.smalltalk, unseen.better, unseen.phrases)).toBeGreaterThan(60);

    // One card of the first writer reply fails the other provider's check.
    failKeys.add('d3');

    // 3. App open: the picker chooses Stories and runs one batch through the real server.
    const batch = await maybeModuleBatch({ fetchFn: phoneFetch, now: () => NOW });
    expect(batch).not.toBeNull();
    expect(batch!.module).toBe('stories');
    expect(batch!.status).toBe('done');
    expect(batch!.asked).toBe(30);

    // The writer was told his level, thumbs, comment and every head he has seen.
    expect(writerCalls).toHaveLength(3);
    const first = writerCalls[0]!.user;
    expect(writerCalls[0]!.system).toContain('## 9. v7 module cards (Adarsh, 2026-11-08)');
    expect(first).toContain('More office stories with a twist, please.');
    expect(first).toContain('too_easy');
    expect(first).toContain(headOf(read[0]!));
    for (const c of read) expect(first).toContain(headOf(c));
    // Later calls also avoid the cards the first call just made.
    expect(writerCalls[1]!.user).toContain(storyDraft(1).report as string);

    // Every card was checked on the OTHER provider (Groq), never the writer.
    expect(checkerCalls).toHaveLength(3);
    // The checker fails d3 in every call it sees, so 3 are dropped and 27 kept.
    expect(batch!.kept).toHaveLength(27);
    expect(batch!.dropped).toBe(3);

    // 4. Stored as AI cards of this batch, numbered from 0001, queued for backup.
    const ai = (await db.cards.where('id').anyOf(batch!.kept).toArray()) as unknown as (ModuleCard & Raw)[];
    expect(ai).toHaveLength(27);
    expect(ai.map((c) => c.id).sort()[0]).toBe('v7-ai-stories-0001');
    for (const c of ai) {
      expect(c).toMatchObject({ type: 'module', module: 'stories', lang: 'en', source: 'ai', status: 'active', batchId: batch!.id });
      // v8: every stored AI card keeps a topic from the list and a level (the drafts sent none: the server fills them).
      expect(THEMES as readonly string[]).toContain(themeOf(c));
      expect(c.theme).toBeDefined();
      expect(c.level).toBeDefined();
    }
    // The request told the writer the topic list; his 👍 card's topic leads the liked topics.
    expect(first).toContain('Money');
    const outbox = await db.outbox.toArray();
    for (const c of ai) expect(outbox.some((o) => o.table === 'cards' && o.key === c.id)).toBe(true);
    expect(await aiCallsUsed(TODAY)).toBe(MODULE_BATCH_CALLS);

    // 5. The feed serves them: Stories shows unseen library cards and the new AI cards, never a read one.
    const all = (await db.cards.toArray()).filter((c) => (c as { type?: string }).type === 'module') as unknown as ModuleCard[];
    const seenNow = await loadSeen();
    const queue = buildModuleQueue(all, {
      today: TODAY,
      filter: 'stories',
      seenIds: seenNow.ids,
      hiddenIds: hiddenFrom(await db.feedback.toArray()),
      limit: 200,
      seenHeads: new Set(read.map((c) => seenHeadKey(c))),
    });
    expect(queue).toHaveLength(50 + 27);
    expect(queue.filter((c) => (c as unknown as Raw).source === 'ai')).toHaveLength(27);
    for (const c of read) expect(queue.some((q) => q.id === c.id)).toBe(false);

    // 6. He marks one AI card "Wrong English": the rest of its batch is checked again and failures are buried.
    const [bad, ...rest] = ai.sort((a, b) => a.id.localeCompare(b.id));
    failKeys = new Set([rest[0]!.id]);
    const buried = await recheckBatch(bad!, { fetchFn: phoneFetch, now: () => NOW + 60_000 });
    expect(buried).toBe(1);
    expect((await db.cards.get(rest[0]!.id) as unknown as Raw).status).toBe('buried');
    expect((await db.feedback.get(`fb-${rest[0]!.id}`))?.hidden).toBe(true);
    expect(checkerCalls).toHaveLength(4);
  });

  it('ten Know-its on Words start a batch of harder Words even with plenty unseen; the new cards are served up front', async () => {
    await ensureSeeded();
    const library = (await db.cards.toArray()).filter((c) => (c as { type?: string }).type === 'module') as unknown as ModuleCard[];
    const words = library.filter((c) => c.module === 'words');
    // Nothing is thin: he has read nothing, every module has 100+ unseen.
    const none = await loadSeen();
    const unseen = unseenByModule(await db.cards.toArray(), none.ids, none.keys, new Set());
    expect(Math.min(...Object.values(unseen))).toBeGreaterThanOrEqual(60);

    // Nine Know-its: no batch. The tenth: a batch for Words.
    const know = (c: ModuleCard, i: number): CardFeedback => ({
      id: `fb-${c.id}`, cardId: c.id, module: 'words', reasons: ['too_easy'], reply: '', at: NOW - 5000 + i,
    });
    await db.feedback.bulkPut(words.slice(0, KNOW_IT_TRIGGER - 1).map(know));
    expect(await maybeModuleBatch({ fetchFn: phoneFetch, now: () => NOW })).toBeNull();
    expect(writerCalls).toHaveLength(0);
    await db.feedback.put(know(words[KNOW_IT_TRIGGER - 1]!, KNOW_IT_TRIGGER));
    await db.profile.put({ id: 'me', createdAt: 1, userId: null, moduleLevels: { words: 3 } });

    const wordsDraft = (k: number): Raw => ({
      type: 'module',
      module: 'words',
      topic: 'Strong feelings',
      theme: 'Emotions',
      level: 3,
      word: `exuberant${k}`,
      pos: 'adjective',
      say: 'ig-ZOO-ber-ant',
      meaning: 'Full of lively, happy energy.',
      examples: [
        { label: 'At home', text: `The kids were **exuberant${k}** at breakfast.`, icon: 'home' },
        { label: 'At work', text: `The team was **exuberant${k}** after the launch.`, icon: 'work' },
      ],
      right: { label: '✓ Right', text: `An **exuberant${k}** welcome.` },
      wrong: [{ label: '✗ Not for a calm mood', text: `I felt exuberant${k} and tired.` }],
      rule: 'only for lively joy',
      // the server asks for a quick check on every third Words card; every card here carries one
      check: {
        question: `Which line fits exuberant${k}?`,
        options: [
          { text: 'A loud, happy crowd', right: true },
          { text: 'A quiet, sad room', right: false },
          { text: 'A slow, tired walk', right: false },
        ],
      },
    });
    // Swap the writer for Words cards: the real server still validates them.
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        writerCalls.push({ system: body.systemInstruction.parts[0].text, user: body.contents[0].parts[0].text });
        const cards = Array.from({ length: 10 }, () => wordsDraft(++n));
        const text = JSON.stringify({ cards });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
      }
      return (realFetch as typeof fetch)(url, init);
    }) as typeof fetch;

    const batch = await maybeModuleBatch({ fetchFn: phoneFetch, now: () => NOW });
    expect(batch).not.toBeNull();
    expect(batch!.module).toBe('words');
    expect(batch!.status).toBe('done');
    expect(batch!.level).toBe(3);
    expect(batch!.kept).toHaveLength(30);
    expect(await aiCallsUsed(TODAY)).toBe(MODULE_BATCH_CALLS);

    // The writer was told his level and the topic list.
    expect(writerCalls).toHaveLength(3);
    expect(writerCalls[0]!.user).toContain('Emotions');
    const ai = (await db.cards.where('id').anyOf(batch!.kept).toArray()) as unknown as ModuleCard[];
    for (const c of ai) {
      expect(c).toMatchObject({ source: 'ai', batchId: batch!.id, theme: 'Emotions', level: 3 });
      expect(levelOf(c)).toBe(3);
    }

    // The next app open does not batch Words again (the ten are older than the finished batch).
    expect(await maybeModuleBatch({ fetchFn: phoneFetch, now: () => NOW + 10 * 60 * 1000 })).toBeNull();

    // The feed: his level, and the new cards up front (mixed in with the usual cards).
    const all = (await db.cards.toArray()).filter((c) => (c as { type?: string }).type === 'module') as unknown as ModuleCard[];
    const seenNow = await loadSeen();
    const queue = buildModuleQueue(all, {
      today: TODAY,
      filter: 'words',
      seenIds: seenNow.ids,
      hiddenIds: hiddenFrom(await db.feedback.toArray()),
      limit: 100,
      seenHeads: new Set(),
      levels: { words: 3 },
      runLength: RUN_LENGTH,
      frontIds: [...batch!.kept].reverse(),
    });
    expect(queue.length).toBeGreaterThan(30);
    // Mixed in one for one (answer 4 = A): all 30 are inside the first 60 places, and none was served.
    const isAi = (c: ModuleCard) => (c as unknown as Raw).source === 'ai';
    expect(queue.slice(0, 60).filter(isAi)).toHaveLength(30);
    expect(isAi(queue[0]!) || isAi(queue[1]!)).toBe(true);
    expect(queue.every((c) => levelOf(c) === 3)).toBe(true);
  });
});
