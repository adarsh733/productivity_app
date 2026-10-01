# AG-006 content review — fix list

**Source:** Claude review subagent, 2026-09-26 (recovered from chat transcript `4591674a…` on 2026-09-27 — it was never saved to disk).
**State 2026-09-27:** NONE of these fixes are applied yet (spot-checked: `exp-placebo-effect` still says "genuinely cure", `phr-years-back` and `dsc-local-train-door` still present).
**Files:** numbers below are seed file prefixes in `speak/src/content/seed/` (22 = `22-explain.json`, etc.).
**Done when:** every numbered item applied, both duplicate pairs reduced to one, `node scripts/content-pipeline/check-seed.mjs` PASS, `npm test` green. The "Balance" section is optional polish.

---

**Verdict: safe to ship once the fixes below are made.** Nothing is invented junk, but about 12 explain cards and a few phrase and Hindi cards would teach him something wrong.

Scan results:
- No Chinese characters, no mojibake (`â€`), no BOM, and every file parses.
- The only non-ASCII in English cards is `·` in the older `14-pronounce.json` cards, which is intentional.
- No duplicate ids.
- No new term repeats an existing one. The only repeats (apprehensive, complacent in both words and feelings) were already there before this batch.

**Fix or drop, most serious first** (`file | id | problem | fix`)

**Explain: facts and health**
1. 22 | exp-placebo-effect | The question says sugar pills "genuinely cure people". They ease symptoms; they don't cure disease. | Change the question to "...make people genuinely feel better?"
2. 22 | exp-antibiotics-resistance | "Finish the course / half-taken courses breed survivors" is disputed advice (BMJ 2017). "A few always survive" overclaims. | Change to "take them only when prescribed, exactly as told; overuse and misuse breed resistance".
3. 22 | exp-stereotype-threat | This finding largely failed to replicate, yet "framing the test as practice erases the gap" is stated as fact. | Drop it.
4. 22 | exp-roman-trade-india | "Pepper worth more than gold by weight" is a myth. | Change to "sold at huge mark-ups in Rome".
5. 22 | exp-ship-of-theseus | "Nothing in you is the same matter as ten years ago" is false (brain cells and eye lens last a lifetime). | Change to "much of your body is rebuilt over the years".
6. 22 | exp-how-planes-fly | Explains lift by wing curve alone, and says flaps steer the plane (they don't). | Change to "wings are shaped and tilted to push air down, so air pushes the wing up". Steering beat: "ailerons and rudder steer".
7. 22 | exp-msp-farming | "Assures farmers a buyer even in a glut" overstates a live political issue. The state buys mainly wheat and rice, and only in some states. | Change to "MSP is announced for about two dozen crops. The government actually buys mainly wheat and rice, in some states."
8. 22 | exp-green-revolution | "Tripled yields" is shaky. | Change to "sharply raised wheat yields".
9. 22 | exp-loss-aversion | "Roughly twice" is a disputed number, and the evolution line is guesswork. | Change to "tend to sting more"; cut the evolution line.
10. 22 | exp-caste-reservation | Leaves out the 2019 quota for economically weaker sections (EWS). "Creamy layer" is framed as a critics' argument when it is actually a legal rule. Otherwise neutral. | Add EWS. Beat 3: "...critics raise merit and whether benefits reach the poorest within groups".
11. 22 | Minor wording fixes:
    - exp-confirmation-bias: "never" → "rarely"
    - exp-taiwan-chip: "most" is a share that changes year to year → "a large share"
    - exp-evolution-eyes: "fossils" → "living animals"
    - exp-occams-razor: "monk" → "friar William of Ockham"
    - exp-mughal-mansabdari: "peaking under Akbar" → "consolidated under Akbar"
    - exp-karma-idea: "originally" → "in Indian philosophy"

**Phrases**
12. 17 | phr-itself-emphasis | The "strong" version changes the meaning ("yesterday itself" means "as early as yesterday", not "yesterday morning"). | Change to "I already told him yesterday."
13. 17 | phr-real-brother | Misses what the phrase is for: separating a brother from a cousin. | Change to "He's my brother, not a cousin."
14. 17 | phr-years-back | "Five years back" is fine informal English, and "marks the speaker as Indian-educated" is condescending. | Drop.
15. 17 | phr-keep-fast, phr-ate-my-lunch | "Keep a fast" and "ate lunch" are correct English, so the cards overclaim. | Drop both.
16. 17 | phr-open-the-light | The "why" says taps are "opened"; taps are turned on. | Change to "'open' applies to doors and windows".
17. 17 | phr-as-per-convenience, phr-say-no-extra-work | The "strong" lines are awkward. | "Please join any time before Friday that suits you." / "I can't give this proper attention this week; I can start Monday."
18. 17 | phr-needful-done | Near-duplicate of the existing phr-do-the-needful. | Drop.

**Hindi**
19. 20 | hi-chaalu | For a person, चालू means sly or crafty, and it's a slur when said about a woman. The example makes it sound like praise. | Fix the meaning and add a warning. Example: "वो बड़ा चालू है, उसकी बातों में मत आना।"
20. 20 | hi-nakhre | "नख़रे मत उठाओ" means "don't put up with tantrums", the opposite of what's meant. | Change to "इतने नख़रे मत करो".
21. 20 | hi-samjhauta | Example 2 advises compromising on skill, which is nonsense. | Change to "सैलरी पर थोड़ा समझौता चलेगा, सीखने पर नहीं।"
22. 20 | hi-kisht | "क़िस्त टूट गई" is unnatural, and ब्याज is misspelt (ब्याज़). | Change to "एक भी क़िस्त छूटी तो पेनल्टी लगती है।"
23. 20 | Small fixes:
    - hi-badhaai: "!।" → "!"
    - hi-shikaayat: "formal complaint" → "a complaint"
    - hi-funda: the meaning uses the word itself → "the core idea behind something"
    - hi-rishta: example 1 is awkward

**Words and feelings**
24. 18 | feel-frazzled | "Worn to frays" isn't English (the phrase is "worn to a frazzle"). | Change to "worn out and scattered".
25. 18 | feel-itchy | "Itchy for a challenge" is marginal English; the real idiom is "itchy feet". | Retitle to "itchy feet" or drop.
26. 18 | feel-light / feel-heavy | "felt light" → "felt lighter"; "the grandmother's room" → "Dadi's room".
27. 10 | w-drizzle | "The morning drizzled" is unnatural. | Change to "It drizzled all morning."
28. 10 | w-debrief | "He debriefed me" means he questioned me, not that he briefed me. | Change to "We debriefed after the call."
29. 10 | w-breezy (example 2 uses a different sense of the word) and w-shortcut ("skips the signal" → "avoids the signal") | Replace or reword those examples.
30. 10 | w-onsite, w-bench, w-fresher | Indian-IT-only usage, which clashes with the phrases file teaching him to avoid Indianisms. | Add a note: "Indian usage; abroad: at the client site / between projects / new graduate."
31. 10 | w-tipping-point | The UPI example makes a loose factual claim. | Swap it for a non-factual example.

**Scenes, situations, teach-backs** (sampled 60+, mostly fine)
32. 21 | dsc-local-train-door | Glamorises hanging from the door and jumping off a moving train, which is illegal and deadly. | Rewrite as a crowded doorway at a stop.
33. 24 | sit-life-10 | The beat "the amount in spirit" is odd. | Change to "roughly what it paid".
34. 24 | targetVocab that doesn't fit the story | Swap each:
    - sit-life-21: "axiom" → "stuck with me"
    - sit-incident-16: "soggy" (for a burnt dish)
    - sit-incident-02: "stagger" → "wobble"
    - sit-incident-04: "bland"
    - sit-incident-01: "inevitable"
    - dsc-office-friday-evening: "lilt"
    - dsc-monsoon-jam: "strand" → "stranded"
35. 24 | sit-incident-20 | Trains leaving early is an unlikely premise. | Change to "a train you nearly missed".
36. 23 | tb-active-recall | "Half the time, double the retention" are made-up numbers. | Change to "less time, better retention".
37. 23 | tb-anger-pause | "Six-second" is a pop-psychology claim. | Change to "a short pause".

**Duplicates**
- sit-incident-06 and sit-incident-22 are the same story (tech breaks during a presentation). Same for sit-incident-15 and sit-incident-29 (a cricket match). Keep one of each pair.
- Three teach-backs overlap explain cards: tb-compound-cousin / exp-compound-interest, tb-why-procrastinate / exp-procrastination, tb-sunk-cost-life / exp-sunk-cost. Acceptable because they're a different mode.

**Balance**
- Explain, situations, Hindi and scenes are well balanced. Explain has 5 tech topics, as allowed.
- Idioms still lean on software: about 10 of 19 examples are about shipping, launches, migrations or pixels. About a quarter of new word examples use outage, release or ship. Swap roughly half of those examples to sales, operations, family or travel.
- Also a label problem: phr-house-help-request, phr-auto-negotiate, phr-shop-return, phr-wifi-request and phr-photo-request are everyday situations but tagged `register: "office"`.
