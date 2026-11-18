import type { Page } from '@playwright/test'

export async function openScoreSettings(page: Page) {
  const loading = page.getByRole('button', { name: '后台加载', exact: true })
  if (await loading.isVisible()) await page.keyboard.press('Escape')
  const panel = page.getByRole('dialog', { name: '乐谱设置', exact: true })
  if (!await panel.isVisible()) await page.getByRole('button', { name: '乐谱设置', exact: true }).click()
}
