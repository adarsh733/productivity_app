# SPEAK

A PWA that trains delivery, vocabulary and storytelling — built to be the thing
Adarsh opens instead of Instagram. Installed to the iPhone home screen from
Safari, hosted on Netlify, free at every layer.

Plan of record: `../docs/PLAN.md`. Decisions locked there in §8 are settled —
don't reopen them.

## Where things live

| Path | What |
|---|---|
| `src/types/contract.ts` | **The contract.** Types for everything. Start here. |
| `src/db/db.ts` | Dexie schema. IndexedDB is the read path, always. |
| `src/db/seedLoader.ts` | Loads `src/content/seed/*.json`. Validates, skips bad cards, never throws. |
| `src/srs/scheduler.ts` | SM-2. Silent-failure zone — covered by tests. |
| `src/srs/queue.ts` | Core 3 + Endless. The app's personality lives here. |
| `src/features/**` | State hooks. All logic. Components call these. |
| `src/components/**` | Presentation only. Currently stubs. |
| `src/sync/supabase.ts` | Backup + restore. Never read during a session. |
| `netlify/functions/ai.ts` | The only path to a model. Owns its own prompts. |
| `supabase/schema.sql` | Tables + RLS. `user_id` on everything from day one. |

## The two mechanics that matter

**Core 3** — one breath drill, one say-it rep, one word, in that order. This and
only this is what the streak counts. It must be completable in ~3 minutes on the
worst day of the month, so it is never a reason to skip a day.

**Endless** — after Core 3, an infinite queue that never shows a "you're done"
screen. A dead end sends him back to Instagram, which is the one thing this app
exists to prevent.

## Phase

Phase 0 shipped: shell, feed, seeded cards, SRS, inbox, local DB, sync wiring,
AI proxy (dark). **No microphone, no live AI** — cards that involve speaking are
spoken and self-graded; the measuring lands in Phase 1 and must not require a
change to the contract.

Phase 1 is the Speaking Lab: recorder, live pace and volume meters, pause
detection, breath drills with real measurement, baseline calibration.

Open technical risk carried into Phase 1: **live WPM must not depend on
`webkitSpeechRecognition`** — on iOS it stops on silence, has session limits and
needs the network. Primary measurement is syllable-nucleus counting off the Web
Audio amplitude envelope. Both need a real-device test before anything is built
on top of them.

## Working rules

See `AGENTS.md` — it applies to every agent including this one.
