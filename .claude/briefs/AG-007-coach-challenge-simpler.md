# AG-007 — Coach box, daily challenge, honest repetition, simpler screens (CODE)

**Written:** 2026-09-26 by Claude, after reviewing AG-005 + AG-006 on branch `v4-usable`.
**Project root:** `D:\Adarsh\Mission AI\Productivity` · **App root:** `speak/`
(Vite + React 18 + TypeScript PWA; `npm test`, `npm run build` from `speak/`).

**Do not stop to ask questions.** Every product decision is made below. If something
is genuinely impossible, skip it, keep going, and say so bluntly in the report.
Work stage by stage in order; commit after each stage (§3).

---

## 0 · Why this round exists

Adarsh (the only user) tested AG-005. Four gaps:

1. **The AI is not the controller.** It only reviews recordings. When he types "I liked
   the word *nuance*" or "I always say *revert back*", it goes into a notes list and
   nothing uses it. He wants to tell the app things and have the app act on them.
2. **No daily challenge.** He wants one small, specific task each morning, built from
   his own words, his own mistakes and his voice weak spot.
3. **Repetition is broken.** (a) Bug: the first 24 cards of the day play twice in a
   row. (b) Flaw: every card he scrolls past counts as "learned", so tomorrow is full
   of cards he never read.
4. **Speak and You are too long and too technical** ("MPT", "dB", "calibrated",
   "≥300 ms"; You shows the same number three times).

**Done means:** he can tell the coach anything and see it turn into verified cards and
feedback; each day has one challenge that is checked with real measurements; no card
repeats unless he asked for it or it is truly due; Speak and You read in plain words
and fit on about two phone screens each.

---

## 1 · Rules (breaking one fails review)

1. Read and obey `AGENTS.md` and `speak/AGENTS.md`. Claim your files in
   `.claude/ACTIVE-WORK.md` before writing; release at the end.
2. **Never show a claim the app did not measure.** If a check cannot be measured (no
   mic, no speech recognition, not calibrated), show "—" with a one-line plain reason.
3. **AI content is never served unverified.** Generate → verify at temperature 0 →
   dedupe → tag → serve. A failed or missing verification means *nothing is added*.
4. **Never show a raw provider error.** Plain sentences only ("AI is unavailable right
   now. Saved — I'll try again when you're online.").
5. The mic is never a gate. Feed, Browse, You and the Coach box work with it denied.
6. UTF-8 without BOM for every file. No PowerShell `Set-Content`/`Out-File` without
   `-Encoding utf8`. Run the encoding check from AG-005 §5 after each stage.
7. Components never import `db`, the scheduler or the queue. Logic lives in hooks and
   pure functions under `src/features/**`.
8. Styling only from `src/styles/tokens.css`. Light theme only. At 375×812: nothing
   scrolls sideways, every button ≥ 44 px.
9. No new npm dependencies.
10. `npm test` and `npm run build` green after every stage. Add tests for all new logic.
11. **Never push.** A push publishes to production.

---

## 2 · File partition

**Claude owns — DO NOT EDIT, DO NOT `git add`:**
`speak/src/content/seed/**`, `speak/src/content/staging/**`,
`speak/scripts/content-pipeline/**`, `speak/supabase/schema.sql`, `.claude/briefs/**`.
Claude is fixing ~40 seed cards in parallel in the same working tree. Seed counts will
change under you — never assert exact seed counts in tests.

**You own everything else under `speak/`**, plus `docs/PLAN.md`,
`docs/known-issues.md`, `speak/CLAUDE.md`, `.claude/reports/AG-007.md`.

New fields in this brief are **local only** (Supabase columns are fixed and
`schema.sql` is Claude's). Do not change what the backup sends; log "new coach and
challenge fields are not backed up yet" in `docs/known-issues.md`.

### 2.1 · Contract additions — add to `src/types/contract.ts` exactly as written

```ts
// ── Coach box ──
export type CoachKind = 'word' | 'mistake' | 'topic' | 'other';

// InboxItem: add these optional fields (the inbox table IS the coach list)
  kind?: CoachKind;
  /** word: the word/phrase he liked. mistake: what he says wrong. topic: the topic. */
  subject?: string;
  /** mistake only: the better version. */
  fix?: string;
  /** Plain-language reason the last processing attempt added nothing. */
  failReason?: string;
  /** Processing attempts so far; stop auto-retrying at 3. */
  attempts?: number;

// AI payloads
export interface ClassifyInboxPayload { text: string }
export interface ClassifyInboxResult {
  kind: CoachKind;
  subject: string;
  fix?: string;
  /** Drafts only — never stored before verify_batch passes. Shapes = WordCard,
   *  PhraseCard, ExplainCard minus CardBase fields (id, lang, tags, source, status, createdAt). */
  cards: Array<
    | Omit<WordCard, keyof CardBase> & { type: 'word' }
    | Omit<PhraseCard, keyof CardBase> & { type: 'phrase' }
    | Omit<ExplainCard, keyof CardBase> & { type: 'explain' }
  >;
}
export interface VerifyBatchPayload { items: Array<{ key: string; card: unknown }> }
export interface VerifyBatchResult { results: Array<{ key: string; ok: boolean; reason: string }> }

// review_recording payload: add
  /** His known mistakes. Feedback must check for these first. Max 10. */
  watch?: Array<{ wrong: string; right: string }>;

// ── Repetition ──
// Review: add
  /** Set when he scrolled past a new card without engaging. Not "learned". */
  skippedAt?: Millis;

// ── Daily challenge ──
export type VoiceGoal = 'softer' | 'slower' | 'pause_first';
export interface DailyChallenge {
  date: DayKey;
  title: string;                 // plain words, ≤ 70 chars
  situationCardId?: string;      // what to talk about
  useWord?: string;              // one of his coach words, else a word card he engaged with
  avoidPhrase?: string;          // one of his coach mistakes (the "wrong" side)
  voiceGoal: VoiceGoal;
  targetSec: 30 | 45 | 60;
}
export interface ChallengeResult {
  recordingId: string;
  longEnough: boolean;
  /** null = could not check (no speech recognition) — show "—", never guess. */
  usedWord: boolean | null;
  avoidedPhrase: boolean | null;
  voiceGoalMet: boolean | null;
  done: boolean;                 // longEnough && voiceGoalMet !== false && usedWord !== false && avoidedPhrase !== false
}
// DayRecord: add
  challenge?: DailyChallenge;
  challengeResult?: ChallengeResult;
```

---

## 3 · Git

Stay on branch `v4-usable`. Commit at the end of each stage with
`git add <explicit paths>` only — **never `git add -A` / `git add .`** (Claude's seed
edits are in the same tree). Message: `AG-007 stage N: <what>`. If git reports
`index.lock`, wait a few seconds and retry. Never push, never rewrite history.

---

## 4 · Stages

### Stage 1 — Repeat bug + flaky test
- **Cause (verified):** `src/features/feed/useFeed.ts:133` builds the first 24 cards and
  the refill effect at `:318` fires in the same render (queue still empty), builds the
  same 24, and the fallback at `:328` (`fresh.length > 0 ? fresh : more`) appends them
  again. Fix: the refill never runs before the first build lands, and never appends a
  card already present in the queue. If there are truly no fresh cards left, stop
  refilling (show the existing "you're all caught up" state if one exists; else add one).
- Fix the flaky FeedScreen test (fails about 1 in 2 full runs; see also
  `.claude/reports/AG-005.md` item 8). Run `npm test` 5× — all 5 green.
- **Accept:** a hook test that serves 150 cards on a fresh day with no grades finds
  zero duplicate ids; the only way a card repeats the same day is "Show again soon".

### Stage 2 — Only engaged cards come back
- A new card is **engaged** if any of: ≥ 4 s on screen, opened/flipped/detail, saved,
  spoken ("say it" rep), or graded. Add `markEngaged(cardId)` to `useFeed`; FeedScreen
  calls it on those actions.
- Engaged first sight → current behaviour (review graded `good`, due tomorrow).
- Skimmed first sight → review stays `new`, `reps: 0`, `lastSeenAt` + `skippedAt` = now.
  `queue.ts` does not serve it as new again for 14 days.
- XP and "cards today" count **engaged** cards only; the streak rule ("5 cards")
  counts engaged cards. Update any copy that says "viewed" to match.
- **Accept:** tests for engaged vs skimmed scheduling, the 14-day skip, and XP.

### Stage 3 — "Tell the coach" box
Replaces the capture sheet and the notes list (one-time idempotent copy of existing
`notes` rows into `inbox` as `raw`, id `note-<id>`; then stop writing `notes`).
- **Entry:** a clear button on the Feed header and a row in You. One text field, a mic
  button for dictation (only if `SpeechRecognition` exists), and three starter chips:
  "A word I liked: …", "I keep saying: …", "I'm curious about: …".
- **Pipeline** (`src/features/coach/`): save as `raw` → call `classify_inbox` →
  run **every** draft through `verify_batch` → drop failures → dedupe against existing
  cards (same `term` / `weak` / `topic`+`angle`, case-insensitive) → store as
  `source: 'inbox'`, `status: 'active'`, `seedId` = inbox id, `batchId` = `coach-<inboxId>`,
  tags `['coach', kind]` → inbox `processed` with `generatedCardIds`.
  - word → 1 WordCard. mistake → 2 PhraseCards (weak = his wrong phrase). topic → 2–3
    ExplainCards with `primer`.
  - On failure/offline/no keys: keep `raw`, set `failReason` (plain words), retry on
    app open, max 3 attempts, then show "Couldn't add cards — tap to try again".
- **Server** (`netlify/functions/ai.ts`): strict output validation for
  `classify_inbox` and `verify_batch` (same style as `review_recording`). Extend the
  `verify_batch` system prompt: also reject any claim that is contested, outdated,
  medically/legally risky, or not well established; reject slurs or words with an
  offensive second meaning. Keep the provider order and quote check. `ai.test.ts` covers both.
- **Using it:**
  - Coach words: new coach cards jump the queue (within the first 10 cards of the next
    feed session). Speaking modes add up to 2 of his words to the prompt as "Try to use: …".
  - Coach mistakes: sent as `watch` in every `review_recording` call; the system prompt
    says the correction must address a watched phrase if the transcript contains it.
    Also a **local, no-AI check** in PlaybackReview: if the transcript contains a
    wrong phrase (case-insensitive, word boundaries), show "You said '…' — try '…'".
  - Topics: ExplainCards appear in the feed and in "Explain an idea".
- **Removing:** thumbs-down on a coach card → `status: 'rejected'`. In the coach list,
  each note shows what it made ("Added 2 cards") with "Remove these cards" (rejects the
  batch) and "Delete note" (discards note, rejects its cards, drops it from `watch`).
- **Accept:** tests with mocked `fetch`: happy path, verify rejects one draft, dedupe,
  offline retry cap, batch removal, local mistake detection.

### Stage 4 — Daily challenge
- Pure function `buildDailyChallenge(date, inputs)` in `src/features/challenge/`,
  deterministic per date (seed from the date). Inputs: coach words, coach mistakes,
  recent engaged word cards, situation cards, voice data.
- **Voice goal:** calibrated and last-7-days average loudness above his normal →
  `softer`; else pace baseline exists and recent WPM above target → `slower`; else
  `pause_first`. Titles in plain words, e.g. "Use *nuance* in a 45-second update — keep it soft".
- Generated once per day on first open, stored on `DayRecord.challenge`.
- **Checks** after the recording (reuse `useSpeakingAttempt` numbers): long enough =
  counted rep and ≥ 80% of `targetSec`; word/phrase via transcript (null if no
  transcript); softer = average ≥ 3 dB below his normal; slower = WPM ≤ baseline − 5%;
  pause_first = at least 2 pauses of a third of a second or more. Unmeasurable → null → "—".
- Result screen lists each check with ✓ / ✗ / — and one plain line of why.
- **Accept:** tests for determinism, each voice-goal branch, each check, null handling.

### Stage 5 — Simpler Speak tab
- Top: one **"Today"** card — the challenge (big Start button, ✓ when done) and the
  12-minute voice routine row (✓ when done).
- Below, three groups, each a title + one line + its items:
  **Tell a story** (Situations, 60-second story, Describe) ·
  **Explain** (Explain an idea, Teach it back) ·
  **Quick practice** (Rapid rep, the 6 voice drills, weekly breath test).
- **Plain words everywhere in the UI** (labels and help text, not variable names):
  "MPT" → "breath-hold test" · "dB" in labels → "softer/louder than your normal" (the
  number may stay in a detail line, e.g. "4 dB softer") · "calibrate(d)" → "set your
  normal voice" · "≥300 ms" → "a short pause (about a third of a second)" ·
  "WPM" → "words per minute" · "XP" stays.
- **Accept:** at 375×812 the Today card and all three group titles fit in the first
  two screens; a test renders Speak and finds none of "MPT", "calibrat", " ms", "dB" in
  its labels or help text.

### Stage 6 — Simpler You tab
- Four numbers, each shown **once**: day streak · cards learned (reviews with reps ≥ 1)
  · minutes spoken this week · voice (loudness vs normal this week, or "—").
- One chart: last 8 weeks, loudness vs his normal; a toggle switches to breath-hold seconds.
- Then rows: Coach (my words, my mistakes, my topics) · Saved cards · Recordings ·
  Settings (goal, interests).
- Fix the wrong "Session loudness target 0dB" line (his target is 6–8 dB softer than
  his normal; show it in plain words or drop it).
- **Accept:** no number appears twice; every number traces to a query (test it).

### Stage 7 — Docs + report
Update `speak/CLAUDE.md` "What exists", `docs/PLAN.md` (what shipped), and
`docs/known-issues.md`. Write the report (§5). Release your claim.

---

## 5 · Report — `.claude/reports/AG-007.md`

1. Files changed, one line each. 2. Each stage's acceptance: met / not met + **how
verified**. 3. Deviations and why. 4. **Couldn't do / uncertain** — blunt. 5. Anything
broken you saw but left alone. 6. Final `npm test` (5 runs) and `npm run build` output lines.
