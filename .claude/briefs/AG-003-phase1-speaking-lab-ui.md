# ANTIGRAVITY BRIEF — Phase 1 Speaking Lab UI · 2026-08-13 · AG-003

## Read first
`D:\Adarsh\Mission AI\Productivity\speak\AGENTS.md`, then `speak/CLAUDE.md`, then
`docs/PLAN.md` §2 and §4 (modules M8–M11) and `docs/VOICE-PROFILE.md` §6.
Follow the file-claim protocol in `.claude/ACTIVE-WORK.md` before writing.

## Goal

Build the **LAB** surface — the fifth tab, and the only part of this app that
addresses what was actually measured about his voice. Everything behind it is
already written and tested: the routine, the timers, the microphone, the dB
maths, the calibration and the persistence all live in hooks you will call. Your
job is the screen.

Two things drive every judgement call here:

1. **The transfer rep is the product.** Straw work, humming and volume drills
   are the set-up; the 30 seconds where he speaks one ordinary sentence carrying
   that feeling is where the change happens, and it is the step a person skips.
   The hook already refuses to skip it. The screen must make it feel like the
   point rather than like the last item on a list.
2. **He is being asked to speak out loud into a phone.** Every state — mic
   denied, still calibrating, mid-drill — has to stay calm and legible at
   arm's length. No dense text, no modal dialogs, nothing he has to read twice
   while holding a breath.

## Your files (write ONLY these)

- `speak/src/components/lab/LabScreen.tsx` — **new.** The surface. Owns the four
  states: idle, running, finished, and the weekly MPT test.
- `speak/src/components/lab/StepCard.tsx` — **new.** One step: block name, step
  title, the cue, the `feel` line, a countdown, and the actions.
- `speak/src/components/lab/BlockRail.tsx` — **new.** Blocks A–E as five
  segments showing where he is. Same idea as `CoreDots`, five wide.
- `speak/src/components/lab/MicGate.tsx` — **new.** The microphone states.
- `speak/src/components/lab/MptTest.tsx` — **new.** The weekly MPT flow.
- `speak/src/components/studio/LiveDbMeter.tsx` — **rewrite** as a presentational
  component driven entirely by props (see contract below). It currently owns an
  `AudioMeterController` itself; it must not.
- `speak/src/components/shell/TabBar.tsx` — add the LAB tab, **second position**.
- `speak/src/components/shell/Icons.tsx` — add `LabIcon`, matching the existing
  22px drawn line style.
- `speak/src/App.tsx` — mount `LabScreen` on the `lab` tab.
- `speak/src/styles/components.css` — all Lab styling, appended.
- **Delete** `speak/src/components/studio/MptTracker.tsx` — superseded by
  `MptTest.tsx`. Its gap interpretation was inverted and now lives, corrected
  and under test, in `features/lab/calibration.ts`.

## Files Claude owns — DO NOT EDIT

- `speak/src/types/contract.ts`
- `speak/src/db/db.ts`, `speak/src/sync/supabase.ts`, `speak/supabase/schema.sql`
- `speak/src/lib/audioMeter.ts` and its test
- `speak/src/features/lab/**` (`routine.ts`, `calibration.ts`, `useLab.ts`,
  `useMptTest.ts`, and both test files)
- `speak/src/content/seed/**`
- `speak/src/features/feed/**`, `speak/src/srs/**`, `speak/src/features/session/**`
- `speak/src/components/studio/VolumeLadder.tsx` — Phase 2 (M12). Leave it
  unmounted and untouched.
- `speak/src/styles/tokens.css` — the token contract from Phase 0.5. Use the
  variables; do not add or change any.

## The contract (already committed — build to this, don't change it)

### `useLab()` — the daily routine · `speak/src/features/lab/useLab.ts`

```ts
const lab = useLab();

lab.ready            // false until the profile has loaded
lab.blocks           // LabBlock[] — A–E, plus the calibration step in week one
lab.block            // the block the current step belongs to, or null
lab.step             // LabStep | null — title, cue, feel?, durationSec, kind,
                     //   mandatory, metered
lab.stepIndex        // 0-based across the flattened routine
lab.totalSteps
lab.remainingSec     // whole seconds left on this step; floors at 0
lab.progress         // 0..1 through the routine

lab.started / lab.running / lab.finished

lab.micState         // 'idle' | 'requesting' | 'on' | 'denied' | 'unsupported'
lab.db               // number | null — live dBFS. NULL on an unmetered step
lab.percent          // 0..100 for the meter bar
lab.bandStatus       // 'low' | 'target' | 'high'
lab.band             // { minDb, maxDb } — his band, or the placeholder
lab.drift            // 'ok' | 'over' | 'under' — already debounced, see below

lab.calibrated           // boolean
lab.sessionsToCalibrate  // 7 → 0

lab.blockedReason    // string | null — set when skip() refused. Show it.

lab.start()   // async. Requests the mic, then starts the clock
lab.pause() / lab.resume()
lab.next()    // "I did that" — always advances, records the step as completed
lab.skip()    // "move on without doing it" — REFUSES on a mandatory step
lab.finish()  // async, writes the session
lab.abort()   // async, writes it flagged `aborted`
```

**`next` vs `skip` is the whole enforcement mechanism and must not be blurred.**
Render `next` as the primary action ("Done"), and `skip` as a quiet secondary
one. On a step with `mandatory: true`, do not render `skip` at all — calling it
sets `blockedReason` and goes nowhere. A mandatory step's timer reaching zero
does **not** advance; the screen sits there until he taps Done. That is
deliberate. Do not add a fallback timer, an auto-advance or a "skip anyway".

**`lab.drift`** is already debounced over a 2-second window with a 1.5-second
hold, so it will not flicker. Render it directly — do not add your own
smoothing, delay or throttle on top, and do not animate its appearance in a way
that adds further lag. `'over'` is the one that matters: *ease off*.

**`lab.db` is null on unmetered steps.** Blocks C, D and E are timed cues in
Phase 1; their meters arrive with M12 and M16. When `db` is null, hide the
meter entirely rather than showing a dead bar at zero.

### `useMptTest()` — the weekly test · `speak/src/features/lab/useMptTest.ts`

```ts
const mpt = useMptTest();

mpt.ready / mpt.due       // `due` is false for 7 days after the last test
mpt.step / mpt.stepIndex / mpt.totalSteps   // 3 steps: habitual, rest, soft
mpt.started / mpt.finished
mpt.micState
mpt.heldSec               // live seconds; freezes at the measured value
mpt.autoStopped           // true once the mic has called the hold over
mpt.remainingSec
mpt.habitualSec / mpt.softSec   // number | null
mpt.reading               // MptReading | null — available once both are in
mpt.start() / mpt.next() / mpt.abort()
```

**The clock is stopped by the microphone, not by his thumb.** There is no stop
button on an `mpt` step — he holds the note, the detector calls it, and
`autoStopped` flips. At that point show the number and a single "Next". Do not
add a manual stop control; asking him to tap when the note dies measures
reaction time on top of breath and biases the headline metric.

**`mpt.reading`** is the only place a gap is interpreted. Render
`reading.message` verbatim. **The gap is a deficit — smaller is better.**
Baseline is ~10 s and the target is under 3 s, so never write copy that treats a
wide gap as good; `reading.verdict` is `'target' | 'improving' | 'baseline'` and
`'target'` is the best of the three.

### `calibration.ts` — read-only helpers you may import

```ts
import { deltaFromBaseline } from '../../features/lab/calibration';
```

Nothing else from that file is needed by a component. Do not import
`updateCalibration`, `DriftDetector` or the band functions — the hook owns them.

### `LiveDbMeter` — the new signature

```tsx
interface LiveDbMeterProps {
  db: number | null;
  percent: number;              // 0..100
  bandStatus: 'low' | 'target' | 'high';
  band: { minDb: number; maxDb: number };
  drift: 'ok' | 'over' | 'under';
  /** False while still calibrating — say so instead of implying it is his. */
  calibrated: boolean;
}
export default function LiveDbMeter(props: LiveDbMeterProps): JSX.Element;
```

Pure presentation. No `useState` for audio, no `AudioMeterController`, no
`getUserMedia`. The meter floor is **−60 dB** and the ceiling **0 dB**; to place
the band overlay use `(db + 60) / 60 * 100` for a percentage — the same linear
mapping `dbToPercent` uses, so the band and the fill agree.

While `calibrated` is false, label the band *provisional* somewhere honest and
small. Showing a placeholder band as though it were his would train him toward a
number that came from nowhere.

### Tab

`Tab` in `TabBar.tsx` becomes:

```ts
export type Tab = 'feed' | 'lab' | 'inbox' | 'hindi' | 'progress';
```

Order: **Feed · Lab · Capture · हिंदी · You**. Label the second tab `Lab`.
Five tabs at 375px is ~75px each — still above the 44px minimum. Check it.

### CSS class contract

Use these names so the styles and the markup cannot drift apart:

```
.lab                 .lab-idle          .lab-running        .lab-done
.lab-header          .lab-title         .lab-subtitle
.block-rail          .block-seg         .block-seg.is-done  .block-seg.is-current
.step-card           .step-block        .step-title         .step-cue
.step-feel           .step-clock        .step-actions
.step-card.is-transfer                  .step-blocked
.mic-gate            .mic-gate.is-denied
.db-meter            .db-meter-bar      .db-meter-fill      .db-meter-band
.db-meter-fill.band-low / .band-target / .band-high
.db-nudge            .db-nudge.is-over  .db-nudge.is-under
.mpt-test            .mpt-hold          .mpt-seconds        .mpt-result
```

## Acceptance criteria

Verify each **by running the app at 375×812**, not by reading your own CSS.

1. A fifth tab appears, second in the bar, labelled `Lab`, and opens the Lab.
   All five tabs are ≥44px tall and no label wraps or truncates.
2. Tapping start requests the microphone once. **Declining it does not block the
   routine** — the drills still run, the meter is simply absent, and the screen
   says why in one line.
3. Walking the whole routine reaches the finish state, and every one of Blocks
   A–E is visited in order A→B→C→D→E.
4. **On `b-transfer`, no skip control is rendered.** Let its timer run to zero
   and confirm the screen stays on that step until Done is tapped. Say in your
   report how long you left it there.
5. Calling skip on a mandatory step surfaces `blockedReason` visibly.
6. On a metered step the meter is shown; on an unmetered step (anything in
   Blocks C/D/E) it is **absent, not zeroed**.
7. Speaking loudly and continuously for ~3 s produces the `over` nudge; a single
   loud word does not. One nudge only — it must not flicker.
8. On day one the routine opens with the calibration step and the band is
   labelled provisional; `sessionsToCalibrate` reads 7.
9. The weekly MPT test is reachable, has **no stop button** on a hold step, and
   `autoStopped` flips on its own after you stop making the sound.
10. `mpt.reading.message` is rendered verbatim, and nothing in your copy calls a
    wide gap good.
11. Leaving the Lab mid-session and returning does not resume a phantom timer or
    double-count. Reloading the page after finishing shows the session persisted
    (`labSessionDone` on today's row).
12. Feed, Capture, हिंदी and You are unchanged — walk each one.
13. Zero console errors at 375×812.

## Constraints

- Light theme only. Use `tokens.css` variables; add none.
- Serif is for the learned item in the feed only — **not** in the Lab.
- Components are presentation. No `getUserMedia`, no `AudioContext`, no Dexie
  access, no `setInterval` driving the routine — the hooks own all of it. A
  component that opens the microphone itself is the defect being fixed here.
- Do not add an auto-advance, a skip-anyway or a stop button anywhere the brief
  says there isn't one. Those three are the whole behavioural contract.
- Do not touch the 44 pre-existing tests or add tests to Claude's files.
- Do not commit unless told; **never push** (a push is a production deploy).
- The routine's text comes from `routine.ts`. Do not rewrite cues in the
  component, and do not add encouragement copy that contradicts them — several
  of those lines are load-bearing corrections to things he currently believes.

## Self-check before you report done

- [ ] Every acceptance criterion verified by running it — say *how* for each.
- [ ] Zero console errors.
- [ ] No file outside "Your files" modified (`git status` to confirm).
- [ ] Contract unchanged — `git diff --stat` shows nothing in
      `src/types/`, `src/lib/`, `src/features/`, `src/db/`, `src/sync/`.
- [ ] `npm run build` clean and `npx vitest run` still green (107 tests).

## Report when done — write to `.claude/reports/AG-003.md`

1. Files changed, one line each on what changed.
2. Each acceptance criterion: met / not met + **how you verified it**. For
   anything you checked by reading code rather than running it, say so plainly —
   four of AG-002's thirteen were reported verified from its own CSS and three
   of those were broken when the app was actually run.
3. **Deviations** — anything done differently than briefed, and why.
4. **Couldn't do / uncertain** — be blunt. An honest gap costs far less than a
   confident wrong claim.
5. Anything broken you noticed but left alone.
