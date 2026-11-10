▶ NEXT CHAT — SETUP
Tool:   Claude Code
Model:  middle level — sonnet
Effort: High
Why:    build to an approved plan; sample cards need careful, natural English

# Handoff — SPEAK/Articulate v7 (content + swipe + feedback) · 2026-11-08

## 1. State right now — [REWRITE]
- Proven done (8 Nov, /one-go relay run 2026-11-08-0922): plan steps 1–3 in Night glass — swipe, chips, 5 modules × 20 cards, 👍👎💬 sheet, Me "learned" list. Full suite + build green. Screens: `docs/redesign-v7/built-1..4.png`.
- Not started: plan steps 4–6 (full ~1,500-card library, card life + AI batches from feedback, Supabase backup).
- Open: old browser tests (poster, v5-step*, viewports, screenshots) still target the old feed; not tried on his phone; nothing committed. Supabase keys: waiting on him.
## 2. What we did (and why) — [APPEND]
- Read the feed, swipe and content code to find the root causes (plan §1): ~20 legacy card types
  mixed in one feed; one slide recipe forced on every card (`speak/src/features/cards/slides.ts`);
  20-new-a-day cap then silent replays (`QUEUE_RULES.MAX_NEW_PER_DAY`, `speak/src/srs/queue.ts:257`);
  drag at 45% of finger with a 0.22 s lag (`speak/src/components/feed/useCardGestures.ts`,
  `speak/src/styles/feed.css:65`).

## 3. Decisions — do not re-litigate — [REWRITE]
- 5 modules, chips on top of one feed (Mix default; a chip = only that module): Words · Small talk ·
  Say it better · Office phrases · Stories. One fixed card shape each, 1–3 slides (plan §3).
- No pictures on cards. Text-first using the 7 visual rules (plan §4).
- Swipe: full card follows finger 1:1, next card underneath; native scroll-snap (vertical cards,
  horizontal slides). Sideways never changes card. No Again / Got it buttons.
- Card rail: 👍 · 👎 · 💬 (type or hold mic to speak, transcribed) · ♡ · 🔊. The 🎤 practice button leaves.
- Every word/phrase card has a ✗ wrong-use line. Words: any level, simplest daily use
  (his example: "deafening" — he said "defending"; same word he meant).
- New group "Explain your thinking" in Say it better.
- Seen-once rule; app tracks seen words itself; Sunday review only for ♡ cards (3d, 1w, 3w; retire after 3 rights).
- Batches of 30 when a module has <60 unseen; writer gets 👍/👎, comments, level, full seen list; checker before serving.
- ~1,500 launch cards, written by Claude. Hindi stays hidden. Stories kept.

## 4. Next actions (ordered) — [REWRITE]
0. FIRST: his verdict on built-1..4 vs glass-B-1..4; fix anything he flags. Then steps 4–6 below replace items 1–3.
1. Plan step 1 — swipe (plan §5). Done when: on a phone-sized preview the card tracks the finger,
   snaps, and slides move like a carousel.
2. Plan step 2 — 5 card shapes + chips + no pictures + 20 sample cards per module. Done when Adarsh
   has seen screenshots of each module and signed off.
3. Plan step 3 — 👍 👎 💬 + "What the app learned" under Me. Stop for sign-off before steps 4–6.

## 5. Do NOT do — [APPEND]
- Don't rebuild the old slide recipe (rule → game → example → analogy → try) for new cards.
- Don't add picture art back. Don't put research credits or mindset lessons on cards.

## 6. Verification — [REWRITE]
- Verified: plan page script parses; artifact published (v2). NOT verified: anything on his real phone.

## 7. Open questions for Adarsh — [REWRITE]
- Look: light glass vs night glass (Codex pictures in `docs/redesign-v7/`, glass-A-* / glass-B-*). Build only after he picks.
  Night glass would break the Aug "light theme only" rule — only if he says so.
- Supabase: he said YES (8 Nov). He is creating the project and will paste URL + public key.
  App has NO sign-in screen yet (`signIn()` in `speak/src/sync/supabase.ts` is unused) — add email sign-in under Me.
  Give him ONE SQL script that includes `schema.sql` + new tables for 👍/👎/comments/seen-list; he runs it once.
  App is not online yet (no Netlify site), so the sign-in email link needs a site URL set in Supabase Auth.
