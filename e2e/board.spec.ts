import { test, expect, type Page } from '@playwright/test';

async function openBoard(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects\/\d+\/board$/);
  await expect(page.getByTestId('board-column-backlog')).toBeVisible();
}

function uniqueTitle(label: string) {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createTask(page: Page, column: string, title: string) {
  const input = page.getByTestId(`board-column-${column}`).getByRole('textbox', { name: /^New task in/ });
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByTestId(`board-column-${column}`).getByTestId('task-card').filter({ hasText: title })).toBeVisible();
}

test('creates a task and moves it to another column with the move-to menu', async ({ page }) => {
  await openBoard(page);
  const title = uniqueTitle('Move me');
  await createTask(page, 'backlog', title);

  const card = page.getByTestId('board-column-backlog').getByTestId('task-card').filter({ hasText: title });
  await card.getByTestId('move-to').click();
  await page.getByRole('menu', { name: 'Move to column' }).getByRole('menuitem', { name: 'In progress' }).click();

  await expect(page.getByTestId('board-column-in_progress').getByTestId('task-card').filter({ hasText: title })).toBeVisible();
  await expect(page.getByTestId('board-column-backlog').getByTestId('task-card').filter({ hasText: title })).toHaveCount(0);
});

test('the move-to menu works from the keyboard', async ({ page }) => {
  await openBoard(page);
  const title = uniqueTitle('Keyboard move');
  await createTask(page, 'backlog', title);

  const card = page.getByTestId('board-column-backlog').getByTestId('task-card').filter({ hasText: title });
  await card.getByTestId('move-to').focus();
  await page.keyboard.press('Enter');
  // Backlog is the current column and is skipped, so the first enabled item is To do.
  await expect(page.getByRole('menuitem', { name: 'To do' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('board-column-todo').getByTestId('task-card').filter({ hasText: title })).toBeVisible();
});

test('opening a task shows the side panel, and a comment appears in it', async ({ page }) => {
  await openBoard(page);
  const title = uniqueTitle('Panel task');
  await createTask(page, 'todo', title);

  await page.getByTestId('board-column-todo').getByRole('button', { name: title }).click();
  const panel = page.getByTestId('task-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Title')).toHaveValue(title);

  await panel.getByRole('textbox', { name: 'Comment' }).fill('Picked this up');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(panel.getByText('Picked this up')).toBeVisible();
});

test('filters narrow the board by priority', async ({ page }) => {
  await openBoard(page);
  await page.getByLabel('Priority').selectOption('urgent');
  for (const status of ['backlog', 'todo', 'in_progress', 'review', 'done']) {
    for (const card of await page.getByTestId(`board-column-${status}`).getByTestId('task-card').all()) {
      await expect(card.getByText('Urgent', { exact: true })).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('the theme toggle switches between light and dark', async ({ page }) => {
  await openBoard(page);
  const root = page.locator('html');
  await page.getByRole('button', { name: 'Switch light and dark theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch light and dark theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
});
