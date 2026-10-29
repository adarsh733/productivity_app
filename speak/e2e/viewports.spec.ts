import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568-SE', width: 320, height: 568 },
  { name: '375x812-Standard', width: 375, height: 812 },
  { name: '390x844-iPhone14', width: 390, height: 844 },
  { name: '430x932-Max', width: 430, height: 932 },
];

test.describe('Mobile Viewports Responsive & Release Hardening Gate', () => {
  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}) zero overflow, touch targets >=44px, zero console errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
      await page.reload();

      await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

      // 1. Verify Zero Horizontal Overflow across Feed
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // 2. Check tab buttons have accessible height/dimensions
      const tabs = page.locator('nav.v5-tabs button');
      expect(await tabs.count()).toBe(3);
      const tabCount = await tabs.count();
      for (let i = 0; i < tabCount; i++) {
        const box = await tabs.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }

      const overflows = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
        );

      // 3. Ask tab
      await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
      await expect(page.locator('.ask-screen')).toBeVisible();
      expect(await overflows()).toBe(false);

      // 4. Me tab
      await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
      await expect(page.locator('.me-screen')).toBeVisible();
      expect(await overflows()).toBe(false);

      // 5. The gear sheet (old Browse / Speak / You live behind it)
      await page.locator('button.me-gear').click();
      await expect(page.locator('.old-tools')).toBeVisible();
      expect(await overflows()).toBe(false);

      // 6. Verify zero console errors
      expect(consoleErrors).toEqual([]);
    });
  }
});
