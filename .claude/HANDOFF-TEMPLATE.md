# HANDOFF TEMPLATE

Emitted when you say **"new chat" / "continuing in the next chat" / "handoff"**.

Rules for the agent producing it:
- Output it **in chat as one copy-pasteable block**, and save a copy to
  `.claude/handoffs/YYYY-MM-DD-<slug>.md`.
- First: release any open claim in `ACTIVE-WORK.md`, and close out the session
  block in `WORKLOG.md` (untouched agenda items → `⏸ carried to next session`).
  A handoff with a dangling claim deadlocks the next window.
- Facts only. No "we made great progress". If something is unverified, say
  unverified. If you're unsure, put it under Open questions, not under State.
- Target ~1 page. Sections with nothing in them get `— none.`, not deletion.

---

## Template

```markdown
# Handoff — <topic> · <YYYY-MM-DD> · <chat N of M / window name>

## 0. Cold-start prompt
> Continuing <project> at `<abs path>`. Read `<CLAUDE.md>`, `<current-focus.md>`
> and this file first. <One sentence: what to do first in the new chat.>

## 1. State right now
- Branch / committed / pushed: <e.g. `main`, committed locally, NOT pushed>
- Working tree: <clean | uncommitted: files>
- Running / deployed: <dev server port, live URL, or none>
- Open claims released: <Claim IDs, or none>

## 2. What we did (and why)
- <Change> — <why it was needed / what it fixed>. `file:line`
- <Change> — <why>. `file:line`

## 3. Decisions — do not re-litigate
- <Decision> — <one-line reason>. <If it's an ADR: `docs/decisions.md#…`>

## 4. Next actions (ordered)
1. <Action> — <acceptance criterion: how the next agent knows it's done>
2. <Action> — <acceptance criterion>

## 5. Do NOT do (traps, dead ends, wasted time)
- <Thing tried that failed and why — so nobody burns tokens retrying it>
- <Standing constraint that's easy to violate>

## 6. Verification status
- Verified: <what, how, on what device/viewport>
- NOT verified: <what still needs the user's eyes or a real device>

## 7. Open questions for the user
- <Question that blocks work, with the options and your recommendation>

## 8. Context worth carrying (only if non-obvious)
- <Environment quirk, credential location, data shape, naming gotcha>
```
