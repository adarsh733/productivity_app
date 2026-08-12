# SPEAK — documentation index

**Start here.** Five documents, each with exactly one job. If two of them ever
disagree, the one higher in this table wins, and the lower one is a bug to fix.

| # | Document | Its one job | Changes when |
|---|---|---|---|
| 1 | [`VOICE-PROFILE.md`](VOICE-PROFILE.md) | **The measurements.** Facts only — baseline numbers, diagnosis, the 12-minute routine, retest protocol | Only on a retest. Append, never rewrite |
| 2 | [`PLAN.md`](PLAN.md) | **The plan of record.** What gets built, in what order, on what stack. Holds the module catalogue (M1–M31) and the locked decisions | Any scope or order change. Bump the version and log it in §9 |
| 3 | [`PROBLEM-MAP.md`](PROBLEM-MAP.md) | **What solves what.** Every issue ID → the module that closes it → its real status | A new issue, or a status change |
| 4 | [`WIREFRAMES.html`](WIREFRAMES.html) | **How the shell looks.** 17 frames at 1:1, 375×812, light theme. UI only — no scope, no roadmap | A visual decision |
| 5 | [`SETUP.md`](SETUP.md) | **The accounts and keys Adarsh creates himself** — Supabase, Gemini, Groq, Netlify, PWA install | The stack changes |

Also present: [`Voice_Profile_and_Training_Plan.pdf`](Voice_Profile_and_Training_Plan.pdf)
— the original assessment artifact. `VOICE-PROFILE.md` is its searchable
transcription; the PDF is kept because it is the primary source.

---

## The two-minute version

**The problem.** One measured root cause — *habitual over-drive*, speaking at
roughly twice the air pressure the job requires — plus untrained prosody, plus
production-under-load, plus three lexical gaps. Breath capacity, fold closure and
endurance were all **measured normal and ruled out**.

**The product.** A PWA that opens on a card instead of Instagram: a vertical feed
for the impulse (Core 3 as the floor, endless as the ceiling), a 12-minute
Speaking Lab for the real work, a capture box, a Hindi section, and five numbers.

**Where it stands.** Phase 0 is built and not deployed — the habit shell and 370
vocabulary cards. **The app cannot hear anything yet**, which means none of the
measured voice problems have running code against them. Phase 1 is exactly that
block, and it is next.

---

## Naming conventions — use these in conversation

| Prefix | Means | Defined in |
|---|---|---|
| **P1–P8** | An issue from the original brief | `PROBLEM-MAP.md` §2 |
| **V1–V7** | An issue from the measured voice profile | `PROBLEM-MAP.md` §3 |
| **U1–U12** | An issue with the current interface | `PROBLEM-MAP.md` §4 |
| **M1–M31** | A module — a thing that gets built | `PLAN.md` §4 |

IDs are permanent. They are never renumbered and never reused. *"Is M11 still in
Phase 1?"* is a better question than any sentence describing the volume meter.

**The rule:** a module that closes no issue ID does not get built. A new idea
with nothing to point at means either it isn't needed, or an issue is missing —
add the issue first.

---

## Superseded — do not cite

| What | Why |
|---|---|
| `PLAN.md` **v0 and v1** | v1 §1 inferred that the root cause was insufficient breath support and ordered the entire roadmap off it. The 2026-08-12 measurements contradicted it. v2 supersedes both entirely |
| Any plan that puts **breath capacity drills first** | Count on one breath is 28 — normal. That rung does not exist |
| Any plan that puts **vocabulary before the microphone** | The stated rule is ≥70% of cards spoken aloud. Vocabulary is the half that is already built |

---

## Open questions blocking work

Six, all listed in [`PLAN.md`](PLAN.md) §7 with a default for each. Four are
one-word UI answers holding Phase 0.5; one is whether the live voice partner
(M30) is approved; one is whether the UI rebuild runs before Phase 1.
