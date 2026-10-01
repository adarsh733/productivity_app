# Active Work Lock

- **Agent:** Antigravity (Sonnet 5) — session 2026-09-28
- **Task:** AG-009 final pass per `.claude/briefs/AG-009-final-pass-antigravity.md`: AG-006 content fixes, 2 s engaged rule, backup gap, then AG-008 stages 1–6. Stop before push.
- **Status:** COMPLETED — claim released 2026-10-01. Report: `.claude/reports/AG-009.md` (plus `.claude/reports/AG-008.md`). 12 commits on v4-usable (b0b498b → 733e36a), never pushed, not merged. Final: 420 tests green ×4, build green, seed check PASS. Owed: 375×812 visual walk, live AI after deploy.
- **Started:** 2026-09-28
- **Files claimed:** `speak/src/**`, `speak/scripts/**`, `speak/netlify/**`, `speak/supabase/schema.sql`, `docs/PLAN.md`, `docs/SETUP.md`, `docs/known-issues.md`, `speak/CLAUDE.md`, `.claude/reports/AG-008.md`, `.claude/reports/AG-009.md`, `.claude/WORKLOG.md`, `.claude/ACTIVE-WORK.md`
- **Note:** Contract (`src/types/contract.ts`) widened only as AG-008 §1 (ClassifyInboxResult.cards) and §5 (Profile.weekPlan) explicitly direct — sanctioned by Adarsh's 2026-09-27 approval. All earlier claims on this page are released/abandoned/withdrawn.

---

- **Agent:** Antigravity (Agentic AI)
- **Task:** Navigation, Architecture, Visual Polish, Accessibility & End-to-End Test Verification
- **Status:** COMPLETED & VERIFIED
- **Started:** 2026-08-26
- **Files Modified / Created:**
  - `src/App.tsx`
  - `src/components/cards/CardFace.tsx`, `CardDetailSheet.tsx`
  - `src/components/browse/BrowseScreen.tsx`, `DeckModal.tsx`
  - `src/components/speak/SpeakScreen.tsx`, `AudioRecorder.tsx`, `PlaybackReview.tsx`, `modes/*.tsx`
  - `src/components/you/YouScreen.tsx`, `BookmarksDrawer.tsx`, `GoalSelector.tsx`, `InterestsManager.tsx`, `WeeklyDots.tsx`
  - `src/components/onboarding/FirstRun.tsx`
  - `src/features/capture/useCapture.ts`
  - `src/features/bookmarks/useBookmarks.ts`
  - `src/features/browse/useBrowse.ts`
  - `src/features/profile/useProfile.ts`
  - `src/features/you/useYou.ts`
  - `src/lib/useModalTrap.ts`
  - `src/styles/*.css` (base, cards, feed, browse, speak, you, onboarding, capture, modal, index)
  - `src/pwa/assets.test.ts`, `public/assets/scenes/*`, `public/icon*`
  - `e2e/flows.spec.ts`, `e2e/screenshots.spec.ts`

---

- **Agent:** Claude (Opus 5.5) — session 2026-09-25
- **Task:** Write OpenCode build briefs after the product audit
- **Status:** COMPLETED — claim released 2026-09-25
- **Started:** 2026-09-25
- **Files claimed:** `.claude/briefs/AG-005-usable-app-code.md`, `.claude/briefs/AG-006-usable-app-content.md`, `.claude/WORKLOG.md`

---

- **Agent:** OpenCode (AG-006 CONTENT slice)
- **Task:** AG-006 usable-app content — seed JSON + staging + content-pipeline only
- **Status:** COMPLETED — claim released 2026-09-25. Report: `.claude/reports/AG-006.md`. Nothing committed.
- **Files claimed:** (released) `speak/src/content/seed/10-words-en.json`, `speak/src/content/seed/12-idioms-corporate.json`, `speak/src/content/seed/17-phrases.json`, `speak/src/content/seed/18-feelings.json`, `speak/src/content/seed/20-hindi.json`, `speak/src/content/seed/21-describe.json`, `speak/src/content/seed/22-explain.json`, `speak/src/content/seed/23-teach-backs.json`, `speak/src/content/seed/24-situations.json`, `speak/src/content/staging/**`, `speak/scripts/content-pipeline/check-seed.mjs`, `.claude/reports/AG-006.md`

---

- **Agent:** OpenCode (AG-005 CODE slice)
- **Task:** AG-005 usable-app code — everything under speak/ EXCEPT content seed/staging/pipeline, plus docs/PLAN.md, docs/PROBLEM-MAP.md, docs/known-issues.md, speak/CLAUDE.md
- **Status:** COMPLETED — claim released 2026-09-25 (branch v4-usable, 9 commits, never pushed)
- **Files claimed:** `speak/src/**` (excluding `speak/src/content/seed/*.json`, `speak/src/content/staging/**`), `speak/scripts/**` (excluding `speak/scripts/content-pipeline/**`), `speak/index.html`, `speak/vite.config.ts`, `speak/netlify/**`, `speak/public/assets/scenes/**` (placeholder cleanup only), `docs/PLAN.md`, `docs/PROBLEM-MAP.md`, `docs/known-issues.md`, `speak/CLAUDE.md`, `.claude/reports/AG-005.md`
- **Note:** Disjoint with AG-006 content slice above. Seed/staging/pipeline never touched; report at `.claude/reports/AG-005.md`.

---

- **Agent:** Claude (Opus 5.5) — session 2026-09-26
- **Task:** Fix ~40 flagged AG-006 seed cards, then commit the content
- **Status:** ABANDONED 2026-09-28 — never edited a file; work moved to `.claude/briefs/AG-009-final-pass-antigravity.md`
- **Started:** 2026-09-26
- **Files claimed:** `speak/src/content/seed/**`, `speak/src/content/staging/**`, `speak/scripts/content-pipeline/**`, `.claude/briefs/AG-007-coach-challenge-simpler.md`, `.claude/handoffs/2026-09-26-ag007-opencode.md`, `.claude/WORKLOG.md`
- **Note:** Runs in parallel with OpenCode AG-007 (all other code under `speak/`). Disjoint.

---

- **Agent:** OpenCode (AG-007 CODE slice — coach box, daily challenge, engaged-only repetition, repeat-bug fix, simpler Speak/You)
- **Task:** AG-007 stages 1→7 on branch v4-usable per `.claude/briefs/AG-007-coach-challenge-simpler.md`
- **Status:** COMPLETED — claim released 2026-09-26. Report: `.claude/reports/AG-007.md`. 9 commits on v4-usable (0bc84dd, b193e82, f0375ed, 4c66de7, 984e305, 285b69d, 1aca5ab, e7355c8, 0abf023), never pushed, not merged. Final: 313 tests green x5, build green.
- **Files claimed:** (released)
- **Files claimed:** `speak/src/**` (excluding `speak/src/content/seed/**`, `speak/src/content/staging/**`), `speak/scripts/**` (excluding `speak/scripts/content-pipeline/**`), `speak/index.html`, `speak/vite.config.ts`, `speak/netlify/**`, `docs/PLAN.md`, `docs/known-issues.md`, `speak/CLAUDE.md`, `.claude/reports/AG-007.md`, `.claude/one-go/plans/ag-007-coach-box-daily*`
---

- **Agent:** OpenCode (AG-007 stage 3 fix-up — coach wiring follow-up)
- **Task:** AG-007 stage 3 integration repair on branch v4-usable: watch + queue-jump + try-words only
- **Status:** COMPLETED — claim released 2026-09-26 (branch v4-usable, commit 984e305, never pushed)
- **Started:** 2026-09-26
- **Files claimed:** `speak/src/features/ai/useAiFeedback.ts`, `speak/src/features/ai/useAiFeedback.test.ts`, `speak/src/components/speak/PlaybackReview.tsx`, `speak/src/features/feed/useFeed.ts`, `speak/src/features/feed/useFeed.test.ts`, `speak/src/features/speak/useModeCards.ts`, `speak/src/components/speak/modes/DescribeMode.tsx`, `speak/src/components/speak/modes/IncidentMode.tsx`, `speak/src/components/speak/modes/SixtySecMode.tsx`, `speak/src/components/speak/modes/ExplainMode.tsx`, `speak/src/components/speak/modes/TeachBackMode.tsx`, `speak/src/components/speak/modes/RapidRepMode.tsx`, `speak/src/components/speak/modes/DescribeMode.test.tsx`
- **Note:** Disjoint with Claude 2026-09-26 seed-fix slice (seed/staging/pipeline/briefs). Never touches `SpeakScreen.tsx`, seed, staging, pipeline, schema, briefs. Explicit `git add` only, never push.

---

- **Agent:** worker build-ag-007-coach-box-daily-stage6-p6
- **Task:** AG-007 stage 6 simpler You tab (4 stats, 1 chart, rows; 0dB-line fix)
- **Status:** COMPLETED — claim released 2026-09-26 (branch v4-usable, commit e7355c8, never pushed)
- **Started:** 2026-09-26
- **Files claimed:** `speak/src/components/you/YouScreen.tsx`, `speak/src/components/you/YouScreen.test.tsx`, `speak/src/features/you/useYou.ts`
- **Note:** Disjoint with Claude 2026-09-26 seed-fix slice. Never touches SpeakScreen.tsx, seed, staging, pipeline, schema, briefs. Explicit `git add` only, never push.

---

- **Agent:** Claude (Opus 5.5) — session 2026-09-26
- **Task:** Content fixes after review, repeat-cards bug, AG-007 brief
- **Status:** WITHDRAWN 2026-09-26 — overlaps the earlier Claude seed-fix claim and the finished AG-007; no files edited
- **Started:** 2026-09-26
- **Files claimed:** `speak/src/content/seed/{10-words-en,12-idioms-corporate,17-phrases,18-feelings,20-hindi,21-describe,22-explain,23-teach-backs,24-situations}.json`, `speak/src/features/feed/useFeed.ts`, `speak/src/features/feed/useFeed.refill.test.ts`, `.claude/briefs/AG-007-coach-and-polish.md`, `.claude/WORKLOG.md`

---

- **Agent:** Claude (Opus 5.5) — session 2026-09-27
- **Task:** Status check + save the AG-006 content fix list + write the finish-line handoff
- **Status:** COMPLETED — claim released 2026-09-27
- **Started:** 2026-09-27
- **Files claimed:** `.claude/reports/AG-006-content-review.md` (new), `.claude/handoffs/2026-09-27-finish-articulate.md` (new), `.claude/WORKLOG.md` (append only)
- **Note:** No overlap. The 2026-09-26 Claude seed-fix claim above is stale (seed files untouched since 2026-09-25 20:21) — left for Adarsh to close; not edited here.

---

- **Agent:** Claude (Opus 5.5) — session 2026-09-27 (2)
- **Task:** One combined handoff: finish line + AG-008 AI auto-content brief
- **Status:** COMPLETED — claim released 2026-09-27
- **Started:** 2026-09-27
- **Files claimed:** `.claude/briefs/AG-008-ai-auto-content.md` (new), `.claude/handoffs/2026-09-27-finish-articulate.md` (rewrite, mine), `.claude/WORKLOG.md` (append)

---

- **Agent:** Claude (Opus 5.5) — session 2026-10-01
- **Task:** Review pass of AG-009 / AG-008 before push (read-only + WORKLOG append)
- **Status:** COMPLETED — claim released 2026-10-01
- **Started:** 2026-10-01
- **Files claimed:** `.claude/WORKLOG.md` (append only)
