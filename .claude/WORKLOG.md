# WORKLOG — Productivity workspace

Newest session first. One terse line per agenda item as it completes, plus any
unplanned work. This is the month-end record of what got built.

---

## Session — 2026-08-15 (Sat, 16:12) · Claude · window C-20260815-1612

**Agenda (Adarsh: "codex restructured everything — check if anything's
implementation is pending or are we good to push, and start using it on Netlify"):**
1. Audit the Codex product-reset build against the plan of record.
2. Establish what is actually reachable from the running app vs. dead code.
3. Establish deploy readiness (build, secrets, Netlify config, remote).
4. Push and deploy — pending Adarsh's call once the gaps are on the table.

**Done:**
- [x] Verified the build in-place: `npm test -- --run` **123/123 green**,
      `npm run build` clean (390 kB JS / 31.7 kB CSS, PWA precache generated).
- [x] Walked the whole reset product at 375×812 in the pane: 4-step onboarding →
      Today → 60-second session → attempt 1 → feedback → redo → comparison →
      save → Progress shows **1 completed loop**. **0 console errors.** The loop
      Codex claims is complete does, in fact, run.
- [x] **Traced reachability — the app is one hardcoded mission wide.** Every
      entry point (Today, Coach, all 8 Practice lanes incl. Hindi, 60s/3min/20min)
      lands on the same office mission, "explain why an AI feature launch is
      premature". Verified by clicking the Hindi lane and landing on the English
      office runner. Feedback is 4 fixed sentences with no transcript behind them.
- [x] **Dead-code sweep.** Nothing imports `FeedScreen`, `HindiScreen`,
      `InboxScreen`, the old `ProgressScreen`, `useFeed`, `useLab`, `LiveDbMeter`,
      `MptTracker` or `VolumeLadder`. The 368 seeded cards, the SM-2 scheduler,
      the Core-3/Endless queue and **the whole Phase 1 Speaking Lab** are
      unreachable from the UI. `ensureSeeded` still runs on boot and writes 368
      cards nobody reads (console: `[seed] 368 cards (0 new), 7 retired`).
- [x] **Sync is unwired.** `backup()` has zero callers anywhere in `src`. Read
      the live IndexedDB: **183 rows queued in `outbox` and nothing drains them.**
      Clearing Safari data loses everything; restore-on-new-device does not work.
- [x] **No audio is recorded.** No `MediaRecorder` in the codebase — only the
      analyser meter. So "hear the second attempt improve", the product's stated
      main retention hook, does not exist yet; Progress's voice archive is copy.
- [x] Two further defects found by reading: `finishLoop` adds the *nominal*
      duration to `secondsActive` (tap through a 20-min session in 90 s and it
      still claims 20 min), and `calibrationSamples` is read by Progress but
      never written by any reset flow, so "Baseline samples 0 / 7" is frozen.
- [x] Deploy readiness established: remote is `adarsh733/productivity_app`,
      **no Netlify site linked**, secrets clean (`.env` gitignored, only
      `.env.example` tracked), but **two netlify.toml files disagree** —
      root says `publish = "speak/dist"` under `base = "speak"`, `speak/`'s own
      says `publish = "dist"`.

**Then (Adarsh: "you fix whatever is required and then push the code, I'll
connect to netlify, guide me for that as well"):**

- [x] **Audio recording and playback built** — the product's central promise
      ("hear the second attempt improve") existed only as copy. `MediaRecorder`
      now writes the meter's *own* stream (added `AudioMeterController.mediaStream`;
      a second `getUserMedia` would hand back an independent stream and on iOS
      can steal the first one's track), container probed per browser
      (`audio/mp4` on Safari, `audio/webm` elsewhere — an unsupported string
      throws). Attempts are saved to a new Dexie **v3 `recordings`** store the
      moment they stop, not at the end of the loop, and played back on the
      feedback screen, the comparison screen and in Progress. Capped at 200
      recordings — unbounded audio fills the storage quota and then *every*
      write starts failing, day record included. **Blobs are never enqueued for
      sync**; audio stays on the device.
- [x] **Content layer built — `src/content/missions.ts`.** 21 missions across
      all eight lanes. Today rotates the lane by date; Practice shows each
      lane's actual prompt for today; the Hindi lane serves Hindi. Previously
      every entry point in the app ran the same office prompt.
- [x] **The 368 seeded cards are reachable again** — `useSessionBlocks` feeds
      Voice reset / Volume / Precision / Vocabulary from the deck (breath drill,
      marked say-it line, pronounce card with its common error, word card plus a
      Hindi word) instead of four hardcoded strings, rotated by date. Verified
      live: four different real cards across four blocks.
- [x] **Fabricated feedback removed.** The app was asserting "Your recommendation
      had a clear direction" about audio nothing had listened to. Replaced with:
      play attempt 1 back → pick one of three authored corrections → that choice
      becomes the redo target. Honest, offline, and the redo is gated on making
      the choice. This is the seam a model plugs into later.
- [x] **Practice minutes are now honest** — `activeSec` accumulates one tick at
      a time in the reducer instead of crediting the nominal duration on
      completion. Verified against IndexedDB: a 2 s + 3 s loop added exactly 5 s.
- [x] **Calibration actually advances** — `updateCalibration` is now called on a
      completed comparable (`free`) session, so "Baseline samples 0 / 7" can
      reach 7 and the volume band can stop being the generic placeholder.
- [x] **Outbox drains** — `push()` had no caller anywhere, so 183 rows had piled
      up and "backed up" was never true. Now called on boot, after a completed
      loop and after a redirected urge; no-ops when unconfigured or signed out.
      Progress shows backup state plainly instead of implying it.
- [x] **`netlify.toml` conflict fixed** — root had `publish = "speak/dist"`
      under `base = "speak"`, which resolves to `speak/speak/dist` and fails the
      deploy. Both files now agree on base-relative paths.
- [x] **143 tests green** (was 123; +20 covering missions, lanes, honest time
      accounting, v1-snapshot rejection and the container probe), build clean.
      Verified at 375×812 on a clean load: **0 console errors**, no horizontal
      overflow, smallest tap target 44px, all four tabs, full Hindi-lane loop
      through to Progress.
- [x] Committed and pushed to `adarsh733/productivity_app`.

**Still open / unverified:**
- The mic → recorder link could not be exercised here — the Browser pane blocks
  capture. Everything downstream *was* proven in-browser (MediaRecorder chose
  `audio/mp4`, produced 21 kB, round-tripped through the `recordings` store and
  yielded a playable blob URL). **First real check is Adarsh's iPhone.**
- Still deferred: real transcript/AI feedback, the Day-1 habitual/quiet/story
  baseline recording, voice Capture, capture→mission generation.
- Netlify site, Supabase project and the two API keys remain his to create
  (`docs/SETUP.md`).

---

## Session - 2026-08-15 (Sat, 13:09) - Codex - window C-20260815-1309

**Agenda (Adarsh approved the reset wireframes and asked to start building):**
1. Replace the feed/card shell with the approved Today / Coach / Practice / Progress IA and global Capture.
2. Build the first complete Today -> session -> Record -> Feedback -> Redo -> Progress vertical slice.
3. Make navigation, drafts, Rescue, onboarding and every session checkpoint restore after leaving or closing the app.
4. Preserve the existing Dexie, microphone-analysis, calibration, session and sync foundations.

**Done:**
- [x] Added a versioned reset snapshot/reducer and four regression tests. Active block, remaining time, session stage, environment, duration, selected tab, Capture draft, Rescue step, completed attempts and comparison state checkpoint synchronously to local storage.
- [x] Foreground loss and `pagehide` pause active work. Reload during a live attempt returns to a safe restart point while retaining completed blocks and completed attempts; a browser cannot keep an open microphone stream or incomplete audio buffer alive after termination.
- [x] Replaced the visible shell with Today, Coach, Practice and Progress plus global Capture; added reset onboarding with environment choice, mic self-test and 30 cm setup.
- [x] Built the 60-second, 3-minute and 20-minute entry paths, six-block runner, live relative-volume meter, authored local feedback contract, immediate redo, A/B attempt summary, Rescue off-ramp, Capture draft/queue and Day 1/progress states.
- [x] Completed loops write to the existing `labSessions`, `days`, `voiceSamples` and sync outbox stores without changing the shared contract or Dexie schema.
- [x] Verified at 375x812: complete feedback-redo loop appears as 1 in Progress; reload restored Block 1 at exactly 02:59; Capture draft, Practice tab and Rescue challenge restored; 0 horizontal overflow, 0 targets under 44px, 0 console errors.
- [x] 123/123 tests green; production build clean. Nothing committed or deployed.

**Still deliberately deferred after this first production slice:** full habitual/quiet/story baseline recording, persistent audio blobs/playback, real transcript/AI upload and failure handling, voice Capture, generated-mission approval/editing, lane-specific missions instead of the shared office mission, and the mature 12-week archive visualizations.

---

## Session - 2026-08-15 (Sat, 12:14) - Codex - window C-20260815-1214

**Agenda (Adarsh: "before wireframing make the final structured plan"):**
1. Consolidate the product reset into one standalone source of truth.
2. Replace the isolated weekly curriculum with balanced daily practice and rotating missions.
3. Define the relative-decibel protocol, content system, Gemini/Groq roles, scope boundaries, delivery stages, and success measures.
4. Provide an explicit handoff for a separate wireframing chat without treating recommendations as user-approved decisions.

**Done:**
- [x] Added `docs/PRODUCT-RESET-PLAN.md`, a complete product and wireframing brief covering the 20-minute daily system, Impulse Rescue, comparable versus anywhere volume measurement, authored/cached/AI-generated content layers, feedback contract, proposed information architecture, progress model, reuse/park decisions, delivery sequence, required flows and edge states, and mobile constraints.
- [x] Included a copy/paste prompt for the wireframing chat and an explicit instruction not to describe recommendations as approved without Adarsh's confirmation in that chat.
- [x] No application files, existing wireframes, or existing `docs/PLAN.md` were changed. Nothing committed or deployed.

---

## Session — 2026-08-13 (Thu, 16:46) · Claude · window C-20260813-1646

**Agenda (Adarsh: "implement the next phase"):**
1. Establish where Phase 1 actually stands (three standalone audio components
   exist from 2026-08-12; none are wired, persisted or calibrated).
2. Phase 0 of `DELEGATION.md` — plan + file partition + acceptance criteria,
   approved before any code.
3. Phase 1 of `DELEGATION.md` — write and commit the contract: types, Dexie v2
   migration, the routine as data, the audio math, the calibration rules.
4. Emit one ANTIGRAVITY BRIEF (AG-003) for the Lab UI slice.
5. Build Claude's critical slice in parallel: audio math + session state +
   calibration + the breath-content correction.
6. One review pass off `git diff` + the AG-003 report.

**Done:**
- [x] State established. Phase 0.5 closed; Phase 1 is ~15% done and none of it
      runs: `LiveDbMeter`/`MptTracker`/`VolumeLadder` are unmounted (no LAB tab),
      write nothing to Dexie, and the dB target band is hardcoded rather than
      derived from his own baseline. **`MptTracker` reads the loud-to-soft gap
      backwards** — it congratulates a ≥5 s gap, which is the defect the whole
      phase exists to shrink (baseline ~10 s → target < 3 s).
- [x] **Two decisions taken** (locked as PLAN §8 rows 16–19): the Lab runs all
      five blocks from day one with only A+B metered, and it gets the **fifth
      tab in second position**. Also locked: the real-device mic test is run by
      the app rather than off a checklist, and MPT is weekly, not daily.
- [x] **Contract written and committed to the tree** — `LabStep` / `LabBlock` /
      `LabSession` / `VoiceSample` / `MicProfile` / `LAB_RULES`, calibration
      fields on `Profile`, two new fields on `DayRecord`. Additive only: every
      Phase 0 shape held, as the Phase 0 contract said it had to. Dexie **v2**
      (v1 stores carried forward — verified against a populated database, not
      assumed), Supabase `lab_sessions` + `voice_samples` with RLS, and
      `restore()` extended so the 12-week trend and the calibration survive a
      new device.
- [x] **M11 live meter + M10 MPT, the maths.** `PhonationDetector` gives MPT a
      mic-driven auto-stop with hysteresis and false-start rejection, credited
      to the last voiced frame — the clock is no longer stopped by his thumb,
      which was measuring reaction time on top of breath. `DriftDetector`
      debounces the nudge over 2 s with a 1.5 s hold, so one loud syllable says
      nothing and a pause is never flagged as "too quiet". Meter smoothing
      dropped 0.8 → 0.3 so the nudge can actually see a driven attack.
- [x] **Week-1 personal calibration.** The band is derived from his own baseline
      over seven sessions, and split in two: a 2 dB *average* target (what gets
      scored) and a 10 dB *live* band (what the meter shows). A 2 dB live meter
      would sit outside the band permanently and be ignored inside a day.
- [x] **M8 + M9 session runner.** The 12-minute routine as data, blocks A–E in
      the order the voice profile sets. The three transfer reps are mandatory,
      have no skip control, and **do not auto-advance when their timer hits
      zero** — that enforcement is the point of the phase.
- [x] **The real-device mic test is now the app's job**, not a checklist:
      `runMicSelfTest()` records sample rate, whether `autoGainControl:false`
      was actually honoured, and the room noise floor into `Profile.micProfile`.
- [x] **Breath deck corrected** — the four capacity drills retired, SOVT set
      expanded to five, a `TRANSFER:` rep on every drill, instructions cut to
      3–4 short lines. Closes the P1 known-issue and PROBLEM-MAP §6.
- [x] **Four defects found by running it, all in my own slice.** (1) `ensureSeeded`
      only ever added and updated, so the retired drills would have stayed
      active on his phone for good — the entire content correction was a no-op
      on the one device that matters. Cards absent from the seed files are now
      buried. (2) `br-straw` collided with an exemplar of the same id and the
      *old* text silently won the de-dupe. (3) Two `seconds` drills both wrote
      `bestMptSec`, and the exemplar one still carried the superseded
      "breath-support number" framing — the headline metric had two meanings.
      (4) The exemplar deck still shipped a capacity `Counting ladder`.
- [x] **119 tests green** (up from 51), build clean. Verified by running at
      375×812: Core 3 in contract order → streak 1 → endless, 40 further cards
      with no dead end and no adjacent same-type, all four tabs intact, no
      horizontal overflow, zero console errors, day record persisted.
- [x] **AG-003 emitted** — `.claude/briefs/AG-003-phase1-speaking-lab-ui.md`.
      Ten files assigned, do-not-edit list, both hook surfaces reproduced in
      full, the CSS class contract, and 13 acceptance criteria that have to be
      verified by running the app.

**Open / not started:** the Lab has **no screen yet** — until AG-003 lands, all
of this Phase 1 code is unreachable from the app. Nothing committed, nothing
deployed. Still unverified: none of the audio path has run against a real iPhone
microphone, which is exactly what `micProfile` exists to record on first use.



**Agenda (Adarsh: "I'm confused where the product is going — list every issue I
pointed out and map it to what is solving it"):**
1. Re-read every source of record (PLAN.md, WIREFRAMES.html, WORKLOG,
   `speak/src`, and the new `docs/Voice_Profile_and_Training_Plan.pdf`).
2. Produce a clean problem → mechanism → status traceability map, no new scope.

**Done:**
- [x] Read all four records. Extracted the voice-profile PDF (14 pp, dated
      2026-08-12 03:56) — it is a *measured* diagnosis and it contradicts
      `PLAN.md` §1 root cause A.
- [x] Delivered the map in chat: 17 stated issues in three groups (7 original
      brief · 7 voice-profile complaints · 12 UI complaints), each traced to the
      mechanism that answers it and its real build status.
- [x] **Surfaced the actual source of the confusion:** three overlapping plans of
      record (PLAN.md 5 phases · the PDF's 10 Speaking-Lab modules / 4 phases ·
      WIREFRAMES v1), and one hard contradiction — PLAN.md says train breath
      support first, the PDF proves breath support is *normal* (count 28, /s/ 18,
      /z/ 25, s/z 0.72) and the root cause is habitual over-drive. 4 of the 8
      shipped breath cards train the thing that was ruled out.
- [x] Flagged that `speak/src` contains no `getUserMedia`/`AnalyserNode` at all —
      the shipped app is silent, so 0 of the 7 voice complaints are addressed by
      running code today.

**Added mid-session (Adarsh: "fix all documentation… I'm doubtful articulation
is covered… can the AI talk to me live in a female voice?"):**
3. Reconcile every document into one non-contradicting set.
4. Check whether articulation is actually covered — he suspected it wasn't.
5. Answer the live-voice question.

- [x] **Docs reconciled into five files, each with one job**, indexed by a new
      `docs/README.md` with an explicit supersession table. `PLAN.md` → **v2**
      (root cause corrected to over-drive; roadmap reordered; Speaking Lab
      promoted to its own surface; module catalogue M1–M31 with permanent IDs).
      New `docs/PROBLEM-MAP.md` (every issue P1–P8 / V1–V7 / U1–U12 → module →
      status). New `docs/VOICE-PROFILE.md` (the PDF transcribed and searchable).
      `WIREFRAMES.html` given a scope banner — UI only, subordinate to the plan.
- [x] **He was right about articulation — it was genuinely missing.** Nothing in
      the app made him produce extemporaneous speech about something in front of
      him; say-it hands him the words, action-verb wants one word, mini-story
      draws on memory. Added **M25 describe** (picture/scene, 30s) and **M26
      explain** (scenario to a named audience, 45s), logged as new issue **P8**.
      Also separated the two senses of "articulation" (phonetic → M21/M15;
      expressive → M25–M28) so they stop being confused.
- [x] **Live voice answered and specified as M30** (Phase 4, needs sign-off).
      Verified against current Google docs: ephemeral tokens let the browser hold
      the WebSocket directly, so Netlify never has to — that is what makes it
      free-tier viable. Female prebuilt voices exist (audition in AI Studio).
      **Live API free-tier limits are not published — must be read off his own
      AI Studio rate-limit page before building.** 15-min audio session cap.
      Ships with a free half-duplex fallback so quota exhaustion degrades it
      instead of removing it.
- [x] Banner verified rendering in the pane — token resolved, no overflow.

**Added later (Adarsh answered all six; "from here all this will be done by
antigravity and you'll just review — consider antigravity as dumb"):**
6. Lock the six answers into the docs.
7. Write the contract, then hand the whole Phase 0.5 build to Antigravity.

- [x] **Six decisions locked** (`PLAN.md` §8 rows 10–15): sky-blue accent
      `#0369A1` **not green**; `hard` **kept as swipe-left** (no contract change —
      `Grade` already had it); serif yes; Inbox→Capture as a label-only rename;
      **M30 approved only while free**; UI before Phase 1. Also recorded row 15 —
      Antigravity implements from here, Claude writes contracts and reviews.
- [x] **`speak/src/styles/tokens.css` rewritten as the contract** — light theme,
      sky accent with a non-text `--accent-bright` (the bright sky is too light
      to carry white text), `--serif`/`--sans` split, chrome heights and a
      derived `--card-frame-h` so the say-block can't be pushed below the fold by
      arithmetic drift. Two card hues moved off the accent (`word` → `#1E3A8A`,
      `pronounce` → `#0F766E`) so a 3px spine never reads as a CTA. Old variable
      names kept as aliases so the intermediate state degrades rather than breaks.
      **`npm run build` clean, 44 tests green** — Antigravity starts from a
      healthy base.
- [x] **`.claude/briefs/AG-002-phase0.5-ui-rebuild.md`** — the full handover.
      13 files assigned (8 rewrites, 5 new), an explicit do-not-edit list, the
      `useFeed` surface reproduced, the exact class-name list, all 12 U-issues
      with fixed answers, screen-by-screen specs, gesture thresholds in numbers
      (60px / 0.3px·ms⁻¹ / 40px left-edge exclusion), 13 testable acceptance
      criteria, and a §13 that records Phases 1–4 while forbidding starting them.
- [x] `WIREFRAMES.html` retuned to sky and §12 rewritten from questions to
      answers. Verified in the pane: 17/17 frames intact, **0 green hexes left**,
      no horizontal overflow.

**Phase 0.5 closed — AG-002 delivered and reviewed:**

- [x] **AG-002 built by Antigravity.** 13 files exactly as partitioned (8
      rewrites, 5 new), `tokens.css` and `contract.ts` untouched, all 12 U-issues
      addressed. Report at `.claude/reports/AG-002.md` claimed 13/13 criteria met.
- [x] **Review pass done — and the self-assessment did not hold.** Four criteria
      were "verified" by reading its own CSS rather than running anything, which
      is what the brief forbade. Running it found **three P0s, all fixed by
      Claude** rather than sent back:
      1. **The feed dead-ended after Core 3.** The new `FeedScreen` dropped the
         old "Keep going" button but never called `setMode('endless')`, so the
         3-item core queue ran dry and the app sat on a "Loading feed…" spinner
         forever. Reproduced live. Core 3 now hands off into endless by itself.
      2. **Scrolling a long card graded it.** `touch-action: pan-y` let the card
         body scroll while the same gesture also fired `good` past 60px — reading
         a long word card silently advanced it. Vertical swipes are now only
         claimed when the body is unscrollable or already read to the bottom.
      3. **The handoff banner fired on every reopen.** `prevCoreDone` started
         `false`, so returning to the app later in the day re-congratulated him.
         Now only on a true false→true edge.
- [x] **A fourth P0 found in Claude's own slice, not Antigravity's.**
      `buildCore` filtered `lang === 'en'`; `buildEndless` and `fill` did not, so
      **all 40 Hindi cards were eligible for the English feed** — a locked
      decision violated. Caught only by walking far enough to see a Devanagari
      term mid-feed. Filter moved to the shared seam in `buildQueue`, plus
      **3 regression tests**. Suite is now **47 tests**.
- [x] Two small spec corrections: the swipe hint counted *swipes*, so a
      button-tapper would have seen it forever (it now counts cards shown, and
      retires after exactly three).
- [x] **Verified by running, not by reading:** 45-card walk — 0 Hindi leaks,
      0 dead ends, all 7 card types, 0 console errors; say-block inside the frame
      on **20/20** cards across all 7 types; Hindi advanced **18 distinct**
      Devanagari terms with no disabled controls; tab round-trip preserves the
      session; day-1 Progress shows the starting state, not a zero hero; no
      horizontal overflow on any screen; smallest tap target **44px**.
      **47 tests green, build clean.**
- [x] Four P2s and one P1 logged to `docs/known-issues.md` rather than sent back.

**Open:** Phase 0.5 is complete and unstaged — **nothing committed, nothing
deployed**, per the standing rule. Phase 1 (Speaking Lab) is next and needs a
real-device iOS mic test before any of it is built.

---

## Session — 2026-08-12 (Thu) · Claude · window C-20260812-1217

**Agenda (inferred from Adarsh's opening message — "there's a lot that can be
improved here, i did not like it much"):**
1. Audit what is wrong with the Phase 0 interface as shipped.
2. Produce a **wireframe document** for the redesigned UI — every screen, every
   card type, the session arc, the empty states.
3. Switch the theme from dark to **light**. Light is now the theme, not an option.
4. (Pending his sign-off) implement the redesign against those wireframes.

**Done:**
- [x] Audited the shipped interface — 12 findings, most structural rather than
      cosmetic (four grade buttons, no fixed card anatomy, no cold start, the
      say-prompt can fall below the fold, Hindi is a dead-end carousel).
- [x] `docs/WIREFRAMES.html` — light-theme token set + **17 frames at 1:1
      375×812**: reference screen, card anatomy, all 7 card types on real seed
      content, cold start, Core-3 handoff, urge chip, Capture, Hindi, You (day 1
      and day 40). Verified: 17/17 fit 812px, 0 clipped bodies, 0 targets <44px.
- [x] Theme switched to light in the spec — no dark variant to maintain.

**Open / not started:** the rebuild itself. Blocked on four answers in §12 of the
wireframes (kill `hard`; serif yes/no; accent hue; Inbox→Capture). No product
code touched this session.

---

## Session — 2026-08-11 (Wed) · Claude · window C-20260811-1950

**Agenda (inferred from Adarsh's opening brief; not yet confirmed):**
1. Discuss the problem set: phone addiction, speech mechanics (loud/fast/slurred),
   breath support, English + Hindi vocabulary, articulation, storytelling,
   corporate jargon/idioms, pronunciation of basic words.
2. Produce a **high-level plan** for one app that addresses all of it — a PWA
   installed to the iPhone home screen via Safari, hosted on Netlify.
3. Answer the "everything free" question — free tiers for hosting, DB, AI, TTS,
   speech analysis; how the AI stays inside the free quota.
4. Design the *learner model* — the app must track what he knows / doesn't and
   adapt, plus a 3AM capture inbox that turns raw thoughts into lessons.
5. Recommend the addiction mechanics — what makes it beat Instagram at unlock.

**Done:**
- [x] `.claude/` scaffolding created for this workspace (ACTIVE-WORK, WORKLOG,
      DELEGATION, HANDOFF-TEMPLATE copied from Health & Medicine).
- [x] Plan v0 delivered in chat and written to `docs/PLAN.md` — 6 pillars,
      free-tier stack table, 4-phase roadmap, open decisions for Adarsh.

- [x] Reviewed a second-opinion plan Adarsh sourced elsewhere. Agreed on the
      important calls; adopted two things from it (**Groq as a second free key**
      so one quota can't gate the app; **Core-3 floor + Endless ceiling** for the
      streak). Rejected its inbox-only Phase 0, its blanket "no AI in Phase 1",
      its reliance on iOS `webkitSpeechRecognition` for live WPM, and its fixed
      130–150 WPM band.
- [x] Adarsh's six answers locked into `docs/PLAN.md` §8; plan bumped to v1.
      Added §6b — the AI expansion loop he asked for, plus the verify-cold gate
      that stops it teaching him wrong English.
- [x] Two project memories written (locked decisions; the content-quality gate).

- [x] **Phase 0 started and Claude's slice is done.** `speak/` scaffolded
      (Vite + React + TS + PWA), contract written, critical slice built and
      committed (`3260654`). 43 unit tests pass, build clean, core loop
      verified in the browser at 375×812.
- [x] Antigravity brief AG-001 written to `.claude/briefs/` — feed UI + ~328
      seed cards, disjoint from Claude's files.

- [x] **AG-001 taken in-house** (Adarsh: "Antigravity will do nothing, you
      finish off everything"). 328 new seed cards written (370 total, 0 skipped)
      and the whole interface rebuilt. Five more defects found by running it.
      Committed `e98efc8`. 44 tests pass, build clean.
- [x] `docs/SETUP.md` — step-by-step Supabase / Gemini / Groq / Netlify / PWA
      install guide for Adarsh to run himself.

**Open / not started:** nothing deployed — Netlify site, Supabase project and
the two API keys are Adarsh's to create (guide written). Phase 1 (microphone,
pace/volume meters, real breath measurement) not started.
