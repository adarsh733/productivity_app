# ANTIGRAVITY BRIEF — SPEAK Phase 0: feed UI + seed content · 2026-08-12 · AG-001

## Read first
`D:\Adarsh\Mission AI\Productivity\speak\AGENTS.md`, then `speak\CLAUDE.md`, then
`speak\src\types\contract.ts` in full. Follow the file-claim protocol in
`.claude\ACTIVE-WORK.md` before writing anything.

## Goal
SPEAK is a PWA whose job is to win the moment Adarsh unlocks his phone — he
should open this instead of Instagram, and come out of it speaking better. The
logic is built, tested and committed. Two things are missing: the interface is
plain stubs, and there are only 42 seed cards.

You are building the interface a thumb wants to use, and the ~325 cards that
make the feed worth opening on day one. Both are visual/volume work where a
mistake is visible; none of the scheduling, storage or grading logic is yours.

## Your files (write ONLY these)
- `speak/src/components/feed/FeedScreen.tsx` — the feed
- `speak/src/components/cards/CardView.tsx` — the seven card renderers
- `speak/src/components/inbox/InboxScreen.tsx` — the 3AM box
- `speak/src/components/progress/ProgressScreen.tsx` — four stats
- `speak/src/components/hindi/HindiScreen.tsx` — the Hindi section
- `speak/src/components/shell/TabBar.tsx` — bottom navigation
- `speak/src/styles/components.css` — all component styling
- `speak/src/content/seed/10-words-en.json` — **80** `word` cards
- `speak/src/content/seed/11-swaps-en.json` — **40** `swap` cards
- `speak/src/content/seed/12-idioms-corporate.json` — **45** `idiom` cards
- `speak/src/content/seed/13-action-verbs.json` — **40** `action_verb` cards
- `speak/src/content/seed/14-pronounce.json` — **40** `pronounce` cards
- `speak/src/content/seed/15-say-it.json` — **35** `say_it` cards
- `speak/src/content/seed/16-breath.json` — **8** `breath` cards
- `speak/src/content/seed/20-hindi.json` — **40** `word` cards with `"lang": "hi"`

You may add new files under `speak/src/components/**`. Nothing else.

## Files Claude owns — DO NOT EDIT
`speak/src/types/**`, `speak/src/db/**`, `speak/src/srs/**`,
`speak/src/features/**`, `speak/src/sync/**`, `speak/src/lib/**`,
`speak/src/styles/tokens.css`, `speak/src/App.tsx`, `speak/src/main.tsx`,
`speak/src/content/seed/00-exemplars.json`, `speak/netlify/**`,
`speak/supabase/**`, and every config file at the repo root.

## The contract (already committed — build to this, don't change it)

**Types:** `speak/src/types/contract.ts`. Every card shape, `Grade`,
`QueueItem`, `QUEUE_RULES`, `SPOKEN_TYPES`.

**The feed's entire API** is `useFeed()` in `speak/src/features/feed/useFeed.ts`:
```ts
const feed = useFeed('core');
feed.ready        // false until IndexedDB has loaded
feed.item         // QueueItem | null — the card to show
feed.mode         // 'core' | 'endless'
feed.position     // 1-based, for progress dots
feed.total
feed.coreThreeDone
feed.streak
feed.cardsToday
feed.urgesToday
feed.setMode(m)
feed.submit(grade, { msSpent?, measure? })   // async
feed.logUrge()                               // async
```
`submit` handles scheduling, persistence, requeueing a failed card and advancing.
Call it and render whatever `feed.item` becomes. **Do not** import `db`,
`buildQueue` or `grade` in a component.

**The inbox API** is `useInbox()` in `speak/src/features/inbox/useInbox.ts`:
`{ items, pending, add(text), discard(id) }`.

**TTS** is `speak(text, { lang, rate })` from `speak/src/lib/speech.ts`. Use it
for `pronounce` and `say_it`. Never add an audio file or a network voice.

**Card props:** `CardView` takes `{ card, onMeasure? }`. Breath drills report
their seconds or count through `onMeasure`; `FeedScreen` passes that straight
into `feed.submit(..., { measure })`. Keep both.

**Styling:** every value from `speak/src/styles/tokens.css`. Eight font sizes
(`--fs-1`..`--fs-8`), one gutter (`--gutter`), four radii, one shadow, one
accent, and a per-card-type hue at `--t-<type>`. No raw hex, no raw px font
sizes, no new radii.

## What the interface must be

**FeedScreen** — one full-bleed card filling the viewport, not a box in a page.
- **Swipe up** advances, because his thumb is already trained for that. Buttons
  must still work; the gesture is in addition, not instead.
- Grades: `again` / `hard` / `good` / `easy`. `again` is visually separate from
  the other three — it means "I failed that", not "skip".
- Top row: mode pill, position, streak, and a small **"Felt the pull"** button
  wired to `feed.logUrge()`. That button is the point of the app; give it a real
  target size but a quiet style.
- When `coreThreeDone` and mode is `core`: one clear **"Keep going"** action into
  endless. It must be a choice, never automatic, and there must be **no
  congratulation screen that ends the session** — a dead end sends him back to
  Instagram.
- Card type is visible at a glance via `--t-<type>`.

**CardView** — seven renderers. The rule that is not cosmetic: **every card must
end with him having said something out loud.** If your redesign lets a card be
answered in silence, you have broken it. The `swap` timer, the `pronounce`
"hear it", the `say_it` pace playback and the `breath` stopwatch all stay.

**InboxScreen** — one field and a save button. No category picker, no tags, no
confirmation dialog. It gets used half-asleep at 3AM with one thumb; every extra
control is a reason not to bother.

**ProgressScreen** — four stats. **Urges redirected is the headline** and should
be the largest thing on the screen; it is the only number that measures what the
app is for. No charts in this phase.

**HindiScreen** — a simple browse-and-drill list of `lang: 'hi'` cards.

**TabBar** — Feed / Inbox / हिंदी / You. Feed is the default and the app opens
straight into a card.

## What the content must be

Follow `speak/src/content/seed/00-exemplars.json` exactly — same field names,
same tone, same length. File format: `{ "version": 1, "cards": [ ... ] }`.

- **Register:** everyday professional English, India, corporate. Not literary,
  not dictionary prose. Example sentences must be things a colleague would
  actually say out loud.
- **No invented idioms, no unnatural collocations, no calques from Hindi.** If
  you are not certain a phrase is genuinely used by native speakers, leave it
  out. Wrong content here teaches him wrong English and he has no way to detect
  it — this is the single most damaging mistake available in this task.
- `word` cards: the `say` field is a **production prompt** tied to his own life
  ("Describe a time you…"), not a definition check.
- `swap` cards: `weak` is a flabby phrase ("very tired"), `answers` are real
  one-word replacements, best first. `timerSec: 5`.
- `action_verb`: the `contrast` field is the value — how it differs from the two
  or three verbs people confuse it with.
- `pronounce`: `syllables` split with `·`, `stressIndex` 0-based and **within
  range** (the loader rejects the card otherwise). `commonError` should name the
  mistake an Indian English speaker actually makes.
- `say_it`: `marked` is `line` with `/` short and `//` long pauses. `targetWpm`
  125–145.
- `20-hindi.json`: everyday spoken Hindi, not शुद्ध हिंदी. Sentence framing over
  isolated words.
- **Every `id` unique across all files.** Duplicates are dropped by the loader.

## Acceptance criteria
1. `npm test` — 43 tests still pass. You changed no logic, so this must not move.
2. `npm run build` — zero TypeScript errors.
3. The loader reports **zero skipped cards**: open the console on boot and
   confirm no `[seed]` skip warnings. Card counts per file match the list above.
4. Core 3 → "Keep going" → 30 endless cards can be completed without a dead end,
   an error, or a card repeating inside those 30.
5. Swipe up advances the card on a touch device; the grade buttons still work.
6. "Felt the pull" increments the counter on ProgressScreen.
7. At 375×812: no horizontal scroll on any screen, every tappable target ≥44px.
8. Zero console errors at 375×812.
9. No raw hex or raw px font-size in `components.css` (`grep -nE "#[0-9a-fA-F]{3,6}|font-size:\s*[0-9]+px"` returns nothing).

## Constraints
- Do not edit any file outside "Your files". `git status` before you report.
- Do not change `src/types/contract.ts`. If something genuinely doesn't fit,
  stop and say so rather than widening a type to make your code compile.
- No new runtime dependencies. No CSS framework, no animation library, no icon
  package. Inline SVG if you need an icon.
- No microphone and no AI calls in this phase — both are Phase 1, and the
  contract already has room for them.
- iOS Safari is the only target that matters. Test at 375×812.
- Traps already hit: inputs below 16px make iOS zoom on focus (tokens.css
  handles it — don't override); `process.env` does not resolve in `src/` and
  that is deliberate.

## Self-check before you report done
- [ ] Every acceptance criterion verified — say *how* you verified each.
- [ ] Card counts per file confirmed by actually counting.
- [ ] Zero console errors at 375×812.
- [ ] No file outside "Your files" modified (`git status` to confirm).
- [ ] `src/types/contract.ts` unchanged (`git diff --stat` to confirm).

## Report when done — write to `.claude/reports/AG-001.md`
1. Files changed, one line each on what changed.
2. Each acceptance criterion: met / not met + how verified.
3. **Deviations** — anything you did differently than briefed, and why.
4. **Couldn't do / uncertain** — be blunt. In particular, flag any phrase or
   idiom you were not fully confident is real; a flagged doubt costs nothing, a
   confident wrong card teaches him wrong English for months.
5. Anything broken you noticed but left alone.

Do not commit unless told. **Never push** — a push is a production deploy.
