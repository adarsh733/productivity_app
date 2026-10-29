▶ NEXT CHAT — SETUP
Tool:   Claude Code
Model:  middle level — sonnet
Effort: Medium
Why:    Building to a frozen, approved plan (v5 redesign of the SPEAK app)

# Handoff — SPEAK v5 redesign build · 2026-10-29

## 1. State right now — [REWRITE]
- Proven done: plan v2 FROZEN by Adarsh 2026-10-29. Plan page `docs/REDESIGN-V5.html` (source: `docs/redesign-v5/REDESIGN-V5.source.html`, mockups `docs/redesign-v5/new-*.png`). AI rulebook `docs/AI-RULEBOOK.md` (§8 = his frozen additions). Research `docs/research/*.md` (4 files).
- Not started: any app code. All of the above is UNCOMMITTED on branch `v4-usable`.
- Claims released: yes (2026-10-28, 2026-10-29 rows in `.claude/ACTIVE-WORK.md`).

## 2. What we did (and why) — [APPEND]
- Walked v4 at phone size; Adarsh: "not much use". Redesigned around his real goal: communicator — small talk, stories, speak clearly, words. Research → rulebook → plan v2 → freeze.

## 3. Decisions — do not re-litigate — [REWRITE]
Full list: the "Frozen · 29 Oct 2026" table in `docs/REDESIGN-V5.html` and memory `speak-v5-redesign-direction`. Short form:
- Tabs Feed · Ask · Me. Light theme. Hindi hidden (data kept). Old Speak tab / voice lab / XP / onboarding hidden under ⚙︎, not deleted.
- 4 skills × 5 levels × card kinds Learn/Use/Fix/Try. Lessons = Stories row on Feed (tap-through, ~5 Learn cards); practice = Reels-style feed. Day one: all 4 skills, one lesson/day rotating.
- Every card: one idea, work + everyday example, "instead of", analogy, recall moment; Indian-English framed "In global English…".
- Ask answers instantly from library, then AI cards verified by a second provider (keep existing quality gate). Ask items RETURN in varied forms (rulebook §8.1); skills woven together (§8.2).
- Voice "evening chat" built LAST: Groq Whisper transcript + Claude Haiku 5.5 coaching; pace/loudness from phone meter only.

## 4. Next actions (ordered) — [REWRITE]
1. Read `docs/REDESIGN-V5.html` (Build order + 9 screens), `docs/AI-RULEBOOK.md`, `speak/CLAUDE.md`, `speak/AGENTS.md`. Ask Adarsh every question in ONE block, then seal the plan. Done = sealed one-go plan.
2. Step 0 (Adarsh): Netlify site never created (docs/SETUP.md §4) — give click-by-click steps for site + keys GEMINI, GROQ, ANTHROPIC (+ the Supabase SQL owed from AG-009). Meanwhile fix `speak/netlify/functions/ai.ts` models: Groq `llama-3.3-70b-versatile` retired 2026-08-16 → `openai/gpt-oss-120b`; Anthropic fallback → `claude-haiku-5-5`. Load the rulebook as the cached system prompt. Done = tests green.
3. Steps 1–5 from the plan page, in order, each shown to Adarsh at 375×812 with screenshots before the next.

## 5. Do NOT do — [APPEND]
- Don't rely on `webkitSpeechRecognition` for the evening chat: likely unavailable in iOS home-screen PWAs (WebKit bug 225298) — use Groq Whisper upload. See `docs/research/research-voice-tech.md`.
- Don't state research claims the rulebook bans (oxytocin, "36 questions = love", "never say um").
- Don't push/deploy without Adarsh's yes.

## 6. Verification — [REWRITE]
- Verified: mockups render at 390 px with no sideways scroll; v4 screenshots captured from local dev (`speak-dev`, port 5183).
- NOT verified: any AI call live (no site yet); Groq/Gemini model availability beyond the research date 2026-10-29; Whisper on his iPhone.

## 7. Open questions for Adarsh — [REWRITE]
- Commit the plan files before building? — recommend: yes, one docs commit first.
