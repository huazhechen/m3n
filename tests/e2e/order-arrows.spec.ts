import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'

test('itinerary arrows are vector paths on tablet screens and PDF exports', async ({ page }, info) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/editor')
  await page.getByRole('textbox', { name: 'M3N source' }).fill('{title=演奏顺序验证}{4/4}{order=A,B,A,C}\n===A\nN: 1 2 3 4 |\n===B\nN: 5 6 7 1u |\n===C\nN: 1 2 3 4 |||')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.score-paper [data-m3n-role="order-arrow"]')).toHaveCount(3)
  expect(await page.locator('.score-paper').innerText()).not.toContain('→')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const preview = page.locator('.export-dialog')
  await expect(preview.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  await expect(preview.locator('[data-m3n-role="order-arrow"]')).toHaveCount(3)
  const downloading = page.waitForEvent('download')
  await preview.getByRole('button', { name: 'PDF', exact: true }).click()
  const path = info.outputPath('order-arrows.pdf')
  await (await downloading).saveAs(path)
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s/g, '')
  expect(text).toContain('演奏顺序：ABAC')
  expect(text).not.toContain('→')
  expect(text).not.toContain('於')
})
