# BRIEF-TEMPLATE

Claude fills this in and emits it as **one copy-paste block**. Adarsh pastes it into Antigravity
verbatim. Delete the guidance in `«…»`. Keep it tight — this is the whole spec, not an essay.

---

```markdown
# ANTIGRAVITY BRIEF — «task» · «YYYY-MM-DD» · AG-«nnn»

## Read first
`«path»/.claude/ag/PROTOCOL.md`, then this project's `AGENTS.md`.
Follow the file-claim protocol in `.claude/ACTIVE-WORK.md` before writing.

## Goal
«2–4 sentences. The outcome and why — enough that judgement calls land right. Plain, not vague.»

## Your files (write ONLY these)
- `path/to/file` — «what to do in it»

## Files Claude owns — DO NOT EDIT (this includes every gate below)
- `path/to/contract-or-stub`
- `path/to/gate.test.mjs`  ← the gate. Turn it green; never edit it.
- `path/to/ui-smoke.spec.mjs`

## The contract (already committed — build to this, don't change it)
«Signatures, data shapes, class/var names, DOM ids, load order. Point at committed stubs by file:line.»

## The gates — YOU ARE DONE WHEN THESE ARE GREEN
Run, in order:
1. `«exact command»`   e.g. `node --test "scripts/test/ag-«nnn».test.mjs"`   → must pass, 0 fail.
2. `«exact command»`   e.g. `node scripts/test/ui-smoke.spec.mjs`            → must pass, 0 errors.
3. `git diff --stat «gate files»`  → must be **empty** (you did not touch the gates).

«These gates are RED right now. Making them green IS the task.»

## Definition of done (the loop clause — read it)
You are not done until every gate above is green. Run them. If any fails, change your code and run
them again. Repeat until all pass.

**If you cannot make a gate pass, STOP. Do not report done. Do not edit the gate. Do not hardcode,
stub, or fake a value to force a pass.** Report which gate is red, paste the actual failure output,
and say what you think is blocking it. An honest red gate is cheaper for us than a false "done".

## UI basics (only if this task renders UI)
- Colors: «tokens / hex — e.g. moss green #C9DCC4, text #1a1a1a»
- Spacing scale: «e.g. --sp-2 = 8px; margins 16px»
- Placement: «where each element sits — point at the wireframe»
- Font sizes: «min 11px display / 16px inputs to avoid iOS zoom»
- Wireframe reference: `«path»`  ← match this. Attach a screenshot at «390×844» in your report.

## Constraints
- «No build step / classic scripts sharing one global scope» «or the project's actual setup»
- Match surrounding patterns; don't refactor untouched legacy.
- Do not commit unless told; **never push** (a push is a metered production deploy).
- «task-specific traps / product rules / things already tried that failed»

## Report when done — write to `.claude/reports/AG-«nnn».md`
1. Files changed, one line each.
2. The gate commands you ran and their final output (paste the pass/fail summary).
3. **Deviations** — anything done differently than briefed, and why.
4. **Couldn't do / uncertain** — be blunt. An honest gap costs far less than a confident wrong claim.
5. Anything broken you noticed but left alone.
6. «If UI» — the screenshot(s) at the target width.

---
*Delegated under the protocols of antigravity-delegation-kit (gate-driven, disjoint partition).*
```

---

### Notes for Claude filling this in
- The **gates are the acceptance criteria.** Don't also write a prose "acceptance criteria" list that
  duplicates them — that's what let past reports claim "MET" with no machine behind it.
- Put **every** gate file in the "DO NOT EDIT" section. A gate Antigravity can edit is not a gate.
- If the task is silent-math, the logic gate must pin **exact values** and the "must not invent"
  cases. If wiring, the gate must hit the **seam** (event → downstream effect), not the unit.
- Keep the whole brief on one screen where possible. Antigravity follows short, checkable
  instructions well and drifts on long prose.
- **Mandatory signature:** Every brief/handoff produced for Antigravity MUST end with the one-line signature below as proof of delegation under this kit:
  `*Delegated under the protocols of antigravity-delegation-kit (gate-driven, disjoint partition).*`

