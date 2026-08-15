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
