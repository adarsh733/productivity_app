# SPEAK — plan v1

**Date:** 2026-08-11 · **Status:** decisions locked (§8), nothing built yet.
Supersedes v0. Incorporates a second opinion Adarsh sourced elsewhere — the two
plans agreed on the important calls; §7 records where they differed and why this
one wins the tie.

A single PWA that replaces the phone-unlock reflex with speech, vocabulary and
storytelling training. Installed to the iPhone home screen from Safari, hosted on
Netlify, free at every layer.

---

## 1. The problem set, restated

Adarsh's brief lists seven complaints. They are not seven problems.

| # | As stated | What it actually is |
|---|---|---|
| 1 | Phone addiction (~2–3 yrs, started with a college sports committee) | A trained unlock reflex with no competing destination |
| 2 | Speaks loud, fast, eats words, feels effortful | Speaking on residual air with throat-driven volume |
| 3 | Breathless counting 1→100, can't finish a song | Same root as #2 — breath support, not lungs |
| 4 | Can't find the right word; incidents come out clumsy | Retrieval speed + missing narrative structure, not vocabulary size |
| 5 | Doesn't know English words for basic actions (*tripped, stumbled*) | Genuine lexical gap — concrete verbs |
| 6 | Weak Hindi vocabulary and sentence framing | Genuine lexical gap — second language track |
| 7 | Wants corporate jargon, idioms, phrases | Register gap — situational, not general |

**Two root causes and two gaps.**

- **Root cause A — breath.** Loud + fast + slurred + breathless + tiring is one
  syndrome. The volume is being made in the throat because there is no air column
  behind it; the pace is fast because he is racing to finish the sentence before
  the air runs out; the word-endings disappear because that is where the air runs
  out first. Fix breath and pace/volume/clarity move *without being trained
  directly*. **Train breath first. Everything else compounds off it.**
  → One caveat: persistent breathlessness deserves one GP/ENT check to rule out
  the physical. The described pattern reads as technique, but rule it out once.
- **Root cause B — cognitive load while speaking.** He is simultaneously choosing
  words, inventing structure, and managing air. Three jobs, one working memory.
  Automate structure (5 story shapes) and words (production drills), and the load
  drops enough for delivery to improve on its own.
- **Gap 1 — concrete English verbs** (the *stumbled/lurched/fumbled* layer).
- **Gap 2 — Hindi lexicon + framing**, and **corporate register** as a third,
  narrower band.

### Design consequences

1. **Order matters.** Breath → pace/pause → articulation → word retrieval →
   structure → story. Most apps start at vocabulary and never fix the voice.
2. **Production, not recognition.** He already *recognises* plenty of words —
   that's why flashcard apps won't move him. Every word must be *spoken in a
   sentence he invents*, under a timer.
3. **The mic is the product.** Target: ≥70% of cards require speaking aloud.
   A silent card is a weak card.
4. **Reuse the addiction, don't fight it.** His thumb is trained to scroll a
   vertical feed. Give it one — but each card costs 20 seconds and pays a point.
5. **The voice archive is the retention hook.** Recording daily means that at
   week 8 he can play day 1 against day 56. Nothing else creates that pull.

---

## 2. Shape of the app

Four surfaces. It opens on the first one — no home screen, no menu, no choice.

### A. FEED — the impulse surface (the default)
Full-bleed vertical cards, swipe up for next. Designed for the 40 seconds in a
lift. Mixed types so the next card is never predictable (variable reward).

| Card | What happens | Time |
|---|---|---|
| **WORD** | New word · meaning · 2 examples in his register · say it aloud | 25s |
| **SWAP** | "very tired" → say the one word that does the job. 5s timer | 10s |
| **SAY IT** | Read a line at target pace; live pace + volume meters | 20s |
| **PRONOUNCE** | Hear it → say it → waveform + syllable-stress compare | 15s |
| **ACTION VERB** | A 3-second silent clip/illustration → name the action (*he tripped / stumbled / staggered*) | 15s |
| **IDIOM / JARGON** | Corporate phrase + a scenario: use it in one sentence | 25s |
| **BREATH** | 30-second drill. Rationed — 2–3 per day, never back-to-back | 30s |
| **RECALL** | Spaced-repetition review, always in production form | 20s |
| **MINI STORY** | 30-second prompt: *"the last time you were late"* — record, scored | 45s |
| **FIX MY LINE** | He speaks a clunky sentence → 3 tighter rewrites + the one word that would've done it | 30s |

**Hindi is not in the feed.** English is the whole app; Hindi lives as its own
vocabulary section you enter deliberately (Adarsh's call, 2026-08-11).

**The floor / ceiling mechanic.** Sessions are open-ended, which fails on bad
days unless there's a floor:
- **Core 3** (~3 min): one breath drill, one say-it rep, one word. **The streak
  counts only this** — low enough that 11:50 PM is no excuse.
- **Endless**: after Core 3, an infinite queue. No "you're done!" screen. This is
  where long sessions live and it's the mechanic that competes with scrolling.
- **Target** (not enforced): 12 min Studio + 30 cards.

### B. STUDIO — the intentional surface (one 12-minute session/day)
1. **Warm-up** — breath, humming, slow tongue-twisters.
2. **Pace lab** — teleprompter scrolling at his target WPM; he must keep up and
   not overtake. Live meter.
3. **Story rep** — 90 seconds on a prompt. Full feedback (below), then the app
   returns an *RJ rewrite of his own story* which he then shadows.
4. **Scenario sim** — standup update / disagreeing in a meeting / delivering bad
   news / 30-second exec summary. Timed, register-scored.

### C. INBOX — the 3AM box
One giant field, text or voice, reachable in one tap from anywhere. Dump
anything: a word he heard, a sentence he fumbled, *"what's the thing on a bottle
cap called"*. Overnight it is converted into proper cards and appears in
tomorrow's feed. His own 3AM thought comes back as a lesson — this is what makes
the app feel alive rather than canned.

### D. PROGRESS — the numbers
Every metric below over time, plus the **voice archive**: day 1 vs today, same
prompt, side by side.

---

## 3. What the app measures (all on-device, zero API cost)

Web Audio `AnalyserNode` + `MediaRecorder` give all of this for free.

| Metric | How | Why it matters |
|---|---|---|
| **Speech rate (WPM)** | transcript words ÷ total duration | The headline pace number |
| **Articulation rate** | words ÷ *voiced* time only | Separates "talks fast" from "never pauses" — the fix differs |
| **Pause ratio** | % of silence | Most fast talkers have a normal articulation rate and a 3% pause ratio |
| **Pause placement** | silence vs. punctuation in the target text | Are the pauses in the right places? |
| **Loudness** | RMS → dBFS, mean + peak | The "speaks loud" number |
| **Max phonation time** | hold /a/ steadily, count seconds | Clinical breath-support proxy. Visibly improves week over week — the best motivator in the app |
| **Longest phrase without breath** | voiced-segment duration | Directly maps to his 1→100 complaint |
| **End-of-phrase energy decay** | RMS slope across a phrase | The *running-out-of-air* detector. A steep negative slope = speaking on residual air |
| **Word-ending clarity** | transcript vs. target, weighted to final syllables | The "eating words" number |
| **Filler rate** | count of *um, matlab, basically, actually, like* | Cheap and brutal |

Baseline on day 1, target zones set from it, re-measured weekly.

---

## 4. The learner model (the "smart" part)

A single local profile document, updated by every interaction:

- **Per item:** state (new/shaky/known/automatic), last seen, ease, times
  produced correctly *aloud*.
- **Per pattern:** rolling error tags — *drops final consonants*, *rushes after
  conjunctions*, *overuses "basically"*, *no pause before the punchline*.
- **Content:** what he already used, what interests him, his domain, his register.

Scheduling is **FSRS/SM-2 spaced repetition** — free, local, no API.

**Nightly job** (Netlify scheduled function, ~1 API call): a compact profile
summary goes to Gemini, which returns tomorrow's 40–60 cards as JSON. Batching is
what keeps this inside the free tier — one call becomes a day of content, cached
forever in the local library. Over months the library grows large enough that the
app works well even offline.

---

## 5. Free stack

| Layer | Choice | Free-tier reality |
|---|---|---|
| Hosting | **Netlify** | 100 GB bandwidth, 300 build min/mo |
| App | **Vite + React + TypeScript**, `vite-plugin-pwa` | free |
| Install | Safari → Share → Add to Home Screen | full-screen, no browser chrome |
| Local DB | **IndexedDB via Dexie** | device storage; instant, offline |
| Backup/sync | **Supabase** free (500 MB Postgres, 1 GB files) | Approved. **Sync + backup only — never the read path.** Reads come from Dexie so the app opens instantly with no signal; Supabase syncs behind it. Pauses after 7 idle days, irrelevant at daily use |
| API proxy | **Netlify Functions** | 125k invocations/mo — the API key never reaches the browser. Non-negotiable |
| AI (judgment) | **Gemini API** (AI Studio key) | per-minute/per-day caps; batched + cached |
| AI (bulk text) | **Groq** (Llama) as a second free key | So one provider's quota can't gate the whole app. Verify both tiers' current limits before committing — they change |
| TTS | **Web Speech API `speechSynthesis`** | on-device, offline, free, includes `en-IN`, `en-GB`, `hi-IN` voices |
| STT | **Web Speech API `SpeechRecognition`** (Safari 14.5+), Gemini audio as accuracy fallback | free |
| Audio metrics | **Web Audio API** | no API, no cost, works offline |
| Reminders | **Web Push** — works on iOS 16.4+ *only* for home-screen-installed PWAs | free |
| Cron | Netlify scheduled functions | free |

**Staying inside the free tier**
1. Seed 600–1000 items by hand/one-off generation so day 1 works with **zero**
   API calls.
2. One nightly batch call for tomorrow's feed (~30 calls/month).
3. On-demand calls only where they're irreplaceable: story feedback (1–2/day),
   *fix my line*, inbox processing.
4. Everything generated is cached permanently — the library only grows.
5. Hard fallback: if the API fails or the quota is gone, the app serves from
   cache. **Never a blank screen.**

**Privacy:** the Gemini free tier may use submitted data to improve their
products. Keep audio on the device; send transcripts and metrics, not voice,
except for the one daily story review — and make that an explicit toggle.

---

## 6. What makes it beat Instagram at unlock

Honest limit first: **a web app cannot block or monitor other apps on iOS.**
Anything promising that is lying. What it *can* do is win the moment.

- **Zero-choice entry.** Opens on a card, mid-drill. No dashboard, no menu.
- **Gesture parity.** Vertical swipe feed. The trained thumb finds it familiar.
- **Physical placement.** It goes in Instagram's exact home-screen slot; Instagram
  moves to page 3 in a folder.
- **Sessions, not minutes.** The counter rewards *how many times* he opened it,
  not how long he stayed — the inverse of the attention economy. 12 × 40-second
  sessions beats one 8-minute session.
- **Urge log.** A button: *"I felt the pull."* Tap it, get one 20-second card.
  The headline number on Progress is **urges redirected**. That is the real
  product metric.
- **Forgiving streak.** Two rest days a month, auto-applied, no guilt screen.
- **Wind-down mode.** After 22:00: breathing and slow reading only, dark, no
  streak pressure, no new content. Ends the day *off* the phone.

---

## 6b. The expansion loop (Adarsh's Q5 answer) — and its gate

Every input — a recording, an inbox dump, a card he got wrong — is a seed. It
goes on a queue; a batch job generates **high-temperature variants** into the
content DB for future sessions. That's the requested behaviour and it's what
makes the library grow around *his* actual gaps.

**It needs a quality gate, or it will teach him wrong English.** High-temperature
generation invents idioms, unnatural collocations and Hinglish artifacts, and he
has no way to detect them from inside the app — he'll just start confidently
using a phrase nobody says. Wrong content here is worse than no content.

The pipeline, therefore:

1. **Generate hot** (temp ~1.0) — variety, from the seed.
2. **Verify cold** (temp 0, one cheap batched call) — *is this real, is this
   natural, would a native speaker say it?* Rejects are dropped, not shown.
3. **Dedupe** against the existing library.
4. **Tag provenance** (`source: ai`, seed id, batch id) so a bad batch can be
   purged wholesale.
5. **Serve.** One thumbs-down purges the item *and* blacklists its pattern.

Batch on a schedule, never per-input — per-input calls will burn the free quota
in a week.

---

## 7. Roadmap (reconciled)

| Phase | Contents | Notes |
|---|---|---|
| **0** — week 1 | PWA shell · Netlify · Supabase schema · Dexie · the key-proxy function · **Inbox** · ~300 seeded cards · SRS · Core-3/Endless feed · install to home screen. **No mic, no live AI.** | Ships something to *open*, not just something to type into |
| **1** — weeks 2–3 | Speaking Lab: recorder, live pace meter, live dB meter, pause detection, playback, breath drills (MPT + counting ladder), day-1 baseline. All deterministic, on-device. Async AI ingestion of inputs starts here | The block that actually changes how he speaks — gets the most build time |
| **2** — week 4 | AI judgment over recordings already made: slur/word-merge flags, clarity, pause placement. Inbox classifier turns weeks of dumps into cards. **The §6b gate ships here** | Nothing new to record — judgment layered on existing data |
| **3** — weeks 5–6 | Vocabulary SRS (English feed) + the separate **Hindi** section. Every card answered *aloud* through the Phase-1 recorder | Why it comes after Phase 1, not before |
| **4** — weeks 7–8 | Story engine: prompts, 60s cap, hook/turn/landing feedback, RJ rewrite + shadow, template library, daily corporate line | Root cause B |
| **5** | Adaptive queue from the weakness profile · trend dashboard · voice archive (day 1 vs today) | Only worth building on 8 weeks of data |

**Where the two plans differed, and the call:**

- **Phase 0 contents.** The second opinion ships week 1 as *inbox only* — a text
  box. Rejected: an empty text box does not compete with Instagram, and the habit
  has to exist before the valuable part lands in week 3. Seeded content is a
  one-off generation cost, so including it is nearly free. **Inbox + seeded feed
  both ship in Phase 0.**
- **"Zero AI in Phase 1."** Right about the *meters* — they must never block on
  a network call. Wrong as a blanket rule, since Adarsh wants ingestion from the
  start. **Split it: meters synchronous and local, expansion async and batched.**
- **Live WPM via `webkitSpeechRecognition`.** Treated as solved; it isn't. On
  iOS it stops on silence, has session limits, needs the network, and can raise
  the dictation UI. **Primary pace measurement = syllable-nucleus counting off
  the Web Audio amplitude envelope** (deterministic, offline); STT is a
  cross-check and is used for word-level work (fillers, word-endings) where a
  dropout is tolerable. Both get a real-device test in week 2 before anything is
  built on top.
- **Fixed 130–150 WPM target band.** Replaced with a band derived from his own
  baseline, stepped down ~10% at a time. Telling someone at 200 WPM to hit 140
  tomorrow just makes the meter something to avoid.

**The standing risk:** Phases 3–5 are the fun ones to build and the least likely
to change how he speaks. If Phase 1's dB meter gets fiddly and the vocabulary
engine starts looking attractive in week 2, the project is quietly becoming a
flashcard app.

---

## 8. Decisions — locked 2026-08-11

| # | Question | Answer |
|---|---|---|
| 1 | Name | **SPEAK** |
| 2 | Hindi weight | **English only in the feed.** Hindi = a separate vocabulary section |
| 3 | Backup | **Supabase** — as sync/backup behind a local-first Dexie read path |
| 4 | Daily budget | **12 min Studio + 30 cards** as the target; Core 3 (~3 min) as the streak floor |
| 5 | Voice to cloud | **Yes** — and every input feeds the §6b expansion loop |
| 6 | Cadence | **Phase by phase**, sign-off between each |

---

*Nothing in this document has been built. No product code exists in this
workspace.*
