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

## AG-009 (2026-10-01) — owed, not blocked

- **375×812 visual walk still owed.** The proof pass walked the preview
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
