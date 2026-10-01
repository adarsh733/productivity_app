# Finish the v4-usable branch so it can go live
State: sealed 2026-10-01

## What "done" looks like
The You tab says "no session loudness measured yet" once, the coach note buttons have space between them, every test plus the build is green, and all of it is committed on v4-usable, ready for the conductor to merge into master and push after Adarsh's yes.

## What I read before asking
| File | Why it mattered |
|---|---|
| .claude/one-go/plans/finish-v4-usable-for-go.seal-brief.md | the task and the plan shape |
| .claude/handoffs/LATEST.md | points to the 2026-09-27 note, which is marked superseded by AG-009 |
| .claude/handoffs/2026-09-27-finish-articulate.md | Part C go-live steps: tests x3 + build, one SQL block, Netlify keys, merge v4-usable to master only after Adarsh's yes |
| .claude/one-go/house-rules.md | only rule: write only listed files; no register command exists in this project |
| .claude/one-go/config.json | claims feature off; no tiers or hosts set |
| .claude/reports/AG-009.md | all 7 items met; 420 tests green; SQL block in section 5 not yet run; 375x812 visual walk still owed |
| speak/src/components/you/YouScreen.tsx | DUPLICATE LINE FOUND: TrendChart prints emptyText "— no session loudness measured yet" (line 180, rendered at 47-48) when there is no point AND no normal; the screen then also prints loudVerdict "No session loudness measured yet." (line 112, rendered at 182). Fix: skip the verdict paragraph when the chart is empty (latestLoud null and normalDb null) |
| speak/src/components/you/YouScreen.test.tsx | has the 8-week chart test and a "nothing measured" test (clears voiceSamples) to extend with "the empty line shows once" |
| speak/src/components/you/CoachList.tsx | GAP FOUND: buttons sit in div className "coach-list-actions" (line 44) — that class has no CSS anywhere, so Try again / Remove these cards / Delete note touch each other |
| speak/src/styles/you.css | where the missing .coach-list-actions rule belongs; the file already uses flex + gap 8px for .chips |
| speak/src/styles/tokens.css | .tap is only min 44x44 px, no margin — confirms nothing else spaces the buttons |
| ~/.claude/hooks/guard.py | project guards moved to project .forge folders; only the git push / netlify deploy warning remains global — affects the conductor's push, not the passes |
| (project root listing) | no .forge folder and no .claude/settings.json here, so no project guard and no register command; nothing to register |
| speak/src/sync/supabase.ts | BACKUP FACTS: push() lines 114-121 — an upsert error logs "[sync] push failed" and does "continue; // leave it in the outbox and try again next time"; only rows that went up are deleted (127). So a missing column fails that whole row (reviews, days, inbox, profile), the phone's own copy is untouched, and it retries. Risk: line 97 reads only the oldest 500 outbox rows, so a big pile of stuck rows can hold back newer ones until the SQL is run. restore() uses select star, so it does not break on missing columns |
| speak/src/sync/useSync.ts | push runs at app start, when the app is hidden, and every 5 minutes; errors are silent |
| netlify.toml | base speak, build npm run build, publish dist; no branch named here |
| docs/SETUP.md | Netlify "Branch to deploy: master" (line 90); keys GEMINI_API_KEY and GROQ_API_KEY (no VITE_ prefix), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY; keys are read at build time, so a redeploy is needed after adding them |
| git (status, log, merge-base, ls-remote) | master a2b84f3 = origin/master a2b84f3 (checked live with ls-remote); master IS an ancestor of v4-usable, 30 commits ahead, so a fast-forward merge is possible |
| git status -uall + secret scan of every changed or untracked file | no API keys, tokens, JWTs or passwords found (scanned for AIza, gsk_, eyJ, sk-, ghp_, service_role, key=...). Changed: ACTIVE-WORK.md, WORKLOG.md, speak/src/content/staging/review-report.md; untracked: 5 briefs AG-005..009, 3 handoffs, 2 AG-006 reports, the whole .claude/one-go folder |
| .claude/one-go/plans/c8-energy-blocked-foods.md | a stray draft about a different job (spec missing) sitting in this project's one-go folder — should not ride along in a "finish v4" commit without a yes |
| speak/package.json | test = vitest run, build = tsc -b and vite build; Playwright is installed but has no npm script |
| speak/playwright.config.ts + speak/e2e/viewports.spec.ts | a 375x812 phone check exists, but it is from V3 (firstRun.v3 key) and it overwrites tracked PNGs in speak/e2e/screenshots — not safe to use as a quiet proof |
| speak/scripts/content-pipeline/check-seed.mjs | finds the seed folder from its own location, so it can run from the project root |
| C:/Users/adi20/.agents/skills/one-go/scripts/lib/evidence.mjs | Proven-by runs through execSync from the project root (cmd.exe on Windows) — commands below use only and-and, no pipes |
| .claude/ACTIVE-WORK.md | every claim is released, abandoned or completed (AG-009 released 2026-10-01) — no clash with this job |
| .claude/WORKLOG.md (tail) | the 2026-10-01 review already did the 375x812 phone-size walk and found exactly these two polish items; still open: run the SQL, confirm Netlify keys, one live AI check, Adarsh's yes to push |
| (dry-runs today) | full suite run 3 times: 1 run failed 3 tests on waitFor timeouts (one is the You streak test), 2 runs 420 of 420 green — the suite is flaky under load. Build green, seed check PASS 1032 cards |

## Fixed names
- Branch: `v4-usable` (stay on it; never touch `master`).
- CSS rule: `.coach-list-actions` in `speak/src/styles/you.css` — `display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;` (same 8px gap as `.chips`). Written with the opening line exactly `.coach-list-actions {` — pass 1's check looks for that text.
- New test name in `speak/src/components/you/YouScreen.test.tsx`: `shows the empty loudness line once when nothing is measured`.
- Empty loudness wording kept: per answer to question 1 (★ the chart's own line `— no session loudness measured yet`).

## Passes
| # | What it does | Model | Files it writes | Proven by | Depends on |
|---|---|---|---|---|---|
| 1 | Show the empty-loudness line once (hide the sentence under the chart when the chart is already empty, per question 1); add the .coach-list-actions gap rule; add the one new test (clear voiceSamples, expect the empty wording exactly once); then run the full suite, the build and the seed check | build | speak/src/components/you/YouScreen.tsx, speak/src/components/you/YouScreen.test.tsx, speak/src/styles/you.css | git grep -q -e "coach-list-actions {" -- speak/src/styles/you.css && git grep -q -e "shows the empty loudness line once when nothing is measured" -- speak/src/components/you/YouScreen.test.tsx && npm --prefix speak test && npm --prefix speak run build && node speak/scripts/content-pipeline/check-seed.mjs | — |
| 2 | Commit on v4-usable with explicit git add: pass 1's three files as one commit; then the approved .claude files and staging report (per questions 2 and 3) as one docs commit; tick one WORKLOG line first. Never merge, never push | mechanical | .claude/WORKLOG.md | git diff --quiet HEAD -- speak/src/components speak/src/styles .claude/WORKLOG.md && git ls-files --error-unmatch .claude/briefs/AG-009-final-pass-antigravity.md .claude/reports/AG-006.md .claude/reports/AG-006-content-review.md .claude/handoffs/LATEST.md | 1 |

Dry-run today: p1 exit 1 (the gap rule and the new test do not exist yet — expected; the You tests alone pass 7 of 7, full suite 420 of 420 on 2 of 3 runs, build exit 0, seed PASS) · p2 exit 1 (WORKLOG modified and the .claude files untracked — expected)

## Paths to register before the run
| Path | Why | Registered? |
|---|---|---|
| (none) | no project guard or register command exists in this project (no .forge folder, no .claude/settings.json); no new file is created | n/a |

## Open questions
1. **The You tab says "no session loudness measured yet" twice. Which one stays?** A ★ keep the short line inside the chart box (same look as the Breath hold chart), drop the sentence under it · B keep the full sentence under the chart, drop the line in the box · C keep both. *A matches the other chart; B reads more like a sentence; C leaves the repeat you noticed.*
2. **Which loose notes go into the commit?** A ★ the 5 briefs, 3 handoffs, 2 AG-006 reports, WORKLOG, ACTIVE-WORK, and the one-go plans for this app and its settings; leave out live run folders (state, heartbeat, LIVE files), board.json and the stray "C8 energy foods" draft that belongs to another project · B commit every changed file as it stands · C commit only the two code fixes. *A keeps a clean record without run clutter; B is simplest but carries junk and a stray draft; C loses the paper trail of how the app was built.* (Checked: no passwords or keys in any of them.)
3. **The content report `speak/src/content/staging/review-report.md` was left uncommitted on purpose by the last agent. Commit it?** A ★ yes — it describes the card fixes that are already in the branch · B throw the change away and keep the old report · C leave it uncommitted. *A keeps the report in step with the cards; B keeps an out-of-date report; C leaves a loose change that can get lost.*
4. **When does the 12-line database update (the SQL in AG-009 report section 5) get run?** A ★ you paste it into the Supabase SQL editor before the push · B right after the push · C later. *Until it runs, backup of progress, days and coach notes fails and keeps retrying — your phone's own copy is always safe. A: backup works from minute one. B: a few minutes of retries, harmless. C: the stuck pile grows, and past 500 waiting items it also holds back other backups.*
5. **Are the four keys set in Netlify (GEMINI_API_KEY, GROQ_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)?** A ★ I will check and add any missing ones, then redeploy · B all four are already set · C not yet — go live without AI and backup for now. *Keys are read when the site is built, so adding one later needs a redeploy; without them the app still works, but with no auto-cards (no AI keys) or no backup (no Supabase keys).*
6. **The full test run failed once in three tries today (tests that wait too long when the computer is busy; they passed on rerun). How should the run treat that?** A ★ if pass 1's check fails only on those timing tests, rerun the check once before calling it failed · B add a pass to give those tests more waiting time · C ignore it. *A costs two minutes; B fixes the cause but widens the job; C risks a false failure stopping the run.*

## Answers
> "use your recommendations" — Adarsh, 2026-10-01

Chosen by default (★): 1A keep the short line in the chart box · 2A commit notes, leave out run folders/board.json/stray C8 draft · 3A commit the staging report · 4A Adarsh pastes the SQL before the push · 5A Adarsh checks/adds Netlify keys, then redeploy · 6A rerun pass 1's check once if only timing tests fail.
