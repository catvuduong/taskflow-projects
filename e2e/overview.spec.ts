import { test, expect } from '@playwright/test';

test('overview shows stat cards, the completion chart and an activity feed', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects\/\d+\/board$/);

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);

  await expect(page.getByTestId('stat-open')).toBeVisible();
  await expect(page.getByTestId('stat-done')).toBeVisible();
  await expect(page.getByRole('figure', { name: /Tasks completed per day/ })).toBeVisible();
  await expect(page.getByTestId('activity-item').first()).toBeVisible();
});
