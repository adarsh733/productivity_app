# SEAL BRIEF — speak-v8-levels-know-it · pass 0 (reading)

You are the reading worker. Read every file this job will touch, then write the plan below.
You do not build anything. Everything you need is in this file; read nothing else about how
the runner works.
If launched as a native Codex worker: send READY, then wait for the coordinator to confirm
actual native launch verification before writing the plan or editing any source file.

## Job (free text)
SPEAK v8: levels, Know it, topic runs, new Ask feedback box — D:\Adarsh\Mission AI\Productivity\.claude\handoffs\2026-11-10-speak-v8-levels-topics.md

## Files it names
- `AI\Productivity\.claude\handoffs\2026-11-10-speak-v8-levels-topics.md`

## What you write
- ONE file: `D:/Adarsh/Mission AI/Productivity/.claude/one-go/plans/speak-v8-levels-know-it.md` — the plan, in the template below.
- Nothing else. Never edit the project's own files; the passes do that after the questions are answered.

## Rule
Append each file to `## What I read before asking` as you read it — never in one write at the end.
A worker that is cut off must still leave a real reading list behind.

## What the reading must gather — nine things, every time
| # | What | Why |
|---|---|---|
| 1 | The reading list — every file read before a question was written | "I read it all" becomes checkable |
| 2 | The pass list — what each pass does, in order | the shape of the run |
| 3 | The exact files each pass writes | separate sets, and the input to running passes side by side |
| 4 | Every new file path that a project guard must approve first | listed with its register command (below), run before `start` |
| 5 | Every other guard or hook that could stop a pass | cleared with the person's yes, or the pass reshaped to avoid it |
| 6 | Every assumption that would otherwise be taken silently | each becomes a numbered question |
| 7 | What "done" looks like per pass, and the command that proves it | so the report cannot lie |
| 8 | The tier for each pass (table below) | the coordinator chooses a supported model and effort for the actual task |
| 9 | What the run is likely to hit — a missing tool, an absent test file, a login | checked, not assumed |

A question that a file on the reading list would have answered is a planning failure.

## The plan file — copy this shape exactly
```markdown
# <Job name in plain words>
State: draft

## What "done" looks like
One or two plain lines. If this cannot be written plainly, the job is not ready — say so.

## What I read before asking
| File | Why it mattered |
|---|---|
| src/search/query.js | builds the query; splits on spaces, so two-word foods return nothing |

## Fixed names
(Optional.) Every name two passes must agree on — a function, a file, a setting. Copied word
for word into every pass's instructions so passes running side by side cannot drift apart.

## Run shape
- **Pieces:** implementation (p1), instructions (p2), independent behavior checks (p3), final review (p4) — coherent work with separate file ownership and meaningful checks
- **Needs:** p4 needs p1, p2 and p3; the first three need nothing. Bounded review findings return to their original workers.
- **Waves line:** Waves: 1) p1, p2, p3 · 2) p4
- **Unlocks:** none needed — or name a small first pass (splitting a shared file, fixing shared names) that would let more passes run at once
- **Summary line:** 4 passes in 2 waves
(If the job came from a handoff or pasted note, add one more line: `the handoff had X passes in Y waves → this plan has N in M`.)

## Passes
| # | What it does | Model | Files it writes | Proven by | Depends on |
|---|---|---|---|---|---|
| 1 | Make the query keep multi-word terms together, with a test | build | src/search/query.js, test/query.test.js | npm test -- query | — |

Dry-run today: p1 exit 0 (existing query regression check; add coverage if the new behavior is missing)

(Optional last column `Generates` — files the pass's own check rewrites as a side effect, e.g. a built page:
the header then ends `| Depends on | Part | Generates |` and a row ends `| — | — | dist/index.html |`. The engine ignores those paths when it asks "did a file
change while the check ran". Leave the column out when there is nothing to list.)

## Paths to register before the run
| Path | Why | Registered? |
|---|---|---|

## Open questions
1. **Unresolved product question?** A ★ option · B option · C option. *Trade-off in one line.*
(Write "None — already authorized" when existing instructions settle everything.)

## Answers
(the conductor records the person's words and date, including explicit authorization already given)
```
- The second line stays `State: draft`. Sealing is the conductor's job, after the answers.
- "Depends on" holds pass numbers (`1, 2`) or `—`. An optional last column `Part` names which
  part of the job a pass belongs to.

## Run shape — plan the width before the table (mandatory)
The plan must carry a `## Run shape` section, placed before `## Passes`, with these five bullets in this order:
1. **Pieces** — the pieces of the job, and why each is its own pass.
2. **Needs** — what truly needs what.
3. **Waves** — the same line `check-plan` prints, e.g. `Waves: 1) p1, p2, p3 · 2) p4`.
4. **Unlocks** — a small first pass, such as splitting a shared file or fixing shared names, that would let
   more passes run at once. Propose it as its own small first pass; write "none needed" when there is none.
5. **Summary** — the summary line, exactly in the form `N passes in M waves` (e.g. `4 passes in 2 waves`).

How to shape it:
- Build every independent piece in a coherent, bounded pass when its work outweighs worker startup.
  Independent implementation and instructions may run together; wire their outputs where needed, then
  run one end-to-end check and fix what it finds with the original workers where possible. Final review
  depends on both implementation and instructions. Do not create a tiny new pass per finding.
- Make a pass wait on another only when it needs that pass's output. A wait added "to be safe" is a plan
  fault. The engine finds file clashes itself, so never add a wait just because two passes touch the same folder.
- If the job text, a handoff or a pasted note already lists passes, that list is INPUT, never the plan:
  re-shape it through this section, and add the line `the handoff had X passes in Y waves → this plan has N in M`.

## Models — column 3 of the Passes table
| Tier | Use for | Write |
|---|---|---|
| think | diagnosis, architecture, plans, contracts, reviewing another agent's output | `think` |
| build | bounded work where the decisions are already made | `build` |
| mechanical | moving files, renames, docs, running an established check | `mechanical` |
Choose the passes first and the models second; never invent a pass to use a model. A pass earns
its own worker only when its work is clearly bigger than a worker's start-up — merge smaller ones.
In Codex, tiers are advisory: the main chat chooses each supported model and effort from its live native
tool capabilities and records the reason before launch. Several passes may use the same model; never
invent work to use different models. The board records/suggests work; native tools launch and manage workers.
New runs explicitly use `start <job> --host codex --capabilities <json-path>`; the coordinator refreshes
capacity before each dispatch, then uses state-bound `codex-route.mjs select` before launch. Native worker
slots exclude the coordinator; count all occupied workers, including pending initialization and other runs,
plus outstanding reservations until native inventory clears the slots; account for these
without double-counting verified workers. Unknown capacity stops dispatch; zero room means wait.
Require fresh parent-launch and child-session verification before built/done or proof commands. Reused
sessions and worker self-identification are not proof. Old strict runs keep their route/evidence rules.
Do not edit global model policy as a side effect of this plan or silently fall back to inline in Codex.
Model-card guidance below applies to other hosts; a cache entry cannot establish native tool support.
Model cards: not in use in this project (config.json has no `model_cards`) — no refresh question needed.

## The seal gate — what `check-plan` refuses
- **"Proven by" must be a command the engine can run** (`npm test`, `node scripts/check.mjs`,
  `pytest tests/x.py`). Words like "checked by eye" are refused — put them in "What it does" and use
  `—` in the cell when there is truly nothing to run.
- **Dry-run every "Proven by" command before you finish** and record its exit code today in the plan,
  one line under the Passes table (`Dry-run today: p1 exit 1 (the new test does not exist yet) · p2 exit 2 (why)`).
  Report an unrelated existing failure honestly; reshape the check or flag the unresolved dependency.
- **Existing-green regression checks are legitimate** when they exercise meaningful behavior relevant
  to the change. Record exit 0 honestly and explain the coverage; add a behavior check where needed.
  Never manufacture fail-first string checks. Keep exact command matching, real execution, file bounds,
  dependencies and actual launch evidence intact.
- **"Proven by" covers only the pass's own files.** It must not run a whole-suite sweep: a red test in
  a file no pass owns would hold this pass hostage. Whole-suite sweeps belong to one final review pass at the
  end, which depends on every other pass.
- **Every declared file must be findable**: a file that exists; a new file whose folder exists; a new
  file whose folder an earlier pass declares; or a pattern (`src/search/*.js`). Paths are relative to
  the project folder, or absolute.
- **Every row has exactly as many cells as the header**, and no cell contains `\|` or a bare `|`
  (write "or" instead).
- **List every file a pass writes, exactly.** The engine compares them and finds file clashes itself, so
  two passes that could run side by side must not share a file. Patterns count once expanded:
  `src/**` and `src/a.js` overlap.
- **The plan has a `## Run shape` section** (see above); a plan without one is refused.
- A "Proven by" command that contains one of the words capture, screenshot, shoot, review-page, journey, playwright, cypress or e2e
  reads the whole app, so that pass runs only when no other pass is still writing. The words are read from the
  "Proven by" command only, never from the description. Use them only when the check truly reads the whole app.

**Run this until it prints OK, fixing the plan each time:**
```
node "C:/Users/adi20/.agents/skills/one-go/scripts/board.mjs" check-plan speak-v8-levels-know-it
```
Run it from the project folder: `D:/Adarsh/Mission AI/Productivity`.
It lists every problem at once. A plan that fails it is not finished.

## The questions — how to write them
The person answering is not an engineer. For every question:
- Plain everyday words. If a technical term cannot be avoided, explain it right there with a short
  everyday example ("a cache — a saved copy, like a photo of a page instead of the page").
- Options lettered **A / B / C**, each one short line saying what happens.
- **Exactly one ★** — your recommendation — on each question.
- One line of trade-off in italics: what they give up with each choice.
- Numbered, all in the one `## Open questions` section, so they can answer in one line (`1A 2B 3A`)
  or say "use your recommendations". There is no limit on how many; every assumption is one.
- Never ask what a file on your reading list already answers. Explicit authorization already given counts:
  record it and ask only remaining product questions, all together. Do not request the same approval twice.

## Rules
- never commit or push
- never write outside the files named under "What you write"
- blocked after 2 attempts at the same thing → stop, report PARKED with the exact question
- final report ≤12 lines

## Report back (exact format)
≤12 lines total:
- the plan's path (1 line)
- files read, passes drafted, questions written — three numbers (1 line)
- what you proved: the exact check-plan command you ran, and its exit code (1 line)
- the dry-run exit code of every Proven-by command (max 3 lines)
- anything parked, or risky, in one line each (max 3 lines)
- Protocols run: which standing protocols you ran, or none (1 line)
