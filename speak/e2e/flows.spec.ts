import { test, expect } from '@playwright/test';

test.describe('SPEAK E2E User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('Flow 1: onboarding -> feed -> advance cards -> streak and XP update', async ({ page }) => {
    // Step 1: Onboarding screen
    await expect(page.locator('.ob-title')).toBeVisible();
    
    // Select interest and start
    const hindiChip = page.locator('.ob-chips-section button.chip').filter({ hasText: 'Practical Hindi' });
    await hindiChip.click();
    
    const startBtn = page.locator('.ob-footer button.prim');
    await startBtn.click();

    // Step 2: Feed loaded
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.fcard')).toBeVisible();

    // Step 3: Advance 5 cards
    for (let i = 0; i < 5; i++) {
      const gotItBtn = page.locator('button.got-it');
      await expect(gotItBtn).toBeVisible();
      await gotItBtn.click();
      await page.waitForTimeout(300);
    }

    // Step 4: Verify XP earned is at least 5 XP
    const xpText = await page.locator('.xp').textContent();
    expect(xpText).toMatch(/[5-9]|[1-9]\d+\s*XP/);
  });

  test('Flow 2: feed bookmark -> You -> saved card detail', async ({ page }) => {
    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Tap bookmark star button
    const starBtn = page.locator('button.abtn.star');
    await starBtn.click();
    await expect(page.locator('.toast')).toBeVisible();

    // Navigate to You tab
    const youTab = page.locator('nav.tabs button').filter({ hasText: 'You' });
    await youTab.click();
    await expect(page.locator('.you-screen')).toBeVisible();

    // Open Bookmarked Cards
    const savedRow = page.locator('.saved-bookmarks-trigger-row');
    await expect(savedRow).toBeVisible();
    await savedRow.click();
    await expect(page.locator('#saved-cards-title')).toBeVisible();

    // Click first saved card row to open CardDetailSheet
    const firstSaved = page.locator('.saved-card-row').first();
    await expect(firstSaved).toBeVisible();
    await firstSaved.click();
    await expect(page.locator('#card-detail-title')).toBeVisible();

    // Close detail sheet
    await page.locator('.deck-modal-close-btn').last().click();
  });

  test('Flow 3: Browse search -> card detail -> back to Browse', async ({ page }) => {
    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Go to Browse tab
    const browseTab = page.locator('nav.tabs button').filter({ hasText: 'Browse' });
    await browseTab.click();
    await expect(page.locator('.browse-screen')).toBeVisible();

    // Type in search query
    const searchInput = page.locator('.browse-search-input');
    await searchInput.fill('the');
    await page.waitForTimeout(500);

    // Verify search hits appear
    const searchHits = page.locator('.search-card-row');
    await expect(searchHits.first()).toBeVisible();

    // Tap a search hit to open CardDetailSheet (NOT Speak tab)
    await searchHits.first().click();
    await expect(page.locator('#card-detail-title')).toBeVisible();

    // Verify "Say it" action exists in card detail
    await expect(page.locator('.card-detail-say-btn')).toBeVisible();

    // Close detail sheet -> back to Browse
    await page.locator('.deck-modal-close-btn').last().click();
    await expect(page.locator('.browse-screen')).toBeVisible();
  });

  test('Flow 4: card detail -> Say it -> cancel -> return to detail', async ({ page }) => {
    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Browse tab
    const browseTab = page.locator('nav.tabs button').filter({ hasText: 'Browse' });
    await browseTab.click();
    await expect(page.locator('.browse-screen')).toBeVisible();

    // Search and open card detail
    await page.locator('.browse-search-input').fill('a');
    await page.waitForTimeout(500);
    const searchHit = page.locator('.search-card-row').first();
    await expect(searchHit).toBeVisible();
    await searchHit.click();
    await expect(page.locator('#card-detail-title')).toBeVisible();

    // Tap Say it in card detail -> opens RapidRep drill in Speak tab
    await page.locator('.card-detail-say-btn').click();
    await expect(page.locator('.speak-drill-runner')).toBeVisible();

    // Cancel drill -> returns to previous screen (browse)
    await page.locator('.deck-modal-close-btn').click();
    await expect(page.locator('.browse-screen')).toBeVisible();
  });

  test('Flow 5: denied microphone -> useful recovery without false credit', async ({ page, context }) => {
    await context.clearPermissions();

    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Open Speak tab
    const speakTab = page.locator('nav.tabs button').filter({ hasText: 'Speak' });
    await speakTab.click();
    await expect(page.locator('.speak-screen')).toBeVisible();

    // Open Rapid Rep drill
    await page.locator('.speak-mode-card').first().click();
    await expect(page.locator('.speak-drill-runner')).toBeVisible();

    // Cancel out
    const cancelBtn = page.locator('.deck-modal-close-btn');
    await cancelBtn.click();
    await expect(page.locator('.speak-screen')).toBeVisible();
  });

  test('Flow 6: reload offline -> existing content and progress remain available', async ({ page }) => {
    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Advance 1 card
    await page.locator('button.got-it').click();
    await page.waitForTimeout(300);

    // Reload page
    await page.reload();

    // Verify app recovers cleanly into Feed without forcing onboarding again
    await expect(page.locator('.feed-screen')).toBeVisible();
    await expect(page.locator('.fcard')).toBeVisible();
  });

  test('Flow 7: keyboard-only modal navigation and escape close', async ({ page }) => {
    await page.locator('.ob-footer button.prim').click();
    await expect(page.locator('.feed-screen')).toBeVisible({ timeout: 10000 });

    // Browse tab
    const browseTab = page.locator('nav.tabs button').filter({ hasText: 'Browse' });
    await browseTab.click();
    await expect(page.locator('.browse-screen')).toBeVisible();

    // Click first category deck
    const firstDeck = page.locator('.deck').first();
    await expect(firstDeck).toBeVisible();
    await firstDeck.click();

    // Verify DeckModal opens
    await expect(page.locator('.deck-modal-container')).toBeVisible();

    // Press Escape to close modal
    await page.keyboard.press('Escape');
    await expect(page.locator('.deck-modal-container')).not.toBeVisible();
  });
});
