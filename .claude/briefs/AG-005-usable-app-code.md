# AG-005 — Make it a usable app (CODE slice)

**Written:** 2026-09-25 by Claude, after a full audit of commit `a2b84f3`.
**Runs in parallel with:** `AG-006-usable-app-content.md` (a second OpenCode chat).
The two slices touch **disjoint files** — see §2. Do not touch the other slice's files.
**Project root:** `D:\Adarsh\Mission AI\Productivity` · **App root:** `speak/`
(Vite + React 18 + TypeScript PWA; `npm run dev`, `npm test`, `npm run build` from `speak/`).

**Do not stop to ask questions.** Every product decision is already made in this
brief. If something is genuinely impossible, skip it, keep going, and say so in the
report. Work stage by stage; commit after each stage (rules in §3).

---

## 0 · Who this is for and what "done" means

One user: Adarsh. He opens this PWA on his iPhone instead of Instagram. He wants to:

1. **Learn**: words, phrases, idioms, practical Hindi, and ideas (history, geopolitics,
   philosophy, psychology), and have the app **remember** what he has learned.
2. **Fix how he speaks.** This was measured, not guessed. Read
   `docs/VOICE-PROFILE.md` in full before you start Stage 3. The short version:
   - **Too loud.** His everyday volume is about level 4 of 5. The goal is level 2 as
     his default and level 1 when he wants it. The cause is pushing too much air.
     His breath capacity is normal, so **never build breath-capacity drills**.
   - **Too fast, and words run together.** Loud sound drowns out the quiet word
     endings that follow it, so he needs more space between words than most people.
     Target: measure his normal pace, then bring it down about 10%.
   - **Uses loudness for emphasis.** The fix is to pause before the key word
     instead of saying it louder.
   - **Headline numbers:**

     | Measure | Baseline, Aug 2026 | 12-week target |
     |---|---|---|
     | "aaah" held on one breath at normal volume | 15–16 s | 24–25 s |
     | Same, held softly | 25 s | stays at 25 s or more |
     | Gap between the two | ~10 s | under 3 s |
     | Average loudness vs his calibrated normal | not measured | 6–8 dB quieter |
     | Holding the quietest voiced level (level 1) | unstable | 60 s without dropping out |
     | Words per minute | not measured | his own baseline minus ~10% |
3. **Tell stories and explain things well**: incidents to a friend, office updates,
   feelings, opinions, his life story.

**Done means:**
- He can open the app, scroll and learn, and the app brings back words at the right time.
- Every day there is one obvious place to do the 12-minute voice routine.
- **Every** recording, in any mode, trains volume and pace live and shows honest
  numbers afterwards.
- A weekly check shows the headline numbers above moving over time.

---

## 1 · Rules. Breaking one fails review.

1. Read and obey `AGENTS.md` (workspace root) and `speak/AGENTS.md`. Claim your
   files in `.claude/ACTIVE-WORK.md` before writing, and release them at the end.
2. **Never show a claim the app did not measure.** No canned praise, no fake numbers,
   no "🔥 1" when the streak is 0. If a number cannot be measured (no mic, no
   calibration, speech recognition unavailable), show "—" with a one-line reason.
3. **The microphone is never a gate.** Feed, Browse and You must work fully with the
   mic denied. When permission is denied, show a clear message on the recording
   screen with a way out. Never leave a dead button.
4. **Save every source file as UTF-8** (no BOM). The last pass saved 14 files in a
   Windows code page, and every emoji turned into "?". Do not write files with
   PowerShell `Set-Content` or `Out-File` without `-Encoding utf8`. After each stage,
   run the encoding check in §5.
5. Components never import `db`, the scheduler or the queue. Logic goes in hooks
   under `src/features/**`, per `speak/AGENTS.md`.
6. Styling comes only from `src/styles/tokens.css` variables. Light theme only.
   At 375×812 nothing scrolls sideways, and every button is at least 44 px.
7. **No new npm dependencies** unless one is truly unavoidable; justify it in the report.
8. `npm test` and `npm run build` stay green after every stage. Add tests for any
   new logic (numbers, scheduling, crediting, streaks).
9. **Never push.** A push to `master` deploys to production.

---

## 2 · File partition (disjoint with AG-006)

**AG-006 (content) owns — do not edit:**
`speak/src/content/seed/*.json` (all of them, including the new `24-situations.json`),
`speak/src/content/staging/**`, `speak/scripts/content-pipeline/**`.

**You (AG-005) own everything else under `speak/`**, plus
`docs/PLAN.md`, `docs/PROBLEM-MAP.md`, `docs/known-issues.md`, `speak/CLAUDE.md`.

The only coupling between the two slices is the data shape in §2.1. Add it to
`src/types/contract.ts` **exactly as written**; AG-006 is writing JSON to this
shape right now. Also note: while AG-006 runs, seed files may change under you.
Do not write tests that assert exact seed card counts.

### 2.1 · Contract additions (the shared shape; copy verbatim)

```ts
// in CardType, add:
  | 'situation' // a real-life speaking prompt: incident, office call, feeling, opinion, life story

export type SituationKind = 'incident' | 'office_call' | 'feeling' | 'opinion' | 'life_story';

export interface SituationCard extends CardBase {
  type: 'situation';
  kind: SituationKind;
  title: string;                    // ≤ 40 chars, e.g. "The missed flight"
  prompt: string;                   // second person, ≤ 200 chars: what to talk about
  beats: [string, string, string];  // the three-part structure to follow
  targetVocab: string[];            // 0–4 words or phrases worth using
  targetSec: 30 | 45 | 60 | 90;
}

// ExplainCard: add an optional field
  /** 2–3 plain sentences of stable, well-established background. Read before explaining. */
  primer?: string;

// DescribeCard: make the image optional and add a text scene
  imagePath?: string;   // was required; text-only scenes ship without images
  title?: string;       // ≤ 40 chars
  scene?: string;       // 1–3 sentences painting the scene when there is no image
```
Add `SituationCard` to the `Card` union, and teach `seedLoader.ts` to validate
`situation` cards and the new optional fields (skip bad cards, never throw, as now).
In `seedLoader.ts` ~36, a `describe` card currently requires `imagePath`. Change it
to require `alt`, `prompt`, `beats`, `targetVocab`, `targetSec`, **and either
`imagePath` or `scene`**. AG-006 ships text-only scenes, which would otherwise be
silently skipped.

---

## 3 · Git

- Create branch `v4-usable` from `master` before any edit.
- Commit **at the end of each stage** with `git add <explicit paths>`. **Never
  `git add -A` or `git add .`**: AG-006 is writing seed files in the same folder and
  they must not land in your commits. Message: `AG-005 stage N: <what>`.
- Never push. Never rewrite history.

---

## 4 · Stages (in order; each has acceptance checks)

### Stage 1 — Fix what is broken and dishonest (do this first, fully)

1. **Broken text encoding.** These files are not valid UTF-8 and/or contain emoji
   that were replaced by literal `?`:
   `components/capture/CaptureSheet.tsx`, `components/feed/FeedScreen.tsx`,
   `components/onboarding/FirstRun.tsx`, `components/speak/SpeakScreen.tsx`,
   `components/you/YouScreen.tsx`, `components/browse/BrowseScreen.tsx`,
   `components/browse/DeckModal.tsx`, `components/cards/CardDetailSheet.tsx`,
   `components/cards/CardFace.tsx`, and `styles/{base,browse,capture,cards,feed,index,modal,onboarding,you}.css`.
   Restore every intended icon and character. `git show a2b84f3^:speak/<path>`
   has the older versions of some of these; use them as a reference for which
   emoji belonged where. **Buttons that say different things in different states
   (save vs saved) must look different.** Best option: replace the button emoji
   with the SVG icons in `components/shell/Icons.tsx` (add icons there as needed),
   because SVGs cannot be broken by encoding.
2. **Swipe left "less of this"** saves a downweight, but the queue never reads it.
   Pass `profile.downweights` through `useFeed` → `buildQueue` → `getCardMultiplier`
   (`useFeed.ts` ~118–171, `queue.ts` ~68 and ~310). Test: a downweighted type
   shows up measurably less often across a 200-card queue, and returns after 7 days.
3. **Swipe right** should only save. If the card is already saved, show "Already saved"
   and do not unsave it.
4. **Swipe down on the first card** must spring back into place, not fly off-screen
   (`useCardGestures.ts` ~155, `FeedScreen.tsx` ~97–153).
5. **Spoken-rep crediting.** `PlaybackReview.tsx` ~90–99 credits a rep plus XP for any
   attempt of 2 s or more, even silence. Replace it with the existing
   `creditSpeakingAttempt` (`features/session/day.ts:182`), called from a hook, not
   the component. Credit only when the attempt lasted ≥ 2 s **and** had ≥ 1.5 s of
   voiced audio (frames at least 10 dB above the measured noise floor; use
   `DbAccumulator`/`PhonationDetector` from `lib/audioMeter.ts`). Crediting the same
   attempt twice must be impossible. Remove "🔥 1 when streak is 0" (~178) and the
   unconditional "Rep Complete (+XP)" (~146); show the real result.
6. **Mic denied / unavailable**: `useSpeakingAttempt.ts` ~194–200 sets an error that
   `AudioRecorder.tsx` never shows. Show it, explain how to allow the mic in iOS
   Safari in one line, and offer "Back".
7. **Speech recognition restarts lose earlier words** (`useSpeakingAttempt.ts`
   ~255–275). Keep finalised text from every restart, so words per minute and
   target-word checks cover the whole attempt. Use `hi-IN` when the card is Hindi
   (`lang: 'hi'`), otherwise `en-IN`. If recognition is unavailable, words per
   minute shows "—". Never estimate it from nothing.
8. **Streak display**: the morning after one missed day, the streak must not show 0
   while a freeze covers that day (`day.ts` ~293–331). Add a test.
9. **Goal labels** must match everywhere. Use Casual 10 XP ≈ 3 min, Regular 30 XP ≈ 7 min,
   Serious 60 XP ≈ 15 min in both `FirstRun.tsx` and `GoalSelector.tsx`.
10. **Rename to Articulate** everywhere the user sees a name: `index.html` title and
    apple title, the PWA manifest in `vite.config.ts`, the feed header. Keep "Speak"
    as the tab name.
11. **"Say it" on a card** must open a prompt that fits that card type. Today, action
    verbs, story moves, teach-backs and breath cards fall back to an unrelated
    generic prompt (`RapidRepMode.tsx` ~90–95). Build a prompt from the card's own
    fields, e.g. "Use *lurched* in a sentence about your commute."

**Accept:** the §5 encoding check passes; the app renders no `?`-for-emoji anywhere
(walk all four tabs at 375×812); new tests for items 2, 5 and 8 pass.

### Stage 2 — The app remembers what he learns (spaced repetition, wired)

Today nothing writes to `db.reviews`, so every card is "new" forever and the deck
progress rings are always 0%. `srs/scheduler.ts` (SM-2) is built and tested but
nothing uses it.

1. **First time he sees a card** in the Feed or a Browse deck (he advances past it):
   create `newReview` and grade it `good`, so it comes back tomorrow. Log `card_viewed`.
   **Do not ask him to grade a card he is meeting for the first time.**
2. **When a card comes back because it is due**, the bottom buttons become
   **"Show again soon"** (grade `again`) and **"Knew it"** (grade `good`). Add a
   small "Review" tag on the card so he knows it is a repeat. Remove the long-press
   `easy`.
3. **Queue mix** (`srs/queue.ts`): due reviews come first, up to 1 in every 3 cards;
   new cards fill the rest, weighted by interests and downweights as now. A card
   graded `again` reappears within about 10 cards. No card appears twice on the same
   day otherwise. Hindi stays about 1 in 8. Keep the existing anti-repetition rules.
   When there are no new cards left, serve due and oldest-seen cards and say so quietly.
4. **Using a word out loud counts.** When a spoken attempt on a word, idiom, phrase,
   feeling or verb card detects the target word, grade that card `easy`.
5. **Browse deck view** (`DeckModal.tsx`): make it swipeable using
   `useCardGestures`, same gestures as the Feed. Views there count as "seen" and earn
   the same XP. Deck rings now show real seen/total.
6. **Breath cards** no longer appear in the feed (already true) and their drills now
   live inside the voice routine (Stage 3). Keep them out of Browse.

**Accept:** tests prove that a seen card is scheduled for tomorrow, due cards are
served before new ones, `again` resurfaces within 10 cards, and deck rings count
reviews. In the browser, advance 10 cards, reload, and confirm the rings moved.

### Stage 3 — The voice lab comes back (this is the core of the pass)

Commit `a2b84f3` deleted the voice-training code that the spec said to keep. Restore
it from `a2b84f3^` and bring it up to date. The math is sound and was tested.

```
git show a2b84f3^:speak/src/features/lab/routine.ts          (+ routine.test.ts)
git show a2b84f3^:speak/src/features/lab/useLab.ts
git show a2b84f3^:speak/src/features/lab/useMptTest.ts
git show a2b84f3^:speak/src/components/reset/SessionRunner.tsx
git show a2b84f3^:speak/src/components/studio/LiveDbMeter.tsx
git show a2b84f3^:speak/src/components/studio/MptTracker.tsx
git show a2b84f3^:speak/src/components/studio/VolumeLadder.tsx
git show a2b84f3^:speak/src/features/reset/useMissionMeter.ts  (reference)
```
Still present and unused: `features/lab/calibration.ts` (baseline, target band,
`DriftDetector`, `readMpt`, `isMptDue`) and `lib/audioMeter.ts`
(`AudioMeterController`, `PhonationDetector`, `DbAccumulator`). Reuse them. **Do not
rewrite the math.** Restyle the restored components with the current stylesheets
(`styles/speak.css` + tokens); the old `components.css` is gone and stays gone.

**New Speak tab layout, top to bottom:**

1. **Today's routine** is a large card: "12-minute voice routine · Day N", with a
   tick once today's routine is done. It opens `SessionRunner`, which runs the five
   blocks from `VOICE-PROFILE.md` §6 (A Release → B Straw work + **the transfer
   moment** → C Volume ladder → D Resonance → E Pause and tone), with one-line cues.
   It can be paused and resumed. It measures wherever `routine.ts` marks a step
   `metered`.
2. **Quick voice drills**, each 1–3 minutes and each with a live meter:
   - **Quiet voice**: hold level 2 for four sentences. The meter shows his target
     zone; drifting above it for more than 1.5 s shows "Softer. Pause instead."
     (`DriftDetector`). Report the % of time spent in the zone.
   - **Volume ladder**: the same sentence at 5→4→3→2→1 and back. Show which level
     each attempt landed on, relative to his calibrated normal.
   - **Level-1 hold**: quiet but voiced, as long as possible, up to 60 s. Detect when
     his voice drops out (`PhonationDetector`) and record the longest hold.
   - **Pause, don't push**: a sentence with one key word marked. He emphasises it
     only by pausing before it. Measure it: a gap of ≥ 300 ms right before the word
     **and** that word no louder than +3 dB over the sentence average. Show
     pass/fail per rep with the two measured numbers.
   - **Pacer**: a sentence or short paragraph, taken from `say_it` cards and
     sentences in the seed, lights up word by word at his target pace, with a
     visible beat at each pause mark. He reads along while recording. Afterwards
     show his measured pace next to the target.
   - **Emotional palette**: one sentence in 2 of the 6 modes from VOICE-PROFILE §5
     (rotate daily). Record both and play them back to back. No score, just listening.
3. **Weekly check** (shows a "due" dot after 7 days): the breath-length test, "aaah"
   held at normal volume, best of 3, then held softly, best of 3, using
   `useMptTest` + `PhonationDetector`. Show the loud-to-soft gap. Save as a
   `VoiceSample`.
4. **Talk it out**, the existing modes: Rapid Rep, 60-Second Story, Situations
   (was Incident Drill), Describe This, plus **Explain an idea** and **Teach it back**.
   Stage 5 feeds them real content.
5. A small **Mic & calibration** row at the bottom: run the mic self-test
   (`runMicSelfTest`) and recalibrate.

**Calibration** (the deleted `CALIBRATION_STEP` in `routine.ts`): the first time he
starts anything that measures loudness, ask for 30 s of "talk about your day at the
volume you'd actually use". It is skippable. Until calibrated (`isCalibrated`),
meters show raw level with no target zone and **no "level N" claims**.

**Accept:** restored `routine.test.ts` passes, plus new tests for the pause-drill
check and the level-1 hold timing. The routine runs end to end in the browser with
the mic denied (timed cues only, no crash) and with the mic allowed. The weekly
check saves a `VoiceSample`.

### Stage 4 — Every recording trains volume and pace

Make this true for **every** recording screen (`AudioRecorder.tsx`, all modes, and
"Say it" from any card):

1. **While recording**, show on one screen with no scrolling: the prompt, the target
   words, elapsed time, and a **live loudness bar with his target zone shaded**. If he
   stays above the zone for more than 1.5 s, the bar turns amber and says "Softer".
   Keep it calm: no sound, no vibration.
2. **Afterwards, show measured numbers only**, each labelled "measured on this phone":
   - duration
   - words per minute vs his target
   - number of pauses
   - average loudness vs his calibrated normal, in dB and as a level (only if calibrated)
   - % of time above the target zone
   - which target words he used

   `useSpeakingAttempt.ts` ~403–410 already computes average loudness and throws it
   away; pass it through.
3. **Pace target**: his baseline is the median words per minute of his first 5 valid
   attempts of 20 s or more. His target is baseline × 0.9. Until the baseline exists,
   use 140 words per minute and label it "starter target". Store the baseline in the
   profile; recompute weekly. Add tests.
4. Save each attempt's measured numbers with the recording, so Stage 6 can chart them.

**Accept:** tests cover the pace baseline and target maths; in the browser, a
recording shows the live bar and the after-screen shows only real values or "—".

### Stage 5 — The speaking modes use real content, not three hard-coded prompts

`DescribeMode.tsx`, `IncidentMode.tsx` and `SixtySecMode.tsx` each hard-code three
software-office prompts (e.g. `IncidentMode.tsx` 8–30). Replace them with hooks that
serve cards from the database:

- **Situations** → `situation` cards, with a kind filter (Incident · Office call ·
  Feeling · Opinion · Life story), random-without-repeat.
- **Describe This** → `describe` cards. When there is no `imagePath`, show `title`
  and `scene` as the picture: a large, well-set text panel. Never show placeholder
  images. Delete the placeholder files in `public/assets/scenes/` that are solid
  colours (check each one), and their `metadata.json` entries.
- **60-Second Story** → `story_move` cards: apply this technique in a 60 s story.
- **Explain an idea** → `explain` cards. Show `primer` first (read it), then the
  angle, beats and a 60 s timer.
- **Teach it back** → `teach_back` cards.
- Add `situation` to Browse as a **Situations** deck and to the feed at a low rate
  (about 1 in 15, higher if the "Storytelling" or "Speaking with presence" interest
  is on). Add **Ideas** (`explain`) and **Feelings** decks to Browse if they are missing.

**Accept:** with AG-006's content present, each mode shows a different prompt every
time for at least 20 opens. With the content missing, each mode shows a friendly
"No prompts yet" message and does not crash.

### Stage 6 — The You tab tells the truth about progress

1. **Voice progress** at the top: the headline numbers from §0 as small line charts
   over time (plain SVG, no chart library). Seed each chart with the Aug 2026
   baseline as the first point, labelled "Aug 2026 self-test", and draw a target
   line. Show only measured points.
2. **Recordings**: a list of saved attempts (`db.recordings`) with playback, the
   prompt, date and measured numbers. Add a "Listen back tomorrow" nudge: a subtle
   badge on recordings from yesterday (VOICE-PROFILE §7 says to listen a day later).
3. **This week**: new cards met, cards reviewed, words used out loud, spoken reps,
   routine days completed, and the streak. All counted from stored events.
4. **"Opened this instead"**: every app open, counting any open after 30 minutes
   away, adds 1 to a counter via the existing `logUrge` path (`useFeed.ts` ~287).
   Show "You opened Articulate instead of scrolling N times this week". This is his
   main success number.
5. **Captured notes**: the Capture sheet saves into `db.inbox`, but nothing shows it.
   Add a "Notes" list in You (read and delete).
6. Remove any statistic that is not computed from stored data.

**Accept:** every number on the You tab can be traced to a query. Test the weekly
counters with fake-indexeddb.

### Stage 7 — AI feedback: tidy and honest

In `netlify/functions/ai.ts`:
- Provider order is **Gemini → Groq → Anthropic**; Gemini was the locked decision.
  Keep Anthropic only as a last fallback, and update its model to `claude-haiku-4-5`.
- The client never shows raw provider errors. No key or offline means no AI section
  at all, plus one grey line: "AI notes need internet."
- **Quote check:** the feedback must quote his actual words. If the quoted phrase is
  not in the transcript (case-insensitive), drop that note. Add a test.
- Send the **transcript only**, never audio.

### Stage 8 — Backup (only after Stages 1–7 are green)

`src/sync/supabase.ts` is imported by nothing and the outbox grows forever. Wire it
up only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set: push the
outbox on app start, on `visibilitychange` to hidden, and every 5 minutes; empty
the outbox on success; never block the UI; never read from Supabase during a
session. Without the env vars, do nothing silently. If this is not finished cleanly,
leave it unwired and say so in the report.

### Stage 9 — Docs and report

- Update `speak/CLAUDE.md` (it still describes "Core 3"), `docs/PLAN.md` and
  `docs/PROBLEM-MAP.md` so they state what actually exists. No claims beyond the code.
- Append anything you judged not worth fixing to `docs/known-issues.md`.
- Write `.claude/reports/AG-005.md`: each stage done / partial / skipped, with file
  paths, test count before and after, and **a blunt list of what you could not do or
  are unsure of**.
- Release your claim in `.claude/ACTIVE-WORK.md`.

---

## 5 · Checks to run after every stage (from `speak/`)

```bash
npm test
npm run build
# encoding check, must print nothing:
for f in $(git ls-files src index.html vite.config.ts); do iconv -f UTF-8 -t UTF-8 "$f" >/dev/null 2>&1 || echo "BAD $f"; done
grep -rnE "'\?{2,}|>\s*\?{1,4}\s*<|\?\? [A-Z{]" src --include=*.tsx | grep -v test
```
Then walk all four tabs at 375×812 in a browser: zero console errors, nothing
scrolls sideways.

## 6 · If you run short of time or context

Priority: **Stage 1 → 3 → 4 → 2 → 5 → 6 → 7 → 8**. Stop at a clean commit. Write
the report with exactly where you stopped and what the next stage needs.
