import { test, expect, type Page, type Route } from '@playwright/test';

// End-to-end flows through the v5 shell: Feed · Ask · Me, with the old v4
// screens behind the gear on Me. 375x812 (playwright.config). Every AI and
// sync call is answered by page.route — nothing leaves the machine.

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

/**
 * The feed picks cards at random, so to reach one named card every other card
 * is removed from this throwaway test browser's database, then Ask → Feed makes
 * the feed reload (same trick as v5-step4.spec.ts).
 */
async function showOnlyCard(page: Page, cardId: string) {
  await expect(page.locator('.card-frame')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800); // let first-run seeding finish
  const kept = await page.evaluate(async (keep) => {
    const dbReq = indexedDB.open('speak');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result);
      dbReq.onerror = () => reject(dbReq.error);
    });
    const tx = db.transaction('cards', 'readwrite');
    const store = tx.objectStore('cards');
    await new Promise<void>((resolve, reject) => {
      const cur = store.openKeyCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve();
        if (c.primaryKey !== keep) store.delete(c.primaryKey);
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
    return true;
  }, cardId);
  expect(kept).toBe(true);
  await tab(page, 'Ask').click();
  await expect(page.locator('.ask-screen')).toBeVisible();
  await tab(page, 'Feed').click();
  await expect(page.locator(`article[aria-label="Card: ${cardId}"]`)).toBeVisible({ timeout: 15000 });
}

test.describe('SPEAK v5 user flows', () => {
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
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.fcard')).toBeVisible();
    await expect(tab(page, 'Feed')).toHaveClass(/is-active/);

    for (let i = 0; i < 5; i++) {
      const next = page.locator('button.got-it').first();
      await expect(next).toBeVisible();
      await next.click();
      await page.waitForTimeout(250);
    }
    await expect(page.locator('.fcard')).toBeVisible();
    // XP is off in the v5 feed.
    await expect(page.getByText(/XP today/i)).toHaveCount(0);
  });

  test('Flow 2: save a card in the Feed → Me shows it under Saved', async ({ page }) => {
    await start(page);
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Bookmark card/i }).first().click();
    await expect(page.locator('.toast')).toContainText('Saved');

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

  test('Flow 6: 🎤 Say mine on a Try card opens the say-it drill; mic denied still cancels cleanly', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await start(page);
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    await showOnlyCard(page, 'try-smalltalk-monday-weekend');
    await expect(page.locator('.try-face')).toBeVisible();

    await page.getByRole('button', { name: /Say my answer out loud/i }).click();
    const sheet = page.locator('.old-tools');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.speak-drill-runner')).toBeVisible();
    // The drill asks for HIS answer to this card's moment, not a generic prompt.
    await expect(sheet).toContainText('How was your weekend');

    await sheet.locator('.deck-modal-close-btn').first().click();
    await page.getByRole('button', { name: 'Close old tools' }).click();
    await expect(page.locator('.old-tools')).toHaveCount(0);
    await expect(page.locator('.feed-screen')).toBeVisible();
  });

  test('Flow 7: reload keeps the Feed and progress, with no first-run screen', async ({ page }) => {
    await start(page);
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    await page.locator('button.got-it').first().click();
    await page.waitForTimeout(300);

    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.feed-screen')).toBeVisible();
    await expect(page.locator('.fcard')).toBeVisible();
    await expect(page.locator('.ob-title')).toHaveCount(0);
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
