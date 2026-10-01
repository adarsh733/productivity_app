# AG-006 — Make it a usable app (CONTENT slice)

**Written:** 2026-09-25 by Claude, after a full audit of commit `a2b84f3`.
**Runs in parallel with:** `AG-005-usable-app-code.md` (a second OpenCode chat).
**Project root:** `D:\Adarsh\Mission AI\Productivity` · **App root:** `speak/`

**Do not stop to ask questions.** Every decision is made below. If you are unsure
whether a card is correct, **drop it**. A missing card costs nothing; a wrong card
teaches him wrong English and he cannot tell it is wrong.

---

## 0 · Who this is for

Adarsh works in a corporate job in India. He opens this app instead of Instagram
and wants to:
- **Learn** precise English words, natural phrases, office idioms, practical spoken
  Hindi (casual, the way Samay Raina talks, not textbook), and **ideas**: history,
  geopolitics, economics, philosophy, psychology, science. Style references:
  Palki Sharma's explainers, Think School's business breakdowns, radio-jockey
  storytelling.
- **Speak better**: tell an incident to a friend clearly, give office updates and
  push back politely, name feelings precisely, give an opinion with a reason, and
  tell his life story well.

Today's content misses this. All 40 "explain" and all 30 "teach-back" cards are
software engineering (CAP theorem, Redis, JWTs). There are no incident, feeling,
opinion or life-story prompts, and "describe" scenes point at blank placeholder images.

---

## 1 · Rules

1. Read `AGENTS.md` (workspace root) and `speak/AGENTS.md`, especially **Content
   rules**. Claim your files in `.claude/ACTIVE-WORK.md` before writing; release at the end.
2. **You own only:** `speak/src/content/seed/*.json` (new and existing),
   `speak/src/content/staging/**`, `speak/scripts/content-pipeline/**`.
   **Do not edit anything else.** AG-005 owns all code, including
   `src/types/contract.ts`. **Never edit `00-exemplars.json`.**
3. **Do not commit.** Claude commits your files after review. (AG-005 commits its
   own files by explicit path, so yours stay out of its commits.)
4. Match each file's **existing shape exactly**. Some files are a bare JSON array;
   `20-hindi.json` is `{ "version", "note", "cards": [...] }`. Read the file, keep its
   shape, and copy field names from its existing cards and from
   `src/types/contract.ts`. `id` values must be unique across **all** seed files
   (kebab-case, reuse each file's prefix: `exp-`, `tb-`, `dsc-`, `sit-`, `hi-`, `phr-` …).
5. **Write each file in one go, UTF-8, no BOM.** AG-005 runs tests against this folder
   while you work, so never leave a half-written file on disk. Do not use PowerShell
   `Set-Content` or `Out-File` without `-Encoding utf8`; an earlier pass broke every
   emoji that way.
6. **Language quality bar** (applies to every English card):
   - Everyday professional Indian-corporate register: what a sharp colleague would
     actually say out loud. No dictionary prose.
   - **No invented idioms, no unnatural word pairings, no Hindi phrases translated
     word-for-word into English.** If you would not bet that a phrase is in common
     use, leave it out.
   - Examples are sentences a person would say, ≤ 25 words.
7. **Fact quality bar** (explain and teach-back cards):
   - Only **stable, well-established** facts: nothing about current events after
     2023, no statistics that change year to year, no contested numbers.
   - The prompt must ask for an **explanation or a reasoned view**. Never "argue
     that X is good or bad" on live partisan politics, religion or caste.
   - If you are not certain of a fact, rewrite the card without it or drop the card.

---

## 2 · New and changed shapes

AG-005 is adding these to `src/types/contract.ts` right now. Write to them exactly.

```ts
// NEW card type, in a NEW file: 24-situations.json (bare array)
interface SituationCard {
  id: string; type: 'situation'; lang: 'en'; tags: string[];
  kind: 'incident' | 'office_call' | 'feeling' | 'opinion' | 'life_story';
  title: string;                    // ≤ 40 chars
  prompt: string;                   // second person, ≤ 200 chars
  beats: [string, string, string];  // exactly 3; the structure to follow
  targetVocab: string[];            // 0–4 real, useful words or phrases
  targetSec: 30 | 45 | 60 | 90;
}
// ExplainCard gains an optional field:
  primer?: string;   // 2–3 plain sentences of stable background, ≤ 300 chars
// DescribeCard: imagePath becomes OPTIONAL, and gains:
  title?: string;    // ≤ 40 chars
  scene?: string;    // 1–3 vivid sentences, ≤ 280 chars. This IS the picture.
```
Include the `CardBase` fields the existing cards in each file carry (check what
`seedLoader.ts` fills in; do not add fields the other cards in that file don't have,
other than the ones above).

---

## 3 · The work (quality over volume; drop anything doubtful)

| # | File | Action | Target count |
|---|---|---|---|
| 1 | `22-explain.json` | **Replace all 40.** Topics: history, geopolitics, economics and business (Think School style), philosophy, psychology, science, India-specific (e.g. why the monsoon matters to the economy, what the Green Revolution changed). Every card gets a `primer`. Each `angle` is a specific question, not a subject heading. At most 5 tech topics, all explained for a non-technical listener | 60 |
| 2 | `23-teach-backs.json` | **Replace all 30.** General learning: "explain compound interest to your younger cousin", "teach back one idea from a book or podcast you liked", "why we procrastinate". Beats give the structure: simple version → example → why it matters | 40 |
| 3 | `21-describe.json` | **Rewrite all 30 as text scenes** (title + scene, no `imagePath`; keep `alt` as a one-line plain summary of the scene, because the loader still requires it), then add 30. Everyday India and everyday life: a railway platform at rush hour, a wedding kitchen, a Sunday market, an office on appraisal day, a monsoon traffic jam, a small-town bus stand. Include how people feel, not only what things look like | 60 |
| 4 | `24-situations.json` | **New.** `incident`: something that happened, told to a friend (a missed flight, a bike skid, a funny misunderstanding with the landlord) — 30. `office_call`: status update, pushing back on a deadline, disagreeing with a senior politely, asking for help, giving bad news — 35. `feeling`: describe precisely how you felt in a moment (the day results came out, a friend moving away) — 20. `opinion`: a view with a reason and a counterpoint (work from home, should cities ban cars in the centre, is ambition overrated) — 20. `life_story`: parts of his own story (where you grew up, a teacher who mattered, a decision that changed your direction) — 25 | 130 |
| 5 | `10-words-en.json` | **Add** precise, high-use words he can pull up mid-sentence (e.g. *nuance, pragmatic, candid, trade-off, plausible, deliberate, articulate, succinct*). Check for duplicates across all files first | +100 |
| 6 | `17-phrases.json` | **Add** "say this instead of that" pairs from real Indian-office habits (e.g. "do the needful", "revert back", "prepone", "kindly adjust"), plus phrases for meetings, pushback, and saying no nicely | +60 |
| 7 | `20-hindi.json` | **Add** practical spoken Hindi: casual, today's usage, natural examples. Devanagari; the meaning in English | +60 |
| 8 | `18-feelings.json` | **Add** precise feeling words with the contrast to their nearest neighbour (e.g. *wistful* vs *sad*, *indignant* vs *angry*) | +30 |
| 9 | `12-idioms-corporate.json` | **Add** only idioms you are certain are in common current use in Indian and global offices | +20 |

**Beats** for situation cards follow a clear shape:
- incident: set the scene → the moment it turned → how it ended and what you felt
- office_call: the headline first → the reason → the ask or next step
- opinion: your view in one line → the strongest reason → the best counterpoint and your answer to it

**Target vocabulary** must be words that fit naturally in that exact story. Prefer
words that also exist as cards, so saying them out loud counts as practice.

---

## 4 · Verification (required before you finish)

1. **Structural check.** Write a small throwaway Node script in
   `speak/scripts/content-pipeline/check-seed.mjs` that loads every seed file and
   checks: valid JSON, every id unique across all files, required fields present per
   type (§2 and `contract.ts`), `beats` length is exactly 3 where required, length
   caps respected. Run it; it must pass.
2. **Cold second read.** After writing each file, re-read every new card once, as a
   strict editor would, against §1 rules 6–7. Fix it or drop it. Record the count
   dropped per file.
3. `npm test` from `speak/`. Seed-loader tests must stay green. (If a test fails only
   because `situation` is not yet in the contract, AG-005 hasn't landed that part;
   note it in the report instead of editing code.)
4. **Review report:** overwrite `speak/src/content/staging/review-report.md` with the
   count per file (before → after), the number dropped in the cold read and why, and
   **15 random new cards pasted in full** so Claude can spot-check them. Do not
   hard-code any "checked" ticks; state only what you actually did.
5. Write `.claude/reports/AG-006.md`: what you did, counts, anything skipped or unsure.
   Release your claim in `.claude/ACTIVE-WORK.md`.

Priority if you run short: **4 → 1 → 3 → 2 → 6 → 5 → 7 → 8 → 9**. Finish whole
files; never leave a file half-written.
