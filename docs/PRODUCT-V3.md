# V3 — The Casual Rebuild

**Status:** proposal, awaiting Adarsh's sign-off on §2 (the name) and §7.4 (images).
**Supersedes:** the information architecture in `PRODUCT-RESET-PLAN.md` §9. Everything
else in that document — the problem list, the voice science, the content layers, the
AI architecture — still stands and is referenced here rather than repeated.
**Audience:** Antigravity builds from this plus `.claude/briefs/AG-004-v3-rebuild.md`.

---

## 1. The diagnosis

I ran the app at 375×812 and walked it. This section is what I found, not what the
documents claim.

### 1.1 The app bricks after three taps

Open the app, get through onboarding, and you land on **Daily**. You are shown a
counter — "Core 2/3" — and three cards. Tap "Got It · Next Card" three times and
the screen becomes:

> Loading today's deck…

Forever. No error, no console warning, no way out except switching tabs. The card
counter reads **"Core 4/3"** on the last card before it dies.

Cause: `DailyScreen` calls `useFeed('core')`, which builds a queue of exactly three
items, and then never calls `setMode('endless')`. The old `FeedScreen` did hand off;
the V2 rewrite dropped it. This is the same bug that was found and fixed once before
in the AG-002 review pass, re-introduced.

**This alone explains "totally unusable."** The home tab of the app has a three-tap
lifespan. Everything else I say below is secondary to this.

### 1.2 The first thing you see is a breath drill with broken copy

The first card on Daily is not a word. It is:

> 🧘 COMPOSURE RESET · Core 2/3
> **Humming warm-up**
> straw
> 👆 Tap to reveal workplace meaning & context

Three things wrong in one card. `straw` is the raw `BreathDrill` enum leaking into
the UI as a subtitle. "Tap to reveal workplace meaning & context" is generic copy
applied to a breathing exercise, which has no workplace meaning. And tapping reveals
a heading that says **MEANING** followed by a paragraph of physical instructions.

One generic card renderer is being used for seven card types that need different
shapes. It produces gibberish on three of them.

### 1.3 The onboarding is a clinical intake form

Four screens before you learn a single thing:

1. "Say something meaningful. Repeat it better." + a disclaimer that this is *not a
   medical or diagnostic voice service*.
2. Choose your speaking environment — freely / quietly / cannot speak.
3. **Microphone self-test** — "records the room noise floor and whether the browser
   kept automatic gain disabled."
4. **Comparable setup** — "place the phone about 30 cm away," "same phone and
   built-in microphone," "reasonably quiet room."

That is the intake protocol of a voice clinic. It is genuinely good engineering — the
dB math underneath it is the most careful code in the repo — but it is asked of
someone who wanted to look at some idioms. Nobody opens a casual app and gets asked
about automatic gain control.

### 1.4 The feedback is fabricated

`ScenarioModal.tsx` records real audio. Then it shows:

> 💡 **1 Key Win** — You maintained steady delivery and framed the trade-off with
> clear narrative structure.
>
> 🎯 **1 Polish Opportunity** — Try placing a deliberate 1-second pause before
> stating the revised date to heighten executive authority.

Those two sentences are hardcoded. Every recording gets them. Record silence, get
them. Record in Hindi, get them. The waveform above them is eight `<span>`s with
CSS heights — it is a drawing, not your voice. "Save & Done" closes the modal and
saves nothing.

This is the answer to *"What is happening with that audio? I don't know."* Nothing is
happening with it. The app is telling you it listened when it did not.

### 1.5 There is no AI in the app

`netlify/functions/ai.ts` exists — the proxy, the task allowlist, the Gemini→Groq
failover, all built. A grep for `fetch(` across `speak/src` returns **zero results**.
Nothing has ever called it. The AI architecture is a plan, not a feature.

### 1.6 The 30-second Rapid Rep never opens the microphone

In `VoiceGymScreen`, "Start 30s Clock" sets a state flag and runs a `setInterval`.
The label under it says **"Recording... speak now"**. No `getUserMedia`, no
`MediaRecorder`, nothing. This is the *"it says start microphone and there is nothing
there on the screen"* complaint, precisely: it is a stopwatch wearing a microphone
costume.

### 1.7 Three products are stacked in one codebase

Twelve components are orphaned — imported by nothing:

```
FeedScreen · HindiScreen · InboxScreen · progress/ProgressScreen
reset/TodayScreen · reset/CoachScreen · reset/PracticeScreen · reset/ProgressScreen
LiveDbMeter · MptTracker · VolumeLadder · useMptTest
```

Three generations, none removed:

| Gen | What it was | State |
|---|---|---|
| 1 | SRS flashcard feed — Feed / Hindi / Inbox / Progress | Screens orphaned, but its engine (`useFeed`, `queue`, SM-2) still drives Daily |
| 2 | Clinical voice lab — Today / Coach / Practice / Progress, 12-min routine, dB calibration, MPT | Mostly orphaned, still owns onboarding and the deep session |
| 3 | The casual redesign — Daily / Library / Voice Gym / Saved | Half-built, running on Gen 1's engine, which is why Daily dies |

The confusion you feel using it is real and it is structural. You are using three
apps at once and each tab belongs to a different one.

### 1.8 Vocabulary — the thing you actually want — is buried

To read one idiom casually you must: open the app → land on Daily (breath drill) →
switch to Library → scroll a grid of six decks → tap a deck → a modal opens → tap
`›` to advance one card at a time. Six actions, and the last one is a button, not a
swipe. `useCardGestures.ts` — the swipe engine — exists and is wired only to the
orphaned `FeedScreen`. **Nothing in the shipped app is swipeable.**

And the primary button on a vocabulary card is **"Got It · Next Card ›"**, which is
an SRS grade. The app asks you to *assess yourself* on a word you are meeting for the
first time. That is a test, not a browse.

### 1.9 The content runs out

368 cards total: 120 words (80 English + 40 Hindi), 45 corporate idioms, 40 swaps,
40 action verbs, 40 pronunciation, 35 say-it lines, 10 breath drills, 38 exemplars.

For a "scroll through casually" app at 20 cards a day, that is about three weeks
before you have seen everything. And several things on your list have **no content at
all**: feelings vocabulary, phrases-as-a-deck, geopolitics/history/philosophy
explainers, life-story prompts, storytelling technique, teach-back.

---

## 2. Brutally honest verdict

**The engineering is good and the product is wrong.** The SM-2 scheduler, the queue
with its anti-repetition rules, the dB math with its drift debouncing, the offline
Dexie layer with an outbox — that is careful, tested, real work. 143 tests pass.
There is nothing structurally rotten under the hood.

What is wrong is above it, and it is one mistake made repeatedly: **the app was
designed as a training programme and you wanted a place to hang out.**

Every symptom follows from that:

- A training programme has a *session*, so the home tab is a mandatory three-card
  sequence with a counter.
- A training programme *measures*, so onboarding calibrates your microphone before
  it shows you a word.
- A training programme *assesses*, so the button under a new word is "Got It."
- A training programme is *finite*, so the feed ends and never refills.
- A training programme has a *primary exercise*, so speaking took the whole app and
  vocabulary became a sub-menu.

**On the name.** "SPEAK" is not a branding problem, it is the diagnosis in five
letters. The name committed the IA. Once the product is called Speak, the microphone
has to be the main verb, and everything that is not speaking — which is most of what
you asked for — becomes preparation for speaking rather than a thing in itself. The
tab literally named "Voice Gym" sits next to a tab named "Library," and the Library
is the one you actually want to open.

The worst of it is §1.4. An app that fabricates feedback about your voice is worse
than an app with no feedback, because you cannot tell which of its claims to trust.
That has to go before anything else ships, whether or not you accept the rest of this
document.

**Recommendation on the name:** rename the product **Articulate**, and let **Speak**
survive as the name of one tab inside it. "Articulate" carries both halves of what you
want — having the right words, and delivering them well — so vocabulary is no longer a
side dish. Alternates if you dislike it: **Well Said**, or **Register** (voice
register / word register, a nice double meaning but obscure). *This is your call and
nothing else in the plan depends on it — the rebuild works under any name.*

---

## 3. Everything you have asked this product to cover

You asked me to list it all back. Here it is — from this conversation and from
`PRODUCT-RESET-PLAN.md` §2–3 — with an honest column for what the app does today.

| # | What you asked for | In the app today |
|---|---|---|
| 1 | English vocabulary you can retrieve mid-sentence | 80 cards, buried behind a modal |
| 2 | Office jargon and corporate idioms | 45 cards, browsable |
| 3 | Professional / consulting / MBA-register phrasing | Partly, inside the idiom deck |
| 4 | Phrases as their own thing | **Nothing** — no phrase deck exists |
| 5 | Action verbs for describing events vividly | 40 cards, browsable |
| 6 | Practical Hindi — Samay Raina register, not textbook | 40 cards, browsable |
| 7 | Pronunciation and word-ending clarity | 40 cards, TTS only, no check |
| 8 | Pace — stop merging words together | 35 say-it lines, no measurement wired |
| 9 | Quiet register — stop using volume as emphasis | dB engine built, unreachable |
| 10 | Breath running short mid-sentence | 10 drills, served as feed cards where they don't belong |
| 11 | Telling a friend about an incident, clearly | **Nothing** |
| 12 | Daily office calls — updates, pushback, alignment | 7 scenario prompts, fake feedback |
| 13 | Explaining feelings precisely | **Nothing** |
| 14 | Geopolitics, history, philosophy, psychology | **Nothing** |
| 15 | Telling a life story | **Nothing** |
| 16 | Storytelling craft — hooks, turns, landings | **Nothing** |
| 17 | Teach-it-back as the route for general learning | **Nothing** |
| 18 | Redirect the phone impulse into something useful | One button that logs a counter |
| 19 | Reduce total phone time | Not modelled |
| 20 | Style references: Palki Sharma, Think School, RJs, Samay Raina | Named in docs, absent from content |

**Eight of twenty have no content at all, and seven of those eight are the
expressive half** — incidents, feelings, ideas, life stories, storytelling craft,
teach-back. The app covers the *word* layer reasonably and the *voice* layer
theoretically, and it does not touch the *expression* layer, which is the one you
described most vividly.

The rephrasing you asked for: **this is not a speaking app. It is an expression app.**
Words, phrasing, delivery, and story are four lanes of one skill, and speaking is how
three of them get tested — not what the app is.

---

## 4. The rebuild in one paragraph

Open it, land in an endless swipeable feed of words, idioms, phrases, Hindi, and
situations. Swipe up for the next one, right to save it, tap to see more. Never a
session, never a counter out of three, never a microphone you did not ask for. If a
card makes you want to say it out loud, there is a mic on that card and you tap it —
and when you do, the situation stays on screen while you speak, and what comes back
afterwards is measured from your actual attempt or is not shown at all. Browse when
you want something specific. Speak when you want to work. Leave whenever.

---

## 5. Information architecture

Four tabs. A floating Capture button, as today.

### 5.1 Feed — home, and the whole point

An **endless vertical swipeable feed**. This is `useFeed('endless')` with the
refill loop, one card per screen, full-bleed.

- **Swipe up / down** — next / previous card.
- **Swipe right** — save (goes to You). Shows a brief ⭐ confirmation.
- **Swipe left** — "less of this." Down-weights that card type in the queue for a
  week. Not a grade, not a failure — a preference.
- **Tap** — flip to detail (meaning, context, example).
- **🔊** — hear it (TTS, existing `speak()`).
- **🎙️** — *optional* spoken rep on this card. Never required, never a gate.

Rules that are not negotiable:

- **No "Core N/3."** No mandatory sequence. No session.
- **The feed never ends.** It refills before it runs out. When genuinely exhausted
  it re-serves due cards (SRS), and says so quietly.
- **Breath drills are not feed cards.** They move to the Speak tab. A breathing
  exercise is not something you scroll past.
- Day one, card one, is a **word or an idiom** — never a drill.

A slim top bar carries the streak, today's count, and nothing else.

### 5.2 Browse — search and decks

Keep what exists; it is the best screen in the app. Changes:

- Search stays at the top and searches everything (it already does).
- Deck detail becomes **the same swipeable card view as the Feed**, not a modal with
  `›` buttons.
- Add the missing decks (§7).
- Each deck shows a progress ring: cards seen / total.

### 5.3 Speak — the gym, where every microphone lives

Everything mic-related moves here and nothing mic-related lives anywhere else, except
the optional 🎙️ on a feed card.

Four sections:

1. **Describe this** — a picture or a described scene. "Tell me what is happening,
   in 30 seconds." This is the thing you asked for directly.
2. **Situations** — the seven existing scenarios plus new ones for incidents,
   feelings, opinions, life stories.
3. **Micro-drills** — 30–60s: pace, a pause drill, quiet register, the breath
   drills that used to pollute the feed.
4. **Deep session** — the existing 12-minute `SessionRunner`, kept, clearly optional,
   never the default path, never on the home screen.

### 5.4 You — saved, streak, and honest progress

Saved cards, captured notes, your recordings with playback, streak calendar, deck
rings, and a weekly recap. Every number here must be traceable to something that
actually happened (§6.2).

### 5.5 Onboarding

**Three taps, then the feed.** Ask one question — *"What do you want more of?"* with
multi-select chips (Office English · Everyday words · Hindi · Speaking · Storytelling)
— use it to weight the queue, and get out of the way.

The microphone check, the environment choice, and the 30 cm comparable-setup screen
are **not deleted** — they move to Speak → Settings, and are prompted the first time
you record something that needs measurement. Calibration is a feature of the gym, not
a toll booth at the front door.

---

## 6. The two rules that must not be broken

### 6.1 The microphone is never a gate

Every card and every screen must be complete and useful with the microphone denied,
broken, or ignored. Speaking is an *upgrade* offered on top of content that already
stands alone.

And whenever recording is live, the screen must show — at the same time, without
scrolling — the prompt or situation, the target words, a **real** waveform driven by
the analyser, and the elapsed time. If there is a microphone open and the screen
cannot answer *"what am I supposed to say right now?"*, that screen is broken.

### 6.2 The app never claims something it did not measure

Delete the hardcoded feedback in `ScenarioModal` and the CSS waveform. Replace them in
three tiers, and ship only what the tier can honestly support:

- **Tier 0 — on device, free, build now.** Duration; words-per-minute; number and
  placement of pauses; whether the target words were actually said (Web Speech
  recognition); volume steadiness relative to *your own* baseline. Label it
  "measured on this device."
- **Tier 1 — AI on the transcript, build now.** Send the *transcript* (not the audio)
  through the existing `netlify/functions/ai.ts` to Gemini. Return exactly one win and
  one fix, both quoting your actual words back. Cheap, fast, and it finally gives that
  function a caller.
- **Tier 2 — AI on the audio. Later.** Tone, warmth, pace judgement. Only once
  Tier 1 has proven useful, and only with an explicit on-screen upload notice per
  `PRODUCT-RESET-PLAN` §8.4.

If a tier cannot produce a sentence from the actual attempt, the app shows the
recording and the measured numbers and says nothing else. Silence is honest;
"You maintained steady delivery" is not.

---

## 7. Content

### 7.1 The gap

368 cards is roughly three weeks. Target **1,500+** before this feels endless.

### 7.2 New decks to author

| Deck | Why | Target |
|---|---|---|
| **Phrases That Land** | You asked for phrases as their own thing | 120 |
| **Feelings, Precisely** | "Explaining feelings" — #13, currently nothing | 100 |
| **Incident Retelling** | Telling a friend what happened — #11 | 80 prompts |
| **Ideas & Opinions** | Geopolitics, history, philosophy, psychology — #14 | 100 prompts |
| **Your Life, Told Well** | Life stories — #15 | 60 prompts |
| **Story Craft** | Hooks, transitions, turns, landings — #16, RJ register | 80 |
| **Teach It Back** | #17, the route for general learning | 60 prompts |
| **Describe This** | Image/scene → 30s description | 150 |

### 7.3 Expansion, and the gate

Volume comes from AI expansion, and expansion is exactly where this app can start
teaching wrong English. The pipeline in `PRODUCT-RESET-PLAN` §7.5 is not optional:

> generate hot → **verify at temperature 0** → dedupe against existing → tag → serve

No generated card reaches the feed without passing the cold verification pass. A card
that fails is discarded, not softened. Batch ids are already on the card contract so a
bad batch can be purged wholesale — use them.

### 7.4 "Describe this image" — a decision for you

You asked for this directly. Two ways to build it:

- **A. Curated static pack (recommended).** Ship ~150 images with the app. Free,
  instant, works offline, no API cost per view, and we control that every image has
  something worth describing. The AI still grades your description.
- **B. Runtime generation.** Fresh image per session. Costs money per view, adds
  3–8 seconds of latency to a casual app, and image models produce a lot of
  nothing-happening pictures.

I recommend **A**, with a small B-powered "surprise me" button later if you want
novelty. **Needs your answer before Antigravity starts on the Speak tab.**

---

## 8. Gamification — Duolingo's fun, not Duolingo's guilt

- **Streak** = any **5 cards** *or* **1 spoken rep** in a day. That is it. A
  thirty-second day must keep the streak, or the streak becomes a reason to avoid
  the app.
- **Two freezes a month**, granted silently, spent automatically.
- **XP**: 1 per card seen, 3 per card saved, 10 per spoken rep, 25 per Describe-this.
- **Daily goal you choose**: Casual 10 XP · Regular 30 · Serious 60. Changeable any
  time, never nagged about.
- **Deck rings** in Browse — visible completion without a deadline.
- **Weekly recap**: "You met 34 new words. You used 6 of them out loud. Your longest
  streak this month is 9 days."
- **The impulse counter stays** — "opened this instead" is your real north-star metric
  and it is the one honest number the app already collects.

Explicitly **not** doing: hearts, lives, losing progress, streak-loss guilt
notifications, leaderboards, or anything that punishes a missed day. This app competes
with Instagram for the same thirty seconds, and it wins by being lighter, not by
being stricter.

---

## 9. What gets deleted

- The 12 orphaned components in §1.7.
- The `FeedMode = 'core'` path and the Core-3 concept in `queue.ts` — the queue keeps
  its anti-repetition and daily-cap rules, loses the mandatory sequence.
- The hardcoded feedback block and the mock waveform in `ScenarioModal`.
- The fake-recording Rapid Rep in `VoiceGymScreen`.
- The 4-screen onboarding, reduced to one question (§5.5); its microphone and
  calibration screens move to Speak → Settings.
- "Got It · Next Card" as the primary action on a vocabulary card.

**Kept and reused, untouched:** the SM-2 scheduler, `buildQueue`'s anti-repetition and
new-card caps, Dexie + the outbox + sync, `audioMeter.ts` and the calibration math,
`useMissionAudio`, `speak()`, the design tokens, and every one of the 368 authored
cards.

---

## 10. Build order

| Stage | What | Why first |
|---|---|---|
| **0** | Fix the dead end; delete the fabricated feedback | The app is unusable and dishonest until both are gone. Half a day. |
| **1** | Endless swipeable Feed + new tab shell + 3-tap onboarding | This is the product. Everything else is a supporting tab. |
| **2** | Browse: swipeable decks, deck rings | Cheap — the screen already works |
| **3** | Speak tab: consolidate every mic path, real waveform, Tier 0 metrics | Makes speaking honest and optional |
| **4** | Tier 1 AI feedback via the existing proxy | First real AI in the app |
| **5** | Content: new decks + verified expansion to 1,500 | Makes the endless feed genuinely endless |
| **6** | Gamification: XP, rings, weekly recap | Only fun once there is enough to do |
| **7** | Describe-this image pack | The thing you asked for, once the gym is honest |

Stage 0 is worth doing today regardless of what you decide about the rest.

---

## 11. Open decisions — yours

1. **The name.** Recommendation: **Articulate**, with Speak as a tab. Nothing depends
   on this; say the word and it changes.
2. **Describe-this images**: curated static pack (recommended) or runtime generation?
3. **Hindi placement**: its own deck in Browse *and* mixed into the Feed at roughly
   1 in 8 cards — or Browse only? Recommendation: mixed in, at that ratio.
