import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v7/v8 Night glass pictures: one card per module, the Know it card, the Ask tab
// (empty and with a faked reply), Me with an Ask line and the feedback sheet, shot at
// 390x844 (iPhone 16 Pro) and compared by eye with docs/redesign-v7/glass-B-1..4;
// the same screens are also checked at 375x812 (no sideways scroll, every
// button at least 44 px). AI and sync calls are mocked; pictures go to
// docs/redesign-v7/ for Adarsh.
// Found from this file, not the folder the command runs in (the final check runs from the project folder).
const OUT = fileURLToPath(new URL('../../docs/redesign-v7/', import.meta.url));
const shot = (name: string) => path.join(OUT, `built-${name}.png`);

test.use({ viewport: { width: 390, height: 844 } });

async function noSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > window.innerWidth ||
      document.body.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
}

/** Every button on screen (not on a slide or card out of view) is at least 44 px. */
async function tapTargetsBigEnough(page: Page, scope = 'body') {
  const small = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return ['missing scope ' + sel];
    const bad: string[] = [];
    root.querySelectorAll('button, a[href], input').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;
      if (r.right <= 0 || r.left >= window.innerWidth) return;
      if (el.classList.contains('skip-link')) return;
      if (r.height < 43.5 || r.width < 43.5) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return bad;
  }, scope);
  expect(small).toEqual([]);
}

const chip = (page: Page, label: string) =>
  page.locator('.v7-chiprow button', { hasText: new RegExp(`^${label}$`) });

const MODULE_OF: Record<string, string> = {
  Words: 'words',
  'Small talk': 'smalltalk',
  'Say it better': 'better',
  'Office phrases': 'phrases',
  Stories: 'stories',
};

/**
 * Pick a module chip, then bring one card to the top of the feed: the named
 * sample card when today's order has it in the first chunk, else the first
 * card of that module (with the 1,500-card library the order changes daily).
 */
async function showCard(page: Page, chipLabel: string, wantedId: string) {
  await chip(page, chipLabel).click();
  await expect(chip(page, chipLabel)).toHaveAttribute('aria-selected', 'true');
  const ofModule = page.locator(`article.v7-card[data-module="${MODULE_OF[chipLabel]}"]`);
  // Wait for the filtered list itself (no card of another module left from Mix).
  await expect
    .poll(() => page.locator(`article.v7-card:not([data-module="${MODULE_OF[chipLabel]}"])`).count(), { timeout: 10000 })
    .toBe(0);
  await expect(ofModule.first()).toBeVisible({ timeout: 10000 });
  const cardId =
    (await page.locator(`article.v7-card[data-card-id="${wantedId}"]`).count()) > 0
      ? wantedId
      : ((await ofModule.first().getAttribute('data-card-id')) as string);
  const card = page.locator(`article.v7-card[data-card-id="${cardId}"]`);
  await expect(card).toHaveCount(1, { timeout: 10000 });
  await page.evaluate((id) => {
    const feed = document.querySelector('.v7-vfeed') as HTMLElement;
    const el = document.querySelector(`article.v7-card[data-card-id="${id}"]`) as HTMLElement;
    feed.style.scrollSnapType = 'none';
    feed.scrollTop = el.offsetTop;
    feed.style.scrollSnapType = '';
  }, cardId);
  await page.waitForTimeout(500);
  const top = await card.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(top).toBe(0);
  return card;
}

/**
 * A real finger drag through Chromium's touch input: the browser itself
 * scrolls, exactly as on a phone. Returns how far the feed and the slide row
 * had moved while the finger was still down (the card follows the finger).
 *
 * Headless Chromium only finishes a touch scroll (and snaps) when the next
 * touch starts, so a touch that starts and is cancelled in the title area
 * (no click) follows each drag.
 */
async function fingerDrag(page: Page, x: number, y: number, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  let t = Date.now() / 1000;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', px: number, py: number) => {
    t += 0.016;
    return cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: px, y: py }],
      timestamp: t,
    });
  };
  const steps = 12;
  await send('touchStart', x, y);
  for (let i = 1; i <= steps; i++) await send('touchMove', x + (dx * i) / steps, y + (dy * i) / steps);
  const mid = await page.evaluate(() => {
    const feed = document.querySelector('.v7-vfeed') as HTMLElement;
    const rows = Array.from(document.querySelectorAll('.v7-hrow')) as HTMLElement[];
    return { top: feed.scrollTop, lefts: rows.map((r) => r.scrollLeft) };
  });
  await send('touchEnd', x + dx, y + dy);
  await page.waitForTimeout(150);
  await send('touchStart', 200, 20);
  await send('touchCancel', 200, 20);
  await cdp.detach();
  await page.waitForTimeout(900);
  return mid;
}

/** Bring the nth card of the Feed to the top of the list (snap switched off for the jump). */
async function bringNthCardToTop(page: Page, n: number) {
  await page.evaluate((i) => {
    const feed = document.querySelector('.v7-vfeed') as HTMLElement;
    const el = document.querySelectorAll('article.v7-card')[i] as HTMLElement;
    feed.style.scrollSnapType = 'none';
    feed.scrollTop = el.offsetTop;
    feed.style.scrollSnapType = '';
  }, n);
  await page.waitForTimeout(400);
}

/** ♡ the first `count` cards of the Feed (Mix). */
async function saveCards(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await bringNthCardToTop(page, i);
    const card = page.locator('article.v7-card').nth(i);
    await card.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(card.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();
  }
}

const tabButton = (page: Page, name: 'Feed' | 'Favorites' | 'Ask' | 'Me') =>
  page.getByRole('button', { name: `${name} tab` });

/** Answer the Ask box's AI call with one reply and one learned line (later routes win over the beforeEach one). */
async function fakeAskReply(page: Page) {
  await page.route('**/.netlify/functions/ai', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { task?: string };
    if (body.task !== 'tell_app') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
    }
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
  });
}

/** Open Ask, send one message, wait for the faked reply and its learned chip. */
async function askAndGetReply(page: Page) {
  await fakeAskReply(page);
  await tabButton(page, 'Ask').click();
  await expect(page.getByTestId('ask-screen')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tell the app' }).fill('Show me more about money please.');
  await page.getByRole('button', { name: 'Send' }).click();
  const thread = page.getByTestId('ask-thread');
  await expect(thread).toContainText('Got it. You will see more about Money.', { timeout: 10000 });
  await expect(thread).toContainText('Learned:');
  return thread;
}

/** The Know it button of a card must be a real, reachable 44 px target. */
async function expectKnowItBigEnough(card: Locator) {
  const btn = card.getByRole('button', { name: 'Know it' });
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(43.5);
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
}

test.describe('v7 Night glass feed', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('speak.firstRun.v3', 'true');
    });
    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.v7-feed')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    // Fonts in, so the pictures are stable.
    await page.evaluate(() => document.fonts.ready);
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  const MODULE_SHOTS = [
    { chip: 'Words', id: 'v7-words-01', name: 'words', alt: '1-words' },
    { chip: 'Small talk', id: 'v7-talk-01', name: 'small-talk', alt: '2-small-talk' },
    { chip: 'Say it better', id: 'v7-better-02', name: 'say-it-better', alt: '3-say-it-better' },
    { chip: 'Office phrases', id: 'v7-phrases-01', name: 'office-phrases' },
    { chip: 'Stories', id: 'v7-stories-01', name: 'stories' },
  ] as const;

  for (const m of MODULE_SHOTS) {
    test(`${m.chip} card`, async ({ page }) => {
      const card = await showCard(page, m.chip, m.id);
      expect(await card.locator('.v7-rail-btn').count()).toBeGreaterThanOrEqual(5);
      await expectKnowItBigEnough(card);
      await noSidewaysScroll(page);
      await tapTargetsBigEnough(page, '.v5-shell');
      await page.screenshot({ path: shot(m.name) });
      if ('alt' in m) await page.screenshot({ path: shot(m.alt) });
    });
  }

  test('Know it card: topic label and the Know it button', async ({ page }) => {
    const card = await showCard(page, 'Words', 'v7-words-01');
    await expect(card.getByTestId('card-theme')).toBeVisible();
    await expect(card.getByTestId('card-theme')).not.toHaveText('');
    await expect(card).toHaveAttribute('data-level', /^[123]$/);
    await expectKnowItBigEnough(card);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('know-it') });
  });

  test('Ask tab, empty', async ({ page }) => {
    await tabButton(page, 'Ask').click();
    await expect(page.getByTestId('ask-screen')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tell the app' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask') });
    await page.screenshot({ path: shot('tabbar-ask') });
  });

  test('Ask tab with a faked reply and a learned chip', async ({ page }) => {
    await askAndGetReply(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask-reply') });
  });

  test('Me with an Ask line under "What the app learned from you"', async ({ page }) => {
    await askAndGetReply(page);
    await tabButton(page, 'Me').click();
    const item = page.getByTestId('me-learned-item').first();
    await expect(item).toBeVisible({ timeout: 10000 });
    await expect(item).toContainText(/money/i);
    await item.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await page.screenshot({ path: shot('me-learned-ask') });
  });

  test('Comment sheet', async ({ page }) => {
    const card = await showCard(page, 'Words', 'v7-words-01');
    await card.getByRole('button', { name: 'Thumbs down' }).click();
    const sheet = page.locator('.v7-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#v7-sheet-title')).toHaveText('What did you think?');
    await sheet.getByRole('button', { name: 'Too easy' }).click();
    await sheet.getByRole('textbox', { name: 'Comment' }).fill('Too basic. I already use this word daily.');
    await sheet.getByRole('button', { name: 'Send feedback' }).click();
    await expect(sheet.locator('.v7-sheet-gotit')).toContainText('Got it');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v7-sheet');
    await page.screenshot({ path: shot('sheet') });
    await page.screenshot({ path: shot('4-comment') });
  });

  test('Sunday review bar on a due ♡ card', async ({ page }) => {
    // A ♡ saved card whose review is due today, written straight into the phone's database.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const open = indexedDB.open('speak');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('savedReviews', 'readwrite');
            tx.objectStore('savedReviews').put({
              cardId: 'v7-words-03', module: 'words', savedAt: Date.now() - 3 * 86400000, step: 0, due: today, rights: 0,
            });
            tx.oncomplete = () => { open.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const card = await showCard(page, 'Words', 'v7-words-03');
    const bar = card.locator('.v7-review');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Sunday review');
    await expect(bar.getByRole('button', { name: 'Knew it' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Not yet' })).toBeVisible();
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('sunday-review') });
  });

  test('Backup row on Me', async ({ page }) => {
    await page.getByRole('button', { name: 'Me tab' }).click();
    const row = page.getByTestId('me-backup');
    await expect(row).toBeVisible({ timeout: 10000 });
    // Without Supabase keys: the one plain line; with keys (speak/.env): the sign-in form.
    await expect(row).toContainText(/Backup is not switched on yet|Back up your cards and progress/);
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await noSidewaysScroll(page);
    await page.screenshot({ path: shot('me-backup') });
  });

  test('Favorites with two ♡ cards', async ({ page }) => {
    await saveCards(page, 2);
    await tabButton(page, 'Favorites').click();
    const favs = page.locator('[data-testid="fav-card"]');
    await expect(favs).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator('section[aria-label="Favorites"] article.v7-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('favorites') });
    await page.screenshot({ path: shot('tabbar-favorites') });
  });

  test('Favorites with a module chip chosen', async ({ page }) => {
    await saveCards(page, 1);
    const mod = (await page.locator('article.v7-card').first().getAttribute('data-module')) as string;
    const labelOf: Record<string, string> = {
      words: 'Words',
      smalltalk: 'Small talk',
      better: 'Say it better',
      phrases: 'Office phrases',
      stories: 'Stories',
    };
    await tabButton(page, 'Favorites').click();
    await expect(page.getByTestId('fav-card')).toHaveCount(1, { timeout: 10000 });
    await page.locator('.v7-favorites .v7-chiprow button', { hasText: new RegExp(`^${labelOf[mod]}$`) }).click();
    await expect(page.locator('.v7-favorites .v7-chiprow button[aria-selected="true"]')).toHaveText(labelOf[mod]);
    await expect(page.getByTestId('fav-card')).toHaveCount(1);
    await page.waitForTimeout(500);
    await noSidewaysScroll(page);
    await page.screenshot({ path: shot('favorites-chip') });
  });

  test('Favorites with nothing saved', async ({ page }) => {
    await tabButton(page, 'Favorites').click();
    const empty = page.getByTestId('favorites-empty');
    await expect(empty).toContainText('Nothing here yet. Tap ♡ on a card in the Feed to keep it here.');
    await page.waitForTimeout(300);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('favorites-empty') });
  });

  test('Me home: stats, backup, nothing else', async ({ page }) => {
    await tabButton(page, 'Me').click();
    await expect(page.locator('.me-screen')).toBeVisible();
    await expect(page.getByTestId('stat-streak')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('stat-today')).toBeVisible();
    await expect(page.getByTestId('stat-words')).toBeVisible();
    await expect(page.getByTestId('me-backup')).toBeVisible();
    await expect(page.locator('button.me-gear')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('me-home') });
    await page.screenshot({ path: shot('tabbar-me') });
  });

  test('Me with "What the app learned from you"', async ({ page }) => {
    const card = await showCard(page, 'Words', 'v7-words-01');
    await card.getByRole('button', { name: 'Thumbs down' }).click();
    const sheet = page.locator('.v7-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Too easy' }).click();
    await sheet.getByRole('textbox', { name: 'Comment' }).fill('Too basic. I already use this word daily.');
    await sheet.getByRole('button', { name: 'Send feedback' }).click();
    await expect(sheet.locator('.v7-sheet-gotit')).toContainText('Got it');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await tabButton(page, 'Me').click();
    const item = page.getByTestId('me-learned-item').first();
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await page.screenshot({ path: shot('me-learned') });
  });

  test('Swipe: up moves the whole card and snaps; sideways moves slides, never the card', async ({ page }) => {
    const card = await showCard(page, 'Words', 'v7-words-01');
    const feed = page.locator('.v7-vfeed');
    const row = card.locator('.v7-hrow');
    const h = await feed.evaluate((el) => el.clientHeight);
    const w = await row.evaluate((el) => el.clientWidth);
    const startTop = await feed.evaluate((el) => el.scrollTop);
    const cardId = (await card.getAttribute('data-card-id')) as string;
    const rowIndex = await page.evaluate(
      (id) => Array.from(document.querySelectorAll('.v7-hrow')).findIndex((r) => r.closest(`[data-card-id="${id}"]`)),
      cardId,
    );

    // Sideways, past half: the slide follows the finger, then snaps to slide 2. Same card.
    let mid = await fingerDrag(page, 300, 420, -230, 0);
    expect(mid.lefts[rowIndex]).toBeGreaterThan(150);
    expect(mid.top).toBe(startTop);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(w);
    expect(await feed.evaluate((el) => el.scrollTop)).toBe(startTop);
    await expect(card.locator('.v7-dots i').nth(1)).toHaveClass(/is-on/);

    // A short sideways drag springs back to the same slide.
    await fingerDrag(page, 300, 420, -80, 0);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(w);

    // Back to slide 1.
    await fingerDrag(page, 60, 420, 230, 0);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await feed.evaluate((el) => el.scrollTop)).toBe(startTop);

    // A short drag up springs back: same card.
    mid = await fingerDrag(page, 180, 600, 0, -150);
    expect(mid.top - startTop).toBeGreaterThan(120);
    await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBe(startTop);

    // Up, past half: the whole card follows the finger 1:1, then snaps flush to the next card.
    mid = await fingerDrag(page, 180, 700, 0, -460);
    expect(mid.top - startTop).toBeGreaterThan(420);
    await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBe(startTop + h);
    const next = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('article.v7-card')) as HTMLElement[];
      return cards.find((c) => Math.abs(c.getBoundingClientRect().top) < 1)?.dataset.cardId ?? null;
    });
    expect(next).not.toBeNull();
    expect(next).not.toBe(cardId);

    // Down again: the same card comes back.
    await fingerDrag(page, 180, 150, 0, 460);
    await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBe(startTop);
  });
});

test.describe('v7 Night glass feed at 375x812', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('every module card and the sheet fit: no sideways scroll, buttons at least 44 px', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('speak.firstRun.v3', 'true');
    });
    await page.reload();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    let lastCard: Locator | undefined;
    for (const [label, id] of [
      ['Words', 'v7-words-01'],
      ['Small talk', 'v7-talk-01'],
      ['Say it better', 'v7-better-02'],
      ['Office phrases', 'v7-phrases-01'],
      ['Stories', 'v7-stories-01'],
    ]) {
      const card = await showCard(page, label, id);
      lastCard = card;
      await expectKnowItBigEnough(card);
      await noSidewaysScroll(page);
      await tapTargetsBigEnough(page, '.v5-shell');
      // Text and panels never run under the rail (the change chips sit below it on purpose).
      const heroRight = await card.locator('.v7-slide').first().evaluate((slide) => {
        const kids = (Array.from(slide.children) as HTMLElement[]).filter((k) => !k.classList.contains('v7-chips-row'));
        return Math.max(...kids.map((k) => k.getBoundingClientRect().right));
      });
      expect(heroRight).toBeLessThanOrEqual(375 - 54);
      // No slide of any card in this module runs past its room (a slide never scrolls by itself).
      const over = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.v7-slide')).flatMap((el) => {
          const body = el.querySelector('.v7-slide-body') as HTMLElement;
          const r = el.getBoundingClientRect();
          const room = r.bottom - parseFloat(getComputedStyle(el).paddingBottom);
          const extra = body.getBoundingClientRect().bottom - room;
          return extra > 2 ? [`${el.closest('article')?.getAttribute('data-card-id')}: ${Math.round(extra)}px`] : [];
        }),
      );
      expect(over).toEqual([]);
    }
    await lastCard!.getByRole('button', { name: 'Comment' }).click();
    await expect(page.locator('.v7-sheet')).toBeVisible();
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v7-sheet');
    expect(errors).toEqual([]);
  });

  test('tab bar is glass (blurred, floating, inside the screen) on Feed, Favorites, Ask and Me', async ({ page }) => {
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('speak.firstRun.v3', 'true');
    });
    await page.reload();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    for (const name of ['Feed', 'Favorites', 'Ask', 'Me'] as const) {
      await tabButton(page, name).click();
      const info = await page.locator('nav.v5-tabs').evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          blur: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || 'none',
          position: cs.position,
          inside: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.top > 0,
        };
      });
      expect(info.blur, name).toContain('blur');
      expect(info.position, name).toBe('absolute');
      expect(info.inside, name).toBe(true);
    }
  });

  test('Ask fits: no sideways scroll, buttons at least 44 px, the box clear of the tab bar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('speak.firstRun.v3', 'true');
    });
    await page.reload();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    await tabButton(page, 'Ask').click();
    await expect(page.getByTestId('ask-screen')).toBeVisible();
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    const box = await page.getByRole('textbox', { name: 'Tell the app' }).boundingBox();
    const bar = await page.locator('nav.v5-tabs').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y + 1);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(errors).toEqual([]);
  });

  test('Favorites and Me fit: no sideways scroll, buttons at least 44 px, content clear of the tab bar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('speak.firstRun.v3', 'true');
    });
    await page.reload();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });

    // Favorites: empty, then with one ♡ card.
    await tabButton(page, 'Favorites').click();
    await expect(page.getByTestId('favorites-empty')).toBeVisible({ timeout: 10000 });
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');

    await tabButton(page, 'Feed').click();
    await expect(page.locator('article.v7-card').first()).toBeVisible({ timeout: 15000 });
    await saveCards(page, 1);
    await tabButton(page, 'Favorites').click();
    await expect(page.getByTestId('fav-card')).toHaveCount(1, { timeout: 10000 });
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    const heroRight = await page.locator('.v7-favorites article.v7-card .v7-slide').first().evaluate((slide) => {
      const kids = (Array.from(slide.children) as HTMLElement[]).filter((k) => !k.classList.contains('v7-chips-row'));
      return Math.max(...kids.map((k) => k.getBoundingClientRect().right));
    });
    expect(heroRight).toBeLessThanOrEqual(375 - 54);

    // Me: scrolled to the bottom, the last panel ends above the floating tab bar.
    await tabButton(page, 'Me').click();
    await expect(page.locator('.me-screen')).toBeVisible();
    await expect(page.getByTestId('me-backup')).toBeVisible({ timeout: 10000 });
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    const clear = await page.evaluate(() => {
      const screen = document.querySelector('.me-screen') as HTMLElement;
      const scroller = [screen, ...Array.from(screen.querySelectorAll('*'))]
        .reverse()
        .find((el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) as
        | HTMLElement
        | undefined;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      const bar = document.querySelector('nav.v5-tabs') as HTMLElement;
      const kids = Array.from(screen.querySelectorAll('*')) as HTMLElement[];
      const lastBottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
      return { lastBottom, barTop: bar.getBoundingClientRect().top };
    });
    expect(clear.lastBottom).toBeLessThanOrEqual(clear.barTop + 1);
    expect(errors).toEqual([]);
  });
});
