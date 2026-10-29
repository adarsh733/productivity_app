import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'node:path';

// Step 5 pictures: the evening chat question, the feedback with measured
// numbers, the finished chat, and Me with the story bank filled. A fake
// microphone feeds the real recorder; transcribe and coach_chat are mocked.
// 375x812, pictures go to docs/redesign-v5/ for Adarsh.
const OUT = path.resolve(process.cwd(), '..', 'docs', 'redesign-v5');
const shot = (name: string) => path.join(OUT, `built-step5-${name}.png`);

test.use({
  viewport: { width: 375, height: 812 },
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

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
    root.querySelectorAll('button, a[href], input, textarea').forEach((el) => {
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

// What the mocked speech-to-text "heard": 29 words over about 12 seconds.
const SAID =
  'Today I fixed a small bug in the report, but it took longer than I planned, so I stayed late and I send the file kindly to my manager.';
const WORDS = SAID.split(/\s+/).map((word, i) => ({
  word,
  start: Math.round(i * 0.42 * 100) / 100,
  end: Math.round((i * 0.42 + 0.36) * 100) / 100,
}));

const COACH_ANSWER = {
  good: 'You told it in order and used "but" and "so" to link the parts. That made it easy to follow.',
  fixes: [
    { text: 'Say "I sent the file" because it already happened.', lesson: 'ls-clearly-1-2' },
    { text: 'Lead with the result: "I fixed the report bug, but it took longer than planned."' },
  ],
  better:
    'Today I fixed a small bug in the report. It took longer than I planned, so I stayed late and sent the file to my manager.',
  slip: { wrong: 'I send the file', right: 'I sent the file' },
};

async function mockNetwork(page: Page) {
  await page.route('**/.netlify/functions/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/functions/transcribe')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { text: SAID, words: WORDS, durationSec: 10.6 } }),
      });
    }
    if (url.includes('/functions/ai')) {
      const body = JSON.parse(route.request().postData() ?? '{}') as { task?: string };
      if (body.task === 'coach_chat') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, provider: 'anthropic', data: COACH_ANSWER }),
        });
      }
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });
}

/** Make his loudness baseline trusted so the loudness tile can show a measured value. */
async function calibrate(page: Page) {
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('speak');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result);
      dbReq.onerror = () => reject(dbReq.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('profile', 'readwrite');
      const store = tx.objectStore('profile');
      const get = store.get('me');
      get.onsuccess = () => {
        const row = get.result ?? { id: 'me', createdAt: Date.now(), userId: null };
        store.put({ ...row, baselineDb: -30, calibrationSamples: 7 });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

async function openChat(page: Page) {
  await page.locator('nav.v5-tabs button', { hasText: 'Me' }).click();
  await expect(page.locator('.me-screen')).toBeVisible();
  await page.locator('.me-row[data-row="chats"]').click();
  await page.getByRole('button', { name: /Start tonight/ }).click();
  await expect(page.locator('.v5-chat')).toBeVisible();
  await expect(page.locator('[data-testid="chat-question"]')).toBeVisible();
}

/** Tap and answer, listen for a moment, stop, and wait for the coach. */
async function answerByVoice(page: Page) {
  await page.getByRole('button', { name: /Tap and answer/ }).click();
  await expect(page.locator('.chat-recording')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /I.m done/ }).click();
  await expect(page.locator('[data-testid="chat-good"]')).toBeVisible({ timeout: 15000 });
}

test.describe('Step 5: evening chat and story bank pictures', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    // No real AI, speech-to-text or sync call may leave the machine.
    await mockNetwork(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('speak.firstRun.v3', 'true'));
    await page.reload();
    await expect(page.locator('.v5-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.card-frame')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    await calibrate(page);
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('A chat question', async ({ page }) => {
    await openChat(page);
    await expect(page.locator('[data-testid="chat-question"]')).toContainText('How was your day');
    await expect(page.getByRole('button', { name: /Tap and answer/ })).toBeVisible();
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('chat-question') });
  });

  test('Feedback with measured numbers', async ({ page }) => {
    await openChat(page);
    await answerByVoice(page);
    // Numbers come from the word times and the microphone, not from the coach.
    await expect(page.locator('[data-testid="tile-wpm"] .chat-tile-num')).toContainText('wpm');
    await expect(page.locator('[data-testid="tile-length"] .chat-tile-num')).toHaveText(
      String(SAID.split(/\s+/).length),
    );
    await expect(page.locator('[data-testid="chat-better"]')).toContainText('Try it like this');
    await expect(page.locator('[data-testid="chat-slip"]')).toBeVisible();
    await page.locator('.chat-tiles').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('chat-feedback') });
  });

  test('Finished chat, then Me with the story bank', async ({ page }) => {
    await openChat(page);
    await answerByVoice(page);
    await page.getByRole('button', { name: 'Next question' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    const saved = page.locator('[data-testid="chat-saved"]');
    await expect(saved).toBeVisible({ timeout: 15000 });
    await expect(saved).toContainText('fixed a small bug');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('chat-done') });

    // Back to the chats list, then Me, where the story bank row now has a moment.
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Back to Me/ }).click();
    const me = page.locator('.me-screen');
    const row = me.locator('.me-row[data-row="stories"]');
    await expect(row.locator('.me-row-sub')).toContainText('1 moment', { timeout: 15000 });
    await expect(me.locator('.me-row[data-row="chats"] .me-row-sub')).toContainText('1 chat');
    await page.waitForTimeout(400);
    await noSidewaysScroll(page);
    await tapTargetsBigEnough(page, '.v5-shell');
    await page.screenshot({ path: shot('me-story-bank') });
  });
});
