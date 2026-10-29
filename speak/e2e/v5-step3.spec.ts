import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'node:path';

// Step 3 pictures: Ask home, an answer, Fix my sentence, Me with a weak spot.
// 375x812, AI calls mocked, pictures go to docs/redesign-v5/ for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-step3-${name}.png`);

test.use({ viewport: { width: 375, height: 812 } });

async function noSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > window.innerWidth ||
      document.body.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
}

/** Every visible button on screen must be at least 44 px tall and wide. */
async function tapTargetsBigEnough(page: Page, scope = 'body') {
  const small = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return ['missing scope ' + sel];
    const bad: string[] = [];
    root.querySelectorAll('button, a[href], input').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (el.classList.contains('skip-link')) return;
      if (r.height < 43.5 || r.width < 43.5) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return bad;
  }, scope);
  expect(small).toEqual([]);
}

// ── Mocked AI answers ──────────────────────────────────────────────────────
const WORD_ANSWER = {
  askKind: 'word',
  answer:
    '"Bandwidth" at work means how much time and energy you have. "I don\'t have the bandwidth" is a polite way to say "I\'m too busy".',
  cards: [
    {
      type: 'teach',
      track: 'words',
      level: 1,
      kind: 'use',
      category: 'Work words',
      title: 'Bandwidth',
      rule: 'Use "bandwidth" for how much time and energy you have left.',
      examples: {
        work: 'I don\'t have the bandwidth to take this on this week.',
        everyday: 'I\'m out of bandwidth today, can we talk tomorrow?',
      },
      analogy: 'Like a pipe: only so much water fits through at once.',
      tryPrompt: 'Say you are too busy for a new task, using "bandwidth".',
      register: 'both',
    },
    {
      type: 'teach',
      track: 'words',
      level: 1,
      kind: 'fix',
      category: 'Work words',
      title: 'Bandwidth vs free time',
      rule: 'Say "bandwidth" for work load, "free time" for hobbies and plans.',
      examples: {
        work: 'Do you have the bandwidth to review this?',
        everyday: 'I have free time on Sunday.',
      },
      analogy: 'Bandwidth is the pipe, free time is the open afternoon.',
      tryPrompt: 'Fix: "I have no bandwidth for the cinema."',
      register: 'both',
    },
    {
      type: 'teach',
      track: 'words',
      level: 1,
      kind: 'try',
      category: 'Work words',
      title: 'Turn down a task politely',
      rule: 'Name the limit, then offer a later date.',
      examples: {
        work: 'I\'m at capacity this week. Can I pick it up on Monday?',
        everyday: 'I\'m full this weekend. How about next Saturday?',
      },
      analogy: 'Like a full cup: you say so, then offer a refill time.',
      tryPrompt: 'Your manager adds a task. Say no kindly.',
      register: 'office',
    },
  ],
};

const FIX_ANSWER = {
  askKind: 'fix_sentence',
  answer: 'Lead with the ask and give a time. Drop "kindly do the needful".',
  versions: {
    crisp: 'Could [[you send]] me the report by 5 pm today?',
    confident: 'Please [[send me the report]] by 5 pm today.',
    polite: 'Would it be possible for [[you to share]] the report by 5 pm today? Thank you.',
  },
  chunks: ['[[you send]]', '[[send me the report]]', '[[you to share]]'],
  weakSpot: { wrong: 'kindly do the needful', right: 'please send it by 5 pm' },
  cards: [
    {
      type: 'teach',
      track: 'clearly',
      level: 1,
      kind: 'fix',
      category: 'Requests',
      title: 'Ask with a time',
      rule: 'Put the ask first and add a time, so nobody has to guess.',
      examples: {
        work: 'Could you send me the report by 5 pm?',
        everyday: 'Could you text me by 6 when you leave?',
      },
      insteadOf: 'Kindly do the needful.',
      analogy: 'Like a pin on a map: it tells people exactly where to go.',
      tryPrompt: 'Ask a teammate for a file, with a time.',
      register: 'office',
    },
    {
      type: 'teach',
      track: 'smalltalk',
      level: 1,
      kind: 'use',
      category: 'Requests',
      title: 'Please plus a time',
      rule: 'A friendly "please" and a clear time sounds polite and clear.',
      examples: {
        work: 'Please share the notes by noon.',
        everyday: 'Please call me back by evening.',
      },
      analogy: 'Like a handshake and a clock in one sentence.',
      tryPrompt: 'Ask for a reply, with a time.',
      register: 'both',
    },
  ],
};

/** Answer AI calls from the page: answer_ask by the question, verify_batch passes everything. */
async function mockAi(page: Page, answers: { word: unknown; fix: unknown }) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = route.request().url();
    if (!url.includes('/functions/ai')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: {} }),
      });
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      task?: string;
      payload?: { text?: string; items?: Array<{ key: string }> };
    };
    if (body.task === 'answer_ask') {
      const isFix = /fix my sentence/i.test(body.payload?.text ?? '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, provider: 'groq', data: isFix ? answers.fix : answers.word }),
      });
    }
    if (body.task === 'verify_batch') {
      const results = (body.payload?.items ?? []).map((i) => ({ key: i.key, ok: true }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, provider: 'gemini', data: { results } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });
}

async function openAsk(page: Page) {
  await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
  await expect(page.locator('.ask-screen')).toBeVisible();
}

async function askQuestion(page: Page, text: string) {
  const input = page.locator('.ask-input');
  await input.fill(text);
  await page.locator('button.ask-send').click();
  await expect(page.locator('[data-testid="ask-answer"]')).toBeVisible({ timeout: 15000 });
}

test.describe('Step 3: Ask and Me pictures', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    // No real AI or sync call may leave the machine.
    await mockAi(page, { word: WORD_ANSWER, fix: FIX_ANSWER });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('Ask home', async ({ page }) => {
    await openAsk(page);
    await expect(page.locator('.ask-chip')).toHaveCount(4);
    await expect(page.locator('.ask-tile')).toHaveCount(4);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask-home') });
  });

  test('An answer', async ({ page }) => {
    await openAsk(page);
    await askQuestion(page, 'What does bandwidth mean at work?');
    const answer = page.locator('[data-testid="ask-answer"]');
    await expect(answer.locator('.ask-rule')).toContainText('Bandwidth');
    await expect(answer.locator('.ask-hit-new')).toHaveCount(3);
    await expect(answer.locator('button.ask-add')).toBeVisible();
    // Bring the new cards and the Add button into the picture.
    await answer.locator('[aria-label="New, checked"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask-answer') });
  });

  test('Fix my sentence', async ({ page }) => {
    await openAsk(page);
    await page.locator('.ask-chip', { hasText: 'Fix my sentence' }).click();
    await askQuestion(
      page,
      'Fix my sentence: Kindly do the needful and send the report today itself.',
    );
    const answer = page.locator('[data-testid="ask-answer"]');
    await expect(answer.locator('.ask-version')).toHaveCount(3);
    await expect(answer.locator('.ask-chunk').first()).toBeVisible();
    await expect(answer.locator('.ask-weak')).toBeVisible();
    // Scroll the Fix block to the top so the picture shows the three versions.
    await answer.locator('.ask-fix').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask-fix-sentence') });
  });

  test('Me with a weak spot', async ({ page }) => {
    await openAsk(page);
    await page.locator('.ask-chip', { hasText: 'Fix my sentence' }).click();
    await askQuestion(
      page,
      'Fix my sentence: Kindly do the needful and send the report today itself.',
    );
    await expect(page.locator('.ask-weak')).toBeVisible();
    await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
    const me = page.locator('.me-screen');
    await expect(me).toBeVisible();
    const weak = me.locator('.me-row[data-row="weak"]');
    await expect(weak).toBeVisible();
    await expect(weak.locator('.me-row-sub')).toContainText('kindly do the needful', { timeout: 15000 });
    await expect(me.locator('.me-row[data-row="asked"] .me-row-sub')).toContainText('1 question');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('me-weak-spot') });
  });
});
