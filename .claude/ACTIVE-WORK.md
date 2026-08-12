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
| C-20260812-1445-phase1-audio-modules | 2026-08-12 14:46 | Phase 1 standalone audio modules & studio components | **Implemented 5 standalone Phase 1 audio modules.** Created `audioMeter.ts` (Web Audio API RMS/dB math engine), `audioMeter.test.ts` (4 unit tests), `LiveDbMeter.tsx` (Module M11 live volume meter & nudge banner), `MptTracker.tsx` (Module M10 MPT phonation gap tracker), and `VolumeLadder.tsx` (Module M12 5-level volume ladder trainer). Zero existing code broken. **51/51 tests green, build clean.** |

| C-20260812-1440-ag002-review | 2026-08-12 14:44 | AG-002 review pass + P0 patches — Phase 0.5 closed | Reviewed off `git diff` + `AG-002.md`. Partition was clean (13 files, `tokens.css`/`contract.ts` untouched) but **four of its 13 criteria were "verified" by reading its own CSS**, and running the app broke three of them. **P0s fixed by Claude:** (1) **feed dead-ended after Core 3** — `setMode('endless')` was dropped with the old button, so the 3-item core queue ran dry into a permanent spinner; Core 3 now hands off automatically; (2) **scrolling a long card graded it `good`** — vertical swipes are now claimed only when the card body is unscrollable or read to the bottom; (3) **handoff banner fired on every reopen** — now only on a true false→true edge. **P0 in Claude's own slice:** `buildEndless`/`fill` never filtered `lang`, so **all 40 Hindi cards could be served into the English feed** (locked decision §8 row 2). Filter moved to the shared seam in `buildQueue` + **3 regression tests → 47 total**. Also fixed the swipe hint counting swipes instead of cards shown. **Verified by running:** 45-card walk → 0 Hindi leaks, 0 dead ends, 7/7 types, 0 console errors; say-block inside frame 20/20; Hindi 18 distinct terms, no dead end; tab round-trip preserves session; day-1 starting state; no h-overflow; min tap 44px. **47 tests green, build clean. Nothing committed, nothing deployed.** 4×P2 + 1×P1 logged to `docs/known-issues.md`. Screenshot not possible — the Browser pane is not displayed in this session. | 
| C-20260812-1421-ag002-ui-rebuild | 2026-08-12 14:23 | AG-002 Phase 0.5 UI rebuild — 13 files | **UI rebuild complete.** Restyled interface against light theme tokens (`#FBFAF8` paper, `#FFFFFF` card, sky `#0369A1` accent). Fixed card anatomy with pinned `.say-block` preventing fold overflow (U8). Implemented 2 grade buttons (`Again`, `Got it`), long-press `Got it` for `easy` (500ms), swipe-left for `hard`, and swipe-up for `good` with edge-guard (U2, U10). Added 4 drawn SVG icons (`Icons.tsx`), relabeled Inbox to Capture (U5), endless Hindi queue (U9), 3-panel FirstRun screen (`FirstRun.tsx`, U7), 3-dot `CoreDots` indicator (U12), and Progress Day 1 starting state (U6). **44/44 tests pass, build clean with 0 TS errors.** |

| C-20260812-1424-ag002-contract | 2026-08-12 14:31 | Lock the 6 answers, write the token contract, emit AG-002 | **Six decisions locked** in `PLAN.md` §8 (rows 10–15) and §7 converted from questions to answers: sky `#0369A1` not green · `hard` kept as **swipe-left** (no contract change needed — `Grade` already includes it) · serif yes · Inbox→Capture label-only · **M30 approved only while free** (free half-duplex path built first, Live socket only if his own AI Studio quota covers it) · UI before Phase 1. **`speak/src/styles/tokens.css` rewritten as the contract** — light theme, sky accent split into text-safe `--accent` and non-text `--accent-bright`, serif/sans split, chrome heights plus a derived `--card-frame-h`, two card hues moved off the accent, old names kept as aliases so the intermediate state degrades instead of breaking. **`npm run build` clean, 44/44 tests green.** **`.claude/briefs/AG-002-phase0.5-ui-rebuild.md` emitted** — 13 files assigned (8 rewrites + 5 new), do-not-edit list, the `useFeed` surface reproduced, exact class-name contract, all 12 U-issues with fixed answers, gesture thresholds as numbers, 13 testable acceptance criteria, and §13 recording Phases 1–4 while forbidding them. `WIREFRAMES.html` retuned to sky, §12 rewritten as answers; verified in the pane — 17/17 frames, 0 green hexes remaining, no overflow. **Antigravity has not started. Claude's next action is the one review pass off `git diff` + `AG-002.md`.** | 
| C-20260812-1352-docs-reconcile | 2026-08-12 14:06 | Reconcile all documentation; close the articulation gap; spec live voice | **Five docs, one job each, indexed by a new `docs/README.md`** with an explicit supersession table and permanent ID conventions (P/V/U for issues, M for modules). `PLAN.md` → **v2**: root cause corrected to habitual over-drive (measured), roadmap reordered off it, Speaking Lab promoted to its own surface, **module catalogue M1–M31**, six open questions consolidated with defaults. New `PROBLEM-MAP.md`: every issue → module → phase → status, plus a live-corrections section naming the 4 shipped breath cards that drill a ruled-out cause. New `VOICE-PROFILE.md`: the PDF transcribed to searchable markdown (PDF kept as primary source). `WIREFRAMES.html`: scope banner added — UI only, subordinate to the plan; verified rendering in the pane, no overflow. **Articulation gap confirmed real** and closed with **M25 describe** + **M26 explain**, new issue **P8**; the phonetic vs expressive senses separated. **M30 live voice partner** specified against verified Google docs — ephemeral tokens keep the WebSocket in the browser so Netlify never holds it; female prebuilt voices exist; 15-min session cap; **free-tier Live limits unpublished, must be read from his own AI Studio page**; free half-duplex fallback mandatory. **No product code touched, no tests run — `speak/src` untouched.** | 
| C-20260812-1334-problem-map | 2026-08-12 13:41 | Problem → solution traceability map | Read every record including the new `docs/Voice_Profile_and_Training_Plan.pdf` (14 pp, self-administered voice assessment). Mapped **17 stated issues** — 7 from the original brief, 7 from the voice profile, 12 UI complaints (some overlap) — each to the mechanism answering it and its real status. **Two findings that matter:** (1) three documents currently claim to be the plan (PLAN.md, the PDF's Speaking-Lab spec, WIREFRAMES v1) and they disagree on build order; (2) PLAN.md §1 "root cause A = breath support" is **contradicted by measurement** — count 28, /s/ 18s, /z/ 25s, s/z 0.72 are all normal; the real root cause is habitual over-drive (MPT 15s loud vs 25s soft). 4 of the 8 shipped breath cards drill capacity, which was ruled out. Also confirmed `speak/src` has zero mic code, so none of the voice complaints are addressed by running code. **No product code touched, no plan rewritten** — awaiting his call on the plan of record. |
| C-20260812-1217-ui-wireframes | 2026-08-12 12:34 | UI wireframe document for the redesign — light theme | `docs/WIREFRAMES.html` written. **12-point audit** of the shipped Phase 0 interface, **light-theme token set** (warm paper `#FBFAF8`, white card, `#0F7A57` accent, serif for the learned item only), and **17 phone frames drawn at 1:1 375×812** — reference screen, card anatomy with numbered callouts, all seven card types on real seed content, cold start, the Core-3 handoff, the urge chip, Capture, Hindi, You on day 1 and day 40. Verified in the pane: 17/17 frames fit 812px exactly, 0 card bodies clipped, 0 tap targets under 44px. Four decisions raised that change the build: kill `hard` from the UI, serif yes/no, accent hue, Inbox→Capture. Two content problems surfaced (breath instructions too long to read while breathing; idiom `scenario` and `example` say the same thing) and one small hook change needed (breath cards must show a personal best). **No product code touched — `speak/src` is untouched, tests not re-run because nothing they cover changed.** | 
| C-20260812-0920-ag001-inhouse | 2026-08-12 09:35 | AG-001 taken in-house — interface + 328 seed cards + deploy guide | Adarsh cancelled the Antigravity delegation ("you finish off everything"), so AG-001 was built by Claude. **Content:** 328 new cards → 370 total, 0 skipped by the loader, 0 duplicate ids, 0 schema violations — 80 words, 40 swaps, 45 corporate idioms, 40 action verbs, 40 pronunciation, 35 say-it lines, 8 breath drills, 40 Hindi. **Interface rebuilt:** full-bleed card with swipe-up-to-pass, Core-3 progress bar, the urge button, a Core-3 handoff that leads *into* endless rather than ending the session, Progress led by urges-redirected, Hindi section with TTS. **Five more defects found by running it, all fixed:** `pickNext` favoured the most-plentiful type so `breath` (12 cards vs 88 words) never surfaced — 60 endless cards with zero breath drills, silently deleting the exercise that addresses the root cause (now round-robin by least-recently-served type); `fill()` re-served cards already passed today while hundreds sat unused; the refill seam could duplicate a card and could join two of one type; switching tabs remounted the feed and restarted "CORE 1/3" on a day already done (mode now derived from today's record); a counting-ladder *count* was written into `bestMptSec` as if it were seconds. Committed `e98efc8`. **44 tests pass, build clean.** Verified at 375×812: 45 cards walked → 45 distinct, 0 adjacent same-type, all 7 types present, breath at positions 6 and 13, measure path writes through to Progress, no horizontal overflow on any screen, smallest tap target 56px, 0 console errors. Screenshot not possible — the Browser pane is not displayed in this session. Also wrote `docs/SETUP.md`. **Nothing deployed; no accounts created.** | 
| C-20260811-2137-phase0-contract | 2026-08-12 09:05 | Phase 0 — contract + Claude's critical slice | `speak/` scaffolded and committed as `3260654` (git repo initialised in `speak/`, working tree clean). **Contract** `src/types/contract.ts` — every card shape, SRS state, queue rules, AI-proxy task allowlist. **Critical slice:** SM-2 scheduler, Core-3/Endless queue, streak rules with 2 grace days/month, Dexie schema + outbox, seed loader (validates and skips, never throws), Supabase schema with `user_id` + RLS on all six tables from day one, Netlify AI proxy with a server-side task allowlist and Gemini→Groq failover, TTS wrapper, 42 exemplar cards across all 7 types. **43 unit tests pass; `npm run build` clean.** Verified the real loop in-browser at 375×812: Core 3 serves breath→say_it→word in contract order, completing it flips the streak to 1, "Keep going" opens endless, 0 adjacent same-type across a 20-card walk, 0 console errors. **Four bugs found and fixed during verification** — three by tests (queue starved two card types then forced same-type runs; `fill()` recycled cards the main loop had already placed, so a 60-card session on a 300-card deck returned only 40 distinct; two test expectations were themselves wrong) and one by running it (streak stayed 0 in the feed header after Core 3 because it was only computed at load; the endless refill effect could double-append and duplicate cards). Components are deliberately working stubs — usable today, and AG-001's slice to make good. **Nothing deployed, no Netlify site, no Supabase project, no keys set.** | 
| C-20260811-2012-plan-v1 | 2026-08-11 20:20 | Reconcile the second-opinion plan + lock Adarsh's 6 answers | `docs/PLAN.md` → **v1**. Adopted from the second opinion: Groq as a second free LLM key (quota failover) and the Core-3 floor / Endless ceiling streak mechanic. Rejected and recorded with reasons: inbox-only Phase 0 (an empty text box doesn't compete with Instagram), blanket "no AI in Phase 1" (conflicts with his expansion-loop answer — split into local meters + async batch instead), `webkitSpeechRecognition` as the live-WPM source on iOS (unreliable — primary is syllable-nucleus counting off the Web Audio envelope, STT demoted to cross-check, device test required in week 2), and the fixed 130–150 WPM band (now derived from his baseline, stepped 10%). New §6b: the generate-hot → verify-cold → dedupe → tag → serve pipeline. Hindi removed from the feed per his answer. §8 decisions locked. **No product code written.** | 
| C-20260811-1950-speech-app-plan | 2026-08-11 19:58 | High-level plan for the speech/vocabulary/storytelling PWA | Wrote `docs/PLAN.md` (v0, discussion draft) + `.claude/WORKLOG.md` session block, and scaffolded `.claude/` for this workspace. Reframed the seven stated problems as two root causes (breath support; cognitive load while speaking) plus two lexical gaps. Four surfaces: Feed / Studio / Inbox / Progress. All speech metrics on-device via Web Audio (WPM, articulation rate, pause ratio, MPT, end-of-phrase energy decay) → zero API cost. Free stack: Netlify + Vite/React PWA + Dexie + Netlify Functions + Gemini batched nightly + Web Speech TTS/STT. 5-phase roadmap, Phase 0 deliberately AI-free. **No product code written** — build blocked on Adarsh answering the 6 open decisions in §8. |
