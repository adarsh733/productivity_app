# Articulate

A PWA that trains delivery, vocabulary and storytelling — built to be the thing
Adarsh opens instead of Instagram. Installed to the iPhone home screen from
Safari, hosted on Netlify, free at every layer.

Plan of record: `../docs/PLAN.md`. Decisions locked there in §8 are settled —
don't reopen them.

## Where things live

| Path | What |
|---|---|
| `src/types/contract.ts` | **The contract.** Types for everything. Start here. `AiTask` = `expand_seed` · `verify_batch` · `plan_week` · `tell_app` (v8 Ask box). v8 card tags: `theme?` (the topic label, one of `THEMES` or an Ask-added topic) and `level?: CardLevel` on `ModuleCardBase`; the old `topic` field is still each card's own headline. Old Ask/chat/weak-spot/story types stay because stored rows still use them. |
| `src/App.tsx` + `components/shell/TabBar.tsx` | **Shell: Feed · Favorites · Ask · Me** (v8, 2026-11-10). `TABS` array + `AppTab` union. Mounts `useAppOpen`, `useModuleBatches`, `useSync`. |
| `components/feed/` (v7 Night glass, 2026-11-08) | `FeedScreen` = full-screen module cards in a native vertical scroll-snap list (one card per swipe, the whole card follows the finger), title + `ChipRow` (Mix + 5 modules, a chip filters) and the glass tab bar float over the card. `ModuleCardView` = 1-3 slides in a horizontal scroll-snap row with dots (`features/cards/moduleSlides.ts`); small topic label `.v7-theme` (`data-theme` / `data-level` on the root); rail Know it · 👍 👎 💬 ♡ 🔊 (Know it = `feed.knowIt`, moves on by itself); `FeedbackSheet` ("What did you think?", thumbs, 5 reason chips, comment + mic via the browser's own speech recognition, "Got it: ..."). State: `features/feed/useModuleFeed.ts` (`knowIt`, `applyLevels`) + `srs/moduleQueue.ts` (v8: level floor, AI cards at the front one-for-one, topic runs of `RUN_LENGTH` = 4 weighted by 👍 and Ask). Tag helpers: `features/cards/cardTags.ts`; Know it record: `features/learn/knowIt.ts`. Look: `styles/glass.css` + `glass-feed.css`, every value in the `/* v7 Night glass */` block of `tokens.css`. |
| `components/favorites/` + `features/favorites/useFavorites.ts` | **Favorites tab:** his ♡ module cards (`db.bookmarks` × `db.cards` type `module`), newest first, full-size through the Feed's `ModuleCardView` in the Feed's swipe list, the Feed's `ChipRow` on top, a one-button ♡ rail ("Remove from Favorites" = the Feed's ♡ writes). Extra rules only in `styles/favorites.css`. |
| `features/me/useMe.ts` + `components/me/` | **Me:** 3 stats (day streak · cards today · words and phrases = `db.seen` rows with module words/phrases), `BackupRow` (email + password), `LearnedFromYou` (👍👎💬, Know it and Ask lines with Remove; store `features/learn/useCardFeedback.ts` + `cardFeedback.ts`). Night glass in `styles/me.css` under `.me-screen`. No rows, no gear. |
| v7 card life (steps 4-6, 2026-11-08) | **Library:** 1,500 cards = samples `50-54-*.json` + `60-77-*.json` (plan list `src/content/library/outline.json`); `db/libraryCheck.ts` checks each file in `lib-<key>.test.ts` and all together in `lib-all.test.ts`. **Seen once:** `db.seen` (Dexie v8) + `buildModuleQueue` `seenHeads`. **♡ Sunday review:** `srs/savedReview.ts` (3 · 7 · 21 days, retire after 3 rights), `features/feed/useSavedReview.ts`, `components/feed/ReviewBar.tsx`. **AI batches:** `features/auto/moduleBatch.ts` + `useModuleBatches`: 30 cards in 3 calls of 10 when a module has fewer than 60 unseen, max 2 a day, writer told his 👍 👎, reasons, comments, level and every seen head; each card through the library rules, then the other provider. Server side: `expand_seed` `type: 'module'`, rulebook chapter 9. Walked end to end in `moduleBatch.walk.test.ts` (fake model replies). **Backup:** `sync/supabase.ts` (email + password sign-in, push/restore), `sync/useAccount.ts`, `components/me/BackupRow.tsx`. |
| `components/ask/AskScreen.tsx` + `features/learn/useAskBox.ts` + `askLearned.ts` | **Ask tab (v8):** one text box → `tell_app` (one call from the 25-a-day budget, refunded if it never reached a model), reply in a line or two with "Learned: ..." chips; last 10 messages and what it learned on the phone only (meta `learn.ask`). Learned items show under Me with Remove, boost topics in the Feed, add topics/wishes to the next batch; a `level` item moves the module level. Look: `styles/ask.css`. |
| `features/learn/profile.ts` | Old learner memory (meta `learn.profile`). Nothing reads it; the Ask box has its own store. |
| `features/coach/pipeline.ts` | `aiPost` (every client AI call; 30 s; throws `AiCallError` with the server's `reason`), `checkItems` / `verifyDrafts` (every AI card checked on a DIFFERENT provider: `exclude` is strict on the server), `getWatchList`. `needsSecondKey()` expires after 24 h. |
| `features/auto/budget.ts` | 25 AI calls a day, phone-only. Module batch = generate + check; background work keeps 10 back. |
| `features/auto/plan.ts` | Weekly `plan_week` — **unplugged** (no hook calls it since 2026-11-10); kept because `sync/supabase.ts` imports `VOICE_GOALS`. |
| `src/db/db.ts` | Dexie schema (v8: `seen`, `savedReviews`, `batches`). IndexedDB is the read path, always. Old tables (lessons, asks, chats, story bank, weak spots...) stay, unused: his stored data is never deleted. |
| `src/db/seedLoader.ts` | Loads `src/content/seed/*.json`. Validates, skips bad cards, never throws. |
| `src/srs/` | `moduleQueue.ts` (the v7 feed), `savedReview.ts` (Sunday review); `scheduler.ts` (SM-2) and `queue.ts` are the old feed's, kept with their tests. |
| `src/sync/` | Backup push (outbox on start/hidden/5 min) + restore. Never read during a session. |
| `netlify/functions/ai.ts` | The only path to a model. Gemini `gemini-3.5-flash-lite` → Groq `openai/gpt-oss-120b` → Anthropic `claude-haiku-5-5` (locked order). Tasks: `expand_seed` (incl. v7 `type: 'module'` batches, 4,096 tokens; v8 shapes carry `theme` + `level`, module level 1/2/3 → card level 1/2/3, 4-5 → 3 and harder), `verify_batch` (module cards too), `plan_week`, `tell_app` (Ask box, rulebook chapter 10). Groq answer room is cut so prompt + answer fit its 8,000 tokens a minute. No key ever in the client. |
| `netlify/rulebook.ts` | Generated from `../docs/AI-RULEBOOK.md` by `scripts/build-rulebook.mjs` (`--check` exits 1 when stale). Each task's system prompt = its rulebook slice + its JSON shape. |
| `supabase/schema.sql` | Tables + RLS. `user_id` on everything from day one. The ONE script he runs (re-runnable); the `-- v7 (2026-11-08)` block adds `card_feedback`, `seen_terms`, `saved_reviews`, `events.type` and `profile.module_levels`. |

## What exists now (2026-11-10, v8 — built, not committed)

**v8 (on top of the trim below):** every one of the 1,500 cards has a topic (`theme`, one of Money · Emotions · Work · People · Food · Health · Home · Travel · Senses & weather · General) and a level 1-3 (tag notes `src/content/staging/v8-tags-*.md`). The Feed skips cards below the module's floor (start level 2 → level-1 cards skipped), serves topic runs of 4 across modules, and weighs topics by his 👍 / Loved and the Ask box. **Know it** on every Feed card raises that module past the card's level and drops easier queued cards at once; 10 Know-its in a module since its last batch start an AI batch of 30 (`KNOW_IT_TRIGGER`), served at the front one-for-one. Batches now carry topics, liked topics and his Ask wishes; every AI card keeps `theme` + `level`. **Ask tab** = one AI feedback box (`tell_app`), learned lines under Me with Remove. Pictures: `built-know-it.png`, `built-ask.png`, `built-ask-reply.png`, `built-me-learned-ask.png`, `built-tabbar-ask.png`. Owed: `../docs/known-issues.md`, "v8".

### Trim to Feed · Favorites · Me (2026-11-10)

Removed (his picks, 10 Nov): the old Ask screen, the evening voice chat (and `netlify/functions/transcribe.ts`), Old tools (Browse, Speak + voice lab, old You), lesson player + skill pages, Story bank, My weak spots, Things I asked, the Me gear and "What the app knows about me"; the server tasks `answer_ask`, `coach_chat`, `review_recording`, `classify_inbox`; the 46 `public/art` pictures and the 12 old style sheets; the switched-off picture specs. Stored data is untouched (no Dexie table, version, seed file or Supabase table changed). Every screen is Night glass now; the glass tab bar floats on all three tabs. Tests: `flows.spec.ts` (5 flows) and `v7-glass.spec.ts` (pictures `../docs/redesign-v7/built-*.png`, now with `built-favorites*.png`, `built-me-home.png`, `built-me-learned.png`, `built-tabbar-*.png`). Next: `../.claude/handoffs/2026-11-10-speak-v8-levels-topics.md` (levels, Know it, topic runs, a NEW Ask feedback box as the 4th tab).

### v7 steps 4-6 (2026-11-08)

On top of steps 1-3 below: the full launch library of **1,500 hand-written cards** (Words 600 · Small talk 250 · Say it better 250 · Office phrases 300 · Stories 100; every word and phrase card has a ✗ wrong-use line, no Hindi on screen, no repeats across files), each card shown once (seen list by card and by word/phrase), ♡ cards come back as a **Sunday review** (3 days, 1 week, 3 weeks; retired after 3 "Knew it"), **AI batches of 30** per module from his feedback when a module runs low (checked twice before they are served), Too easy / Too hard move the module's level, and **email-code sign-in + backup** under Me (the one script `supabase/schema.sql` gains the v7 tables). Pictures: `../docs/redesign-v7/built-*.png`, now including `built-sunday-review.png` and `built-me-backup.png` (regenerate with `npx playwright test v7-glass`; with 1,500 cards a module picture shows that module's first card of the day when the -01 sample is not in it). The old picture specs (`poster`, `screenshots`, `v5-learning`, `v5-step1..5`, `viewports`) are **switched off** with a note at the top of each file (answer 9A); `flows.spec.ts` and `v7-glass.spec.ts` cover the app. Owed, not blocked (see `../docs/known-issues.md`, "v7 steps 4-6"): his Supabase URL + public key and one run of `schema.sql`, the AI keys on Netlify, and one live batch.

### Steps 1-3 (2026-11-08, v7 Night glass)

The Feed shows only the 5 v7 modules (🔤 Words · 💬 Small talk · ✍️ Say it better · 💼 Office phrases · 📖 Stories), 20 hand-written sample cards each in `src/content/seed/50-54-*.json` (type `module`, kept OUT of `Card`/`AnyCard` so old readers skip them; each file checked by `db/moduleSeedCheck.ts` in `v7-*.test.ts`). Old card types stay in the database but leave the feed. No pictures; each module is a dark glowing background (green, plum + coral reply, amber, purple, blue) with frosted panels. Feedback is phone-only (`db.feedback`, Dexie v7): 👎 or "Wrong English" hides a card; Me shows "What the app learned from you" with Remove. The August "light theme only" rule is superseded for the Feed (2026-11-08). Pictures: `../docs/redesign-v7/built-*.png` (regenerate with `npx playwright test v7-glass`), compared with `glass-B-1..4`; the same spec drives a real finger swipe (up = one whole card, snapped; sideways = slides, never the card). `e2e/flows.spec.ts` covers the new feed. (The old picture-card specs were switched off in steps 4-6.)

### Before v7: what existed (2026-10-29, v5 redesign — built, not yet committed per step)

Three tabs: **Feed · Ask · Me**. Four skills (💬 Small talk · 📖 Stories · 🎯 Speak
clearly · 🔤 Words) × five levels; Levels 1-2 have 10 lessons each (200 lesson
cards), Levels 3-5 show "coming soon". The feed mixes teach cards (Learn / Use /
Fix / Try / Ask-them), old cards reshaped with a skill tag, 32 global-English Fix
cards and 24 mixed Try cards; XP, Hindi share and voice-drill types are off the
feed (Hindi cards stay in the database). Ask answers any question with a short
rule line, library hits and 3-8 checked cards; Fix my sentence gives crisp /
confident / polite versions with reusable chunks and saves weak spots. The
evening chat asks 3 questions, measures pace from word times and loudness
against his own normal, and Haiku coaches (good · 1-2 fixes · a better
version); the day's best moment goes to the story bank. Top-up asks for 3 teach
cards for one skill at a time (max 4 a day). Every AI card is checked on a
different provider before it is stored. Pictures of every step:
`../docs/redesign-v5/built-step*.png` (regenerate with `npx playwright test v5-step`).

### Before v5 (2026-10-01, AG-009)

Endless feed with SRS (first sight schedules tomorrow, due gets "Show again soon"/"Knew it", `again` requeues within ~10) plus repeat-bug refill guards and engaged-only repetition — engaged now means 2 s on screen (was 4 s) — with XP gate, 14-day skim skip and `markEngaged` signals; content passes the AG-006 review with a seed validator (`scripts/content-pipeline/check-seed.mjs`). Coach box turns Capture dumps into verified cards: every draft is verified on a *different* provider than its generator (one key ⇒ nothing generated, one plain You line), with mistake watch-list, coach queue-jump, try-words wiring, learning from AI-checked recordings, auto top-up behind a 25-call/day local budget, and per-card "This is wrong" (2 taps ⇒ batch purge). Weekly `plan_week` proposes type weights + focus words, clamped in code, shown as one Speak line with Undo. Simpler Speak (Today card + 3 plain-words groups) and simpler You (4 stats, 8-week chart, rows), daily challenge (Today card, 30/45/60 s, use-word + avoid-phrase + voice-goal checks with honest nulls), 12-minute voice routine with pause/resume and transfer enforcement, six quick drills with live meters, weekly MPT check saving VoiceSamples, every recording training volume + pace with honest numbers, DB-backed speaking modes, tidy AI proxy with quote check, silent Supabase backup — every field mapped both ways. Breath cards stay out of feed/Browse; their drills live in the routine.

## The two mechanics that matter

**Feed with memory** — each module card is shown once (`db.seen`); ♡ cards come
back as a Sunday review (3 · 7 · 21 days) and live in Favorites. The streak
counts days with cards finished (`db.days`).

**Feedback drives the AI** — 👍 👎 💬 and the reason chips steer the next AI
batch of 30 per module; every AI card is checked on a different provider before
it is served. One key ⇒ nothing generated, one plain line.

## Phase

**2026-11-10:** v8 built on `v4-usable` (Feed · Favorites · Ask · Me; not committed,
not pushed). Live site still runs the pushed v7 build until Adarsh says push.
Owed (see `../docs/known-issues.md`, "v8"): AI keys on Netlify + one live
batch and one live Ask reply; Adarsh's look at the v8 pictures and his yes to
commit and push. Then a week of use before content wave 2.
The microphone is optional: only the 💬 comment box uses it (browser speech
recognition), and typing always works.

## Working rules

See `AGENTS.md` — it applies to every agent including this one.
