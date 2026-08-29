// logic-gate.test.mjs — GOLDEN-VALUE + SEAM gate template
// ---------------------------------------------------------------------------
// Claude writes this. Antigravity turns it green and MAY NOT EDIT IT.
// Run:  node --test "path/to/this.test.mjs"
//
// This catches the two logic failures Antigravity ships confidently:
//   1) SILENT MATH  — fake fallbacks, scaling bugs, missing fields.
//      -> pin EXACT values, not shapes.  assert.equal(x, 509), never x > 0.
//   2) BROKEN WIRING — a function exists but nothing downstream happens.
//      -> test at the SEAM: fire the real entry point, assert the real effect.
//
// Rules:
//   - RED FIRST. This must fail against the stubs before Antigravity starts.
//   - Cover the edges: empty input, "must NOT invent a value", boundaries.
//   - No mocking away the thing under test. Test the real integration.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import the REAL modules under test (adjust paths to the project).
// import { weeklyBudgetForDate, macrosForAmount } from '../../js/food/foodMath.js';
// import { resolveSpokenLog } from '../../js/food/aiParse.js';

// ===========================================================================
// 1) SILENT MATH — exact values. These are the numbers a silent bug would move.
// ===========================================================================

test('macros: 2 roti + 1 katori dal = EXACT known totals', () => {
  // const m = macrosForAmount(/* ...real inputs... */);
  // assert.equal(m.kcal, 509);          // not "a number" — the exact number.
  // assert.equal(m.protein, 26.1);
  // assert.equal(m.carbs, 46);          // carbs/fat were silently missing once.
  // assert.equal(m.fat, 23.2);
});

test('macros scale linearly: 3 roti recomputed from ground truth, not ratio-multiplied', () => {
  // This is the exact bug that shipped: correcting a quantity multiplied a ratio
  // instead of recomputing. Pin the corrected total.
  // const m = macrosForAmount(/* 3 roti + 1 dal */);
  // assert.equal(m.kcal, 616);
});

test('NO INVENTED VALUES: unknown/empty food never returns a fabricated number', () => {
  // The "fake 500 kcal / 30g fallback" failure. Empty must be empty.
  // const m = macrosForAmount(/* unknown item */);
  // assert.equal(m.kcal, 0);            // or null — NOT a plausible-looking fake.
});

test('edge: empty input returns empty and invents nothing', () => {
  // assert.equal(weeklyBudgetForDate([]).kcal, /* the real empty answer */ 0);
});

// ===========================================================================
// 2) SEAM — fire the real entry point, assert the DOWNSTREAM effect.
//    (This is what 249 unit tests missed while 4 mics were dead.)
// ===========================================================================

test('SEAM: speaking a known food routes through matcher and produces a review draft', () => {
  // Do NOT assert "resolveSpokenLog is a function". Fire it, assert the result
  // that the next screen actually consumes.
  // const draft = resolveSpokenLog('two roti one katori dal');
  // assert.equal(draft.items.length, 2);
  // assert.equal(draft.items[0].name, 'Roti');
  // assert.equal(draft.total.kcal, 509);   // the wiring produced the right number.
});

test('SEAM: unrelated speech returns no-match, does not guess a food', () => {
  // const draft = resolveSpokenLog('bicycle');
  // assert.equal(draft.items.length, 0);
});

// ---------------------------------------------------------------------------
// Add one test per acceptance criterion. Each must be a machine pass/fail with
// an EXACT expected value. If you can't express a criterion as an exact
// assertion, it's a taste/device item — move it to the UI smoke gate or the
// device checklist, don't leave it as prose.
// ---------------------------------------------------------------------------
