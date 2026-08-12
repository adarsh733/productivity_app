# AGENTS.md — read this before writing any file in `speak/`

This app exists so that Adarsh opens it instead of Instagram, and comes out of
it speaking better. Every decision below follows from that.

## The claim protocol

Before you write to any file, follow `../.claude/ACTIVE-WORK.md`. Claim the
files you will write, verify no earlier claim overlaps, then work, then release.
Reading is always free.

## Non-negotiables

1. **The contract is `src/types/contract.ts`.** Build to it. Do not change it —
   if something genuinely doesn't fit, stop and say so rather than widening a
   type to make your code compile.
2. **Every card ends with the user having said something out loud.** If a
   redesign makes a card answerable in silence, that card is broken. At least
   70% of the feed must be spoken types (`SPOKEN_TYPES` in the contract).
3. **Components never touch the database, the scheduler or the queue.** They
   read from the hooks in `src/features/**` and call the functions those return.
   A component importing `db` directly is a bug.
4. **All styling comes from `src/styles/tokens.css`.** No raw hex, no raw px
   font sizes, no one-off radii or shadows. Eight type sizes exist; there is no
   ninth.
5. **Nothing in a session may wait on the network.** IndexedDB is the read path.
   Supabase is backup. If the phone is in a lift with no signal, the app still
   opens and still works.
6. **No API key may ever reach the client.** Anything model-shaped goes through
   `netlify/functions/ai.ts`, which names its own prompts. `process.env` does
   not resolve in `src/` and that is deliberate — do not "fix" it.

## Content rules

Seed content is what he will actually learn, so wrong content is worse than no
content.

- Everyday professional register. He works in a corporate setting in India.
- **No invented idioms, no unnatural collocations, no calques from Hindi.** If
  you are not certain a phrase is genuinely used, leave it out.
- Example sentences must be things a colleague would say out loud, not
  dictionary prose.
- Hindi cards are `"lang": "hi"` and appear only in the Hindi section, never in
  the main feed.
- Follow `src/content/seed/00-exemplars.json` exactly. Do not edit that file.

## Verifying

- `npm test` — the scheduler, queue and streak logic. Must stay green.
- `npm run build` — must pass with zero TypeScript errors.
- Check at 375×812. Nothing scrolls horizontally. Every tappable thing is ≥44px.
- Zero console errors.

## Reporting

Do not commit unless told. Never push — a push is a production deploy.
Write your completion report to `../.claude/reports/AG-<nnn>.md` and be blunt
about what you could not do. An honest gap costs far less than a confident
wrong claim.
