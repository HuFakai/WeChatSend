import { expect, test } from '@playwright/test';

test('登录页提供三种身份入口', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await expect(page.getByRole('button', { name: '邮箱', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '微信扫码', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '账号密码' }).click();
  await expect(page.getByLabel('账号')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await expect(page.getByRole('button', { name: /登录/ })).toBeEnabled();
});
