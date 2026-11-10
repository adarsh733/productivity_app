# Handoff — SPEAK/Articulate: trim to the v7 plan + Night glass everywhere · 2026-11-10

> **AMENDED 2026-11-10 (later chat, Adarsh's picks; these WIN over the lines below)**
> - Tabs become **Feed · Favorites · Me** in this job (not 2 tabs). **Favorites** = his ♡ cards, full-size, with the SAME module chips as the Feed on top (no topic chips). Me keeps streak/day stats, backup, "What the app learned"; no Saved row in Me.
> - The old Ask screen is still removed here, but the tab bar must take a 4th tab later. The next job (`.claude/handoffs/2026-11-10-speak-v8-levels-topics.md`) adds a NEW Ask tab: a single AI feedback box. Keep `LearnedFromYou` and the learned-lines store.
> - When this job is done: point `.claude/handoffs/LATEST.md` at the v8 note, and end with its paste block (`/one-go dispatch SPEAK v8: levels, Know it, topic runs, new Ask feedback box`).


## State
- Live: https://productivity-app-voice.netlify.app (Netlify builds `master`, base dir `speak`). Pushed through commit "fix(speak): Ask no longer drops good answers; backup sign-in by email + password".
- Feed is v7 Night glass (5 modules, 👍👎💬, ♡, Sunday review, ~1,500 cards, AI batches from feedback). Backup = Supabase, email + password sign-in under Me ("Confirm email" is OFF; Anthropic key deleted — Gemini + Groq only).
- Screen audit (10 Nov): `docs/redesign-v7/audit/AUDIT.md` + 57 pictures. Only Feed is new; Ask, Me and everything behind them are the old light design.

## Adarsh's decisions (10 Nov, verbatim picks) — do not re-ask
- "only keep what's needed after our recent plan … else just remove it"
- Ask: **Remove it**.
- Evening voice chat: **Remove it**.
- Old tools (Browse, Speak lab, old You), lesson player + skill pages, Story bank, My weak spots, Things I asked: **Remove it all**.
- Restyle what stays to Night glass, in a fresh chat as one unattended job.

## What stays (target app = 2 tabs: Feed · Me)
- Feed exactly as now.
- Me, in Night glass: streak/day stats (fix serif zeros that read as "o"), backup row (email + password), **Saved** = list of ♡ cards (today the row is dead — wire it), "What the app learned" from 👍👎💬 with Forget. Settings only if something real still needs it.
- Glass tab bar on both tabs (today it is white off the Feed).

## Rules for the build
- Remove screens, routes, tab entries, CSS and their tests/e2e specs; do NOT delete the user's stored data (Dexie tables, Supabase tables) — leave old tables in place, just unused.
- Server AI function: keep the module-batch + checker path; tasks only used by removed screens (answer_ask, coach_chat, etc.) may be removed only if nothing left calls them — verify with grep + tests.
- Keep the offline (service worker) build working; no new pictures; no red text; Hindi hidden.
- Laptop: tests ≤2 workers, one heavy job at a time, stop every server you start.
- Prove: full unit suite, both type checks, rulebook check, the v7-glass + flows browser specs (update them to the 2-tab app), build. Fresh phone-size pictures of Feed + every Me screen into `docs/redesign-v7/`.
- Push/deploy only after Adarsh says yes in that chat. Push uses the `adarsh733` GitHub login (`gh auth token --user adarsh733`); the default login `afterhours781` is refused.
- Write a WORKLOG block in `.claude/WORKLOG.md` (session agenda + ticks).

## Pointers
- Audit + proposed file split: `docs/redesign-v7/audit/AUDIT.md`
- Look: `docs/redesign-v7/glass-B-*.png`, styles `speak/src/styles/glass.css`, `glass-feed.css`
- Plan context: `docs/REDESIGN-V7.html`, previous handoff `.claude/handoffs/2026-11-08-speak-v7-build.md`
