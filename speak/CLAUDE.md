# Articulate

A PWA that trains delivery, vocabulary and storytelling — built to be the thing
Adarsh opens instead of Instagram. Installed to the iPhone home screen from
Safari, hosted on Netlify, free at every layer.

Plan of record: `../docs/PLAN.md`. Decisions locked there in §8 are settled —
don't reopen them.

## Where things live

| Path | What |
|---|---|
| `src/types/contract.ts` | **The contract.** Types for everything. Start here. Now includes `situation` cards. |
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
| `netlify/functions/ai.ts` | The only path to a model. Gemini → Groq → Anthropic (haiku-4-5 last). Feedback + classify/verify/expand + plan_week; no key ever in the client. |
| `supabase/schema.sql` | Tables + RLS. `user_id` on everything from day one. |

## What exists (2026-10-01, AG-009)

Endless feed with SRS (first sight schedules tomorrow, due gets "Show again soon"/"Knew it", `again` requeues within ~10) plus repeat-bug refill guards and engaged-only repetition — engaged now means 2 s on screen (was 4 s) — with XP gate, 14-day skim skip and `markEngaged` signals; content passes the AG-006 review with a seed validator (`scripts/content-pipeline/check-seed.mjs`). Coach box turns Capture dumps into verified cards: every draft is verified on a *different* provider than its generator (one key ⇒ nothing generated, one plain You line), with mistake watch-list, coach queue-jump, try-words wiring, learning from AI-checked recordings, auto top-up behind a 25-call/day local budget, and per-card "This is wrong" (2 taps ⇒ batch purge). Weekly `plan_week` proposes type weights + focus words, clamped in code, shown as one Speak line with Undo. Simpler Speak (Today card + 3 plain-words groups) and simpler You (4 stats, 8-week chart, rows), daily challenge (Today card, 30/45/60 s, use-word + avoid-phrase + voice-goal checks with honest nulls), 12-minute voice routine with pause/resume and transfer enforcement, six quick drills with live meters, weekly MPT check saving VoiceSamples, every recording training volume + pace with honest numbers, DB-backed speaking modes, tidy AI proxy with quote check, silent Supabase backup — every field mapped both ways. Breath cards stay out of feed/Browse; their drills live in the routine.

## The two mechanics that matter

**Endless feed with memory** — cards schedule via SM-2 (first sight returns
tomorrow, dues interleave ~1 in 3, `again` returns within ~10). The streak counts
5 cards viewed OR 1 valid spoken rep (≥2 s with ≥1.5 s voiced). A 30-second day counts.

**Voice lab** — the 12-minute routine (A Release → B straw + transfer → C ladder →
D resonance → E prosody) plus six quick drills, weekly MPT check, and honest
per-recording volume + pace numbers. The mic is never a gate: everything works denied.

## Phase

Shipped through AG-009 (2026-10-01): everything AG-007 had, plus the AG-006
content pass with a seed validator, engaged-only repetition now at 2 s on
screen (was 4 s), the backup gap closed (every stored field maps both ways),
and the AG-008 AI upgrade — coach makes every allowed type, learns from misses
and recordings, auto top-up behind a 25-call/day local budget, per-card "This
is wrong" (2 taps ⇒ batch purge), weekly plan with clamped weights and Undo.
Every AI draft is verified on a *different* provider: one key ⇒ nothing
generated, one plain line. Owed: the 375×812 visual walk and live AI
verification after deploy (see `../docs/known-issues.md`).
The microphone is optional and measured everywhere it is used.

Open technical risk carried forward: **live WPM depends on
SpeechRecognition** — on iOS it stops on silence, has session limits and needs
the network. When unavailable, WPM shows "—", never an estimate.

## Working rules

See `AGENTS.md` — it applies to every agent including this one.
