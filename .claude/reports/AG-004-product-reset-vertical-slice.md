# AG-004 - Product reset vertical slice

**Date:** 2026-08-15  
**Status:** Complete, not committed, not deployed

## Delivered

- Approved four-area shell: Today, Coach, Practice and Progress.
- Global Capture overlay and Impulse Rescue flow with an explicit phone-down exit.
- Versioned local checkpoint state for tab, environment, duration, onboarding panel/environment, Capture draft, Rescue step and the complete coaching state machine.
- 60-second, 3-minute and 20-minute entry paths.
- Six-block coaching runner ending in mission, first attempt, one correction, redo, comparison and saved best attempt.
- Existing Web Audio meter used for live relative-volume guidance.
- Completed loops persisted through existing Dexie `labSessions`, `days`, `voiceSamples` and `outbox` tables.
- Day 1 and evidence-bearing Progress states.

## Leave-and-return contract

- Every reducer transition is written synchronously to `speak.product-reset.v1`.
- Block timers and recording timers checkpoint once per second.
- `visibilitychange` and `pagehide` pause active sessions before the app leaves the foreground.
- Reload restores the exact block, remaining seconds, attempts and next action.
- A live microphone stream and an unfinished browser audio buffer cannot survive browser termination. An interrupted attempt therefore returns to its safe start screen. Completed blocks and completed attempts remain saved.

## Verification

- `npm test -- --run`: 123/123 passed.
- `npm run build`: clean TypeScript and Vite/PWA production build.
- Headless Chrome, 375x812:
  - full 60-second feedback-redo loop completed and appeared as `1` in Progress;
  - forced reload restored Block 1 at exactly `02:59` and exposed only Resume while paused;
  - Capture draft restored after closing and reopening;
  - selected Practice tab restored after reload;
  - Rescue restored to the active challenge;
  - zero console errors, horizontal overflow or tap targets below 44px.

## Honest gaps

- Reset onboarding does not yet record the habitual, quiet and natural-story baseline samples.
- Attempts currently persist metrics and completion metadata, not replayable audio blobs.
- Feedback uses the trusted authored fallback; transcript upload and real AI feedback are not connected yet.
- Voice Capture is visibly unavailable in this slice.
- Practice lanes currently enter the shared office-mission runner; lane-specific prompts and content selection remain to be wired.
- Capture classification, mission approval/editing and mature twelve-week archive visualizations remain future slices.
