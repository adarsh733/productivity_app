# WORKLOG — Productivity workspace

Newest session first. One terse line per agenda item as it completes, plus any
unplanned work. This is the month-end record of what got built.

## Session — 2026-10-01 (Wed) · Antigravity (Sonnet 5) · AG-009 final pass + AG-008 AI upgrade

**Agenda (AG-009 §4, items 1–7):** AG-006 content fixes → 2 s engaged rule → backup gap → AG-008 AI stages 1–6 → proof → report → release. Stop before push.

**Done:**
- [x] A1 (b0b498b): every AG-006 review fix applied, one of each duplicate pair dropped; `check-seed.mjs` PASS — 1032 cards excl. exemplars.
- [x] A2 (f3e88f7): engaged = 2 s on screen (was 4 s) — FeedScreen timer + comments in FeedScreen/useFeed; no test assumed 4 s.
- [x] A3 (d413f01): backup gap closed — `reviews.skipped_at`, `days.challenge`/`challenge_result`/`xp`/`spoken_reps`, inbox coach fields; schema ALTERs + both-way mappers + round-trip tests.
- [x] AG-008 stage 1 (78fbdc0 + fix aac4779): coach makes every allowed type; verify runs on a *different* provider; one key ⇒ generate nothing + one plain You line.
- [x] AG-008 stage 2 (5cece43): learns from 2nd misses (≤5/day) and recording mistakes (inbox `origin` round-trips); PlaybackReview flake fixed (90e7339).
- [x] AG-008 stage 3 (425f55b): auto top-up (<30 unseen, 6 h gate, ≤3/day) behind shared 25-call/day local budget, clamped in code.
- [x] AG-008 stage 4 (c6ea613): per-card "This is wrong" — 2nd flag purges the batch; rejected terms feed the avoid list (≤50).
- [x] AG-008 stage 5 (d16b2fc): weekly `plan_week`; weights clamped 0.5–1.5 in code; Speak line + Undo; mapped both ways.
- [x] AG-008 stage 6 (8a5f2f8): docs + AG-008 report; the missed `week_plan` schema ALTER added (§0.6 gap closed).
- [x] Proof (item 5): `npm test` 45 files / 420 tests green ×3 + one final run (EXIT=0, 69.85 s); `npm run build` green; seed check PASS.
- [x] Report (item 6, 733e36a): `.claude/reports/AG-009.md` — files, each done met, deviations, test output, ONE copy-paste SQL block (12 ALTERs).
- [x] Owed, recorded in `docs/known-issues.md`: 375×812 visual walk (structural walk only — no visible viewport here); live AI + one-key plain line unverified until deploy.
- [x] Stopped as instructed — no push, no merge, no deploy. Claude does one review pass off `git diff` + report, then asks Adarsh.

---

## Session — 2026-08-26 (Wed, 16:51) · Antigravity · window C-20260826-1643-feed-queue-xp-correctness

**Agenda (Feed, Queue, Preferences, Activity, XP, and Streak Correctness):**
1. Decouple browsing from SM-2 grading: viewing cards creates `card_viewed` production events without writing SM-2 review states (`useFeed.ts`, `day.ts`, `contract.ts`).
2. Establish 7 distinct production events (`card_viewed`, `card_saved`, `card_unsaved`, `card_downweighted`, `spoken_rep_completed`, `describe_rep_completed`, `recall_graded`).
3. Enforce gamification & XP rules: 1 XP per unique card viewed per day; 3 XP on first bookmark with anti-farming protection (`bookmarkXpAwarded`); 10 XP for standard spoken rep, 25 XP for Describe rep (`GAMIFICATION.XP` constants).
4. Persist and synchronize XP across feed header and You screen (`FeedScreen.tsx`, `YouScreen.tsx`).
5. Wire daily goal celebration banner based on selected XP goal (`casual`: 10 XP, `regular`: 30 XP, `serious`: 60 XP).
6. Shared interest constants & ID union (`src/types/interests.ts`, `FirstRun.tsx`, `InterestsManager.tsx`, `queue.ts`). Neutral default subset `['office', 'words']`.
7. Expiring downweights: left swipe stores `{ multiplier, expiresAt }` (7 calendar days), checked against tags then type, floored at 0.15.
8. Queue engine: deterministic daily shuffling (`dayCardHash`), due-before-new priority, `MAX_NEW_PER_DAY` (20) cap across refills, 8%–18% Hindi ratio, and fresh Day 1 Card 1 English word/idiom.
9. Swipe-down history navigation without event duplication.
10. Verifiable freeze ledger tracking (`getMonthlyFreezeStatus`).
11. Comprehensive Vitest test suite and clean production build.

**Done:**
- [x] Browsing exposure decoupled from SM-2 reviews; only explicit practice drills can record recall grades.
- [x] Defined and implemented all 7 production event interfaces in `contract.ts` and Dexie dispatch.
- [x] Implemented `applyCardView`, `applyBookmarkToggle`, `toggleBookmarkWithXp`, and `getMonthlyFreezeStatus` in `day.ts` and `db.ts`.
- [x] Synchronized persisted day XP across Feed header and You screen.
- [x] Built unified interest options and default neutral subset (`['office', 'words']`) in `src/types/interests.ts`.
- [x] Enhanced queue engine with deterministic daily shuffling, 20 new cards cap, 8–18% Hindi ratio, and fresh Day 1 Card 1 starter.
- [x] Added swipe down previous-card history navigation in `useCardGestures.ts` and `useFeed.ts`.
- [x] All 33 test files and **251/251 tests pass** in Vitest.
- [x] Production build (`tsc -b && vite build`) passed with 0 errors in 3.13s.

---

## Session — 2026-08-26 (Wed, 15:32) · Antigravity · window C-20260826-1524-v3-truthfulness-repair

**Agenda (SPEAK V3 Truthfulness & Correctness Repair):**
1. Authorize V3 as sole source of truth in repository documentation (`docs/PLAN.md`, `speak/AGENTS.md`, `speak/src/types/contract.ts`).
2. Remove feed heuristics inferring speaking from browsing/time/type (`useFeed.ts`).
3. Pure domain function extraction for card & speaking completion with strict audio validity (`day.ts`).
4. Enforce speaking idempotency by recording ID in database transaction (`creditSpeakingAttempt`).
5. Remove canned/offline AI coaching sentences, reject malformed responses, enforce transcript presence before review (`useAiFeedback.ts`, `PlaybackReview.tsx`, `netlify/functions/ai.ts`).
6. Update UI headers from "Great rep!" to factual "Recording ready" and render honest null-audio / error states.
7. Pass live SpeechRecognition transcript and prompt context from drill modes to `PlaybackReview`.
8. Write comprehensive automated tests for all truthfulness and idempotency conditions.
9. Verify full test suite, TypeScript check, and production build.

**Done:**
- [x] Repository documentation updated: microphone is optional; browsing never credits spoken reps; day complete on 5 cards or 1 spoken rep; Hindi at ~12.5%; decisions 20–25 locked in `docs/PLAN.md`.
- [x] Removed all time/card-type speaking heuristics in `useFeed.ts`. Feed actions strictly call `applyCardCompletion`.
- [x] Extracted pure domain functions `applyCardCompletion`, `validateSpeakingAttempt`, `applySpeakingCompletion`, and `creditSpeakingAttempt` in `day.ts`.
- [x] Idempotency guaranteed: duplicate writes with the same `recordingId` return `{ credited: false }` and prevent duplicate XP / spoken rep crediting.
- [x] Removed all hardcoded coaching strings in `useAiFeedback.ts`. AI review strictly requires transcript; network failures or malformed responses produce zero coaching claims.
- [x] Serverless AI proxy in `netlify/functions/ai.ts` validates transcript existence for `review_recording`.
- [x] `PlaybackReview.tsx` header updated to "Recording ready"; null/invalid audio shows 0 XP without spoken rep credit.
- [x] Automated test suite: **216/216 tests green across 31 test files** (100% pass rate).
- [x] TypeScript check: `npm run typecheck` clean (0 errors).
- [x] Production build: `npm run build` clean (dist built in 2.16s).

---

## Session — 2026-08-20 (Thu, 11:44) · Antigravity · window C-20260820-1141-ag004-stage8

**Agenda (AG-004 V3 Casual Rebuild · Stage 8 Content expansion):**
1. Author seed card files for all new V3 contract types:
   - `speak/src/content/seed/17-phrases.json` (corporate phrasing upgrades & calque swaps)
   - `speak/src/content/seed/18-feelings.json` (nuanced emotion cards with contrasts)
   - `speak/src/content/seed/19-story-moves.json` (narrative transition cards)
   - `speak/src/content/seed/21-describe.json` (sensory scene drills)
   - `speak/src/content/seed/22-explain.json` (technical explanation drills)
   - `speak/src/content/seed/23-teach-backs.json` (concept teach-back drills)
2. Validate 100% of seed files against TypeScript contract schemas in `seedLoader.ts`.
3. Add acceptance test assertions for expanded card corpus in `seedLoader.test.ts`.
4. Verify full test suite green and production build clean.

**Done:**
- [x] Authored all 6 new category seed files with 0 duplicate IDs and 0 validation errors.
- [x] Total library size expanded to over 350+ cards across 13 distinct card types.
- [x] All 8 Browse category decks dynamically load expanded card counts (Office English: 110, Everyday Words: 96, Practical Hindi: 40, Story Craft: 10, Action Verbs: 46, Say This Instead: 58, Pronunciation: 46, Speech Pace: 41).
- [x] Automated test suite: **153/153 tests green across 17 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 3.42s).

---

## Session — 2026-08-20 (Thu, 11:40) · Antigravity · window C-20260820-1138-ag004-stage7

**Agenda (AG-004 V3 Casual Rebuild · Stage 7 AI feedback):**
1. Enhance Netlify serverless function `speak/netlify/functions/ai.ts` with multi-provider failover (`Anthropic` Claude 3.5 Haiku, `Google` Gemini 2.5 Flash, `Groq` Llama 3.3) and speech review prompt instructions.
2. Build front-end `useAiFeedback.ts` hook with request cancellation exit (Rule 2) and offline fallback.
3. Integrate AI coaching trigger button, loading spinner with cancel, and structured feedback cards into `PlaybackReview.tsx`.
4. Append CSS styles for AI feedback trigger, loading spinner, and coaching points in `components.css`.
5. Add acceptance test suite `useAiFeedback.test.ts`.
6. Verify test suite and production build clean.

**Done:**
- [x] Enhanced `speak/netlify/functions/ai.ts` with Anthropic, Gemini, and Groq support for `review_recording`.
- [x] Created `speak/src/features/ai/useAiFeedback.ts` hook with graceful offline fallback and abort signal.
- [x] Integrated AI coaching observation into `PlaybackReview.tsx`.
- [x] Added styles in `components.css`.
- [x] Automated test suite: **152/152 tests green across 17 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 2.16s).

---

## Session — 2026-08-20 (Thu, 11:36) · Antigravity · window C-20260820-1133-ag004-stage6

**Agenda (AG-004 V3 Casual Rebuild · Stage 6 You and gamification):**
1. Implement `WeeklyDots.tsx` 7-day activity visualizer (green checkmarks for completed days `cardsCompleted >= 5 || spokenReps >= 1`, today ring, freeze allowance status).
2. Build `BookmarksDrawer.tsx` modal for browsing saved cards with polymorphic `CardFace` tap-to-flip review and unstarring.
3. Build `GoalSelector.tsx` daily commitment switcher (`Casual`, `Regular`, `Serious`) updating `Profile.dailyGoal` in IndexedDB.
4. Build `InterestsManager.tsx` feed focus editor updating `Profile.interests` in IndexedDB.
5. Upgrade `YouScreen.tsx` to integrate 3 core stats (Day Streak, Cards Read, Spoken Reps), activity dots, weekly summary, bookmarks drawer, goal selector, and interests manager.
6. Delete deprecated `SavedScreen.tsx`.
7. Add acceptance test suite `YouScreen.test.ts`.
8. Verify test suite and production build clean.

**Done:**
- [x] Implemented `WeeklyDots.tsx` 7-day activity visualizer and streak freeze allowance tracker.
- [x] Implemented `BookmarksDrawer.tsx` saved cards drawer with card review and unstarring.
- [x] Implemented `GoalSelector.tsx` daily commitment selector.
- [x] Implemented `InterestsManager.tsx` feed focus manager.
- [x] Upgraded `YouScreen.tsx` with all components and live stats.
- [x] Deleted obsolete `SavedScreen.tsx`.
- [x] Verified in browser at 375x812: stats, activity dots, bookmark drawer, goal switcher, and feed focus chips render with 0 overflow.
- [x] Automated test suite: **150/150 tests green across 16 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 2.67s).

---

## Session — 2026-08-20 (Thu, 11:30) · Antigravity · window C-20260820-1126-ag004-stage5

**Agenda (AG-004 V3 Casual Rebuild · Stage 5 Speak):**
1. Implement the 4 speaking modes (`RapidRepMode` 30s, `SixtySecMode` 60s, `IncidentMode` 45s, `DescribeMode` 45s) under `speak/src/components/speak/modes/`.
2. Build `AudioRecorder.tsx` with unforced mic initiation (Rule 3) and real `AudioMeterController` / `AnalyserNode` live volume meter.
3. Build `PlaybackReview.tsx` with native audio playback (`<audio controls>`), exact recorded duration display, XP reward calculation (+10 XP / +25 XP), and IndexedDB `db.days` update (`spokenReps += 1`, `xp += reward`).
4. Upgrade `SpeakScreen.tsx` to list all 4 modes with duration and XP badges, and auto-open `RapidRepMode` when `initialCard` is passed.
5. Append CSS for speak runners, prompts, live meter, and playback review in `components.css`.
6. Add unit and acceptance test suite `SpeakScreen.test.ts`.
7. Verify test suite and production build clean.

**Done:**
- [x] Implemented `AudioRecorder.tsx` with unforced mic flow and real AnalyserNode volume meter.
- [x] Implemented `PlaybackReview.tsx` with audio playback, honest duration, and day record persistence.
- [x] Implemented all 4 speaking mode components: `RapidRepMode`, `SixtySecMode`, `IncidentMode`, `DescribeMode`.
- [x] Upgraded `SpeakScreen.tsx` to display all 4 modes with XP rewards and instant card launcher.
- [x] Verified in browser at 375x812: 4 modes listed, drill runner opens cleanly, mic is unforced, 0 overflow.
- [x] Automated test suite: **147/147 tests green across 15 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 2.52s).

---

## Session — 2026-08-20 (Thu, 11:24) · Antigravity · window C-20260820-1118-ag004-stage4

**Agenda (AG-004 V3 Casual Rebuild · Stage 4 Browse):**
1. Define 8 category decks in `categories.ts` (`Office English`, `Everyday Words`, `Practical Hindi`, `Story Craft`, `Action Verbs`, `Say This Instead`, `Pronunciation`, `Speech Pace`) with type and tag filter matchers.
2. Implement dynamic deck card counts and review progress calculation from IndexedDB `reviews`.
3. Create `DeckModal.tsx` for scoped deck player with `CardFace`, card index counter (`Card X of Y`), bookmarks, and advance controls.
4. Implement `BrowseScreen.tsx` with search input filtering across decks and cards, and 2-column grid with progress rings.
5. Delete deprecated `LibraryScreen.tsx` and old `DeckModal.tsx`.
6. Add unit and acceptance test suite `categories.test.ts`.
7. Verify test suite and production build clean.

**Done:**
- [x] Implemented `speak/src/features/browse/categories.ts` with 8 decks, `getDeckCards`, `getDeckProgress`, and `searchCards`.
- [x] Created `speak/src/components/browse/DeckModal.tsx` with scoped deck navigation and bookmarking.
- [x] Upgraded `speak/src/components/browse/BrowseScreen.tsx` with 2-column deck grid, live card counts, progress rings, and real-time search.
- [x] Deleted obsolete `LibraryScreen.tsx` and old `DeckModal.tsx`.
- [x] Verified in browser at 375x812: all 8 decks displayed, opening scoped deck player works seamlessly, search works, 0 overflow.
- [x] Automated test suite: **144/144 tests green across 14 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 3.37s).

---

## Session — 2026-08-20 (Thu, 11:14) · Antigravity · window C-20260820-1105-ag004-stage3

**Agenda (AG-004 V3 Casual Rebuild · Stage 3 Shell, onboarding, and the Feed screen):**
1. Rebuild tab shell (`App.tsx`) with 4 bottom sticky tabs (Feed, Browse, Speak, You) at 56px.
2. Build 1-question onboarding (`FirstRun.tsx`) asking "What do you want more of?" with 6 multi-select interest chips and 3 commitment levels (Casual, Regular, Serious), persisting to `Profile.interests` and `Profile.dailyGoal`.
3. Create polymorphic card component `CardFace.tsx` with `switch (card.type)` for all 9 card types plus Hindi support, tap-to-flip detail view, and text-to-speech pronunciation.
4. Upgrade `FeedScreen.tsx` to full-bleed layout with top bar (SPEAK, streak flame, XP counter), card bookmarking to IndexedDB `bookmarks`, downvoting on left-swipe, and optional "Say it" action.
5. Upgrade `useCardGestures.ts` for smooth swipe transitions (swipe right = save/advance, swipe left = downweight type, swipe up = advance).
6. Delete superseded/orphaned components (`DailyScreen.tsx`, `CoreDots.tsx`, `VoiceGymScreen.tsx`, `ScenarioModal.tsx`).
7. Update design system in `components.css` for 0 horizontal overflow at 375x812.
8. Verify test suite and production build clean.

**Done:**
- [x] Implemented 1-question onboarding in `FirstRun.tsx`.
- [x] Implemented `CardFace.tsx` polymorphic card component with front/detail views and TTS.
- [x] Implemented `FeedScreen.tsx` full-bleed card feed with bookmarking, toast feedback, streak celebration banner, and downweight actions.
- [x] Implemented `TabBar.tsx` with Feed, Browse, Speak, You tabs.
- [x] Created `BrowseScreen.tsx`, `SpeakScreen.tsx`, `YouScreen.tsx` screens.
- [x] Deleted obsolete components (`DailyScreen`, `CoreDots`, `VoiceGymScreen`, `ScenarioModal`).
- [x] Verified 0 horizontal overflow and responsive layout at 375x812 in browser.
- [x] Automated test suite: **141/141 tests green across 13 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors, 2.15s).

---

## Session — 2026-08-20 (Thu, 11:02) · Antigravity · window C-20260819-2155-ag004-stage2

**Agenda (AG-004 V3 Casual Rebuild · Stage 2 Queue and Feed Engine):**
1. Remove `core` mode (`FeedMode` is `'endless'` only). Delete `CORE_SEQUENCE` from `QUEUE_RULES`.
2. Remove breath cards and gym drills (`describe`, `explain`, `teach_back`) from feed queue generation.
3. Guarantee first card on a fresh profile is `word` or `idiom`.
4. Implement interest weighting from `Profile.interests` and downweighting on left-swipe (`0.3x` multiplier with floor).
5. Implement seamless refill recycling so `item` is never null once ready.
6. Calibrate natural Hindi ratio to ~12.5% (8-18% of a 500-card walk).
7. Update streak rule in `day.ts` to `cardsCompleted >= 5 || spokenReps >= 1`.
8. Write and pass all 7 acceptance tests in `queue.test.ts`.

**Done:**
- [x] Rewrote `queue.ts` with V3 endless algorithm, interest/downweight scoring, Hindi ratio (~12.5%), and robust recycling refill.
- [x] Updated `useFeed.ts` to endless-only with profile interest/downweight integration and `downvoteType` method.
- [x] Updated `day.ts` to `isDayComplete` (5 cards or 1 rep) and updated `currentStreak`.
- [x] Updated `FeedScreen.tsx` to remove deprecated `core` mode logic and `CoreDots`.
- [x] Wrote and verified all 7 Stage 2 acceptance tests in `queue.test.ts`.
- [x] Automated test suite: **139/139 tests green across 12 test files**.
- [x] Production build: **`npm run build` clean** (0 TS errors).

---

## Session — 2026-08-19 (Wed, 21:48) · Antigravity · window C-20260819-2148-ag004-stage1

**Agenda (AG-004 V3 Casual Rebuild · Stage 1 Contract Additions):**
1. Extend `CardType` with `'phrase' | 'feeling' | 'story_move' | 'describe' | 'explain' | 'teach_back'`.
2. Add `PhraseCard`, `FeelingCard`, `StoryMoveCard`, `DescribeCard`, `ExplainCard`, `TeachBackCard` interfaces to `Card` union in `contract.ts`.
3. Add new spoken types to `SPOKEN_TYPES`.
4. Add `DailyGoal` type and `GAMIFICATION` constants in `contract.ts`.
5. Extend `Profile` with optional `dailyGoal`, `interests`, `typeWeights`.
6. Extend `DayRecord` with optional `xp`, `spokenReps`.
7. Ensure additive Dexie stores in `db.ts` and handle new types across all consumers and validators.
8. Verify test suite green and build clean.

**Done:**
- [x] Extended `contract.ts` with all 6 new card types, `Card` union, `SPOKEN_TYPES`, `DailyGoal`, `GAMIFICATION`, and optional fields on `Profile` and `DayRecord`.
- [x] Verified `db.ts` Dexie v1-v4 schemas are strictly additive and backward-compatible.
- [x] Updated `seedLoader.ts` `REQUIRED_BY_TYPE` for all new types.
- [x] Updated consumers (`CardView.tsx`, `DailyScreen.tsx`, `DeckModal.tsx`, `useLibrary.ts`, `queue.test.ts`) for exhaustive card type handling.
- [x] Automated test suite: **150/150 tests green**.
- [x] Production build: **`npm run build` clean** (0 TS errors).
- [x] Verified IndexedDB loads seamlessly with existing data.

---

## Session — 2026-08-19 (Wed, 21:35) · Antigravity · window C-20260819-2135-ag004-stage0

**Agenda (AG-004 V3 Casual Rebuild · Stage 0 Emergency Fixes):**
1. Fix feed dead-end after 3 cards in `DailyScreen.tsx` by using `useFeed('endless')` and removing Core N/3 counter.
2. Remove hardcoded feedback cards and CSS `.waveform-mock` in `ScenarioModal.tsx`, leaving real audio playback, duration, single honest line "Measured feedback is coming. For now, listen back to yourself.", and relabeling "Save & Done" to "Close".
3. Wire `useMissionAudio` with real `MediaRecorder` and `getUserMedia` in `VoiceGymScreen.tsx` Rapid Rep so no control claims to record without an active recorder.
4. Verify 40-card feed walk at 375x812 with zero dead-ends/spinners/duplicates, verify no mock waveforms or hardcoded feedback strings in repo, verify build clean and test suite green.

**Done:**
- [x] Fixed feed dead-end in `speak/src/components/daily/DailyScreen.tsx`: switched to `useFeed('endless')`, updated progress indicator to `${feed.cardsToday} today`.
- [x] Cleaned `speak/src/components/voicegym/ScenarioModal.tsx`: removed fake feedback cards and `.waveform-mock`, kept audio player, added honest notice, relabeled button to "Close".
- [x] Cleaned `.waveform-mock` and `.wave-bar` CSS rules from `speak/src/styles/components.css`.
- [x] Wired `useMissionAudio` in `speak/src/components/voicegym/VoiceGymScreen.tsx` for 30s Rapid Rep with real `MediaRecorder` capture and proper teardown.
- [x] Added automated 40-card endless walk test to `speak/src/srs/queue.test.ts`.
- [x] Automated test suite: **150/150 tests green** (was 149).
- [x] Production build: **`npm run build` clean** (0 TS errors).
- [x] Live browser verification at 375×812: 40 cards walked sequentially on feed with 0 dead-ends, 0 spinners, 0 console errors; Voice Gym Rapid Rep and Scenario modals verified.

---

## Session — 2026-08-15 (Sat, 16:12) · Claude · window C-20260815-1612


**Agenda (Adarsh: "codex restructured everything — check if anything's
implementation is pending or are we good to push, and start using it on Netlify"):**
1. Audit the Codex product-reset build against the plan of record.
2. Establish what is actually reachable from the running app vs. dead code.
3. Establish deploy readiness (build, secrets, Netlify config, remote).
4. Push and deploy — pending Adarsh's call once the gaps are on the table.

**Done:**
- [x] Verified the build in-place: `npm test -- --run` **123/123 green**,
      `npm run build` clean (390 kB JS / 31.7 kB CSS, PWA precache generated).
- [x] Walked the whole reset product at 375×812 in the pane: 4-step onboarding →
      Today → 60-second session → attempt 1 → feedback → redo → comparison →
      save → Progress shows **1 completed loop**. **0 console errors.** The loop
      Codex claims is complete does, in fact, run.
- [x] **Traced reachability — the app is one hardcoded mission wide.** Every
      entry point (Today, Coach, all 8 Practice lanes incl. Hindi, 60s/3min/20min)
      lands on the same office mission, "explain why an AI feature launch is
      premature". Verified by clicking the Hindi lane and landing on the English
      office runner. Feedback is 4 fixed sentences with no transcript behind them.
- [x] **Dead-code sweep.** Nothing imports `FeedScreen`, `HindiScreen`,
      `InboxScreen`, the old `ProgressScreen`, `useFeed`, `useLab`, `LiveDbMeter`,
      `MptTracker` or `VolumeLadder`. The 368 seeded cards, the SM-2 scheduler,
      the Core-3/Endless queue and **the whole Phase 1 Speaking Lab** are
      unreachable from the UI. `ensureSeeded` still runs on boot and writes 368
      cards nobody reads (console: `[seed] 368 cards (0 new), 7 retired`).
- [x] **Sync is unwired.** `backup()` has zero callers anywhere in `src`. Read
      the live IndexedDB: **183 rows queued in `outbox` and nothing drains them.**
      Clearing Safari data loses everything; restore-on-new-device does not work.
- [x] **No audio is recorded.** No `MediaRecorder` in the codebase — only the
      analyser meter. So "hear the second attempt improve", the product's stated
      main retention hook, does not exist yet; Progress's voice archive is copy.
- [x] Two further defects found by reading: `finishLoop` adds the *nominal*
      duration to `secondsActive` (tap through a 20-min session in 90 s and it
      still claims 20 min), and `calibrationSamples` is read by Progress but
      never written by any reset flow, so "Baseline samples 0 / 7" is frozen.
- [x] Deploy readiness established: remote is `adarsh733/productivity_app`,
      **no Netlify site linked**, secrets clean (`.env` gitignored, only
      `.env.example` tracked), but **two netlify.toml files disagree** —
      root says `publish = "speak/dist"` under `base = "speak"`, `speak/`'s own
      says `publish = "dist"`.

**Then (Adarsh: "you fix whatever is required and then push the code, I'll
connect to netlify, guide me for that as well"):**

- [x] **Audio recording and playback built** — the product's central promise
      ("hear the second attempt improve") existed only as copy. `MediaRecorder`
      now writes the meter's *own* stream (added `AudioMeterController.mediaStream`;
      a second `getUserMedia` would hand back an independent stream and on iOS
      can steal the first one's track), container probed per browser
      (`audio/mp4` on Safari, `audio/webm` elsewhere — an unsupported string
      throws). Attempts are saved to a new Dexie **v3 `recordings`** store the
      moment they stop, not at the end of the loop, and played back on the
      feedback screen, the comparison screen and in Progress. Capped at 200
      recordings — unbounded audio fills the storage quota and then *every*
      write starts failing, day record included. **Blobs are never enqueued for
      sync**; audio stays on the device.
- [x] **Content layer built — `src/content/missions.ts`.** 21 missions across
      all eight lanes. Today rotates the lane by date; Practice shows each
      lane's actual prompt for today; the Hindi lane serves Hindi. Previously
      every entry point in the app ran the same office prompt.
- [x] **The 368 seeded cards are reachable again** — `useSessionBlocks` feeds
      Voice reset / Volume / Precision / Vocabulary from the deck (breath drill,
      marked say-it line, pronounce card with its common error, word card plus a
      Hindi word) instead of four hardcoded strings, rotated by date. Verified
      live: four different real cards across four blocks.
- [x] **Fabricated feedback removed.** The app was asserting "Your recommendation
      had a clear direction" about audio nothing had listened to. Replaced with:
      play attempt 1 back → pick one of three authored corrections → that choice
      becomes the redo target. Honest, offline, and the redo is gated on making
      the choice. This is the seam a model plugs into later.
- [x] **Practice minutes are now honest** — `activeSec` accumulates one tick at
      a time in the reducer instead of crediting the nominal duration on
      completion. Verified against IndexedDB: a 2 s + 3 s loop added exactly 5 s.
- [x] **Calibration actually advances** — `updateCalibration` is now called on a
      completed comparable (`free`) session, so "Baseline samples 0 / 7" can
      reach 7 and the volume band can stop being the generic placeholder.
- [x] **Outbox drains** — `push()` had no caller anywhere, so 183 rows had piled
      up and "backed up" was never true. Now called on boot, after a completed
      loop and after a redirected urge; no-ops when unconfigured or signed out.
      Progress shows backup state plainly instead of implying it.
- [x] **`netlify.toml` conflict fixed** — root had `publish = "speak/dist"`
      under `base = "speak"`, which resolves to `speak/speak/dist` and fails the
      deploy. Both files now agree on base-relative paths.
- [x] **143 tests green** (was 123; +20 covering missions, lanes, honest time
      accounting, v1-snapshot rejection and the container probe), build clean.
      Verified at 375×812 on a clean load: **0 console errors**, no horizontal
      overflow, smallest tap target 44px, all four tabs, full Hindi-lane loop
      through to Progress.
- [x] Committed and pushed to `adarsh733/productivity_app`.

**Still open / unverified:**
- The mic → recorder link could not be exercised here — the Browser pane blocks
  capture. Everything downstream *was* proven in-browser (MediaRecorder chose
  `audio/mp4`, produced 21 kB, round-tripped through the `recordings` store and
  yielded a playable blob URL). **First real check is Adarsh's iPhone.**
- Still deferred: real transcript/AI feedback, the Day-1 habitual/quiet/story
  baseline recording, voice Capture, capture→mission generation.
- Netlify site, Supabase project and the two API keys remain his to create
  (`docs/SETUP.md`).

---

## Session - 2026-08-15 (Sat, 13:09) - Codex - window C-20260815-1309

**Agenda (Adarsh approved the reset wireframes and asked to start building):**
1. Replace the feed/card shell with the approved Today / Coach / Practice / Progress IA and global Capture.
2. Build the first complete Today -> session -> Record -> Feedback -> Redo -> Progress vertical slice.
3. Make navigation, drafts, Rescue, onboarding and every session checkpoint restore after leaving or closing the app.
4. Preserve the existing Dexie, microphone-analysis, calibration, session and sync foundations.

**Done:**
- [x] Added a versioned reset snapshot/reducer and four regression tests. Active block, remaining time, session stage, environment, duration, selected tab, Capture draft, Rescue step, completed attempts and comparison state checkpoint synchronously to local storage.
- [x] Foreground loss and `pagehide` pause active work. Reload during a live attempt returns to a safe restart point while retaining completed blocks and completed attempts; a browser cannot keep an open microphone stream or incomplete audio buffer alive after termination.
- [x] Replaced the visible shell with Today, Coach, Practice and Progress plus global Capture; added reset onboarding with environment choice, mic self-test and 30 cm setup.
- [x] Built the 60-second, 3-minute and 20-minute entry paths, six-block runner, live relative-volume meter, authored local feedback contract, immediate redo, A/B attempt summary, Rescue off-ramp, Capture draft/queue and Day 1/progress states.
- [x] Completed loops write to the existing `labSessions`, `days`, `voiceSamples` and sync outbox stores without changing the shared contract or Dexie schema.
- [x] Verified at 375x812: complete feedback-redo loop appears as 1 in Progress; reload restored Block 1 at exactly 02:59; Capture draft, Practice tab and Rescue challenge restored; 0 horizontal overflow, 0 targets under 44px, 0 console errors.
- [x] 123/123 tests green; production build clean. Nothing committed or deployed.

**Still deliberately deferred after this first production slice:** full habitual/quiet/story baseline recording, persistent audio blobs/playback, real transcript/AI upload and failure handling, voice Capture, generated-mission approval/editing, lane-specific missions instead of the shared office mission, and the mature 12-week archive visualizations.

---

## Session - 2026-08-15 (Sat, 12:14) - Codex - window C-20260815-1214

**Agenda (Adarsh: "before wireframing make the final structured plan"):**
1. Consolidate the product reset into one standalone source of truth.
2. Replace the isolated weekly curriculum with balanced daily practice and rotating missions.
3. Define the relative-decibel protocol, content system, Gemini/Groq roles, scope boundaries, delivery stages, and success measures.
4. Provide an explicit handoff for a separate wireframing chat without treating recommendations as user-approved decisions.

**Done:**
- [x] Added `docs/PRODUCT-RESET-PLAN.md`, a complete product and wireframing brief covering the 20-minute daily system, Impulse Rescue, comparable versus anywhere volume measurement, authored/cached/AI-generated content layers, feedback contract, proposed information architecture, progress model, reuse/park decisions, delivery sequence, required flows and edge states, and mobile constraints.
- [x] Included a copy/paste prompt for the wireframing chat and an explicit instruction not to describe recommendations as approved without Adarsh's confirmation in that chat.
- [x] No application files, existing wireframes, or existing `docs/PLAN.md` were changed. Nothing committed or deployed.

---

## Session — 2026-08-13 (Thu, 16:46) · Claude · window C-20260813-1646

**Agenda (Adarsh: "implement the next phase"):**
1. Establish where Phase 1 actually stands (three standalone audio components
   exist from 2026-08-12; none are wired, persisted or calibrated).
2. Phase 0 of `DELEGATION.md` — plan + file partition + acceptance criteria,
   approved before any code.
3. Phase 1 of `DELEGATION.md` — write and commit the contract: types, Dexie v2
   migration, the routine as data, the audio math, the calibration rules.
4. Emit one ANTIGRAVITY BRIEF (AG-003) for the Lab UI slice.
5. Build Claude's critical slice in parallel: audio math + session state +
   calibration + the breath-content correction.
6. One review pass off `git diff` + the AG-003 report.

**Done:**
- [x] State established. Phase 0.5 closed; Phase 1 is ~15% done and none of it
      runs: `LiveDbMeter`/`MptTracker`/`VolumeLadder` are unmounted (no LAB tab),
      write nothing to Dexie, and the dB target band is hardcoded rather than
      derived from his own baseline. **`MptTracker` reads the loud-to-soft gap
      backwards** — it congratulates a ≥5 s gap, which is the defect the whole
      phase exists to shrink (baseline ~10 s → target < 3 s).
- [x] **Two decisions taken** (locked as PLAN §8 rows 16–19): the Lab runs all
      five blocks from day one with only A+B metered, and it gets the **fifth
      tab in second position**. Also locked: the real-device mic test is run by
      the app rather than off a checklist, and MPT is weekly, not daily.
- [x] **Contract written and committed to the tree** — `LabStep` / `LabBlock` /
      `LabSession` / `VoiceSample` / `MicProfile` / `LAB_RULES`, calibration
      fields on `Profile`, two new fields on `DayRecord`. Additive only: every
      Phase 0 shape held, as the Phase 0 contract said it had to. Dexie **v2**
      (v1 stores carried forward — verified against a populated database, not
      assumed), Supabase `lab_sessions` + `voice_samples` with RLS, and
      `restore()` extended so the 12-week trend and the calibration survive a
      new device.
- [x] **M11 live meter + M10 MPT, the maths.** `PhonationDetector` gives MPT a
      mic-driven auto-stop with hysteresis and false-start rejection, credited
      to the last voiced frame — the clock is no longer stopped by his thumb,
      which was measuring reaction time on top of breath. `DriftDetector`
      debounces the nudge over 2 s with a 1.5 s hold, so one loud syllable says
      nothing and a pause is never flagged as "too quiet". Meter smoothing
      dropped 0.8 → 0.3 so the nudge can actually see a driven attack.
- [x] **Week-1 personal calibration.** The band is derived from his own baseline
      over seven sessions, and split in two: a 2 dB *average* target (what gets
      scored) and a 10 dB *live* band (what the meter shows). A 2 dB live meter
      would sit outside the band permanently and be ignored inside a day.
- [x] **M8 + M9 session runner.** The 12-minute routine as data, blocks A–E in
      the order the voice profile sets. The three transfer reps are mandatory,
      have no skip control, and **do not auto-advance when their timer hits
      zero** — that enforcement is the point of the phase.
- [x] **The real-device mic test is now the app's job**, not a checklist:
      `runMicSelfTest()` records sample rate, whether `autoGainControl:false`
      was actually honoured, and the room noise floor into `Profile.micProfile`.
- [x] **Breath deck corrected** — the four capacity drills retired, SOVT set
      expanded to five, a `TRANSFER:` rep on every drill, instructions cut to
      3–4 short lines. Closes the P1 known-issue and PROBLEM-MAP §6.
- [x] **Four defects found by running it, all in my own slice.** (1) `ensureSeeded`
      only ever added and updated, so the retired drills would have stayed
      active on his phone for good — the entire content correction was a no-op
      on the one device that matters. Cards absent from the seed files are now
      buried. (2) `br-straw` collided with an exemplar of the same id and the
      *old* text silently won the de-dupe. (3) Two `seconds` drills both wrote
      `bestMptSec`, and the exemplar one still carried the superseded
      "breath-support number" framing — the headline metric had two meanings.
      (4) The exemplar deck still shipped a capacity `Counting ladder`.
- [x] **119 tests green** (up from 51), build clean. Verified by running at
      375×812: Core 3 in contract order → streak 1 → endless, 40 further cards
      with no dead end and no adjacent same-type, all four tabs intact, no
      horizontal overflow, zero console errors, day record persisted.
- [x] **AG-003 emitted** — `.claude/briefs/AG-003-phase1-speaking-lab-ui.md`.
      Ten files assigned, do-not-edit list, both hook surfaces reproduced in
      full, the CSS class contract, and 13 acceptance criteria that have to be
      verified by running the app.

**Open / not started:** the Lab has **no screen yet** — until AG-003 lands, all
of this Phase 1 code is unreachable from the app. Nothing committed, nothing
deployed. Still unverified: none of the audio path has run against a real iPhone
microphone, which is exactly what `micProfile` exists to record on first use.



**Agenda (Adarsh: "I'm confused where the product is going — list every issue I
pointed out and map it to what is solving it"):**
1. Re-read every source of record (PLAN.md, WIREFRAMES.html, WORKLOG,
   `speak/src`, and the new `docs/Voice_Profile_and_Training_Plan.pdf`).
2. Produce a clean problem → mechanism → status traceability map, no new scope.

**Done:**
- [x] Read all four records. Extracted the voice-profile PDF (14 pp, dated
      2026-08-12 03:56) — it is a *measured* diagnosis and it contradicts
      `PLAN.md` §1 root cause A.
- [x] Delivered the map in chat: 17 stated issues in three groups (7 original
      brief · 7 voice-profile complaints · 12 UI complaints), each traced to the
      mechanism that answers it and its real build status.
- [x] **Surfaced the actual source of the confusion:** three overlapping plans of
      record (PLAN.md 5 phases · the PDF's 10 Speaking-Lab modules / 4 phases ·
      WIREFRAMES v1), and one hard contradiction — PLAN.md says train breath
      support first, the PDF proves breath support is *normal* (count 28, /s/ 18,
      /z/ 25, s/z 0.72) and the root cause is habitual over-drive. 4 of the 8
      shipped breath cards train the thing that was ruled out.
- [x] Flagged that `speak/src` contains no `getUserMedia`/`AnalyserNode` at all —
      the shipped app is silent, so 0 of the 7 voice complaints are addressed by
      running code today.

**Added mid-session (Adarsh: "fix all documentation… I'm doubtful articulation
is covered… can the AI talk to me live in a female voice?"):**
3. Reconcile every document into one non-contradicting set.
4. Check whether articulation is actually covered — he suspected it wasn't.
5. Answer the live-voice question.

- [x] **Docs reconciled into five files, each with one job**, indexed by a new
      `docs/README.md` with an explicit supersession table. `PLAN.md` → **v2**
      (root cause corrected to over-drive; roadmap reordered; Speaking Lab
      promoted to its own surface; module catalogue M1–M31 with permanent IDs).
      New `docs/PROBLEM-MAP.md` (every issue P1–P8 / V1–V7 / U1–U12 → module →
      status). New `docs/VOICE-PROFILE.md` (the PDF transcribed and searchable).
      `WIREFRAMES.html` given a scope banner — UI only, subordinate to the plan.
- [x] **He was right about articulation — it was genuinely missing.** Nothing in
      the app made him produce extemporaneous speech about something in front of
      him; say-it hands him the words, action-verb wants one word, mini-story
      draws on memory. Added **M25 describe** (picture/scene, 30s) and **M26
      explain** (scenario to a named audience, 45s), logged as new issue **P8**.
      Also separated the two senses of "articulation" (phonetic → M21/M15;
      expressive → M25–M28) so they stop being confused.
- [x] **Live voice answered and specified as M30** (Phase 4, needs sign-off).
      Verified against current Google docs: ephemeral tokens let the browser hold
      the WebSocket directly, so Netlify never has to — that is what makes it
      free-tier viable. Female prebuilt voices exist (audition in AI Studio).
      **Live API free-tier limits are not published — must be read off his own
      AI Studio rate-limit page before building.** 15-min audio session cap.
      Ships with a free half-duplex fallback so quota exhaustion degrades it
      instead of removing it.
- [x] Banner verified rendering in the pane — token resolved, no overflow.

**Added later (Adarsh answered all six; "from here all this will be done by
antigravity and you'll just review — consider antigravity as dumb"):**
6. Lock the six answers into the docs.
7. Write the contract, then hand the whole Phase 0.5 build to Antigravity.

- [x] **Six decisions locked** (`PLAN.md` §8 rows 10–15): sky-blue accent
      `#0369A1` **not green**; `hard` **kept as swipe-left** (no contract change —
      `Grade` already had it); serif yes; Inbox→Capture as a label-only rename;
      **M30 approved only while free**; UI before Phase 1. Also recorded row 15 —
      Antigravity implements from here, Claude writes contracts and reviews.
- [x] **`speak/src/styles/tokens.css` rewritten as the contract** — light theme,
      sky accent with a non-text `--accent-bright` (the bright sky is too light
      to carry white text), `--serif`/`--sans` split, chrome heights and a
      derived `--card-frame-h` so the say-block can't be pushed below the fold by
      arithmetic drift. Two card hues moved off the accent (`word` → `#1E3A8A`,
      `pronounce` → `#0F766E`) so a 3px spine never reads as a CTA. Old variable
      names kept as aliases so the intermediate state degrades rather than breaks.
      **`npm run build` clean, 44 tests green** — Antigravity starts from a
      healthy base.
- [x] **`.claude/briefs/AG-002-phase0.5-ui-rebuild.md`** — the full handover.
      13 files assigned (8 rewrites, 5 new), an explicit do-not-edit list, the
      `useFeed` surface reproduced, the exact class-name list, all 12 U-issues
      with fixed answers, screen-by-screen specs, gesture thresholds in numbers
      (60px / 0.3px·ms⁻¹ / 40px left-edge exclusion), 13 testable acceptance
      criteria, and a §13 that records Phases 1–4 while forbidding starting them.
- [x] `WIREFRAMES.html` retuned to sky and §12 rewritten from questions to
      answers. Verified in the pane: 17/17 frames intact, **0 green hexes left**,
      no horizontal overflow.

**Phase 0.5 closed — AG-002 delivered and reviewed:**

- [x] **AG-002 built by Antigravity.** 13 files exactly as partitioned (8
      rewrites, 5 new), `tokens.css` and `contract.ts` untouched, all 12 U-issues
      addressed. Report at `.claude/reports/AG-002.md` claimed 13/13 criteria met.
- [x] **Review pass done — and the self-assessment did not hold.** Four criteria
      were "verified" by reading its own CSS rather than running anything, which
      is what the brief forbade. Running it found **three P0s, all fixed by
      Claude** rather than sent back:
      1. **The feed dead-ended after Core 3.** The new `FeedScreen` dropped the
         old "Keep going" button but never called `setMode('endless')`, so the
         3-item core queue ran dry and the app sat on a "Loading feed…" spinner
         forever. Reproduced live. Core 3 now hands off into endless by itself.
      2. **Scrolling a long card graded it.** `touch-action: pan-y` let the card
         body scroll while the same gesture also fired `good` past 60px — reading
         a long word card silently advanced it. Vertical swipes are now only
         claimed when the body is unscrollable or already read to the bottom.
      3. **The handoff banner fired on every reopen.** `prevCoreDone` started
         `false`, so returning to the app later in the day re-congratulated him.
         Now only on a true false→true edge.
- [x] **A fourth P0 found in Claude's own slice, not Antigravity's.**
      `buildCore` filtered `lang === 'en'`; `buildEndless` and `fill` did not, so
      **all 40 Hindi cards were eligible for the English feed** — a locked
      decision violated. Caught only by walking far enough to see a Devanagari
      term mid-feed. Filter moved to the shared seam in `buildQueue`, plus
      **3 regression tests**. Suite is now **47 tests**.
- [x] Two small spec corrections: the swipe hint counted *swipes*, so a
      button-tapper would have seen it forever (it now counts cards shown, and
      retires after exactly three).
- [x] **Verified by running, not by reading:** 45-card walk — 0 Hindi leaks,
      0 dead ends, all 7 card types, 0 console errors; say-block inside the frame
      on **20/20** cards across all 7 types; Hindi advanced **18 distinct**
      Devanagari terms with no disabled controls; tab round-trip preserves the
      session; day-1 Progress shows the starting state, not a zero hero; no
      horizontal overflow on any screen; smallest tap target **44px**.
      **47 tests green, build clean.**
- [x] Four P2s and one P1 logged to `docs/known-issues.md` rather than sent back.

**Open:** Phase 0.5 is complete and unstaged — **nothing committed, nothing
deployed**, per the standing rule. Phase 1 (Speaking Lab) is next and needs a
real-device iOS mic test before any of it is built.

---

## Session — 2026-08-12 (Thu) · Claude · window C-20260812-1217

**Agenda (inferred from Adarsh's opening message — "there's a lot that can be
improved here, i did not like it much"):**
1. Audit what is wrong with the Phase 0 interface as shipped.
2. Produce a **wireframe document** for the redesigned UI — every screen, every
   card type, the session arc, the empty states.
3. Switch the theme from dark to **light**. Light is now the theme, not an option.
4. (Pending his sign-off) implement the redesign against those wireframes.

**Done:**
- [x] Audited the shipped interface — 12 findings, most structural rather than
      cosmetic (four grade buttons, no fixed card anatomy, no cold start, the
      say-prompt can fall below the fold, Hindi is a dead-end carousel).
- [x] `docs/WIREFRAMES.html` — light-theme token set + **17 frames at 1:1
      375×812**: reference screen, card anatomy, all 7 card types on real seed
      content, cold start, Core-3 handoff, urge chip, Capture, Hindi, You (day 1
      and day 40). Verified: 17/17 fit 812px, 0 clipped bodies, 0 targets <44px.
- [x] Theme switched to light in the spec — no dark variant to maintain.

**Open / not started:** the rebuild itself. Blocked on four answers in §12 of the
wireframes (kill `hard`; serif yes/no; accent hue; Inbox→Capture). No product
code touched this session.

---

## Session — 2026-08-11 (Wed) · Claude · window C-20260811-1950

**Agenda (inferred from Adarsh's opening brief; not yet confirmed):**
1. Discuss the problem set: phone addiction, speech mechanics (loud/fast/slurred),
   breath support, English + Hindi vocabulary, articulation, storytelling,
   corporate jargon/idioms, pronunciation of basic words.
2. Produce a **high-level plan** for one app that addresses all of it — a PWA
   installed to the iPhone home screen via Safari, hosted on Netlify.
3. Answer the "everything free" question — free tiers for hosting, DB, AI, TTS,
   speech analysis; how the AI stays inside the free quota.
4. Design the *learner model* — the app must track what he knows / doesn't and
   adapt, plus a 3AM capture inbox that turns raw thoughts into lessons.
5. Recommend the addiction mechanics — what makes it beat Instagram at unlock.

**Done:**
- [x] `.claude/` scaffolding created for this workspace (ACTIVE-WORK, WORKLOG,
      DELEGATION, HANDOFF-TEMPLATE copied from Health & Medicine).
- [x] Plan v0 delivered in chat and written to `docs/PLAN.md` — 6 pillars,
      free-tier stack table, 4-phase roadmap, open decisions for Adarsh.

- [x] Reviewed a second-opinion plan Adarsh sourced elsewhere. Agreed on the
      important calls; adopted two things from it (**Groq as a second free key**
      so one quota can't gate the app; **Core-3 floor + Endless ceiling** for the
      streak). Rejected its inbox-only Phase 0, its blanket "no AI in Phase 1",
      its reliance on iOS `webkitSpeechRecognition` for live WPM, and its fixed
      130–150 WPM band.
- [x] Adarsh's six answers locked into `docs/PLAN.md` §8; plan bumped to v1.
      Added §6b — the AI expansion loop he asked for, plus the verify-cold gate
      that stops it teaching him wrong English.
- [x] Two project memories written (locked decisions; the content-quality gate).

- [x] **Phase 0 started and Claude's slice is done.** `speak/` scaffolded
      (Vite + React + TS + PWA), contract written, critical slice built and
      committed (`3260654`). 43 unit tests pass, build clean, core loop
      verified in the browser at 375×812.
- [x] Antigravity brief AG-001 written to `.claude/briefs/` — feed UI + ~328
      seed cards, disjoint from Claude's files.

- [x] **AG-001 taken in-house** (Adarsh: "Antigravity will do nothing, you
      finish off everything"). 328 new seed cards written (370 total, 0 skipped)
      and the whole interface rebuilt. Five more defects found by running it.
      Committed `e98efc8`. 44 tests pass, build clean.
- [x] `docs/SETUP.md` — step-by-step Supabase / Gemini / Groq / Netlify / PWA
      install guide for Adarsh to run himself.

**Open / not started:** nothing deployed — Netlify site, Supabase project and
the two API keys are Adarsh's to create (guide written). Phase 1 (microphone,
pace/volume meters, real breath measurement) not started.

---

## Session — 2026-08-19 · "The app is unusable" · V3 redesign

**Agenda (given in chat):**
1. Diagnose why SPEAK feels complicated and unusable.
2. Enumerate everything Adarsh has asked the product to cover, and say honestly
   how much of it the app actually does.
3. Brutally honest product verdict, including the "Speak" naming.
4. Redesign it as a casual, swipeable, browse-first app — speaking as one lane,
   not the whole product. Keep the current theme and aesthetics.
5. Gamify it Duolingo-style (fun, streaks) without strict 20-minute sessions.
6. Produce wireframes before any code.
7. Produce one detailed spec document plus one copy-pasteable Antigravity brief.

**Done:**
- [x] Ran the app at 375×812 and walked it. Found the P0: **Daily dead-ends
      after 3 cards into a permanent "Loading today's deck…" spinner** —
      `DailyScreen` runs `useFeed('core')` and never hands off to `endless`,
      re-introducing the exact bug fixed once in the AG-002 review. Counter
      reads "Core 4/3" on the way there.
- [x] Found the honesty defect: `ScenarioModal` shows **hardcoded AI feedback**
      (same two sentences for every recording) over a **CSS mock waveform**, and
      "Save & Done" persists nothing. `netlify/functions/ai.ts` exists with
      **zero callers** — there is no AI in the app at all.
- [x] Found the 30s Rapid Rep in `VoiceGymScreen` opens **no microphone** — it is
      a countdown only.
- [x] Found 12 orphaned components — three generations of UI stacked up.
- [x] Confirmed content volume: 368 cards, ~3 weeks of casual use.
- [x] `docs/PRODUCT-V3.md` — diagnosis, IA, card system, gamification, honesty
      rules, content plan.
- [x] `docs/WIREFRAMES-V3.html` — mobile frames for the new IA.
- [x] `.claude/briefs/AG-004-v3-rebuild.md` — Antigravity brief.

**Open / not started:** no application code changed this session, by request.
Two decisions are Adarsh's before Antigravity starts: the product name, and
whether "describe this image" ships as a curated static pack or runtime
generation.

## 2026-09-25 — Product audit after the V3 release (read-only)

Agenda: "Is the product solving its purpose, or does it need improvement?"

- [x] Ran 214 tests (all pass) and the type check (clean); walked all four tabs at 375×812.
- [x] Verdict: habit loop works (endless feed, 1-screen onboarding, honest-ish Speak tab).
      Learning and voice training do not — see below.
- [x] Found: every emoji in 5 files is a literal "?" (encoding damage in a2b84f3).
- [x] Found: nothing writes `db.reviews` — no memory of seen cards, SRS dead, deck rings stuck at 0%.
- [x] Found: a2b84f3 deleted the voice lab (MPT, volume ladder, dB meter, deep session) — the measured
      over-drive problem has no code against it. Spec said keep.
- [x] Found: swipe-left "less of this" is saved but never read; impulse counter has no UI;
      Supabase sync is imported by nothing; explain/teach-back decks are all software engineering.
- [x] Found: PlaybackReview credits a spoken rep + XP for any 2 s attempt, even silence.

**Open:** no code changed. Fix order proposed to Adarsh; awaiting his pick.
- [x] Wrote OpenCode briefs to run in parallel (disjoint files):
      `.claude/briefs/AG-005-usable-app-code.md` (fixes, spaced repetition, voice lab restored,
      live volume + pace on every recording, honest You tab, AI tidy, optional backup) and
      `.claude/briefs/AG-006-usable-app-content.md` (explain/teach-back rewrite, situations deck,
      text scenes, +~270 words/phrases/Hindi/feelings/idioms). Next: Claude does one review pass off both reports.

---

## Session — 2026-09-25 · OpenCode · AG-006 usable-app content slice

**Agenda (brief AG-006, content files only):** replace explain (60) + teach-backs (40),
rewrite describes as 60 text scenes, new 130 situations, +100 words / +60 phrases /
+60 Hindi / +30 feelings / +20 idioms; structural check; staging review report; AG-006 report.

**Done:**
- [x] All 9 content targets hit (579 → 1039 seed cards, 0 duplicate ids): situations 130,
      explain 60, describe 60, teach-backs 40, words +100, phrases +60, Hindi +60,
      feelings +30, idioms +20. `00-exemplars.json` untouched.
- [x] `speak/scripts/content-pipeline/check-seed.mjs` written; PASS on all files and caps.
- [x] Cold read done: 0 dropped, 3 slips fixed (bad phrase id, unclean strong line, mismatched word id).
- [x] `seedLoader.test.ts` 14/14 green with this content (AG-005's updated loader in tree).
      Full `npm test`: 212/215 — 3 failures all outside content slice (assets test asserts ≥1
      describe image; FirstRun/PlaybackReview UI churn from parallel AG-005 edits).
- [x] Staging report overwritten at `speak/src/content/staging/review-report.md` (counts,
      cold-read notes, 15 verbatim sample cards). Report at `.claude/reports/AG-006.md`.
      Nothing committed (per brief; AG-005's code edits share the same working tree).

## 2026-09-26 — Review of AG-005 (code) + AG-006 (content)

- [x] Tests 261/261 (one flaky FeedScreen test fails ~1 in 2 full runs), build green, encoding clean, seed check PASS (1,039 cards).
- [x] Walked fresh install at 375×812: icons fixed, Articulate name, save works, voice lab + drills + weekly check present.
- [x] P0 found: first 24 feed cards repeat once every day (useFeed.ts: first-build effect and refill effect both fire on ready; refill appends `more` when `fresh` is empty).
- [x] Found: every card scrolled past is scheduled as learned (273 in one test day → all due tomorrow).
- [x] Found: AI only reviews recordings; expand_seed / verify_batch / classify_inbox exist server-side, zero callers. Captured notes are never processed. No daily challenge.
- [x] Found: Speak tab = 14 items + jargon (MPT, dB, ≥300 ms, calibrated); You tab repeats one number 3×; "Session loudness target 0dB" is wrong.
- [x] Content review: ~40 cards to fix or drop (placebo "cures", antibiotics advice, hi-chaalu slur, train-door scene, etc.).

- [x] Adarsh approved the next round. Wrote OpenCode brief AG-007 (repeat bug, engaged-only repetition, coach box, daily challenge, simpler Speak + You) and handoff note.
- [ ] Claude: fix ~40 flagged seed cards, commit AG-006 content.

**Open:** v4-usable not merged or deployed (needs Adarsh's yes).

---

## Session — 2026-09-26 · OpenCode · AG-007 coach-challenge-simpler (code slice)

**Agenda (brief `.claude/briefs/AG-007-coach-challenge-simpler.md`, handoff `2026-09-26-ag007-opencode.md`):** stage 1 repeat bug + flaky test · stage 2 engaged-only repetition · stage 3 coach box · stage 4 daily challenge · stage 5 simpler Speak · stage 6 simpler You · stage 7 docs + report. Branch v4-usable, commit per stage, never push. Disjoint with Claude seed-fix slice.

**Done:**
- [x] Stage 1 repeat bug + flaky FeedScreen test — refill guards, 150-card no-dupe hook test, FeedScreen cleanup/waitFor fix (0bc84dd).
- [x] Stage 2 engaged-only repetition — engaged-flag XP, 14-day skim reserve in queue, markEngaged in useFeed + FeedScreen signals (b193e82 + f0375ed).
- [x] Stage 3 coach box — contract §2.1, classify→verify→dedupe pipeline, CoachBox entry, watch in review_recording + local check, queue-jump + try-words (4c66de7 + 984e305).
- [x] Stage 4 daily challenge — deterministic builder, 3 voice-goal branches, measured checks with null→"—", card + result screen (285b69d).
- [x] Stage 5 simpler Speak — Today card + 3 plain-words groups, db reads moved to hook (1aca5ab).
- [x] Stage 6 simpler You — 4 numbers once, 8-week chart with toggle, 0dB line dropped (e7355c8).
- [x] Stage 7 docs + report — PLAN, known-issues (coach/challenge fields local-only, no backup), CLAUDE.md, `.claude/reports/AG-007.md` (0abf023).
- [x] Final: `npm test` 5× 313/313 green, `npm run build` green. One-go run 2026-09-26-0753 COMPLETE 7/7 with per-pass verify records.
- [x] Planning failures named in report §3: useFeed.ts split across passes (needed follow-up f0375ed); stage-3 wirings outside pass-3 slice (follow-up 984e305). Watchdog caught both (stale evidence) and passes 1–2 were re-proven over the final tree.
- [x] Left for Adarsh: real-device check at 375×812 (2-screen fit, 44px targets); v4-usable has 9 AG-007 commits on top of AG-005's 9 — never pushed, not merged (no PENDING-PUSH.md in this project, same as AG-005).

## 2026-09-26 (pm) — "Do your part + write the brief" → already done elsewhere

- [x] Found AG-007 brief + handoff already written by another Claude chat; OpenCode built it (9 commits on v4-usable). Withdrew my overlapping claim; edited no seed/code files.
- [x] Verified AG-007: 313/313 tests, build green, encoding clean. Browser: 60 cards, 0 repeats (bug fixed); coach box saves + honest offline message; daily challenge shows; Speak/You simpler, plain words.
- [x] Flag: a card counts as "engaged" only after 4 s on screen — 6 cards at 3.5 s each earned 1 XP. Streak/XP likely too strict; Adarsh to decide.
- [ ] Still open: ~40 seed-card fixes — held by the other Claude chat's claim, files untouched since 2026-09-25 20:21. Live AI untested (no keys locally, not deployed). Branch not merged or pushed.

## 2026-09-27 — "Where do we stand + what's left + handoff"

- [x] Status: AG-005 + AG-007 done on v4-usable; re-ran 313/313 tests + seed check PASS.
- [x] Found: ~40 content fixes never applied (claiming chat never edited); fix list only lived in a transcript → saved to `.claude/reports/AG-006-content-review.md`.
- [x] Adarsh decided: engaged rule 2 s · fix backup gap before live · stop and ask before push.
- [x] Handoff: `.claude/handoffs/2026-09-27-finish-articulate.md` (Claude Code · Sonnet 5 · High).
- [x] Rated the in-app AI 3/10; Adarsh approved all 3 upgrade steps at once. Wrote `.claude/briefs/AG-008-ai-auto-content.md`.
- [x] Rewrote the handoff as ONE note: finish line → AG-008 → go-live ask (`.claude/handoffs/2026-09-27-finish-articulate.md`).

## 2026-09-28 — Final pass: what's left → one brief for Antigravity

- [x] Checked: nothing moved since 2026-09-27 (no commits; Part A/B/C all open; backup columns still missing; 4 s rule still at FeedScreen.tsx:58).
- [x] Wrote `.claude/briefs/AG-009-final-pass-antigravity.md` — content fixes → 2 s rule → backup gap → AG-008 AI upgrade → proof + report, stop before push.
- [x] Marked the stale 2026-09-26 seed-fix claim ABANDONED; marked the 2026-09-27 handoff SUPERSEDED.
- [ ] Antigravity builds AG-009 → Claude one review pass → Adarsh's yes → merge + push.

## 2026-10-01 — Review pass: is AG-009 (+ AG-008 AI upgrade) done? Ready to push?

- [x] Re-ran myself: `npm test` 420/420 green, `npm run build` green, seed check PASS (1,032 cards).
- [x] All 7 AG-009 items and all 6 AG-008 stages present in code (11 commits, b0b498b → 733e36a).
- [x] Spot-checked AI safety rules in code: verifier must be a different AI than the writer, 25 AI calls/day cap, banned card types, weekly-plan limits — all there.
- [x] Phone-size walk (375×812): onboarding → feed → Browse → Speak → You → coach box; no sideways scroll; coach fails politely offline.
- [x] Small polish found (not blockers): You tab repeats "no session loudness measured yet" twice; coach note buttons "Try again" / "Delete note" have no gap.
- [x] Polish fixes committed (pass 2 of 2): You loudness line shows once, coach-list-actions flex-wrapped with 8px gap.
- [ ] Before go-live: run the 12-line SQL in `.claude/reports/AG-009.md` §5 on Supabase; confirm Netlify keys (Gemini + Groq); one live AI check after deploy.
- [ ] Waiting on Adarsh's yes to push.

## 2026-10-01 — /one-go: finish v4-usable + push (option B)

- [x] One-go run `2026-10-01-1902-finish-v4-usable-for-go` COMPLETE 2/2: You tab loudness line shown once; coach buttons spaced (67032d3); notes committed (8d898ec, ea1f164).
- [x] Tests 420/420 + build + seed PASS (engine-verified). master fast-forwarded to v4-usable and pushed (a2b84f3 → ea1f164); v4-usable pushed too.
- [ ] Found: `https://adarsh-speak.netlify.app` returns "site not found" — the Netlify site was never created (docs/SETUP.md §4). Adarsh: connect the repo in Netlify, add the 4 keys, run the 12-line SQL. Then one live AI check.
