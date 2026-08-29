// ui-smoke.spec.mjs — LANE A (mechanical UI) gate template
// ---------------------------------------------------------------------------
// Claude writes this. Antigravity turns it green and MAY NOT EDIT IT.
//
// Setup once per project:  npm i -D playwright  &&  npx playwright install chromium
// Run:                     node path/to/ui-smoke.spec.mjs
// Exits non-zero if ANY check fails (so it works as a gate in Antigravity's loop).
//
// This single script would have caught, on its own, most of the voice breakage
// that took 8 briefs to fix:
//   - Menu screen CRASH on open      -> "every screen opens, zero errors"
//   - 4 DEAD microphones             -> assert the control exists AND is wired
//   - overlaps / mic fused to button -> bounding-box overlap check
//   - fake numbers on screen         -> rendered text === data-expected
//   - horizontal scroll on mobile    -> scrollWidth === viewport width
//
// Adjust: BASE_URL, the SCREENS list, the openers, and the banned words.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';

const BASE_URL = process.env.URL || 'http://localhost:8149';
const VIEWPORT = { width: 390, height: 844 };           // the phone we ship to.
const BANNED = ['pantry', 'database', 'token', 'api', 'json', 'undefined', 'NaN'];

// Every screen + how to open it (a JS expression run in the page).
const SCREENS = [
  { name: 'Today',    open: `renderToday()` },
  { name: 'Menu',     open: `openMealMenu()` },          // this one crashed on open.
  { name: 'Item edit',open: `openItemDetail('itm_001')` },
  // ...list EVERY screen. A screen not listed is a screen not gated.
];

let failures = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };
const ok   = (msg) => console.log('  ✓ ' + msg);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

// Fail on ANY uncaught page error or console error — this is the crash net.
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE_URL, { waitUntil: 'networkidle' });

for (const s of SCREENS) {
  console.log(`\n[${s.name}]`);
  errors.length = 0;
  try {
    await page.evaluate(s.open);                          // open it.
    await page.waitForTimeout(150);
  } catch (e) {
    fail(`threw on open: ${e.message}`);
    continue;
  }
  if (errors.length) { errors.forEach(fail); } else ok('opens with zero thrown/console errors');

  // No horizontal scroll.
  const sw = await page.evaluate(() => document.body.scrollWidth);
  sw === VIEWPORT.width ? ok('no horizontal scroll') : fail(`scrollWidth ${sw} !== ${VIEWPORT.width}`);

  // Tap targets >= 44px (visible interactive elements).
  const tooSmall = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, input, .mic, [role=button]')];
    return els.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
    }).map(el => el.className || el.tagName);
  });
  tooSmall.length === 0 ? ok('all tap targets >= 44px') : fail(`tap targets < 44px: ${tooSmall.join(', ')}`);

  // No overlapping interactive controls (the "mic fused to Done bar" bug).
  const overlaps = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, .mic, [role=button]')]
      .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++)
        if (hit(els[i], els[j])) return true;
    return false;
  });
  overlaps ? fail('two interactive controls overlap') : ok('no overlapping controls');

  // Rendered numbers must equal the math. Mark them: <span data-expected="509">509</span>.
  const wrongNums = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-expected]')]
      .filter(el => el.textContent.replace(/[^\d.]/g, '') !== String(el.dataset.expected))
      .map(el => `${el.dataset.expected} vs "${el.textContent.trim()}"`);
  });
  wrongNums.length === 0 ? ok('rendered numbers match computed') : fail(`fake/wrong numbers: ${wrongNums.join('; ')}`);

  // Banned words in the live DOM.
  const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  const found = BANNED.filter(w => text.includes(w));
  found.length === 0 ? ok('no banned words') : fail(`banned words on screen: ${found.join(', ')}`);
}

await browser.close();
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------
// For "is the control actually WIRED" (dead-mic class): add a block that fires
// the control and asserts the downstream effect, e.g.
//   await page.evaluate(() => document.querySelector('.mic').click());
//   const opened = await page.evaluate(() => !!document.querySelector('#voiceSheet'));
//   opened ? ok('mic opens voice sheet') : fail('mic is dead');
// Prefer this over "the .mic element exists" — existence is what green-washed AG-007.
// ---------------------------------------------------------------------------
