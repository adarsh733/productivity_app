# AG-004 — V3 Casual Rebuild

**Read these first, in this order, and do not start until you have:**

1. `docs/PRODUCT-V3.md` — the spec. Every "why" is there.
2. `docs/WIREFRAMES-V3.html` — 14 frames at 375×812. Open it in a browser.
3. `speak/src/types/contract.ts` — the data contract.
4. `AGENTS.md` — the workspace rules you must follow.

**Project root:** `D:\Adarsh\Mission AI\Productivity`
**App root:** `speak/` — a Vite + React 18 + TypeScript PWA. `npm run dev`,
`npm run build`, `npm test` (Vitest) all run from `speak/`.

---

## 0 · What you are doing and why

The app currently works like a training programme: a mandatory session, a
microphone-first flow, a self-assessment button on every card. Adarsh wants a
**casual, swipeable, browse-first app** — open it, scroll some words and idioms,
maybe say one out loud, leave. Speaking is one lane inside it, not the whole thing.

You are rebuilding the interface and the content. You are not rewriting the
scheduler, the audio math, or the sync layer — those are good and they stay.

**Work stage by stage. Finish a stage, run its acceptance checks, and report before
starting the next.** Do not build all eight stages and then hand over one large
diff. Stage 0 alone is worth shipping today.

---

## 1 · Ten rules. Breaking any of these fails the review.

1. **The feed must never dead-end.** Not after 3 cards, not after 300. If the queue
   cannot produce a next card, that is a bug, not an empty state.
2. **Never show a spinner with no exit.** Any loading state must resolve or show an
   error with an action.
3. **The microphone is never required.** Every card and every screen must be fully
   usable with the mic denied, missing, or ignored. No flow may block on permission.
4. **Never display text about a user's performance that was not derived from their
   actual attempt.** No placeholder feedback. No lorem. No "you did well" defaults.
   If you have nothing measured, show nothing. This is the single most important
   rule in this document — the current app violates it and that is why it is being
   rebuilt.
5. **Never draw a fake waveform.** A waveform must be driven by real analyser data.
   If there is no data, show no waveform.
6. **Never print an internal enum to the user.** (`straw`, `mpt`, `say_it`, `core`
   currently leak.) Every enum needs a display-name map.
7. **One card component, many card types.** A `switch` on `card.type` inside one
   component — not seven components, and not one generic renderer with shared copy.
   Copy like "Tap to reveal workplace meaning & context" must be per-type.
8. **Keep the existing theme.** Use the CSS variables in `speak/src/styles/tokens.css`.
   Do not introduce new colours, fonts, or hard-coded hex values. Match
   `WIREFRAMES-V3.html`, which uses the current palette.
9. **Tap targets ≥ 44×44 px. No horizontal overflow at 375 px.**
10. **`npm run build` clean and `npm test` green at the end of every stage.** Never
    hand over a stage with a failing test or a TypeScript error.

---

## 2 · STAGE 0 — Emergency fixes (do this first, on its own)

Three defects make the app unusable and dishonest. Fix only these, verify, report.
Do not start Stage 1 in the same pass.

### 0.1 The feed dead-ends after three cards

**File:** `speak/src/components/daily/DailyScreen.tsx`

`useFeed('core')` builds a queue of exactly 3 items. `DailyScreen` never calls
`setMode('endless')`, so after the third card `feed.item` is `null`, the
`if (!feed.ready || !card)` guard fires, and the screen shows
`"Loading today's deck…"` permanently.

**Fix:** call `useFeed('endless')`. Delete the "Core N/3" counter from the card
header — it is a session concept and it is being removed entirely. (The counter
also reads "Core 4/3", which tells you it was never bounded.)

**Verify:** advance 40 cards without a dead end, without a duplicate, and without
the spinner appearing.

### 0.2 Fabricated feedback

**File:** `speak/src/components/voicegym/ScenarioModal.tsx`

The `stage === 'review'` branch renders two hardcoded feedback cards
("You maintained steady delivery…", "Try placing a deliberate 1-second pause…").
Every recording gets those exact sentences. Above them is `.waveform-mock` — eight
`<span>`s with CSS heights, not audio.

**Fix:** delete both feedback cards and the mock waveform. Leave the real audio
playback, which works. Replace the whole block with the recording, its duration,
and this line and nothing else:

> Measured feedback is coming. For now, listen back to yourself.

Also: "Save & Done" currently persists nothing. Either wire it to the existing
`recordings` store in `speak/src/db/db.ts` (a `Recording` row — see the contract),
or relabel the button "Close". Do not leave a button that claims to save and does not.

### 0.3 The Rapid Rep records nothing

**File:** `speak/src/components/voicegym/VoiceGymScreen.tsx`

"Start 30s Clock" sets `isRecordingRapid` and runs a `setInterval`. The label reads
**"Recording... speak now"**. There is no `getUserMedia` and no `MediaRecorder`
anywhere in this file.

**Fix:** either wire it to the existing `useMissionAudio()` hook (the same hook
`ScenarioModal` uses correctly), or remove the feature until Stage 5. Do not leave
a countdown that says it is recording.

**Stage 0 acceptance:**
- [ ] 40 cards advanced in the feed, 0 dead ends, 0 spinners, 0 duplicates.
- [ ] Grep the repo: no hardcoded feedback strings, no `waveform-mock`.
- [ ] No control in the app says "Recording" unless a `MediaRecorder` is running.
- [ ] `npm run build` clean, `npm test` green.

---

## 3 · STAGE 1 — Contract additions

**File:** `speak/src/types/contract.ts` — additive only. Do not change or remove any
existing type. The Dexie migration in `speak/src/db/db.ts` must be **additive** and
must carry forward every existing store; a user's local data must survive the upgrade.

Add these card types to `CardType` and their interfaces alongside the existing ones:

```ts
| 'phrase'      // "say this instead of that" — phrasing, not vocabulary
| 'feeling'     // precise words for emotional states
| 'story_move'  // a storytelling technique: hook, turn, landing
| 'describe'    // an image or scene to describe out loud
| 'explain'     // a topic to explain in 60s (news, history, philosophy)
| 'teach_back'  // something you learned, explained back
```

```ts
export interface PhraseCard extends CardBase {
  type: 'phrase';
  weak: string;        // what people usually say
  strong: string;      // the version that lands
  why: string;         // one sentence on why it lands. Never more.
  register: 'office' | 'friends' | 'presenting';
}

export interface FeelingCard extends CardBase {
  type: 'feeling';
  term: string;
  meaning: string;
  /** How it differs from the nearest word people reach for instead. */
  contrast: string;
  example: string;
}

export interface StoryMoveCard extends CardBase {
  type: 'story_move';
  move: string;               // "Land the ending on a short sentence."
  why: string;
  example: string;
  heardIn?: string;           // "Radio hosts closing a segment."
}

export interface DescribeCard extends CardBase {
  type: 'describe';
  /** Path under `public/describe/`. Ships with the app. */
  imagePath: string;
  alt: string;
  prompt: string;             // "Tell me what's happening — and how it feels."
  beats: [string, string, string];
  targetVocab: string[];      // 3–5 words
  targetSec: number;
}

export interface ExplainCard extends CardBase {
  type: 'explain';
  topic: string;
  angle: string;              // the specific question, not the broad subject
  beats: [string, string, string];
  targetVocab: string[];
  targetSec: number;
}

export interface TeachBackCard extends CardBase {
  type: 'teach_back';
  prompt: string;
  beats: [string, string, string];
  targetSec: number;
}
```

Add each to the `Card` union. Add the new spoken types to `SPOKEN_TYPES`.

Also add:

```ts
/** User's chosen daily target. Nothing is lost by missing it. */
export type DailyGoal = 'casual' | 'regular' | 'serious';

export const GAMIFICATION = {
  XP: { cardSeen: 1, cardSaved: 3, spokenRep: 10, describeRep: 25 },
  GOAL_XP: { casual: 10, regular: 30, serious: 60 },
  /** Streak holds on 5 cards OR 1 spoken rep. A 30-second day must count. */
  STREAK_CARDS: 5,
  FREEZES_PER_MONTH: 2,
  /** How long a "less of this" swipe suppresses a card type. */
  DOWNWEIGHT_DAYS: 7,
} as const;
```

Extend `Profile` with optional `dailyGoal?: DailyGoal;` and
`interests?: string[];` and `typeWeights?: Record<string, number>;`.
Extend `DayRecord` with optional `xp?: number;` and `spokenReps?: number;`.
**Optional fields only** — existing rows must remain valid.

**Stage 1 acceptance:** build clean, existing tests green, a populated IndexedDB from
before the change still loads with all its cards, reviews, days and recordings intact.

---

## 4 · STAGE 2 — Queue and feed engine

**Files:** `speak/src/srs/queue.ts`, `speak/src/features/feed/useFeed.ts`

This is the part most likely to break silently. Write tests first.

1. **Remove the `'core'` mode.** `FeedMode` becomes `'endless'` only. Delete
   `CORE_SEQUENCE` from `QUEUE_RULES`. Delete `coreThreeDone` from the streak
   calculation — see Stage 6 for what replaces it. Keep every other rule:
   `MAX_CONSECUTIVE_SAME_TYPE`, `MAX_NEW_PER_DAY`, `MAX_BREATH_PER_DAY`, the
   language filter, and the SM-2 due-card priority. **Those rules are why the feed
   feels varied — do not touch them.**
2. **Breath cards leave the feed.** `buildQueue` must never return a `breath` card.
   They are reached only from the Speak tab. Do not delete the cards.
3. **Card one, day one, is a `word` or an `idiom`.** Never a drill, never a
   `describe`, never an `explain`.
4. **`describe` / `explain` / `teach_back` cards do not go in the feed** either —
   they are Speak-tab content. `phrase`, `feeling` and `story_move` **do**.
5. **Interest weighting.** `Profile.interests` (from onboarding) biases which types
   are served. It must **bias, not filter** — every type must still appear
   occasionally, or the feed becomes monotonous.
6. **"Less of this" (swipe left).** Multiply that type's weight by 0.3 for
   `DOWNWEIGHT_DAYS`. It must never reach zero.
7. **Refill.** `useFeed` already tops up at `REFILL_WHEN_LEFT`. Keep that. When
   every eligible card has been seen today, **re-serve SRS-due cards** rather than
   returning an empty queue. `item` must never be `null` once `ready` is true —
   assert this in a test.
8. **Hindi ratio:** roughly 1 in 8 feed cards. Not a hard modulo — weight it.

**Stage 2 acceptance (write these as tests):**
- [ ] A 500-card walk on the real seed data returns a card every time. `item` is
      never null after `ready`.
- [ ] 0 `breath` cards in 500 feed cards.
- [ ] 0 adjacent same-type pairs.
- [ ] First card of a fresh profile is `word` or `idiom`, across 50 fresh runs.
- [ ] Hindi is between 8% and 18% of a 500-card walk.
- [ ] After 3 left-swipes on `swap`, swaps still appear in the next 200 cards.
- [ ] With only 20 cards in the DB, a 200-card walk still never dead-ends.

---

## 5 · STAGE 3 — Shell, onboarding, and the Feed screen

### 5.1 Tab shell

**File:** `speak/src/components/shell/TabBar.tsx`, `speak/src/App.tsx`

Four tabs: **Feed · Browse · Speak · You**. Keep the floating Capture button exactly
as it is. Delete the legacy tab-name normalisation (`today`/`practice`/`coach`/
`progress`) — pick the new names in `ResetTab` and migrate any persisted value once.

### 5.2 Onboarding

**File:** replace `speak/src/components/shell/FirstRun.tsx`

The current four screens (medical disclaimer, environment, mic self-test, 30 cm
comparable setup) collapse to **one question** — frame 1 of the wireframes:

> **What do you want more of?**
> multi-select chips: Office English · Everyday words · Practical Hindi · Speaking ·
> Storytelling · Ideas & opinions

Write the selection to `Profile.interests`. Then go straight to the Feed.

**Do not delete the removed screens' logic.** Move the environment picker, the mic
self-test (`runMicSelfTest`) and the comparable-setup guidance into a new
**Speak → Settings** screen, and prompt for them the first time a recording is
started that needs measurement.

### 5.3 The Feed

**New files:** `speak/src/components/feed/FeedScreen.tsx` (replace the orphaned one),
`speak/src/components/feed/CardFace.tsx`

Frames 2–7. One full-bleed card at a time.

**Gestures** — `speak/src/components/feed/useCardGestures.ts` already implements
these and is currently wired to nothing. Reuse it; do not write a second gesture
engine.

| Gesture | Action |
|---|---|
| Swipe up | next card |
| Swipe down | previous card |
| Swipe right | save (⭐), brief toast, +3 XP |
| Swipe left | "less of this" — down-weight the type. **No toast that reads like a failure.** |
| Tap | flip to detail |

The existing edge-guard matters: a vertical swipe must only advance the card when the
card body is unscrollable or has been scrolled to the bottom. That bug has been fixed
once already — do not regress it.

**Action strip** (three buttons, bottom): ⭐ save · 🔊 speak aloud (existing `speak()`
wrapper) · 🎙️ **Say it** — optional, opens the Stage 5 recording sheet with this card
as the prompt.

**Delete "Got It · Next Card".** Nothing in the feed is graded. Cards passed by
swiping up are recorded as `good` for SRS purposes internally, but the user is never
shown a grade or asked to self-assess.

**`CardFace.tsx`** is one component with a `switch (card.type)`. Each branch owns its
own front, its own back, and its own copy. No shared caption across types.

| Type | Front | Back |
|---|---|---|
| `word` | term · part of speech · meaning | meaning, where you'd use it, example quote, "instead of" |
| `idiom` | phrase · meaning | meaning, "use it when", example |
| `swap` | the weak phrase, struck through → the strong word | why it lands, example |
| `action_verb` | verb · meaning | contrast with confusable verbs, two examples |
| `phrase` | weak (struck) → ↓ → strong | why it lands |
| `feeling` | term · meaning | contrast, example |
| `story_move` | the move, as an instruction | why, example, heard in |
| `hindi` (`lang === 'hi'`) | Devanagari · transliteration · meaning | conversational example |
| `pronounce` | term · syllables with stress marked | common error, 🔊 prominent |
| `say_it` | the line | the marked line with pause marks |

**Top bar:** streak chip and XP-toward-goal. Nothing else. No counters out of a total.

**Stage 3 acceptance:**
- [ ] Onboarding is one screen and never requests microphone permission.
- [ ] Every card type renders front and back with type-appropriate copy. Screenshot
      all 10 at 375×812.
- [ ] All five gestures work. Scrolling a long card body does not advance it.
- [ ] No enum string is visible anywhere in the UI.
- [ ] 0 console errors on a 40-card walk.

---

## 6 · STAGE 4 — Browse

**Files:** `speak/src/components/library/LibraryScreen.tsx` → rename to
`BrowseScreen.tsx`; `speak/src/features/library/categories.ts`

This screen is already good. Three changes only:

1. **Deck detail becomes the Feed's card + gestures.** Delete `DeckModal.tsx`'s
   prev/next chevron navigation and render `CardFace` with `useCardGestures` inside
   a full-screen view (frame 9). One card component, two hosts.
2. **Progress ring per deck** — cards seen / total, from the `reviews` table.
3. **New decks** in `CATEGORY_DECKS`: Phrases That Land · Feelings, Precisely ·
   Story Craft · Ideas & Opinions · Your Life, Told Well · Teach It Back ·
   Describe This.

Keep the search exactly as it is. It works.

---

## 7 · STAGE 5 — Speak

**New:** `speak/src/components/speak/SpeakScreen.tsx`, `RecordSheet.tsx`,
`SpeakSettings.tsx`. **Delete:** `VoiceGymScreen.tsx`, `ScenarioModal.tsx`.

### 7.1 The hub — frame 10

Four sections: **Describe this** (a featured image card) · **Situations** (the 7
existing scenarios + the new `explain` / `feeling` / incident prompts) ·
**Micro-drills** (pace, pauses, quiet register, and the breath cards that left the
feed) · **Deep session** (the existing `SessionRunner`, kept, labelled optional,
last on the page).

A ⚙️ opens **Speak Settings**: environment, mic self-test, comparable-setup guidance,
calibration state. All the clinical material from the old onboarding lives here.

### 7.2 The recording sheet — frames 12 and 13. **Read this twice.**

Adarsh's exact complaint: *"it says start microphone and there is nothing there on
the screen. Where do I speak?"*

**While recording, all of this must be visible at once, without scrolling:**

- the prompt or image, still on screen;
- the three beats, with the current one highlighted as time advances;
- the target-word chips, ticking to ✓ as each is detected;
- a **real** waveform driven by the analyser — 20 bars, updated per animation frame
  from `audioMeter.ts`, which already provides the level data;
- the elapsed / remaining clock;
- a **⏹ Done** control that is always reachable.

Use the existing `useMissionAudio()` hook for capture and the existing
`AudioMeterController` for levels. **Do not open a second `getUserMedia`** — the
recorder and the meter must share one stream. `useMissionAudio` documents this.

Persist every attempt as a `Recording` row (the type already exists in the contract,
and `db.ts` already has the store).

### 7.3 Measured feedback — frame 13

**New file:** `speak/src/features/speak/metrics.ts` — pure functions, unit tested.

Compute from the actual attempt and show only these:

| Metric | Source |
|---|---|
| Duration | recorder |
| Words per minute | transcript word count ÷ duration |
| Pause count and placement | silence gaps > 400 ms in the level stream |
| Target words used | match against `targetVocab`, case- and stem-insensitive |
| Volume vs baseline | mean dBFS − `Profile.baselineDb`. **Only show if `baselineDb` exists.** Never show an absolute dB number. |

Transcript comes from `webkitSpeechRecognition` where available. **Where it is not
available, show the metrics that do not need it and omit the rest.** Do not estimate.
Do not fill in.

Under the metrics block, print exactly: `Measured on this device. Nothing uploaded.`

---

## 8 · STAGE 6 — You, and gamification

**New:** `speak/src/components/you/YouScreen.tsx`. **Delete:** `SavedScreen.tsx`,
both orphaned `ProgressScreen`s.

Frame 14: three stats (streak / cards seen / spoken reps) · a 14-day streak calendar
with freezes marked · the weekly recap · saved cards · captured notes · recordings
with playback.

**Streak rule — `speak/src/features/session/day.ts`:**

```
A day counts if:  cardsCompleted >= 5  OR  spokenReps >= 1
```

`coreThreeDone` is gone. Two freezes per calendar month, granted silently, spent
automatically, shown in the calendar. **No notification, banner, or copy that
frames a missed day as a loss.**

XP and goals per `GAMIFICATION` in the contract. Goal is changeable any time from
You and is never nagged about.

**Explicitly do not build:** hearts, lives, losing XP, leaderboards, streak-loss push
notifications, or any punishment mechanic. This app competes with Instagram by being
lighter, not stricter.

The **weekly recap** may only state numbers the database actually holds — new cards
seen, target words used out loud, urges redirected. If a number cannot be computed
from real rows, it does not appear.

---

## 9 · STAGE 7 — AI feedback (the first real AI in this app)

`netlify/functions/ai.ts` is fully built — proxy, task allowlist, Gemini → Groq
failover. **Nothing has ever called it.** A grep for `fetch(` across `speak/src`
returns zero results.

**New file:** `speak/src/lib/ai.ts` — the client.

### 9.1 Feedback on an attempt

Send the **transcript**, not the audio, with task `review_recording`. Include the
prompt, the beats, the target vocabulary, and the Stage 5 metrics. Ask for **exactly
one win and one fix, each quoting the user's own words back.**

Then, before rendering:

- If the response does not quote the transcript, **discard it** and show only the
  measured metrics.
- If the call fails or times out (5 s), show the metrics and the playback, and say
  the AI feedback is unavailable. **Never substitute a default.**
- Label the block `Feedback from your transcript · Gemini`.

### 9.2 Content expansion — the quality gate

For `expand_seed`, the pipeline in `PRODUCT-RESET-PLAN.md` §7.5 is mandatory:

> generate hot → **verify at temperature 0** → dedupe against every existing card →
> tag → serve

A generated card that fails verification is **discarded, not softened**. Set
`batchId` on everything generated so a bad batch can be purged wholesale — the field
is already on `CardBase` for exactly this.

**If you skip the verification pass, this app teaches Adarsh wrong English.** That is
the one failure mode that makes the whole product worse than not existing.

---

## 10 · STAGE 8 — Content

Current: 368 cards, roughly three weeks of casual use. Target: **1,500+**.

Author into `speak/src/content/seed/` following the existing file conventions
(`{version, cards:[...]}`, ids unique across all files, validated by
`seedLoader.ts`, which skips bad rows rather than throwing).

| File | Deck | Target |
|---|---|---|
| `30-phrases.json` | Phrases That Land | 120 |
| `31-feelings.json` | Feelings, Precisely | 100 |
| `32-story-craft.json` | Story Craft | 80 |
| `33-explain.json` | Ideas & Opinions — geopolitics, history, philosophy, psychology | 100 |
| `34-life-story.json` | Your Life, Told Well | 60 |
| `35-teach-back.json` | Teach It Back | 60 |
| `36-describe.json` | Describe This | 150 |
| `10-words-en.json` | extend | +300 |
| `12-idioms-corporate.json` | extend | +150 |
| `20-hindi.json` | extend | +200 |

**Register targets — this is the part most likely to come out generic:**

- **Corporate English:** product, technology, consulting, AI, MBA-style business
  communication. Natural, not textbook. *"We're in the weeds"*, not *"we are
  focusing excessively on minor details"*.
- **Hindi:** contemporary conversational — the register Samay Raina speaks in, not
  formal literary Hindi. Devanagari plus transliteration.
- **Story Craft:** the moves radio hosts, Palki Sharma and Think School actually use
  — hooks, controlled pauses, structured explanation, turns, landings.
- **Feelings:** precise emotional vocabulary, each with a contrast against the
  nearest word people reach for instead.

**Every card must be checkable by a native speaker in one read.** No invented idioms.
No phrases that are grammatical but nobody says.

### Describe-this images

**Blocked on Adarsh's decision — do not start until he answers.** Recommendation is
a curated static pack of ~150 images shipped in `speak/public/describe/`, each
authored with a prompt, three beats, and 3–5 target words. Images must be licensed
for this use. Do not scrape.

---

## 11 · Files

### Yours to create or rewrite

```
speak/src/App.tsx
speak/src/components/shell/TabBar.tsx
speak/src/components/shell/FirstRun.tsx          → rewrite as the 1-question screen
speak/src/components/feed/FeedScreen.tsx         → rewrite
speak/src/components/feed/CardFace.tsx           → new
speak/src/components/library/BrowseScreen.tsx    → renamed from LibraryScreen
speak/src/components/library/DeckView.tsx        → replaces DeckModal
speak/src/components/speak/SpeakScreen.tsx       → new
speak/src/components/speak/RecordSheet.tsx       → new
speak/src/components/speak/SpeakSettings.tsx     → new
speak/src/components/you/YouScreen.tsx           → new
speak/src/features/speak/metrics.ts              → new (+ tests)
speak/src/features/gamification/xp.ts            → new (+ tests)
speak/src/lib/ai.ts                              → new
speak/src/srs/queue.ts                           → modify (+ tests)
speak/src/features/feed/useFeed.ts               → modify (+ tests)
speak/src/features/session/day.ts                → modify (+ tests)
speak/src/features/library/categories.ts         → modify
speak/src/types/contract.ts                      → additive only
speak/src/db/db.ts                               → additive migration only
speak/src/styles/components.css
speak/src/content/seed/*.json
```

### Delete — orphaned, imported by nothing

```
speak/src/components/hindi/HindiScreen.tsx
speak/src/components/inbox/InboxScreen.tsx
speak/src/components/progress/ProgressScreen.tsx
speak/src/components/reset/TodayScreen.tsx
speak/src/components/reset/CoachScreen.tsx
speak/src/components/reset/PracticeScreen.tsx
speak/src/components/reset/ProgressScreen.tsx
speak/src/components/daily/DailyScreen.tsx       (after Stage 3 replaces it)
speak/src/components/saved/SavedScreen.tsx       (after Stage 6)
speak/src/components/voicegym/VoiceGymScreen.tsx (after Stage 5)
speak/src/components/voicegym/ScenarioModal.tsx  (after Stage 5)
```

`LiveDbMeter.tsx`, `MptTracker.tsx`, `VolumeLadder.tsx` and `useMptTest.ts` are also
orphaned but are **working audio modules** — wire them into Speak → Micro-drills
rather than deleting them.

### Do not touch

```
speak/src/srs/scheduler.ts        SM-2. Correct and tested. No reason to change it.
speak/src/lib/audioMeter.ts       The dB math, drift detection, phonation detection.
speak/src/features/lab/calibration.ts   The MPT gap is a DEFICIT — smaller is better.
                                        Getting this backwards congratulates the exact
                                        habit the app exists to remove.
speak/src/sync/supabase.ts        RLS is on every table. Do not loosen it.
speak/src/features/reset/useMissionAudio.ts   Shared-stream recorder. Reuse it.
speak/src/styles/tokens.css       The theme contract. Use the variables; add none.
netlify/functions/ai.ts           The server-side task allowlist is a security
                                  boundary. Call it; do not widen it.
```

---

## 12 · How to verify, and how to report

**Run the app.** Every stage is verified at **375×812 in a real browser**, not by
reading your own code. Every previous review pass on this project found defects that
only appeared when the app was actually run — a feed that dead-ended, a scroll that
graded a card, Hindi leaking into the English feed. Reading the diff would have
caught none of them.

For each stage report:

1. What you changed, file by file.
2. Test counts before and after. Build status.
3. **What you verified by running it**, with the exact numbers — how many cards you
   walked, how many console errors, which screens you screenshotted.
4. Anything you could not verify, said plainly. "Unverified" is a fine answer;
   a verification you did not actually perform is not.
5. Anything in this brief you think is wrong. Say so rather than working around it.

**Claude will do one review pass off `git diff` plus your report.** Rule 4 —
never claim what you did not measure — applies to your report exactly as it applies
to the app.

---

## 13 · Blocked on Adarsh

Do not build these until he answers:

1. **The product name.** Recommendation: **Articulate**, with Speak as one tab.
   Until he answers, keep "SPEAK" everywhere — a rename is a find-and-replace and is
   not worth guessing at.
2. **Describe-this images:** curated static pack (recommended) or runtime generation.

Everything else in this brief is decided. Start at Stage 0.
