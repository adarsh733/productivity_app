# AG-006 Content Review Report (overwrites the 2026-08-26 staging report)

Written 2026-09-25 by OpenCode (AG-006 CONTENT slice). Stated only what was actually done.

## Counts per file (before → after)

| File | Action | Before | After |
|---|---|---|---|
| `22-explain.json` | Replaced all 40 | 40 | 60 |
| `23-teach-backs.json` | Replaced all 30 | 30 | 40 |
| `21-describe.json` | Rewrote all 30 as text scenes + 30 new | 30 | 60 |
| `24-situations.json` | New file | 0 | 130 |
| `10-words-en.json` | Added | 80 | 180 (+100) |
| `17-phrases.json` | Added | 60 | 120 (+60) |
| `20-hindi.json` | Added | 40 | 100 (+60) |
| `18-feelings.json` | Added | 50 | 80 (+30) |
| `12-idioms-corporate.json` | Added | 44 | 64 (+20) |

Total seed cards (excl. `00-exemplars.json`): 579 → 1039 (+460 net). Zero duplicate ids across all files (checked by script).

## Structural check

`speak/scripts/content-pipeline/check-seed.mjs` loads every seed file and checks: valid JSON,
unique ids, required fields per type (incl. new `situation` shape, optional `primer`, text-scene
`describe` with `title`/`scene` and `imagePath`-or-`scene`), `beats` exactly 3, caps
(situation title ≤40 / prompt ≤200, primer ≤300, describe title ≤40 / scene ≤280,
word examples ≤25 words). Result: **PASS**, 1039 cards, 0 failures.

## Cold second read

Re-read every new card once against brief §1 rules 6–7 plus a script sweep for
post-2023 dates and changing statistics in explain cards (none found).
**Dropped: 0.** Drafting was conservative throughout (no current-events topics, no yearly
statistics, no contested numbers, no invented idioms; dubious slang candidates excluded).
**Fixed during writing (3):** `phr-切勿-echo` non-kebab id → `phr-reply-deadline`;
`phr-itself-emphasis` strong line still contained the error → rewritten clean;
`w-meticulous-note` mismatched id → `w-preempt`, and `w-nonchalant` replaced with
`w-unfazed` to avoid duplicating an existing feeling term.

## Seed-loader tests

`src/db/seedLoader.test.ts`: **14/14 pass** with this content (run 2026-09-25; AG-005's
updated loader with `situation` support and optional-`imagePath` describes was in the
working tree at run time).

## 15 sample new cards in full (verbatim from disk)

### sit-incident-03
```json
{"id":"sit-incident-03","type":"situation","lang":"en","tags":["incident","home","funny"],"kind":"incident","title":"The landlord mix-up","prompt":"Tell a friend about a funny misunderstanding with your landlord. What did each of you think?","beats":["Set the scene: what the confusion was about","The moment it turned: when you both realised","How it ended and how you felt about it"],"targetVocab":["ambiguous","awkward","sort out"],"targetSec":60}
```

### sit-office-02
```json
{"id":"sit-office-02","type":"situation","lang":"en","tags":["office_call","pushback","work"],"kind":"office_call","title":"Pushing back on a deadline","prompt":"Tell your manager the Friday deadline is not realistic. Be polite, give a reason and an option.","beats":["The headline first: the date is at risk","The reason: what the work actually needs","The ask or next step: your proposed date or scope cut"],"targetVocab":["trade-off","realistic","propose"],"targetSec":45}
```

### sit-opinion-03
```json
{"id":"sit-opinion-03","type":"situation","lang":"en","tags":["opinion","career","debate"],"kind":"opinion","title":"Is ambition overrated?","prompt":"Is ambition overrated? Give your view: should people chase big titles or a calm life?","beats":["Your view in one line","The strongest reason behind it","The best counterpoint and your answer to it"],"targetVocab":["ambition","content","cost"],"targetSec":60}
```

### sit-life-06
```json
{"id":"sit-life-06","type":"situation","lang":"en","tags":["life_story","failure","storytelling"],"kind":"life_story","title":"My biggest failure so far","prompt":"Tell someone about your biggest failure. Be honest about your part in it.","beats":["Where and when: what you attempted","What happened: how it fell apart and your part","What it changed: what you do differently now"],"targetVocab":["own it","humbling","lesson"],"targetSec":90}
```

### exp-monsoon-economy
```json
{"id":"exp-monsoon-economy","type":"explain","topic":"The monsoon and the economy","angle":"Why does a weak monsoon still hurt the Indian economy even though farming is a small share of GDP?","primer":"About half of India's farmland has no irrigation and depends on the June-to-September rains. Most Indians still live in villages, and their spending drives demand for everything from bikes to cement.","beats":["Rain decides village income: no rain means a poor harvest and less cash in hand","Less village spending means slower sales for companies in cities too","So a bad monsoon shows up on shop shelves months later"],"targetVocab":["harvest","demand","ripple effect","rural"],"targetSec":60,"tags":["explain","india","economy"]}
```

### exp-green-revolution
```json
{"id":"exp-green-revolution","type":"explain","topic":"The Green Revolution","angle":"What did the Green Revolution actually change in India in the 1960s?","primer":"In the 1960s India faced food shortages and depended on imported grain. New high-yield wheat and rice seeds, plus fertiliser and irrigation, were introduced first in Punjab and Haryana.","beats":["Before: India grew too little grain and imported food to feed itself","The change: new seeds with water and fertiliser tripled yields on the same land","The result and the cost: food security, but tired soil and falling water tables"],"targetVocab":["yield","self-sufficient","irrigation","trade-off"],"targetSec":60,"tags":["explain","india","history"]}
```

### exp-stoicism-control
```json
{"id":"exp-stoicism-control","type":"explain","topic":"Stoicism in one idea","angle":"What is the one Stoic idea that actually helps on a bad day at work?","primer":"Stoicism is a Greek philosophy that Rome's emperors and slaves both practised. Its core move is sorting life into what you control and what you do not. Marcus Aurelius wrote his notes on it while running a war.","beats":["Sort: your effort and response are yours; outcomes and others are not","Release: stop spending energy where you have no lever","Act: put all of it into the part you control"],"targetVocab":["control","acceptance","judgement","equanimity"],"targetSec":60,"tags":["explain","philosophy","everyday"]}
```

### dsc-platform-rush
```json
{"id":"dsc-platform-rush","type":"describe","title":"Platform at rush hour","scene":"The 8:40 fast local is four minutes away and the platform is already shoulder to shoulder. Vendors shout over the announcement crackle while the steel rails start to hum.","alt":"A packed railway platform minutes before the morning fast train arrives.","prompt":"Describe this platform so a friend can hear it, smell it, and feel the push of the crowd.","beats":["The crowd: who is packed in and how they stand","The sounds and smells around you","How the waiting feels: hurry, habit, or dread"],"targetVocab":["surge","hum","jostle","dense"],"targetSec":45,"tags":["describe","everyday","city"]}
```

### dsc-wedding-kitchen
```json
{"id":"dsc-wedding-kitchen","type":"describe","title":"The wedding kitchen","scene":"In a courtyard behind the wedding hall, giant vessels steam over wood fires while two dozen relatives chop, stir, and taste. A grandmother in charge of nothing and everything inspects every tray.","alt":"A busy outdoor wedding kitchen with giant vessels and a supervising grandmother.","prompt":"Describe this kitchen so a friend can smell the ghee and feel the happy chaos.","beats":["The scale: vessels, fires, and the army of helpers","One or two people who run the show","How it feels: chaos, warmth, or pressure"],"targetVocab":["steam","bustle","simmer","command"],"targetSec":45,"tags":["describe","everyday","family"]}
```

### tb-compound-cousin
```json
{"id":"tb-compound-cousin","type":"teach_back","prompt":"Explain compound interest to your younger cousin using pocket money as the example.","beats":["The simple version: money earning money on itself","An example: what happens to a small amount left alone for years","Why it matters: starting early beats starting big"],"targetSec":45,"tags":["teach_back","money","everyday"]}
```

### w-deliberate
```json
{"id":"w-deliberate","type":"word","lang":"en","tags":["work","character"],"term":"deliberate","pos":"adj.","meaning":"done on purpose and with care, not by accident","examples":["It was a deliberate choice to keep the team small.","She spoke in a slow, deliberate way."],"say":"Describe a decision you made slowly and on purpose. Use 'deliberate'."}
```

### phr-good-name
```json
{"id":"phr-good-name","type":"phrase","lang":"en","weak":"What is your good name?","strong":"May I have your name, please?","why":"'Good name' translates an Indian courtesy formula that confuses foreigners; the plain version works everywhere.","register":"office","tags":["office","calque","intro"],"source":"seed","status":"active","createdAt":1787746004355,"batchId":"batch-ag006-phrases"}
```

### hi-jugaad
```json
{"id":"hi-jugaad","type":"word","lang":"hi","tags":["noun","everyday"],"term":"जुगाड़","pos":"noun","meaning":"a clever makeshift fix with what is at hand","examples":["पाइप लीक हो रहा था, पापा ने कोई जुगाड़ करके रोक दिया।","इतने कम बजट में शॉर्ट फ़िल्म? जुगाड़ ही लगाना पड़ेगा।"],"say":"किसी जुगाड़ से सुलझी दिक्कत के बारे में बोलिए।"}
```

### feel-wistful
```json
{"id":"feel-wistful","type":"feeling","lang":"en","term":"Wistful","meaning":"Sad in a soft, thoughtful way about something lovely that is gone.","contrast":"Not raw sadness; wistfulness holds warmth and longing together, like smiling at an old photo.","example":"He felt wistful walking past his old college gate, hearing the same evening bell.","tags":["emotion","memory","longing"],"source":"seed","status":"active","createdAt":1787746004355,"batchId":"batch-ag006-feelings"}
```

### id-learn-the-ropes
```json
{"id":"id-learn-the-ropes","type":"idiom","lang":"en","tags":["corporate","hiring"],"phrase":"learn the ropes","meaning":"learn how things actually work in a new place","scenario":"Someone new is slow because nobody showed them the basics.","example":"Give her two weeks to learn the ropes before judging output.","corporate":true}
```
