# UI Rebuild & Gesture Verification Rules

Key lessons learned from AG-002 Phase 0.5 UI Rebuild:

## 1. Empirical Execution Over Static Analysis
- Passing `npm run build` and static unit tests does **not** equal UI completion.
- Behavioral requirements (touch gestures, scroll collisions, session progression across screens) MUST be verified by interactively executing user flows end-to-end.
- Always test multi-step sequences (e.g., Card 1 → 2 → 3 → 4 mode transition), not just initial card rendering.

## 2. Touch Gestures vs Inner Scroll Disambiguation
- When attaching swipe gestures to a container containing scrollable elements (e.g., `.card-body` inside `.card-frame`):
  - Do NOT rely on CSS `touch-action` alone to prevent gesture collisions.
  - Always check scroll position (`scrollTop + clientHeight >= scrollHeight`) before claiming vertical swipe gestures.
  - Swiping up while scrolling text inside a card body must NEVER trigger a card-advance gesture.

## 3. Automation of UI Transitions (State Machine Wiring)
- When a UI redesign removes an explicit button (e.g., "Keep going") to make a transition automatic:
  - Identify every state mutation the old button performed (e.g., `setMode('endless')`).
  - Wire that exact logic directly into the automatic completion trigger so state progression does not stall on a silent dead-end.

## 4. Mount vs Transition State Guards
- In React edge-trigger effects (e.g., `prevVal.current !== newVal`):
  - Never initialize ref tracking variables to `false` if `newVal` can be `true` on initial component mount due to persisted state (e.g., returning to a screen with Core 3 already completed earlier in the day).
  - Initialize tracking refs with current hook values or check mount status to avoid spurious re-animations.
