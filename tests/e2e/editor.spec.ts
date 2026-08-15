import { expect, test } from '@playwright/test'

const source = '{title=Browser Test}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('edits, renders, and maps a score note back to source', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  await editor.fill(source)

  const firstNote = page.locator('.score-paper [id^="m3n-e-"]').first()
  await expect(firstNote).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper .is-cursor-active-measure')).toHaveCount(1)
  await expect(page.locator('.score-paper .measure-cursor-highlight')).toBeVisible()
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

test('renderer settings control width and drive the export dialog', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'paged')
  await expect(page.locator('.score-page-sheet').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('slider', { name: '播放速度' })).toBeVisible()
  await page.getByRole('button', { name: '渲染设置' }).click()
  const settings = page.getByRole('dialog')
  await expect(settings).toBeVisible()
  const pagedSwitch = settings.getByRole('switch', { name: '分页' })
  await expect(pagedSwitch).toBeChecked()
  const width = settings.getByRole('slider', { name: '乐谱宽度' })
  await expect(width).toHaveValue('800')
  await width.fill('600')
  await expect(width).toHaveValue('600')
  await expect(settings.locator('output').first()).toHaveText('600px')
  await pagedSwitch.uncheck()
  await expect(pagedSwitch).not.toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'continuous')
  await expect(page.locator('.score-page-sheet')).toHaveCount(0, { timeout: 30_000 })
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(settings).not.toBeVisible()

  await page.getByRole('button', { name: '打印' }).click()
  const exportDialog = page.getByRole('dialog')
  await expect(exportDialog).toBeVisible()
  await expect(exportDialog.getByText('600px')).toBeVisible()
  await expect(exportDialog.getByRole('spinbutton')).toHaveCount(0)
  await expect(exportDialog.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(exportDialog.getByRole('radio', { name: 'PDF（A4 分页）' })).toBeChecked()
  await expect(exportDialog.locator('.export-preview-page').first()).toBeVisible({ timeout: 30_000 })
})

test('keeps numbered notation unavailable until a dedicated renderer is added', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await expect(page.getByRole('button', { name: '渲染设置' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '渲染设置' }).click()
  const settings = page.getByRole('dialog')
  const numbered = settings.getByRole('switch', { name: '简谱渲染' })
  await expect(numbered).toBeDisabled()
  await expect(numbered).not.toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'staff')
  await expect(page.locator('.score-paper [id^="m3n-e-"]').first()).toBeVisible()
})
