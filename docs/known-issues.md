# Known issues

Things found, judged not worth a round trip, and deliberately left. Reviewed each
time a phase closes. Nothing here blocks a phase.

Opened 2026-08-12 at the close of Phase 0.5.

---

## P2 — Hindi reps are not persisted

`HindiScreen` advances a local index and increments a local counter. It never
writes a review, an event or a day record, so Hindi practice earns no SRS
scheduling, no streak credit and no history — and the "N today" counter resets
whenever the tab is unmounted.

**Pre-existing**, not introduced by AG-002: the previous carousel did not persist
either, and the AG-002 brief scoped Hindi to "endless queue instead of a dead
end", which was delivered.

**Why left:** the fix is a Hindi queue in the logic layer plus a decision about
whether Hindi should feed the same streak as English. That is product work, not
UI work, and it belongs with M24 in Phase 3 when the Hindi section is properly
specified.

---

## P2 — one adjacent same-type pair per ~45 cards

Walking 45 endless cards produced a single instance of two cards of the same type
in a row. It is the chunk-refill seam: each 24-card chunk is built without
knowledge of the one before it, and `useFeed` rotates the incoming chunk only
when the very first card matches the outgoing tail.

**Why left:** one repeat in 45 is not a felt defect, the queue tests cover the
in-chunk case, and tightening the seam means threading the previous tail into
`buildQueue`, which widens a signature in the silent-failure zone for a cosmetic
gain.

---

## P2 — swipe travel is reconstructed from damped state

`useCardGestures` recovers the true finger travel by dividing the damped offset
by the 0.4 damping constant (`dx = dragOffset.x / 0.4`). It works, but the
threshold check now depends on the damping factor — changing one silently
changes the other.

**Why left:** correct today and covered by the gesture acceptance checks. Worth
tidying when the Phase 1 recorder adds its own pointer handling, at which point
raw travel should be tracked in a ref alongside the damped display value.

---

## P2 — the `easy` long-press is pointer-only

Long-press on `Got it` is wired to touch and mouse events. A keyboard user
reaches `again` and `good` but has no path to `easy` or `hard`.

**Why left:** the target device is an iPhone home-screen PWA. Worth revisiting
only if the app is ever used on a desktop in earnest.

---

## ~~P1 — breath instructions are still too long to read while breathing~~ — CLOSED 2026-08-13

Fixed with the Phase 1 breath rewrite. The deck is now 10 cards, every one at
three or four short lines, and the Lab's own cues are capped at 140 characters
with a test that enforces it (`routine.test.ts`, "keeps every cue short enough
to read mid-drill").

Original entry below.

---

## P1 — breath instructions are still too long to read while breathing

Flagged in the wireframe audit and confirmed by Antigravity in the AG-002 report:
some breath drills have instruction lists that need scrolling. The card renders
correctly (the say-block stays pinned), but reading a five-step list while
holding a breath is not the intended experience.

**Why left:** this is a *content* problem, not a UI one, and the AG-002 brief
explicitly forbade touching the seed JSON. It gets fixed with the Phase 1 breath
rewrite, where four of the eight drills are being retired anyway for training a
ruled-out cause — see `PROBLEM-MAP.md` §6.

---

## AG-007 (2026-09-26) — judged not worth fixing now

- **~~New coach/challenge fields are local-only, not backed up.~~ — CLOSED 2026-09-28 (AG-009 A3).**
  `Review.skippedAt`, `DayRecord.challenge`/`challengeResult`, `InboxItem.kind`/`subject`/`fix`/
  `failReason`/`attempts` (plus `DayRecord.xp`/`spokenReps`, which had the same hole) now have
  columns in `supabase/schema.sql` and map both ways in `speak/src/sync/supabase.ts`, with
  round-trip tests in `speak/src/sync/supabase.test.ts`. Run the AG-009 ALTER block on the live
  project before relying on restore.
- **~~`PlaybackReview.test.tsx` flakes ~1 in full-suite runs, passes solo.~~ — CLOSED 2026-10-01 (90e7339).**
  Extra headroom on the save wait under full-suite load. 420 tests green ×3 in
  the AG-009 proof runs (45 files per run). Same class as AG-005 item 8.

---

## AI fix-all + learning memory (2026-10-29) — owed, not blocked

Fixed the 18 gaps from the AI stress test (kept as `netlify/tests/ai-stress.test.ts`)
and added the learner memory (`src/features/learn/profile.ts`, rulebook 4.1 preference,
4.4 any input, 8.3): his wishes, Ask/chat topics, "This is wrong" on lesson cards,
misses on lesson cards, weak spots (newest first, auto-fixed when he says it right)
all feed top-up, misses, Ask, the evening chat and the weekly plan.

- **Still proven only against mocks.** No AI key exists yet. Make the live calls in
  the go-live guide (step 6) before calling the AI "done".
- **Left to the second AI, not to code:** a Hinglish-sounding example ("do the
  needful") and a chat rewrite that adds a fact. Prompts forbid both; no code check.
- **Groq answer room for Ask is ~1,300 tokens** (Ask prompt ≈ 6,150 tokens on an
  8,000-a-minute free tier). Enough for 3 cards; Ask on Groq is only a fallback.
  Rulebook 8.3 is left out of the Ask slice to stay under the cap (its rule rides in
  `DATA_RULE`). If Ask keeps landing on Groq, move it to a paid tier or Haiku.
- **Budget now counts the check:** coach note, top-up and misses spend 2 calls each
  (generate + check); background work stops when fewer than 12 are left.
- **"Harder" may stretch one level past the open lesson level** (top-up only).

## v8 levels, Know it, topic runs, Ask box (2026-11-10) — owed, not blocked

- **Not committed, not pushed.** Built on `v4-usable` on top of the trim; the
  live site runs the pushed v7 build until Adarsh says push.
- **His look at the new screens.** `docs/redesign-v7/built-know-it.png`,
  `built-ask.png`, `built-ask-reply.png` (faked reply), `built-me-learned-ask.png`,
  `built-tabbar-ask.png`; every Feed / Favorites picture now shows the topic label.
- **Owed for a live run:** the AI keys on Netlify (the Ask box says "The AI is
  not set up yet." without them) and one real `tell_app` reply and one real
  Know-it batch. Every test fakes the model.
- **expand_seed rulebook slice is at 17,970 of its 18,000-character cap**
  (verify_batch 17,502). Any new line in chapters 0-9 that expand_seed carries
  needs a trim elsewhere first, or the rulebook test fails.
- **Know it's "Got it" line is stored, not shown.** Know it just moves to the
  next card (answer 7 = A); the line lands on the card's feedback row and in Me.
- **An Ask reply reaches the Feed when the Feed next opens.** The Feed is not
  mounted while Ask is open, so switching back re-reads levels and topic boosts.
  Edge: send, then switch to Feed before the reply lands, and that one reply
  waits for the next Feed open (or the next refill).
- **Thinking words are mostly "General"** (92 of 97): no thinking topic in the
  fixed 10. Topic runs weigh each topic the same, so General does not flood the
  Feed. Tag notes: `speak/src/content/staging/v8-tags-*.md`.
- **👍 line still says "from the next batch"** (true for the batch; the Feed's
  topic runs pick it up on the next load too). Only Too easy / Too hard say "now".

## v7 trim to Feed · Favorites · Me (2026-11-10) — owed, not blocked

- **Not committed, not pushed.** The live site still runs the pushed v7 build
  (with Ask) until Adarsh looks at the pictures and says push.
- **His look at the new screens.** `docs/redesign-v7/built-favorites.png`,
  `built-favorites-empty.png`, `built-me-home.png`, `built-me-learned.png`,
  `built-me-backup.png`, `built-tabbar-favorites.png`, `built-tabbar-me.png`.
  Feed pictures were re-shot and look the same (the card shown is the day's
  first, so the word differs). Favorites and Me use the plain night background
  (no module glow) when no card fills the screen.
- **Favorites shows module cards only.** Old-style ♡ bookmarks (pre-v7 cards)
  stay in `db.bookmarks` but are not listed. A card un-♡'d in Favorites stays
  on screen with a hollow ♡ (tap again to keep it) until Favorites is opened
  again; then it is gone.
- **"Words and phrases" counts cards seen,** not cards mastered (`db.seen` rows
  for Words + Office phrases). "Cards today" reads `db.days.cardsCompleted`.
- **Kept but unused on purpose:** `features/learn/profile.ts` (v8 reads it),
  `features/auto/plan.ts` (the weekly `plan_week` call is unplugged; `sync`
  imports `VOICE_GOALS`), `components/feed/useCardGestures.ts` (Feed file),
  the old Dexie tables and contract types (his stored data). The old picture
  specs and the 16 v4 screenshots were deleted, not just switched off.
- **Backup row test** now accepts either line: with keys in `speak/.env` Me
  shows the email + password form, without them "Backup is not switched on yet".

## v7 steps 4-6 final review (2026-11-08) — owed, not blocked

- **Backup is built but off: his Supabase keys.** He pastes the Project URL and
  the public (anon) key into `speak/.env` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`), runs `speak/supabase/schema.sql` once (re-runnable;
  its v7 block adds `card_feedback`, `seen_terms`, `saved_reviews` and relaxes
  `events.grade`), and changes the sign-in email to show `{{ .Token }}`
  (`docs/SETUP.md` step 1). Until then Me shows "Backup is not switched on yet".
  Code sign-in, push and restore are proven only against a fake client.
- **AI keys on Netlify.** Still none, so AI batches are proven only with fake
  model replies. `src/features/auto/moduleBatch.walk.test.ts` walks one batch
  through the real phone code and the real Netlify function (writer prompt,
  card checks, check on the other provider, store, backup queue, feed, Wrong
  English re-check); only the two model answers are fake.
- **One live batch.** After the keys: read until a module has fewer than 60
  unseen cards (Stories gets there first, at 41 read), open the app, and check
  that ~30 new cards appear and read well. Unproven live: whether a real writer
  keeps every card inside the 40-word slide cap and the ✗ line rule (bad cards
  are dropped, so a weak writer means a thin batch), and whether a 10-card
  `verify_batch` fits Groq's minute.
- **Card English: 10% read by a person.** The final review read one card in ten
  of every library file and scanned all 1,400 for Indian-English slips. Fixed:
  Small talk at home had no contractions ("I am so sorry", 219 lines → "I'm so
  sorry"); "one small doubt" → "question"; "family function" → "family party";
  "Mom" → "Mum"; three Words example lines. The other 90% are checked by the
  content tests (shape, ✗ line, no Hindi, no repeats), not by eye; his 👎 and
  Wrong English are the backstop.
- **Old picture specs switched off** (answer 9A): `poster`, `screenshots`,
  `v5-learning`, `v5-step1`..`5`, `viewports` each start with a note and
  `test.skip`. Rewrite or delete them if those screens come back.
- **Module pictures are not always the -01 sample card.** With 1,500 cards the
  day's order decides which card comes first, so `v7-glass` shoots the sample
  when it is in the first 20, else the module's first card. Comparing with
  `glass-B-1..4` is by look, not card for card. In the Sunday review picture the
  ♡ is not filled (the test writes the review row straight in, not a save).
- **A stray empty folder `D:\Adarsh\Mission AI\docs\`** sits outside the
  project: earlier `v7-glass` runs from the project folder saved pictures one
  level too high. Fixed (the spec now finds `docs/redesign-v7/` from its own
  file); the empty folder was left for Adarsh to delete.

## v5 final review (2026-10-29) — owed, not blocked

- **Live AI is proven only against mocks.** No AI key is on the Netlify site yet,
  so no real model has been called. Mock-only paths: Ask (`answer_ask` + its
  `verify_batch` check), teach top-up (`expand_seed` type `teach` + check), miss
  siblings, the coach box (`classify_inbox`), `plan_week`, `review_recording`,
  the evening chat (`transcribe` + `coach_chat`). After the three keys are on
  Netlify, make one real call per path: an Ask, a Fix my sentence, one evening
  chat answer, and wait for one top-up (cards appear only if both keys work).
- **Groq's 8,000 tokens a minute.** Groq counts the answer room up front, so
  `answer_ask` (≈5,000-token prompt + 6,144 answer room) was refused on every
  call. Fixed in this review: Groq's `max_tokens` is cut to fit (`groqMaxTokens`)
  and `reasoning_effort: 'low'`. Still unproven live: whether ~2,300 answer
  tokens are enough for 8 cards, and whether a long `verify_batch` (8 teach
  cards) fits. If Groq keeps failing, the check falls to the same provider and
  Ask shows the "needs a second key" line even with two keys set.
- ~~**`viewports.spec.ts` is red (4 of 4)**~~ green again 2026-10-29 (all 4 pass). Old note: **`viewports.spec.ts` is red (4 of 4), outside this review's files.** It does
  not mock `/.netlify/functions/**`, and the v5 top-up now calls `expand_seed`
  on first open; under `npm run dev` there are no functions, so the browser logs
  a 404 and the zero-console-errors check fails. Fix: add the same `page.route`
  mock the step specs use (owner: pass 5).
- **AGENTS.md slips sent back:** `components/ask/AskScreen.tsx` reads `db.asks`
  directly (rule 3; belongs in `useAsk`) · `styles/chat.css` `.chat-good` /
  `.chat-fix` use raw hex (rule 4).
- **🎤 Say mine opens the old say-it drill** (Rapid Rep with the card's try
  prompt) inside the ⚙︎ sheet. It is not the evening-chat recorder, so it gets
  no Whisper pace and no Haiku coaching.
- **Supabase AG-009 ALTER block still not run** on the live project (below).
  v5 tables (asks, weak spots, chats, story bank, lesson progress) are
  phone-only by decision 8A.

---

## AG-009 (2026-10-01) — owed, not blocked

- **375×812 visual walk — mostly done 2026-10-29** by the five v5 step specs
  (pictures in `docs/redesign-v5/built-step*.png`, each checking no sideways
  scroll, 44 px tap targets, zero console errors). Still owed: one walk in
  real iPhone Safari. Original note: the proof pass walked the preview
  structurally (onboarding → feed card advance → You → coach box open/close →
  Speak; zero console errors, seed 1070 cards) but the build environment has no
  visible browser pane — no screenshots, no typed input — so 4-tab
  sideways-scroll, the coach-save plain-line path and console-on-viewport remain
  visually unverified. Do it in Safari before the next phase claims "usable".
- **Live AI unverified until deploy.** Netlify holds the only keys; locally the
  functions server has none. After deploy: one note with two keys (verified card
  or nothing), and one with a single key (one plain You line, nothing generated).

---

## AG-005 (2026-09-25) — judged not worth fixing now

- **Pause-drill keyword alignment is a proxy.** Without word-level timestamps
  from SpeechRecognition, "pause before the key word" is measured as longest
  pause + peak-over-average per rep. Honest and labelled, but not true keyword
  timing. Worth revisiting only with on-device forced alignment.
- **Pace history lives in localStorage, not IndexedDB.** The 5-sample baseline
  heuristic (`articulate.paceSamples.v1`) survives normal use but not profile
  restore. Acceptable: baseline recomputes from new samples within a week.
- **Restored `MptTracker`/`VolumeLadder`/`LiveDbMeter` (parent commit) are
  superseded, not wired.** `WeeklyCheck` + `Drills` replace them using the same
  math. The old files build but nothing imports them; kept as reference, not product.
- **No 375×812 browser walk was possible in this session.** Build + 261 tests
  green, encoding checks pass, but four-tab sideways-scroll and console-error
  verification on a real viewport remains owed before review sign-off.
- **FeedScreen gesture test is a logic replica.** `useCardGestures.test.ts`
  re-implements swipe math with stale thresholds instead of driving the hook.
  Passes, but proves less than it claims. Worth replacing with hook-level tests
  when pointer handling is next touched.
