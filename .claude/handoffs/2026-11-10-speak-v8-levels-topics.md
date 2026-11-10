▶ NEXT CHAT — SETUP
Tool:   Claude Code
Model:  middle level (sonnet)
Effort: Medium
Why:    build to an agreed plan; card tagging is judgement, so check 10% by hand

# Handoff — SPEAK v8: levels, Know it, topics, new Ask box · 2026-11-10

## 1. State right now — [REWRITE]
- Proven done: nothing built. Plan agreed in chat 10 Nov.
- RUNS AFTER the trim job (`2026-11-10-speak-trim-and-glass.md`, see its AMENDED block). Same files (App, TabBar, Me, Feed rail). Do not start while it is open; check `.claude/one-go/board.json`.
- Branch `v4-usable`. Claims released: none held.

## 2. What we did (and why) — [APPEND]
- Found why cards feel basic. Feed ignores `level`: `speak/src/srs/moduleQueue.ts:30-132` (day-hash shuffle `srs/queue.ts:63-70`). "Too easy" only moves `profile.moduleLevels` (`features/learn/useCardFeedback.ts:76-79`), and only AI batches read it. Batches fire only when <60 unseen are left (`features/auto/moduleBatch.ts:43,114-134`), so ~540 Words must be seen first. Start level 2 maps to card level 1 (`netlify/functions/ai.ts:144`). Saved wishes never reach batches (only the switched-off `features/auto/topUp.ts`).
- Levels exist on Words/Office only (L1 363 · L2 364 · L3 173). Small talk, Say it better and Stories have none. Only 117 Words are L3.

## 3. Decisions — do not re-litigate — [REWRITE]
Memory: `speak-v8-difficulty-topics.md`. In short:
- Tabs **Feed · Favorites · Ask · Me**. The trim job builds Feed · Favorites · Me; this job adds the Ask tab.
- **Ask = one AI text box** that listens to his feedback/rants and replies in a line or two. It saves what it learned (wishes, new topics, level moves), shown under Me "What the app learned" with Remove, and steers the feed + next batch at once.
- Feed uses level. Start Words/Office at L2–3. "Know it" (one tap on every card) = too easy: drops easier cards from the queue at once.
- About 10 Know-it in a module → AI batch of 30 harder cards at the FRONT. Fix the start-level map so the start is not card level 1.
- Levels for all 5 modules (one-time tag pass).
- Topic tag on every card, shown as a small label. Fixed start list: Money · Emotions · Work · People · Food · Health · Home · Travel · Senses & weather · General. The AI may add a topic when he asks (via Ask).
- Feed serves **topic runs** (several cards of one topic together; he relates better). Topics he 👍 come up more. 👍 = more like this (topic + level).
- Supersedes the 9 Nov "wait a week, then wave 2" plan.

## 4. Next actions (ordered) — [REWRITE]
1. Tag all 1,500 seed cards with `topic` and, for the 3 untagged modules, `level` (`speak/src/content/seed/50-77-*.json`). Extend `src/db/libraryCheck.ts`. Read 10% by hand. Done when the check passes and every card has both.
2. Add `topic`/`level` to the card types (`src/types/contract.ts:339-400`). AGENTS.md rule 1: contract changes need his yes, and this chat has it.
3. Queue: level filter + topic runs + 👍 weighting in `moduleQueue.ts`. Done when unit tests show L1 skipped at start and runs of the same topic.
4. Know-it button on the card rail, plus the topic label (`components/feed/*`, `useCardFeedback.ts`).
5. Early batches at the front, level map fixed, wishes + topics in the request (`moduleBatch.ts`, `useModuleBatches.ts`, `netlify/functions/ai.ts`, `docs/AI-RULEBOOK.md` §9). Keep the second-AI check.
6. Ask tab: text box → new server task → learned lines → profile. Tab bar 4 tabs, Night glass.
7. Proof as in the trim note (unit ≤2 workers, type checks, rulebook check, browser specs, build, 390x844 pictures of Feed, Favorites, Ask, Me). No push without his yes.

## 5. Do NOT do — [APPEND]
- Don't delete stored tables. Don't add pictures or red text. Don't drop the second-AI check on new cards ([[speak-ai-content-quality-gate]]).

## 6. Verification — [REWRITE]
- Verified: the code facts in §2 (read 10 Nov). NOT verified: anything on his phone.

## 7. Open questions for Adarsh — [REWRITE]
— none.
