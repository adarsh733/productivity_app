import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'node:path';

// Switched off 2026-11-08 (Adarsh, steps 1-3 answer 9A): this spec drives the
// old v5 picture-card feed, which v7 replaced with the five module cards. The
// new feed is covered by flows.spec.ts and v7-glass.spec.ts (pictures in
// docs/redesign-v7/built-*.png). Kept for reference; delete or rewrite it if
// the old screens it covers come back.
test.skip(true, 'Old v5 feed picture test, switched off for v7 (answer 9A).');

// Learning pictures (2026-10-29): he tells Ask a wish → "What I'll change",
// then Me shows "What the app knows about me". AI calls mocked; 375x812.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-learning-${name}.png`);

test.use({ viewport: { width: 375, height: 812 } });

const WISH = {
  askKind: 'preference',
  answer: 'Got it: more small talk about cricket, a little easier, and I will never show "revert back" again.',
  preference: {
    note: 'More cricket small talk, a bit easier, never "revert back"',
    topics: ['cricket'],
    moreOf: ['smalltalk'],
    easier: ['smalltalk'],
    avoid: ['revert back'],
  },
  topics: ['cricket'],
  cards: [],
};

async function mockAi(page: Page) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      task?: string;
      payload?: { items?: Array<{ key: string }> };
    };
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'gemini', data }) });
    if (body.task === 'answer_ask') return ok(WISH);
    if (body.task === 'verify_batch') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'groq',
          data: { results: (body.payload?.items ?? []).map((i) => ({ key: i.key, ok: true, reason: 'pass' })) },
        }),
      });
    }
    return ok({});
  });
}

test.describe('Learning: wishes and memory pictures', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await mockAi(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('A wish in Ask, then Me remembers it', async ({ page }) => {
    await page.locator('nav.v5-tabs button', { hasText: 'Ask' }).click();
    await page.locator('.ask-input').fill('Give me more cricket small talk, a bit easier. And never show "revert back".');
    await page.locator('button.ask-send').click();
    const answer = page.locator('[data-testid="ask-answer"]');
    await expect(answer).toBeVisible({ timeout: 15000 });
    await expect(answer.locator('[data-testid="ask-changes"]')).toContainText('cricket');
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('ask-wish') });

    await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
    const knows = page.locator('[data-testid="me-knows"]');
    await expect(knows.locator('[data-testid="me-wish"]').first()).toContainText('cricket');
    await knows.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(sideways).toBe(false);
    await page.screenshot({ path: shot('me-knows') });
  });
});
