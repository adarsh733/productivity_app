# AG-008 — AI auto-content: coach for every type, self top-up, weekly plan

**Written:** 2026-09-27 by Claude (Opus 5.5). **Approved:** Adarsh, 2026-09-27 ("finish all of the above at once").
**Branch:** `v4-usable`, on top of the finish-line work (handoff §4 A1–A4). Commit per stage. **Never push.**
**Goal:** the AI moves from "reacts when typed at" (3/10) to "keeps the app stocked and tuned to him" (~8/10) — without ever serving wrong English.

Read first: `speak/CLAUDE.md`, `docs/PLAN.md` (locked decisions), `speak/src/features/coach/pipeline.ts`, `speak/netlify/functions/ai.ts`, `speak/src/types/contract.ts`.

---

## 0. Rules that outrank everything below

1. **Nothing unverified is ever stored as a card.** Generate → verify → dedupe → store. Existing rule, extended to every new path.
2. **Verifier ≠ generator.** `verify_batch` must run on a *different provider* than the one that produced the drafts (use the existing `prefer` field; the AI response already reports `provider`). If only one provider is configured, **generate nothing** — show one plain line in You: "Auto-cards need a second AI key (free Groq key — see SETUP)." No same-provider fallback.
3. **The AI never touches:** Voice Lab routine, breath cards, MPT test, dB/pace targets, streak rules, Hindi in the main feed (Hindi stays in its own section — locked). AI never writes `pronounce`, `say_it`, `breath`, `action_verb` cards.
4. **Every AI output is clamped in code.** Model output is a suggestion; bounds live in TypeScript and are unit-tested.
5. **Free tier.** Hard daily budget (§3) counted locally; over budget ⇒ skip silently, retry tomorrow.
6. Plain words on screen. No raw errors. No new dependencies. UTF-8, no BOM. Every new field goes into the Supabase backup (schema ALTER + `sync/supabase.ts` mappers both directions), like the A4 fix.

---

## 1. Stage 1 — coach makes every allowed type

- Widen `ClassifyInboxResult.cards` (contract.ts ~474) to: `word, swap, idiom, phrase, feeling, story_move, describe (text scene), explain, teach_back, situation`, plus Hindi `word` with `lang: 'hi'` (served only in the Hindi section).
- Update `classify_inbox` prompt + validator in `ai.ts`; `dedupeDrafts` gets a key per new type (term / weak / title — pick the natural unique field; test each).
- `draftsToCards` stays generic. Tags stay `['coach', kind]`.
- **Done when:** a test per type goes draft → verify → card; an idiom typed into the coach yields an idiom card; Hindi coach cards never enter the English feed (test).

## 2. Stage 2 — learn from misses and recordings

- **Miss → siblings:** when a card is graded `again` for the **2nd time** (lifetime), call `expand_seed` for **2** sibling cards (same type, same skill, different wording) → verify (rule 0.2) → dedupe → store with `source: 'ai'`, `batchId: 'miss-<cardId>'`, `seedId: <cardId>`. Max **5** miss batches/day. Hook near `useFeed.ts:326` / `srs/scheduler.ts:62`, logic in a new pure module `features/auto/misses.ts`.
- **Recording → watch list:** extend `review_recording` output with optional `mistake: { wrong, right }` (only when the transcript contains a clear, standard-English error). Save as `InboxItem` `kind: 'mistake'`, `status: 'processed'`, `origin: 'recording'`; it then appears in the coach list (removable) and feeds `getWatchList`. Max 1 per recording, skip if already watched.
- **Done when:** tests cover the 2nd-miss trigger, the daily cap, and recording-mistake dedupe.

## 3. Stage 3 — auto top-up

- New module `features/auto/topUp.ts`, runs on app open, at most once per **6 h**, only when online.
- For each allowed type, count **unseen active** cards. If any type < **30**, pick the lowest one and request **one batch of 10** via `expand_seed`. Topics: `profile.interests` + subjects of the last 20 coach notes. Max **3 top-up batches/day**.
- Store with `source: 'ai'`, `batchId: 'topup-<date>-<type>'`.
- **Budget:** one local counter per day for all AI generation calls (coach + misses + top-up + plan) — cap **25 calls/day**. Stored in Dexie (new `meta` row or existing settings table — pick one, document it).
- **Done when:** tests prove the threshold, the 6-h gate, the daily caps and the offline no-op.

## 4. Stage 4 — per-card "This is wrong"

- On every card with `source` `ai` or `inbox`: a small "This is wrong" action. One tap ⇒ card `status: 'rejected'`. **Two** taps inside the same batch ⇒ `removeCoachBatch`-style reject of the whole batch.
- Rejected cards' terms are passed to future `expand_seed` / `classify_inbox` calls as "do not produce" (last 50).
- **Done when:** tests cover single reject, batch purge on 2nd flag, and the do-not-produce list.

## 5. Stage 5 — weekly coach plan

- New AI task `plan_week`, temperature **0.2**, in `ai.ts` (add to `AiTask`, `TASK_CONFIG`, validator).
- Input (built locally, no raw audio): last 7 days per card type → views, `again` rate, skips; voice numbers (avg dB vs band, pace vs target, latest MPT gap); last 10 coach subjects.
- Output → clamped in code into `Profile.weekPlan = { createdAt, typeWeights, challengeFocus, focusWords, note, previousTypeWeights }`:
  - `typeWeights`: each between **0.5 and 1.5**, only for allowed types; others unchanged.
  - `challengeFocus`: one of the **existing** voice-goal branches in `buildDailyChallenge.ts`, else ignored.
  - `focusWords`: max 5, must already exist as cards; feed them to `buildDailyChallenge` `coachWords`.
  - `note`: ≤ 90 chars, plain words.
- Runs on the first app open after 7 days since the last plan. Speak tab shows one line: "This week: <note>" with **Undo** (restores `previousTypeWeights`, clears plan).
- **Done when:** clamp tests (out-of-range, unknown type, unknown branch, >5 words, long note), undo test, and the queue actually reads the new weights (test via `srs/queue.ts`).

## 6. Stage 6 — docs + report

- `docs/PLAN.md` status paragraph + changelog row; `docs/SETUP.md` adds the free Groq key (`GROQ_API_KEY`) as required for auto-cards; `speak/CLAUDE.md` What exists; `docs/known-issues.md` updated.
- Report `.claude/reports/AG-008.md`: files changed, each stage's check met or not, deviations, what could not be verified live, proof (`npm test` ×3, `npm run build`).

---

## Proof for the whole brief
`npm test` green ×3, `npm run build` green, `check-seed.mjs` PASS, browser pane walk at 375×812 with the AI mocked offline (plain-line messages show, nothing breaks). Live AI is verified only after deploy.
