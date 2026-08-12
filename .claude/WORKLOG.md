# WORKLOG — Productivity workspace

Newest session first. One terse line per agenda item as it completes, plus any
unplanned work. This is the month-end record of what got built.

---

## Session — 2026-08-12 (Thu, 13:34) · Claude · window C-20260812-1334

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
