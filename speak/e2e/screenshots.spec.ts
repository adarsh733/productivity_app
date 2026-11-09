import { test } from '@playwright/test';

// Switched off 2026-11-08 (Adarsh, steps 1-3 answer 9A): this spec drives the
// old v4 screens and picture-card feed, which v7 replaced with the five module cards. The
// new feed is covered by flows.spec.ts and v7-glass.spec.ts (pictures in
// docs/redesign-v7/built-*.png). Kept for reference; delete or rewrite it if
// the old screens it covers come back.
test.skip(true, 'Old v5 feed picture test, switched off for v7 (answer 9A).');

const VIEWPORTS = [
  { name: '320x568-SE', width: 320, height: 568 },
  { name: '375x812-Standard', width: 375, height: 812 },
  { name: '390x844-iPhone14', width: 390, height: 844 },
  { name: '430x932-Max', width: 430, height: 932 },
];

test.describe('Viewport Responsive Screenshots Suite', () => {
  for (const vp of VIEWPORTS) {
    test(`Capture Feed and Browse at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
      await page.reload();

      await page.waitForSelector('.feed-screen');
      await page.screenshot({ path: `e2e/screenshots/feed-${vp.name}.png` });

      // Navigate to Browse
      await page.locator('button.tab:has-text("Browse")').click();
      await page.waitForSelector('.browse-screen');
      await page.screenshot({ path: `e2e/screenshots/browse-${vp.name}.png` });

      // Navigate to Speak
      await page.locator('button.tab:has-text("Speak")').click();
      await page.waitForSelector('.speak-screen');
      await page.screenshot({ path: `e2e/screenshots/speak-${vp.name}.png` });

      // Navigate to You
      await page.locator('button.tab:has-text("You")').click();
      await page.waitForSelector('.you-screen');
      await page.screenshot({ path: `e2e/screenshots/you-${vp.name}.png` });
    });
  }
});
