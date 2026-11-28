import { expect, test } from '@playwright/test'
import { waitForEditor } from './editor-state'

const source = '{title=本地测试}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('browse saves locally and edit reuses the score id', async ({ page }) => {
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page).toHaveURL(/\/scores\/local-/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/editor\/local-/)
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  const editorUrl = page.url()
  const revised = source.replace('本地测试', '本地测试修订')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill(revised)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL(editorUrl.replace('/editor/', '/scores/'))
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('m3n:local-scores') ?? '[]'))
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ source: revised })
})

test('recovers the latest draft after reload without file actions or a save notice', async ({ page }) => {
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill(source)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('m3n:draft:new'))).not.toBeNull()
  await page.reload()
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
  await expect(page.getByRole('status', { name: '草稿保存状态' })).toHaveCount(0)
  await expect(page.locator('.editor-header-right button')).toHaveText(['还原原谱', '格式化', '保存', '分享'])
  await expect(page.getByLabel('导入 M3N 文件')).toHaveCount(0)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const name of ['还原原谱', '格式化', '保存', '分享']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      await expect(button.locator('svg')).toBeVisible()
      if (width <= 720) {
        await expect(button.locator('span')).not.toBeVisible()
        const expectedSize = await page.evaluate(() => Math.min(36, Math.max(24, Math.min(innerWidth, innerHeight) / 16)))
        expect((await button.boundingBox())!.width).toBeCloseTo(expectedSize, 1)
      } else await expect(button.locator('span')).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('keeps the editor open with the source when local storage rejects a save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'm3n:local-scores') throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('alert')).toContainText('本地保存失败')
  await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByLabel('M3N source')).toHaveText(source, { useInnerText: true })
})
