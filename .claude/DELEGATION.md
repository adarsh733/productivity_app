# DELEGATION — Claude + Antigravity on one project

Two agents, one codebase, **minimum iterations**. Claude's tokens are the scarce
resource, so Claude spends them on design, judgement and review; Antigravity
spends its own on volume.

The whole protocol exists to kill the three things that cause extra rounds:
**file collisions**, **integration mismatch**, and **reviewing by exploring**.

---

## The five phases

### Phase 0 — Brainstorm & plan (Claude, with Adarsh)
Claude investigates, proposes the approach, and gets **explicit approval before
any code**. Output of this phase is a plan containing:
- The change, and the reasoning behind the approach chosen.
- A **file partition**: every file that will be written, assigned to exactly one
  of `CLAUDE` or `ANTIGRAVITY`. See the split heuristic below.
- Acceptance criteria per slice — how we will know it's done, in testable terms.
- Anything genuinely uncertain, flagged as a question **now**, not mid-build.

### Phase 1 — Contract first (Claude)
Before Antigravity starts, Claude writes and commits the **contract** its work
must fit: function signatures, data shapes, CSS variable/class names, DOM ids,
module load order, whatever the seam is. Stubs are fine.

> This is the single highest-leverage step. Most second iterations are not bad
> code — they are code that doesn't fit. A stub Antigravity fills is one pass; a
> description it interprets is two or three.

Then Claude emits **one copy-pasteable brief** (template below). Adarsh pastes it
into Antigravity as-is. No back-and-forth to assemble it.

### Phase 2 — Parallel build
Antigravity builds its slice. **At the same time**, Claude builds the critical
slice. Neither waits. The partition guarantees they never touch the same file;
both still claim their files in [`ACTIVE-WORK.md`](ACTIVE-WORK.md) as the backstop.

Claude **commits its own work before Antigravity's lands** where possible, so the
review diff is clean.

### Phase 3 — One review pass (Claude)
Antigravity reports done and leaves a completion report (required — see brief).
Claude reviews from **`git diff` + that report**, not by re-reading the repo.

The review budget is **one pass**, findings triaged:
- **P0 — wrong / unsafe / breaks the contract.** Claude fixes it directly. A
  round trip costs more than the patch.
- **P1 — works but should change.** Batched into one follow-up brief, only if the
  batch is worth a whole round trip.
- **P2 — nice to have.** Logged to `docs/known-issues.md`. Not sent back.

### Phase 4 — Close out
Verify the integrated result, release claims, tick the agenda in
[`WORKLOG.md`](WORKLOG.md), note in the entry which slice Antigravity did.

---

## The split heuristic

**Claude keeps anything where a mistake is silent.** Ask: *if this is subtly
wrong, will anyone notice?* If no — Claude does it.

| Claude keeps | Antigravity gets |
|---|---|
| Architecture, module boundaries, load order | Implementation behind an agreed contract |
| **Math & scoring** (`foodMath.js`, habits scoring, targets) — a silent 250 kcal error is a real failure | CSS, layout, visual polish against a written spec |
| Security, auth, RLS, anything touching keys or medical data | Repetitive refactors with one clear pattern, applied N times |
| Schema / storage / migration changes | Boilerplate screens from an approved design |
| Anything touching shared globals across many files | Test harnesses, fixtures, doc formatting |
| Ambiguous requirements, product judgement calls | Mechanical renames, extractions, dead-code removal |
| **The review, always** | Work whose correctness is checkable by looking at it |

**Hard rules**
1. **The partition must be disjoint.** No file appears in both slices. If a file
   genuinely needs both, it is Claude's — Antigravity gets a different file.
2. **If they must touch the same area, sequence it.** Claude first (it's the
   critical path), Antigravity after. Never parallel on one file.
3. **Never delegate the review.** Antigravity does not review Claude's work, and
   Claude does not accept Antigravity's self-assessment as verification.
4. **Never delegate anything touching `../Medical Records/`, `../Physique
   Progress/`, `../Trackers/`, or Supabase keys.**

---

## The brief (Claude emits this as one block; Adarsh pastes it verbatim)

```markdown
# ANTIGRAVITY BRIEF — <task> · <YYYY-MM-DD> · AG-<nnn>

## Read first
`D:\Adarsh\Health & Medicine\AGENTS.md`, then `war-mode-dashboard/CLAUDE.md`.
Follow the file-claim protocol in `.claude/ACTIVE-WORK.md` before writing.

## Goal
<2–4 sentences. What outcome, and why — enough that judgement calls land right.>

## Your files (write ONLY these)
- `path/to/file` — <what to do in it>
- `path/to/file` — <what to do in it>

## Files Claude owns — DO NOT EDIT
- `path/to/file` <…>

## The contract (already committed — build to this, don't change it)
<Signatures, data shapes, class/variable names, DOM ids, load order.
Point at the committed stubs by `file:line`.>

## Acceptance criteria
1. <Testable statement>
2. <Testable statement>
3. Zero console errors at 375×812.

## Constraints
- No build step; classic scripts sharing one global scope, not ES modules.
- Match surrounding patterns; don't refactor untouched legacy.
- Do not commit unless told; **never push** (a push is a metered production deploy).
- Never suggest meat, fish or egg anywhere in this product.
- <task-specific traps / things already tried that failed>

## Self-check before you report done
- [ ] Every acceptance criterion verified — say *how* you verified each.
- [ ] Zero console errors.
- [ ] No file outside "Your files" modified (`git status` to confirm).
- [ ] Contract unchanged.

## Report when done — write to `.claude/reports/AG-<nnn>.md`
1. Files changed, one line each on what changed.
2. Each acceptance criterion: met / not met + how verified.
3. **Deviations** — anything you did differently than briefed, and why.
4. **Couldn't do / uncertain** — be blunt; an honest gap costs far less than a
   confident wrong claim.
5. Anything broken you noticed but left alone.
```

---

## Why this converges in one round

- **Approval happens once**, before anything is written (Phase 0).
- **The contract is committed before Antigravity starts**, so its output plugs in
  instead of being re-shaped.
- **The slices are disjoint**, so there is no merge to negotiate.
- **The review reads a diff and a report**, so it costs a fraction of the tokens
  exploring would, and Claude patches P0 itself rather than sending it back.

The expected shape of a task is: *one approval → one brief → parallel build →
one review → done.* Anything more means Phase 0 or Phase 1 was skimped.
