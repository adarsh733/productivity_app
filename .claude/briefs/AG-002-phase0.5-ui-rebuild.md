# ANTIGRAVITY BRIEF — SPEAK Phase 0.5, UI rebuild · 2026-08-12 · AG-002

You are rebuilding the entire interface of an existing, working app. **The logic
already works and you are not allowed to touch it.** Every behaviour you need is
already exposed by hooks. Your job is presentation: new theme, new card anatomy,
new gestures, new icons, one new screen.

Read this whole file before writing anything. It is written to be unambiguous —
where it gives a number, use that number; do not improve on it.

---

## 0. Read first, in this order

1. `speak/AGENTS.md` — the non-negotiables for this repo. All six apply to you.
2. `speak/CLAUDE.md` — where things live.
3. `docs/README.md` → `docs/PLAN.md` §4 and §7 — what the app is and which phase this is.
4. `docs/WIREFRAMES.html` — **open this in a browser.** It is 17 phone frames
   drawn at 1:1, 375×812. It is the picture of what you are building. This brief
   is the text of the same thing; if they disagree, **this brief wins**, because
   it was written after the four open questions were answered.
5. `.claude/ACTIVE-WORK.md` — the claim protocol. Claim your files before you
   write, release when done. This is not optional; another agent works in this
   repo.

---

## 1. Goal

The app currently works but looks like a flashcard app: near-black, seven
saturated hues, four Anki grade buttons, and every card rendering as the same
undifferentiated stack. It has to feel better to open than Instagram, because
that is literally what it competes with.

You are shipping: **a light theme, a fixed card anatomy where the thing he must
say out loud can never be pushed off-screen, two visible grade buttons plus two
gestures, drawn tab icons, a first-run screen, and an endless Hindi queue instead
of a dead-end carousel.**

Twelve specific defects are listed in §6. Each is a numbered issue (`U1`–`U12`)
and each has a fixed answer. Fix all twelve.

---

## 2. Decisions already made — do not revisit these

These were answered by the product owner on 2026-08-12. They are settled.

| | Decision | What it means for you |
|---|---|---|
| 1 | **`hard` is KEPT** | But it does **not** get a button. Two buttons only — `Again` and `Got it`. `hard` is **swipe-left**. `easy` is **long-press on Got it**. See §8. |
| 2 | **Serif: YES** | The item being learned renders in `var(--serif)`. Nothing else does. Ever. |
| 3 | **Accent: SKY BLUE, not green** | `--accent: #0369a1`. Already in the token file. The wireframes show green — **the wireframes are stale on this one point, the token file is right.** |
| 4 | **`Inbox` → `Capture`** | Rename in the tab bar, the screen heading, and the component's user-facing strings. **Do not rename the files, the route key, the hook, or anything in `src/features/inbox/`.** It is a label change only. |
| 5 | Light theme | Not an option. No toggle, no dark variant, no `prefers-color-scheme` block. Do not add one "for completeness". |
| 6 | UI before Phase 1 | You are Phase 0.5. The microphone work is Phase 1 and is **not yours** — see §13. |

---

## 3. Your files — write ONLY these

**Rewrite:**
- `speak/src/styles/components.css` — all of it. It is currently 681 lines of dark theme. Rewrite against the new tokens.
- `speak/src/components/cards/CardView.tsx` — new anatomy, all 7 card types.
- `speak/src/components/feed/FeedScreen.tsx` — header, card frame, actions, gestures, urge chip, Core-3 handoff.
- `speak/src/components/hindi/HindiScreen.tsx` — carousel → endless queue.
- `speak/src/components/inbox/InboxScreen.tsx` — relabel to Capture, restyle.
- `speak/src/components/progress/ProgressScreen.tsx` — "You". Starting state on day 1.
- `speak/src/components/shell/TabBar.tsx` — drawn icons + labels.
- `speak/src/App.tsx` — mount the first-run screen. Nothing else.

**Create:**
- `speak/src/components/shell/Icons.tsx` — the four tab icons as inline SVG components.
- `speak/src/components/shell/FirstRun.tsx` — the three-panel first-run.
- `speak/src/components/feed/CoreDots.tsx` — the three-dot Core-3 indicator.
- `speak/src/components/feed/CardActions.tsx` — Again / Got it / long-press / urge chip.
- `speak/src/components/feed/useCardGestures.ts` — swipe-up and swipe-left handling.

That is 8 rewrites and 5 new files. **Nothing else.** Run `git status` before you
report done and confirm the changed-file list matches this exactly.

---

## 4. Files you must NOT edit

Claude owns these. Editing one is an automatic fail even if your change is
correct.

- `speak/src/styles/tokens.css` — **the contract.** Already updated for you. Read it, use it, never change it. If you need a value that is not in it, you are doing something the design does not call for — stop and report it instead of adding a token.
- `speak/src/types/contract.ts` — the type contract.
- `speak/src/srs/**` — scheduler and queue. Silent-failure zone.
- `speak/src/features/**` — all state hooks. **All logic lives here.** You call it; you never change it.
- `speak/src/db/**`, `speak/src/sync/**`, `speak/src/lib/**`
- `speak/src/content/seed/**` — do not touch the content. Wrong content is worse than no content, and it is not your slice.
- `netlify/**`, `supabase/**`, `docs/**`, `.claude/**` except your report.

---

## 5. The contract you build against

### 5a. Styling

**Every value comes from `speak/src/styles/tokens.css`.** No raw hex. No raw px
font sizes. No one-off radii or shadows. Eight type sizes exist; there is no
ninth. If you find yourself typing `#` followed by six characters in a `.css` or
`.tsx` file, you have made a mistake — except inside `Icons.tsx`, where SVG
strokes must use `currentColor` (also not a hex).

Key tokens you will need constantly:

| Token | Use |
|---|---|
| `--paper` | The app background. Every screen. |
| `--card` | The card, and only the card. |
| `--raised` | Chips, fields, inactive tiles. **Never to signal "raised"** — on light that reads as disabled. |
| `--line` | Every hairline. |
| `--ink` / `--ink-2` / `--ink-3` | Body / secondary / labels + hints. |
| `--accent` | The only CTA colour. Carries `--accent-ink` (white) text. |
| `--accent-bright` | **Non-text only** — focus rings, active indicators. Never put text on it. |
| `--accent-soft` + `--accent-line` | The say-block fill and its left rule. |
| `--heat` | The streak flame. Nothing else. |
| `--t-word` … `--t-breath` | **3px spine and the 11px kicker only.** Never a fill, never a button, never text above `--fs-2`. |
| `--serif` | The learned item only. |
| `--shadow-card` | The card. `--shadow-accent` for the primary button only. |
| `--card-frame-h` | The card frame height. **Use this variable — do not re-derive the arithmetic.** |

### 5b. The feed hook — `useFeed()` from `src/features/feed/useFeed.ts`

Do not read this file expecting to change it. This is its entire surface:

```ts
interface FeedApi {
  ready: boolean;
  mode: 'core' | 'endless';
  item: QueueItem | null;      // item.card is the Card; item.reason is why it was queued
  position: number;            // 1-based position in the current run
  total: number;               // grows in endless mode
  coreThreeDone: boolean;
  streak: number;
  cardsToday: number;
  urgesToday: number;
  setMode(mode: FeedMode): void;
  submit(grade: Grade, opts?: { msSpent?: number; measure?: number }): Promise<void>;
  logUrge(): Promise<void>;
}
```

`Grade` is `'again' | 'hard' | 'good' | 'easy'`. All four already exist in the
contract — **keeping `hard` requires no type change.**

Things about this hook that will bite you if you don't know them:
- `again` is not "skip". It re-inserts the card ~3 positions later in the same
  session. Your UI must not assume the card advances forever forwards.
- The endless queue tops itself up before it runs out, so `item` is never null
  once `ready` is true. **Do not write an "out of cards" empty state for the
  feed** — a dead end is the one thing this app forbids.
- `mode` is derived from today's record, not from mount. Switching tabs and
  coming back must not restart "CORE 1/3". Keep the feed mounted (see §7a).

### 5c. Breath cards report a measurement

`CardView` takes `onMeasure?: (value: number) => void`. Breath cards call it with
seconds or a count. **Keep this prop and keep calling it** — `FeedScreen` passes
the value into `submit(grade, { measure })`, and dropping it silently destroys
the one number he watches improve.

### 5d. Class names — required, exact

`components.css` and the TSX must agree. Use exactly these; add your own only for
things not listed.

```
Shell        .screen .screen-head .screen-title .gutter
Tabs         .tabbar .tab .tab.is-active .tab-icon .tab-label
Feed head    .feed-head .streak .streak-flame .core-dots .core-dot .core-dot.is-done
Card frame   .card-frame .card .card-spine .card-kicker .card-body
Card content .term .term-sm .term-weak .pos .meaning .examples .contrast
             .quote .scenario .syllables .stressed .unstressed .line
             .pause .pause-long .instructions .hint .answers .countdown
Say block    .say-block .say-label .say-text
Actions      .actions .btn .btn-primary .btn-ghost .btn-round .btn-big
Urge         .urge-chip .urge-chip.is-counted
Drill        .drill .timer .unit .counter
First run    .firstrun .firstrun-panel .firstrun-dots .firstrun-cta
Progress     .stat-hero .stat-grid .stat-tile .stat-value .stat-label .starting-state
Capture      .capture-field .capture-list .capture-item
Hint         .swipe-hint
```

**`.term` is the serif class.** It is the only class that sets
`font-family: var(--serif)`.

---

## 6. The twelve defects — each with its fixed answer

| ID | Now | Build this |
|---|---|---|
| **U1** | Near-black shell, seven saturated hues | Paper `--paper`, white cards, near-black ink. The seven hues survive **only** as a 3px left spine on the card and the colour of the 11px kicker. |
| **U2** | Four grade buttons: Again / Hard / Good / Easy | **Two buttons**: `Again` (ghost) and `Got it` (primary). `easy` = long-press Got it. `hard` = swipe-left. See §8. |
| **U3** | Every card is the same undifferentiated stack | Fixed anatomy, §7b. The thing he must say aloud is **always** the same block, same place, same colour. |
| **U4** | "Felt the pull" top-right, competing with the streak | A quiet chip **below the actions**, full width, `--raised`, `--ink-2` text. Reads `I felt the pull`; on tap becomes `Counted.` for 2s then fades back. It is a confession, not a header control — it must feel private. |
| **U5** | Tab glyphs are `◈ ＋ अ ◉` | Four **drawn line icons**, 22px, `stroke-width: 1.5`, `currentColor`, plus text labels. See §9. |
| **U6** | Progress leads with a giant number that is 0 all week | Day 1 shows a **starting state**, not a zero. See §7f. |
| **U7** | No first-run screen; opens straight onto a breath drill | Three panels, ~15 seconds, ending inside Core 1. See §7g. |
| **U8** | On a long card the say-prompt can fall below the fold | The card body scrolls **inside** a fixed frame of height `var(--card-frame-h)`. The say-block is pinned above the actions and **cannot scroll away**. This is the single most important fix in the list. |
| **U9** | Hindi is a prev/next carousel that greys out at the end | Same endless queue as the feed, own counter, entered deliberately. **No dead end.** |
| **U10** | "swipe up to pass" printed on every card forever | Show it on the **first three cards ever**, as a gently moving hint, then never again. Persist the count — see §8c. |
| **U11** | One system font at three sizes | `--serif` for the learned item, `--sans` for all chrome. |
| **U12** | Core 3 progress is a full-width bar 0→1 | **Three dots.** A bar implies a loading screen. |

---

## 7. Screen by screen

### 7a. Shell — `App.tsx`, `TabBar.tsx`

Four tabs, in this order: **Feed · Capture · हिंदी · You**.

- The Feed **stays mounted** behind the other tabs. Switching tabs must never
  unmount it or restart a session. If it is currently unmounted on tab change,
  fix that by hiding rather than unmounting.
- Tab bar: height `--tabbar-h` (64px), background `--card`, **a hairline top
  border and no shadow**. Active tab: icon and label in `--accent`. Inactive:
  `--ink-3`.
- `App.tsx` changes **only** to render `<FirstRun />` when it has not been
  completed. Nothing else in that file.

### 7b. The card — `CardView.tsx`, and the frame in `FeedScreen.tsx`

Fixed anatomy, top to bottom, identical for all seven types:

```
┌─ .card ─────────────────────────────┐  radius --r-lg (28px), --card,
│▍ WORD                               │  1px --line + --shadow-card
│▍                                    │  ▍ = .card-spine, 3px, var(--t-<type>)
│▍ concise            ← .term, serif  │  .card-kicker: --fs-1, --ls-label,
│▍ adj.               ← .pos          │    colour var(--t-<type>)
│▍ saying what is needed in few words │
│▍ …examples…                         │  ← .card-body: THIS is what scrolls
│▍                                    │
│ ┌─ .say-block ────────────────────┐ │  --accent-soft fill, 3px --accent-line
│ │ SAY THIS                        │ │  left rule, radius --r-sm
│ │ Think of a message that was far │ │  .say-label: --fs-1, --ls-label
│ │ too long. Say one sentence…     │ │  .say-text: --fs-4
│ └─────────────────────────────────┘ │  PINNED. Never scrolls out of view.
└─────────────────────────────────────┘
```

Rules that are not negotiable:

1. `.card-frame` is exactly `var(--card-frame-h)` tall. The card fills it.
2. `.card-body` is the **only** scrolling region: `overflow-y: auto`,
   `overscroll-behavior: contain`. If content is short it does not scroll.
3. `.say-block` lives **outside** `.card-body`, as a sibling below it. That is
   what makes U8 structurally impossible to regress.
4. Every card type ends in a say-block. **If a card can be answered in silence,
   the card is broken** (AGENTS.md rule 2). Keep the existing prompt text for
   each type — it is already written and it is correct.
5. `.term` uses `--serif` at `--fs-7` (36px), or `--fs-6` (28px) when the term is
   longer than 14 characters. `.term-sm` (`--fs-6`, sans) is for breath drill
   titles, which are sentences, not terms — **breath titles are not serif.**

Per-type notes — keep all existing content and behaviour, restyle only:

| Type | Keep exactly as-is | Restyle |
|---|---|---|
| `word` | term, pos, meaning, examples list, say prompt | examples become a bordered list, `--fs-3`, `--ink-2` |
| `swap` | the countdown timer, the reveal button, the answers | `.countdown` is `--fs-8` in `--accent`; `.term-weak` gets a strikethrough-adjacent treatment (`--ink-3`, not literal strikethrough) |
| `idiom` | phrase, meaning, example quote, scenario | **The wireframes flagged that `scenario` and `example` often say the same thing.** Do not fix the content — render `.quote` prominently and `.scenario` as `--fs-2 --ink-3` so the repetition reads as a footnote rather than a duplicate. |
| `action_verb` | verb, meaning, contrast, examples | `.contrast` gets its own treatment — it is the "not X, but Y" line and it is the whole point of the card |
| `pronounce` | syllables with the stressed index, the Hear-it button, common error | `.stressed` is `--ink` + `--fw-bold`; `.unstressed` is `--ink-3`. Separate syllables with a thin middot |
| `say_it` | the pause marks (`/` and `//`), the Hear-the-pace button, target wpm | `.pause` renders as a visual beat — a small vertical rule, not punctuation. `.pause-long` is taller |
| `breath` | the timer, the counter, the Log button, `onMeasure` | **Two content problems to work around, not fix:** instructions are too long to read while breathing — render them as a numbered list at `--fs-3` with generous line-height, and show **only the current step highlighted** if there are more than 3 steps. Also show the personal best if `bestMptSec` is available on the day record passed in — if it is not passed in, skip it, do not go fetch it. |

### 7c. Feed header — `FeedScreen.tsx`, `CoreDots.tsx`

Height `--header-h` (38px), inside the gutter.

- Left: `CORE` or `ENDLESS` at `--fs-1`, `--ls-label`, `--ink-3`.
- Right: streak as a flame glyph in `--heat` plus the number. **If `streak` is 0,
  render nothing at all** — not a zero, not a grey flame.
- Below: `CoreDots` — three dots, 8px, 8px apart. Done = `--accent` filled.
  Current = `--accent` 2px ring, unfilled. Future = `--line` filled.
  **Only render CoreDots in `core` mode.** In endless mode show the count of
  cards done today at `--fs-1 --ink-3` instead.

### 7d. Core-3 handoff

When Core 3 completes, **do not show a "you're done" screen.** A brief inline
celebration in the header area (the third dot fills, the streak number ticks up
with a 220ms transition) and the next card is already an endless card. If a
transitional element is needed it is a single line above the next card —
`Core 3 done. Streak 7.` — that fades after 3 seconds. **No modal, no full-screen
takeover, no button he has to press to continue.**

### 7e. Hindi — `HindiScreen.tsx` (U9)

Currently a prev/next carousel that greys its arrows at the end. Replace with the
same endless pattern as the feed: one card at a time, swipe up for the next, own
counter (`N today`), never runs out. Same card anatomy, same say-block, same
gestures. Hindi terms use `--serif` like any other learned item.

**Hindi cards never appear in the English feed.** They are `lang: 'hi'` and the
queue already handles this — you do not need to filter anything, just do not
introduce a path that mixes them.

### 7f. You — `ProgressScreen.tsx` (U6)

The hero number is **urges redirected** — that is the real product metric, not
cards or minutes.

- **Day 1 / no data:** render `.starting-state` instead of a hero zero. A short
  line — `Day one. The numbers start after your first Core 3.` — plus the stat
  grid showing `—` rather than `0`. The hero only becomes the hero once it has
  something to show. Switch to the hero once `cardsToday > 0` or any prior day
  exists.
- **With data:** `.stat-hero` = urges redirected, `--fs-8`, sans, `--ink`.
  Below, a `.stat-grid` of four `.stat-tile`s: streak, cards today, Core 3
  status, best MPT seconds. `--fs-6` values, `--fs-1 --ls-label --ink-3` labels.
- Keep it to **five numbers total**. More than five stops being read. If you want
  a sixth, you are wrong.

### 7g. First run — `FirstRun.tsx` (U7)

Three panels, swipe or tap through, ~15 seconds total. Persist completion in
`localStorage` under the key `speak.firstRun.v1` — **not** in IndexedDB; that is
the logic layer and it is not yours.

1. **"This is a speaking app."** — the one expectation that matters: he will be
   speaking out loud, and cards do not advance until he has.
2. **"Three cards a day is a full day."** — Core 3 is the floor, the streak counts
   only that, and there are two rest days a month applied automatically.
3. **"Tap when you've said it."** — shows the two buttons and the swipe-up
   gesture, live, on a real first card.

Panel 3's CTA drops him **inside Core 1** — not onto a home screen, not onto a
summary. `.firstrun-dots` shows position. Skippable with a small `--ink-3` text
link, because forcing it on someone who reinstalls is worse than skipping it.

### 7h. Capture — `InboxScreen.tsx` (decision 4)

Label becomes **Capture** everywhere the user can see it: tab label, screen
heading, the field placeholder, empty state. **File names, the hook
`useInbox`, and everything under `src/features/inbox/` keep their current
names.** One giant field, radius `--r-md`, `--raised` fill, reachable in one tap.
Below it, the list of captured items, newest first, `--fs-3`.

---

## 8. Gestures — `useCardGestures.ts`, `CardActions.tsx`

Four ways to grade. **All four submit through `submit(grade)`. There is no other
path.**

| Input | Grade | Notes |
|---|---|---|
| Tap `Again` (ghost button) | `'again'` | Card returns later this session |
| Tap `Got it` (primary button) | `'good'` | The common case |
| **Long-press `Got it` ≥ 500 ms** | `'easy'` | Haptic-style visual confirm: the button scales to 0.97 and its fill deepens while held. Fire on release, not on timeout, so a slip can be cancelled by sliding off |
| **Swipe left** | `'hard'` | Decision 1 — `hard` was kept but does not get a button |
| **Swipe up** | `'good'` | Identical to tapping `Got it`. This is the "pass" gesture the hint refers to |

### 8a. Thresholds — use these exact numbers
- A swipe registers at **> 60px** of travel in the dominant axis **and**
  **> 0.3 px/ms** velocity, whichever completes first. Below both, it snaps back.
- The dominant axis wins outright — a diagonal drag is never both.
- **A left-swipe must not start within 40px of the left screen edge.** In Safari
  (not standalone) that region is the browser's back gesture and you will fight
  it and lose.
- Attach `touch-action: pan-y` to the card so vertical scrolling inside
  `.card-body` still works, and only claim the gesture once the threshold is
  crossed.

### 8b. Feedback during the drag
The card follows the finger with a **0.4 damping factor** — it moves, but less
than the finger, so it reads as weighted. On a committed swipe-left, the card
leaves to the left over `--dur` with `--ease`. On swipe-up, it leaves upward.
Never animate the incoming card from the same direction as the outgoing one.

### 8c. The swipe hint (U10)
Count how many cards have ever been shown in `localStorage` under
`speak.cardsSeen.v1`. If that count is **< 3**, render `.swipe-hint` — a small
upward chevron with a 1.6s ease-in-out loop, `--ink-3`, below the card. At 3 or
more, never render it again. Do not print the words "swipe up to pass" as static
text at any point.

### 8d. The urge chip (U4)
Full width, below the actions, height `--urge-h`. `--raised` fill, `--ink-2`
text, `--r-pill`. Tap → calls `logUrge()` → text becomes `Counted.` with
`.is-counted` for 2 seconds, then returns. It must not look like a button that
does something to the card. It is quiet on purpose.

---

## 9. Icons — `Icons.tsx` (U5)

Four inline SVG components, no icon library, no emoji, no unicode glyphs.

- 22×22 viewBox `0 0 24 24`, `fill="none"`, `stroke="currentColor"`,
  `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- `FeedIcon` — a stack of cards: one rounded rect with a second offset behind it.
- `CaptureIcon` — a plus inside a rounded square, or a downward arrow into a
  tray. Pick one and keep it simple.
- `HindiIcon` — the character **अ**, drawn as a `<text>` element in
  `currentColor` at the same optical weight as the strokes. This is the one case
  where a glyph is correct, because it names the language.
- `YouIcon` — a simple line chart: three points and two segments, rising.

Each takes no props beyond standard SVG props and inherits colour from the
parent. `aria-hidden="true"` on all four; the text label carries the meaning.

---

## 10. Acceptance criteria

Verify every one of these **by doing it**, not by reading your own code. State
*how* you verified each in your report.

1. `npm test` passes — **44 tests, all green.** You changed no logic, so any
   failure here means you broke something you were not supposed to touch.
2. `npm run build` passes with **zero TypeScript errors**.
3. At **375×812**: nothing scrolls horizontally on any of the five screens.
4. **The say-block is visible without scrolling on every one of the seven card
   types**, including the longest word card and the longest breath drill. Walk at
   least 20 cards to confirm. This is U8 and it is the criterion most likely to
   fail.
5. All four grade paths work and reach the hook: tap Again, tap Got it,
   long-press Got it, swipe left. Confirm `hard` and `easy` actually arrive by
   checking the card advances and the session continues.
6. Swipe up advances the card. Swipe left advances the card. Neither triggers
   the other.
7. Switching to Capture, हिंदी, You and back to Feed **does not restart the
   session** — the Core dots and the card position survive the round trip.
8. Hindi runs past its old end: advance **at least 15 Hindi cards** without
   hitting a dead end or a disabled control.
9. First run appears on a fresh profile (clear `localStorage`), takes three
   panels, and lands inside Core 1. It does **not** appear on the next load.
10. On a fresh profile, Progress shows the starting state, **not a zero hero**.
11. Every tappable target is **≥ 44px**. Measure the smallest one and report it.
12. **Zero console errors** on every screen and during every gesture.
13. `git status` shows exactly the 13 files in §3 and nothing else.

---

## 11. Constraints and traps

- **Do not change any logic to make the UI easier.** If a hook does not give you
  something you want, report it — do not reach into `features/`, `db/` or `srs/`.
- **Do not add a library.** No icon packs, no gesture libraries, no animation
  libraries, no CSS frameworks. Everything here is achievable with React, CSS and
  pointer events, and the bundle is a PWA that has to open instantly on a phone
  in a lift.
- **Do not add a dark theme.** Decision 5.
- **Do not use green as the accent.** The wireframes show `#0F7A57`; that is
  stale. Sky `--accent` is correct. If you find green anywhere in your output,
  it is wrong.
- **Do not write an empty state for the feed.** The queue never runs out. An
  empty state there is a dead end and dead ends send him back to Instagram.
- **Do not "fix" the seed content.** Two known content problems are noted in §7b
  — work around them visually, leave the JSON alone.
- **Do not remove `onMeasure`.** Breath measurements flow through it.
- iOS: `100vh` is wrong inside a standalone PWA. Use `100dvh`, which
  `--card-frame-h` already does.
- iOS: long-press raises the text-selection callout unless the element has the
  `.no-select` class from the token file. Apply it to the card and the buttons.
- **Do not commit. Never push.** A push is a production deploy.

---

## 12. Before you report done

- [ ] Every acceptance criterion in §10 verified — and you can say *how*.
- [ ] `npm test` green, `npm run build` clean.
- [ ] `git status` matches §3 exactly.
- [ ] No raw hex outside `Icons.tsx`; no raw px font sizes; no ninth type size.
- [ ] `tokens.css` and `contract.ts` are byte-identical to how you found them.
- [ ] Claim released in `.claude/ACTIVE-WORK.md`.

### Your report — write to `.claude/reports/AG-002.md`

1. Files changed, one line each on what changed.
2. Each of the 13 acceptance criteria: met / not met, **and how you verified it**.
3. **Deviations** — anything you did differently from this brief, and why.
4. **Couldn't do / uncertain** — be blunt. An honest gap costs far less than a
   confident wrong claim, and this is read by someone who will check.
5. Anything broken you noticed and deliberately left alone.

---

## 13. What comes after this — and why you are not doing it

Recorded so nothing is lost, **not** as an invitation. The product owner signs
off between phases; starting Phase 1 inside this task breaks that and makes the
review unreviewable.

- **Phase 1 — the Speaking Lab.** Microphone, live dB meter against a personal
  band, MPT tracker, SOVT/straw timer with a mandatory transfer rep. This is the
  block that actually changes how he speaks, it is full of things that fail
  silently (audio math, calibration), and it needs a real-device iOS test before
  a line is written. **Not yours.**
- **Phase 2** — volume ladder, pause trainer, emotional palette.
- **Phase 3** — describe/explain cards, pace & masking monitor, the AI expansion
  loop with its verify-cold gate.
- **Phase 4** — the live voice partner, approved only if it stays free.

None of those screens are drawn yet. When Phase 1 is briefed, it will come with
its own frames.

**If you finish early: stop.** Re-read §10 and verify something you claimed
rather than starting the next thing.
