# Articulate

A PWA that trains delivery, vocabulary and storytelling — built to be the thing
Adarsh opens instead of Instagram. Installed to the iPhone home screen from
Safari, hosted on Netlify, free at every layer.

Plan of record: `../docs/PLAN.md`. Decisions locked there in §8 are settled —
don't reopen them.

## Where things live

| Path | What |
|---|---|
| `src/types/contract.ts` | **The contract.** Types for everything. Start here. v5 added (additive only): `TeachCard`/`TeachDraft`, `Track`, `CardKind`, `SkillTag`, Ask/chat/weak-spot/story types, AI tasks `answer_ask` + `coach_chat`. |
| `src/App.tsx` + `components/shell/TabBar.tsx` | **v5 shell: Feed · Ask · Me.** Old Browse / Speak / You open from the ⚙︎ on Me via `components/me/OldToolsSheet.tsx`. |
| `components/feed/` + `components/cards/PosterCard.tsx` | Feed with picture story circles and full-size picture cards (2026-10-31): one idea per slide, tap or swipe sideways for slides, swipe up for the next card, right-edge buttons, Again / Got it on the last slide. Old `CardFace` / `TeachCardFace` / `TryCardFace` remain for Browse and detail sheets. |
| `features/cards/` | `slides.ts` turns any card into slides and games (tap the weak word, pick the better reply) using only the card's own words. `art.ts` picks the picture: two per topic, 46 files in `public/art/` (made with Codex, cached offline). `usePosterDeck.ts` holds the current slide. |
| `features/lessons/` + `components/lessons/` | One lesson a day (`rotation.ts`: smalltalk → stories → clearly → words), LessonPlayer, SkillPage ladder (L3-5 locked). |
| `features/skills/trackOf.ts` | Which skill an old card trains (its own `skill` tag, else by type). |
| `features/ask/` + `components/ask/` | Ask tab: local library search, `answer_ask`, check on the other provider, "Add N cards to my feed" (Use → Fix → Try). |
| `features/chat/` + `components/chat/` | Evening chat: record → `transcribe` (word times) → pace + loudness measured on the phone → `coach_chat` (Haiku). Story bank. Opened from Me. |
| `features/me/useMe.ts` + `components/me/` | Me: 3 stats, Saved, weak spots, story bank, chats, things asked, "What the app knows about me" (wishes with Forget, subjects, watched weak spots). |
| `features/learn/profile.ts` | **Learner memory** (meta `learn.profile`): his wishes (Ask `preference`), Ask/chat topics, never-show words, more/less and harder/easier per skill. `learnerContext()` = topics + avoid (+ rejected) + notes + watch list, sent with answer_ask, top-up, misses. |
| `features/coach/pipeline.ts` | `aiPost` (every client AI call; 30 s; throws `AiCallError` with the server's `reason`) and `verifyDrafts` (every AI card checked on a DIFFERENT provider: `exclude` is strict on the server). `needsSecondKey()` expires after 24 h. |
| `features/auto/budget.ts` | 25 AI calls a day, phone-only. Ask = 2, chat turn = 1, coach note / top-up / miss siblings = 2 (generate + check); background work keeps 10 back for Ask. |
| `src/db/db.ts` | Dexie schema. IndexedDB is the read path, always. |
| `src/db/seedLoader.ts` | Loads `src/content/seed/*.json`. Validates, skips bad cards, never throws. Text-only describe scenes allowed. |
| `src/srs/scheduler.ts` | SM-2. Silent-failure zone — covered by tests. Wired: first sight → due tomorrow. |
| `src/srs/queue.ts` | Endless feed queue. Due interleaved ~1 in 3, downweights + interests, Hindi ~1/8, situations ~1/15. |
| `src/features/lab/` | Voice lab: routine data, session runner, MPT test, calibration policy, drills, pace. |
| `src/features/speak/` | Speaking attempts (meter + recognition), pace baseline, per-card prompts, DB-backed mode hooks. |
| `src/features/srs/useReview.ts` | The only place reviews are created/graded. |
| `src/features/**` | State hooks. All logic. Components call these. |
| `src/components/lab/` | Routine runner, drills, weekly check. Styled with `styles/speak.css` + tokens. |
| `src/components/speak/modes/` | Rapid Rep, Story, Situations, Describe, Explain, Teach-back — all DB-backed with "No prompts yet" fallbacks. |
| `src/components/you/` | Voice charts (SVG), recordings, week counters, urges, notes. Every number traces to a query. |
| `src/sync/` | Backup push (outbox on start/hidden/5 min) + restore. Never read during a session. |
| `netlify/functions/ai.ts` | The only path to a model. Gemini `gemini-3.5-flash-lite` → Groq `openai/gpt-oss-120b` → Anthropic `claude-haiku-5-5` (locked order; `coach_chat` starts on Haiku). Tasks: expand_seed (incl. `type: 'teach'`), verify_batch, classify_inbox, review_recording, plan_week, answer_ask, coach_chat. Groq answer room is cut so prompt + answer fit its 8,000 tokens a minute. No key ever in the client. |
| `netlify/rulebook.ts` | Generated from `../docs/AI-RULEBOOK.md` by `scripts/build-rulebook.mjs` (`--check` exits 1 when stale). Each task's system prompt = its rulebook slice + its JSON shape. |
| `netlify/functions/transcribe.ts` | Speech-to-text: Groq `whisper-large-v3-turbo`, word timestamps, 4 MB cap, plain errors. |
| `supabase/schema.sql` | Tables + RLS. `user_id` on everything from day one. |

## What exists (2026-10-29, v5 redesign — built, not yet committed per step)

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

**Endless feed with memory** — cards schedule via SM-2 (first sight returns
tomorrow, dues interleave ~1 in 3, `again` returns within ~10). The streak counts
5 cards viewed OR 1 valid spoken rep (≥2 s with ≥1.5 s voiced). A 30-second day counts.

**Voice lab** — the 12-minute routine (A Release → B straw + transfer → C ladder →
D resonance → E prosody) plus six quick drills, weekly MPT check, and honest
per-recording volume + pace numbers. The mic is never a gate: everything works denied.

## Phase

**v5 (2026-10-29):** all five steps built on `v4-usable`, 705 unit tests, 8 user
flows (`e2e/flows.spec.ts`, rewritten for the new tabs) and the 5 step specs
green. Owed (see `../docs/known-issues.md`, "v5 final review"): the three AI
keys on Netlify and one live call per AI path (everything AI is proven only
against mocks today); the `viewports.spec.ts` AI mock; the Supabase AG-009
ALTER block; Adarsh's look at the step pictures before each step's commit.
`e2e/screenshots.spec.ts` is the old v4 picture test — left unused on purpose
(question 11A); running it overwrites the 16 v4 pictures.

Before that: shipped through AG-009 (2026-10-01): everything AG-007 had, plus the AG-006
content pass with a seed validator, engaged-only repetition now at 2 s on
screen (was 4 s), the backup gap closed (every stored field maps both ways),
and the AG-008 AI upgrade — coach makes every allowed type, learns from misses
and recordings, auto top-up behind a 25-call/day local budget, per-card "This
is wrong" (2 taps ⇒ batch purge), weekly plan with clamped weights and Undo.
Every AI draft is verified on a *different* provider: one key ⇒ nothing
generated, one plain line. Owed: the 375×812 visual walk and live AI
verification after deploy (see `../docs/known-issues.md`).
The microphone is optional and measured everywhere it is used.

Open technical risk carried forward: **live WPM in the old Speak tools depends
on SpeechRecognition** — on iOS it stops on silence, has session limits and
needs the network. When unavailable, WPM shows "—", never an estimate. The v5
evening chat never uses it: pace there comes from Whisper's word timestamps.

## Working rules

See `AGENTS.md` — it applies to every agent including this one.
