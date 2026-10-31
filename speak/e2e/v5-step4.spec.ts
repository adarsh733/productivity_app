import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

// Step 4 pictures: a Try card before and after the reveal, a reshaped word
// card, a global-English Fix card. 375x812, AI calls mocked, pictures go to
// docs/redesign-v5/ for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-step4-${name}.png`);

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

/**
 * The feed picks cards at random, so to photograph one named card we remove
 * every other card from this test browser's own database, then go Ask -> Feed
 * so the feed reloads from the database. (Seeding only runs at app start, so
 * it does not put them back.) Only the throwaway test browser is touched.
 */
async function showOnlyCard(page: Page, cardId: string) {
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
    const count = await new Promise<number>((resolve) => {
      const r = db.transaction('cards').objectStore('cards').count();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return count;
  }, cardId);
  expect(kept).toBe(1);
  await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
  await expect(page.locator('.ask-screen')).toBeVisible();
  await page.locator('nav.v5-tabs button', { hasText: 'Feed' }).click();
  await expect(page.locator('.v5-feed')).toBeVisible();
  await expect(page.locator(`article[aria-label="Card: ${cardId}"]`)).toBeVisible({ timeout: 15000 });
}

test.describe('Step 4: card pictures', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    // No real AI or sync call may leave the machine.
    await page.route('**/.netlify/functions/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.v5-feed')).toBeVisible({ timeout: 15000 });
    // Let first-run seeding finish before the database is trimmed.
    await expect(page.locator('.card-frame')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('A Try card, before and after the reveal', async ({ page }) => {
    await showOnlyCard(page, 'try-smalltalk-monday-weekend');
    const face = page.locator('.try-face');
    await expect(face.locator('.try-prompt')).toContainText('How was your weekend');
    await expect(face.locator('button.try-reveal')).toBeVisible();
    // The great answer must not be in the page before the tap.
    await expect(page.locator('[data-testid="try-great"]')).toHaveCount(0);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('try-before') });

    await face.locator('button.try-reveal').click();
    const great = page.locator('[data-testid="try-great"]');
    await expect(great).toBeVisible();
    await expect(great).toContainText('Mysore');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('try-after') });
  });

  test('A reshaped word card', async ({ page }) => {
    await showOnlyCard(page, 'w-vague');
    const face = page.locator('article[aria-label="Card: w-vague"]');
    // Its parts come slide by slide; the picture line is on the last one.
    for (let i = 0; i < 4 && !(await face.getByText('blurry photo').isVisible()); i++) {
      await page.locator('.card-frame').click({ position: { x: 300, y: 200 } });
    }
    await expect(face).toContainText('blurry photo');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('word-reshaped') });
  });

  test('A global-English Fix card', async ({ page }) => {
    await showOnlyCard(page, 'gef-have-a-car');
    const face = page.locator('article[aria-label="Card: gef-have-a-car"]');
    await expect(face).toContainText('have a car');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('fix-global-english') });
  });
});
