# WORKLOG — Productivity workspace

Newest session first. One terse line per agenda item as it completes, plus any
unplanned work. This is the month-end record of what got built.

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
