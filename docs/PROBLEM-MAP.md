# PROBLEM MAP — every issue, and the one thing that answers it

**Updated:** 2026-08-12 · **Status:** current

This is the answer to *"what is working on which part of my problem?"* — the only
document that has to be read to know whether a feature deserves to exist.

**How to use it.** Every issue has a permanent ID (`P#` brief, `V#` voice
profile, `U#` interface). Every module has a permanent ID (`M#`, catalogued in
[`PLAN.md`](PLAN.md) §4). Use the IDs in conversation — *"is M11 still Phase 1?"*
beats describing it. IDs are never reused or renumbered.

**The rule this document enforces:** a module that closes no issue ID does not
get built. If a new idea has no ID to point at, either it is not needed or an
issue is missing — add the issue first.

### Status vocabulary

| | Meaning |
|---|---|
| **SHIPPED** | Running code exists in `speak/src` today |
| **SPEC'D** | Designed in detail, not built |
| **PLANNED** | In the roadmap, not yet designed |
| **RESOLVED** | Measurement closed it. Nothing to build |
| **MIS-TARGETED** | Built, but aimed at something that was ruled out. Needs correcting |

---

## 1. Scoreboard

| Layer | Issues it owns | Built? |
|---|---|---|
| **Habit shell** — feed, streak, urge, capture | P1 | Shipped, never used in real life (not deployed) |
| **Language half** — words, verbs, idioms, Hindi, articulation | P4 P5 P6 P7 | Mostly shipped; **articulation missing entirely** |
| **Voice half** — mic, meters, drills | P2 P3 · V1–V7 | **Nothing built. No mic code exists** |
| **Interface** — the shell's look and structure | U1–U12 | Spec'd in `WIREFRAMES.html`, not built |

**The headline:** 9 of the 26 live issues have running code against them. All 9
are habit or vocabulary. Every voice issue — the ones with measurements behind
them — is at zero.

---

## 2. Group P — the original brief (2026-08-11)

| ID | As stated | What it actually is | Modules that answer it | Phase | Status |
|---|---|---|---|---|---|
| **P1** | Phone addiction, ~2–3 years, started with a college sports committee | A trained unlock reflex with no competing destination | M1 feed · M2 Core 3 + streak · M3 urge chip · M4 progress · M7 wind-down | 0 | **SHIPPED** |
| **P2** | Speaks loud and fast, eats words, speaking feels effortful | **Superseded by measurement.** Not weak breath support — habitual over-drive. See V1–V3 | M11 volume meter · M9 SOVT · M10 MPT | 1 | **PLANNED** |
| **P3** | Breathless counting 1→100, can't finish a song | **Capacity was ruled out.** Count of 28 is normal. Resolves as a side-effect of P2 | — | — | **RESOLVED** ⚠ see §6 |
| **P4** | Can't find the right word; incidents come out clumsy | Two separate things: retrieval speed, and missing narrative structure | M17 word · M18 swap · M23 recall — retrieval<br>M26 explain · M27 mini story · M28 fix my line — structure | 0 / 3 | **Half SHIPPED** |
| **P5** | No English words for basic actions (*tripped, stumbled*) | Genuine lexical gap — concrete verbs | M19 action verb (40 cards) | 0 | **SHIPPED** |
| **P6** | Weak Hindi vocabulary and sentence framing | Genuine lexical gap — second track | M24 Hindi section (40 cards) | 0 | **SHIPPED** (as a dead-end carousel — U9) |
| **P7** | Wants corporate jargon, idioms, phrases | Register gap — situational | M20 idiom / jargon (45 cards) | 0 | **SHIPPED** |
| **P8** | *(added 2026-08-12)* Can't explain a picture or a scenario fluently | Extemporaneous production under load — the gap between knowing words and producing them unprompted | M25 describe · M26 explain · M27 mini story | 3 | **PLANNED** — see §5 |

---

## 3. Group V — the voice profile (2026-08-12, measured)

Every one of these traces to a single root cause: **chronic excess subglottic
pressure**. Evidence in [`VOICE-PROFILE.md`](VOICE-PROFILE.md) §1–2.

| ID | Complaint | Mechanism | Modules that answer it | Phase | Status |
|---|---|---|---|---|---|
| **V1** | Effortful speech, fatigue after long conversations | The root cause itself — speaking at ~2× the required pressure | M11 live volume meter · M9 SOVT + transfer rep | 1 | **PLANNED** |
| **V2** | Runs out of air mid-sentence | Air spent ~1.6× too fast. 15 s loud vs 25 s soft | M10 MPT tracker (loud / soft / **the gap**) · M11 | 1 | **PLANNED** |
| **V3** | Words merge, endings disappear | Acoustic masking — a loud voice smears forward over its own final consonants | M15 pace & masking monitor · M21 pronounce | 3 | **PLANNED** (M21 shipped but silent) |
| **V4** | Heavy / thick voice ("moti awaaz"), wants deeper | Two perception traps + larynx riding under load. Pitch is fixed; **resonance is the lever** | M16 resonance check (chest hum → hum-to-speech) | 5 | **PLANNED** |
| **V5** | No quiet gear — can't speak softly in a silent room | A coordination never practised. Mechanically a different task, not "loud turned down" | M12 volume ladder trainer + level-1 hold | 2 | **PLANNED** |
| **V6** | Harsh / blunt rather than polite; anger projects, warmth doesn't | 40% acoustic (fixes itself with V1), 60% untrained prosody | M13 pause trainer · M14 emotional palette · M30 live voice partner | 2 / 4 | **PLANNED** |
| **V7** | Only one emphasis dial — getting louder | Loudness is the only expressive variable available | M13 pause trainer — emphasis by pause, volume flat | 2 | **PLANNED** |

---

## 4. Group U — the interface (2026-08-12)

All twelve are answered 1:1 in [`WIREFRAMES.html`](WIREFRAMES.html) §01. **All
twelve are SPEC'D, none built.** They belong to Phase 0.5 and are blocked on four
answers (see [`PLAN.md`](PLAN.md) §7).

| ID | What it does now | What replaces it |
|---|---|---|
| **U1** | Near-black shell with seven saturated hues | Warm paper, white cards, near-black ink. Light is the theme, not an option. Hues survive as a 3px spine and kicker only |
| **U2** | Four grade buttons — Again / Hard / Good / Easy | Two buttons: Again, Got it. Easy = long-press. **Hard is deleted** — you cannot honestly grade a rep you just spoke |
| **U3** | Every card is the same undifferentiated stack | Fixed anatomy — the thing you must say aloud is always the same block, same place, same colour |
| **U4** | "Felt the pull" top-right, competing with the streak | A quiet chip below the actions → taps to "Counted." It is a confession, not a header control |
| **U5** | Tab glyphs are ◈ ＋ अ ◉ | Four drawn line icons, 22px, plus labels |
| **U6** | Progress leads with a giant number that is 0 all week | Day one shows a starting state. The hero stat becomes the hero once it has earned it |
| **U7** | No first-run screen — opens straight onto a breath drill | Three panels, ~15 seconds, ending inside Core 1. Sets the one expectation: **you will be speaking out loud** |
| **U8** | On a long card the say-prompt can fall below the fold | Body scrolls inside a fixed frame; the say-block is pinned above the actions. The mandatory part cannot be pushed off-screen |
| **U9** | Hindi is a prev/next carousel that greys out at the end | A dead end — the one thing the app forbids. Same endless queue, own counter |
| **U10** | "swipe up to pass" is permanent text on every card, forever | First three cards only, as a moving hint. A permanent instruction admits the gesture isn't discoverable |
| **U11** | One system font, three sizes, evenly spaced | A serif for the learned word only, sans for all chrome |
| **U12** | Core 3 progress is a full-width bar scaling 0→1 | Three dots. A bar implies a loading screen; three is a number you can hold in your head |

---

## 5. Gap found 2026-08-12 — articulation was not covered

**Adarsh's catch, and he was right.** The plan had *no card that makes him produce
extemporaneous speech about something in front of him.* What existed:

| Card | What it actually trains | Is it articulation? |
|---|---|---|
| M22 say-it | Reading a supplied line at a target pace | **No** — delivery, with the words handed to him |
| M19 action verb | Naming an action in one word | Partly — one word, not a sentence |
| M17/M18 word, swap | Using a supplied word in an invented sentence | Partly — one sentence, cued by the word |
| M27 mini story | 30–60 s on a personal prompt | Yes, but it was Phase 4 and drew on memory, not on something present |

The missing rung is between "use this word in a sentence" and "tell a story":
**describe or explain something in front of you, for 30–45 seconds, unrehearsed.**
That is the skill that fails in a meeting, and it is the direct trainer for P4.

Two modules added to close it — **M25 describe** (a picture or scene: *what is
happening, who, what next*) and **M26 explain** (a scenario to a named audience:
*explain to your manager why the release slipped*). New issue **P8** logged
above. Both are Phase 3, **content not yet written**.

Note the two meanings of "articulation", because they need different modules:

- **Articulation (phonetic)** — consonant precision, word endings → M21, M15. Owned by V3.
- **Articulation (expressive)** — getting a thought out cleanly → M25, M26, M27, M28. Owned by P4, P8.

---

## 6. Live corrections — where the built app disagrees with the evidence

| Correction | Detail | Fix |
|---|---|---|
| **Breath cards target a ruled-out cause** | 4 of 8 shipped breath cards (`br-ladder-back`, `br-phrase-hold`, `br-stairs`, plus the countdown framing of `br-mpt-sss`) drill *capacity*. Capacity measured normal (count 28, /s/ 18 s, /z/ 25 s). Only `br-hum` and `br-sigh` do work the evidence supports | Retire the capacity ladders; expand the SOVT set; make the transfer rep mandatory on every drill. Phase 1, with M9 |
| **`PLAN.md` v1 §1 root cause A was wrong** | It inferred "insufficient breath support" and ordered the whole roadmap off it. Measurement contradicts it | Corrected in `PLAN.md` v2 §1. v1 is superseded — do not cite it |
| **The app cannot hear** | `speak/src` contains no `getUserMedia`, `MediaRecorder` or `AnalyserNode`. The plan's own rule is "≥70% of cards require speaking aloud" | Phase 1 is exactly this. Nothing before it changes how he speaks |

---

## 7. What closes when

| Phase | Closes | Leaves open |
|---|---|---|
| **0** — done | P1 P5 P6 P7, half of P4 | Everything voice |
| **0.5** — UI rebuild | U1–U12 | Everything voice |
| **1** — Speaking Lab core | **V1 V2**, P2, and the §6 breath correction | V3–V7, P8 |
| **2** — Quiet register + emphasis | **V5 V6 V7** | V3 V4, P8 |
| **3** — Articulation & production | **P4 P8 V3** | V4 |
| **4** — Live voice partner | reinforces V6, P8 | V4 |
| **5** — Adaptive & archive | **V4** | — |
