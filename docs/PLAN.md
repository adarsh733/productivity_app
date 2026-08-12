# SPEAK — plan v2

**Date:** 2026-08-12 · **Status:** plan of record.
**Supersedes v1 (2026-08-11) entirely.** v1's §1 root-cause analysis was
*inferred*; it has since been *measured*, and the measurement contradicted it.
Do not cite v1 for anything.

A single PWA that replaces the phone-unlock reflex with speech, vocabulary and
storytelling training. Installed to the iPhone home screen from Safari, hosted on
Netlify, free at every layer.

**Companion documents — read them in this order:**
1. [`VOICE-PROFILE.md`](VOICE-PROFILE.md) — the measurements. Facts, not plans.
2. **This file** — what gets built and why.
3. [`PROBLEM-MAP.md`](PROBLEM-MAP.md) — which module closes which issue.
4. [`WIREFRAMES.html`](WIREFRAMES.html) — how the shell looks. UI only.
5. [`SETUP.md`](SETUP.md) — the accounts and keys Adarsh creates himself.

---

## 1. The problem set — corrected against measurement

v1 said the root cause was **insufficient breath support**, and ordered the whole
roadmap off it. The 2026-08-12 assessment shows breath support is **normal**:
count on one breath 28 (normal 25–40), sustained /s/ 18 s, /z/ 25 s, s/z ratio
0.72 (healthy is < 1.4). One number was poor — MPT at habitual volume, 15–16 s —
and it went to **25 s** on the same day just by speaking softly.

> **The corrected root cause: chronic excess subglottic pressure — habitual
> over-drive of the voice.** Not a capacity problem. A *drive* problem.

This changes the plan in three concrete ways:

1. **The primary metric is MPT at habitual volume**, and the sharpest one is the
   **gap** between the loud and soft MPT (~10 s today, target < 3 s). Not lung
   capacity, not WPM.
2. **The first drill family is SOVT (straw/hum), not breath capacity.** The /z/
   result proves semi-occluded work is already effective on this specific voice.
   Counting ladders train something that was ruled out.
3. **The single most valuable feature in the whole app is a live dB meter** with
   a personal target band. Habit change requires immediate feedback, not a
   report at the end.

### The four problem families

| Family | What it is | Owns |
|---|---|---|
| **A — Drive** | Speaking at ~2× the required air pressure. Causes short breath, harsh tone, merged words, no soft gear, fatigue, and (counter-intuitively) *less* perceived depth | V1 V2 V3 V4, P2, P3 |
| **B — Untrained prosody** | Politeness, warmth and emphasis are learnable patterns of pitch/pace/pause that were never rehearsed. Anger is in the repertoire because it resembles the default | V5 V6 V7 |
| **C — Production under load** | Choosing words, inventing structure and managing air simultaneously. Three jobs, one working memory | P4 P8 |
| **D — Lexical gaps** | Concrete English verbs · Hindi lexicon and framing · corporate register | P5 P6 P7 |

Issue IDs are defined in [`PROBLEM-MAP.md`](PROBLEM-MAP.md) and never change.

### Design consequences

1. **Order matters, and the order changed.** Release (SOVT) → drive (dB, MPT) →
   quiet register → emphasis and prosody → production → story. v1 put breath
   capacity first; that rung does not exist.
2. **Production, not recognition.** He already recognises plenty of words — that
   is why flashcard apps won't move him. Every word must be *spoken in a sentence
   he invents*, under a timer.
3. **The mic is the product.** Target ≥70% of cards require speaking aloud.
   **Today it is 0%** — `speak/src` has no microphone code at all. This is the
   single largest gap between the plan and the artifact.
4. **Every drill ends with a transfer rep.** Straw-then-speak, hum-then-speak,
   ladder-then-speak. The app must *enforce* it — it is the step most likely to
   be skipped and the step where the learning actually happens.
5. **Reuse the addiction, don't fight it.** His thumb is trained to scroll a
   vertical feed. Give it one — but each card costs 20 seconds and pays a point.
6. **The voice archive is the retention hook.** Recording daily means that at
   week 8 he can play day 1 against day 56. Nothing else creates that pull.

---

## 2. Shape of the app

Five surfaces. It opens on the first — no home screen, no menu, no choice.

| Surface | What it is | Modules |
|---|---|---|
| **FEED** | The impulse surface, and the default. Full-bleed vertical cards, swipe up for next. Designed for the 40 seconds in a lift | M1–M3, M17–M28 |
| **LAB** | The Speaking Lab — the intentional 12-minute daily session, Blocks A–E from the voice profile. **The block that actually changes how he speaks** | M8–M16 |
| **CAPTURE** | The 3AM box. One field, text or voice, one tap from anywhere. Overnight it becomes cards | M5, M29 |
| **हिंदी** | The Hindi vocabulary section, entered deliberately. Never in the English feed | M24 |
| **YOU** | Five numbers and the voice archive. Day 1 vs today, same prompt, side by side | M4, M16 |

**The floor / ceiling mechanic.** Sessions are open-ended, which fails on bad days
unless there is a floor:

- **Core 3** (~3 min): one release drill, one say-it rep, one word. **The streak
  counts only this** — low enough that 11:50 PM is no excuse.
- **Endless**: after Core 3, an infinite queue. No "you're done!" screen.
- **Target** (never enforced): 12 min Lab + 30 cards.

---

## 3. What the app measures

All on-device via Web Audio `AnalyserNode` + `MediaRecorder`. Zero API cost.

| Metric | Baseline | 12-week target | Why it matters |
|---|---|---|---|
| **MPT, habitual volume** | 15–16 s | **24–25 s** | **The headline number.** Tracks a habit, so it moves fast — unusually motivating compared to typical fitness metrics |
| **Loud-to-soft MPT gap** | ~10 s | **< 3 s** | The cleanest single indicator of progress |
| **Session dB average** | not measured | −6 to −8 dB | The variable actually driving everything else. Establish in week 1 |
| Level-1 hold duration | unstable | 60 s, no dropout | The quiet-register metric |
| Words per minute | not measured | establish, then −10% | Pace matters more here than for most, because of masking |
| Articulation rate | — | — | Separates "talks fast" from "never pauses" — the fix differs |
| Pause ratio + placement | — | — | Most fast talkers have a normal articulation rate and a 3% pause ratio |
| End-of-phrase energy decay | — | — | The running-out-of-air detector |
| Word-ending clarity | — | — | The "eating words" number |
| Filler rate | — | — | *um, matlab, basically, actually, like*. Cheap and brutal |
| s/z ratio | 0.72 | stay < 1.4 | **Monitoring only, never a training target.** Crossing 1.4 means see a doctor |
| Count on one breath | 28 | maintain | Already normal. **Not a training target** |

**Keep the dashboard to five numbers.** More than five stops being read.

> **Calibration note.** Absolute dB off a phone mic is unreliable. Everything is
> relative to his own week-1 baseline, measured on his own device.

---

## 4. Module catalogue

Permanent IDs. Every module names the issues it closes; a module that closes
nothing does not get built.

### Shell — the habit layer

| ID | Module | What it does | Closes | Phase | Status |
|---|---|---|---|---|---|
| **M1** | Feed & endless queue | Vertical cards, swipe up to pass, round-robin by least-recently-served type | P1 | 0 | Shipped |
| **M2** | Core 3 + streak | 3-card floor; streak counts only this; 2 grace days/month, auto-applied, no guilt screen | P1 | 0 | Shipped |
| **M3** | Urge chip | *"I felt the pull"* → one 20-second card. **Urges redirected is the real product metric** | P1 | 0 | Shipped |
| **M4** | You / progress | Five numbers, plus the voice archive | P1 | 0 | Shipped (rebuild in 0.5 — U6) |
| **M5** | Capture | One field, text or voice, one tap from anywhere | P1 | 0 | Shipped |
| **M6** | First-run | Three panels, ~15 s, ending inside Core 1. Sets the one expectation: you will speak out loud | U7 | 0.5 | Spec'd |
| **M7** | Wind-down | After 22:00: SOVT and slow reading only, no streak pressure, no new content. Ends the day off the phone | P1 | 5 | Planned |

### Voice — the Speaking Lab

Specified in [`VOICE-PROFILE.md`](VOICE-PROFILE.md) §6. All on-device.

| ID | Module | What it does | Closes | Phase | Status |
|---|---|---|---|---|---|
| **M8** | Daily Session Runner | Runs Blocks A–E end to end with timers, prompts and a completion log. **Must work offline** — this is the module that has to be reliable | V1 | 1 | Planned |
| **M9** | SOVT / straw timer | Guided 3-min block with a **mandatory transfer rep**. Low effort to build, highest evidence base | V1 V2 | 1 | Planned |
| **M10** | MPT Tracker | Guided timed test, loud and soft. Charts both lines **plus the gap** — make the gap the default view. Mic-based auto-stop | V2 | 1 | Planned |
| **M11** | Live Volume Meter | Real-time dB against a personal target band, with a gentle nudge on drift. **The single most valuable feature in the app** | V1 V2 | 1 | Planned |
| **M12** | Volume Ladder Trainer | Prompts a sentence at level 1–5, measures whether he hit it, scores consistency. Includes the level-1 hold challenge | V5 | 2 | Planned |
| **M13** | Pause Trainer | One word marked; emphasise it by pausing only. Detects whether volume spiked on the marked word. **High value, low complexity — amplitude analysis, no LLM** | V6 V7 | 2 | Planned |
| **M14** | Emotional Palette | Same sentence in six modes, played back to back, stored monthly. Optionally Gemini classifies the intended emotion blind and reports whether it guessed right | V6 | 2 | Planned |
| **M15** | Pace & Masking Monitor | WPM plus flagging of merged word boundaries — inter-word gaps below a threshold | V3 | 3 | Planned |
| **M16** | Resonance check | Chest hum; tracks the resonant sweet-spot pitch over time via autocorrelation | V4 | 5 | Planned |

### Language — the content layer

| ID | Module | What it does | Closes | Phase | Status |
|---|---|---|---|---|---|
| **M17** | Word | New word · meaning · 2 examples in his register · say it aloud | P4 | 0 | Shipped (80 cards) |
| **M18** | Swap | *"very tired"* → the one word that does the job. 5s timer | P4 | 0 | Shipped (40) |
| **M19** | Action verb | A silent clip or illustration → name the action (*tripped / stumbled / staggered*) | P5 | 0 | Shipped (40) |
| **M20** | Idiom / jargon | Corporate phrase + a scenario: use it in one sentence | P7 | 0 | Shipped (45) |
| **M21** | Pronounce | Hear it → say it → waveform and syllable-stress compare | V3 | 0 | Shipped (40) — **silent until Phase 1** |
| **M22** | Say-it | Read a line at target pace; live pace and volume meters | V1 | 0 | Shipped (35) — **silent until Phase 1** |
| **M23** | Recall | Spaced repetition (SM-2), always in production form | P4 | 0 | Shipped |
| **M24** | Hindi section | Own endless queue, own counter, entered deliberately | P6 | 0 | Shipped (40) — carousel, rebuild in 0.5 (U9) |
| **M25** | **Describe** | A picture or scene, 30 s: what is happening, who, what happens next. **New 2026-08-12** | P8 P4 | 3 | Planned — no content |
| **M26** | **Explain** | A scenario to a named audience — *explain to your manager why the release slipped*. 45 s, register-scored. **New 2026-08-12** | P8 P4 | 3 | Planned — no content |
| **M27** | Mini story | 30–60 s on a personal prompt. Hook / turn / landing feedback, then an RJ rewrite of his own story to shadow | P4 P8 | 3 | Planned |
| **M28** | Fix my line | He speaks a clunky sentence → 3 tighter rewrites + the one word that would have done it | P4 | 3 | Planned |

**Breath cards (M9 content) need correcting.** Four of the eight shipped drills
train capacity, which was ruled out. See [`PROBLEM-MAP.md`](PROBLEM-MAP.md) §6.

### AI

| ID | Module | What it does | Closes | Phase | Status |
|---|---|---|---|---|---|
| **M29** | Expansion loop | Every input becomes a seed → batch-generate variants → **verify cold** → dedupe → tag → serve. §6 below | infra | 3 | Planned |
| **M30** | **Live voice partner** | Real-time spoken conversation with a female AI voice. §5b below | V6 P8 | 4 | Planned — **needs sign-off** |
| **M31** | Recording feedback | Async AI judgment over recordings already made: slur flags, clarity, pause placement, register | V3 V6 | 3 | Planned |

---

## 5. Free stack

| Layer | Choice | Free-tier reality |
|---|---|---|
| Hosting | **Netlify** | 100 GB bandwidth, 300 build min/mo |
| App | **Vite + React + TypeScript**, `vite-plugin-pwa` | free |
| Install | Safari → Share → Add to Home Screen | full-screen, no browser chrome |
| Local DB | **IndexedDB via Dexie** | device storage, instant, offline |
| Backup/sync | **Supabase** free | **Sync and backup only — never the read path.** Reads come from Dexie so the app opens instantly with no signal |
| API proxy | **Netlify Functions** | 125k invocations/mo. The API key never reaches the browser. Non-negotiable |
| AI (judgment) | **Gemini API** | batched + cached |
| AI (bulk text) | **Groq** (Llama) as a second free key | So one provider's quota can't gate the app |
| AI (live voice) | **Gemini Live API** + ephemeral tokens | §5b |
| TTS | **Web Speech `speechSynthesis`** | on-device, offline, free. Includes `en-IN`, `en-GB`, `hi-IN` voices |
| STT | **Web Speech `SpeechRecognition`**, Gemini audio as fallback | free |
| Audio metrics | **Web Audio API** | no API, no cost, works offline |
| Reminders | **Web Push** — iOS 16.4+, home-screen-installed PWAs only | free |
| Cron | Netlify scheduled functions | free |

**Staying inside the free tier**
1. 370 seed cards already ship, so day 1 works with **zero** API calls.
2. One nightly batch call for tomorrow's feed (~30 calls/month).
3. On-demand calls only where irreplaceable: story feedback, *fix my line*,
   capture processing.
4. Everything generated is cached permanently — the library only grows.
5. Hard fallback: if the API fails or the quota is gone, serve from cache.
   **Never a blank screen.**

**Privacy.** Keep audio on the device by default; send transcripts and metrics,
not voice — except the one daily story review and M30, which are explicit
toggles. The Gemini free tier may use submitted data to improve their products.

### 5b. M30 — the live voice partner

**Asked for 2026-08-12: "can the AI talk to me live, like ChatGPT voice mode, in
a female voice?"** Nothing like it exists today — the app can only speak *at* him
through one-way TTS. It is buildable, free-tier-viable, and it is the only module
that can respond to *how* he says something. Not yet approved.

**Architecture** — the one detail that makes it possible on a free host:

1. A Netlify Function holds the Gemini key and mints a short-lived **ephemeral
   token**. That is an ordinary fast HTTP request, well inside the function
   model.
2. The **browser opens the WebSocket directly to Google** with that token, so
   Netlify never has to hold a long-lived socket — which it cannot do.
3. Tokens are single-use by default: ~1 minute to *start* a session, ~30 minutes
   to send messages on it, and only against the `v1beta` endpoint.

**Voice.** Set via `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. The
prebuilt set includes several female-sounding options (Kore, Aoede, Leda,
Zephyr). **Audition them in AI Studio and pick one** — it is a one-token change,
and picking by ear beats picking by description. Hindi is supported, so the same
module can serve the Hindi section later.

**Limits and the honest risks:**

| | |
|---|---|
| Session length | Audio-only sessions cap at **15 minutes**; longer needs session resumption |
| Quota | A free tier exists, but the **Live API's free-tier limits are not published in the docs** — they are per-account in AI Studio. **Read them off his own rate-limit page before a line of this is written.** Audio in and out are the most expensive modalities in the API |
| Device | iOS Safari PWA mic capture + WebSocket + audio playback needs a **real-device test first**, same rule that applies to the pace meter. Do not build on top of an assumption |
| Cost control | Hard in-app cap (e.g. one 10-minute conversation a day), a visible timer, and a kill switch |

**The mandatory fallback.** M30 ships with a half-duplex mode that costs nothing:
Web Speech STT → a text LLM call → Web Speech TTS in a female voice. Slower, not
interruptible, but free and offline-tolerant. **If the quota is gone, the feature
degrades — it never disappears.**

**Why it earns its place** (it must not be built just because it is exciting):
- It is the only surface where **V6** can be practised against a partner —
  scenario roleplay where he must stay *firm but polite*, and the AI plays the
  manager.
- It is a blind judge for the emotional palette: ask it to name the emotion it
  heard, and compare with the one he intended.
- It is unrehearsed production with a live listener — **P8** under real pressure.

**It must not become a chatbot.** Every session opens in a scenario with a role,
a goal and a time cap. No open-ended companion mode.

---

## 6. The expansion loop (M29) — and its gate

Every input — a recording, a capture dump, a card he got wrong — is a seed. A
batch job generates **high-temperature variants** into the content DB, so the
library grows around *his* actual gaps.

**It needs a quality gate, or it will teach him wrong English.** High-temperature
generation invents idioms, unnatural collocations and Hinglish artifacts, and he
cannot detect them from inside the app — he will simply start confidently using a
phrase nobody says. Wrong content here is worse than no content.

1. **Generate hot** (temp ~1.0) from the seed.
2. **Verify cold** (temp 0, one cheap batched call) — *is this real, is this
   natural, would a native speaker say it?* Rejects are dropped, never shown.
3. **Dedupe** against the existing library.
4. **Tag provenance** (`source: ai`, seed id, batch id) so a bad batch can be
   purged wholesale.
5. **Serve.** One thumbs-down purges the item *and* blacklists its pattern.

Batch on a schedule, never per-input — per-input calls burn the free quota in a
week.

---

## 7. Roadmap

Phase by phase, with Adarsh's sign-off between each. One phase open at a time.

| Phase | Contents | Closes | State |
|---|---|---|---|
| **0** | PWA shell · Dexie · Supabase schema · key proxy · Capture · 370 seed cards · SRS · Core-3/Endless feed. **No mic, no live AI** | P1 P5 P6 P7 | **Done, not deployed** |
| **0.5** | UI rebuild against `WIREFRAMES.html`: tokens replaced, components rewritten, five screens re-laid out. **The logic layer is not touched, so the 44 tests stay green** | U1–U12 | Blocked on 4 answers |
| **1** | **Speaking Lab core** — M8 Session Runner, M9 SOVT + transfer rep, M10 MPT tracker, M11 live dB meter. Week-1 personal calibration. Breath content corrected. Real-device mic test **first** | V1 V2 P2 | Next |
| **2** | **Quiet register and emphasis** — M12 volume ladder, M13 pause trainer, M14 emotional palette | V5 V6 V7 | |
| **3** | **Articulation and production** — M25 describe, M26 explain, M27 mini story, M28 fix my line, M15 pace/masking, M31 recording feedback, M29 expansion loop + gate | P4 P8 V3 | |
| **4** | **M30 live voice partner**, scenario-bound, with the half-duplex fallback | V6 P8 | Needs sign-off |
| **5** | M16 resonance, M7 wind-down, adaptive queue from the weakness profile, trend dashboard, voice archive (day 1 vs today) | V4 | Only worth building on 8 weeks of data |

**The standing risk, restated.** Phases 3–5 are the fun ones to build and the
least likely to change how he speaks. If Phase 1's dB meter gets fiddly and the
vocabulary engine starts looking attractive again, the project quietly becomes a
flashcard app. Phase 1 is the whole point.

### Open questions — all six answered 2026-08-12

**Nothing is blocking work.** Answers are locked into §8 below and written into
the build brief `.claude/briefs/AG-002-phase0.5-ui-rebuild.md`.

| # | Question | Answer |
|---|---|---|
| 1 | Does **Hard** die from the grade buttons? | **Keep it** — as **swipe-left**. Two buttons stay (Again, Got it), `easy` is a long-press. No contract change: `Grade` already includes `'hard'` |
| 2 | **Serif** for the learned word? | **Yes.** The learned item only — never UI, body copy or numbers |
| 3 | **Accent colour?** | **Sky blue, not green.** `--accent #0369A1`, say-block `#E0F2FE`, non-text `#0EA5E9`. Two card hues moved off the accent: `word` → `#1E3A8A`, `pronounce` → `#0F766E` |
| 4 | **Inbox → Capture** rename? | **Yes** — user-facing labels only. Files, route key and `src/features/inbox/` keep their names |
| 5 | Is **M30 live voice** approved? | **Conditionally — only if it is free.** See below |
| 6 | Phase 0.5 before Phase 1? | **UI first.** One pass, does not touch logic, 44 tests stay green |

**On decision 5 — what "only if free" means for the build order.** M30 is
approved *as a feature*, not as a spend. So Phase 4 inverts: the **free
half-duplex path is built first** (Web Speech STT → text LLM → Web Speech TTS in
a female voice — no Live API, no audio-token cost). The Gemini Live socket is
wired only after his own AI Studio rate-limit page is read and shows a free
allowance that covers roughly one 10-minute conversation a day. If it does not,
the feature still ships on the free path and nothing is lost. **No paid tier is
enabled without asking him first**, and a hard in-app cap plus a kill switch are
part of the module either way.

---

## 8. Locked decisions

| # | Question | Answer | Locked |
|---|---|---|---|
| 1 | Name | **SPEAK** | 2026-08-11 |
| 2 | Hindi weight | **English only in the feed.** Hindi = a separate section | 2026-08-11 |
| 3 | Backup | **Supabase**, behind a local-first Dexie read path | 2026-08-11 |
| 4 | Daily budget | **12 min Lab + 30 cards** target; Core 3 (~3 min) as the streak floor | 2026-08-11 |
| 5 | Voice to cloud | **Yes** — and every input feeds the M29 expansion loop | 2026-08-11 |
| 6 | Cadence | **Phase by phase**, sign-off between each | 2026-08-11 |
| 7 | Theme | **Light.** Not an option, no dark variant to maintain | 2026-08-12 |
| 8 | Root cause | **Over-drive, not breath capacity.** Measured, not inferred | 2026-08-12 |
| 9 | Primary metric | **MPT at habitual volume**, and the loud-to-soft gap | 2026-08-12 |
| 10 | Accent colour | **Sky blue** `#0369A1`. Not green | 2026-08-12 |
| 11 | Grade UI | Two buttons; **`hard` kept as swipe-left**, `easy` as long-press | 2026-08-12 |
| 12 | Typography | **Serif for the learned item only** | 2026-08-12 |
| 13 | Inbox | Renamed **Capture** in the UI; code names unchanged | 2026-08-12 |
| 14 | M30 live voice | **Approved only while it is free.** Free half-duplex path first; Live API only if his AI Studio quota covers it | 2026-08-12 |
| 15 | Build ownership | **Antigravity implements from Phase 0.5 onward; Claude writes the contract and does the review.** Never the reverse — see `.claude/DELEGATION.md` | 2026-08-12 |

---

## 9. Change log

| Version | Date | What changed |
|---|---|---|
| v0 | 2026-08-11 | First plan. Six pillars, free stack, 5 phases |
| v1 | 2026-08-11 | Second opinion reconciled; Groq added; Core-3/Endless adopted; §6 expansion loop + gate added; six decisions locked |
| **v2** | **2026-08-12** | **Root cause corrected against measurement** — over-drive, not breath capacity; roadmap reordered off it. Speaking Lab promoted to its own surface and specified as M8–M16. **Articulation gap closed** — M25 describe and M26 explain added, new issue P8. **M30 live voice partner** specified. Module catalogue with permanent IDs introduced. UI rebuild split out as Phase 0.5 |
