import { test, expect, type Page, type Route } from '@playwright/test';

// End-to-end flows through the shell: Feed · Favorites · Ask · Me. The Feed is the v7
// Night glass feed (module cards, chip row, rail Know it 👍 👎 💬 ♡ 🔊, feedback sheet);
// Ask is the one AI text box (v8), faked here with page.route.
// 375x812 (playwright.config).
// Every AI and sync call is answered by page.route — nothing leaves the machine.

type AiMode = 'ok' | 'down';

/**
 * Answer every function call. 'ok': verify_batch passes everything on Gemini
 * (a different provider, as the app requires).
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
    if (body.task === 'tell_app') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          task: 'tell_app',
          provider: 'gemini',
          data: { reply: 'Got it. You will see more about Money.', learned: [{ kind: 'more', theme: 'Money' }] },
        }),
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
    // Background jobs (card batches): a plain failure, which they skip silently.
    return route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'AI is unavailable right now.' }),
    });
  });
}

const tab = (page: Page, name: 'Feed' | 'Favorites' | 'Ask' | 'Me') =>
  page.locator('nav.v5-tabs button', { hasText: new RegExp(`^${name}$`) });

/** The tab bar is the floating glass pill: blurred, over the page, inside the screen. */
async function expectGlassTabBar(page: Page) {
  const bar = page.locator('nav.v5-tabs');
  await expect(bar).toBeVisible();
  const info = await bar.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      blur: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || 'none',
      position: cs.position,
      inside: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.top > 0,
    };
  });
  expect(info.blur).toContain('blur');
  expect(info.position).toBe('absolute');
  expect(info.inside).toBe(true);
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

  test('Flow 2: ♡ a card in the Feed → Favorites shows it full-size → an empty module chip → Mix → ♡ un-save → empty line', async ({
    page,
  }) => {
    await start(page);
    const card = page.locator('article.v7-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    const cardId = (await card.getAttribute('data-card-id')) as string;
    const savedModule = (await card.getAttribute('data-module')) as string;
    await card.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(card.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();

    await tab(page, 'Favorites').click();
    const fav = page.locator('[data-testid="fav-card"]');
    await expect(fav).toHaveCount(1, { timeout: 10000 });
    await expect(fav.locator('article.v7-card')).toHaveAttribute('data-card-id', cardId);
    // Full-size: the card fills the swipe list, as in the Feed.
    const sizes = await page.evaluate(() => {
      const list = document.querySelector('.v7-favorites .v7-vfeed') as HTMLElement;
      const art = document.querySelector('.v7-favorites article.v7-card') as HTMLElement;
      return { list: list.clientHeight, card: Math.round(art.getBoundingClientRect().height) };
    });
    expect(Math.abs(sizes.card - sizes.list)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('button', { name: 'Remove from Favorites' })).toBeVisible();

    // A module chip with nothing saved shows its own empty line.
    const labelOf: Record<string, string> = {
      words: 'Words',
      smalltalk: 'Small talk',
      better: 'Say it better',
      phrases: 'Office phrases',
      stories: 'Stories',
    };
    const other = Object.entries(labelOf).find(([m]) => m !== savedModule)![1];
    await page.locator('.v7-favorites .v7-chiprow button', { hasText: new RegExp(`^${other}$`) }).click();
    await expect(page.locator('[data-testid="favorites-empty"]')).toContainText('No favorites in this module yet.');
    await expect(fav).toHaveCount(0);

    // Back to Mix: the card is there; ♡ un-save leaves it listed with a hollow ♡
    // until Favorites is opened again (answer 4).
    await page.locator('.v7-favorites .v7-chiprow button', { hasText: /^Mix$/ }).click();
    await expect(fav).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove from Favorites' }).click();
    await expect(page.getByRole('button', { name: 'Save to Favorites' })).toBeVisible();
    await expect(fav).toHaveCount(1);

    // Reopen Favorites: now it is empty.
    await tab(page, 'Feed').click();
    await tab(page, 'Favorites').click();
    await expect(page.locator('[data-testid="favorites-empty"]')).toContainText(
      'Nothing here yet. Tap ♡ on a card in the Feed to keep it here.',
    );
    await expect(fav).toHaveCount(0);
  });

  test('Flow 3: exactly Feed · Favorites · Ask · Me, a glass tab bar on all four', async ({ page }) => {
    await start(page);
    const buttons = page.locator('nav.v5-tabs button');
    await expect(buttons).toHaveCount(4);
    await expect(buttons.locator('span')).toHaveText(['Feed', 'Favorites', 'Ask', 'Me']);
    await expect(page.getByRole('button', { name: 'Ask tab' })).toHaveCount(1);

    await expect(page.locator('.v7-feed')).toBeVisible({ timeout: 15000 });
    await expectGlassTabBar(page);

    await tab(page, 'Favorites').click();
    await expect(page.locator('section[aria-label="Favorites"]')).toBeVisible();
    await expect(tab(page, 'Favorites')).toHaveClass(/is-active/);
    await expectGlassTabBar(page);

    await tab(page, 'Ask').click();
    await expect(page.getByTestId('ask-screen')).toBeVisible();
    await expect(tab(page, 'Ask')).toHaveClass(/is-active/);
    await expectGlassTabBar(page);

    await tab(page, 'Me').click();
    await expect(page.locator('.me-screen')).toBeVisible();
    await expect(tab(page, 'Me')).toHaveClass(/is-active/);
    await expectGlassTabBar(page);
  });

  test('Flow 4: 👎 on a card → sheet → reason + comment → "Got it" → Me lists what the app learned', async ({
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

  test('Flow 5: reload keeps the Feed and progress, with no first-run screen', async ({ page }) => {
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

  test('Flow 6: Know it moves to the next card and the Words cards after it are all level 3', async ({ page }) => {
    await start(page);
    await page.locator('.v7-chiprow button', { hasText: /^Words$/ }).click();
    await expect(page.locator('article.v7-card').first()).toHaveAttribute('data-module', 'words', { timeout: 10000 });
    await expect
      .poll(() => page.locator('article.v7-card:not([data-module="words"])').count(), { timeout: 10000 })
      .toBe(0);

    // The Feed starts above the easiest cards: a Words card of level 2 or 3, never level 1.
    const levels = await page.locator('article.v7-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.level));
    expect(levels.length).toBeGreaterThan(0);
    expect(levels).not.toContain('1');

    // Bring a level 2 card to the top (snap switched off for the jump), then tap Know it on it.
    const idx = levels.indexOf('2');
    expect(idx).toBeGreaterThanOrEqual(0);
    await page.evaluate((i) => {
      const feed = document.querySelector('.v7-vfeed') as HTMLElement;
      const el = document.querySelectorAll('article.v7-card')[i] as HTMLElement;
      feed.style.scrollSnapType = 'none';
      feed.scrollTop = el.offsetTop;
      feed.style.scrollSnapType = '';
    }, idx);
    await page.waitForTimeout(500);
    const known = page.locator('article.v7-card').nth(idx);
    const knownId = (await known.getAttribute('data-card-id')) as string;
    expect(await cardOnScreen(page)).toBe(knownId);
    await expect(known).toHaveAttribute('data-level', '2');
    const knowBtn = known.getByRole('button', { name: 'Know it' });
    const box = await knowBtn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(43.5);
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
    await knowBtn.click();

    // It moves on by itself: another card fills the screen.
    await expect.poll(() => cardOnScreen(page), { timeout: 10000 }).not.toBe(knownId);

    // Every Words card queued after it is now level 3.
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const cards = Array.from(document.querySelectorAll('article.v7-card')) as HTMLElement[];
            const at = cards.findIndex((c) => c.dataset.cardId === id);
            return cards.slice(at + 1).map((c) => `${c.dataset.module}:${c.dataset.level}`);
          }, knownId),
        { timeout: 10000 },
      )
      .not.toContain('words:2');
    const after = await page.evaluate((id) => {
      const cards = Array.from(document.querySelectorAll('article.v7-card')) as HTMLElement[];
      const at = cards.findIndex((c) => c.dataset.cardId === id);
      return cards.slice(at + 1).map((c) => `${c.dataset.module}:${c.dataset.level}`);
    }, knownId);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((x) => x === 'words:3')).toBe(true);
  });

  test('Flow 7: Ask (AI faked) shows the reply, Me lists the learned line, Remove takes it away', async ({ page }) => {
    await start(page);
    await tab(page, 'Ask').click();
    await expect(page.getByTestId('ask-screen')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tell the app' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Tell the app' }).fill('Show me more about money please.');
    await page.getByRole('button', { name: 'Send' }).click();
    const thread = page.getByTestId('ask-thread');
    await expect(thread).toContainText('Got it. You will see more about Money.', { timeout: 10000 });
    await expect(thread).toContainText('Learned:');

    await tab(page, 'Me').click();
    await expect(page.locator('.me-screen')).toBeVisible();
    const items = page.getByTestId('me-learned-item');
    await expect(items).toHaveCount(1, { timeout: 10000 });
    await expect(items.first()).toContainText(/money/i);

    await items.first().getByRole('button', { name: /^Remove/ }).click();
    await expect(items).toHaveCount(0);
  });
});
