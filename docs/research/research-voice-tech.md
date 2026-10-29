# Voice conversation coach — tech + cost research

Researched 2026-10-29. Every price below was read on the official page that day, unless marked otherwise.
Scope: Speak/Articulate PWA (iPhone home screen, Netlify function `ai.ts`), one user.

---

## Part 1 — What the code does today (read-only check)

### `netlify/functions/ai.ts`
- **Tasks allowed:** `expand_seed`, `verify_batch`, `classify_inbox`, `review_recording`, `plan_week`. No conversation or small-talk task exists.
- **Providers, tried in this order:** Gemini, then Groq, then Anthropic. A request can set `prefer` to change the order.
  - Gemini: `gemini-2.5-flash` (line 138)
  - Groq: `llama-3.3-70b-versatile` (line 139)
  - Anthropic: `claude-haiku-4-5` (line 137)
- **Text only. No task accepts audio.** Every provider call sends one text message, which is `JSON.stringify(payload)`. Gemini gets `parts:[{text}]`, so there are no `inlineData` audio parts. Payloads are capped at 60,000 characters.
- **`review_recording`:**
  - The server rejects it unless `payload.transcript` is a string of 5 or more words. An optional `watch` list holds up to 10 known mistakes.
  - It returns `{summary, strongPoint, oneCorrection, suggestedAlternative?, mistake?}`.
  - Settings: temperature 0.3, 1,024 max tokens.
  - The system prompt mentions "performance duration" and "Focus on pacing". The client sends only `{transcript, watch}` (`src/features/ai/useAiFeedback.ts:143`), so the model never receives a duration, WPM or loudness number. Any pacing comment it makes is a guess from the text.
- **Limits:**
  - 8 s timeout per provider and a 24 s total deadline.
  - In-memory rate limit of 30 requests a minute per IP.
  - Output is checked against a schema, with failover to the next provider.
  - The client drops any feedback that quotes words not found in the transcript (`containsFabricatedQuote`), and any `mistake` that is not in the transcript.

### Problems with the model names (found during this research)
| Code uses | Status on 2026-10-29 | Source |
|---|---|---|
| Groq `llama-3.3-70b-versatile` | **Deprecated, shutdown date 16 Aug 2026** for free and developer tiers. Groq suggests `openai/gpt-oss-120b` or `qwen/qwen3.6-27b` instead. The models page still lists it, but as "Contact Sales". **The Groq fallback is most likely failing today.** | console.groq.com/docs/deprecations, /docs/models |
| Gemini `gemini-2.5-flash` | Not deprecated. Google's models page says 2.5 access is "limited to users who have used them in the past", and recommends 3.5 Flash-Lite or 3.8 Flash for new projects. It still works if this key used it before. | ai.google.dev/gemini-api/docs/models, /deprecations |
| Anthropic `claude-haiku-4-5` | Still listed at $1 in / $5 out per million tokens. Outdated: **Claude Haiku 5.5 (`claude-haiku-5-5`) costs $0.10 / $0.50, 10x cheaper.** | platform.claude.com/docs/en/about-claude/pricing |

### Recording and transcription in `src/`
- **`src/features/speak/useSpeakingAttempt.ts` (the main recorder):**
  - **One microphone stream** comes from `getUserMedia`. Echo cancellation, noise suppression and auto-gain are all OFF (`MIC_CONSTRAINTS`, `src/lib/audioMeter.ts:392`), so the loudness readings are honest.
  - The stream feeds three things at once:
    1. **`AudioMeterController`** (Web Audio): dB on every frame. It computes the average voiced dB, noise floor, voiced seconds and pause count, all locally with no AI.
    2. **`MediaRecorder`**: prefers `audio/mp4` (what iPhone produces), then `webm;opus`, `webm`, `ogg`. It collects 1-second chunks into a Blob, which is **saved only in IndexedDB on the phone and never synced or uploaded** (`db.ts:37`, `contract.ts:870`).
    3. **`webkitSpeechRecognition`** (Web Speech API): continuous, with live (interim) results, language `en-IN` (`hi-IN` for Hindi cards), and an automatic restart when it stops. **This is the only source of the transcript.**
  - **WPM:** worked out only when speech recognition returned words. Otherwise it shows "—" and is never estimated.
- **`src/features/coach/CoachBox.tsx`:** separate dictation into the coach text box, also through `webkitSpeechRecognition`. It is only shown when the browser supports it.
- **`useAiFeedback.ts`:** sends the transcript to `/.netlify/functions/ai` as `review_recording`. With no transcript you get the message "AI feedback needs a transcript".
- **Conclusion:** the audio file never leaves the phone today. All AI feedback depends on the phone's own speech recognition producing a transcript.

### The big risk in today's setup
WebKit bug 225298, "SpeechRecognition API is not available in SafariViewController and web apps added to Home Screen", is marked RESOLVED-LATER. Its last comment (2025-03-01) asks for an update and gets no reply, and no fix has been announced. Apple forum thread 748048 reports the same thing: the mic button works in Safari but not after adding the app to the Home Screen.

Separate reports say `continuous` mode on iOS stops on silence or acts strangely.

**If this still holds on his iOS version, the installed app gets no transcript. That means no AI feedback and no WPM.** This needs one 2-minute test on his phone: install from Safari, open from the home-screen icon, record, and see whether a transcript appears. A server-side transcript (Whisper) removes the risk entirely.

---

## Part 2 — Provider research (all seen 2026-10-29)

### 1. Google Gemini API
Sources:
- ai.google.dev/gemini-api/docs/pricing ("Last updated 2026-10-28")
- ai.google.dev/gemini-api/docs/audio
- ai.google.dev/gemini-api/docs/rate-limits

- **How audio is counted:** "32 tokens per second of audio (1 minute = 1,920 tokens)". A prompt can hold up to 9.5 hours of audio.
- **Request size:** 20 MB per request when the audio is included directly in it.
- **Formats:** WAV, MP3, AIFF, AAC, OGG, FLAC, MPEG, M4A, Opus, WebM, and others. The page does not list "MP4", even though iPhone records `audio/mp4` (AAC inside an M4A-style container). Labelling it `audio/aac` or `audio/m4a` should work, but test it.
- **Which models accept audio:** all the current Flash and Flash-Lite models take audio as an input type. The audio docs examples use `gemini-3.8-flash`.

| Model | Free tier | Input price per 1M tokens | Audio input per 1M | Output per 1M |
|---|---|---|---|---|
| Gemini 3.8 Flash (stable, newest) | yes | $0.75 until 31 Dec 2026, then $1.50 | no separate rate listed (the $0.75 seems to cover all inputs) | $3.75, then $7.50 |
| Gemini 3.5 Flash-Lite | yes | $0.30 | same as text | $2.50 |
| Gemini 3.1 Flash-Lite | yes | $0.25 | $0.50 | $1.50 |
| Gemini 2.5 Flash (in the code now) | yes | $0.30 | **$1.00** | $2.50 |
| Gemini 2.5 Flash-Lite | yes | $0.10 | $0.30 | $0.40 |
| Gemini 3.5 Transcribe (transcription only) | yes | — | $2.00, or **$0.003/min** | $12.00, or $0.002/min |

- **Free-tier limits:** Google no longer publishes a table. The rate-limits page says "View your active rate limits in AI Studio". Limits apply per project, reset at midnight Pacific time, and are "not guaranteed". Reported numbers:
  - Gemini 3.8 Flash: **20 requests/day** on the free tier (forum post, 2026-09-03, still unanswered on 2026-10-16)
  - Flash-Lite: **500 requests/day**, from the same post
  - Third-party guides give 250 to about 1,500 requests/day for 2.5 Flash, and they disagree with each other
  - **Check AI Studio for the real numbers on his key.**
- **Privacy:** the pricing page marks "Used to improve our products" as **Yes on the free tier and No on paid**, for 3.8 Flash, 3.5 Flash-Lite and 2.5 Flash. His day-diary answers would count as training data on the free tier.
- **Can it judge pace and tone from audio?** Partly. The docs list "Emotion detection in speech" and understanding of non-speech sounds. Because the model hears the recording, it can notice fillers, rushing, flat or excited tone, and hesitations, and say so in words. It **cannot give calibrated numbers** such as dB or a reliable WPM. Its opinion of "too loud" also depends on how far the phone was from his mouth. The app's own meter, which compares against his personal baseline, is the trustworthy source for loudness and pace. Send those numbers to the model rather than asking it to guess.

### 2. Groq
Sources:
- console.groq.com/docs/speech-to-text
- /docs/models
- /docs/rate-limits
- /docs/deprecations
- groq.com/pricing (no numbers on that page)

- **`whisper-large-v3-turbo`:** **$0.04 per audio hour**, word error rate (WER) 12%, transcription only.
- **`whisper-large-v3`:** **$0.111 per audio hour**, word error rate (WER) 10.3%, also translates.
- Minimum billed length is **10 s**. Max file size is 25 MB on the free tier and 100 MB on the dev tier.
- Formats: flac, mp3, **mp4, m4a**, ogg, wav, **webm**. iPhone recordings upload as they are.
- **Word-level timestamps** are available (`verbose_json` with `timestamp_granularities[]=word`). That gives exact WPM and pause lengths without the phone's speech recognition.
- **Rate-limit table** (the page says these are the Developer plan's base limits; the Free tab shows the same table):
  - Whisper (both models): 20 requests/min, 2,000/day, 7,200 audio-seconds/hour, 28,800 audio-seconds/day
  - `openai/gpt-oss-120b`: 30 requests/min, 1,000/day, 8,000 tokens/min, 200,000 tokens/day
  - `openai/gpt-oss-20b`: same as gpt-oss-120b
  - `qwen/qwen3.8-27b`: same as gpt-oss-120b
- **Groq text models, price per 1M tokens:**
  - gpt-oss-120b: $0.15 in / $0.60 out
  - gpt-oss-20b: $0.075 in / $0.30 out
  - qwen3.8-27b: $0.80 in / $4.00 out
- **Filler words:** Groq's docs don't say. From general Whisper experience (not checked on Groq's page), Whisper usually **cleans out "um/uh"**. A prompt seeded with fillers (for example "Umm, let me think, like, hmm…") often keeps them, but not reliably. If counting fillers matters, Deepgram or AssemblyAI below handle it better, or use Gemini, which hears the audio itself.

### 3. Anthropic Claude API
Source: platform.claude.com/docs/en/about-claude/pricing. These prices also match what the coordinator supplied.

- **No audio input.** The Messages API takes text, images and PDFs. Claude would analyse a transcript, plus the numbers the app measured.

| Model | Input | 5-min cache write | Cache read | Output (per 1M) |
|---|---|---|---|---|
| Claude Haiku 5.5 (`claude-haiku-5-5`), prompts up to 100k | $0.10 | $0.125 | $0.01 | $0.50 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $2.50 | $0.10 on the official page (0.05x); the coordinator said ~$0.20, and I used $0.20 to be safe | $10 |
| Claude Opus 5.5 (`claude-opus-5-5`) | $4 | $5 | $0.20 | $20 |
| Claude Haiku 4.5 (in the code now) | $1 | $1.25 | $0.10 | $5 |

- **Caching:** a fixed rulebook of about 3,000 tokens can be cached. The cache lasts 5 minutes and every hit refreshes it, so answers 1 to 5 in one session reuse it. Each day's first call pays the cache write once.
- The minimum cacheable length for Haiku 5.5 was not checked. Haiku 4.5's minimum was 4,096 tokens, so a 3,000-token rulebook might not cache on Haiku. At Haiku prices that hardly matters.

### 4. Other options (brief)
- **OpenAI** (developers.openai.com/api/docs/pricing):
  - Transcription per minute: `gpt-4o-mini-transcribe` $0.003, `gpt-transcribe` $0.0045, `gpt-4o-transcribe` $0.006, `whisper-1` $0.006
  - Live (realtime) voice: `gpt-realtime-2.1` audio $32 in / $64 out per 1M; the `-mini` version $10 / $20; `gpt-live-1` voice sessions $0.05/min
  - The realtime models suit a live talking partner, but cost far more than this needs.
- **Deepgram** (deepgram.com/pricing):
  - Nova-3 pre-recorded: **$0.0043/min** for English, $0.0052/min multilingual
  - **$200 free credit, no expiry, no card needed.** That covers about 46,000 minutes, so effectively free for years.
  - It has a filler-words option, from my memory of their docs; the pricing page doesn't list it.
- **AssemblyAI** (assemblyai.com/pricing):
  - Universal-3.5 Pro: **$0.21/hour**; Universal-2: $0.15/hour
  - $50 free credit
  - Sentiment add-on: +$0.02/hour
  - A "disfluencies" option keeps the "um/uh" fillers in the transcript (from memory of their docs; the pricing page doesn't list it).

### 5. Browser-side options
- **Web Speech API on iPhone:** unreliable for this app.
  - It may not exist at all when the app is opened from the Home Screen (WebKit bug 225298, Apple forum thread 748048).
  - In Safari, `continuous` mode stops on silence and needs restarts (the code already restarts it).
  - Recognition needs the network.
  - Practitioners suggest push-to-talk over continuous mode.
  - **Treat it as an optional bonus (a live caption while he talks), never as the source of truth.**
- **Measuring loudness and pace on the phone with no AI: yes, possible, and already built.**
  - `AudioMeterController` already measures dB per frame, voiced seconds, pauses and noise floor, and compares them with his own calibrated baseline.
  - It already drives the "softer" and "slower" daily challenges.
  - Pace without a transcript: a rough syllables-per-second estimate from loudness peaks is possible, but coarse. With Whisper word timestamps, WPM and pause lengths become exact, with no extra AI cost.
  - Pitch variety (monotone or not) can also be measured locally (autocorrelation pitch tracking), if wanted later.
- **Netlify limits** (docs.netlify.com/build/functions/configuration):
  - Synchronous functions run up to 60 s.
  - Request payload is capped at **6 MB, about 4.5 MB of actual audio** once encoded as text (base64).
  - A 2-minute iPhone AAC clip is about 1 to 2 MB, so it fits. Answers up to about 3 minutes are safe.
  - The current 8 s per-provider timeout is enough for Whisper (seconds), but may be tight for Gemini with audio plus thinking. Raise it for the audio task.

---

## Part 3 — Monthly cost estimate (30 days)

### Assumptions
- **Voice:** 1 session a day × 5 answers × 1 min = 5 min a day, which is **150 min (2.5 h) a month**.
- **Analysis call per answer:**
  - About 3,000-token rulebook, plus about 500 tokens of question, transcript (about 150 words) and measured numbers, so **about 3,500 text input tokens**
  - **600 output tokens**
  - 150 calls a month
  - Gemini with audio adds 1,920 audio tokens per 1-minute answer
- **Cards:** 30 a day = 3 batches of 10.
  - Generation per batch: 2,000 in / 3,000 out
  - Verification per batch: about 3,500 in (the cards plus instructions) / about 1,000 out
  - Per month: generation **180k in / 270k out** (90 calls); verification **315k in / 90k out** (90 calls)
  - The app's existing rule is that **verification runs on a different provider than generation.** Each setup below follows it.
- Thinking tokens and retries are left out. See the note after the table.

### (a) Free: Groq Whisper + Gemini free tier
- Transcription with Groq `whisper-large-v3-turbo` on the free tier: 5 requests and 300 audio-seconds a day, against limits of 2,000 requests and 28,800 seconds. **$0.**
- Analysis (5/day) and card generation (3/day) on Gemini free = **8 Gemini calls a day.**
  - That fits under the reported 20/day for 3.8 Flash, but with little room for retries.
  - Flash-Lite (about 500/day reported) is the safer choice.
  - **$0.**
- Card verification on Groq `gpt-oss-120b` free tier: 3 calls a day, about 13.5k tokens a day, against limits of 1,000 requests/day and 200k tokens/day.
  - Each call is about 4.5k tokens, under the 8k tokens/min limit. Space the three calls a minute apart.
  - **$0.**
- **Total: $0 a month.**
- Catches: the limits are not guaranteed, and Google can use his free-tier text to improve its products.

### (b) Gemini paid, audio sent directly (no separate transcription)
Using **Gemini 3.8 Flash** at 2026 prices ($0.75 in / $3.75 out):
- **Analysis**
  - Input: 150 × (1,920 + 3,500) = 813,000 tokens × $0.75/M = **$0.61**
  - Output: 150 × 600 = 90,000 × $3.75/M = **$0.34**
- **Card generation**
  - Input: 180,000 × $0.75/M = $0.135
  - Output: 270,000 × $3.75/M = $1.01
  - Together: **$1.15**
- **Verification on Groq `gpt-oss-120b`, paid**
  - Input: 315,000 × $0.15/M = $0.047
  - Output: 90,000 × $0.60/M = $0.054
  - Together: **$0.10**
- **Total ≈ $2.20 a month.** From 1 Jan 2027 the Gemini prices double, making it about **$4.30 a month**.

Cheaper Gemini choices with the same audio-direct design:
- **3.5 Flash-Lite** ($0.30 / $2.50), about $1.30 a month:
  - Analysis: 813k × 0.30 = $0.24, plus 90k × 2.50 = $0.23
  - Cards: 180k × 0.30 = $0.05, plus 270k × 2.50 = $0.68
  - Verification: $0.10
- **2.5 Flash** (audio $1.00, text $0.30, output $2.50), about $1.50 a month:
  - Analysis audio: 288k × 1.00 = $0.29
  - Analysis text: 525k × 0.30 = $0.16
  - Analysis output: 90k × 2.50 = $0.23
  - Cards: $0.73
  - Verification: $0.10

Gemini does not need a transcript first, but a transcript is still needed on screen and for the existing quote check. Ask Gemini to return the transcript in its JSON, or add Groq Whisper for $0.10 a month (see (c)).

### (c) Groq Whisper + Claude Sonnet 5.5
- **Transcription:** 2.5 h × $0.04 = **$0.10** with turbo, or 2.5 × $0.111 = $0.28 with large-v3.
- **Analysis on Sonnet 5.5, rulebook cached**
  - Daily cache write: 3,000 × $2.50/M = $0.0075 → × 30 = $0.225
  - Cache reads (4 a day): 4 × 3,000 × $0.20/M = $0.0024 → × 30 = $0.072
  - Changing part of the input: 150 × 500 × $2/M = $0.15
  - Output: 90,000 × $10/M = $0.90
  - Analysis total: **$1.35** (without caching: 525k × $2 = $1.05, plus $0.90, = $1.95)
- **Card generation on Sonnet 5.5:** 180k × $2 = $0.36, plus 270k × $10 = $2.70, = **$3.06**
- **Verification on Gemini free tier:** $0 (or Groq paid: $0.10)
- **Total ≈ $4.50 a month** ($0.10 + $1.35 + $3.06). If the cards stay on Gemini free and Sonnet is used only for the voice analysis, it is **about $1.45 a month**.
- For comparison, Opus 5.5 analysis uncached costs 525k × $4 + 90k × $20 = $3.90 a month.

### (d) Groq Whisper + Claude Haiku 5.5
- **Transcription:** $0.10
- **Analysis, uncached:** 525k × $0.10/M = $0.053, plus 90k × $0.50/M = $0.045, = **$0.10**
- **Card generation on Haiku 5.5:** 180k × $0.10 = $0.018, plus 270k × $0.50 = $0.135, = **$0.15**
- **Verification on Gemini free:** $0 (or Groq paid: $0.10)
- **Total ≈ $0.35 to $0.45 a month.**

### Summary table
| Setup | Hears the voice itself? | Monthly cost | Main catch |
|---|---|---|---|
| (a) Groq Whisper + Gemini free | no (text plus phone measurements) | **$0** | daily caps not guaranteed; free-tier text used for training |
| (b) Gemini 3.8 Flash paid, audio direct | **yes** | **~$2.20** (~$4.30 from Jan 2027); Flash-Lite ~$1.30 | judgement of loudness or pace is impressionistic, not measured |
| (c) Groq Whisper + Claude Sonnet 5.5 | no | **~$4.50** (~$1.45 if cards stay on Gemini) | most cost goes to cards, not voice |
| (d) Groq Whisper + Claude Haiku 5.5 | no | **~$0.40** | lighter coaching depth than Sonnet; worth a side-by-side test |

**Note on "thinking" tokens:** Gemini 3.x and newer Claude models can "think" before answering, and thinking is billed as output. For example, 1,000 extra thinking tokens on each of 240 calls at $3.75/M adds about $0.90 a month on Gemini 3.8 Flash. Keep thinking low or off for these tasks. Even doubled, every setup stays under about $10 a month.

---

## Recommendation (plain English)

**Short version: money is not the deciding factor. Every option costs less than a cup of coffee a month. Choose on reliability and on how good the coaching is.**

1. **Fix the hidden weak spot first.** Today the app relies on the iPhone's own "speech to text" to know what you said. Apple has a long-standing limit: that feature often does **not work when the app is opened from the home-screen icon**. When it fails, you get no feedback at all. The fix is to send the recording to Groq's Whisper (a very accurate transcriber, like a stenographer). It costs about **10 cents a month** and works every time. It also gives the exact time of every word, so your speaking speed and pauses become exact.

2. **Keep the phone as your loudness and speed meter.** The app already measures how loud you are compared with your own normal voice, and how fast you go, with no AI involved. That is more trustworthy than an AI's opinion, because an AI listening to a recording can't tell whether you were loud or just holding the phone close. Hand those numbers to the AI so its advice is based on fact.

3. **For the coaching, start with option (d): Whisper + Claude Haiku 5.5, about 40 cents a month.** Do a one-week side-by-side test against option (c), Claude Sonnet 5.5 at about $1.50 a month if the cards stay where they are. If Sonnet's advice on story structure and keeping the conversation going is clearly better, switch. The extra dollar is worth it for something you use every day.

4. **Option (b), letting Gemini listen to the audio directly, is a good add-on.** It is not a replacement. It can hear things a transcript hides, like "um"s, rushing and flat tone, for about $1 to $2 a month. Consider it once the basics work.

5. **Avoid relying on the fully free option (a).** It works, but Google's free tier can cap you at about 20 requests a day without warning, and it may use your personal diary answers to train its models. Paying a few cents removes both problems.

6. **Housekeeping the builder must do anyway:**
   - The app's backup AI on Groq (`llama-3.3-70b-versatile`) was **switched off by Groq on 16 Aug 2026**. Swap it for `openai/gpt-oss-120b`.
   - The Claude backup (`claude-haiku-4-5`) should become `claude-haiku-5-5`, which is better and 10x cheaper.
   - Check the real Gemini daily limits in AI Studio.

## Sources (all seen 2026-10-29)
- Google Gemini:
  - https://ai.google.dev/gemini-api/docs/pricing (last updated 2026-10-28)
  - https://ai.google.dev/gemini-api/docs/audio
  - https://ai.google.dev/gemini-api/docs/rate-limits
  - https://ai.google.dev/gemini-api/docs/models
  - https://ai.google.dev/gemini-api/docs/deprecations
- Gemini free-tier forum report: https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609
- Third-party Gemini guide (dated 2026-10-10): https://usagebox.com/articles/gemini-3-8-flash-pricing-free-tier-2026
- Groq:
  - https://console.groq.com/docs/speech-to-text
  - https://console.groq.com/docs/models
  - https://console.groq.com/docs/rate-limits
  - https://console.groq.com/docs/deprecations
- Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
- OpenAI: https://developers.openai.com/api/docs/pricing
- Deepgram: https://deepgram.com/pricing
- AssemblyAI: https://www.assemblyai.com/pricing
- Netlify: https://docs.netlify.com/build/functions/configuration/
- iPhone speech recognition:
  - https://bugs.webkit.org/show_bug.cgi?id=225298
  - https://developer.apple.com/forums/thread/748048
  - https://stackoverflow.com/questions/75498609 (via an archived copy)
