# Finish Articulate: Content Fixes, 2 s Rule, Backup Gap, AG-008 AI Auto-Content
State: draft

## What "done" looks like
Every AG-006 content fix applied and seed-checked, the engaged rule at 2 s, the Supabase backup-gap columns added and wired both directions with tests, AG-008 stages 1–6 built and committed — then tests ×3 + build green, and a stop: the go-live SQL block and env checklist handed to Adarsh for his yes before any merge/push.

## What I read before asking
| File | Why it mattered |
|---|---|
| `.claude/handoffs/2026-09-27-finish-articulate.md` | The job spec — §4 ordered actions, §3 locked decisions (2 s rule, backup gap first, push only after yes), §5 do-NOTs (no re-review, no push, no new deps, UTF-8 no BOM) |
| `.claude/briefs/AG-008-ai-auto-content.md` | Part B spec — 6 stages, §0 binding rules (verifier ≠ generator, AI never touches voice/breath/Hindi feed, clamps in code, free-tier caps 25 calls/day), read-first list, proof = npm test ×3 + build + check-seed + browser walk |
| `.claude/reports/AG-006-content-review.md` | Part A item 1 — 37 numbered fixes + 2 duplicate pairs across seed files 10/17/18/20/21/22/23/24, plus optional Balance polish; done = check-seed PASS + npm test green |
| `speak/AGENTS.md` | Write rules for everything in speak/ — claim protocol, contract.ts must not change (conflicts with AG-008 widening — question), components never touch db, tokens.css styling, UTF-8, commit only when told, never push |
| `speak/src/components/feed/FeedScreen.tsx` | 2 s rule target — line 58 `setTimeout(..., 4000)` → 2000; comments at lines 39 and 55 also say "4 s"; markEngaged wired via optional hook call |
| `speak/src/features/session/day.ts` | Line 45 area = `applyCardView` doc comment (engaged-views rule); handoff says fix a comment here + any 4 s test; no literal "4 s" in this file — the 4 s references live in FeedScreen + tests (grep needed) |
| `speak/supabase/schema.sql` | Backup-gap target — `reviews`, `days`, `inbox` tables need `add column if not exists` ALTERs; pattern already established (profile/days Phase-1 ALTERs at lines 26–30, 143–144); RLS loop table list may need no change (no new tables) |
| `speak/src/sync/supabase.ts` | `reviewRow` (~191), `dayRow` (~216), `inboxRow` (~250) omit the AG-007 fields; restore() (~264) must map them back; NOTE: `dayRow` also omits `xp`/`spokenReps` and restore() never pulls `cards` at all — wider than the handoff's list (open question) |
| `docs/known-issues.md` | ~92: the AG-007 backup-gap entry being closed; also AG-005 "no 375×812 browser walk" debt — the Part C walk pays it; AG-008 stage 6 updates this file |
| `speak/src/features/feed/useFeed.ts` (grep) | Line 51 comment says "≥ 4 s on screen" — second comment to fix with the 2 s rule (not named in the handoff, found by grep) |
| `speak/src/types/contract.ts` | AG-008's main edit surface — `ClassifyInboxResult.cards` (~474) currently word/phrase/explain only; `AiTask` needs `plan_week`; `Profile` needs `weekPlan`; header says changes need a decision recorded in docs/PLAN.md; `Review.skippedAt`/`DayRecord.challenge`/`InboxItem.kind…` already exist in the contract (only backup missing) |
| `speak/netlify/functions/ai.ts` | Stage 1 widens `validateClassifyDraft` (word/phrase/explain today) to 11 types; stage 5 adds `plan_week` to ALLOWED_TASKS/TASK_CONFIG/validator; `prefer` field exists for verifier≠generator; keys: GEMINI/GROQ/ANTHROPIC_API_KEY |
| `speak/src/features/coach/pipeline.ts` | `dedupeDrafts` keys (term/weak/topic‖angle) need a key per new type (stage 1); `draftsToCards` is generic; `aiPost` does not pass `prefer` or return provider — verifier≠generator needs it here; stage 2 hooks near the `again` path; `removeCoachBatch` pattern reused by stage 4 |
| `speak/src/features/feed/useFeed.ts` (full) | Line ~326 `again && requeueNow` is the stage-2 miss-hook site the brief names; `advanceCard` consumes `engagedIdsRef`; `typeWeights` read from `profileRef` at queue build |
| `speak/src/srs/scheduler.ts` | `grade(again)` → `lapses+1`, `requeueNow: true` — stage 2's "2nd lifetime `again`" = `lapses >= 2` after grading; hook site for miss→siblings |
| `speak/src/srs/queue.ts` | `getCardMultiplier` already applies `typeWeights` (stage 5's "queue reads the weights" is a merge question, not new plumbing); stale note at ~77 says skippedAt is not in the contract (it now is) — comment debt only |
| `speak/src/features/challenge/buildDailyChallenge.ts` | Stage 5 clamps `challengeFocus` to the existing `VoiceGoal` branches ('softer'/'slower'/'pause_first' via `pickVoiceGoal`) and feeds `focusWords` via `coachWords`; `ensureChallengeOnDay` persists on the day record |
| `speak/src/db/db.ts` | No `meta`/settings table exists — stage 3's daily AI budget counter needs either a new Dexie v5 `meta` store or a Profile field (brief says pick one + document); outbox tables list is closed — a meta table must NOT join the outbox |
| `speak/CLAUDE.md` | Read-first per AG-008; "What exists (AG-007)" section = stage 6 docs update target; confirms plan of record is `../docs/PLAN.md` with §8 locked decisions; confirms coach/challenge fields local-only (known-issues link) |
| `docs/PLAN.md` | Plan of record — §8 locked decisions (22: Hindi ~1/8 in feed; 25: no canned AI fallbacks), §9 changelog is where the AG-008 contract-change decision must be recorded (stage 6), §6 expansion-loop gate matches AG-008's verify-cold rule; AG-007 changelog row is the pattern for the AG-008 row |
| `docs/SETUP.md` | Stage 6 edit target — Groq is currently step 3 "backup provider"; AG-008 makes it required for auto-cards (reword); confirms Netlify env table (GEMINI/GROQ no `VITE_` prefix, Supabase pair with) = the step-6 env checklist; confirms remote is github.com/adarsh733/productivity_app branch `master` (merge target) |
| `speak/scripts/content-pipeline/check-seed.mjs` | The Part A proof gate — validates 14 card types, duplicate-id detection across files, beats=3, example word caps, situation/describe/explain caps; `node scripts/content-pipeline/check-seed.mjs` must print PASS; 00-exemplars.json is skipped (never edited) |
| `speak/src/content/seed/24-situations.json` | Confirmed both duplicate pairs exist and are near-twins, not byte-dupes: 06 "presentation that froze" (work) ≈ 22 "demo that broke live" (office); 15 "last-over finish" (cricket) ≈ 29 "match I almost skipped" (sport) — which of each pair to keep is a question; AG-006 items 33–35 also touch this file |
| `speak/src/content/seed/22-explain.json` | AG-006 items 1–11 — all 16 flagged ids verified present (incl. exp-stereotype-threat to DROP, 10 major rewrites, 6 minor wording fixes); check-seed enforces primer ≤300 chars |
| `speak/src/content/seed/17-phrases.json` | AG-006 items 12–18 — all 10 flagged ids verified (4 DROPS: phr-years-back, phr-keep-fast, phr-ate-my-lunch, phr-needful-done); Balance section flags 5 mislabeled `register:"office"` phrase cards here |
| `speak/src/content/seed/20-hindi.json` | AG-006 items 19–23 — all 8 flagged ids verified (hi-chaalu meaning+warning fix, 3 example rewrites, 4 small fixes); Hindi fixes must respect locked decision 2/22 (Hindi section only) |
| `speak/src/content/seed/18-feelings.json` | AG-006 items 24–26 — all 4 flagged ids verified (feel-frazzled, feel-itchy retitle-or-drop, feel-light/feel-heavy wording) |
| `speak/src/content/seed/10-words-en.json` | AG-006 items 27–31 — 7 of 8 ids verified; report's "w-shortcut" is actually id `w-shortcut-w` (report id typo to note in the pass brief); no "note" field exists on word cards — item 30's "add a note" needs a home (meaning suffix vs new field) |
| `speak/src/content/seed/21-describe.json` | AG-006 items 32 + 34 — dsc-local-train-door (safety rewrite), dsc-office-friday-evening, dsc-monsoon-jam vocab swaps, all verified present; check-seed: describe needs imagePath or scene ≤280 chars, targetVocab 3–5 |
| `speak/src/content/seed/23-teach-backs.json` | AG-006 items 36–37 — both flagged ids verified (tb-active-recall, tb-anger-pause pop-psych numbers removed) |
| `speak/src/components/speak/PlaybackReview.tsx` | Stage 2 recording→watch-list site — `useAiFeedback` at 75–81, `handleGetAiFeedback` at 176 sends review_recording with watch; a returned `mistake` would be saved as an InboxItem here or in the hook; local `findWatchHits` already renders "You said X — try Y" |
| `speak/src/features/ai/useAiFeedback.ts` | Stage 2 edit target — `AiFeedbackResult` + `validateAiFeedback` need optional `mistake:{wrong,right}`; already passes `prefer` and has the fabricated-quote check (locked decision 25 pattern); client-side budget counting (stage 3) hooks this call path too |
| `speak/src/features/challenge/useDailyChallenge.ts` | Stage 5 wiring — `ChallengeInputs` flows into `buildDailyChallenge`; `ensureStoredChallenge` persists on the day + outbox; focusWords would enter via inputs (coachWords), typeWeights via profile |
| `speak/src/App.tsx` | Stage 3 trigger point — `useAppOpen()` at line 15 is the app-open hook top-up rides (30-min gap logic lives there); confirms tab structure and where AI features mount |
| `speak/src/components/speak/SpeakScreen.tsx` | Stage 5 UI site — Today section (~317) under `useDailyChallenge()` (line 193) is where "This week: <note>" + Undo lands; challenge card + result views show the wiring pattern |
| `speak/src/components/cards/CardFace.tsx` | Stage 4 constraint — CardFace is pure presentational (no db, per AGENTS rule 3), so "This is wrong" must arrive as a prop from FeedScreen, not be built here; renders all 14 types exhaustively — stage 1's new auto-card types need NO CardFace changes since they reuse existing Card types |
| `speak/src/components/you/CoachList.tsx` | Stage 4 pattern — `removeBatch`/`deleteNote` from useCoach, already renders `kind`·`subject`·`failReason` per note; a rejected AI batch (2-tap rule) reuses this reject path |
| `speak/package.json` | Proof commands — `npm test` = `vitest run`, `npm run build` = `tsc -b && vite build`; Playwright + jsdom + fake-indexeddb available (browser walk at 375×812 possible with existing devdeps — no new dependencies needed) |
| `.claude/ACTIVE-WORK.md` | Claim protocol — the stale 2026-09-26 Claude "Fix ~40 flagged AG-006 seed cards" row is still IN PROGRESS (handoff §5 says mark it ABANDONED); its claim covers seed/staging/pipeline + briefs/handoffs, so the new run's claim must supersede it; every prior slice here used "disjoint files, explicit git add, never push" |
| `speak/src` test inventory (glob) | 39 test files exist incl. `pipeline.test.ts`, `useFeed.test.ts`, `FeedScreen.test.tsx`, `day.test.ts`, `buildDailyChallenge.test.ts`, `checkChallenge.test.ts`, `useAiFeedback.test.ts`, `aiFunction.test.ts`, `db.test.ts` — each AG-008 stage adds tests alongside these; day.test.ts:172 uses msSpent:4000 (elapsed-time test, not the engagement threshold) |
| git state (branch v4-usable, HEAD 0abf023 AG-007 stage 7) | Working tree holds the UNCOMMITTED AG-006 seed content: 8 modified seed files + NEW untracked 24-situations.json + check-seed.mjs + staging/review-report.md + .claude/ docs (briefs/handoffs/one-go/reports); review fixes NOT yet applied (exp-stereotype-threat + phr-years-back still present); Part A's commit = explicit git add of seed + pipeline files |
| `speak/src/features/ai/aiFunction.test.ts` | Client-side mirror of the Netlify function's ALLOWED_TASKS + TASK_CONFIG — adding `plan_week` (stage 5) must update this test too, or it fails |

## Passes
Runner notes for every pass: work happens on branch `v4-usable` (current); each pass commits its own files with explicit `git add` (handoff §4 "commit after each"); nothing pushes — merge `v4-usable` → `master` + push happens only after Adarsh's yes, outside these passes. Passes sharing a file are strictly ordered by "Depends on"; passes with disjoint file sets may run in parallel.

| # | What it does | Model | Files it writes | Proven by | Depends on |
|---|---|---|---|---|---|
| 1 | Apply all 37 numbered AG-006 review fixes + drop one of each duplicate pair (06/22, 15/29) + 5 register relabels; then commit the AG-006 seed content that is currently sitting uncommitted in the working tree | Sonnet 5 | `speak/src/content/seed/{10-words-en,17-phrases,18-feelings,20-hindi,21-describe,22-explain,23-teach-backs,24-situations}.json` (24-situations.json is untracked-new, gets added) | `node scripts/content-pipeline/check-seed.mjs` prints PASS; spot-greps: dropped ids absent (exp-stereotype-threat, phr-years-back, phr-keep-fast, phr-ate-my-lunch, phr-needful-done, one of 06/22, one of 15/29), rewritten text present; commit created | — |
| 2 | 2 s engaged rule: `setTimeout` 4000 → 2000 at FeedScreen.tsx:58 + fix the "4 s" comments (FeedScreen.tsx:39, :55; the useFeed.ts:51 comment lands in pass 5, which owns that file) + check the day.ts:45 doc comment + any engagement-threshold test | Haiku 4.5 | `speak/src/components/feed/FeedScreen.tsx`, `speak/src/features/session/day.ts` (comment only), `speak/src/components/feed/FeedScreen.test.tsx` (only if it encodes 4000) | `npm test` green (feed + day suites); grep shows no stray "4 s"/`4000` engagement refs outside unrelated audio tests; commit created | — |
| 3 | Backup gap: `add column if not exists` ALTERs in schema.sql (reviews.skipped_at; days.challenge + challenge_result jsonb; inbox.kind/subject/fix/fail_reason/attempts; days.xp + days.spoken_reps — see Q1); wire reviewRow/dayRow/inboxRow + restore() both directions; new mapper tests; update the AG-007 backup-gap entry in known-issues.md | Sonnet 5 | `speak/supabase/schema.sql`, `speak/src/sync/supabase.ts`, `speak/src/sync/supabase.test.ts` (new), `docs/known-issues.md` | New tests: row mappers carry every field out, restore maps every field back; `npm test` + `npm run build` green; commit created | — |
| 4 | AG-008 shared plumbing (stage 1 + the §0 rules): widen `ClassifyInboxResult.cards` to 11 types + Hindi word (lang hi); widen classify_inbox prompt + validator in ai.ts; dedupeDrafts key per type; `aiPost` passes `prefer` and enforces verifier ≠ generator (single provider → generate NOTHING, show "Auto-cards need a second AI key (free Groq key — see SETUP)."); Dexie v5 `meta` table (budget counter + rejected-terms list, never in outbox); `plan_week` task + `Profile.weekPlan` + `InboxItem.origin` contract additions | Opus 5 | `speak/src/types/contract.ts`, `speak/netlify/functions/ai.ts`, `speak/src/features/coach/pipeline.ts`, `speak/src/db/db.ts`, `speak/src/features/ai/aiFunction.test.ts`, `speak/src/features/coach/pipeline.test.ts`, `speak/src/db/db.test.ts`, `speak/src/features/auto/budget.ts` (new), `speak/src/features/auto/budget.test.ts` (new) | Test per new type: draft → verify → card; idiom-typed draft yields idiom card; Hindi draft never enters English feed; verifier-refuses-same-provider test; budget cap 25/day test; `npm test` green; commit created | 1, 2, 3 |
| 5 | AG-008 stage 2: miss → siblings (2nd lifetime `again` → expand_seed → verify → dedupe → store source:'ai', batchId:'miss-<cardId>', seedId; max 5 miss batches/day) via NEW pure `features/auto/misses.ts` hooked near useFeed.ts:326; recording → watch list (optional `mistake:{wrong,right}` in review_recording output → InboxItem kind:'mistake', status:'processed', origin:'recording'; max 1/recording; skip if already watched); fixes the useFeed.ts:51 "4 s" comment left from pass 2 | Sonnet 5 | `speak/src/features/auto/misses.ts` (new), `speak/src/features/auto/misses.test.ts` (new), `speak/src/features/feed/useFeed.ts`, `speak/src/features/feed/useFeed.test.ts`, `speak/src/features/ai/useAiFeedback.ts`, `speak/src/features/ai/useAiFeedback.test.ts`, `speak/src/components/speak/PlaybackReview.tsx`, `speak/src/components/speak/PlaybackReview.test.tsx` | Tests: 2nd-again triggers exactly one expand (AI mocked), 3rd-again adds nothing new, 6th miss batch in a day blocked, mistake extracted → inbox item saved once, already-watched term skipped; `npm test` green; commit created | 4 |
| 6 | AG-008 stage 3: auto top-up — NEW `features/auto/topUp.ts`, runs on app open (useAppOpen), ≤ once per 6 h, online only; per allowed feed type count unseen active; any type < 30 → one batch of 10 via expand_seed; topics = profile.interests + last 20 coach subjects; max 3 top-up batches/day; batchId:'topup-<date>-<type>'; every call goes through the budget counter | Sonnet 5 | `speak/src/features/auto/topUp.ts` (new), `speak/src/features/auto/topUp.test.ts` (new), `speak/src/features/you/useAppOpen.ts` | Tests: counts per type respect FEED_TYPES (see Q11), 6 h throttle, 3/day cap, offline no-op, budget shared with coach/misses; `npm test` green; commit created | 4 |
| 7 | AG-008 stage 4: per-card "This is wrong" on cards with source ai/inbox — 1 tap sets status:'rejected', 2 taps in same batch rejects the batch removeCoachBatch-style; rejected terms go to the do-not-produce list (last 50) that pass 4's plumbing feeds to future expand_seed/classify_inbox prompts | Sonnet 5 | `speak/src/components/feed/FeedScreen.tsx`, `speak/src/components/cards/CardFace.tsx` (optional prop only — stays presentational), `speak/src/components/feed/FeedScreen.test.tsx`, `speak/src/components/cards/CardFace.test.tsx` | Tests: one tap rejects a card, second tap in the same batch rejects all + appends terms to the blocklist, blocklist capped at 50, seed cards show no button; `npm test` green; commit created | 2, 4 |
| 8 | AG-008 stage 5: weekly plan — NEW `features/auto/planWeek.ts` (AiTask plan_week, temp 0.2, input built locally: last-7-days per-type views/again-rate/skips, voice numbers, last 10 coach subjects; output clamped in code into `Profile.weekPlan`); runs on first open after 7 days since last plan; Speak tab "This week: <note>" + Undo (restores previousTypeWeights, clears plan); focusWords → buildDailyChallenge coachWords wiring | Sonnet 5 | `speak/src/features/auto/planWeek.ts` (new), `speak/src/features/auto/planWeek.test.ts` (new), `speak/src/features/challenge/useDailyChallenge.ts`, `speak/src/components/speak/SpeakScreen.tsx`, `speak/src/components/speak/SpeakScreen.test.tsx` | Tests: clamp rules (weights 0.5–1.5 allowed types, challengeFocus one of 3 voice goals else dropped, focusWords ≤5 existing cards, note ≤90 chars), Undo restores previous weights + clears plan, queue applies new weights via getCardMultiplier; `npm test` green; commit created | 4 |
| 9 | AG-008 stage 6: docs + report — docs/PLAN.md status + §9 changelog row recording the AG-008 contract changes (this satisfies AGENTS.md's "decision recorded in PLAN.md" — see Q3); docs/SETUP.md Groq becomes required for auto-cards; speak/CLAUDE.md "What exists"; docs/known-issues.md final state; report at .claude/reports/AG-008.md; also commits the .claude/ briefs/handoffs/one-go docs (see Q7) | Sonnet 5 | `docs/PLAN.md`, `docs/SETUP.md`, `speak/CLAUDE.md`, `docs/known-issues.md`, `.claude/reports/AG-008.md` (new), `.claude/briefs/**`, `.claude/handoffs/**`, `.claude/one-go/**`, `.claude/ACTIVE-WORK.md`, `.claude/WORKLOG.md` | Docs consistent with what shipped (stage list ↔ commits); report covers every stage with its proof; commit created | 4, 5, 6, 7, 8 |
| 10 | Part C + STOP: run `npm test` ×3, `npm run build`, `node scripts/content-pipeline/check-seed.mjs`; browser walk at 375×812 with AI mocked offline (feed, coach, challenge, Speak "This week", reject button, ≥44 px targets, zero console errors); assemble the ONE copy-paste SQL block (all ALTERs from passes 3–4) for the Supabase SQL editor + the Netlify env checklist (GEMINI_API_KEY, GROQ_API_KEY — new/free, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY); then STOP and ask Adarsh for his go-live yes — no merge, no push | Opus 5 | `.claude/reports/AG-008.md` (proof section appended) | Test ×3 transcripts + build log + check-seed PASS + walk evidence in the report; the stop message contains the SQL block and env checklist verbatim; git log shows one commit per pass, nothing pushed | 9 |

## Paths to register before the run
`node scripts/register-add.mjs` does not exist in this repo (verified by workspace search — there is no script registry). New-path registration is therefore covered by the claim protocol: the run's ACTIVE-WORK.md claim row (superseding the stale 2026-09-26 row) lists these paths, and each pass stages them with explicit `git add <paths>`.

| Path | Why | Registered? |
|---|---|---|
| `speak/src/features/auto/budget.ts` + `budget.test.ts` | New file pair, pass 4 — daily AI budget counter + rejected-terms list | No registry script exists; covered by ACTIVE-WORK claim + explicit `git add` in pass 4 |
| `speak/src/features/auto/misses.ts` + `misses.test.ts` | New file pair, pass 5 — stage-2 miss→siblings | Same — `git add` in pass 5 |
| `speak/src/features/auto/topUp.ts` + `topUp.test.ts` | New file pair, pass 6 — stage-3 auto top-up | Same — `git add` in pass 6 |
| `speak/src/features/auto/planWeek.ts` + `planWeek.test.ts` | New file pair, pass 8 — stage-5 weekly plan | Same — `git add` in pass 8 |
| `speak/src/sync/supabase.test.ts` | New test file, pass 3 — no sync test exists today (the backup-gap proof) | Same — `git add` in pass 3 |
| `.claude/reports/AG-008.md` | New report, pass 9 (proof section appended in pass 10) | Same — `git add` in pass 9 |
| `speak/src/content/seed/24-situations.json` | Untracked in git TODAY — if pass 1 doesn't explicitly add it, the AG-006 fixes to items 33–35 never reach the repo | No — explicit `git add` in pass 1 |
| `speak/scripts/content-pipeline/check-seed.mjs` | Untracked in git TODAY — it is the Part A proof gate itself; untracked proof = unprovable run | No — explicit `git add` in pass 1 |

## Open questions

1. **Backup gap — how wide to close it.** The handoff names the lost fields (day xp/spoken_reps, skipped reviews, inbox kind/subject/fix/fail_reason/attempts, days.challenge + challenge_result). The restore side has a second hole: `restore()` never pulls cards back at all.
   Options: (a) fix exactly the named fields, both directions; (b) also add card restore.
   ★ (a) — the named gap is what was reported; card restore is a bigger design change and deserves its own job if wanted.
2. **Where the stage-3 budget counter and rejected-terms list live.**
   Options: (a) new Dexie v5 `meta` table, kept out of the outbox table union; (b) extra fields on Profile.
   ★ (a) — these are device-local counters; Profile is backup-mapped, so putting them there drags them into the backup schema for no benefit.
3. **Contract changes vs AGENTS.md.** AGENTS.md says contract.ts must not change without a decision recorded in docs/PLAN.md. Adarsh approved AG-008 in writing, but PLAN.md has no AG-008 row yet.
   Options: (a) treat the written approval as the decision; pass 9 writes the §9 changelog row; (b) stop after pass 3 and ask again before any contract edit.
   ★ (a) — the approval is already in writing; the changelog row records it where AGENTS.md looks. Flagged here so Adarsh can veto.
4. **`InboxItem.origin` for recording mistakes (stage 2).**
   Options: (a) add `'recording'` to the origin union; (b) reuse the existing `'coach'` origin.
   ★ (a) — a distinct origin keeps CoachList honest and lets stage-4 rejection rules target exactly the ai/inbox sources they were promised.
5. **AG-006 "Balance" section (marked optional in the review report).** ~5 phrase cards are mislabeled register:"office"; idioms lean software ~10/19.
   Options: (a) pass 1 does the 5 register relabels only; (b) also write new non-software idiom cards; (c) skip all of it.
   ★ (a) — relabels are objective fixes; rebalancing means authoring new content, which drifts past "apply the review".
6. **Which duplicate of each near-twin pair to keep.** sit-incident-06 "The presentation that froze" (work, 60 s) vs sit-incident-22 "The demo that broke live" (office, 45 s); sit-incident-15 "The last-over finish" (cricket, 60 s) vs sit-incident-29 "The match I almost skipped" (sport, 45 s).
   Options: (a) keep 06 + 15, drop 22 + 29; (b) keep 22 + 29, drop 06 + 15; (c) keep all four.
   ★ (a) — 06 and 15 are the richer prompts and the cricket flavour is the point of the deck; 22 and 29 read as thinner echoes.
7. **Committing the `.claude/` artifacts** (briefs, handoffs, one-go plan, reports — all currently untracked).
   Options: (a) pass 9 commits them in one docs commit; (b) leave `.claude/` permanently uncommitted; (c) each pass commits its own brief as it lands.
   ★ (a) — one commit keeps history clean and ACTIVE-WORK.md claims point at real commits.
8. **AG-006 report id typo `w-shortcut`.** The actual card id is `w-shortcut-w`.
   Options: (a) apply that item's fix to `w-shortcut-w`; (b) ask which card was meant.
   ★ (a) — it is the only shortcut word card in the deck; intent is unambiguous.
9. **AG-006 item 30 "add a note" to word cards.** Word cards have no note field.
   Options: (a) append the note to the meaning text; (b) add a note field to the word contract + CardFace + backup; (c) skip.
   ★ (a) — one clause written for humans; no contract or backup ripple.
10. **`feel-itchy` — wrong idiom.** The card says "itchy" where the idiom is "itchy feet".
    Options: (a) retitle to "itchy feet"; (b) drop the card; (c) leave it.
    ★ (a) — retitle; the feeling is real and the fix is one word.
11. **Stage-3 top-up counting vs gym-only types.** describe/explain/teach_back never enter the feed.
    Options: (a) top-up counts unseen only across FEED_TYPES; (b) counts all card types.
    ★ (a) — counting gym-only types would starve the real feed; budget.ts documents this in a comment.
12. **Stage-2 mistake cards' visibility.**
    Options: (a) they appear in CoachList like any inbox item (kind 'mistake'); (b) they stay hidden.
    ★ (a) — CoachList already renders kind·subject; visibility is the honest default.
13. **Dexie v4 → v5 upgrade safety.** The bump only adds the `meta` table; no existing data migrates.
    Options: (a) accept the additive upgrade; (b) avoid the version bump by keeping counters on Profile.
    ★ (a) — additive-only upgrades are Dexie's safe case; db.test.ts covers the upgrade path.
14. **Merge mechanics after the go-live yes.**
    Options: (a) Adarsh merges v4-usable → master and pushes; pass 10 only asks; (b) pass 10 merges but does not push; (c) pass 10 merges and pushes.
    ★ (a) — the run stops at the ask; merging is Adarsh's yes put into action.

**Already answered in writing — cited, not re-asked:**
- 2 s engaged rule replaces the ≥4 s rule (handoff §3).
- Backup gap closes before go-live (handoff §3).
- Nothing pushes without Adarsh's yes (handoff §3).
- Each pass commits its own files with explicit `git add`; commit after each pass (handoff §4).
- Stale 2026-09-26 ACTIVE-WORK.md row gets superseded/marked ABANDONED (handoff §5).
- No new dependencies; UTF-8 no BOM (handoff §5).
- Evidence gates: `npm test` ×3, `npm run build`, check-seed PASS, browser walk at 375×812 with AI mocked offline (handoff §5).
- API keys are Adarsh's step, never a pass's — pass 10 hands over a checklist (handoff §7).
- AG-008 stage list, verifier ≠ generator (different provider via `prefer`; single key → generate nothing, show the second-key message), 25 AI calls/day counted locally, max 5 miss-cards/day, max 3 top-up batches/day, plan_week cadence, AI never touches voice-lab/breath/MPT/dB/pace/streak/Hindi main feed, all output clamped in code — all in `.claude/briefs/AG-008/`, approved 2026-09-27.

## Adarsh's answers
(leave empty — the conductor fills this from chat)
