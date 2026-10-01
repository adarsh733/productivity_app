# SEAL BRIEF — finish-v4-usable-for-go · pass 0 (reading)

You are the reading worker. Read every file this job will touch, then write the plan below.
You do not build anything. Everything you need is in this file; read nothing else about how
the runner works.

## Job (free text)
finish-v4-usable-for-go

## Files it names
- (none found in the text)

## What you write
- ONE file: `D:/Adarsh/Mission AI/Productivity/.claude/one-go/plans/finish-v4-usable-for-go.md` — the plan, in the template below.
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
| 8 | The model for each pass (table below) | the heavy thinking goes to the strong model, the rest does not |
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

## Passes
| # | What it does | Model | Files it writes | Proven by | Depends on |
|---|---|---|---|---|---|
| 1 | Make the query keep multi-word terms together, with a test | build | src/search/query.js, test/query.test.js | npm test -- query | — |

Dry-run today: p1 exit 1 (the new test does not exist yet — expected)

## Paths to register before the run
| Path | Why | Registered? |
|---|---|---|

## Open questions
1. **Plain question?** A ★ option · B option · C option. *Trade-off in one line.*

## Answers
(left empty — the conductor writes the person's words here, with the date)
```
- The second line stays `State: draft`. Sealing is the conductor's job, after the answers.
- "Depends on" holds pass numbers (`1, 2`) or `—`. An optional last column `Part` names which
  part of the job a pass belongs to.

## Models — column 3 of the Passes table
| Tier | Use for | Write |
|---|---|---|
| think | diagnosis, architecture, plans, contracts, reviewing another agent's output | `think` |
| build | bounded work where the decisions are already made | `build` |
| mechanical | moving files, renames, docs, running an established check | `mechanical` |
Choose the passes first and the models second; never invent a pass to use a model. A pass earns
its own worker only when its work is clearly bigger than a worker's start-up — merge smaller ones.

## The seal gate — what `check-plan` refuses
- **"Proven by" must be a command the engine can run** (`npm test`, `node scripts/check.mjs`,
  `pytest tests/x.py`). Words like "checked by eye" are refused — put them in "What it does" and use
  `—` in the cell when there is truly nothing to run.
- **Dry-run every "Proven by" command before you finish** and record its exit code today in the plan,
  one line under the Passes table (`Dry-run today: p1 exit 0 · p2 exit 1 (why)`). A check that already
  fails for an unrelated reason can never go green — reshape it now, or say so as a question.
- **Every declared file must be findable**: a file that exists; a new file whose folder exists; a new
  file whose folder an earlier pass declares; or a pattern (`src/search/*.js`). Paths are relative to
  the project folder, or absolute.
- **Every row has exactly as many cells as the header**, and no cell contains `\|` or a bare `|`
  (write "or" instead).
- **No two passes that could run side by side write the same file.** Patterns count once expanded:
  `src/**` and `src/a.js` overlap.
- The words capture, screenshot, shoot, shot, journey, match or review-page in a pass make it run
  alone. Use them only when that is meant.

**Run this until it prints OK, fixing the plan each time:**
```
node "C:/Users/adi20/.agents/skills/one-go/scripts/board.mjs" check-plan finish-v4-usable-for-go
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
- Never ask what a file on your reading list already answers.

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
