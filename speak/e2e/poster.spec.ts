import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

// The full-size picture cards: swipes, games, and pictures for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v6');
const shot = (name: string) => path.join(OUT, `built-${name}.png`);

test.use({ viewport: { width: 375, height: 812 } });
// The dev server can be slow on a cold start.
test.setTimeout(150000);

async function start(page: Page) {
  await page.route('**/.netlify/functions/**', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/', { timeout: 120000 });
  await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
  await page.reload();
  await expect(page.locator('.poster')).toBeVisible({ timeout: 20000 });
}

/** Keep one card in the database, so the feed shows exactly that one. */
async function showOnly(page: Page, cardId: string) {
  await page.evaluate(async (keep) => {
    const req = indexedDB.open('speak');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, cardId);
  // Not a reload: that would seed the cards back. Leaving the tab reloads the feed.
  await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
  await page.locator('nav.v5-tabs button', { hasText: 'Feed' }).click();
  await expect(page.locator(`article[aria-label="Card: ${cardId}"]`)).toBeVisible({ timeout: 20000 });
}

async function swipe(page: Page, dx: number, dy: number) {
  const box = await page.locator('.card-frame').boundingBox();
  if (!box) throw new Error('no card on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

const dotOn = (page: Page) =>
  page.locator('.poster-dot').evaluateAll((dots) => dots.findIndex((d) => d.classList.contains('is-on')));

/** Every word sits inside its box, and nothing pokes off the phone. */
async function fits(page: Page) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth) out.push('page scrolls sideways');
    document.querySelectorAll('.poster-h, .poster-strip, .poster-bubble, .poster-option, .poster-chip').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) out.push(`${el.className} off the side`);
    });
    return out;
  });
  expect(problems).toEqual([]);
}

test.describe('Picture cards', () => {
  test('the top circles and tab bar: one word each, three equal tabs, card to both edges', async ({ page }) => {
    await start(page);
    await expect(page.locator('.story-ring-name')).toHaveCount(4, { timeout: 20000 });
    const names = await page.locator('.story-ring-name').allTextContents();
    expect(names.sort()).toEqual(['Clear', 'Stories', 'Talk', 'Words']);
    await expect(page.locator('.story-ring-inner')).toHaveCount(4);

    const tabs = await page.locator('nav.v5-tabs button').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().width)),
    );
    expect(new Set(tabs).size).toBe(1);
    await expect(page.locator('.tab-ask-btn')).toHaveCount(0);

    const card = await page.locator('.poster').boundingBox();
    expect(card?.x).toBe(0);
    expect(card?.width).toBe(375);
    expect(card?.height).toBeGreaterThan(500);
    await fits(page);
    await page.screenshot({ path: shot('feed') });
  });

  test('pictures load, and sideways moves through slides while up moves to the next card', async ({ page }) => {
    await start(page);
    await showOnly(page, 'ls-stories-1-1-1');
    await expect
      .poll(() => page.locator('.poster-art').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    expect(await dotOn(page)).toBe(0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('slide-idea') });

    // Tap: right goes on, left goes back.
    await page.locator('.card-frame').click({ position: { x: 300, y: 150 } });
    await expect.poll(() => dotOn(page)).toBe(1);
    await page.locator('.card-frame').click({ position: { x: 20, y: 150 } });
    await expect.poll(() => dotOn(page)).toBe(0);
    // Swipe: same again.
    await swipe(page, -150, 0);
    await expect.poll(() => dotOn(page)).toBe(1);
    await swipe(page, 150, 0);
    await expect.poll(() => dotOn(page)).toBe(0);
  });

  test('tap-the-weak-word: wrong words shake, the weak one swaps in the better word', async ({ page }) => {
    await start(page);
    await showOnly(page, 'sw-very-big');
    await expect(page.locator('.poster-rail')).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('game-tap-word') });
    await page.locator('.poster-chip', { hasText: /^We$/ }).click();
    await expect(page.getByText('Tap the weak words')).toBeVisible();
    await page.locator('.poster-chip', { hasText: 'very big' }).click();
    await expect(page.getByText('Much better')).toBeVisible();
    await expect(page.locator('.poster-chip.is-right')).toHaveText('huge');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('game-tap-word-done') });
    await fits(page);
  });

  test('pick-the-better-reply: one answer turns green and the reason shows', async ({ page }) => {
    await start(page);
    await showOnly(page, 'ls-smalltalk-1-1-5');
    await page.locator('.card-frame').click({ position: { x: 300, y: 150 } });
    await expect(page.locator('.poster-option')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'How was your day?' })).toBeVisible();
    // A tap elsewhere does nothing until he picks.
    await page.locator('.card-frame').click({ position: { x: 300, y: 150 } });
    await expect(page.locator('.poster-option')).toHaveCount(2);
    await page.locator('.poster-option', { hasText: 'Fine.' }).click();
    await expect(page.locator('.poster-option.is-right')).toContainText('login bug');
    await expect(page.locator('.poster-game-result')).toContainText('Not quite');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('game-pick') });
    await fits(page);
  });

  test('a chat example shows as bubbles, and the last slide has Again and Got it', async ({ page }) => {
    await start(page);
    await showOnly(page, 'ls-smalltalk-1-1-1');
    await page.locator('.card-frame').click({ position: { x: 300, y: 150 } });
    await expect(page.locator('.poster-bubble')).toHaveCount(3);
    await expect(page.locator('.poster-bubble.is-mine')).toHaveCount(1);
    await fits(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('slide-chat') });

    for (let i = 0; i < 4 && !(await page.getByText('Got it ✓').isVisible()); i++) {
      await page.locator('.card-frame').click({ position: { x: 300, y: 150 } });
    }
    await expect(page.getByText('Again ↻')).toBeVisible();
    await expect(page.getByText('Got it ✓')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('slide-try') });
  });

  test('a lesson is full screen with one idea, and swiping moves it on', async ({ page }) => {
    await start(page);
    await page.locator('.story-ring[data-track="stories"]').click();
    const overlay = page.locator('.lp-overlay');
    await expect(overlay.locator('[data-testid="lp-bar"]')).toHaveCount(5);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('lesson') });

    const first = await overlay.locator('.poster-slide').innerText();
    await page.mouse.move(320, 400);
    await page.mouse.down();
    await page.mouse.move(120, 400, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => overlay.locator('.poster-slide').innerText()).not.toBe(first);
    await fits(page);
  });

  test('short phone: text stays clear of the buttons, even on a long chat', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await start(page);
    await showOnly(page, 'ls-smalltalk-1-1-1');
    await page.locator('.card-frame').click({ position: { x: 300, y: 100 } });
    await expect(page.locator('.poster-bubble')).toHaveCount(3);
    await page.waitForTimeout(300);
    const clash = await page.evaluate(() => {
      const rail = document.querySelector('.poster-rail')?.getBoundingClientRect();
      if (!rail) return ['no buttons'];
      return [...document.querySelectorAll('.poster-bubble')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.left < rail.right && r.right > rail.left && r.top < rail.bottom && r.bottom > rail.top;
        })
        .map((b) => b.textContent ?? '');
    });
    expect(clash).toEqual([]);
    await fits(page);
    await page.screenshot({ path: shot('short-phone') });
  });

  test('Ask: the send button sits inside the box, four picture tiles', async ({ page }) => {
    await start(page);
    await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
    const box = await page.locator('.ask-box').boundingBox();
    const send = await page.locator('button.ask-send').boundingBox();
    expect(send && box && send.x + send.width <= box.x + box.width).toBe(true);
    await expect(page.locator('.ask-tile-art')).toHaveCount(4);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('ask') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
