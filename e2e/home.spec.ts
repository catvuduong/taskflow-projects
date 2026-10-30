import { test, expect } from '@playwright/test';

test('home page shows api health', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('health')).toContainText('api ok');
});
