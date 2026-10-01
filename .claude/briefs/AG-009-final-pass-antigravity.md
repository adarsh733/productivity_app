▶ NEXT CHAT — SETUP
Tool:   Antigravity
Model:  Sonnet 5
Effort: High
Why:    Build to fully decided specs — content fixes, 2 s rule, backup gap, then the approved AI brief AG-008.

# AG-009 — Articulate final pass (everything left) · 2026-09-28

Supersedes `.claude/handoffs/2026-09-27-finish-articulate.md` (same work, now for Antigravity).
Project: `D:\Adarsh\Mission AI\Productivity\speak`. Read first: `speak/CLAUDE.md`, `docs/PLAN.md`.

## 1. State right now — [REWRITE]
- Proven done: AG-005 + AG-007 on branch `v4-usable` (18 commits). 2026-09-27: `npm test` 313/313, `check-seed.mjs` PASS (1,039 cards). No commits or edits since.
- Not started: Part A, Part B, Part C below.
- Uncommitted in tree: AG-006 seed content + `.claude/` docs. Branch never pushed.
- Claims: none held. Add your row to `.claude/ACTIVE-WORK.md` before writing.

## 2. What we did (and why) — [APPEND]
- Content fix list saved at `.claude/reports/AG-006-content-review.md` (final — do not re-review).
- AI rated 3/10; `.claude/briefs/AG-008-ai-auto-content.md` takes it to ~8/10 (coach makes every card type, learns from misses, tops itself up, weekly plan).

## 3. Decisions — do not re-litigate — [REWRITE]
- "Engaged" card = 2 s on screen (was 4 s). Backup gap fixed before live. (Adarsh 2026-09-27)
- AG-008 stages 1–6 approved in one go. Its §0 rules outrank everything: verifier ≠ generator, no AI in voice lab/breath/pronounce, clamps in code, 25 AI calls/day.

## 4. Next actions (ordered) — [REWRITE]
Commit after each numbered item, explicit `git add <files>` (never `git add .`).

**Part A — finish line**
1. Apply every fix in `.claude/reports/AG-006-content-review.md`; drop one of each duplicate pair. Done = `node scripts/content-pipeline/check-seed.mjs` PASS. Then commit all AG-006 seed files + `24-situations.json` + `check-seed.mjs`.
2. `src/components/feed/FeedScreen.tsx:58` `4000` → `2000`; fix the 4 s wording in `src/features/session/day.ts` comments and any test that assumes 4 s.
3. Backup gap (`docs/known-issues.md`, "local-only" section): add `alter table … add column if not exists` to `supabase/schema.sql` for `reviews.skipped_at`, `days.challenge` + `days.challenge_result` (jsonb), `inbox.kind/subject/fix/fail_reason/attempts`. Map them both ways in `src/sync/supabase.ts` (`reviewRow` / `dayRow` / `inboxRow` and their readers), with round-trip tests.

**Part B — AI upgrade**
4. Build `.claude/briefs/AG-008-ai-auto-content.md` stages 1 → 6, commit per stage. Every new stored field also goes into schema ALTER + sync mappers (same as item 3).

**Part C — proof, then STOP**
5. `npm test` ×3 green, `npm run build` green, seed check PASS.
6. Write `.claude/reports/AG-009.md`: files changed, each item's "done" met or not, deviations, test output, and ONE copy-paste SQL block with every ALTER from items 3–4.
7. Release your claim, add a WORKLOG block. **Stop. Do not merge, do not push.** Claude does one review pass off `git diff` + your report, then asks Adarsh.

## 5. Do NOT do — [APPEND]
- No push, no merge, no deploy. No new npm packages. UTF-8, no BOM.
- Don't split one file's change across two commits of different stages (AG-007 lesson: follow-ups were needed).
- Don't touch voice lab, breath, MPT, dB/pace targets, streak rules, Hindi-in-main-feed.

## 6. Verification — [REWRITE]
- Verified: tests + seed check (2026-09-27); code pointers in item 2–3 re-checked 2026-09-28.
- NOT verified: any live AI call (needs deploy + keys); real iPhone check (Adarsh).

## 7. Open questions for Adarsh — [REWRITE]
- Netlify keys set? (`GEMINI_API_KEY`, `GROQ_API_KEY` free, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — asked by Claude at go-live, not by Antigravity.
