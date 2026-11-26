import type { Page } from '@playwright/test'
import { waitForEditor } from './editor-state'

export async function openScoreSettings(page: Page) {
  const loading = page.getByRole('button', { name: '后台加载', exact: true })
  if (await loading.isVisible()) await page.keyboard.press('Escape')
  await waitForEditor(page, true)
  const panel = page.getByRole('dialog', { name: '乐谱设置', exact: true })
  if (!await panel.isVisible()) await page.getByRole('button', { name: '乐谱设置', exact: true }).click()
}

export async function selectNotationMode(page: Page, label: '首调' | '固定调' | '五线谱') {
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^选择记谱方式，当前/ }).click()
  await page.getByRole('dialog', { name: '选择记谱方式', exact: true }).getByRole('button', { name: label, exact: true }).click()
}
