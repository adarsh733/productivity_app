import { test, expect, type Page, type Route } from '@playwright/test';

// End-to-end flows through the shell: Feed · Ask · Me, with the old v4 screens
// behind the gear on Me. The Feed is the v7 Night glass feed (module cards,
// chip row, rail 👍 👎 💬 ♡ 🔊, feedback sheet). 375x812 (playwright.config).
// Every AI and sync call is answered by page.route — nothing leaves the machine.

/** One small checked answer for answer_ask (three teach cards). */
const ASK_ANSWER = {
  askKind: 'word',
  answer: '"Bandwidth" at work means how much time and energy you have left.',
  cards: [
    {
      type: 'teach',
      track: 'words',
      level: 1,
      kind: 'use',
      category: 'Work words',
      title: 'Bandwidth (flows)',
      rule: 'Use "bandwidth" for how much time you have left.',
      examples: {
        work: "I don't have the bandwidth to take this on.",
        everyday: "I'm out of bandwidth today.",
      },
      analogy: 'Like a pipe: only so much fits through at once.',
      tryPrompt: 'Say you are too busy, using "bandwidth".',
      register: 'both',
    },
    {
      type: 'teach',
      track: 'words',
      level: 1,
      kind: 'fix',
      category: 'Work words',
      title: 'Bandwidth vs free time (flows)',
      rule: 'Say "bandwidth" for work load, "free time" for plans.',
      examples: {
        work: 'Do you have the bandwidth to review this?',
        everyday: 'I have free time on Sunday.',
      },
      insteadOf: 'I have no bandwidth for the cinema.',
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
      title: 'Turn down a task (flows)',
      rule: 'Name the limit, then offer a later date.',
      examples: {
        work: "I'm at capacity this week. Can I pick it up Monday?",
        everyday: "I'm full this weekend. How about next Saturday?",
      },
      analogy: 'Like a full cup: say so, then offer a refill time.',
      tryPrompt: 'Your manager adds a task. Say no kindly.',
      register: 'office',
    },
  ],
};

type AiMode = 'ok' | 'down';

/**
 * Answer every function call. 'ok': answer_ask from Groq, verify_batch passes
 * everything on Gemini (a different provider, as the app requires).
 * 'down': every AI call fails the way the real function does with no keys.
 */
async function mockFunctions(page: Page, mode: AiMode = 'ok') {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = route.request().url();
    if (!url.includes('/functions/ai')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
    }
    if (mode === 'down') {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'AI is unavailable right now (offline or no key).' }),
      });
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      task?: string;
      payload?: { items?: Array<{ key: string }> };
    };
    if (body.task === 'answer_ask') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, task: 'answer_ask', provider: 'groq', data: ASK_ANSWER }),
      });
    }
    if (body.task === 'verify_batch') {
      const results = (body.payload?.items ?? []).map((i) => ({ key: i.key, ok: true, reason: 'pass' }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, task: 'verify_batch', provider: 'gemini', data: { results } }),
      });
    }
    // Background jobs (top-up, weekly plan): a plain failure, which they skip silently.
    return route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'AI is unavailable right now.' }),
    });
  });
}

const tab = (page: Page, name: 'Feed' | 'Ask' | 'Me') =>
  page.locator('nav.v5-tabs button', { hasText: name });

async function openOldTools(page: Page) {
  await tab(page, 'Me').click();
  await expect(page.locator('.me-screen')).toBeVisible();
  await page.locator('button.me-gear').click();
  await expect(page.locator('.old-tools')).toBeVisible();
}

/** The card filling the screen right now (its top edge at the top). */
async function cardOnScreen(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article.v7-card')) as HTMLElement[];
    return cards.find((c) => Math.abs(c.getBoundingClientRect().top) < 2)?.dataset.cardId ?? null;
  });
}

/**
 * Swipe up with a real finger (Chromium touch input): the feed scrolls one
 * whole card and snaps. Headless Chromium finishes a touch scroll only when the
 * next touch starts, so a touch that starts and is cancelled follows.
 */
async function swipeUp(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  let t = Date.now() / 1000;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x: number, y: number) => {
    t += 0.016;
    return cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }],
      timestamp: t,
    });
  };
  // Start only once the feed is at rest on a card.
  await expect
    .poll(() => page.evaluate(() => {
      const f = document.querySelector('.v7-vfeed') as HTMLElement;
      return f.scrollTop % f.clientHeight;
    }))
    .toBe(0);
  await send('touchStart', 180, 720);
  for (let i = 1; i <= 15; i++) await send('touchMove', 180, 720 - i * 40);
  await send('touchEnd', 180, 120);
  await page.waitForTimeout(300);
  await send('touchStart', 200, 20);
  await send('touchCancel', 200, 20);
  await cdp.detach();
  await page.waitForTimeout(700);
}

test.describe('SPEAK user flows', () => {
  let consoleErrors: string[] = [];

  async function start(page: Page, mode: AiMode = 'ok') {
    consoleErrors = [];
    page.on('console', (m) => {
      // A mocked 502 is logged by the browser itself; that is the test, not a bug.
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await mockFunctions(page, mode);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // The v5 shell, not some other app on port 5173.
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
  }

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('Flow 1: first open lands on the Feed, no onboarding gate; five cards advance', async ({ page }) => {
    await start(page);
    await expect(page.locator('.ob-title')).toHaveCount(0);
    await expect(page.locator('.v7-feed')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    await expect(tab(page, 'Feed')).toHaveClass(/is-active/);
    await expect(page.locator('.v7-chiprow button[aria-selected="true"]')).toHaveText('Mix');

    const seen = new Set<string>();
    const first = await cardOnScreen(page);
    expect(first).not.toBeNull();
    seen.add(first!);
    for (let i = 0; i < 5; i++) {
      await swipeUp(page);
      const id = await cardOnScreen(page);
      expect(id).not.toBeNull();
      expect(seen.has(id!)).toBe(false);
      seen.add(id!);
    }
    // Old picture cards and XP are gone from the feed.
    await expect(page.locator('.poster')).toHaveCount(0);
    await expect(page.getByText(/XP today/i)).toHaveCount(0);
  });

  test('Flow 2: save a card with ♡ in the Feed → Me shows it under Saved', async ({ page }) => {
    await start(page);
    const card = page.locator('article.v7-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(card.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();

    await tab(page, 'Me').click();
    const saved = page.locator('.me-row[data-row="saved"] .me-row-sub');
    await expect(saved).toContainText('1 card', { timeout: 10000 });
  });

  test('Flow 3: Ask a question → checked cards → add them to the feed → Me counts it', async ({ page }) => {
    await start(page);
    await tab(page, 'Ask').click();
    await expect(page.locator('.ask-screen')).toBeVisible();
    await page.locator('.ask-input').fill('What does bandwidth mean at work?');
    await page.locator('button.ask-send').click();

    const answer = page.locator('[data-testid="ask-answer"]');
    await expect(answer).toBeVisible({ timeout: 15000 });
    await expect(answer.locator('.ask-rule')).toContainText('Bandwidth');
    await expect(answer.locator('.ask-hit-new')).toHaveCount(3);
    await answer.locator('button.ask-add').click();
    await expect(answer.locator('.ask-added')).toContainText('Added 3 cards');

    await tab(page, 'Me').click();
    await expect(page.locator('.me-row[data-row="asked"] .me-row-sub')).toContainText('1 question', {
      timeout: 10000,
    });
  });

  test('Flow 4: AI down → Ask shows one plain line and nothing is added', async ({ page }) => {
    await start(page, 'down');
    await tab(page, 'Ask').click();
    await page.locator('.ask-input').fill('What does bandwidth mean at work?');
    await page.locator('button.ask-send').click();

    const line = page.locator('.ask-line').first();
    await expect(line).toBeVisible({ timeout: 15000 });
    await expect(line).toContainText(/library/i);
    await expect(page.locator('.ask-hit-new')).toHaveCount(0);
    await expect(page.locator('button.ask-add')).toHaveCount(0);
    // No raw provider error ever reaches the screen.
    await expect(page.getByText(/no key\)|http \d{3}|502/)).toHaveCount(0);
  });

  test('Flow 5: gear on Me → old Browse → search → card detail → back', async ({ page }) => {
    await start(page);
    await openOldTools(page);
    await page.locator('.old-tools-item', { hasText: 'Browse' }).click();
    await expect(page.locator('.browse-screen')).toBeVisible();

    await page.locator('.browse-search-input').fill('the');
    await page.waitForTimeout(500);
    const hit = page.locator('.search-card-row').first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.locator('#card-detail-title')).toBeVisible();
    await expect(page.locator('.card-detail-say-btn')).toBeVisible();

    await page.locator('.deck-modal-close-btn').last().click();
    await expect(page.locator('.browse-screen')).toBeVisible();
    await page.getByRole('button', { name: 'Close old tools' }).click();
    await expect(page.locator('.old-tools')).toHaveCount(0);
    await expect(page.locator('.me-screen')).toBeVisible();
  });

  test('Flow 6: 👎 on a card → sheet → reason + comment → "Got it" → Me lists what the app learned', async ({
    page,
  }) => {
    await start(page);
    await page.locator('.v7-chiprow button', { hasText: /^Words$/ }).click();
    const card = page.locator('article.v7-card').first();
    await expect(card).toHaveAttribute('data-module', 'words', { timeout: 10000 });

    await card.getByRole('button', { name: 'Thumbs down' }).click();
    const sheet = page.getByRole('dialog', { name: 'What did you think?' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Too easy' }).click();
    await sheet.getByRole('textbox', { name: 'Comment' }).fill('Too basic. I already use this word daily.');
    await sheet.getByRole('button', { name: 'Send feedback' }).click();
    await expect(sheet.locator('.v7-sheet-gotit')).toContainText(/^Got it/);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await tab(page, 'Me').click();
    await expect(page.locator('[data-testid="me-learned-item"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('Flow 7: reload keeps the Feed and progress, with no first-run screen', async ({ page }) => {
    await start(page);
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    const first = await cardOnScreen(page);
    await swipeUp(page);
    await page.waitForTimeout(500);

    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.v7-feed')).toBeVisible();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.ob-title')).toHaveCount(0);
    // The card swiped past was recorded as viewed: it does not open the feed again.
    expect(await cardOnScreen(page)).not.toBe(first);
  });

  test('Flow 8: keyboard — old Browse deck opens and Escape closes it', async ({ page }) => {
    await start(page);
    await openOldTools(page);
    await page.locator('.old-tools-item', { hasText: 'Browse' }).click();
    await expect(page.locator('.browse-screen')).toBeVisible();

    const firstDeck = page.locator('.deck').first();
    await expect(firstDeck).toBeVisible();
    await firstDeck.click();
    await expect(page.locator('.deck-modal-container')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.deck-modal-container')).not.toBeVisible();
  });
});
