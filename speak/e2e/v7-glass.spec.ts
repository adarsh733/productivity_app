import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v7 Night glass pictures: one card per module and the feedback sheet, shot at
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
      await expect(card.locator('.v7-rail-btn')).toHaveCount(5);
      await noSidewaysScroll(page);
      await tapTargetsBigEnough(page, '.v5-shell');
      await page.screenshot({ path: shot(m.name) });
      if ('alt' in m) await page.screenshot({ path: shot(m.alt) });
    });
  }

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
    // No Supabase keys in this build yet: the one plain line.
    await expect(row).toContainText('Backup is not switched on yet');
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await noSidewaysScroll(page);
    await page.screenshot({ path: shot('me-backup') });
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
});
