import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

// Step 2 pictures: Feed with the Stories row, a lesson card, a skill page.
// 375x812, AI calls mocked, pictures go to docs/redesign-v5/ for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-step2-${name}.png`);

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

test.describe('Step 2: lessons pictures', () => {
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

  test('Feed with the Stories row', async ({ page }) => {
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 15000 });
    const row = page.locator('.stories-row');
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row.locator('.story-ring')).toHaveCount(4);
    await expect(row.locator('.story-ring.is-today')).toHaveCount(1);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('feed-stories') });
  });

  test('A lesson card', async ({ page }) => {
    const ring = page.locator('.stories-row .story-ring.is-today');
    await expect(ring).toBeVisible({ timeout: 15000 });
    await ring.click();
    const overlay = page.locator('.lp-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-testid="lp-bar"]')).toHaveCount(5);
    await expect(overlay.locator('.teach-face')).toBeVisible();
    // Move to step 2 so the picture shows progress, not just the first card.
    await overlay.locator('button.lp-next').click();
    await expect(overlay.locator('.lp-count')).toHaveText('2 / 5');
    await expect(overlay.locator('.teach-face')).toBeVisible();
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.lp-overlay');
    await page.screenshot({ path: shot('lesson-card') });
  });

  test('A skill page', async ({ page }) => {
    await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
    await expect(page.locator('.ask-screen')).toBeVisible();
    await page.locator('.ask-tile[data-track="smalltalk"]').click();
    const sk = page.locator('.skill-page');
    await expect(sk).toBeVisible();
    await expect(sk.locator('.sk-title')).toBeVisible();
    await expect(sk.locator('.sk-level')).toHaveCount(5);
    await expect(sk.locator('.sk-level.is-open')).toHaveCount(1);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('skill-page') });
  });
});
