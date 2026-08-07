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

test('exposes playback without a print action', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  const play = page.getByRole('button', { name: '播放' })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()

  await expect(page.getByRole('button', { name: '打印' })).toHaveCount(0)
})

test('reader controls score width and owns the export dialog', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  const width = page.getByRole('spinbutton', { name: '乐谱宽度' })
  await expect(width).toHaveValue('800')
  await width.fill('600')
  await expect(width).toHaveValue('600')

  await page.getByRole('button', { name: '打印' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
  await expect(dialog.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('radio', { name: 'PDF（A4）' }).check()
  await expect(dialog.locator('.export-preview-page').first()).toBeVisible({ timeout: 30_000 })
})
