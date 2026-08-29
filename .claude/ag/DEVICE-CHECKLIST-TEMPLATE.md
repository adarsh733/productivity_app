# DEVICE CHECKLIST — «task» · AG-«nnn»

For the handful of things **no headless gate can reach**: real microphone, real camera, safe-area
insets, real touch, secure-context (HTTPS-only) behavior. Adarsh runs these on his phone; reports
back. Only leftovers fall to Claude's browser tools (the expensive path).

**Rules for Claude writing this:** be specific — exact screen, exact action, exact expected result.
No "test the voice feature." Each line must be answerable yes/no in ten seconds. Keep it to the
things that genuinely can't be gated; everything else belongs in a machine gate, not here.

---

## Before you start
- Open on phone: `«http://192.168.x.x:8149»`  (or the deployed HTTPS URL for anything mic-related).
- Hard-refresh so the new `?v=` assets load.

## Checks

| # | Screen | Do this | You should see | Pass? |
|---|--------|---------|----------------|:---:|
| 1 | «Today» | Tap the mic, say "two roti one katori dal" | Review sheet with 2 items, total «509 kcal» | ☐ |
| 2 | «Today» over **HTTP** (not https) | Tap the mic | It falls back to typing with a clear line, does **not** hang | ☐ |
| 3 | «Log» | Tap the camera, photograph a plate | Native camera opens; after capture, a review sheet appears | ☐ |
| 4 | «any sheet» | Scroll to the bottom on a notched phone | Buttons sit above the home bar, nothing clipped (safe-area) | ☐ |
| 5 | «Menu» | Tap-and-hold / swipe as designed | The gesture works, no accidental double-fire | ☐ |

## Report back (one line each)
- Which numbers passed. Which felt wrong (say the screen + what you saw).
- Anything that looked off visually even if it "worked".

Anything you couldn't get to, tell Claude — Claude finishes only the leftovers with browser tools.
