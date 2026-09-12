import { expect, test } from '@playwright/test';

const task = {
  id: 'task-1',
  title: '中秋客户问候',
  content: '祝您节日快乐',
  status: 'RUNNING',
  scheduledAt: '2026-09-12T08:00:00.000Z',
  createdAt: '2026-09-12T07:00:00.000Z',
  _count: { messages: 3 },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wechatsend_token', 'e2e-token'));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { username: 'tester', role: 'USER' } }));
  await page.route('**/api/v1/drafts', (route) => route.fulfill({ json: [] }));
});

test('任务列表展示分页结果并提交服务端搜索', async ({ page }) => {
  let requestedSearch = '';
  let requestedPage = 0;
  await page.route('**/api/v1/tasks/page?*', async (route) => {
    const url = new URL(route.request().url());
    requestedSearch = url.searchParams.get('search') ?? '';
    requestedPage = Number(url.searchParams.get('page'));
    await route.fulfill({ json: { items: [task], total: 21, page: requestedPage, pageSize: 20 } });
  });

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: '发送任务' })).toBeVisible();
  await expect(page.getByText('中秋客户问候')).toBeVisible();
  await expect(page.getByText('第 1 / 2 页')).toBeVisible();

  await page.getByRole('button', { name: '下一页' }).click();
  await expect.poll(() => requestedPage).toBe(2);
  await expect(page.getByText('第 2 / 2 页')).toBeVisible();

  await page.getByPlaceholder('搜索标题或消息内容').fill('问候');
  await page.getByRole('button', { name: '搜索' }).click();
  await expect.poll(() => requestedSearch).toBe('问候');
  await expect.poll(() => requestedPage).toBe(1);
});
