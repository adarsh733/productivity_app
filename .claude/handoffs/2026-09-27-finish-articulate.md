▶ NEXT CHAT — SETUP
Tool:   Claude Code
Model:  Sonnet 5
Effort: High
Why:    Build to fully decided specs — content fixes, backup gap, then the approved AI brief AG-008.

# Handoff — Articulate: finish everything, then go-live ask · 2026-09-27

**SUPERSEDED 2026-09-28** by `.claude/briefs/AG-009-final-pass-antigravity.md` (Antigravity). Do not pick this note up.

## 1. State right now — [REWRITE]
- Proven done: AG-005 + AG-007 on `v4-usable` (18 commits). 2026-09-27: `npm test` 313/313, `check-seed.mjs` PASS (1,039 cards).
- Not started: Part A (content fixes, 2 s rule, backup gap), Part B (AG-008 AI brief), Part C (go-live).
- Branch `v4-usable`, never pushed. Uncommitted: AG-006 seed content + `.claude/` docs.
- Claims: mine released. **Stale:** the 2026-09-26 Claude "Fix ~40 flagged seed cards" row in `.claude/ACTIVE-WORK.md` — never edited a file. Mark it ABANDONED, then claim your files.

## 2. What we did (and why) — [APPEND]
- Saved the content fix list to `.claude/reports/AG-006-content-review.md` (only existed in a transcript).
- Rated the AI 3/10 (reacts only when typed at, 3 card types, no top-up, no learning, same-model checker). Wrote `.claude/briefs/AG-008-ai-auto-content.md` to take it to ~8/10.

## 3. Decisions — do not re-litigate — [REWRITE]
- Engaged rule = 2 s. Backup gap fixed before live. Push only after Adarsh's yes. (Adarsh 2026-09-27)
- AG-008 Steps 1–3 approved in one go; its §0 rules are binding (verifier ≠ generator, no AI in voice lab/breath, clamps in code, free-tier caps).

## 4. Next actions (ordered) — [REWRITE]
**Part A — finish line** (commit after each)
1. Apply every fix in `.claude/reports/AG-006-content-review.md`; drop one of each duplicate pair. Done: `node scripts/content-pipeline/check-seed.mjs` PASS + spot-greps. Commit AG-006 content (explicit `git add`).
2. `speak/src/components/feed/FeedScreen.tsx:58` 4000 → 2000; fix comment `speak/src/features/session/day.ts:45` + any 4 s test.
3. Backup gap (`docs/known-issues.md` ~92): `alter table … add column if not exists` in `speak/supabase/schema.sql` for `reviews.skipped_at`, `days.challenge`/`challenge_result` (jsonb), `inbox.kind/subject/fix/fail_reason/attempts`; wire `reviewRow`/`dayRow`/`inboxRow` in `speak/src/sync/supabase.ts` (~191/216/250) both directions, with tests.

**Part B — AG-008** 
4. Build `.claude/briefs/AG-008-ai-auto-content.md` stages 1→6, commit per stage. Every new field also goes into schema + mappers (same as step 3).

**Part C — go-live ask**
5. `npm test` ×3 + `npm run build` green; walk at 375×812 in the browser pane.
6. **Stop.** Tell Adarsh in plain words what changed, then give him: (a) ONE copy-paste SQL block (all ALTERs from steps 3–4) for the Supabase SQL editor; (b) Netlify env check: `GEMINI_API_KEY`, `GROQ_API_KEY` (new, free), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Ask for his yes, then merge `v4-usable` → `master` and push.

## 5. Do NOT do — [APPEND]
- Don't re-review content from scratch — the list is final. Don't push without his yes. No new dependencies. UTF-8, no BOM.

## 6. Verification — [REWRITE]
- Verified: tests + seed check (2026-09-27).
- NOT verified: any live AI call (needs deploy + keys); real iPhone check (Adarsh).

## 7. Open questions for Adarsh — [REWRITE]
- Keys set in Netlify? Ask at step 6, not before.
