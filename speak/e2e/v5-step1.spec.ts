import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

// Step 1 pictures: Feed (with a teach card), Ask, Me, and the gear sheet.
// 375x812, AI calls mocked, pictures go to docs/redesign-v5/ for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-step1-${name}.png`);

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

test.describe('Step 1: new shell pictures', () => {
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
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('Feed shows a teach card', async ({ page }) => {
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    // Walk forward until a teach card is on screen (the queue mixes card types).
    const teach = page.locator('.teach-face');
    for (let i = 0; i < 40 && !(await teach.isVisible().catch(() => false)); i++) {
      const next = page.locator('button.got-it').first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(250);
    }
    await expect(teach).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.teach-chip-kind')).toBeVisible();
    await expect(page.locator('.teach-chip-track')).toBeVisible();
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('feed') });
  });

  test('Ask tab', async ({ page }) => {
    await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
    await expect(page.locator('.ask-screen')).toBeVisible();
    await expect(page.locator('.ask-input')).toBeVisible();
    await expect(page.locator('.ask-tile')).toHaveCount(4);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('ask') });
  });

  test('Me tab', async ({ page }) => {
    await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
    await expect(page.locator('.me-screen')).toBeVisible();
    await expect(page.locator('.me-stat')).toHaveCount(3);
    await expect(page.locator('.me-row')).toHaveCount(5);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('me') });
  });

  test('Gear sheet opens the old tools', async ({ page }) => {
    await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
    await page.locator('button.me-gear').click();
    const sheet = page.locator('.old-tools');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.old-tools-item')).toHaveCount(3);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.old-tools');
    await page.screenshot({ path: shot('gear-sheet') });
  });
});
