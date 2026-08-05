import { expect, test } from '@playwright/test'

const source = '{title=Browser Test}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('edits, renders, and maps a score note back to source', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  await editor.fill(source)

  const firstNote = page.locator('.score-paper [id^="m3n-e-"]').first()
  await expect(firstNote).toBeVisible({ timeout: 30_000 })
  await firstNote.locator('use, path').first().click()
  await expect.poll(() => editor.evaluate((element) => ({
    start: (element as HTMLTextAreaElement).selectionStart,
    end: (element as HTMLTextAreaElement).selectionEnd,
  }))).not.toEqual({ start: 0, end: 0 })
})

test('exposes playback and opens an export preview', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  const play = page.getByRole('button', { name: '播放' })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()

  await page.locator('.editor-header').getByRole('button', { name: '打印' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.converter-dialog svg, .export-dialog svg').first()).toBeVisible({ timeout: 30_000 })
})
