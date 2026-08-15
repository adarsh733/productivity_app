import type { Card, CardType, Lang } from '../types/contract';
import { db } from './db';

/**
 * Seed content lives in `src/content/seed/*.json` and is loaded into IndexedDB
 * on first run. Any file matching the glob is picked up — adding content means
 * adding a file, never touching this loader.
 *
 * Every card is validated before it lands. A malformed card is skipped and
 * reported, never thrown: one bad entry in a 300-card file must not leave him
 * staring at a blank feed.
 */

const modules = import.meta.glob<{ default: unknown }>('../content/seed/*.json', {
  eager: true,
});

export interface SeedReport {
  loaded: number;
  skipped: { file: string; id: unknown; reason: string }[];
  /** Seed cards on this device that no longer exist in the seed files. */
  retired: string[];
}

const REQUIRED_BY_TYPE: Record<CardType, string[]> = {
  word: ['term', 'pos', 'meaning', 'examples', 'say'],
  swap: ['weak', 'answers', 'timerSec'],
  idiom: ['phrase', 'meaning', 'scenario', 'example', 'corporate'],
  action_verb: ['verb', 'meaning', 'contrast', 'examples'],
  pronounce: ['term', 'syllables', 'stressIndex'],
  say_it: ['line', 'marked', 'targetWpm'],
  breath: ['drill', 'title', 'instructions', 'logUnit'],
};

const TYPES = Object.keys(REQUIRED_BY_TYPE) as CardType[];

function validate(raw: unknown): { ok: true; card: Card } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' };
  const o = raw as Record<string, unknown>;

  if (typeof o.id !== 'string' || o.id.length === 0) return { ok: false, reason: 'missing id' };
  if (typeof o.type !== 'string' || !TYPES.includes(o.type as CardType)) {
    return { ok: false, reason: `unknown type ${String(o.type)}` };
  }

  const type = o.type as CardType;
  for (const field of REQUIRED_BY_TYPE[type]) {
    if (o[field] === undefined) return { ok: false, reason: `missing ${field}` };
  }

  if ((type === 'word' || type === 'action_verb') && !isPairOfStrings(o.examples)) {
    return { ok: false, reason: 'examples must be exactly two strings' };
  }
  if (type === 'swap' && !isNonEmptyStringArray(o.answers)) {
    return { ok: false, reason: 'answers must be a non-empty string array' };
  }
  if (type === 'breath' && !Array.isArray(o.instructions)) {
    return { ok: false, reason: 'instructions must be an array' };
  }
  if (type === 'pronounce') {
    const parts = String(o.syllables).split('·');
    const idx = o.stressIndex;
    if (typeof idx !== 'number' || idx < 0 || idx >= parts.length) {
      return { ok: false, reason: 'stressIndex out of range for syllables' };
    }
  }

  const lang: Lang = o.lang === 'hi' ? 'hi' : 'en';

  const card = {
    ...o,
    lang,
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : [],
    source: 'seed',
    status: 'active',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  } as unknown as Card;

  return { ok: true, card };
}

function isPairOfStrings(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string');
}

function isNonEmptyStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
}

export function readSeedFiles(): { cards: Card[]; report: SeedReport } {
  const cards: Card[] = [];
  const report: SeedReport = { loaded: 0, skipped: [], retired: [] };
  const seenIds = new Set<string>();

  for (const [path, mod] of Object.entries(modules)) {
    const file = path.split('/').pop() ?? path;
    const body = (mod as { default: unknown }).default;
    const list = Array.isArray(body)
      ? body
      : ((body as { cards?: unknown[] } | null)?.cards ?? []);

    if (!Array.isArray(list)) {
      report.skipped.push({ file, id: null, reason: 'file is not an array or {cards:[]}' });
      continue;
    }

    for (const raw of list) {
      const res = validate(raw);
      if (!res.ok) {
        report.skipped.push({
          file,
          id: (raw as { id?: unknown })?.id ?? null,
          reason: res.reason,
        });
        continue;
      }
      if (seenIds.has(res.card.id)) {
        report.skipped.push({ file, id: res.card.id, reason: 'duplicate id' });
        continue;
      }
      seenIds.add(res.card.id);
      cards.push(res.card);
    }
  }

  report.loaded = cards.length;
  return { cards, report };
}

/**
 * Which seed cards on this device no longer exist in the seed files.
 *
 * Pure so it can be tested without a database.
 */
export function retiredIds(
  onDevice: readonly string[],
  inSeedFiles: ReadonlySet<string>,
): string[] {
  return onDevice.filter((id) => !inSeedFiles.has(id));
}

/**
 * Idempotent. Re-running adds newly authored cards, refreshes the seed text of
 * existing ones, and **buries seed cards that have been removed from the
 * files** — but never touches review state, so his schedule survives a content
 * update.
 *
 * That last part is not housekeeping. Until 2026-08-13 this only ever added and
 * updated, so a card deleted from the JSON stayed active on the device for good
 * — which meant the Phase 1 breath correction (retiring four drills that train
 * a capacity problem the measurements had ruled out) would have changed nothing
 * at all on the one phone that matters. Removal has to be a real operation.
 *
 * Burying rather than deleting: `status: 'buried'` stops the queue serving the
 * card (`srs/queue.ts` filters on `active`) while its reviews and events stay
 * intact, so the history stays readable and a card can come back.
 */
export async function ensureSeeded(): Promise<SeedReport> {
  const { cards, report } = readSeedFiles();
  if (cards.length === 0) return report;

  const existingIds = (await db.cards.where('source').equals('seed').primaryKeys()) as string[];
  const existing = new Set(existingIds);
  const authored = new Set(cards.map((c) => c.id));
  const retired = retiredIds(existingIds, authored);
  report.retired = retired;

  await db.transaction('rw', db.cards, async () => {
    await db.cards.bulkPut(cards);
    if (retired.length > 0) {
      await db.cards
        .where('id')
        .anyOf(retired)
        .modify({ status: 'buried' as const });
    }
  });

  const added = cards.filter((c) => !existing.has(c.id)).length;
  if (added > 0 || report.skipped.length > 0 || retired.length > 0) {
    console.info(
      `[seed] ${report.loaded} cards (${added} new)` +
        (retired.length ? `, ${retired.length} retired` : '') +
        (report.skipped.length ? `, ${report.skipped.length} skipped` : ''),
      { skipped: report.skipped, retired },
    );
  }
  return report;
}
