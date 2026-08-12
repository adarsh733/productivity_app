# ACTIVE WORK — concurrency registry

Single source of truth for **who is editing what, right now**, across every
concurrently open chat window. Not in git (this folder sits outside the repo),
so it never causes commit noise or a Netlify build.

**Reads are free. You only ever claim files you intend to WRITE.**

---

## Claim protocol (every agent, every task)

**1 — Plan before touching anything.**
Produce the plan first: what the task is, and the explicit list of files/globs
you will write to. No claim without a plan; no edit without a claim.

**2 — Read this file.** Check your list against every row in *Active claims*.

**3 — Overlap?**
- **No overlap** → go to step 4.
- **Overlap** → do NOT edit the contested files. Then, in this order:
  a. Do every part of the task that does *not* touch them, claiming only those files.
  b. Tell the user plainly: *"`js/screens.js` is claimed by C-… since 20:15 — I've
     done X and Y; the rest is waiting on that."*
  c. Offer to re-check. Re-check on request or after finishing the rest — never
     spin in a polling loop, and never edit a claimed file "quickly".

**4 — Write your claim row**, then **immediately re-read this file**. If a
conflicting row for the same file appeared with an *earlier* start time, delete
your row and treat it as an overlap (step 3). Earlier timestamp always wins;
tie → shorter Claim ID wins. This write-then-verify step is what makes two
windows claiming in the same minute safe.

**5 — Work.** If the task runs long, refresh `Heartbeat` whenever you re-read
this file. If scope grows to new files, claim them the same way *before* editing.

**6 — On completion (or abandonment):** move the row to *Recently released* with
a one-line outcome, and append the matching entry to
[`WORKLOG.md`](WORKLOG.md). Releasing is part of "done" — a task is not
finished while its claim is still open.

**Stale claims:** a row whose Heartbeat is >2h old is *probably* a chat that was
closed mid-task. Do not silently take it. Ask the user: *"C-… has held
`js/week.js` since 14:00 — is that window still running?"* Only they know.

**Claim ID format:** `C-YYYYMMDD-HHMM-<slug>` — e.g. `C-20260801-2115-week-grid`.
Get the time with `Get-Date -Format "yyyy-MM-dd HH:mm"`.

**Claiming a directory** is allowed with a glob (`js/food/**`) when a task
genuinely rewrites a subsystem — but prefer listing files. A glob blocks more
windows than it needs to.

---

## Active claims

| Claim ID | Started | Task (one line) | Files / globs claimed | Status | Heartbeat |
|---|---|---|---|---|---|

---

## Recently released (keep last 10, newest first)

| Claim ID | Released | Task | Outcome |
|---|---|---|---|
| C-20260812-0920-ag001-inhouse | 2026-08-12 09:35 | AG-001 taken in-house — interface + 328 seed cards + deploy guide | Adarsh cancelled the Antigravity delegation ("you finish off everything"), so AG-001 was built by Claude. **Content:** 328 new cards → 370 total, 0 skipped by the loader, 0 duplicate ids, 0 schema violations — 80 words, 40 swaps, 45 corporate idioms, 40 action verbs, 40 pronunciation, 35 say-it lines, 8 breath drills, 40 Hindi. **Interface rebuilt:** full-bleed card with swipe-up-to-pass, Core-3 progress bar, the urge button, a Core-3 handoff that leads *into* endless rather than ending the session, Progress led by urges-redirected, Hindi section with TTS. **Five more defects found by running it, all fixed:** `pickNext` favoured the most-plentiful type so `breath` (12 cards vs 88 words) never surfaced — 60 endless cards with zero breath drills, silently deleting the exercise that addresses the root cause (now round-robin by least-recently-served type); `fill()` re-served cards already passed today while hundreds sat unused; the refill seam could duplicate a card and could join two of one type; switching tabs remounted the feed and restarted "CORE 1/3" on a day already done (mode now derived from today's record); a counting-ladder *count* was written into `bestMptSec` as if it were seconds. Committed `e98efc8`. **44 tests pass, build clean.** Verified at 375×812: 45 cards walked → 45 distinct, 0 adjacent same-type, all 7 types present, breath at positions 6 and 13, measure path writes through to Progress, no horizontal overflow on any screen, smallest tap target 56px, 0 console errors. Screenshot not possible — the Browser pane is not displayed in this session. Also wrote `docs/SETUP.md`. **Nothing deployed; no accounts created.** | 
| C-20260811-2137-phase0-contract | 2026-08-12 09:05 | Phase 0 — contract + Claude's critical slice | `speak/` scaffolded and committed as `3260654` (git repo initialised in `speak/`, working tree clean). **Contract** `src/types/contract.ts` — every card shape, SRS state, queue rules, AI-proxy task allowlist. **Critical slice:** SM-2 scheduler, Core-3/Endless queue, streak rules with 2 grace days/month, Dexie schema + outbox, seed loader (validates and skips, never throws), Supabase schema with `user_id` + RLS on all six tables from day one, Netlify AI proxy with a server-side task allowlist and Gemini→Groq failover, TTS wrapper, 42 exemplar cards across all 7 types. **43 unit tests pass; `npm run build` clean.** Verified the real loop in-browser at 375×812: Core 3 serves breath→say_it→word in contract order, completing it flips the streak to 1, "Keep going" opens endless, 0 adjacent same-type across a 20-card walk, 0 console errors. **Four bugs found and fixed during verification** — three by tests (queue starved two card types then forced same-type runs; `fill()` recycled cards the main loop had already placed, so a 60-card session on a 300-card deck returned only 40 distinct; two test expectations were themselves wrong) and one by running it (streak stayed 0 in the feed header after Core 3 because it was only computed at load; the endless refill effect could double-append and duplicate cards). Components are deliberately working stubs — usable today, and AG-001's slice to make good. **Nothing deployed, no Netlify site, no Supabase project, no keys set.** | 
| C-20260811-2012-plan-v1 | 2026-08-11 20:20 | Reconcile the second-opinion plan + lock Adarsh's 6 answers | `docs/PLAN.md` → **v1**. Adopted from the second opinion: Groq as a second free LLM key (quota failover) and the Core-3 floor / Endless ceiling streak mechanic. Rejected and recorded with reasons: inbox-only Phase 0 (an empty text box doesn't compete with Instagram), blanket "no AI in Phase 1" (conflicts with his expansion-loop answer — split into local meters + async batch instead), `webkitSpeechRecognition` as the live-WPM source on iOS (unreliable — primary is syllable-nucleus counting off the Web Audio envelope, STT demoted to cross-check, device test required in week 2), and the fixed 130–150 WPM band (now derived from his baseline, stepped 10%). New §6b: the generate-hot → verify-cold → dedupe → tag → serve pipeline. Hindi removed from the feed per his answer. §8 decisions locked. **No product code written.** | 
| C-20260811-1950-speech-app-plan | 2026-08-11 19:58 | High-level plan for the speech/vocabulary/storytelling PWA | Wrote `docs/PLAN.md` (v0, discussion draft) + `.claude/WORKLOG.md` session block, and scaffolded `.claude/` for this workspace. Reframed the seven stated problems as two root causes (breath support; cognitive load while speaking) plus two lexical gaps. Four surfaces: Feed / Studio / Inbox / Progress. All speech metrics on-device via Web Audio (WPM, articulation rate, pause ratio, MPT, end-of-phrase energy decay) → zero API cost. Free stack: Netlify + Vite/React PWA + Dexie + Netlify Functions + Gemini batched nightly + Web Speech TTS/STT. 5-phase roadmap, Phase 0 deliberately AI-free. **No product code written** — build blocked on Adarsh answering the 6 open decisions in §8. |
