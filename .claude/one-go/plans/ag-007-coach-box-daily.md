# Plan — ag-007-coach-box-daily (pass 0 reading)

State: sealed

Generated from plan-ag-007-coach-box-daily revision 1

## Passes

| # | What it does | Model | Files it writes | Proven by | Depends on | Part |
|---|---|---|---|---|---|---|
| 1 | Stage 1 repeat-bug fix (refill never runs before first build lands, never appends a card already in queue; stop when no fresh cards) + flaky FeedScreen test fix; hook test serves 150 cards fresh day with zero dupe ids; npm test 5x green; commit AG-007 stage 1 | Sonnet 5 | speak/src/features/feed/useFeed.ts, speak/src/features/feed/useFeed.test.ts, speak/src/components/feed/FeedScreen.test.tsx | npm --prefix speak test | — | — |
| 2 | Stage 2 engaged-only repetition (markEngaged on 4s/flip/save/say-it/grade; engaged first sight stays current; skimmed stays new with skippedAt and 14-day skip in queue; XP and streak count engaged only) | Sonnet 5 | speak/src/features/session/day.ts, speak/src/features/session/day.test.ts, speak/src/srs/queue.ts, speak/src/srs/queue.test.ts, speak/src/components/feed/FeedScreen.tsx | npm --prefix speak test | 1 | — |
| 3 | Stage 3 Tell the coach box (entry on Feed header + You row; save raw, classify_inbox, verify_batch every draft, drop failures, dedupe, source inbox; word 1 WordCard, mistake 2 PhraseCards, topic 2-3 ExplainCards; offline retry max 3; watch in review_recording + local PlaybackReview check; batch removal) | Sonnet 5 | speak/src/types/contract.ts, speak/src/features/inbox/useInbox.ts, speak/src/components/speak/PlaybackReview.tsx, speak/netlify/functions/ai.ts, speak/netlify/functions/ai.test.ts, speak/src/features/coach/**, speak/src/components/you/** | npm --prefix speak test | 2 | — |
| 4 | Stage 4 daily challenge (deterministic buildDailyChallenge per date; voice goal softer/slower/pause_first; stored on DayRecord.challenge; checks reuse speaking numbers with null when unmeasurable; result screen with check marks) | Sonnet 5 | speak/src/features/challenge/**, speak/src/components/speak/** | npm --prefix speak test | 3 | — |
| 5 | Stage 5 simpler Speak tab (Today card with challenge Start + routine row; 3 groups Tell a story / Explain / Quick practice; plain words, no MPT/dB/calibrated/ms/WPM in labels; fits 2 screens at 375x812) | Sonnet 5 | speak/src/components/speak/SpeakScreen.tsx, speak/src/components/speak/SpeakScreen.test.tsx, speak/src/features/speak/** | npm --prefix speak test | 4 | — |
| 6 | Stage 6 simpler You tab (4 numbers once each; 1 chart 8 weeks loudness vs normal with breath-hold toggle; Coach/Saved/Recordings/Settings rows; fix Session loudness target line) | Sonnet 5 | speak/src/components/you/YouScreen.tsx, speak/src/components/you/YouScreen.test.tsx, speak/src/features/you/useYou.ts | npm --prefix speak test | 5 | — |
| 7 | Stage 7 docs plus report (PLAN shipped, known-issues coach-challenge backup gap, CLAUDE What exists, report sections 1-6 with verify lines; release claim) | Haiku 4.5 | docs/PLAN.md, docs/known-issues.md, speak/CLAUDE.md, .claude/reports/** | npm --prefix speak run build | 6 | — |
